import type {
  PlatformAdapter,
  ExtractedMessage,
  ContactInfo,
  MessageContentType,
} from '@/types/platform';
import { SELECTORS, querySelector, querySelectorAll } from './selectors';
import { watchConversationKey } from '../conversation-watch';
import { PLATFORM_META } from '../meta';

/**
 * WhatsApp Web adapter.
 *
 * Two structural differences from Instagram shape most of this file:
 *
 * - **No network interception.** WhatsApp is end-to-end encrypted over a
 *   WebSocket; the ciphertext on the wire is useless to us. Everything here is
 *   DOM-only, which makes `data-pre-plain-text` (exact timestamp + sender
 *   name, per message) unusually valuable.
 * - **No URL state.** The whole app lives at `web.whatsapp.com/`, so the open
 *   chat is identified by its header title, never by the path.
 */
export const whatsappAdapter: PlatformAdapter = {
  name: 'whatsapp',

  meta: PLATFORM_META.whatsapp,

  hasInterceptor: false,

  matchUrl(url: string): boolean {
    return /web\.whatsapp\.com/.test(url);
  },

  getMessageContainer(): HTMLElement | null {
    return querySelector(SELECTORS.messageContainer);
  },

  extractMessages(container: HTMLElement): ExtractedMessage[] {
    const rows = querySelectorAll(SELECTORS.messageBubble, container);
    const selfName = getSelfName(rows);

    const parsed: Array<{ row: HTMLElement; data: ParsedRow }> = [];
    for (const row of rows) {
      const data = parseRow(row, selfName);
      if (data) parsed.push({ row, data });
    }

    const timestamps = fillMissingTimestamps(parsed.map((p) => p.data.timestamp));

    return parsed.map(({ row, data }, i) => {
      // Prefer WhatsApp's own message key — it is stable across rescrapes and
      // unique per message, which is strictly better than hashing content.
      // The content+sender hash fallback (for the rare row missing a
      // data-id) folds in a time bucket for the same reason the Instagram
      // adapter does: without it, a repeated "haha" sent later in the
      // conversation hashes to the same ID as the first one and gets
      // silently dropped by storeMessagesDeduped's unconditional ID check.
      const nativeId = querySelector(SELECTORS.messageIdNode, row)?.getAttribute('data-id');
      const timeBucket = Math.round((timestamps[i] ?? Date.now()) / 60000);
      // A batch scrape only ever sees one snapshot of the DOM, so there is no
      // later mutation to re-check an 'unknown' row against — fall back to
      // the old default here, unlike the live observer below.
      const sender = data.sender === 'unknown' ? 'contact' : data.sender;
      return {
        id: nativeId
          ? `wa-${nativeId}`
          : `wa-dom-${simpleHash(data.content + sender + timeBucket)}`,
        sender,
        content: data.content,
        contentType: data.contentType,
        mediaUrl: data.mediaUrl,
        timestamp: timestamps[i],
      };
    });
  },

  getCurrentContactInfo(): ContactInfo | null {
    const titleEl = querySelector(SELECTORS.chatTitle);
    const name = normalizeName(
      titleEl?.getAttribute('title') || titleEl?.textContent || '',
    );
    if (!name) return null;

    // This build of WhatsApp Web exposes no JID or phone number anywhere in
    // the DOM, so the header title is the only identity available. For unsaved
    // contacts that title *is* the phone number; for saved ones it is the
    // address-book name. See getConversationKey for the consequences.
    return {
      name,
      platformUserId: name,
      threadId: name,
    };
  },

  getThreadId(): string | null {
    return this.getCurrentContactInfo()?.threadId ?? null;
  },

  /**
   * WhatsApp Web never changes its URL, so the open chat is identified purely
   * by the header title.
   *
   * Caveat worth knowing: because the title is also the identity, renaming a
   * contact in your address book makes them look like a new person, and two
   * chats sharing a display name would collide. WhatsApp gives us nothing more
   * stable in the DOM to key on.
   */
  getConversationKey(): string | null {
    const titleEl = querySelector(SELECTORS.chatTitle);
    const name = normalizeName(
      titleEl?.getAttribute('title') || titleEl?.textContent || '',
    );
    return name || null;
  },

  observeConversationChange(callback: () => void): () => void {
    return watchConversationKey(() => this.getConversationKey(), callback);
  },

  observeNewMessages(
    callback: (msg: ExtractedMessage) => void,
  ): MutationObserver {
    const container = this.getMessageContainer();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    // Track rows by their native message key rather than by count/position.
    // WhatsApp prunes old rows out of the DOM as new ones arrive at the
    // bottom, so a plain length comparison can stay flat (or drop) on a real
    // new message, and slicing by index then grabs whatever row now happens
    // to sit at that position — often a stale one, not the new one. That
    // combination is what silently swallows the contact's latest message.
    let seenIds = new Set(
      container ? querySelectorAll(SELECTORS.messageBubble, container).map(rowIdentity) : [],
    );

    // Rows whose sender is still 'unknown' (no aria-label, tail, or receipt
    // yet) wait here instead of being reported immediately. Committing to a
    // guess on first sight is what mislabeled just-sent messages as the
    // contact's: those markers land a beat after the row itself does.
    let pendingSince = new Map<string, number>();

    const observer = new MutationObserver(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const current = this.getMessageContainer();
        if (!current) return;

        const rows = querySelectorAll(SELECTORS.messageBubble, current);
        const selfName = getSelfName(rows);
        const nextSeenIds = new Set<string>();
        const nextPendingSince = new Map<string, number>();
        const now = Date.now();

        for (const row of rows) {
          const key = rowIdentity(row);
          if (seenIds.has(key)) {
            nextSeenIds.add(key);
            continue;
          }

          const parsed = parseRow(row, selfName);
          if (!parsed) continue;

          let sender: 'user' | 'contact';
          if (parsed.sender !== 'unknown') {
            sender = parsed.sender;
          } else {
            const firstSeen = pendingSince.get(key) ?? now;
            if (now - firstSeen < UNKNOWN_SENDER_GRACE_MS) {
              // Give WhatsApp more time to decorate the row; re-check next tick.
              nextPendingSince.set(key, firstSeen);
              continue;
            }
            // Grace period elapsed with no signal — fall back to the old default.
            sender = 'contact';
          }

          nextSeenIds.add(key);
          const nativeId = querySelector(SELECTORS.messageIdNode, row)?.getAttribute('data-id');
          const timestamp = parsed.timestamp ?? Date.now();
          callback({
            id: nativeId
              ? `wa-${nativeId}`
              : `wa-dom-${simpleHash(parsed.content + sender + Math.round(timestamp / 60000))}`,
            sender,
            content: parsed.content,
            contentType: parsed.contentType,
            mediaUrl: parsed.mediaUrl,
            timestamp,
          });
        }

        seenIds = nextSeenIds;
        pendingSince = nextPendingSince;
      }, 300);
    });

    if (container) {
      // attributes is needed alongside childList: a pending 'unknown' row only
      // gets re-checked when another mutation fires the debounce again, and
      // the tail/delivery-receipt markers that resolve it may land as an
      // attribute swap (aria-label, data-icon) on an existing node rather
      // than a new child — childList alone would miss that and leave the row
      // stuck pending until the grace period times out on its own.
      observer.observe(container, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-label', 'data-icon', 'data-testid'],
      });
    }

    return observer;
  },

  // WhatsApp's traffic is end-to-end encrypted — there is nothing to parse.
  getInterceptPatterns(): string[] {
    return [];
  },

  parseInterceptedResponse(): ExtractedMessage[] | null {
    return null;
  },

  async scrollToLoadMore(): Promise<boolean> {
    const scrollable = this.getMessageContainer();
    if (!scrollable) return false;

    const prevHeight = scrollable.scrollHeight;
    const prevCount = querySelectorAll(SELECTORS.messageBubble, scrollable).length;
    scrollable.scrollTop = 0;

    await new Promise((r) => setTimeout(r, 2000));

    // WhatsApp trims messages off the bottom as it prepends older ones, so
    // scrollHeight alone can stay flat even when history did load. Treat a
    // change in either dimension as progress.
    const grew = scrollable.scrollHeight > prevHeight;
    const moreRows =
      querySelectorAll(SELECTORS.messageBubble, scrollable).length > prevCount;
    return grew || moreRows;
  },

  async scrollToBottom(): Promise<void> {
    const scrollable = this.getMessageContainer();
    if (!scrollable) return;

    // WhatsApp already scrolls to the bottom itself when a chat opens, so
    // this is a no-op almost every time it's called on chat detection — only
    // poll-and-wait when we're actually not there (e.g. after the history
    // scrape deliberately scrolled up, or the DOM hadn't settled yet).
    if (isNearBottom(scrollable)) return;

    let prevCount = 0;
    for (let attempt = 0; attempt < 6; attempt++) {
      scrollable.scrollTop = scrollable.scrollHeight;
      await new Promise((r) => setTimeout(r, 700));
      if (isNearBottom(scrollable)) {
        const count = querySelectorAll(SELECTORS.messageBubble, scrollable).length;
        if (count > 0 && count === prevCount) break;
        prevCount = count;
      }
    }
  },

  getInputBox(): HTMLElement | null {
    return querySelector(SELECTORS.inputBox);
  },

  /**
   * WhatsApp's composer is a Lexical editor, the same engine Instagram uses,
   * so the execCommand approach transfers exactly: it drives Lexical's own
   * handlers, whereas setting textContent leaves Lexical's state out of sync
   * and the message sends empty.
   */
  insertTextIntoInput(text: string): void {
    const input = this.getInputBox();
    if (!input) return;

    input.focus();

    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(input);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    document.execCommand('delete', false);

    // Do NOT also dispatch an InputEvent — Lexical would double-insert.
    document.execCommand('insertText', false, text);
  },

  /**
   * Prefer the real send button, which only exists once the composer has
   * content. Fall back to Enter for builds that render the button differently.
   */
  triggerSend(): void {
    const input = this.getInputBox();
    if (!input) return;

    input.focus();

    setTimeout(() => {
      const button = querySelector(SELECTORS.sendButton);
      if (button) {
        button.click();
        return;
      }

      input.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
        }),
      );
    }, 150);
  },

  hasUserDraft(): boolean {
    const input = this.getInputBox();
    if (!input) return false;
    return (input.textContent?.trim() || '').length > 0;
  },

  getPopoverAnchorElement(): HTMLElement | null {
    return querySelector(SELECTORS.composerArea) || this.getInputBox();
  },

  healthCheck(): { ok: boolean; issues: string[] } {
    const issues: string[] = [];

    if (!this.getMessageContainer()) {
      issues.push('Cannot find message list ([data-testid="conversation-panel-messages"])');
    }
    if (!this.getInputBox()) {
      issues.push('Cannot find composer (Lexical editor in footer)');
    }
    if (!this.getCurrentContactInfo()) {
      issues.push('Cannot read chat title from conversation header');
    }

    return { ok: issues.length === 0, issues };
  },
};

interface ParsedRow {
  sender: 'user' | 'contact' | 'unknown';
  content: string;
  contentType: MessageContentType;
  mediaUrl?: string;
  timestamp: number | null;
}

/**
 * Assign a timestamp to every message, interpolating the ones WhatsApp does
 * not stamp.
 *
 * Emoji-only messages carry no `data-pre-plain-text`, so they arrive here as
 * null. Dating them from `Date.now()` would fling them to the end of the
 * conversation, and message order is not cosmetic — it is the history the
 * model reads, so a reordered "😂" changes what the reply is responding to.
 *
 * Instead, spread unstamped runs evenly between their nearest stamped
 * neighbours, which preserves the DOM's own ordering.
 */
function fillMissingTimestamps(raw: Array<number | null>): number[] {
  const n = raw.length;
  const out = new Array<number>(n);

  // Nothing to anchor against: fall back to evenly spaced recent times.
  if (raw.every((t) => t === null)) {
    const now = Date.now();
    for (let i = 0; i < n; i++) out[i] = now - (n - 1 - i) * 60000;
    return out;
  }

  for (let i = 0; i < n; i++) {
    if (raw[i] !== null) {
      out[i] = raw[i] as number;
      continue;
    }

    let prev = i - 1;
    while (prev >= 0 && raw[prev] === null) prev--;
    let next = i + 1;
    while (next < n && raw[next] === null) next++;

    const hasPrev = prev >= 0;
    const hasNext = next < n;

    if (hasPrev && hasNext) {
      // Spread the whole gap evenly so consecutive unstamped messages keep
      // their relative order rather than collapsing onto one instant.
      const span = (raw[next] as number) - (raw[prev] as number);
      const steps = next - prev;
      out[i] = (raw[prev] as number) + Math.round((span * (i - prev)) / steps);
    } else if (hasPrev) {
      // Trailing run — nudge forward a second at a time.
      out[i] = (raw[prev] as number) + (i - prev) * 1000;
    } else {
      // Leading run — step backwards from the first known stamp.
      out[i] = (raw[next] as number) - (next - i) * 1000;
    }
  }

  return out;
}

/**
 * Determine the account holder's own display name from the rows currently in
 * the DOM.
 *
 * `data-pre-plain-text` names the sender of every message, but does not say
 * which name is "me". The `aria-label="You:"` span does. Pairing them once per
 * scrape lets us resolve sender for rows whose aria-label is missing.
 */
/**
 * A lightweight, position-independent key used only to track "have I already
 * reported this row in this browsing session" for live diffing.
 *
 * Prefers the native `data-id` — WhatsApp's own message key, unaffected by
 * DOM reflow. Falling back to content+sender (no time bucket) is deliberate:
 * unlike the storage id in `extractMessages`, this key must stay identical
 * for the same physical row across every mutation callback, or an
 * already-delivered row looks new again the moment interpolated timestamps
 * shift under virtualization — which the live path, unlike batch storage,
 * has no downstream dedup window to correct.
 */
function rowIdentity(row: HTMLElement): string {
  const nativeId = querySelector(SELECTORS.messageIdNode, row)?.getAttribute('data-id');
  if (nativeId) return `id:${nativeId}`;
  const { content } = extractRowContent(row);
  return content ? `c:${content}` : `empty-${simpleHash(row.outerHTML.slice(0, 80))}`;
}

function getSelfName(rows: HTMLElement[]): string | null {
  for (const row of rows) {
    if (!row.querySelector('span[aria-label="You:"]')) continue;
    const name = readPrePlainText(row)?.sender;
    if (name) return name;
  }
  return null;
}

function parseRow(row: HTMLElement, selfName: string | null): ParsedRow | null {
  const pre = readPrePlainText(row);
  const { content, contentType, mediaUrl } = extractRowContent(row);
  if (!content) return null;

  return {
    sender: detectSender(row, pre?.sender ?? null, selfName),
    content,
    contentType,
    mediaUrl,
    timestamp: pre?.timestamp ?? null,
  };
}

/**
 * Decide whether a row was sent by the user or the contact.
 *
 * Ordered by reliability as measured against a real conversation: the
 * aria-label covered 39 of 40 rows, while bubble tails covered only 32
 * (WhatsApp draws a tail on the first message of a run, not on every one).
 *
 * Returns 'unknown' rather than guessing when none of these signals are
 * present yet — all of them (the aria-label, the tail, the delivery receipt)
 * are attached by WhatsApp a beat *after* a just-sent row first appears in
 * the DOM, not at insert time. Guessing 'contact' in that gap is how your own
 * outgoing message came back mislabeled as an incoming one from them: it also
 * defeats the live observer's own dedup, since a message already stored via
 * the accept-reply flow gets a second row inserted under the wrong sender.
 * Callers that only ever see one snapshot (the batch scrape) should coerce
 * 'unknown' to 'contact' themselves; the live observer instead waits and
 * re-checks (see observeNewMessages).
 */
function detectSender(
  row: HTMLElement,
  senderName: string | null,
  selfName: string | null,
): 'user' | 'contact' | 'unknown' {
  // 1. Explicit accessibility label on the message meta.
  if (row.querySelector('span[aria-label="You:"]')) return 'user';

  // 2. The sender named in data-pre-plain-text matched against our own name.
  if (senderName && selfName) {
    return senderName === selfName ? 'user' : 'contact';
  }

  // 3. Bubble tail direction.
  if (row.querySelector('[data-testid="tail-out"], [data-icon="tail-out"]')) return 'user';
  if (row.querySelector('[data-testid="tail-in"], [data-icon="tail-in"]')) return 'contact';

  // 4. Outgoing messages are the only ones with a delivery receipt.
  if (row.querySelector('[aria-label*="Delivered"], [aria-label*="Read"], [aria-label*="Sent"]')) {
    return 'user';
  }

  return 'unknown';
}

/**
 * Read the `[time, date] Sender Name: ` prefix WhatsApp attaches to each
 * message for clipboard copies.
 */
function readPrePlainText(
  row: HTMLElement,
): { sender: string; timestamp: number | null } | null {
  const el = querySelector(SELECTORS.prePlainText, row);
  const raw = el?.getAttribute('data-pre-plain-text');
  if (!raw) return null;

  const match = raw.match(/^\[([^\]]+)\]\s*(.*?):\s*$/);
  if (!match) return null;

  return {
    sender: normalizeName(match[2]),
    timestamp: parseWhatsAppTimestamp(match[1]),
  };
}

/**
 * Parse WhatsApp's "4:08 pm, 24/7/2026" stamp.
 *
 * The date order follows the user's locale — day-first in most of the world,
 * month-first in the US — and the string itself carries no hint which it is.
 * Rather than guess, disambiguate from the values: a component above 12 can
 * only be a day. When genuinely ambiguous (both ≤ 12) fall back to the
 * browser's own locale order, which is what rendered the string.
 */
function parseWhatsAppTimestamp(raw: string): number | null {
  const match = raw.match(
    /(\d{1,2}):(\d{2})\s*([ap]\.?m\.?)?[,\s]+(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i,
  );
  if (!match) return null;

  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const meridiem = match[3]?.toLowerCase().replace(/\./g, '');
  const a = parseInt(match[4], 10);
  const b = parseInt(match[5], 10);
  let year = parseInt(match[6], 10);

  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  if (year < 100) year += 2000;

  let day: number;
  let month: number;
  if (a > 12) {
    day = a;
    month = b;
  } else if (b > 12) {
    month = a;
    day = b;
  } else {
    day = localePrefersDayFirst() ? a : b;
    month = localePrefersDayFirst() ? b : a;
  }

  const ts = new Date(year, month - 1, day, hour, minute).getTime();
  return Number.isNaN(ts) ? null : ts;
}

let dayFirstCache: boolean | null = null;

/** Whether the browser's locale renders dates day-before-month. */
function localePrefersDayFirst(): boolean {
  if (dayFirstCache !== null) return dayFirstCache;
  try {
    const parts = new Intl.DateTimeFormat(undefined, {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
    }).formatToParts(new Date(2000, 0, 2));
    const dayIndex = parts.findIndex((p) => p.type === 'day');
    const monthIndex = parts.findIndex((p) => p.type === 'month');
    dayFirstCache = dayIndex !== -1 && monthIndex !== -1 && dayIndex < monthIndex;
  } catch {
    dayFirstCache = true;
  }
  return dayFirstCache;
}

/**
 * Pull displayable content out of a row, describing non-text messages the way
 * the prompt builder expects.
 */
/**
 * Find a row's own message text, skipping any match that falls inside a
 * quoted-reply preview.
 *
 * WhatsApp renders the quoted snippet using the exact same `selectable-text`
 * hooks as the real message, appearing first in DOM order — so a plain
 * `querySelector` (first match) silently returns the OLD quoted text instead
 * of the actual new reply. Scanning every match per selector and skipping
 * ones inside `excludeSubtree` fixes that while preserving the same
 * priority-fallback order the rest of the adapter relies on.
 */
function findMessageText(root: HTMLElement, excludeSubtree: HTMLElement | null = null): string {
  for (const sel of SELECTORS.messageText) {
    for (const el of Array.from(root.querySelectorAll<HTMLElement>(sel))) {
      if (excludeSubtree?.contains(el)) continue;
      const text = el.textContent?.trim();
      if (text) return text;
    }
  }
  return '';
}

function extractRowContent(row: HTMLElement): {
  content: string;
  contentType: MessageContentType;
  mediaUrl?: string;
} {
  const quoted = querySelector(SELECTORS.quotedMessage, row);
  const raw = extractRowContentExcludingQuote(row, quoted);

  // Prefix the quoted message as context — without it the LLM sees the reply
  // in isolation and has no idea what it's actually responding to.
  if (quoted) {
    const quotedText = findMessageText(quoted);
    if (quotedText) {
      return { ...raw, content: `[Replying to: "${quotedText.slice(0, 80)}"] ${raw.content}`.trim() };
    }
  }
  return raw;
}

function extractRowContentExcludingQuote(
  row: HTMLElement,
  quoted: HTMLElement | null,
): { content: string; contentType: MessageContentType; mediaUrl?: string } {
  // 1. Link preview cards — carry both a URL and useful summary text.
  const preview = querySelector(SELECTORS.linkPreview, row);
  if (preview) {
    const href =
      row.querySelector<HTMLAnchorElement>('a[href^="http"]')?.getAttribute('href') || '';
    const title = querySelector(SELECTORS.linkPreviewTitle, row)?.textContent?.trim() || '';
    const body = findMessageText(row, quoted);
    const label = title || querySelector(SELECTORS.linkPreviewDescription, row)?.textContent?.trim();
    // Keep any message the sender typed alongside the link.
    const text = body && body !== href ? `${body} ` : '';
    return {
      content: label
        ? `${text}[Link: ${href || label} — "${label}"]`.trim()
        : `${text}[Link: ${href}]`.trim(),
      contentType: 'link',
    };
  }

  // 2. Plain text.
  const text = findMessageText(row, quoted);
  if (text) return { content: text, contentType: 'text' };

  // 3. Voice notes. Scoped to the row deliberately — the composer footer also
  //    carries a "Voice message" control that would match globally.
  if (
    querySelector(SELECTORS.voiceNote, row) ||
    row.querySelector('[aria-label="Voice message"]')
  ) {
    return { content: '[Sent a voice message]', contentType: 'audio' };
  }

  // 4. Video.
  if (row.querySelector('video')) {
    return { content: '[Sent a video]', contentType: 'video' };
  }

  // 5. Images. WhatsApp decrypts media to blob: URLs, which are scoped to the
  //    page and unreadable from the service worker — so no mediaUrl for
  //    vision. Only http(s) thumbnails are worth passing along.
  const img = row.querySelector<HTMLImageElement>('img[src]');
  if (img) {
    const src = img.getAttribute('src') || '';
    if (src.includes('/emoji/')) {
      return { content: img.getAttribute('alt') || '😀', contentType: 'text' };
    }
    return {
      content: '[Sent an image]',
      contentType: 'image',
      mediaUrl: src.startsWith('http') ? src : undefined,
    };
  }

  // 6. Documents and other attachments.
  if (row.querySelector('[data-icon*="document"], [data-testid*="document"]')) {
    return { content: '[Sent a document]', contentType: 'text' };
  }

  return { content: '', contentType: 'text' };
}

/**
 * Strip the Unicode directional marks WhatsApp wraps around phone numbers
 * (e.g. "‪9738958131‬") and collapse whitespace.
 */
function normalizeName(raw: string): string {
  return raw.replace(/[‎‏‪-‮⁦-⁩]/g, '').trim();
}

/**
 * Deterministic hash for stable IDs when WhatsApp's own message key is absent.
 */
/** Within this many px of the true bottom counts as "already there." */
const BOTTOM_THRESHOLD_PX = 40;

/**
 * How long observeNewMessages waits for a row with no sender signal yet
 * (fresh outgoing rows before WhatsApp attaches the tail/receipt) before
 * giving up and falling back to 'contact'.
 */
const UNKNOWN_SENDER_GRACE_MS = 2000;

function isNearBottom(scrollable: HTMLElement): boolean {
  return scrollable.scrollHeight - scrollable.scrollTop - scrollable.clientHeight < BOTTOM_THRESHOLD_PX;
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

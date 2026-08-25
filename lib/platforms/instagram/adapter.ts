import type {
  PlatformAdapter,
  ExtractedMessage,
  ContactInfo,
} from '@/types/platform';
import { v4 as uuid } from 'uuid';
import { SELECTORS, querySelector, querySelectorAll } from './selectors';
import { watchConversationKey } from '../conversation-watch';
import { PLATFORM_META } from '../meta';

/**
 * Minified class names used by Instagram for message alignment.
 * These are fragile and will change — used as a fast-path only,
 * with computed-style fallback for reliability.
 */
const SENT_BUBBLE_CLASS = 'x12lizq0';
const SENT_PARENT_CLASS = 'x13a6bvl';

export const instagramAdapter: PlatformAdapter = {
  name: 'instagram',

  meta: PLATFORM_META.instagram,

  hasInterceptor: true,

  matchUrl(url: string): boolean {
    return /instagram\.com\/direct/.test(url);
  },

  getMessageContainer(): HTMLElement | null {
    return querySelector(SELECTORS.messageContainer);
  },

  extractMessages(container: HTMLElement): ExtractedMessage[] {
    const messages: ExtractedMessage[] = [];
    const bubbles = topLevelBubbles(querySelectorAll(SELECTORS.messageBubble, container));
    const baseTime = findAnchorTimestamp(bubbles) || Date.now();

    for (let i = 0; i < bubbles.length; i++) {
      const parsed = parseBubble(bubbles[i], i, bubbles.length, baseTime);
      if (parsed) messages.push(parsed);
    }

    return messages;
  },

  getCurrentContactInfo(): ContactInfo | null {
    // Strategy 1: Profile link with aria-label
    const profileLink = querySelector(SELECTORS.profileLink);
    if (profileLink) {
      const ariaLabel = profileLink.getAttribute('aria-label') || '';
      const href = profileLink.getAttribute('href') || '';

      // aria-label is "Open the profile page of USERNAME"
      const username = ariaLabel.replace('Open the profile page of ', '').trim();

      // href is "https://www.instagram.com/USERNAME/" or "/USERNAME/"
      const platformUserId =
        href
          .replace(/^https?:\/\/www\.instagram\.com\//, '')
          .replace(/^\//, '')
          .replace(/\/$/, '') || username;

      // Display name from span[title] in header
      const nameEl = querySelector(SELECTORS.displayName);
      const name = nameEl?.getAttribute('title') || nameEl?.textContent?.trim() || username;

      if (platformUserId) {
        return { name, platformUserId };
      }
    }

    // Strategy 2: Header pagelet link
    const headerPagelet = querySelector(SELECTORS.headerPagelet);
    if (headerPagelet) {
      const link = headerPagelet.querySelector<HTMLAnchorElement>('a[href*="instagram.com/"]');
      if (link) {
        const href = link.getAttribute('href') || '';
        const platformUserId = href
          .replace(/^https?:\/\/www\.instagram\.com\//, '')
          .replace(/^\//, '')
          .replace(/\/$/, '');
        const nameEl = headerPagelet.querySelector<HTMLElement>('span[title]');
        const name = nameEl?.getAttribute('title') || nameEl?.textContent?.trim() || platformUserId;
        if (platformUserId) {
          return { name, platformUserId };
        }
      }
    }

    return null;
  },

  /**
   * Extract the Instagram thread ID from the current URL.
   * URL format: instagram.com/direct/t/THREAD_ID/
   */
  getThreadId(): string | null {
    const match = window.location.pathname.match(/\/direct\/t\/(\d+)/);
    return match?.[1] || null;
  },

  /**
   * Prefer the thread ID from the URL. Instagram does not always update the
   * path when switching threads from the sidebar, so fall back to the profile
   * link in the conversation header, which always tracks the open thread.
   */
  getConversationKey(): string | null {
    const threadId = this.getThreadId?.();
    if (threadId) return `t:${threadId}`;

    const profileLink = querySelector(SELECTORS.profileLink);
    const href = profileLink?.getAttribute('href');
    return href ? `u:${href}` : null;
  },

  observeConversationChange(callback: () => void): () => void {
    return watchConversationKey(() => this.getConversationKey(), callback);
  },

  observeNewMessages(
    callback: (msg: ExtractedMessage) => void,
  ): MutationObserver {
    const container = this.getMessageContainer();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    // Track bubbles by their stable ID rather than by count/position.
    // Instagram virtualizes its message list — old bubbles get pruned from
    // the DOM at the same time new ones are appended at the bottom, so a
    // plain length comparison can stay flat (or even drop) on a real new
    // message, and slicing by index then grabs whatever bubble now happens
    // to sit at that position, which is often a stale one, not the new one.
    // That combination is what silently swallows the contact's latest
    // message and occasionally replays an old one as if it were current.
    let seenIds = new Set(
      container
        ? topLevelBubbles(querySelectorAll(SELECTORS.messageBubble, container)).map(bubbleIdentity)
        : [],
    );

    const observer = new MutationObserver(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const currentContainer = this.getMessageContainer();
        if (!currentContainer) return;

        const bubbles = topLevelBubbles(querySelectorAll(SELECTORS.messageBubble, currentContainer));
        const baseTime = findAnchorTimestamp(bubbles) || Date.now();
        const nextSeenIds = new Set<string>();

        for (let i = 0; i < bubbles.length; i++) {
          const key = bubbleIdentity(bubbles[i]);
          nextSeenIds.add(key);
          if (seenIds.has(key)) continue;

          const parsed = parseBubble(bubbles[i], i, bubbles.length, baseTime);
          if (parsed) callback(parsed);
        }

        seenIds = nextSeenIds;
      }, 300);
    });

    if (container) {
      observer.observe(container, {
        childList: true,
        subtree: true,
      });
    }

    return observer;
  },

  getInterceptPatterns(): string[] {
    return ['/api/v1/direct_v2/', '/api/graphql', '/graphql'];
  },

  parseInterceptedResponse(
    url: string,
    body: unknown,
  ): ExtractedMessage[] | null {
    try {
      if (url.includes('/api/v1/direct_v2/threads/')) {
        return parseDirectThreadResponse(body);
      }
      // Lightspeed protocol responses via graphql
      if (url.includes('/graphql') || url.includes('/api/graphql')) {
        return parseLightspeedResponse(body);
      }
      return null;
    } catch {
      return null;
    }
  },

  async scrollToLoadMore(): Promise<boolean> {
    const container = this.getMessageContainer();
    if (!container) return false;

    // Find the actual scrollable element inside the pagelet
    const scrollable = findScrollableChild(container) || container;
    const prevHeight = scrollable.scrollHeight;
    scrollable.scrollTop = 0;

    await new Promise((r) => setTimeout(r, 2000));

    return scrollable.scrollHeight > prevHeight;
  },

  async scrollToBottom(): Promise<void> {
    const container = this.getMessageContainer();
    if (!container) return;
    const scrollable = findScrollableChild(container) || container;

    // Skip the wait entirely when we're already at the bottom — the common
    // case on a fresh chat open, where Instagram has already rendered the
    // latest messages and there's nothing to catch up on.
    if (isNearBottom(scrollable)) return;

    // Instagram virtualizes the message list — after scrolling up through history,
    // the latest messages are unloaded and need an API round-trip to re-render.
    // Poll until the bubble count stabilizes rather than using a fixed wait.
    let prevCount = 0;
    for (let attempt = 0; attempt < 6; attempt++) {
      scrollable.scrollTop = scrollable.scrollHeight;
      await new Promise((r) => setTimeout(r, 700));
      const count = querySelectorAll(SELECTORS.messageBubble, container).length;
      if (count > 0 && count === prevCount) break;
      prevCount = count;
    }
  },

  getInputBox(): HTMLElement | null {
    return querySelector(SELECTORS.inputBox);
  },

  insertTextIntoInput(text: string): void {
    const input = this.getInputBox();
    if (!input) return;

    input.focus();

    // Clear existing content: select all within the input, then delete
    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(input);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    document.execCommand('delete', false);

    // Insert via execCommand — this triggers Lexical's internal handlers.
    // Do NOT dispatch an additional InputEvent, or Lexical will double-insert.
    document.execCommand('insertText', false, text);
  },

  /**
   * Simulate pressing Enter to send the message.
   * Instagram's send button is unreliable to find via selectors
   * (the composer has emoji/voice/photo buttons that match first),
   * so we use Enter key which is the native way to send.
   */
  triggerSend(): void {
    const input = this.getInputBox();
    if (!input) return;

    input.focus();

    // Small delay to let Lexical sync its state after text insertion
    setTimeout(() => {
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

  /**
   * Check if the input box already has user-typed content.
   */
  hasUserDraft(): boolean {
    const input = this.getInputBox();
    if (!input) return false;
    const text = input.textContent?.trim() || '';
    return text.length > 0;
  },

  getPopoverAnchorElement(): HTMLElement | null {
    // Prefer the composer area for anchoring the confirmation bar
    return (
      querySelector(SELECTORS.composerArea) ||
      this.getInputBox()
    );
  },

  healthCheck(): { ok: boolean; issues: string[] } {
    const issues: string[] = [];

    if (!this.getMessageContainer()) {
      issues.push('Cannot find message container ([data-pagelet="IGDMessagesList"])');
    }
    if (!this.getInputBox()) {
      issues.push('Cannot find input box (Lexical editor)');
    }
    if (!this.getCurrentContactInfo()) {
      issues.push('Cannot detect current contact');
    }

    return { ok: issues.length === 0, issues };
  },
};

/**
 * Filter out nested `role="presentation"` elements that aren't real message
 * bubbles — a "quoted message" reply card renders its own role="presentation"
 * wrapper inside the actual bubble, so a bare selector match picks it up as a
 * second, spurious bubble. That inner wrapper can carry SENT_BUBBLE_CLASS
 * regardless of who sent the real (outer) bubble, since Meta's atomic classes
 * are shared for incidental styling, not because it reflects the real sender.
 * Filtering it here means detectSender never has to see it.
 */
function topLevelBubbles(bubbles: HTMLElement[]): HTMLElement[] {
  return bubbles.filter(
    (b) => !bubbles.some((other) => other !== b && other.contains(b)),
  );
}

/**
 * How many ancestors up from a bubble the alignment fallback is allowed to
 * walk. A live capture showed the real flex-end/row-reverse signal for the
 * user's own bubbles sitting at depth 3-4, but walking further eventually
 * reaches a shared layout wrapper — unrelated to any individual message —
 * that happens to compute `justifyContent: flex-end` for EVERY bubble, sent
 * or received alike, at depth 6 or beyond depending on message type. An
 * unbounded walk hits that wrapper on the contact's messages too and
 * misreports everyone as 'user'. Capping it here keeps the real signal while
 * staying short of the false one.
 */
const ALIGNMENT_WALK_MAX_DEPTH = 5;

/**
 * Detect whether a message bubble was sent by the user or the contact.
 * Primary signal is the minified class check: SENT_BUBBLE_CLASS/SENT_PARENT_CLASS
 * consistently mark the sent side across observed DOM captures (bubble itself,
 * or an ancestor within a few levels), now that topLevelBubbles() keeps
 * quoted-reply-card wrappers from posing as bubbles in their own right.
 * Computed-style alignment is the fallback for when neither class is found,
 * bounded to ALIGNMENT_WALK_MAX_DEPTH so it doesn't walk far enough to hit a
 * shared layout wrapper that reports flex-end for every bubble regardless of
 * sender.
 */
function detectSender(bubble: HTMLElement): 'user' | 'contact' {
  if (bubble.classList.contains(SENT_BUBBLE_CLASS)) {
    return 'user';
  }
  let el: HTMLElement | null = bubble;
  for (let i = 0; i < 6 && el; i++) {
    if (el.classList.contains(SENT_PARENT_CLASS)) {
      return 'user';
    }
    el = el.parentElement;
  }

  el = bubble.parentElement;
  for (let depth = 0; depth < ALIGNMENT_WALK_MAX_DEPTH && el && el !== document.body; depth++) {
    const style = window.getComputedStyle(el);
    if (
      style.justifyContent === 'flex-end' ||
      style.alignSelf === 'flex-end' ||
      style.marginLeft === 'auto' ||
      style.flexDirection === 'row-reverse'
    ) {
      return 'user';
    }
    el = el.parentElement;
  }

  return 'contact';
}

type BubbleContent = {
  text: string;
  contentType: 'text' | 'image' | 'video' | 'link';
  mediaUrl?: string;
};

/**
 * Pull displayable content out of a single message bubble: plain text,
 * shared reel/post, other link, image, video, or voice note.
 *
 * Shared by `extractMessages` (batch scrape) and `observeNewMessages` (live
 * diffing) so both paths recognize the same message types. Previously only
 * the batch path handled anything beyond plain text, so a contact's newest
 * message arriving live as an image, video, voice note, or shared reel was
 * silently dropped — `observeNewMessages` would see empty `textContent` and
 * skip it, even though the bubble was very much there.
 */
function extractBubbleContent(bubble: HTMLElement): BubbleContent | null {
  const textEl = querySelector(SELECTORS.messageText, bubble);
  const plainText = textEl?.textContent?.trim() || '';
  if (plainText) return { text: plainText, contentType: 'text' };

  // 1. Shared post or reel link
  const shareLink = bubble.querySelector<HTMLAnchorElement>('a[href*="/reel/"], a[href*="/p/"]');
  if (shareLink) {
    const href = shareLink.getAttribute('href') || '';
    const fullUrl = href.startsWith('http') ? href : `https://www.instagram.com${href}`;
    const caption = extractBubbleCardText(bubble);
    return {
      text: caption
        ? `[Shared Reel/Post: ${fullUrl} — "${caption}"]`
        : `[Shared Reel/Post: ${fullUrl}]`,
      contentType: 'link',
    };
  }

  // 2. Other links
  const link = bubble.querySelector<HTMLAnchorElement>('a[href]');
  if (link) {
    const href = link.getAttribute('href') || '';
    if (!href.includes('instagram.com/direct') && !href.startsWith('/direct')) {
      const preview = extractBubbleCardText(bubble);
      return {
        text: preview ? `[Link: ${href} — "${preview}"]` : `[Link: ${href}]`,
        contentType: 'link',
      };
    }
  }

  // 3. Images
  const img = bubble.querySelector<HTMLImageElement>('img');
  if (img) {
    const src = img.getAttribute('src') || '';
    const isEmoji = src.includes('/emoji/') || img.classList.contains('emoji');
    if (isEmoji) return { text: img.getAttribute('alt') || '😀', contentType: 'text' };

    // Capture CDN URL for vision AI (scontent CDN, not static assets)
    const mediaUrl = src.startsWith('http') && src.includes('cdninstagram') ? src : undefined;
    return { text: '[Sent an image]', contentType: 'image', mediaUrl };
  }

  // 4. Videos
  if (bubble.querySelector('video')) {
    return { text: '[Sent a video]', contentType: 'video' };
  }

  // 5. Voice messages
  const isVoice =
    bubble.querySelector('audio') ||
    bubble.querySelector('[aria-label*="audio"]') ||
    bubble.querySelector('[aria-label*="voice"]');
  if (isVoice) return { text: '[Sent a voice message]', contentType: 'video' };

  return null;
}

/**
 * Scan a bubble list for the newest one carrying a real (non-interpolated)
 * timestamp, to anchor position-based interpolation for the rest.
 */
function findAnchorTimestamp(bubbles: HTMLElement[]): number | null {
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const ts = extractTimestamp(bubbles[i]);
    if (ts) return ts;
  }
  return null;
}

/**
 * Parse one bubble into a full ExtractedMessage, or null if it carries no
 * recognizable content (e.g. a date divider or system row).
 */
function parseBubble(
  bubble: HTMLElement,
  index: number,
  totalBubbles: number,
  baseTime: number,
): ExtractedMessage | null {
  const content = extractBubbleContent(bubble);
  if (!content) return null;

  const sender = detectSender(bubble);
  const realTimestamp = extractTimestamp(bubble);

  // Use the real timestamp if available, otherwise interpolate from position.
  // Messages are ordered top=oldest, bottom=newest.
  const timestamp = realTimestamp || baseTime - (totalBubbles - 1 - index) * 60000;

  // Deterministic ID based on content + sender + a coarse time bucket (not a
  // random UUID) — this allows dedup to work across multiple rescrapes of
  // the same bubble. The time bucket matters: content+sender alone collides
  // whenever the same short reply ("haha", "lol", "ok") is sent more than
  // once, which would silently drop the second real message (see
  // storeMessagesDeduped, which trusts an ID match unconditionally).
  const timeBucket = Math.round(timestamp / 60000);
  const id = `dom-${simpleHash(content.text + sender + timeBucket)}`;

  return {
    id,
    sender,
    content: content.text,
    contentType: content.contentType,
    mediaUrl: content.mediaUrl,
    timestamp,
  };
}

/**
 * A lightweight, position-independent key used only to track "have I already
 * reported this bubble in this browsing session" for live diffing — deliberately
 * NOT the same as parseBubble's storage id, which folds in a time bucket that
 * can drift as bubbles shift position under virtualization. Drift there is
 * fine (storeMessagesDeduped tolerates it via its own time window); drift
 * here would make an already-delivered bubble look new again on every
 * mutation, which the live path can't self-correct the way batch storage can.
 */
function bubbleIdentity(bubble: HTMLElement): string {
  const content = extractBubbleContent(bubble);
  if (!content) return `empty-${simpleHash(bubble.outerHTML.slice(0, 80))}`;
  return `${detectSender(bubble)}:${simpleHash(content.text)}`;
}

/**
 * Extract a timestamp from a message bubble or its siblings.
 * Instagram renders timestamps as: <abbr aria-label="3 minutes ago"><span>3m</span></abbr>
 */
function extractTimestamp(bubble: HTMLElement): number | null {
  // Look within the bubble and its container (timestamps may be siblings)
  const container = bubble.closest('div[role="none"]') || bubble.parentElement;
  if (!container) return null;

  const abbr = container.querySelector<HTMLElement>('abbr[aria-label]');
  if (!abbr) return null;

  const label = abbr.getAttribute('aria-label') || '';
  return parseRelativeTimestamp(label);
}

/**
 * Parse a relative timestamp string like "3 minutes ago" or "19 hours ago"
 * into an absolute epoch millisecond value.
 */
function parseRelativeTimestamp(label: string): number | null {
  const match = label.match(/^(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago$/i);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = {
    second: 1000,
    minute: 60 * 1000,
    hour: 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
    year: 365 * 24 * 60 * 60 * 1000,
  };

  const ms = multipliers[unit];
  return ms ? Date.now() - value * ms : null;
}

/**
 * Find the scrollable child element within a container.
 */
function findScrollableChild(container: HTMLElement): HTMLElement | null {
  const children = container.querySelectorAll<HTMLElement>('div');
  for (const child of children) {
    const style = window.getComputedStyle(child);
    if (
      (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
      child.scrollHeight > child.clientHeight
    ) {
      return child;
    }
  }
  return null;
}

/** Within this many px of the true bottom counts as "already there." */
const BOTTOM_THRESHOLD_PX = 40;

function isNearBottom(scrollable: HTMLElement): boolean {
  return scrollable.scrollHeight - scrollable.scrollTop - scrollable.clientHeight < BOTTOM_THRESHOLD_PX;
}

/**
 * The logged-in user's numeric Instagram ID, read from the `ds_user_id`
 * cookie Instagram sets client-side for its own JS to use. Memoized because
 * it never changes within a session and every intercepted response otherwise
 * has to re-derive it.
 *
 * This exists because Lightspeed messages (see parseLightspeedResponse)
 * carry a senderId but no reliable per-response viewer_id the way the older
 * direct_v2 thread payloads do — and Lightspeed echoes back the user's own
 * sent messages for multi-device sync, so without resolving senderId against
 * *something*, every message you send gets misfiled as the contact's.
 */
let cachedViewerId: string | null = null;

export function getViewerId(): string | null {
  if (cachedViewerId) return cachedViewerId;
  const match = document.cookie.match(/(?:^|;\s*)ds_user_id=(\d+)/);
  if (match) cachedViewerId = match[1];
  return cachedViewerId;
}

/**
 * Parse Instagram's direct thread API response into ExtractedMessages.
 */
function parseDirectThreadResponse(body: unknown): ExtractedMessage[] | null {
  const messages: ExtractedMessage[] = [];
  const data = body as Record<string, unknown>;

  const thread = data.thread as Record<string, unknown> | undefined;
  const items = (thread?.items || data.items) as
    | Array<Record<string, unknown>>
    | undefined;

  if (!Array.isArray(items)) return null;

  const viewerId = ((thread?.viewer_id || data.viewer_id) as string | undefined) ?? getViewerId() ?? undefined;

  for (const item of items) {
    const text = (item.text as string) || '';
    const userId = item.user_id as string | number;
    const timestamp = item.timestamp as number;
    const itemId = item.item_id as string;
    const itemType = item.item_type as string;

    let content = text;
    let contentType: 'text' | 'image' | 'video' | 'link' = 'text';
    let mediaUrl: string | undefined;

    if (!content) {
      if (itemType === 'text') continue;
      const media = extractMediaContent(item);
      content = media.content;
      contentType = media.contentType;
      mediaUrl = media.mediaUrl;
    }

    const sender: 'user' | 'contact' =
      viewerId && String(userId) === String(viewerId) ? 'user' : 'contact';

    messages.push({
      id: itemId || uuid(),
      sender,
      content,
      contentType,
      mediaUrl,
      timestamp: timestamp ? timestamp * 1000 : Date.now(),
      rawData: item,
    });
  }

  return messages.length > 0 ? messages : null;
}

/**
 * Parse Lightspeed (LS) protocol responses that arrive via /graphql.
 * These contain upsertMessage steps with message data.
 * The format is undocumented and changes -- this parser is fault-tolerant.
 */
function parseLightspeedResponse(body: unknown): ExtractedMessage[] | null {
  const messages: ExtractedMessage[] = [];
  const viewerId = getViewerId();

  try {
    const str = typeof body === 'string' ? body : JSON.stringify(body);
    if (!str.includes('upsertMessage')) return null;

    // Find all upsertMessage steps in the serialized data.
    // The LS wire format encodes steps as arrays:
    // [5, "upsertMessage", "TEXT", [9], [19, "80"], [19, "THREAD_ID"], ...]
    // We extract text, timestamp, and sender ID from positional fields.
    const stepRegex =
      /upsertMessage["\s,]+["']([^"']*?)["'][^[]*?\[19,\s*["']80["']\][^[]*?\[19,\s*["'](\d+)["']\][^[]*?\[19,\s*["']0["']\][^[]*?\[19,\s*["'](\d+)["']\]/g;

    let match;
    while ((match = stepRegex.exec(str)) !== null) {
      const text = match[1];
      const threadId = match[2];
      const timestamp = parseInt(match[3], 10);

      if (!text && !threadId) continue;

      // Try to find the sender ID further in the step
      // Format: "MID", "ITEM_ID", [19, "SENDER_ID"]
      const afterMatch = str.slice(match.index, match.index + 800);
      const senderMatch = afterMatch.match(
        /mid\.[^"]*["'][^"]*["']\d+["'][^[]*?\[19,\s*["'](\d+)["']\]/,
      );
      const senderId = senderMatch?.[1];

      messages.push({
        id: uuid(),
        sender: viewerId && senderId && senderId === viewerId ? 'user' : 'contact',
        content: decodeUnicodeEscapes(text || '[media]'),
        contentType: text ? 'text' : 'image',
        timestamp: timestamp || Date.now(),
        rawData: {
          threadId,
          senderId,
          source: 'lightspeed',
        },
      });
    }
  } catch {
    return null;
  }

  return messages.length > 0 ? messages : null;
}

/**
 * Decode Unicode escape sequences from LS payloads
 * (e.g., "\\ud83d\\ude04" -> actual emoji)
 */
function decodeUnicodeEscapes(str: string): string {
  return str.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
}

/**
 * Simple deterministic hash for creating stable message IDs.
 * Same content + sender always produces the same hash.
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Extract text from a link/reel card bubble beyond the URL itself.
 * Walks text nodes, skipping raw URLs and single-char strings, to find
 * caption or preview title text rendered in the card.
 */
function extractBubbleCardText(bubble: HTMLElement): string {
  const walker = document.createTreeWalker(bubble, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const t = (node.textContent || '').trim();
    if (!t || t.length < 4) continue;
    if (/^https?:\/\//.test(t)) continue;
    if (/^www\./.test(t)) continue;
    parts.push(t);
  }
  return parts.join(' ').slice(0, 100).trim();
}

/**
 * Truncate a caption to a readable snippet.
 */
function captionSnippet(text: string | undefined | null): string {
  if (!text) return '';
  const clean = text.replace(/\n+/g, ' ').trim();
  return clean.length > 100 ? `${clean.slice(0, 100)}…` : clean;
}

/**
 * Extract details from Instagram API media, link, and share payloads.
 */
function extractMediaContent(item: any): { content: string; contentType: 'text' | 'image' | 'video' | 'link'; mediaUrl?: string } {
  const itemType = item.item_type as string;

  // 1. Link items
  if (itemType === 'link' && item.link) {
    const uri = item.link.web_uri || item.link.text || '';
    if (uri) {
      const title = captionSnippet(
        item.link.link_context?.link_title ||
        item.link.link_context?.link_summary ||
        item.link.title,
      );
      return {
        content: title ? `[Link: ${uri} — "${title}"]` : `[Link: ${uri}]`,
        contentType: 'link',
      };
    }
  }

  // 2. Reels (felix_share or clip)
  if (itemType === 'felix_share' || itemType === 'clip') {
    const videoShare = item.felix_share?.video_share || item.clip?.video_share || item.clip;
    if (videoShare) {
      const code = videoShare.code || videoShare.id || '';
      const url = code ? `https://www.instagram.com/reel/${code}/` : '';
      const caption = captionSnippet(
        videoShare.caption?.text || videoShare.caption || videoShare.title,
      );
      return {
        content: caption
          ? `[Shared Reel: ${url || 'video'} — "${caption}"]`
          : `[Shared Reel: ${url || 'video'}]`,
        contentType: 'link',
      };
    }
  }

  // 3. Media share (posts)
  if (itemType === 'media_share' && item.media_share) {
    const code = item.media_share.code || '';
    const url = code ? `https://www.instagram.com/p/${code}/` : '';
    const caption = captionSnippet(item.media_share.caption?.text || item.media_share.title);
    return {
      content: caption
        ? `[Shared Post: ${url || 'media'} — "${caption}"]`
        : `[Shared Post: ${url || 'media'}]`,
      contentType: 'link',
    };
  }

  // 4. Voice media
  if (itemType === 'voice_media') {
    return { content: '[Sent a voice message]', contentType: 'video' };
  }

  // 5. Normal media (images/videos)
  if (itemType === 'media' && item.media) {
    const isVideo = item.media.media_type === 2;
    if (!isVideo) {
      // Pick the largest candidate ≤1080px wide for vision (avoids huge payloads)
      const candidates: Array<{ url: string; width: number }> =
        item.media.image_versions2?.candidates || [];
      const sorted = [...candidates]
        .filter((c) => c.width <= 1080)
        .sort((a, b) => b.width - a.width);
      const imageUrl = sorted[0]?.url || candidates[0]?.url;
      return {
        content: '[Sent an image]',
        contentType: 'image',
        mediaUrl: imageUrl || undefined,
      };
    }
    return { content: '[Sent a video]', contentType: 'video' };
  }

  // Fallback to media type label
  return { content: `[${itemType || 'media'}]`, contentType: 'image' };
}

import type {
  PlatformAdapter,
  ExtractedMessage,
  ContactInfo,
} from '@/types/platform';
import { v4 as uuid } from 'uuid';
import { SELECTORS, querySelector, querySelectorAll } from './selectors';

/**
 * Minified class names used by Instagram for message alignment.
 * These are fragile and will change — used as a fast-path only,
 * with computed-style fallback for reliability.
 */
const SENT_BUBBLE_CLASS = 'x12lizq0';
const SENT_PARENT_CLASS = 'x13a6bvl';

export const instagramAdapter: PlatformAdapter = {
  name: 'instagram',

  matchUrl(url: string): boolean {
    return /instagram\.com\/direct/.test(url);
  },

  getMessageContainer(): HTMLElement | null {
    return querySelector(SELECTORS.messageContainer);
  },

  extractMessages(container: HTMLElement): ExtractedMessage[] {
    const messages: ExtractedMessage[] = [];
    const bubbles = querySelectorAll(SELECTORS.messageBubble, container);

    // Use a base timestamp and decrement for ordering.
    // Instagram shows messages newest-at-bottom, so we assign timestamps
    // in order: oldest bubble gets the earliest timestamp.
    const now = Date.now();
    let lastKnownTimestamp: number | null = null;

    // First pass: find any real timestamps to anchor ordering
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const ts = extractTimestamp(bubbles[i]);
      if (ts) { lastKnownTimestamp = ts; break; }
    }

    const baseTime = lastKnownTimestamp || now;

    for (let i = 0; i < bubbles.length; i++) {
      const bubble = bubbles[i];
      const textEl = querySelector(SELECTORS.messageText, bubble);
      let text = textEl?.textContent?.trim() || '';
      let contentType: 'text' | 'image' | 'video' | 'link' = 'text';
      let mediaUrl: string | undefined;

      if (!text) {
        // 1. Check for shared post or reel link
        const shareLink = bubble.querySelector<HTMLAnchorElement>('a[href*="/reel/"], a[href*="/p/"]');
        if (shareLink) {
          const href = shareLink.getAttribute('href') || '';
          const fullUrl = href.startsWith('http') ? href : `https://www.instagram.com${href}`;
          const caption = extractBubbleCardText(bubble);
          text = caption
            ? `[Shared Reel/Post: ${fullUrl} — "${caption}"]`
            : `[Shared Reel/Post: ${fullUrl}]`;
          contentType = 'link';
        } else {
          // 2. Check for other links
          const link = bubble.querySelector<HTMLAnchorElement>('a[href]');
          if (link) {
            const href = link.getAttribute('href') || '';
            if (!href.includes('instagram.com/direct') && !href.startsWith('/direct')) {
              const preview = extractBubbleCardText(bubble);
              text = preview ? `[Link: ${href} — "${preview}"]` : `[Link: ${href}]`;
              contentType = 'link';
            }
          }
        }

        // 3. Check for images
        if (!text) {
          const img = bubble.querySelector<HTMLImageElement>('img');
          if (img) {
            const src = img.getAttribute('src') || '';
            const isEmoji = src.includes('/emoji/') || img.classList.contains('emoji');
            if (isEmoji) {
              text = img.getAttribute('alt') || '😀';
            } else {
              text = '[Sent an image]';
              contentType = 'image';
              // Capture CDN URL for vision AI (scontent CDN, not static assets)
              if (src.startsWith('http') && src.includes('cdninstagram')) {
                mediaUrl = src;
              }
            }
          } else {
            // 4. Check for videos
            const video = bubble.querySelector<HTMLVideoElement>('video');
            if (video) {
              text = '[Sent a video]';
              contentType = 'video';
            }
          }
        }

        // 5. Check for voice messages
        if (!text) {
          const isVoice = bubble.querySelector('audio') || bubble.querySelector('[aria-label*="audio"]') || bubble.querySelector('[aria-label*="voice"]');
          if (isVoice) {
            text = '[Sent a voice message]';
            contentType = 'video';
          }
        }
      }

      if (!text) continue;

      const sender = detectSender(bubble);
      const realTimestamp = extractTimestamp(bubble);

      // Use real timestamp if available, otherwise interpolate from position
      // Messages are ordered top=oldest, bottom=newest
      const timestamp = realTimestamp ||
        (baseTime - (bubbles.length - 1 - i) * 60000); // ~1 min apart

      // Deterministic ID based on content + sender (not random UUID)
      // This allows dedup to work across multiple scrapes
      const contentHash = simpleHash(text + sender);
      const id = `dom-${contentHash}`;

      messages.push({
        id,
        sender,
        content: text,
        contentType,
        mediaUrl,
        timestamp,
      });
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

  observeNewMessages(
    callback: (msg: ExtractedMessage) => void,
  ): MutationObserver {
    const container = this.getMessageContainer();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let lastBubbleCount = container
      ? querySelectorAll(SELECTORS.messageBubble, container).length
      : 0;

    const observer = new MutationObserver(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const currentContainer = this.getMessageContainer();
        if (!currentContainer) return;

        const currentBubbles = querySelectorAll(
          SELECTORS.messageBubble,
          currentContainer,
        );
        if (currentBubbles.length <= lastBubbleCount) return;

        // Process only new bubbles (at the end)
        const newBubbles = currentBubbles.slice(lastBubbleCount);
        lastBubbleCount = currentBubbles.length;

        for (const bubble of newBubbles) {
          const textEl = querySelector(SELECTORS.messageText, bubble);
          const text = textEl?.textContent?.trim();
          if (!text) continue;

          const sender = detectSender(bubble);
          const timestamp = extractTimestamp(bubble) || Date.now();

          callback({
            id: uuid(),
            sender,
            content: text,
            contentType: 'text',
            timestamp,
          });
        }
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
 * Detect whether a message bubble was sent by the user or the contact.
 * Uses a fast class-check path with computed-style fallback.
 */
function detectSender(bubble: HTMLElement): 'user' | 'contact' {
  // Fast path: check minified class on the bubble itself
  if (bubble.classList.contains(SENT_BUBBLE_CLASS)) {
    return 'user';
  }

  // Fast path: check for flex-end alignment class on a parent
  let el: HTMLElement | null = bubble;
  for (let i = 0; i < 6 && el; i++) {
    if (el.classList.contains(SENT_PARENT_CLASS)) {
      return 'user';
    }
    el = el.parentElement;
  }

  // Reliable fallback: check computed styles
  el = bubble.parentElement;
  while (el) {
    const style = window.getComputedStyle(el);
    if (
      style.justifyContent === 'flex-end' ||
      style.alignSelf === 'flex-end' ||
      style.marginLeft === 'auto'
    ) {
      return 'user';
    }
    if (style.justifyContent === 'flex-start') {
      return 'contact';
    }
    el = el.parentElement;
    if (el === document.body) break;
  }

  return 'contact';
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

  const viewerId = (thread?.viewer_id || data.viewer_id) as string | undefined;

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

      messages.push({
        id: uuid(),
        sender: 'contact', // Will be resolved later when viewerId is known
        content: decodeUnicodeEscapes(text || '[media]'),
        contentType: text ? 'text' : 'image',
        timestamp: timestamp || Date.now(),
        rawData: {
          threadId,
          senderId: senderMatch?.[1],
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

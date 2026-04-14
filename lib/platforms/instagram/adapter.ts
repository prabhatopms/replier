import type {
  PlatformAdapter,
  ExtractedMessage,
  ContactInfo,
} from '@/types/platform';
import { v4 as uuid } from 'uuid';
import { SELECTORS, querySelector, querySelectorAll } from './selectors';

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
    const rows = querySelectorAll(SELECTORS.messageBubble, container);

    for (const row of rows) {
      const textEl = querySelector(SELECTORS.messageText, row);
      if (!textEl?.textContent?.trim()) continue;

      // Determine sender by checking the alignment/position of the message bubble.
      // Instagram typically aligns user messages to the right and received to the left.
      // We check computed styles or flex-direction to determine this.
      const sender = detectSender(row);

      messages.push({
        id: uuid(),
        sender,
        content: textEl.textContent.trim(),
        contentType: 'text',
        timestamp: Date.now(), // DOM doesn't reliably expose timestamps
      });
    }

    return messages;
  },

  getCurrentContactInfo(): ContactInfo | null {
    const headerLink = querySelector(SELECTORS.contactHeader);
    if (!headerLink) return null;

    const name =
      headerLink.textContent?.trim() ||
      headerLink.getAttribute('aria-label') ||
      '';
    const href = headerLink.getAttribute('href') || '';
    const platformUserId = href.replace(/^\//, '').replace(/\/$/, '');

    if (!name || !platformUserId) return null;

    return { name, platformUserId };
  },

  observeNewMessages(
    callback: (msg: ExtractedMessage) => void,
  ): MutationObserver {
    const container = this.getMessageContainer();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let lastMessageCount = container
      ? querySelectorAll(SELECTORS.messageBubble, container).length
      : 0;

    const observer = new MutationObserver(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const currentContainer = this.getMessageContainer();
        if (!currentContainer) return;

        const currentRows = querySelectorAll(
          SELECTORS.messageBubble,
          currentContainer,
        );
        if (currentRows.length <= lastMessageCount) return;

        // Process only new messages (at the end)
        const newRows = currentRows.slice(lastMessageCount);
        lastMessageCount = currentRows.length;

        for (const row of newRows) {
          const textEl = querySelector(SELECTORS.messageText, row);
          if (!textEl?.textContent?.trim()) continue;

          const sender = detectSender(row);
          callback({
            id: uuid(),
            sender,
            content: textEl.textContent.trim(),
            contentType: 'text',
            timestamp: Date.now(),
          });
        }
      }, 300); // debounce 300ms
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
    return ['/api/v1/direct_v2/', '/graphql'];
  },

  parseInterceptedResponse(
    url: string,
    body: unknown,
  ): ExtractedMessage[] | null {
    try {
      // Instagram DM API responses vary, but typically contain items with text and user_id
      if (url.includes('/api/v1/direct_v2/threads/')) {
        return parseDirectThreadResponse(body);
      }
      return null;
    } catch {
      return null;
    }
  },

  async scrollToLoadMore(): Promise<boolean> {
    const container = this.getMessageContainer();
    if (!container) return false;

    const prevHeight = container.scrollHeight;
    container.scrollTop = 0;

    await new Promise((r) => setTimeout(r, 1500));

    return container.scrollHeight > prevHeight;
  },

  getInputBox(): HTMLElement | null {
    return querySelector(SELECTORS.inputBox);
  },

  insertTextIntoInput(text: string): void {
    const input = this.getInputBox();
    if (!input) return;

    input.focus();

    // Select all existing content
    document.execCommand('selectAll', false);

    // Insert text — execCommand triggers React's synthetic event listeners
    document.execCommand('insertText', false, text);
  },

  getPopoverAnchorElement(): HTMLElement | null {
    return this.getInputBox()?.closest('div[role="main"]')
      ? this.getInputBox()
      : this.getInputBox();
  },

  healthCheck(): { ok: boolean; issues: string[] } {
    const issues: string[] = [];

    if (!this.getMessageContainer()) {
      issues.push('Cannot find message container');
    }
    if (!this.getInputBox()) {
      issues.push('Cannot find input box');
    }
    if (!this.getCurrentContactInfo()) {
      issues.push('Cannot detect current contact');
    }

    return { ok: issues.length === 0, issues };
  },
};

/**
 * Detect whether a message row was sent by the user or the contact.
 * Instagram aligns sent messages to the right and received to the left.
 */
function detectSender(row: HTMLElement): 'user' | 'contact' {
  // Check computed flex/alignment styles
  const style = window.getComputedStyle(row);

  // Instagram uses flexbox — user messages have justify-content: flex-end
  if (
    style.justifyContent === 'flex-end' ||
    style.alignItems === 'flex-end'
  ) {
    return 'user';
  }

  // Check if any parent has flex-end alignment
  let parent = row.parentElement;
  while (parent) {
    const parentStyle = window.getComputedStyle(parent);
    if (
      parentStyle.justifyContent === 'flex-end' ||
      parentStyle.alignSelf === 'flex-end' ||
      parentStyle.marginLeft === 'auto'
    ) {
      return 'user';
    }
    if (parentStyle.justifyContent === 'flex-start') {
      return 'contact';
    }
    parent = parent.parentElement;
    // Don't go too far up
    if (parent === document.body) break;
  }

  // Default assumption: if we can't tell, treat as contact message
  return 'contact';
}

/**
 * Parse Instagram's direct thread API response into ExtractedMessages.
 */
function parseDirectThreadResponse(body: unknown): ExtractedMessage[] | null {
  const messages: ExtractedMessage[] = [];
  const data = body as Record<string, unknown>;

  // Navigate the response structure
  const thread = data.thread as Record<string, unknown> | undefined;
  const items = (thread?.items || data.items) as Array<Record<string, unknown>> | undefined;

  if (!Array.isArray(items)) return null;

  // Get the current user ID from the thread
  const viewerId = (thread?.viewer_id || data.viewer_id) as string | undefined;

  for (const item of items) {
    const text = (item.text as string) || '';
    const userId = item.user_id as string | number;
    const timestamp = item.timestamp as number;
    const itemId = item.item_id as string;
    const itemType = item.item_type as string;

    if (!text && itemType === 'text') continue;

    const sender: 'user' | 'contact' =
      viewerId && String(userId) === String(viewerId) ? 'user' : 'contact';

    messages.push({
      id: itemId || uuid(),
      sender,
      content: text || `[${itemType || 'media'}]`,
      contentType: itemType === 'text' ? 'text' : 'image',
      timestamp: timestamp ? timestamp * 1000 : Date.now(), // Convert from seconds to ms
      rawData: item,
    });
  }

  return messages.length > 0 ? messages : null;
}

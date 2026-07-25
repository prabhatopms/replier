/**
 * WhatsApp Web DOM selectors, ordered by resilience.
 *
 * Verified against a live DOM capture (July 2026). Two things about this
 * build are worth knowing before editing:
 *
 * 1. WhatsApp still ships `data-testid` attributes, which are far more stable
 *    than the obfuscated `x1n2onr6`-style class names around them. Prefer them.
 * 2. The older `.message-in` / `.message-out` classes that most WhatsApp
 *    scrapers rely on are GONE from this build. Sender direction now comes
 *    from the `aria-label="You:"` span, with the bubble tail as a fallback.
 */

export const SELECTORS = {
  /** The scrollable message list */
  messageContainer: [
    '[data-testid="conversation-panel-messages"]',
    '#main [data-testid="conversation-panel-body"]',
    '#main .copyable-area',
    '#main',
  ],

  /**
   * Individual message rows. Every message — including media and system
   * notices — is wrapped in a role="row".
   */
  messageBubble: [
    '[data-testid="conversation-panel-messages"] div[role="row"]',
    '#main div[role="row"]',
  ],

  /**
   * The inner container carrying the message's own id.
   * `data-id` here is the WhatsApp message key (e.g. "3B33A38632A2409CCDDE").
   */
  messageIdNode: [
    'div[data-id]',
  ],

  /** Text content of a message */
  messageText: [
    'span[data-testid="selectable-text"]',
    'span.selectable-text.copyable-text',
    '.copyable-text span[dir="ltr"]',
    '.copyable-text span[dir="auto"]',
  ],

  /**
   * A reply-to preview embedded inside the replying message's own row.
   * Its inner text uses the SAME `selectable-text` hooks as a real message,
   * so it must be excluded before running `messageText` against the row —
   * otherwise `querySelector` (first match, DOM order) returns the quoted
   * snippet instead of the actual new reply, since WhatsApp renders the
   * quote above the real text.
   */
  quotedMessage: [
    '[data-testid="quoted-message"]',
  ],

  /**
   * Carries `data-pre-plain-text="[4:08 pm, 24/7/2026] Sender Name: "`,
   * the single best source of both timestamp and sender name.
   */
  prePlainText: [
    '.copyable-text[data-pre-plain-text]',
    '[data-pre-plain-text]',
  ],

  /** The composer — a Lexical contenteditable, same engine Instagram uses */
  inputBox: [
    '[data-testid="conversation-compose-box-input"]',
    'footer div[contenteditable="true"][data-lexical-editor="true"]',
    'footer div[role="textbox"][contenteditable="true"]',
    '#main div[contenteditable="true"][data-tab="10"]',
  ],

  /** The composer wrapper, used to anchor the popover */
  composerArea: [
    '[data-testid="compose-box"]',
    '#main footer .copyable-area',
    '#main footer',
  ],

  /** Send button — only rendered once the composer has content */
  sendButton: [
    'button[aria-label="Send"]',
    '[data-testid="send"]',
    'span[data-icon="send"]',
  ],

  /** Conversation header */
  header: [
    'header[data-testid="conversation-header"]',
    '#main header',
  ],

  /**
   * The contact/group name shown in the header. For contacts not saved in the
   * address book WhatsApp renders the phone number here instead.
   */
  chatTitle: [
    '[data-testid="conversation-info-header-chat-title"]',
    '#main header span[title]',
  ],

  /** The chat list sidebar */
  chatList: [
    '#pane-side [data-testid="chat-list"]',
    '#pane-side',
  ],

  /** Link preview card inside a message */
  linkPreview: [
    '[data-testid="link-preview-container"]',
  ],

  linkPreviewTitle: [
    '[data-testid="link-preview-title"]',
  ],

  linkPreviewDescription: [
    '[data-testid="link-description"]',
  ],

  /** Voice-note playback control (scope to a row — the footer has one too) */
  voiceNote: [
    '[data-testid="audio-play"]',
    'button[aria-label="Play voice message"]',
    'audio',
  ],
} as const;

/**
 * Query the DOM using a priority-ordered list of selectors.
 * Returns the first match found.
 */
export function querySelector(
  selectors: readonly string[],
  root: ParentNode = document,
): HTMLElement | null {
  for (const sel of selectors) {
    const el = root.querySelector<HTMLElement>(sel);
    if (el) return el;
  }
  return null;
}

/**
 * Query all matching elements using priority-ordered selectors.
 */
export function querySelectorAll(
  selectors: readonly string[],
  root: ParentNode = document,
): HTMLElement[] {
  for (const sel of selectors) {
    const elements = Array.from(root.querySelectorAll<HTMLElement>(sel));
    if (elements.length > 0) return elements;
  }
  return [];
}

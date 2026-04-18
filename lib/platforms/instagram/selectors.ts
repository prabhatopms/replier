/**
 * Instagram DOM selectors, ordered by resilience.
 * Priority 1: data-pagelet / ARIA attributes (most stable across Instagram deploys)
 * Priority 2: Semantic role + attribute combos
 * Priority 3: Structural patterns (least stable)
 *
 * Updated 2024-04: Instagram uses Meta's Lightspeed rendering with
 * data-pagelet markers, role="presentation" for message bubbles,
 * and Lexical editor for the input box.
 */

export const SELECTORS = {
  /** The scrollable message list container */
  messageContainer: [
    '[data-pagelet="IGDMessagesList"]',
    'div[aria-label^="Conversation with"]',
    'div[style*="overflow"][style*="auto"]',
  ],

  /** The message input (Lexical contenteditable editor) */
  inputBox: [
    'div[role="textbox"][data-lexical-editor="true"]',
    'div[contenteditable="true"][data-lexical-editor]',
    '[data-pagelet="IGDComposerForCannes"] div[role="textbox"]',
    'div[contenteditable="true"][aria-placeholder="Message..."]',
  ],

  /** The conversation header containing the contact profile link */
  contactHeader: [
    'a[aria-label^="Open the profile page of"]',
    '[data-pagelet="IGDInboxHeaderOffMsys"] a[href*="instagram.com/"]',
    '[data-pagelet="IGDInboxHeaderOffMsys"] a[role="link"]',
  ],

  /** Individual message bubbles within the conversation */
  messageBubble: [
    '[data-pagelet="IGDMessagesList"] div[role="presentation"]',
    'div[aria-label^="Conversation with"] div[role="presentation"]',
  ],

  /** Text content within a message bubble */
  messageText: [
    'div[role="presentation"] div[dir="auto"]',
    'div[dir="auto"]',
  ],

  /** The send button in the composer area */
  sendButton: [
    '[data-pagelet="IGDComposerForCannes"] div[role="button"]',
    'button[type="submit"]',
  ],

  /** The composer/input area container */
  composerArea: [
    '[data-pagelet="IGDComposerForCannes"]',
  ],

  /** The conversation header pagelet */
  headerPagelet: [
    '[data-pagelet="IGDInboxHeaderOffMsys"]',
  ],

  /** The thread list sidebar navigation */
  threadList: [
    'div[aria-label="Thread list"][role="navigation"]',
    '[data-pagelet="IGDInboxThreadListScrollableAreaPagelet"]',
  ],

  /** Profile link in conversation header */
  profileLink: [
    'a[aria-label^="Open the profile page of"]',
  ],

  /** Timestamp elements on messages */
  timestampAbbr: [
    'abbr[aria-label]',
  ],

  /** Display name in the header */
  displayName: [
    '[data-pagelet="IGDInboxHeaderOffMsys"] span[title]',
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

/**
 * Instagram DOM selectors, ordered by resilience.
 * Priority 1: Semantic/ARIA attributes (most stable across Instagram deploys)
 * Priority 2: Structural patterns
 * Priority 3: Class substring matching (least stable)
 */

export const SELECTORS = {
  messageContainer: [
    '[role="grid"]',
    'div[style*="overflow"][style*="auto"]',
    'section > div > div > div[style*="height"]',
  ],
  inputBox: [
    '[role="textbox"][contenteditable="true"]',
    'div[contenteditable="true"][data-lexical-editor]',
    'div[contenteditable="true"][aria-label]',
    'textarea[placeholder]',
  ],
  contactHeader: [
    'header a[role="link"][href^="/"]',
    '[role="banner"] a[href^="/"]',
    'header span[dir="auto"]',
  ],
  messageBubble: [
    'div[role="row"]',
    'div[role="listitem"]',
  ],
  messageText: [
    'div[dir="auto"] > span',
    'span[dir="auto"]',
    'div[dir="auto"]',
  ],
  sendButton: [
    'button[type="submit"]',
    'div[role="button"][tabindex="0"]',
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

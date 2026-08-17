/**
 * Story tray scanning for the Instagram feed.
 *
 * Instagram marks the tray with `data-pagelet="story_tray"` and encodes
 * the username directly on each item's aria-label: "Story by USERNAME,
 * seen" / "Story by USERNAME, not seen" — confirmed against live markup
 * 2026-08. Same caveat as ./selectors.ts: fragile, re-verify if Instagram
 * reworks the feed markup.
 *
 * "Reacted" state (has the user sent a reaction/reply to this person's
 * story) has no DOM signal — Instagram doesn't expose reply history in the
 * tray — so it's tracked locally in extension storage, populated by
 * observing the user's own outgoing reaction requests. See
 * `markStoryReacted` / `getReactedUsernames` below.
 */

import { SELECTORS, querySelector, querySelectorAll } from './selectors';

export interface StoryTrayEntry {
  key: string;
  username: string;
  avatarUrl?: string;
  reacted: boolean;
  element: HTMLElement;
}

const LABEL_PATTERN = /^Story by (.+?),\s*(?:seen|not seen)$/i;

/**
 * Reads the tray from the DOM. Returned entries always have `reacted:
 * false` — the DOM carries no reaction history, so callers should merge
 * in `getReactedUsernames()` themselves (see content.ts::scanStories).
 */
export function getStoryTrayEntries(): StoryTrayEntry[] {
  const tray = querySelector(SELECTORS.storyTray);
  if (!tray) return [];

  const items = querySelectorAll(SELECTORS.storyTrayItem, tray);
  const entries: StoryTrayEntry[] = [];
  const seenUsernames = new Set<string>();

  for (const item of items) {
    const label = item.getAttribute('aria-label') || '';
    const match = label.match(LABEL_PATTERN);
    if (!match) continue;

    const username = match[1];
    if (seenUsernames.has(username)) continue;
    seenUsernames.add(username);

    const img = item.querySelector<HTMLImageElement>('img[alt*="profile picture"]');

    entries.push({
      key: username,
      username,
      avatarUrl: img?.getAttribute('src') || undefined,
      reacted: false,
      element: item,
    });
  }

  return entries;
}

const REACTED_STORAGE_KEY = 'reactedStories';
const MAX_REACTED_ENTRIES = 500;

/**
 * Usernames the user has reacted to, per `markStoryReacted`. Persisted in
 * extension storage (not the DOM) since Instagram exposes no "have I
 * replied to this story" signal.
 */
export async function getReactedUsernames(): Promise<Set<string>> {
  const result = await browser.storage.local.get(REACTED_STORAGE_KEY);
  const list = (result[REACTED_STORAGE_KEY] as string[]) || [];
  return new Set(list);
}

/**
 * Records that the user reacted to `username`'s story. Called only after
 * observing a real outgoing reaction request the user triggered themselves
 * (see the `replier:broadcast-sent` listener in content.ts) — this module
 * never initiates a reaction, only remembers ones that already happened.
 */
export async function markStoryReacted(username: string): Promise<void> {
  const result = await browser.storage.local.get(REACTED_STORAGE_KEY);
  const list = (result[REACTED_STORAGE_KEY] as string[]) || [];
  if (list.includes(username)) return;
  list.push(username);
  if (list.length > MAX_REACTED_ENTRIES) {
    list.splice(0, list.length - MAX_REACTED_ENTRIES);
  }
  await browser.storage.local.set({ [REACTED_STORAGE_KEY]: list });
}

/** Opens a story the same way a real click would — no simulated engagement beyond navigation. */
export function openStoryEntry(entry: StoryTrayEntry): void {
  entry.element.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true, view: window }),
  );
}

export function closeActiveStory(): void {
  document.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      keyCode: 27,
      bubbles: true,
    }),
  );
}

export function isStoryViewerOpen(): boolean {
  return !!document.querySelector('div[role="dialog"]');
}

const REPLY_INPUT_SELECTORS = [
  'div[role="dialog"] textarea[placeholder^="Reply to"]',
  'div[role="dialog"] textarea',
  'div[role="dialog"] div[role="textbox"]',
];

/**
 * Whether the currently open story has a reply box at all. Covers the
 * cases a story can't be responded to: replies disabled by the poster,
 * sponsored/ad stories, and the user's own story (which shows a viewer
 * list instead of a reply box). Not yet verified against the live viewer
 * markup — re-check alongside the reply box if this misreports.
 */
export function isReplyAvailableOnOpenStory(): boolean {
  return REPLY_INPUT_SELECTORS.some((sel) => document.querySelector(sel));
}

/**
 * Username of the story currently open in the viewer dialog, if any.
 * Reuses the same aria-label pattern trusted for the DM header
 * (see selectors.ts profileLink) since Instagram applies it broadly.
 * Not yet verified against the live viewer markup.
 */
export function getOpenStoryUsername(): string | null {
  const dialog = document.querySelector('div[role="dialog"]');
  if (!dialog) return null;

  const profileLink = dialog.querySelector<HTMLAnchorElement>(
    'a[aria-label^="Open the profile page of"]',
  );
  if (profileLink) {
    return (profileLink.getAttribute('aria-label') || '')
      .replace('Open the profile page of ', '')
      .trim();
  }

  const link = dialog.querySelector<HTMLAnchorElement>('a[role="link"][href^="/"]');
  const href = link?.getAttribute('href') || '';
  const match = href.match(/^\/([^/?]+)\/?$/);
  return match ? match[1] : null;
}

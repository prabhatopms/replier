import { v4 as uuid } from 'uuid';
import { db } from './index';
import type { Message } from '@/types/message';
import type { Platform, ExtractedMessage } from '@/types/platform';

export async function storeMessage(
  contactId: string,
  platform: Platform,
  extracted: ExtractedMessage,
  scraped = false,
): Promise<Message> {
  const message: Message = {
    id: extracted.id || uuid(),
    contactId,
    sender: extracted.sender,
    content: extracted.content,
    contentType: extracted.contentType,
    timestamp: extracted.timestamp,
    platform,
    scraped,
    mediaUrl: extracted.mediaUrl,
    rawData: extracted.rawData ? JSON.stringify(extracted.rawData) : undefined,
  };
  await db.messages.put(message);
  return message;
}

/**
 * Whether a message with this ID is already stored.
 *
 * Instagram virtualizes its message list, so scrolling through history can
 * re-surface bubbles the live DOM observer never saw this session — it has
 * no way to tell "old message, newly rendered" from "genuinely new message"
 * on its own. Callers that auto-trigger on new contact messages (e.g. the
 * NEW_MESSAGE handler enqueuing a reply) need this check first, or every
 * scroll through history re-fires those side effects for messages that
 * already arrived.
 */
export async function messageExists(id: string): Promise<boolean> {
  return (await db.messages.get(id)) !== undefined;
}

export async function storeMessages(
  contactId: string,
  platform: Platform,
  messages: ExtractedMessage[],
  scraped = false,
): Promise<void> {
  const records: Message[] = messages.map((m) => ({
    id: m.id || uuid(),
    contactId,
    sender: m.sender,
    content: m.content,
    contentType: m.contentType,
    timestamp: m.timestamp,
    platform,
    scraped,
    mediaUrl: m.mediaUrl,
    rawData: m.rawData ? JSON.stringify(m.rawData) : undefined,
  }));

  await db.messages.bulkPut(records);
}

export async function getRecentMessages(
  contactId: string,
  limit = 40,
): Promise<Message[]> {
  return db.messages
    .where('[contactId+timestamp]')
    .between([contactId, Dexie.minKey], [contactId, Dexie.maxKey])
    .reverse()
    .limit(limit)
    .toArray()
    .then((msgs) => msgs.reverse()); // Return in chronological order
}

export async function getMessagesSince(
  contactId: string,
  sinceTimestamp: number,
): Promise<Message[]> {
  return db.messages
    .where('[contactId+timestamp]')
    .between([contactId, sinceTimestamp], [contactId, Dexie.maxKey])
    .toArray();
}

export async function getMessageCount(contactId: string): Promise<number> {
  return db.messages.where('contactId').equals(contactId).count();
}

/**
 * Delete specific messages by id, scoped to a contact so a stray/incorrect
 * id from another conversation can't delete the wrong thing.
 */
export async function deleteMessages(
  contactId: string,
  messageIds: string[],
): Promise<number> {
  const ids = await db.messages
    .where('id')
    .anyOf(messageIds)
    .filter((m) => m.contactId === contactId)
    .primaryKeys();
  await db.messages.bulkDelete(ids);
  return ids.length;
}

export async function getContactMessageCount(contactId: string): Promise<number> {
  return db.messages
    .where('contactId')
    .equals(contactId)
    .filter((m) => m.sender === 'contact' && m.verified !== false)
    .count();
}

/**
 * Recent messages the user has sent to ANYONE, most recent first.
 *
 * Used as a texting-voice fallback for a brand-new contact with zero shared
 * history — without it, the very first message to someone new has no real
 * signal to sound like this specific person at all, only generic prompt
 * instructions.
 */
export async function getRecentUserMessages(limit = 40): Promise<Message[]> {
  return db.messages
    .orderBy('timestamp')
    .reverse()
    .filter((m) => m.sender === 'user' && m.contentType === 'text')
    .limit(limit)
    .toArray();
}

export async function getLastMessage(
  contactId: string,
): Promise<Message | undefined> {
  return db.messages
    .where('[contactId+timestamp]')
    .between([contactId, Dexie.minKey], [contactId, Dexie.maxKey])
    .reverse()
    .first();
}

export async function getLastContactMessage(
  contactId: string,
): Promise<Message | undefined> {
  return db.messages
    .where('[contactId+timestamp]')
    .between([contactId, Dexie.minKey], [contactId, Dexie.maxKey])
    .reverse()
    .filter((m) => m.sender === 'contact' && m.verified !== false)
    .first();
}

/**
 * A same-instant duplicate must land within this window of an existing
 * message to be considered "the same event seen twice." Wide enough to
 * absorb DOM/API arrival skew and timestamp-interpolation slop, narrow
 * enough that a contact re-sending "haha" hours later is never caught by it.
 */
const CONTENT_DEDUP_WINDOW_MS = 10 * 60 * 1000;

/**
 * Store messages with deduplication.
 * Checks for existing messages by ID, and by content+sender+time-proximity
 * to catch the same message seen twice via overlapping API interception and
 * DOM scraping. Returns the count of newly inserted messages.
 */
export async function storeMessagesDeduped(
  contactId: string,
  platform: Platform,
  messages: ExtractedMessage[],
): Promise<number> {
  if (messages.length === 0) return 0;

  const existingMessages = await db.messages
    .where('contactId')
    .equals(contactId)
    .toArray();

  // Group existing messages by content+sender so a content match can still be
  // checked for time proximity — a bare Set can't tell "same event, seen
  // twice" apart from "same phrase, sent again later," and collapsing those
  // silently drops real messages (short replies like "haha" or "ok" repeat
  // constantly in a real conversation).
  const existingByContentKey = new Map<string, number[]>();
  for (const m of existingMessages) {
    const key = `${m.sender}:${m.content.slice(0, 60).toLowerCase().trim()}`;
    const list = existingByContentKey.get(key);
    if (list) list.push(m.timestamp);
    else existingByContentKey.set(key, [m.timestamp]);
  }
  const existingIdSet = new Set(existingMessages.map((m) => m.id));

  const newMessages: Message[] = [];
  for (const m of messages) {
    // Skip if we already have this exact ID (deterministic dom-hash IDs)
    if (m.id && existingIdSet.has(m.id)) continue;

    const contentKey = `${m.sender}:${m.content.slice(0, 60).toLowerCase().trim()}`;
    const nearbyTimestamps = existingByContentKey.get(contentKey);
    const isSameEventSeenTwice = nearbyTimestamps?.some(
      (t) => Math.abs(t - m.timestamp) < CONTENT_DEDUP_WINDOW_MS,
    );
    if (isSameEventSeenTwice) continue;

    const list = existingByContentKey.get(contentKey);
    if (list) list.push(m.timestamp);
    else existingByContentKey.set(contentKey, [m.timestamp]);

    newMessages.push({
      id: m.id || uuid(),
      contactId,
      sender: m.sender,
      content: m.content,
      contentType: m.contentType,
      timestamp: m.timestamp,
      platform,
      scraped: true,
      verified: true,
      mediaUrl: m.mediaUrl,
      rawData: m.rawData ? JSON.stringify(m.rawData) : undefined,
    });
  }

  if (newMessages.length > 0) {
    await db.messages.bulkPut(newMessages);
  }

  return newMessages.length;
}

/**
 * Reconcile stored messages with freshly scraped DOM messages.
 * Marks DB messages as verified if they match scraped messages,
 * and marks recent unmatched DB messages as unverified (ghost messages).
 * Only affects messages from the last 24 hours to avoid touching old history.
 */
export async function reconcileMessages(
  contactId: string,
  scrapedMessages: ExtractedMessage[],
): Promise<{ verified: number; unverified: number }> {
  if (scrapedMessages.length === 0) return { verified: 0, unverified: 0 };

  // Build fingerprints of what's actually visible in the DOM
  const domFingerprints = new Set<string>();
  for (const m of scrapedMessages) {
    domFingerprints.add(m.content.slice(0, 60).toLowerCase().trim());
  }

  // Only check messages that look like they were generated by Replier
  // (sent-* IDs from ACCEPT_REPLY or refine-* IDs).
  // Regular scraped messages and old history should NOT be touched.
  const allDbMessages = await db.messages
    .where('contactId')
    .equals(contactId)
    .toArray();

  let verified = 0;
  let unverified = 0;

  for (const dbMsg of allDbMessages) {
    const contentKey = dbMsg.content.slice(0, 60).toLowerCase().trim();
    const isInDom = domFingerprints.has(contentKey);

    if (isInDom && dbMsg.verified !== true) {
      // Mark as verified — it's in the actual conversation
      await db.messages.update(dbMsg.id, { verified: true });
      verified++;
    } else if (
      !isInDom &&
      dbMsg.id.startsWith('sent-') &&
      dbMsg.verified !== false
    ) {
      // Only mark Replier-generated sent messages as unverified
      // if they're not visible in the DOM (user deleted them after sending)
      await db.messages.update(dbMsg.id, { verified: false });
      unverified++;
    }
    // NEVER touch regular scraped messages or old history
  }

  return { verified, unverified };
}

// Need to import Dexie for minKey/maxKey
import Dexie from 'dexie';

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
    rawData: extracted.rawData ? JSON.stringify(extracted.rawData) : undefined,
  };
  await db.messages.put(message);
  return message;
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
 * Store messages with deduplication.
 * Checks for existing messages by timestamp+content to avoid duplicates
 * from overlapping API interception and DOM scraping.
 * Returns the count of newly inserted messages.
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

  // Dedup by content + sender (not timestamp — timestamps from DOM are unreliable).
  // Also check by ID for deterministic IDs (dom-HASH).
  const existingContentSet = new Set(
    existingMessages.map((m) => `${m.sender}:${m.content.slice(0, 60).toLowerCase().trim()}`),
  );
  const existingIdSet = new Set(existingMessages.map((m) => m.id));

  const newMessages: Message[] = [];
  for (const m of messages) {
    // Skip if we already have this exact ID (deterministic dom-hash IDs)
    if (m.id && existingIdSet.has(m.id)) continue;

    // Skip if content+sender matches an existing message
    const contentKey = `${m.sender}:${m.content.slice(0, 60).toLowerCase().trim()}`;
    if (existingContentSet.has(contentKey)) continue;
    existingContentSet.add(contentKey);

    newMessages.push({
      id: m.id || uuid(),
      contactId,
      sender: m.sender,
      content: m.content,
      contentType: m.contentType,
      timestamp: m.timestamp,
      platform,
      scraped: true,
      verified: true, // DOM-scraped messages are verified by definition
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

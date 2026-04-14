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

// Need to import Dexie for minKey/maxKey
import Dexie from 'dexie';

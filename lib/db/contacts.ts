import { v4 as uuid } from 'uuid';
import { db } from './index';
import type { Contact, ToneType } from '@/types/contact';
import { ConversationGoal } from '@/types/contact';
import type { Platform } from '@/types/platform';

export function createContact(
  data: Omit<Contact, 'id' | 'createdAt' | 'updatedAt' | 'lastMessageAt' | 'messageCount' | 'conversationSummary'> &
    Partial<Pick<Contact, 'conversationSummary'>>,
): Contact {
  const now = Date.now();
  return {
    ...data,
    id: uuid(),
    conversationSummary: data.conversationSummary ?? '',
    lastMessageAt: now,
    messageCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export async function saveContact(contact: Contact): Promise<void> {
  contact.updatedAt = Date.now();
  await db.contacts.put(contact);
}

export async function getContact(id: string): Promise<Contact | undefined> {
  return db.contacts.get(id);
}

export async function getContactByPlatformUser(
  platform: Platform,
  platformUserId: string,
): Promise<Contact | undefined> {
  return db.contacts
    .where('[platform+platformUserId]')
    .equals([platform, platformUserId])
    .first();
}

export async function getAllContacts(): Promise<Contact[]> {
  return db.contacts.orderBy('lastMessageAt').reverse().toArray();
}

export async function deleteContact(id: string): Promise<void> {
  await db.transaction('rw', [db.contacts, db.messages, db.pendingReplies], async () => {
    await db.contacts.delete(id);
    await db.messages.where('contactId').equals(id).delete();
    await db.pendingReplies.where('contactId').equals(id).delete();
  });
}

export async function updateContactSummary(
  id: string,
  summary: string,
): Promise<void> {
  await db.contacts.update(id, {
    conversationSummary: summary,
    messageCount: 0,
    updatedAt: Date.now(),
  });
}

export async function incrementMessageCount(id: string): Promise<number> {
  const contact = await db.contacts.get(id);
  if (!contact) return 0;
  const newCount = contact.messageCount + 1;
  await db.contacts.update(id, {
    messageCount: newCount,
    lastMessageAt: Date.now(),
    updatedAt: Date.now(),
  });
  return newCount;
}

export function newDefaultContact(
  platform: Platform,
  platformUserId: string,
  displayName: string,
): Contact {
  return createContact({
    platform,
    platformUserId,
    displayName,
    relationship: '',
    goal: ConversationGoal.CASUAL_CHAT,
    goalDescription: '',
    personalNotes: '',
    preferredTone: 'default' as ToneType,
    isActive: true,
  });
}

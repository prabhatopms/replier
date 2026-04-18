import Dexie, { type EntityTable } from 'dexie';
import type { Contact } from '@/types/contact';
import type { Message } from '@/types/message';
import type { PendingReply } from '@/types/reply';

export const db = new Dexie('ReplierDB') as Dexie & {
  contacts: EntityTable<Contact, 'id'>;
  messages: EntityTable<Message, 'id'>;
  pendingReplies: EntityTable<PendingReply, 'id'>;
};

db.version(1).stores({
  contacts:
    'id, platform, platformUserId, [platform+platformUserId], lastMessageAt',
  messages: 'id, contactId, timestamp, [contactId+timestamp]',
  pendingReplies: 'id, contactId, status, [contactId+status]',
});

// v2: Auto-pilot fields on contacts (threadId, history scrub tracking)
db.version(2).stores({
  contacts:
    'id, platform, platformUserId, [platform+platformUserId], lastMessageAt, threadId',
  messages: 'id, contactId, timestamp, [contactId+timestamp]',
  pendingReplies: 'id, contactId, status, [contactId+status]',
}).upgrade((tx) => {
  return tx.table('contacts').toCollection().modify((contact) => {
    contact.historyScrubbed = contact.historyScrubbed ?? false;
    contact.historyScrubCount = contact.historyScrubCount ?? 0;
  });
});

export { db as default };

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

export { db as default };

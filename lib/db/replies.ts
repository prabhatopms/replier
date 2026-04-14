import { v4 as uuid } from 'uuid';
import { db } from './index';
import type { PendingReply } from '@/types/reply';
import type { ToneType } from '@/types/contact';

export async function createPendingReply(
  contactId: string,
  triggerMessageId: string,
  tone: ToneType,
): Promise<PendingReply> {
  // Discard any existing pending replies for this contact
  await db.pendingReplies
    .where('[contactId+status]')
    .between([contactId, 'generating'], [contactId, 'ready'])
    .modify({ status: 'discarded' as const });

  const reply: PendingReply = {
    id: uuid(),
    contactId,
    replyText: '',
    tone,
    triggerMessageId,
    status: 'generating',
    createdAt: Date.now(),
  };

  await db.pendingReplies.put(reply);
  return reply;
}

export async function updateReplyText(
  id: string,
  text: string,
): Promise<void> {
  await db.pendingReplies.update(id, {
    replyText: text,
    status: 'ready' as const,
  });
}

export async function getPendingReplyForContact(
  contactId: string,
): Promise<PendingReply | undefined> {
  return db.pendingReplies
    .where('[contactId+status]')
    .equals([contactId, 'ready'])
    .first();
}

export async function getGeneratingReply(
  contactId: string,
): Promise<PendingReply | undefined> {
  return db.pendingReplies
    .where('[contactId+status]')
    .equals([contactId, 'generating'])
    .first();
}

export async function acceptReply(
  id: string,
  editedText?: string,
): Promise<void> {
  const updates: Partial<PendingReply> = { status: 'accepted' as const };
  if (editedText !== undefined) {
    updates.replyText = editedText;
  }
  await db.pendingReplies.update(id, updates);
}

export async function discardReply(id: string): Promise<void> {
  await db.pendingReplies.update(id, { status: 'discarded' as const });
}

export async function discardAllForContact(
  contactId: string,
): Promise<void> {
  await db.pendingReplies
    .where('contactId')
    .equals(contactId)
    .and((r) => r.status === 'generating' || r.status === 'ready')
    .modify({ status: 'discarded' as const });
}

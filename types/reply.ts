import type { ToneType } from './contact';

export interface PendingReply {
  id: string;
  contactId: string;
  replyText: string;
  tone: ToneType;
  triggerMessageId: string;
  status: 'generating' | 'ready' | 'accepted' | 'discarded';
  createdAt: number;
  // Number of contact messages in DB when this reply was generated.
  // Used to detect stale replies: if current count > this, context has changed.
  contextMessageCount?: number;
}

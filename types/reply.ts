import type { ToneType } from './contact';

export interface PendingReply {
  id: string;
  contactId: string;
  replyText: string;
  tone: ToneType;
  triggerMessageId: string;
  status: 'generating' | 'ready' | 'accepted' | 'discarded';
  createdAt: number;
}

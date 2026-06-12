import type { MessageContentType, Platform } from './platform';

export interface Message {
  id: string;
  contactId: string;
  sender: 'user' | 'contact';
  content: string;
  contentType: MessageContentType;
  timestamp: number;
  platform: Platform;
  scraped: boolean;
  rawData?: string;
  /** CDN URL for image messages — used for vision AI */
  mediaUrl?: string;
  /** false = ghost message (generated but never sent, or deleted). Excluded from LLM context. */
  verified?: boolean;
}

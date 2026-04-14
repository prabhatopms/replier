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
}

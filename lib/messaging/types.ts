import type { Contact, ToneType } from '@/types/contact';
import type { Platform, ExtractedMessage } from '@/types/platform';

export type ExtensionMessage =
  // Content Script -> Service Worker
  | { type: 'NEW_MESSAGE'; contactId: string; message: ExtractedMessage }
  | { type: 'GENERATE_REPLY'; contactId: string; tone: ToneType }
  | { type: 'REGENERATE_REPLY'; replyId: string; tone: ToneType }
  | { type: 'ACCEPT_REPLY'; replyId: string; editedText?: string }
  | { type: 'DISCARD_REPLY'; replyId: string }
  | { type: 'SCRAPE_HISTORY'; contactId: string; limit: number }
  | { type: 'GET_PENDING_REPLY'; contactId: string }
  | {
      type: 'DETECT_CONTACT';
      platform: Platform;
      platformUserId: string;
      name: string;
    }

  // Service Worker -> Content Script
  | {
      type: 'REPLY_READY';
      contactId: string;
      replyId: string;
      text: string;
      tone: ToneType;
    }
  | { type: 'REPLY_GENERATING'; contactId: string }
  | { type: 'SCRAPE_PROGRESS'; contactId: string; count: number }
  | { type: 'GENERATION_ERROR'; contactId: string; error: string }

  // Side Panel <-> Service Worker
  | { type: 'CONTACT_UPDATED'; contactId: string }
  | { type: 'SETTINGS_UPDATED' }
  | { type: 'GET_ALL_CONTACTS' }
  | { type: 'GET_CONTACT'; contactId: string }
  | { type: 'SAVE_CONTACT'; contact: Partial<Contact> & { id?: string } }
  | { type: 'DELETE_CONTACT'; contactId: string }
  | { type: 'TRIGGER_SUMMARIZE'; contactId: string }
  | { type: 'GET_CONVERSATION'; contactId: string; limit: number };

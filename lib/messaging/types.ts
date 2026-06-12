import type { Contact, ToneType } from '@/types/contact';
import type { Platform, ExtractedMessage } from '@/types/platform';

export type ExtensionMessage =
  // Content Script -> Service Worker
  | { type: 'NEW_MESSAGE'; contactId: string; message: ExtractedMessage }
  | { type: 'GENERATE_REPLY'; contactId: string; tone: ToneType; freshStart?: boolean }
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
      threadId?: string;
      avatarUrl?: string;
    }

  // History scrubbing (Content Script <-> Service Worker)
  | { type: 'START_SCRAPE'; contactId: string; maxMessages: number }
  | {
      type: 'SCRAPE_MESSAGES';
      contactId: string;
      messages: ExtractedMessage[];
      source: 'api' | 'dom' | 'embedded';
    }
  | { type: 'SCRAPE_COMPLETE'; contactId: string; totalMessages: number }
  | { type: 'SCRAPE_ERROR'; contactId: string; error: string }

  // Service Worker -> Content Script
  | {
      type: 'REPLY_READY';
      contactId: string;
      replyId: string;
      text: string;
      tone: ToneType;
    }
  | { type: 'REPLY_GENERATING'; contactId: string; messageCount?: number; hasSummary?: boolean }
  | { type: 'SCRAPE_PROGRESS'; contactId: string; count: number }
  | { type: 'GENERATION_ERROR'; contactId: string; error: string }

  // Contact status query (Content Script -> Service Worker)
  | { type: 'GET_CONTACT_STATUS'; contactId: string }
  | { type: 'GET_CONTACT_CONTEXT'; contactId: string }
  | { type: 'RECONCILE_MESSAGES'; contactId: string; scrapedMessages: ExtractedMessage[] }

  // Content Script -> Service Worker: save default tone for a contact
  | { type: 'SET_DEFAULT_TONE'; contactId: string; tone: ToneType }

  // Side Panel <-> Service Worker
  | { type: 'CONTACT_UPDATED'; contactId: string }
  | { type: 'SETTINGS_UPDATED' }
  | { type: 'GET_ALL_CONTACTS' }
  | { type: 'GET_CONTACT'; contactId: string }
  | { type: 'SAVE_CONTACT'; contact: Partial<Contact> & { id?: string } }
  | { type: 'DELETE_CONTACT'; contactId: string }
  | { type: 'CLEAR_HISTORY'; contactId: string }
  | { type: 'TRIGGER_SUMMARIZE'; contactId: string }
  | { type: 'GET_CONVERSATION'; contactId: string; limit: number }
  
  // Popover Visibility & Control (Side Panel <-> Content Script)
  | { type: 'GET_POPOVER_VISIBILITY' }
  | { type: 'SHOW_POPOVER' };

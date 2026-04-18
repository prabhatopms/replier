import type { ExtensionMessage } from '@/lib/messaging/types';
import { generationQueue } from '@/lib/pipeline/queue';
import { generateReply } from '@/lib/pipeline/generator';
import { forceSummarize } from '@/lib/pipeline/summarizer';
import {
  getContact,
  getContactByPlatformUser,
  getAllContacts,
  saveContact,
  deleteContact,
  createContact,
  newDefaultContact,
  updateScrubStatus,
} from '@/lib/db/contacts';
import {
  storeMessage,
  getRecentMessages,
  getLastMessage,
  getLastContactMessage,
  storeMessagesDeduped,
  reconcileMessages,
} from '@/lib/db/messages';
import {
  getPendingReplyForContact,
  getReplyById,
  acceptReply,
  discardReply,
} from '@/lib/db/replies';
import { ConversationGoal } from '@/types/contact';
import type { Contact } from '@/types/contact';

export default defineBackground(() => {
  // Set up the generation queue processor
  generationQueue.setProcessor(async (item) => {
    await generateReply(item.contactId, item.triggerMessageId, item.tone, item.freshStart);
  });

  // Open side panel on extension icon click
  browser.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {
      // sidePanel API might not be available in all contexts
    });

  // Top-level message listener (critical for MV3 service worker)
  browser.runtime.onMessage.addListener(
    (
      message: ExtensionMessage,
      _sender: Browser.runtime.MessageSender,
      sendResponse: (response?: unknown) => void,
    ) => {
      handleMessage(message, _sender)
        .then(sendResponse)
        .catch((err) => {
          console.error('[Replier] Message handler error:', err);
          sendResponse({ error: err.message });
        });
      return true; // Keep channel open for async response
    },
  );
});

async function handleMessage(
  message: ExtensionMessage,
  _sender: Browser.runtime.MessageSender,
): Promise<unknown> {
  switch (message.type) {
    case 'NEW_MESSAGE': {
      const contact = await getContact(message.contactId);
      if (!contact) return { ok: false, error: 'Contact not found' };

      await storeMessage(
        message.contactId,
        contact.platform,
        message.message,
      );

      // Only auto-generate if it's an incoming message from the contact
      if (message.message.sender === 'contact' && contact.isActive) {
        generationQueue.enqueue({
          contactId: message.contactId,
          triggerMessageId: message.message.id,
          tone: contact.preferredTone,
        });
      }

      return { ok: true };
    }

    case 'GENERATE_REPLY': {
      const contact = await getContact(message.contactId);
      if (!contact) return { ok: false, error: 'Contact not found' };

      generationQueue.enqueue({
        contactId: message.contactId,
        triggerMessageId: '',
        tone: message.tone,
        freshStart: message.freshStart,
      });
      return { ok: true };
    }

    case 'REGENERATE_REPLY': {
      await discardReply(message.replyId);
      return { ok: false, error: 'Use GENERATE_REPLY with contactId instead' };
    }

    case 'ACCEPT_REPLY': {
      // Mark the reply as accepted
      const reply = await getReplyById(message.replyId);
      await acceptReply(message.replyId, message.editedText);

      // CRITICAL: Store the sent message in the messages DB so the LLM
      // has it as context for the next generation
      if (reply) {
        const contact = await getContact(reply.contactId);
        if (contact) {
          const sentText = message.editedText || reply.replyText;
          await storeMessage(reply.contactId, contact.platform, {
            id: `sent-${Date.now()}`,
            sender: 'user',
            content: sentText,
            contentType: 'text',
            timestamp: Date.now(),
          });
        }
      }

      return { ok: true };
    }

    case 'DISCARD_REPLY': {
      await discardReply(message.replyId);
      return { ok: true };
    }

    case 'GET_CONTACT_CONTEXT': {
      const contact = await getContact(message.contactId);
      if (!contact) return { ok: false };

      const allMsgs = await getRecentMessages(message.contactId, 999);
      const lastFew = allMsgs.slice(-5).map(m => `${m.sender === 'user' ? 'You' : contact.displayName}: ${m.content.slice(0, 80)}`);

      return {
        ok: true,
        context: {
          displayName: contact.displayName,
          username: contact.platformUserId,
          relationship: contact.relationship || 'Not set',
          goal: contact.goal || 'Not set',
          goalDescription: contact.goalDescription || '',
          personalNotes: contact.personalNotes || 'None',
          preferredTone: contact.preferredTone || 'default',
          isActive: contact.isActive,
          conversationSummary: contact.conversationSummary || '',
          structuredSummary: contact.structuredSummary || null,
          totalMessages: allMsgs.length,
          historyScrubbed: contact.historyScrubbed,
          historyScrubCount: contact.historyScrubCount || 0,
          recentMessages: lastFew,
        },
      };
    }

    case 'GET_PENDING_REPLY': {
      const pending = await getPendingReplyForContact(message.contactId);
      return { ok: true, reply: pending || null };
    }

    case 'DETECT_CONTACT': {
      // Find or create a contact based on platform + userId
      let contact = await getContactByPlatformUser(
        message.platform,
        message.platformUserId,
      );
      const isNew = !contact;

      if (!contact) {
        contact = newDefaultContact(
          message.platform,
          message.platformUserId,
          message.name,
          message.threadId,
        );
        await saveContact(contact);
      } else {
        // Update threadId if we now have it and didn't before
        let needsUpdate = false;
        if (message.threadId && !contact.threadId) {
          contact.threadId = message.threadId;
          needsUpdate = true;
        }
        if (message.name && contact.displayName !== message.name) {
          contact.displayName = message.name;
          needsUpdate = true;
        }
        if (needsUpdate) {
          await saveContact(contact);
        }
      }

      return { ok: true, contact, isNew };
    }

    case 'GET_CONTACT_STATUS': {
      const contact = await getContact(message.contactId);
      if (!contact) return { ok: false, error: 'Contact not found' };

      const [lastMsg, lastContactMsg, pendingReply] = await Promise.all([
        getLastMessage(message.contactId),
        getLastContactMessage(message.contactId),
        getPendingReplyForContact(message.contactId),
      ]);

      return {
        ok: true,
        lastMessageSender: lastMsg?.sender || null,
        lastContactMessageId: lastContactMsg?.id || null,
        isActive: contact.isActive,
        hasMessages: !!lastMsg,
        pendingReply: pendingReply || null,
        preferredTone: contact.preferredTone,
      };
    }

    case 'GET_ALL_CONTACTS': {
      const contacts = await getAllContacts();
      return { ok: true, contacts };
    }

    case 'GET_CONTACT': {
      const contact = await getContact(message.contactId);
      return { ok: true, contact: contact || null };
    }

    case 'SAVE_CONTACT': {
      const data = message.contact;
      let contact: Contact;

      if (data.id) {
        const existing = await getContact(data.id);
        if (existing) {
          contact = { ...existing, ...data, updatedAt: Date.now() } as Contact;
        } else {
          return { ok: false, error: 'Contact not found' };
        }
      } else {
        contact = createContact({
          platform: data.platform || 'instagram',
          platformUserId: data.platformUserId || '',
          displayName: data.displayName || '',
          relationship: data.relationship || '',
          goal: data.goal || ConversationGoal.CASUAL_CHAT,
          goalDescription: data.goalDescription || '',
          personalNotes: data.personalNotes || '',
          preferredTone: data.preferredTone || 'default',
          isActive: data.isActive ?? true,
        });
      }

      await saveContact(contact);
      return { ok: true, contact };
    }

    case 'SET_DEFAULT_TONE': {
      const contact = await getContact(message.contactId);
      if (!contact) return { ok: false, error: 'Contact not found' };
      contact.preferredTone = message.tone;
      contact.updatedAt = Date.now();
      await saveContact(contact);
      return { ok: true };
    }

    case 'DELETE_CONTACT': {
      await deleteContact(message.contactId);
      return { ok: true };
    }

    case 'CLEAR_HISTORY': {
      // Delete all messages for this contact and reset scrub status
      const contact = await getContact(message.contactId);
      if (!contact) return { ok: false, error: 'Contact not found' };

      // Delete all messages
      const { db } = await import('@/lib/db/index');
      await db.messages.where('contactId').equals(message.contactId).delete();

      // Reset contact's summary and scrub status
      contact.conversationSummary = '';
      contact.structuredSummary = undefined;
      contact.historyScrubbed = false;
      contact.historyScrubCount = 0;
      contact.messageCount = 0;
      contact.updatedAt = Date.now();
      await saveContact(contact);

      return { ok: true };
    }

    case 'TRIGGER_SUMMARIZE': {
      const summary = await forceSummarize(message.contactId);
      return { ok: true, summary };
    }

    case 'GET_CONVERSATION': {
      const messages = await getRecentMessages(
        message.contactId,
        message.limit,
      );
      return { ok: true, messages };
    }

    case 'START_SCRAPE': {
      // Forward to the active tab's content script to begin scraping
      const tabs = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tabs[0]?.id) {
        browser.tabs.sendMessage(tabs[0].id, message);
      }
      return { ok: true };
    }

    case 'SCRAPE_MESSAGES': {
      // Store scraped messages with deduplication
      const contact = await getContact(message.contactId);
      if (!contact) return { ok: false, error: 'Contact not found' };

      const newCount = await storeMessagesDeduped(
        message.contactId,
        contact.platform,
        message.messages,
      );

      return { ok: true, newCount };
    }

    case 'RECONCILE_MESSAGES': {
      const result = await reconcileMessages(
        message.contactId,
        message.scrapedMessages,
      );
      return { ok: true, ...result };
    }

    case 'SCRAPE_COMPLETE': {
      // Update contact scrub status and trigger summarization
      await updateScrubStatus(message.contactId, message.totalMessages);

      // Auto-summarize after scrub if we have enough messages
      if (message.totalMessages >= 10) {
        forceSummarize(message.contactId).catch((err) => {
          console.error('[Replier] Post-scrub summarization failed:', err);
        });
      }

      return { ok: true };
    }

    case 'SCRAPE_ERROR': {
      console.error('[Replier] Scrape error:', message.error);
      return { ok: true };
    }

    case 'SCRAPE_HISTORY': {
      // Legacy: forward to content script
      const tabs = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tabs[0]?.id) {
        browser.tabs.sendMessage(tabs[0].id, message);
      }
      return { ok: true };
    }

    default:
      return { ok: false, error: 'Unknown message type' };
  }
}

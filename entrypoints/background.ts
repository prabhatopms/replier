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
} from '@/lib/db/contacts';
import { storeMessage, getRecentMessages } from '@/lib/db/messages';
import {
  getPendingReplyForContact,
  acceptReply,
  discardReply,
} from '@/lib/db/replies';
import { ConversationGoal } from '@/types/contact';
import type { Contact } from '@/types/contact';

export default defineBackground(() => {
  // Set up the generation queue processor
  generationQueue.setProcessor(async (item) => {
    await generateReply(item.contactId, item.triggerMessageId, item.tone);
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
      // Store the message
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
        triggerMessageId: '', // Manual trigger
        tone: message.tone,
      });
      return { ok: true };
    }

    case 'REGENERATE_REPLY': {
      // Discard old reply and regenerate
      await discardReply(message.replyId);

      // Find the contact from the reply
      const reply = await getPendingReplyForContact(message.replyId);
      // We need contactId — get it from the reply record before discarding
      // Actually we should pass contactId. For now, respond with error
      return { ok: false, error: 'Use GENERATE_REPLY with contactId instead' };
    }

    case 'ACCEPT_REPLY': {
      await acceptReply(message.replyId, message.editedText);
      return { ok: true };
    }

    case 'DISCARD_REPLY': {
      await discardReply(message.replyId);
      return { ok: true };
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
      if (!contact) {
        contact = newDefaultContact(
          message.platform,
          message.platformUserId,
          message.name,
        );
        await saveContact(contact);
      }
      return { ok: true, contact };
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

    case 'DELETE_CONTACT': {
      await deleteContact(message.contactId);
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

    case 'SCRAPE_HISTORY': {
      // The actual scraping happens in the content script (DOM access).
      // This message is for the content script to handle.
      // Forward to the active tab's content script.
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

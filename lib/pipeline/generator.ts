import type { ToneType } from '@/types/contact';
import { getContact, incrementMessageCount } from '@/lib/db/contacts';
import { getRecentMessages, getContactMessageCount } from '@/lib/db/messages';
import { createPendingReply, updateReplyText } from '@/lib/db/replies';
import { getActiveProvider } from '@/lib/llm/provider';
import { buildContext } from './context-builder';
import { cleanLLMResponse } from '@/lib/llm/prompt-builder';
import { summarizeIfNeeded } from './summarizer';

const SUMMARY_THRESHOLD = 15;

/**
 * Generate a reply for a contact.
 * This is the main orchestration function called by the queue processor.
 */
export async function generateReply(
  contactId: string,
  triggerMessageId: string,
  tone: ToneType,
  freshStart = false,
): Promise<{ replyId: string; text: string } | null> {
  const contact = await getContact(contactId);
  if (!contact || !contact.isActive) return null;

  // Snapshot how many contact messages exist right now so we can detect
  // stale cached replies later (if this count grows, context has changed).
  const contextMessageCount = await getContactMessageCount(contactId);

  // Create a pending reply record
  const pendingReply = await createPendingReply(
    contactId,
    triggerMessageId,
    tone,
    contextMessageCount,
  );

  try {
    // Load recent messages
    const messages = await getRecentMessages(contactId, 80);

    // Notify content script that generation started (with context info)
    notifyContentScript(contactId, 'generating', undefined, undefined, undefined, undefined,
      messages.length, !!contact.conversationSummary);

    // Build context (system prompt + message history)
    const context = await buildContext(contact, messages, tone, freshStart);

    // Call the active LLM provider (Claude or Gemini)
    const provider = await getActiveProvider();
    const replyText = await provider.generateReply(
      context.systemPrompt,
      context.messages,
    );

    // Clean HTML/XML artifacts and validate
    const cleaned = cleanLLMResponse(replyText);
    if (!cleaned) {
      throw new Error('LLM returned empty response. Try again or check API key.');
    }

    // Store the generated reply
    await updateReplyText(pendingReply.id, cleaned);

    // Increment message count
    const newCount = await incrementMessageCount(contactId);

    // Always update context/memory in the background after generation.
    // This ensures the ctx panel and future prompts have fresh data.
    if (messages.length >= 5) {
      summarizeIfNeeded(contactId).catch((err) =>
        console.error('[Replier] Summarization error:', err),
      );
    }

    // Notify content script that reply is ready
    notifyContentScript(contactId, 'ready', pendingReply.id, cleaned, tone);

    return { replyId: pendingReply.id, text: replyText };
  } catch (error) {
    console.error('[Replier] Generation error:', error);
    notifyContentScript(
      contactId,
      'error',
      undefined,
      undefined,
      undefined,
      error instanceof Error ? error.message : 'Unknown error',
    );
    return null;
  }
}

async function notifyContentScript(
  contactId: string,
  status: 'generating' | 'ready' | 'error',
  replyId?: string,
  text?: string,
  tone?: ToneType,
  error?: string,
  messageCount?: number,
  hasSummary?: boolean,
): Promise<void> {
  const tabs = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  const tabId = tabs[0]?.id;
  if (!tabId) return;

  if (status === 'generating') {
    browser.tabs.sendMessage(tabId, {
      type: 'REPLY_GENERATING',
      contactId,
      messageCount,
      hasSummary,
    });
  } else if (status === 'ready' && replyId && text) {
    browser.tabs.sendMessage(tabId, {
      type: 'REPLY_READY',
      contactId,
      replyId,
      text,
      tone,
    });
  } else if (status === 'error' && error) {
    browser.tabs.sendMessage(tabId, {
      type: 'GENERATION_ERROR',
      contactId,
      error,
    });
  }
}

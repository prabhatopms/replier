import '@/assets/styles/global.css';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { resolveAdapter } from '@/lib/platforms/registry';
import type { ExtractedMessage } from '@/types/platform';
import type { ExtensionMessage } from '@/lib/messaging/types';
import type { ToneType, CustomTone } from '@/types/contact';
import type { PopoverStatus, LogEntry } from '@/components/StatusPopover';

export default defineContentScript({
  matches: [
    'https://www.instagram.com/direct/*',
    'https://web.whatsapp.com/*',
    'https://www.messenger.com/*',
    'https://x.com/messages/*',
    'https://www.linkedin.com/messaging/*',
  ],
  cssInjectionMode: 'ui',

  async main(ctx) {
    const adapter = resolveAdapter(window.location.href);
    if (!adapter) {
      console.log('[Replier] No adapter found for this page');
      return;
    }

    console.log(`[Replier] Loaded ${adapter.name} adapter`);

    // Inject network interceptor
    try {
      await injectScript(`/${adapter.name}-interceptor.js` as ScriptPublicPath, {
        keepInDom: true,
      });
      console.log('[Replier] Network interceptor injected');
    } catch {
      console.log('[Replier] No interceptor for this platform, using DOM-only');
    }

    // =========================================================================
    // STATE
    // =========================================================================

    let currentContactId: string | null = null;
    let currentContactName: string = '';
    let currentContactUsername: string = '';
    let messageObserver: MutationObserver | null = null;
    let scrapeAbortController: AbortController | null = null;
    let scrapedMessageCount = 0;

    // Status popover state
    let popoverStatus: PopoverStatus = 'idle';
    const activityLogs: LogEntry[] = [];
    let replyText = '';
    let replyId = '';
    let replyTone: ToneType = 'default';
    let customTones: CustomTone[] = [];
    let errorMessage = '';
    let contactContext: import('@/components/StatusPopover').ContactContext | null = null;
    let isNewConversation = false;

    let isApiConfigured = false;
    let isNewContact = false;
    let isScraping = false;
    let scrapeComplete = false;
    let scrapeDisplayCount = 0; // total messages sent to background (for display)

    // Load custom tones from storage once on init
    browser.storage.local.get('customTones').then((result) => {
      customTones = (result.customTones as CustomTone[]) || [];
    });

    // Listen for custom tones updates in storage to update the popover in real-time
    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.customTones) {
        customTones = (changes.customTones.newValue as CustomTone[]) || [];
        renderPopover();
      }
    });

    // Load initial state from storage
    browser.storage.local.get(['apiKey', 'geminiApiKey', 'openaiApiKey']).then((result) => {
      isApiConfigured = !!(result.apiKey || result.geminiApiKey || result.openaiApiKey);
      renderPopover();
    });

    // Re-check when settings change
    browser.storage.onChanged.addListener((changes) => {
      if ('apiKey' in changes || 'geminiApiKey' in changes || 'openaiApiKey' in changes) {
        browser.storage.local.get(['apiKey', 'geminiApiKey', 'openaiApiKey']).then((result) => {
          isApiConfigured = !!(result.apiKey || result.geminiApiKey || result.openaiApiKey);
          renderPopover();
        });
      }
      if ('customTones' in changes) {
        customTones = (changes.customTones.newValue as CustomTone[]) || [];
        renderPopover();
      }
    });

    function addLog(message: string, type: LogEntry['type'] = 'info'): void {
      activityLogs.push({ time: Date.now(), message, type });
      // Keep max 50 entries
      if (activityLogs.length > 50) activityLogs.shift();
      renderPopover();
    }

    // =========================================================================
    // INTERCEPTED API LISTENER
    // =========================================================================

    window.addEventListener('replier:api-response', ((event: CustomEvent) => {
      if (!adapter) return;
      const { url, body } = event.detail;
      const messages = adapter.parseInterceptedResponse(url, body);
      if (messages?.length && currentContactId) {
        for (const msg of messages) {
          processNewMessage(msg);
        }
      }
    }) as EventListener);

    // LS message buffer for scraping
    const lsMessageBuffer: ExtractedMessage[] = [];
    window.addEventListener('replier:ls-messages', ((event: CustomEvent) => {
      const { messages } = event.detail as {
        messages: Array<{
          text: string; threadId: string; timestamp: number;
          senderId: string; messageId: string;
        }>;
      };
      for (const msg of messages) {
        lsMessageBuffer.push({
          id: msg.messageId || `ls-${msg.timestamp}-${Math.random().toString(36).slice(2, 8)}`,
          sender: 'contact',
          content: msg.text,
          contentType: msg.text && msg.text !== '[media]' ? 'text' : 'image',
          timestamp: msg.timestamp,
          rawData: { senderId: msg.senderId, threadId: msg.threadId, source: 'lightspeed' },
        });
      }
    }) as EventListener);

    // =========================================================================
    // STATUS POPOVER (always visible)
    // =========================================================================

    // Mount the popover root ONCE and never unmount it.
    // Visibility is controlled by rendering null vs the component.
    let popoverRoot: ReturnType<typeof createRoot> | null = null;
    let popoverVisible = false;

    const statusPopoverUi = await createShadowRootUi(ctx, {
      name: 'replier-status',
      position: 'overlay',
      anchor: 'body',
      onMount: (container) => {
        // Establish font baseline on the container div (child of :host).
        // Even if :host inherits wrong values from the page, this ensures
        // all React children see a correct inherited font context.
        container.style.fontSize = '16px';
        container.style.fontFamily =
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";
        container.style.lineHeight = '1.5';
        container.style.color = '#111827';
        if (!popoverRoot) {
          popoverRoot = createRoot(container);
        }
        renderPopover();
        return () => {};
      },
    });
    // Mount immediately — it stays mounted for the lifetime of the page
    statusPopoverUi.mount();

    function renderPopover(): void {
      if (!popoverRoot) return;
      if (!popoverVisible || (!currentContactId && popoverStatus !== 'detecting')) {
        popoverRoot.render(null);
        return;
      }
      import('@/components/StatusPopover').then(({ StatusPopover }) => {
        if (!popoverRoot) return;
        popoverRoot.render(
          createElement(StatusPopover, {
            status: popoverStatus,
            contactName: currentContactUsername || currentContactName || '',
            replyText,
            replyId,
            tone: replyTone,
            customTones,
            errorMessage,
            logs: [...activityLogs],
            contactContext,
            isScraping,
            scrapeCount: scrapeDisplayCount,
            scrapeComplete,
            isNewContact,
            onCancelScrape: () => { scrapeAbortController?.abort(); },
            onDismissNewContact: () => { isNewContact = false; renderPopover(); },
            onSend: handleSend,
            onRedo: handleRedo,
            onToneChange: handleToneChange,
            onRefreshContext: handleRefreshContext,
            onFlushAndRebuild: handleFlushAndRebuild,
            onDismiss: hidePopover,
            onRetry: handleRetry,
            isApiConfigured,
            onGenerateNow: handleGenerateNow,
            onStartFresh: handleStartFresh,
            onContinue: handleContinue,
            isNewConversation,
            onRefine: handleRefine,
          }),
        );
      });
    }

    function setStatus(
      newStatus: PopoverStatus,
      opts?: { text?: string; id?: string; tone?: ToneType; error?: string },
    ): void {
      popoverStatus = newStatus;
      if (opts?.text !== undefined) replyText = opts.text;
      if (opts?.id !== undefined) replyId = opts.id;
      if (opts?.tone !== undefined) replyTone = opts.tone;
      if (opts?.error !== undefined) errorMessage = opts.error;
      renderPopover();
    }

    function showPopover(): void {
      popoverVisible = true;
      renderPopover();
    }

    function hidePopover(): void {
      popoverVisible = false;
      renderPopover();
    }

    // =========================================================================
    // CONTACT DETECTION + AUTO-GENERATION
    // =========================================================================

    async function detectAndSetContact(): Promise<void> {
      addLog('Detecting contact...', 'info');
      showPopover();
      setStatus('detecting');

      // Retry polling: Instagram's SPA doesn't update the DOM instantly
      let contactInfo = adapter!.getCurrentContactInfo();
      if (!contactInfo) {
        addLog('DOM not ready, retrying...', 'warn');
        for (let attempt = 0; attempt < 10; attempt++) {
          await new Promise((r) => setTimeout(r, 300));
          contactInfo = adapter!.getCurrentContactInfo();
          if (contactInfo) break;
        }
      }
      if (!contactInfo) {
        addLog('Could not detect contact after 10 retries', 'error');
        showPopover();
        return;
      }

      const threadId = adapter!.getThreadId?.() || undefined;

      const response = (await browser.runtime.sendMessage({
        type: 'DETECT_CONTACT',
        platform: adapter!.name,
        platformUserId: contactInfo.platformUserId,
        name: contactInfo.name,
        threadId,
      } satisfies ExtensionMessage)) as {
        ok: boolean;
        contact?: { id: string; historyScrubbed?: boolean };
        isNew?: boolean;
      };

      if (response?.ok && response.contact) {
        currentContactId = response.contact.id;
        currentContactName = contactInfo.name;
        currentContactUsername = contactInfo.platformUserId;
        isNewConversation = false;
        addLog(`Contact detected: @${contactInfo.platformUserId}${response.isNew ? ' (new)' : ''}`, 'success');

        // Show inline new contact banner
        if (response.isNew) {
          isNewContact = true;
        }

        // Re-attach message observer
        attachMessageObserver();

        // Scrape visible DOM messages immediately — no scrolling required
        await scrapeVisibleMessages();

        // Fetch context for the memory panel
        fetchContactContext();

        // Show the popover and resolve the current status
        showPopover();
        await resolveContactStatus();

        // Auto-scrub if needed
        if (!response.contact.historyScrubbed) {
          ctx.setTimeout(() => startAutoScrape(), 2000);
        }
      }
    }

    async function fetchContactContext(): Promise<void> {
      if (!currentContactId) return;
      const res = (await browser.runtime.sendMessage({
        type: 'GET_CONTACT_CONTEXT',
        contactId: currentContactId,
      } satisfies ExtensionMessage)) as { ok: boolean; context?: import('@/components/StatusPopover').ContactContext };
      if (res?.ok && res.context) {
        contactContext = res.context;
        renderPopover();
      }
    }

    /**
     * Query the background for the full status of the current contact.
     * This determines whether to show idle, ready, or auto-trigger generation.
     */
    async function resolveContactStatus(): Promise<void> {
      if (!currentContactId) return;

      addLog('Checking contact status...', 'info');

      const response = (await browser.runtime.sendMessage({
        type: 'GET_CONTACT_STATUS',
        contactId: currentContactId,
      } satisfies ExtensionMessage)) as {
        ok: boolean;
        lastMessageSender?: 'user' | 'contact' | null;
        currentContactMessageCount?: number;
        isActive?: boolean;
        hasMessages?: boolean;
        pendingReply?: { id: string; replyText: string; tone: string; contextMessageCount?: number } | null;
        preferredTone?: ToneType;
      };

      if (!response?.ok) {
        addLog('Failed to get contact status', 'error');
        setStatus('idle');
        return;
      }

      if (response.preferredTone) {
        replyTone = response.preferredTone;
      }

      addLog(`Status: active=${response.isActive}, lastMsg=${response.lastMessageSender || 'none'}, pending=${!!response.pendingReply}`, 'info');

      // Check if there's a cached pending reply, but first verify the context
      // hasn't changed since it was generated.
      // We compare the count of contact messages at generation time vs now.
      // Count is immune to ID format differences across storage paths.
      if (response.pendingReply && response.pendingReply.replyText) {
        const cachedCount = response.pendingReply.contextMessageCount;
        const currentCount = response.currentContactMessageCount ?? 0;

        // If contextMessageCount wasn't recorded (old reply) fall back to showing it.
        // If it was recorded and the current count is higher, new messages arrived.
        const isStale =
          cachedCount !== undefined && currentCount > cachedCount;

        if (isStale) {
          addLog(
            `Context changed (${cachedCount}→${currentCount} contact msgs) — regenerating`,
            'warn',
          );
          await browser.runtime.sendMessage({
            type: 'DISCARD_REPLY',
            replyId: response.pendingReply.id,
          } satisfies ExtensionMessage);
          // Fall through to auto-generate below
        } else {
          addLog('Context unchanged — showing cached reply', 'success');
          setStatus('ready', {
            text: response.pendingReply.replyText,
            id: response.pendingReply.id,
            tone: (response.preferredTone || response.pendingReply.tone as ToneType) || 'default',
          });
          return;
        }
      }

      // If the last message is from the contact and the contact is active → auto-generate
      if (
        response.lastMessageSender === 'contact' &&
        response.isActive &&
        response.hasMessages
      ) {
        addLog('Last message from contact — auto-generating reply', 'info');
        replyTone = (response.preferredTone || 'default') as ToneType;
        setStatus('generating');

        await browser.runtime.sendMessage({
          type: 'GENERATE_REPLY',
          contactId: currentContactId,
          tone: response.preferredTone || 'default',
        } satisfies ExtensionMessage);
        return;
      }

      if (!response.isActive) {
        addLog('Contact is inactive. Activate in side panel to enable auto-reply.', 'warn');
      } else if (response.lastMessageSender === 'user') {
        addLog('You sent the last message. Waiting for their reply.', 'info');
      } else if (!response.hasMessages) {
        addLog('No messages yet. Send a message or click Generate Now.', 'info');
      }

      setStatus('idle');
    }

    // =========================================================================
    // MESSAGE OBSERVER
    // =========================================================================

    function attachMessageObserver(): void {
      if (messageObserver) messageObserver.disconnect();
      messageObserver = adapter!.observeNewMessages((msg) => {
        processNewMessage(msg);
      });
    }

    async function processNewMessage(msg: ExtractedMessage): Promise<void> {
      if (!currentContactId) return;
      await browser.runtime.sendMessage({
        type: 'NEW_MESSAGE',
        contactId: currentContactId,
        message: msg,
      } satisfies ExtensionMessage);
    }

    // =========================================================================
    // ACTION HANDLERS
    // =========================================================================

    async function handleSend(text: string, rid: string): Promise<void> {
      // Always clear and insert fresh — prevents duplicates
      adapter!.insertTextIntoInput(text);

      // Small delay to let Lexical sync, then send
      await new Promise((r) => setTimeout(r, 100));
      adapter!.triggerSend?.();

      await browser.runtime.sendMessage({
        type: 'ACCEPT_REPLY',
        replyId: rid,
        editedText: text,
      } satisfies ExtensionMessage);

      addLog('Reply sent!', 'success');
      setStatus('idle');
    }

    async function handleRedo(): Promise<void> {
      if (!currentContactId) return;
      // Clear the input
      const input = adapter!.getInputBox();
      if (input) {
        input.focus();
        document.execCommand('selectAll', false);
        document.execCommand('delete', false);
      }
      setStatus('generating');

      await browser.runtime.sendMessage({
        type: 'GENERATE_REPLY',
        contactId: currentContactId,
        tone: replyTone,
      } satisfies ExtensionMessage);
    }

    async function handleToneChange(tone: string): Promise<void> {
      if (!currentContactId) return;
      replyTone = tone as ToneType;

      await browser.runtime.sendMessage({
        type: 'SET_DEFAULT_TONE',
        contactId: currentContactId,
        tone: tone as ToneType,
      } satisfies ExtensionMessage);

      if (popoverStatus !== 'idle') {
        const input = adapter!.getInputBox();
        if (input) {
          input.focus();
          document.execCommand('selectAll', false);
          document.execCommand('delete', false);
        }
        setStatus('generating');
        await browser.runtime.sendMessage({
          type: 'GENERATE_REPLY',
          contactId: currentContactId,
          tone: tone as ToneType,
          freshStart: isNewConversation || undefined,
        } satisfies ExtensionMessage);
      } else {
        renderPopover();
      }
    }


    function handleDismiss(): void {
      if (replyId) {
        browser.runtime.sendMessage({
          type: 'DISCARD_REPLY',
          replyId,
        } satisfies ExtensionMessage);
      }
      // Clear input
      const input = adapter!.getInputBox();
      if (input) {
        input.focus();
        document.execCommand('selectAll', false);
        document.execCommand('delete', false);
      }
      // Back to idle — not hidden
      isNewConversation = false;
      setStatus('idle');
    }

    async function handleRetry(): Promise<void> {
      if (!currentContactId) return;
      addLog('Retrying generation...', 'info');
      setStatus('generating');

      await browser.runtime.sendMessage({
        type: 'GENERATE_REPLY',
        contactId: currentContactId,
        tone: replyTone,
      } satisfies ExtensionMessage);
    }

    async function handleGenerateNow(): Promise<void> {
      if (!currentContactId) return;
      addLog('Manual generation triggered', 'info');
      setStatus('generating');

      await browser.runtime.sendMessage({
        type: 'GENERATE_REPLY',
        contactId: currentContactId,
        tone: replyTone || 'default',
      } satisfies ExtensionMessage);
    }

    async function handleStartFresh(): Promise<void> {
      if (!currentContactId) return;
      addLog('Starting new conversation (ignoring history)', 'info');
      isNewConversation = true;
      setStatus('generating');

      await browser.runtime.sendMessage({
        type: 'GENERATE_REPLY',
        contactId: currentContactId,
        tone: replyTone || 'default',
        freshStart: true,
      } satisfies ExtensionMessage);
    }

    async function handleContinue(): Promise<void> {
      if (!currentContactId) return;
      addLog('Continuing previous conversation', 'info');
      isNewConversation = false;
      setStatus('generating');

      await browser.runtime.sendMessage({
        type: 'GENERATE_REPLY',
        contactId: currentContactId,
        tone: replyTone || 'default',
      } satisfies ExtensionMessage);
    }

    async function handleRefine(feedback: string): Promise<void> {
      if (!currentContactId) return;
      addLog(`Refining: "${feedback}"`, 'info');

      // Store the feedback as a temporary user instruction, then regenerate
      // We send the feedback as a special message that the generator can use
      await browser.runtime.sendMessage({
        type: 'NEW_MESSAGE',
        contactId: currentContactId,
        message: {
          id: `refine-${Date.now()}`,
          sender: 'user' as const,
          content: `[Replier instruction: regenerate the reply but ${feedback}]`,
          contentType: 'text' as const,
          timestamp: Date.now(),
        },
      } satisfies ExtensionMessage);

      setStatus('generating');

      await browser.runtime.sendMessage({
        type: 'GENERATE_REPLY',
        contactId: currentContactId,
        tone: replyTone || 'default',
      } satisfies ExtensionMessage);
    }

    /**
     * Quick-scrape the currently visible DOM messages (no scrolling),
     * refresh contact context, then regenerate the reply.
     * Used when Instagram adds a "New Messages" divider and the last scraped
     * message is stale.
     */
    async function handleRefreshContext(): Promise<void> {
      if (!currentContactId || !adapter) return;
      addLog('Checking for new messages...', 'info');

      let newCount = 0;

      // 1. Flush buffered API messages first — these accumulate from Instagram's
      //    network responses but are never flushed for already-scraped contacts.
      if (lsMessageBuffer.length > 0) {
        const buffered = lsMessageBuffer.splice(0);
        const res = (await browser.runtime.sendMessage({
          type: 'SCRAPE_MESSAGES',
          contactId: currentContactId,
          messages: buffered,
          source: 'api',
        } satisfies ExtensionMessage)) as { ok: boolean; newCount?: number };
        newCount += res?.newCount ?? 0;
      }

      // 2. Scrape the currently visible DOM messages.
      const container = adapter.getMessageContainer();
      if (container) {
        const domMessages = adapter.extractMessages(container);
        if (domMessages.length > 0) {
          const res = (await browser.runtime.sendMessage({
            type: 'SCRAPE_MESSAGES',
            contactId: currentContactId,
            messages: domMessages,
            source: 'dom',
          } satisfies ExtensionMessage)) as { ok: boolean; newCount?: number };
          newCount += res?.newCount ?? 0;
        }
      }

      if (newCount === 0) {
        addLog('No new messages — context is already up to date', 'info');
        return;
      }

      addLog(`${newCount} new message${newCount !== 1 ? 's' : ''} found — regenerating`, 'success');
      await fetchContactContext();
      setStatus('generating');
      await browser.runtime.sendMessage({
        type: 'GENERATE_REPLY',
        contactId: currentContactId,
        tone: replyTone || 'default',
      } satisfies ExtensionMessage);
    }

    async function handleFlushAndRebuild(): Promise<void> {
      if (!currentContactId) return;
      addLog('Deleting contact and rebuilding from scratch...', 'info');
      setStatus('generating');

      try {
        await browser.runtime.sendMessage({
          type: 'DELETE_CONTACT',
          contactId: currentContactId,
        } satisfies ExtensionMessage);

        currentContactId = null;
        addLog('Contact deleted — re-detecting...', 'success');

        await detectAndSetContact();
      } catch (err) {
        addLog(`Flush and rebuild failed: ${err instanceof Error ? err.message : err}`, 'error');
        setStatus('error', { error: err instanceof Error ? err.message : String(err) });
      }
    }

    // =========================================================================
    // HISTORY SCRAPING
    // =========================================================================

    /**
     * Scrape all visible messages from the DOM on chat open.
     * This is the primary detection method — no scrolling needed.
     */
    async function scrapeVisibleMessages(): Promise<void> {
      if (!currentContactId) return;
      const container = adapter!.getMessageContainer();
      if (!container) {
        addLog('No message container found', 'warn');
        return;
      }
      const messages = adapter!.extractMessages(container);
      if (messages.length === 0) {
        addLog('No visible messages to scrape', 'info');
        return;
      }

      const response = (await browser.runtime.sendMessage({
        type: 'SCRAPE_MESSAGES',
        contactId: currentContactId,
        messages,
        source: 'dom',
      } satisfies ExtensionMessage)) as { ok: boolean; newCount?: number };

      const newCount = response?.newCount || 0;
      addLog(`Scraped ${messages.length} visible messages (${newCount} new)`, 'success');

      // Reconcile: mark ghost messages (deleted or never-sent) as unverified
      const reconcileRes = (await browser.runtime.sendMessage({
        type: 'RECONCILE_MESSAGES',
        contactId: currentContactId,
        scrapedMessages: messages,
      } satisfies ExtensionMessage)) as { ok: boolean; verified?: number; unverified?: number };

      if (reconcileRes?.unverified) {
        addLog(`Cleaned ${reconcileRes.unverified} ghost messages from context`, 'warn');
      }
    }

    async function startAutoScrape(): Promise<void> {
      if (!currentContactId || scrapeAbortController) return;
      scrapeAbortController = new AbortController();
      scrapedMessageCount = 0;
      scrapeDisplayCount = 0;
      isScraping = true;
      scrapeComplete = false;
      renderPopover();

      try {
        if (lsMessageBuffer.length > 0) {
          await sendScrapeBatch(lsMessageBuffer.splice(0));
        }

        let noNewCount = 0;
        for (let i = 0; i < 30; i++) {
          if (scrapeAbortController.signal.aborted) break;
          const hadMore = await adapter!.scrollToLoadMore();
          await new Promise((r) => setTimeout(r, 500));

          if (lsMessageBuffer.length > 0) {
            await sendScrapeBatch(lsMessageBuffer.splice(0));
            noNewCount = 0;
          } else if (!hadMore) {
            noNewCount++;
            if (noNewCount >= 3) break;
          }
          await new Promise((r) => setTimeout(r, 1500));
        }

        // Scroll back to bottom so we capture the latest messages
        await adapter!.scrollToBottom();
        const container = adapter!.getMessageContainer();
        if (container) {
          const domMessages = adapter!.extractMessages(container);
          if (domMessages.length > 0) await sendScrapeBatch(domMessages);
        }

        await browser.runtime.sendMessage({
          type: 'SCRAPE_COMPLETE',
          contactId: currentContactId!,
          totalMessages: scrapedMessageCount,
        } satisfies ExtensionMessage);

        isScraping = false;
        scrapeComplete = true;
        renderPopover();
        ctx.setTimeout(() => { scrapeComplete = false; renderPopover(); }, 3500);
      } catch (err) {
        console.error('[Replier] Scrape error:', err);
        await browser.runtime.sendMessage({
          type: 'SCRAPE_ERROR',
          contactId: currentContactId!,
          error: err instanceof Error ? err.message : 'Unknown error',
        } satisfies ExtensionMessage);
        isScraping = false;
        scrapeComplete = false;
        renderPopover();
      } finally {
        scrapeAbortController = null;
      }
    }

    async function sendScrapeBatch(messages: ExtractedMessage[]): Promise<void> {
      if (!currentContactId || messages.length === 0) return;
      const response = (await browser.runtime.sendMessage({
        type: 'SCRAPE_MESSAGES',
        contactId: currentContactId,
        messages,
        source: 'api',
      } satisfies ExtensionMessage)) as { ok: boolean; newCount?: number };

      if (response?.ok) {
        scrapedMessageCount += response.newCount ?? 0;
        scrapeDisplayCount += messages.length;
        if (isScraping) renderPopover();
      }
    }

    // =========================================================================
    // MESSAGE LISTENER (from service worker)
    // =========================================================================

    browser.runtime.onMessage.addListener(
      (
        message: ExtensionMessage,
        _sender: any,
        sendResponse: (response: any) => void,
      ) => {
        switch (message.type) {
          case 'REPLY_READY':
            if (message.contactId === currentContactId) {
              addLog('Reply generated successfully!', 'success');
              setStatus('ready', {
                text: message.text,
                id: message.replyId,
                tone: message.tone,
              });
              // Refresh context so "last seen message" is up-to-date
              fetchContactContext();
            }
            break;

          case 'REPLY_GENERATING':
            if (message.contactId === currentContactId) {
              const count = message.messageCount || 0;
              const summary = message.hasSummary ? 'yes' : 'no';
              addLog(`Sending ${count} messages to LLM (summary: ${summary})`, 'info');
              addLog('LLM is generating...', 'info');
              setStatus('generating');
            }
            break;

          case 'GENERATION_ERROR':
            if (message.contactId === currentContactId) {
              addLog(`Error: ${message.error}`, 'error');
              setStatus('error', { error: message.error });
            }
            break;

          case 'START_SCRAPE':
            if (message.contactId === currentContactId) {
              startAutoScrape();
            }
            break;

          case 'GET_POPOVER_VISIBILITY':
            sendResponse({ visible: popoverVisible });
            break;

          case 'SHOW_POPOVER':
            showPopover();
            sendResponse({ ok: true });
            break;
        }
      },
    );

    // =========================================================================
    // SPA NAVIGATION
    // =========================================================================

    ctx.addEventListener(
      window,
      'wxt:locationchange' as keyof WindowEventMap,
      (() => {
        if (!adapter.matchUrl(window.location.href)) return;
        // Reset all state for the new conversation
        currentContactId = null;
        currentContactName = '';
        currentContactUsername = '';
        contactContext = null;
        isNewContact = false;
        isScraping = false;
        scrapeComplete = false;
        scrapeDisplayCount = 0;
        hidePopover();
        lsMessageBuffer.length = 0;
        replyText = '';
        replyId = '';
        errorMessage = '';
        popoverStatus = 'idle';
        // Short initial delay — detectAndSetContact has its own retry loop
        ctx.setTimeout(detectAndSetContact, 200);
      }) as EventListener,
    );

    // Also detect thread clicks on the left panel.
    // Instagram doesn't always change the URL when switching threads,
    // so wxt:locationchange alone is unreliable. We listen for clicks
    // on the thread list and re-detect after a short delay.
    let lastDetectedUrl = '';
    function setupThreadClickListener(): void {
      const threadList = document.querySelector(
        'div[aria-label="Thread list"][role="navigation"], [data-pagelet="IGDInboxThreadListScrollableAreaPagelet"]',
      );
      if (threadList) {
        threadList.addEventListener('click', () => {
          // Debounce: only trigger if URL changed or enough time passed
          setTimeout(() => {
            const currentUrl = window.location.href;
            if (currentUrl !== lastDetectedUrl) {
              lastDetectedUrl = currentUrl;
              // Reset state for new conversation
              currentContactId = null;
              currentContactName = '';
              currentContactUsername = '';
              contactContext = null;
              isNewContact = false;
              isScraping = false;
              scrapeComplete = false;
              scrapeDisplayCount = 0;
              hidePopover();
              lsMessageBuffer.length = 0;
              replyText = '';
              replyId = '';
              errorMessage = '';
              popoverStatus = 'idle';
              detectAndSetContact();
            }
          }, 600);
        });
        console.log('[Replier] Thread list click listener attached');
      }
    }

    // Initial contact detection
    ctx.setTimeout(detectAndSetContact, 1000);
    // Attach thread click listener after a brief delay for DOM to be ready
    ctx.setTimeout(setupThreadClickListener, 2000);

    // Clean up
    ctx.onInvalidated(() => {
      messageObserver?.disconnect();
      scrapeAbortController?.abort();
      hidePopover();
    });
  },
});

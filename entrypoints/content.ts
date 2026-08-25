import '@/assets/styles/global.css';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { resolveAdapter } from '@/lib/platforms/registry';
import { getViewerId } from '@/lib/platforms/instagram/adapter';
import type { ExtractedMessage } from '@/types/platform';
import type { ExtensionMessage } from '@/lib/messaging/types';
import type { ToneType, CustomTone } from '@/types/contact';
import { formatHandle } from '@/lib/platforms/meta';
import type { PopoverStatus, LogEntry } from '@/components/StatusPopover';
import type { StoryReplyStatus } from '@/components/StoriesPanel';
import {
  getStoryTrayEntries,
  openStoryEntry,
  closeActiveStory,
  isStoryViewerOpen,
  isReplyAvailableOnOpenStory,
  getOpenStoryUsername,
  getReactedUsernames,
  markStoryReacted,
  type StoryTrayEntry,
} from '@/lib/platforms/instagram/stories';

export default defineContentScript({
  // Matches whole origins rather than the messaging paths, because Chrome only
  // evaluates content_scripts.matches at document-creation time — it does NOT
  // re-inject when an SPA router navigates into the inbox via history
  // .pushState. Without this, a user who opens instagram.com on the feed and
  // clicks into Messages never gets the content script until a hard refresh.
  // Actual functionality still only activates once resolveAdapter() below
  // matches the URL against a registered platform.
  matches: [
    'https://www.instagram.com/*',
    'https://web.whatsapp.com/*',
  ],
  cssInjectionMode: 'ui',

  async main(ctx) {
    let adapter = resolveAdapter(window.location.href);
    let interceptorInjected = false;
    let disposeConversationWatch: (() => void) | null = null;

    async function ensureInterceptorInjected(): Promise<void> {
      if (interceptorInjected || !adapter) return;
      // WhatsApp encrypts its traffic end-to-end over WebSocket, so there is
      // nothing readable to intercept — those adapters run DOM-only.
      if (!adapter.hasInterceptor) return;
      interceptorInjected = true;
      try {
        await injectScript(`/${adapter.name}-interceptor.js` as ScriptPublicPath, {
          keepInDom: true,
        });
        console.log('[Replier] Network interceptor injected');
      } catch {
        console.log('[Replier] No interceptor for this platform, using DOM-only');
      }
    }

    // =========================================================================
    // STATE
    // =========================================================================

    let currentContactId: string | null = null;
    let currentContactName: string = '';
    let currentContactUsername: string = '';
    /** Bumped per detection run so late-finishing runs can detect they lost. */
    let detectGeneration = 0;
    /** Conversation key we last ran detection for, to avoid redundant reruns. */
    let lastHandledKey: string | null = null;
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
      const viewerId = getViewerId();
      for (const msg of messages) {
        lsMessageBuffer.push({
          id: msg.messageId || `ls-${msg.timestamp}-${Math.random().toString(36).slice(2, 8)}`,
          sender: viewerId && msg.senderId && msg.senderId === viewerId ? 'user' : 'contact',
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
            platform: adapter?.name,
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
    // STORIES QUICK-NAV PANEL
    //
    // Surfaces unseen stories from the feed tray so the user can jump between
    // them quickly. It never reacts or replies on the user's behalf — opening
    // a story just dispatches the same click a real click would produce, and
    // the user reacts through Instagram's own UI. "Next unseen" is likewise
    // just navigation, not automated engagement.
    // =========================================================================

    const isInstagram = window.location.hostname.includes('instagram.com');

    let storyEntries: StoryTrayEntry[] = [];
    let activeStoryUsername: string | null = null;
    let storyReplyStatus: StoryReplyStatus = 'unknown';
    let storiesPanelDismissed = false;
    let storiesObserver: MutationObserver | null = null;
    let storiesScanDebounce: ReturnType<typeof setTimeout> | null = null;

    let storiesPanelRoot: ReturnType<typeof createRoot> | null = null;

    if (isInstagram) {
      const storiesPanelUi = await createShadowRootUi(ctx, {
        name: 'replier-stories',
        position: 'overlay',
        anchor: 'body',
        onMount: (container) => {
          container.style.fontSize = '16px';
          container.style.fontFamily =
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";
          container.style.lineHeight = '1.5';
          container.style.color = '#111827';
          if (!storiesPanelRoot) {
            storiesPanelRoot = createRoot(container);
          }
          renderStoriesPanel();
          return () => {};
        },
      });
      storiesPanelUi.mount();
    }

    function renderStoriesPanel(): void {
      if (!storiesPanelRoot) return;
      if (storiesPanelDismissed) {
        storiesPanelRoot.render(null);
        return;
      }
      import('@/components/StoriesPanel').then(({ StoriesPanel }) => {
        if (!storiesPanelRoot) return;
        storiesPanelRoot.render(
          createElement(StoriesPanel, {
            entries: storyEntries,
            activeUsername: activeStoryUsername,
            replyStatus: storyReplyStatus,
            onOpen: handleStoryOpen,
            onNext: handleStoryNext,
            onClose: () => {
              storiesPanelDismissed = true;
              renderStoriesPanel();
            },
          }),
        );
      });
    }

    async function scanStories(): Promise<void> {
      if (!isInstagram) return;
      const rawEntries = getStoryTrayEntries();
      const reacted = await getReactedUsernames();
      storyEntries = rawEntries.map((e) => ({ ...e, reacted: reacted.has(e.username) }));

      if (isStoryViewerOpen()) {
        activeStoryUsername = getOpenStoryUsername() || activeStoryUsername;
        storyReplyStatus = isReplyAvailableOnOpenStory() ? 'available' : 'unavailable';
      } else {
        activeStoryUsername = null;
        storyReplyStatus = 'unknown';
      }

      renderStoriesPanel();
    }

    // Fired by the interceptor whenever an outgoing thread broadcast (DM
    // text, story reply, or quick emoji reaction) succeeds. Only counts as
    // a story reaction when the story viewer is open at the same moment —
    // a plain DM send never has the viewer dialog open, so this doesn't
    // false-positive on ordinary messaging.
    window.addEventListener('replier:broadcast-sent', (() => {
      if (!isInstagram || !isStoryViewerOpen() || !activeStoryUsername) return;
      const username = activeStoryUsername;
      markStoryReacted(username).then(() => {
        storyEntries = storyEntries.map((e) =>
          e.username === username ? { ...e, reacted: true } : e,
        );
        renderStoriesPanel();
      });
    }) as EventListener);

    function handleStoryOpen(entry: StoryTrayEntry): void {
      openStoryEntry(entry);
      // Give the viewer dialog a moment to mount before re-scanning.
      ctx.setTimeout(scanStories, 400);
    }

    function handleStoryNext(): void {
      const justClosedUsername = activeStoryUsername;
      closeActiveStory();
      ctx.setTimeout(async () => {
        const rawEntries = getStoryTrayEntries();
        const reacted = await getReactedUsernames();
        storyEntries = rawEntries.map((e) => ({ ...e, reacted: reacted.has(e.username) }));
        const next = storyEntries.find(
          (e) => !e.reacted && e.username !== justClosedUsername,
        );
        if (next) {
          openStoryEntry(next);
          ctx.setTimeout(scanStories, 400);
        } else {
          activeStoryUsername = null;
          storyReplyStatus = 'unknown';
          renderStoriesPanel();
        }
      }, 300);
    }

    function attachStoriesObserver(): void {
      if (!isInstagram || storiesObserver) return;
      storiesObserver = new MutationObserver(() => {
        if (storiesScanDebounce) clearTimeout(storiesScanDebounce);
        storiesScanDebounce = setTimeout(scanStories, 1200);
      });
      storiesObserver.observe(document.body, { childList: true, subtree: true });
      ctx.setTimeout(scanStories, 1500);
    }

    attachStoriesObserver();

    // =========================================================================
    // CONTACT DETECTION + AUTO-GENERATION
    // =========================================================================

    async function detectAndSetContact(): Promise<void> {
      if (!adapter) return;

      // Detection spans several awaits, and the user can switch chats midway
      // through — especially on WhatsApp, where clicking down the sidebar
      // changes conversation with no page navigation to slow them down. Stamp
      // each run so a newer one supersedes any still in flight; without this,
      // a stale run finishing late would attach the previous contact's
      // messages to the chat now on screen.
      const gen = ++detectGeneration;
      const isStale = () => gen !== detectGeneration;

      const startKey = adapter.getConversationKey();
      if (startKey) lastHandledKey = startKey;

      addLog('Detecting contact...', 'info');
      showPopover();
      setStatus('detecting');

      // Poll until identity settles on the SAME value twice in a row, not just
      // until it's non-null. WhatsApp resolves a saved contact's name
      // asynchronously — the header can briefly show the raw phone number
      // first — and the header title IS our identity key (getCurrentContactInfo
      // and getConversationKey both read it, and background.ts looks up the
      // contact by it). Accepting the first non-null read risks catching that
      // placeholder, which creates a SECOND contact record for the same
      // person the moment the real name loads. That record starts with
      // historyScrubbed=false, so every future visit that also catches the
      // placeholder re-triggers a full history scrape from scratch — this is
      // the likely cause of "it rescrapes the whole chat every time I open it."
      let contactInfo = adapter.getCurrentContactInfo();
      let stableReads = contactInfo ? 1 : 0;
      for (let attempt = 0; attempt < 12 && stableReads < 2; attempt++) {
        await new Promise((r) => setTimeout(r, 250));
        if (isStale()) return;
        const next = adapter.getCurrentContactInfo();
        stableReads =
          next && contactInfo && next.platformUserId === contactInfo.platformUserId
            ? stableReads + 1
            : next
              ? 1
              : 0;
        contactInfo = next;
      }
      if (!contactInfo || stableReads < 2) {
        contactInfo = null;
      }
      if (!contactInfo) {
        // No conversation open at all is the normal resting state on WhatsApp,
        // whose adapter matches the whole origin including the "no chat
        // selected" screen. Sit quietly rather than leaving the popover
        // spinning on 'detecting' until the user picks a chat.
        if (!adapter.getConversationKey()) {
          setStatus('idle');
          hidePopover();
          return;
        }
        addLog('Could not detect contact after 10 retries', 'error');
        showPopover();
        return;
      }

      // The conversation may have settled on a different chat than the one we
      // started with; record what we actually resolved.
      lastHandledKey = adapter.getConversationKey() ?? lastHandledKey;

      const threadId = adapter.getThreadId?.() || undefined;

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

      if (isStale()) return;

      if (response?.ok && response.contact) {
        currentContactId = response.contact.id;
        currentContactName = contactInfo.name;
        currentContactUsername = contactInfo.platformUserId;
        isNewConversation = false;
        const handle = formatHandle(adapter.name, contactInfo.platformUserId);
        addLog(`Contact detected: ${handle}${response.isNew ? ' (new)' : ''}`, 'success');

        // Show inline new contact banner
        if (response.isNew) {
          isNewContact = true;
        }

        // Ensure we're actually at the bottom before scraping. This is a
        // no-op almost every time (WhatsApp/Instagram already open a chat
        // scrolled to the bottom) — it only does real work on the rare
        // occasion our own fast detection retry caught the DOM before the
        // app's own scroll had settled, which is exactly when the latest
        // message would otherwise be missed.
        await adapter.scrollToBottom();
        if (isStale()) return;

        // Re-attach message observer AFTER settling on the bottom, so its
        // baseline reflects what's actually on screen now.
        attachMessageObserver();

        // Scrape visible DOM messages
        await scrapeVisibleMessages();
        if (isStale()) return;

        // Fetch context for the memory panel
        fetchContactContext();

        // Show the popover and resolve the current status
        showPopover();
        await resolveContactStatus();
        if (isStale()) return;

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
        freshStart: isNewConversation || undefined,
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
        freshStart: isNewConversation || undefined,
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

      // The live observer and this function both react to DOM mutations, and
      // scrolling up through history is itself a wall of mutations — older
      // messages appearing in the DOM for the first time look identical to a
      // genuinely new incoming message to the observer's identity-diffing.
      // Left running, it fires NEW_MESSAGE for a screen's worth of history on
      // every scroll step (wasted, duplicate work), and — because NEW_MESSAGE
      // can trigger auto-generation for active contacts — risks generating a
      // reply to something the contact said days ago. Disconnect for the
      // duration and reattach once we're back at the bottom with a baseline
      // that reflects the settled DOM, not the mid-scroll one.
      messageObserver?.disconnect();
      messageObserver = null;

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
        // Reattach with a fresh baseline now that we've settled back at the
        // bottom — whether the scrape succeeded, failed, or was cancelled.
        if (currentContactId) attachMessageObserver();
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

    /**
     * Clear all per-conversation state so the next contact starts clean.
     * Anything scoped to a single chat must be reset here — leaking a reply or
     * a contact ID across a switch would attribute one person's message to
     * another.
     */
    function resetConversationState(): void {
      currentContactId = null;
      currentContactName = '';
      currentContactUsername = '';
      contactContext = null;
      isNewContact = false;
      isNewConversation = false;
      lastHandledKey = null;
      isScraping = false;
      scrapeComplete = false;
      scrapeDisplayCount = 0;
      lsMessageBuffer.length = 0;
      replyText = '';
      replyId = '';
      errorMessage = '';
      popoverStatus = 'idle';
      messageObserver?.disconnect();
      messageObserver = null;
      scrapeAbortController?.abort();
      hidePopover();
    }

    /**
     * Watch for the user switching to a different conversation.
     *
     * The adapter owns this because the signal differs per platform:
     * Instagram usually changes the URL, WhatsApp Web never does. Re-attached
     * on every activation so the watcher always closes over the live adapter.
     */
    function attachConversationWatch(): void {
      disposeConversationWatch?.();
      disposeConversationWatch = adapter?.observeConversationChange(() => {
        // The watcher fires on any key change, including the DOM settling
        // into the chat we are already showing. Only act on a genuinely
        // different conversation.
        const key = adapter?.getConversationKey() ?? null;
        if (key !== null && key === lastHandledKey) return;
        resetConversationState();
        detectAndSetContact();
      }) ?? null;
    }

    function activate(): void {
      console.log(`[Replier] Loaded ${adapter!.name} adapter`);
      attachConversationWatch();
      // Short initial delay — detectAndSetContact has its own retry loop
      ensureInterceptorInjected().then(() => {
        ctx.setTimeout(detectAndSetContact, 200);
      });
    }

    ctx.addEventListener(
      window,
      'wxt:locationchange' as keyof WindowEventMap,
      (() => {
        // Re-resolve on every navigation — the page may be entering or leaving
        // a messaging route for the first time in this document's lifetime
        // (matches is the whole origin; see comment on `matches` above).
        const newAdapter = resolveAdapter(window.location.href);
        if (!newAdapter) {
          if (adapter) {
            adapter = null;
            disposeConversationWatch?.();
            disposeConversationWatch = null;
            lastHandledKey = null;
            resetConversationState();
          }
          return;
        }

        // Already running: this is a move between conversations, which the
        // conversation watcher owns. Handling it here too would run detection
        // twice for one switch — and on Instagram, where the URL does change,
        // that means two DETECT_CONTACT round-trips and two generations.
        if (adapter) return;

        adapter = newAdapter;
        resetConversationState();
        activate();
      }) as EventListener,
    );

    // If the document already loaded on a messaging route, activate
    // immediately. Otherwise wait for the wxt:locationchange handler above,
    // which fires once the user SPA-navigates into the inbox.
    if (adapter) {
      await ensureInterceptorInjected();
      console.log(`[Replier] Loaded ${adapter.name} adapter`);
      attachConversationWatch();
      ctx.setTimeout(detectAndSetContact, 1000);
    } else {
      console.log('[Replier] Waiting for navigation into a supported inbox');
    }

    // Clean up
    ctx.onInvalidated(() => {
      disposeConversationWatch?.();
      messageObserver?.disconnect();
      scrapeAbortController?.abort();
      storiesObserver?.disconnect();
      if (storiesScanDebounce) clearTimeout(storiesScanDebounce);
      hidePopover();
    });
  },
});

import '@/assets/styles/global.css';
import { createRoot } from 'react-dom/client';
import { resolveAdapter } from '@/lib/platforms/registry';
import type { PlatformAdapter, ExtractedMessage } from '@/types/platform';
import type { ExtensionMessage } from '@/lib/messaging/types';

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

    // Inject network interceptor for richer data capture
    try {
      await injectScript(`/${adapter.name}-interceptor.js` as ScriptPublicPath, {
        keepInDom: true,
      });
      console.log('[Replier] Network interceptor injected');
    } catch {
      console.log('[Replier] No interceptor for this platform, using DOM-only');
    }

    // Track current contact
    let currentContactId: string | null = null;

    // Listen for intercepted API responses
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

    // Detect current contact
    async function detectAndSetContact(): Promise<void> {
      const contactInfo = adapter!.getCurrentContactInfo();
      if (!contactInfo) return;

      const response = (await browser.runtime.sendMessage({
        type: 'DETECT_CONTACT',
        platform: adapter!.name,
        platformUserId: contactInfo.platformUserId,
        name: contactInfo.name,
      } satisfies ExtensionMessage)) as { ok: boolean; contact?: { id: string } };

      if (response?.ok && response.contact) {
        currentContactId = response.contact.id;
        console.log('[Replier] Current contact:', currentContactId);
        checkForPendingReply();
      }
    }

    // Check for pre-generated reply when opening a chat
    async function checkForPendingReply(): Promise<void> {
      if (!currentContactId) return;

      const response = (await browser.runtime.sendMessage({
        type: 'GET_PENDING_REPLY',
        contactId: currentContactId,
      } satisfies ExtensionMessage)) as {
        ok: boolean;
        reply?: { id: string; replyText: string; tone: string } | null;
      };

      if (response?.ok && response.reply) {
        showPopover(response.reply.replyText, response.reply.id, response.reply.tone);
      }
    }

    // Process a new incoming message
    async function processNewMessage(msg: ExtractedMessage): Promise<void> {
      if (!currentContactId) return;

      await browser.runtime.sendMessage({
        type: 'NEW_MESSAGE',
        contactId: currentContactId,
        message: msg,
      } satisfies ExtensionMessage);
    }

    // Start MutationObserver for DOM-based message detection
    const observer = adapter.observeNewMessages((msg) => {
      processNewMessage(msg);
    });

    // Create the popover UI via WXT Shadow DOM
    let popoverRoot: ReturnType<typeof createRoot> | null = null;
    let currentPopoverState: {
      text: string;
      replyId: string;
      tone: string;
    } | null = null;

    const ui = await createShadowRootUi(ctx, {
      name: 'replier-popover',
      position: 'overlay',
      anchor: () => adapter.getPopoverAnchorElement()!,
      onMount: (container, shadow) => {
        // Import React lazily to keep initial load fast
        const root = createRoot(container);
        popoverRoot = root;
        renderPopover(root, shadow);
        return () => root.unmount();
      },
    });

    function renderPopover(
      root: ReturnType<typeof createRoot>,
      shadow: ShadowRoot,
    ): void {
      // Dynamic import for React component to keep content script lean
      import('@/components/ReplyPopover').then(({ ReplyPopover }) => {
        root.render(
          ReplyPopover({
            state: currentPopoverState,
            onSend: handleSend,
            onRedo: handleRedo,
            onToneChange: handleToneChange,
            onDismiss: handleDismiss,
            onEdit: handleEdit,
          }),
        );
      });
    }

    function showPopover(text: string, replyId: string, tone: string): void {
      currentPopoverState = { text, replyId, tone };
      ui.mount();
      if (popoverRoot) {
        import('@/components/ReplyPopover').then(({ ReplyPopover }) => {
          popoverRoot!.render(
            ReplyPopover({
              state: currentPopoverState,
              onSend: handleSend,
              onRedo: handleRedo,
              onToneChange: handleToneChange,
              onDismiss: handleDismiss,
              onEdit: handleEdit,
            }),
          );
        });
      }
    }

    function hidePopover(): void {
      currentPopoverState = null;
      ui.remove();
    }

    async function handleSend(text: string, replyId: string): Promise<void> {
      adapter!.insertTextIntoInput(text);
      await browser.runtime.sendMessage({
        type: 'ACCEPT_REPLY',
        replyId,
        editedText: text,
      } satisfies ExtensionMessage);
      hidePopover();
    }

    async function handleRedo(): Promise<void> {
      if (!currentContactId || !currentPopoverState) return;
      await browser.runtime.sendMessage({
        type: 'GENERATE_REPLY',
        contactId: currentContactId,
        tone: currentPopoverState.tone as import('@/types/contact').ToneType,
      } satisfies ExtensionMessage);
    }

    async function handleToneChange(tone: string): Promise<void> {
      if (!currentContactId) return;
      await browser.runtime.sendMessage({
        type: 'GENERATE_REPLY',
        contactId: currentContactId,
        tone: tone as import('@/types/contact').ToneType,
      } satisfies ExtensionMessage);
    }

    function handleDismiss(): void {
      if (currentPopoverState) {
        browser.runtime.sendMessage({
          type: 'DISCARD_REPLY',
          replyId: currentPopoverState.replyId,
        } satisfies ExtensionMessage);
      }
      hidePopover();
    }

    function handleEdit(text: string): void {
      if (currentPopoverState) {
        currentPopoverState = { ...currentPopoverState, text };
      }
    }

    // Listen for messages from service worker
    browser.runtime.onMessage.addListener((message: ExtensionMessage) => {
      switch (message.type) {
        case 'REPLY_READY':
          if (message.contactId === currentContactId) {
            showPopover(message.text, message.replyId, message.tone);
          }
          break;
        case 'REPLY_GENERATING':
          if (message.contactId === currentContactId) {
            // Show loading state in popover
            currentPopoverState = {
              text: '',
              replyId: '',
              tone: currentPopoverState?.tone || 'default',
            };
            ui.mount();
          }
          break;
        case 'GENERATION_ERROR':
          if (message.contactId === currentContactId) {
            console.error('[Replier] Generation error:', message.error);
            hidePopover();
          }
          break;
      }
    });

    // Handle SPA navigation (Instagram changes chats without page reload)
    ctx.addEventListener(
      window,
      'wxt:locationchange' as keyof WindowEventMap,
      (() => {
        if (!adapter.matchUrl(window.location.href)) return;
        // Re-detect contact when URL changes
        hidePopover();
        ctx.setTimeout(detectAndSetContact, 500);
      }) as EventListener,
    );

    // Initial contact detection
    ctx.setTimeout(detectAndSetContact, 1000);

    // Clean up on extension invalidation
    ctx.onInvalidated(() => {
      observer.disconnect();
      hidePopover();
    });
  },
});

export type Platform =
  | 'instagram'
  | 'whatsapp'
  | 'messenger'
  | 'twitter'
  | 'linkedin';

export interface ExtractedMessage {
  id: string;
  sender: 'user' | 'contact';
  content: string;
  contentType: MessageContentType;
  timestamp: number;
  rawData?: unknown;
  /** CDN URL for image messages — used for vision AI */
  mediaUrl?: string;
}

export type MessageContentType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'story_reply'
  | 'link';

export interface ContactInfo {
  name: string;
  platformUserId: string;
  threadId?: string;
  avatarUrl?: string;
  numericUserId?: string;
}

/**
 * Presentation and vocabulary differences between platforms, used to keep
 * UI copy and LLM prompts from hardcoding "Instagram".
 */
export interface PlatformMeta {
  /** Human-readable platform name, e.g. "Instagram" */
  readonly label: string;
  /** What a conversation is called here, e.g. "DM" / "chat" */
  readonly conversationNoun: string;
  /** What ephemeral posts are called here, e.g. "story" / "status" */
  readonly storyNoun: string;
  /**
   * How a contact is addressed. Instagram has public @handles; WhatsApp
   * identifies people by phone number, so the UI must not render "@".
   */
  readonly handleStyle: 'username' | 'phone';
  /** Where to point the user when no conversation is open */
  readonly openConversationHint: string;
}

export interface PlatformAdapter {
  readonly name: Platform;
  readonly meta: PlatformMeta;

  /**
   * Whether a `<name>-interceptor.js` script exists for this platform.
   * WhatsApp encrypts its traffic end-to-end over WebSocket, so there is
   * nothing useful to intercept — those platforms are DOM-only.
   */
  readonly hasInterceptor: boolean;

  // Detection
  matchUrl(url: string): boolean;

  // Message extraction (DOM-based)
  getMessageContainer(): HTMLElement | null;
  extractMessages(container: HTMLElement): ExtractedMessage[];
  getCurrentContactInfo(): ContactInfo | null;

  // Real-time observation
  observeNewMessages(
    callback: (msg: ExtractedMessage) => void,
  ): MutationObserver;

  /**
   * Fire `callback` whenever the user switches to a different conversation.
   *
   * This cannot be driven by URL changes alone. Instagram usually updates the
   * path but not always when switching threads via the sidebar, and WhatsApp
   * Web never changes its URL at all — the whole app lives at /. Each adapter
   * therefore decides what "the conversation changed" means for its own DOM.
   *
   * Returns a disposer that detaches the observation.
   */
  observeConversationChange(callback: () => void): () => void;

  /**
   * A value that changes when — and only when — the open conversation changes.
   * Used to debounce `observeConversationChange` against unrelated DOM churn
   * such as incoming messages or typing indicators.
   */
  getConversationKey(): string | null;

  // Network interception (richer data source)
  getInterceptPatterns(): string[];
  parseInterceptedResponse(
    url: string,
    body: unknown,
  ): ExtractedMessage[] | null;

  // History scraping
  scrollToLoadMore(): Promise<boolean>;
  scrollToBottom(): Promise<void>;

  // Input interaction
  getInputBox(): HTMLElement | null;
  insertTextIntoInput(text: string): void;
  getPopoverAnchorElement(): HTMLElement | null;

  // Auto-pilot (optional — platform-specific)
  getThreadId?(): string | null;
  triggerSend?(): void;
  hasUserDraft?(): boolean;

  // Health check
  healthCheck(): { ok: boolean; issues: string[] };
}

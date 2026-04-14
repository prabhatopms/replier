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
}

export interface PlatformAdapter {
  readonly name: Platform;

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

  // Network interception (richer data source)
  getInterceptPatterns(): string[];
  parseInterceptedResponse(
    url: string,
    body: unknown,
  ): ExtractedMessage[] | null;

  // History scraping
  scrollToLoadMore(): Promise<boolean>;

  // Input interaction
  getInputBox(): HTMLElement | null;
  insertTextIntoInput(text: string): void;
  getPopoverAnchorElement(): HTMLElement | null;

  // Health check
  healthCheck(): { ok: boolean; issues: string[] };
}

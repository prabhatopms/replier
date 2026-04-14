import type { ToneType } from '@/types/contact';

interface QueueItem {
  contactId: string;
  triggerMessageId: string;
  tone: ToneType;
  priority: number; // higher = more urgent
  addedAt: number;
}

/**
 * Priority queue for reply generation.
 * Most recently active conversations are generated first.
 */
class GenerationQueue {
  private items: QueueItem[] = [];
  private processing = false;
  private onProcess: ((item: QueueItem) => Promise<void>) | null = null;

  setProcessor(fn: (item: QueueItem) => Promise<void>): void {
    this.onProcess = fn;
  }

  enqueue(item: Omit<QueueItem, 'priority' | 'addedAt'>): void {
    // Remove any existing item for the same contact
    this.items = this.items.filter((i) => i.contactId !== item.contactId);

    this.items.push({
      ...item,
      priority: Date.now(), // newest = highest priority
      addedAt: Date.now(),
    });

    // Sort by priority descending (newest first)
    this.items.sort((a, b) => b.priority - a.priority);

    this.processNext();
  }

  private async processNext(): Promise<void> {
    if (this.processing || this.items.length === 0 || !this.onProcess) return;

    this.processing = true;
    const item = this.items.shift()!;

    try {
      await this.onProcess(item);
    } catch (error) {
      console.error('[Replier] Queue processing error:', error);
    } finally {
      this.processing = false;
      // Process next item if any
      if (this.items.length > 0) {
        this.processNext();
      }
    }
  }

  clear(): void {
    this.items = [];
  }

  get size(): number {
    return this.items.length;
  }
}

export const generationQueue = new GenerationQueue();
export type { QueueItem };

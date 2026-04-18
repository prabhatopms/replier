import { useState, useEffect } from 'react';
import { ArrowLeft, Trash2 } from 'lucide-react';
import type { Message } from '@/types/message';
import type { Contact } from '@/types/contact';
import type { ExtensionMessage } from '@/lib/messaging/types';
import { Button } from '@/components/ui/button';

interface ConversationViewProps {
  contactId: string;
  onBack: () => void;
}

export function ConversationView({ contactId, onBack }: ConversationViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    loadData();
  }, [contactId]);

  async function loadData() {
    setLoading(true);
    try {
      const [contactRes, messagesRes] = await Promise.all([
        browser.runtime.sendMessage({
          type: 'GET_CONTACT',
          contactId,
        } satisfies ExtensionMessage) as Promise<{ ok: boolean; contact?: Contact | null }>,
        browser.runtime.sendMessage({
          type: 'GET_CONVERSATION',
          contactId,
          limit: 200,
        } satisfies ExtensionMessage) as Promise<{ ok: boolean; messages?: Message[] }>,
      ]);

      if (contactRes?.ok && contactRes.contact) setContact(contactRes.contact);
      if (messagesRes?.ok && messagesRes.messages) setMessages(messagesRes.messages);
    } finally {
      setLoading(false);
    }
  }

  async function handleClear() {
    if (!confirm('Clear all stored messages for this contact? The extension will rescrape from Instagram next time you open their chat.')) return;
    setClearing(true);
    await browser.runtime.sendMessage({
      type: 'CLEAR_HISTORY',
      contactId,
    } satisfies ExtensionMessage);
    setMessages([]);
    setClearing(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-2">
          <div className="w-5 h-5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          <span className="text-xs text-gray-400">Loading conversation...</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <Button variant="ghost" size="icon" onClick={onBack} className="text-gray-500 -ml-1 shrink-0">
          <ArrowLeft size={16} />
        </Button>
        <h2 className="text-sm font-semibold text-gray-900 flex-1 truncate">
          {contact?.displayName || 'Conversation'}
        </h2>
        <span className="text-xs text-gray-400 shrink-0">{messages.length} msgs</span>
        <Button
          variant="outline"
          size="xs"
          onClick={handleClear}
          disabled={clearing}
          className="shrink-0 text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 gap-1"
        >
          <Trash2 size={11} />
          {clearing ? 'Clearing...' : 'Clear'}
        </Button>
      </div>

      {/* Context Summary */}
      {contact?.conversationSummary && (
        <div className="mb-5 px-4 py-4 bg-indigo-50 rounded-xl border border-indigo-100">
          <h4 className="text-[10px] font-semibold text-indigo-500 uppercase tracking-wider mb-1.5">
            Context Summary
          </h4>
          <p className="text-xs text-indigo-900 leading-relaxed whitespace-pre-wrap">
            {contact.conversationSummary}
          </p>
        </div>
      )}

      {/* Messages */}
      {messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-500 mb-1">No messages stored yet</p>
          <p className="text-xs text-gray-400 max-w-48 leading-relaxed">
            Messages will appear here as the extension captures them.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`
                  max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-relaxed
                  ${msg.sender === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-sm'
                    : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm'
                  }
                `}
              >
                <p className="whitespace-pre-wrap wrap-break-word">
                  {msg.contentType === 'text' ? msg.content : `[${msg.contentType}]`}
                </p>
                <span
                  className={`block text-[10px] mt-1 ${
                    msg.sender === 'user' ? 'text-indigo-200' : 'text-gray-400'
                  }`}
                >
                  {new Date(msg.timestamp).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

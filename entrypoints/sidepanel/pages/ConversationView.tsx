import { useState, useEffect } from 'react';
import type { Message } from '@/types/message';
import type { Contact } from '@/types/contact';
import type { ExtensionMessage } from '@/lib/messaging/types';

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
        } satisfies ExtensionMessage) as Promise<{
          ok: boolean;
          contact?: Contact | null;
        }>,
        browser.runtime.sendMessage({
          type: 'GET_CONVERSATION',
          contactId,
          limit: 200,
        } satisfies ExtensionMessage) as Promise<{
          ok: boolean;
          messages?: Message[];
        }>,
      ]);

      if (contactRes?.ok && contactRes.contact) {
        setContact(contactRes.contact);
      }
      if (messagesRes?.ok && messagesRes.messages) {
        setMessages(messagesRes.messages);
      }
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="text-sm text-gray-400 py-8 text-center">
        Loading conversation...
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={onBack}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          &larr; Back
        </button>
        <h2 className="text-base font-semibold text-gray-900 flex-1">
          {contact?.displayName || 'Conversation'}
        </h2>
        <span className="text-xs text-gray-400">
          {messages.length} msgs
        </span>
        <button
          onClick={async () => {
            if (!confirm('Clear all stored messages for this contact? The extension will rescrape from Instagram next time you open their chat.')) return;
            setClearing(true);
            await browser.runtime.sendMessage({
              type: 'CLEAR_HISTORY',
              contactId,
            } satisfies ExtensionMessage);
            setMessages([]);
            setClearing(false);
          }}
          disabled={clearing}
          className="
            px-2.5 py-1.5 text-[11px] font-medium
            text-red-600 bg-red-50 hover:bg-red-100
            rounded-lg transition-colors border border-red-200
            disabled:opacity-50
          "
        >
          {clearing ? 'Clearing...' : 'Clear & Rescrape'}
        </button>
      </div>

      {/* Conversation Summary */}
      {contact?.conversationSummary && (
        <div className="mb-4 p-3 bg-indigo-50 rounded-lg border border-indigo-100">
          <h4 className="text-xs font-semibold text-indigo-700 mb-1 uppercase tracking-wider">
            Context Summary
          </h4>
          <p className="text-xs text-indigo-900 leading-relaxed whitespace-pre-wrap">
            {contact.conversationSummary}
          </p>
        </div>
      )}

      {/* Messages */}
      {messages.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400 text-sm">No messages stored yet.</p>
          <p className="text-gray-400 text-xs mt-1">
            Messages will appear here as the extension captures them.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`
                  max-w-[80%] px-3 py-2 rounded-2xl text-sm
                  ${
                    msg.sender === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-md'
                      : 'bg-gray-100 text-gray-800 rounded-bl-md'
                  }
                `}
              >
                <p className="whitespace-pre-wrap break-words">
                  {msg.contentType === 'text'
                    ? msg.content
                    : `[${msg.contentType}]`}
                </p>
                <span
                  className={`
                    block text-[10px] mt-1
                    ${msg.sender === 'user' ? 'text-indigo-200' : 'text-gray-400'}
                  `}
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

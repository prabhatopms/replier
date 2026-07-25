import { useState, useEffect } from 'react';
import type { Message } from '@/types/message';
import type { Contact } from '@/types/contact';
import type { ExtensionMessage } from '@/lib/messaging/types';

interface ConversationViewProps {
  contactId: string;
  onBack: () => void;
}

const F = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
const T = {
  body: '#18181f',
  bodyMid: '#3a3a45',
  bodyLight: '#5a5a66',
  muted: '#8a8a99',
  labelMuted: '#a0a0ad',
  white: '#ffffff',
  surfaceAlt: '#fafafc',
  divider: '#f1f1f4',
  border: '#e7e7ee',
  indigo: '#4f46e5',
  indigoLight: '#6366f1',
  indigoBg: '#eef0ff',
  outgoingBg: '#eef0ff',
  outgoingText: '#3730a3',
  incomingBg: '#f3f3f7',
  incomingText: '#2a2a33',
};

export function ConversationView({ contactId, onBack }: ConversationViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  useEffect(() => { loadData(); }, [contactId]);

  async function loadData() {
    setLoading(true);
    try {
      const [contactRes, messagesRes] = await Promise.all([
        browser.runtime.sendMessage({ type: 'GET_CONTACT', contactId } satisfies ExtensionMessage) as Promise<{ ok: boolean; contact?: Contact | null }>,
        browser.runtime.sendMessage({ type: 'GET_CONVERSATION', contactId, limit: 200 } satisfies ExtensionMessage) as Promise<{ ok: boolean; messages?: Message[] }>,
      ]);
      if (contactRes?.ok && contactRes.contact) setContact(contactRes.contact);
      if (messagesRes?.ok && messagesRes.messages) setMessages(messagesRes.messages);
    } finally {
      setLoading(false);
    }
  }

  async function handleClear() {
    if (!confirm('Clear all stored messages for this contact? The extension will rescrape next time you open their chat.')) return;
    setClearing(true);
    await browser.runtime.sendMessage({ type: 'CLEAR_HISTORY', contactId } satisfies ExtensionMessage);
    setMessages([]);
    setClearing(false);
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 0', fontFamily: F }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${T.indigo}`, borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
          <span style={{ fontSize: 11.5, color: T.muted }}>Loading…</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: F, color: T.body }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <button
          onClick={onBack}
          style={{
            width: 28, height: 28, display: 'inline-flex', alignItems: 'center',
            justifyContent: 'center', borderRadius: 8, border: `1px solid ${T.border}`,
            background: T.white, cursor: 'pointer', color: T.bodyLight, fontSize: 14, flexShrink: 0,
          }}
        >
          ←
        </button>
        <span style={{ fontSize: 14, fontWeight: 700, color: T.body, letterSpacing: '-.01em', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {contact?.displayName || 'Conversation'}
        </span>
        <span style={{ fontSize: 10.5, color: T.muted, flexShrink: 0 }}>{messages.length} msgs</span>
        <button
          onClick={handleClear}
          disabled={clearing}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '4px 9px', borderRadius: 7, flexShrink: 0,
            border: '1px solid #fecdd3', background: '#fff5f5',
            color: '#ef4444', fontSize: 11, fontWeight: 600,
            cursor: clearing ? 'not-allowed' : 'pointer', opacity: clearing ? 0.6 : 1,
            fontFamily: F,
          }}
          onMouseEnter={(e) => { if (!clearing) e.currentTarget.style.background = '#fee2e2'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#fff5f5'; }}
        >
          🗑 {clearing ? 'Clearing…' : 'Clear'}
        </button>
      </div>

      {/* Context summary */}
      {contact?.conversationSummary && contact.conversationSummary !== 'No summary yet' && (
        <div style={{
          background: T.indigoBg, border: '1px solid #c7d2fe',
          borderRadius: 11, padding: '10px 13px', marginBottom: 12,
        }}>
          <div style={{
            fontSize: 9.5, fontWeight: 700, letterSpacing: '.07em',
            textTransform: 'uppercase', color: T.indigoLight, marginBottom: 6,
          }}>
            Context Summary
          </div>
          <p style={{ fontSize: 11.5, color: '#3730a3', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0 }}>
            {contact.conversationSummary}
          </p>
        </div>
      )}

      {/* Empty state */}
      {messages.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0', textAlign: 'center' }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%', background: T.surfaceAlt,
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="1.6">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.bodyLight, marginBottom: 4 }}>No messages stored yet</div>
          <div style={{ fontSize: 11, color: T.muted, maxWidth: 190, lineHeight: 1.5 }}>
            Messages will appear here as the extension captures them.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {messages.map((msg) => {
            const isUser = msg.sender === 'user';
            const time = new Date(msg.timestamp).toLocaleString(undefined, {
              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
            });
            return (
              <div
                key={msg.id}
                style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}
              >
                <div style={{
                  maxWidth: '80%',
                  background: isUser ? T.indigo : T.incomingBg,
                  color: isUser ? T.white : T.incomingText,
                  padding: '8px 12px',
                  borderRadius: 14,
                  borderBottomRightRadius: isUser ? 4 : 14,
                  borderBottomLeftRadius: isUser ? 14 : 4,
                  fontSize: 12.5,
                  lineHeight: 1.45,
                  boxShadow: isUser ? '0 2px 8px rgba(79,70,229,.2)' : 'none',
                }}>
                  <p style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {msg.contentType === 'text' ? msg.content : `[${msg.contentType}]`}
                  </p>
                  <span style={{
                    display: 'block', fontSize: 9.5, marginTop: 4,
                    color: isUser ? 'rgba(255,255,255,.55)' : T.muted,
                  }}>
                    {time}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

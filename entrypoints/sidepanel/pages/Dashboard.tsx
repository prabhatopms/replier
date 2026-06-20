import { useState, useEffect } from 'react';
import type { Contact } from '@/types/contact';
import { GOAL_LABELS, getToneDisplayName } from '@/types/contact';
import type { ExtensionMessage } from '@/lib/messaging/types';

interface DashboardProps {
  onEditContact: (contactId: string) => void;
  onViewConversation: (contactId: string) => void;
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
  greenDot: '#16a34a',
  greenBg: '#f0fdf4',
};

function getInitials(name: string): string {
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function avatarColor(name: string): string {
  const colors = [
    ['#eef0ff', '#4f46e5'],
    ['#fdf4ff', '#9333ea'],
    ['#fff7ed', '#ea580c'],
    ['#f0fdf4', '#16a34a'],
    ['#fef9c3', '#ca8a04'],
    ['#fdf2f8', '#db2777'],
  ];
  const idx = name.charCodeAt(0) % colors.length;
  return colors[idx][0] + '|' + colors[idx][1];
}

export function Dashboard({ onEditContact, onViewConversation }: DashboardProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadContacts(); }, []);

  async function loadContacts() {
    try {
      const response = (await browser.runtime.sendMessage({
        type: 'GET_ALL_CONTACTS',
      } satisfies ExtensionMessage)) as { ok: boolean; contacts?: Contact[] };
      if (response?.ok && response.contacts) setContacts(response.contacts);
    } catch (err) {
      console.error('Failed to load contacts:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(contactId: string) {
    if (!confirm('Delete this contact and all conversation history?')) return;
    await browser.runtime.sendMessage({ type: 'DELETE_CONTACT', contactId } satisfies ExtensionMessage);
    setContacts((prev) => prev.filter((c) => c.id !== contactId));
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

      {/* Empty state */}
      {contacts.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '56px 0', textAlign: 'center' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: T.indigoBg, display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 12,
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={T.indigo} strokeWidth="1.8">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.bodyMid, marginBottom: 5 }}>No contacts yet</div>
          <div style={{ fontSize: 11, color: T.muted, maxWidth: 200, lineHeight: 1.5 }}>
            Open a chat on Instagram and Oxytocin will detect the contact automatically.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 10.5, color: T.muted, marginBottom: 4 }}>
            {contacts.length} contact{contacts.length !== 1 ? 's' : ''}
          </div>
          {contacts.map((contact) => {
            const [bg, fg] = avatarColor(contact.displayName).split('|');
            return (
              <div
                key={contact.id}
                style={{
                  background: T.white, border: `1px solid ${T.border}`,
                  borderRadius: 13, overflow: 'hidden',
                }}
              >
                {/* Card body */}
                <div style={{ padding: '12px 14px 10px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  {/* Avatar */}
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                    background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: fg }}>
                      {getInitials(contact.displayName)}
                    </span>
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: T.body }}>
                        {contact.displayName}
                      </span>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 10, fontWeight: 600,
                        padding: '2px 6px', borderRadius: 99,
                        background: contact.isActive ? T.greenBg : T.surfaceAlt,
                        color: contact.isActive ? T.greenDot : T.muted,
                      }}>
                        <span style={{
                          width: 5, height: 5, borderRadius: '50%',
                          background: contact.isActive ? T.greenDot : '#9ca3af',
                        }} />
                        {contact.isActive ? 'Active' : 'Paused'}
                      </span>
                    </div>
                    <div style={{ fontSize: 10.5, color: T.muted, marginTop: 2 }}>
                      @{contact.platformUserId}
                    </div>

                    {/* Badges */}
                    <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
                      {contact.relationship && (
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 6,
                          background: '#eff6ff', color: '#3b82f6', border: '1px solid #dbeafe',
                        }}>
                          {contact.relationship}
                        </span>
                      )}
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 6,
                        background: T.indigoBg, color: T.indigo, border: `1px solid #c7d2fe`,
                        fontFamily: 'ui-monospace, monospace',
                      }}>
                        {GOAL_LABELS[contact.goal]}
                      </span>
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 6,
                        background: T.surfaceAlt, color: T.bodyLight, border: `1px solid ${T.border}`,
                      }}>
                        {getToneDisplayName(contact.preferredTone)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Footer actions */}
                <div style={{
                  display: 'flex', gap: 0,
                  borderTop: `1px solid ${T.divider}`,
                  background: T.surfaceAlt,
                }}>
                  {[
                    { label: 'Edit', icon: '✎', onClick: () => onEditContact(contact.id), color: T.indigo },
                    { label: 'History', icon: '💬', onClick: () => onViewConversation(contact.id), color: T.indigo },
                  ].map(({ label, icon, onClick, color }) => (
                    <button
                      key={label}
                      onClick={onClick}
                      style={{
                        flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        gap: 5, padding: '7px 0', border: 'none',
                        background: 'transparent', cursor: 'pointer',
                        fontSize: 11.5, fontWeight: 600, color, fontFamily: F,
                        borderRight: `1px solid ${T.divider}`,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = T.indigoBg; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <span style={{ fontSize: 12 }}>{icon}</span> {label}
                    </button>
                  ))}
                  <button
                    onClick={() => handleDelete(contact.id)}
                    style={{
                      flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      gap: 5, padding: '7px 0', border: 'none',
                      background: 'transparent', cursor: 'pointer',
                      fontSize: 11.5, fontWeight: 600, color: T.muted, fontFamily: F,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#fff5f5'; e.currentTarget.style.color = '#ef4444'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.muted; }}
                  >
                    <span style={{ fontSize: 12 }}>🗑</span> Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import type { Contact } from '@/types/contact';
import { GOAL_LABELS, TONE_LABELS } from '@/types/contact';
import type { ExtensionMessage } from '@/lib/messaging/types';

interface DashboardProps {
  onCreateContact: () => void;
  onEditContact: (contactId: string) => void;
  onViewConversation: (contactId: string) => void;
}

export function Dashboard({
  onCreateContact,
  onEditContact,
  onViewConversation,
}: DashboardProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadContacts();
  }, []);

  async function loadContacts() {
    try {
      const response = (await browser.runtime.sendMessage({
        type: 'GET_ALL_CONTACTS',
      } satisfies ExtensionMessage)) as {
        ok: boolean;
        contacts?: Contact[];
      };
      if (response?.ok && response.contacts) {
        setContacts(response.contacts);
      }
    } catch (err) {
      console.error('Failed to load contacts:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(contactId: string) {
    if (!confirm('Delete this contact and all conversation history?')) return;
    await browser.runtime.sendMessage({
      type: 'DELETE_CONTACT',
      contactId,
    } satisfies ExtensionMessage);
    setContacts((prev) => prev.filter((c) => c.id !== contactId));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400 text-sm">Loading contacts...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900">Contacts</h2>
        <button
          onClick={onCreateContact}
          className="
            px-3 py-1.5 rounded-lg text-sm font-medium
            bg-indigo-600 text-white hover:bg-indigo-700 transition-colors
          "
        >
          + New Contact
        </button>
      </div>

      {contacts.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-400 text-sm mb-2">No contacts yet</div>
          <p className="text-gray-400 text-xs">
            Open a chat on Instagram and create a contact persona to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {contacts.map((contact) => (
            <div
              key={contact.id}
              className="
                border border-gray-200 rounded-lg p-3
                hover:border-gray-300 transition-colors
              "
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-900 truncate">
                      {contact.displayName}
                    </h3>
                    <span
                      className={`
                        inline-block w-2 h-2 rounded-full
                        ${contact.isActive ? 'bg-green-400' : 'bg-gray-300'}
                      `}
                      title={contact.isActive ? 'Active' : 'Inactive'}
                    />
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-500">
                      @{contact.platformUserId}
                    </span>
                    <span className="text-xs text-gray-300">|</span>
                    <span className="text-xs text-gray-500 capitalize">
                      {contact.platform}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    {contact.relationship && (
                      <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full">
                        {contact.relationship}
                      </span>
                    )}
                    <span className="text-xs px-2 py-0.5 bg-purple-50 text-purple-600 rounded-full">
                      {GOAL_LABELS[contact.goal]}
                    </span>
                    <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                      {TONE_LABELS[contact.preferredTone]}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-3 pt-2 border-t border-gray-100">
                <button
                  onClick={() => onEditContact(contact.id)}
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  Edit Persona
                </button>
                <span className="text-gray-200">|</span>
                <button
                  onClick={() => onViewConversation(contact.id)}
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  View History
                </button>
                <span className="text-gray-200">|</span>
                <button
                  onClick={() => handleDelete(contact.id)}
                  className="text-xs text-red-500 hover:text-red-600 font-medium"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

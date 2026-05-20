import { useState, useEffect } from 'react';
import { UserCircle, MessageCircle, Pencil, Trash2, Plus } from 'lucide-react';
import type { Contact } from '@/types/contact';
import { GOAL_LABELS, getToneDisplayName } from '@/types/contact';
import type { ExtensionMessage } from '@/lib/messaging/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card';

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

  function getInitials(name: string): string {
    return name
      .split(' ')
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-2">
          <div className="w-5 h-5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          <span className="text-xs text-gray-400">Loading contacts...</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-7">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Contacts</h2>
          {contacts.length > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">{contacts.length} contact{contacts.length !== 1 ? 's' : ''}</p>
          )}
        </div>
        <Button size="sm" onClick={onCreateContact} className="gap-1">
          <Plus size={13} />
          New Contact
        </Button>
      </div>

      {contacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center mb-3">
            <UserCircle size={24} className="text-indigo-400" />
          </div>
          <p className="text-sm font-medium text-gray-600 mb-1">No contacts yet</p>
          <p className="text-xs text-gray-400 max-w-50 leading-relaxed">
            Open a chat on Instagram and InstaReplier will detect the contact automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {contacts.map((contact) => (
            <Card key={contact.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start gap-3.5">
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-indigo-600">
                      {getInitials(contact.displayName)}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-gray-900 truncate">
                        {contact.displayName}
                      </h3>
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                          contact.isActive
                            ? 'bg-green-50 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        <span
                          className={`w-1 h-1 rounded-full ${
                            contact.isActive ? 'bg-green-500' : 'bg-gray-400'
                          }`}
                        />
                        {contact.isActive ? 'Active' : 'Paused'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      @{contact.platformUserId} · {contact.platform}
                    </p>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-0 pb-5">
                <div className="flex flex-wrap gap-2.5">
                  {contact.relationship && (
                    <Badge variant="blue">{contact.relationship}</Badge>
                  )}
                  <Badge variant="purple">{GOAL_LABELS[contact.goal]}</Badge>
                  <Badge variant="gray">{getToneDisplayName(contact.preferredTone)}</Badge>
                </div>
              </CardContent>

              <CardFooter>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => onEditContact(contact.id)}
                  className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 gap-1"
                >
                  <Pencil size={11} />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => onViewConversation(contact.id)}
                  className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 gap-1"
                >
                  <MessageCircle size={11} />
                  History
                </Button>
                <div className="flex-1" />
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => handleDelete(contact.id)}
                  className="text-gray-400 hover:text-red-600 hover:bg-red-50 gap-1"
                >
                  <Trash2 size={11} />
                  Delete
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

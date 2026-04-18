import { useState, useEffect } from 'react';
import type { Contact, ToneType } from '@/types/contact';
import { ConversationGoal, GOAL_LABELS, TONE_LABELS, BUILT_IN_TONES, type BuiltInTone } from '@/types/contact';
import type { ExtensionMessage } from '@/lib/messaging/types';

interface ContactEditorProps {
  contactId?: string;
  onBack: () => void;
  onSaved: () => void;
}

const TONES = BUILT_IN_TONES;

export function ContactEditor({ contactId, onBack, onSaved }: ContactEditorProps) {
  const [form, setForm] = useState({
    displayName: '',
    platformUserId: '',
    platform: 'instagram' as const,
    relationship: '',
    goal: ConversationGoal.CASUAL_CHAT,
    goalDescription: '',
    personalNotes: '',
    preferredTone: 'default' as ToneType,
    isActive: true,
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [summarizing, setSummarizing] = useState(false);

  useEffect(() => {
    if (contactId) {
      loadContact(contactId);
    }
  }, [contactId]);

  async function loadContact(id: string) {
    setLoading(true);
    try {
      const response = (await browser.runtime.sendMessage({
        type: 'GET_CONTACT',
        contactId: id,
      } satisfies ExtensionMessage)) as {
        ok: boolean;
        contact?: Contact | null;
      };
      if (response?.ok && response.contact) {
        const c = response.contact;
        setForm({
          displayName: c.displayName,
          platformUserId: c.platformUserId,
          platform: c.platform as 'instagram',
          relationship: c.relationship,
          goal: c.goal,
          goalDescription: c.goalDescription,
          personalNotes: c.personalNotes,
          preferredTone: c.preferredTone,
          isActive: c.isActive,
        });
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await browser.runtime.sendMessage({
        type: 'SAVE_CONTACT',
        contact: {
          ...(contactId ? { id: contactId } : {}),
          ...form,
        },
      } satisfies ExtensionMessage);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function handleSummarize() {
    if (!contactId) return;
    setSummarizing(true);
    try {
      await browser.runtime.sendMessage({
        type: 'TRIGGER_SUMMARIZE',
        contactId,
      } satisfies ExtensionMessage);
    } finally {
      setSummarizing(false);
    }
  }

  if (loading) {
    return <div className="text-sm text-gray-400 py-8 text-center">Loading...</div>;
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
        <h2 className="text-base font-semibold text-gray-900">
          {contactId ? 'Edit' : 'New'} Contact
        </h2>
      </div>

      <div className="space-y-4">
        {/* Name */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Display Name
          </label>
          <input
            type="text"
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            placeholder="Sarah, Mike from gym, etc."
            className="
              w-full px-3 py-2 rounded-lg border border-gray-300 text-sm
              focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
            "
          />
        </div>

        {/* Username */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Username / ID
          </label>
          <input
            type="text"
            value={form.platformUserId}
            onChange={(e) =>
              setForm({ ...form, platformUserId: e.target.value })
            }
            placeholder="instagram_handle"
            className="
              w-full px-3 py-2 rounded-lg border border-gray-300 text-sm
              focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
            "
          />
        </div>

        {/* Relationship */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Relationship
          </label>
          <input
            type="text"
            value={form.relationship}
            onChange={(e) => setForm({ ...form, relationship: e.target.value })}
            placeholder="crush, friend, colleague, tinder match..."
            className="
              w-full px-3 py-2 rounded-lg border border-gray-300 text-sm
              focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
            "
          />
        </div>

        {/* Goal */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Conversation Goal
          </label>
          <select
            value={form.goal}
            onChange={(e) =>
              setForm({ ...form, goal: e.target.value as ConversationGoal })
            }
            className="
              w-full px-3 py-2 rounded-lg border border-gray-300 text-sm
              focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
            "
          >
            {Object.entries(GOAL_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* Goal Description */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Goal Details (optional)
          </label>
          <input
            type="text"
            value={form.goalDescription}
            onChange={(e) =>
              setForm({ ...form, goalDescription: e.target.value })
            }
            placeholder="Want to ask her out this weekend..."
            className="
              w-full px-3 py-2 rounded-lg border border-gray-300 text-sm
              focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
            "
          />
        </div>

        {/* Personal Notes */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Personal Notes
          </label>
          <textarea
            value={form.personalNotes}
            onChange={(e) =>
              setForm({ ...form, personalNotes: e.target.value })
            }
            placeholder="Likes hiking, has a dog named Max, sarcastic humor, works in marketing..."
            rows={4}
            className="
              w-full px-3 py-2 rounded-lg border border-gray-300 text-sm
              focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
              resize-none
            "
          />
        </div>

        {/* Default Tone */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Default Tone
          </label>
          <div className="flex flex-wrap gap-2">
            {TONES.map((tone) => (
              <button
                key={tone}
                onClick={() => setForm({ ...form, preferredTone: tone })}
                className={`
                  px-3 py-1.5 rounded-full text-xs font-medium transition-all
                  ${
                    form.preferredTone === tone
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }
                `}
              >
                {TONE_LABELS[tone as BuiltInTone]}
              </button>
            ))}
          </div>
        </div>

        {/* Active Toggle */}
        <div className="flex items-center justify-between py-2">
          <div>
            <span className="text-sm font-medium text-gray-700">
              Auto-generate replies
            </span>
            <p className="text-xs text-gray-500">
              Automatically generate a reply when this person messages you
            </p>
          </div>
          <button
            onClick={() => setForm({ ...form, isActive: !form.isActive })}
            className={`
              relative w-11 h-6 rounded-full transition-colors
              ${form.isActive ? 'bg-indigo-600' : 'bg-gray-300'}
            `}
          >
            <span
              className={`
                absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full
                shadow transition-transform
                ${form.isActive ? 'translate-x-5' : ''}
              `}
            />
          </button>
        </div>

        {/* Summarize Button (only for existing contacts) */}
        {contactId && (
          <button
            onClick={handleSummarize}
            disabled={summarizing}
            className="
              w-full px-3 py-2 rounded-lg text-sm font-medium
              border border-gray-300 text-gray-700 hover:bg-gray-50
              disabled:opacity-50 transition-colors
            "
          >
            {summarizing ? 'Summarizing...' : 'Re-summarize Conversation'}
          </button>
        )}

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={saving || !form.displayName}
          className="
            w-full px-3 py-2.5 rounded-lg text-sm font-medium
            bg-indigo-600 text-white hover:bg-indigo-700
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors
          "
        >
          {saving ? 'Saving...' : contactId ? 'Save Changes' : 'Create Contact'}
        </button>
      </div>
    </div>
  );
}

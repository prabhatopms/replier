import { useState, useEffect } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import type { Contact, ToneType } from '@/types/contact';
import { ConversationGoal, GOAL_LABELS, TONE_LABELS, BUILT_IN_TONES, type BuiltInTone } from '@/types/contact';
import type { ExtensionMessage } from '@/lib/messaging/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

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
    if (contactId) loadContact(contactId);
  }, [contactId]);

  async function loadContact(id: string) {
    setLoading(true);
    try {
      const response = (await browser.runtime.sendMessage({
        type: 'GET_CONTACT',
        contactId: id,
      } satisfies ExtensionMessage)) as { ok: boolean; contact?: Contact | null };
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
        contact: { ...(contactId ? { id: contactId } : {}), ...form },
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
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-2">
          <div className="w-5 h-5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          <span className="text-xs text-gray-400">Loading contact...</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center gap-2 mb-5">
        <Button variant="ghost" size="icon" onClick={onBack} className="text-gray-500 -ml-1">
          <ArrowLeft size={16} />
        </Button>
        <h2 className="text-sm font-semibold text-gray-900">
          {contactId ? 'Edit Contact' : 'New Contact'}
        </h2>
      </div>

      <div className="space-y-7">

        {/* ── Identity ── */}
        <div className="space-y-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Identity</p>
          <div className="space-y-2">
            <Label htmlFor="displayName">Display Name</Label>
            <Input
              id="displayName"
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              placeholder="Sarah, Mike from gym, etc."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="platformUserId">Username / ID</Label>
            <Input
              id="platformUserId"
              value={form.platformUserId}
              onChange={(e) => setForm({ ...form, platformUserId: e.target.value })}
              placeholder="instagram_handle"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="relationship">Relationship</Label>
            <Input
              id="relationship"
              value={form.relationship}
              onChange={(e) => setForm({ ...form, relationship: e.target.value })}
              placeholder="crush, friend, colleague, tinder match..."
            />
          </div>
        </div>

        {/* ── Divider ── */}
        <div className="h-px bg-gray-100" />

        {/* ── Goal ── */}
        <div className="space-y-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Conversation Goal</p>
          <div className="space-y-2">
            <Label htmlFor="goal">Goal</Label>
            <select
              id="goal"
              value={form.goal}
              onChange={(e) => setForm({ ...form, goal: e.target.value as ConversationGoal })}
              className="flex h-9 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-400"
            >
              {Object.entries(GOAL_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="goalDescription">Goal Details <span className="font-normal text-gray-400">(optional)</span></Label>
            <Input
              id="goalDescription"
              value={form.goalDescription}
              onChange={(e) => setForm({ ...form, goalDescription: e.target.value })}
              placeholder="Want to ask her out this weekend..."
            />
          </div>
        </div>

        {/* ── Divider ── */}
        <div className="h-px bg-gray-100" />

        {/* ── Personal Notes ── */}
        <div className="space-y-2">
          <Label htmlFor="personalNotes">Personal Notes</Label>
          <p className="text-[11px] text-gray-400">Context the AI always gets when replying to this person.</p>
          <Textarea
            id="personalNotes"
            value={form.personalNotes}
            onChange={(e) => setForm({ ...form, personalNotes: e.target.value })}
            placeholder="Likes hiking, has a dog named Max, sarcastic humor, works in marketing..."
            rows={4}
          />
        </div>

        {/* ── Divider ── */}
        <div className="h-px bg-gray-100" />

        {/* ── Tone ── */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Default Tone</p>
          <div className="flex flex-wrap gap-2">
            {TONES.map((tone) => {
              const isSelected = form.preferredTone === tone;
              return (
                <button
                  key={tone}
                  onClick={() => setForm({ ...form, preferredTone: tone })}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-xs font-medium transition-all',
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-500/30'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  )}
                >
                  {TONE_LABELS[tone as BuiltInTone]}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Divider ── */}
        <div className="h-px bg-gray-100" />

        {/* ── Auto-pilot Toggle ── */}
        <div className="flex items-center justify-between py-3">
          <div className="flex-1 min-w-0 pr-4">
            <p className="text-sm font-medium text-gray-800">Auto-generate replies</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Automatically generate a reply when this person messages you
            </p>
          </div>
          <Switch
            checked={form.isActive}
            onCheckedChange={(checked) => setForm({ ...form, isActive: checked })}
          />
        </div>

        {/* ── Actions ── */}
        {contactId && (
          <Button
            variant="outline"
            onClick={handleSummarize}
            disabled={summarizing}
            className="w-full gap-2"
          >
            <RefreshCw size={13} className={summarizing ? 'animate-spin' : ''} />
            {summarizing ? 'Summarizing...' : 'Re-summarize Conversation'}
          </Button>
        )}

        <Button
          onClick={handleSave}
          disabled={saving || !form.displayName}
          className="w-full"
        >
          {saving ? 'Saving...' : contactId ? 'Save Changes' : 'Create Contact'}
        </Button>

      </div>
    </div>
  );
}

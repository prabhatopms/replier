import { useState, useEffect } from 'react';
import type { Contact, ToneType, CustomTone } from '@/types/contact';
import { ConversationGoal, GOAL_LABELS, TONE_LABELS, BUILT_IN_TONES, type BuiltInTone } from '@/types/contact';
import type { ExtensionMessage } from '@/lib/messaging/types';
import type { Platform } from '@/types/platform';
import { PLATFORM_META, platformMeta } from '@/lib/platforms/meta';

interface ContactEditorProps {
  contactId?: string;
  onBack: () => void;
  onSaved: () => void;
}

// ── Design tokens (matches StatusPopover) ────────────────────────────────────
const F = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
const T = {
  body: '#18181f',
  bodyMid: '#3a3a45',
  bodyLight: '#5a5a66',
  muted: '#8a8a99',
  labelMuted: '#a0a0ad',
  fieldLabel: '#a8a8b4',
  white: '#ffffff',
  surfaceAlt: '#fafafc',
  divider: '#f1f1f4',
  border: '#e7e7ee',
  borderFocus: '#6366f1',
  indigo: '#4f46e5',
  indigoLight: '#6366f1',
  indigoBg: '#eef0ff',
  greenDot: '#16a34a',
};

const TONE_EMOJIS: Record<BuiltInTone, string> = {
  default: '👤',
  chad: '👑',
  simp: '🥺',
  funny: '😂',
  flirty: '😏',
  devilish: '😈',
  smooth: '😎',
  casual: '☕',
  mature: '🎓',
  teen: '🤙',
  gen_z: '💅',
  professional: '💼',
};

const sectionLabel: React.CSSProperties = {
  fontSize: 9.5,
  fontWeight: 700,
  letterSpacing: '.07em',
  textTransform: 'uppercase',
  color: T.labelMuted,
  marginBottom: 10,
};

const fieldLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '.04em',
  textTransform: 'uppercase',
  color: T.fieldLabel,
  marginBottom: 5,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 11px',
  fontSize: 13,
  color: T.body,
  background: T.white,
  border: `1px solid ${T.border}`,
  borderRadius: 9,
  outline: 'none',
  fontFamily: F,
  boxSizing: 'border-box',
};

const card: React.CSSProperties = {
  background: T.white,
  border: `1px solid ${T.border}`,
  borderRadius: 13,
  padding: '14px 14px',
  marginBottom: 10,
};

export function ContactEditor({ contactId, onBack, onSaved }: ContactEditorProps) {
  const [form, setForm] = useState({
    displayName: '',
    platformUserId: '',
    platform: 'instagram' as Platform,
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
  const [customTones, setCustomTones] = useState<CustomTone[]>([]);

  useEffect(() => {
    if (contactId) loadContact(contactId);
    browser.storage.local.get('customTones').then((result) => {
      setCustomTones((result.customTones as CustomTone[]) || []);
    });
  }, [contactId]);

  const otherTones = [...(customTones.map((t) => t.id)), ...BUILT_IN_TONES].filter(
    (t) => t !== form.preferredTone
  );
  const allTones: ToneType[] = [form.preferredTone, ...otherTones];

  function getToneEmoji(tone: ToneType): string {
    return TONE_EMOJIS[tone as BuiltInTone] ?? '🎨';
  }

  function getToneLabel(tone: ToneType): string {
    if (tone in TONE_LABELS) return TONE_LABELS[tone as BuiltInTone];
    const custom = customTones.find((t) => t.id === tone);
    return custom?.name ?? tone;
  }

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
          platform: c.platform,
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 0', fontFamily: F }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 20, height: 20, borderRadius: '50%',
            border: `2px solid ${T.indigo}`, borderTopColor: 'transparent',
            animation: 'spin 0.7s linear infinite',
          }} />
          <span style={{ fontSize: 11.5, color: T.muted }}>Loading…</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: F, color: T.body }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button
          onClick={onBack}
          style={{
            width: 28, height: 28, display: 'inline-flex', alignItems: 'center',
            justifyContent: 'center', borderRadius: 8, border: `1px solid ${T.border}`,
            background: T.white, cursor: 'pointer', color: T.bodyLight, fontSize: 14,
          }}
        >
          ←
        </button>
        <span style={{ fontSize: 14, fontWeight: 700, color: T.body, letterSpacing: '-.01em' }}>
          {contactId ? 'Edit Contact' : 'New Contact'}
        </span>
      </div>

      {/* ── Identity card ── */}
      <div style={card}>
        <div style={sectionLabel}>Identity</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div style={fieldLabel}>Display Name</div>
            <input
              style={inputStyle}
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              placeholder="Sarah, Mike from gym…"
              onFocus={(e) => { e.target.style.borderColor = T.borderFocus; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,.1)'; }}
              onBlur={(e) => { e.target.style.borderColor = T.border; e.target.style.boxShadow = 'none'; }}
            />
          </div>
          <div>
            <div style={fieldLabel}>Platform</div>
            <select
              style={inputStyle}
              value={form.platform}
              onChange={(e) => setForm({ ...form, platform: e.target.value as Platform })}
            >
              {(['instagram', 'whatsapp'] as Platform[]).map((p) => (
                <option key={p} value={p}>{PLATFORM_META[p].label}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={fieldLabel}>
              {platformMeta(form.platform).handleStyle === 'phone' ? 'Phone / Name' : 'Username / ID'}
            </div>
            <input
              style={inputStyle}
              value={form.platformUserId}
              onChange={(e) => setForm({ ...form, platformUserId: e.target.value })}
              placeholder={platformMeta(form.platform).handleStyle === 'phone' ? 'Exact chat name in WhatsApp' : 'instagram_handle'}
              onFocus={(e) => { e.target.style.borderColor = T.borderFocus; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,.1)'; }}
              onBlur={(e) => { e.target.style.borderColor = T.border; e.target.style.boxShadow = 'none'; }}
            />
          </div>
          <div>
            <div style={fieldLabel}>Relationship</div>
            <input
              style={inputStyle}
              value={form.relationship}
              onChange={(e) => setForm({ ...form, relationship: e.target.value })}
              placeholder="crush, friend, colleague…"
              onFocus={(e) => { e.target.style.borderColor = T.borderFocus; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,.1)'; }}
              onBlur={(e) => { e.target.style.borderColor = T.border; e.target.style.boxShadow = 'none'; }}
            />
          </div>
        </div>
      </div>

      {/* ── Goal card ── */}
      <div style={card}>
        <div style={sectionLabel}>Conversation Goal</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div style={fieldLabel}>Goal</div>
            <select
              value={form.goal}
              onChange={(e) => setForm({ ...form, goal: e.target.value as ConversationGoal })}
              style={{ ...inputStyle, appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a0a0ad' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', paddingRight: 30, cursor: 'pointer' }}
              onFocus={(e) => { e.target.style.borderColor = T.borderFocus; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,.1)'; }}
              onBlur={(e) => { e.target.style.borderColor = T.border; e.target.style.boxShadow = 'none'; }}
            >
              {Object.entries(GOAL_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={fieldLabel}>
              Goal Details{' '}
              <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 10, color: T.muted }}>(optional)</span>
            </div>
            <input
              style={inputStyle}
              value={form.goalDescription}
              onChange={(e) => setForm({ ...form, goalDescription: e.target.value })}
              placeholder="Want to ask her out this weekend…"
              onFocus={(e) => { e.target.style.borderColor = T.borderFocus; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,.1)'; }}
              onBlur={(e) => { e.target.style.borderColor = T.border; e.target.style.boxShadow = 'none'; }}
            />
          </div>
        </div>
      </div>

      {/* ── Personal Notes card ── */}
      <div style={card}>
        <div style={sectionLabel}>Personal Notes</div>
        <p style={{ fontSize: 10.5, color: T.muted, marginBottom: 8, lineHeight: 1.4 }}>
          Context the AI always gets when replying to this person.
        </p>
        <textarea
          value={form.personalNotes}
          onChange={(e) => setForm({ ...form, personalNotes: e.target.value })}
          placeholder="Likes hiking, has a dog named Max, sarcastic humor, works in marketing…"
          rows={4}
          style={{
            ...inputStyle,
            resize: 'none',
            lineHeight: 1.5,
          }}
          onFocus={(e) => { e.target.style.borderColor = T.borderFocus; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,.1)'; }}
          onBlur={(e) => { e.target.style.borderColor = T.border; e.target.style.boxShadow = 'none'; }}
        />
      </div>

      {/* ── Default Tone card ── */}
      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
        <div style={{ ...sectionLabel, marginBottom: 0, flexShrink: 0 }}>Default Tone</div>
        <div
          className="no-scrollbar"
          style={{ display: 'flex', gap: 6, overflowX: 'auto', flex: 1, alignItems: 'center' }}
        >
          {allTones.map((tone) => {
            const isSelected = form.preferredTone === tone;
            return (
              <button
                key={tone}
                type="button"
                onClick={() => setForm({ ...form, preferredTone: tone })}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '5px 10px', borderRadius: 999, flexShrink: 0,
                  fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap',
                  fontFamily: F, cursor: 'pointer', transition: 'all .15s',
                  border: '1px solid',
                  ...(isSelected
                    ? { background: T.indigo, borderColor: T.indigo, color: T.white, boxShadow: '0 2px 6px rgba(79,70,229,.25)' }
                    : { background: T.surfaceAlt, borderColor: T.border, color: T.bodyMid }),
                }}
              >
                <span style={{ fontSize: 13, lineHeight: 1 }}>{getToneEmoji(tone)}</span>
                <span>{getToneLabel(tone)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Auto-generate toggle card ── */}
      <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.body, marginBottom: 3 }}>
            Auto-generate replies
          </div>
          <div style={{ fontSize: 10.5, color: T.muted, lineHeight: 1.4 }}>
            Automatically generate a reply when this person messages you
          </div>
        </div>
        <button
          type="button"
          onClick={() => setForm({ ...form, isActive: !form.isActive })}
          style={{
            flexShrink: 0,
            width: 40, height: 22, borderRadius: 11,
            background: form.isActive ? T.indigo : '#d1d5db',
            border: 'none', cursor: 'pointer',
            position: 'relative', transition: 'background .2s',
          }}
        >
          <span style={{
            position: 'absolute', top: 3,
            left: form.isActive ? 21 : 3,
            width: 16, height: 16,
            borderRadius: '50%', background: T.white,
            boxShadow: '0 1px 3px rgba(0,0,0,.2)',
            transition: 'left .2s',
          }} />
        </button>
      </div>

      {/* ── Actions ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
        {contactId && (
          <button
            onClick={handleSummarize}
            disabled={summarizing}
            style={{
              width: '100%', padding: '9px', fontSize: 12.5, fontWeight: 600,
              color: T.indigo, background: T.indigoBg,
              border: `1px solid #c7d2fe`, borderRadius: 10,
              cursor: summarizing ? 'not-allowed' : 'pointer',
              opacity: summarizing ? 0.7 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              fontFamily: F,
            }}
          >
            <span style={{ display: 'inline-block', animation: summarizing ? 'spin 0.7s linear infinite' : 'none' }}>↻</span>
            {summarizing ? 'Summarizing…' : 'Re-summarize Conversation'}
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving || !form.displayName}
          style={{
            width: '100%', padding: '10px', fontSize: 13, fontWeight: 700,
            color: T.white, background: T.indigo,
            border: 'none', borderRadius: 10,
            cursor: saving || !form.displayName ? 'not-allowed' : 'pointer',
            opacity: saving || !form.displayName ? 0.6 : 1,
            boxShadow: '0 4px 14px rgba(79,70,229,.35)',
            fontFamily: F,
          }}
        >
          {saving ? 'Saving…' : contactId ? 'Save Changes' : 'Create Contact'}
        </button>
      </div>

    </div>
  );
}

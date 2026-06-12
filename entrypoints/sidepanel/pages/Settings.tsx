import { useState, useEffect } from 'react';
import type { LLMProviderType } from '@/lib/llm/types';
import { PROVIDER_MODELS, PROVIDER_LABELS, DEFAULT_MODELS } from '@/lib/llm/types';
import type { CustomTone, BuiltInTone } from '@/types/contact';
import { TONE_LABELS, BUILT_IN_TONES } from '@/types/contact';
import { TONE_PROMPTS } from '@/lib/llm/tones';

interface SettingsProps {
  onBack: () => void;
}

interface UserProfile {
  description: string;
  textingStyle: string;
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
  borderFocus: '#6366f1',
  indigo: '#4f46e5',
  indigoLight: '#6366f1',
  indigoBg: '#eef0ff',
  greenDot: '#16a34a',
};

const PROVIDERS: LLMProviderType[] = ['claude', 'gemini', 'openai'];

const API_KEY_META: Record<LLMProviderType, { storageKey: string; placeholder: string; hint: string }> = {
  claude: { storageKey: 'apiKey', placeholder: 'sk-ant-api03-…', hint: 'console.anthropic.com' },
  gemini: { storageKey: 'geminiApiKey', placeholder: 'AIzaSy…', hint: 'aistudio.google.com/apikey' },
  openai: { storageKey: 'openaiApiKey', placeholder: 'sk-proj-…', hint: 'platform.openai.com/api-keys' },
};

const PROVIDER_SUBLABELS: Record<LLMProviderType, string> = {
  claude: 'Best quality',
  gemini: 'Fast · large ctx',
  openai: 'GPT-4o / o1',
};

function generateId(): string {
  return `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const sectionLabel: React.CSSProperties = {
  fontSize: 9.5, fontWeight: 700, letterSpacing: '.07em',
  textTransform: 'uppercase', color: T.labelMuted, marginBottom: 10,
};

const fieldLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, letterSpacing: '.04em',
  textTransform: 'uppercase', color: '#a8a8b4', marginBottom: 5,
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 11px', fontSize: 13, color: T.body,
  background: T.white, border: `1px solid ${T.border}`, borderRadius: 9,
  outline: 'none', fontFamily: F, boxSizing: 'border-box',
};

const monoInputStyle: React.CSSProperties = {
  ...inputStyle, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12,
};

const card: React.CSSProperties = {
  background: T.white, border: `1px solid ${T.border}`,
  borderRadius: 13, padding: '14px 14px', marginBottom: 10,
};

function focusStyle(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
  e.target.style.borderColor = T.borderFocus;
  e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,.1)';
}
function blurStyle(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
  e.target.style.borderColor = T.border;
  e.target.style.boxShadow = 'none';
}

export function Settings({ onBack }: SettingsProps) {
  const [provider, setProvider] = useState<LLMProviderType>('claude');
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({ apiKey: '', geminiApiKey: '', openaiApiKey: '' });
  const [showKey, setShowKey] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile>({ description: '', textingStyle: '' });
  const [model, setModel] = useState(DEFAULT_MODELS.claude);
  const [customPrompt, setCustomPrompt] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [customTones, setCustomTones] = useState<CustomTone[]>([]);
  const [editingTone, setEditingTone] = useState<CustomTone | null>(null);
  const [newToneName, setNewToneName] = useState('');
  const [newTonePrompt, setNewTonePrompt] = useState('');
  const [showBuiltIn, setShowBuiltIn] = useState(false);

  useEffect(() => { loadSettings(); }, []);

  async function loadSettings() {
    const result = await browser.storage.local.get(['apiKey', 'geminiApiKey', 'openaiApiKey', 'userProfile', 'llmConfig', 'customSystemPrompt', 'customTones']);
    setApiKeys({
      apiKey: (result.apiKey as string) || '',
      geminiApiKey: (result.geminiApiKey as string) || '',
      openaiApiKey: (result.openaiApiKey as string) || '',
    });
    if (result.userProfile) setUserProfile(result.userProfile as UserProfile);
    const config = result.llmConfig as { provider?: string; model?: string } | undefined;
    if (config?.provider) setProvider(config.provider as LLMProviderType);
    if (config?.model) setModel(config.model);
    if (result.customSystemPrompt) setCustomPrompt(result.customSystemPrompt as string);
    if (result.customTones) setCustomTones(result.customTones as CustomTone[]);
  }

  function handleProviderChange(p: LLMProviderType) {
    setProvider(p);
    setModel(DEFAULT_MODELS[p]);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await browser.storage.local.set({
        apiKey: apiKeys.apiKey,
        geminiApiKey: apiKeys.geminiApiKey,
        openaiApiKey: apiKeys.openaiApiKey,
        userProfile,
        llmConfig: { provider, model, maxTokens: 512 },
        customSystemPrompt: customPrompt,
        customTones,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  function startAddTone() {
    setEditingTone({ id: generateId(), name: '', prompt: '' });
    setNewToneName('');
    setNewTonePrompt('');
  }

  function startEditTone(tone: CustomTone) {
    setEditingTone(tone);
    setNewToneName(tone.name);
    setNewTonePrompt(tone.prompt);
  }

  function saveEditingTone() {
    if (!editingTone || !newToneName.trim() || !newTonePrompt.trim()) return;
    const updated: CustomTone = { id: editingTone.id, name: newToneName.trim(), prompt: newTonePrompt.trim() };
    setCustomTones((prev) => {
      const exists = prev.find((t) => t.id === updated.id);
      const next = exists ? prev.map((t) => (t.id === updated.id ? updated : t)) : [...prev, updated];
      browser.storage.local.set({ customTones: next });
      return next;
    });
    setEditingTone(null);
    setNewToneName('');
    setNewTonePrompt('');
  }

  function deleteTone(id: string) {
    setCustomTones((prev) => {
      const next = prev.filter((t) => t.id !== id);
      browser.storage.local.set({ customTones: next });
      return next;
    });
  }

  const currentKeyMeta = API_KEY_META[provider];
  const currentKeyValue = apiKeys[currentKeyMeta.storageKey] || '';
  const models = PROVIDER_MODELS[provider];

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
        <span style={{ fontSize: 14, fontWeight: 700, color: T.body, letterSpacing: '-.01em' }}>Settings</span>
      </div>

      {/* ── AI Provider card ── */}
      <div style={card}>
        <div style={sectionLabel}>AI Provider</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 7 }}>
          {PROVIDERS.map((p) => {
            const isSelected = provider === p;
            return (
              <button
                key={p}
                onClick={() => handleProviderChange(p)}
                style={{
                  padding: '10px 8px', borderRadius: 10, textAlign: 'left',
                  cursor: 'pointer', fontFamily: F, transition: 'all .15s',
                  border: `1.5px solid ${isSelected ? T.indigo : T.border}`,
                  background: isSelected ? T.indigoBg : T.surfaceAlt,
                }}
              >
                <div style={{ fontSize: 11.5, fontWeight: 700, color: isSelected ? T.indigo : T.bodyMid }}>
                  {PROVIDER_LABELS[p]}
                </div>
                <div style={{ fontSize: 10, color: isSelected ? T.indigoLight : T.muted, marginTop: 2 }}>
                  {PROVIDER_SUBLABELS[p]}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── API Key card ── */}
      <div style={card}>
        <div style={fieldLabel}>{PROVIDER_LABELS[provider]} API Key</div>
        <div style={{ position: 'relative' }}>
          <input
            type={showKey ? 'text' : 'password'}
            value={currentKeyValue}
            onChange={(e) => setApiKeys({ ...apiKeys, [currentKeyMeta.storageKey]: e.target.value })}
            placeholder={currentKeyMeta.placeholder}
            style={{ ...monoInputStyle, paddingRight: 36 }}
            onFocus={focusStyle}
            onBlur={blurStyle}
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              border: 'none', background: 'transparent', cursor: 'pointer',
              color: T.muted, fontSize: 13, padding: 0,
            }}
          >
            {showKey ? '🙈' : '👁'}
          </button>
        </div>
        <p style={{ fontSize: 10.5, color: T.muted, marginTop: 7, lineHeight: 1.5 }}>
          Get your key from <span style={{ color: T.indigo }}>{currentKeyMeta.hint}</span>. Stored locally, never shared.
        </p>

        {/* Other provider key status */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 10 }}>
          {PROVIDERS.filter((p) => p !== provider).map((otherProvider) => {
            const meta = API_KEY_META[otherProvider];
            const hasKey = !!apiKeys[meta.storageKey];
            return (
              <div key={otherProvider} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: T.muted }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                  background: hasKey ? T.greenDot : '#d1d5db',
                }} />
                {PROVIDER_LABELS[otherProvider]} key {hasKey ? 'configured' : 'not set'}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Model card ── */}
      <div style={card}>
        <div style={fieldLabel}>Model</div>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          style={{
            ...inputStyle,
            appearance: 'none',
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a0a0ad' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
            paddingRight: 30, cursor: 'pointer',
          }}
          onFocus={focusStyle}
          onBlur={blurStyle}
        >
          {models.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        {provider === 'gemini' && (
          <p style={{ fontSize: 10.5, color: '#d97706', marginTop: 7, lineHeight: 1.5 }}>
            ⚠ Gemini safety filters may block flirty/devilish tones.
          </p>
        )}
      </div>

      {/* ── About You card ── */}
      <div style={card}>
        <div style={sectionLabel}>About You</div>
        <p style={{ fontSize: 10.5, color: T.muted, marginBottom: 12, lineHeight: 1.5 }}>
          Help the AI match your personality and texting style.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div style={fieldLabel}>Self Description</div>
            <textarea
              value={userProfile.description}
              onChange={(e) => setUserProfile({ ...userProfile, description: e.target.value })}
              placeholder="25M, software engineer, into fitness and travel, witty humor…"
              rows={3}
              style={{ ...inputStyle, resize: 'none', lineHeight: 1.5 }}
              onFocus={focusStyle}
              onBlur={blurStyle}
            />
          </div>
          <div>
            <div style={fieldLabel}>Texting Style</div>
            <textarea
              value={userProfile.textingStyle}
              onChange={(e) => setUserProfile({ ...userProfile, textingStyle: e.target.value })}
              placeholder="Short messages, lots of emojis, rarely capitalize, use 'haha' not 'lol'…"
              rows={2}
              style={{ ...inputStyle, resize: 'none', lineHeight: 1.5 }}
              onFocus={focusStyle}
              onBlur={blurStyle}
            />
          </div>
        </div>
      </div>

      {/* ── Talking Styles card ── */}
      <div style={card}>
        <div style={sectionLabel}>Talking Styles</div>
        <p style={{ fontSize: 10.5, color: T.muted, marginBottom: 12, lineHeight: 1.5 }}>
          Styles control how replies sound. Create custom styles with your own instructions.
        </p>

        {/* View built-in toggle */}
        <button
          onClick={() => setShowBuiltIn((v) => !v)}
          style={{
            fontSize: 11, fontWeight: 600, color: T.indigo,
            background: 'none', border: 'none', cursor: 'pointer',
            padding: 0, fontFamily: F, marginBottom: 10,
          }}
        >
          {showBuiltIn ? '▾ Hide' : '▸ View'} built-in styles ({BUILT_IN_TONES.length})
        </button>

        {showBuiltIn && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12, maxHeight: 220, overflowY: 'auto' }}>
            {(BUILT_IN_TONES.filter((t) => t !== 'default') as BuiltInTone[]).map((tone) => (
              <div key={tone} style={{
                borderRadius: 9, border: `1px solid ${T.border}`,
                background: T.surfaceAlt, padding: '8px 10px',
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.bodyMid, marginBottom: 3 }}>
                  {TONE_LABELS[tone]}
                </div>
                <div style={{ fontSize: 10.5, color: T.muted, lineHeight: 1.5 }}>{TONE_PROMPTS[tone]}</div>
              </div>
            ))}
          </div>
        )}

        {/* Custom tones list */}
        {customTones.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 10 }}>
            {customTones.map((tone) => (
              <div key={tone.id} style={{
                borderRadius: 9, border: `1px solid #c7d2fe`,
                background: T.indigoBg, padding: '9px 10px',
              }}>
                {editingTone?.id === tone.id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    <input
                      value={newToneName}
                      onChange={(e) => setNewToneName(e.target.value)}
                      placeholder="Style name…"
                      style={{ ...inputStyle, fontSize: 12 }}
                      onFocus={focusStyle}
                      onBlur={blurStyle}
                    />
                    <textarea
                      value={newTonePrompt}
                      onChange={(e) => setNewTonePrompt(e.target.value)}
                      placeholder="Describe how to write in this style…"
                      rows={3}
                      style={{ ...monoInputStyle, resize: 'none', lineHeight: 1.5 }}
                      onFocus={focusStyle}
                      onBlur={blurStyle}
                    />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={saveEditingTone}
                        disabled={!newToneName.trim() || !newTonePrompt.trim()}
                        style={{
                          padding: '5px 12px', borderRadius: 7, border: 'none',
                          background: T.indigo, color: T.white,
                          fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: F,
                          opacity: !newToneName.trim() || !newTonePrompt.trim() ? 0.5 : 1,
                        }}
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingTone(null)}
                        style={{
                          padding: '5px 12px', borderRadius: 7, border: `1px solid ${T.border}`,
                          background: T.white, color: T.bodyMid,
                          fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: F,
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: T.indigo }}>{tone.name}</span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          onClick={() => startEditTone(tone)}
                          style={{ border: 'none', background: 'none', cursor: 'pointer', color: T.muted, fontSize: 12, padding: 2 }}
                        >
                          ✎
                        </button>
                        <button
                          onClick={() => deleteTone(tone.id)}
                          style={{ border: 'none', background: 'none', cursor: 'pointer', color: T.muted, fontSize: 12, padding: 2 }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = T.muted; }}
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                    <p style={{ fontSize: 10.5, color: T.bodyLight, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {tone.prompt}
                    </p>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add new tone */}
        {editingTone && !customTones.find((t) => t.id === editingTone.id) ? (
          <div style={{
            borderRadius: 9, border: `1.5px dashed #c7d2fe`,
            background: T.indigoBg, padding: '10px',
            display: 'flex', flexDirection: 'column', gap: 7,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.indigo }}>New custom style</div>
            <input
              value={newToneName}
              onChange={(e) => setNewToneName(e.target.value)}
              placeholder="Style name (e.g. Nerdy, Poetic…)"
              style={{ ...inputStyle, fontSize: 12 }}
              autoFocus
              onFocus={focusStyle}
              onBlur={blurStyle}
            />
            <textarea
              value={newTonePrompt}
              onChange={(e) => setNewTonePrompt(e.target.value)}
              placeholder='Describe how to write in this style. E.g. "Be extremely blunt. Short sentences. No fluff."'
              rows={4}
              style={{ ...monoInputStyle, resize: 'none', lineHeight: 1.5 }}
              onFocus={focusStyle}
              onBlur={blurStyle}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={saveEditingTone}
                disabled={!newToneName.trim() || !newTonePrompt.trim()}
                style={{
                  padding: '6px 14px', borderRadius: 7, border: 'none',
                  background: T.indigo, color: T.white,
                  fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: F,
                  opacity: !newToneName.trim() || !newTonePrompt.trim() ? 0.5 : 1,
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                }}
              >
                + Add Style
              </button>
              <button
                onClick={() => setEditingTone(null)}
                style={{
                  padding: '6px 14px', borderRadius: 7, border: `1px solid ${T.border}`,
                  background: T.white, color: T.bodyMid,
                  fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: F,
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          !editingTone && (
            <button
              onClick={startAddTone}
              style={{
                width: '100%', padding: '8px', borderRadius: 9,
                border: `1.5px dashed #c7d2fe`, background: 'transparent',
                color: T.indigo, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: F,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = T.indigoBg; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              + Add Custom Style
            </button>
          )
        )}
      </div>

      {/* ── System Prompt card ── */}
      <div style={card}>
        <div style={sectionLabel}>System Prompt</div>
        <p style={{ fontSize: 10.5, color: T.muted, marginBottom: 10, lineHeight: 1.5 }}>
          When set, this <strong style={{ color: T.bodyLight }}>replaces</strong> the default prompt. Leave empty to use the built-in prompt.
        </p>
        <textarea
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          placeholder={`You text on Instagram DMs as the user. Keep replies SHORT (1-2 sentences max). Sound like a real person, not an AI.\n\nNever use formal phrases. Match the conversation vibe.\n\nOutput ONLY the message text. No quotes, no HTML.`}
          rows={8}
          style={{ ...monoInputStyle, resize: 'none', lineHeight: 1.6, fontSize: 11.5 }}
          onFocus={focusStyle}
          onBlur={blurStyle}
        />
        {customPrompt.trim() && (
          <button
            onClick={() => setCustomPrompt('')}
            style={{
              marginTop: 6, fontSize: 10.5, color: '#ef4444',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: F,
            }}
          >
            Reset to default prompt
          </button>
        )}
      </div>

      {/* ── Save ── */}
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          width: '100%', padding: '10px', fontSize: 13, fontWeight: 700,
          color: T.white,
          background: saved ? '#16a34a' : T.indigo,
          border: 'none', borderRadius: 10,
          cursor: saving ? 'not-allowed' : 'pointer',
          opacity: saving ? 0.7 : 1,
          boxShadow: saved ? '0 4px 14px rgba(22,163,74,.3)' : '0 4px 14px rgba(79,70,229,.35)',
          fontFamily: F, transition: 'background .3s, box-shadow .3s',
          marginBottom: 4,
        }}
      >
        {saving ? 'Saving…' : saved ? '✓ Saved!' : 'Save Settings'}
      </button>

    </div>
  );
}

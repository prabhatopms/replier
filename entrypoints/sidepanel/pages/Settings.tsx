import { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Eye, EyeOff, Trash2, Pencil } from 'lucide-react';
import type { LLMProviderType } from '@/lib/llm/types';
import {
  PROVIDER_MODELS,
  PROVIDER_LABELS,
  DEFAULT_MODELS,
} from '@/lib/llm/types';
import type { CustomTone, BuiltInTone } from '@/types/contact';
import { TONE_LABELS, BUILT_IN_TONES } from '@/types/contact';
import { TONE_PROMPTS } from '@/lib/llm/tones';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface SettingsProps {
  onBack: () => void;
}

interface UserProfile {
  description: string;
  textingStyle: string;
}

const PROVIDERS: LLMProviderType[] = ['claude', 'gemini', 'openai'];

const API_KEY_META: Record<
  LLMProviderType,
  { storageKey: string; placeholder: string; hint: string }
> = {
  claude: {
    storageKey: 'apiKey',
    placeholder: 'sk-ant-api03-...',
    hint: 'Get your key from console.anthropic.com',
  },
  gemini: {
    storageKey: 'geminiApiKey',
    placeholder: 'AIzaSy...',
    hint: 'Get your key from aistudio.google.com/apikey',
  },
  openai: {
    storageKey: 'openaiApiKey',
    placeholder: 'sk-proj-...',
    hint: 'Get your key from platform.openai.com/api-keys',
  },
};

const PROVIDER_SUBLABELS: Record<LLMProviderType, string> = {
  claude: 'Best quality',
  gemini: 'Fast · large ctx',
  openai: 'GPT-4o / o1',
};

function generateId(): string {
  return `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

type SettingsTab = 'ai' | 'about' | 'styles';

export function Settings({ onBack }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('ai');
  const [provider, setProvider] = useState<LLMProviderType>('claude');
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({
    apiKey: '',
    geminiApiKey: '',
    openaiApiKey: '',
  });
  const [showKey, setShowKey] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile>({
    description: '',
    textingStyle: '',
  });
  const [model, setModel] = useState(DEFAULT_MODELS.claude);
  const [customPrompt, setCustomPrompt] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [customTones, setCustomTones] = useState<CustomTone[]>([]);
  const [editingTone, setEditingTone] = useState<CustomTone | null>(null);
  const [newToneName, setNewToneName] = useState('');
  const [newTonePrompt, setNewTonePrompt] = useState('');
  const [showBuiltIn, setShowBuiltIn] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    const result = await browser.storage.local.get([
      'apiKey',
      'geminiApiKey',
      'openaiApiKey',
      'userProfile',
      'llmConfig',
      'customSystemPrompt',
      'customTones',
    ]);
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

  function handleProviderChange(newProvider: LLMProviderType) {
    setProvider(newProvider);
    setModel(DEFAULT_MODELS[newProvider]);
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
    const updated: CustomTone = {
      id: editingTone.id,
      name: newToneName.trim(),
      prompt: newTonePrompt.trim(),
    };
    setCustomTones((prev) => {
      const exists = prev.find((t) => t.id === updated.id);
      return exists
        ? prev.map((t) => (t.id === updated.id ? updated : t))
        : [...prev, updated];
    });
    setEditingTone(null);
    setNewToneName('');
    setNewTonePrompt('');
  }

  function deleteTone(id: string) {
    setCustomTones((prev) => prev.filter((t) => t.id !== id));
  }

  const currentKeyMeta = API_KEY_META[provider];
  const currentKeyValue = apiKeys[currentKeyMeta.storageKey] || '';
  const models = PROVIDER_MODELS[provider];

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center gap-2 mb-6">
        <Button variant="ghost" size="icon" onClick={onBack} className="text-gray-500 -ml-1">
          <ArrowLeft size={16} />
        </Button>
        <h2 className="text-sm font-semibold text-gray-900">Settings</h2>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-7">
        {(['ai', 'about', 'styles'] as SettingsTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === tab
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'ai' ? 'AI Provider' : tab === 'about' ? 'About You' : 'Styles'}
          </button>
        ))}
      </div>

      {/* ── AI Provider tab ── */}
      {activeTab === 'ai' && (
        <div className="space-y-8">

          {/* Funny quote */}
          <div className="flex items-start gap-3 px-4 py-3.5 bg-amber-50 border border-amber-200 rounded-xl">
            <span className="text-lg leading-none shrink-0">💸</span>
            <p className="text-xs text-amber-800 leading-relaxed italic">
              "I ain't paying for your AI consumption — bring your own model here."
            </p>
          </div>

          {/* ── Provider ── */}
          <section>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Provider</p>
            <div className="grid grid-cols-3 gap-2.5">
              {PROVIDERS.map((p) => (
                <button
                  key={p}
                  onClick={() => handleProviderChange(p)}
                  className={`
                    px-3 py-3 rounded-xl text-left transition-all border-2
                    ${provider === p
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50'
                    }
                  `}
                >
                  <div className={`text-xs font-semibold ${provider === p ? 'text-indigo-700' : 'text-gray-700'}`}>
                    {PROVIDER_LABELS[p]}
                  </div>
                  <div className={`text-[10px] mt-0.5 ${provider === p ? 'text-indigo-500' : 'text-gray-400'}`}>
                    {PROVIDER_SUBLABELS[p]}
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* ── API Key ── */}
          <section>
            <Label className="mb-2">{PROVIDER_LABELS[provider]} API Key</Label>
            <div className="relative">
              <Input
                type={showKey ? 'text' : 'password'}
                value={currentKeyValue}
                onChange={(e) =>
                  setApiKeys({ ...apiKeys, [currentKeyMeta.storageKey]: e.target.value })
                }
                placeholder={currentKeyMeta.placeholder}
                className="pr-9 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">
              {currentKeyMeta.hint}. Stored locally, never shared.
            </p>
            <div className="flex flex-col gap-1.5 mt-3">
              {PROVIDERS.filter((p) => p !== provider).map((otherProvider) => {
                const otherMeta = API_KEY_META[otherProvider];
                const hasKey = !!apiKeys[otherMeta.storageKey];
                return (
                  <div key={otherProvider} className="flex items-center gap-1.5 text-[11px] text-gray-400">
                    <span className={`w-1.5 h-1.5 rounded-full ${hasKey ? 'bg-green-400' : 'bg-gray-300'}`} />
                    {PROVIDER_LABELS[otherProvider]} key {hasKey ? 'configured' : 'not set'}
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── Model ── */}
          <section>
            <Label className="mb-2">Model</Label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="flex h-9 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-400"
            >
              {models.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            {provider === 'gemini' && (
              <p className="text-[11px] text-amber-600 mt-1.5 leading-relaxed">
                Gemini safety filters may block some flirty/devilish tones.
              </p>
            )}
          </section>

          {/* ── System Prompt ── */}
          <section>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">System Prompt</p>
            <p className="text-[11px] text-gray-400 mb-3 leading-relaxed">
              When set, this <strong className="text-gray-500">replaces</strong> the default prompt. Leave empty to use the built-in prompt.
            </p>
            <Textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder={`You text on Instagram DMs as the user. Keep replies SHORT (1-2 sentences max). Sound like a real person, not an AI.\n\nNever use formal phrases. Match the conversation vibe.\n\nOutput ONLY the message text. No quotes, no HTML.`}
              rows={8}
              className="text-xs font-mono leading-relaxed"
            />
            {customPrompt.trim() && (
              <button
                onClick={() => setCustomPrompt('')}
                className="mt-1.5 text-xs text-red-500 hover:text-red-600 transition-colors"
              >
                Reset to default prompt
              </button>
            )}
          </section>

        </div>
      )}

      {/* ── About You tab ── */}
      {activeTab === 'about' && (
        <div className="space-y-6">
          <p className="text-[11px] text-gray-400 leading-relaxed">
            Help the AI match your personality and texting style. This context goes into every reply.
          </p>
          <section className="space-y-2">
            <Label>Self Description</Label>
            <Textarea
              value={userProfile.description}
              onChange={(e) => setUserProfile({ ...userProfile, description: e.target.value })}
              placeholder="25M, software engineer, into fitness and travel, witty humor..."
              rows={4}
            />
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Who you are — age, interests, personality, anything that shapes how you come across.
            </p>
          </section>
          <section className="space-y-2">
            <Label>Texting Style</Label>
            <Textarea
              value={userProfile.textingStyle}
              onChange={(e) => setUserProfile({ ...userProfile, textingStyle: e.target.value })}
              placeholder="Short messages, lots of emojis, rarely capitalize, use 'haha' not 'lol'..."
              rows={3}
            />
            <p className="text-[11px] text-gray-400 leading-relaxed">
              How you actually text — length, punctuation, emoji habits, words you always or never use.
            </p>
          </section>
        </div>
      )}

      {/* ── Styles tab ── */}
      {activeTab === 'styles' && (
        <div className="space-y-6">
          <p className="text-[11px] text-gray-400 leading-relaxed">
            Styles control how replies sound. Create custom styles with your own instructions.
          </p>

          <button
            onClick={() => setShowBuiltIn((v) => !v)}
            className="text-xs text-indigo-500 hover:text-indigo-700 transition-colors flex items-center gap-1"
          >
            <Eye size={12} />
            {showBuiltIn ? 'Hide' : 'View'} built-in styles ({BUILT_IN_TONES.length})
          </button>

          {showBuiltIn && (
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
              {(BUILT_IN_TONES.filter((t) => t !== 'default') as BuiltInTone[]).map((tone) => (
                <div key={tone} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-semibold text-gray-700">{TONE_LABELS[tone]}</span>
                    <span className="text-[10px] text-gray-400 uppercase tracking-wide">built-in</span>
                  </div>
                  <p className="text-[11px] text-gray-500 leading-relaxed">{TONE_PROMPTS[tone]}</p>
                </div>
              ))}
            </div>
          )}

          {customTones.length > 0 && (
            <div className="space-y-2">
              {customTones.map((tone) => (
                <div key={tone.id} className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2.5">
                  {editingTone?.id === tone.id ? (
                    <div className="space-y-2">
                      <Input
                        value={newToneName}
                        onChange={(e) => setNewToneName(e.target.value)}
                        placeholder="Style name (e.g. Nerdy, Poetic...)"
                        className="text-xs h-7"
                      />
                      <Textarea
                        value={newTonePrompt}
                        onChange={(e) => setNewTonePrompt(e.target.value)}
                        placeholder="Describe how to write in this style..."
                        rows={3}
                        className="text-xs font-mono"
                      />
                      <div className="flex gap-2">
                        <Button size="xs" onClick={saveEditingTone} disabled={!newToneName.trim() || !newTonePrompt.trim()}>
                          Save
                        </Button>
                        <Button size="xs" variant="outline" onClick={() => setEditingTone(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-indigo-700">{tone.name}</span>
                        <div className="flex gap-1">
                          <button onClick={() => startEditTone(tone)} className="text-gray-400 hover:text-gray-600 transition-colors p-0.5">
                            <Pencil size={11} />
                          </button>
                          <button onClick={() => deleteTone(tone.id)} className="text-gray-400 hover:text-red-500 transition-colors p-0.5">
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                      <p className="text-[11px] text-gray-500 leading-relaxed line-clamp-2">{tone.prompt}</p>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {editingTone && !customTones.find((t) => t.id === editingTone.id) ? (
            <div className="rounded-xl border border-dashed border-indigo-300 bg-indigo-50 px-3 py-3 space-y-2">
              <p className="text-xs font-medium text-indigo-700">New custom style</p>
              <Input
                value={newToneName}
                onChange={(e) => setNewToneName(e.target.value)}
                placeholder="Style name (e.g. Nerdy, Poetic, Blunt...)"
                className="text-xs h-8"
                autoFocus
              />
              <Textarea
                value={newTonePrompt}
                onChange={(e) => setNewTonePrompt(e.target.value)}
                placeholder='Describe how to write in this style. E.g. "Be extremely blunt and skip pleasantries. Short sentences. No fluff."'
                rows={4}
                className="text-xs font-mono"
              />
              <div className="flex gap-2">
                <Button size="xs" onClick={saveEditingTone} disabled={!newToneName.trim() || !newTonePrompt.trim()}>
                  <Plus size={11} />
                  Add Style
                </Button>
                <Button size="xs" variant="outline" onClick={() => setEditingTone(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            !editingTone && (
              <button
                onClick={startAddTone}
                className="w-full py-2 text-xs font-medium text-indigo-600 border border-dashed border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors flex items-center justify-center gap-1.5"
              >
                <Plus size={12} />
                Add Custom Style
              </button>
            )
          )}
        </div>
      )}

      {/* ── Save ── */}
      <div className="mt-8">
        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Settings'}
        </Button>
      </div>

    </div>
  );
}

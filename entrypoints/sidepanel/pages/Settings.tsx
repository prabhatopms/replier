import { useState, useEffect } from 'react';
import type { LLMProviderType } from '@/lib/llm/types';
import {
  PROVIDER_MODELS,
  PROVIDER_LABELS,
  DEFAULT_MODELS,
} from '@/lib/llm/types';
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

function generateId(): string {
  return `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function Settings({ onBack }: SettingsProps) {
  const [provider, setProvider] = useState<LLMProviderType>('claude');
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({
    apiKey: '',
    geminiApiKey: '',
    openaiApiKey: '',
  });
  const [userProfile, setUserProfile] = useState<UserProfile>({
    description: '',
    textingStyle: '',
  });
  const [model, setModel] = useState(DEFAULT_MODELS.claude);
  const [customPrompt, setCustomPrompt] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Custom tones state
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

    const config = result.llmConfig as
      | { provider?: string; model?: string }
      | undefined;
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
      <div className="flex items-center gap-2 mb-4">
        <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-700">
          &larr; Back
        </button>
        <h2 className="text-base font-semibold text-gray-900">Settings</h2>
      </div>

      <div className="space-y-6">
        {/* Provider Selection */}
        <section>
          <h3 className="text-sm font-semibold text-gray-800 mb-2">LLM Provider</h3>
          <div className="grid grid-cols-3 gap-2">
            {PROVIDERS.map((p) => (
              <button
                key={p}
                onClick={() => handleProviderChange(p)}
                className={`
                  px-3 py-2.5 rounded-lg text-sm font-medium text-left
                  border-2 transition-all
                  ${
                    provider === p
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }
                `}
              >
                <div className="font-semibold text-xs">{PROVIDER_LABELS[p]}</div>
                <div className="text-[10px] mt-0.5 opacity-70">
                  {p === 'claude' && 'Best quality'}
                  {p === 'gemini' && 'Fast, large ctx'}
                  {p === 'openai' && 'GPT-4o / o1'}
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* API Key */}
        <section>
          <h3 className="text-sm font-semibold text-gray-800 mb-2">
            {PROVIDER_LABELS[provider]} API Key
          </h3>
          <input
            type="password"
            value={currentKeyValue}
            onChange={(e) =>
              setApiKeys({ ...apiKeys, [currentKeyMeta.storageKey]: e.target.value })
            }
            placeholder={currentKeyMeta.placeholder}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-500 mt-1">
            {currentKeyMeta.hint}. Stored locally, never shared.
          </p>
          {PROVIDERS.filter((p) => p !== provider).map((otherProvider) => {
            const otherMeta = API_KEY_META[otherProvider];
            const hasKey = !!apiKeys[otherMeta.storageKey];
            return (
              <div key={otherProvider} className="flex items-center gap-1.5 mt-2 text-xs text-gray-400">
                <span className={`w-1.5 h-1.5 rounded-full ${hasKey ? 'bg-green-400' : 'bg-gray-300'}`} />
                {PROVIDER_LABELS[otherProvider]} key {hasKey ? 'configured' : 'not set'}
              </div>
            );
          })}
        </section>

        {/* Model Selection */}
        <section>
          <h3 className="text-sm font-semibold text-gray-800 mb-2">Model</h3>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            {models.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          {provider === 'gemini' && (
            <p className="text-xs text-amber-600 mt-1.5">
              Note: Gemini's safety filters may block some flirty/devilish tones.
            </p>
          )}
        </section>

        {/* User Profile */}
        <section>
          <h3 className="text-sm font-semibold text-gray-800 mb-2">About You</h3>
          <p className="text-xs text-gray-500 mb-2">
            Help the AI match your personality and texting style.
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Self Description</label>
              <textarea
                value={userProfile.description}
                onChange={(e) => setUserProfile({ ...userProfile, description: e.target.value })}
                placeholder="25M, software engineer, into fitness and travel, witty humor..."
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Texting Style</label>
              <textarea
                value={userProfile.textingStyle}
                onChange={(e) => setUserProfile({ ...userProfile, textingStyle: e.target.value })}
                placeholder="Short messages, lots of emojis, rarely capitalize, use 'haha' not 'lol'..."
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
              />
            </div>
          </div>
        </section>

        {/* Talking Styles */}
        <section>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">Talking Styles</h3>
          <p className="text-xs text-gray-500 mb-3">
            Styles control how replies sound. Each contact can have its own default style.
            Create custom styles with your own instructions.
          </p>

          {/* Built-in styles toggle */}
          <button
            onClick={() => setShowBuiltIn((v) => !v)}
            className="text-xs text-indigo-500 hover:text-indigo-700 mb-3 transition-colors"
          >
            {showBuiltIn ? 'Hide' : 'View'} built-in styles ({BUILT_IN_TONES.length})
          </button>

          {showBuiltIn && (
            <div className="mb-4 space-y-2 max-h-60 overflow-y-auto pr-1">
              {(BUILT_IN_TONES.filter((t) => t !== 'default') as BuiltInTone[]).map((tone) => (
                <div key={tone} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-gray-700">{TONE_LABELS[tone]}</span>
                    <span className="text-[10px] text-gray-400 uppercase tracking-wide">built-in</span>
                  </div>
                  <p className="text-[11px] text-gray-500 leading-relaxed">
                    {TONE_PROMPTS[tone]}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Custom tones list */}
          {customTones.length > 0 && (
            <div className="space-y-2 mb-3">
              {customTones.map((tone) => (
                <div key={tone.id} className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2">
                  {editingTone?.id === tone.id ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={newToneName}
                        onChange={(e) => setNewToneName(e.target.value)}
                        placeholder="Style name (e.g. Nerdy, Poetic...)"
                        className="w-full px-2 py-1 text-xs rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <textarea
                        value={newTonePrompt}
                        onChange={(e) => setNewTonePrompt(e.target.value)}
                        placeholder="Describe how to write in this style..."
                        rows={3}
                        className="w-full px-2 py-1 text-xs rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none font-mono"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={saveEditingTone}
                          disabled={!newToneName.trim() || !newTonePrompt.trim()}
                          className="px-3 py-1 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded disabled:opacity-40 transition-colors"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingTone(null)}
                          className="px-3 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-indigo-700">{tone.name}</span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => startEditTone(tone)}
                            className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteTone(tone.id)}
                            className="text-[11px] text-red-400 hover:text-red-600 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      <p className="text-[11px] text-gray-500 leading-relaxed line-clamp-2">
                        {tone.prompt}
                      </p>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add new custom tone form */}
          {editingTone && !customTones.find((t) => t.id === editingTone.id) ? (
            <div className="rounded-lg border border-dashed border-indigo-300 bg-indigo-50 px-3 py-3 space-y-2">
              <p className="text-xs font-medium text-indigo-700">New custom style</p>
              <input
                type="text"
                value={newToneName}
                onChange={(e) => setNewToneName(e.target.value)}
                placeholder="Style name (e.g. Nerdy, Poetic, Blunt...)"
                className="w-full px-2 py-1.5 text-xs rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                autoFocus
              />
              <textarea
                value={newTonePrompt}
                onChange={(e) => setNewTonePrompt(e.target.value)}
                placeholder="Describe how to write in this style. E.g. 'Be extremely blunt and skip pleasantries. Short sentences. No fluff.'"
                rows={4}
                className="w-full px-2 py-1.5 text-xs rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none font-mono leading-relaxed"
              />
              <div className="flex gap-2">
                <button
                  onClick={saveEditingTone}
                  disabled={!newToneName.trim() || !newTonePrompt.trim()}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded disabled:opacity-40 transition-colors"
                >
                  Add Style
                </button>
                <button
                  onClick={() => setEditingTone(null)}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            !editingTone && (
              <button
                onClick={startAddTone}
                className="w-full py-2 text-xs font-medium text-indigo-600 border border-dashed border-indigo-300 rounded-lg hover:bg-indigo-50 transition-colors"
              >
                + Add Custom Style
              </button>
            )
          )}
        </section>

        {/* System Prompt */}
        <section>
          <h3 className="text-sm font-semibold text-gray-800 mb-2">System Prompt</h3>
          <p className="text-xs text-gray-500 mb-2">
            When set, this <strong>replaces</strong> the default prompt entirely. Leave empty to use the built-in prompt.
          </p>
          <textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder={`You text on Instagram DMs as the user. Keep replies SHORT (1-2 sentences max). Sound like a real person, not an AI.\n\nNever use formal phrases. Match the conversation vibe.\n\nOutput ONLY the message text. No quotes, no HTML.`}
            rows={8}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-xs font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y"
          />
          {customPrompt.trim() && (
            <button
              onClick={() => setCustomPrompt('')}
              className="mt-1.5 text-xs text-red-500 hover:text-red-700 transition-colors"
            >
              Reset to default prompt
            </button>
          )}
        </section>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full px-3 py-2.5 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

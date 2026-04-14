import { useState, useEffect } from 'react';
import type { LLMProviderType } from '@/lib/llm/types';
import {
  PROVIDER_MODELS,
  PROVIDER_LABELS,
  DEFAULT_MODELS,
} from '@/lib/llm/types';

interface SettingsProps {
  onBack: () => void;
}

interface UserProfile {
  description: string;
  textingStyle: string;
}

const PROVIDERS: LLMProviderType[] = ['claude', 'gemini'];

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
};

export function Settings({ onBack }: SettingsProps) {
  const [provider, setProvider] = useState<LLMProviderType>('claude');
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({
    apiKey: '',
    geminiApiKey: '',
  });
  const [userProfile, setUserProfile] = useState<UserProfile>({
    description: '',
    textingStyle: '',
  });
  const [model, setModel] = useState(DEFAULT_MODELS.claude);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    const result = await browser.storage.local.get([
      'apiKey',
      'geminiApiKey',
      'userProfile',
      'llmConfig',
    ]);
    const storedKeys: Record<string, string> = {
      apiKey: (result.apiKey as string) || '',
      geminiApiKey: (result.geminiApiKey as string) || '',
    };
    setApiKeys(storedKeys);

    if (result.userProfile) setUserProfile(result.userProfile as UserProfile);

    const config = result.llmConfig as
      | { provider?: string; model?: string }
      | undefined;
    if (config?.provider) {
      setProvider(config.provider as LLMProviderType);
    }
    if (config?.model) {
      setModel(config.model);
    }
  }

  function handleProviderChange(newProvider: LLMProviderType) {
    setProvider(newProvider);
    // Switch to the default model for the new provider
    setModel(DEFAULT_MODELS[newProvider]);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await browser.storage.local.set({
        apiKey: apiKeys.apiKey,
        geminiApiKey: apiKeys.geminiApiKey,
        userProfile,
        llmConfig: { provider, model, maxTokens: 500 },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  const currentKeyMeta = API_KEY_META[provider];
  const currentKeyValue = apiKeys[currentKeyMeta.storageKey] || '';
  const models = PROVIDER_MODELS[provider];

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={onBack}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          &larr; Back
        </button>
        <h2 className="text-base font-semibold text-gray-900">Settings</h2>
      </div>

      <div className="space-y-6">
        {/* Provider Selection */}
        <section>
          <h3 className="text-sm font-semibold text-gray-800 mb-2">
            LLM Provider
          </h3>
          <div className="grid grid-cols-2 gap-2">
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
                <div className="font-semibold">{PROVIDER_LABELS[p]}</div>
                <div className="text-[10px] mt-0.5 opacity-70">
                  {p === 'claude' && 'Best persona adherence'}
                  {p === 'gemini' && 'Fast, large context'}
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* API Key — changes label/placeholder per provider */}
        <section>
          <h3 className="text-sm font-semibold text-gray-800 mb-2">
            {PROVIDER_LABELS[provider]} API Key
          </h3>
          <input
            type="password"
            value={currentKeyValue}
            onChange={(e) =>
              setApiKeys({
                ...apiKeys,
                [currentKeyMeta.storageKey]: e.target.value,
              })
            }
            placeholder={currentKeyMeta.placeholder}
            className="
              w-full px-3 py-2 rounded-lg border border-gray-300 text-sm
              font-mono
              focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
            "
          />
          <p className="text-xs text-gray-500 mt-1">
            {currentKeyMeta.hint}. Stored locally, never shared.
          </p>

          {/* Show status for the OTHER provider's key too */}
          {PROVIDERS.filter((p) => p !== provider).map((otherProvider) => {
            const otherMeta = API_KEY_META[otherProvider];
            const hasKey = !!apiKeys[otherMeta.storageKey];
            return (
              <div
                key={otherProvider}
                className="flex items-center gap-1.5 mt-2 text-xs text-gray-400"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${hasKey ? 'bg-green-400' : 'bg-gray-300'}`}
                />
                {PROVIDER_LABELS[otherProvider]} key{' '}
                {hasKey ? 'configured' : 'not set'}
              </div>
            );
          })}
        </section>

        {/* Model Selection — changes options per provider */}
        <section>
          <h3 className="text-sm font-semibold text-gray-800 mb-2">Model</h3>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="
              w-full px-3 py-2 rounded-lg border border-gray-300 text-sm
              focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
            "
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
              If a reply fails, try a milder tone.
            </p>
          )}
        </section>

        {/* User Profile */}
        <section>
          <h3 className="text-sm font-semibold text-gray-800 mb-2">
            About You
          </h3>
          <p className="text-xs text-gray-500 mb-2">
            Help the AI match your personality and texting style.
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Self Description
              </label>
              <textarea
                value={userProfile.description}
                onChange={(e) =>
                  setUserProfile({
                    ...userProfile,
                    description: e.target.value,
                  })
                }
                placeholder="25M, software engineer, into fitness and travel, witty humor..."
                rows={3}
                className="
                  w-full px-3 py-2 rounded-lg border border-gray-300 text-sm
                  focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                  resize-none
                "
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Texting Style
              </label>
              <textarea
                value={userProfile.textingStyle}
                onChange={(e) =>
                  setUserProfile({
                    ...userProfile,
                    textingStyle: e.target.value,
                  })
                }
                placeholder="Short messages, lots of emojis, rarely capitalize, use 'haha' not 'lol'..."
                rows={2}
                className="
                  w-full px-3 py-2 rounded-lg border border-gray-300 text-sm
                  focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                  resize-none
                "
              />
            </div>
          </div>
        </section>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="
            w-full px-3 py-2.5 rounded-lg text-sm font-medium
            bg-indigo-600 text-white hover:bg-indigo-700
            disabled:opacity-50 transition-colors
          "
        >
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

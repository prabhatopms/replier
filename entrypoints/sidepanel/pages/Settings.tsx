import { useState, useEffect } from 'react';

interface SettingsProps {
  onBack: () => void;
}

interface UserProfile {
  description: string;
  textingStyle: string;
}

export function Settings({ onBack }: SettingsProps) {
  const [apiKey, setApiKey] = useState('');
  const [userProfile, setUserProfile] = useState<UserProfile>({
    description: '',
    textingStyle: '',
  });
  const [model, setModel] = useState('claude-sonnet-4-20250514');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    const result = await browser.storage.local.get([
      'apiKey',
      'userProfile',
      'llmConfig',
    ]);
    if (result.apiKey) setApiKey(result.apiKey as string);
    if (result.userProfile) setUserProfile(result.userProfile as UserProfile);
    if ((result.llmConfig as Record<string, string>)?.model)
      setModel((result.llmConfig as Record<string, string>).model);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await browser.storage.local.set({
        apiKey,
        userProfile,
        llmConfig: { provider: 'claude', model, maxTokens: 500 },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
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
        <h2 className="text-base font-semibold text-gray-900">Settings</h2>
      </div>

      <div className="space-y-6">
        {/* API Key */}
        <section>
          <h3 className="text-sm font-semibold text-gray-800 mb-2">
            Claude API Key
          </h3>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-..."
            className="
              w-full px-3 py-2 rounded-lg border border-gray-300 text-sm
              font-mono
              focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
            "
          />
          <p className="text-xs text-gray-500 mt-1">
            Your API key is stored locally and never sent anywhere except Anthropic's API.
          </p>
        </section>

        {/* Model Selection */}
        <section>
          <h3 className="text-sm font-semibold text-gray-800 mb-2">
            Model
          </h3>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="
              w-full px-3 py-2 rounded-lg border border-gray-300 text-sm
              focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
            "
          >
            <option value="claude-sonnet-4-20250514">Claude Sonnet 4 (Fast)</option>
            <option value="claude-opus-4-20250514">Claude Opus 4 (Best Quality)</option>
            <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 (Fastest)</option>
          </select>
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
                  setUserProfile({ ...userProfile, description: e.target.value })
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

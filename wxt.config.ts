import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'InstaReplier',
    short_name: 'InstaReplier',
    description: 'AI reply generator for Instagram DMs. Auto-generates context-aware replies using Claude, Gemini, or OpenAI with your own API key.',
    version: '1.0.1',
    permissions: ['storage', 'sidePanel', 'activeTab'],
    host_permissions: [
      'https://www.instagram.com/*',
      'https://api.anthropic.com/*',
      'https://generativelanguage.googleapis.com/*',
      'https://api.openai.com/*',
    ],
    action: {},
    web_accessible_resources: [
      {
        resources: ['instagram-interceptor.js'],
        matches: ['https://www.instagram.com/*'],
      },
    ],
  },
});

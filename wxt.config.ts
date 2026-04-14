import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'Replier',
    description: 'AI-powered message reply assistant',
    permissions: ['storage', 'sidePanel', 'activeTab'],
    host_permissions: [
      'https://www.instagram.com/*',
      'https://web.whatsapp.com/*',
      'https://www.messenger.com/*',
      'https://x.com/*',
      'https://www.linkedin.com/*',
      'https://api.anthropic.com/*',
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

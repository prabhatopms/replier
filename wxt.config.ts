import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  dev: { server: { port: 3002 } },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'Oxytocin',
    description: 'Your brain\'s bonding chemical. Engineered as software.',
    permissions: ['storage', 'sidePanel', 'activeTab'],
    host_permissions: [
      'https://www.instagram.com/*',
      'https://web.whatsapp.com/*',
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

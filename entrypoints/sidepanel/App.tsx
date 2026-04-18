import { useState } from 'react';
import { HelpCircle, Settings as SettingsIcon } from 'lucide-react';
import { Dashboard } from './pages/Dashboard';
import { ContactEditor } from './pages/ContactEditor';
import { Settings } from './pages/Settings';
import { ConversationView } from './pages/ConversationView';
import { Guide } from './pages/Guide';
import { Button } from '@/components/ui/button';

type Page =
  | { name: 'dashboard' }
  | { name: 'contact-editor'; contactId?: string }
  | { name: 'settings' }
  | { name: 'conversation'; contactId: string }
  | { name: 'guide' };

export function App() {
  const [page, setPage] = useState<Page>({ name: 'dashboard' });

  const navigate = (p: Page) => setPage(p);

  const showHeader = page.name === 'dashboard';

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col">
      {showHeader && (
        <header className="sticky top-0 z-10 bg-white border-b border-gray-200">
          {/* Thin indigo accent line */}
          <div className="h-0.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-400" />
          <div className="flex items-center justify-between px-5 py-3">
            <button
              onClick={() => navigate({ name: 'dashboard' })}
              className="text-base font-bold text-indigo-600 hover:text-indigo-700 transition-colors tracking-tight"
            >
              Replier
            </button>
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate({ name: 'guide' })}
                title="How to use Replier"
                className="text-gray-400 hover:text-gray-600"
              >
                <HelpCircle size={16} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate({ name: 'settings' })}
                title="Settings"
                className="text-gray-400 hover:text-gray-600"
              >
                <SettingsIcon size={16} />
              </Button>
            </div>
          </div>
        </header>
      )}

      <main className="p-5 flex-1">
        {page.name === 'dashboard' && (
          <Dashboard
            onCreateContact={() => navigate({ name: 'contact-editor' })}
            onEditContact={(id) => navigate({ name: 'contact-editor', contactId: id })}
            onViewConversation={(id) => navigate({ name: 'conversation', contactId: id })}
          />
        )}
        {page.name === 'contact-editor' && (
          <ContactEditor
            contactId={page.contactId}
            onBack={() => navigate({ name: 'dashboard' })}
            onSaved={() => navigate({ name: 'dashboard' })}
          />
        )}
        {page.name === 'settings' && (
          <Settings onBack={() => navigate({ name: 'dashboard' })} />
        )}
        {page.name === 'conversation' && (
          <ConversationView
            contactId={page.contactId}
            onBack={() => navigate({ name: 'dashboard' })}
          />
        )}
        {page.name === 'guide' && (
          <Guide onBack={() => navigate({ name: 'dashboard' })} />
        )}
      </main>

      {/* Support footer */}
      <footer className="sticky bottom-0 z-10 px-4 pb-4 pt-1">
        <a
          href="https://www.paypal.com/ncp/payment/2KDACGWT6ZZMU"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-5 py-3 rounded-xl text-white hover:opacity-90 transition-opacity"
          style={{
            background: 'linear-gradient(135deg, #f59e0b 0%, #f97316 55%, #ef4444 100%)',
          }}
        >
          <span className="text-xl leading-none">☕</span>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold tracking-wide">Support Replier</div>
            <div className="text-[10px] opacity-80">Buy me a coffee to keep this project alive</div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="opacity-60 shrink-0">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </a>
      </footer>
    </div>
  );
}

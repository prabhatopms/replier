import { useState } from 'react';
import { Dashboard } from './pages/Dashboard';
import { ContactEditor } from './pages/ContactEditor';
import { Settings } from './pages/Settings';
import { ConversationView } from './pages/ConversationView';

type Page =
  | { name: 'dashboard' }
  | { name: 'contact-editor'; contactId?: string }
  | { name: 'settings' }
  | { name: 'conversation'; contactId: string };

export function App() {
  const [page, setPage] = useState<Page>({ name: 'dashboard' });

  const navigate = (p: Page) => setPage(p);

  return (
    <div className="min-h-screen bg-white text-gray-900 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate({ name: 'dashboard' })}
            className="text-lg font-bold text-indigo-600 hover:text-indigo-700 transition-colors"
          >
            Replier
          </button>
          <button
            onClick={() => navigate({ name: 'settings' })}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
            title="Settings"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          </button>
        </div>
      </header>

      {/* Page Content */}
      <main className="p-4 flex-1">
        {page.name === 'dashboard' && (
          <Dashboard
            onCreateContact={() =>
              navigate({ name: 'contact-editor' })
            }
            onEditContact={(id) =>
              navigate({ name: 'contact-editor', contactId: id })
            }
            onViewConversation={(id) =>
              navigate({ name: 'conversation', contactId: id })
            }
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
      </main>

      {/* Sticky Support Footer */}
      <footer className="sticky bottom-0 z-10">
        <div
          className="mx-3 mb-3 rounded-2xl overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #f59e0b 0%, #f97316 50%, #ef4444 100%)',
          }}
        >
          <a
            href="https://buymeacoffee.com/replier"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-3 px-6 py-4 text-white hover:opacity-90 transition-opacity"
          >
            <span className="text-2xl">&#9749;</span>
            <div className="text-left">
              <div className="text-sm font-bold tracking-wide">Support Replier</div>
              <div className="text-[11px] opacity-80">Buy me a coffee to keep this project alive</div>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-60 ml-auto">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </a>
        </div>
      </footer>
    </div>
  );
}

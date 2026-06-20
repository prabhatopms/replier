import { useState, useEffect } from 'react';
import { Dashboard } from './pages/Dashboard';
import { ContactEditor } from './pages/ContactEditor';
import { Settings } from './pages/Settings';
import { ConversationView } from './pages/ConversationView';
import { Guide } from './pages/Guide';

type Page =
  | { name: 'dashboard' }
  | { name: 'contact-editor'; contactId?: string }
  | { name: 'settings' }
  | { name: 'conversation'; contactId: string }
  | { name: 'guide' };

const F = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
const T = {
  body: '#18181f',
  bodyLight: '#5a5a66',
  muted: '#8a8a99',
  white: '#ffffff',
  bg: '#f4f4f7',
  border: '#e7e7ee',
  divider: '#f1f1f4',
  indigo: '#4f46e5',
  indigoBg: '#eef0ff',
};

export function App() {
  const [page, setPage] = useState<Page>({ name: 'dashboard' });
  const navigate = (p: Page) => setPage(p);
  const [widgetVisible, setWidgetVisible] = useState(true);
  const [activeTabHasWidget, setActiveTabHasWidget] = useState(false);

  useEffect(() => {
    const checkVisibility = async () => {
      try {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]?.id) {
          const res = await browser.tabs.sendMessage(tabs[0].id, { type: 'GET_POPOVER_VISIBILITY' }).catch(() => null);
          if (res && typeof res.visible === 'boolean') {
            setWidgetVisible(res.visible);
            setActiveTabHasWidget(true);
            return;
          }
        }
        setActiveTabHasWidget(false);
      } catch {
        setActiveTabHasWidget(false);
      }
    };

    checkVisibility();
    const timer = setInterval(checkVisibility, 1500);
    return () => clearInterval(timer);
  }, []);

  const handleShowWidget = async () => {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) {
      await browser.tabs.sendMessage(tabs[0].id, { type: 'SHOW_POPOVER' }).catch(() => null);
      setWidgetVisible(true);
    }
  };
  const isDashboard = page.name === 'dashboard';

  return (
    <div style={{
      minHeight: '100vh', background: T.bg,
      display: 'flex', flexDirection: 'column',
      fontFamily: F, color: T.body,
    }}>

      {/* ── Header (dashboard only) ── */}
      {isDashboard && (
        <header style={{
          position: 'sticky', top: 0, zIndex: 10,
          background: T.white, borderBottom: `1px solid ${T.border}`,
        }}>
          {/* Gradient accent line */}
          <div style={{
            height: 2,
            background: 'linear-gradient(90deg, #6366f1 0%, #a855f7 50%, #6366f1 100%)',
          }} />
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 16px',
          }}>
            {/* Logo orb */}
            <div style={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, #6366f1, #a855f7)',
              boxShadow: '0 0 0 3px rgba(99,102,241,.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>

            {/* Brand */}
            <button
              onClick={() => navigate({ name: 'dashboard' })}
              style={{
                flex: 1, textAlign: 'left', background: 'none', border: 'none',
                cursor: 'pointer', padding: 0, fontFamily: F,
                fontSize: 14, fontWeight: 700, color: T.body, letterSpacing: '-.01em',
              }}
            >
              Oxytocin
            </button>

            {/* Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                onClick={() => navigate({ name: 'contact-editor' })}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '5px 10px', borderRadius: 8,
                  border: `1px solid ${T.border}`, background: T.white,
                  color: T.bodyLight, fontSize: 11.5, fontWeight: 600,
                  cursor: 'pointer', fontFamily: F,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = T.indigoBg; e.currentTarget.style.color = T.indigo; e.currentTarget.style.borderColor = '#c7d2fe'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = T.white; e.currentTarget.style.color = T.bodyLight; e.currentTarget.style.borderColor = T.border; }}
              >
                <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> New
              </button>
              <button
                onClick={() => navigate({ name: 'guide' })}
                title="How to use"
                style={{
                  width: 30, height: 30, display: 'inline-flex', alignItems: 'center',
                  justifyContent: 'center', borderRadius: 8, border: 'none',
                  background: 'transparent', cursor: 'pointer', color: T.muted,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = T.indigoBg; e.currentTarget.style.color = T.indigo; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.muted; }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </button>
              <button
                onClick={() => navigate({ name: 'settings' })}
                title="Settings"
                style={{
                  width: 30, height: 30, display: 'inline-flex', alignItems: 'center',
                  justifyContent: 'center', borderRadius: 8, border: 'none',
                  background: 'transparent', cursor: 'pointer', color: T.muted,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = T.indigoBg; e.currentTarget.style.color = T.indigo; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.muted; }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
            </div>
          </div>
        </header>
      )}

      {/* ── Page content ── */}
      <main style={{ padding: 16, flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {activeTabHasWidget && !widgetVisible && (
          <button
            onClick={handleShowWidget}
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: 12,
              border: 'none',
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              color: T.white,
              fontSize: 13.5,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(79,70,229,.35)',
              fontFamily: F,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'all 0.2s',
              marginBottom: 8,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(79,70,229,.45)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 14px rgba(79,70,229,.35)';
            }}
          >
            <span>💬</span> Show Oxytocin Widget on Page
          </button>
        )}
        <div style={{ flex: 1 }}>
          {page.name === 'dashboard' && (
            <Dashboard
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
        </div>
      </main>

      {/* ── Support footer ── */}
      <footer style={{ position: 'sticky', bottom: 0, zIndex: 10, padding: '4px 12px 12px' }}>
        <a
          href="https://razorpay.me/@chemicalfarmers"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px', borderRadius: 12,
            background: 'linear-gradient(135deg, #f59e0b 0%, #f97316 55%, #ef4444 100%)',
            color: T.white, textDecoration: 'none',
            boxShadow: '0 4px 14px rgba(249,115,22,.3)',
          }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>☕</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.01em' }}>Support Oxytocin</div>
            <div style={{ fontSize: 10, opacity: 0.8, marginTop: 1 }}>by chemicalfarmers · Buy me a coffee to keep this alive</div>
          </div>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ opacity: 0.7, flexShrink: 0 }}>
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </a>
      </footer>

    </div>
  );
}

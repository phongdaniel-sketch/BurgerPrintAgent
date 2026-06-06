import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUp, ChevronDown, CircleCheck, Clock, Globe, PanelLeftOpen, Plus } from 'lucide-react';
import WelcomeModal from './components/WelcomeModal';
import Sidebar from './components/Sidebar';
import { useTranslation } from './i18n';

// Web (Vite dev) dùng proxy '/api'. Extension chạy origin chrome-extension:// nên gọi
// thẳng backend (mặc định cổng 3001 — đổi trong ô "Backend URL" nếu cần).
const isExtension =
  typeof location !== 'undefined' && location.protocol === 'chrome-extension:';
const DEFAULT_API = isExtension ? 'http://localhost:3000' : '/api';

// Custom markdown components: link mở tab mới
const MARKDOWN_COMPONENTS = {
  a: ({ children, href }) =>
    href ? (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
};

export default function App() {
  const { t } = useTranslation();

  // ── Theme ──
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('bp_theme') || 'light'; } catch { return 'light'; }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('bp_theme', theme); } catch { /* noop */ }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  // ── Auth ──
  const savedAuth = (() => {
    try { return JSON.parse(localStorage.getItem('bp_auth') || 'null'); } catch { return null; }
  })();
  const savedGuest = localStorage.getItem('bp_guest_session');

  const [apiBase] = useState(DEFAULT_API);
  const [email, setEmail] = useState('seller@test.com');
  const [password, setPassword] = useState('Password123');
  const [auth, setAuth] = useState(savedAuth || null);
  const [token, setToken] = useState(savedAuth?.token || '');
  const [sessionId, setSessionId] = useState(savedGuest || '');
  const [status, setStatus] = useState(t('status.disconnected'));
  const [connecting, setConnecting] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [showModal, setShowModal] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const scrollRef = useRef(null);
  const taRef = useRef(null);
  const stick = useRef(true);

  // Tool label lookup via i18n
  const toolLabel = (n) => {
    const key = `tools.${n}`;
    const val = t(key);
    return val !== key ? val : n;
  };

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  useEffect(() => {
    if (stick.current) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [input]);

  // Responsive: auto-collapse sidebar on small screens
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    if (mq.matches) setSidebarCollapsed(true);
    const handler = (e) => setSidebarCollapsed(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  async function connect() {
    setConnecting(true);
    setStatus(t('status.connecting'));
    try {
      let tk = await login();
      if (!tk) {
        await register();
        tk = await login();
      }
      if (!tk) throw new Error(t('status.errorNoToken'));
      setToken(tk);
      const res = await fetch(`${apiBase}/conversations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tk}` },
      });
      const data = await res.json();
      if (!data.sessionId) throw new Error(t('status.errorNoSession'));
      setSessionId(data.sessionId);
      setStatus(`${t('status.connected')} ${data.sessionId.slice(0, 8)}…`);
      setMessages([]);
    } catch (e) {
      setStatus(`${t('status.error')}: ${e.message}`);
    } finally {
      setConnecting(false);
    }
  }

  async function login() {
    try {
      const r = await fetch(`${apiBase}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!r.ok) return '';
      const d = await r.json();
      return d.accessToken || '';
    } catch {
      return '';
    }
  }

  function handleGoogleLogin() {
    const hardToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2YTIzOTNlNDE5NmE4ODUzMzZiMjhmOTciLCJlbWFpbCI6InRydW5nZG9uZzA4MTFAZ21haWwuY29tIiwicm9sZSI6InVzZXIiLCJpYXQiOjE3ODA3MTY1MTYsImV4cCI6MTc4MDgwMjkxNn0.qaZQklG9LCApickYWst6tTAzZjfXePXrq0PvXWimAdM";
    const userInfo = {
      id: "6a2393e4196a885336b28f97",
      email: "trungdong0811@gmail.com",
      displayName: "John Doe",
      role: "user",
    };
    const authData = { token: hardToken, user: userInfo };
    localStorage.setItem('bp_auth', JSON.stringify(authData));
    setAuth(authData);
    setToken(hardToken);
    setShowModal(false);
    connect();
  }

  async function handleEmailLogin() {
    setShowModal(false);
    setAuth({ token: '', user: { displayName: email } });
    await connect();
  }

  function handleGuestChat() {
    const guestId = crypto.randomUUID();
    localStorage.setItem('bp_guest_session', guestId);
    setSessionId(guestId);
    setAuth({ token: '', user: { displayName: 'Guest' } });
    setShowModal(false);
  }

  async function register() {
    try {
      await fetch(`${apiBase}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
    } catch { /* ignore */ }
  }

  function patchLast(fn) {
    setMessages((m) => {
      const copy = [...m];
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].role === 'assistant') {
          copy[i] = fn({ ...copy[i] });
          break;
        }
      }
      return copy;
    });
  }

  async function send() {
    const msg = input.trim();
    if (!msg || busy) return;
    if (!sessionId) {
      const newId = crypto.randomUUID();
      setSessionId(newId);
      localStorage.setItem('bp_guest_session', newId);
    }
    setInput('');
    setBusy(true);
    stick.current = true;
    setMessages((m) => [
      ...m,
      { role: 'user', text: msg },
      { role: 'assistant', text: '', steps: [], thinking: '' },
    ]);

    try {
      const url = `${apiBase}/conversations/${sessionId}/stream?message=${encodeURIComponent(msg)}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
      });
      if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const blocks = buf.split('\n\n');
        buf = blocks.pop() || '';
        for (const block of blocks) handleEvent(block);
      }
    } catch (e) {
      patchLast((a) => ({ ...a, text: a.text + `\n[${t('chat.connectionError')}: ${e.message}]` }));
    } finally {
      setBusy(false);
    }
  }

  function handleEvent(block) {
    let event = 'message';
    let dataLine = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLine += line.slice(5).trim();
    }
    if (!dataLine) return;
    let d;
    try { d = JSON.parse(dataLine); } catch { return; }

    if (event === 'token') {
      patchLast((a) => ({ ...a, text: a.text + (d.text || '') }));
    } else if (event === 'thinking') {
      patchLast((a) => ({ ...a, thinking: a.thinking + (d.text || '') }));
    } else if (event === 'tool') {
      patchLast((a) => {
        const steps = [...a.steps];
        const key = d.id || d.name;
        const idx = steps.findIndex((s) => (s.id || s.name) === key && s.status === 'running');
        if (d.status === 'done' && idx >= 0) {
          steps[idx] = { ...steps[idx], status: 'done', endedAt: Date.now(), count: d.count, results: d.results };
        } else if (d.status === 'running') {
          steps.push({ id: d.id, name: d.name, status: 'running', startedAt: Date.now() });
        }
        return { ...a, steps };
      });
    } else if (event === 'error') {
      patchLast((a) => ({ ...a, text: a.text + `\n\n⚠️ ${d.message || t('status.error')}` }));
    }
  }

  function handleNewChat() {
    setMessages([]);
    setSessionId('');
    setStatus(t('status.disconnected'));
    if (token) connect();
  }

  function handleLogout() {
    localStorage.removeItem('bp_auth');
    localStorage.removeItem('bp_guest_session');
    setAuth(null);
    setToken('');
    setSessionId('');
    setMessages([]);
    setShowModal(true);
  }

  const ready = !!sessionId;
  const userName = auth?.user?.displayName || auth?.user?.email || '';
  const userEmail = auth?.user?.email || '';

  return (
    <div className="app">
      {/* Sidebar */}
      {!showModal && (
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((v) => !v)}
          onNewChat={handleNewChat}
          onLogout={auth ? handleLogout : undefined}
          userName={userName}
          userEmail={userEmail}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      )}

      {/* Mobile overlay when sidebar is open */}
      <AnimatePresence>
        {!showModal && !sidebarCollapsed && window.innerWidth <= 768 && (
          <motion.div
            className="sidebar-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setSidebarCollapsed(true)}
          />
        )}
      </AnimatePresence>

      {/* Main Area */}
      <div className="main-area">
        {/* Top bar — visible when sidebar is hidden */}
        {!showModal && sidebarCollapsed && (
          <div className="main-header">
            <button
              className="main-header-toggle"
              onClick={() => setSidebarCollapsed(false)}
              title={t('sidebar.expand')}
            >
              <PanelLeftOpen size={20} strokeWidth={1.8} />
            </button>
            <img src="./favicon.png" alt="" style={{ width: 20, height: 20, borderRadius: 4 }} />
            <span className="main-header-title">BurgerPrint Agent</span>
          </div>
        )}

        <AnimatePresence>
          {showModal && (
            <WelcomeModal
              onGoogleLogin={handleGoogleLogin}
              onEmailLogin={handleEmailLogin}
              onGuestChat={handleGuestChat}
              email={email}
              setEmail={setEmail}
              password={password}
              setPassword={setPassword}
            />
          )}
        </AnimatePresence>

        {/* Chat Messages */}
        <div className="chat" ref={scrollRef} onScroll={onScroll}>
          {messages.length === 0 && ready && (
            <div className="greeting">
              <motion.div
                className="greeting-text"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              >
                {t('chat.greeting')}
              </motion.div>
              <motion.div
                className="greeting-sub"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              >
                {t('chat.greetingSub')}
              </motion.div>
              <div className="suggestion-chips">
                {(t('chat.suggestions') || []).map?.((text, i) => (
                  <motion.button
                    key={i}
                    className="suggestion-chip"
                    onClick={() => { setInput(text); taRef.current?.focus(); }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: 0.3 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {text}
                  </motion.button>
                ))}
              </div>
            </div>
          )}

          {messages.length > 0 && (
            <div className="text-center text-xs font-medium mt-1 mb-1" style={{ color: 'var(--text-muted)' }}>
              {t('chat.today')}
            </div>
          )}

          {messages.map((m, i) =>
            m.role === 'user' ? (
              <div key={i} className="flex justify-end">
                <div
                  className="max-w-[82%] rounded-[22px] px-[18px] py-[11px] text-[14.5px] whitespace-pre-wrap break-words"
                  style={{ background: 'var(--bg-user-bubble)', color: 'var(--text-primary)' }}
                >
                  {m.text}
                </div>
              </div>
            ) : (
              <AssistantMessage
                key={i}
                msg={m}
                streaming={busy && i === messages.length - 1}
                toolLabel={toolLabel}
                t={t}
              />
            ),
          )}
        </div>

        {/* Composer */}
        <div className="composer">
          <div className="composer-box">
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={ready ? t('composer.placeholder') : t('composer.placeholderDisabled')}
              disabled={!ready || busy}
              rows={1}
            />
            <div className="composer-row">
              <button className="composer-plus" type="button" title={t('composer.attach')} disabled>
                <Plus size={18} strokeWidth={2} />
              </button>
              <span className="composer-pill">{t('composer.model')}</span>
              <div className="composer-spacer" />
              <button
                className="composer-send"
                onClick={send}
                disabled={!ready || busy || !input.trim()}
                title={t('composer.send')}
              >
                <ArrowUp size={18} strokeWidth={2.4} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Assistant Message ─── */
function AssistantMessage({ msg, streaming, toolLabel, t }) {
  const entries = useMemo(() => {
    const list = [];
    if (msg.thinking) {
      list.push({ kind: 'think', label: msg.thinking, ts: msg.steps[0]?.startedAt ?? 0 });
    }
    const byName = new Map();
    for (const s of msg.steps) {
      const cur = byName.get(s.name);
      if (!cur) {
        byName.set(s.name, {
          kind: 'tool', name: s.name, label: toolLabel(s.name),
          status: s.status, calls: 1, ts: s.startedAt,
          count: s.count, results: s.results,
        });
      } else {
        cur.calls += 1;
        if (s.status === 'running') cur.status = 'running';
        else if (cur.status !== 'running') cur.status = 'done';
        if (s.results) { cur.results = s.results; cur.count = s.count; }
      }
    }
    return [...list, ...byName.values()];
  }, [msg.steps, msg.thinking]);

  const runningStep = msg.steps.find((s) => s.status === 'running');
  const thinkingLabel = runningStep
    ? `${t('chat.thinking').split(' ')[0]} ${toolLabel(runningStep.name).toLowerCase()}`
    : t('chat.thinking');

  return (
    <div className="group flex flex-col gap-1.5 max-w-[92%]">
      {entries.length > 0 && <Trace entries={entries} streaming={streaming} toolLabel={toolLabel} t={t} />}
      {streaming && !msg.text && entries.length === 0 && (
        <span className="shimmer">{thinkingLabel}…</span>
      )}
      {msg.text && (
        <div className="chat-markdown max-w-full break-words">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
            {msg.text}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}

function itemIcon(kind) {
  if (kind === 'think')
    return <Clock className="w-[17px] h-[17px]" style={{ color: 'var(--text-muted)' }} strokeWidth={1.75} />;
  return <Globe className="w-[16px] h-[16px]" style={{ color: 'var(--text-muted)' }} strokeWidth={1.75} />;
}

function Trace({ entries, streaming, toolLabel, t }) {
  const [userOpen, setUserOpen] = useState(null);
  const open = userOpen ?? streaming;

  const running = entries.find((e) => e.status === 'running');
  const title = streaming
    ? running ? running.label : t('chat.thinking')
    : entries.some((e) => e.kind === 'think')
      ? t('chat.thought')
      : `${t('chat.catalogSteps')} · ${entries.length} ${t('chat.steps')}`;

  return (
    <div className="text-[15px] leading-relaxed">
      <button
        type="button"
        onClick={() => setUserOpen((v) => (v == null ? !open : !v))}
        className="group cursor-pointer flex items-center gap-1.5 w-full px-0.5 py-0.5 rounded text-left transition-colors"
        style={{ color: 'var(--text-muted)' }}
        aria-expanded={open}
      >
        <span className="flex-1 min-w-0 relative h-[24px] overflow-hidden block">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={title}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className={'block absolute inset-0 truncate text-[14px] leading-[24px] font-normal ' + (streaming ? 'shimmer' : '')}
            >
              {title}
            </motion.span>
          </AnimatePresence>
        </span>
        <ChevronDown
          className={'w-4 h-4 flex-shrink-0 transition-transform duration-200 ' + (!open ? '-rotate-90' : '')}
          style={{ color: 'var(--text-muted)' }}
          strokeWidth={2}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="relative pt-2.5 pb-1 pl-[30px] pr-1">
              <span aria-hidden className="absolute left-[12px] top-[18px] bottom-[18px] w-px" style={{ background: 'var(--border-medium)' }} />
              <div className="flex flex-col gap-4 text-[14px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {entries.map((e, idx) => (
                  <div key={idx} className="relative -ml-[30px] pl-[30px]">
                    <span aria-hidden className="absolute left-0 top-0 w-[24px] h-[24px] flex items-center justify-center rounded-full" style={{ background: 'var(--icon-circle-bg)' }}>
                      {itemIcon(e.kind)}
                    </span>
                    <div style={e.kind === 'think' ? { color: 'var(--text-primary)' } : {}}>
                      <div className="flex items-baseline">
                        <span>{e.label}</span>
                        {e.kind === 'tool' && e.calls > 1 && <span className="ml-1.5" style={{ color: 'var(--text-muted)' }}>×{e.calls}</span>}
                        {e.kind === 'tool' && e.count != null && <span className="ml-2 text-[13px]" style={{ color: 'var(--text-muted)' }}>{e.count} {t('chat.results')}</span>}
                        {e.kind === 'tool' && e.status === 'running' && <span className="ml-2 text-[13px]" style={{ color: 'var(--text-muted)' }}>{t('chat.running')}</span>}
                      </div>
                      {e.results?.length > 0 && (
                        <div className="mt-1.5 rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-medium)', background: 'var(--bg-sidebar-hover)' }}>
                          {e.results.map((r, ri) => (
                            <div key={ri} className="flex items-center gap-2 px-3 py-1.5 text-[13px]" style={{ borderBottom: ri < e.results.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                              <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: 'var(--accent)' }} />
                              <span className="truncate flex-1" style={{ color: 'var(--text-primary)' }}>{r.title}</span>
                              {r.meta && <span className="flex-none" style={{ color: 'var(--text-muted)' }}>{r.meta}</span>}
                            </div>
                          ))}
                          {e.count > e.results.length && (
                            <div className="px-3 py-1.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>+{e.count - e.results.length} {t('chat.more')}</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {!streaming && (
                <div className="relative mt-4 -ml-[30px] pl-[30px] flex items-center gap-2 text-[15px]" style={{ color: 'var(--text-secondary)' }}>
                  <span aria-hidden className="absolute left-0 top-1/2 -translate-y-1/2 w-[24px] h-[24px] flex items-center justify-center rounded-full" style={{ background: 'var(--icon-circle-bg)' }}>
                    <CircleCheck className="w-[19px] h-[19px]" style={{ color: 'var(--text-muted)' }} strokeWidth={1.75} />
                  </span>
                  <span>{t('chat.done')}</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

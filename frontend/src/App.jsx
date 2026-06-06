import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUp, ChevronDown, CircleCheck, Clock, Globe, Plus } from 'lucide-react';

// Web (Vite dev) dùng proxy '/api'. Extension chạy origin chrome-extension:// nên gọi
// thẳng backend (mặc định cổng 3001 — đổi trong ô "Backend URL" nếu cần).
const isExtension =
  typeof location !== 'undefined' && location.protocol === 'chrome-extension:';
const DEFAULT_API = isExtension ? 'http://localhost:3001' : '/api';

// Tên tool → nhãn thân thiện cho timeline
const TOOL_LABELS = {
  search_products: 'Tìm sản phẩm',
  get_product_pricing: 'Lấy giá theo xưởng',
  get_product_variants: 'Lấy SKU (màu/size)',
};
const toolLabel = (n) => TOOL_LABELS[n] || n;

// Custom markdown components (port từ source): link mở tab mới
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
  const [apiBase, setApiBase] = useState(DEFAULT_API);
  const [email, setEmail] = useState('seller@test.com');
  const [password, setPassword] = useState('Password123');
  const [token, setToken] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [status, setStatus] = useState('Chưa kết nối');
  const [connecting, setConnecting] = useState(false);
  const [messages, setMessages] = useState([]); // {role, text, steps, thinking}
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [promptBusy, setPromptBusy] = useState(false);
  const [tools, setTools] = useState([]);
  const scrollRef = useRef(null);
  const taRef = useRef(null);
  const stick = useRef(true); // chỉ auto-scroll khi user đang ở gần đáy

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  useEffect(() => {
    if (stick.current) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  // Auto-resize textarea theo nội dung (cap 160px)
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [input]);

  async function connect() {
    setConnecting(true);
    setStatus('Đang kết nối...');
    try {
      let tk = await login();
      if (!tk) {
        await register();
        tk = await login();
      }
      if (!tk) throw new Error('Không lấy được token');
      setToken(tk);
      const res = await fetch(`${apiBase}/conversations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tk}` },
      });
      const data = await res.json();
      if (!data.sessionId) throw new Error('Không tạo được phiên');
      setSessionId(data.sessionId);
      setStatus(`Đã kết nối · phiên ${data.sessionId.slice(0, 8)}…`);
      setMessages([]);
    } catch (e) {
      setStatus('Lỗi: ' + e.message);
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

  async function register() {
    try {
      await fetch(`${apiBase}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      /* ignore */
    }
  }

  // Cập nhật message assistant cuối cùng
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
    if (!msg || !sessionId || busy) return;
    setInput('');
    setBusy(true);
    stick.current = true; // gửi tin mới → bám đáy
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
      patchLast((a) => ({ ...a, text: a.text + `\n[lỗi kết nối: ${e.message}]` }));
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
    try {
      d = JSON.parse(dataLine);
    } catch {
      return;
    }

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
          steps[idx] = {
            ...steps[idx],
            status: 'done',
            endedAt: Date.now(),
            count: d.count,
            results: d.results,
          };
        } else if (d.status === 'running') {
          steps.push({ id: d.id, name: d.name, status: 'running', startedAt: Date.now() });
        }
        return { ...a, steps };
      });
    } else if (event === 'error') {
      patchLast((a) => ({ ...a, text: a.text + `\n\n⚠️ ${d.message || 'lỗi'}` }));
    }
  }

  async function openPrompt() {
    setShowPrompt(true);
    setPromptText('Đang tải…');
    try {
      const r = await fetch(`${apiBase}/conversations/${sessionId}/system-prompt`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      setPromptText(d.systemPrompt ?? d.default ?? '');
      setTools(d.tools ?? []);
    } catch {
      setPromptText('');
    }
  }

  async function savePrompt(reset) {
    setPromptBusy(true);
    try {
      await fetch(`${apiBase}/conversations/${sessionId}/system-prompt`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt: reset ? '' : promptText }),
      });
      if (reset) {
        const r = await fetch(`${apiBase}/conversations/${sessionId}/system-prompt`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const d = await r.json();
        setPromptText(d.default ?? '');
      } else {
        setShowPrompt(false);
      }
    } finally {
      setPromptBusy(false);
    }
  }

  const ready = !!sessionId;

  return (
    <div className="app">
      <header>
        <h1>🍔 BurgerPrints Agent</h1>
        <div className="header-right">
          <span className={'status ' + (ready ? 'ok' : '')}>{status}</span>
          {ready && (
            <button
              onClick={openPrompt}
              title="Sửa system prompt"
              className="text-[12.5px] text-stone-500 border border-stone-200 bg-white hover:bg-stone-50 px-3 py-[5px] rounded-full transition-colors"
            >
              ⚙ Prompt
            </button>
          )}
        </div>
      </header>

      {!ready && (
        <div className="connect">
          {isExtension && (
            <input
              value={apiBase}
              onChange={(e) => setApiBase(e.target.value)}
              placeholder="Backend URL (vd http://localhost:3001)"
              style={{ flexBasis: '100%' }}
            />
          )}
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="mật khẩu"
            type="password"
          />
          <button onClick={connect} disabled={connecting}>
            {connecting ? 'Đang kết nối…' : 'Kết nối'}
          </button>
        </div>
      )}

      <div className="chat" ref={scrollRef} onScroll={onScroll}>
        {messages.length > 0 && (
          <div className="text-center text-xs text-stone-400 font-medium mt-1 mb-1">Hôm nay</div>
        )}
        {messages.length === 0 && ready && (
          <div className="hint">
            Thử hỏi: <em>"Tôi muốn bán Hoodie Gildan cho thị trường Mỹ, xưởng nào giá vốn rẻ nhất?"</em>
          </div>
        )}
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="flex justify-end">
              <div
                className="max-w-[82%] rounded-[22px] px-[18px] py-[11px] text-[14.5px] whitespace-pre-wrap break-words"
                style={{ background: '#eceae6', color: '#2b2a28' }}
              >
                {m.text}
              </div>
            </div>
          ) : (
            <AssistantMessage
              key={i}
              msg={m}
              streaming={busy && i === messages.length - 1}
            />
          ),
        )}
      </div>

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
            placeholder={ready ? 'Nhắn cho agent…' : 'Kết nối trước khi chat'}
            disabled={!ready || busy}
            rows={1}
          />
          <div className="composer-row">
            <button className="composer-plus" type="button" title="Thêm" disabled>
              <Plus size={18} strokeWidth={2} />
            </button>
            <span className="composer-pill">🍔 BurgerPrints Agent</span>
            <div className="composer-spacer" />
            <button
              className="composer-send"
              onClick={send}
              disabled={!ready || busy || !input.trim()}
              title="Gửi"
            >
              <ArrowUp size={18} strokeWidth={2.4} />
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showPrompt && (
          <motion.div
            className="fixed inset-0 bg-black/30 flex items-center justify-center p-6 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setShowPrompt(false)}
          >
            <motion.div
              className="bg-white rounded-2xl w-full max-w-2xl max-h-[84vh] flex flex-col p-5 shadow-2xl"
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between font-semibold text-stone-700 text-[15px]">
                <span>⚙ System prompt của agent</span>
                <button
                  className="text-stone-400 hover:text-stone-600 text-base"
                  onClick={() => setShowPrompt(false)}
                >
                  ✕
                </button>
              </div>
              <p className="text-[12.5px] text-stone-400 mt-1.5 mb-2.5">
                Chỉnh cách agent hành xử cho phiên này. Để trống / Khôi phục mặc định để dùng prompt gốc.
              </p>
              {tools.length > 0 && (
                <div className="mb-2.5 rounded-xl border border-stone-200 bg-stone-50 p-3 max-h-40 overflow-y-auto">
                  <div className="text-[12px] font-semibold text-stone-500 mb-1.5">
                    🛠️ Tool agent có thể dùng (tham khảo khi viết prompt)
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {tools.map((t) => (
                      <div key={t.name} className="text-[12.5px] leading-snug">
                        <code className="text-stone-800 bg-stone-200/70 px-1.5 py-0.5 rounded font-mono">
                          {t.name}
                        </code>
                        <span className="text-stone-500"> — {t.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <textarea
                className="flex-1 min-h-[180px] resize-y border border-stone-200 rounded-xl p-3.5 text-[13px] leading-relaxed font-mono text-stone-800 outline-none focus:border-stone-300"
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                spellCheck={false}
              />
              <div className="flex items-center gap-2 mt-3">
                <button
                  className="border border-stone-200 bg-white hover:bg-stone-50 text-stone-600 text-[13.5px] px-3.5 py-2 rounded-[10px] transition-colors disabled:opacity-50"
                  onClick={() => savePrompt(true)}
                  disabled={promptBusy}
                >
                  Khôi phục mặc định
                </button>
                <div className="flex-1" />
                <button
                  className="border border-stone-200 bg-white hover:bg-stone-50 text-stone-600 text-[13.5px] px-3.5 py-2 rounded-[10px] transition-colors"
                  onClick={() => setShowPrompt(false)}
                >
                  Huỷ
                </button>
                <button
                  className="bg-stone-800 hover:bg-stone-700 text-white text-[13.5px] font-semibold px-[18px] py-2 rounded-[10px] transition-colors disabled:bg-stone-300"
                  onClick={() => savePrompt(false)}
                  disabled={promptBusy}
                >
                  {promptBusy ? 'Đang lưu…' : 'Lưu'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AssistantMessage({ msg, streaming }) {
  // Gộp thinking + tool steps; GỘP các lần gọi cùng 1 tool thành 1 entry (tránh trùng)
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
          kind: 'tool',
          name: s.name,
          label: toolLabel(s.name),
          status: s.status,
          calls: 1,
          ts: s.startedAt,
          count: s.count,
          results: s.results,
        });
      } else {
        cur.calls += 1;
        if (s.status === 'running') cur.status = 'running';
        else if (cur.status !== 'running') cur.status = 'done';
        // giữ kết quả mới nhất (step done có results)
        if (s.results) {
          cur.results = s.results;
          cur.count = s.count;
        }
      }
    }
    return [...list, ...byName.values()];
  }, [msg.steps, msg.thinking]);

  const runningStep = msg.steps.find((s) => s.status === 'running');
  const thinkingLabel = runningStep ? `Đang ${toolLabel(runningStep.name).toLowerCase()}` : 'Đang suy nghĩ';

  return (
    <div className="group flex flex-col gap-1.5 max-w-[92%]">
      {entries.length > 0 && <Trace entries={entries} streaming={streaming} />}
      {streaming && !msg.text && entries.length === 0 && (
        <span className="shimmer">{thinkingLabel}…</span>
      )}
      {msg.text && (
        <div className="chat-markdown max-w-full break-words text-stone-800">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
            {msg.text}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}

function itemIcon(kind) {
  // Clock cho node "suy nghĩ" (giống Claude), Globe cho bước tra cứu tool
  if (kind === 'think')
    return <Clock className="w-[17px] h-[17px] text-stone-400" strokeWidth={1.75} />;
  return <Globe className="w-[16px] h-[16px] text-stone-400" strokeWidth={1.75} />;
}

/** Timeline "thinking" kiểu Claude — header xám + chevron, line dọc, icon trong vòng trắng. */
function Trace({ entries, streaming }) {
  const [userOpen, setUserOpen] = useState(null);
  const open = userOpen ?? streaming; // mở khi đang chạy, tự gập khi xong (user toggle được)

  // Tiêu đề header (xám, kiểu Claude): đang chạy → bước hiện tại; xong → tổng kết
  const running = entries.find((e) => e.status === 'running');
  const title = streaming
    ? running
      ? running.label
      : 'Đang suy nghĩ'
    : entries.some((e) => e.kind === 'think')
      ? 'Đã suy nghĩ'
      : `Đã tra cứu catalog · ${entries.length} bước`;

  return (
    <div className="text-[15px] leading-relaxed">
      <button
        type="button"
        onClick={() => setUserOpen((v) => (v == null ? !open : !v))}
        className="group cursor-pointer flex items-center gap-1.5 w-full px-0.5 py-0.5 rounded text-left text-stone-400 hover:text-stone-500 transition-colors"
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
              className={
                'block absolute inset-0 truncate text-[14px] leading-[24px] font-normal ' +
                (streaming ? 'shimmer' : '')
              }
            >
              {title}
            </motion.span>
          </AnimatePresence>
        </span>
        <ChevronDown
          className={
            'w-4 h-4 flex-shrink-0 text-stone-300 group-hover:text-stone-400 transition-transform duration-200 ' +
            (!open ? '-rotate-90' : '')
          }
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
              <span
                aria-hidden
                className="absolute left-[12px] top-[18px] bottom-[18px] w-px bg-stone-200"
              />
              <div className="flex flex-col gap-4 text-[14px] leading-relaxed text-stone-500">
                {entries.map((e, idx) => (
                  <div key={idx} className="relative -ml-[30px] pl-[30px]">
                    <span
                      aria-hidden
                      className="absolute left-0 top-0 w-[24px] h-[24px] flex items-center justify-center bg-white rounded-full"
                    >
                      {itemIcon(e.kind)}
                    </span>
                    <div className={e.kind === 'think' ? 'text-stone-600' : ''}>
                      <div className="flex items-baseline">
                        <span>{e.label}</span>
                        {e.kind === 'tool' && e.calls > 1 && (
                          <span className="ml-1.5 text-stone-400">×{e.calls}</span>
                        )}
                        {e.kind === 'tool' && e.count != null && (
                          <span className="ml-2 text-[13px] text-stone-400">{e.count} kết quả</span>
                        )}
                        {e.kind === 'tool' && e.status === 'running' && (
                          <span className="ml-2 text-[13px] text-stone-400">đang chạy…</span>
                        )}
                      </div>
                      {e.results?.length > 0 && (
                        <div className="mt-1.5 rounded-xl border border-stone-200 bg-stone-50/60 overflow-hidden">
                          {e.results.map((r, ri) => (
                            <div
                              key={ri}
                              className="flex items-center gap-2 px-3 py-1.5 text-[13px] border-b border-stone-100 last:border-b-0"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-stone-300 flex-none" />
                              <span className="text-stone-700 truncate flex-1">{r.title}</span>
                              {r.meta && (
                                <span className="text-stone-400 flex-none">{r.meta}</span>
                              )}
                            </div>
                          ))}
                          {e.count > e.results.length && (
                            <div className="px-3 py-1.5 text-[12px] text-stone-400">
                              +{e.count - e.results.length} nữa
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {!streaming && (
                <div className="relative mt-4 -ml-[30px] pl-[30px] flex items-center gap-2 text-stone-500 text-[15px]">
                  <span
                    aria-hidden
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[24px] h-[24px] flex items-center justify-center bg-white rounded-full"
                  >
                    <CircleCheck className="w-[19px] h-[19px] text-stone-400" strokeWidth={1.75} />
                  </span>
                  <span>Hoàn tất</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, CircleCheck, Clock, Globe } from 'lucide-react';

const API = '/api'; // Vite proxy → backend

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
  const [email, setEmail] = useState('seller@test.com');
  const [password, setPassword] = useState('Password123');
  const [token, setToken] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [status, setStatus] = useState('Chưa kết nối');
  const [connecting, setConnecting] = useState(false);
  const [messages, setMessages] = useState([]); // {role, text, steps, thinking}
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 1e9, behavior: 'smooth' });
  }, [messages]);

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
      const res = await fetch(`${API}/conversations`, {
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
      const r = await fetch(`${API}/auth/login`, {
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
      await fetch(`${API}/auth/register`, {
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
    setMessages((m) => [
      ...m,
      { role: 'user', text: msg },
      { role: 'assistant', text: '', steps: [], thinking: '' },
    ]);

    try {
      const url = `${API}/conversations/${sessionId}/stream?message=${encodeURIComponent(msg)}`;
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
          steps[idx] = { ...steps[idx], status: 'done', endedAt: Date.now() };
        } else if (d.status === 'running') {
          steps.push({ id: d.id, name: d.name, status: 'running', startedAt: Date.now() });
        }
        return { ...a, steps };
      });
    } else if (event === 'error') {
      patchLast((a) => ({ ...a, text: a.text + `\n\n⚠️ ${d.message || 'lỗi'}` }));
    }
  }

  const ready = !!sessionId;

  return (
    <div className="app">
      <header>
        <h1>🍔 BurgerPrints Agent</h1>
        <span className={'status ' + (ready ? 'ok' : '')}>{status}</span>
      </header>

      {!ready && (
        <div className="connect">
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

      <div className="chat" ref={scrollRef}>
        {messages.length === 0 && ready && (
          <div className="hint">
            Thử hỏi: <em>"Tôi muốn bán Hoodie Gildan cho thị trường Mỹ, xưởng nào giá vốn rẻ nhất?"</em>
          </div>
        )}
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-3xl bg-stone-100 px-5 py-3 text-sm text-stone-900 whitespace-pre-wrap break-words">
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
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={ready ? 'Nhập câu hỏi… (Enter để gửi)' : 'Kết nối trước khi chat'}
          disabled={!ready || busy}
          rows={2}
        />
        <button onClick={send} disabled={!ready || busy || !input.trim()}>
          {busy ? '…' : 'Gửi'}
        </button>
      </div>
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
          count: 1,
          ts: s.startedAt,
        });
      } else {
        cur.count += 1;
        if (s.status === 'running') cur.status = 'running';
        else if (cur.status !== 'running') cur.status = 'done';
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
                      {e.label}
                      {e.kind === 'tool' && e.count > 1 && (
                        <span className="ml-1.5 text-stone-400">×{e.count}</span>
                      )}
                      {e.kind === 'tool' && e.status === 'running' && (
                        <span className="ml-2 text-[13px] text-stone-400">đang chạy…</span>
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

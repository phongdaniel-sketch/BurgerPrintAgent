# BurgerPrints Agent — Chat UI (Web + Chrome Extension)

Ô chat React để test agent: stream SSE, timeline "thinking" kiểu Claude, render markdown.
Cùng một codebase chạy được **2 chế độ**: web (Vite dev) và **Chrome Extension (Side Panel)**.

## 1. Chạy web (dev)

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173 — proxy /api → backend :3001
```

> Vite proxy `/api` trỏ tới backend (mặc định `http://localhost:3001`, đổi qua biến `BACKEND_URL`).

## 2. Build & cài Chrome Extension (Side Panel native)

```bash
cd frontend
npm install
npm run build        # tạo dist/ — đây chính là extension (đã kèm manifest.json + background.js)
```

Cài vào Chrome:

1. Mở `chrome://extensions`
2. Bật **Developer mode** (góc trên phải)
3. **Load unpacked** → chọn thư mục `frontend/dist`
4. Bấm icon extension trên toolbar → chat mở ở **Side Panel** bên phải

Khi mở lần đầu trong extension, có ô **Backend URL** (mặc định `http://localhost:3001`) — sửa nếu backend chạy cổng/host khác, rồi **Kết nối**.

### Yêu cầu
- Backend đang chạy (mặc định cổng 3001) + Redis + MongoDB.
- Backend đã bật CORS (`app.enableCors()`) → extension gọi cross-origin được.
- `host_permissions` trong manifest cho `http://localhost/*` và `http://127.0.0.1/*`.

## Kiến trúc UI

| File | Vai trò |
|------|---------|
| `src/App.jsx` | Auth + tạo phiên + gửi message + đọc SSE (fetch + ReadableStream) + timeline |
| `src/chat-markdown.css` | Style markdown (copy từ source — kiểu ChatGPT) |
| `src/styles.css` | Layout + shimmer + Tailwind directives |
| `public/manifest.json` | Manifest V3: `side_panel`, `permissions: [sidePanel]`, host_permissions |
| `public/background.js` | Mở Side Panel khi bấm icon (`setPanelBehavior`) |
| `vite.config.js` | `base: './'` (chạy được trong `chrome-extension://`) + proxy dev |

> Stack: React 18, Vite, Tailwind (preflight on), framer-motion, lucide-react, react-markdown + remark-gfm.

## Ghi chú
- Chưa kèm icon → Chrome dùng icon mặc định. Thêm `public/icon{16,48,128}.png` + `action.default_icon` / `icons` trong manifest nếu muốn.
- Build web và extension dùng chung `dist/` (manifest/background vô hại với bản web).

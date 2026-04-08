# wHako - Đọc Light Novel Online

Ứng dụng desktop Electron để đọc light novel tiếng Việt trực tuyến. Nội dung được lấy từ **docln.sbs**.

## Tính năng

- **Đọc light novel** với giao diện mượt mà
- **Text-to-Speech (TTS)** - đọc truyện tự động bằng Google Translate API
- **TTS nâng cao** - điều chỉnh tốc độ, cao độ giọng nói
- **Image cache** - lưu trữ hình ảnh trong RAM (tối đa 500MB, LRU eviction)
- **Lịch sử đọc** - lưu tiến độ đọc, tự động ghi nhận thời gian đọc
- **Lazy loading** - reader được load khi cần để tối ưu bộ nhớ
- **Infinite scroll** - duyệt truyện không giới hạn
- **Dark theme** - giao diện tối dịu mắt

## Cài đặt

```bash
# Cài đặt dependencies
npm install

# Chạy ở chế độ development
npm run dev

# Build cho nền tảng hiện tại
npm run build

# Build cho Windows
npm run build:win

# Build cho macOS
npm run build:mac

# Build cho Linux
npm run build:linux
```

## Yêu cầu

- Node.js 18+
- Electron 41+

## Cấu trúc dự án

```
wHako/
├── assets/                    # Icon ứng dụng (ico, png, icns)
├── scripts/                   # Script build (generate-icons.js)
├── src/
│   ├── main/                  # Electron main process
│   │   ├── main.js          # Window, menu, auto-updater
│   │   ├── scraper.js       # HTTP fetching, HTML parsing, IPC handlers
│   │   └── utils/
│   │       ├── constants.js  # Hằng số (MAX_RETRIES, CACHE_SIZE...)
│   │       ├── crypto.js     # Giải mã nội dung chapter (XOR/shuffle)
│   │       ├── history.js    # Lưu lịch sử đọc (JSON)
│   │       ├── imageCache.js # In-memory cache hình ảnh (LRU 500MB)
│   │       └── sanitizer.js  # Sanitize HTML
│   ├── preload/
│   │   └── preload.js       # Context bridge cho IPC
│   └── renderer/             # Giao diện (vanilla JS, Tailwind CDN)
│       ├── app.js            # Root orchestrator
│       ├── state.js          # Global state (window.AppState)
│       ├── navbar.js         # Sidebar, header, pagination
│       ├── home.js           # Comic list, infinite scroll
│       ├── detail.js         # Chi tiết truyện, danh sách chapter
│       ├── reader.js         # Reader (lazy-loaded khi mở chapter)
│       ├── history.js        # Màn hình lịch sử đọc
│       ├── tts.js            # TTS via Web Audio API
│       ├── utils.js          # Utilities (escHtml, formatNumber...)
│       ├── index.html        # Entry point
│       └── styles/           # CSS files
├── .env.example              # Template cấu hình
├── package.json
└── README.md
```

## Kiến trúc

### IPC Flow

```
Renderer (window.electronAPI.*)
    ↓ ipcRenderer.invoke
Preload (contextBridge)
    ↓ ipcMain.handle
Main Process (scraper.js)
    ↓ HTTP
docln.sbs
```

Các IPC handlers chính:
| Handler | Mô tả |
|---------|-------|
| `scrape-page` | Lấy danh sách truyện (trang chủ, thịnh hành...) |
| `scrape-detail` | Lấy chi tiết truyện, danh sách chapter |
| `scrape-chapter` | Lấy nội dung chapter (đã giải mã) |
| `tts-google` | Fetch audio TTS |
| `history-get/add/remove` | Quản lý lịch sử đọc |

### Content Decoding

Site nguồn mã hoá text bằng XOR/shuffle. Xem `src/main/utils/crypto.js`:
- `data-s` - method
- `data-k` - key
- `data-c` - chunks base64 (sort theo numeric prefix, decode)

### TTS

- Main process: `fetchTTSNode` post lên Google Translate endpoint
- Renderer: Web Audio API playback với prefetch, rate/pitch control
- Auto-next chapter khi đọc xong (nếu bật)

### Image Cache

- In-memory Map với LRU eviction
- Tối đa 500MB
- Prefetch 5 ảnh đồng thời mỗi trang
- Trả về `data:image/...;base64,...` URI

## Scripts

| Script | Mô tả |
|--------|-------|
| `npm run dev` | Chạy ứng dụng |
| `npm run build` | Build cho nền tảng hiện tại |
| `npm run build:win` | Build cho Windows (.exe portable) |
| `npm run build:mac` | Build cho macOS (.dmg) |
| `npm run build:linux` | Build cho Linux (.AppImage) |
| `npm run lint` | Kiểm tra lint |
| `npm run lint:fix` | Tự động sửa lint |
| `npm run prettier` | Format code |

## Cấu hình

Tạo file `.env` để override:

```env
BASE_URL=https://docln.sbs
```

## Tech Stack

- **Electron 41** - Desktop framework
- **axios** - HTTP client
- **electron-updater** - Auto-update
- **dotenv** - Environment variables
- **Tailwind CSS** (CDN) - Styling
- **Vanilla JS** - Không bundler, không framework

## License

MIT

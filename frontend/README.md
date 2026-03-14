# Vision Guard — Chrome Extension Frontend

AI-powered deepfake image detection Chrome Extension built with React + Vite, packaged as a Manifest V3 extension.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **UI Framework** | React 19 |
| **Bundler** | Vite 7 |
| **Styling** | Vanilla CSS (design tokens + CSS variables) |
| **Fonts** | Google Fonts — Inter, Orbitron |
| **Extension API** | Chrome Extensions Manifest V3 |
| **Browser APIs** | `chrome.tabs`, `chrome.scripting`, `chrome.storage`, `chrome.runtime` |

---

## Project Structure

```
frontend/
├── public/
│   ├── manifest.json          # MV3 extension manifest
│   ├── background.js          # Service worker (message relay + storage)
│   ├── content-script.js      # Injected into pages for Click Image
│   ├── icon16/48/128.png      # Extension icons
│   └── vite.svg
├── src/
│   ├── main.jsx               # React entry point
│   ├── App.jsx                # Root component — state + screen routing
│   ├── index.css              # Design tokens (dark/light themes)
│   ├── api/
│   │   └── index.js           # Backend API layer (mock, to be replaced)
│   ├── components/
│   │   ├── Layout.jsx         # Popup shell (card, corner brackets, glow)
│   │   ├── Button.jsx         # Reusable button (primary/secondary/ghost)
│   │   ├── ImagePreview.jsx   # Image display with blurred bg effect
│   │   ├── ResultCard.jsx     # AI/Real probability bars + verdict
│   │   └── ThemeToggle.jsx    # Dark/Light mode switch
│   ├── pages/
│   │   ├── ScreenOne.jsx      # Home — Upload / Snip / Click / Paste URL
│   │   ├── ScreenTwo.jsx      # Preview + Analyze trigger
│   │   ├── ScreenThree.jsx    # Result display
│   │   └── ScreenSnip.jsx     # Full-card snipping UI
│   └── styles/
│       ├── global.css          # Reset + box-sizing
│       ├── layout.css          # Popup card, header, body, footer
│       └── components.css      # All component-level styles
├── index.html
├── vite.config.js
└── package.json
```

---

## How the Extension Works

### Manifest V3 Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Chrome Browser                        │
│                                                          │
│  ┌─────────────┐    ┌──────────────┐   ┌──────────────┐  │
│  │   Popup      │   │  Background  │   │Content Script│  │
│  │  (React App) │   │  (Service    │   │ (Injected    │  │
│  │              │◄──┤   Worker)    │◄──┤  into tab)   │  │
│  │  index.html  │   │              │   │              │  │
│  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘  │
│         │                  │                  │          │
│    chrome.storage     chrome.runtime      DOM events     │
│    chrome.tabs        .onMessage          img.src        │
│    chrome.scripting                                      │
└──────────────────────────────────────────────────────────┘
```

**Popup** — The React app rendered inside `default_popup`. Fixed at `370×520px`. All UI lives here.

**Background Service Worker** (`background.js`) — Stateless relay. Listens for messages from the content script and persists clicked image URLs to `chrome.storage.local`.

**Content Script** (`content-script.js`) — Injected on-demand via `chrome.scripting.executeScript()`. Adds hover highlights on `<img>` elements, captures the clicked image's `src`, and sends it to the background worker.

---

## Image Input Methods

### 1. Upload Image
- User clicks "Upload Image" → hidden `<input type="file" accept="image/*">` is triggered
- `FileReader.readAsDataURL()` converts the file to a **base64 data URL**
- State: `imageSrc = "data:image/png;base64,..."`, `imageUrl = null`, `sourceType = "upload"`

### 2. Snip Screen
- User clicks "Snip Screen"
- **Chrome API**: `chrome.tabs.captureVisibleTab({ format: "png" })` captures the active tab as a data URL
- User drags a selection rectangle over the screenshot
- On confirm, an offscreen `<canvas>` crops the selected region using `ctx.drawImage()` with calculated pixel offsets
- State: `imageSrc = "data:image/png;base64,..."` (cropped), `imageUrl = null`, `sourceType = "snip"`

### 3. Click Image (on webpage)
- User clicks "Click Image" → popup calls `chrome.scripting.executeScript()` to inject `content-script.js` into the active tab → popup closes via `window.close()`
- Content script adds hover highlighting and listens for clicks on `<img>` elements
- On click: `chrome.runtime.sendMessage({ type: "IMAGE_CLICKED", url: img.src })` is sent to `background.js`
- Background stores URL in `chrome.storage.local` under `pendingImage`
- Next popup open: `useEffect` reads `chrome.storage.local.get("pendingImage")` and loads the URL
- State: `imageSrc = "https://..."`, `imageUrl = "https://..."`, `sourceType = "url"`

### 4. Paste / Drop URL
- User pastes or drags a URL into the quick-paste bar on Screen One
- The raw URL string is used directly
- State: `imageSrc = "https://..."`, `imageUrl = "https://..."`, `sourceType = "url"`

---

## Data Sent to Backend

```
┌─────────────────┬────────────────────────────┬──────────────┐
│ Method          │ Data for Backend           │ sourceType   │
├─────────────────┼────────────────────────────┼──────────────┤
│ Upload Image    │ Base64 data URL (file)     │ "upload"     │
│ Snip Screen     │ Base64 data URL (cropped)  │ "snip"       │
│ Click Image     │ Image URL string           │ "url"        │
│ Paste URL       │ Image URL string           │ "url"        │
└─────────────────┴────────────────────────────┴──────────────┘
```

**Backend integration point**: `src/api/index.js` — currently a mock. Replace `analyzeImageMock()` with real API calls that branch on `sourceType`:

```js
// sourceType === "upload" || "snip"  →  POST base64 image data as file
// sourceType === "url"              →  POST only the URL string
```

---

## Chrome API Usage

| API | Used In | Purpose |
|---|---|---|
| `chrome.tabs.captureVisibleTab()` | `App.jsx` | Screenshot of active tab for Snip |
| `chrome.scripting.executeScript()` | `App.jsx` | Inject content script for Click Image |
| `chrome.tabs.query()` | `App.jsx` | Get active tab ID |
| `chrome.runtime.sendMessage()` | `content-script.js`, `App.jsx` | Message passing between contexts |
| `chrome.runtime.onMessage` | `background.js` | Listen for messages from content script |
| `chrome.storage.local.set/get/remove` | `background.js`, `App.jsx` | Persist clicked image URL across popup sessions |

---

## Testing

```bash
# Frontend (Vitest + React Testing Library)
npm run test          # single run
npm run test:watch    # watch mode
```

Tests cover the API layer (`src/api/index.js`) and UI components (e.g. `ResultCard`). Backend and AI service tests live in sibling folders:

- **Backend** (Spring Boot): `../backend` → `mvn test` (controller + app context)
- **AI service** (FastAPI): `../ai-service` → `pip install pytest` then `pytest test_main.py -v` (health + detect validation; first run loads models and can take ~1 min)

---

## Build & Load

```bash
# Install dependencies
cd frontend
npm install

# Development
npm run dev

# Production build
npm run build
```

**Load into Chrome:**
1. Navigate to `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `frontend/dist/` folder
4. The Vision Guard icon appears in the toolbar

---

## Theming

Two themes controlled via `data-theme` attribute on `<html>`:
- **Dark** (default) — Sci-fi HUD aesthetic with cyan accents
- **Light** — Clean, professional with teal accents

Theme preference is persisted in `localStorage`. All colors are defined as CSS custom properties in `index.css`.

---

## Required Permissions

| Permission | Reason |
|---|---|
| `activeTab` | Access the current tab for screenshot capture and script injection |
| `scripting` | Inject `content-script.js` into pages for Click Image |
| `storage` | Persist clicked image URLs across popup open/close cycles |

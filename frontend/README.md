# Frontend — Vision Guard Chrome Extension

> React + Vite popup UI for the Vision Guard deepfake detection browser extension.

---

## What this is

The `frontend/` directory is a **Chrome Extension Manifest V3** popup built with React 19 and Vite 7. It is the user-facing part of Vision Guard — a small popup window that appears when you click the extension icon in the Chrome toolbar. From here, users can select an image and trigger an analysis against the backend.

This is **not** a regular website. After `npm run build`, the compiled output in `dist/` is loaded directly into Chrome as an **unpacked extension**.

---

## Tech Stack

| Tool | Purpose |
|---|---|
| **React 19** | Component-based UI |
| **Vite 7** | Build tool, hot reload in dev |
| **TailwindCSS 4** | Utility-first CSS via Vite plugin |
| **Chrome Extension Manifest V3** | Extension platform APIs |
| **Vitest** + **Testing Library** | Unit tests |

---

## Extension Structure

```
frontend/
├── public/
│   ├── manifest.json        # Chrome Extension manifest (MV3)
│   ├── background.js        # Service worker — stores clicked image URLs
│   ├── content-script.js    # Injected into pages to capture image clicks
│   └── icon*.png            # Extension icons (16, 48, 128px)
│
└── src/
    ├── main.jsx             # React root mount
    ├── App.jsx              # Root component — screen router & global state
    ├── pages/
    │   ├── ScreenOne.jsx    # Home screen — input method picker
    │   ├── ScreenTwo.jsx    # Preview & Analyze screen
    │   ├── ScreenThree.jsx  # Analysis result display
    │   └── ScreenSnip.jsx   # Screen crop / snip UI
    ├── components/
    │   ├── Button.jsx       # Reusable button
    │   ├── ImagePreview.jsx # Image thumbnail component
    │   ├── Layout.jsx       # Outer wrapper / shell
    │   ├── ResultCard.jsx   # Probability verdict card
    │   └── ThemeToggle.jsx  # Dark / Light toggle
    ├── api/
    │   └── index.js         # Backend API client (POST /detect)
    └── styles/              # CSS modules / layout styles
```

---

## Screen Flow

```
ScreenOne (Home)
  │
  ├── Upload Image  ──► FileReader (data URL) ──► ScreenTwo (Preview)
  ├── Snip Screen   ──► captureVisibleTab ──► ScreenSnip ──► ScreenTwo
  ├── Click Image   ──► inject content-script → user clicks → popup re-opens ──► ScreenTwo
  └── Paste URL     ──► ScreenTwo (Preview)
                               │
                          POST /detect
                               │
                         ScreenThree (Result)
```

---

## How Each Input Method Works

### Upload Image
- A hidden `<input type="file" accept="image/*">` is triggered on button click.
- `FileReader.readAsDataURL()` converts the file to a base64 data URL for local preview.
- **Note:** Only URL-based images are forwarded to the backend; file analysis shows a "coming soon" message.

### Snip Screen
- `chrome.tabs.captureVisibleTab({ format: "png" })` takes a screenshot of the active tab.
- The popup navigates to `ScreenSnip`, where the user draws a selection box over the screenshot.
- On confirm, the cropped region (data URL) is passed back to the preview screen.

### Click Image
- `chrome.scripting.executeScript` injects `content-script.js` into the active tab.
- The popup immediately closes (`window.close()`).
- The content script listens for a left-click on any `<img>` element and stores the image `src` URL in `chrome.storage.local` (key: `pendingImage`).
- Next time the popup opens, `App.jsx`'s mount effect reads `pendingImage`, clears it, and auto-navigates to the preview screen with that URL.

### Paste URL
- A drag-and-drop / paste input bar on `ScreenOne` accepts HTTP/HTTPS URLs.
- Validates the URL starts with `http://` or `https://` before proceeding.

---

## API Integration

The popup calls the **Spring Boot backend** at `http://localhost:8080/detect`.

```js
// src/api/index.js
const BACKEND_URL = "http://localhost:8080";

POST /detect
Content-Type: application/json
Body: { "imageUrl": "https://example.com/photo.jpg" }

Response: { "prediction": "AI Generated", "confidence": "high", "final_score": 0.87 }
```

To change the backend URL, edit `src/api/index.js`:
```js
const BACKEND_URL = "http://localhost:8080";
```

---

## Chrome Extension Permissions

| Permission | Why it's needed |
|---|---|
| `activeTab` | Take a screenshot of the current tab (`captureVisibleTab`), inject content script |
| `scripting` | `executeScript` to inject `content-script.js` into a page |
| `storage` | Pass the clicked image URL from `content-script.js` to the popup |

---

## Dev Setup

```bash
# Install dependencies
npm install

# Run dev server (not the extension — useful for component work)
npm run dev

# Build the extension bundle
npm run build

# Run unit tests
npm test
```

### Load as Unpacked Extension in Chrome

1. Run `npm run build`
2. Open `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** → select the `frontend/dist/` folder
5. The Vision Guard icon will appear in the Chrome toolbar

---

## Unit Tests

Tests are in `src/**/*.test.jsx` and `src/**/*.test.js`, run with **Vitest** + **@testing-library/react**.

```bash
npm test          # run once
npm run test:watch  # watch mode
```

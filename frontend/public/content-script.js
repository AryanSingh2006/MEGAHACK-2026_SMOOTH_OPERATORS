// Content script injected into the active tab when "Click Image" is used.
// It highlights images on hover and captures the clicked image's URL.

(function () {
  // --- Re-injection guard ---
  // If already active, clean up the old session first so we always start fresh.
  if (window.__imagePickerActive) {
    if (typeof window.__imagePickerCleanup === 'function') {
      window.__imagePickerCleanup();
    }
  }
  window.__imagePickerActive = true;

  // ─── Styles ────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.id = '__image-picker-style';
  style.textContent = `
    .__img-picker-overlay {
      outline: 3px solid #00d4ff !important;
      outline-offset: 2px !important;
      cursor: crosshair !important;
      box-shadow: 0 0 20px rgba(0, 212, 255, 0.5) !important;
      transition: outline-color 0.15s, box-shadow 0.15s !important;
    }
    .__img-picker-banner {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 2147483647;
      background: linear-gradient(135deg, #0a0e17 0%, #0d1b2a 100%);
      color: #00d4ff;
      text-align: center;
      padding: 10px 20px;
      font-family: 'Segoe UI', system-ui, sans-serif;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.4px;
      border-bottom: 2px solid #00d4ff;
      box-shadow: 0 4px 20px rgba(0, 212, 255, 0.25);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
      animation: __bannerSlide 0.25s ease-out;
    }
    .__img-picker-banner .hint {
      color: rgba(255,255,255,0.55);
      font-weight: 400;
      font-size: 12px;
    }
    .__img-picker-banner .cancel-btn {
      background: rgba(0,212,255,0.12);
      border: 1px solid rgba(0,212,255,0.4);
      color: #00d4ff;
      padding: 3px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      letter-spacing: 0.5px;
      transition: background 0.15s;
    }
    .__img-picker-banner .cancel-btn:hover {
      background: rgba(0,212,255,0.25);
    }
    @keyframes __bannerSlide {
      from { transform: translateY(-100%); opacity: 0; }
      to   { transform: translateY(0);     opacity: 1; }
    }
  `;
  document.head.appendChild(style);

  // ─── Banner ─────────────────────────────────────────────────────────────────
  const banner = document.createElement('div');
  banner.className = '__img-picker-banner';
  banner.innerHTML = `
    <span>🎯 Click on any image to select it</span>
    <span class="hint">Press ESC to cancel</span>
    <button class="cancel-btn" id="__img-picker-cancel">✕ Cancel</button>
  `;
  document.body.appendChild(banner);

  let lastHovered = null;
  let autoTimeout = null;

  // ─── Safe message sender ─────────────────────────────────────────────────────
  // Wraps chrome.runtime.sendMessage so a dead extension context never crashes.
  function safeMessage(msg) {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
        chrome.runtime.sendMessage(msg);
      }
    } catch (_) {
      // Extension context invalidated — silently ignore.
    }
  }

  // ─── Cleanup ─────────────────────────────────────────────────────────────────
  function cleanup() {
    // Always run cleanup first — then try to message the extension.
    window.__imagePickerActive = false;
    window.__imagePickerCleanup = null;

    clearTimeout(autoTimeout);

    document.removeEventListener('mouseover', onMouseOver, true);
    document.removeEventListener('mouseout',  onMouseOut,  true);
    document.removeEventListener('click',     onClick,     true);
    document.removeEventListener('keydown',   onKeyDown,   true);

    if (lastHovered) {
      lastHovered.classList.remove('__img-picker-overlay');
      lastHovered = null;
    }

    const styleEl = document.getElementById('__image-picker-style');
    if (styleEl) styleEl.remove();
    if (banner.parentNode) banner.remove();
  }

  // Expose so a re-injected script can call it.
  window.__imagePickerCleanup = cleanup;

  // ─── Event handlers ──────────────────────────────────────────────────────────
  function onMouseOver(e) {
    const img = e.target.closest('img');
    if (img && img !== lastHovered) {
      if (lastHovered) lastHovered.classList.remove('__img-picker-overlay');
      img.classList.add('__img-picker-overlay');
      lastHovered = img;
    }
  }

  function onMouseOut(e) {
    const img = e.target.closest('img');
    if (img) {
      img.classList.remove('__img-picker-overlay');
      if (lastHovered === img) lastHovered = null;
    }
  }

  function onClick(e) {
    // Clicking the Cancel button in the banner
    if (e.target && e.target.id === '__img-picker-cancel') {
      e.preventDefault();
      e.stopPropagation();
      cleanup();
      safeMessage({ type: 'IMAGE_PICK_CANCELLED' });
      return;
    }

    const img = e.target.closest('img');
    if (img) {
      // Clicked an image — capture it
      e.preventDefault();
      e.stopPropagation();
      const imageUrl = img.src || img.currentSrc;
      cleanup();
      safeMessage({ type: 'IMAGE_CLICKED', url: imageUrl });
    } else {
      // Clicked on empty area / non-image — cancel
      // (Only if the click is NOT inside the banner itself)
      if (!banner.contains(e.target)) {
        cleanup();
        safeMessage({ type: 'IMAGE_PICK_CANCELLED' });
      }
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      // cleanup FIRST — never block on the message
      cleanup();
      safeMessage({ type: 'IMAGE_PICK_CANCELLED' });
    }
  }

  // ─── Auto-cancel after 45 seconds ───────────────────────────────────────────
  // Prevents the overlay from being stuck forever if the user ignores it.
  autoTimeout = setTimeout(() => {
    cleanup();
    safeMessage({ type: 'IMAGE_PICK_CANCELLED' });
  }, 45_000);

  // ─── Attach listeners ────────────────────────────────────────────────────────
  document.addEventListener('mouseover', onMouseOver, true);
  document.addEventListener('mouseout',  onMouseOut,  true);
  document.addEventListener('click',     onClick,     true);
  document.addEventListener('keydown',   onKeyDown,   true);
})();

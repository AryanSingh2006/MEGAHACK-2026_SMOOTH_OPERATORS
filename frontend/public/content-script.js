// Content script injected into the active tab when "Click Image" is used.
// It highlights images on hover and captures the clicked image's URL.

(function () {
  // Avoid double-injection
  if (window.__imagePickerActive) return;
  window.__imagePickerActive = true;

  // Create overlay style
  const style = document.createElement('style');
  style.id = '__image-picker-style';
  style.textContent = `
    .__img-picker-overlay {
      outline: 3px solid #00d4ff !important;
      outline-offset: 2px !important;
      cursor: crosshair !important;
      box-shadow: 0 0 20px rgba(0, 212, 255, 0.5) !important;
      transition: outline-color 0.2s, box-shadow 0.2s !important;
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
      padding: 12px 20px;
      font-family: 'Segoe UI', system-ui, sans-serif;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.5px;
      border-bottom: 2px solid #00d4ff;
      box-shadow: 0 4px 20px rgba(0, 212, 255, 0.3);
      animation: __bannerSlide 0.3s ease-out;
    }
    .__img-picker-banner span {
      color: rgba(255,255,255,0.7);
      font-weight: 400;
      margin-left: 8px;
    }
    @keyframes __bannerSlide {
      from { transform: translateY(-100%); opacity: 0; }
      to   { transform: translateY(0);     opacity: 1; }
    }
  `;
  document.head.appendChild(style);

  // Create banner
  const banner = document.createElement('div');
  banner.className = '__img-picker-banner';
  banner.innerHTML = '🎯 Click on any image to select it<span>Press ESC to cancel</span>';
  document.body.appendChild(banner);

  let lastHovered = null;

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

  function cleanup() {
    document.removeEventListener('mouseover', onMouseOver, true);
    document.removeEventListener('mouseout', onMouseOut, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    if (lastHovered) lastHovered.classList.remove('__img-picker-overlay');
    const styleEl = document.getElementById('__image-picker-style');
    if (styleEl) styleEl.remove();
    if (banner.parentNode) banner.remove();
    window.__imagePickerActive = false;
  }

  function onClick(e) {
    const img = e.target.closest('img');
    if (img) {
      e.preventDefault();
      e.stopPropagation();
      const imageUrl = img.src || img.currentSrc;
      // Send the URL back to the extension
      chrome.runtime.sendMessage({ type: 'IMAGE_CLICKED', url: imageUrl });
      cleanup();
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      chrome.runtime.sendMessage({ type: 'IMAGE_PICK_CANCELLED' });
      cleanup();
    }
  }

  document.addEventListener('mouseover', onMouseOver, true);
  document.addEventListener('mouseout', onMouseOut, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown, true);
})();

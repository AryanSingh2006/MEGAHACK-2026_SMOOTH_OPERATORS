import React, { useRef, useState } from "react";
import ThemeToggle from "../components/ThemeToggle.jsx";
import "../styles/layout.css";
import "../styles/components.css";

const UploadIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const SnipIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <line x1="20" y1="4" x2="8.12" y2="15.88" />
    <line x1="14.47" y1="14.48" x2="20" y2="20" />
    <line x1="8.12" y1="8.12" x2="12" y2="12" />
  </svg>
);

const ClickIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 3l0 14l4-4h4z" />
    <path d="M13 17l3 3" />
    <path d="M16 14l3 3" />
  </svg>
);

const ShieldLogo = () => (
  <div className="app-logo">
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 22C12 22 20 18 20 12V5L12 2L4 5V12C4 18 12 22 12 22Z" fill="url(#logo-grad)" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M9 12L11 14L15 10" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <defs>
        <linearGradient id="logo-grad" x1="4" y1="2" x2="20" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00d4ff" />
          <stop offset="1" stopColor="#0090b8" />
        </linearGradient>
      </defs>
    </svg>
  </div>
);

function ScreenOne({ onUploadImage, onSnipScreen, onClickImage, theme, onToggleTheme, clickImageStatus, onUrlSubmit, onCancelClickImage }) {
  const fileInputRef = useRef(null);
  const [urlInput, setUrlInput] = useState("");
  const [pasteUrl, setPasteUrl] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);

  const handleUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      onUploadImage(event.target.result);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleUrlSubmit = (e) => {
    e.preventDefault();
    if (urlInput.trim()) {
      onUrlSubmit(urlInput.trim());
    }
  };

  const handlePasteSubmit = (e) => {
    e.preventDefault();
    if (pasteUrl.trim()) {
      onUrlSubmit(pasteUrl.trim());
    }
  };

  // Handle drag & drop of URLs/text onto the paste bar
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const text = e.dataTransfer.getData("text/plain") || e.dataTransfer.getData("text/uri-list");
    if (text && text.trim()) {
      setPasteUrl(text.trim());
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  return (
    <div className="screen-wrapper">
      <div className="popup-header">
        <div className="popup-header-main">
          <ShieldLogo />
          <div className="popup-header-text">
            <h1 className="popup-title">Vision Guard</h1>
            <p className="popup-subtitle">
              Advanced deepfake detection system.
            </p>
          </div>
        </div>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
      <div className="popup-body">
        {/* Hidden file input — accepts image files only */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={handleFileChange}
        />

        {/* Show URL input when in fallback mode (dev environment) */}
        {clickImageStatus === "fallback" && (
          <div className="url-input-panel">
            <div className="url-input-header">
              <span className="url-input-title">Enter Image URL</span>
              <button className="url-input-close" onClick={onCancelClickImage} type="button">&times;</button>
            </div>
            <form onSubmit={handleUrlSubmit} className="url-input-form">
              <input
                type="url"
                className="url-input-field"
                placeholder="https://example.com/image.jpg"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                autoFocus
              />
              <button type="submit" className="url-input-submit" disabled={!urlInput.trim()}>
                Go
              </button>
            </form>
          </div>
        )}

        {/* Waiting state */}
        {clickImageStatus === "waiting" && (
          <div className="click-image-status">
            <div className="status-pulse"></div>
            <span className="status-text">Waiting for image selection…</span>
            <span className="status-hint">Click any image on the page</span>
          </div>
        )}

        {/* Error state */}
        {clickImageStatus === "error" && (
          <div className="click-image-status click-image-error">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <span className="status-text">Could not access the tab</span>
            <button className="status-retry" onClick={onCancelClickImage}>Try Again</button>
          </div>
        )}

        {/* Action cards — show when no special status */}
        {!clickImageStatus && (
          <>
            <div className="action-cards">
              <button className="action-card" onClick={handleUploadClick} id="upload-image-btn">
                <div className="action-card-icon">
                  <UploadIcon />
                </div>
                <div className="action-card-text">
                  <span className="action-card-label">Upload Image</span>
                  <span className="action-card-desc">Select an image file from your device</span>
                </div>
                <div className="action-card-arrow">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              </button>

              <button className="action-card" onClick={onSnipScreen} id="snip-screen-btn">
                <div className="action-card-icon icon-snip">
                  <SnipIcon />
                </div>
                <div className="action-card-text">
                  <span className="action-card-label">Snip Screen</span>
                  <span className="action-card-desc">Capture a region of your screen</span>
                </div>
                <div className="action-card-arrow">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              </button>

              <button className="action-card" onClick={onClickImage} id="click-image-btn">
                <div className="action-card-icon icon-click">
                  <ClickIcon />
                </div>
                <div className="action-card-text">
                  <span className="action-card-label">Click Image</span>
                  <span className="action-card-desc">Select any image from a webpage</span>
                </div>
                <div className="action-card-arrow">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              </button>
            </div>

            {/* Divider */}
            <div className="paste-divider">
              <div className="paste-divider-line"></div>
              <span className="paste-divider-text">or paste a link</span>
              <div className="paste-divider-line"></div>
            </div>

            {/* Quick paste URL bar */}
            <form
              className={`paste-url-bar ${isDragOver ? "paste-url-bar--drag" : ""}`}
              onSubmit={handlePasteSubmit}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              id="paste-url-bar"
            >
              <div className="paste-url-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                </svg>
              </div>
              <input
                type="text"
                className="paste-url-input"
                placeholder="Paste or drop image URL here…"
                value={pasteUrl}
                onChange={(e) => setPasteUrl(e.target.value)}
              />
              {pasteUrl.trim() && (
                <button type="submit" className="paste-url-go">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </button>
              )}
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default ScreenOne;

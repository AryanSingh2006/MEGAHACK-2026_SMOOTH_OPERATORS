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

function ScreenOne({ onUploadImage, onSnipScreen, onClickImage, theme, onToggleTheme, clickImageStatus, onUrlSubmit, onCancelClickImage }) {
  const fileInputRef = useRef(null);
  const [urlInput, setUrlInput] = useState("");

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

  return (
    <div className="screen-wrapper">
      <div className="popup-header">
        <div className="popup-header-text">
          <h1 className="popup-title">Image Checker</h1>
          <p className="popup-subtitle">
            Choose how you'd like to provide an image for AI detection.
          </p>
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
        )}
      </div>
    </div>
  );
}

export default ScreenOne;

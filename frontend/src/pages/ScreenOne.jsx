import React from "react";
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

const CameraIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

function ScreenOne({ onUploadImage, onSnipScreen, onClickImage }) {
  return (
    <div className="screen-wrapper">
      <div className="popup-header">
        <h1 className="popup-title">Image Checker</h1>
        <p className="popup-subtitle">
          Choose how you'd like to provide an image for AI detection analysis.
        </p>
      </div>
      <div className="popup-body">
        <div className="action-cards">
          <button className="action-card" onClick={onUploadImage}>
            <div className="action-card-icon">
              <UploadIcon />
            </div>
            <div className="action-card-text">
              <span className="action-card-label">Upload Image</span>
              <span className="action-card-desc">Select a file from your device</span>
            </div>
          </button>

          <button className="action-card" onClick={onSnipScreen}>
            <div className="action-card-icon">
              <SnipIcon />
            </div>
            <div className="action-card-text">
              <span className="action-card-label">Snip Screen</span>
              <span className="action-card-desc">Capture a region of your screen</span>
            </div>
          </button>

          <button className="action-card" onClick={onClickImage}>
            <div className="action-card-icon">
              <CameraIcon />
            </div>
            <div className="action-card-text">
              <span className="action-card-label">Click Image</span>
              <span className="action-card-desc">Select any image from a webpage</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

export default ScreenOne;

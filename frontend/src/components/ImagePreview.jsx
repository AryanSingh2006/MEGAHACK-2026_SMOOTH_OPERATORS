import React from "react";
import "../styles/components.css";

function ImagePreview({ src }) {
  return (
    <div className="image-preview">
      {src ? (
        <>
          <div className="image-preview-blur" style={{ backgroundImage: `url(${src})` }} />
          <img
            src={src}
            alt="Selected image for analysis"
            className="image-preview-img"
          />
        </>
      ) : (
        <div className="image-preview-placeholder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <span>No image selected yet</span>
        </div>
      )}
    </div>
  );
}

export default ImagePreview;

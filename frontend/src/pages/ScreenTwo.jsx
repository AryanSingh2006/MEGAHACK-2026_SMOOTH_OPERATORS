import React, { useState } from "react";
import Button from "../components/Button.jsx";
import ImagePreview from "../components/ImagePreview.jsx";
import { analyzeImageMock } from "../api/index.js";
import "../styles/layout.css";
import "../styles/components.css";

function ScreenTwo({ imageSrc, imageUrl, onBack, onAnalyze }) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleAnalyzeClick = async () => {
    if (!imageSrc) return;
    setIsAnalyzing(true);
    try {
      const result = await analyzeImageMock(imageSrc);
      onAnalyze(result);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="screen-wrapper">
      <div className="popup-header">
        <div className="popup-header-text">
          <h1 className="popup-title">Preview &amp; Analyze</h1>
          <p className="popup-subtitle">
            Review the image, then run analysis.
          </p>
        </div>
      </div>
      <div className="popup-body">
        {isAnalyzing ? (
          <div className="spinner-wrapper">
            <div className="spinner" />
            <span className="spinner-text">Analyzing…</span>
          </div>
        ) : (
          <>
            <ImagePreview src={imageSrc} />
            {/* Show the extracted URL when image was selected via Click Image */}
            {imageUrl && (
              <div className="image-url-display">
                <div className="image-url-label">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                  </svg>
                  <span>Extracted URL</span>
                </div>
                <div className="image-url-value" title={imageUrl}>
                  {imageUrl}
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <div className="popup-footer">
        <Button variant="ghost" onClick={onBack} disabled={isAnalyzing}>
          Back
        </Button>
        <Button
          variant="primary"
          onClick={handleAnalyzeClick}
          disabled={!imageSrc || isAnalyzing}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          Analyze
        </Button>
      </div>
    </div>
  );
}

export default ScreenTwo;

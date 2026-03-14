import React, { useState } from "react";
import Button from "../components/Button.jsx";
import ImagePreview from "../components/ImagePreview.jsx";
import { analyzeImageByUrl } from "../api/index.js";
import "../styles/layout.css";
import "../styles/components.css";

function ScreenTwo({ imageSrc, imageUrl, sourceType = "upload", onBack, onAnalyze }) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState(null);

  const handleAnalyzeClick = async () => {
    if (!imageSrc) return;
    setIsAnalyzing(true);
    setError(null);

    try {
      // For URL-based methods (paste URL, click image), call the backend
      if (sourceType === "url" && imageUrl) {
        const result = await analyzeImageByUrl(imageUrl);
        onAnalyze(result);
      } else {
        // For file uploads / snips — not yet implemented
        setError("File upload analysis coming soon. Use a URL for now.");
        setIsAnalyzing(false);
      }
    } catch (err) {
      console.error("Analysis failed:", err);
      setError(err.message || "Analysis failed. Please try again.");
      setIsAnalyzing(false);
    }
  };

  // Determine the source label based on how the image was provided
  const sourceLabel =
    sourceType === "url"
      ? "Extracted from webpage"
      : sourceType === "snip"
        ? "Captured via screen snip"
        : "Uploaded from device";

  return (
    <div className="screen-wrapper">
      <div className="popup-header">
        <div className="popup-header-text">
          <h1 className="popup-title">Preview &amp; Analyze</h1>
          <p className="popup-subtitle">
            {sourceLabel} — review the image, then run analysis.
          </p>
        </div>
      </div>
      <div className="popup-body">
        {isAnalyzing ? (
          <div className="spinner-wrapper">
            <div className="spinner" />
            <span className="spinner-text">Analyzing…</span>
            <span className="spinner-subtext">Sending to detection service</span>
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
                  <span>Image URL</span>
                  <button
                    className="url-copy-btn"
                    type="button"
                    title="Copy URL"
                    onClick={() => {
                      navigator.clipboard.writeText(imageUrl).catch(() => { });
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                    </svg>
                  </button>
                </div>
                <div className="image-url-value" title={imageUrl}>
                  {imageUrl}
                </div>
              </div>
            )}

            {/* Error message */}
            {error && (
              <div className="analysis-error">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{error}</span>
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

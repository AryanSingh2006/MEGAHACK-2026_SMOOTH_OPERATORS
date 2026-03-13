import React, { useState } from "react";
import Button from "../components/Button.jsx";
import ImagePreview from "../components/ImagePreview.jsx";
import { analyzeImageMock } from "../api/index.js";
import "../styles/layout.css";

function ScreenTwo({ imageSrc, onBack, onAnalyze }) {
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
    <>
      <div className="popup-header">
        <h1 className="popup-title">Preview & Analyze</h1>
        <p className="popup-subtitle">
          Review the image, then run a quick analysis.
        </p>
      </div>
      <div className="popup-body">
        <ImagePreview src={imageSrc} />
      </div>
      <div className="popup-footer">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button
          onClick={handleAnalyzeClick}
          disabled={!imageSrc || isAnalyzing}
        >
          {isAnalyzing ? "Analyzing..." : "Analyze"}
        </Button>
      </div>
    </>
  );
}

export default ScreenTwo;


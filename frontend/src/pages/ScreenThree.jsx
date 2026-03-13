import React from "react";
import Button from "../components/Button.jsx";
import ResultCard from "../components/ResultCard.jsx";
import "../styles/layout.css";

function ScreenThree({ analysisResult, onStartOver }) {
  return (
    <div className="screen-wrapper">
      <div className="popup-header">
        <h1 className="popup-title">Analysis Result</h1>
        <p className="popup-subtitle">
          Here's how the image scores as AI-generated vs. real.
        </p>
      </div>
      <div className="popup-body">
        <ResultCard result={analysisResult} />
      </div>
      <div className="popup-footer">
        <Button variant="secondary" onClick={onStartOver}>
          Start Over
        </Button>
      </div>
    </div>
  );
}

export default ScreenThree;

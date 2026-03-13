import React from "react";
import Button from "../components/Button.jsx";
import ResultCard from "../components/ResultCard.jsx";
import "../styles/layout.css";

function ScreenThree({ analysisResult, onStartOver }) {
  return (
    <div className="screen-wrapper">
      <div className="popup-header">
        <div className="popup-header-text">
          <h1 className="popup-title">Analysis Result</h1>
          <p className="popup-subtitle">
            AI detection probability analysis complete.
          </p>
        </div>
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

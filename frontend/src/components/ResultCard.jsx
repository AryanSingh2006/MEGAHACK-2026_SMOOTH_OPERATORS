import React from "react";
import "../styles/components.css";

function formatPercent(value) {
  if (value === null || value === undefined) return "-";
  return `${value.toFixed(1)}%`;
}

function ResultCard({ result }) {
  const { aiPercent, realPercent, description } = result || {};

  return (
    <div className="result-card">
      <div className="result-row">
        <span className="result-label">AI</span>
        <span className="result-value">{formatPercent(aiPercent)}</span>
      </div>
      <div className="result-row">
        <span className="result-label">Real</span>
        <span className="result-value">{formatPercent(realPercent)}</span>
      </div>
      <div>
        <div className="result-description-label">Description</div>
        <div className="result-description-text">
          {description || "Run analysis to see details about this image."}
        </div>
      </div>
    </div>
  );
}

export default ResultCard;


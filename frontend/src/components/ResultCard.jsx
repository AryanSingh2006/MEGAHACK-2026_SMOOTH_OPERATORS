import React, { useEffect, useState } from "react";
import "../styles/components.css";

function formatPercent(value) {
  if (value === null || value === undefined) return "-";
  return `${value.toFixed(1)}%`;
}

function ResultCard({ result }) {
  const { aiPercent, realPercent, description } = result || {};
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 80);
    return () => clearTimeout(timer);
  }, []);

  const isAI = aiPercent != null && realPercent != null && aiPercent > realPercent;
  const mainPercent = isAI ? aiPercent : realPercent;

  return (
    <div className="result-card">
      {/* Big probability display */}
      {mainPercent != null && (
        <div className="probability-display">
          <div className="probability-label">Probability Meter</div>
          <div className={`probability-value ${isAI ? "prob-ai" : "prob-real"}`}>
            {mainPercent.toFixed(0)}%
          </div>
        </div>
      )}

      {/* Verdict badge */}
      {aiPercent != null && (
        <div className={`verdict-badge ${isAI ? "verdict-ai" : "verdict-real"}`}>
          {isAI ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          )}
          {isAI ? "AI Generated" : "Likely Real"}
        </div>
      )}

      {/* AI bar */}
      <div className="result-row">
        <div className="result-row-header">
          <span className="result-label">AI Generated</span>
          <span className="result-value">{formatPercent(aiPercent)}</span>
        </div>
        <div className="result-bar-track">
          <div
            className="result-bar-fill bar-ai"
            style={{ width: animated && aiPercent != null ? `${aiPercent}%` : "0%" }}
          />
        </div>
      </div>

      {/* Real bar */}
      <div className="result-row">
        <div className="result-row-header">
          <span className="result-label">Real</span>
          <span className="result-value">{formatPercent(realPercent)}</span>
        </div>
        <div className="result-bar-track">
          <div
            className="result-bar-fill bar-real"
            style={{ width: animated && realPercent != null ? `${realPercent}%` : "0%" }}
          />
        </div>
      </div>

      {/* Description */}
      <div>
        <div className="result-description-label">Analysis</div>
        <div className="result-description-text">
          {description || "Run analysis to see details about this image."}
        </div>
      </div>
    </div>
  );
}

export default ResultCard;

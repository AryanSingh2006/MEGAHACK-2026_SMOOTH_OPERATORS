import React, { useEffect, useState } from "react";
import "../styles/components.css";

/**
 * Interprets the backend response:
 *   prediction  — "AI Generated" | "Real" | "Uncertain" (string)
 *   confidence  — "high" | "medium" | "low" (string)
 *   final_score — 0.0 – 1.0 (double, closer to 1 = more likely AI generated)
 */
function ResultCard({ result }) {
  const { prediction, confidence, final_score } = result || {};
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Determine the verdict category
  const predLower = (prediction || "").toLowerCase();
  const isFake = predLower === "ai generated";
  const isReal = predLower === "real";
  const isUncertain = predLower === "uncertain";

  const scorePercent = final_score != null ? Math.round(final_score * 100) : null;
  const realPercent = scorePercent != null ? 100 - scorePercent : null;

  // Confidence badge color
  const confidenceClass =
    confidence === "high" ? "confidence-high" :
    confidence === "medium" ? "confidence-medium" : "confidence-low";

  // Verdict section class
  const verdictClass = isFake ? "verdict-fake" : isUncertain ? "verdict-uncertain" : "verdict-real";
  const gaugeClass = isFake ? "gauge-fake" : isUncertain ? "gauge-uncertain" : "gauge-real";
  const gaugeFillClass = isFake ? "gauge-fill-fake" : isUncertain ? "gauge-fill-uncertain" : "gauge-fill-real";

  // Verdict display text
  const verdictText = isFake ? "AI Generated" : isUncertain ? "Uncertain" : "Likely Real";

  return (
    <div className="result-card">
      {/* ── Verdict Section ── */}
      <div className={`result-verdict-section ${verdictClass}`}>
        <div className="result-verdict-icon">
          {isFake ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          ) : isUncertain ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          )}
        </div>
        <div className="result-verdict-text">
          {verdictText}
        </div>
        <div className="result-verdict-subtitle">
          Detection Verdict
        </div>
      </div>

      {/* ── Score Gauge ── */}
      {scorePercent != null && (
        <div className="result-gauge-section">
          <div className="result-gauge-header">
            <span className="result-gauge-label">Detection Score</span>
            <span className={`result-gauge-value ${gaugeClass}`}>
              {scorePercent}%
            </span>
          </div>
          <div className="result-gauge-track">
            <div
              className={`result-gauge-fill ${gaugeFillClass}`}
              style={{ width: animated ? `${scorePercent}%` : "0%" }}
            />
            <div className="result-gauge-markers">
              <span></span><span></span><span></span><span></span><span></span>
            </div>
          </div>
          <div className="result-gauge-legend">
            <span className="legend-real">Real</span>
            <span className="legend-fake">AI Generated</span>
          </div>
        </div>
      )}

      {/* ── Breakdown Bars ── */}
      <div className="result-breakdown">
        <div className="result-breakdown-row">
          <div className="result-breakdown-header">
            <span className="result-breakdown-label">
              <span className="breakdown-dot dot-fake"></span>
              AI Generated Probability
            </span>
            <span className="result-breakdown-value">{scorePercent != null ? `${scorePercent}%` : "-"}</span>
          </div>
          <div className="result-bar-track">
            <div
              className="result-bar-fill bar-ai"
              style={{ width: animated && scorePercent != null ? `${scorePercent}%` : "0%" }}
            />
          </div>
        </div>

        <div className="result-breakdown-row">
          <div className="result-breakdown-header">
            <span className="result-breakdown-label">
              <span className="breakdown-dot dot-real"></span>
              Real Probability
            </span>
            <span className="result-breakdown-value">{realPercent != null ? `${realPercent}%` : "-"}</span>
          </div>
          <div className="result-bar-track">
            <div
              className="result-bar-fill bar-real"
              style={{ width: animated && realPercent != null ? `${realPercent}%` : "0%" }}
            />
          </div>
        </div>
      </div>

      {/* ── Metadata Grid ── */}
      <div className="result-meta-grid">
        <div className="result-meta-item">
          <div className="result-meta-label">Confidence</div>
          <div className={`result-meta-badge ${confidenceClass}`}>
            {confidence || "—"}
          </div>
        </div>
        <div className="result-meta-item">
          <div className="result-meta-label">Raw Score</div>
          <div className="result-meta-value">
            {final_score != null ? final_score.toFixed(4) : "—"}
          </div>
        </div>
        <div className="result-meta-item">
          <div className="result-meta-label">Prediction</div>
          <div className="result-meta-value result-meta-prediction">
            {prediction || "—"}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ResultCard;

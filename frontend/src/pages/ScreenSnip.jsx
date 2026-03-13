import React, { useRef, useState, useCallback } from "react";
import "../styles/layout.css";
import "../styles/components.css";

const ScissorsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <line x1="20" y1="4" x2="8.12" y2="15.88" />
    <line x1="14.47" y1="14.48" x2="20" y2="20" />
    <line x1="8.12" y1="8.12" x2="12" y2="12" />
  </svg>
);

const CaptureIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

const ResetIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
  </svg>
);

function ScreenSnip({ screenshotDataUrl, onSnip, onCancel }) {
  const wrapperRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [rect, setRect] = useState(null);   // { x, y, w, h } in 0–1 fractions
  const [startPct, setStartPct] = useState(null);

  // Clamp value between 0 and 1
  const clamp = (v) => Math.max(0, Math.min(1, v));

  // Calculate the displayed dimensions and position of the "contained" image
  const getImageLayout = useCallback(() => {
    if (!wrapperRef.current || !screenshotDataUrl) return null;
    const img = wrapperRef.current.querySelector("img");
    if (!img || !img.naturalWidth) return null;

    const wW = wrapperRef.current.clientWidth;
    const wH = wrapperRef.current.clientHeight;
    const nW = img.naturalWidth;
    const nH = img.naturalHeight;

    const aspect = nW / nH;
    const wrapperAspect = wW / wH;

    let dW, dH, dL, dT;
    if (aspect > wrapperAspect) {
      dW = wW;
      dH = wW / aspect;
      dL = 0;
      dT = (wH - dH) / 2;
    } else {
      dH = wH;
      dW = wH * aspect;
      dL = (wW - dW) / 2;
      dT = 0;
    }
    return { left: dL, top: dT, width: dW, height: dH, nW, nH, wW, wH };
  }, [screenshotDataUrl]);

  const getRelativePos = useCallback((e) => {
    if (!wrapperRef.current) return { x: 0, y: 0 };
    const b = wrapperRef.current.getBoundingClientRect();
    const layout = getImageLayout();

    if (!layout) {
      return {
        x: clamp((e.clientX - b.left) / b.width),
        y: clamp((e.clientY - b.top) / b.height),
      };
    }

    // Return fractions relative to WRAPPER, but clamped to IMAGE
    const mouseX = e.clientX - b.left;
    const mouseY = e.clientY - b.top;

    const clampedX = Math.max(layout.left, Math.min(layout.left + layout.width, mouseX));
    const clampedY = Math.max(layout.top, Math.min(layout.top + layout.height, mouseY));

    return {
      x: clampedX / b.width,
      y: clampedY / b.height,
    };
  }, [getImageLayout]);

  const handleMouseDown = useCallback(
    (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const pos = getRelativePos(e);
      setStartPct(pos);
      setRect({ x: pos.x, y: pos.y, w: 0, h: 0 });
      setIsDragging(true);
    },
    [getRelativePos]
  );

  const handleMouseMove = useCallback(
    (e) => {
      if (!isDragging || !startPct) return;
      e.preventDefault();
      const pos = getRelativePos(e);
      setRect({
        x: Math.min(startPct.x, pos.x),
        y: Math.min(startPct.y, pos.y),
        w: Math.abs(pos.x - startPct.x),
        h: Math.abs(pos.y - startPct.y),
      });
    },
    [isDragging, startPct, getRelativePos]
  );

  const handleMouseUp = useCallback(
    (e) => {
      if (!isDragging) return;
      e.preventDefault();
      setIsDragging(false);
    },
    [isDragging]
  );

  // Reset selection
  const handleReset = () => {
    setRect(null);
    setStartPct(null);
  };

  // Crop the screenshot to the selected region and call onSnip
  const handleConfirm = useCallback(() => {
    if (!screenshotDataUrl || !rect || rect.w < 0.01 || rect.h < 0.01) {
      onSnip(null);
      return;
    }

    const img = new Image();
    img.onload = () => {
      const nW = img.naturalWidth;
      const nH = img.naturalHeight;
      const wrapper = wrapperRef.current;
      if (!wrapper) return;

      const wW = wrapper.clientWidth;
      const wH = wrapper.clientHeight;
      const aspect = nW / nH;
      const wrapperAspect = wW / wH;

      let dW, dH, dL, dT;
      if (aspect > wrapperAspect) {
        dW = wW;
        dH = wW / aspect;
        dL = 0;
        dT = (wH - dH) / 2;
      } else {
        dH = wH;
        dW = wH * aspect;
        dL = (wW - dW) / 2;
        dT = 0;
      }

      // Convert rect (relative to wrapper) to be relative to the image content
      const realX = (rect.x * wW - dL) / dW;
      const realY = (rect.y * wH - dT) / dH;
      const realW = (rect.w * wW) / dW;
      const realH = (rect.h * wH) / dH;

      const cropX = Math.round(realX * nW);
      const cropY = Math.round(realY * nH);
      const cropW = Math.round(realW * nW);
      const cropH = Math.round(realH * nH);

      const canvas = document.createElement("canvas");
      canvas.width = cropW;
      canvas.height = cropH;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      onSnip(canvas.toDataURL("image/png"));
    };
    img.src = screenshotDataUrl;
  }, [screenshotDataUrl, rect, onSnip]);

  const hasSelection = rect && rect.w > 0.01 && rect.h > 0.01;

  // Human-readable pixel size label (based on display rect, not true resolution)
  const sizeLabel = (() => {
    if (!hasSelection || !wrapperRef.current) return null;
    const b = wrapperRef.current.getBoundingClientRect();
    return `${Math.round(rect.w * b.width)} × ${Math.round(rect.h * b.height)}px`;
  })();

  return (
    <div className="snip-screen">
      {/* ── Header ── */}
      <div className="snip-header">
        <div className="snip-header-left">
          <span className="snip-title">
            {hasSelection ? "Region selected" : "Drag to select a region"}
          </span>
          {sizeLabel && (
            <span className="snip-size-label">{sizeLabel}</span>
          )}
        </div>
        <div className="snip-header-right">
          {hasSelection && (
            <button
              id="snip-reset-btn"
              className="snip-reset-btn"
              onClick={handleReset}
              type="button"
              title="Clear selection"
            >
              <ResetIcon />
            </button>
          )}
          {hasSelection && (
            <button
              id="snip-capture-btn"
              className="snip-confirm-btn"
              onClick={handleConfirm}
              type="button"
            >
              <CaptureIcon />
              Capture
            </button>
          )}
          <button
            id="snip-cancel-btn"
            className="snip-cancel-btn"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
        </div>
      </div>

      {/* ── Canvas / Screenshot area ── */}
      <div
        ref={wrapperRef}
        id="snip-canvas-wrapper"
        className={`snip-canvas-wrapper${isDragging ? " is-dragging" : ""}${hasSelection ? " has-selection" : ""}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {screenshotDataUrl ? (
          <img
            src={screenshotDataUrl}
            className="snip-screenshot"
            alt="Page screenshot"
            draggable={false}
          />
        ) : (
          // Dev-mode placeholder
          <div className="snip-no-screenshot">
            <div className="snip-no-screenshot-icon">
              <ScissorsIcon />
            </div>
            <p className="snip-no-screenshot-title">Dev Mode</p>
            <p className="snip-no-screenshot-hint">
              In the Chrome Extension, the current tab's screenshot will appear
              here so you can drag to snip any region.
            </p>
            <p className="snip-no-screenshot-hint" style={{ marginTop: 4, opacity: 0.6 }}>
              You can still drag a selection below — a blank canvas will be captured.
            </p>
          </div>
        )}

        {/* Dim overlay — hidden when selection is active (box-shadow handles it) */}
        {!hasSelection && screenshotDataUrl && (
          <div className="snip-dim" />
        )}

        {/* Selection rectangle — box-shadow creates the surrounding dim effect */}
        {rect && rect.w > 0.005 && rect.h > 0.005 && (
          <div
            id="snip-selection-rect"
            className="snip-selection-rect"
            style={{
              left: `${rect.x * 100}%`,
              top: `${rect.y * 100}%`,
              width: `${rect.w * 100}%`,
              height: `${rect.h * 100}%`,
            }}
          />
        )}

        {/* Crosshair hint text — shown when waiting for first drag */}
        {!hasSelection && !isDragging && (
          <div className="snip-crosshair-hint">
            {screenshotDataUrl
              ? "Click and drag to select a region"
              : "Drag anywhere to simulate selection"}
          </div>
        )}
      </div>
    </div>
  );
}

export default ScreenSnip;

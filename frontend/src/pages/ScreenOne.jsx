import React from "react";
import Button from "../components/Button.jsx";
import "../styles/layout.css";

function ScreenOne({ onUploadImage, onSnipScreen, onClickImage }) {
  return (
    <>
      <div className="popup-header">
        <h1 className="popup-title">Image Checker</h1>
        <p className="popup-subtitle">
          Choose how you want to provide an image.
        </p>
      </div>
      <div className="popup-body">
        <div className="button-group-vertical">
          <Button onClick={onUploadImage}>Upload Image</Button>
          <Button onClick={onSnipScreen}>Snip Screen</Button>
          <Button onClick={onClickImage}>Click Image</Button>
        </div>
      </div>
    </>
  );
}

export default ScreenOne;


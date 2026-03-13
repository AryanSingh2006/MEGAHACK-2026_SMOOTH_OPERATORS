import React from "react";
import "../styles/components.css";

function ImagePreview({ src }) {
  return (
    <div className="image-preview">
      {src ? (
        <img
          src={src}
          alt="Selected"
          className="image-preview-img"
        />
      ) : (
        <div className="image-preview-placeholder">
          No image selected yet. Choose an option above to add one.
        </div>
      )}
    </div>
  );
}

export default ImagePreview;


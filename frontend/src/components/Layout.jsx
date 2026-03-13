import React from "react";
import "../styles/layout.css";

function Layout({ children }) {
  return (
    <div className="popup-root">
      <div className="popup-card">
        {children}
      </div>
    </div>
  );
}

export default Layout;


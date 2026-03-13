import React from "react";
import "../styles/layout.css";

function Layout({ children, theme, onToggleTheme }) {
  return (
    <div className="popup-root">
      <div className="popup-card">
        <div className="popup-card-glow" />
        <div className="popup-card-bottom-corners" />
        {children}
      </div>
    </div>
  );
}

export default Layout;

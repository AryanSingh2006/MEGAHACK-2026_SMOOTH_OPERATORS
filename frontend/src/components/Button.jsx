import React from "react";
import "../styles/components.css";

function Button({ children, variant = "primary", icon, fullWidth, ...rest }) {
  const classNames = [
    "btn",
    `btn-${variant}`,
    fullWidth ? "btn-full" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={classNames} type="button" {...rest}>
      {icon && <span className="btn-icon">{icon}</span>}
      {children}
    </button>
  );
}

export default Button;

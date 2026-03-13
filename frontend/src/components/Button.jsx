import React from "react";
import "../styles/components.css";

function Button({ children, variant = "primary", ...rest }) {
  const className = ["btn", `btn-${variant}`].join(" ");
  return (
    <button className={className} type="button" {...rest}>
      {children}
    </button>
  );
}

export default Button;


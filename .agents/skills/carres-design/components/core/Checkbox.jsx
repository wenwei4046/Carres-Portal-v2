import React from "react";

/**
 * Checkbox — Carres UI-KIT v4 §5/§8. 17px, clearly visible. Default = flame
 * fill + white tick when checked. `select` variant = blue fill (row
 * multi-select only — blue means selection, never action).
 */
export function Checkbox({ variant = "default", ...rest }) {
  return (
    <input
      type="checkbox"
      className={`checkbox ${variant === "select" ? "is-select" : ""}`}
      {...rest}
    />
  );
}

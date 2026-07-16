import React from "react";

/**
 * TextInput — Carres field. Optional muted uppercase label above; white input
 * with a hairline border and a flame focus ring. Use `mono` for code-like
 * values (PO, phone, SKU).
 */
export function TextInput({ label, mono = false, className = "", ...rest }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {label && <span className="t4-label">{label}</span>}
      <input className={`input ${mono ? "mono" : ""} ${className}`} {...rest} />
    </label>
  );
}

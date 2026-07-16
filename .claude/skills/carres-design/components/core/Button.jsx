import React from "react";

/**
 * Button — Carres UI-KIT v4.
 * Hierarchy (v4 §2): exactly ONE `hero` (flame) button per page/block. Every
 * other primary action is `primary` (black). `secondary`/`ghost` for lesser
 * actions; `danger` for destructive (red text on white, never red-filled).
 */
export function Button({
  variant = "primary",
  type = "button",
  disabled = false,
  icon = null,
  children,
  onClick,
  ...rest
}) {
  const cls = {
    hero: "btn-hero",
    primary: "btn-primary",
    secondary: "btn-secondary",
    ghost: "btn-ghost",
    danger: "btn-danger",
  }[variant] || "btn-primary";
  return (
    <button type={type} className={cls} disabled={disabled} onClick={onClick} {...rest}>
      {icon}
      {children}
    </button>
  );
}

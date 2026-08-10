import React from "react";

/**
 * StatusPill — Carres UI-KIT v4 §6. Status is ALWAYS a pill (soft tint + dark
 * same-hue text), never bare coloured text. Three semantic tones only, plus a
 * neutral. Optional leading dot and trailing count (e.g. "Ready 1/1").
 */
export function StatusPill({ tone = "neutral", dot = false, children }) {
  const cls = {
    ready: "pill pill-ready",
    waiting: "pill pill-waiting",
    overdue: "pill pill-overdue",
    neutral: "pill pill-neutral",
  }[tone] || "pill pill-neutral";
  return (
    <span className={cls}>
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}

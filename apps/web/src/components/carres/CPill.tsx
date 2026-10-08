/**
 * CPill — a status pill: light background + dark text from the status tokens,
 * the FULL word, never cut with "…" (handoff "Do NOT" 3, 2026-10-08). Info is
 * grey; blocked is charcoal with white (Layout Standard §4.1).
 */
import type { ReactNode } from "react";

export type CPillTone = "ok" | "warn" | "err" | "info" | "blocked" | "select";

const TONE: Record<CPillTone, string> = {
  ok: "bg-c-ok-bg text-c-ok-fg",
  warn: "bg-c-warn-bg text-c-warn-fg",
  err: "bg-c-err-bg text-c-err-fg",
  info: "bg-c-info-bg text-c-info-fg",
  blocked: "bg-c-ink text-white",
  select: "bg-c-select-bg text-c-select-fg",
};

export default function CPill({
  tone = "info",
  children,
  strong = false,
}: {
  tone?: CPillTone;
  children: ReactNode;
  /** 600 instead of 500 — the object header's status pill. */
  strong?: boolean;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-px text-[11px] leading-4 ${
        strong ? "font-semibold" : "font-medium"
      } ${TONE[tone]}`}
      data-tone={tone}
    >
      {children}
    </span>
  );
}

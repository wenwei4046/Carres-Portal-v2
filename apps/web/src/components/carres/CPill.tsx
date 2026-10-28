/**
 * CPill — a status pill in the list's own words (`ok` · `warn` · `err` · `info` ·
 * `blocked` · `select`): light background + dark text from the status tokens,
 * the FULL word, never cut with "…" (handoff "Do NOT" 3, 2026-10-08). Pad 3 10 ·
 * round · 12/500 · nowrap. Info is grey; finance hold / blocked is charcoal
 * with white.
 *
 * ONE PILL (15 Oct 2026): it draws from the same shape and colour pairs as the
 * kit's `StatusPill` (`PILL_SHAPE`, `TONE_CLASS`, `HOLD_PILL_CLASS`), so a pill
 * changes in one place for every page; the two differ only in the tone words
 * their callers pass.
 */
import type { ReactNode } from "react";
import { PILL_SHAPE } from "@/components/kit/StatusPill";
import { HOLD_PILL_CLASS, SELECT_PILL_CLASS, TONE_CLASS } from "@/components/kit/tokens";

export type CPillTone = "ok" | "warn" | "err" | "info" | "blocked" | "select";

const TONE: Record<CPillTone, string> = {
  ok: TONE_CLASS.success,
  warn: TONE_CLASS.warning,
  err: TONE_CLASS.danger,
  info: TONE_CLASS.info,
  blocked: HOLD_PILL_CLASS,
  select: SELECT_PILL_CLASS,
};

/** Every pill is 12 / 500 (01 §2), the object header's status pill included. */
export default function CPill({
  tone = "info",
  children,
}: {
  tone?: CPillTone;
  children: ReactNode;
}) {
  return (
    <span className={`${PILL_SHAPE} ${TONE[tone]}`} data-tone={tone}>
      {children}
    </span>
  );
}

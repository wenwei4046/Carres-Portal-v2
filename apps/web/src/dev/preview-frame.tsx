/**
 * The fixture-preview frame — ONE implementation, extracted 2026-09-18.
 *
 * UI-KIT §6.6: a class string repeated across files is extracted. Every dev
 * preview draws the same thing — a full-height column with a dark banner that
 * says, unmissably, that nothing on screen is production data — and the second
 * copy of that banner is the full stop (UI-KIT §6.1).
 *
 * The banner is not decoration. A preview renders the REAL page against
 * fixtures, so it looks exactly like the portal; the one difference a reader
 * must never miss is that these parties, dates and numbers are invented.
 */
import type { ReactNode } from "react";

export default function PreviewFrame({
  label,
  children,
}: {
  /** What this preview shows, e.g. `Purchase Returns (§9.6, illustrative data)`. */
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="h-screen flex flex-col">
      <div className="shrink-0 px-4 py-1 text-label bg-kit-slate-12 text-white">
        Local fixture preview · {label}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

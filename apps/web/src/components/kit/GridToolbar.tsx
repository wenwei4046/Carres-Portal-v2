/**
 * GridToolbar — the ONE toolbar band of a Portal Grid Workspace page.
 * FOLLOWS: **UI-KIT 2026-07-27** (§0.3 — every kit artifact declares its
 * edition). (Jess's freeze, 2026-08-01, borrowed from 2990's toolbar language:
 * Linear owns navigation · GitHub owns the table · 2990 owns THIS band).
 *
 * Four slots and nothing else:
 *   search — the left end. A `SearchInput` (pill shape) is the expected
 *            tenant; the kit does not force it.
 *   scope  — beside the search, muted: WHICH SLICE is in view
 *            (`Wednesday 6 Aug · Sofa`). Added 2026-08-03, because a
 *            Workspace navigator can narrow two dimensions at once and a
 *            narrowed sheet looked exactly like the whole day. It is NOT a
 *            page title — `03-page-patterns.md` bans repeating the lit tab as
 *            a heading — and it is omitted entirely when nothing is narrowed,
 *            because an empty scope means *everything*, which is an answer.
 *   right  — batch state + actions. It appears and disappears with the
 *            work (`28 selected · [Issue 10 POs]`);
 *            an empty slot keeps the band quiet, which is the design: no
 *            action, no control.
 *   meta   — the far right, muted. Quiet facts only (`Updated 10:32 AM`);
 *            never a button — a Refresh here is the word this band bans.
 *
 * **This file spells no word.** Every label is the caller's, from
 * COPY-STANDARD. Purchase Orders · Receiving · Claims · Payments reuse this
 * band as-is — that reuse is the whole reason it is a kit component.
 */
import type { ReactNode } from "react";

export default function GridToolbar({
  search,
  scope,
  right,
  meta,
}: {
  search?: ReactNode;
  scope?: ReactNode;
  right?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div data-kit="grid-toolbar" className="flex shrink-0 items-center gap-3">
      {search ? <span className="w-2/5 min-w-64 max-w-xl shrink-0">{search}</span> : null}
      {scope ? (
        <span className="min-w-0 truncate text-meta text-kit-slate-11" data-kit="grid-scope">
          {scope}
        </span>
      ) : null}
      <span className="ml-auto flex items-center gap-3">{right}</span>
      {meta ? <span className="shrink-0 text-meta text-kit-slate-11">{meta}</span> : null}
    </div>
  );
}

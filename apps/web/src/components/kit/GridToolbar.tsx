/**
 * GridToolbar — the ONE toolbar band of a Portal Grid Workspace page.
 * FOLLOWS: **the v4 template (01-design-tokens §3, owner 9 Oct 2026)** for its
 * look; the slot contract below is unchanged. (Jess's freeze, 2026-08-01, borrowed from 2990's toolbar language:
 * Linear owns navigation · GitHub owns the table · 2990 owns THIS band).
 *
 * Three slots and nothing else:
 *   search — the left end. A `SearchInput` (pill shape) is the expected
 *            tenant; the kit does not force it.
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
 *
 * **THERE IS NO `scope` SLOT, and that is a ruling** (Loo, 2026-08-03). One was
 * added and removed the same day: a Workspace keeps its navigator permanently
 * on screen with the active row lit, so a "which slice am I in" line beside the
 * search repeats what is already visible 200px to its left. It was designed
 * from reading code rather than from looking at the page — on the real screen
 * the problem it solved does not exist.
 */
import type { ReactNode } from "react";

export default function GridToolbar({
  search,
  right,
  meta,
}: {
  search?: ReactNode;
  right?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    /* v4 template toolbar row (UI-KIT "Table (list page)"): one 40px row on the
       page, 8px between controls, quiet facts in the muted 12px ink. */
    <div data-kit="grid-toolbar" className="flex min-h-10 shrink-0 items-center gap-2">
      {search ? <span className="w-2/5 min-w-64 max-w-xl shrink-0">{search}</span> : null}
      <span className="ml-auto flex items-center gap-2">{right}</span>
      {meta ? <span className="shrink-0 whitespace-nowrap text-meta text-c-muted">{meta}</span> : null}
    </div>
  );
}

import type { ReactNode } from "react";

/**
 * The Purchasing Workspace's document primitives — extracted 2026-08-03 (C2).
 *
 * UI-KIT §6.1/§6.6: the SECOND occurrence is a full stop. `ReceivingWorkspace`
 * and `ReceivingRecord` are two documents in one pane, and both draw the same
 * two things — a Linear property row and a hairline small-caps section. Copied
 * once, they had already started to differ (a 32px label column against a
 * 36px one), which is exactly how two panes in one pane stop looking like one
 * product.
 *
 * These are page-level recipes, not kit components: the kit owns `Panel` and
 * `SectionHeader`, and a workspace DOCUMENT is neither — it is a continuous
 * sheet with no cards. When the kit grows a document primitive, this file is
 * what it replaces.
 */

/** The Linear property row: label + value, ONE 24px line, never stacked. */
export function Prop({
  label,
  labelWidth = "w-32",
  children,
}: {
  label: string;
  /** The two documents label different things — a PO's `Delivery To` against a
   *  record's `Goods Received At` — so the column width is the caller's, and
   *  the RECIPE is shared. */
  labelWidth?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2 text-body leading-6">
      <span className={`${labelWidth} shrink-0 text-label text-kit-slate-9`}>
        {label}
      </span>
      <span className="min-w-0 text-kit-slate-12">{children}</span>
    </div>
  );
}

/** A hairline section with a small-caps title — the workspace rhythm. */
export function DocSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-3 pt-3 border-t border-kit-slate-5">
      <h3 className="text-label font-semibold uppercase tracking-wide text-kit-slate-9">
        {title}
      </h3>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}

/** The document's quiet control — one recipe, spelled once (§6.6). */
export const DOC_BTN =
  "px-3 py-1 rounded border border-kit-slate-5 text-body text-kit-slate-11 hover:text-kit-slate-12";

/** A column header cell in a document's item grid. */
export const DOC_TH =
  "flex gap-2 text-label uppercase tracking-wide text-kit-slate-9 border-y border-kit-slate-5 py-1";

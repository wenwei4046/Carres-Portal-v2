/**
 * PurchaseListRow — 40px compact list row for Purchase v2 (Send / Chase / Receive).
 *
 * UI-KIT §A7 SIZING LAW: 40 = list · 36 = panel/KV · 52 = items. Purchase is a
 * list, so 40 (~27 rows on a 1080 screen). Three columns:
 *   1. Identity   — icon 14 + primary 13/600 + secondary 12 muted (grows)
 *   2. Send-by    — fmtDate() → "23 Jul 26, Wed", mono 12 tabular (right-aligned)
 *   3. Urgency    — .pill 11px or nothing (right of the date)
 *
 * Selection = `.is-selected` (UI-KIT index.css :357 — the ONE selection blue
 * wash + inset bar). NEVER hand-roll the blue. Hover = `hover:bg-hovertint`.
 *
 * NO Manage column. Purchase has ONE action per stage and it lives in the right
 * PREVIEW column, not the row. This differs from OperationOrders' template (§A0
 * Action law): rows with actions carry a Manage pill; rows without actions do
 * not need it and would only duplicate the preview's flame button.
 *
 * Presentational only — callers map their domain data (place group / chase /
 * receive) into the props here.
 */

import { type LucideIcon } from "lucide-react";
import { fmtDate } from "@/lib/fmt-date";

/** Semantic pill tone — mirrors the shared `.pill-*` classes from UI-KIT §A6. */
export type PurchasePillTone =
  | "overdue"
  | "warning"
  | "confirmed"
  | "sent"
  | "neutral";

export interface PurchaseRowUrgency {
  /** Which `.pill-*` class to render. */
  tone: PurchasePillTone;
  /** Optional inline glyph (14px inside the pill). */
  Icon?: LucideIcon;
  /** Short label — e.g. "1d late", "urgent", "arriving today". */
  label: string;
}

export interface PurchaseListRowProps {
  /** Left icon — category / role glyph, 14px stroke 2 (UI-KIT §A4). */
  Icon: LucideIcon;
  /** Primary identifier. Supplier name for Send; PO no. for Chase / Receive. */
  title: string;
  /** Whether the title renders in mono tabular (PO no. → true, supplier → false). */
  titleMono?: boolean;
  /** Secondary line: "· sofa · 9 units · 3 SOs" or "9 units still waiting". */
  subtitle?: string | null;
  /** ISO date to render alongside `dateLabel`. Null = no date column shown. */
  dateIso?: string | null;
  /** Word before the date — "Send by", "ETA", "promised", "ready". */
  dateLabel?: string;
  /** Right-side pill; omit for a scheduled / neutral row. */
  urgency?: PurchaseRowUrgency | null;
  /** Selected → `.is-selected` class; adjacent unselected rows show
   *  `hover:bg-hovertint`. Focus-dim (~60% opacity) is applied by the parent
   *  list, not the row (UI-KIT §A6 §8d POS pattern). */
  selected: boolean;
  onSelect: () => void;
  /** Optional data-testid for E2E hooks. */
  testId?: string;
}

/** The 40px row. Content truncates; row never grows. */
export function PurchaseListRow({
  Icon,
  title,
  titleMono = false,
  subtitle,
  dateIso,
  dateLabel = "Send by",
  urgency,
  selected,
  onSelect,
  testId,
}: PurchaseListRowProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      data-testid={testId}
      className={[
        "relative flex items-center gap-2 w-full h-10 px-3 text-left border-b border-base-100 transition-colors",
        selected ? "is-selected" : "hover:bg-hovertint",
      ].join(" ")}
    >
      {/* Col 1 · identity — icon + title (+ subtitle grows) */}
      <Icon size={14} strokeWidth={2} className="text-base-500 shrink-0" />
      <span
        className={[
          "text-[13px] font-semibold text-base-900 truncate shrink-0 max-w-[45%]",
          titleMono ? "font-mono tabular-nums" : "",
        ].join(" ")}
      >
        {title}
      </span>
      {subtitle && (
        <span className="text-[12px] text-base-500 truncate min-w-0">
          {subtitle}
        </span>
      )}

      {/* Col 2 · Send-by / ETA / promised date */}
      {dateIso && (
        <span className="ml-auto shrink-0 text-[12px] text-base-500 tabular-nums">
          {dateLabel}{" "}
          <span className="text-base-800 font-medium">{fmtDate(dateIso)}</span>
        </span>
      )}

      {/* Col 3 · Urgency pill (right of the date, or right-of-row if no date) */}
      {urgency && (
        <span
          className={[
            "pill shrink-0",
            `pill-${urgency.tone}`,
            dateIso ? "" : "ml-auto",
          ].join(" ")}
        >
          {urgency.Icon && <urgency.Icon />}
          {urgency.label}
        </span>
      )}
    </button>
  );
}

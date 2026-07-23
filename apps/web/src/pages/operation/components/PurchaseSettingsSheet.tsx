/**
 * PurchaseSettingsSheet — right-side slide-in settings for the Purchase cockpit.
 *
 * Loo 2026-07-23 v2 replaces the smaller LeadTimesButton modal. Four sections
 * stacked with the shared SectionCard/SectionBand chrome:
 *
 *   1. LEAD TIMES         per-category Official + Actual working days, plus
 *                         the supplier work-week (Mon-Fri or Mon-Sat) that
 *                         feeds the ordering engine.
 *   2. ARRIVAL BUFFER     working days between goods arriving + customer
 *                         deadline (currently 7 — the delivery-arrangement
 *                         window).
 *   3. PO DAYS            Mon + Thu (Jess-locked review cadence); urgent
 *                         POs bypass this schedule regardless.
 *   4. DUTY ROTATION      current-month duty holder (read-only display —
 *                         editing lives on the right-rail Team card per the
 *                         B3-final TeamPanel layout).
 *
 * READ-ONLY for now. Editable fields + save ship with migration 0243
 * (`lead_time_config` table + `suppliers.work_week` + editable arrival
 * buffer singleton). The draft SQL is documented in the checkpoint at
 * `docs/purchase-cockpit-handoff.md`.
 *
 * Access = principal / manager tier (mirrors the LeadTimesButton visibility
 * rule from Jess's design-standard system memory) — the tab-bar trigger is
 * hidden for the plain `operation@carres.com` login. Enforced at the trigger
 * site in OperationPurchase.tsx, not here (component is presentational).
 */

import { type ReactNode, useEffect, useState } from "react";
import { Settings, X } from "lucide-react";
import { SectionBand, SectionCard } from "@/components/SectionPanel";
import Btn from "@/components/Btn";

/** The engine's current lead-time defaults — a mirror of the shared engine's
 *  numbers (packages/shared/src/net-requirements.ts). Displayed here read-only
 *  until 0243 makes them editable. */
const LEAD_TIME_DEFAULTS: ReadonlyArray<{
  category: string;
  officialDays: number;
  actualDays: number;
  workWeek: string;
}> = [
  { category: "Mattress", officialDays: 7, actualDays: 5, workWeek: "Mon-Fri" },
  { category: "Bedframe", officialDays: 7, actualDays: 5, workWeek: "Mon-Fri" },
  { category: "Sofa", officialDays: 14, actualDays: 10, workWeek: "Mon-Sat" },
];

/** Arrival-buffer default the engine currently uses. */
const ARRIVAL_BUFFER_DAYS = 7;

/** PO days the duty holder sends POs on. Locked by Jess; urgent orders skip. */
const PO_DAYS: ReadonlyArray<{ day: string; on: boolean }> = [
  { day: "Mon", on: true },
  { day: "Tue", on: false },
  { day: "Wed", on: false },
  { day: "Thu", on: true },
  { day: "Fri", on: false },
  { day: "Sat", on: false },
  { day: "Sun", on: false },
];

interface PurchaseSettingsSheetProps {
  open: boolean;
  onClose: () => void;
  /** Current duty holder for the Duty section. Null = layer dormant. */
  dutyHolderName: string | null;
  /** Duty holder end-of-term for the "until <date>" line. Human-formatted
   *  already (e.g. "31 Jul 26") to match the TeamPanel wording. Null hides. */
  dutyUntilLabel: string | null;
}

function Row({
  label,
  right,
  hint,
}: {
  label: ReactNode;
  right: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between h-9 px-2.5 gap-3 text-[13px] border-b border-base-100 last:border-b-0">
      <span className="text-base-700 truncate">{label}</span>
      <span className="shrink-0 text-base-900 tabular-nums">{right}</span>
      {hint && (
        <span className="shrink-0 text-[11px] text-base-500">{hint}</span>
      )}
    </div>
  );
}

export function PurchaseSettingsSheet({
  open,
  onClose,
  dutyHolderName,
  dutyUntilLabel,
}: PurchaseSettingsSheetProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggle = (k: string) =>
    setCollapsed((cur) => {
      const n = new Set(cur);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  // Escape to close (same shortcut as the drawer patterns in the app).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Purchase settings"
      className="fixed inset-0 z-50 flex justify-end"
    >
      {/* backdrop */}
      <button
        type="button"
        aria-label="Close settings"
        onClick={onClose}
        className="absolute inset-0 bg-base-900/30"
      />
      {/* sheet */}
      <div className="relative w-[420px] max-w-full h-full bg-white border-l border-base-200 shadow-xl flex flex-col overflow-hidden">
        <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-base-200">
          <Settings size={16} strokeWidth={2} className="text-base-500" />
          <span className="text-[15px] font-semibold text-base-900">
            Purchase settings
          </span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto p-1 rounded text-base-400 hover:text-base-900 hover:bg-hovertint"
            title="Close (Esc)"
            aria-label="Close settings"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
          {/* 1. LEAD TIMES */}
          <SectionCard>
            <SectionBand
              title="Lead times"
              strong
              collapsed={collapsed.has("lead")}
              onToggle={() => toggle("lead")}
            />
            {!collapsed.has("lead") && (
              <div>
                <div className="grid grid-cols-[1fr_60px_60px_80px] gap-x-2 px-2.5 h-7 items-center text-[10px] uppercase tracking-[0.05em] text-base-500">
                  <span>Category</span>
                  <span className="text-right">Official</span>
                  <span className="text-right">Actual</span>
                  <span className="text-right">Work-week</span>
                </div>
                {LEAD_TIME_DEFAULTS.map((row) => (
                  <div
                    key={row.category}
                    className="grid grid-cols-[1fr_60px_60px_80px] gap-x-2 px-2.5 h-9 items-center text-[13px] border-t border-base-100"
                  >
                    <span className="text-base-800">{row.category}</span>
                    <span className="text-right tabular-nums text-base-900">
                      {row.officialDays}d
                    </span>
                    <span className="text-right tabular-nums text-base-900">
                      {row.actualDays}d
                    </span>
                    <span className="text-right text-base-500 text-[12px]">
                      {row.workWeek}
                    </span>
                  </div>
                ))}
                <div className="px-2.5 pt-2 pb-1 text-[11px] text-base-500 leading-snug">
                  Order date = deadline − arrival buffer − (make + deliver).
                  Editable per supplier ships with the lead-time table.
                </div>
              </div>
            )}
          </SectionCard>

          {/* 2. ARRIVAL BUFFER */}
          <SectionCard>
            <SectionBand
              title="Arrival buffer"
              strong
              collapsed={collapsed.has("buffer")}
              onToggle={() => toggle("buffer")}
            />
            {!collapsed.has("buffer") && (
              <div>
                <Row
                  label="Days between stock in + customer deadline"
                  right={
                    <span className="inline-flex items-center justify-center min-w-[36px] h-7 px-2 rounded-md border border-base-200 bg-base-50 font-mono tabular-nums font-semibold">
                      {ARRIVAL_BUFFER_DAYS}
                    </span>
                  }
                />
                <div className="px-2.5 pt-2 pb-1 text-[11px] text-base-500 leading-snug">
                  Time we need after receiving stock to book NETS / TT / AL and
                  hand off to the customer.
                </div>
              </div>
            )}
          </SectionCard>

          {/* 3. PO DAYS */}
          <SectionCard>
            <SectionBand
              title="PO days"
              strong
              collapsed={collapsed.has("po-days")}
              onToggle={() => toggle("po-days")}
            />
            {!collapsed.has("po-days") && (
              <div>
                <div className="px-2.5 py-2 flex items-center gap-1.5 flex-wrap">
                  {PO_DAYS.map((d) => (
                    <span
                      key={d.day}
                      className={[
                        "inline-flex items-center justify-center w-11 h-7 rounded-md text-[12px] font-semibold border",
                        d.on
                          ? "bg-base-900 text-white border-base-900"
                          : "bg-white text-base-500 border-base-200",
                      ].join(" ")}
                    >
                      {d.day}
                    </span>
                  ))}
                </div>
                <div className="px-2.5 pt-1 pb-1 text-[11px] text-base-500 leading-snug">
                  Duty holder sends POs on these days. Urgent POs bypass the
                  schedule.
                </div>
              </div>
            )}
          </SectionCard>

          {/* 4. DUTY ROTATION (read-only display; editing lives on Team card) */}
          <SectionCard>
            <SectionBand
              title="Duty rotation"
              strong
              collapsed={collapsed.has("duty")}
              onToggle={() => toggle("duty")}
            />
            {!collapsed.has("duty") && (
              <div>
                <Row
                  label="This month"
                  right={
                    dutyHolderName ? (
                      <span className="font-semibold">{dutyHolderName}</span>
                    ) : (
                      <span className="text-base-400">—</span>
                    )
                  }
                  hint={dutyUntilLabel ? `until ${dutyUntilLabel}` : undefined}
                />
                <div className="px-2.5 pt-2 pb-1 text-[11px] text-base-500 leading-snug">
                  One person controls company-wide POs each month (auto-rotates).
                  Edit the roster on the right-rail Team card.
                </div>
              </div>
            )}
          </SectionCard>
        </div>

        <div className="shrink-0 border-t border-base-200 px-4 py-3 flex items-center justify-end gap-2">
          <span className="text-[11px] text-base-500 mr-auto">
            Values are read-only until the lead-time table ships.
          </span>
          <Btn variant="box" size="sm" onClick={onClose}>
            Close
          </Btn>
        </div>
      </div>
    </div>
  );
}

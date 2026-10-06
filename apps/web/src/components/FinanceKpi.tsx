// The one KPI tile for the nine Finance pages.
//
// Before this file, eight pages carried a character-identical local `Kpi`, the
// Dashboard carried a ninth with an extra "danger" tone, and Rental Approver a
// tenth in a different font. Ten copies is how the tiles drifted — the same
// number wore three sizes across three tabs. One component, one look.
//
// Props are the union of what the copies needed, so no call site lost a feature:
//   tone    — colour of the number. "danger" is the Dashboard's overdue red.
//   accent  — the tile the eye should land on first; border and label go primary.
//   hint    — the small line under the number. Optional.
//   value   — `null` when there is no number to print (still loading, or the
//             read failed); `noValue` shows in its place. A failed read is said
//             in words, never printed as RM 0.00.
//   door    — a link under the number to the page that adds it up. Optional.
// The number carries `data-kpi-value` so tests and the Dashboard can find it.
import type { ReactNode } from "react";

export type FinanceKpiTone = "warn" | "ok" | "danger" | "neutral";

export function FinanceKpi({
  label,
  value,
  hint,
  tone,
  accent,
  noValue,
  door,
  testId,
  valueTestId,
}: {
  label: string;
  value: string | null;
  /** A string, or (the Dashboard's Net cash) two short lines. */
  hint?: ReactNode;
  tone?: FinanceKpiTone;
  accent?: boolean;
  noValue?: ReactNode;
  door?: ReactNode;
  testId?: string;
  valueTestId?: string;
}) {
  const valueTone =
    tone === "danger" ? "text-destructive" :
    tone === "warn"   ? "text-primary" :
    tone === "ok"     ? "text-success" :
                        "text-foreground";
  return (
    <div className={`bg-card rounded-md border ${accent ? "border-primary" : "border-border"} px-5 py-[18px]`}
      data-testid={testId}>
      <div className={`text-label uppercase tracking-[0.06em] font-semibold ${accent ? "text-primary" : "text-muted-foreground"}`}>
        {label}
      </div>
      {value === null ? (
        <div className="mt-1.5">{noValue}</div>
      ) : (
        <>
          <div
            data-kpi-value
            data-testid={valueTestId}
            className={`font-display text-page mt-1.5 leading-none tabular-nums ${valueTone}`}
          >
            {value}
          </div>
          {hint && <div className="text-label text-muted-foreground mt-1.5">{hint}</div>}
        </>
      )}
      {door && <div className="mt-3">{door}</div>}
    </div>
  );
}

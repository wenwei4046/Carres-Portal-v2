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
// The number carries `data-kpi-value` so tests and the Dashboard can find it.

export type FinanceKpiTone = "warn" | "ok" | "danger" | "neutral";

export function FinanceKpi({
  label,
  value,
  hint,
  tone,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: FinanceKpiTone;
  accent?: boolean;
}) {
  const valueTone =
    tone === "danger" ? "text-destructive" :
    tone === "warn"   ? "text-primary" :
    tone === "ok"     ? "text-success" :
                        "text-foreground";
  return (
    <div className={`bg-card rounded-md border ${accent ? "border-primary" : "border-border"} px-5 py-[18px]`}>
      <div className={`text-label uppercase tracking-[0.06em] font-semibold ${accent ? "text-primary" : "text-muted-foreground"}`}>
        {label}
      </div>
      <div
        data-kpi-value
        className={`font-display text-page mt-1.5 leading-none tabular-nums ${valueTone}`}
      >
        {value}
      </div>
      {hint && <div className="text-label text-muted-foreground mt-1.5">{hint}</div>}
    </div>
  );
}

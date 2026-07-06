import { useMemo, useState } from "react";
import type { SellingFabric } from "./selling-fabrics";

/**
 * Shared Series → Colour fabric selection with two-level KIV (Loo 2026-07-06 —
 * the POS Quick-pick rail AND the Customize canvas must offer the IDENTICAL
 * fabric setting). One source of truth so the two surfaces never drift.
 *
 * Two levels of KIV ("Keep In View" — decide later):
 *   - series-level KIV: `series === ""` — nothing chosen yet (fully deferred).
 *   - colour-level KIV: `colourKey === FABRIC_KIV` — a series is locked but the
 *     specific colour is pending.
 * Either way `fabric` is null (no concrete colour) → no tier delta yet; the
 * host records `fabricSeries` so the order/PO shows "EZ · colour to confirm".
 */
export const FABRIC_KIV = "__kiv__";

/** Distinct series this list offers (legacy rows with no series bucket under
 *  "Other"), in first-seen order. */
export function sellingFabricSeries(fabrics: SellingFabric[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const f of fabrics) {
    const s = f.series ?? "Other";
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

export function useSeriesFabric(sellingFabrics: SellingFabric[]) {
  const seriesList = useMemo(() => sellingFabricSeries(sellingFabrics), [sellingFabrics]);
  // A sole series auto-selects so the series step collapses to just the colours.
  const [series, setSeries] = useState<string>(() =>
    seriesList.length === 1 ? seriesList[0]! : "",
  );
  const [colourKey, setColourKey] = useState<string>(FABRIC_KIV);

  const seriesColours = useMemo(
    () => (series ? sellingFabrics.filter((f) => (f.series ?? "Other") === series) : []),
    [sellingFabrics, series],
  );

  const fabric =
    series && colourKey !== FABRIC_KIV
      ? seriesColours.find((f) => f.key === colourKey) ?? null
      : null;
  const deferred = fabric == null;
  // The synthetic "Other" bucket for legacy rows never becomes a real stamp.
  const fabricSeries = series && series !== "Other" ? series : null;

  /** Pick a series (or "" for series-KIV) and reset the colour back to KIV. */
  const chooseSeries = (s: string) => {
    setSeries(s);
    setColourKey(FABRIC_KIV);
  };

  return {
    seriesList,
    series,
    chooseSeries,
    colourKey,
    setColourKey,
    seriesColours,
    fabric,
    deferred,
    fabricSeries,
  };
}

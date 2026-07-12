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

export function useSeriesFabric(
  sellingFabrics: SellingFabric[],
  /** Cart-line EDIT prefill (read once at mount — the host remounts to load a
   *  different line): `key` restores a concrete colour (its series follows);
   *  `series` alone restores a series-picked-colour-KIV state. A key/series
   *  that no longer exists in the list falls back to the default init. */
  initial?: { key?: string | null; series?: string | null },
) {
  const seriesList = useMemo(() => sellingFabricSeries(sellingFabrics), [sellingFabrics]);
  // A sole series auto-selects so the series step collapses to just the colours.
  const [series, setSeries] = useState<string>(() => {
    if (initial?.key) {
      const f = sellingFabrics.find((x) => x.key === initial.key);
      if (f) return f.series ?? "Other";
    }
    if (initial?.series && seriesList.includes(initial.series)) return initial.series;
    return seriesList.length === 1 ? seriesList[0]! : "";
  });
  const [colourKey, setColourKey] = useState<string>(() =>
    initial?.key && sellingFabrics.some((x) => x.key === initial.key)
      ? initial.key
      : FABRIC_KIV,
  );

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

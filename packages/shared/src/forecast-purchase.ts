/**
 * FORECAST PURCHASE · OUTRIGHT — the ONE arithmetic of the weekly stock
 * suggestion (owner 13 Oct 2026; Purchasing MASTER §9.14).
 *
 * The page shows, per model and size, what sold in the last three calendar
 * months, the free stock, a suggested quantity for this Monday and a forecast
 * for the next two Mondays. It suggests; the person decides. Every number on
 * the page is worked out here and nowhere else (Law D):
 *
 *   daily rate        pieces sold in the last 14 days ÷ 14
 *   stock level       daily rate × 14 days
 *   this Monday       stock level − free stock, never under 0, and never more
 *                     than one week of sales (daily rate × 7); the rest follows
 *                     next Monday
 *   next two Mondays  the same rule, as if sales stay at the daily rate and
 *                     each Monday's suggestion arrives
 *
 * It ARRANGES facts their owners recorded and records nothing: the sale is
 * Sales Orders' (`orders.placed_at`, the proceeded Outright population), the
 * free stock is Stock's (New Units no order holds, plus open PO Units no
 * order holds), the supplier is Catalog's (`product_skus.supplier_id`).
 */

/** The one order sizes are listed in, on every model. */
export const FORECAST_PURCHASE_SIZE_ORDER = ["Super King", "King", "Queen", "Super Single", "Single"] as const;

/** The daily rate reads the last 14 days; the stock level is 14 days of it;
 *  one Monday buys at most 7 days of it. */
export const FORECAST_PURCHASE_RATE_DAYS = 14;
export const FORECAST_PURCHASE_LEVEL_DAYS = 14;
export const FORECAST_PURCHASE_WEEK_DAYS = 7;

/**
 * What Carres keeps as Outright stock (owner 13 Oct 2026): every mattress,
 * and one bedframe model, Jager. Everything else is bought per Sales Order in
 * SO Batch Purchase, and accessories have their own stock path.
 *
 * ⚠ The owner's rule names one Jager colour (PC151-01). Catalog records a
 * bedframe by model and size only, so the Portal cannot tell that colour
 * apart: Jager counts every colour until Catalog records one.
 */
export const FORECAST_PURCHASE_OUTRIGHT_SCOPE = {
  categories: ["mattress"],
  models: [{ category: "bedframe", modelKey: "jager" }],
} as const;

export function forecastPurchaseInScope(category: string | null | undefined, modelKey: string | null | undefined): boolean {
  const c = (category ?? "").toLowerCase();
  const k = (modelKey ?? "").toLowerCase();
  if ((FORECAST_PURCHASE_OUTRIGHT_SCOPE.categories as readonly string[]).includes(c)) return true;
  return FORECAST_PURCHASE_OUTRIGHT_SCOPE.models.some((m) => m.category === c && m.modelKey === k);
}

/** One size of one model, as the server read it. Counts are pieces. */
export interface ForecastPurchaseSize {
  sku: string;
  modelId: string;
  model: string;
  category: string;
  /** Catalog's size word (`King`). */
  size: string;
  supplierId: string | null;
  supplier: string | null;
  /** Sold in each of `months`, oldest first. */
  sold: [number, number, number];
  /** Sold in the last 14 days, today included. */
  sold14: number;
  /** New Units in the warehouse that no order holds. */
  free: number;
  /** Units on an open PO, not arrived, that no order holds. */
  onPo: number;
}

/** `GET /api/operation/purchase/forecast` */
export interface ForecastPurchaseResponse {
  /** The server's Malaysia date, `YYYY-MM-DD`. */
  today: string;
  /** Two months ago, last month, this month: `YYYY-MM`. */
  months: [string, string, string];
  /** This week's Monday and the next two: `YYYY-MM-DD`. */
  mondays: [string, string, string];
  sizes: ForecastPurchaseSize[];
}

const pad = (n: number) => String(n).padStart(2, "0");
const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const isoOf = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** `YYYY-MM-DD` moved by whole days. */
export function forecastPurchaseAddDays(iso: string, days: number): string {
  const d = utc(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return isoOf(d);
}

/**
 * The dates one day's page reads: the three months shown, this week's Monday
 * and the next two, and the first day of each count. A sale counts in the
 * last 14 days when its date is after `after14` and not after today.
 */
export function forecastPurchaseWindow(today: string): {
  months: [string, string, string];
  mondays: [string, string, string];
  /** First day of the oldest month shown. */
  from: string;
  /** The day before the 14-day count starts. */
  after14: string;
} {
  const t = utc(today);
  const month = (back: number) => {
    const d = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - back, 1));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
  };
  const monday = forecastPurchaseAddDays(today, -((t.getUTCDay() + 6) % 7));
  return {
    months: [month(2), month(1), month(0)],
    mondays: [monday, forecastPurchaseAddDays(monday, 7), forecastPurchaseAddDays(monday, 14)],
    from: `${month(2)}-01`,
    after14: forecastPurchaseAddDays(today, -FORECAST_PURCHASE_RATE_DAYS),
  };
}

export interface ForecastPurchaseSuggestion {
  /** Pieces to hold: 14 days of sales at the daily rate. */
  level: number;
  /** The most one Monday suggests: 7 days of sales, at least 1. */
  cap: number;
  /** This Monday's suggestion, then the forecast for the next two Mondays. */
  weeks: [number, number, number];
}

/**
 * The suggestion for one size. `have` is free stock plus what is already on a
 * PO for stock. `skipped` leaves this Monday at 0 (`Skip this week`); the
 * shortfall then shows on the next Monday.
 */
export function forecastPurchaseSuggestion(input: { sold14: number; free: number; onPo: number; skipped?: boolean }): ForecastPurchaseSuggestion {
  const sold14 = Math.max(0, input.sold14);
  const rate = sold14 / FORECAST_PURCHASE_RATE_DAYS;
  const level = Math.ceil(rate * FORECAST_PURCHASE_LEVEL_DAYS);
  const cap = Math.max(1, Math.ceil(rate * FORECAST_PURCHASE_WEEK_DAYS));
  let have = Math.max(0, input.free) + Math.max(0, input.onPo);
  const first = input.skipped ? 0 : Math.min(Math.max(0, level - have), cap);
  have += first;
  const weeks: number[] = [first];
  for (let k = 1; k < 3; k += 1) {
    have = Math.max(0, have - rate * FORECAST_PURCHASE_WEEK_DAYS);
    const buy = Math.min(Math.max(0, Math.ceil(level - have)), cap);
    weeks.push(buy);
    have += buy;
  }
  return { level, cap, weeks: weeks as [number, number, number] };
}

/** Why a size cannot be ticked. `null` = it has a suggestion and a supplier. */
export type ForecastPurchaseBlock = "enough" | "no_supplier" | null;

export interface ForecastPurchaseSizeRow extends ForecastPurchaseSize {
  /** Free stock as the page prints it: in the warehouse plus on a PO. */
  have: number;
  suggestion: ForecastPurchaseSuggestion;
  /** This Monday's suggested pieces. */
  suggested: number;
  block: ForecastPurchaseBlock;
}

export interface ForecastPurchaseModelRow {
  key: string;
  modelId: string;
  model: string;
  category: string;
  /** The sizes' supplier. `null` when no size has one; the first found otherwise. */
  supplier: string | null;
  supplierId: string | null;
  sold: [number, number, number];
  have: number;
  weeks: [number, number, number];
  /** Sizes that can be ticked. */
  suggestedSizes: number;
  block: ForecastPurchaseBlock;
  sizes: ForecastPurchaseSizeRow[];
}

const sizeRank = (size: string) => {
  const i = (FORECAST_PURCHASE_SIZE_ORDER as readonly string[]).indexOf(size);
  return i < 0 ? FORECAST_PURCHASE_SIZE_ORDER.length : i;
};

/**
 * The page's rows: one per model that sold in the three months shown, its
 * sizes in the fixed order, best seller of last month first. A model that
 * sold nothing in the window is not listed: there is no rate to suggest from.
 */
export function forecastPurchaseModels(data: Pick<ForecastPurchaseResponse, "sizes">): ForecastPurchaseModelRow[] {
  const byModel = new Map<string, ForecastPurchaseSize[]>();
  for (const size of data.sizes) byModel.set(size.modelId, [...(byModel.get(size.modelId) ?? []), size]);
  const sum3 = (rows: ReadonlyArray<{ sold: [number, number, number] }>): [number, number, number] =>
    [0, 1, 2].map((i) => rows.reduce((n, r) => n + r.sold[i]!, 0)) as [number, number, number];
  const models: ForecastPurchaseModelRow[] = [];
  for (const [modelId, raw] of byModel) {
    if (!raw.some((s) => s.sold.some((n) => n > 0))) continue;
    const sizes: ForecastPurchaseSizeRow[] = raw
      .map((s) => {
        const suggestion = forecastPurchaseSuggestion(s);
        const suggested = suggestion.weeks[0];
        const block: ForecastPurchaseBlock = suggested <= 0 ? "enough" : s.supplierId ? null : "no_supplier";
        return { ...s, have: s.free + s.onPo, suggestion, suggested, block };
      })
      .sort((a, b) => sizeRank(a.size) - sizeRank(b.size) || a.size.localeCompare(b.size));
    const named = sizes.find((s) => s.supplierId) ?? null;
    const suggestedSizes = sizes.filter((s) => s.block == null).length;
    models.push({
      key: `model:${modelId}`,
      modelId,
      model: sizes[0]!.model,
      category: sizes[0]!.category,
      supplier: named?.supplier ?? null,
      supplierId: named?.supplierId ?? null,
      sold: sum3(sizes),
      have: sizes.reduce((n, s) => n + s.have, 0),
      weeks: [0, 1, 2].map((i) => sizes.reduce((n, s) => n + s.suggestion.weeks[i]!, 0)) as [number, number, number],
      suggestedSizes,
      block: suggestedSizes > 0 ? null : sizes.some((s) => s.block === "no_supplier") ? "no_supplier" : "enough",
      sizes,
    });
  }
  return models.sort((a, b) => b.sold[1] - a.sold[1] || a.model.localeCompare(b.model));
}

/** One PO per supplier and category: how many POs a set of ticked sizes makes. */
export function forecastPurchasePoGroups(sizes: ReadonlyArray<Pick<ForecastPurchaseSize, "supplierId" | "category">>): number {
  return new Set(sizes.map((s) => `${s.supplierId ?? ""}|${s.category}`)).size;
}

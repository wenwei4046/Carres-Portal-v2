/**
 * FORECAST PURCHASE · OUTRIGHT — the ONE arithmetic of the weekly stock
 * suggestion (Purchasing MASTER §9.14).
 *
 * The page shows, per model and size, what sold in the last three calendar
 * months, the free stock, a suggested quantity for this Monday and a forecast
 * for the next two Mondays. It suggests; the person decides. Every number on
 * the page is worked out here and nowhere else (Law D).
 *
 * ── WHERE THE NUMBERS BELOW COME FROM, AND WHAT THEY ARE NOT ────────────────
 *
 * The formula and the list of models kept as stock are the values of the
 * owner-approved DESIGN HANDOFF of 13 Oct 2026 ("Ops Rules · Forecast
 * Purchase · Outright" in its README). No business ruling in a MASTER states
 * them, and the owner's 14 Oct 2026 ruling says in terms that it approves no
 * algorithm. They are therefore PROPOSAL / NOT LAW: the build follows the
 * handoff so the page can be reviewed, and each value is a named constant
 * here so a ruling changes one line.
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
 *
 * ── A REQUEST IN PROGRESS IS NOT STOCK (owner ruling 2026-10-14, A) ─────────
 *
 * The page issues no PO. `Send for approval` raises a Manual Purchase Request
 * (`Ready Stock`, buying extra) per supplier and category; the Purchasing
 * Approver decides it; PO Duty then issues the PO and sends it, each act with
 * its own actor and time.
 *
 * What an open request still has to put on a PO is a REQUEST IN PROGRESS. It
 * is not free stock, not incoming stock and not ordered supply, so it never
 * enters the suggestion, the forecast or `Free stock`: a request may still be
 * refused. It does exactly one thing: it is taken off what can still be
 * ASKED for, so a size is never asked for twice.
 */

/** The one order sizes are listed in, on every model. */
export const FORECAST_PURCHASE_SIZE_ORDER = ["Super King", "King", "Queen", "Super Single", "Single"] as const;

/** HANDOFF VALUES (PROPOSAL / NOT LAW): the daily rate reads the last 14
 *  days; the stock level is 14 days of it; one Monday buys at most 7. */
export const FORECAST_PURCHASE_RATE_DAYS = 14;
export const FORECAST_PURCHASE_LEVEL_DAYS = 14;
export const FORECAST_PURCHASE_WEEK_DAYS = 7;

/**
 * HANDOFF VALUE (PROPOSAL / NOT LAW): what Carres keeps as Outright stock.
 * The handoff says every mattress and one bedframe, "1013 Jager PC151-01, so
 * far"; everything else is bought per Sales Order in SO Batch Purchase and
 * accessories have their own stock path. No Settings record holds this list
 * yet, so it is one constant here.
 *
 * ⚠ The handoff names one Jager colour (PC151-01). Catalog records a bedframe
 * by model and size only, so the Portal cannot tell that colour apart: Jager
 * counts every colour until Catalog records one.
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

/** Where a request stands. `waiting` = for the approver; `ready` = approved,
 *  PO Duty issues next; `sent_back` = returned to its requester. */
export type ForecastPurchaseRequestState = "waiting" | "ready" | "sent_back";

/** One open request line for a size: what it has still to put on a PO. */
export interface ForecastPurchaseRequestRef {
  id: string;
  /** The MPR No. Null when the request carries none. */
  no: string | null;
  qty: number;
  state: ForecastPurchaseRequestState;
  /** Forecast Purchase asked for it (false: raised on the request page). */
  fromForecast: boolean;
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
  /** Pieces on open Ready Stock requests (buying extra) not yet on a PO.
   *  A request in progress: never stock, never ordered supply. */
  inProgress: number;
  /** The requests those pieces are on, oldest first. */
  requests: ForecastPurchaseRequestRef[];
  /** The Delivery Date a request for this size would ask for today: the
   *  purchase plan's own proposal, never before the Settings floor. Null =
   *  production days are not set for its supplier and category. */
  deliveryDate: string | null;
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
  /** The default Deliver To a request is raised for. Null = none is set. */
  deliverTo: { id: string; name: string } | null;
  /** Today's Purchasing Approver (holder or cover). Null = nobody resolved. */
  approver: { id: string; name: string | null } | null;
  /** Today's PO Duty (holder or cover). Null = nobody resolved. */
  poDuty: { id: string; name: string | null } | null;
}

/** `POST /api/operation/purchase/forecast/requests` — what the page sends.
 *  The server works out everything else again from its own read. */
export interface ForecastPurchaseSubmitBody {
  /** One key per press of `Send for approval`; a retry sends the same key. */
  submissionKey: string;
  lines: Array<{ sku: string; qty: number }>;
}

export interface ForecastPurchaseSubmitResult {
  /** True when this key had already gone through: nothing new was written. */
  replayed: boolean;
  requests: Array<{ id: string; reqNo: string | null }>;
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
 * The suggestion for one size, from STOCK alone: free stock plus what is
 * already on a PO for stock. A request in progress is not stock and is not
 * passed in.
 */
export function forecastPurchaseSuggestion(input: { sold14: number; free: number; onPo: number }): ForecastPurchaseSuggestion {
  const sold14 = Math.max(0, input.sold14);
  const rate = sold14 / FORECAST_PURCHASE_RATE_DAYS;
  const level = Math.ceil(rate * FORECAST_PURCHASE_LEVEL_DAYS);
  const cap = Math.max(1, Math.ceil(rate * FORECAST_PURCHASE_WEEK_DAYS));
  let have = Math.max(0, input.free) + Math.max(0, input.onPo);
  const first = Math.min(Math.max(0, level - have), cap);
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

/** What can still be ASKED for: this Monday's suggestion less what a request
 *  in progress already asks. Never under 0. */
export function forecastPurchaseToAsk(suggested: number, inProgress: number): number {
  return Math.max(0, suggested - Math.max(0, inProgress));
}

/** Why a size cannot be ticked. `null` = something can still be asked for and
 *  it has a supplier. `requested` = a request in progress already asks for
 *  all of this Monday's suggestion. */
export type ForecastPurchaseBlock = "enough" | "no_supplier" | "requested" | null;

export interface ForecastPurchaseSizeRow extends ForecastPurchaseSize {
  /** Free stock as the page prints it: in the warehouse plus on a PO. */
  have: number;
  suggestion: ForecastPurchaseSuggestion;
  /** This Monday's suggested pieces, from stock alone. */
  suggested: number;
  /** What can still be asked for this Monday. */
  toAsk: number;
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
  /** Pieces that can still be asked for this Monday, on sizes that can be ticked. */
  toAsk: number;
  /** Pieces on requests in progress. */
  inProgress: number;
  /** Pieces on an open PO for stock, not arrived. */
  onPo: number;
  block: ForecastPurchaseBlock;
  sizes: ForecastPurchaseSizeRow[];
}

const sizeRank = (size: string) => {
  const i = (FORECAST_PURCHASE_SIZE_ORDER as readonly string[]).indexOf(size);
  return i < 0 ? FORECAST_PURCHASE_SIZE_ORDER.length : i;
};

/** One size with its suggestion, what can still be asked, and why not. */
export function forecastPurchaseSizeRow(s: ForecastPurchaseSize): ForecastPurchaseSizeRow {
  const suggestion = forecastPurchaseSuggestion(s);
  const suggested = suggestion.weeks[0];
  const toAsk = forecastPurchaseToAsk(suggested, s.inProgress);
  const block: ForecastPurchaseBlock = toAsk > 0 ? (s.supplierId ? null : "no_supplier") : suggested > 0 ? "requested" : "enough";
  return { ...s, have: s.free + s.onPo, suggestion, suggested, toAsk, block };
}

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
    const sizes = raw.map(forecastPurchaseSizeRow).sort((a, b) => sizeRank(a.size) - sizeRank(b.size) || a.size.localeCompare(b.size));
    const named = sizes.find((s) => s.supplierId) ?? null;
    const tickable = sizes.filter((s) => s.block == null);
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
      suggestedSizes: tickable.length,
      toAsk: tickable.reduce((n, s) => n + s.toAsk, 0),
      inProgress: sizes.reduce((n, s) => n + s.inProgress, 0),
      onPo: sizes.reduce((n, s) => n + s.onPo, 0),
      block: tickable.length > 0 ? null : sizes.some((s) => s.block === "no_supplier") ? "no_supplier" : sizes.some((s) => s.block === "requested") ? "requested" : "enough",
      sizes,
    });
  }
  return models.sort((a, b) => b.sold[1] - a.sold[1] || a.model.localeCompare(b.model));
}

/** One request, and later one PO, per supplier and category. */
export interface ForecastPurchaseRequestGroup {
  key: string;
  supplierId: string;
  supplier: string;
  category: string;
  /** The Delivery Date every line of the group can meet. Null = not set. */
  deliveryDate: string | null;
  lines: Array<{ sku: string; qty: number; model: string; size: string; inProgress: number; suggestion: ForecastPurchaseSuggestion }>;
  pieces: number;
}

/** How many requests a set of ticked sizes makes: one per supplier and category. */
export function forecastPurchaseRequestCount(sizes: ReadonlyArray<Pick<ForecastPurchaseSize, "supplierId" | "category">>): number {
  return new Set(sizes.map((s) => `${s.supplierId ?? ""}|${s.category}`)).size;
}

/**
 * The ticked sizes as the requests they become, in the order ticked. Each
 * line asks for what can still be asked, never the whole suggestion again.
 */
export function forecastPurchaseRequestGroups(sizes: ReadonlyArray<ForecastPurchaseSizeRow>): ForecastPurchaseRequestGroup[] {
  const groups = new Map<string, ForecastPurchaseRequestGroup>();
  for (const s of sizes) {
    if (!s.supplierId || s.toAsk <= 0) continue;
    const key = `${s.supplierId}|${s.category}`;
    const group = groups.get(key) ?? { key, supplierId: s.supplierId, supplier: s.supplier ?? "", category: s.category, deliveryDate: s.deliveryDate, lines: [], pieces: 0 };
    group.lines.push({ sku: s.sku, qty: s.toAsk, model: s.model, size: s.size, inProgress: s.inProgress, suggestion: s.suggestion });
    group.pieces += s.toAsk;
    /* The latest date any line needs; none when one line has none. */
    if (group.lines.length > 1) group.deliveryDate = group.deliveryDate == null || s.deliveryDate == null ? null : s.deliveryDate > group.deliveryDate ? s.deliveryDate : group.deliveryDate;
    groups.set(key, group);
  }
  return [...groups.values()];
}

/**
 * The Delivery Date a request asks for: the plan's own proposal (production
 * days from today), never earlier than the Settings floor. Null = the plan
 * proposes none (production days are not set), and the request cannot be sent.
 */
export function forecastPurchaseDeliveryDate(planDate: string | null, today: string, minDeliveryDays: number): string | null {
  if (!planDate) return null;
  const earliest = minDeliveryDays > 0 ? forecastPurchaseAddDays(today, minDeliveryDays) : today;
  return planDate > earliest ? planDate : earliest;
}

/**
 * THE RECHECK BEFORE A PO IS ISSUED (owner ruling 2026-10-14, A). For the
 * lines of a request Forecast Purchase asked for, `asking` is what the issue
 * would put on a PO now, and `suggested` is this Monday's suggestion worked
 * out again from today's sales, free stock and PO stock. A line passes when
 * the forecast still wants at least what is being issued. A size the forecast
 * no longer covers at all (`known: false`: it left the list of stock models,
 * or Catalog retired it) never passes.
 */
export function forecastPurchaseIssueShortfall(input: { asking: number; suggested: number; known: boolean }): { ok: true } | { ok: false; reason: "not_forecast_stock" | "coverage_changed" } {
  if (!input.known) return { ok: false, reason: "not_forecast_stock" };
  if (input.asking > input.suggested) return { ok: false, reason: "coverage_changed" };
  return { ok: true };
}

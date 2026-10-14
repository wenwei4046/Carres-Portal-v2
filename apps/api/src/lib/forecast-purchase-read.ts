import {
  expectedArrivalOf,
  forecastPurchaseDeliveryDate,
  forecastPurchaseInScope,
  forecastPurchaseIssueShortfall,
  forecastPurchaseSuggestion,
  forecastPurchaseWindow,
  isOtherCreditor,
  type ForecastPurchaseRequestState,
  type ForecastPurchaseResponse,
  type ForecastPurchaseSize,
} from "@carres/shared";
import { resolveActorNames } from "./actor-names";
import { loadPurchasingSettings } from "./purchasing-settings";
import type { userClient } from "./supabase";
import { salesOrderRegisterPopulation } from "../routes/operation/orders";

/**
 * FORECAST PURCHASE · OUTRIGHT — the ONE read (Purchasing MASTER §9.14).
 *
 * The page, the submit door and the issue door's recheck all read the forecast
 * through here, so the number a person saw, the number the server lets them
 * ask for and the number a PO is checked against are worked out from the same
 * facts by the same code. It writes nothing. Each fact comes from its owner:
 *
 *   which sizes   Catalog: every active size of the stock models
 *                 (`forecastPurchaseInScope`), with Catalog's supplier
 *   sold          Sales Orders: `order_lines.qty` of the Register's own
 *                 population (proceeded, not cancelled, not a subscription),
 *                 by the Malaysia month of `orders.placed_at`, the SO Doc Date
 *   free          Stock: Units that are New and available, at any Site
 *   on PO         Purchasing: `purchasing_po_free_units`, the ONE arithmetic of
 *                 what an open PO line has that no order holds
 *   in progress   Purchasing: `purchasing_forecast_requests_in_progress`
 *                 (0695), the ONE arithmetic of what open Ready Stock requests
 *                 that buy extra have still to put on a PO. A request in
 *                 progress is not stock and not ordered supply
 *   delivery date Purchasing: the plan's own arrival (production days from
 *                 today), never before the Settings floor
 *
 * Nothing is guessed. A source that cannot be read fails the read.
 */
type Sb = ReturnType<typeof userClient>;
export type ReadFailure = { code?: string; message?: string; details?: string };
export type ForecastRead = { ok: true; data: ForecastPurchaseResponse } | { ok: false; error: ReadFailure };

const PAGE = 1000;
const MYT_MS = 8 * 3_600_000;
/** The Malaysia calendar date of an instant. */
const mytDate = (instant: string) => new Date(new Date(instant).getTime() + MYT_MS).toISOString().slice(0, 10);

/** 0695 is applied by hand before the code that needs it is deployed. A
 *  missing function is said as that, never as an empty answer. */
export const isForecastMigrationMissing = (error: ReadFailure | null | undefined) =>
  !!error && (error.code === "PGRST202" || error.code === "42883");

/** Today's holder or cover of a duty, with their name. Fails soft to nobody. */
async function dutyActor(sb: Sb, dutyKey: string): Promise<{ id: string; name: string | null } | null> {
  try {
    const { data, error } = await sb.rpc("workspace_resolve_duty", { p_duty_key: dutyKey });
    const id = !error && data != null && typeof data === "object" ? (data as Record<string, unknown>).actor_user_id : null;
    if (typeof id !== "string") return null;
    let name: string | null = null;
    try { name = (await resolveActorNames(sb, [id])).get(id) ?? null; } catch { name = null; }
    return { id, name };
  } catch {
    return null;
  }
}

export async function readForecastPurchase(sb: Sb, today: string): Promise<ForecastRead> {
  const window = forecastPurchaseWindow(today);

  /* 1 · Catalog: the sizes kept as stock, and who supplies them. */
  const { data: modelRows, error: modelErr } = await sb
    .from("product_models")
    .select("id, name, category, model_key")
    .in("category", ["mattress", "bedframe"]);
  if (modelErr) return { ok: false, error: modelErr };
  const models = new Map(
    ((modelRows ?? []) as Array<{ id: string; name: string | null; category: string | null; model_key: string | null }>)
      .filter((m) => forecastPurchaseInScope(m.category, m.model_key))
      .map((m) => [m.id, m]),
  );

  const { data: skuRows, error: skuErr } = await sb
    .from("product_skus")
    .select("sku, variant, variant_kind, supplier_id, model_id, discontinued_at")
    .eq("variant_kind", "size")
    .is("discontinued_at", null);
  if (skuErr) return { ok: false, error: skuErr };

  const { data: supRows, error: supErr } = await sb.from("suppliers").select("id, name, kind");
  if (supErr) return { ok: false, error: supErr };
  /* An other creditor is Finance's row, never a supplier Purchasing buys
     from: a catalog slot pointing at one reads as no supplier (0477). */
  const supplierName = new Map(
    ((supRows ?? []) as Array<{ id: string; name: string | null; kind?: unknown }>)
      .filter((s) => !isOtherCreditor(s))
      .map((s) => [s.id, (s.name ?? "").trim()]),
  );

  /* The Delivery Date a request would ask for: the plan's own forward
     arithmetic and the Settings floor, the two facts the request form reads.
     Unreadable settings leave the date unknown; the submit door then refuses. */
  let settings: Awaited<ReturnType<typeof loadPurchasingSettings>> | null = null;
  try {
    settings = await loadPurchasingSettings(sb);
  } catch (e) {
    console.error("forecast purchase: purchasing settings unavailable", (e as Error).message);
  }
  const minDeliveryDays = Math.max(0, Number(settings?.manualPurchaseMinDeliveryDays) || 0);

  const sizes = new Map<string, ForecastPurchaseSize>();
  for (const row of (skuRows ?? []) as Array<{ sku: string; variant: string | null; supplier_id: string | null; model_id: string }>) {
    const model = models.get(row.model_id);
    if (!model || !row.sku) continue;
    const supplier = row.supplier_id ? supplierName.get(row.supplier_id) ?? null : null;
    const supplierId = supplier ? row.supplier_id : null;
    const category = (model.category ?? "").toLowerCase();
    const arrival = settings && supplierId ? expectedArrivalOf(settings, { supplierId, category, fromIso: today }) : null;
    sizes.set(row.sku, {
      sku: row.sku,
      modelId: model.id,
      model: (model.name ?? "").trim() || row.sku,
      category,
      size: (row.variant ?? "").trim(),
      supplierId,
      supplier: supplier || null,
      sold: [0, 0, 0],
      sold14: 0,
      free: 0,
      onPo: 0,
      inProgress: 0,
      requests: [],
      deliveryDate: forecastPurchaseDeliveryDate(arrival, today, minDeliveryDays),
    });
  }

  /* 2 · Sold: the Register's own population, by the month of the SO Doc Date. */
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await salesOrderRegisterPopulation(
      sb.from("orders").select("id, placed_at, order_lines(sku, qty)"),
    )
      .gte("placed_at", `${window.from}T00:00:00+08:00`)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return { ok: false, error };
    const page = (data ?? []) as unknown as Array<{ placed_at: string | null; order_lines?: Array<{ sku: string | null; qty: number | null }> | null }>;
    for (const order of page) {
      if (!order.placed_at) continue;
      const date = mytDate(order.placed_at);
      if (date > today) continue;
      const month = window.months.indexOf(date.slice(0, 7));
      for (const line of order.order_lines ?? []) {
        const size = line.sku ? sizes.get(line.sku) : undefined;
        const qty = Math.max(0, Number(line.qty ?? 0));
        if (!size || qty <= 0) continue;
        if (month >= 0) size.sold[month] += qty;
        if (date > window.after14) size.sold14 += qty;
      }
    }
    if (page.length < PAGE) break;
  }

  /* 3 · Free stock: New Units that are available. Display, older and damaged
     Units, and anything reserved or gone out, are not counted. */
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("stock_unit_register_v")
      .select("id, sku, qty")
      .eq("availability", "available")
      .eq("condition", "new")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return { ok: false, error };
    const page = (data ?? []) as Array<{ sku: string | null; qty: number | null }>;
    for (const unit of page) {
      const size = unit.sku ? sizes.get(unit.sku) : undefined;
      if (size) size.free += Math.max(1, Number(unit.qty ?? 1));
    }
    if (page.length < PAGE) break;
  }

  /* 4 · On a PO, not arrived, held by no order. */
  const { data: poRows, error: poErr } = await sb.rpc("purchasing_po_free_units");
  if (poErr) return { ok: false, error: poErr };
  for (const row of (poRows ?? []) as Array<{ sku: string | null; free_units: number | null }>) {
    const size = row.sku ? sizes.get(row.sku) : undefined;
    if (size) size.onPo += Math.max(0, Number(row.free_units ?? 0));
  }

  /* 5 · Requests in progress: the database's one arithmetic (0695), the same
     rows the submit door checks under its lock. */
  const { data: progressRows, error: progressErr } = await sb.rpc("purchasing_forecast_requests_in_progress");
  if (progressErr) return { ok: false, error: progressErr };
  for (const row of (progressRows ?? []) as Array<{ request_id: string; req_no: string | null; state: string; sku: string | null; qty: number | null; from_forecast: boolean | null }>) {
    const size = row.sku ? sizes.get(row.sku) : undefined;
    const qty = Math.max(0, Number(row.qty ?? 0));
    if (!size || qty <= 0) continue;
    size.inProgress += qty;
    size.requests.push({
      id: row.request_id,
      no: row.req_no,
      qty,
      state: (row.state === "ready" || row.state === "sent_back" ? row.state : "waiting") as ForecastPurchaseRequestState,
      fromForecast: row.from_forecast === true,
    });
  }

  /* 6 · Where a request's goods go, and who acts next. */
  const { data: destinationRows, error: destinationErr } = await sb
    .from("purchasing_destinations")
    .select("id, name, is_default, active");
  if (destinationErr) return { ok: false, error: destinationErr };
  const destination = ((destinationRows ?? []) as Array<{ id: string; name: string | null; is_default: boolean | null; active: boolean | null }>)
    .find((d) => d.is_default === true && d.active !== false) ?? null;
  const [approver, poDuty] = await Promise.all([dutyActor(sb, "purchasing_approver"), dutyActor(sb, "po_duty")]);

  return {
    ok: true,
    data: {
      today,
      months: window.months,
      mondays: window.mondays,
      sizes: [...sizes.values()].sort((a, b) => a.sku.localeCompare(b.sku)),
      deliverTo: destination ? { id: destination.id, name: (destination.name ?? "").trim() } : null,
      approver,
      poDuty,
    },
  };
}

/** What the issue door hands in for one line it is about to put on a PO. */
export interface ForecastIssueLine {
  requestId: string;
  sku: string;
  issueQty: number;
}

export type ForecastIssueRefusal =
  | { code: "forecast_request_changed" | "forecast_not_stock_item"; requestId: string; sku: string }
  | { code: "forecast_coverage_changed"; requestId: string; sku: string; qty: number; toBuy: number };

/**
 * THE RECHECK BEFORE A PO IS ISSUED (owner ruling 2026-10-14, A): "revalidate
 * the approved quantities, existing stock/PO coverage and source version
 * before issuance; material changes cannot silently reuse a decision on a
 * different request scope".
 *
 * It concerns ONLY the requests Forecast Purchase asked for, known by their
 * structured mark (0695), never by a text match. An ordinary Manual Purchase
 * Request, Ready Stock that buys extra included, is not looked at and keeps
 * its own rules.
 *
 * For a forecast request, each line about to be issued must
 *   · be a line the forecast asked for (a line added later was never part of
 *     the forecast the approver decided on: `forecast_request_changed`);
 *   · still be forecast stock (`forecast_not_stock_item`);
 *   · and, with every other forecast line for the same size in this issue,
 *     ask for no more than the forecast suggests NOW, worked out again from
 *     today's sales, free stock and PO stock (`forecast_coverage_changed`).
 *     Goods that arrived, a PO issued meanwhile or sales that fell make the
 *     approved quantity a decision on a different scope.
 *
 * `null` = issue. A read that fails is thrown to the caller, which refuses:
 * a PO is never issued against a forecast nobody could read.
 */
export async function forecastIssueRefusal(sb: Sb, today: string, lines: ReadonlyArray<ForecastIssueLine>): Promise<ForecastIssueRefusal | null> {
  const requestIds = [...new Set(lines.map((line) => line.requestId))];
  if (requestIds.length === 0) return null;
  const { data: markRows, error: markErr } = await sb.rpc("purchasing_forecast_request_marks", { p_request_ids: requestIds });
  /* Before 0695 is applied no request can carry a forecast mark, so there is
     nothing to recheck. Any other failure stops the issue. */
  if (markErr) {
    if (isForecastMigrationMissing(markErr)) return null;
    throw Object.assign(new Error(markErr.message ?? "forecast marks unavailable"), { pg: markErr });
  }
  const marks = new Map(
    ((Array.isArray(markRows) ? markRows : []) as Array<{ request_id: string; lines: unknown }>).map((row) => [
      row.request_id,
      new Set((Array.isArray(row.lines) ? row.lines : []).map((line) => String((line as { sku?: unknown }).sku ?? ""))),
    ]),
  );
  const forecastLines = lines.filter((line) => marks.has(line.requestId));
  if (forecastLines.length === 0) return null;

  for (const line of forecastLines) {
    if (!marks.get(line.requestId)!.has(line.sku)) return { code: "forecast_request_changed", requestId: line.requestId, sku: line.sku };
  }

  const read = await readForecastPurchase(sb, today);
  if (!read.ok) throw Object.assign(new Error(read.error.message ?? "forecast unavailable"), { pg: read.error });
  const sizes = new Map(read.data.sizes.map((size) => [size.sku, size]));
  const asking = new Map<string, number>();
  for (const line of forecastLines) asking.set(line.sku, (asking.get(line.sku) ?? 0) + line.issueQty);
  for (const line of forecastLines) {
    const size = sizes.get(line.sku);
    const suggested = size ? forecastPurchaseSuggestion(size).weeks[0] : 0;
    const verdict = forecastPurchaseIssueShortfall({ asking: asking.get(line.sku) ?? 0, suggested, known: !!size });
    if (verdict.ok) continue;
    if (verdict.reason === "not_forecast_stock") return { code: "forecast_not_stock_item", requestId: line.requestId, sku: line.sku };
    return { code: "forecast_coverage_changed", requestId: line.requestId, sku: line.sku, qty: asking.get(line.sku) ?? 0, toBuy: suggested };
  }
  return null;
}

/** A size as a person reads it in a refusal: `Model Size`, else its SKU. */
export async function forecastItemWord(sb: Sb, sku: string): Promise<string> {
  try {
    const { data } = await sb.from("product_skus").select("sku, variant, product_models(name)").eq("sku", sku).maybeSingle();
    const row = data as { variant?: string | null; product_models?: { name?: string | null } | null } | null;
    const word = [row?.product_models?.name ?? "", row?.variant ?? ""].map((part) => String(part).trim()).filter(Boolean).join(" ");
    return word || sku;
  } catch {
    return sku;
  }
}

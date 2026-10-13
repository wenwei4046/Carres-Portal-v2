import { Hono } from "hono";
import {
  forecastPurchaseInScope,
  forecastPurchaseWindow,
  isOtherCreditor,
  type ForecastPurchaseRequestState,
  type ForecastPurchaseResponse,
  type ForecastPurchaseSize,
} from "@carres/shared";
import { resolveActorNames } from "../../lib/actor-names";
import { requireOperation } from "../../lib/auth-guards";
import { loadPurchasingNumbers } from "../../lib/purchasing-settings";
import { fail } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import { todayIsoMYT } from "../../lib/today";
import type { AppEnv } from "../../types";
import { salesOrderRegisterPopulation } from "./orders";

/**
 * FORECAST PURCHASE · OUTRIGHT — the page's one read (owner 13 Oct 2026;
 * Purchasing MASTER §9.14). READ-ONLY: it writes nothing and suggests nothing
 * itself. It hands the page four facts per size, each from its owner, and the
 * shared arithmetic (`forecastPurchaseSuggestion`) works out the rest:
 *
 *   which sizes   Catalog: every active mattress size and the Jager bedframe
 *                 (`forecastPurchaseInScope`), with Catalog's supplier
 *   sold          Sales Orders: `order_lines.qty` of the Register's own
 *                 population (proceeded, not cancelled, not a subscription),
 *                 by the Malaysia month of `orders.placed_at`, the SO Doc Date
 *   free          Stock: Units that are New and available, at any Site
 *   on PO         Purchasing: `purchasing_po_free_units`, the ONE arithmetic of
 *                 what an open PO line has that no order holds
 *   requested     Purchasing: open Manual Purchase Requests for `Ready Stock`
 *                 that buy extra, by what each line has not yet put on a PO
 *
 * Nothing is guessed. A source that cannot be read fails the request, so the
 * list shows its error state and never a number nobody read.
 *
 * ── WHAT `Send for approval` NEEDS (owner ruling 2026-10-14, A) ─────────────
 *
 * The page raises Manual Purchase Requests through the existing door and
 * nothing else. This read hands it the facts that door asks for: the default
 * Deliver To and the Settings floor for a Delivery Date, and names who acts
 * next, both through the ONE duty resolver: the Purchasing Approver, then PO
 * Duty. Names are labels: an unreadable name never fails the read.
 */
const forecastPurchaseRouter = new Hono<AppEnv>();

const PAGE = 1000;
const REQUEST_CHUNK = 100;
const MYT_MS = 8 * 3_600_000;
/** The Malaysia calendar date of an instant. */
const mytDate = (instant: string) => new Date(new Date(instant).getTime() + MYT_MS).toISOString().slice(0, 10);

/** Today's holder or cover of a duty, with their name. Fails soft to nobody. */
async function dutyActor(sb: ReturnType<typeof userClient>, dutyKey: string): Promise<{ id: string; name: string | null } | null> {
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

forecastPurchaseRouter.get("/", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const today = todayIsoMYT();
  const window = forecastPurchaseWindow(today);

  /* 1 · Catalog: the sizes kept as stock, and who supplies them. */
  const { data: modelRows, error: modelErr } = await sb
    .from("product_models")
    .select("id, name, category, model_key")
    .in("category", ["mattress", "bedframe"]);
  if (modelErr) return fail(c, modelErr);
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
  if (skuErr) return fail(c, skuErr);

  const { data: supRows, error: supErr } = await sb.from("suppliers").select("id, name, kind");
  if (supErr) return fail(c, supErr);
  /* An other creditor is Finance's row, never a supplier Purchasing buys
     from: a catalog slot pointing at one reads as no supplier (0477). */
  const supplierName = new Map(
    ((supRows ?? []) as Array<{ id: string; name: string | null; kind?: unknown }>)
      .filter((s) => !isOtherCreditor(s))
      .map((s) => [s.id, (s.name ?? "").trim()]),
  );

  const sizes = new Map<string, ForecastPurchaseSize>();
  for (const row of (skuRows ?? []) as Array<{ sku: string; variant: string | null; supplier_id: string | null; model_id: string }>) {
    const model = models.get(row.model_id);
    if (!model || !row.sku) continue;
    const supplier = row.supplier_id ? supplierName.get(row.supplier_id) ?? null : null;
    sizes.set(row.sku, {
      sku: row.sku,
      modelId: model.id,
      model: (model.name ?? "").trim() || row.sku,
      category: (model.category ?? "").toLowerCase(),
      size: (row.variant ?? "").trim(),
      supplierId: supplier ? row.supplier_id : null,
      supplier: supplier || null,
      sold: [0, 0, 0],
      sold14: 0,
      free: 0,
      onPo: 0,
      requested: 0,
      requests: [],
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
    if (error) return fail(c, error);
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
    if (error) return fail(c, error);
    const page = (data ?? []) as Array<{ sku: string | null; qty: number | null }>;
    for (const unit of page) {
      const size = unit.sku ? sizes.get(unit.sku) : undefined;
      if (size) size.free += Math.max(1, Number(unit.qty ?? 1));
    }
    if (page.length < PAGE) break;
  }

  /* 4 · On a PO, not arrived, held by no order. */
  const { data: poRows, error: poErr } = await sb.rpc("purchasing_po_free_units");
  if (poErr) return fail(c, poErr);
  for (const row of (poRows ?? []) as Array<{ sku: string | null; free_units: number | null }>) {
    const size = row.sku ? sizes.get(row.sku) : undefined;
    if (size) size.onPo += Math.max(0, Number(row.free_units ?? 0));
  }

  /* 5 · Asked for and not yet on a PO: open Ready Stock requests that buy
     extra. A refused or withdrawn request asks for nothing; a line that is
     cancelled, or already on its PO, is not counted here (its Units are in 4). */
  const { data: requestRows, error: requestErr } = await sb
    .from("purchase_requests")
    .select("id, req_no, approved_at, sent_back_at, created_at")
    .eq("purpose", "ready_stock")
    .eq("fulfilment_intent", "additional_stock")
    .is("refused_at", null)
    .is("withdrawn_at", null)
    .order("created_at", { ascending: true });
  if (requestErr) return fail(c, requestErr);
  const requests = new Map(
    ((requestRows ?? []) as Array<{ id: string; req_no: string | null; approved_at: string | null; sent_back_at: string | null }>).map((r) => [
      r.id,
      { no: r.req_no, state: (r.approved_at ? "ready" : r.sent_back_at ? "sent_back" : "waiting") as ForecastPurchaseRequestState },
    ]),
  );
  const requestIds = [...requests.keys()];
  for (let from = 0; from < requestIds.length; from += REQUEST_CHUNK) {
    const { data, error } = await sb
      .from("purchase_demands")
      .select("request_id, sku, qty, approved_qty, issued_qty, cancelled_at")
      .in("request_id", requestIds.slice(from, from + REQUEST_CHUNK));
    if (error) return fail(c, error);
    for (const line of (data ?? []) as Array<{ request_id: string; sku: string | null; qty: number | null; approved_qty: number | null; issued_qty: number | null; cancelled_at: string | null }>) {
      const size = line.sku ? sizes.get(line.sku) : undefined;
      const request = requests.get(line.request_id);
      if (!size || !request || line.cancelled_at) continue;
      const left = Math.max(0, Number(line.approved_qty ?? line.qty ?? 0) - Math.max(0, Number(line.issued_qty ?? 0)));
      if (left <= 0) continue;
      size.requested += left;
      size.requests.push({ id: line.request_id, no: request.no, qty: left, state: request.state });
    }
  }

  /* 6 · What `Send for approval` needs: where the goods go, the Settings floor
     for a Delivery Date, and who acts next. */
  const { data: destinationRows, error: destinationErr } = await sb
    .from("purchasing_destinations")
    .select("id, name, is_default, active");
  if (destinationErr) return fail(c, destinationErr);
  const destination = ((destinationRows ?? []) as Array<{ id: string; name: string | null; is_default: boolean | null; active: boolean | null }>)
    .find((d) => d.is_default === true && d.active !== false) ?? null;
  let minDeliveryDays = 0;
  try {
    minDeliveryDays = Math.max(0, Number((await loadPurchasingNumbers(sb)).manualPurchaseMinDeliveryDays) || 0);
  } catch (e) {
    /* The create door reads the same setting and refuses a date before it,
       so an unreadable floor here cannot let an early date through. */
    console.error("forecast purchase: purchasing settings unavailable", (e as Error).message);
  }
  const [approver, poDuty] = await Promise.all([dutyActor(sb, "purchasing_approver"), dutyActor(sb, "po_duty")]);

  const body: ForecastPurchaseResponse = {
    today,
    months: window.months,
    mondays: window.mondays,
    sizes: [...sizes.values()].sort((a, b) => a.sku.localeCompare(b.sku)),
    deliverTo: destination ? { id: destination.id, name: (destination.name ?? "").trim() } : null,
    minDeliveryDays,
    approver,
    poDuty,
  };
  return c.json(body);
});

export default forecastPurchaseRouter;

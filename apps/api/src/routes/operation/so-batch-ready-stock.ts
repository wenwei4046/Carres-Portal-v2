import { Hono } from "hono";
import {
  READY_STOCK_DRAW_REASON,
  readyStockReserveInputSchema,
  stockMatchKey,
  type ReadyStockLine,
  type ReadyStockResponse,
  type ReadyStockUnit,
} from "@carres/shared";
import { requireOperation } from "../../lib/auth-guards";
import { readFreeStock } from "../../lib/purchase-demand-read";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * ── SO BATCH PURCHASE · READY STOCK ─────────────────────────────────────────
 *
 * Two doors under one Sales Order: what free stock could answer its item lines,
 * and the one act that commits an exact Unit to an exact line.
 *
 * ── WHY THIS IS NOT PART OF THE REGISTER READ ───────────────────────────────
 *
 * The Register answers *what still needs buying* for every proceeded Sales
 * Order at once. This answers *what is on the shelf for THIS one*, and it is
 * read only when an operator opens the section — the same lazy shape the Unit
 * ID disclosure already has. Folding it into the Register would make every
 * page load count the whole warehouse for rows nobody opened.
 *
 * ── WHAT THIS ROUTE DOES NOT DECIDE ─────────────────────────────────────────
 *
 * Nothing. Availability is `stock_unit_register_v`'s (0371). Eligibility and
 * the remaining requirement are `ops_stock_pool_draw`'s, in SQL, on the locked
 * row — this route computes the same numbers only so the table can EXPLAIN
 * itself before the operator presses anything. The server refuses again at the
 * door, so a stale browser cannot reserve against last hour's demand.
 */
const soBatchReadyStockRouter = new Hono<AppEnv>();

type OrderRow = { id: string; so: number | null };
type LineRow = { id: string; sku: string; qty: number; attrs: unknown };

/**
 * The model name a line shows. `order_lines.attrs` is the same jsonb the
 * demand read already mines; there is no second catalog lookup here because
 * the Ready Stock table names the GOODS ON THE SHELF, and the item line's own
 * words are what the operator is matching against.
 */
function itemWordsOf(line: LineRow): string {
  const attrs = line.attrs;
  if (attrs && typeof attrs === "object") {
    const model = (attrs as Record<string, unknown>).modelName;
    if (typeof model === "string" && model.length > 0) return model;
  }
  return line.sku;
}

/** `SO-1251`, or null when the order has no customer-facing number yet. */
function referenceOf(order: OrderRow): string | null {
  return order.so != null ? `SO-${order.so}` : null;
}

/**
 * GET /api/operation/purchase/demands/:orderId/ready-stock
 *
 * READING THIS RESERVES NOTHING. It is a projection and it writes no row.
 */
soBatchReadyStockRouter.get("/:orderId/ready-stock", requireOperation, async (c) => {
  const orderId = c.req.param("orderId");
  const sb = userClient(c.env, c.var.auth.jwt);

  const [{ data: order, error: orderErr }, { data: lineRows, error: linesErr }] =
    await Promise.all([
      sb.from("orders").select("id, so").eq("id", orderId).maybeSingle(),
      sb.from("order_lines").select("id, sku, qty, attrs").eq("order_id", orderId),
    ]);
  const firstError = orderErr ?? linesErr;
  if (firstError) {
    const m = mapPgError(firstError);
    return c.json(m.body, m.status);
  }
  if (!order) return c.json({ error: "order_not_found", code: "order_not_found" }, 404);

  const lines = (lineRows ?? []) as LineRow[];
  const lineIds = lines.map((l) => l.id);

  /* What already answers each line: the Units bound to it, and its own
     non-cancelled purchase-order lineage. Both are exact — `po_line_sources`
     names the item line (0382) and `reserved_order_line_id` names it too
     (0471), so neither number is a share of an order-level total. */
  const reservedByLine = new Map<string, { qty: number; codes: string[] }>();
  const onPoByLine = new Map<string, number>();
  if (lineIds.length > 0) {
    const [{ data: bound, error: boundErr }, { data: sources, error: srcErr }] =
      await Promise.all([
        sb
          .from("ops_stock_items")
          .select("unit_code, qty, reserved_order_line_id")
          .in("reserved_order_line_id", lineIds)
          .in("status", ["reserved", "sold"]),
        sb
          .from("po_line_sources")
          .select("order_line_id, qty, purchase_orders!inner(status)")
          .in("order_line_id", lineIds)
          .neq("purchase_orders.status", "cancelled"),
      ]);
    const readErr = boundErr ?? srcErr;
    if (readErr) {
      const m = mapPgError(readErr);
      return c.json(m.body, m.status);
    }
    for (const r of (bound ?? []) as Record<string, unknown>[]) {
      const id = r.reserved_order_line_id as string;
      const prev = reservedByLine.get(id) ?? { qty: 0, codes: [] };
      const code = (r.unit_code as string | null) ?? null;
      reservedByLine.set(id, {
        qty: prev.qty + Math.max(1, Number(r.qty ?? 1)),
        codes: code ? [...prev.codes, code] : prev.codes,
      });
    }
    for (const r of (sources ?? []) as Record<string, unknown>[]) {
      const id = r.order_line_id as string | null;
      if (!id) continue;
      onPoByLine.set(id, (onPoByLine.get(id) ?? 0) + Math.max(0, Number(r.qty ?? 0)));
    }
  }

  /**
   * THE ORIGINAL DEMAND IS PRESERVED. `qty` is what the customer ordered and
   * is never reduced by a reservation — the reduction is stated beside it, so
   * the operator can always read *Requested 2 = Ready Stock 1 + To purchase 1*
   * rather than watching a number quietly shrink.
   */
  const outLines: ReadyStockLine[] = lines.map((l) => {
    const reserved = reservedByLine.get(l.id) ?? { qty: 0, codes: [] };
    const onPo = onPoByLine.get(l.id) ?? 0;
    return {
      orderLineId: l.id,
      sku: l.sku,
      item: itemWordsOf(l),
      qty: Math.max(0, Number(l.qty) || 0),
      reservedQty: reserved.qty,
      reservedUnitCodes: [...reserved.codes].sort(),
      onPoQty: onPo,
      remainingQty: Math.max(0, (Number(l.qty) || 0) - reserved.qty - onPo),
    };
  });

  /* The offer, off the authoritative register view — every available Unit,
     at whatever site holds it. */
  const { freeUnitsByKey } = await readFreeStock(sb);

  const linesByKey = new Map<string, ReadyStockLine[]>();
  for (const l of outLines) {
    const key = stockMatchKey(l.sku);
    linesByKey.set(key, [...(linesByKey.get(key) ?? []), l]);
  }

  const units: ReadyStockUnit[] = [];
  for (const [key, matched] of linesByKey) {
    for (const u of freeUnitsByKey.get(key) ?? []) {
      const needing = matched.filter((l) => l.remainingQty > 0);
      units.push({
        itemId: u.id,
        unitCode: u.unitCode,
        identityScope: u.identityScope === "quantity" ? "quantity" : "unit",
        sku: u.sku,
        condition: u.condition,
        siteName: u.siteName,
        holderName: u.holderName,
        ownership:
          u.ownership === "supplier_consignment" ? "supplier_consignment" : "carres_owned",
        supplier: u.supplier,
        qty: u.qty,
        dateIn: u.dateIn,
        matchingLineIds: needing.map((l) => l.orderLineId),
        /* 0368: bulk is not bindable. The row still shows — hiding the 893
           counted pieces would make a full shelf read as an empty one. */
        blocked:
          u.identityScope !== "unit"
            ? "counted_stock"
            : needing.length === 0
              ? "no_line_needs_it"
              : null,
      });
    }
  }
  units.sort((a, b) => (a.unitCode ?? "").localeCompare(b.unitCode ?? ""));

  const body: ReadyStockResponse = {
    orderId: order.id as string,
    so: (order.so as number | null) ?? null,
    reference: referenceOf(order as OrderRow),
    lines: outLines,
    units,
  };
  return c.json(body);
});

/**
 * POST /api/operation/purchase/demands/ready-stock/reserve
 *
 * ONE ACT, ONE TRANSACTION. `so_batch_reserve_ready_units` (0471) loops the
 * ONE governed draw door inside a single transaction: every chosen Unit is
 * committed to its named item line, or none is and the refusal says which Unit
 * stopped it. There is no partial success to explain and no second writer.
 *
 * The browser names Units and lines; it decides NOTHING. The door re-derives
 * the line's remaining requirement from the locked rows, so a tab left open
 * across someone else's purchase order is refused by name rather than allowed
 * to over-commit.
 */
soBatchReadyStockRouter.post("/ready-stock/reserve", requireOperation, async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json", code: "invalid_json" }, 400);
  }
  const parsed = readyStockReserveInputSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", code: "invalid_param" }, 400);
  }
  const { orderId, picks } = parsed.data;
  const sb = userClient(c.env, c.var.auth.jwt);

  const { data: order, error: orderErr } = await sb
    .from("orders")
    .select("id, so")
    .eq("id", orderId)
    .maybeSingle();
  if (orderErr) {
    const m = mapPgError(orderErr);
    return c.json(m.body, m.status);
  }
  if (!order) return c.json({ error: "order_not_found", code: "order_not_found" }, 404);

  const reference = referenceOf(order as OrderRow);
  if (!reference) {
    /* `ops_stock_pool_draw` refuses an empty reference by name. Refused here
       instead, so the operator reads the reason rather than a 500. */
    return c.json({ error: "no_reference", code: "no_reference" }, 422);
  }

  const { data, error } = await sb.rpc("so_batch_reserve_ready_units", {
    p_ref: reference,
    /* P13 (0322) — K4's sixth reason, in the ledger's own vocabulary: this is
       stock taken INSTEAD of raising a purchase order, which is exactly what
       this page's button means. Nothing is typed and nothing can be mistyped. */
    p_reason: READY_STOCK_DRAW_REASON,
    p_note: `SO Batch Purchase · ${reference}`,
    p_picks: picks,
  });
  if (error) {
    const m = mapPgError(error);
    /* The detail carries the door's own code (`unit_does_not_match_line`,
       `line_already_covered`, `unit_no_longer_free`, …). Pass it through so the
       browser prints the governed sentence for THAT refusal rather than a
       generic one. */
    const code =
      (error as { message?: string }).message?.match(
        /(order_line_required|order_line_not_found|line_not_in_order|unit_not_found|unit_does_not_match_line|unit_not_available|quantity_row_not_bindable|line_already_covered|unit_no_longer_free|no_units_chosen|too_many_units|line_needs_sales_order_ref|line_needs_exact_unit)/,
      )?.[1] ?? null;
    return c.json({ ...(m.body as object), ...(code ? { code } : {}) }, m.status);
  }

  return c.json(data);
});

export default soBatchReadyStockRouter;

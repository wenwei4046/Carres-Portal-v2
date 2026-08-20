import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { MiddlewareHandler } from "hono";
import { z } from "zod";
import {
  abandonOrderInput,
  assignPartnerInput,
  attachDoInput,
  codInstruction,
  paymentApprovalOpensGate,
  type DeliveryPaymentApproval,
  confirmProceedRequestInputSchema,
  ListOperationOrdersQuery,
  recheckStockInput,
  reselectPartnerInput,
  deliveryQueueLeads,
  myHolidaySet,
  orderMoney,
  resolveBookingBrief,
  resolveCurrentCustomerCommitment,
  resolveOrderCompletion,
  resolveUnitAllocation,
  storageHold,
  transferReadyInputSchema,
  warehousePickInput,
  type AllocationUnit,
  type CommitmentBundle,
  normalizeSkuKey,
} from "@carres/shared";
// renderDoPdf moved to apps/web/src/lib/pdf/render.ts (Workers WASM ban).
import type { DoTemplateData } from "../../lib/pdf/types";
import { loadBookingContext } from "../../lib/booking-context";
import { requireOperation, requireOperationOrPrincipal } from "../../lib/auth-guards";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { storageBlock } from "../../lib/storage-gate";
import { userClient } from "../../lib/supabase";

import { skuCategories } from "../../lib/sku-categories";
import type { AppEnv } from "../../types";

/**
 * /api/operation/orders — Phase 4 backend orders subsystem.
 *
 * M2 endpoints (list + drawer + actions):
 *   GET    /                       — list with stage/channel/search filters
 *   GET    /:id                    — drawer detail
 *   POST   /:id/assign-partner     — D1 dispatch step 1
 *   POST   /:id/attach-do          — D1 dispatch step 2 (operation_attach_do_and_deliver)
 *   POST   /:id/abandon            — A6 post-proceed cancel
 *   POST   /:id/warehouse          — warehouse pick
 *   POST   /:id/recheck-stock      — E1 re-check stock
 *
 * M4 endpoint:
 *   GET    /:id/print-do           — server-side DO PDF (E2 / spec §17.3)
 *
 * Auth: every route guards with `requireOperation` per-route — NOT a blanket
 * `use("*", ...)` middleware. The blanket pattern leaks across sibling sub-
 * routers mounted at the same path (`resumeDispatchRouter`) and silently
 * 403's traffic the sibling intends to admit (principal). See
 * `lib/auth-guards.ts` docstring + carry-forward
 * `phase-4.5-chunk-2-route-mount-middleware-leak` for the full rationale.
 *
 * Pattern: matches apps/api/src/routes/principal/dealers.ts (multi-endpoint
 * router with per-route role guard + shared mapPgError/parseJsonBody from
 * lib/route-helpers).
 */
const operationOrdersRouter = new Hono<AppEnv>();

/** Management owns the commercial decision; operation may route the request
 * but cannot approve its own proposal. The database repeats this gate. */
const requirePrincipal: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.var.auth?.role !== "principal") {
    throw new HTTPException(403, { message: "Principal only" });
  }
  await next();
};

/**
 * Pipeline v2 error mapping. Wraps the generic `mapPgError` to expose the
 * 22023 detail code (`wrong_stage` / `warehouse_required`) and, for P0001
 * `insufficient_stock_for_reserve`, pass through the RPC's `hint`
 * ("sku=… warehouse_id=…") so the UI can name the offending pair.
 *
 * The default `mapPgError` collapses 22023 to a generic `invalid_param`
 * code; pipeline v2 contracts (spec §5, migration 0024:354-414) require the
 * actual detail value to surface so the FE can branch on it.
 */
function mapPipelineV2Error(error: { code?: string; message?: string; details?: string; hint?: string }) {
  if (error.code === "22023") {
    return {
      status: 422 as const,
      body: {
        error: "rule_violation",
        code: error.details ?? "invalid_param",
        message: error.message ?? "rule violation",
      },
    };
  }
  if (error.code === "P0001" && error.details === "insufficient_stock_for_reserve") {
    return {
      status: 422 as const,
      body: {
        error: "rule_violation",
        code: error.details,
        message: error.message ?? "insufficient stock to reserve",
        hint: error.hint ?? null,
      },
    };
  }
  return mapPgError(error);
}

/**
 * sku → `Model · Variant`, the ONE human-readable product name in this module.
 *
 * **Extracted by STAGE 1, not written by it.** The detail route has resolved
 * exactly this since 2026-07-16 so the drawer's Items table could show names
 * instead of raw codes; the Sales Orders register needs the same names on the
 * ROW, and the alternative was a second sku→name implementation in the
 * browser. `ERP-ARCHITECTURE.md` Law D: *"If two surfaces must agree on a
 * number they call ONE function — not two implementations that currently
 * agree."* A product name is that kind of fact, so the list and the document
 * call this.
 *
 * The query, the join and the `model · variant` spelling are byte-identical to
 * what the detail route already ran. `order_lines.sku` has no FK to
 * `product_skus`, so this is a separate batched query (`ONE .in("sku", […])`
 * per page), never a PostgREST embed and never one query per order.
 *
 * **A miss is normal and must stay silent.** Measured on production
 * 2026-08-09: of 84 distinct SKUs on live orders only 37 are in the catalog —
 * every NATIVE line resolves, and every AutoCount line misses because an
 * imported "sku" IS free text like `1013Jager/Fab3-King/PC151-01`. There is no
 * name to find, so the caller falls back to that text: it is what the
 * salesperson actually wrote on the order.
 */
async function resolveSkuLabels(
  sb: ReturnType<typeof userClient>,
  skus: readonly (string | null | undefined)[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const wanted = [...new Set(skus.filter((s): s is string => !!s))];
  if (wanted.length === 0) return out;
  const { data, error } = await sb
    .from("product_skus")
    .select("sku, variant, product_models(name)")
    .in("sku", wanted);
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (data ?? []) as any[]) {
    const label = [r.product_models?.name ?? "", r.variant ?? ""]
      .filter(Boolean)
      .join(" · ");
    if (label) out[r.sku] = label;
  }
  return out;
}

// ----- GET / list -----
operationOrdersRouter.get("/", requireOperation, async (c) => {
  const parsed = ListOperationOrdersQuery.safeParse({
    stage: c.req.query("stage") ?? undefined,
    channel: c.req.query("channel") ?? undefined,
    search: c.req.query("search") ?? undefined,
  });
  if (!parsed.success) {
    return c.json(
      { error: "invalid_query", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid query" },
      422,
    );
  }
  const { stage, channel, search } = parsed.data;

  const sb = userClient(c.env, c.var.auth.jwt);
  // Phase 4.5 Chunk 2 (T9): customer-leg LP fields now live on
  // `order_supplier_threads` (migration 0049 added the columns; 0050 backfilled
  // them from PO). FE OrderCard reads `threads[].delivery_partner_id` instead
  // of order-level `delivery_partner_id` to surface the LP pill. Embedding via
  // PostgREST nested fetch keeps the round-trip count at 1; threads come back
  // as an array per order. The order-level `delivery_partner_id` is kept for
  // print-DO + legacy callers (no change here).
  let q = sb
    .from("orders")
    .select(
      // Migration 0147 (item h, 2026-05-23) — surface the order-level LP
      // request/accept/reject state so the kanban can show a red "LP
      // rejected" badge + the FE can open a reselect dialog. These mirror
      // the per-thread fields on order_supplier_threads but at the order
      // level (customer-leg LP is one per order).
      //
      // The `!orders_delivery_partner_id_fkey` hint on the order-level
      // delivery_partners embed is REQUIRED, not optional: `orders` has TWO
      // FKs to delivery_partners (delivery_partner_id + ops_assigned_logistic,
      // the latter added by migration 0136). A bare `delivery_partners(...)`
      // embed is ambiguous → PostgREST PGRST201 → mapPgError default → 500.
      // Do NOT remove the hint. Same rule for every order-level embed of
      // delivery_partners (print-do-data below + partner/pickups.ts).
      // 2026-06-08 (Jess redesign step 2) — the Orders **control table**
      // (OperationOrdersControl) consumes this same list. It needs a few extra
      // flat columns the kanban OrderCard never used: customer_phone (row
      // subtitle), delivery_date_tbd (交期 cell), source_system + source_ref
      // (CR/TCF/SO ref prefix + the AutoCount→Proceed / native→Placed tab
      // entry rule), ops_assigned_logistic (Inbox-triage LP shown in the 物流
      // cell when no formal LP yet), and a compact order_lines(sku,qty) embed
      // for the 货品 items summary. All additive — the kanban ignores them.
      // ops_assigned_logistic stays a raw id here (resolved to a name client
      // side via the partners list) to avoid a 2nd ambiguous delivery_partners
      // FK embed (orders has two FKs to delivery_partners → PGRST201/500).
      // 2026-06-09 (Jess P2, project-orders-control-spec) — customer_address
      // added so the control table can tag each row KV / Outstation + suggest a
      // default carrier (apps/web/src/lib/region.ts) without opening the drawer.
      // 2026-07-26 (T1, delivery-execution-queue) — booking_stage +
      // confirmed_date + confirmed_time_slot (0277 two-stage booking) so the
      // list's Delivery column + queues can tell the customer's confirmed
      // booking apart from the carrier's provisional date.
      // 2026-07-27 (T7, delivery-execution-queue) — delivery_photos (0280) so
      // the "Upload delivery photo" queue can count delivered orders with no
      // proof attached. Only the LEDGER rides the list (paths, not URLs — a
      // signed view URL is minted per click in the drawer).
      // 2026-07-27 (T11, delivery-execution-queue) — booking_groups (0282) so
      // the Delivery module's detail pane can name what THIS trip carries and
      // what is still owed on a second trip. NULL = the whole order, exactly as
      // 2026-07-27 (C5, portal-core-execution-queue) — `paid` + per-line
      // `unit_price` + the `order_addons` sum, so the list can compute what an
      // order still owes from the ONE money truth (`orders.paid`) through the
      // shared `orderMoney`. The ladder's 🔒 used to read
      // `ops_order_control.balance`, which is NULL on every live row, so the
      // money hold had never once fired.
      // 2026-08-09 (STAGE 1) — the Sales Orders register's fact columns.
      // `salesperson_id` + the two NAME embeds (both FKs are SINGLE —
      // `orders_salesperson_id_fkey`, `orders_outlet_id_fkey` — so a bare
      // embed is unambiguous, unlike delivery_partners). Then every flat fact
      // the customer order itself owns that was not yet on the wire:
      // `channel`, `customer_email`, the five structured address parts (0230),
      // `building_type` (the Sales Portal writes it into the order's own
      // `entry_data.fields`), `delivery_floor` / `delivery_has_lift`,
      // `customer_billing` / `customer_emergency`, `invoice_no` /
      // `invoiced_at`, `payment_method` and `installment_months`. Nothing here
      // is another module's record, nothing is computed. Purely additive: the
      // old control table selects none of these and is unaffected.
      "id, so, status, operation_stage, warehouse_id, customer_name, customer_phone, customer_address, customer_email, customer_billing, customer_emergency, customer_address_line1, customer_address_line2, customer_address_city, customer_address_state, customer_address_postcode, building_type:entry_data->fields->>building_type, delivery_floor, delivery_has_lift, channel, placed_at, delivery_date, delivery_date_tbd, proceed_date, source_system, source_ref, ops_assigned_logistic, delivery_partner_id, request_for_delivery_at, partner_accepted_at, partner_rejected_at, partner_rejected_reason, do_number, invoice_no, invoiced_at, payment_method, installment_months, dispatched_at, delivered_at, outlet_id, salesperson_id, dealer_id, paid, dealers(name), outlets(name), salespersons(name), delivery_partners!orders_delivery_partner_id_fkey(id, name), order_lines(id, sku, qty, unit_price, attrs, source_po), order_addons(addon_key, qty, unit_price), order_supplier_threads(id, supplier_id, category, operation_stage, po_id, delivery_partner_id, delivery_partners(id, name), confirm_delivery_date, request_for_delivery_at, partner_accepted_at, partner_rejected_at, purchase_orders(placed_at)), order_finance_exceptions(status), ops_sofa_loans(status), order_annotations(content, tag, created_at), ops_order_control(customer_request, action_for_logistic, carres_remark, warehouse_remark, logistic_eta, balance, payment_status, storage_from, storage_fee_override, storage_fee_msbf, storage_fee_sof, storage_paid, storage_collected_at, storage_waiver_status, called_customer, line_etas, line_stock_status, assigned_staff, booking_stage, confirmed_date, confirmed_time_slot, delivery_photos, booking_groups, delay_decision, delay_decision_eta, delay_decision_at, delay_detected_at, delay_detected_eta)",
    )
    // Pipeline v2 (C3): include `status='place'` rows so the FE kanban can
    // render the "Placed" column. proceed_order + delivered preserved as
    // before; existing M2 tests still pass.
    .in("status", ["place", "proceed_order", "delivered"]);

  if (stage === "placed") {
    // 'placed' is a synthetic stage derived from `status='place'` (pre-push
    // orders may have NULL operation_stage or 'placed' depending on whether
    // they were seeded post-0024). Filter on status, not stage.
    q = q.eq("status", "place");
  } else if (stage !== "all") {
    q = q.eq("operation_stage", stage);
  }
  // Public 'channel' enum kept as 'dealers'|'showrooms' per spec §18.3 (Loo-facing wording).
  // Internally maps to outlet_id IS [NOT] NULL — schema column is outlet_id, not showroom_id.
  if (channel === "dealers") q = q.is("outlet_id", null);
  if (channel === "showrooms") q = q.not("outlet_id", "is", null);
  if (search) {
    // Match customer name (ILIKE), the SO number (exact, when numeric), AND
    // each imported invoice number. A combined Ref is tokenised into
    // source_ref[] (normalizeRefs), so an exact contains-match makes searching
    // any single invoice — e.g. "CR0854" — find the combined order too (alias).
    // The ref term is sanitised to invoice chars [A-Z0-9/-] so it can't break
    // the PostgREST or()/cs.{} grammar.
    const clauses = [`customer_name.ilike.%${search}%`];
    const refTerm = search.toUpperCase().replace(/[^A-Z0-9/-]/g, "");
    if (refTerm) clauses.push(`source_ref.cs.{${refTerm}}`);
    const asInt = Number.parseInt(search, 10);
    if (Number.isFinite(asInt)) clauses.push(`so.eq.${asInt}`);
    q = q.or(clauses.join(","));
  }

  // STAGE 1 FIX 1 — the 200-row trap removed; the agreed cap is 500. Server
  // search (`?search=`, above) is what makes the cap safe: a match beyond the
  // first page is FOUND by asking, never scrolled for.
  q = q.order("placed_at", { ascending: false }).limit(500);
  const { data, error } = await q;
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }

  // ── D1 · THE LIST CAN SEE A PURCHASE ORDER ─────────────────────────────────
  // The Orders ladder asks "has anything been ordered?" and, until this block,
  // the only evidence on the wire was `order_lines.source_po` — a column ONLY
  // the AutoCount importer writes. `order_supplier_threads.po_id` was selected
  // and is dead weight: that table holds ZERO rows.
  //
  // MEASURED on production 2026-08-06, which is why this is a defect and not a
  // nicety: of 28 live orders, 19 are covered by a REAL purchase order and 0
  // carry `source_po`. Four of them — SO-1206 · SO-1213 · SO-1216 · SO-1257 —
  // showed a red "no PO raised yet" dot and an `Issue PO` instruction over
  // goods Purchasing had already bought.
  //
  // The link is the DRAWER'S OWN, not a new one: a PO serves an order through
  // `so` or through `so_refs[]` (see the detail route below, which has used
  // exactly this pair since it was written). Batched into ONE `or` over the
  // page's SO numbers, plus one line fetch — two round trips for the whole
  // list, never one per order.
  //
  // What rides the wire is `po_skus`: the DISTINCT SKUs a purchase order covers
  // for that order. That is the smallest thing that answers the ladder's
  // question, and it is the same shape the drawer already builds (`poSkus`).
  // A page with no covered orders adds `[]` to every row and nothing else.
  const orders = data ?? [];

  // ── STAGE 1 · THE ROW SAYS WHAT THEY BOUGHT, IN WORDS ─────────────────────
  // The register's `Items` column may not print a SKU code. The detail route
  // has resolved `Model · Variant` since 2026-07-16 and now both call
  // `resolveSkuLabels`, so a product cannot be named one way on the row and
  // another way in the document (Law D).
  //
  // ONE extra query for the whole page (every line SKU on it, de-duplicated),
  // never one per order — the same batching rule the PO block below follows.
  // A SKU with no catalog row simply gets no label and the caller falls back
  // to the text the order carries.
  try {
    const labelBySku = await resolveSkuLabels(
      sb,
      orders.flatMap((o: { order_lines?: { sku?: string | null }[] | null }) =>
        (o.order_lines ?? []).map((l) => l.sku),
      ),
    );
    for (const o of orders as { order_lines?: ({ sku?: string | null } & Record<string, unknown>)[] | null }[]) {
      for (const l of o.order_lines ?? []) {
        (l as Record<string, unknown>).label = l.sku ? (labelBySku[l.sku] ?? null) : null;
      }
    }
  } catch (e_label) {
    const m = mapPgError(e_label as { code?: string; message?: string });
    return c.json(m.body, m.status);
  }
  const soNumbers = [
    ...new Set(
      orders
        .map((o: { so?: number | null }) => o.so)
        .filter((s): s is number => typeof s === "number" && Number.isFinite(s)),
    ),
  ];
  const poSkusBySo = new Map<number, Set<string>>();
  const poNumbersBySo = new Map<number, Set<string>>();
  if (soNumbers.length > 0) {
    const inList = soNumbers.join(",");
    const { data: pos, error: e_pos } = await sb
      .from("purchase_orders")
      .select("id, so, so_refs")
      .or(`so.in.(${inList}),so_refs.ov.{${inList}}`);
    if (e_pos) {
      const m = mapPgError(e_pos);
      return c.json(m.body, m.status);
    }
    const poRows = pos ?? [];
    if (poRows.length > 0) {
      const { data: poLines, error: e_lines } = await sb
        .from("purchase_order_lines")
        .select("po_id, sku")
        .in(
          "po_id",
          poRows.map((p: { id: string }) => p.id),
        );
      if (e_lines) {
        const m = mapPgError(e_lines);
        return c.json(m.body, m.status);
      }
      const skusByPo = new Map<string, string[]>();
      for (const l of poLines ?? []) {
        const row = l as { po_id: string; sku: string | null };
        if (!row.sku) continue;
        const arr = skusByPo.get(row.po_id);
        if (arr) arr.push(row.sku);
        else skusByPo.set(row.po_id, [row.sku]);
      }
      for (const p of poRows) {
        const po = p as { id: string; so: number | null; so_refs: number[] | null };
        const skus = skusByPo.get(po.id) ?? [];
        if (skus.length === 0) continue;
        // ONE purchase order may serve several sales orders (the consolidated
        // PO is the normal case here), so every SO it names gets the same set.
        const served = new Set<number>();
        if (typeof po.so === "number") served.add(po.so);
        for (const r of po.so_refs ?? []) served.add(r);
        for (const so of served) {
          const numbers = poNumbersBySo.get(so) ?? new Set<string>();
          numbers.add(po.id);
          poNumbersBySo.set(so, numbers);
          const set = poSkusBySo.get(so) ?? new Set<string>();
          for (const s of skus) set.add(s);
          poSkusBySo.set(so, set);
        }
      }
    }
  }

  return c.json({
    orders: orders.map((o: { so?: number | null }) => ({
      ...o,
      po_skus: [...(poSkusBySo.get(o.so ?? -1) ?? [])],
      po_numbers: [...(poNumbersBySo.get(o.so ?? -1) ?? [])],
    })),
  });
});

// ----- GET /:id detail -----
operationOrdersRouter.get("/:id", requireOperation, async (c) => {
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);

  const { data: order, error: e1 } = await sb
    .from("orders")
    .select(
      // 2026-06-09 (Jess P2) — ops_assigned_logistic surfaced so the drawer's
      // OrderControlPanel can show + inline-edit the planned carrier (region
      // default, overridable) on status='place' orders.
      // 2026-07-16 (Loo) — customer_emergency + customer_billing(_same) added:
      // the POS stores them but the drawer had no way to show them (the
      // customer card renders Emergency / Billing rows when present).
      // 2026-07-19 (Loo) — entry_data added: the POS wizard stores the
      // delivery-address building type in entry_data.fields.building_type;
      // the drawer's customer card shows it under the address.
      // 2026-08-09 (STAGE 1) — salesperson embed: the Sales Order workspace
      // names the salesperson on the customer commitment.
      // 2026-08-09 (STAGE 2) — the workspace EDIT form seeds its draft from
      // THIS payload; every whitelisted field must ride the wire or a Save
      // would silently null what it never saw: customer_email, the five
      // structured address parts (0230), delivery_floor, delivery_has_lift.
      // 2026-08-15 (OBJECT PAGE V2) — the object page's form IS the Sales
      // Portal's form, so every question the portal asks must ride this wire
      // or the field would render blank and a Save would null it: the 0200
      // demographics and the 0104 stair-carry count.
      "id, so, source_ref, source_system, status, operation_stage, warehouse_id, customer_name, customer_phone, customer_email, customer_address, customer_address_unknown, customer_address_line1, customer_address_line2, customer_address_city, customer_address_state, customer_address_postcode, customer_emergency, customer_billing, customer_billing_same, customer_race, customer_gender, customer_birthday, entry_data, delivery_date, delivery_date_tbd, proceed_date, delivery_floor, delivery_has_lift, delivery_stair_items, placed_at, do_number, do_note, dispatched_at, delivered_at, delivery_partner_id, ops_assigned_logistic, delivery_stops, dealer_id, outlet_id, invoice_no, invoiced_at, paid, salesperson_id, dealers(name), outlets(name), salespersons(name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (e1) {
    const m = mapPgError(e1);
    return c.json(m.body, m.status);
  }
  if (!order) {
    return c.json({ error: "not_found", code: "not_found", message: "Order not found" }, 404);
  }

  // Phase 4.5 Chunk 2 (T9): fetch per-supplier threads for customer-leg LP
  // surfacing. Threads carry the customer-leg fields (`delivery_partner_id`,
  // `confirm_delivery_date`, `request_for_delivery_at`, `partner_accepted_at`,
  // `partner_rejected_at`) that previously lived on the PO. Drawer reads
  // `threads[].delivery_partner_id` for the partner-assignment hint.
  const [linesRes, addonsRes, historyRes, threadsRes, controlRes] = await Promise.all([
    // 2026-05-10 (Loo) — also pull `attrs` so the OrderDetailDrawer's
    // "+ Issue POs" navigate-to-procurement flow can carry color/gap/fabric
    // into CreatePOModal's cascade picker without a second round-trip.
    // STAGE 2 — `id` rides along so the workspace's Save can diff lines
    // by identity (update-in-place keeps attrs + source_po).
    sb.from("order_lines").select("id, sku, qty, unit_price, attrs, source_po").eq("order_id", id),
    sb.from("order_addons").select("addon_key, qty, unit_price").eq("order_id", id),
    sb.from("order_history").select("text, by_role, occurred_at").eq("order_id", id).order("occurred_at", { ascending: true }),
    sb
      .from("order_supplier_threads")
      .select(
        "id, supplier_id, category, operation_stage, po_id, delivery_partner_id, confirm_delivery_date, request_for_delivery_at, partner_accepted_at, partner_rejected_at",
      )
      .eq("order_id", id),
    // 2026-08-16 (ORDER ROUTE NODE MAP) — the delivery-photo ledger (0280).
    // Read-only and kept OFF the `order` object on purpose: the workspace EDIT
    // form seeds its draft from `order`, and an overlay column riding that
    // payload is a field a Save could try to write.
    sb
      .from("ops_order_control")
      .select("delivery_photos")
      .eq("order_id", id)
      .maybeSingle(),
  ]);
  if (linesRes.error) { const m = mapPgError(linesRes.error); return c.json(m.body, m.status); }
  if (addonsRes.error) { const m = mapPgError(addonsRes.error); return c.json(m.body, m.status); }
  if (historyRes.error) { const m = mapPgError(historyRes.error); return c.json(m.body, m.status); }
  if (threadsRes.error) { const m = mapPgError(threadsRes.error); return c.json(m.body, m.status); }

  const rawLines = linesRes.data ?? [];
  const addons = addonsRes.data ?? [];

  // 2026-07-16 (Loo) — resolve a human-readable product label per line
  // (model name · variant) so the drawer's Items table shows names, not just
  // raw sku codes. Body moved to `resolveSkuLabels` (top of file) by STAGE 1
  // so the LIST answers with the same names as the document (Law D); the
  // query, the join and the `model · variant` spelling are unchanged.
  let labelBySku: Record<string, string>;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    labelBySku = await resolveSkuLabels(sb, rawLines.map((l: any) => l.sku));
  } catch (e_sku) {
    // Same answer this route gave before the extraction: the PG error mapped,
    // never a bare 500.
    const m = mapPgError(e_sku as { code?: string; message?: string });
    return c.json(m.body, m.status);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lines = rawLines.map((l: any) => ({ ...l, label: labelBySku[l.sku] ?? null }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const total = [...lines, ...addons].reduce((s: number, r: any) => s + Number(r.unit_price) * Number(r.qty), 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let warehouse: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stockBalances: any[] = [];
  if (order.warehouse_id) {
    const { data: wh, error: e_wh } = await sb
      .from("warehouses")
      .select("id, name, address")
      .eq("id", order.warehouse_id)
      .maybeSingle();
    if (e_wh) { const m = mapPgError(e_wh); return c.json(m.body, m.status); }
    warehouse = wh;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const skus = lines.map((l: any) => l.sku);
    if (skus.length > 0) {
      const { data: sb_rows, error: e_sb } = await sb
        .from("stock_balances")
        .select("sku, warehouse_id, qty, reserved")
        .eq("warehouse_id", order.warehouse_id)
        .in("sku", skus);
      if (e_sb) { const m = mapPgError(e_sb); return c.json(m.body, m.status); }
      stockBalances = sb_rows ?? [];
    }
  }

  // Free per-unit stock for the Ready picker (Jess 2026-06-30). The catalog is
  // empty, so order_lines.sku ↔ ops_stock_items.sku match only under
  // normalizeSkuKey — we can't filter by sku in SQL, so we return the free units
  // and the drawer matches each line by normalized key, then reserves the chosen
  // unit(s) to the order's SO. Scope to the order's warehouse when set; imported
  // orders often lack one, so fall back to all free units (Carres Klang is the
  // only own warehouse today). See project-catalog-empty-sku-naming.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let freeUnits: any[] = [];
  {
    let q = sb
      .from("ops_stock_items")
      // `qty` (K4): a bulk accessory record is ONE row of N units, so the
      // reserve dialog needs it to say truthfully what a draw would leave.
      .select("id, unit_code, sku, warehouse_id, condition, po_no, source_ref, date_in, qty")
      .eq("status", "free")
      .eq("needs_repair", false)
      .order("date_in", { ascending: true, nullsFirst: false });
    if (order.warehouse_id) q = q.eq("warehouse_id", order.warehouse_id);
    const { data: fu, error: e_fu } = await q;
    if (e_fu) { const m = mapPgError(e_fu); return c.json(m.body, m.status); }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    freeUnits = (fu ?? []).map((r: any) => ({
      id: r.id,
      unitCode: r.unit_code,
      sku: r.sku,
      warehouseId: r.warehouse_id,
      condition: r.condition,
      poNo: r.po_no,
      sourceRef: r.source_ref,
      dateIn: r.date_in,
      qty: r.qty ?? 1,
    }));
  }

  // Linked POs (own so OR within so_refs[]).
  // 2026-07-27 (J1 Documents panel) — do_file_path added: the `delivery-orders`
  // object holding the supplier's signed DO (column since 0030). The drawer's
  // Documents list is derived at read time, so it needs the path to hand the
  // browser a signed view url; storage RLS (delivery_orders_read) already
  // admits operation + principal, so no new endpoint carries the file.
  const { data: pos, error: e_pos } = await sb
    .from("purchase_orders")
    // 2026-08-15 (Order Route V2) — `placed_at` and `expected_ready_date` are
    // the two dates the Route's `✓` stations must be able to NAME: a station
    // is complete only when it can show its document number AND its labelled
    // date (`PO-2048 · Issued: …`, `Estimated ready: …`). Read-only additions
    // to a select the drawer already makes; no new query, no new writer.
    .select(
      "id, supplier_id, warehouse_id, status, sup_status, so, so_refs, eta_date, placed_at, expected_ready_date, do_file_path",
    )
    .or(`so.eq.${order.so},so_refs.cs.{${order.so}}`);
  if (e_pos) { const m = mapPgError(e_pos); return c.json(m.body, m.status); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let poLinesByPo: Record<string, any[]> = {};
  if (pos && pos.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const poIds = pos.map((p: any) => p.id);
    const { data: poLines, error: e_polines } = await sb
      .from("purchase_order_lines")
      .select("id, po_id, sku, qty, received_qty, attrs")
      .in("po_id", poIds);
    if (e_polines) { const m = mapPgError(e_polines); return c.json(m.body, m.status); }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    poLinesByPo = (poLines ?? []).reduce((acc: Record<string, any[]>, l: any) => {
      (acc[l.po_id] ??= []).push(l);
      return acc;
    }, {});
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const posWithLines = (pos ?? []).map((p: any) => ({ ...p, lines: poLinesByPo[p.id] ?? [] }));

  // ── D9's SALES ORDER HALF ────────────────────────────────────────────────
  // *"What kind of product is this?"* is the CATALOG's answer and nobody
  // else's (ERP-ARCHITECTURE §3.1 · D9). `56239a3c` closed STOCK's half by
  // making /inventory ask. This is the other half: the drawer's loan flow was
  // deducing the category from the SKU TEXT in the browser, and it was not
  // doing it cosmetically — `LoanPanel` FILTERS the free-unit list with the
  // result, so a real sofa whose model name was absent from a hardcoded
  // keyword list could not be offered as a loaner.
  //
  // BOTH sides carry it, because the filter compares one against the other:
  // an unrecognised ORDER LINE contributes no category to match against, and
  // an unrecognised FREE UNIT falls into the bucket the drawer deliberately
  // excludes. A guess on either side hides a real unit.
  //
  // COST: ONE extra subrequest per 100 distinct SKUs — `skuCategories` chunks
  // at 100 because the `in` list travels in the URL. Lines and units resolve
  // in ONE call, not two. On the 2026-08-19 register (74 distinct SKUs) that
  // is a single chunk.
  //
  // NOT folded into `resolveSkuLabels`, which already joins `product_models`
  // for the name and could have carried this for free. `skuCategories` is the
  // ONE category reader every other gate asks — the earliest-sell floor, the
  // goods gate, /inventory — and a second copy of that join is a second answer
  // waiting to disagree (ownership Law D). One subrequest is the price of one
  // owner.
  //
  // It fails OPEN (an error returns an empty map), so a catalog outage degrades
  // to `null` everywhere and the browser falls back to the parser exactly as it
  // did before this existed. No new failure mode.
  const categoryBySku = await skuCategories(sb, [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...lines.map((l: any) => l.sku as string),
    ...freeUnits.map((u) => u.sku as string),
  ]);
  // `null`, never absent: this endpoint ASKED. An absent key would mean nobody
  // asked, and the browser reads that difference (`resolvedCategory`).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linesWithCategory = lines.map((l: any) => ({
    ...l,
    category: categoryBySku.get(l.sku) ?? null,
  }));
  const freeUnitsWithCategory = freeUnits.map((u) => ({
    ...u,
    category: categoryBySku.get(u.sku) ?? null,
  }));

  return c.json({
    order,
    lines: linesWithCategory,
    addons,
    total,
    warehouse,
    stockBalances,
    freeUnits: freeUnitsWithCategory,
    pos: posWithLines,
    history: historyRes.data ?? [],
    threads: threadsRes.data ?? [],
    /* An absent overlay row is UNKNOWN, not "no photo": the Route says
       `No delivery photo yet` only on an explicit empty ledger. */
    control: controlRes.error ? null : (controlRes.data ?? null),
  });
});

// ─────────────────────────────────────────────────────────────
// STAGE 2 · THE REVISION ENGINE — every write mints a revision (0327).
// The API layer here is a THIN door: validation + ONE RPC call. The RPC owns
// the whitelist, the lines diff, Rev-1 minting and immutability; nothing in
// this file writes orders/order_lines directly.
// ─────────────────────────────────────────────────────────────

const revisionLineInput = z.object({
  /** Present = update this line in place (keeps attrs + source_po); absent =
   *  a new line. */
  id: z.string().uuid().optional(),
  sku: z.string().trim().min(1, "A line needs a SKU"),
  qty: z.number().int().min(1, "Qty must be at least 1"),
  unit_price: z.number().min(0, "Unit price must be 0 or more"),
});

/**
 * The editable header keys — mirrors the SAVE RPC whitelist verbatim.
 *
 * STAGE 3 · 0329: `salesperson_id` · `outlet_id` · `dealer_id` · `channel` are
 * NOT here. They moved to the attribution request lane (SUBMIT → APPROVE →
 * APPLY) because they move money between parties (GATES.md GATE 2b, Test 3),
 * and `sales_order_save_revision` now RAISES when a save carries one. CREATE
 * still names them — see `createOrderInput`, which is a birth, not an edit.
 */
const revisionHeaderInput = z
  .object({
    customer_name: z.string().trim().min(1).optional(),
    customer_phone: z.string().nullable().optional(),
    customer_email: z.string().nullable().optional(),
    customer_address: z.string().nullable().optional(),
    customer_address_line1: z.string().nullable().optional(),
    customer_address_line2: z.string().nullable().optional(),
    customer_address_city: z.string().nullable().optional(),
    customer_address_state: z.string().nullable().optional(),
    customer_address_postcode: z.string().nullable().optional(),
    customer_emergency: z.string().nullable().optional(),
    customer_billing: z.string().nullable().optional(),
    proceed_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    delivery_floor: z.number().int().min(0).optional(),
    delivery_has_lift: z.boolean().optional(),
    /**
     * 0354 — the rest of what the Sales Portal asks. The object page's form IS
     * that form (owner ruling 2026-08-15), so a question the portal asks and
     * this door refuses is a field the operator can read and never fix.
     *
     * `.strict()` above is still the guard that matters: goods, price,
     * `delivery_date` and attribution are NOT here, and the RPC refuses them
     * again on its own side.
     */
    customer_race: z.string().nullable().optional(),
    customer_gender: z.string().nullable().optional(),
    customer_birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    customer_address_unknown: z.boolean().optional(),
    customer_billing_same: z.boolean().optional(),
    delivery_stair_items: z.number().int().min(0).nullable().optional(),
    /** 0219's bag — the building type and the operator's own configured
     *  fields. Values only; a null CLEARS one key, and the RPC merges rather
     *  than replacing so an unrelated save never erases a retired field. */
    entry_fields: z.record(z.string().nullable()).optional(),
  })
  .strict();

// GET /:id/revisions — the order's immutable snapshots, oldest first.
operationOrdersRouter.get("/:id/revisions", requireOperation, async (c) => {
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from("sales_order_revisions")
    .select("revision, snapshot, created_at, created_by, change_type, note")
    .eq("order_id", id)
    .order("revision", { ascending: true });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ revisions: data ?? [] });
});

// GET /:id/commitment — CARD 1's one authoritative read: what is the
// customer's CURRENT committed order, and how did it become this? The RPC
// (sales_order_commitment_bundle, 0340) reads orders/order_lines/addons via
// the snapshot arithmetic, the revision ledger and the change requests —
// and NOTHING from purchasing, units, receiving, booking or legacy stages.
// The shared resolver shapes the answer; Law D — one resolver, everywhere.
operationOrdersRouter.get("/:id/commitment", requireOperation, async (c) => {
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("sales_order_commitment_bundle", {
    p_order_id: id,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({
    commitment: resolveCurrentCustomerCommitment(data as unknown as CommitmentBundle),
  });
});

// GET /:id/allocation — CARD 2's one authoritative read: which real Units are
// reserved / sold to this SO, and how much of the current commitment is still
// unallocated. Authority flows DOWN: committed quantities come from Card 1's
// commitment resolver; the physical side comes from the per-unit register
// (`ops_stock_items` — the register is the authority, never a rollup). The
// read touches NO stage, booking state or legacy status word. A loan
// reservation (`LOAN SO-…`) is a different obligation and the exact ref match
// excludes it by construction.
operationOrdersRouter.get("/:id/allocation", requireOperation, async (c) => {
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);

  const { data: bundle, error: bundleErr } = await sb.rpc(
    "sales_order_commitment_bundle",
    { p_order_id: id },
  );
  if (bundleErr) {
    const m = mapPgError(bundleErr);
    return c.json(m.body, m.status);
  }
  const commitment = resolveCurrentCustomerCommitment(
    bundle as unknown as CommitmentBundle,
  );

  const { data: ord, error: ordErr } = await sb
    .from("orders")
    .select("so")
    .eq("id", id)
    .maybeSingle();
  if (ordErr) {
    const m = mapPgError(ordErr);
    return c.json(m.body, m.status);
  }
  if (!ord) return c.json({ error: "Order not found" }, 404);
  const soRef = `SO-${ord.so}`;

  const { data: unitRows, error: unitsErr } = await sb
    .from("ops_stock_items")
    .select(
      "id, unit_code, sku, status, condition, warehouse_id, po_no, qty, date_in, sold_at, reserved_ref, sold_order_id",
    )
    .or(
      `and(status.eq.reserved,reserved_ref.eq.${soRef}),and(status.eq.sold,sold_order_id.eq.${id})`,
    );
  if (unitsErr) {
    const m = mapPgError(unitsErr);
    return c.json(m.body, m.status);
  }

  const units: AllocationUnit[] = ((unitRows ?? []) as Array<{
    id: string;
    unit_code: string | null;
    sku: string;
    status: string;
    condition: string;
    warehouse_id: string | null;
    po_no: string | null;
    qty: number | null;
    date_in: string | null;
    sold_at: string | null;
  }>).map((r) => ({
    id: r.id,
    unitCode: r.unit_code,
    sku: r.sku,
    status: r.status as AllocationUnit["status"],
    condition: r.condition,
    warehouseId: r.warehouse_id,
    poNo: r.po_no,
    qty: r.qty ?? 1,
    dateIn: r.date_in,
    soldAt: r.sold_at,
  }));

  return c.json({
    allocation: resolveUnitAllocation({
      orderId: id,
      soRef,
      commitmentLines: commitment.lines.map((l) => ({
        sku: l.sku,
        qty: Number(l.qty) || 0,
      })),
      units,
    }),
  });
});

// GET /:id/expansion — the register disclosure reads two owners without
// copying either fact onto Sales Orders: Stock supplies Unit IDs and
// Purchasing supplies PO/line Deliver To (line override, else PO default).
operationOrdersRouter.get("/:id/expansion", requireOperation, async (c) => {
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);
  const [{ data: order, error: orderErr }, { data: lines, error: linesErr }, { data: threads, error: threadsErr }, { data: destinations, error: destErr }] = await Promise.all([
    sb.from("orders").select("so").eq("id", id).maybeSingle(),
    sb.from("order_lines").select("id, sku, qty").eq("order_id", id),
    sb.from("order_supplier_threads").select("order_line_id, po_id").eq("order_id", id),
    sb.from("purchasing_destinations").select("id, name, is_default").eq("active", true),
  ]);
  const firstError = orderErr ?? linesErr ?? threadsErr ?? destErr;
  if (firstError) { const m = mapPgError(firstError); return c.json(m.body, m.status); }
  if (!order) return c.json({ error: "Order not found" }, 404);

  const destinationRows = (destinations ?? []) as Array<{ id: string; name: string; is_default: boolean }>;
  const destinationName = new Map(destinationRows.map((d) => [d.id, d.name]));
  const defaultDeliverTo = destinationRows.find((d) => d.is_default)?.name ?? null;
  const threadRows = (threads ?? []) as Array<{ order_line_id: string; po_id: string | null }>;
  const poIds = [...new Set(threadRows.map((t) => t.po_id).filter((v): v is string => Boolean(v)))];
  const [{ data: pos, error: posErr }, { data: poLines, error: poLinesErr }, { data: units, error: unitsErr }] = await Promise.all([
    poIds.length ? sb.from("purchase_orders").select("id, destination_id").in("id", poIds) : Promise.resolve({ data: [], error: null }),
    poIds.length ? sb.from("purchase_order_lines").select("po_id, sku, qty, destination_id").in("po_id", poIds) : Promise.resolve({ data: [], error: null }),
    sb.from("ops_stock_items").select("unit_code, sku").or(`and(status.eq.reserved,reserved_ref.eq.SO-${order.so}),and(status.eq.sold,sold_order_id.eq.${id})`),
  ]);
  const secondError = posErr ?? poLinesErr ?? unitsErr;
  if (secondError) { const m = mapPgError(secondError); return c.json(m.body, m.status); }

  const poDestination = new Map(((pos ?? []) as Array<{ id: string; destination_id: string }>).map((p) => [p.id, p.destination_id]));
  const poByLine = new Map(threadRows.map((t) => [t.order_line_id, t.po_id]));
  const unitIdsBySku = new Map<string, string[]>();
  for (const unit of (units ?? []) as Array<{ unit_code: string | null; sku: string }>) {
    if (!unit.unit_code) continue;
    const key = normalizeSkuKey(unit.sku) || unit.sku;
    unitIdsBySku.set(key, [...(unitIdsBySku.get(key) ?? []), unit.unit_code]);
  }
  const purchaseLines = (poLines ?? []) as Array<{ po_id: string; sku: string; qty: number; destination_id: string | null }>;
  return c.json({
    defaultDeliverTo,
    lines: ((lines ?? []) as Array<{ id: string; sku: string; qty: number }>).map((line) => {
      const poId = poByLine.get(line.id);
      const matches = poId ? purchaseLines.filter((p) => p.po_id === poId && normalizeSkuKey(p.sku) === normalizeSkuKey(line.sku)) : [];
      // A consolidated PO can carry more of the same SKU than this SO owns.
      // Never project somebody else's quantity onto this order: consume only
      // this line's committed quantity, preserving PO-line destination splits.
      let remaining = Math.max(0, Number(line.qty) || 0);
      const byDestination = new Map<string, number>();
      for (const p of matches) {
        if (remaining <= 0) break;
        const qty = Math.min(remaining, Math.max(0, Number(p.qty) || 0));
        if (qty <= 0) continue;
        const name = destinationName.get(p.destination_id ?? poDestination.get(p.po_id) ?? "") ?? defaultDeliverTo ?? "Not recorded";
        byDestination.set(name, (byDestination.get(name) ?? 0) + qty);
        remaining -= qty;
      }
      const deliverTo = [...byDestination].map(([name, qty]) => ({ name, qty }));
      return {
        lineId: line.id,
        sku: line.sku,
        unitIds: unitIdsBySku.get(normalizeSkuKey(line.sku) || line.sku) ?? [],
        deliverTo: deliverTo.length ? deliverTo : (defaultDeliverTo ? [{ name: defaultDeliverTo, qty: Number(line.qty) || 0 }] : []),
      };
    }),
  });
});

// GET /:id/completion — CARD 8's derived answer: Goods + Money (both
// directions) + Loan clear = No Action Required. NEVER stored, no button —
// composed here from the four authoritative reads the earlier cards own:
// Card 1 commitment → Card 2 allocation (goods), Card 4 orderMoney (money in),
// Card 7 refunds (money out), Card 6 loans. Delivered ≠ Complete and
// Cancelled ≠ Complete are properties of the arithmetic, not of any column.
operationOrdersRouter.get("/:id/completion", requireOperation, async (c) => {
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);

  const { data: bundle, error: bundleErr } = await sb.rpc(
    "sales_order_commitment_bundle",
    { p_order_id: id },
  );
  if (bundleErr) {
    const m = mapPgError(bundleErr);
    return c.json(m.body, m.status);
  }
  const commitment = resolveCurrentCustomerCommitment(
    bundle as unknown as CommitmentBundle,
  );

  const { data: ord, error: ordErr } = await sb
    .from("orders")
    .select(
      "id, so, status, paid, delivery_date, order_lines(sku, qty, unit_price), order_addons(qty, unit_price), ops_order_control(balance, storage_from, storage_fee_override, storage_fee_msbf, storage_fee_sof, storage_collected_at, storage_waiver_status, extension_original_date)",
    )
    .eq("id", id)
    .maybeSingle();
  if (ordErr) {
    const m = mapPgError(ordErr);
    return c.json(m.body, m.status);
  }
  if (!ord) return c.json({ error: "Order not found" }, 404);
  const soRef = `SO-${ord.so}`;

  const [unitsRes, refundsRes, loansRes] = await Promise.all([
    sb
      .from("ops_stock_items")
      .select("id, unit_code, sku, status, condition, warehouse_id, po_no, qty, date_in, sold_at")
      .or(
        `and(status.eq.reserved,reserved_ref.eq.${soRef}),and(status.eq.sold,sold_order_id.eq.${id})`,
      ),
    sb.from("order_refunds").select("status").eq("order_id", id),
    sb
      .from("ops_sofa_loans")
      .select("status, source, returned_to_supplier_at")
      .eq("order_id", id),
  ]);
  for (const r of [unitsRes, refundsRes, loansRes]) {
    if (r.error) {
      const m = mapPgError(r.error);
      return c.json(m.body, m.status);
    }
  }

  const units: AllocationUnit[] = ((unitsRes.data ?? []) as Array<{
    id: string; unit_code: string | null; sku: string; status: string;
    condition: string; warehouse_id: string | null; po_no: string | null;
    qty: number | null; date_in: string | null; sold_at: string | null;
  }>).map((r) => ({
    id: r.id,
    unitCode: r.unit_code,
    sku: r.sku,
    status: r.status as AllocationUnit["status"],
    condition: r.condition,
    warehouseId: r.warehouse_id,
    poNo: r.po_no,
    qty: r.qty ?? 1,
    dateIn: r.date_in,
    soldAt: r.sold_at,
  }));

  const allocation = resolveUnitAllocation({
    orderId: id,
    soRef,
    commitmentLines: commitment.lines.map((l) => ({
      sku: l.sku,
      qty: Number(l.qty) || 0,
    })),
    units,
  });

  const lines = (ord.order_lines ?? []) as Array<{ sku: string; qty: number; unit_price: number | string | null }>;
  const addons = (ord.order_addons ?? []) as Array<{ qty: number; unit_price: number | string | null }>;
  const ctrl = Array.isArray(ord.ops_order_control)
    ? (ord.ops_order_control[0] ?? null)
    : (ord.ops_order_control as Record<string, unknown> | null);
  const price = (x: { qty: number; unit_price?: number | string | null }) =>
    Number(x.unit_price ?? 0) * Number(x.qty ?? 0);
  const hold = storageHold({
    storageFrom:
      ((ctrl?.extension_original_date as string | null) ??
        (ctrl?.storage_from as string | null) ??
        (ord.delivery_date as string | null)) || null,
    override: (ctrl?.storage_fee_override as number | string | null) ?? null,
    importedMsbf: (ctrl?.storage_fee_msbf as number | string | null) ?? null,
    importedSof: (ctrl?.storage_fee_sof as number | string | null) ?? null,
    skus: lines.map((l) => String(l.sku)),
    asOf: new Date().toISOString().slice(0, 10),
    collectedAt: (ctrl?.storage_collected_at as string | null) ?? null,
    waiverStatus: (ctrl?.storage_waiver_status as string | null) ?? null,
  });
  const money = orderMoney({
    lineSum: lines.reduce((s, l) => s + price(l), 0),
    addonSum: addons.reduce((s, a) => s + price(a), 0),
    paid: ord.paid,
    controlBalance: (ctrl?.balance as number | string | null) ?? null,
    // `owing`, never `fee`. `storageHold` defines `owing = collectedAt ? 0 : fee`
    // (storage-hold.ts), so once the fee has been COLLECTED the two part company
    // and `fee` bills money already banked — an order that ever carried a storage
    // fee could then never read as complete. `order-control.ts` and
    // `OperationOrdersControl.tsx` both pass `owing`; this is the third reader of
    // one derived fact and it agrees with them (Law D).
    storageOwing: hold.owing,
    storageReleased: hold.released,
  });

  const completion = resolveOrderCompletion({
    cancelled: ord.status === "cancelled",
    allocation,
    money: { outstanding: money.outstanding, known: money.known },
    refunds: (refundsRes.data ?? []) as Array<{
      status: "requested" | "approved" | "rejected" | "paid";
    }>,
    loans: (loansRes.data ?? []) as Array<{
      status: "on_loan" | "returned";
      source: "warehouse" | "supplier";
      returned_to_supplier_at: string | null;
    }>,
  });

  return c.json({ completion });
});

// GET /:id/booking-brief — CARD 3's one authoritative read: everything
// Operations puts in front of Logistics for the T−3 customer call, and the
// three separate truths kept apart.
//
// The ruling's own list, and the reason this endpoint exists at all: the call
// opens THREE working days before the Customer Promised Deadline **regardless
// of stock readiness**, and the operator making it needs the promised
// deadline, the latest Stock ETA, the expected delivery scope and what IS and
// IS NOT expected in — four facts that until now lived in four different reads
// and were never assembled for the person holding the phone.
//
// Composed from the authoritative owners, never re-derived: Card 1's
// commitment (what was sold) → Card 2's allocation (what is physically here)
// → the overlay's booking + supplier dates → the delivery partner roster →
// the `logistics_call_working_days` SETTING through the same
// `deliveryQueueLeads` helper the Orders list and the Delivery board read, so
// no third surface can invent its own call window (Law D).
operationOrdersRouter.get("/:id/booking-brief", requireOperation, async (c) => {
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);

  const { data: bundle, error: bundleErr } = await sb.rpc(
    "sales_order_commitment_bundle",
    { p_order_id: id },
  );
  if (bundleErr) {
    const m = mapPgError(bundleErr);
    return c.json(m.body, m.status);
  }
  const commitment = resolveCurrentCustomerCommitment(
    bundle as unknown as CommitmentBundle,
  );

  const { data: ord, error: ordErr } = await sb
    .from("orders")
    .select(
      "id, so, delivery_date, delivery_date_tbd, ops_assigned_logistic, delivery_partner_id, ops_order_control(booking_stage, confirmed_date, confirmed_time_slot, confirmed_partner_id, booking_groups, customer_confirmed_at, stock_eta, line_etas)",
    )
    .eq("id", id)
    .maybeSingle();
  if (ordErr) {
    const m = mapPgError(ordErr);
    return c.json(m.body, m.status);
  }
  if (!ord) return c.json({ error: "Order not found" }, 404);
  const soRef = `SO-${ord.so}`;
  const ctrl = (
    Array.isArray(ord.ops_order_control)
      ? (ord.ops_order_control[0] ?? null)
      : (ord.ops_order_control as Record<string, unknown> | null)
  ) as {
    booking_stage?: string | null;
    confirmed_date?: string | null;
    confirmed_time_slot?: string | null;
    confirmed_partner_id?: string | null;
    booking_groups?: string[] | null;
    customer_confirmed_at?: string | null;
    stock_eta?: string | null;
    line_etas?: Record<string, string> | null;
  } | null;

  // The assignment is the order's; the appointment's carrier is the overlay's
  // own stamp (0346). They are looked up together and reported separately —
  // the whole point of Rule 4.
  const assignedId =
    (ord.ops_assigned_logistic as string | null) ??
    (ord.delivery_partner_id as string | null) ??
    null;
  const confirmedPartnerId = ctrl?.confirmed_partner_id ?? null;
  const partnerIds = [assignedId, confirmedPartnerId].filter(
    (v): v is string => !!v,
  );

  const [unitsRes, partnersRes, settingsRes] = await Promise.all([
    sb
      .from("ops_stock_items")
      .select(
        "id, unit_code, sku, status, condition, warehouse_id, po_no, qty, date_in, sold_at",
      )
      .or(
        `and(status.eq.reserved,reserved_ref.eq.${soRef}),and(status.eq.sold,sold_order_id.eq.${id})`,
      ),
    partnerIds.length > 0
      ? sb.from("delivery_partners").select("id, name").in("id", partnerIds)
      : Promise.resolve({ data: [], error: null }),
    sb
      .from("purchasing_settings")
      .select("logistics_call_working_days")
      .maybeSingle(),
  ]);
  for (const r of [unitsRes, partnersRes, settingsRes]) {
    if (r.error) {
      const m = mapPgError(r.error);
      return c.json(m.body, m.status);
    }
  }

  const units: AllocationUnit[] = ((unitsRes.data ?? []) as Array<{
    id: string; unit_code: string | null; sku: string; status: string;
    condition: string; warehouse_id: string | null; po_no: string | null;
    qty: number | null; date_in: string | null; sold_at: string | null;
  }>).map((r) => ({
    id: r.id,
    unitCode: r.unit_code,
    sku: r.sku,
    status: r.status as AllocationUnit["status"],
    condition: r.condition,
    warehouseId: r.warehouse_id,
    poNo: r.po_no,
    qty: r.qty ?? 1,
    dateIn: r.date_in,
    soldAt: r.sold_at,
  }));

  const nameById = new Map(
    ((partnersRes.data ?? []) as Array<{ id: string; name: string | null }>).map(
      (p) => [p.id, p.name ?? null],
    ),
  );

  const allocation = resolveUnitAllocation({
    orderId: id,
    soRef,
    commitmentLines: commitment.lines.map((l) => ({
      sku: l.sku,
      qty: Number(l.qty) || 0,
    })),
    units,
  });

  // Mon–Sat delivery week + the Malaysian public holidays, the same calendar
  // every other delivery clock in the portal counts on.
  const opts = { holidays: myHolidaySet(), offDays: [0] };
  const callDays = (
    settingsRes.data as { logistics_call_working_days?: number } | null
  )?.logistics_call_working_days;
  const leads =
    typeof callDays === "number"
      ? deliveryQueueLeads({ logisticsCallWorkingDays: callDays })
      : undefined;

  const brief = resolveBookingBrief(
    {
      orderId: id,
      soRef,
      promisedDateIso: (ord.delivery_date as string | null) ?? null,
      promisedIsTbd: !!ord.delivery_date_tbd,
      lineEtas: ctrl?.line_etas ?? null,
      orderStockEtaIso: ctrl?.stock_eta ?? null,
      allocation,
      assignedLogistics: assignedId
        ? { partnerId: assignedId, partnerName: nameById.get(assignedId) ?? null }
        : null,
      booking: {
        stage: ctrl?.booking_stage ?? null,
        confirmedDateIso: ctrl?.confirmed_date ?? null,
        slot: ctrl?.confirmed_time_slot ?? null,
        carrier: confirmedPartnerId
          ? {
              partnerId: confirmedPartnerId,
              partnerName: nameById.get(confirmedPartnerId) ?? null,
            }
          : null,
        scope: ctrl?.booking_groups ?? null,
        confirmedAt: ctrl?.customer_confirmed_at ?? null,
      },
    },
    new Date().toISOString().slice(0, 10),
    opts,
    leads,
  );

  return c.json({ brief });
});

// POST /:id/save — the ONE edit door. CARD 1: a save that moves the
// CONTRACTUAL fields (items · promised date) must state its cause —
// `staff_correction` (the record was wrong) or `customer_change` (the
// customer asked for something different). The RPC (0340) enforces the
// requirement AFTER the diff — a save that only fixes contact data needs no
// cause and defaults to staff_correction. The RPC also refuses an empty or
// no-op save, refuses on any floor BLOCK, and refuses removing/re-SKUing a
// line in production.
const saveRevisionInput = z
  .object({
    header: revisionHeaderInput,
  })
  .strict();

operationOrdersRouter.post("/:id/save", requireOperation, async (c) => {
  const id = c.req.param("id");
  const raw = await c.req.json().catch(() => ({}));
  const parsed = saveRevisionInput.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_input",
        code: "invalid_param",
        message: parsed.error.issues[0]?.message ?? "invalid input",
      },
      422,
    );
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("sales_order_save_revision", {
    p_order_id: id,
    p_header: parsed.data.header,
    // Detail/Edit is the safe-correction door. Contractual lines and the
    // promised date travel only through the governed Amendment lane.
    p_lines: null,
    p_change: null,
  });
  if (error) {
    const m = mapPipelineV2Error(error);
    return c.json(m.body, m.status);
  }
  return c.json(data, 201);
});

// POST / — the office birth door ([+ New Sales Order]). Normal orders are
// still born in the Sales Portal; this one inserts status='place' and mints
// Rev 1 from the created state.
const createOrderInput = z.object({
  header: revisionHeaderInput
    .extend({
      customer_name: z.string().trim().min(1, "Customer name is required"),
      delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      delivery_date_tbd: z.boolean().optional(),
      dealer_id: z.string().uuid({ message: "A dealer is required" }),
      // orders_salesperson_required (0296) — every portal-written order
      // names who sold it; only the AutoCount archive importer is exempt.
      salesperson_id: z.string().uuid({ message: "A salesperson is required" }),
      // A birth NAMES the parties; `sales_order_create` derives channel from
      // whether an outlet is given. Only the EDIT door lost these to 0329.
      outlet_id: z.string().uuid().nullable().optional(),
    })
    .strict(),
  lines: z.array(revisionLineInput.omit({ id: true })).min(1, "An order needs at least one item"),
});

operationOrdersRouter.post("/", requireOperation, async (c) => {
  const raw = await c.req.json().catch(() => ({}));
  const parsed = createOrderInput.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_input",
        code: "invalid_param",
        message: parsed.error.issues[0]?.message ?? "invalid input",
      },
      422,
    );
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("sales_order_create", {
    p_header: parsed.data.header,
    p_lines: parsed.data.lines,
  });
  if (error) {
    const m = mapPipelineV2Error(error);
    return c.json(m.body, m.status);
  }
  return c.json(data, 201);
});

// POST /:id/floors — 3.2's read-only consequence evaluator. A POST for the
// body's sake only: it calls ONE read-only definer function
// (sales_order_floors, 0328) and writes nothing. The 3.3 APPLY RPC calls the
// SAME function pre-mutation — one floor implementation (Law D).
const floorsInput = z.object({
  fields: z.array(z.string().trim().min(1)).min(1),
  proposedLines: z
    .array(z.object({ sku: z.string().trim().min(1), qty: z.number().min(0) }))
    .optional(),
});

operationOrdersRouter.post("/:id/floors", requireOperation, async (c) => {
  const id = c.req.param("id");
  const raw = await c.req.json().catch(() => ({}));
  const parsed = floorsInput.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid input" },
      422,
    );
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("sales_order_floors", {
    p_order_id: id,
    p_changed: parsed.data.fields,
    p_proposed_lines: parsed.data.proposedLines ?? null,
  });
  if (error) {
    const m = mapPipelineV2Error(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

// ─────────────────────────────────────────────────────────────
// STAGE 3 · card 3.3 — CLASS B + TEST 3: the attribution request lane.
//
// FOUR doors, three verbs, and they never share a button:
//   GET  /:id/attribution          the ONE live request (0330, definer read)
//   POST /:id/attribution          SUBMIT   — writes a request, never the order
//   POST /attribution/:rid/decide  APPROVE  — writes request.status, nothing else
//   POST /attribution/:rid/apply   APPLY    — the only verb that moves the order
//
// Every gate lives in the RPC, not here (GATES.md GATE 3: "a UI-only approval
// is not a control for the exact roles that can bypass it"). These handlers
// validate shape and forward. `requireAttributionLane` admits HR because HR
// approves salesperson / showroom moves — the RPC still refuses HR on a
// dealer or channel move, and refuses everyone on the wrong verb.
// ─────────────────────────────────────────────────────────────

const requireAttributionLane: MiddlewareHandler<AppEnv> = async (c, next) => {
  const role = c.var.auth?.role;
  if (role !== "operation" && role !== "hr" && role !== "principal") {
    throw new HTTPException(403, { message: "Operation, HR or Principal only" });
  }
  await next();
};

const ATTRIBUTION_FIELDS = ["salesperson_id", "dealer_id", "outlet_id", "channel"] as const;

const attributionSubmitInput = z.object({
  changes: z
    .object({
      salesperson_id: z.string().uuid().nullable().optional(),
      dealer_id: z.string().uuid().optional(),
      outlet_id: z.string().uuid().nullable().optional(),
      channel: z.enum(["dealer", "showroom"]).optional(),
    })
    .strict()
    .refine((v) => ATTRIBUTION_FIELDS.some((f) => f in v), {
      message: "Name at least one attribution field to change",
    }),
  reason: z.string().trim().min(1, "A reason is required"),
});

operationOrdersRouter.get("/:id/attribution", requireAttributionLane, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("sales_order_attribution_live", {
    p_order_id: c.req.param("id"),
  });
  if (error) {
    const m = mapPipelineV2Error(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

operationOrdersRouter.post("/:id/attribution", requireOperation, async (c) => {
  const raw = await c.req.json().catch(() => ({}));
  const parsed = attributionSubmitInput.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid input" },
      422,
    );
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("sales_order_submit_attribution", {
    p_order_id: c.req.param("id"),
    p_changes: parsed.data.changes,
    p_reason: parsed.data.reason,
  });
  if (error) {
    const m = mapPipelineV2Error(error);
    return c.json(m.body, m.status);
  }
  return c.json(data, 201);
});

const attributionDecideInput = z.object({
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(500).optional(),
});

operationOrdersRouter.post(
  "/attribution/:requestId/decide",
  requireAttributionLane,
  async (c) => {
    const raw = await c.req.json().catch(() => ({}));
    const parsed = attributionDecideInput.safeParse(raw);
    if (!parsed.success) {
      return c.json(
        { error: "invalid_input", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid input" },
        422,
      );
    }
    const sb = userClient(c.env, c.var.auth.jwt);
    const { data, error } = await sb.rpc("sales_order_decide_attribution", {
      p_request_id: c.req.param("requestId"),
      p_decision: parsed.data.decision,
      p_note: parsed.data.note ?? null,
    });
    if (error) {
      const m = mapPipelineV2Error(error);
      return c.json(m.body, m.status);
    }
    return c.json(data);
  },
);

operationOrdersRouter.post("/attribution/:requestId/apply", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("sales_order_apply_attribution", {
    p_request_id: c.req.param("requestId"),
  });
  if (error) {
    const m = mapPipelineV2Error(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

/**
 * WITHDRAW — the door back out of `approved` (0336).
 *
 * It sits on `requireAttributionLane`, not `requireOperation`, for the ruling's
 * reason: whoever may approve may take back, and HR approves a salesperson
 * move. The RPC re-checks GATE 3 with the same routing as the approval, so an
 * admitted HR is still refused on a dealer change.
 *
 * A reason is REQUIRED here as well as in the RPC — refusing an empty one
 * before the database is asked keeps the rule visible at the door, where the
 * caller can read it.
 */
const attributionWithdrawInput = z.object({
  reason: z.string().trim().min(1, "A reason is required").max(500),
});

operationOrdersRouter.post(
  "/attribution/:requestId/withdraw",
  requireAttributionLane,
  async (c) => {
    const raw = await c.req.json().catch(() => ({}));
    const parsed = attributionWithdrawInput.safeParse(raw);
    if (!parsed.success) {
      return c.json(
        { error: "invalid_input", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid input" },
        422,
      );
    }
    const sb = userClient(c.env, c.var.auth.jwt);
    const { data, error } = await sb.rpc("sales_order_withdraw_attribution", {
      p_request_id: c.req.param("requestId"),
      p_reason: parsed.data.reason,
    });
    if (error) {
      /* A GATE 3 refusal is not a login problem — it reaches the screen as the
       * rule, with the approver lane named, exactly as `decide` does. */
      const e = error as { code?: string; details?: string; message?: string };
      if (e.code === "42501") {
        return c.json(
          { error: "forbidden", code: e.details ?? "forbidden", message: e.message ?? "not permitted" },
          403,
        );
      }
      const m = mapPipelineV2Error(error);
      return c.json(m.body, m.status);
    }
    return c.json(data);
  },
);

// ─────────────────────────────────────────────────────────────
// STAGE 3 · card 3.5 — THE AMENDMENT SPINE, and only the spine.
//
//   GET  /:id/amendment          the live amendment + whether it is STALE
//   POST /:id/amendment          SUBMIT
//   POST /amendment/:aid/apply   the REFUSAL — and that refusal is the point
//
// There is no ISSUE door and no ACCEPT door here, deliberately: the signing
// mechanism and the amendment document's visual form are the owner's wall
// (BUILD-QUEUE — "inventing either is the single worst failure available in
// this stage"). The apply route exists so the boundary is reachable and
// therefore testable; it can only ever answer 422 `accept_not_built`.
// ─────────────────────────────────────────────────────────────

const amendmentSubmitInput = z.object({
  /**
   * What the sales order BECOMES if accepted. A proposal, never a fact.
   *
   * `.strict()` is the whole guard, and it is not decoration: without it a
   * Class B field rides in and lands in `proposed_snapshot`, which would mean
   * a customer being asked to accept their own phone number. The CLASS A list
   * (packages/shared sales-order-classification.ts) is what an amendment may
   * carry, and this is that list.
   */
  proposed: z
    .object({
      lines: z
        .array(
          z
            .object({
              id: z.string().uuid().optional(),
              sku: z.string().trim().min(1),
              qty: z.number().int().min(1),
              unit_price: z.number().min(0),
            })
            .strict(),
        )
        .optional(),
      delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      delivery_date_tbd: z.boolean().optional(),
      installment_months: z.number().int().min(0).nullable().optional(),
    })
    .strict(),
  reason: z.string().trim().min(1, "An amendment says why").max(500),
  /**
   * The day the CUSTOMER asked — `Amend date (from customer)` on the object
   * page (owner ruling 2026-08-15). Not `submitted_at`: a change phoned in on
   * Monday and typed on Thursday is a Monday request. Optional so the goods
   * proposal, which has no such field, submits an unchanged body.
   */
  customerAskedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

operationOrdersRouter.get("/:id/amendment", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("sales_order_amendment_live", {
    p_order_id: c.req.param("id"),
  });
  if (error) {
    const m = mapPipelineV2Error(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

operationOrdersRouter.post("/:id/amendment", requireOperation, async (c) => {
  const raw = await c.req.json().catch(() => ({}));
  const parsed = amendmentSubmitInput.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid input" },
      422,
    );
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("sales_order_submit_amendment", {
    p_order_id: c.req.param("id"),
    p_proposed: parsed.data.proposed,
    p_reason: parsed.data.reason ?? null,
    p_customer_asked_on: parsed.data.customerAskedOn ?? null,
  });
  if (error) {
    const m = mapPipelineV2Error(error);
    return c.json(m.body, m.status);
  }
  return c.json(data, 201);
});

operationOrdersRouter.post("/amendment/:amendmentId/apply", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("sales_order_apply_amendment", {
    p_amendment_id: c.req.param("amendmentId"),
  });
  if (error) {
    const m = mapPipelineV2Error(error);
    return c.json(m.body, m.status);
  }
  /* Unreachable while ACCEPT is unbuilt — the RPC raises unconditionally. Kept
   * rather than omitted so the day 3.7 lands, the caller already knows the
   * shape of the answer. */
  return c.json(data);
});

// The preview reads every affected owner but writes none of them. It is the
// evidence management reads before deciding, and is recomputed on each read.
operationOrdersRouter.get("/amendment/:amendmentId/impact", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("sales_order_amendment_impact", {
    p_amendment_id: c.req.param("amendmentId"),
  });
  if (error) {
    const m = mapPipelineV2Error(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

/* The read management sees BEFORE it cancels: what this Sales Order still
 * holds open for Purchasing, Receiving, Stock, Delivery, Money, Loan and Other
 * Commitments, plus the truthful cancellable/refusal answer. It writes nothing
 * and it forms no second opinion — `cancellable` restates cancel_order's one
 * existing rule. The ACT itself stays on the single existing door,
 * `POST /api/orders/:id/cancel`; this slice adds no second writer. */
operationOrdersRouter.get("/:id/cancel-impact", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("sales_order_cancel_impact", {
    p_order_id: c.req.param("id"),
  });
  if (error) {
    const m = mapPipelineV2Error(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

const amendmentDecisionInput = z
  .object({
    decision: z.enum(["approve", "reject"]),
    note: z.string().trim().max(2000).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.decision === "reject" && !v.note) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["note"], message: "A rejection says why" });
    }
  });

operationOrdersRouter.post(
  "/amendment/:amendmentId/decide",
  requirePrincipal,
  async (c) => {
    const raw = await c.req.json().catch(() => ({}));
    const parsed = amendmentDecisionInput.safeParse(raw);
    if (!parsed.success) {
      return c.json(
        {
          error: "invalid_input",
          code: "invalid_param",
          message: parsed.error.issues[0]?.message ?? "invalid input",
        },
        422,
      );
    }
    const sb = userClient(c.env, c.var.auth.jwt);
    const { data, error } = await sb.rpc("sales_order_decide_amendment", {
      p_amendment_id: c.req.param("amendmentId"),
      p_decision: parsed.data.decision,
      p_note: parsed.data.note ?? null,
    });
    if (error) {
      const m = mapPipelineV2Error(error);
      return c.json(m.body, m.status);
    }
    return c.json(data);
  },
);

// GET /reference/dealers — id + name for the create form's dealer picker.
// RLS-scoped read (internal roles read dealers — the same embed the list
// already prints). A static segment outranks `/:id` in Hono's router.
operationOrdersRouter.get("/reference/dealers", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.from("dealers").select("id, name").order("name");
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ dealers: data ?? [] });
});

// ----- GET /:id/print-do -----
// Server-side DO PDF (E2 / spec §17.3). Only callable on delivered orders
// (those have a signed DO attached via operation_attach_do_and_deliver).
// Returns application/pdf with attachment Content-Disposition.
// 2026-05-12 (Loo): renamed `/print-do` → `/print-do-data`. Returns JSON;
// browser renders @react-pdf locally (Workers WASM ban).
operationOrdersRouter.get("/:id/print-do-data", requireOperation, async (c) => {
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);

  // Fetch order + dealer/warehouse/partner in one round-trip via embedded resources.
  // dealers / warehouses are FK'd from orders, so PostgREST auto-detects those.
  // delivery_partners needs the explicit `!orders_delivery_partner_id_fkey` hint:
  // orders has 2 FKs to it (delivery_partner_id + ops_assigned_logistic, 0136),
  // so a bare embed is ambiguous → PGRST201 → 500. order_lines.sku is NOT FK'd to product_skus —
  // SKU descriptions come from a separate query below.
  const { data: order, error: e1 } = await sb
    .from("orders")
    .select(
      "id, so, status, do_number, do_note, customer_name, customer_phone, customer_address, dealer_id, warehouse_id, delivery_partner_id, placed_at, delivered_at, dealers(name, contact), warehouses(name, address), delivery_partners!orders_delivery_partner_id_fkey(name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (e1) {
    const m = mapPgError(e1);
    return c.json(m.body, m.status);
  }
  if (!order) {
    return c.json({ error: "not_found", code: "not_found", message: "Order not found" }, 404);
  }

  // 2026-05-13 (Loo) — DO printable from dispatched onward.
  // Pre-0098 the rule required status='delivered' (the legacy
  // operation_attach_do_and_deliver flow set do_number only at delivery).
  // 0098's BEFORE-UPDATE trigger now auto-assigns do_number when an order
  // transitions to operation_stage='dispatched' so LP drivers can print
  // the blank customer-DO at dispatch time and the customer signs it on
  // arrival. Only do_number is required; status may be 'place'/'proceed_order'/'received'
  // depending on which lifecycle column the kanban reads (operation_stage is the truth).
  // C7 (2026-07-27) — the message named the wrong moment, and that mattered:
  // 0098 stamps the number at DISPATCH, so this endpoint refused EVERY live
  // order (0 of 56 carry a `do_number`) and the drawer's 🖨 DO button could
  // never once have worked. The document is now produced by pressing
  // `Issue delivery order` once the customer's date is confirmed, which is what
  // this sentence says.
  // Blueprint card 2026-08-16 — a REPRINT names its document. `?do_number=`
  // asks for one specific document of this order (the DO object page's Print);
  // it must exist in the DO register (0356) for THIS order, so a stray number
  // cannot borrow another order's goods. Without the param the behaviour is
  // unchanged: the order's current document prints.
  const requestedDo = c.req.query("do_number") ?? null;
  let printDoNumber: string | null = order.do_number ?? null;
  let printIssuedAt: string | null = null;
  if (requestedDo) {
    const { data: doRow, error: doErr } = await sb
      .from("ops_delivery_orders")
      .select("do_number, issued_at")
      .eq("order_id", id)
      .eq("do_number", requestedDo)
      .maybeSingle();
    if (doErr) {
      const m = mapPgError(doErr);
      return c.json(m.body, m.status);
    }
    if (!doRow) {
      return c.json(
        {
          error: "not_found",
          code: "do_not_found",
          message: "That delivery order does not belong to this Sales Order.",
        },
        404,
      );
    }
    printDoNumber = doRow.do_number as string;
    printIssuedAt = (doRow.issued_at as string | null) ?? null;
  }

  if (!printDoNumber) {
    return c.json(
      {
        error: "rule_violation",
        code: "do_missing",
        message:
          "No delivery order for this trip yet — the system issues it when the goods, logistics and date are ready.",
      },
      422,
    );
  }

  // Lines + SKU descriptions (separate queries — order_lines.sku has no FK to product_skus).
  const { data: lines, error: e2 } = await sb
    .from("order_lines")
    .select("sku, qty, unit_price")
    .eq("order_id", id);
  if (e2) {
    const m = mapPgError(e2);
    return c.json(m.body, m.status);
  }
  const lineRows = lines ?? [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const skus: string[] = lineRows.map((l: any) => l.sku);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const skuVariantBySku: Record<string, string> = {};
  if (skus.length > 0) {
    const { data: skuRows, error: e3 } = await sb
      .from("product_skus")
      .select("sku, variant")
      .in("sku", skus);
    if (e3) {
      const m = mapPgError(e3);
      return c.json(m.body, m.status);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of skuRows ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      skuVariantBySku[(r as any).sku] = (r as any).variant;
    }
  }

  // Map DB rows → DoTemplateData. Currency values are MYR major units (per types.ts contract).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ord: any = order;
  // Issue date: the DOCUMENT's own issue stamp when a specific document was
  // asked for (0356); else prefer delivered_at (when DO was attached), fall
  // back to placed_at. ISO yyyy-mm-dd.
  const issueIso =
    printIssuedAt ?? ord.delivered_at ?? ord.placed_at ?? new Date().toISOString();
  const issueDate = String(issueIso).slice(0, 10);

  const dealerRow = ord.dealers ?? null;
  const warehouseRow = ord.warehouses ?? null;
  const partnerRow = ord.delivery_partners ?? null;

  // customer_address may be null (customer_address_unknown=true on TBD/showroom orders);
  // template requires a string so coerce to "—" placeholder.
  const customerAddress: string = ord.customer_address ?? "—";

  // Dealer block: inject warehouse address line if present, since the DO ships
  // FROM the dealer-affiliated HQ warehouse — useful as a "ship from" hint
  // for the customer when there's no other origin shown.
  const dealerName: string = dealerRow?.name ?? "Carres";
  const dealerContactParts: string[] = [];
  if (dealerRow?.contact) dealerContactParts.push(String(dealerRow.contact));
  if (warehouseRow?.name) dealerContactParts.push(`Ship from: ${warehouseRow.name}`);
  const dealerContact: string | null = dealerContactParts.length > 0 ? dealerContactParts.join(" · ") : null;

  // ── COD (0362, owner ruling 2026-08-19). A document issued under an
  // APPROVED Delivery Payment Approval on an order still owing carries the
  // owner's instruction. The figure is the order's outstanding through the ONE
  // shared assembly (`loadBookingContext` → `bookingConfirmGate` → `orderMoney`)
  // at render time — the balance the driver must see land before unloading.
  // A paid order renders no line, approval or not.
  let codLine: string | null = null;
  {
    const { data: approvalRows, error: paErr } = await sb
      .from("order_delivery_payment_approvals")
      .select("id, status, request_reason, requested_at, decided_at, decision_reason")
      .eq("order_id", id);
    if (paErr) {
      const m = mapPgError(paErr);
      return c.json(m.body, m.status);
    }
    const approvals: DeliveryPaymentApproval[] = (approvalRows ?? []).map(
      (row: Record<string, unknown>) => ({
        id: row.id as string,
        status: row.status as DeliveryPaymentApproval["status"],
        requestReason: row.request_reason as string,
        requestedAt: (row.requested_at as string | null) ?? null,
        decidedAt: (row.decided_at as string | null) ?? null,
        decisionReason: (row.decision_reason as string | null) ?? null,
      }),
    );
    if (paymentApprovalOpensGate(approvals)) {
      const ctx = await loadBookingContext(sb, id, null);
      if (ctx.ok && ctx.ctx.gate.outstanding > 0) {
        codLine = codInstruction(ctx.ctx.gate.outstanding);
      }
    }
  }

  const templateData: DoTemplateData = {
    do_number: String(printDoNumber),
    issue_date: issueDate,
    order_id: String(ord.id),
    // Order code shown to dealer = `SO-${so}` (matches existing UI conventions).
    order_code: `SO-${ord.so}`,
    customer: {
      name: String(ord.customer_name ?? ""),
      address: customerAddress,
      phone: ord.customer_phone ?? null,
    },
    dealer: {
      name: dealerName,
      contact: dealerContact,
    },
    partner: partnerRow?.name ? { name: String(partnerRow.name) } : null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lines: lineRows.map((l: any) => {
      const qty = Number(l.qty);
      const unitPrice = Number(l.unit_price);
      return {
        sku: String(l.sku),
        description: skuVariantBySku[l.sku] ?? String(l.sku),
        qty,
        unit: "pc",
        line_total: qty * unitPrice,
      };
    }),
    currency: "MYR",
    cod_instruction: codLine,
  };

  return c.json(templateData);
});

// ----- POST /:id/assign-partner -----
operationOrdersRouter.post("/:id/assign-partner", requireOperation, async (c) => {
  const parsed = await parseJsonBody(c, assignPartnerInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  // Balance job (0184) — collect-before-delivery gate. Reject dispatch while a
  // storage fee is owed and neither collected nor waived by a principal.
  const block = await storageBlock(sb, c.req.param("id"));
  if (block) {
    return c.json(
      { error: "rule_violation", code: "storage_uncollected", message: block.message },
      422,
    );
  }
  const { data, error } = await sb.rpc("operation_assign_partner", {
    p_order_id: c.req.param("id"),
    p_partner_id: parsed.data.partnerId,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ order: data });
});

// ----- POST /:id/attach-do -----
operationOrdersRouter.post("/:id/attach-do", requireOperation, async (c) => {
  const parsed = await parseJsonBody(c, attachDoInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("operation_attach_do_and_deliver", {
    p_order_id: c.req.param("id"),
    p_do_number: parsed.data.doNumber,
    p_do_note: parsed.data.doNote ?? null,
    p_signed: parsed.data.signed,
    p_do_file_path: parsed.data.doFilePath,
    p_signature_url: parsed.data.signaturePath,
    p_signed_by: parsed.data.signerName,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ order: data });
});

// ----- POST /:id/abandon -----
operationOrdersRouter.post("/:id/abandon", requireOperation, async (c) => {
  const parsed = await parseJsonBody(c, abandonOrderInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("operation_abandon_order", {
    p_order_id: c.req.param("id"),
    p_reason: parsed.data.reason,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ order: data });
});

// ----- POST /:id/warehouse -----
operationOrdersRouter.post("/:id/warehouse", requireOperation, async (c) => {
  const parsed = await parseJsonBody(c, warehousePickInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("operation_warehouse_pick", {
    p_order_id: c.req.param("id"),
    p_warehouse_id: parsed.data.warehouseId,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ order: data });
});

// ----- POST /:id/confirm-proceed -----
// Migration 0147 (item h, 2026-05-23) — v3 RPC now requires the LP at the
// Accept-Proceed moment. The body shape changed: `warehouseId` was dropped
// (legacy v2 vestige; v3 picks the own-warehouse internally), and
// `deliveryPartnerId` is now REQUIRED.
//
// RPC call: operation_confirm_proceed_request_v3(p_order_id, p_delivery_partner_id).
// The RPC writes orders.delivery_partner_id + orders.request_for_delivery_at,
// putting the order into the LP's "Incoming" queue. The LP then accepts via
// lp_accept_order or rejects via lp_reject_order; on reject Operation reselects
// via the /reselect-partner sibling route below.
//
// Error mapping (mapPipelineV2Error):
//   • 42501                → 403 forbidden
//   • 22023 partner_required → 422 (defence in depth — FE zod already gates)
//   • 22023 wrong_stage    → 422 with code='wrong_stage'
//   • P0001 partner_not_found → 422 code='partner_not_found'
//   • P0001 insufficient_stock_for_reserve → 422 with code + hint passthrough
//   • 40001                → 409 with code='concurrent_reserve'
operationOrdersRouter.post("/:id/confirm-proceed", requireOperation, async (c) => {
  const parsed = await parseJsonBody(c, confirmProceedRequestInputSchema);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("operation_confirm_proceed_request_v3", {
    p_order_id: c.req.param("id"),
    p_delivery_partner_id: parsed.data.deliveryPartnerId,
  });
  if (error) {
    const m = mapPipelineV2Error(error);
    return c.json(m.body, m.status);
  }
  return c.json({ order: data });
});

// ----- POST /:id/reselect-partner -----
// Migration 0147 (item h, 2026-05-23). Operation reselects a different LP
// after the previous one rejected via lp_reject_order. Clears the reject
// timestamps + reason on the order, writes the new partner + a fresh
// request_for_delivery_at, putting the order back into the new LP's queue.
// RPC raises 22023 detail 'same_partner' if the operator picks the same LP
// that just rejected (no-op user error guard).
operationOrdersRouter.post("/:id/reselect-partner", requireOperation, async (c) => {
  const parsed = await parseJsonBody(c, reselectPartnerInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("operation_reselect_partner", {
    p_order_id: c.req.param("id"),
    p_partner_id: parsed.data.partnerId,
  });
  if (error) {
    const m = mapPipelineV2Error(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

// ----- POST /:id/transfer-ready -----
// Pipeline v2 (C2 / migration 0024). Wraps `operation_warehouse_pick` whose
// source-stage guard now permits IN ('confirmed', 'in_production').
// Same error contract as /confirm-proceed. Note: warehouseId is REQUIRED here
// (the RPC raises 22023 `warehouse_required` on NULL). confirm-proceed
// accepts NULL via a different RPC; do not conflate.
operationOrdersRouter.post("/:id/transfer-ready", requireOperation, async (c) => {
  const parsed = await parseJsonBody(c, transferReadyInputSchema);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("operation_warehouse_pick", {
    p_order_id: c.req.param("id"),
    p_warehouse_id: parsed.data.warehouseId,
  });
  if (error) {
    const m = mapPipelineV2Error(error);
    return c.json(m.body, m.status);
  }
  return c.json({ order: data });
});

// ----- POST /:id/recheck-stock -----
operationOrdersRouter.post("/:id/recheck-stock", requireOperation, async (c) => {
  const parsed = await parseJsonBody(c, recheckStockInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const orderId = c.req.param("id");

  const { data: wh, error: e1 } = await sb.rpc("operation_pick_warehouse", { p_order_id: orderId });
  if (e1) {
    const m = mapPgError(e1);
    return c.json(m.body, m.status);
  }
  if (!wh) {
    return c.json({ warehouseId: null, shortages: [] });
  }
  const { data: shortages, error: e2 } = await sb.rpc("operation_calc_shortages", { p_order_id: orderId, p_warehouse_id: wh });
  if (e2) {
    const m = mapPgError(e2);
    return c.json(m.body, m.status);
  }
  return c.json({ warehouseId: wh, shortages: shortages ?? [] });
});

// ----- POST /:id/revert-proceed -----
// 2026-05-12 (Loo) — back-arrow from Confirmed column → Placed column.
// No body; just the order id in the path. Both operation and principal can
// trigger. Maps RPC's 22023 wrong_stage into a 422 invalid_param.
operationOrdersRouter.post(
  "/:id/revert-proceed",
  requireOperationOrPrincipal,
  async (c) => {
    const sb = userClient(c.env, c.var.auth.jwt);
    const { data, error } = await sb.rpc(
      "operation_revert_order_proceed_to_placed",
      { p_order_id: c.req.param("id") },
    );
    if (error) {
      const m = mapPipelineV2Error(error);
      return c.json(m.body, m.status);
    }
    return c.json(data);
  },
);

// ----- POST /:id/revert-dispatch -----
// 2026-05-12 (Loo) — back-arrow from Dispatched column → Ready to Dispatch.
// Clears every thread's partner assignment on this order. operation or
// principal.
operationOrdersRouter.post(
  "/:id/revert-dispatch",
  requireOperationOrPrincipal,
  async (c) => {
    const sb = userClient(c.env, c.var.auth.jwt);
    const { data, error } = await sb.rpc(
      "operation_revert_order_dispatched_to_ready",
      { p_order_id: c.req.param("id") },
    );
    if (error) {
      const m = mapPipelineV2Error(error);
      return c.json(m.body, m.status);
    }
    return c.json(data);
  },
);

export default operationOrdersRouter;

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  updateOpsOrderControlInput,
  isOpsManager,
  stockEtaImportInput,
  matchStockRows,
  aggregateStorageFeesByRef,
  aggregateBalancesByRef,
  receiveLineInput,
  loanSofaInput,
  borrowLoanInput,
  returnLoanInput,
  returnToSupplierInput,
  appendMissingLinesInput,
  detectMissingLines,
  type AppendOrderRef,
  type AppendMissingLinesResult,
  type MissingLineCandidate,
  type OrderLineRef,
  type StockEtaImportResult,
  type ReceiveLineResult,
  type SofaLoanDto,
  type BalancePayStatus,
} from "@carres/shared";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * ops_order_control overlay — the editable "Master Sheet, live" fields for an
 * order (migration 0159; P2 of project-orders-control-spec).
 *
 *   GET /api/operation/orders/:id/control   — read the overlay (null if none)
 *   PUT /api/operation/orders/:id/control   — sparse upsert
 *
 * Plain-table CRUD via PostgREST (no RPC): the row is a 1:1 overlay keyed by
 * order_id, created lazily on first edit. RLS (migration 0159) is the security
 * boundary — read = any internal HQ role, write = operation/principal — so we
 * forward the user JWT and let RLS enforce; the inline role gate here is just
 * defence-in-depth + a clean 403 message.
 *
 * Mount via `api.route("/operation/orders", orderControlRouter)` in
 * apps/api/src/index.ts so the paths above are absolute. Mirrors the sibling
 * deliveryChainRouter mounting + inline-guard pattern.
 */
const orderControlRouter = new Hono<AppEnv>();

const ORDER_ID = z.string().uuid();

function requireOperationOrPrincipal(
  role: string,
): asserts role is "operation" | "principal" {
  if (role !== "operation" && role !== "principal") {
    throw new HTTPException(403, { message: "Operation or principal only" });
  }
}

// GET /:id/control — read the overlay. Absent row → { control: null } (the FE
// renders all-default fields and creates the row on first save).
orderControlRouter.get("/:id/control", async (c) => {
  const auth = c.var.auth;
  requireOperationOrPrincipal(auth.role);

  const idCheck = ORDER_ID.safeParse(c.req.param("id"));
  if (!idCheck.success) throw new HTTPException(404, { message: "Order not found" });

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("ops_order_control")
    .select(
      "order_id, stock_location, stock_eta, delivery_time_slot, customer_request, action_for_logistic, carres_remark, warehouse_remark, payment_status, balance, balance_due_date, storage_from, storage_to, storage_fee_override, storage_fee_msbf, storage_fee_sof, logistic_eta, paid_amount, storage_paid, storage_collected_at, storage_waiver_status, storage_waiver_reason, storage_waiver_requested_by, storage_waiver_decided_by, storage_waiver_decided_at, extension_original_date, extension_new_date, extension_reason, extension_note, extension_acknowledged_at, extended_at, extended_by, extension_count, contact_by_days, contact_by_task_at, line_locations, line_legs, line_etas, line_stock_status, line_received, called_customer, customer_confirmed, last_chased_at, assigned_staff, assigned_by, assigned_at, updated_at, updated_by",
    )
    .eq("order_id", idCheck.data)
    .maybeSingle();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }

  return c.json({ control: data ?? null });
});

// PUT /:id/control — sparse upsert of the overlay. Only the fields the drawer
// changed come in; the rest keep their value (or column default on insert).
// updated_at is auto-bumped by the set_updated_at trigger on the UPDATE branch.
orderControlRouter.put("/:id/control", async (c) => {
  const auth = c.var.auth;
  requireOperationOrPrincipal(auth.role);

  const idCheck = ORDER_ID.safeParse(c.req.param("id"));
  if (!idCheck.success) throw new HTTPException(404, { message: "Order not found" });

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Body must be valid JSON" });
  }
  const parsed = updateOpsOrderControlInput.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue && issue.path.length > 0 ? issue.path.join(".") : "<root>";
    return c.json(
      {
        error: "invalid_input",
        code: "invalid_param",
        message: `Invalid order-control input at ${path}: ${issue?.message ?? "validation failed"}`,
      },
      422,
    );
  }
  // Reject empty patch — nothing to write, signal misuse.
  if (Object.keys(parsed.data).length === 0) {
    return c.json(
      {
        error: "invalid_input",
        code: "invalid_param",
        message: "Patch object must contain at least one field",
      },
      422,
    );
  }

  // Staff owner (0232): MANUAL assignment is management-only (Jess 2026-07-18
  // — operation@carres.com + principal); staff sessions get a clean 403. The
  // web hides the controls; this is the enforcement.
  if ("assigned_staff" in parsed.data && !isOpsManager(auth.role, auth.email)) {
    throw new HTTPException(403, {
      message: "Only management can assign or reassign the PIC",
    });
  }

  const sb = userClient(c.env, auth.jwt);
  // Staff owner (0232): assigned_by / assigned_at are SERVER-stamped whenever
  // the assigned_staff key rides the patch — never trusted from the client.
  const assignStamp =
    "assigned_staff" in parsed.data
      ? { assigned_by: auth.id, assigned_at: new Date().toISOString() }
      : {};
  const { data, error } = await sb
    .from("ops_order_control")
    .upsert(
      { order_id: idCheck.data, ...parsed.data, ...assignStamp, updated_by: auth.id },
      { onConflict: "order_id" },
    )
    .select(
      "order_id, stock_location, stock_eta, delivery_time_slot, customer_request, action_for_logistic, carres_remark, warehouse_remark, payment_status, balance, balance_due_date, storage_from, storage_to, storage_fee_override, storage_fee_msbf, storage_fee_sof, logistic_eta, paid_amount, storage_paid, storage_collected_at, storage_waiver_status, storage_waiver_reason, storage_waiver_requested_by, storage_waiver_decided_by, storage_waiver_decided_at, extension_original_date, extension_new_date, extension_reason, extension_note, extension_acknowledged_at, extended_at, extended_by, extension_count, contact_by_days, contact_by_task_at, line_locations, line_legs, line_etas, line_stock_status, line_received, called_customer, customer_confirmed, last_chased_at, assigned_staff, assigned_by, assigned_at, updated_at, updated_by",
    )
    .single();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }

  return c.json({ control: data });
});

// POST /import-stock-eta — bulk-fill per-line Stock ETA from Jess's Master "Ops"
// sheet. AutoCount orders never carried Stock ETA, so the detail's ETA box was
// blank; this joins each sheet row to an order line by PO (order_lines.source_po)
// + product name (fuzzy, colour-code tolerant) and merges the ETA into
// ops_order_control.line_etas. `dryRun` computes the match rate + writes nothing
// (the client shows it as a preview before committing). Operation/principal only;
// userClient/RLS is the security boundary.
orderControlRouter.post("/import-stock-eta", async (c) => {
  const auth = c.var.auth;
  requireOperationOrPrincipal(auth.role);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Body must be valid JSON" });
  }
  const parsed = stockEtaImportInput.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue && issue.path.length > 0 ? issue.path.join(".") : "<root>";
    return c.json(
      {
        error: "invalid_input",
        code: "invalid_param",
        message: `Invalid stock-eta import at ${path}: ${issue?.message ?? "validation failed"}`,
      },
      422,
    );
  }
  const { rows, storageFees, balances, dryRun = false } = parsed.data;

  const sb = userClient(c.env, auth.jwt);

  // All order lines that carry a source PO — the join universe.
  const { data: lineData, error: lineErr } = await sb
    .from("order_lines")
    .select("order_id, sku, source_po")
    .not("source_po", "is", null);
  if (lineErr) {
    const m = mapPgError(lineErr);
    return c.json(m.body, m.status);
  }
  const lines: OrderLineRef[] = (lineData ?? []).map((l) => ({
    orderId: l.order_id as string,
    sku: l.sku as string,
    sourcePo: (l.source_po as string | null) ?? null,
  }));

  const { matched, unmatched } = matchStockRows(rows, lines);

  // Group by order → the ETA and/or the readiness STATUS for each matched line,
  // keyed by the exact order_lines.sku (the line_etas / line_stock_status key).
  const etaByOrder = new Map<string, Record<string, string>>();
  const statusByOrder = new Map<string, Record<string, string>>();
  const touchedOrders = new Set<string>();
  for (const m of matched) {
    touchedOrders.add(m.orderId);
    if (m.eta) {
      const cur = etaByOrder.get(m.orderId) ?? {};
      cur[m.sku] = m.eta;
      etaByOrder.set(m.orderId, cur);
    }
    if (m.stockStatus) {
      const cur = statusByOrder.get(m.orderId) ?? {};
      cur[m.sku] = m.stockStatus;
      statusByOrder.set(m.orderId, cur);
    }
  }

  // Storage fees (per-ORDER, by Ref) — migration 0207. Resolve each Master
  // storage-fee row's Ref to an order id (orders.source_ref is a text[]), so it
  // can be written to ops_order_control.storage_fee_msbf / _sof. Aggregated
  // server-side too (defence — a Master repeats an order's fee across its lines).
  const storageAgg = aggregateStorageFeesByRef(storageFees ?? []);
  const balanceAgg = aggregateBalancesByRef(balances ?? []);
  const feeByOrder = new Map<string, { msbf?: number; sof?: number }>();
  const balanceByOrder = new Map<
    string,
    { owing?: number; payStatus?: BalancePayStatus }
  >();
  let storageUnmatched = 0;
  let balanceUnmatched = 0;
  // Storage fees + balance/payment-status both join by Ref (per-order) — resolve
  // the ref→order map ONCE and drive both (orders.source_ref is a text[]).
  if (storageAgg.length > 0 || balanceAgg.length > 0) {
    const { data: orderData, error: ordErr } = await sb
      .from("orders")
      .select("id, source_ref");
    if (ordErr) {
      const m = mapPgError(ordErr);
      return c.json(m.body, m.status);
    }
    const orderByRef = new Map<string, string>();
    for (const o of orderData ?? []) {
      for (const ref of (o.source_ref as string[] | null) ?? []) {
        orderByRef.set(String(ref).trim().toUpperCase(), o.id as string);
      }
    }
    // Combined-ref aware resolver for balances: a Master "Ref" may be a combined
    // string ("CR1127 + TCF0477" — one physical order under several AutoCount refs).
    // Split into tokens and pick the order whose source_ref set best matches (most
    // shared tokens, then closest cardinality) so a combined-ref row lands on ITS
    // own order, not a same-token standalone order.
    const ordersForMatch = (orderData ?? []).map((o) => ({
      id: o.id as string,
      refs: ((o.source_ref as string[] | null) ?? []).map((r) =>
        String(r).trim().toUpperCase(),
      ),
    }));
    const bestOrderForRef = (ref: string): string | undefined => {
      const tokens = ref
        .split(/[+\s]+/)
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean);
      if (tokens.length === 0) return undefined;
      let best: { id: string; overlap: number; card: number } | undefined;
      for (const o of ordersForMatch) {
        const overlap = o.refs.filter((r) => tokens.includes(r)).length;
        if (overlap === 0) continue;
        const card = Math.abs(o.refs.length - tokens.length);
        if (
          !best ||
          overlap > best.overlap ||
          (overlap === best.overlap && card < best.card)
        ) {
          best = { id: o.id, overlap, card };
        }
      }
      return best?.id;
    };
    for (const f of storageAgg) {
      const orderId = orderByRef.get(f.ref.trim().toUpperCase());
      if (!orderId) {
        storageUnmatched += 1;
        continue;
      }
      const cur = feeByOrder.get(orderId) ?? {};
      if (f.msbf !== undefined) cur.msbf = f.msbf;
      if (f.sof !== undefined) cur.sof = f.sof;
      feeByOrder.set(orderId, cur);
    }
    for (const b of balanceAgg) {
      const orderId = bestOrderForRef(b.ref);
      if (!orderId) {
        balanceUnmatched += 1;
        continue;
      }
      const cur = balanceByOrder.get(orderId) ?? {};
      // SUM when two distinct Master refs resolve to ONE physical order (e.g. two
      // combined-ref rows for the same customer) — both are money owed on that order.
      if (b.owing !== undefined) cur.owing = (cur.owing ?? 0) + b.owing;
      if (b.payStatus) cur.payStatus = b.payStatus;
      balanceByOrder.set(orderId, cur);
    }
  }

  const result: StockEtaImportResult = {
    matched: matched.length,
    unmatched: unmatched.length,
    orders: touchedOrders.size,
    written: 0,
    storageOrders: feeByOrder.size,
    storageWritten: 0,
    storageUnmatched,
    balanceOrders: balanceByOrder.size,
    balanceWritten: 0,
    balanceUnmatched,
    sampleUnmatched: unmatched.slice(0, 20),
    dryRun,
  };

  if (
    dryRun ||
    (touchedOrders.size === 0 && feeByOrder.size === 0 && balanceByOrder.size === 0)
  ) {
    return c.json({ result });
  }

  // Merge stock ETA/status into each order's existing line_etas + line_stock_status
  // (never clobber other lines).
  if (touchedOrders.size > 0) {
    const orderIds = [...touchedOrders];
    const { data: existing, error: exErr } = await sb
      .from("ops_order_control")
      .select("order_id, line_etas, line_stock_status")
      .in("order_id", orderIds);
    if (exErr) {
      const m = mapPgError(exErr);
      return c.json(m.body, m.status);
    }
    const existingEtas = new Map<string, Record<string, string>>();
    const existingStatus = new Map<string, Record<string, string>>();
    for (const row of existing ?? []) {
      existingEtas.set(
        row.order_id as string,
        (row.line_etas as Record<string, string> | null) ?? {},
      );
      existingStatus.set(
        row.order_id as string,
        (row.line_stock_status as Record<string, string> | null) ?? {},
      );
    }

    let written = 0;
    const upsertRows = orderIds.map((orderId) => {
      const eta = etaByOrder.get(orderId);
      const status = statusByOrder.get(orderId);
      written += Object.keys({ ...eta, ...status }).length;
      const row: {
        order_id: string;
        updated_by: string;
        line_etas?: Record<string, string>;
        line_stock_status?: Record<string, string>;
      } = { order_id: orderId, updated_by: auth.id };
      if (eta) row.line_etas = { ...(existingEtas.get(orderId) ?? {}), ...eta };
      if (status)
        row.line_stock_status = { ...(existingStatus.get(orderId) ?? {}), ...status };
      return row;
    });

    const { error: upErr } = await sb
      .from("ops_order_control")
      .upsert(upsertRows, { onConflict: "order_id" });
    if (upErr) {
      const m = mapPgError(upErr);
      return c.json(m.body, m.status);
    }
    result.written = written;
  }

  // Write the per-order storage fees (only the columns present; nulls left as-is
  // so a MS/BF-only order keeps sof null). Overwrites the import columns; never
  // touches storage_fee_override (the operator's manual value).
  if (feeByOrder.size > 0) {
    const feeRows = [...feeByOrder.entries()].map(([orderId, fee]) => {
      const row: {
        order_id: string;
        updated_by: string;
        storage_fee_msbf?: number;
        storage_fee_sof?: number;
      } = { order_id: orderId, updated_by: auth.id };
      if (fee.msbf !== undefined) row.storage_fee_msbf = fee.msbf;
      if (fee.sof !== undefined) row.storage_fee_sof = fee.sof;
      return row;
    });
    const { error: feeErr } = await sb
      .from("ops_order_control")
      .upsert(feeRows, { onConflict: "order_id" });
    if (feeErr) {
      const m = mapPgError(feeErr);
      return c.json(m.body, m.status);
    }
    result.storageWritten = feeByOrder.size;
  }

  // Write the per-order balance (owing) + payment status from the Master's
  // "Balance" + "Payment Status" columns. No migration — both columns exist.
  if (balanceByOrder.size > 0) {
    const balRows = [...balanceByOrder.entries()].map(([orderId, b]) => {
      const row: {
        order_id: string;
        updated_by: string;
        balance?: number;
        payment_status?: string;
      } = { order_id: orderId, updated_by: auth.id };
      if (b.owing !== undefined) row.balance = b.owing;
      if (b.payStatus) row.payment_status = b.payStatus;
      return row;
    });
    const { error: balErr } = await sb
      .from("ops_order_control")
      .upsert(balRows, { onConflict: "order_id" });
    if (balErr) {
      const m = mapPgError(balErr);
      return c.json(m.body, m.status);
    }
    result.balanceWritten = balanceByOrder.size;
  }

  return c.json({ result });
});

// POST /append-missing-lines — Master reconcile append (Jess Option A,
// 2026-07-18; migration 0237). After a Master import, a sheet row whose PO
// exists on NO line of its (existing, AutoCount) order is a line the portal is
// missing — 0214 made re-import create-only, so nothing else can add it. dryRun
// detects + returns the candidates (the import result screen renders them as a
// tick-list; `clean` drives the default tick); the commit call receives ONLY
// the ticked rows, RE-detects server-side (never trust the client's diff — a
// line added between preview and commit must not duplicate), then appends via
// the append_autocount_order_lines RPC (raw sku, unit_price 0, items_edited
// flip + order_history/audit inside the RPC). Operation/principal only.
orderControlRouter.post("/append-missing-lines", async (c) => {
  const auth = c.var.auth;
  requireOperationOrPrincipal(auth.role);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Body must be valid JSON" });
  }
  const parsed = appendMissingLinesInput.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue && issue.path.length > 0 ? issue.path.join(".") : "<root>";
    return c.json(
      {
        error: "invalid_input",
        code: "invalid_param",
        message: `Invalid append input at ${path}: ${issue?.message ?? "validation failed"}`,
      },
      422,
    );
  }
  const { rows, dryRun = false } = parsed.data;

  const sb = userClient(c.env, auth.jwt);

  // The append universe: AutoCount orders + ALL their lines (PO-less lines
  // included — they count as divergence in the clean check).
  const { data: orderData, error: ordErr } = await sb
    .from("orders")
    .select("id, so, source_ref")
    .eq("source_system", "autocount");
  if (ordErr) {
    const m = mapPgError(ordErr);
    return c.json(m.body, m.status);
  }
  const orderIds = new Set((orderData ?? []).map((o) => o.id as string));
  const { data: lineData, error: lineErr } = await sb
    .from("order_lines")
    .select("order_id, sku, source_po");
  if (lineErr) {
    const m = mapPgError(lineErr);
    return c.json(m.body, m.status);
  }
  const linesByOrder = new Map<string, { sku: string; sourcePo: string | null }[]>();
  for (const l of lineData ?? []) {
    const oid = l.order_id as string;
    if (!orderIds.has(oid)) continue;
    const arr = linesByOrder.get(oid) ?? [];
    arr.push({ sku: l.sku as string, sourcePo: (l.source_po as string | null) ?? null });
    linesByOrder.set(oid, arr);
  }
  const orders: AppendOrderRef[] = (orderData ?? []).map((o) => ({
    id: o.id as string,
    so: o.so as number,
    sourceRef: ((o.source_ref as string[] | null) ?? []).map((r) => String(r)),
    lines: linesByOrder.get(o.id as string) ?? [],
  }));

  const candidates = detectMissingLines(rows, orders);

  const result: AppendMissingLinesResult = {
    candidates,
    appended: 0,
    orders: 0,
    dryRun,
  };
  if (dryRun || candidates.length === 0) return c.json({ result });

  // Group per order → one RPC call each (the RPC stamps history/audit once per
  // order, matching how the operator thinks about the action).
  const byOrder = new Map<string, MissingLineCandidate[]>();
  for (const cand of candidates) {
    (byOrder.get(cand.orderId) ?? byOrder.set(cand.orderId, []).get(cand.orderId)!).push(
      cand,
    );
  }
  for (const [orderId, cands] of byOrder) {
    const { data, error } = await sb.rpc("append_autocount_order_lines", {
      p_order_id: orderId,
      p_lines: cands.map((cand) => ({
        sku: cand.detail,
        qty: cand.qty,
        source_po: cand.po || null,
        attrs: cand.itemGroup ? { item_group: cand.itemGroup } : {},
      })),
    });
    if (error) {
      const m = mapPgError(error);
      return c.json(m.body, m.status);
    }
    result.appended += Number((data as { appended?: number } | null)?.appended ?? 0);
    result.orders += 1;
  }

  return c.json({ result });
});

// POST /:id/receive-line — GRN per-line partial receive (migration 0208). Books
// n units of ONE order line into ops_stock_items (reserved to this SO), bumps the
// line's received count, and auto-flips the line to Ready once fully received.
// Works WITHOUT a portal PO (AutoCount orders carry only a text source_po).
// Operation/principal; userClient/RLS is the security boundary.
orderControlRouter.post("/:id/receive-line", async (c) => {
  const auth = c.var.auth;
  requireOperationOrPrincipal(auth.role);

  const idCheck = ORDER_ID.safeParse(c.req.param("id"));
  if (!idCheck.success) throw new HTTPException(404, { message: "Order not found" });
  const orderId = idCheck.data;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Body must be valid JSON" });
  }
  const parsed = receiveLineInput.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue && issue.path.length > 0 ? issue.path.join(".") : "<root>";
    return c.json(
      {
        error: "invalid_input",
        code: "invalid_param",
        message: `Invalid receive-line input at ${path}: ${issue?.message ?? "validation failed"}`,
      },
      422,
    );
  }
  const { sku, qty, condition, location, doNumber } = parsed.data;
  void location; // reserved for a future per-unit location stamp

  const sb = userClient(c.env, auth.jwt);

  // The order → so (for the reserved_ref) + warehouse.
  const { data: order, error: ordErr } = await sb
    .from("orders")
    .select("id, so, warehouse_id")
    .eq("id", orderId)
    .maybeSingle();
  if (ordErr) {
    const m = mapPgError(ordErr);
    return c.json(m.body, m.status);
  }
  if (!order) throw new HTTPException(404, { message: "Order not found" });

  // Resolve a warehouse to book into: the order's, else the Carres/Klang default,
  // else the first — ops_stock_items.warehouse_id is NOT NULL.
  let warehouseId = (order.warehouse_id as string | null) ?? null;
  if (!warehouseId) {
    const { data: whs, error: whErr } = await sb
      .from("warehouses")
      .select("id, name")
      .order("created_at", { ascending: true });
    if (whErr) {
      const m = mapPgError(whErr);
      return c.json(m.body, m.status);
    }
    warehouseId =
      (whs ?? []).find((w) => /carres|klang/i.test(String(w.name)))?.id ??
      (whs ?? [])[0]?.id ??
      null;
  }
  if (!warehouseId) {
    return c.json(
      { error: "no_warehouse", code: "invalid_param", message: "No warehouse to book stock into" },
      422,
    );
  }

  // The order line(s) for this sku → ordered qty + source PO (combine duplicates).
  const { data: lineRows, error: lineErr } = await sb
    .from("order_lines")
    .select("sku, qty, source_po")
    .eq("order_id", orderId);
  if (lineErr) {
    const m = mapPgError(lineErr);
    return c.json(m.body, m.status);
  }
  const matching = (lineRows ?? []).filter((l) => (l.sku as string) === sku);
  if (matching.length === 0) {
    return c.json(
      { error: "not_a_line", code: "invalid_param", message: "That SKU is not a line on this order" },
      422,
    );
  }
  const lineQty = matching.reduce((s, l) => s + Number(l.qty || 0), 0);
  const sourcePo =
    (matching.find((l) => l.source_po)?.source_po as string | null) ?? null;

  // Current received count + status for this line (from the overlay).
  const { data: ctrl, error: ctrlErr } = await sb
    .from("ops_order_control")
    .select("line_received, line_stock_status")
    .eq("order_id", orderId)
    .maybeSingle();
  if (ctrlErr) {
    const m = mapPgError(ctrlErr);
    return c.json(m.body, m.status);
  }
  const existingReceived =
    (ctrl?.line_received as Record<string, number> | null) ?? {};
  const existingStatus =
    (ctrl?.line_stock_status as Record<string, string> | null) ?? {};
  const already = Number(existingReceived[sku] ?? 0);
  const lineReceived = already + qty;

  // Book the units into ops_stock_items, reserved to this SO.
  const soRef = `SO-${order.so}`;
  const today = new Date().toISOString().slice(0, 10);
  const unitRows = Array.from({ length: qty }, () => ({
    sku,
    warehouse_id: warehouseId,
    condition,
    status: "reserved",
    reserved_ref: soRef,
    po_no: sourcePo,
    source_ref: doNumber ?? null,
    date_in: today,
  }));
  const { error: insErr } = await sb.from("ops_stock_items").insert(unitRows);
  if (insErr) {
    const m = mapPgError(insErr);
    return c.json(m.body, m.status);
  }

  // Persist the received count; auto-flip to Ready when fully received.
  const ready = lineReceived >= lineQty;
  const controlPatch: {
    order_id: string;
    updated_by: string;
    line_received: Record<string, number>;
    line_stock_status?: Record<string, string>;
  } = {
    order_id: orderId,
    updated_by: auth.id,
    line_received: { ...existingReceived, [sku]: lineReceived },
  };
  if (ready) {
    controlPatch.line_stock_status = { ...existingStatus, [sku]: "ready" };
  }
  const { error: upErr } = await sb
    .from("ops_order_control")
    .upsert(controlPatch, { onConflict: "order_id" });
  if (upErr) {
    const m = mapPgError(upErr);
    return c.json(m.body, m.status);
  }

  const result: ReceiveLineResult = { received: qty, lineReceived, lineQty, ready };
  return c.json({ result });
});

// ── Sofa loan flow (migration 0209) ──────────────────────────────────────────
// GET /:id/loans — the order's loans (joined with the loaned unit's sku + cond).
orderControlRouter.get("/:id/loans", async (c) => {
  const auth = c.var.auth;
  requireOperationOrPrincipal(auth.role);
  const idCheck = ORDER_ID.safeParse(c.req.param("id"));
  if (!idCheck.success) throw new HTTPException(404, { message: "Order not found" });

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("ops_sofa_loans")
    .select(
      "id, order_id, source, category, item_id, do_number, status, loaned_at, returned_at, returned_to_supplier_at, supplier_id, borrowed_sku, borrowed_label, notes, ops_stock_items(sku, condition, po_no), suppliers(name)",
    )
    .eq("order_id", idCheck.data)
    .order("loaned_at", { ascending: false });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  const loans: SofaLoanDto[] = (data ?? []).map((r) => mapLoanRow(r));
  return c.json({ loans });
});

/** Map a joined ops_sofa_loans row → the general SofaLoanDto (both sources). */
function mapLoanRow(r: unknown): SofaLoanDto {
  const row = r as Record<string, unknown> & {
    ops_stock_items?: {
      sku?: string | null;
      condition?: string | null;
      po_no?: string | null;
    } | null;
    suppliers?: { name?: string | null } | null;
  };
  return {
    id: row.id as string,
    order_id: row.order_id as string,
    source: (row.source as "warehouse" | "supplier" | null) ?? "warehouse",
    category: (row.category as string | null) ?? null,
    item_id: (row.item_id as string | null) ?? null,
    item_sku: row.ops_stock_items?.sku ?? null,
    item_condition: row.ops_stock_items?.condition ?? null,
    item_po: row.ops_stock_items?.po_no ?? null,
    supplier_id: (row.supplier_id as string | null) ?? null,
    supplier_name: row.suppliers?.name ?? null,
    borrowed_sku: (row.borrowed_sku as string | null) ?? null,
    borrowed_label: (row.borrowed_label as string | null) ?? null,
    returned_to_supplier_at:
      (row.returned_to_supplier_at as string | null) ?? null,
    do_number: (row.do_number as string | null) ?? null,
    status: row.status as "on_loan" | "returned",
    loaned_at: row.loaned_at as string,
    returned_at: (row.returned_at as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
  };
}

// POST /:id/loan-sofa — lend a free sofa to the order: claim the unit (free →
// reserved with a "LOAN SO-{n}" marker, atomic on status='free') + record the
// loan. The real sofa line is untouched (stays Waiting).
orderControlRouter.post("/:id/loan-sofa", async (c) => {
  const auth = c.var.auth;
  requireOperationOrPrincipal(auth.role);
  const idCheck = ORDER_ID.safeParse(c.req.param("id"));
  if (!idCheck.success) throw new HTTPException(404, { message: "Order not found" });
  const orderId = idCheck.data;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Body must be valid JSON" });
  }
  const parsed = loanSofaInput.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue && issue.path.length > 0 ? issue.path.join(".") : "<root>";
    return c.json(
      { error: "invalid_input", code: "invalid_param", message: `Invalid loan input at ${path}: ${issue?.message ?? "validation failed"}` },
      422,
    );
  }
  const { itemId, doNumber, notes } = parsed.data;
  const sb = userClient(c.env, auth.jwt);

  const { data: order, error: ordErr } = await sb
    .from("orders")
    .select("id, so")
    .eq("id", orderId)
    .maybeSingle();
  if (ordErr) {
    const m = mapPgError(ordErr);
    return c.json(m.body, m.status);
  }
  if (!order) throw new HTTPException(404, { message: "Order not found" });

  // Claim the free unit (atomic on status='free' — 409 if someone grabbed it).
  const now = new Date().toISOString();
  const { data: claimed, error: claimErr } = await sb
    .from("ops_stock_items")
    .update({ status: "reserved", reserved_ref: `LOAN SO-${order.so}`, updated_at: now })
    .eq("id", itemId)
    .eq("status", "free")
    .select("id, sku, condition, po_no")
    .maybeSingle();
  if (claimErr) {
    const m = mapPgError(claimErr);
    return c.json(m.body, m.status);
  }
  if (!claimed) {
    return c.json(
      { error: "not_free", code: "conflict", message: "That sofa is no longer free" },
      409,
    );
  }

  const { data: loan, error: loanErr } = await sb
    .from("ops_sofa_loans")
    .insert({
      order_id: orderId,
      item_id: itemId,
      do_number: doNumber ?? null,
      status: "on_loan",
      loaned_by: auth.id,
      notes: notes ?? null,
    })
    .select("id, order_id, item_id, do_number, status, loaned_at, returned_at, notes")
    .single();
  if (loanErr) {
    // Best-effort rollback of the claim so the unit isn't stranded reserved.
    await sb
      .from("ops_stock_items")
      .update({ status: "free", reserved_ref: null, updated_at: new Date().toISOString() })
      .eq("id", itemId);
    const m = mapPgError(loanErr);
    return c.json(m.body, m.status);
  }
  const dto: SofaLoanDto = {
    id: loan.id as string,
    order_id: loan.order_id as string,
    source: "warehouse",
    category: null,
    item_id: loan.item_id as string,
    item_sku: (claimed.sku as string | null) ?? null,
    item_condition: (claimed.condition as string | null) ?? null,
    item_po: (claimed.po_no as string | null) ?? null,
    supplier_id: null,
    supplier_name: null,
    borrowed_sku: null,
    borrowed_label: null,
    returned_to_supplier_at: null,
    do_number: (loan.do_number as string | null) ?? null,
    status: loan.status as "on_loan" | "returned",
    loaned_at: loan.loaned_at as string,
    returned_at: (loan.returned_at as string | null) ?? null,
    notes: (loan.notes as string | null) ?? null,
  };
  return c.json({ loan: dto });
});

// POST /:id/loan-borrow — BORROW a piece from a supplier to loan to the order
// (migration 0217). No own-stock unit is claimed; the borrowed piece is described
// inline + we owe the supplier a piece back (the return obligation, closed later
// via /loan-return-supplier). The real line is untouched (stays Waiting).
orderControlRouter.post("/:id/loan-borrow", async (c) => {
  const auth = c.var.auth;
  requireOperationOrPrincipal(auth.role);
  const idCheck = ORDER_ID.safeParse(c.req.param("id"));
  if (!idCheck.success) throw new HTTPException(404, { message: "Order not found" });
  const orderId = idCheck.data;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Body must be valid JSON" });
  }
  const parsed = borrowLoanInput.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue && issue.path.length > 0 ? issue.path.join(".") : "<root>";
    return c.json(
      { error: "invalid_input", code: "invalid_param", message: `Invalid borrow input at ${path}: ${issue?.message ?? "validation failed"}` },
      422,
    );
  }
  const { supplierId, category, borrowedSku, borrowedLabel, doNumber, notes } =
    parsed.data;
  const sb = userClient(c.env, auth.jwt);

  const { data: loan, error: loanErr } = await sb
    .from("ops_sofa_loans")
    .insert({
      order_id: orderId,
      source: "supplier",
      supplier_id: supplierId,
      category: category ?? null,
      borrowed_sku: borrowedSku ?? null,
      borrowed_label: borrowedLabel,
      item_id: null,
      do_number: doNumber ?? null,
      status: "on_loan",
      loaned_by: auth.id,
      notes: notes ?? null,
    })
    .select(
      "id, order_id, source, category, item_id, do_number, status, loaned_at, returned_at, returned_to_supplier_at, supplier_id, borrowed_sku, borrowed_label, notes, suppliers(name)",
    )
    .single();
  if (loanErr) {
    const m = mapPgError(loanErr);
    return c.json(m.body, m.status);
  }
  return c.json({ loan: mapLoanRow(loan) });
});

// POST /:id/loan-return — the swap at final delivery: mark the loan returned +
// free the loaned unit back to stock.
orderControlRouter.post("/:id/loan-return", async (c) => {
  const auth = c.var.auth;
  requireOperationOrPrincipal(auth.role);
  const idCheck = ORDER_ID.safeParse(c.req.param("id"));
  if (!idCheck.success) throw new HTTPException(404, { message: "Order not found" });
  const orderId = idCheck.data;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Body must be valid JSON" });
  }
  const parsed = returnLoanInput.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", code: "invalid_param", message: "loanId must be a uuid" },
      422,
    );
  }
  const { loanId } = parsed.data;
  const sb = userClient(c.env, auth.jwt);

  const { data: loan, error: loanErr } = await sb
    .from("ops_sofa_loans")
    .select("id, item_id, status")
    .eq("id", loanId)
    .eq("order_id", orderId)
    .maybeSingle();
  if (loanErr) {
    const m = mapPgError(loanErr);
    return c.json(m.body, m.status);
  }
  if (!loan) throw new HTTPException(404, { message: "Loan not found" });
  if (loan.status !== "on_loan") {
    return c.json(
      { error: "already_returned", code: "conflict", message: "That loan is already returned" },
      409,
    );
  }

  const now = new Date().toISOString();
  const { error: upErr } = await sb
    .from("ops_sofa_loans")
    .update({ status: "returned", returned_at: now, updated_at: now })
    .eq("id", loanId)
    .eq("status", "on_loan");
  if (upErr) {
    const m = mapPgError(upErr);
    return c.json(m.body, m.status);
  }
  // Only a WAREHOUSE loan has an own-stock unit to free back; a supplier borrow
  // has item_id = null (the piece goes back to the supplier via a separate step).
  if (loan.item_id) {
    const { error: freeErr } = await sb
      .from("ops_stock_items")
      .update({ status: "free", reserved_ref: null, updated_at: now })
      .eq("id", loan.item_id as string);
    if (freeErr) {
      const m = mapPgError(freeErr);
      return c.json(m.body, m.status);
    }
  }
  return c.json({ ok: true });
});

// POST /:id/loan-return-supplier — close the supplier RETURN OBLIGATION: stamp
// returned_to_supplier_at once the borrowed piece has physically gone back to the
// supplier (source='supplier' only). Independent of the customer swap.
orderControlRouter.post("/:id/loan-return-supplier", async (c) => {
  const auth = c.var.auth;
  requireOperationOrPrincipal(auth.role);
  const idCheck = ORDER_ID.safeParse(c.req.param("id"));
  if (!idCheck.success) throw new HTTPException(404, { message: "Order not found" });
  const orderId = idCheck.data;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Body must be valid JSON" });
  }
  const parsed = returnToSupplierInput.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", code: "invalid_param", message: "loanId must be a uuid" },
      422,
    );
  }
  const { loanId } = parsed.data;
  const sb = userClient(c.env, auth.jwt);

  const { data: loan, error: loanErr } = await sb
    .from("ops_sofa_loans")
    .select("id, source, returned_to_supplier_at")
    .eq("id", loanId)
    .eq("order_id", orderId)
    .maybeSingle();
  if (loanErr) {
    const m = mapPgError(loanErr);
    return c.json(m.body, m.status);
  }
  if (!loan) throw new HTTPException(404, { message: "Loan not found" });
  if (loan.source !== "supplier") {
    return c.json(
      { error: "not_supplier_loan", code: "conflict", message: "Only a supplier borrow has a return-to-supplier obligation" },
      409,
    );
  }
  if (loan.returned_to_supplier_at) {
    return c.json(
      { error: "already_returned", code: "conflict", message: "Already returned to the supplier" },
      409,
    );
  }

  const now = new Date().toISOString();
  const { error: upErr } = await sb
    .from("ops_sofa_loans")
    .update({ returned_to_supplier_at: now, updated_at: now })
    .eq("id", loanId)
    .is("returned_to_supplier_at", null);
  if (upErr) {
    const m = mapPgError(upErr);
    return c.json(m.body, m.status);
  }
  return c.json({ ok: true });
});

export default orderControlRouter;

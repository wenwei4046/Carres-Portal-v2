import { Hono } from "hono";
import type { Context } from "hono";
import {
  deliveryGroupOf,
  recordHandoverInput,
  recordOutboundPrepInput,
  signHandoverProofUploadInput,
} from "@carres/shared";
import { requireOperationOrPrincipal } from "../../lib/auth-guards";
import { mapPgError } from "../../lib/route-helpers";
import { adminClient, userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Warehouse Card 03: the physical acts (prep + handover) admit the SAME
 * governed door to a personally signed-in warehouse login. The role gate here
 * is a doorstep courtesy — the real boundary is the RPC, which re-checks the
 * role, the bound Site and the exact-Unit scope (0424). Warehouse holds no
 * table policy (0302), so its ancillary READS use admin after this gate; the
 * RPC always rides the USER's own JWT so the act is personally attributable.
 */
function outboundActorOf(c: Context<AppEnv>):
  | { kind: "internal" | "warehouse" }
  | null {
  const auth = c.var.auth;
  if (auth.role === "operation" || auth.role === "principal") {
    return { kind: "internal" };
  }
  if (auth.role === "warehouse" && auth.warehouseId) {
    return { kind: "warehouse" };
  }
  return null;
}

/**
 * The Delivery Orders REGISTER — document truth, plus the §4 handover doors
 * (blueprint card 2026-08-16; handover chain slice 1, card 2026-08-19;
 *  docs/delivery/MASTER.md §4/§8).
 *
 *   GET  /           — the register rows: every DO document (0356) with the
 *                      facts its columns print, the attempt history AND the
 *                      handover facts (0363) its status is derived from.
 *   GET  /:id        — one document, for the DO object page (Slice 2).
 *   POST /:id/handover
 *                    — record ONE fact of the §4 chain through the governed
 *                      door (`delivery_handover_record`, 0363). The object
 *                      page stays read-only; the acts live on the work
 *                      surfaces and call this.
 *   POST /:id/handover-proof/sign-upload
 *                    — short-lived signed upload URL for the proof the §6 law
 *                      binds to the exact event it proves.
 *
 * A register finds documents; work lives in My Work / Team Work — so nothing
 * here computes an owner, an action or a due date. Status is NOT computed
 * server-side either: the ONE arithmetic is `deliveryOrderStatusOf` in
 * packages/shared (Law D), and the web calls it over the facts this route
 * returns.
 */
const deliveryOrdersRouter = new Hono<AppEnv>();

/** The order fields the register's columns print — nothing more. */
const ORDER_EMBED =
  "orders!inner(id, so, customer_name, customer_address_city, customer_address_state, delivery_date, delivery_date_tbd)";

deliveryOrdersRouter.get("/", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);

  // `?order=<uuid>` scopes the list to one Sales Order — the SO object page's
  // "its DOs" read. Same shape, same arithmetic, one implementation.
  const orderScope = c.req.query("order") ?? null;

  let query = sb
    .from("ops_delivery_orders")
    .select(
      `id, order_id, do_number, issued_at, trip_groups, delivery_date, time_slot,
       logistics_partner, voided_at, void_reason, ${ORDER_EMBED}`,
    )
    .order("issued_at", { ascending: false })
    .limit(500);
  if (orderScope) query = query.eq("order_id", orderScope);

  const { data: rows, error } = await query;
  if (error) {
    return c.json({ error: "delivery_orders_read_failed", message: error.message }, 500);
  }

  const numbers = (rows ?? []).map((r) => r.do_number).filter(Boolean);
  let attempts: Array<{
    do_number: string | null;
    result: string;
    reason_key: string | null;
    recorded_at: string;
  }> = [];
  if (numbers.length > 0) {
    const res = await sb
      .from("delivery_attempts")
      .select("do_number, result, reason_key, recorded_at")
      .in("do_number", numbers);
    if (res.error) {
      return c.json(
        { error: "delivery_attempts_read_failed", message: res.error.message },
        500,
      );
    }
    attempts = res.data ?? [];
  }

  // The §4 handover facts (0363) — kinds only; the register's arithmetic
  // needs nothing more (Out for delivery derives from Received by Logistics).
  const ids = (rows ?? []).map((r) => r.id);
  let handoverEvents: Array<{ delivery_order_id: string; kind: string }> = [];
  if (ids.length > 0) {
    const res = await sb
      .from("delivery_handover_events")
      .select("delivery_order_id, kind")
      .in("delivery_order_id", ids);
    if (res.error) {
      return c.json(
        { error: "handover_events_read_failed", message: res.error.message },
        500,
      );
    }
    handoverEvents = res.data ?? [];
  }

  return c.json({ deliveryOrders: rows ?? [], attempts, handoverEvents });
});

deliveryOrdersRouter.get("/:id", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const id = c.req.param("id");

  // Everything the object page's blocks render — facts other modules own,
  // read through their existing columns. This route writes nothing.
  // The param is the row id, or the document's own number (`DO-…`) so a
  // document number anywhere in the portal can be a door (§0.1: DO → DO).
  let query = sb
    .from("ops_delivery_orders")
    .select(
      `id, order_id, do_number, issued_at, trip_groups, delivery_date, time_slot,
       logistics_partner, voided_at, void_reason,
       orders!inner(id, so, customer_name, customer_phone, customer_emergency,
         customer_address, customer_address_city, customer_address_state,
         do_file_path, do_uploaded_at,
         pod_signature_url, pod_signed_by, pod_signed_at,
         do_number,
         order_lines(sku, qty))`,
    );
  query = /^do-/i.test(id) ? query.eq("do_number", id.toUpperCase()) : query.eq("id", id);
  const { data: row, error } = await query.maybeSingle();
  if (error) {
    return c.json({ error: "delivery_order_read_failed", message: error.message }, 500);
  }
  if (!row) {
    return c.json({ error: "not_found", message: "Delivery order not found" }, 404);
  }

  const orderId = (row as { order_id: string }).order_id;

  // Photos deliberately do NOT ride this payload: the existing
  // `GET /orders/:id/delivery-photos` door already signs and serves the ledger
  // (0280) and the page calls it — one reader path, never a second (Law D).
  const [attemptsRes, loansRes, eventsRes] = await Promise.all([
    sb
      .from("delivery_attempts")
      .select("do_number, result, reason_key, note, where_goods, recorded_at, recorded_by")
      .eq("do_number", row.do_number)
      .order("recorded_at", { ascending: true }),
    sb
      .from("ops_sofa_loans")
      .select("id, item_id, do_number, status, loaned_at, returned_at, loan_note_no")
      .eq("order_id", orderId),
    sb
      .from("delivery_handover_events")
      .select(
        "id, kind, duty, company, counterparty, receiver_name, vehicle, goods, note, proof_path, recorded_by, recorded_at",
      )
      .eq("delivery_order_id", (row as { id: string }).id)
      .order("recorded_at", { ascending: true }),
  ]);
  if (attemptsRes.error) {
    return c.json(
      { error: "delivery_attempts_read_failed", message: attemptsRes.error.message },
      500,
    );
  }
  if (eventsRes.error) {
    return c.json(
      { error: "handover_events_read_failed", message: eventsRes.error.message },
      500,
    );
  }

  // Every event shows its recorder BY NAME (§4: person, company, duty), and
  // its proof opens through a short-lived signed VIEW url — the bucket is
  // private; the Worker signs after its own role gate (the 0280 pattern).
  const recorderIds = [
    ...new Set((eventsRes.data ?? []).map((e) => e.recorded_by).filter(Boolean)),
  ];
  const recorderNames: Record<string, string> = {};
  if (recorderIds.length > 0) {
    const usersRes = await sb
      .from("app_users")
      .select("id, name, email")
      .in("id", recorderIds);
    for (const u of usersRes.data ?? []) {
      const rec = u as { id: string; name: string | null; email: string | null };
      recorderNames[rec.id] = rec.name || rec.email || "";
    }
  }
  const admin = adminClient(c.env);
  const handoverEvents = await Promise.all(
    (eventsRes.data ?? []).map(async (e) => {
      let proofUrl: string | null = null;
      if (e.proof_path) {
        const { data: signed } = await admin.storage
          .from("proof-of-delivery")
          .createSignedUrl(e.proof_path, 3600);
        proofUrl = signed?.signedUrl ?? null;
      }
      return {
        ...e,
        recorded_by_name: recorderNames[e.recorded_by as string] ?? null,
        proofUrl,
      };
    }),
  );

  // Human words first, SKU mono second (card §5) — the same variant lookup the
  // DO print path uses; order_lines.sku has no FK to product_skus.
  const skus = ((row as { orders?: { order_lines?: Array<{ sku: string }> } }).orders
    ?.order_lines ?? []).map((l) => l.sku);
  const lineDescriptions: Record<string, string> = {};
  if (skus.length > 0) {
    const skuRes = await sb
      .from("product_skus")
      .select("sku, variant")
      .in("sku", skus);
    for (const r of skuRes.data ?? []) {
      const rec = r as { sku: string; variant: string | null };
      if (rec.variant) lineDescriptions[rec.sku] = rec.variant;
    }
  }

  // Warehouse Card 03 — the document's recorded exact-Unit scope (0424) and
  // which Units each accepted batch physically moved. Read-only projections
  // of the §3.5.1 tally: required = handed over + not handed over.
  const [scopeRes, eventUnitsRes] = await Promise.all([
    sb
      .from("delivery_order_units")
      .select("item_id, ops_stock_items!inner(unit_code, sku)")
      .eq("delivery_order_id", (row as { id: string }).id),
    sb
      .from("delivery_handover_event_units")
      .select("event_id, item_id, recorded_side, ops_stock_items!inner(unit_code)")
      .eq("delivery_order_id", (row as { id: string }).id),
  ]);
  if (scopeRes.error) {
    return c.json(
      { error: "delivery_order_scope_read_failed", message: scopeRes.error.message },
      500,
    );
  }
  if (eventUnitsRes.error) {
    return c.json(
      { error: "handover_event_units_read_failed", message: eventUnitsRes.error.message },
      500,
    );
  }
  const scopeUnits = ((scopeRes.data ?? []) as unknown as Array<{
    item_id: string;
    ops_stock_items: { unit_code: string | null; sku: string | null };
  }>).map((r) => ({
    item_id: r.item_id,
    unit_code: r.ops_stock_items?.unit_code ?? null,
    sku: r.ops_stock_items?.sku ?? null,
  }));
  const handoverEventUnits = ((eventUnitsRes.data ?? []) as unknown as Array<{
    event_id: string;
    item_id: string;
    recorded_side: string;
    ops_stock_items: { unit_code: string | null };
  }>).map((r) => ({
    event_id: r.event_id,
    item_id: r.item_id,
    recorded_side: r.recorded_side,
    unit_code: r.ops_stock_items?.unit_code ?? null,
  }));

  return c.json({
    deliveryOrder: row,
    attempts: attemptsRes.data ?? [],
    loans: loansRes.data ?? [],
    lineDescriptions,
    handoverEvents,
    scopeUnits,
    handoverEventUnits,
  });
});

/** THIS TRIP's goods, derived exactly as the DO page and the print path derive
 *  them (Law D — one arithmetic): trip_groups NULL = the whole order. */
function tripGoodsOf(
  lines: Array<{ sku: string; qty: number }>,
  tripGroups: string[] | null,
): Array<{ sku: string; qty: number }> {
  if (!tripGroups || tripGroups.length === 0) {
    return lines.map((l) => ({ sku: l.sku, qty: Number(l.qty) }));
  }
  const scope = new Set(tripGroups);
  return lines
    .filter((l) => {
      const g = deliveryGroupOf(l.sku);
      return g !== null && scope.has(g);
    })
    .map((l) => ({ sku: l.sku, qty: Number(l.qty) }));
}

// POST /:id/handover — record ONE fact of the §4 chain. The governed door
// (`delivery_handover_record`, 0363) owns the order-of-events, the once-only
// rule, the duty word and both companies; this route derives the DEFAULT
// goods count from the document's own trip lines so the warehouse states
// what the paper says unless the recorder says otherwise (a receipt with a
// different count is a discrepancy — both facts stay).
deliveryOrdersRouter.post("/:id/handover", async (c) => {
  const actor = outboundActorOf(c);
  if (!actor) {
    return c.json({ error: "forbidden", message: "This act is not available to your role" }, 403);
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const reader = actor.kind === "warehouse" ? adminClient(c.env) : sb;
  const id = c.req.param("id");

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_input", message: "Body must be valid JSON" }, 400);
  }
  const parsed = recordHandoverInput.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return c.json(
      {
        error: "invalid_input",
        message: issue?.message ?? "invalid input",
        field: issue?.path.join(".") ?? "unknown",
      },
      422,
    );
  }

  // Proof binds to the exact event it proves (§6): the path must sit under
  // THIS document's own prefix — never another document's, never outside it.
  if (parsed.data.proofPath && !parsed.data.proofPath.startsWith(`handover/${id}/`)) {
    return c.json(
      { error: "invalid_input", message: "Proof path does not belong to this delivery order" },
      422,
    );
  }

  // The default goods count comes from the document's own derived lines —
  // a DERIVED DISPLAY for legacy readers (0424): the exact-Unit batch is
  // the authority the RPC enforces.
  let goods = parsed.data.goods ?? null;
  if (!goods && parsed.data.kind !== "ready_for_handover") {
    const { data: doc, error } = await reader
      .from("ops_delivery_orders")
      .select("id, trip_groups, orders!inner(order_lines(sku, qty))")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      const m = mapPgError(error);
      return c.json(m.body, m.status);
    }
    if (!doc) {
      return c.json({ error: "not_found", message: "Delivery order not found" }, 404);
    }
    const lines =
      (doc as { orders?: { order_lines?: Array<{ sku: string; qty: number }> } }).orders
        ?.order_lines ?? [];
    goods = tripGoodsOf(lines, (doc as { trip_groups: string[] | null }).trip_groups);
  }

  const { data, error } = await sb.rpc("delivery_handover_record", {
    p_do_id: id,
    p_kind: parsed.data.kind,
    p_receiver_name: parsed.data.receiverName ?? null,
    p_vehicle: parsed.data.vehicle ?? null,
    p_goods: goods,
    p_note: parsed.data.note ?? null,
    p_proof_path: parsed.data.proofPath ?? null,
    p_unit_codes: parsed.data.unitCodes ?? null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ event: data }, 201);
});

// POST /:id/outbound-prep — record scanned / checked / packed for exact
// Units of one DO scope through the governed door (0424). Idempotent: a
// duplicate fact is reconciled, never doubled. Same actors as the handover.
deliveryOrdersRouter.post("/:id/outbound-prep", async (c) => {
  const actor = outboundActorOf(c);
  if (!actor) {
    return c.json({ error: "forbidden", message: "This act is not available to your role" }, 403);
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const id = c.req.param("id");

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_input", message: "Body must be valid JSON" }, 400);
  }
  const parsed = recordOutboundPrepInput.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return c.json(
      {
        error: "invalid_input",
        message: issue?.message ?? "invalid input",
        field: issue?.path.join(".") ?? "unknown",
      },
      422,
    );
  }

  const { data, error } = await sb.rpc("delivery_outbound_prep_record", {
    p_do_id: id,
    p_fact: parsed.data.fact,
    p_unit_codes: parsed.data.unitCodes,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ result: data }, 201);
});

// POST /:id/handover-proof/sign-upload — short-lived signed upload URL into
// the private proof-of-delivery bucket (the 0280 pattern). Server-generated
// key under handover/{do_id}/; the client can neither pick nor overwrite a
// path. Live documents only — a cancelled document has no handover.
deliveryOrdersRouter.post(
  "/:id/handover-proof/sign-upload",
  async (c) => {
    const actor = outboundActorOf(c);
    if (!actor) {
      return c.json({ error: "forbidden", message: "This act is not available to your role" }, 403);
    }
    const sb =
      actor.kind === "warehouse" ? adminClient(c.env) : userClient(c.env, c.var.auth.jwt);
    const id = c.req.param("id");

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_input", message: "Body must be valid JSON" }, 400);
    }
    const parsed = signHandoverProofUploadInput.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return c.json(
        {
          error: "invalid_input",
          message: issue?.message ?? "invalid input",
          field: issue?.path.join(".") ?? "unknown",
        },
        422,
      );
    }

    const { data: doc, error } = await sb
      .from("ops_delivery_orders")
      .select("id, voided_at")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      const m = mapPgError(error);
      return c.json(m.body, m.status);
    }
    if (!doc) {
      return c.json({ error: "not_found", message: "Delivery order not found" }, 404);
    }
    if ((doc as { voided_at: string | null }).voided_at) {
      return c.json(
        { error: "delivery_order_voided", message: "This delivery order was cancelled" },
        409,
      );
    }

    // A warehouse login signs an upload only for a document whose recorded
    // scope holds a Unit at its own Site (the RPC re-checks the same fact).
    if (actor.kind === "warehouse") {
      const { data: scoped, error: scopeErr } = await sb
        .from("delivery_order_units")
        .select("item_id, ops_stock_items!inner(warehouse_id)")
        .eq("delivery_order_id", id)
        .eq("ops_stock_items.warehouse_id", c.var.auth.warehouseId as string)
        .limit(1);
      if (scopeErr) {
        const m = mapPgError(scopeErr);
        return c.json(m.body, m.status);
      }
      if (!scoped || scoped.length === 0) {
        return c.json(
          { error: "forbidden", message: "This delivery order has no Units at your warehouse" },
          403,
        );
      }
    }

    const ext =
      parsed.data.mimeType === "image/png"
        ? "png"
        : parsed.data.mimeType === "image/webp"
          ? "webp"
          : "jpg";
    const path = `handover/${id}/${crypto.randomUUID()}-handover.${ext}`;
    const admin = adminClient(c.env);
    const { data, error: signErr } = await admin.storage
      .from("proof-of-delivery")
      .createSignedUploadUrl(path);
    if (signErr) {
      return c.json({ error: "sign_upload_failed", message: signErr.message }, 500);
    }
    return c.json({ token: data.token, path: data.path });
  },
);

export default deliveryOrdersRouter;

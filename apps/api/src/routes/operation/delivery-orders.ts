import { Hono } from "hono";
import type { Context } from "hono";
import {
  attemptEvidenceInput,
  deliveryGroupOf,
  proofReviewInput,
  recordHandoverInput,
  recordOutboundPrepInput,
  signHandoverProofUploadInput,
  signedDoAttachInput,
  signedDeliveryDocumentOf,
  unitIdOf,
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
 *   GET  /:id/signed-document
 *                    — a short-lived signed VIEW url for the signed Delivery
 *                      Order on file (`orders.do_file_path`), so the
 *                      register's Driver submission column can open the paper
 *                      the customer signed. READ-ONLY, signed on demand: a
 *                      list that pre-signed every row would hand out hundreds
 *                      of expiring urls nobody clicks.
 *
 * A register finds documents; work lives in My Work / Team Work — so nothing
 * here computes an owner, an action or a due date. Status is NOT computed
 * server-side either: the ONE arithmetic is `deliveryOrderStatusOf` in
 * packages/shared (Law D), and the web calls it over the facts this route
 * returns.
 */
const deliveryOrdersRouter = new Hono<AppEnv>();

/** The order fields the register's columns print — nothing more. The 2026-09-06
 *  register correction added the proof facts its WORK TO DO rail counts
 *  (`do_file_path`, the T6 photo ledger) and the trip's goods lines for the
 *  read-only ▸ expansion. All are existing canonical columns, read as-is.
 *
 *  `customer_address` joined 2026-09-14 with the one address reading: without
 *  it `Delivery Location` can only see the two structured columns, and a
 *  document issued for one of the 46 written-address orders would print
 *  `Not recorded` beside a Monitor row printing `Puchong, Selangor`. It is the
 *  same canonical column the single-document read below already selects, on the
 *  same route and the same role — no new permission and no new table. */
const ORDER_EMBED =
  "orders!inner(id, so, customer_name, customer_address, customer_address_city, customer_address_state, delivery_date, delivery_date_tbd, do_number, do_file_path, do_uploaded_at, delivery_stops, order_lines(id, sku, qty, attrs), ops_order_control(delivery_photos))";

/**
 * §6.1 (0489) — the proof reviews and the attempt evidence of a set of
 * documents. Both are append-only records the web's ONE arithmetic
 * (`proofReviewStateOf`) reads; nothing is judged here. A missing relation
 * (the Worker deployed a moment before the migration applied) reads as no
 * records, never as a failed register; any other error is a failure.
 */
type SbLike = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
async function readProofRecords(
  sb: SbLike,
  numbers: string[],
): Promise<
  | { ok: true; proofReviews: unknown[]; attemptEvidence: unknown[] }
  | { ok: false; error: string; message: string }
> {
  if (numbers.length === 0) return { ok: true, proofReviews: [], attemptEvidence: [] };
  const absent = (e: { code?: string } | null) => e?.code === "42P01";
  const [reviews, evidence] = await Promise.all([
    sb
      .from("delivery_proof_reviews")
      .select("id, order_id, do_number, attempt_id, decision, reason, reviewed_by, reviewed_at")
      .in("do_number", numbers),
    sb
      .from("delivery_attempt_evidence")
      .select("id, attempt_id, order_id, do_number, path, kind, recorded_by, recorded_at")
      .in("do_number", numbers),
  ]);
  if (reviews.error && !absent(reviews.error)) {
    return { ok: false, error: "proof_reviews_read_failed", message: reviews.error.message };
  }
  if (evidence.error && !absent(evidence.error)) {
    return { ok: false, error: "attempt_evidence_read_failed", message: evidence.error.message };
  }
  return {
    ok: true,
    proofReviews: reviews.error ? [] : reviews.data ?? [],
    attemptEvidence: evidence.error ? [] : evidence.data ?? [],
  };
}

/** The bucket a bound file lives in: the signed paper rides `delivery-orders`
 *  (0087); every driver photo or video rides `proof-of-delivery` (0280). */
function evidenceBucketOf(kind: string): "delivery-orders" | "proof-of-delivery" {
  return kind === "document" ? "delivery-orders" : "proof-of-delivery";
}

deliveryOrdersRouter.get("/", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);

  // `?order=<uuid>` scopes the list to one Sales Order — the SO object page's
  // "its DOs" read. Same shape, same arithmetic, one implementation.
  const orderScope = c.req.query("order") ?? null;

  let query = sb
    .from("ops_delivery_orders")
    .select(
      `id, order_id, do_number, leg, issued_at, trip_groups, delivery_date, time_slot,
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
      .select("do_number, leg, result, reason_key, recorded_at")
      .in("do_number", numbers);
    if (res.error) {
      return c.json(
        { error: "delivery_attempts_read_failed", message: res.error.message },
        500,
      );
    }
    attempts = res.data ?? [];
  }

  // The §4 handover facts (0363) — the kind for the register's arithmetic
  // (Out for delivery derives from Received by Logistics) and its clock for
  // Monitor's `Collected {date} {time}` line (Delivery MASTER §8.4).
  const ids = (rows ?? []).map((r) => r.id);
  let handoverEvents: Array<{ delivery_order_id: string; kind: string; recorded_at: string | null }> = [];
  if (ids.length > 0) {
    const res = await sb
      .from("delivery_handover_events")
      .select("delivery_order_id, kind, recorded_at")
      .in("delivery_order_id", ids);
    if (res.error) {
      return c.json(
        { error: "handover_events_read_failed", message: res.error.message },
        500,
      );
    }
    handoverEvents = res.data ?? [];
  }

  // §6.1 (0489) — the review and evidence records the register's
  // `Check delivery proof` queue and Monitor's status line derive from.
  const proof = await readProofRecords(sb, numbers);
  if (!proof.ok) return c.json({ error: proof.error, message: proof.message }, 500);

  return c.json({
    deliveryOrders: rows ?? [],
    attempts,
    handoverEvents,
    proofReviews: proof.proofReviews,
    attemptEvidence: proof.attemptEvidence,
  });
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
      `id, order_id, do_number, leg, issued_at, trip_groups, delivery_date, time_slot,
       logistics_partner, voided_at, void_reason,
       orders!inner(id, so, customer_name, customer_phone, customer_emergency,
         customer_address, customer_address_city, customer_address_state,
         do_file_path, do_uploaded_at,
         pod_signature_url, pod_signed_by, pod_signed_at,
         do_number, delivery_stops,
         warehouse_id, warehouses(name),
         delivery_floor, delivery_has_lift, delivery_stair_items,
         building_type:entry_data->fields->>building_type,
         ops_order_control(customer_request, action_for_logistic),
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
      .select("id, do_number, leg, result, reason_key, note, where_goods, recorded_at, recorded_by")
      .eq("do_number", row.do_number)
      .order("recorded_at", { ascending: true }),
    sb
      .from("ops_sofa_loans")
      .select("id, item_id, do_number, status, loaned_at, returned_at, loan_note_no, ops_stock_items(unit_code, identity_scope)")
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
  // 0440 — every evidence file of every act, signed for viewing. Until the
  // migration lands the table may not exist; absence reads as no files,
  // never as a failure of the whole document.
  const evidenceByEvent = new Map<
    string,
    Array<{ path: string; kind: string; recorded_at: string; url: string | null }>
  >();
  try {
    const evidenceRes = await sb
      .from("delivery_handover_evidence")
      .select("event_id, path, kind, recorded_at")
      .eq("delivery_order_id", (row as { id: string }).id)
      .order("recorded_at", { ascending: true });
    if (!evidenceRes.error && (evidenceRes.data ?? []).length > 0) {
      const files = evidenceRes.data as Array<{
        event_id: string;
        path: string;
        kind: string;
        recorded_at: string;
      }>;
      const { data: signedFiles } = await admin.storage
        .from("proof-of-delivery")
        .createSignedUrls(files.map((f) => f.path), 3600);
      files.forEach((f, i) => {
        const list = evidenceByEvent.get(f.event_id) ?? [];
        list.push({
          path: f.path,
          kind: f.kind,
          recorded_at: f.recorded_at,
          url: signedFiles?.[i]?.signedUrl ?? null,
        });
        evidenceByEvent.set(f.event_id, list);
      });
    }
  } catch {
    /* absent ledger = no files */
  }
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
        evidence: evidenceByEvent.get(e.id as string) ?? [],
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
      .select("item_id, ops_stock_items!inner(unit_code, sku, identity_scope)")
      .eq("delivery_order_id", (row as { id: string }).id),
    sb
      .from("delivery_handover_event_units")
      .select("event_id, item_id, recorded_side, ops_stock_items!inner(unit_code, identity_scope)")
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
    ops_stock_items: {
      unit_code: string | null;
      sku: string | null;
      identity_scope: string | null;
    };
  }>).map((r) => ({
    item_id: r.item_id,
    // 0453 — the ONE resolver, so a counted row's technical key can never
    // reach a Delivery Order or the paper the customer signs.
    unit_code: unitIdOf({
      unitCode: r.ops_stock_items?.unit_code ?? null,
      identityScope: r.ops_stock_items?.identity_scope ?? null,
    }),
    sku: r.ops_stock_items?.sku ?? null,
  }));
  const handoverEventUnits = ((eventUnitsRes.data ?? []) as unknown as Array<{
    event_id: string;
    item_id: string;
    recorded_side: string;
    ops_stock_items: { unit_code: string | null; identity_scope: string | null };
  }>).map((r) => ({
    event_id: r.event_id,
    item_id: r.item_id,
    recorded_side: r.recorded_side,
    unit_code: unitIdOf({
      unitCode: r.ops_stock_items?.unit_code ?? null,
      identityScope: r.ops_stock_items?.identity_scope ?? null,
    }),
  }));

  // Card 16 (Delivery MASTER §9) — the object's seven sections read the facts
  // their owners hold: the scope's arrangement (0386), the two money records
  // the gate reads (0355 · 0362), the order's sibling documents, its Service
  // Cases and its append-only History. Every read is the owner's own table;
  // nothing is derived here.
  const legOfDoc = (row as { leg?: number | null }).leg ?? 0;
  const [arrangementRes, feRes, paRes, siblingsRes, casesRes, historyRes] = await Promise.all([
    sb
      .from("ops_delivery_arrangements")
      .select("id, leg, partner_id, confirmed_date, confirmed_time, expected_arrival, logistics_note, driver_name, vehicle, condo_registration, delivery_partners(id, name)")
      .eq("order_id", orderId)
      .eq("leg", legOfDoc)
      .maybeSingle(),
    sb.from("order_finance_exceptions").select("id, status, reason, opened_at, cleared_at").eq("order_id", orderId),
    sb.from("order_delivery_payment_approvals").select("id, status, request_reason, requested_at, decided_at, decision_reason").eq("order_id", orderId),
    sb.from("ops_delivery_orders").select("id, do_number, leg, issued_at, voided_at, void_reason").eq("order_id", orderId).order("issued_at", { ascending: true }),
    sb.from("service_cases").select("id, case_no, status_id, opened_at").eq("order_id", orderId),
    sb.from("order_history").select("id, text, by_role, occurred_at").eq("order_id", orderId).order("occurred_at", { ascending: true }).limit(200),
  ]);
  for (const r of [arrangementRes, feRes, paRes, siblingsRes, historyRes]) {
    if (r.error) return c.json({ error: "delivery_order_sections_read_failed", message: r.error.message }, 500);
  }
  /* Service Cases are another module's table; an unreadable one is stated as
     unknown by the page, never as "no cases". */
  const serviceCases = casesRes.error ? null : (casesRes.data ?? []);

  // §6.1 (0489) — the Evidence section: every file bound to the attempt it
  // proves, signed for viewing, and Operation's reviews with their reviewer.
  const proof = await readProofRecords(sb, [row.do_number]);
  if (!proof.ok) return c.json({ error: proof.error, message: proof.message }, 500);
  const evidenceRows = proof.attemptEvidence as Array<{
    id: string;
    attempt_id: string;
    path: string;
    kind: string;
    recorded_at: string;
    recorded_by: string | null;
  }>;
  const attemptEvidence = await Promise.all(
    evidenceRows.map(async (e) => {
      const { data: signed } = await admin.storage
        .from(evidenceBucketOf(e.kind))
        .createSignedUrl(e.path, 3600);
      return { ...e, url: signed?.signedUrl ?? null };
    }),
  );
  const reviewRows = proof.proofReviews as Array<{ reviewed_by: string | null }>;
  const reviewerIds = [...new Set(reviewRows.map((r) => r.reviewed_by).filter(Boolean))] as string[];
  const reviewerNames: Record<string, string> = {};
  if (reviewerIds.length > 0) {
    const usersRes = await sb.from("app_users").select("id, name, email").in("id", reviewerIds);
    for (const u of usersRes.data ?? []) {
      const rec = u as { id: string; name: string | null; email: string | null };
      reviewerNames[rec.id] = rec.name || rec.email || "";
    }
  }
  const proofReviews = reviewRows.map((r) => ({
    ...r,
    reviewed_by_name: r.reviewed_by ? reviewerNames[r.reviewed_by] ?? null : null,
  }));

  return c.json({
    deliveryOrder: row,
    attempts: attemptsRes.data ?? [],
    loans: loansRes.data ?? [],
    lineDescriptions,
    handoverEvents,
    scopeUnits,
    handoverEventUnits,
    proofReviews,
    attemptEvidence,
    arrangement: arrangementRes.data ?? null,
    financeExceptions: feRes.data ?? [],
    paymentApprovals: paRes.data ?? [],
    siblingDocuments: siblingsRes.data ?? [],
    serviceCases,
    history: historyRes.data ?? [],
  });
});

/**
 * §6.1 (0489) — the three review acts. The governed door
 * (`delivery_proof_review`) owns the role gate, the reason rule, the attempt
 * binding and the history line; this route only shapes the input and the
 * refusal words. Append-only: a later review supersedes, it never edits.
 */
deliveryOrdersRouter.post("/:id/proof-review", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const id = c.req.param("id");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_input", message: "Body must be valid JSON" }, 400);
  }
  const parsed = proofReviewInput.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return c.json(
      { error: "invalid_input", message: issue?.message ?? "invalid input", field: issue?.path.join(".") ?? "unknown" },
      422,
    );
  }
  const doc = await documentNumberOf(sb, id);
  if ("response" in doc) return doc.response(c);
  const { data, error } = await sb.rpc("delivery_proof_review", {
    p_do_number: doc.doNumber,
    p_attempt_id: parsed.data.attemptId ?? null,
    p_decision: parsed.data.decision,
    p_reason: parsed.data.reason ?? null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ review: data }, 201);
});

/**
 * §6.1 (0489) — bind files to the exact Delivery Visit they prove. Every path
 * must already sit in this order's own storage prefix (the sign-upload doors
 * mint those); the governed door refuses an attempt of another document.
 */
deliveryOrdersRouter.post("/:id/attempts/:attemptId/evidence", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const id = c.req.param("id");
  const attemptId = c.req.param("attemptId");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_input", message: "Body must be valid JSON" }, 400);
  }
  const parsed = attemptEvidenceInput.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return c.json(
      { error: "invalid_input", message: issue?.message ?? "invalid input", field: issue?.path.join(".") ?? "unknown" },
      422,
    );
  }
  const doc = await documentNumberOf(sb, id);
  if ("response" in doc) return doc.response(c);
  const prefixes = [`order/${doc.orderId}/`, `order-${doc.orderId}/`, `handover/${doc.id}/`];
  if (parsed.data.files.some((f) => !prefixes.some((p) => f.path.startsWith(p)))) {
    return c.json(
      { error: "invalid_input", message: "Evidence path does not belong to this delivery order" },
      422,
    );
  }
  const recorded: unknown[] = [];
  for (const f of parsed.data.files) {
    const { data, error } = await sb.rpc("delivery_attempt_evidence_record", {
      p_attempt_id: attemptId,
      p_path: f.path,
      p_kind: f.kind,
    });
    if (error) {
      const m = mapPgError(error);
      return c.json(m.body, m.status);
    }
    recorded.push(data);
  }
  return c.json({ evidence: recorded }, 201);
});

/**
 * §6.1 (Card 13) — the signed Delivery Order attached to a delivered or
 * partially delivered document WITHOUT re-recording the delivery. The
 * deliver-and-deduct door (`operation_attach_do_and_deliver`) stays the
 * order-wide act it always was; this one files the paper as evidence of the
 * latest recorded attempt and touches no status and no stock.
 */
deliveryOrdersRouter.post("/:id/signed-document", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const id = c.req.param("id");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_input", message: "Body must be valid JSON" }, 400);
  }
  const parsed = signedDoAttachInput.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return c.json(
      { error: "invalid_input", message: issue?.message ?? "invalid input", field: issue?.path.join(".") ?? "unknown" },
      422,
    );
  }
  const doc = await documentNumberOf(sb, id);
  if ("response" in doc) return doc.response(c);
  const paths = [parsed.data.doFilePath, ...(parsed.data.signaturePath ? [parsed.data.signaturePath] : [])];
  if (paths.some((p) => !p.startsWith(`order-${doc.orderId}/`))) {
    return c.json(
      { error: "invalid_input", message: "Signed document path does not belong to this order" },
      422,
    );
  }
  const { data, error } = await sb.rpc("delivery_signed_do_attach", {
    p_do_number: doc.doNumber,
    p_do_file_path: parsed.data.doFilePath,
    p_signed_by: parsed.data.signerName ?? null,
    p_signature_path: parsed.data.signaturePath ?? null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ attached: data }, 201);
});

/** Resolve a route param (row id, or `DO-…`) to the document's own facts. */
async function documentNumberOf(
  sb: SbLike,
  idOrNumber: string,
): Promise<
  | { id: string; doNumber: string; orderId: string }
  | { response: (c: Context<AppEnv>) => Response }
> {
  let query = sb.from("ops_delivery_orders").select("id, do_number, order_id");
  query = /^do-/i.test(idOrNumber)
    ? query.eq("do_number", idOrNumber.toUpperCase())
    : query.eq("id", idOrNumber);
  const { data, error } = await query.maybeSingle();
  if (error) {
    const m = mapPgError(error);
    return { response: (c) => c.json(m.body, m.status) };
  }
  if (!data) {
    return {
      response: (c) => c.json({ error: "not_found", message: "Delivery order not found" }, 404),
    };
  }
  const row = data as { id: string; do_number: string; order_id: string };
  return { id: row.id, doNumber: row.do_number, orderId: row.order_id };
}

/**
 * GET /:id/signed-document — the signed Delivery Order on file, signed for
 * VIEWING (the 0280 pattern: private bucket, Worker signs after its own role
 * gate). Read this DO's bound document evidence, or the legacy order mirror
 * only when its do_number matches. Missing paper answers `{ url: null }`;
 * a failed evidence read remains an error rather than an invented absence.
 */
deliveryOrdersRouter.get("/:id/signed-document", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const id = c.req.param("id");

  let query = sb
    .from("ops_delivery_orders")
    .select("id, do_number, orders!inner(id, do_number, do_file_path, do_uploaded_at)");
  query = /^do-/i.test(id) ? query.eq("do_number", id.toUpperCase()) : query.eq("id", id);
  const { data: row, error } = await query.maybeSingle();
  if (error) {
    return c.json({ error: "delivery_order_read_failed", message: error.message }, 500);
  }
  if (!row) {
    return c.json({ error: "not_found", message: "Delivery order not found" }, 404);
  }
  /* PostgREST may hand a to-one embed back as an object OR a one-row array,
     depending on how it reads the relationship - the register's own reader
     carries the same guard. */
  const embedded = (row as unknown as {
    orders:
      | { do_number: string | null; do_file_path: string | null; do_uploaded_at: string | null }
      | Array<{ do_number: string | null; do_file_path: string | null; do_uploaded_at: string | null }>
      | null;
  }).orders;
  const order = Array.isArray(embedded) ? embedded[0] ?? null : embedded;
  const { data: evidence, error: evidenceError } = await sb
    .from("delivery_attempt_evidence")
    .select("do_number, kind, path, recorded_at")
    .eq("do_number", row.do_number)
    .eq("kind", "document");
  if (evidenceError) return c.json({ error: "attempt_evidence_read_failed", message: evidenceError.message }, 500);
  const document = signedDeliveryDocumentOf({ documentNumber: row.do_number, order, evidence: evidence ?? [] });
  if (!document) return c.json({ url: null, uploadedAt: null });

  const admin = adminClient(c.env);
  const { data: signed, error: signErr } = await admin.storage
    .from("delivery-orders")
    .createSignedUrl(document.path, 3600);
  if (signErr) {
    return c.json({ error: "sign_failed", message: signErr.message }, 500);
  }
  return c.json({ url: signed?.signedUrl ?? null, uploadedAt: document.uploadedAt });
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

  // Proof binds to the exact event it proves (§6): every path must sit under
  // THIS document's own prefix — never another document's, never outside it.
  const evidencePaths = [
    ...(parsed.data.proofPath ? [parsed.data.proofPath] : []),
    ...(parsed.data.evidence ?? []).map((f) => f.path),
  ];
  if (evidencePaths.some((path) => !path.startsWith(`handover/${id}/`))) {
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
    p_evidence: parsed.data.evidence ?? null,
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
      {
        "image/png": "png",
        "image/webp": "webp",
        "image/jpeg": "jpg",
        "video/mp4": "mp4",
        "video/quicktime": "mov",
        "video/webm": "webm",
      }[parsed.data.mimeType] ?? "jpg";
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

import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  updateOpsOrderControlInput,
  confirmBookingInput,
  delayDecisionInput,
  signDeliveryPhotoUploadInput,
  attachDeliveryPhotoInput,
  type DeliveryPhoto,
  deliveryAttemptRecordInputSchema,
  isSundayIso,
  type BookingGateResult,
  partnerBookingWarnings,
  partnerDeliveryRules,
  myHolidaySet,
  type PartnerBookingWarning,
  type PartnerDeliveryRules,
  deliveryGroupLabel,
  deliveryScopeSentence,
  type DeliveryGroupKey,
  stockEtaImportInput,
  matchStockRows,
  aggregateStorageFeesByRef,
  aggregateBalancesByRef,
  loanSofaInput,
  borrowLoanInput,
  updateLoanInput,
  returnLoanInput,
  returnToSupplierInput,
  appendMissingLinesInput,
  detectMissingLines,
  type AppendOrderRef,
  type AppendMissingLinesResult,
  type MissingLineCandidate,
  type OrderLineRef,
  type StockEtaImportResult,
  type SofaLoanDto,
  type BalancePayStatus,
} from "@carres/shared";
import { loadBookingContext } from "../../lib/booking-context";
import {
  attemptDeliveryOrderIssue,
  todayIsoMYT,
} from "../../lib/delivery-order-issue";
import { requireDuty } from "../../lib/duties";
import { mapPgError } from "../../lib/route-helpers";
import { adminClient, userClient } from "../../lib/supabase";
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

/** The full overlay column list — ONE copy for GET / PUT / booking-confirm so
 *  the three responses can never drift apart. */
const CONTROL_COLUMNS =
  "order_id, stock_location, stock_eta, delivery_time_slot, customer_request, action_for_logistic, carres_remark, warehouse_remark, payment_status, balance, balance_due_date, storage_from, storage_to, storage_fee_override, storage_fee_msbf, storage_fee_sof, logistic_eta, paid_amount, storage_paid, storage_collected_at, storage_waiver_status, storage_waiver_reason, storage_waiver_requested_by, storage_waiver_decided_by, storage_waiver_decided_at, extension_original_date, extension_new_date, extension_reason, extension_note, extension_acknowledged_at, extended_at, extended_by, extension_count, contact_by_days, contact_by_task_at, line_locations, line_legs, line_etas, line_stock_status, line_received, called_customer, customer_confirmed, last_chased_at, assigned_staff, assigned_by, assigned_at, booking_stage, confirmed_date, confirmed_time_slot, confirmed_partner_id, customer_confirmed_at, customer_confirmed_by, delivery_photos, booking_groups, delivery_trips, delay_decision, delay_decision_eta, delay_decision_at, delay_decision_by, delay_decision_note, delay_detected_at, delay_detected_eta, updated_at, updated_by";

function requireOperationOrPrincipal(
  role: string,
): asserts role is "operation" | "principal" {
  if (role !== "operation" && role !== "principal") {
    throw new HTTPException(403, { message: "Operation or principal only" });
  }
}


/**
 * The goods + money sentences, phrased as WARNINGS.
 *
 * C7 moved the hard refusal onto issuing (`docs/ORDERS-WORKING-FLOW.md` §5), so
 * these no longer stop a confirmation. Decision A (owner ruling 2026-08-16)
 * then took money out of that refusal too — so the money sentence may WARN
 * that collection is open, but it may no longer claim the delivery order will
 * refuse: it will not. §8's surviving rule — agreeing a date WARNS about
 * money — is exactly this line.
 */
function bookingGateWarnings(gate: BookingGateResult): string[] {
  const out: string[] = [];
  if (!gate.goodsReady)
    out.push(
      `Goods not reserved to this order yet: ${gate.notReadySkus.join(", ")} — the delivery order cannot be issued until they are.`,
    );
  if (!gate.balanceReady) {
    // C9 — name WHICH money is missing. "RM 150 outstanding" on an order the
    // customer paid in full sends an operator hunting the wrong thing.
    const goods = gate.holding - gate.storageOwing;
    out.push(
      goods > 0 && gate.storageOwing > 0
        ? `RM ${goods.toFixed(2)} outstanding and RM ${gate.storageOwing.toFixed(2)} of storage fee not collected — collection is still open.`
        : gate.storageOwing > 0
          ? `Storage fee of RM ${gate.storageOwing.toFixed(2)} not collected — collection is still open.`
          : `RM ${gate.holding.toFixed(2)} outstanding — collection is still open.`,
    );
  }
  return out;
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
      CONTROL_COLUMNS,
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

  // Staff owner (0232): MANUAL assignment is management-only (Jess 2026-07-18);
  // staff sessions get a clean 403. The web hides the controls; this is the
  // enforcement. HR-P2 (0260): "management" = the `ops_manager` duty key.
  if ("assigned_staff" in parsed.data) {
    await requireDuty(c, "ops_manager", "Only management can assign or reassign the PIC");
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
      CONTROL_COLUMNS,
    )
    .single();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }

  return c.json({ control: data });
});

// POST /:id/booking/confirm — D1 Stage 2 (migration 0277): record the
// CUSTOMER's confirmed date + time slot. The gates — not the operator's
// judgement — decide whether a booking may confirm (frozen §7 Two-Stage
// Booking; the UI's disabled button is assistance, THIS is the enforcement):
//   * date + slot BOTH present (invariant #1 — zod here, CHECK in the DB)
//   * no Sunday (invariant #8 / frozen §4.7)
//   * goods ready + balance ready — server-computed from the same signals the
//     drawer badge reads, through the same shared bookingConfirmGate (no
//     second engine).
// Re-calling on a confirmed booking re-confirms: updates date/slot and
// re-stamps the evidence (a typo is fixed by confirming again, never by an
// un-confirm that would erase the customer's yes).
//
// T8 (2026-07-27, migration 0282) — an optional `deliverGroups` narrows the
// trip to the delivery groups the CUSTOMER agreed to take now. Omit it and the
// trip carries the whole order, exactly as before; that missing default is what
// "never auto-split" means here. The mattress + bed frame are ONE group, so no
// value of this field can send a mattress without its frame. When a split
// order books its follow-up trip through this same door, the previous trip is
// archived into delivery_trips instead of being overwritten away.
orderControlRouter.post("/:id/booking/confirm", async (c) => {
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
  const parsed = confirmBookingInput.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue && issue.path.length > 0 ? issue.path.join(".") : "<root>";
    return c.json(
      {
        error: "invalid_input",
        code: "invalid_param",
        message: `Invalid booking-confirm input at ${path}: ${issue?.message ?? "validation failed"}`,
      },
      422,
    );
  }
  const { confirmedDate, confirmedTimeSlot, deliverGroups } = parsed.data;
  if (isSundayIso(confirmedDate)) {
    return c.json(
      {
        error: "booking_sunday",
        code: "booking_sunday",
        message: "Sunday is not a delivery working day — pick another date",
      },
      422,
    );
  }

  const sb = userClient(c.env, auth.jwt);
  const loaded = await loadBookingContext(sb, idCheck.data, deliverGroups);
  if (!loaded.ok) return c.json(loaded.body, loaded.status);
  const { gate } = loaded.ctx;
  const controlRes = { data: loaded.ctx.control };
  // A scope naming a group this order does not have is a caller bug, not a
  // narrower trip — answer it separately so the message names the real problem
  // instead of reporting phantom unready goods.
  if (!gate.scopeValid) {
    return c.json(
      {
        error: "booking_scope",
        code: "booking_scope",
        message:
          `Cannot confirm the booking: this order has ` +
          `${gate.groups.length > 0 ? gate.groups.map((g) => deliveryGroupLabel(g.key)).join(" + ") : "no goods to deliver"}` +
          ` — it cannot be delivered as ${(deliverGroups ?? []).map(deliveryGroupLabel).join(" + ") || "nothing"}`,
      },
      422,
    );
  }
  // C7 — GOODS AND MONEY NO LONGER REFUSE A CONFIRMATION.
  //
  // `docs/ORDERS-WORKING-FLOW.md` §5: "AGREEING a date is softer than ISSUING
  // the document. Agreeing still WARNS about goods, money and the calendar, so
  // nobody promises a day the goods cannot make — but it does not refuse."
  // A date can be agreed with a customer while the goods and the money are
  // still coming; what may not happen is the PAPER existing for a trip that is
  // not allowed to run, and that is `POST /:id/delivery-order` below.
  //
  // What is still refused here is §5's own short list: date + slot both present
  // (zod, above) and no Sunday. The scope check above is a caller bug, not a
  // business gate.
  const gateWarnings = bookingGateWarnings(gate);

  // CARD 3 (owner ruling 2026-08-13, migration 0346) — AN APPOINTMENT NAMES THE
  // CARRIER IT WAS MADE WITH.
  //
  // The ruling keeps Assigned Logistics and the Confirmed Customer Appointment
  // as two truths, which only works if the appointment stores its own carrier:
  // reading the current assignment at render time makes a later reassignment
  // silently rewrite the company the customer's agreed day belongs to. So the
  // company is stamped HERE, once, and never re-read.
  //
  // Refusing with no assignment is not a new gate on the conversation — the
  // action engine already opens the booking call only once logistics is
  // assigned (`deliveryAction`: `if (!s.hasLogistics) return assign_logistics`),
  // and Rule 1 says assignment happens EARLY, long before this door. What is
  // refused is recording an appointment that cannot name who is driving.
  const assignedPartnerId =
    (loaded.ctx.order.ops_assigned_logistic ?? null) ||
    (loaded.ctx.order.delivery_partner_id ?? null);
  if (!assignedPartnerId) {
    return c.json(
      {
        error: "booking_no_logistics",
        code: "booking_no_logistics",
        message:
          "Assign a logistics company before confirming the delivery date — " +
          "a booking has to name who is delivering it",
      },
      422,
    );
  }

  // The trip's scope. NULL means "the whole order" — so a trip that happens to
  // carry every group is stored as NULL, keeping the common case identical to
  // pre-T8 rows and out of the split UI.
  const prev = controlRes.data as {
    booking_stage?: string | null;
    booking_groups?: string[] | null;
    confirmed_date?: string | null;
    confirmed_time_slot?: string | null;
    confirmed_partner_id?: string | null;
    customer_confirmed_at?: string | null;
    customer_confirmed_by?: string | null;
    delivery_trips?: unknown;
  } | null;
  const scope: DeliveryGroupKey[] | null =
    gate.waitingGroups.length > 0 ? gate.scope : null;

  // Archive the trip this confirmation REPLACES — but only when it is a
  // genuinely different trip. Re-confirming the same scope is the typo fix
  // 0277 designed for; archiving it would fill the ledger with noise.
  const prevScope = prev?.booking_groups ?? null;
  const scopeChanged =
    JSON.stringify(prevScope ?? null) !== JSON.stringify(scope ?? null);
  const hadTrip =
    prev?.booking_stage === "confirmed" && !!prev?.confirmed_date;
  const archive = Array.isArray(prev?.delivery_trips) ? prev.delivery_trips : [];
  const deliveryTrips =
    hadTrip && scopeChanged
      ? [
          ...archive,
          {
            groups: prevScope,
            date: prev?.confirmed_date ?? null,
            slot: prev?.confirmed_time_slot ?? null,
            // CARD 3 (0346) — the archived trip keeps the carrier it was agreed
            // with too. Without it the history cannot answer "who was that day
            // agreed with?" even in principle.
            partner_id: prev?.confirmed_partner_id ?? null,
            at: prev?.customer_confirmed_at ?? null,
            by: prev?.customer_confirmed_by ?? null,
          },
        ]
      : archive;

  const { data, error } = await sb
    .from("ops_order_control")
    .upsert(
      {
        order_id: idCheck.data,
        booking_stage: "confirmed",
        confirmed_date: confirmedDate,
        confirmed_time_slot: confirmedTimeSlot,
        confirmed_partner_id: assignedPartnerId,
        customer_confirmed_at: new Date().toISOString(),
        customer_confirmed_by: auth.id,
        booking_groups: scope,
        delivery_trips: deliveryTrips,
        updated_by: auth.id,
      },
      { onConflict: "order_id" },
    )
    .select(CONTROL_COLUMNS)
    .single();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }

  // T8 — a split is the fact an operator must be able to find later ("why did
  // only the bed set go?"). The 0282 trigger logs the scope CHANGE; this adds
  // the human sentence naming what is still owed. FAIL-SOFT (same door and
  // same rule as T4/T6): an audit hiccup must never undo a recorded booking.
  const sentence = deliveryScopeSentence(
    gate.scope,
    gate.groups.map((g) => g.key),
  );
  if (sentence) {
    await sb.rpc("operation_add_annotation", {
      p_order_id: idCheck.data,
      p_content: `Delivery split — ${sentence}`,
      p_tag: null,
    });
  }

  // T9 (0283) — what the carrier's own rules say about the date that was just
  // recorded. AFTER the write on purpose: these warn, they never block, so a
  // partner rule can never cost the customer their confirmed booking. An
  // API-only caller (or a browser on an older build) gets the same sentences
  // the pre-check shows, from the same shared engine.
  let partnerWarnings: PartnerBookingWarning[] = [];
  try {
    partnerWarnings = (await partnerBookingCheck(sb, idCheck.data, confirmedDate))
      .warnings;
  } catch {
    // Fail-soft, same rule as the T4/T6 activity writes: an advisory must never
    // turn a successful booking into an error.
    partnerWarnings = [];
  }

  // SLICE 2 — the system issues the delivery order itself the moment the last
  // requirement lands, and for most orders that moment is THIS confirmation
  // (goods reserve early, Finance exceptions are rare). FAIL-SOFT, the same
  // rule as the annotation and partner-check writes above: an issuance hiccup
  // must never undo or refuse the booking the operator just recorded — the
  // facts persist, and the next door (or the manual backstop) issues it.
  let deliveryOrder: { do_number: string | null; issued: boolean } | null = null;
  try {
    const attempt = await attemptDeliveryOrderIssue(sb, idCheck.data);
    if (attempt.outcome === "issued" || attempt.outcome === "already") {
      deliveryOrder = {
        do_number: attempt.doNumber,
        issued: attempt.outcome === "issued",
      };
    }
  } catch {
    // Not issued yet — the gate facts persist and the next door tries again.
  }

  // C7 — the goods/money sentences ride the SUCCESS response now. They are the
  // same figures the old 422 carried; what changed is that they no longer cost
  // the customer their confirmed date. `gateWarnings` is a new key, so an older
  // browser simply does not read it (the same degradation rule as
  // `partnerWarnings`). `deliveryOrder` (Slice 2) degrades the same way: set
  // only when the confirmation completed the gate and the system issued (or
  // found) the document.
  return c.json({ control: data, partnerWarnings, gateWarnings, deliveryOrder });
});

/**
 * POST /:id/delay-decision — C8 · record the Delay planning outcome
 * (Jess 2026-07-27; the specification is `docs/ORDERS-WORKING-FLOW.md` §3).
 *
 * **This endpoint IS the gate.** The supplier named a date later than the one we
 * sold; that is not yet a delay, because we may have the item in ready stock or
 * another supplier may cover it. Operations answers one question — *can we still
 * make the promised date?* — and only `new_date` opens
 * `Call {logistics} — arrange new delivery date`. **The customer is the last to
 * know, and only when we have tried and failed.**
 *
 * **THE PROMISED DATE IS NOT TOUCHED HERE, and nothing in this route can touch
 * it.** `orders.delivery_date` stays at what was sold (§3 stage 3): every
 * late / overdue / on-time figure measures against it, so a delay can never be
 * tidied away by pushing the date. The route writes five columns on the OVERLAY
 * and never opens `orders` at all — which is why `set_order_date`, the RPC that
 * exists to correct a date typed wrong at the counter, cannot be reached from
 * this flow even by accident.
 *
 * **The supplier date is validated, not trusted.** The client sends the factory
 * date the operator was looking at; the server refuses one this order does not
 * hold (`stock_eta` or any value in `line_etas`). A decision is a fact about ONE
 * supplier date (S4's rule — an event names the thing it was made about), so a
 * stale date fails CLOSED: the decision is stored, the engine sees it does not
 * match the current date, and Delay planning stays open. That is the safe
 * direction for a gate standing between a customer and a call they should not
 * receive.
 */
orderControlRouter.post("/:id/delay-decision", async (c) => {
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
  const parsed = delayDecisionInput.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue && issue.path.length > 0 ? issue.path.join(".") : "<root>";
    return c.json(
      {
        error: "invalid_input",
        code: "invalid_param",
        message: `Invalid delay-decision input at ${path}: ${issue?.message ?? "validation failed"}`,
      },
      422,
    );
  }
  const { decision, supplierEta, note } = parsed.data;

  const sb = userClient(c.env, auth.jwt);
  const { data: control, error: readErr } = await sb
    .from("ops_order_control")
    .select("stock_eta, line_etas")
    .eq("order_id", idCheck.data)
    .maybeSingle();
  if (readErr) {
    const m = mapPgError(readErr);
    return c.json(m.body, m.status);
  }

  // Every factory date this order actually holds. The overlay is the only place
  // a supplier date lives (`docs/ORDERS-WORKING-FLOW.md` §2), so this set is the
  // whole truth about what could be decided ABOUT.
  const known = new Set<string>();
  const stockEta = (control as { stock_eta?: string | null } | null)?.stock_eta;
  if (stockEta) known.add(stockEta);
  const lineEtas = (control as { line_etas?: Record<string, string> | null } | null)
    ?.line_etas;
  if (lineEtas && typeof lineEtas === "object")
    for (const v of Object.values(lineEtas)) if (v) known.add(String(v));

  if (!known.has(supplierEta)) {
    return c.json(
      {
        error: "delay_eta_unknown",
        code: "delay_eta_unknown",
        message:
          `This order has no supplier ready date of ${supplierEta}` +
          (known.size > 0
            ? ` — it holds ${[...known].sort().join(", ")}. Reload the order and decide again.`
            : ` — no supplier has given a ready date yet. Record the ready date first.`),
      },
      422,
    );
  }

  const { data, error } = await sb
    .from("ops_order_control")
    .upsert(
      {
        order_id: idCheck.data,
        delay_decision: decision,
        delay_decision_eta: supplierEta,
        delay_decision_at: new Date().toISOString(),
        delay_decision_by: auth.id,
        delay_decision_note: note ?? null,
        updated_by: auth.id,
      },
      { onConflict: "order_id" },
    )
    .select(CONTROL_COLUMNS)
    .single();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }

  // The decision is the one thing about this order a human will want to find
  // again months later ("why was the customer never told?"). The 0211 trigger
  // does not watch these columns, so the sentence is written here — FAIL-SOFT,
  // the same door and the same rule as T4/T6/C9: an audit hiccup must never
  // undo a decision the operator already made.
  await sb.rpc("operation_add_annotation", {
    p_order_id: idCheck.data,
    p_content:
      decision === "keep"
        ? `Delay planning — supplier ready ${supplierEta}, we can still make the promised date${note ? ` (${note})` : ""}`
        : `Delay planning — supplier ready ${supplierEta}, we cannot make the promised date${note ? ` (${note})` : ""}`,
    p_tag: null,
  });

  return c.json({ control: data });
});

/**
 * POST /:id/delivery-order — C7 · issue the delivery order (Jess 2026-07-27).
 *
 * **The whole card in one sentence:** the number was stamped by a DB trigger on
 * the DISPATCH transition (0098), which is a day too late to hand logistics the
 * paper they ask for the evening before — so the operator presses one button
 * once the customer's date is confirmed, and the SYSTEM produces the document.
 * Nobody authors a delivery order by hand (COPY-STANDARD's `Issue` verb: "the
 * SYSTEM produces a formal document", completion = "the document exists").
 *
 * **NO MIGRATION, and that was checked rather than assumed.** 0098's trigger
 * only fills `do_number` when it is NULL, so an order that already carries one
 * passes through it untouched: minting earlier cannot break dispatch for orders
 * that never take this path, which is exactly the condition the card set. The
 * trigger stays as the backstop for those.
 *
 * **The number is the LOCKED scheme** (`docNumber`, Jess 2026-07-19:
 * `DO-DDMMYY-NNNN`, tail seeded from the ORDER id so every paper of one order
 * shares it). Until now `orders.do_number` and the printed PDF disagreed — the
 * column got the trigger's `DO-000123` and the drawer's printer recomputed its
 * own number client-side. One number now, minted once, stored, and printed.
 *
 * **THIS IS THE HARD GATE** (`docs/ORDERS-WORKING-FLOW.md` §5). Goods reserved,
 * money collected, the date not a Sunday or a public holiday. It reads the same
 * `bookingConfirmGate` the confirm route reads, so the warning an operator saw
 * when agreeing the date and the refusal they meet here are the same sentence
 * about the same numbers.
 *
 * **Idempotent.** A second press returns the number already on the record
 * instead of minting a second one — a delivery order that changed its number
 * between two prints would be two documents for one trip.
 */
/**
 * CARD 5 (0344) — record a PARTIAL or FAILED delivery attempt. A full success
 * walks the existing gated delivery door, which mints its own attempt. The
 * RPC is the one writer: attempt + exception (Reason Library key + where the
 * goods are) + the unit moves (deliver = reserved-to-this-SO → sold; return =
 * release or the customer-return inspection hold) in one transaction. The
 * order STATUS is untouched — partial stays Scheduled; the Work engine
 * derives what happens next from the facts.
 */
orderControlRouter.post("/:id/delivery-attempt", async (c) => {
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
  const parsed = deliveryAttemptRecordInputSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue && issue.path.length > 0 ? issue.path.join(".") : "<root>";
    return c.json(
      {
        error: "invalid_input",
        code: "invalid_param",
        message: `Invalid delivery-attempt input at ${path}: ${issue?.message ?? "validation failed"}`,
      },
      422,
    );
  }

  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("delivery_attempt_record", {
    p_order_id: idCheck.data,
    p_result: parsed.data.result,
    p_reason_key: parsed.data.reasonKey,
    p_where_goods: parsed.data.whereGoods,
    p_note: parsed.data.note ?? null,
    p_delivered_item_ids: parsed.data.deliveredItemIds,
    p_returned: parsed.data.returned.map((r) => ({
      item_id: r.itemId,
      action: r.action,
      note: r.note ?? null,
    })),
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data, 201);
});

// CARD 5 — the attempt history for one order, oldest first, with unit outcomes.
orderControlRouter.get("/:id/delivery-attempts", async (c) => {
  const auth = c.var.auth;
  requireOperationOrPrincipal(auth.role);

  const idCheck = ORDER_ID.safeParse(c.req.param("id"));
  if (!idCheck.success) throw new HTTPException(404, { message: "Order not found" });

  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from("delivery_attempts")
    .select(
      "id, order_id, attempt_no, result, reason_key, where_goods, note, do_number, logistics_name, scheduled_date, recorded_by, recorded_at, delivery_attempt_units(item_id, outcome)",
    )
    .eq("order_id", idCheck.data)
    .order("attempt_no", { ascending: true });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ attempts: data ?? [] });
});

orderControlRouter.post("/:id/delivery-order", async (c) => {
  const auth = c.var.auth;
  requireOperationOrPrincipal(auth.role);

  const idCheck = ORDER_ID.safeParse(c.req.param("id"));
  if (!idCheck.success) throw new HTTPException(404, { message: "Order not found" });

  // SLICE 2 — the door is a BACKSTOP, not the trigger: the system issues the
  // document itself the moment the last requirement lands (booking confirm ·
  // stock reserve · finance clear). This POST remains for the rare order whose
  // last fact flipped through a path with no hook, and for a client asking for
  // the number it already knows exists. Same gate, same mint, same idempotence
  // — `attemptDeliveryOrderIssue` is the ONE issuing path.
  const sb = userClient(c.env, auth.jwt);
  const attempt = await attemptDeliveryOrderIssue(sb, idCheck.data);
  switch (attempt.outcome) {
    case "issued":
      return c.json({
        order: { id: idCheck.data, do_number: attempt.doNumber },
        issued: true,
      });
    case "already":
      return c.json({
        order: { id: idCheck.data, do_number: attempt.doNumber },
        issued: false,
      });
    case "blocked":
      return c.json(
        {
          error: "delivery_order_gate",
          code: "delivery_order_gate",
          message: `Cannot issue the delivery order: ${attempt.reasons.join(" ")}`,
        },
        422,
      );
    case "error":
      return c.json(attempt.body, attempt.status);
  }
});

// ── T9 · logistic partner rules (migration 0283) ────────────────────────────
// Four facts a carrier states about itself — working days, blackout dates,
// daily capacity, notice period — turned into a warning BEFORE a date is
// promised to a customer.
//
// It WARNS, it never blocks. The refusals (goods reserved · balance collected ·
// no Sunday) are about OUR obligations; a carrier's working pattern is not one
// of ours, and the carrier is reachable by phone. An operator who already rang
// NETS and got a yes must be able to record that yes — a refusal here would
// only teach staff to type a fake date.
//
// The warning text is composed by the SHARED engine, so the pre-check below and
// the confirm response say the same sentence (no second wording).

interface PartnerCheck {
  partner: { id: string; name: string } | null;
  rules: PartnerDeliveryRules | null;
  bookedOnDate: number | null;
  warnings: PartnerBookingWarning[];
}

/**
 * The order's carrier + how full its day already is + every rule this date
 * bends. Same partner precedence the list and the drawer already use
 * (`delivery_partner_id` first, else the Inbox-triaged `ops_assigned_logistic`)
 * — a second precedence would put a warning against a different carrier than
 * the column names.
 */
async function partnerBookingCheck(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  orderId: string,
  dateIso: string,
): Promise<PartnerCheck> {
  const empty: PartnerCheck = {
    partner: null,
    rules: null,
    bookedOnDate: null,
    warnings: [],
  };
  const { data: order } = await sb
    .from("orders")
    .select("id, delivery_partner_id, ops_assigned_logistic")
    .eq("id", orderId)
    .maybeSingle();
  const partnerId: string | null =
    order?.delivery_partner_id ?? order?.ops_assigned_logistic ?? null;
  // No carrier assigned yet ⇒ nobody to check the date against. Silence, not a
  // complaint: picking the carrier is a different step (Assign logistic).
  if (!partnerId) return empty;

  const { data: partner } = await sb
    .from("delivery_partners")
    .select("id, name, off_days, blackout_dates, daily_capacity, booking_lead_days")
    .eq("id", partnerId)
    .maybeSingle();
  if (!partner) return empty;

  const rules = partnerDeliveryRules({
    offDays: (partner.off_days as number[] | null) ?? undefined,
    blackoutDates: ((partner.blackout_dates as string[] | null) ?? []).map((d) =>
      String(d).slice(0, 10),
    ),
    dailyCapacity: (partner.daily_capacity as number | null) ?? null,
    bookingLeadDays: (partner.booking_lead_days as number | null) ?? 0,
  });

  // How full that day already is for this carrier. Counted only when the
  // partner actually states a limit — otherwise the number would be trivia
  // nobody reads, at the cost of a query on every keystroke.
  let bookedOnDate: number | null = null;
  if (rules.dailyCapacity != null) {
    const { data: sameDay } = await sb
      .from("ops_order_control")
      .select(
        "order_id, orders!inner(id, status, delivery_partner_id, ops_assigned_logistic)",
      )
      .eq("booking_stage", "confirmed")
      .eq("confirmed_date", dateIso);
    const rows = (sameDay ?? []) as {
      order_id: string;
      orders: {
        status?: string | null;
        delivery_partner_id?: string | null;
        ops_assigned_logistic?: string | null;
      } | null;
    }[];
    bookedOnDate = rows.filter((r) => {
      if (r.order_id === orderId) return false; // this order is not its own load
      const o = r.orders;
      if (!o) return false;
      if (o.status === "cancelled") return false;
      return (o.delivery_partner_id ?? o.ops_assigned_logistic ?? null) === partnerId;
    }).length;
  }

  return {
    partner: { id: partner.id as string, name: (partner.name as string) ?? "" },
    rules,
    bookedOnDate,
    warnings: partnerBookingWarnings({
      partnerName: (partner.name as string) ?? "the carrier",
      rules,
      dateIso,
      todayIso: todayIsoMYT(),
      bookedOnDate,
      holidays: myHolidaySet(),
    }),
  };
}

// GET /:id/booking/partner-check?date=YYYY-MM-DD — what this carrier says about
// this date, BEFORE the operator promises it to the customer.
orderControlRouter.get("/:id/booking/partner-check", async (c) => {
  const auth = c.var.auth;
  requireOperationOrPrincipal(auth.role);

  const idCheck = ORDER_ID.safeParse(c.req.param("id"));
  if (!idCheck.success) throw new HTTPException(404, { message: "Order not found" });

  const date = (c.req.query("date") ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json(
      {
        error: "invalid_input",
        code: "invalid_param",
        message: "date must be yyyy-mm-dd",
      },
      422,
    );
  }

  const sb = userClient(c.env, auth.jwt);
  const check = await partnerBookingCheck(sb, idCheck.data, date);
  return c.json(check);
});

// ── T6 delivery photo (migration 0280) ──────────────────────────────────────
// Every completed delivery has proof. Photos live in the PRIVATE
// `proof-of-delivery` bucket (0069) under `order/{order_id}/` — the partner
// POD flow keys on `{thread_id}/`, so the families never collide. The Worker
// signs upload AND view URLs with the SERVICE client after its own
// operation/principal gate: 0069's storage policies are partner-scoped and its
// read policy still names the pre-0121 'logistics' role, so user-JWT storage
// ops were never a working path for HQ here (same admin-signing pattern as
// partner/pod.ts's 2026-05-13 path + the 0279 rental signature upload).

/** The T6 gate: a delivery photo proves a delivery that HAPPENED — the order
 *  must read delivered before anything may be signed or attached. Same two
 *  signals the drawer's own delivered chip folds (orders.operation_stage /
 *  orders.status). Returns a Response to send, or null when the gate passes. */
async function refuseUnlessDelivered(
  c: Context<AppEnv>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  orderId: string,
): Promise<Response | null> {
  const { data: order, error } = await sb
    .from("orders")
    .select("id, status, operation_stage")
    .eq("id", orderId)
    .maybeSingle();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  if (!order) throw new HTTPException(404, { message: "Order not found" });
  const delivered =
    order.operation_stage === "delivered" || order.status === "delivered";
  if (!delivered) {
    return c.json(
      {
        error: "not_delivered",
        code: "not_delivered",
        message:
          "A delivery photo can only be attached once the order is delivered",
      },
      422,
    );
  }
  return null;
}

// POST /:id/delivery-photo/sign-upload — short-lived signed upload URL into
// the proof-of-delivery bucket, delivered orders only. Server-generated key;
// the client can neither pick nor overwrite a path.
orderControlRouter.post("/:id/delivery-photo/sign-upload", async (c) => {
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
  const parsed = signDeliveryPhotoUploadInput.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return c.json(
      {
        error: "invalid_input",
        code: "invalid_param",
        message: issue?.message ?? "invalid input",
        field: issue?.path.join(".") ?? "unknown",
      },
      422,
    );
  }

  const sb = userClient(c.env, auth.jwt);
  const refusal = await refuseUnlessDelivered(c, sb, idCheck.data);
  if (refusal) return refusal;

  const ext =
    parsed.data.mimeType === "image/png"
      ? "png"
      : parsed.data.mimeType === "image/webp"
        ? "webp"
        : "jpg";
  const path = `order/${idCheck.data}/${crypto.randomUUID()}-delivery.${ext}`;
  const admin = adminClient(c.env);
  const { data, error } = await admin.storage
    .from("proof-of-delivery")
    .createSignedUploadUrl(path);
  if (error) throw new HTTPException(500, { message: error.message });

  return c.json({ token: data.token, path: data.path });
});

// POST /:id/delivery-photo/attach — record an uploaded photo on the order's
// ledger. Append-only read-modify-write on the overlay row (one operator per
// order; same plain-table pattern as the rest of the overlay).
orderControlRouter.post("/:id/delivery-photo/attach", async (c) => {
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
  const parsed = attachDeliveryPhotoInput.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return c.json(
      {
        error: "invalid_input",
        code: "invalid_param",
        message: issue?.message ?? "invalid input",
        field: issue?.path.join(".") ?? "unknown",
      },
      422,
    );
  }
  // The path must sit under THIS order's own prefix — a photo can never be
  // attached across orders (and never point outside the order/ family).
  if (!parsed.data.path.startsWith(`order/${idCheck.data}/`)) {
    return c.json(
      {
        error: "invalid_input",
        code: "invalid_param",
        message: "Photo path does not belong to this order",
      },
      422,
    );
  }

  const sb = userClient(c.env, auth.jwt);
  const refusal = await refuseUnlessDelivered(c, sb, idCheck.data);
  if (refusal) return refusal;

  const { data: ctrl, error: ctrlErr } = await sb
    .from("ops_order_control")
    .select("delivery_photos")
    .eq("order_id", idCheck.data)
    .maybeSingle();
  if (ctrlErr) {
    const m = mapPgError(ctrlErr);
    return c.json(m.body, m.status);
  }
  const existing: DeliveryPhoto[] = Array.isArray(ctrl?.delivery_photos)
    ? (ctrl.delivery_photos as DeliveryPhoto[])
    : [];
  const entry: DeliveryPhoto = {
    path: parsed.data.path,
    at: new Date().toISOString(),
    by: auth.id,
  };

  const { data, error } = await sb
    .from("ops_order_control")
    .upsert(
      {
        order_id: idCheck.data,
        delivery_photos: [...existing, entry],
        updated_by: auth.id,
      },
      { onConflict: "order_id" },
    )
    .select(CONTROL_COLUMNS)
    .single();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }

  // T6 done-when: activity logs it. The 0211 trigger doesn't watch the overlay
  // ledger, so append through the existing SECURITY DEFINER annotation door —
  // FAIL-SOFT (supabase-js reports errors in the result; an audit hiccup must
  // never undo a recorded photo), same as the T4 postpone write.
  await sb.rpc("operation_add_annotation", {
    p_order_id: idCheck.data,
    p_content: "Delivery photo uploaded",
    p_tag: null,
  });

  return c.json({ control: data }, 201);
});

// GET /:id/delivery-photos — the ledger + a short-lived signed VIEW url per
// photo. No delivered gate on reads: an order with no photos just answers [].
orderControlRouter.get("/:id/delivery-photos", async (c) => {
  const auth = c.var.auth;
  requireOperationOrPrincipal(auth.role);

  const idCheck = ORDER_ID.safeParse(c.req.param("id"));
  if (!idCheck.success) throw new HTTPException(404, { message: "Order not found" });

  const sb = userClient(c.env, auth.jwt);
  const { data: ctrl, error } = await sb
    .from("ops_order_control")
    .select("delivery_photos")
    .eq("order_id", idCheck.data)
    .maybeSingle();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  const entries: DeliveryPhoto[] = Array.isArray(ctrl?.delivery_photos)
    ? (ctrl.delivery_photos as DeliveryPhoto[])
    : [];
  if (entries.length === 0) return c.json({ photos: [] });

  const admin = adminClient(c.env);
  const photos = await Promise.all(
    entries.map(async (e) => {
      const { data: signed } = await admin.storage
        .from("proof-of-delivery")
        .createSignedUrl(e.path, 3600);
      return { ...e, url: signed?.signedUrl ?? null };
    }),
  );
  return c.json({ photos });
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

// D2 (2026-08-06) — `POST /:id/receive-line` STOOD HERE and is DELETED.
//
// It booked units into `ops_stock_items` reserved to the SO and stamped
// `ops_order_control.line_received`, but it opened NO Receiving Session: no
// `warehouse_receipts` row, no `receiving_events` entry, and it never moved
// `purchase_order_lines.received_qty`. Two surfaces therefore recorded one
// physical act two different ways.
//
// Measured on production before removal: **used zero times** — `line_received`
// empty on all 65 control rows and 0 units reserved to an SO — while the
// Receiving Workspace had posted 3 sessions through `office_receive_post`.
//
// The route is deleted rather than left unrendered, because Purchasing's own C1
// ruling is that **a live route with no caller is a bypass one curl away**: an
// old tab now meets a loud 404 instead of quietly writing an untraceable
// receive. Receiving happens in ONE place — the Receiving Workspace.
//
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
      "id, order_id, source, category, item_id, do_number, status, loaned_at, returned_at, returned_to_supplier_at, supplier_id, borrowed_sku, borrowed_label, notes, out_route, out_partner_id, dispatched_at, arrived_warehouse_at, loan_note_no, loan_note_signed_at, supplier_return_due, supplier_return_ref, ops_stock_items(sku, condition, po_no), suppliers(name), delivery_partners(name)",
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
    delivery_partners?: { name?: string | null } | null;
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
    out_route:
      (row.out_route as SofaLoanDto["out_route"] | null) ?? "warehouse_customer",
    out_partner_id: (row.out_partner_id as string | null) ?? null,
    out_partner_name: row.delivery_partners?.name ?? null,
    dispatched_at: (row.dispatched_at as string | null) ?? null,
    arrived_warehouse_at: (row.arrived_warehouse_at as string | null) ?? null,
    loan_note_no: (row.loan_note_no as string | null) ?? null,
    loan_note_signed_at: (row.loan_note_signed_at as string | null) ?? null,
    supplier_return_due: (row.supplier_return_due as string | null) ?? null,
    supplier_return_ref: (row.supplier_return_ref as string | null) ?? null,
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
    // Rollback of the claim so the unit isn't left reserved behind a LOAN
    // marker with nothing behind it. Its result is CHECKED: postgrest-js
    // resolves `{ error }` instead of throwing, so an unread result meant a
    // failed rollback was invisible — and there is no sweeper (three crons,
    // none touches ops_stock_items), so the only thing that frees the unit is
    // a person who has to be told.
    const { error: rollbackErr } = await sb
      .from("ops_stock_items")
      .update({ status: "free", reserved_ref: null, updated_at: new Date().toISOString() })
      .eq("id", itemId);
    const m = mapPgError(loanErr);
    if (rollbackErr) {
      return c.json(
        {
          ...(m.body as object),
          strandedItemId: itemId,
          message: `The loan could not be recorded and the sofa is still held for this order. Release it on Stock → Reserved before trying again.`,
        },
        m.status,
      );
    }
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
    out_route: "warehouse_customer",
    out_partner_id: null,
    out_partner_name: null,
    dispatched_at: null,
    arrived_warehouse_at: null,
    loan_note_no: null,
    loan_note_signed_at: null,
    supplier_return_due: null,
    supplier_return_ref: null,
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
  const {
    supplierId,
    category,
    borrowedSku,
    borrowedLabel,
    doNumber,
    notes,
    outRoute,
    outPartnerId,
  } = parsed.data;
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
      // OUT leg (0242) — a supplier borrow defaults to shipping straight to the
      // customer unless the operator routes it via the warehouse.
      out_route: outRoute ?? "supplier_customer",
      out_partner_id: outPartnerId ?? null,
    })
    .select(
      "id, order_id, source, category, item_id, do_number, status, loaned_at, returned_at, returned_to_supplier_at, supplier_id, borrowed_sku, borrowed_label, notes, out_route, out_partner_id, dispatched_at, arrived_warehouse_at, loan_note_no, loan_note_signed_at, supplier_return_due, supplier_return_ref, suppliers(name), delivery_partners(name)",
    )
    .single();
  if (loanErr) {
    const m = mapPgError(loanErr);
    return c.json(m.body, m.status);
  }
  return c.json({ loan: mapLoanRow(loan) });
});

// POST /:id/loan-update — edit an existing loan's logistics-leg fields (0242):
// change the OUT route, (re)assign the OUT logistic, or set/clear the supplier
// return-by override. Only the provided fields are touched (RLS bounds it to the
// caller's order).
orderControlRouter.post("/:id/loan-update", async (c) => {
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
  const parsed = updateLoanInput.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", code: "invalid_param", message: "Invalid loan update" },
      422,
    );
  }
  const { loanId, outRoute, outPartnerId, supplierReturnDue } = parsed.data;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (outRoute !== undefined) patch.out_route = outRoute;
  if (outPartnerId !== undefined) patch.out_partner_id = outPartnerId;
  if (supplierReturnDue !== undefined) patch.supplier_return_due = supplierReturnDue;
  if (Object.keys(patch).length === 1) {
    return c.json(
      { error: "invalid_input", code: "invalid_param", message: "No fields to update" },
      422,
    );
  }

  const sb = userClient(c.env, auth.jwt);
  const { data: loan, error } = await sb
    .from("ops_sofa_loans")
    .update(patch)
    .eq("id", loanId)
    .eq("order_id", orderId)
    .select(
      "id, order_id, source, category, item_id, do_number, status, loaned_at, returned_at, returned_to_supplier_at, supplier_id, borrowed_sku, borrowed_label, notes, out_route, out_partner_id, dispatched_at, arrived_warehouse_at, loan_note_no, loan_note_signed_at, supplier_return_due, supplier_return_ref, ops_stock_items(sku, condition, po_no), suppliers(name), delivery_partners(name)",
    )
    .single();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ loan: mapLoanRow(loan) });
});

// POST /:id/loan-return — the swap at final delivery: mark the loan returned.
// CARD 6 (2026-08-11): a recovered WAREHOUSE loan unit goes to the INSPECTION
// hold (0341's door), never straight back to the sellable pool — the owner's
// rule is recovered → Warehouse inspection → Available / Hold, and a used
// loan mattress must be looked at before it can be sold again. The existing
// resolve door (`ops_stock_resolve_unit_hold`) then sends it back_to_stock or
// writes it off. A supplier borrow has no own unit; its piece goes back via
// /loan-return-supplier — a SEPARATE fact, deliberately.
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
  // Only a WAREHOUSE loan has an own-stock unit to recover; a supplier borrow
  // has item_id = null (the piece goes back to the supplier via a separate step).
  // CARD 6: the recovered unit enters the inspection hold through the governed
  // 0341 door — its LOAN ref moves into ref_history, and it reaches Available
  // only through `ops_stock_resolve_unit_hold` after somebody looked at it.
  if (loan.item_id) {
    const { error: holdErr } = await sb.rpc("ops_stock_hold_unit", {
      p_item_id: loan.item_id as string,
      p_reason: "inspection",
      p_note: "Loan recovered from customer — inspect before resale",
    });
    if (holdErr) {
      const m = mapPgError(holdErr);
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
  const { loanId, returnRef } = parsed.data;
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
    .update({
      returned_to_supplier_at: now,
      updated_at: now,
      ...(returnRef ? { supplier_return_ref: returnRef } : {}),
    })
    .eq("id", loanId)
    .is("returned_to_supplier_at", null);
  if (upErr) {
    const m = mapPgError(upErr);
    return c.json(m.body, m.status);
  }
  return c.json({ ok: true });
});

export default orderControlRouter;

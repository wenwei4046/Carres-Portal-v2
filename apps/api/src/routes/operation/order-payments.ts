import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  recordPaymentInputSchema,
  collectStorageInput,
  requestStorageWaiverInput,
  decideStorageWaiverInput,
  recordStorageExtensionInput,
  refundRequestInputSchema,
  refundDecideInputSchema,
  refundMarkPaidInputSchema,
  deliveryReasonLabel,
  docNumber,
  storageHold,
} from "@carres/shared";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Order payment LEDGER (balance job — Jess 2026-06-26 "complete all the balance
 * job"; migration 0184). The multi-entry replacement for the single
 * ops_order_control.paid_amount stopgap: one `order_payments` row per payment
 * received (goods, deposit, OR a storage-fee collection).
 *
 *   GET    /api/operation/orders/:id/payments       — list the ledger (newest first)
 *   POST   /api/operation/orders/:id/payments       — record one payment
 *   DELETE /api/operation/orders/:id/payments/:pid  — void a wrong entry (principal only)
 *
 * Storage collection + waiver + the delivery gate live in the SAME router
 * (storage collection is just a `kind:'storage'` payment) — see the storage
 * section below. Plain-table CRUD via PostgREST; RLS (migration 0184: internal
 * read, operation/principal write) is the security boundary, the inline role
 * guards are defence-in-depth + clean 403 messages.
 *
 * Mounted at `/operation/orders` in apps/api/src/index.ts (sibling of
 * orderControlRouter), so the paths above are absolute.
 */
const orderPaymentsRouter = new Hono<AppEnv>();

const ORDER_ID = z.string().uuid();
const PAYMENT_ID = z.string().uuid();

const PAYMENT_COLS =
  "id, order_id, amount, paid_on, method, kind, reference, receipt_no, receipt_url, note, recorded_by, created_at, counted_in_paid, voided_at, voided_by, void_reason";

function requireOperationOrPrincipal(
  role: string,
): asserts role is "operation" | "principal" {
  if (role !== "operation" && role !== "principal") {
    throw new HTTPException(403, { message: "Operation or principal only" });
  }
}

// GET /:id/payments — the full ledger for one order, newest first.
orderPaymentsRouter.get("/:id/payments", async (c) => {
  const auth = c.var.auth;
  requireOperationOrPrincipal(auth.role);

  const idCheck = ORDER_ID.safeParse(c.req.param("id"));
  if (!idCheck.success) throw new HTTPException(404, { message: "Order not found" });

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("order_payments")
    .select(PAYMENT_COLS)
    .eq("order_id", idCheck.data)
    .order("paid_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ payments: data ?? [] });
});

// POST /:id/payments — record one payment through the ONE writer (CARD 4,
// 0343): the ledger row and the `orders.paid` bump are one transaction, so the
// figure every gate reads moves the moment the desk records the money. The
// receipt number is the LOCKED document scheme (RC-DDMMYY-NNNN, seeded so a
// reprint matches), minted by the one TS helper and handed to the RPC.
orderPaymentsRouter.post("/:id/payments", async (c) => {
  const auth = c.var.auth;
  requireOperationOrPrincipal(auth.role);

  const idCheck = ORDER_ID.safeParse(c.req.param("id"));
  if (!idCheck.success) throw new HTTPException(404, { message: "Order not found" });
  const orderId = idCheck.data;

  const parsed = await parseJsonBody(c, recordPaymentInputSchema);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await recordPayment(sb, orderId, {
    amount: parsed.data.amount,
    paidOn: parsed.data.paidOn,
    method: parsed.data.method,
    kind: parsed.data.kind,
    reference: parsed.data.reference,
    note: parsed.data.note,
    receiptUrl: parsed.data.receiptUrl,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  const out = data as { payment: unknown; orders_paid: number | null };
  return c.json({ payment: out.payment, ordersPaid: out.orders_paid }, 201);
});

// DELETE /:id/payments/:pid — VOID a mis-keyed entry. Principal only (a junior
// operator records; only the principal reverses), mirroring the waiver gate.
// CARD 4 (0343): a void is a STAMP, never a delete — the row survives with
// voided_at/by, and the RPC reverses exactly the orders.paid contribution the
// record made. The wire contract ({ok:true}) is unchanged.
orderPaymentsRouter.delete("/:id/payments/:pid", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "principal") {
    throw new HTTPException(403, { message: "Principal only" });
  }

  const idCheck = ORDER_ID.safeParse(c.req.param("id"));
  const pidCheck = PAYMENT_ID.safeParse(c.req.param("pid"));
  if (!idCheck.success || !pidCheck.success) {
    throw new HTTPException(404, { message: "Payment not found" });
  }

  const sb = userClient(c.env, auth.jwt);
  const { error } = await sb.rpc("payment_void", {
    p_payment_id: pidCheck.data,
    p_reason: null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ ok: true });
});

// ── Refunds (SO V2 CARD 7, 0345) — bilateral money's second direction ────────
// requested → approved | rejected (PRINCIPAL only, the waiver-decide law) →
// paid. An approved, unpaid refund means Carres still owes the customer; the
// payout never touches orders.paid (money IN against goods) — it is its own
// record, and Card 8's derived completion reads it.

const REFUND_ID = z.string().uuid();
const REFUND_COLS =
  "id, order_id, amount, reason, status, requested_by, requested_at, decided_by, decided_at, decide_note, paid_at, paid_by, paid_method, paid_reference";

// GET /:id/refunds — the order's refund obligations, newest first.
orderPaymentsRouter.get("/:id/refunds", async (c) => {
  const auth = c.var.auth;
  requireOperationOrPrincipal(auth.role);
  const idCheck = ORDER_ID.safeParse(c.req.param("id"));
  if (!idCheck.success) throw new HTTPException(404, { message: "Order not found" });

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("order_refunds")
    .select(REFUND_COLS)
    .eq("order_id", idCheck.data)
    .order("requested_at", { ascending: false });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ refunds: data ?? [] });
});

// POST /:id/refunds — request one (operation/principal; amount + reason).
orderPaymentsRouter.post("/:id/refunds", async (c) => {
  const auth = c.var.auth;
  requireOperationOrPrincipal(auth.role);
  const idCheck = ORDER_ID.safeParse(c.req.param("id"));
  if (!idCheck.success) throw new HTTPException(404, { message: "Order not found" });

  const parsed = await parseJsonBody(c, refundRequestInputSchema);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("refund_request", {
    p_order_id: idCheck.data,
    p_amount: parsed.data.amount,
    p_reason: parsed.data.reason,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ refund: data }, 201);
});

// POST /:id/refunds/:rid/decide — THE PRINCIPAL ONLY.
orderPaymentsRouter.post("/:id/refunds/:rid/decide", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "principal") {
    throw new HTTPException(403, { message: "Only a manager can decide a refund" });
  }
  const ridCheck = REFUND_ID.safeParse(c.req.param("rid"));
  if (!ridCheck.success) throw new HTTPException(404, { message: "Refund not found" });

  const parsed = await parseJsonBody(c, refundDecideInputSchema);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("refund_decide", {
    p_refund_id: ridCheck.data,
    p_decision: parsed.data.decision,
    p_note: parsed.data.note ?? null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ refund: data });
});

// POST /:id/refunds/:rid/paid — record the payout (approved → paid).
orderPaymentsRouter.post("/:id/refunds/:rid/paid", async (c) => {
  const auth = c.var.auth;
  requireOperationOrPrincipal(auth.role);
  const ridCheck = REFUND_ID.safeParse(c.req.param("rid"));
  if (!ridCheck.success) throw new HTTPException(404, { message: "Refund not found" });

  const parsed = await parseJsonBody(c, refundMarkPaidInputSchema);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("refund_mark_paid", {
    p_refund_id: ridCheck.data,
    p_method: parsed.data.method,
    p_reference: parsed.data.reference ?? null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ refund: data });
});

// ── Storage collection + waiver (collect-before-delivery gate, 0184) ─────────
const CONTROL_GATE_COLS =
  "order_id, storage_collected_at, storage_waiver_status, storage_waiver_reason, storage_waiver_requested_by, storage_waiver_decided_by, storage_waiver_decided_at, storage_paid, updated_at";

// POST /:id/storage/collect — record a storage-fee collection. It's a
// `kind:'storage'` ledger row (so it issues a receipt + rolls into the
// storageCollected summary) AND it stamps storage_collected_at, which opens the
// delivery gate. Two writes (not atomic): the payment is the source of truth;
// the stamp is the gate flag. Operation/principal.
orderPaymentsRouter.post("/:id/storage/collect", async (c) => {
  const auth = c.var.auth;
  requireOperationOrPrincipal(auth.role);

  const idCheck = ORDER_ID.safeParse(c.req.param("id"));
  if (!idCheck.success) throw new HTTPException(404, { message: "Order not found" });
  const orderId = idCheck.data;

  const parsed = await parseJsonBody(c, collectStorageInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);

  const sb = userClient(c.env, auth.jwt);

  // CARD 4 (0343): the ledger row AND the gate stamp are one transaction inside
  // the one writer — the two-write race this route used to carry is gone.
  const { data, error: payErr } = await recordPayment(sb, orderId, {
    amount: parsed.data.amount,
    paidOn: parsed.data.paidOn,
    method: parsed.data.method,
    kind: "storage",
    reference: parsed.data.reference,
    note: parsed.data.note,
    receiptUrl: parsed.data.receiptUrl,
  });
  if (payErr) {
    const m = mapPgError(payErr);
    return c.json(m.body, m.status);
  }

  const { data: control, error: ctrlErr } = await sb
    .from("ops_order_control")
    .select(CONTROL_GATE_COLS)
    .eq("order_id", orderId)
    .maybeSingle();
  if (ctrlErr) {
    const m = mapPgError(ctrlErr);
    return c.json(m.body, m.status);
  }

  const out = data as { payment: unknown };
  return c.json({ payment: out.payment, control }, 201);
});

// POST /:id/storage/waiver/request — operator asks to waive the storage fee
// (reason mandatory). Sets status 'requested' + clears any prior decision so a
// fresh request goes back to the principal. Operation/principal.
orderPaymentsRouter.post("/:id/storage/waiver/request", async (c) => {
  const auth = c.var.auth;
  requireOperationOrPrincipal(auth.role);

  const idCheck = ORDER_ID.safeParse(c.req.param("id"));
  if (!idCheck.success) throw new HTTPException(404, { message: "Order not found" });

  const parsed = await parseJsonBody(c, requestStorageWaiverInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("ops_order_control")
    .upsert(
      {
        order_id: idCheck.data,
        storage_waiver_status: "requested",
        storage_waiver_reason: parsed.data.reason,
        storage_waiver_requested_by: auth.id,
        storage_waiver_decided_by: null,
        storage_waiver_decided_at: null,
        updated_by: auth.id,
      },
      { onConflict: "order_id" },
    )
    .select(CONTROL_GATE_COLS)
    .single();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ control: data });
});

// POST /:id/storage/waiver/decide — THE MANAGER ONLY (role `principal`).
// Jess 2026-07-27 (card C9): an uncollected storage fee holds the goods, and
// the only way past it is the manager — nobody else. Defence in depth: the
// migration-0184 RLS keeps writes to operation/principal, and this route
// narrows the DECIDE to principal.
//
// THREE outcomes, and the two releasing ones are separate because a release
// must never quietly forgive money:
//
//   released → storage_waiver_status 'approved'. The hold lifts. The fee stays
//              owed, so `Collect RM …` stays on the worklist.
//   waived   → the same, PLUS storage_fee_override = 0 — the write-off
//              instrument every storage reader already honours. The keyed
//              `storage_fee_msbf` / `_sof` are untouched, so the figure that
//              was written off is still on the record.
//   rejected → 'rejected'. The hold stays; collect the fee.
//
// The amount is written into the order's activity as a sentence, because the
// override alone cannot say what it replaced (the 0211 trigger does not watch
// that column). FAIL-SOFT, like /storage/extend: an audit line must never undo
// a decision the manager already made.
orderPaymentsRouter.post("/:id/storage/waiver/decide", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "principal") {
    throw new HTTPException(403, {
      message: "Only a manager can release a delivery held for a storage fee",
    });
  }

  const idCheck = ORDER_ID.safeParse(c.req.param("id"));
  if (!idCheck.success) throw new HTTPException(404, { message: "Order not found" });
  const orderId = idCheck.data;

  const parsed = await parseJsonBody(c, decideStorageWaiverInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const decision = parsed.data.decision;

  const sb = userClient(c.env, auth.jwt);

  // Read the fee BEFORE the write, so the audit sentence can name what was
  // released or written off. Best-effort: a read failure must not stop a
  // decision the manager is entitled to make.
  const fee = await storageFeeOf(sb, orderId);

  const patch: Record<string, unknown> = {
    storage_waiver_status: decision === "rejected" ? "rejected" : "approved",
    storage_waiver_decided_by: auth.id,
    storage_waiver_decided_at: new Date().toISOString(),
    updated_by: auth.id,
  };
  // The write-off. Only on `waived` — `released` deliberately leaves the fee
  // exactly where it was.
  if (decision === "waived") patch.storage_fee_override = 0;

  // Update an existing overlay row only — there's nothing to decide if no
  // release was ever requested. (note is accepted for API symmetry; there's no
  // decision-note column yet — see the plan's approvals-inbox follow-up.)
  const { data, error } = await sb
    .from("ops_order_control")
    .update(patch)
    .eq("order_id", orderId)
    .select(CONTROL_GATE_COLS)
    .maybeSingle();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  if (!data) {
    return c.json(
      {
        error: "not_found",
        code: "no_waiver",
        message: "No storage release to decide on this order",
      },
      404,
    );
  }

  const amount = fee != null ? `RM ${fee.toLocaleString()}` : "the storage fee";
  const line =
    decision === "released"
      ? `Delivery released by manager — ${amount} storage fee still owed`
      : decision === "waived"
        ? `Delivery released by manager — ${amount} storage fee written off`
        : `Storage release refused — ${amount} to collect before delivery`;
  await sb.rpc("operation_add_annotation", {
    p_order_id: orderId,
    p_content: line,
    p_tag: null,
  });

  return c.json({ control: data, decision });
});

/** The chargeable storage fee on one order, through the ONE shared rule — used
 *  only to write a truthful audit sentence. Returns null when it cannot be
 *  read; the caller then says "the storage fee" rather than a wrong number. */
async function storageFeeOf(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  orderId: string,
): Promise<number | null> {
  try {
    const [ctrlRes, linesRes] = await Promise.all([
      sb
        .from("ops_order_control")
        .select(
          "storage_from, storage_fee_override, storage_fee_msbf, storage_fee_sof, storage_collected_at, storage_waiver_status",
        )
        .eq("order_id", orderId)
        .maybeSingle(),
      sb.from("order_lines").select("sku").eq("order_id", orderId),
    ]);
    const ctrl = ctrlRes?.data ?? null;
    if (!ctrl) return null;
    return storageHold({
      storageFrom: ctrl.storage_from ?? null,
      override: ctrl.storage_fee_override ?? null,
      importedMsbf: ctrl.storage_fee_msbf ?? null,
      importedSof: ctrl.storage_fee_sof ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      skus: (linesRes?.data ?? []).map((l: any) => String(l.sku)),
      asOf: new Date().toISOString().slice(0, 10),
      collectedAt: ctrl.storage_collected_at ?? null,
      waiverStatus: ctrl.storage_waiver_status ?? null,
    }).fee;
  } catch {
    return null;
  }
}

// ── Storage delivery-extension (the two Google Forms, Jess 2026-06-30) ───────
const CONTROL_EXTENSION_COLS =
  "order_id, extension_original_date, extension_new_date, extension_reason, extension_note, extension_acknowledged_at, extended_at, extended_by, extension_count, updated_at";

// POST /:id/storage/extend — record a one-time customer delivery-extension. The
// storage free-window basis (extension_original_date) is snapshotted from the
// order's CURRENT delivery_date on the FIRST extension and never overwritten, so
// the original basis survives the target date moving. ONE-TIME: operation may
// take extension_count 0 -> 1; a 2nd+ extension is principal-only (mirrors the
// waiver decide gate — Jess IS the principal, so it never gates him). The new
// requested date is recorded as extension_new_date only; the actual
// orders.delivery_date stays under its own RPC (set_order_date) — not touched
// here, so this endpoint has no side effect on dispatch/logistics scheduling.
orderPaymentsRouter.post("/:id/storage/extend", async (c) => {
  const auth = c.var.auth;
  requireOperationOrPrincipal(auth.role);

  const idCheck = ORDER_ID.safeParse(c.req.param("id"));
  if (!idCheck.success) throw new HTTPException(404, { message: "Order not found" });
  const orderId = idCheck.data;

  const parsed = await parseJsonBody(c, recordStorageExtensionInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);

  const sb = userClient(c.env, auth.jwt);

  // Read the current extension state (count + original-date snapshot) and the
  // order's delivery date (the basis to snapshot on the first extension).
  const { data: order, error: ordErr } = await sb
    .from("orders")
    .select("id, delivery_date, ops_order_control(extension_count, extension_original_date)")
    .eq("id", orderId)
    .maybeSingle();
  if (ordErr) {
    const m = mapPgError(ordErr);
    return c.json(m.body, m.status);
  }
  if (!order) throw new HTTPException(404, { message: "Order not found" });

  const ctrl = Array.isArray(order.ops_order_control)
    ? order.ops_order_control[0] ?? null
    : (order.ops_order_control as { extension_count?: number; extension_original_date?: string | null } | null);
  const count = ctrl?.extension_count ?? 0;

  // One-time gate: operation gets a single extension; a 2nd+ needs a principal.
  if (count >= 1 && auth.role !== "principal") {
    return c.json(
      {
        error: "rule_violation",
        code: "extension_used",
        message:
          "This order's one-time storage extension is already used — a further extension needs principal approval.",
      },
      403,
    );
  }

  // Snapshot the original delivery date once (first extension); keep it after.
  const originalDate = ctrl?.extension_original_date ?? order.delivery_date ?? null;
  const now = new Date().toISOString();

  const { data, error } = await sb
    .from("ops_order_control")
    .upsert(
      {
        order_id: orderId,
        extension_original_date: originalDate,
        extension_new_date: parsed.data.newDeliveryDate,
        // T4 Reason Library v1: the stored value is the structured KEY
        // (rides the existing 0196 text column — legacy rows keep their
        // old words and display as-is via deliveryReasonLabel).
        extension_reason: parsed.data.reasonKey,
        extension_note: parsed.data.note ?? null,
        extension_acknowledged_at: now,
        extended_at: now,
        extended_by: auth.id,
        extension_count: count + 1,
        updated_by: auth.id,
      },
      { onConflict: "order_id" },
    )
    .select(CONTROL_EXTENSION_COLS)
    .single();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }

  // T4 done-when: the reason lands in activity history. The 0211 trigger does
  // not watch the extension columns, so append the fact through the existing
  // SECURITY DEFINER annotation door (the same feed the drawer's Activity tab
  // and the global feed merge). FAIL-SOFT — audit must never undo a recorded
  // extension, so an annotation error is swallowed.
  const newDateText = new Date(`${parsed.data.newDeliveryDate}T00:00:00`).toLocaleDateString(
    "en-GB",
    { day: "numeric", month: "short", year: "2-digit" },
  );
  const reasonText = deliveryReasonLabel(parsed.data.reasonKey);
  const noteText = parsed.data.note?.trim() ? ` — ${parsed.data.note.trim()}` : "";
  await sb.rpc("operation_add_annotation", {
    p_order_id: orderId,
    p_content: `Delivery postponed → ${newDateText} · ${reasonText}${noteText}`,
    p_tag: null,
  });

  return c.json({ control: data }, 201);
});

/** The next receipt number, on the LOCKED document scheme (Jess 2026-07-19:
 *  `PREFIX-DDMMYY-NNNN`, tail hashed from a stable seed — `docNumber`, the ONE
 *  helper). Seeded on `{orderId}:{seq}` so each payment of one order gets its
 *  own stable number and a reprint matches the original. `seq` counts EVERY
 *  ledger row including voided ones, so a number is never reused. The payment
 *  MASTER has required this scheme all along; the ledger held zero rows when
 *  the old `R{so}-{n}` spelling was retired (CARD 4, 2026-08-11). */
async function nextReceiptNo(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  orderId: string,
  paidOnIso: string,
  bump = 0,
): Promise<string> {
  const { count } = await sb
    .from("order_payments")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderId);
  const seq = (typeof count === "number" ? count : 0) + 1 + bump;
  return docNumber({
    prefix: "RC",
    date: paidOnIso,
    seed: `${orderId}:${seq}`,
    digits: 4,
  });
}

/**
 * Record one payment through the ONE writer, minting its receipt number and
 * RETRYING if that number is already taken (0347).
 *
 * `nextReceiptNo` seeds on `count + 1`, so two payments recorded into one order
 * in the same instant read the same count and mint the SAME number. Nothing
 * stopped that being stored until 0347's unique index — and an index without a
 * retry just converts a silent duplicate into a 500 at the till. The retry
 * bumps the sequence and asks again; three attempts is far past any real
 * collision on a desk where one operator records one payment at a time.
 */
async function recordPayment(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  orderId: string,
  args: {
    amount: number;
    paidOn: string;
    method: string;
    kind: "payment" | "deposit" | "storage";
    reference?: string | null;
    note?: string | null;
    receiptUrl?: string | null;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ data: any; error: any }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let last: { data: any; error: any } = { data: null, error: null };
  for (let attempt = 0; attempt < 3; attempt++) {
    const receiptNo = await nextReceiptNo(sb, orderId, args.paidOn, attempt);
    last = await sb.rpc("payment_record", {
      p_order_id: orderId,
      p_amount: args.amount,
      p_paid_on: args.paidOn,
      p_method: args.method,
      p_kind: args.kind,
      p_reference: args.reference ?? null,
      p_note: args.note ?? null,
      p_receipt_url: args.receiptUrl ?? null,
      p_receipt_no: receiptNo,
      p_counts_toward_paid: true,
    });
    // 23505 = the receipt number is taken. Anything else is the caller's answer.
    if (!last.error || last.error.code !== "23505") return last;
  }
  return last;
}

export default orderPaymentsRouter;

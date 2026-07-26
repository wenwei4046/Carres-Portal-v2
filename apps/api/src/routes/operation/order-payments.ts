import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  recordPaymentInputSchema,
  collectStorageInput,
  requestStorageWaiverInput,
  decideStorageWaiverInput,
  recordStorageExtensionInput,
  deliveryReasonLabel,
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
  "id, order_id, amount, paid_on, method, kind, reference, receipt_no, receipt_url, note, recorded_by, created_at";

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

// POST /:id/payments — record one payment. Generates a human-friendly receipt
// number (R{so}-{n}) so a printed receipt is traceable; recorded_by comes from
// the JWT (never the body).
orderPaymentsRouter.post("/:id/payments", async (c) => {
  const auth = c.var.auth;
  requireOperationOrPrincipal(auth.role);

  const idCheck = ORDER_ID.safeParse(c.req.param("id"));
  if (!idCheck.success) throw new HTTPException(404, { message: "Order not found" });
  const orderId = idCheck.data;

  const parsed = await parseJsonBody(c, recordPaymentInputSchema);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);

  const sb = userClient(c.env, auth.jwt);
  const receiptNo = await nextReceiptNo(sb, orderId);

  const { data, error } = await sb
    .from("order_payments")
    .insert({
      order_id: orderId,
      amount: parsed.data.amount,
      paid_on: parsed.data.paidOn,
      method: parsed.data.method,
      kind: parsed.data.kind,
      reference: parsed.data.reference ?? null,
      note: parsed.data.note ?? null,
      // Customer proof-of-payment slip (Balance v3) — a storage path or https
      // receipt URL. Lands on redeploy; the live schema strips the input key.
      receipt_url: parsed.data.receiptUrl ?? null,
      receipt_no: receiptNo,
      recorded_by: auth.id,
    })
    .select(PAYMENT_COLS)
    .single();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ payment: data }, 201);
});

// DELETE /:id/payments/:pid — void a mis-keyed entry. Principal only (a junior
// operator records; only the principal reverses), mirroring the waiver gate.
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
  const { error } = await sb
    .from("order_payments")
    .delete()
    .eq("id", pidCheck.data)
    .eq("order_id", idCheck.data);
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ ok: true });
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
  const receiptNo = await nextReceiptNo(sb, orderId);

  const { data: payment, error: payErr } = await sb
    .from("order_payments")
    .insert({
      order_id: orderId,
      amount: parsed.data.amount,
      paid_on: parsed.data.paidOn,
      method: parsed.data.method,
      kind: "storage",
      reference: parsed.data.reference ?? null,
      note: parsed.data.note ?? null,
      // Customer proof-of-payment slip (Balance v3) — a storage path or https
      // receipt URL. Lands on redeploy; the live schema strips the input key.
      receipt_url: parsed.data.receiptUrl ?? null,
      receipt_no: receiptNo,
      recorded_by: auth.id,
    })
    .select(PAYMENT_COLS)
    .single();
  if (payErr) {
    const m = mapPgError(payErr);
    return c.json(m.body, m.status);
  }

  // Open the gate: stamp the collection time + keep the legacy "Paid?" flag in
  // sync. Sparse upsert creates the overlay row if the order has none yet.
  const { data: control, error: ctrlErr } = await sb
    .from("ops_order_control")
    .upsert(
      {
        order_id: orderId,
        storage_collected_at: new Date().toISOString(),
        storage_paid: "Paid",
        updated_by: auth.id,
      },
      { onConflict: "order_id" },
    )
    .select(CONTROL_GATE_COLS)
    .single();
  if (ctrlErr) {
    const m = mapPgError(ctrlErr);
    return c.json(m.body, m.status);
  }

  return c.json({ payment, control }, 201);
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

// POST /:id/storage/waiver/decide — PRINCIPAL ONLY. Approve opens the gate;
// reject closes it. Jess IS the principal, so this never gates him — it's the
// guardrail that stops a junior operator self-approving a waiver. Defence in
// depth: the migration-0184 RLS keeps writes to operation/principal, and this
// route narrows the DECIDE to principal.
orderPaymentsRouter.post("/:id/storage/waiver/decide", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "principal") {
    throw new HTTPException(403, { message: "Only a principal can decide a storage waiver" });
  }

  const idCheck = ORDER_ID.safeParse(c.req.param("id"));
  if (!idCheck.success) throw new HTTPException(404, { message: "Order not found" });

  const parsed = await parseJsonBody(c, decideStorageWaiverInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);

  const sb = userClient(c.env, auth.jwt);
  // Update an existing overlay row only — there's nothing to decide if no
  // waiver was ever requested. (note is accepted for API symmetry; there's no
  // decision-note column yet — see the plan's approvals-inbox follow-up.)
  const { data, error } = await sb
    .from("ops_order_control")
    .update({
      storage_waiver_status: parsed.data.decision,
      storage_waiver_decided_by: auth.id,
      storage_waiver_decided_at: new Date().toISOString(),
      updated_by: auth.id,
    })
    .eq("order_id", idCheck.data)
    .select(CONTROL_GATE_COLS)
    .maybeSingle();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  if (!data) {
    return c.json(
      { error: "not_found", code: "no_waiver", message: "No storage waiver to decide on this order" },
      404,
    );
  }
  return c.json({ control: data });
});

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

/** Build the next receipt number for an order: `R{so}-{n}` where n is the
 *  1-based count of existing payments. Falls back to the order id slice when
 *  the SO lookup is unavailable. Not UNIQUE-constrained, so a (very unlikely)
 *  concurrent-insert collision is cosmetic, never an error. */
async function nextReceiptNo(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  orderId: string,
): Promise<string> {
  const [{ data: order }, { count }] = await Promise.all([
    sb.from("orders").select("so").eq("id", orderId).maybeSingle(),
    sb
      .from("order_payments")
      .select("id", { count: "exact", head: true })
      .eq("order_id", orderId),
  ]);
  const seq = (typeof count === "number" ? count : 0) + 1;
  const label = order?.so != null ? String(order.so) : orderId.slice(0, 8);
  return `R${label}-${seq}`;
}

export default orderPaymentsRouter;

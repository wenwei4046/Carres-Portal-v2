import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  DELIVERY_REASONS,
  invoiceStorageSumOf,
  storageHold,
  storageObligation,
} from "@carres/shared";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { storageSkuCategories } from "../../lib/sku-categories";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * 0436 — the storage case (docs/payment/MASTER.md §6 · §7).
 *
 * Reads are internal (RLS enforces); the two writes go through the SQL
 * doors, which derive the start, snapshot the §7 rule, gate the extra-free
 * decision and append the order history fact. The route shapes requests and
 * maps errors; it decides nothing the SQL doors already decide.
 *
 * Mounted at `/api/finance/payment-storage`.
 */
const paymentStorageRouter = new Hono<AppEnv>();

const INTERNAL = ["operation", "finance", "principal", "warehouse"] as const;

paymentStorageRouter.get("/", async (c) => {
  const auth = c.var.auth;
  if (!INTERNAL.includes(auth.role as (typeof INTERNAL)[number])) {
    throw new HTTPException(403, { message: "You cannot view storage cases." });
  }
  const orderId = c.req.query("orderId");
  const sb = userClient(c.env, auth.jwt);
  // The approver resolves to a NAME — a stored id never reaches the screen
  // untranslated (COPY-STANDARD); §11 wants every waiver with its approver.
  let query = sb.from("payment_storage_cases")
    .select("*, approved_by_user:app_users!payment_storage_cases_approved_by_fkey(name)")
    .order("created_at", { ascending: false });
  if (orderId) {
    const check = z.string().uuid().safeParse(orderId);
    if (!check.success) throw new HTTPException(422, { message: "Bad order id." });
    query = query.eq("order_id", check.data);
  }
  const { data, error } = await query;
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  // 2026-09-08 boundary review — an order under the invoice model may still
  // carry a LEGACY C9 storage fee that no paper represents. The readers never
  // merge it into the paper figure and never let a voided paper fall back to
  // it, so it would otherwise be invisible on every screen: this endpoint
  // reports it, through the SAME shared composition the gate and Work use, so
  // the Storage section can say the honest sentence. Asked only for a single
  // order (the Storage section's own read).
  let unreconciledLegacy = 0;
  if (orderId) {
    const [ctrlRes, orderRes, invRes] = await Promise.all([
      sb.from("ops_order_control")
        .select("storage_from, storage_fee_override, storage_fee_msbf, storage_fee_sof, storage_collected_at, storage_waiver_status")
        .eq("order_id", orderId).maybeSingle(),
      sb.from("orders").select("paid, order_lines(sku, qty, unit_price), order_addons(qty, unit_price)")
        .eq("id", orderId).maybeSingle(),
      sb.from("invoices").select("kind, status, amount, tax_amount, voided_at")
        .eq("order_id", orderId),
    ]);
    const ctrl = (ctrlRes.data ?? null) as Record<string, unknown> | null;
    const ord = (orderRes.data ?? null) as {
      paid?: number | string | null;
      order_lines?: Array<{ sku: string; qty: number; unit_price: number | string | null }>;
      order_addons?: Array<{ qty: number; unit_price: number | string | null }>;
    } | null;
    if (ctrl && ord) {
      const skus = (ord.order_lines ?? []).map((l) => String(l.sku));
      const hold = storageHold({
        storageFrom: (ctrl.storage_from as string | null) ?? null,
        override: (ctrl.storage_fee_override as number | string | null) ?? null,
        importedMsbf: (ctrl.storage_fee_msbf as number | string | null) ?? null,
        importedSof: (ctrl.storage_fee_sof as number | string | null) ?? null,
        skus,
        categories: await storageSkuCategories(sb, skus),
        asOf: new Date().toISOString().slice(0, 10),
        collectedAt: (ctrl.storage_collected_at as string | null) ?? null,
        waiverStatus: (ctrl.storage_waiver_status as string | null) ?? null,
      });
      const price = (x: { qty: number; unit_price?: number | string | null }) =>
        Number(x.unit_price ?? 0) * Number(x.qty ?? 0);
      const invoiceRows = (invRes.data ?? []) as Parameters<typeof invoiceStorageSumOf>[0];
      unreconciledLegacy = storageObligation({
        invoiceStorageSum: invoiceStorageSumOf(invoiceRows),
        goodsTotal:
          (ord.order_lines ?? []).reduce((t, l) => t + price(l), 0) +
          (ord.order_addons ?? []).reduce((t, a) => t + price(a), 0),
        paid: ord.paid ?? null,
        legacyOwing: hold.owing,
        legacyReleased: hold.released,
      }).unreconciledLegacy;
    }
  }
  return c.json({ cases: data ?? [], unreconciledLegacy });
});

/**
 * The §6 `Request a later delivery date` submission (0451).
 *
 * The SQL door owns every refusal — no evidence, no acknowledgement, a past
 * date, no reason. This route adds the ONE thing SQL cannot know: that the
 * reason is a key from the governed Delivery Reason Library, and a
 * CUSTOMER-side one. §6 charges storage only for customer delay, so a request
 * blamed on a Carres-side cause is not a §6 request at all — it is a Carres
 * delay, and it never starts a clock. Accepting the key anyway would let a
 * second word list, and a second responsibility rule, grow here.
 */
const CUSTOMER_REASON_KEYS: readonly string[] = DELIVERY_REASONS
  .filter((r) => r.responsibility === "customer")
  .map((r) => r.key);

const laterDateInput = z.object({
  orderId: z.string().uuid(),
  requestedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reasonKey: z.string().trim().min(1),
  reasonDetail: z.string().trim().max(1000).nullish(),
  termsAcknowledged: z.boolean(),
  freeStorageRequested: z.boolean().default(false),
  evidenceUrl: z.string().trim().min(1, "Attach what the customer sent.").max(300),
});

paymentStorageRouter.get("/later-delivery-requests", async (c) => {
  const auth = c.var.auth;
  if (!INTERNAL.includes(auth.role as (typeof INTERNAL)[number])) {
    throw new HTTPException(403, { message: "You cannot view storage records." });
  }
  const orderId = c.req.query("orderId");
  if (!orderId || !z.string().uuid().safeParse(orderId).success) {
    return c.json({ error: "invalid_id", code: "invalid_param", message: "order id must be a uuid" }, 422);
  }
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("payment_delivery_date_requests")
    .select("id,order_id,requested_date,reason_key,reason_detail,terms_acknowledged,free_storage_requested,evidence_url,recorded_by,recorded_at")
    .eq("order_id", orderId)
    .order("recorded_at", { ascending: false });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ requests: data ?? [] });
});

paymentStorageRouter.post("/later-delivery-request", async (c) => {
  const parsed = await parseJsonBody(c, laterDateInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  if (!CUSTOMER_REASON_KEYS.includes(parsed.data.reasonKey)) {
    return c.json({
      error: "invalid_param", code: "reason_not_customer_side",
      message: "Choose a customer reason. A Carres-side delay never starts the storage clock.",
    }, 422);
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("payment_record_delivery_date_request", {
    p_order_id: parsed.data.orderId,
    p_requested_date: parsed.data.requestedDate,
    p_reason_key: parsed.data.reasonKey,
    p_reason_detail: parsed.data.reasonDetail ?? null,
    p_terms_acknowledged: parsed.data.termsAcknowledged,
    p_free_storage_requested: parsed.data.freeStorageRequested,
    p_evidence_url: parsed.data.evidenceUrl,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ request: data }, 201);
});

const startInput = z.object({
  orderId: z.string().uuid(),
  productGroup: z.enum(["mattress_bedframe", "sofa"]),
  readinessOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  customerDelayOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  witnessNote: z.string().trim().min(1, "The witness note is required.").max(1000),
  evidenceUrl: z.string().trim().max(300).nullish(),
});

paymentStorageRouter.post("/start", async (c) => {
  const parsed = await parseJsonBody(c, startInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("payment_storage_start", {
    p_order_id: parsed.data.orderId,
    p_product_group: parsed.data.productGroup,
    p_readiness_on: parsed.data.readinessOn,
    p_customer_delay_on: parsed.data.customerDelayOn,
    p_witness_note: parsed.data.witnessNote,
    p_evidence_url: parsed.data.evidenceUrl ?? null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ case: data }, 201);
});

const extraFreeInput = z.object({
  caseId: z.string().uuid(),
  freeUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().min(1, "The reason is required.").max(500),
  evidenceUrl: z.string().trim().min(1, "The written request evidence is required.").max(300),
});

paymentStorageRouter.post("/extra-free", async (c) => {
  const parsed = await parseJsonBody(c, extraFreeInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("payment_storage_extra_free", {
    p_case_id: parsed.data.caseId,
    p_free_until: parsed.data.freeUntil,
    p_reason: parsed.data.reason,
    p_evidence_url: parsed.data.evidenceUrl,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ case: data });
});

const chargeInput = z.object({
  caseId: z.string().uuid(),
});

// 0438 — commenced unbilled §7 periods become a Storage / Additional Storage
// Invoice through the 0429 lifecycle. The SQL door owns every decision.
paymentStorageRouter.post("/charge", async (c) => {
  const parsed = await parseJsonBody(c, chargeInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("payment_storage_invoice", {
    p_case_id: parsed.data.caseId,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data as Record<string, unknown>, 201);
});

const closeInput = z.object({
  caseId: z.string().uuid(),
  reason: z.string().trim().min(1, "The reason is required.").max(300),
});

// 0439 — the one closing door: the storage ended. A closed case refuses
// charging, extra-free decisions and reopening (trigger-guarded).
paymentStorageRouter.post("/close", async (c) => {
  const parsed = await parseJsonBody(c, closeInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("payment_storage_close", {
    p_case_id: parsed.data.caseId,
    p_reason: parsed.data.reason,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ case: data });
});

export default paymentStorageRouter;

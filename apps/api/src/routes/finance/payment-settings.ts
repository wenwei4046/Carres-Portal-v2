import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  paymentTemplateActiveInput,
  paymentTemplateKeyInput,
  paymentTemplateSaveInput,
} from "@carres/shared/payment-templates";
import { paymentMethodKeySchema, paymentMethodSaveInput } from "@carres/shared";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * 0431 — Settings → Payment (docs/payment/MASTER.md §12 · §16).
 *
 * Reads are internal (RLS enforces); every write goes through the manager-
 * gated SQL doors, which keep old/new/actor/time in payment_setting_changes.
 * The route shapes requests and maps errors; it decides nothing the SQL
 * doors already decide.
 *
 * Mounted at `/api/finance/payment-settings`.
 */
const paymentSettingsRouter = new Hono<AppEnv>();

const INTERNAL = ["operation", "finance", "principal"] as const;

paymentSettingsRouter.get("/", async (c) => {
  const auth = c.var.auth;
  if (!INTERNAL.includes(auth.role as (typeof INTERNAL)[number])) {
    throw new HTTPException(403, { message: "You cannot view Payment settings." });
  }
  const sb = userClient(c.env, auth.jwt);
  const [accounts, methods, rules, timing, changes] = await Promise.all([
    sb.from("payment_bank_accounts").select("*").order("route_source"),
    sb.from("payment_manual_methods").select("*").order("sort"),
    sb.from("payment_storage_rules").select("*")
      .order("product_group").order("effective_from", { ascending: false }),
    // 0486 — Collection timing, newest effective first (the head is current).
    sb.from("payment_collection_timing_rules").select("*")
      .order("effective_from", { ascending: false }).order("created_at", { ascending: false }),
    // 0486 — every change with its old/new, effective date, reason, actor and time.
    sb.from("payment_setting_changes")
      .select("id,what,old_value,new_value,reason,effective_from,changed_at,actor:app_users!payment_setting_changes_actor_id_fkey(name)")
      .order("changed_at", { ascending: false }).limit(100),
  ]);
  if (accounts.error || methods.error || rules.error || timing.error || changes.error) {
    throw new HTTPException(500, { message: "Payment settings could not be loaded. Try again." });
  }
  return c.json({
    bank_accounts: accounts.data ?? [],
    manual_methods: methods.data ?? [],
    storage_rules: rules.data ?? [],
    collection_timing: timing.data ?? [],
    setting_changes: changes.data ?? [],
    // The online payment provider is configured by secret, never by a form:
    // Settings SAYS whether the link journey can run; it never holds a key.
    online_provider: { name: "Stripe", configured: Boolean(c.env.STRIPE_SECRET_KEY) },
  });
});

const collectionTimingInput = z.object({
  askDaysBefore: z.number().int().min(0).max(60),
  deadlineDaysBefore: z.number().int().min(0).max(60),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().min(1, "A reason is required.").max(500),
}).refine((v) => v.askDaysBefore > v.deadlineDaysBefore, {
  message: "Asking must start earlier than the payment deadline.",
  path: ["askDaysBefore"],
});

/** 0486 — `Settings → Payments → Collection timing`. The SQL door is the
 *  manager gate, the ask-before-deadline rule and the change record. */
paymentSettingsRouter.post("/collection-timing", async (c) => {
  const auth = c.var.auth;
  if (!INTERNAL.includes(auth.role as (typeof INTERNAL)[number])) {
    throw new HTTPException(403, { message: "You cannot change Payment settings." });
  }
  const body = await parseJsonBody(c, collectionTimingInput);
  if (!body.ok) return c.json(body.body, body.status);
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("payment_set_collection_timing", {
    p_ask_days_before: body.data.askDaysBefore,
    p_deadline_days_before: body.data.deadlineDaysBefore,
    p_effective_from: body.data.effectiveFrom,
    p_reason: body.data.reason,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

const bankAccountInput = z.object({
  routeSource: z.enum(["pj_showroom", "dealer"]),
  bankName: z.string().trim().min(1).max(80),
  accountName: z.string().trim().max(120).nullish(),
  accountNo: z.string().trim().max(40).nullish(),
});

paymentSettingsRouter.post("/bank-account", async (c) => {
  const auth = c.var.auth;
  if (!INTERNAL.includes(auth.role as (typeof INTERNAL)[number])) {
    throw new HTTPException(403, { message: "You cannot change Payment settings." });
  }
  const body = await parseJsonBody(c, bankAccountInput);
  if (!body.ok) return c.json(body.body, body.status);
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("payment_set_bank_account", {
    p_route_source: body.data.routeSource,
    p_bank_name: body.data.bankName,
    p_account_name: body.data.accountName ?? null,
    p_account_no: body.data.accountNo ?? null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

// ---------------------------------------------------------------------------
// 0476 — the payment method registry. A method is a key a manager adds in
// Settings → Payment; its money account is chosen in the same act, so the
// ledger always knows where that money lands. Reads are for every internal
// role (the forms offer the Active rows); the save door keeps the 0431
// manager gate in SQL.
// ---------------------------------------------------------------------------

paymentSettingsRouter.get("/methods", async (c) => {
  const auth = c.var.auth;
  if (!INTERNAL.includes(auth.role as (typeof INTERNAL)[number])) {
    throw new HTTPException(403, { message: "You cannot view payment methods." });
  }
  const sb = userClient(c.env, auth.jwt);
  const [methods, accounts, system] = await Promise.all([
    sb.rpc("payment_method_registry"),
    sb.rpc("payment_method_money_accounts"),
    // 0541 — the POS card and Online payment rows, which have no method row.
    sb.from("gl_payment_account_map").select("method,source_channel,account_code")
      .in("method", ["card", "online"]).order("method").order("source_channel"),
  ]);
  if (methods.error || accounts.error || system.error || methods.data == null || accounts.data == null) {
    throw new HTTPException(500, { message: "Payment methods could not be loaded. Try again." });
  }
  return c.json({ methods: methods.data, money_accounts: accounts.data, system_rows: system.data ?? [] });
});

paymentSettingsRouter.post("/method/save", async (c) => {
  const auth = c.var.auth;
  if (!INTERNAL.includes(auth.role as (typeof INTERNAL)[number])) {
    throw new HTTPException(403, { message: "You cannot change Payment settings." });
  }
  const body = await parseJsonBody(c, paymentMethodSaveInput);
  if (!body.ok) return c.json(body.body, body.status);
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("payment_method_save", {
    p_method: body.data.method ?? null,
    p_label: body.data.label,
    p_account_code: body.data.accountCode,
    p_active: body.data.active,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

/** 0541 — move POS card or Online payment to another money account. */
const systemRowInput = z.object({
  method: z.enum(["card", "online"]),
  sourceChannel: z.string().trim().min(1).max(40),
  accountCode: z.string().regex(/^\d{4}$/),
});

paymentSettingsRouter.post("/system-method", async (c) => {
  const auth = c.var.auth;
  if (!INTERNAL.includes(auth.role as (typeof INTERNAL)[number])) {
    throw new HTTPException(403, { message: "You cannot change Payment settings." });
  }
  const body = await parseJsonBody(c, systemRowInput);
  if (!body.ok) return c.json(body.body, body.status);
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("payment_system_account_save", {
    p_method: body.data.method,
    p_source_channel: body.data.sourceChannel,
    p_account_code: body.data.accountCode,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

// The Active switch alone (0431's door). Any registered key, not six words.
const methodInput = z.object({
  method: paymentMethodKeySchema,
  active: z.boolean(),
});

paymentSettingsRouter.post("/method", async (c) => {
  const auth = c.var.auth;
  if (!INTERNAL.includes(auth.role as (typeof INTERNAL)[number])) {
    throw new HTTPException(403, { message: "You cannot change Payment settings." });
  }
  const body = await parseJsonBody(c, methodInput);
  if (!body.ok) return c.json(body.body, body.status);
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("payment_set_method_active", {
    p_method: body.data.method,
    p_active: body.data.active,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

const storageRuleInput = z.object({
  productGroup: z.enum(["mattress_bedframe", "sofa"]),
  freeDays: z.number().int().min(0).max(365),
  chargeAmount: z.number().min(0),
  cycleDays: z.number().int().min(1).max(365),
  operationLimitDay: z.number().int().min(0).max(365).nullish(),
  waiverLimitDay: z.number().int().min(0).max(365).nullish(),
  extraFreeAllowed: z.boolean(),
  inspectionDays: z.number().int().min(1).max(365),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** 0486 — every rule change records why. */
  reason: z.string().trim().min(1, "A reason is required.").max(500),
}).refine((v) => !v.extraFreeAllowed || v.operationLimitDay == null || v.freeDays <= v.operationLimitDay, {
  message: "Free days cannot exceed the Operation limit.", path: ["freeDays"],
}).refine((v) => !v.extraFreeAllowed || v.operationLimitDay == null || v.waiverLimitDay == null
  || v.operationLimitDay <= v.waiverLimitDay, {
  message: "The Operation limit cannot exceed the Approver limit.", path: ["operationLimitDay"],
});

paymentSettingsRouter.post("/storage-rule", async (c) => {
  const auth = c.var.auth;
  if (!INTERNAL.includes(auth.role as (typeof INTERNAL)[number])) {
    throw new HTTPException(403, { message: "You cannot change Payment settings." });
  }
  const body = await parseJsonBody(c, storageRuleInput);
  if (!body.ok) return c.json(body.body, body.status);
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("payment_set_storage_rule", {
    p_product_group: body.data.productGroup,
    p_free_days: body.data.freeDays,
    p_charge_amount: body.data.chargeAmount,
    p_cycle_days: body.data.cycleDays,
    p_operation_limit_day: body.data.operationLimitDay ?? null,
    p_waiver_limit_day: body.data.waiverLimitDay ?? null,
    p_extra_free_allowed: body.data.extraFreeAllowed,
    p_inspection_days: body.data.inspectionDays,
    p_effective_from: body.data.effectiveFrom,
    p_reason: body.data.reason,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

// ---------------------------------------------------------------------------
// 0435 — the WhatsApp template library. Reads return every version (the
// heads are the current library; older versions are the immutable history);
// every write goes through the manager-gated SQL doors.
// ---------------------------------------------------------------------------

paymentSettingsRouter.get("/templates", async (c) => {
  const auth = c.var.auth;
  if (!INTERNAL.includes(auth.role as (typeof INTERNAL)[number])) {
    throw new HTTPException(403, { message: "You cannot view templates." });
  }
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("payment_message_templates")
    .select("*")
    .order("purpose")
    .order("template_key")
    .order("version", { ascending: false });
  if (error || data == null) {
    throw new HTTPException(500, { message: "Templates could not be loaded. Try again." });
  }
  return c.json({ templates: data });
});

paymentSettingsRouter.post("/templates/save", async (c) => {
  const auth = c.var.auth;
  if (!INTERNAL.includes(auth.role as (typeof INTERNAL)[number])) {
    throw new HTTPException(403, { message: "You cannot change templates." });
  }
  const body = await parseJsonBody(c, paymentTemplateSaveInput);
  if (!body.ok) return c.json(body.body, body.status);
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("payment_template_save", {
    p_template_key: body.data.templateKey ?? null,
    p_purpose: body.data.purpose,
    p_name: body.data.name,
    p_body: body.data.body,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

paymentSettingsRouter.post("/templates/set-default", async (c) => {
  const auth = c.var.auth;
  if (!INTERNAL.includes(auth.role as (typeof INTERNAL)[number])) {
    throw new HTTPException(403, { message: "You cannot change templates." });
  }
  const body = await parseJsonBody(c, paymentTemplateKeyInput);
  if (!body.ok) return c.json(body.body, body.status);
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("payment_template_set_default", {
    p_template_key: body.data.templateKey,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

paymentSettingsRouter.post("/templates/set-active", async (c) => {
  const auth = c.var.auth;
  if (!INTERNAL.includes(auth.role as (typeof INTERNAL)[number])) {
    throw new HTTPException(403, { message: "You cannot change templates." });
  }
  const body = await parseJsonBody(c, paymentTemplateActiveInput);
  if (!body.ok) return c.json(body.body, body.status);
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("payment_template_set_active", {
    p_template_key: body.data.templateKey,
    p_active: body.data.active,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

export default paymentSettingsRouter;

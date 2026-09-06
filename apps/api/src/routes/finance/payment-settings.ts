import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  paymentTemplateActiveInput,
  paymentTemplateKeyInput,
  paymentTemplateSaveInput,
} from "@carres/shared/payment-templates";
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
  const [accounts, methods, rules] = await Promise.all([
    sb.from("payment_bank_accounts").select("*").order("route_source"),
    sb.from("payment_manual_methods").select("*").order("sort"),
    sb.from("payment_storage_rules").select("*")
      .order("product_group").order("effective_from", { ascending: false }),
  ]);
  if (accounts.error || methods.error || rules.error) {
    throw new HTTPException(500, { message: "Payment settings could not be loaded. Try again." });
  }
  return c.json({
    bank_accounts: accounts.data ?? [],
    manual_methods: methods.data ?? [],
    storage_rules: rules.data ?? [],
  });
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

const methodInput = z.object({
  method: z.enum(["bank", "duitnow_qr", "cheque", "cash", "credit_card", "debit_card"]),
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

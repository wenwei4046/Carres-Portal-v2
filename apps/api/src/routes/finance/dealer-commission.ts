import { Hono } from "hono";
import { dcProductRateInput, dcQuotaInput, dcSettingsInput } from "@carres/shared/dealer-commission";
import { requireFinance } from "../../lib/auth-guards";
import { fail, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * FINANCE · DEALER COMMISSION AND RENOVATION REBATE (migration 0544).
 * Rates Finance keeps and one read for the report. Nothing here is owed or
 * posted (CLAUDE.md §7); the arithmetic is packages/shared/src/dealer-commission.ts.
 *
 *   GET    /?month=YYYY-MM     dealer_commission_source for that month
 *   PUT    /settings           the default commission rate
 *   PUT    /rates/:modelId     a product's own rate
 *   DELETE /rates/:modelId     the product goes back to the default rate
 *   PUT    /quotas/:dealerId   a dealer's renovation quota, rebate rate, start date
 *
 * Finance and principal twice: `requireFinance` here, and RLS (gl_may_read) in the database.
 */
const r = new Hono<AppEnv>();
const UUID = /^[0-9a-f-]{36}$/i;

r.get("/", requireFinance, async (c) => {
  const month = c.req.query("month") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) return c.json({ error: "bad_request", message: "Pick a month." }, 400);
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("dealer_commission_source", { p_month: `${month}-01` });
  if (error) return fail(c, error);
  return c.json(data);
});

r.put("/settings", requireFinance, async (c) => {
  const body = await parseJsonBody(c, dcSettingsInput);
  if (!body.ok) return c.json(body.body, body.status);
  const { error } = await userClient(c.env, c.var.auth.jwt)
    .from("dealer_commission_settings").update({ default_rate: body.data.defaultRate }).eq("id", true);
  if (error) return fail(c, error);
  return c.json({ ok: true });
});

r.put("/rates/:modelId", requireFinance, async (c) => {
  const modelId = c.req.param("modelId");
  if (!UUID.test(modelId)) return c.json({ error: "not_found", message: "That product is not on the list." }, 404);
  const body = await parseJsonBody(c, dcProductRateInput);
  if (!body.ok) return c.json(body.body, body.status);
  const { error } = await userClient(c.env, c.var.auth.jwt)
    .from("dealer_commission_rates").upsert({ model_id: modelId, rate: body.data.rate });
  if (error) return fail(c, error);
  return c.json({ ok: true });
});

r.delete("/rates/:modelId", requireFinance, async (c) => {
  const modelId = c.req.param("modelId");
  if (!UUID.test(modelId)) return c.json({ error: "not_found", message: "That product is not on the list." }, 404);
  const { error } = await userClient(c.env, c.var.auth.jwt)
    .from("dealer_commission_rates").delete().eq("model_id", modelId);
  if (error) return fail(c, error);
  return c.json({ ok: true });
});

r.put("/quotas/:dealerId", requireFinance, async (c) => {
  const dealerId = c.req.param("dealerId");
  if (!UUID.test(dealerId)) return c.json({ error: "not_found", message: "That dealer is not on the list." }, 404);
  const body = await parseJsonBody(c, dcQuotaInput);
  if (!body.ok) return c.json(body.body, body.status);
  const { error } = await userClient(c.env, c.var.auth.jwt).from("dealer_rebate_quotas").upsert({
    dealer_id: dealerId, quota: body.data.quota, rebate_rate: body.data.rebateRate, starts_on: body.data.startsOn,
  });
  if (error) return fail(c, error);
  return c.json({ ok: true });
});

export default r;

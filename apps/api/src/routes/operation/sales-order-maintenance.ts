import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { parseOrderEntryConfigRow, setOrderEntryConfigInput } from "@carres/shared";
import { userClient } from "../../lib/supabase";
import { parseJsonBody, fail } from "../../lib/route-helpers";
import type { AppEnv } from "../../types";

/**
 * /api/operation/sales-order-maintenance — the Order Entry config.
 *
 *   GET  /entry-config  — the payment methods and POS form fields.
 *   PUT  /entry-config  — replace them (operation/principal only; written
 *                         through the set_order_entry_config RPC).
 */
const router = new Hono<AppEnv>();

// Internal-only. Inline guard = fast 403 before any Supabase round-trip.
router.use("*", async (c, next) => {
  const role = c.var.auth?.role;
  if (role !== "operation" && role !== "principal") {
    throw new HTTPException(403, { message: "Operation/Principal only" });
  }
  await next();
});

// ---------------------------------------------------------------------------
// 0219 — Order Entry config (payment methods + POS form fields). SO
// Maintenance is the config center for the "Open Sales Order" FORMAT (Loo
// 2026-07-12): what the POS asks at order entry, not just how the grid shows.
// ---------------------------------------------------------------------------

router.get("/entry-config", async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from("order_entry_config")
    .select("payment_methods, form_fields")
    .eq("id", true)
    .maybeSingle();
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json({ entryConfig: parseOrderEntryConfigRow(data) });
});

router.put("/entry-config", async (c) => {
  const parsed = await parseJsonBody(c, setOrderEntryConfigInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);

  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("set_order_entry_config", {
    p_payment_methods: parsed.data.paymentMethods,
    p_form_fields: parsed.data.formFields,
  });
  if (error) return fail(c, error);
  return c.json({
    entryConfig: parseOrderEntryConfigRow(
      data as { payment_methods?: unknown; form_fields?: unknown } | null,
    ),
  });
});

export default router;

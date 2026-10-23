import { Hono } from "hono";
import { requireOperationOrPrincipal } from "../../lib/auth-guards";
import { fail } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * /api/operation/purchase-invoices — the supplier bills, read-only, for
 * Purchasing (migration 0721).
 *
 * Weisiang's decision (Mr Lim, WhatsApp 2026-10-22): purchasing staff see
 * purchase invoices inside the purchasing area, Houzs way. Jess's rule that no
 * finance fields appear in Operations is overturned; Jess was not part of this
 * decision. The bill itself stays Finance's record: this reads Finance's own
 * bills and paid figure and writes nothing. Entering, confirming and paying a
 * bill remain Finance's doors (finance + principal only in the database).
 */
const purchaseInvoicesRouter = new Hono<AppEnv>();

purchaseInvoicesRouter.get("/", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("purchasing_supplier_bill_list");
  if (error) return fail(c, error);
  return c.json({ rows: data ?? [] });
});

export default purchaseInvoicesRouter;

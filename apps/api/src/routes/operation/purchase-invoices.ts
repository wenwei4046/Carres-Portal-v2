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
 * bills and paid figure and writes nothing. Purchasing ENTERS a bill through
 * Finance's own door, POST /api/finance/payables/bills (Chew, Finance, WhatsApp
 * 2026-10-23, via YH; 0721). Q8 (Chew 2026-10-26, Houzs way): that save posts
 * it. Cancelling and paying a bill remain
 * Finance's doors (finance + principal only in the database).
 */
const purchaseInvoicesRouter = new Hono<AppEnv>();

purchaseInvoicesRouter.get("/", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("purchasing_supplier_bill_list");
  if (error) return fail(c, error);
  return c.json({ rows: data ?? [] });
});

// 2026-10-26 (YH, Houzs): one draft bill for its form. Purchasing reads only
// its own draft (the database returns null otherwise).
purchaseInvoicesRouter.get("/:id", requireOperationOrPrincipal, async (c) => {
  const id = c.req.param("id");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return c.json({ error: "bad_request", code: "bad_id", message: "That is not a bill." }, 400);
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("purchasing_supplier_bill_draft", { p_bill_id: id });
  if (error) return fail(c, error);
  if (!data) return c.json({ error: "not_found", code: "bill_missing", message: "That draft bill is not yours to change, or is no longer a draft." }, 404);
  return c.json(data);
});

export default purchaseInvoicesRouter;

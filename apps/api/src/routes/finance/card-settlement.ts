import { Hono, type Context } from "hono";
import { z } from "zod";
import { CARD_ACQUIRERS, parseCardFile } from "@carres/shared/card-settlement";
import { requireFinance } from "../../lib/auth-guards";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Finance · card settlement (migration 0572): import a card company's file and
 * match its rows to the recorded card payments.
 *
 * Mounted at `/api/finance/card-settlement`, above the `/finance` catch-all.
 *
 *   GET  /                 the days, their rows and suggestions, the payments to pick from
 *   POST /import           read the file here, then keep it and its rows whole
 *   POST /rows/:id/match   approve a suggestion or pick by hand; null takes the match off
 *
 * Nothing here posts. A matched day fills the card payout form on the page,
 * and that money move posts only when the finance approver approves it.
 */
const financeCardSettlementRouter = new Hono<AppEnv>();
const uuid = z.string().uuid();

const importInput = z.object({
  acquirer: z.enum(CARD_ACQUIRERS, { errorMap: () => ({ message: "Choose Public Bank, GHL or Maybank." }) }),
  fileName: z.string().trim().min(1, "The file has no name.").max(200, "The file name is too long."),
  content: z.string().min(1, "The file has no sales.").max(2_000_000, "The file is too big for a card settlement file."),
});

const matchInput = z.object({ paymentId: uuid.nullable() });

function fail(c: Context<AppEnv>, error: { code?: string; message?: string; details?: string }) {
  const m = mapPgError(error);
  if (m.status === 403 && error.details) return c.json({ ...m.body, code: error.details }, 403);
  if (m.status === 422 && error.details) return c.json({ ...m.body, code: error.details }, 422);
  return c.json(m.body, m.status);
}

financeCardSettlementRouter.get("/", requireFinance, async (c) => {
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("card_settlement_review");
  if (error) return fail(c, error);
  return c.json(data ?? { days: [], rows: [], payments: [] });
});

financeCardSettlementRouter.post("/import", requireFinance, async (c) => {
  const body = await parseJsonBody(c, importInput);
  if (!body.ok) return c.json(body.body, body.status);
  const { acquirer, fileName, content } = body.data;
  const parsed = parseCardFile(acquirer, content);
  if (!parsed.ok) return c.json({ error: "invalid_input", code: "file_refused", message: parsed.message }, 422);
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("card_settlement_import", {
    p_acquirer: acquirer,
    p_file_name: fileName,
    p_content: content,
    p_rows: parsed.rows,
    p_published: parsed.published,
  });
  if (error) return fail(c, error);
  return c.json(data, 201);
});

financeCardSettlementRouter.post("/rows/:id/match", requireFinance, async (c) => {
  const id = c.req.param("id");
  if (!uuid.safeParse(id).success) {
    return c.json({ error: "not_found", code: "not_found", message: "That settlement row is not there." }, 404);
  }
  const body = await parseJsonBody(c, matchInput);
  if (!body.ok) return c.json(body.body, body.status);
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("card_settlement_match", {
    p_line_id: id,
    p_payment_id: body.data.paymentId,
  });
  if (error) return fail(c, error);
  return c.json(data);
});

export default financeCardSettlementRouter;

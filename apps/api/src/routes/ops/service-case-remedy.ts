import { caseRemedyCompletion } from "../../lib/service-case-remedy-work";
import { Hono } from "hono";
import { serviceCaseRemedyDecisionSchema, serviceCaseRemedyProposalSchema } from "@carres/shared";
import { requireOperationOrPrincipal } from "../../lib/auth-guards";
import { fail } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

const router = new Hono<AppEnv>();
router.use("*", requireOperationOrPrincipal);
router.get("/", async c => {
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("service_case_remedy_read", { p_case_id: c.req.param("id") });
  return error ? fail(c, error) : c.json(data);
});
router.post("/proposals", async c => {
  const parsed = serviceCaseRemedyProposalSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_body", message: parsed.error.issues[0]?.message }, 400);
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("service_case_remedy_propose", { p_case_id: c.req.param("id"), p_proposal: parsed.data });
  return error ? fail(c, error) : c.json(data);
});
router.post("/decisions", caseRemedyCompletion(), async c => {
  const parsed = serviceCaseRemedyDecisionSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_body", message: parsed.error.issues[0]?.message }, 400);
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("service_case_remedy_decide", { p_case_id: c.req.param("id"), p_decision: parsed.data });
  return error ? fail(c, error) : c.json(data);
});
export default router;

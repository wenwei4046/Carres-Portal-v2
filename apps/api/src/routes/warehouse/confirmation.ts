import { Hono } from "hono";
import { z } from "zod";
import { warehouseConfirmReceiptInput, warehouseConfirmationResult } from "@carres/shared";
import { warehouseConfirmationReportToWire } from "@carres/shared/adapters";
import { requireWarehouse } from "../../lib/auth-guards";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import { receivingCompletionSpec } from "../../lib/receiving-work-completion";
import { withWorkCompletion, workCompletionDeps } from "../../lib/work-completion";
import type { AppEnv } from "../../types";

const router = new Hono<AppEnv>();
const readiness = z.object({ contract_version: z.literal(1), individual: z.boolean(), site_active: z.boolean() });
const missingFunction = (error: { code?: string; message?: string }, name: string) =>
  ["PGRST202", "42883"].includes(error.code ?? "") && (error.message ?? "").includes(name);

/** Admission comes from current database identity, not a client flag or a shared login name.
 * Missing deployment preserves the explicit legacy count door; a failed read never selects it. */
router.get("/confirmation/readiness", requireWarehouse, async c => {
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("warehouse_receiving_readiness");
  if (error) {
    if (missingFunction(error, "warehouse_receiving_readiness"))
      return c.json({ mode: "legacy_count", reason: "confirmation_not_available" });
    if (error.code === "42501") { const mapped = mapPgError(error); return c.json(mapped.body, mapped.status); }
    return c.json({ code: "receiving_confirmation_unavailable" }, 503);
  }
  const parsed = readiness.safeParse(data);
  if (!parsed.success) return c.json({ code: "receiving_confirmation_unknown" }, 502);
  if (!parsed.data.individual) return c.json({ mode: "legacy_count", reason: "individual_required" });
  return c.json({ mode: parsed.data.site_active ? "confirmation" : "unavailable",
    reason: parsed.data.site_active ? null : "receiving_site_inactive" });
});

/** The one final-confirmation engine either posts or preserves this exact report.
 * Never retry by sending to the legacy count queue after an error or lost response. */
router.post("/receipts/confirm", requireWarehouse, async c => {
  const parsed = await parseJsonBody(c, warehouseConfirmReceiptInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const body = parsed.data;
  return withWorkCompletion(c, [{ spec: receivingCompletionSpec(), objectIds: body.receiptId ? [body.receiptId] : [] }], async () => {
    const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("warehouse_confirm_receipt", {
      p_report: warehouseConfirmationReportToWire(body.report), p_save_key: body.saveKey,
      p_receipt_id: body.receiptId ?? null, p_revision: body.revision ?? null,
    });
    if (error) {
      if (missingFunction(error, "warehouse_confirm_receipt"))
        return c.json({ code: "receiving_confirmation_unavailable" }, 503);
      const mapped = mapPgError(error); return c.json(mapped.body, mapped.status);
    }
    const result = warehouseConfirmationResult.safeParse(data);
    if (!result.success) return c.json({ code: "receiving_confirmation_unknown" }, 502);
    return c.json(result.data);
  }, workCompletionDeps());
});

export default router;

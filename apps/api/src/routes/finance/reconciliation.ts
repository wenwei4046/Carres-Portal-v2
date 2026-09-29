import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  bankStatementCreateInput,
  bankStatementsListQuery,
  reconciliationCreateInput,
} from "@carres/shared";
import { requireFinance } from "../../lib/auth-guards";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Phase 5 Chunk B — Finance · Reconciliation router.
 *
 * Spec: docs/superpowers/specs/2026-05-08-phase-5-finance-spec.md §5.4.
 *
 * Mounted at `/api/finance` (paths below are relative to that). Per-route
 * `requireFinance` guard (per Phase 4.5 Chunk 2 CF #1 fix — no blanket
 * use("*") middleware leaks).
 *
 * Routes:
 *   GET  /bank-statements                        list bank lines (filters)
 *   POST /bank-statements                        manual single insert
 *   GET  /reconciliations/suggest/:bankStmtId    finance_recon_suggest_matches RPC
 *   POST /reconciliations                        create a match link
 *   DELETE /reconciliations/:id                  remove a match
 *
 * CSV bulk import (Q3=B Maybank2u 5-col format) is deferred to Chunk C
 * or Phase 9. The single-row POST /bank-statements covers V1 manual entry
 * which is enough to dogfood the FinanceRecon page.
 */
const financeReconciliationRouter = new Hono<AppEnv>();

financeReconciliationRouter.get("/bank-statements", requireFinance, async (c) => {
  const auth = c.var.auth;
  const parsed = bankStatementsListQuery.safeParse(
    Object.fromEntries(new URL(c.req.url).searchParams),
  );
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_query",
        code: "invalid_param",
        message: parsed.error.issues[0]?.message ?? "invalid query",
      },
      422,
    );
  }
  const f = parsed.data;
  const sb = userClient(c.env, auth.jwt);

  // Pull the bank statements + their matched flag (presence of a
  // reconciliations row). Two-step rather than join to keep the row shape
  // flat for the page: { ...bank_statement_columns, matched_ref: string|null }.
  let q = sb
    .from("bank_statements")
    .select("*")
    .order("statement_date", { ascending: false });
  if (f.from) q = q.gte("statement_date", f.from);
  if (f.to)   q = q.lte("statement_date", f.to);
  q = q.limit(f.limit ?? 200);

  const { data: stmts, error: stmtErr } = await q;
  if (stmtErr) throw new HTTPException(500, { message: stmtErr.message });

  const ids = (stmts ?? []).map((r) => (r as { id: string }).id);
  let recMap: Record<string, string> = {};
  if (ids.length > 0) {
    const { data: recs, error: recErr } = await sb
      .from("reconciliations")
      .select("bank_statement_id, payment_id, invoice_id, refund_id, manual_ref")
      .in("bank_statement_id", ids);
    if (recErr) throw new HTTPException(500, { message: recErr.message });
    for (const r of recs ?? []) {
      const row = r as {
        bank_statement_id: string;
        payment_id: string | null;
        invoice_id: string | null;
        refund_id: string | null;
        manual_ref: string | null;
      };
      recMap[row.bank_statement_id] =
        row.invoice_id ? `INV-ref` :
        row.payment_id ? `PMT-ref` :
        row.refund_id  ? `RFD-ref` :
        row.manual_ref ?? "matched";
    }
  }

  const enriched = (stmts ?? []).map((s) => {
    const row = s as { id: string };
    return { ...row, matched_ref: recMap[row.id] ?? null };
  });

  // Apply matched filter post-fetch (cleaner than a left-join SQL).
  const filtered = f.matched === "true"
    ? enriched.filter((r) => r.matched_ref !== null)
    : f.matched === "false"
      ? enriched.filter((r) => r.matched_ref === null)
      : enriched;

  return c.json(filtered);
});

financeReconciliationRouter.post("/bank-statements", requireFinance, async (c) => {
  const auth = c.var.auth;
  const body = await parseJsonBody(c, bankStatementCreateInput);
  if (!body.ok) return c.json(body.body, body.status);

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("bank_statements")
    .insert({
      statement_date: body.data.statementDate,
      description:    body.data.description,
      amount:         body.data.amount,
      reference:      body.data.reference ?? null,
      currency:       body.data.currency,
      imported_from:  "manual",
    })
    .select("*")
    .single();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

financeReconciliationRouter.get(
  "/reconciliations/suggest/:bankStmtId",
  requireFinance,
  async (c) => {
    const auth = c.var.auth;
    const id = c.req.param("bankStmtId");
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      return c.json(
        { error: "invalid_id", code: "invalid_param", message: "uuid required" },
        422,
      );
    }
    const sb = userClient(c.env, auth.jwt);
    const { data, error } = await sb.rpc("finance_recon_suggest_matches", {
      p_bank_statement_id: id,
    });
    if (error) {
      const m = mapPgError(error);
      return c.json(m.body, m.status);
    }
    return c.json(data);
  },
);

financeReconciliationRouter.post("/reconciliations", requireFinance, async (c) => {
  const auth = c.var.auth;
  const body = await parseJsonBody(c, reconciliationCreateInput);
  if (!body.ok) return c.json(body.body, body.status);

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("reconciliations")
    .insert({
      bank_statement_id: body.data.bankStatementId,
      payment_id:        body.data.paymentId ?? null,
      invoice_id:        body.data.invoiceId ?? null,
      refund_id:         body.data.refundId  ?? null,
      manual_ref:        body.data.manualRef ?? null,
      note:              body.data.note      ?? null,
    })
    .select("*")
    .single();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

financeReconciliationRouter.delete(
  "/reconciliations/:id",
  requireFinance,
  async (c) => {
    const auth = c.var.auth;
    const id = c.req.param("id");
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      return c.json(
        { error: "invalid_id", code: "invalid_param", message: "uuid required" },
        422,
      );
    }
    const sb = userClient(c.env, auth.jwt);
    const { error } = await sb.from("reconciliations").delete().eq("id", id);
    if (error) throw new HTTPException(500, { message: error.message });
    return c.json({ ok: true });
  },
);

export default financeReconciliationRouter;

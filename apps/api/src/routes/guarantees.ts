import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  GUARANTEE_ENTITLEMENTS,
  GUARANTEE_TERMS,
  effectiveGuaranteeStatus,
  guaranteeAttachInputSchema,
  guaranteeClaimInputSchema,
  guaranteeListQuerySchema,
  type GuaranteeEntitlementDto,
  type GuaranteeListResponse,
  type GuaranteeRemedy,
  type GuaranteeStatus,
  type GuaranteeTermDto,
} from "@carres/shared";
import { mapPgError, parseJsonBody } from "../lib/route-helpers";
import { userClient } from "../lib/supabase";
import type { AppEnv } from "../types";

// ---------------------------------------------------------------------------
// Guarantee packages (migrations 0261-0263, 2026-07-26).
//
// The track-back desk Loo asked for: a customer walks in with a broken
// mattress and ops must answer, from ANY of three handles — Sales Order,
// customer name, or customer id / phone — "did they buy the guarantee, on
// WHICH model, is it still alive, has it already been used".
//
// Reads are RLS-scoped (internal sees all; a dealer sees only its own orders'
// guarantees, which is what powers the POS order-detail badge). The two
// mutations go through SECURITY DEFINER RPCs that re-check operation/principal
// server-side — the route gate here is the friendly 403, RLS + the RPC are the
// real boundary. EVERY handler forwards the USER JWT — never service_role.
// ---------------------------------------------------------------------------

const guaranteesRouter = new Hono<AppEnv>();

/** Operation + principal — the API twin of the RPCs' own is_operation() gate. */
const CLAIM_ROLES = new Set<string>(["operation", "principal"]);

function claimRoleOnly(c: { var: { auth: { role: string } } }) {
  if (!CLAIM_ROLES.has(c.var.auth.role)) {
    throw new HTTPException(403, {
      message: "Only operation or the principal can process a guarantee claim",
    });
  }
}

// The select list is shared by every read so the DTO mapper always gets the
// same shape. The order embed gives us the SO number (the #1 track-back axis).
const ENT_SELECT = `
  id, order_id, order_line_id, guarantee_sku, unit_no,
  covers_line_id, covers_sku, covers_model_id, covers_label,
  customer_id, customer_name, customer_phone, phone_key,
  coverage_years, remedy, starts_on, expires_on, status,
  claimed_at, claim_case_id, claim_notes, replacement_sku, void_reason,
  orders!inner(so),
  service_cases(case_no)
`;

/* eslint-disable @typescript-eslint/no-explicit-any */
function toDto(row: any, labelBySku: Record<string, string>): GuaranteeEntitlementDto {
  const status = String(row.status) as GuaranteeStatus;
  const expiresOn = row.expires_on ? String(row.expires_on) : null;
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    so: row.orders?.so != null ? Number(row.orders.so) : null,
    orderLineId: row.order_line_id ? String(row.order_line_id) : null,
    guaranteeSku: String(row.guarantee_sku),
    guaranteeLabel: labelBySku[String(row.guarantee_sku)] ?? null,
    unitNo: Number(row.unit_no ?? 1),
    coversLineId: row.covers_line_id ? String(row.covers_line_id) : null,
    coversSku: row.covers_sku ? String(row.covers_sku) : null,
    coversModelId: row.covers_model_id ? String(row.covers_model_id) : null,
    coversLabel: row.covers_label ? String(row.covers_label) : null,
    customerId: row.customer_id ? String(row.customer_id) : null,
    customerName: String(row.customer_name ?? ""),
    customerPhone: row.customer_phone ? String(row.customer_phone) : null,
    phoneKey: row.phone_key ? String(row.phone_key) : null,
    coverageYears: Number(row.coverage_years),
    remedy: String(row.remedy) as GuaranteeRemedy,
    startsOn: row.starts_on ? String(row.starts_on) : null,
    expiresOn,
    status,
    // Expiry is a date fact, not a stored state — derived on every read so
    // nothing depends on a nightly job that could silently stop running.
    effectiveStatus: effectiveGuaranteeStatus(status, expiresOn),
    claimedAt: row.claimed_at ? String(row.claimed_at) : null,
    claimCaseId: row.claim_case_id ? String(row.claim_case_id) : null,
    claimCaseNo: row.service_cases?.case_no ? String(row.service_cases.case_no) : null,
    claimNotes: row.claim_notes ? String(row.claim_notes) : null,
    replacementSku: row.replacement_sku ? String(row.replacement_sku) : null,
    voidReason: row.void_reason ? String(row.void_reason) : null,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** guarantee_sku -> label, so a row can show "Mattress Guarantee 15 Years"
 *  rather than a bare code. Tiny config table — one fetch per request. */
async function termLabels(sb: ReturnType<typeof userClient>): Promise<Record<string, string>> {
  const { data } = await sb.from(GUARANTEE_TERMS).select("guarantee_sku, label");
  const out: Record<string, string> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (data ?? []) as any[]) out[String(r.guarantee_sku)] = String(r.label);
  return out;
}

// ---------------------------------------------------------------------------
// GET /api/guarantees/terms — the config the POS gates on (which SKUs are
// guarantees, and which category each one may attach to).
// ---------------------------------------------------------------------------
guaranteesRouter.get("/terms", async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from(GUARANTEE_TERMS)
    .select("guarantee_sku, label, covers_category, coverage_years, remedy, terms_text, active")
    .eq("active", true)
    .order("guarantee_sku");
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: GuaranteeTermDto[] = ((data ?? []) as any[]).map((r) => ({
    guaranteeSku: String(r.guarantee_sku),
    label: String(r.label),
    coversCategory: r.covers_category,
    coverageYears: Number(r.coverage_years),
    remedy: String(r.remedy) as GuaranteeRemedy,
    termsText: r.terms_text ? String(r.terms_text) : null,
    active: Boolean(r.active),
  }));
  return c.json({ items });
});

// ---------------------------------------------------------------------------
// GET /api/guarantees — the track-back search. `q` is ONE box that resolves
// against all three of Loo's axes.
// ---------------------------------------------------------------------------
guaranteesRouter.get("/", async (c) => {
  const parsed = guaranteeListQuerySchema.safeParse(
    Object.fromEntries(new URL(c.req.url).searchParams),
  );
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "bad query" });
  }
  const { q, status, orderId, customerId, limit } = parsed.data;
  const cap = limit ?? 100;

  const sb = userClient(c.env, c.var.auth.jwt);
  let query = sb.from(GUARANTEE_ENTITLEMENTS).select(ENT_SELECT);

  if (orderId) query = query.eq("order_id", orderId);
  if (customerId) query = query.eq("customer_id", customerId);
  // 'expired' is derived, so it can't be a DB filter — narrow to 'active' and
  // sieve below. Every other status maps 1:1 to the column.
  if (status && status !== "expired") query = query.eq("status", status);
  if (status === "expired") query = query.eq("status", "active");

  if (q) {
    // Axis 3a — a UUID typed straight in is a customer id.
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q.trim());
    if (isUuid) {
      query = query.eq("customer_id", q.trim());
    } else {
      // Axis 2 (name) + axis 3b (phone) + the covered model code, in one OR.
      // PostgREST cannot OR across an embedded resource, so axis 1 (the SO
      // number) runs as its own read below and the two sets are merged.
      const digits = q.replace(/\D/g, "");
      const ors = [`customer_name.ilike.%${q}%`, `covers_sku.ilike.%${q}%`];
      if (digits.length >= 4) ors.push(`phone_key.ilike.%${digits}%`);
      query = query.or(ors.join(","));
    }
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(cap + 1);
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows = (data ?? []) as any[];

  // SO axis — a numeric q is very likely a Sales Order number. Run it as its
  // own filtered read and merge (PostgREST cannot OR across an embed).
  const soCandidate = q ? Number(q.trim().replace(/^SO-?/i, "")) : NaN;
  if (Number.isInteger(soCandidate) && soCandidate > 0) {
    let soQuery = sb
      .from(GUARANTEE_ENTITLEMENTS)
      .select(ENT_SELECT)
      .eq("orders.so", soCandidate);
    if (status && status !== "expired") soQuery = soQuery.eq("status", status);
    if (status === "expired") soQuery = soQuery.eq("status", "active");
    const { data: soRows } = await soQuery.limit(cap + 1);
    const seen = new Set(rows.map((r) => String(r.id)));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (soRows ?? []) as any[]) {
      if (!seen.has(String(r.id))) rows.push(r);
    }
  }

  const labels = await termLabels(sb);
  let items = rows.map((r) => toDto(r, labels));
  if (status) items = items.filter((g) => g.effectiveStatus === status);

  const truncated = items.length > cap;
  return c.json<GuaranteeListResponse>({
    items: items.slice(0, cap),
    truncated,
  });
});

// ---------------------------------------------------------------------------
// GET /api/guarantees/order/:orderId — every guarantee on one order. Powers the
// ops drawer badge, the POS order-detail badge and the invoice block.
// ---------------------------------------------------------------------------
guaranteesRouter.get("/order/:orderId", async (c) => {
  const orderId = c.req.param("orderId");
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from(GUARANTEE_ENTITLEMENTS)
    .select(ENT_SELECT)
    .eq("order_id", orderId)
    .order("unit_no");
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  const labels = await termLabels(sb);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = ((data ?? []) as any[]).map((r) => toDto(r, labels));
  return c.json<GuaranteeListResponse>({ items, truncated: false });
});

// ---------------------------------------------------------------------------
// POST /api/guarantees/:id/claim — the one-shot swap (Loo ruling #3).
// Every rule (delivered · in-window · unclaimed) is enforced inside the RPC;
// this handler only shapes the payload and translates the error.
// ---------------------------------------------------------------------------
guaranteesRouter.post("/:id/claim", async (c) => {
  claimRoleOnly(c);
  const id = c.req.param("id");
  const parsed = await parseJsonBody(c, guaranteeClaimInputSchema);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("guarantee_claim", {
    p_entitlement_id: id,
    p_case_id: parsed.data.caseId ?? null,
    p_replacement_sku: parsed.data.replacementSku ?? null,
    p_notes: parsed.data.notes ?? null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data ?? { ok: true });
});

// ---------------------------------------------------------------------------
// POST /api/guarantees/:id/attach — point an unassigned guarantee (ops-added
// or imported, so it never carried attrs.guarantee) at a real line.
// ---------------------------------------------------------------------------
guaranteesRouter.post("/:id/attach", async (c) => {
  claimRoleOnly(c);
  const id = c.req.param("id");
  const parsed = await parseJsonBody(c, guaranteeAttachInputSchema);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("guarantee_attach", {
    p_entitlement_id: id,
    p_order_line_id: parsed.data.orderLineId,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data ?? { ok: true });
});

export default guaranteesRouter;

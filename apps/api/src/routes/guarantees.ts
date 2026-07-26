import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  GUARANTEE_ENTITLEMENTS,
  GUARANTEE_TERMS,
  effectiveGuaranteeStatus,
  guaranteeAttachInputSchema,
  guaranteeClaimInputSchema,
  guaranteeDeskStatus,
  guaranteeListQuerySchema,
  guaranteeProductInputSchema,
  guaranteeScopeLabel,
  deriveGuaranteeSkuCode,
  guaranteeVisitsTotal,
  PRODUCT_MODELS,
  PRODUCT_SKUS,
  SOFA_COMBO_PRICING,
  SOFA_COMPARTMENTS,
  isGuaranteeId,
  normalizeGuaranteeId,
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
  guarantee_id, claimed_guarantee_id,
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
    guaranteeId: row.guarantee_id ? String(row.guarantee_id) : null,
    claimedGuaranteeId: row.claimed_guarantee_id ? String(row.claimed_guarantee_id) : null,
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
    .select("*")
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
    coversModelId: r.covers_model_id ? String(r.covers_model_id) : null,
    coversVariants: Array.isArray(r.covers_variants) ? (r.covers_variants as string[]) : null,
    coversComboId: r.covers_combo_id ? String(r.covers_combo_id) : null,
    coversCompartmentId: r.covers_compartment_id ? String(r.covers_compartment_id) : null,
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
  // The filter speaks the DESK vocabulary (active | claimed | expired | void).
  // 'active' covers BOTH 'pending' and 'active' rows and 'expired' is derived
  // from the date, so neither maps 1:1 to the column — narrow to the candidate
  // rows here and sieve on the derived word below.
  if (status === "claimed" || status === "void" || status === "pending") {
    query = query.eq("status", status);
  } else if (status === "active" || status === "expired") {
    query = query.in("status", ["pending", "active"]);
  }

  if (q) {
    // Axis 0 — the guarantee ID itself (0267). This is THE handle a claim is
    // looked up by, so it wins over every other interpretation and matches the
    // live column OR the retired one: a spent ID must answer "already claimed",
    // never the indistinguishable "not found".
    const gid = normalizeGuaranteeId(q);
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q.trim());
    if (isGuaranteeId(q)) {
      query = query.or(`guarantee_id.eq.${gid},claimed_guarantee_id.eq.${gid}`);
    } else if (isUuid) {
      // Axis 3a — a UUID typed straight in is a customer id.
      query = query.eq("customer_id", q.trim());
    } else {
      // Axis 2 (name) + axis 3b (phone) + the covered model code, in one OR.
      // PostgREST cannot OR across an embedded resource, so axis 1 (the SO
      // number) runs as its own read below and the two sets are merged.
      const digits = q.replace(/\D/g, "");
      const ors = [
        `customer_name.ilike.%${q}%`,
        `covers_sku.ilike.%${q}%`,
        // a partially-typed ID still narrows, live or retired
        `guarantee_id.ilike.%${gid}%`,
        `claimed_guarantee_id.ilike.%${gid}%`,
      ];
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
  const soCandidate = q && !isGuaranteeId(q) ? Number(q.trim().replace(/^SO-?/i, "")) : NaN;
  if (Number.isInteger(soCandidate) && soCandidate > 0) {
    let soQuery = sb
      .from(GUARANTEE_ENTITLEMENTS)
      .select(ENT_SELECT)
      .eq("orders.so", soCandidate);
    if (status === "claimed" || status === "void" || status === "pending") {
      soQuery = soQuery.eq("status", status);
    } else if (status === "active" || status === "expired") {
      soQuery = soQuery.in("status", ["pending", "active"]);
    }
    const { data: soRows } = await soQuery.limit(cap + 1);
    const seen = new Set(rows.map((r) => String(r.id)));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (soRows ?? []) as any[]) {
      if (!seen.has(String(r.id))) rows.push(r);
    }
  }

  const labels = await termLabels(sb);
  let items = rows.map((r) => toDto(r, labels));
  if (status) items = items.filter((g) => guaranteeDeskStatus(g.effectiveStatus) === status);

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

// ---------------------------------------------------------------------------
// POST /api/guarantees/products — author a guarantee end to end (Loo
// 2026-07-26, from + New SKU): the product_model, its ONE SKU and the terms
// row in a single call.
//
// Why one endpoint and not three client calls: a SKU without its terms row is
// a guarantee that sells but covers nothing and mints no entitlement — exactly
// the untraceable state this whole feature exists to prevent. The write order
// is model → sku → terms, and each failure UNWINDS what it already created, so
// a half-authored guarantee never reaches the catalog.
//
// The code and label are DERIVED here, never sent, so two people authoring the
// same cover cannot invent two spellings of it.
// ---------------------------------------------------------------------------
guaranteesRouter.post("/products", async (c) => {
  if (c.var.auth.role !== "principal") {
    throw new HTTPException(403, {
      message: "Only the principal (Master Admin) can author a guarantee",
    });
  }
  const parsed = await parseJsonBody(c, guaranteeProductInputSchema);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const d = parsed.data;

  const sb = userClient(c.env, c.var.auth.jwt);

  // Resolve the names the code + label are built from, and prove every scope id
  // really exists (a dangling scope would silently cover nothing).
  let modelKey: string | null = null;
  let modelName: string | null = null;
  if (d.coversModelId) {
    const { data: m } = await sb
      .from(PRODUCT_MODELS)
      .select("model_key, name, category")
      .eq("id", d.coversModelId)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = m as any;
    if (!row) throw new HTTPException(422, { message: "that product no longer exists" });
    if (row.category !== d.coversCategory) {
      throw new HTTPException(422, {
        message: `that product is a ${row.category}, not a ${d.coversCategory}`,
      });
    }
    modelKey = String(row.model_key);
    modelName = String(row.name);
  }

  let compartmentCode: string | null = null;
  if (d.coversCompartmentId) {
    const { data: cp } = await sb
      .from(SOFA_COMPARTMENTS)
      .select("code")
      .eq("id", d.coversCompartmentId)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!cp) throw new HTTPException(422, { message: "that compartment no longer exists" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    compartmentCode = String((cp as any).code);
  }

  let comboLabel: string | null = null;
  if (d.coversComboId) {
    const { data: cb } = await sb
      .from(SOFA_COMBO_PRICING)
      .select("label, model_id")
      .eq("id", d.coversComboId)
      .maybeSingle();
    if (!cb) throw new HTTPException(422, { message: "that combo no longer exists" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    comboLabel = (cb as any).label ? String((cb as any).label) : "combo";
  }

  const variants = (d.coversVariants ?? []).filter(Boolean);
  const scopeLabel = guaranteeScopeLabel(
    {
      coversCategory: d.coversCategory,
      coversModelId: d.coversModelId ?? null,
      coversVariants: variants,
      coversComboId: d.coversComboId ?? null,
      coversCompartmentId: d.coversCompartmentId ?? null,
    },
    { model: modelName, combo: comboLabel, compartment: compartmentCode },
  );
  // 0274 — the default name has to say which of the two things this is, or a
  // care plan and a guarantee over the same product read identically in SKU
  // Master. A recurring plan also carries its visit count, since "3 years" on
  // its own does not tell an operator how many cleans they sold.
  const visitsTotal = guaranteeVisitsTotal(d.kind, d.coverageYears, d.visitsPerYear);
  const scopeTitle = `${scopeLabel.charAt(0).toUpperCase()}${scopeLabel.slice(1)}`;
  const label =
    d.label?.trim() ||
    (d.kind === "recurring"
      ? `${scopeTitle} Care Plan ${d.coverageYears} Years · ${visitsTotal} visits`
      : `${scopeTitle} Guarantee ${d.coverageYears} Years`);
  const sku = deriveGuaranteeSkuCode({
    coversCategory: d.coversCategory,
    modelKey,
    variants,
    compartmentCode,
    comboLabel,
    coverageYears: d.coverageYears,
    kind: d.kind,
    visitsPerYear: d.visitsPerYear ?? null,
  });

  // 1. the guarantee product_model (one per authored guarantee — the SKU
  //    Master groups by model, so each cover reads as its own product).
  const modelKeyForGuarantee = sku.toLowerCase();
  const { data: createdModel, error: modelErr } = await sb
    .from(PRODUCT_MODELS)
    .insert({
      category: "guarantee",
      model_key: modelKeyForGuarantee,
      name: label,
      blurb: d.description ?? null,
      allowed_options: {},
    })
    .select("id")
    .maybeSingle();
  if (modelErr) {
    const m = mapPgError(modelErr);
    return c.json(m.body, m.status);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modelId = String((createdModel as any).id);

  // 2. its single SKU. `variant` IS the invoice line description (finance reads
  //    product_skus.variant), so it carries the full sentence, not a size.
  const { error: skuErr } = await sb.from(PRODUCT_SKUS).insert({
    model_id: modelId,
    sku,
    variant: label,
    variant_kind: "preset",
    price: d.price,
    pos_active: true,
    supplier_id: null, // a guarantee is never purchased
    description: d.description ?? null,
  });
  if (skuErr) {
    await sb.from(PRODUCT_MODELS).delete().eq("id", modelId); // unwind
    const m = mapPgError(skuErr);
    return c.json(m.body, m.status);
  }

  // 3. the terms — what it actually promises.
  const { error: termErr } = await sb.from(GUARANTEE_TERMS).insert({
    guarantee_sku: sku,
    label,
    covers_category: d.coversCategory,
    coverage_years: d.coverageYears,
    remedy: d.remedy,
    // 0274 — which of the two kinds, and (recurring only) how often. The DB
    // CHECKs enforce the same pairing the zod refinements do.
    kind: d.kind,
    visits_per_year: d.kind === "recurring" ? (d.visitsPerYear ?? null) : null,
    terms_text: d.description ?? null,
    covers_model_id: d.coversModelId ?? null,
    covers_variants: variants.length > 0 ? variants : null,
    covers_combo_id: d.coversComboId ?? null,
    covers_compartment_id: d.coversCompartmentId ?? null,
  });
  if (termErr) {
    await sb.from(PRODUCT_SKUS).delete().eq("sku", sku); // unwind both
    await sb.from(PRODUCT_MODELS).delete().eq("id", modelId);
    const m = mapPgError(termErr);
    return c.json(m.body, m.status);
  }

  return c.json({ ok: true, sku, label, modelId, covers: scopeLabel }, 201);
});

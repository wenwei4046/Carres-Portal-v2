import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  createServiceCaseInputSchema,
  updateServiceCaseInputSchema,
} from "@carres/shared";
import { requireOperationOrPrincipal } from "../../lib/auth-guards";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Service Cases (SC) — migration 0210. The case / 病历 parent layer above
 * Service Notes (0140). A case classifies an issue (config-driven Case Type +
 * Status) and holds the medical fields; a printable Service Note dispatch order
 * is generated under it (P2).
 *
 * Link key is order_id (permanent). ref_no is an AutoCount alias only.
 *
 * Routes (literal paths registered BEFORE /:id so they win):
 *   GET    /config           — { types[], statuses[] } for the dropdowns
 *   GET    /lookup?ref|so     — order autofill (0/>1 matches → manual entry)
 *   GET    /                  — list (filter ?state=ongoing|closed)
 *   POST   /                  — create (auto case_no via next_case_no() RPC)
 *   GET    /:id               — detail
 *   PATCH  /:id               — update
 */

const scRouter = new Hono<AppEnv>();

const CASE_SELECT =
  "*, service_case_types(label), service_case_statuses(label,is_closed)";

// ─────────────────────────────────────────────────────────────────────────────
// GET /config — config-driven Case Type + Status (active only, sorted)
// ─────────────────────────────────────────────────────────────────────────────
scRouter.get("/config", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);

  const [{ data: types, error: tErr }, { data: statuses, error: sErr }] =
    await Promise.all([
      sb.from("service_case_types").select("*").eq("active", true).order("sort_order"),
      sb.from("service_case_statuses").select("*").eq("active", true).order("sort_order"),
    ]);

  if (tErr) throw new HTTPException(500, { message: tErr.message });
  if (sErr) throw new HTTPException(500, { message: sErr.message });

  return c.json({
    types: (types ?? []).map((t) => ({
      id: t.id, code: t.code, label: t.label, sortOrder: t.sort_order, active: t.active,
    })),
    statuses: (statuses ?? []).map((s) => ({
      id: s.id, code: s.code, label: s.label, sortOrder: s.sort_order,
      active: s.active, isClosed: s.is_closed,
    })),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /lookup?ref=CR0418 | ?so=SO-1147 — order autofill
// Ref reverse-lookup uses orders.source_ref @> ARRAY[ref] (AutoCount Ref set).
// 0 or >1 matches → { order: null, matches: N } so the UI falls back to manual.
// ─────────────────────────────────────────────────────────────────────────────
scRouter.get("/lookup", requireOperationOrPrincipal, async (c) => {
  const sb  = userClient(c.env, c.var.auth.jwt);
  const so  = (c.req.query("so")  ?? "").trim();
  const ref = (c.req.query("ref") ?? "").trim();

  const cols = "id, so, source_ref, customer_name, customer_phone, customer_address, delivery_date";
  let rows: OrderRow[] = [];

  if (so) {
    const soNum = parseInt(so.replace(/^S[O0]-?/i, ""), 10);
    if (isNaN(soNum)) return c.json({ order: null, matches: 0 });
    const { data, error } = await sb.from("orders").select(cols).eq("so", soNum);
    if (error) throw new HTTPException(500, { message: error.message });
    rows = (data ?? []) as OrderRow[];
  } else if (ref) {
    const { data, error } = await sb.from("orders").select(cols).contains("source_ref", [ref]);
    if (error) throw new HTTPException(500, { message: error.message });
    rows = (data ?? []) as OrderRow[];
  } else {
    return c.json({ order: null, matches: 0 });
  }

  if (rows.length !== 1) return c.json({ order: null, matches: rows.length });

  const ord = rows[0];
  const { data: lines } = await sb
    .from("order_lines")
    .select("id, sku, qty, source_po")
    .eq("order_id", ord.id)
    .order("created_at");

  return c.json({
    matches: 1,
    order: {
      id:              ord.id,
      so:              `SO-${ord.so}`,
      refNos:          ord.source_ref ?? [],
      customerName:    ord.customer_name ?? "",
      customerPhone:   ord.customer_phone ?? null,
      customerAddress: ord.customer_address ?? null,
      deliveryDate:    ord.delivery_date ?? null,
      lines: (lines ?? []).map((l) => ({
        id:       l.id,
        sku:      l.sku,
        qty:      l.qty,
        sourcePo: l.source_po ?? null,
      })),
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET / — list (filter ?state=ongoing|closed, derived from status.is_closed)
// ─────────────────────────────────────────────────────────────────────────────
scRouter.get("/", requireOperationOrPrincipal, async (c) => {
  const sb    = userClient(c.env, c.var.auth.jwt);
  const state = c.req.query("state"); // 'ongoing' | 'closed' | undefined

  const { data, error } = await sb
    .from("service_cases")
    .select(CASE_SELECT)
    .order("opened_at", { ascending: false })
    .order("case_no",   { ascending: false });

  if (error) throw new HTTPException(500, { message: error.message });

  let rows = (data ?? []).map(shapeCase);
  if (state === "closed")  rows = rows.filter((r) => r.statusIsClosed);
  if (state === "ongoing") rows = rows.filter((r) => !r.statusIsClosed);

  return c.json({ items: rows, total: rows.length });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST / — create (auto case_no)
// ─────────────────────────────────────────────────────────────────────────────
scRouter.post("/", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseBody(c, createServiceCaseInputSchema);
  const sb     = userClient(c.env, c.var.auth.jwt);

  const { data: caseNo, error: seqErr } = await sb.rpc("next_case_no");
  if (seqErr || !caseNo) {
    throw new HTTPException(500, { message: seqErr?.message ?? "Failed to generate case number" });
  }

  const { data: row, error: insErr } = await sb
    .from("service_cases")
    .insert({
      case_no:          caseNo,
      order_id:         parsed.orderId         ?? null,
      ref_no:           parsed.refNo           ?? null,
      customer_name:    parsed.customerName,
      customer_phone:   parsed.customerPhone   ?? null,
      customer_address: parsed.customerAddress ?? null,
      case_type_id:     parsed.caseTypeId      ?? null,
      status_id:        parsed.statusId        ?? null,
      what_happened:    parsed.whatHappened    ?? null,
      carres_action:    parsed.carresAction    ?? null,
      what_affected:    parsed.whatAffected    ?? null,
      incurred_charges: parsed.incurredCharges ?? null,
      opened_at:        parsed.openedAt        ?? new Date().toISOString().slice(0, 10),
      created_by:       c.var.auth.id,
    })
    .select("id, case_no")
    .single();

  if (insErr || !row) throw new HTTPException(500, { message: insErr?.message ?? "Insert failed" });
  return c.json({ id: row.id, caseNo: row.case_no }, 201);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /:id — detail
// ─────────────────────────────────────────────────────────────────────────────
scRouter.get("/:id", requireOperationOrPrincipal, async (c) => {
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);

  const { data: row, error } = await sb
    .from("service_cases")
    .select(CASE_SELECT)
    .eq("id", id)
    .single();

  if (error || !row) throw new HTTPException(404, { message: "Service case not found" });
  return c.json(shapeCase(row));
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /:id — update
// ─────────────────────────────────────────────────────────────────────────────
scRouter.patch("/:id", requireOperationOrPrincipal, async (c) => {
  const id     = c.req.param("id");
  const parsed = await parseBody(c, updateServiceCaseInputSchema);
  const sb     = userClient(c.env, c.var.auth.jwt);

  const patch: Record<string, unknown> = {};
  if (parsed.orderId         !== undefined) patch.order_id         = parsed.orderId;
  if (parsed.refNo           !== undefined) patch.ref_no           = parsed.refNo;
  if (parsed.customerName    !== undefined) patch.customer_name    = parsed.customerName;
  if (parsed.customerPhone   !== undefined) patch.customer_phone   = parsed.customerPhone;
  if (parsed.customerAddress !== undefined) patch.customer_address = parsed.customerAddress;
  if (parsed.caseTypeId      !== undefined) patch.case_type_id     = parsed.caseTypeId;
  if (parsed.statusId        !== undefined) patch.status_id        = parsed.statusId;
  if (parsed.whatHappened    !== undefined) patch.what_happened    = parsed.whatHappened;
  if (parsed.carresAction    !== undefined) patch.carres_action    = parsed.carresAction;
  if (parsed.whatAffected    !== undefined) patch.what_affected    = parsed.whatAffected;
  if (parsed.incurredCharges !== undefined) patch.incurred_charges = parsed.incurredCharges;
  if (parsed.openedAt        !== undefined) patch.opened_at        = parsed.openedAt;

  const { error } = await sb.from("service_cases").update(patch).eq("id", id);
  if (error) throw new HTTPException(500, { message: error.message });

  return c.json({ id });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface OrderRow {
  id: string;
  so: number;
  source_ref: string[] | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  delivery_date: string | null;
}

interface RawCase {
  id: string;
  case_no: string;
  order_id: string | null;
  ref_no: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer_address: string | null;
  case_type_id: string | null;
  status_id: string | null;
  what_happened: string | null;
  carres_action: string | null;
  what_affected: string | null;
  incurred_charges: string | null;
  opened_at: string;
  source_service_note_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  service_case_types:    { label: string } | null;
  service_case_statuses: { label: string; is_closed: boolean } | null;
}

function shapeCase(r: RawCase) {
  return {
    id:                  r.id,
    caseNo:              r.case_no,
    orderId:             r.order_id,
    refNo:               r.ref_no,
    customerName:        r.customer_name,
    customerPhone:       r.customer_phone,
    customerAddress:     r.customer_address,
    caseTypeId:          r.case_type_id,
    statusId:            r.status_id,
    whatHappened:        r.what_happened,
    carresAction:        r.carres_action,
    whatAffected:        r.what_affected,
    incurredCharges:     r.incurred_charges,
    openedAt:            r.opened_at,
    sourceServiceNoteId: r.source_service_note_id,
    createdBy:           r.created_by,
    createdAt:           r.created_at,
    updatedAt:           r.updated_at,
    caseTypeLabel:       r.service_case_types?.label ?? null,
    statusLabel:         r.service_case_statuses?.label ?? null,
    statusIsClosed:      r.service_case_statuses?.is_closed ?? false,
  };
}

async function parseBody<S extends import("zod").ZodTypeAny>(
  c: import("hono").Context<AppEnv>,
  schema: S,
): Promise<import("zod").infer<S>> {
  let body: unknown;
  try { body = await c.req.json(); }
  catch { throw new HTTPException(400, { message: "Body must be valid JSON" }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: "Invalid input: " + parsed.error.issues[0]?.message });
  }
  return parsed.data;
}

export default scRouter;

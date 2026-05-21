import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  createServiceNoteInputSchema,
  updateServiceNoteInputSchema,
} from "@carres/shared";
import { requireOperationOrPrincipal } from "../../lib/auth-guards";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Service Notes (SN) — migration 0140.
 * Every SN is a case in the Operation Issue Tracker.
 * SNs with section_a/b/c can be printed as a PDF that travels with the product.
 *
 * Routes:
 *   GET    /ready      — list (filter by status, month)
 *   POST   /           — create (auto-generates SN number via next_sn_no() RPC)
 *   GET    /:id        — full detail (includes items array)
 *   PATCH  /:id        — update (header fields, sections, status)
 *   DELETE /:id        — delete (only ongoing SNs; principal only in prod)
 */

const snRouter = new Hono<AppEnv>();

// ─────────────────────────────────────────────────────────────────────────────
// GET / — list view
// ─────────────────────────────────────────────────────────────────────────────
snRouter.get("/", requireOperationOrPrincipal, async (c) => {
  const sb   = userClient(c.env, c.var.auth.jwt);
  const status = c.req.query("status");    // 'ongoing' | 'closed' | undefined
  const month  = c.req.query("month");     // 'YYMM' e.g. '2605'

  let q = sb
    .from("service_notes")
    .select("*")
    .order("request_date", { ascending: false })
    .order("sn_no",         { ascending: false });

  if (status) q = q.eq("status", status);
  if (month)  q = q.like("sn_no", `SN${month}-%`);

  const { data, error } = await q;
  if (error) throw new HTTPException(500, { message: error.message });

  const rows = (data ?? []).map(shapeRow);
  return c.json({ items: rows, total: rows.length });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST / — create
// ─────────────────────────────────────────────────────────────────────────────
snRouter.post("/", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseBody(c, createServiceNoteInputSchema);
  const sb     = userClient(c.env, c.var.auth.jwt);

  // Allocate next SN number atomically
  const { data: snNo, error: seqErr } = await sb.rpc("next_sn_no");
  if (seqErr || !snNo) {
    throw new HTTPException(500, { message: seqErr?.message ?? "Failed to generate SN number" });
  }

  const { data: row, error: insErr } = await sb
    .from("service_notes")
    .insert({
      sn_no:            snNo,
      customer_name:    parsed.customerName,
      customer_phone:   parsed.customerPhone   ?? null,
      ref_no:           parsed.refNo           ?? null,
      customer_address: parsed.customerAddress ?? null,
      order_id:         parsed.orderId         ?? null,
      category:         parsed.category        ?? null,
      type:             parsed.type            ?? null,
      request_date:     parsed.requestDate     ?? new Date().toISOString().slice(0, 10),
      deadline:         parsed.deadline        ?? null,
      what_happened:    parsed.whatHappened    ?? null,
      section_a:        parsed.sectionA        ?? null,
      section_b:        parsed.sectionB        ?? null,
      section_c:        parsed.sectionC        ?? null,
      created_by:       c.var.auth.id,
    })
    .select()
    .single();

  if (insErr || !row) throw new HTTPException(500, { message: insErr?.message ?? "Insert failed" });

  // Insert items if provided
  if (parsed.items && parsed.items.length > 0) {
    const { error: itemsErr } = await sb.from("service_note_items").insert(
      parsed.items.map((it) => ({
        sn_id:  row.id,
        no:     it.no,
        item:   it.item,
        po_no:  it.poNo  ?? null,
        qty:    it.qty   ?? 1,
        remark: it.remark ?? null,
      }))
    );
    if (itemsErr) throw new HTTPException(500, { message: itemsErr.message });
  }

  return c.json({ id: row.id, snNo }, 201);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /lookup?so=SO-1001 — look up customer info from an order (auto-fill)
// Must be registered BEFORE /:id so the literal path wins.
// ─────────────────────────────────────────────────────────────────────────────
snRouter.get("/lookup", requireOperationOrPrincipal, async (c) => {
  const soParam = c.req.query("so") ?? "";
  const soNum = parseInt(soParam.replace(/^S[O0]-?/i, ""), 10);
  if (isNaN(soNum)) return c.json({ order: null });

  const sb = userClient(c.env, c.var.auth.jwt);

  // Step 1 — find the order
  const { data: ord, error: ordErr } = await sb
    .from("orders")
    .select("id, so, customer_name, customer_phone, customer_address")
    .eq("so", soNum)
    .single();

  if (ordErr || !ord) return c.json({ order: null });

  // Step 2 — fetch its line items
  const { data: lines } = await sb
    .from("order_lines")
    .select("id, sku, qty, attrs, source_po")
    .eq("order_id", ord.id)
    .order("created_at");

  return c.json({
    order: {
      id:              ord.id,
      so:              `SO-${ord.so}`,
      customerName:    ord.customer_name ?? "",
      customerPhone:   ord.customer_phone ?? null,
      customerAddress: ord.customer_address ?? null,
      lines: (lines ?? []).map((l) => ({
        id:       l.id,
        sku:      l.sku,
        qty:      l.qty,
        attrs:    l.attrs as Record<string, unknown> ?? {},
        sourcePo: l.source_po ?? null,
      })),
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /:id — detail (with items)
// ─────────────────────────────────────────────────────────────────────────────
snRouter.get("/:id", requireOperationOrPrincipal, async (c) => {
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);

  const [{ data: row, error: rowErr }, { data: itemRows, error: itemsErr }] =
    await Promise.all([
      sb.from("service_notes").select("*").eq("id", id).single(),
      sb.from("service_note_items").select("*").eq("sn_id", id).order("no"),
    ]);

  if (rowErr || !row)  throw new HTTPException(404, { message: "Service note not found" });
  if (itemsErr) throw new HTTPException(500, { message: itemsErr.message });

  return c.json({ ...shapeRow(row), items: (itemRows ?? []).map(shapeItem) });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /:id — update
// ─────────────────────────────────────────────────────────────────────────────
snRouter.patch("/:id", requireOperationOrPrincipal, async (c) => {
  const id     = c.req.param("id");
  const parsed = await parseBody(c, updateServiceNoteInputSchema);
  const sb     = userClient(c.env, c.var.auth.jwt);

  const patch: Record<string, unknown> = {};
  if (parsed.customerName    !== undefined) patch.customer_name    = parsed.customerName;
  if (parsed.customerPhone   !== undefined) patch.customer_phone   = parsed.customerPhone;
  if (parsed.refNo           !== undefined) patch.ref_no           = parsed.refNo;
  if (parsed.customerAddress !== undefined) patch.customer_address = parsed.customerAddress;
  if (parsed.orderId         !== undefined) patch.order_id         = parsed.orderId;
  if (parsed.category        !== undefined) patch.category         = parsed.category;
  if (parsed.type            !== undefined) patch.type             = parsed.type;
  if (parsed.requestDate     !== undefined) patch.request_date     = parsed.requestDate;
  if (parsed.deadline        !== undefined) patch.deadline         = parsed.deadline;
  if (parsed.deliveredDate   !== undefined) patch.delivered_date   = parsed.deliveredDate;
  if (parsed.whatHappened    !== undefined) patch.what_happened    = parsed.whatHappened;
  if (parsed.sectionA        !== undefined) patch.section_a        = parsed.sectionA;
  if (parsed.sectionB        !== undefined) patch.section_b        = parsed.sectionB;
  if (parsed.sectionC        !== undefined) patch.section_c        = parsed.sectionC;
  if (parsed.status          !== undefined) patch.status           = parsed.status;
  if (parsed.currentStage    !== undefined) patch.current_stage    = parsed.currentStage;

  const { error } = await sb.from("service_notes").update(patch).eq("id", id);
  if (error) throw new HTTPException(500, { message: error.message });

  // If items provided, replace them entirely
  if (parsed.items !== undefined) {
    await sb.from("service_note_items").delete().eq("sn_id", id);
    if (parsed.items.length > 0) {
      await sb.from("service_note_items").insert(
        parsed.items.map((it) => ({
          sn_id:  id,
          no:     it.no,
          item:   it.item,
          po_no:  it.poNo  ?? null,
          qty:    it.qty   ?? 1,
          remark: it.remark ?? null,
        }))
      );
    }
  }

  return c.json({ id });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface RawSn {
  id: string;
  sn_no: string;
  customer_name: string;
  customer_phone: string | null;
  ref_no: string | null;
  customer_address: string | null;
  order_id: string | null;
  category: string | null;
  type: string | null;
  request_date: string;
  deadline: string | null;
  delivered_date: string | null;
  what_happened: string | null;
  section_a: unknown;
  section_b: unknown;
  section_c: unknown;
  photos: string[];
  status: "ongoing" | "closed";
  current_stage: "collected" | "with_supplier" | "supplier_done" | "scheduled";
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface RawItem {
  id: string;
  sn_id: string;
  no: number;
  item: string;
  po_no: string | null;
  qty: number;
  remark: string | null;
}

function shapeRow(r: RawSn) {
  return {
    id:              r.id,
    snNo:            r.sn_no,
    customerName:    r.customer_name,
    customerPhone:   r.customer_phone,
    refNo:           r.ref_no,
    customerAddress: r.customer_address,
    orderId:         r.order_id,
    category:        r.category,
    type:            r.type,
    requestDate:     r.request_date,
    deadline:        r.deadline,
    deliveredDate:   r.delivered_date,
    whatHappened:    r.what_happened,
    sectionA:        r.section_a ?? null,
    sectionB:        r.section_b ?? null,
    sectionC:        r.section_c ?? null,
    photos:          r.photos ?? [],
    status:          r.status,
    currentStage:    r.current_stage ?? "collected",
    createdBy:       r.created_by,
    createdAt:       r.created_at,
    updatedAt:       r.updated_at,
  };
}

function shapeItem(r: RawItem) {
  return {
    id:     r.id,
    no:     r.no,
    item:   r.item,
    poNo:   r.po_no,
    qty:    r.qty,
    remark: r.remark,
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

export default snRouter;

import { Hono } from "hono";
import { z } from "zod";
import { mapPgError } from "../../lib/route-helpers";
import { requireOps } from "../../lib/auth-guards";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Ops Panel — AutoCount order import + inbox (Jess COO 2026-05-14).
 *
 * Endpoints:
 *   POST /api/ops/orders/import   — bulk upsert from parsed Excel JSON
 *   GET  /api/ops/orders/inbox    — list staged orders (filter by status/logistic)
 *   POST /api/ops/orders/:ref/assign-logistic — ops final logistic decision
 *   POST /api/ops/orders/:ref/status — update ops_status
 *
 * De-dup rule on import: same `ref` UPSERTS. Re-import refreshes
 * customer/address/balance/items BUT preserves `ops_assigned_logistic`
 * (and assigned_at/assigned_by). Sales staff's AutoCount-entered logistic
 * lands in `import_source_logistic` for audit.
 */
const opsOrdersRouter = new Hono<AppEnv>();
opsOrdersRouter.use("*", requireOps);

// -----------------------------------------------------------------------------
// Schema — parsed AutoCount Listing.xlsx row shape (one row per line item).
// Client (OrderImport page) does the XLSX parse + sends JSON to keep Workers
// bundle small (no server-side xlsx dependency).
// -----------------------------------------------------------------------------
const lineSchema = z.object({
  ref: z.string().min(1).max(64),
  itemGroup: z.string().nullable().optional(),
  qty: z.number().int().nonnegative(),
  description: z.string().nullable().optional(),
  poDocNo: z.string().nullable().optional(),
  // Customer + delivery — repeated per line in Excel; we collapse to one row
  // per ref using the first non-empty value.
  customerName: z.string().nullable().optional(),
  customerPhone: z.string().nullable().optional(),
  deliveryAddress1: z.string().nullable().optional(),
  deliveryAddress2: z.string().nullable().optional(),
  deliveryAddress3: z.string().nullable().optional(),
  deliveryAddress4: z.string().nullable().optional(),
  deliveryLocation: z.string().nullable().optional(),
  deliveryDateRequested: z.string().nullable().optional(), // ISO date string
  balanceRaw: z.string().nullable().optional(),
  orderDate: z.string().nullable().optional(),
  importSourceLogistic: z.string().nullable().optional(),
});

const importInput = z.object({
  sourceFilename: z.string().max(255).optional(),
  rows: z.array(lineSchema).min(1).max(20000),
});

// Parse "RM3322 Paid" / "RM2748" / null → { amount, status }
function parseBalance(raw: string | null | undefined): { amount: number | null; status: string | null } {
  if (!raw) return { amount: null, status: null };
  const trimmed = raw.trim();
  const amountMatch = trimmed.match(/RM\s*([\d,]+(?:\.\d+)?)/i);
  const amount = amountMatch ? Number(amountMatch[1].replace(/,/g, "")) : null;
  const status = /paid/i.test(trimmed) ? "paid" : amount && amount > 0 ? "pending" : null;
  return { amount: Number.isFinite(amount ?? NaN) ? amount : null, status };
}

opsOrdersRouter.post("/import", async (c) => {
  const auth = c.var.auth;
  const raw = await c.req.json().catch(() => ({}));
  const parsed = importInput.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_input",
        code: "invalid_param",
        message: parsed.error.issues[0]?.message ?? "invalid input",
      },
      422,
    );
  }

  // Group rows by ref. Each ref → one ops_imported_orders row with items array.
  type Grouped = {
    ref: string;
    customer_name: string;
    customer_phone: string | null;
    delivery_address_1: string | null;
    delivery_address_2: string | null;
    delivery_address_3: string | null;
    delivery_address_4: string | null;
    delivery_location: string | null;
    delivery_date_requested: string | null;
    balance_raw: string | null;
    balance_amount: number | null;
    balance_status: string | null;
    order_date: string | null;
    import_source_logistic: string | null;
    items: { itemGroup: string | null; qty: number; description: string | null; poDocNo: string | null }[];
    total_qty: number;
  };
  const grouped = new Map<string, Grouped>();
  for (const r of parsed.data.rows) {
    const existing = grouped.get(r.ref);
    const itemRow = {
      itemGroup: r.itemGroup ?? null,
      qty: r.qty,
      description: r.description ?? null,
      poDocNo: r.poDocNo ?? null,
    };
    if (existing) {
      existing.items.push(itemRow);
      existing.total_qty += r.qty;
      // First-non-empty wins for header fields.
      if (!existing.customer_name && r.customerName) existing.customer_name = r.customerName;
      if (!existing.customer_phone && r.customerPhone) existing.customer_phone = r.customerPhone;
      if (!existing.delivery_address_1 && r.deliveryAddress1) existing.delivery_address_1 = r.deliveryAddress1;
      if (!existing.delivery_address_2 && r.deliveryAddress2) existing.delivery_address_2 = r.deliveryAddress2;
      if (!existing.delivery_address_3 && r.deliveryAddress3) existing.delivery_address_3 = r.deliveryAddress3;
      if (!existing.delivery_address_4 && r.deliveryAddress4) existing.delivery_address_4 = r.deliveryAddress4;
      if (!existing.delivery_location && r.deliveryLocation) existing.delivery_location = r.deliveryLocation;
      if (!existing.delivery_date_requested && r.deliveryDateRequested)
        existing.delivery_date_requested = r.deliveryDateRequested;
      if (!existing.balance_raw && r.balanceRaw) {
        existing.balance_raw = r.balanceRaw;
        const parsed = parseBalance(r.balanceRaw);
        existing.balance_amount = parsed.amount;
        existing.balance_status = parsed.status;
      }
      if (!existing.order_date && r.orderDate) existing.order_date = r.orderDate;
      if (!existing.import_source_logistic && r.importSourceLogistic)
        existing.import_source_logistic = r.importSourceLogistic;
    } else {
      const bal = parseBalance(r.balanceRaw);
      grouped.set(r.ref, {
        ref: r.ref,
        customer_name: r.customerName ?? "(unknown)",
        customer_phone: r.customerPhone ?? null,
        delivery_address_1: r.deliveryAddress1 ?? null,
        delivery_address_2: r.deliveryAddress2 ?? null,
        delivery_address_3: r.deliveryAddress3 ?? null,
        delivery_address_4: r.deliveryAddress4 ?? null,
        delivery_location: r.deliveryLocation ?? null,
        delivery_date_requested: r.deliveryDateRequested ?? null,
        balance_raw: r.balanceRaw ?? null,
        balance_amount: bal.amount,
        balance_status: bal.status,
        order_date: r.orderDate ?? null,
        import_source_logistic: r.importSourceLogistic ?? null,
        items: [itemRow],
        total_qty: r.qty,
      });
    }
  }

  const sb = userClient(c.env, auth.jwt);

  // Create batch row first so each upsert can reference it.
  const batchRes = await sb
    .from("ops_import_batches")
    .insert({
      source_filename: parsed.data.sourceFilename ?? null,
      rows_in_file: parsed.data.rows.length,
      orders_created: 0,
      orders_updated: 0,
      imported_by: auth.id,
      imported_by_name: auth.email,
    })
    .select()
    .single();
  if (batchRes.error) {
    const m = mapPgError(batchRes.error);
    return c.json(m.body, m.status);
  }
  const batchId = batchRes.data.id;

  // Check which refs already exist so we can count created vs updated AND
  // preserve their ops_assigned_logistic.
  const refs = [...grouped.keys()];
  const existingRes = await sb
    .from("ops_imported_orders")
    .select("ref, ops_assigned_logistic, ops_assigned_at, ops_assigned_by, ops_status, ops_remark, first_imported_at, items_edited, items, total_qty")
    .in("ref", refs);
  if (existingRes.error) {
    const m = mapPgError(existingRes.error);
    return c.json(m.body, m.status);
  }
  const existingMap = new Map<string, NonNullable<typeof existingRes.data>[number]>();
  for (const row of existingRes.data ?? []) existingMap.set(row.ref, row);

  // Build the upsert rows, preserving ops-set fields when present.
  const upserts = [...grouped.values()].map((g) => {
    const ex = existingMap.get(g.ref);
    // Portal wins: if ops staff has manually edited items, keep their version.
    const itemsEdited = ex?.items_edited ?? false;
    return {
      ref: g.ref,
      customer_name: g.customer_name,
      customer_phone: g.customer_phone,
      delivery_address_1: g.delivery_address_1,
      delivery_address_2: g.delivery_address_2,
      delivery_address_3: g.delivery_address_3,
      delivery_address_4: g.delivery_address_4,
      delivery_location: g.delivery_location,
      delivery_date_requested: g.delivery_date_requested,
      balance_raw: g.balance_raw,
      balance_amount: g.balance_amount,
      balance_status: g.balance_status,
      items: itemsEdited ? ex!.items : g.items,
      total_qty: itemsEdited ? ex!.total_qty : g.total_qty,
      items_edited: itemsEdited,
      order_date: g.order_date,
      import_source_logistic: g.import_source_logistic,
      // PRESERVE ops decisions across re-imports.
      ops_assigned_logistic: ex?.ops_assigned_logistic ?? null,
      ops_assigned_at: ex?.ops_assigned_at ?? null,
      ops_assigned_by: ex?.ops_assigned_by ?? null,
      ops_status: ex?.ops_status ?? "inbox",
      ops_remark: ex?.ops_remark ?? null,
      first_imported_at: ex?.first_imported_at ?? new Date().toISOString(),
      last_imported_at: new Date().toISOString(),
      last_imported_batch_id: batchId,
      imported_by: auth.id,
    };
  });

  const upsertRes = await sb
    .from("ops_imported_orders")
    .upsert(upserts, { onConflict: "ref" });
  if (upsertRes.error) {
    const m = mapPgError(upsertRes.error);
    return c.json(m.body, m.status);
  }

  const created = upserts.filter((u) => !existingMap.has(u.ref)).length;
  const updated = upserts.length - created;

  await sb
    .from("ops_import_batches")
    .update({ orders_created: created, orders_updated: updated })
    .eq("id", batchId);

  // Activity log.
  await sb.from("ops_activity_log").insert({
    actor_id: auth.id,
    actor_name: auth.email,
    module: "order_import",
    action: "import_batch",
    entity_type: "import_batch",
    entity_ref: batchId,
    summary: `Imported ${parsed.data.rows.length} rows → ${created} new orders, ${updated} updated`,
    details: { sourceFilename: parsed.data.sourceFilename, ordersCreated: created, ordersUpdated: updated },
  });

  return c.json({
    batchId,
    rowsInFile: parsed.data.rows.length,
    ordersCreated: created,
    ordersUpdated: updated,
  });
});

// -----------------------------------------------------------------------------
// GET /inbox — list staged orders. Filters: status (default "inbox"+"assigned"),
// optional logistic filter, optional q (search ref/customer).
// -----------------------------------------------------------------------------
opsOrdersRouter.get("/inbox", async (c) => {
  const auth = c.var.auth;
  const status = c.req.query("status"); // comma-separated or null
  const logistic = c.req.query("logistic");
  const q = c.req.query("q");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "200", 10) || 200, 1000);

  const sb = userClient(c.env, auth.jwt);
  let query = sb
    .from("ops_imported_orders")
    .select("*")
    .order("last_imported_at", { ascending: false })
    .limit(limit);
  if (status) {
    const statuses = status.split(",").filter(Boolean);
    if (statuses.length > 0) query = query.in("ops_status", statuses);
  }
  if (logistic) query = query.eq("ops_assigned_logistic", logistic);
  if (q) {
    const like = `%${q}%`;
    query = query.or(`ref.ilike.${like},customer_name.ilike.${like}`);
  }
  const { data, error } = await query;
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ orders: data ?? [] });
});

// -----------------------------------------------------------------------------
// POST /:ref/assign-logistic — ops's final logistic decision.
// -----------------------------------------------------------------------------
const assignInput = z.object({
  logistic: z.string().min(1).max(64),
  remark: z.string().max(500).optional(),
});

opsOrdersRouter.post("/:ref/assign-logistic", async (c) => {
  const auth = c.var.auth;
  const ref = c.req.param("ref");
  const raw = await c.req.json().catch(() => ({}));
  const parsed = assignInput.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_input",
        code: "invalid_param",
        message: parsed.error.issues[0]?.message ?? "invalid input",
      },
      422,
    );
  }

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("ops_imported_orders")
    .update({
      ops_assigned_logistic: parsed.data.logistic,
      ops_assigned_at: new Date().toISOString(),
      ops_assigned_by: auth.id,
      ops_status: "assigned",
      ops_remark: parsed.data.remark ?? null,
    })
    .eq("ref", ref)
    .select()
    .single();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }

  await sb.from("ops_activity_log").insert({
    actor_id: auth.id,
    actor_name: auth.email,
    module: "orders",
    action: "assign_logistic",
    entity_type: "order",
    entity_ref: ref,
    summary: `Assigned ${parsed.data.logistic} to ${ref}`,
    details: { logistic: parsed.data.logistic, remark: parsed.data.remark ?? null },
  });

  return c.json({ order: data });
});

// -----------------------------------------------------------------------------
// POST /:ref/status — update ops_status (e.g. ready / dispatched / delivered).
// -----------------------------------------------------------------------------
const statusInput = z.object({
  status: z.enum([
    "inbox",
    "assigned",
    "awaiting_stock",
    "ready",
    "dispatched",
    "delivered",
    "on_hold",
    "cancelled",
  ]),
  remark: z.string().max(500).optional(),
});

opsOrdersRouter.post("/:ref/status", async (c) => {
  const auth = c.var.auth;
  const ref = c.req.param("ref");
  const raw = await c.req.json().catch(() => ({}));
  const parsed = statusInput.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_input",
        code: "invalid_param",
        message: parsed.error.issues[0]?.message ?? "invalid input",
      },
      422,
    );
  }

  const sb = userClient(c.env, auth.jwt);
  const updateFields: Record<string, unknown> = { ops_status: parsed.data.status };
  if (parsed.data.remark !== undefined) updateFields.ops_remark = parsed.data.remark;

  const { data, error } = await sb
    .from("ops_imported_orders")
    .update(updateFields)
    .eq("ref", ref)
    .select()
    .single();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }

  await sb.from("ops_activity_log").insert({
    actor_id: auth.id,
    actor_name: auth.email,
    module: "orders",
    action: "status_change",
    entity_type: "order",
    entity_ref: ref,
    summary: `${ref} → ${parsed.data.status}`,
    details: { status: parsed.data.status, remark: parsed.data.remark ?? null },
  });

  return c.json({ order: data });
});

// -----------------------------------------------------------------------------
// PATCH /:ref/annotation — partial update of the Excel-style annotation fields
// (customer_request, carres_remark, action_for_logistic, logistic_remark,
// logistic_eta, delivery_time_slot). Each field is independently optional —
// passing `null` clears it, omitting it leaves it unchanged.
// -----------------------------------------------------------------------------
const annotationInput = z.object({
  // Ops notes
  customerRequest: z.string().nullable().optional(),
  carresRemark: z.string().nullable().optional(),
  actionForLogistic: z.string().nullable().optional(),
  warehouseNote: z.string().nullable().optional(),
  logisticRemark: z.string().nullable().optional(),
  logisticEta: z.string().nullable().optional(),
  deliveryTimeSlot: z.string().nullable().optional(),
  // Customer & delivery corrections (typo fixes — re-import will overwrite unless items_edited set)
  customerPhone: z.string().max(30).nullable().optional(),
  deliveryLocation: z.string().max(120).nullable().optional(),
  deliveryDateRequested: z.string().nullable().optional(),
  deliveryAddress1: z.string().max(200).nullable().optional(),
  deliveryAddress2: z.string().max(200).nullable().optional(),
  deliveryAddress3: z.string().max(200).nullable().optional(),
  deliveryAddress4: z.string().max(200).nullable().optional(),
});

opsOrdersRouter.patch("/:ref/annotation", async (c) => {
  const auth = c.var.auth;
  const ref = c.req.param("ref");
  const raw = await c.req.json().catch(() => ({}));
  const parsed = annotationInput.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_input",
        code: "invalid_param",
        message: parsed.error.issues[0]?.message ?? "invalid input",
      },
      422,
    );
  }

  const updateFields: Record<string, unknown> = {};
  if (parsed.data.customerRequest !== undefined)
    updateFields.ops_customer_request = parsed.data.customerRequest;
  if (parsed.data.carresRemark !== undefined)
    updateFields.ops_carres_remark = parsed.data.carresRemark;
  if (parsed.data.actionForLogistic !== undefined)
    updateFields.ops_action_for_logistic = parsed.data.actionForLogistic;
  if (parsed.data.warehouseNote !== undefined)
    updateFields.ops_warehouse_note = parsed.data.warehouseNote;
  if (parsed.data.logisticRemark !== undefined)
    updateFields.ops_logistic_remark = parsed.data.logisticRemark;
  if (parsed.data.logisticEta !== undefined) updateFields.ops_logistic_eta = parsed.data.logisticEta;
  if (parsed.data.deliveryTimeSlot !== undefined)
    updateFields.ops_delivery_time_slot = parsed.data.deliveryTimeSlot;
  if (parsed.data.customerPhone !== undefined) updateFields.customer_phone = parsed.data.customerPhone;
  if (parsed.data.deliveryLocation !== undefined) updateFields.delivery_location = parsed.data.deliveryLocation;
  if (parsed.data.deliveryDateRequested !== undefined)
    updateFields.delivery_date_requested = parsed.data.deliveryDateRequested;
  if (parsed.data.deliveryAddress1 !== undefined) updateFields.delivery_address_1 = parsed.data.deliveryAddress1;
  if (parsed.data.deliveryAddress2 !== undefined) updateFields.delivery_address_2 = parsed.data.deliveryAddress2;
  if (parsed.data.deliveryAddress3 !== undefined) updateFields.delivery_address_3 = parsed.data.deliveryAddress3;
  if (parsed.data.deliveryAddress4 !== undefined) updateFields.delivery_address_4 = parsed.data.deliveryAddress4;

  if (Object.keys(updateFields).length === 0) {
    return c.json({ error: "no_fields_to_update" }, 422);
  }

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("ops_imported_orders")
    .update(updateFields)
    .eq("ref", ref)
    .select()
    .single();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }

  await sb.from("ops_activity_log").insert({
    actor_id: auth.id,
    actor_name: auth.email,
    module: "orders",
    action: "annotation_update",
    entity_type: "order",
    entity_ref: ref,
    summary: `Updated annotations on ${ref}`,
    details: { fields: Object.keys(updateFields) },
  });

  return c.json({ order: data });
});

// -----------------------------------------------------------------------------
// PUT /:ref/items — ops staff manually replaces the items array.
// Sets items_edited=true so re-import won't overwrite (portal wins AutoCount).
// -----------------------------------------------------------------------------
const itemLineSchema = z.object({
  itemGroup: z.string().nullable().optional(),
  qty: z.number().int().nonnegative(),
  description: z.string().nullable().optional(),
  poDocNo: z.string().nullable().optional(),
  remark: z.string().max(500).nullable().optional(),
});

const itemsInput = z.object({
  items: z.array(itemLineSchema).min(1).max(200),
});

opsOrdersRouter.put("/:ref/items", async (c) => {
  const auth = c.var.auth;
  const ref = c.req.param("ref");
  const raw = await c.req.json().catch(() => ({}));
  const parsed = itemsInput.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_input",
        code: "invalid_param",
        message: parsed.error.issues[0]?.message ?? "invalid input",
      },
      422,
    );
  }

  const items = parsed.data.items;
  const total_qty = items.reduce((s, i) => s + i.qty, 0);

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("ops_imported_orders")
    .update({ items, total_qty, items_edited: true })
    .eq("ref", ref)
    .select()
    .single();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }

  await sb.from("ops_activity_log").insert({
    actor_id: auth.id,
    actor_name: auth.email,
    module: "orders",
    action: "items_edited",
    entity_type: "order",
    entity_ref: ref,
    summary: `Items manually edited on ${ref} (${items.length} lines, ${total_qty} pcs)`,
    details: { items },
  });

  return c.json({ order: data });
});

export default opsOrdersRouter;

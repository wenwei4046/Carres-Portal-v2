import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  Adapters,
  DB,
  createOrderInputSchema,
  orderSchema,
  ordersListResponseSchema,
  orderStatusSchema,
} from "@carres/shared";
import { userClient } from "../lib/supabase";
import type { AppEnv } from "../types";

const ordersRouter = new Hono<AppEnv>();

const listQuerySchema = z.object({
  status: orderStatusSchema.optional(),
  outletId: z.string().uuid().optional(),
  salespersonId: z.string().uuid().optional(),
  // Accepted but ignored for dealer/salesperson — RLS does the right thing.
  // Phase 3 (Principal) will use this for cross-dealer filtering.
  dealerId: z.string().uuid().optional(),
});

ordersRouter.get("/", async (c) => {
  const auth = c.var.auth;
  const parsed = listQuerySchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
  if (!parsed.success) {
    throw new HTTPException(400, { message: "Invalid query: " + parsed.error.issues[0]?.message });
  }
  const { status, outletId, salespersonId, dealerId } = parsed.data;

  const sb = userClient(c.env, auth.jwt);
  // PostgREST: select.eq*.order — .order() ends the chain (returns awaitable).
  // We embed minimal `unit_price/qty` from order_lines + order_addons so the
  // dashboard can show the per-card RM total and the monthly-spend subtitle
  // without an extra round-trip per order. Stair carry is intentionally
  // EXCLUDED here (matches the prototype's `monthValue` definition which sums
  // line+addon only — stair is a delivery-time concern, not a sales metric).
  let q = sb.from("orders").select(
    "*, line_count:order_lines(count), order_lines(unit_price, qty), order_addons(unit_price, qty)",
  );

  if (status) q = q.eq("status", status);
  if (outletId) q = q.eq("outlet_id", outletId);
  if (salespersonId) q = q.eq("salesperson_id", salespersonId);
  // Principal/internal roles can filter by a specific dealer; dealer/salesperson
  // scope is forced by RLS regardless of what they pass.
  if (
    dealerId &&
    (auth.role === "principal" ||
      auth.role === "logistics" ||
      auth.role === "finance" ||
      auth.role === "bd")
  ) {
    q = q.eq("dealer_id", dealerId);
  }

  const { data, error } = await q.order("placed_at", { ascending: false });
  if (error) throw new HTTPException(500, { message: error.message });

  const orders = (data ?? []).map((row) => {
    const r = row as DB.OrderRow & {
      line_count?: Array<{ count: number }>;
      order_lines?: Array<{ unit_price: string | number; qty: number }>;
      order_addons?: Array<{ unit_price: string | number; qty: number }>;
    };
    const lineCount = r.line_count?.[0]?.count ?? 0;
    const lineTotal = (r.order_lines ?? []).reduce(
      (s, l) => s + Number(l.unit_price) * l.qty,
      0,
    );
    const addonTotal = (r.order_addons ?? []).reduce(
      (s, a) => s + Number(a.unit_price) * a.qty,
      0,
    );
    return {
      ...Adapters.orderFromRow(r),
      lineCount,
      totalAmount: lineTotal + addonTotal,
    };
  });

  const body = ordersListResponseSchema.parse({ orders, total: orders.length });
  return c.json(body);
});

/**
 * POST /api/orders — atomic create via RPC `create_order(payload jsonb)`.
 *
 * Flow:
 *   1. Verify caller is dealer/salesperson/internal (middleware sets c.var.auth)
 *   2. Validate camelCase input with zod
 *   3. Adapter converts → snake_case jsonb RPC payload (+ injects dealerId from JWT)
 *   4. Call RPC — atomic insert across 5 tables (orders + lines + addons +
 *      history + audit_log). If anything fails, Postgres rolls back the whole TX.
 *   5. Re-fetch the inserted order with rels (same shape as GET /:id) so the
 *      client can route directly to /dealer/orders/:id without a second fetch.
 *
 * Cross-dealer guard: input has no `dealerId` field; the API derives it from
 * the JWT. The RPC also re-checks via SECURITY DEFINER manual check, so even
 * a hand-crafted payload can't sneak through.
 */
ordersRouter.post("/", async (c) => {
  const auth = c.var.auth;

  if (auth.role !== "dealer" && auth.role !== "salesperson" && auth.role !== "principal" &&
      auth.role !== "logistics" && auth.role !== "finance" && auth.role !== "bd") {
    throw new HTTPException(403, { message: "Role cannot create orders" });
  }
  if ((auth.role === "dealer" || auth.role === "salesperson") && !auth.dealerId) {
    throw new HTTPException(403, { message: "Dealer scope missing on JWT" });
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Body must be valid JSON" });
  }

  const parsed = createOrderInputSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: "Invalid order input: " + parsed.error.issues[0]?.message,
    });
  }
  if (!auth.dealerId) {
    // Internal roles (principal/logistics/finance/bd) creating on behalf of a
    // dealer must Phase 3 — for 2B only dealers/salespersons create.
    throw new HTTPException(403, { message: "Phase 2B only supports dealer-self order creation" });
  }

  // Storage path guard: the wizard uploads attachments directly to Supabase
  // Storage with the user JWT before calling this endpoint. Storage RLS
  // gates the WRITE side (dealer can only upload to their own folder), but the
  // path string we receive here is just data — a malicious payload could point
  // at another dealer's folder. Without this check, an internal role rendering
  // the order detail (which has read-all on storage) would see an attachment
  // belonging to a different dealer. Reject any path outside the caller's
  // dealer folder before we persist it.
  const expectedPrefix = `orders-attachments/${auth.dealerId}/`;
  if (!parsed.data.signaturePath.startsWith(expectedPrefix)) {
    throw new HTTPException(400, {
      message: "signaturePath must be inside your dealer folder",
    });
  }
  if (
    parsed.data.paymentSlipPath &&
    !parsed.data.paymentSlipPath.startsWith(expectedPrefix)
  ) {
    throw new HTTPException(400, {
      message: "paymentSlipPath must be inside your dealer folder",
    });
  }

  const payload = Adapters.orderInputToRpcPayload(parsed.data, auth.dealerId);

  const sb = userClient(c.env, auth.jwt);
  const { data: created, error } = await sb.rpc("create_order", { payload });
  if (error) {
    // 42501 = manual cross-dealer check inside the RPC. We map to 403 so the
    // client sees the same code as RLS-denied reads.
    if (error.code === "42501" || /forbidden/i.test(error.message ?? "")) {
      throw new HTTPException(403, { message: "Forbidden" });
    }
    if (error.code === "22023") {
      throw new HTTPException(400, { message: error.message });
    }
    throw new HTTPException(500, { message: error.message });
  }

  const id = (created as { id: string } | null)?.id;
  if (!id) throw new HTTPException(500, { message: "RPC did not return an order id" });

  // Compose full response — same shape as GET /:id (lines + addons + history).
  const { data: full, error: fetchErr } = await sb
    .from("orders")
    .select("*, order_lines(*), order_addons(*), order_history(*)")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) throw new HTTPException(500, { message: fetchErr.message });
  if (!full) throw new HTTPException(500, { message: "Order created but not readable" });

  const row = full as DB.OrderRow & {
    order_lines?: DB.OrderLineRow[];
    order_addons?: DB.OrderAddonRow[];
    order_history?: DB.OrderHistoryRow[];
  };
  const order = Adapters.orderFromRow(row, {
    lines: row.order_lines ?? [],
    addons: row.order_addons ?? [],
    history: row.order_history ?? [],
  });
  return c.json(orderSchema.parse(order), 201);
});

/**
 * Storage path → signed URL with 1h TTL. Persisted column stores
 * `orders-attachments/{dealer_id}/{wizard_uuid}/file.ext`; createSignedUrl
 * wants the path *within* the bucket, so we strip the bucket prefix.
 *
 * Returns null when the input is null or the path doesn't begin with the
 * expected bucket. We never reveal whether an unsigned path was malformed
 * vs. genuinely missing — the caller just sees a missing URL field, same
 * as if the dealer never uploaded one.
 */
const ATTACHMENTS_BUCKET = "orders-attachments";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

async function signAttachment(
  sb: ReturnType<typeof userClient>,
  pathWithBucket: string | null,
): Promise<string | null> {
  if (!pathWithBucket) return null;
  const prefix = `${ATTACHMENTS_BUCKET}/`;
  if (!pathWithBucket.startsWith(prefix)) return null;
  const objectKey = pathWithBucket.slice(prefix.length);
  const { data, error } = await sb.storage
    .from(ATTACHMENTS_BUCKET)
    .createSignedUrl(objectKey, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

ordersRouter.get("/:id", async (c) => {
  const auth = c.var.auth;
  const id = c.req.param("id");
  const idCheck = z.string().uuid().safeParse(id);
  if (!idCheck.success) throw new HTTPException(404, { message: "Order not found" });

  const sb = userClient(c.env, auth.jwt);
  // PostgREST nested syntax: 1 round-trip pulls order + lines + addons + history.
  // Each child table has its own RLS policy that mirrors the parent — so child
  // rows are visible iff the parent is.
  const { data, error } = await sb
    .from("orders")
    .select("*, order_lines(*), order_addons(*), order_history(*)")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new HTTPException(500, { message: error.message });
  // Same message whether the row genuinely doesn't exist or is RLS-hidden — we
  // never reveal which.
  if (!data) throw new HTTPException(404, { message: "Order not found" });

  const row = data as DB.OrderRow & {
    order_lines?: DB.OrderLineRow[];
    order_addons?: DB.OrderAddonRow[];
    order_history?: DB.OrderHistoryRow[];
  };
  const order = Adapters.orderFromRow(row, {
    lines: row.order_lines ?? [],
    addons: row.order_addons ?? [],
    history: row.order_history ?? [],
  });

  // Replace raw Storage paths with 1h signed URLs so the client can render
  // <img src=> directly. Stored DB values stay as paths — RLS still gates
  // who can sign them, so an internal viewer reading another dealer's order
  // gets a properly signed URL only when their RLS policy allows it.
  const [signatureUrl, paymentSlipUrl] = await Promise.all([
    signAttachment(sb, order.signatureUrl),
    signAttachment(sb, order.paymentSlipUrl),
  ]);
  const signed = { ...order, signatureUrl, paymentSlipUrl };

  return c.json(orderSchema.parse(signed));
});

export default ordersRouter;

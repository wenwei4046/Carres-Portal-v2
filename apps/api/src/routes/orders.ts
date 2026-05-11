import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  Adapters,
  DB,
  cancelOrderInputSchema,
  createOrderInputSchema,
  isProceedBlockerCode,
  orderSchema,
  ordersListResponseSchema,
  orderStatusSchema,
  setOrderAddressInputSchema,
  setOrderDateInputSchema,
  topUpOrderInputSchema,
  updateOrderInputSchema,
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
    return {
      ...Adapters.orderFromRow(r),
      lineCount: r.line_count?.[0]?.count ?? 0,
      totalAmount: computeTotalFromLines(r.order_lines, r.order_addons),
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

  if (auth.role !== "dealer" && auth.role !== "salesperson" && auth.role !== "showroom" &&
      auth.role !== "principal" && auth.role !== "logistics" &&
      auth.role !== "finance" && auth.role !== "bd") {
    throw new HTTPException(403, { message: "Role cannot create orders" });
  }
  if ((auth.role === "dealer" || auth.role === "salesperson" || auth.role === "showroom") && !auth.dealerId) {
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
      // Loo 2026-05-11 (migration 0089) — surface the new category mutex
      // detail to the client as a typed code so the UI can toast a friendly
      // message instead of the raw RPC error string. Other 22023s stay on
      // the generic 400 path (pre-existing contract).
      const detail = (error as { details?: string }).details;
      if (detail === "mixed_category_lines") {
        return c.json(
          {
            error: "rule_violation",
            code: "mixed_category_lines",
            message: "Sofa cannot mix with mattress or bed frame in the same order. Please place them as separate Sales Orders.",
          },
          422,
        );
      }
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

/**
 * Compute the same totalAmount the list endpoint exposes (line + addon, no
 * stair). Detail + proceed responses include this so client-side helpers
 * (`proceedBlockers`, action panel) read the same value across views without
 * re-summing nested arrays.
 */
function computeTotalFromLines(
  lines: Array<{ unit_price: string | number; qty: number }> | undefined,
  addons: Array<{ unit_price: string | number; qty: number }> | undefined,
): number {
  const lineTotal = (lines ?? []).reduce(
    (s, l) => s + Number(l.unit_price) * l.qty,
    0,
  );
  const addonTotal = (addons ?? []).reduce(
    (s, a) => s + Number(a.unit_price) * a.qty,
    0,
  );
  return lineTotal + addonTotal;
}

/**
 * Re-fetch an order with its rels, sign attachment URLs, attach totalAmount,
 * and return a fully-shaped Order JSON. Used by every mutation route
 * (create / proceed / top-up / address / date / edit) so callers always get
 * the same shape they would from GET /:id.
 *
 * Throws HTTPException 500 if Supabase errors, 404 if the row is RLS-hidden
 * or genuinely missing.
 */
async function fetchAndShapeOrder(
  sb: ReturnType<typeof userClient>,
  id: string,
): Promise<unknown> {
  const { data, error: fetchErr } = await sb
    .from("orders")
    .select("*, order_lines(*), order_addons(*), order_history(*)")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) throw new HTTPException(500, { message: fetchErr.message });
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
  const [signatureUrl, paymentSlipUrl] = await Promise.all([
    signAttachment(sb, order.signatureUrl),
    signAttachment(sb, order.paymentSlipUrl),
  ]);
  const totalAmount = computeTotalFromLines(row.order_lines, row.order_addons);
  return orderSchema.parse({ ...order, signatureUrl, paymentSlipUrl, totalAmount });
}

/**
 * Validates that a Storage path lives inside the caller's dealer folder.
 * Returns the same `400 path-outside-folder` error the create route uses.
 * Inline-callable from any mutation route that accepts upload paths.
 */
function assertDealerOwnedPath(path: string, dealerId: string, fieldName: string) {
  const expectedPrefix = `orders-attachments/${dealerId}/`;
  if (!path.startsWith(expectedPrefix)) {
    throw new HTTPException(400, {
      message: `${fieldName} must be inside your dealer folder`,
    });
  }
}

/**
 * POST /api/orders/:id/proceed — atomic Place→Proceed transition via the
 * `proceed_order(uuid)` RPC defined in 0008.
 *
 * Error contract (matches RPC's RAISE EXCEPTION codes):
 *   • 42501 (forbidden)            → 403
 *   • 42P01 (order_not_found)      → 404
 *   • 22023 (wrong_status)         → 422 { code: "wrong_status" }
 *   • P0001 (blocker validation)   → 422 { code: <ProceedBlockerCode> }
 *   • anything else                → 500
 *
 * On success we re-fetch the full order (lines + addons + history) and sign
 * the attachment URLs so the client gets the same shape as GET /:id.
 */
ordersRouter.post("/:id/proceed", async (c) => {
  const auth = c.var.auth;
  const id = c.req.param("id");
  const idCheck = z.string().uuid().safeParse(id);
  if (!idCheck.success) throw new HTTPException(404, { message: "Order not found" });

  if (
    auth.role !== "dealer" && auth.role !== "salesperson" && auth.role !== "showroom" &&
    auth.role !== "principal" && auth.role !== "logistics" &&
    auth.role !== "finance" && auth.role !== "bd"
  ) {
    throw new HTTPException(403, { message: "Role cannot proceed orders" });
  }

  const sb = userClient(c.env, auth.jwt);
  const { error: rpcError } = await sb.rpc("proceed_order", { p_order_id: id });

  if (rpcError) {
    const sqlstate = rpcError.code;
    // PostgreSQL DETAIL field round-trips through PostgREST as `details`. The
    // RPC always sets it to one of our PROCEED_BLOCKER_CODES (or 'wrong_status').
    const detailCode = isProceedBlockerCode(rpcError.details) ? rpcError.details : null;

    if (sqlstate === "42501") {
      throw new HTTPException(403, { message: "Forbidden" });
    }
    if (sqlstate === "42P01") {
      throw new HTTPException(404, { message: "Order not found" });
    }
    if (sqlstate === "P0001" || sqlstate === "22023") {
      // 422 Unprocessable Entity — request was well-formed but a business
      // precondition failed. Body carries the specific blocker code so the
      // client can show the matching inline hint without parsing strings.
      return c.json(
        {
          error: "proceed_order_blocked",
          code: detailCode,
          message: rpcError.message,
        },
        422,
      );
    }
    throw new HTTPException(500, { message: rpcError.message });
  }

  // Re-fetch with relations — same shape as GET /:id so the client can
  // setQueryData(qk.order(id), …) and skip a follow-up round-trip.
  return c.json(await fetchAndShapeOrder(sb, id));
});

/**
 * Shared body parser + RPC dispatcher for the three blocker-resolution
 * mutations (top-up / address / date). Keeps the route handlers small and
 * uniform: parse → validate → call RPC → map errors → re-fetch + return.
 */
async function dispatchOrderMutation<TBody>(
  c: Context<AppEnv>,
  opts: {
    schema: { safeParse: (v: unknown) => { success: boolean; data?: TBody; error?: { issues: { message?: string }[] } } };
    /** RPC name as defined in the migration (e.g. "top_up_order"). */
    rpcName: string;
    /** Maps the validated body + dealer context to the named-arg payload. */
    rpcArgs: (body: TBody, dealerId: string) => Record<string, unknown>;
    /** Optional pre-flight checks (storage paths inside dealer folder, etc.). */
    preFlight?: (body: TBody, dealerId: string) => void;
    /** Tag used in 422 response bodies so the frontend can branch on the route. */
    errorTag: string;
  },
): Promise<Response> {
  const auth = c.var.auth;
  const idCheck = z.string().uuid().safeParse(c.req.param("id"));
  if (!idCheck.success || !idCheck.data) {
    throw new HTTPException(404, { message: "Order not found" });
  }
  const id: string = idCheck.data;

  if (
    auth.role !== "dealer" && auth.role !== "salesperson" && auth.role !== "showroom" &&
    auth.role !== "principal" && auth.role !== "logistics" &&
    auth.role !== "finance" && auth.role !== "bd"
  ) {
    throw new HTTPException(403, { message: "Role cannot mutate orders" });
  }
  if ((auth.role === "dealer" || auth.role === "salesperson" || auth.role === "showroom") && !auth.dealerId) {
    throw new HTTPException(403, { message: "Dealer scope missing on JWT" });
  }

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Body must be valid JSON" });
  }
  const parsed = opts.schema.safeParse(raw);
  if (!parsed.success || !parsed.data) {
    throw new HTTPException(400, {
      message: "Invalid input: " + (parsed.error?.issues[0]?.message ?? "unknown"),
    });
  }
  if (opts.preFlight && auth.dealerId) {
    opts.preFlight(parsed.data, auth.dealerId);
  }

  const sb = userClient(c.env, auth.jwt);
  const args = opts.rpcArgs(parsed.data, auth.dealerId ?? "");
  // `args` is the named-arg object Postgres expects; pass through verbatim.
  const { error: rpcError } = await sb.rpc(opts.rpcName, args as never);
  if (rpcError) {
    const sqlstate = rpcError.code;
    if (sqlstate === "42501") throw new HTTPException(403, { message: "Forbidden" });
    if (sqlstate === "42P01") throw new HTTPException(404, { message: "Order not found" });
    if (sqlstate === "22023" || sqlstate === "P0001") {
      return c.json(
        {
          error: opts.errorTag,
          code: rpcError.details ?? null,
          message: rpcError.message ?? "Unprocessable entity",
        },
        422,
      );
    }
    throw new HTTPException(500, { message: rpcError.message });
  }

  return c.json(await fetchAndShapeOrder(sb, id));
}

/** POST /api/orders/:id/top-up — record a partial payment toward an order's
 *  total. Photos uploaded to Storage by the dealer before this call; we
 *  validate paths live inside the dealer folder and pass them through to the
 *  RPC which persists them in `order_history.metadata`. */
ordersRouter.post("/:id/top-up", (c) =>
  dispatchOrderMutation(c, {
    schema: topUpOrderInputSchema,
    rpcName: "top_up_order",
    errorTag: "top_up_blocked",
    preFlight: (body, dealerId) => {
      for (const p of body.photoPaths) {
        assertDealerOwnedPath(p, dealerId, "photoPaths[]");
      }
    },
    rpcArgs: (body) => ({
      p_order_id: c.req.param("id"),
      p_amount: body.amount,
      p_method: body.method,
      p_method_label: body.methodLabel,
      p_reference: body.reference,
      p_note: body.note,
      p_date: body.date,
      p_photo_paths: body.photoPaths,
    }),
  }),
);

/** POST /api/orders/:id/address — fill in a deferred delivery address.
 *  Mirrors AddAddressModal in proto. */
ordersRouter.post("/:id/address", (c) =>
  dispatchOrderMutation(c, {
    schema: setOrderAddressInputSchema,
    rpcName: "set_order_address",
    errorTag: "set_address_blocked",
    rpcArgs: (body) => ({
      p_order_id: c.req.param("id"),
      p_address: body.address,
      p_billing: body.billing,
      p_billing_same: body.billingSame,
    }),
  }),
);

/** POST /api/orders/:id/date — confirm a TBD delivery date. Mirrors
 *  ConfirmDateModal in proto. */
ordersRouter.post("/:id/date", (c) =>
  dispatchOrderMutation(c, {
    schema: setOrderDateInputSchema,
    rpcName: "set_order_date",
    errorTag: "set_date_blocked",
    rpcArgs: (body) => ({
      p_order_id: c.req.param("id"),
      p_date: body.date,
    }),
  }),
);

/** POST /api/orders/:id/cancel — Phase 2C.3 dealer cancel. Only Place
 *  orders cancelable; once proceeded, logistics owns the rollback flow. */
ordersRouter.post("/:id/cancel", (c) =>
  dispatchOrderMutation(c, {
    schema: cancelOrderInputSchema,
    rpcName: "cancel_order",
    errorTag: "cancel_order_blocked",
    rpcArgs: (body) => ({
      p_order_id: c.req.param("id"),
      p_reason: body.reason,
    }),
  }),
);

/**
 * PATCH /api/orders/:id — full edit of a Place order. Phase 2C.2 — mirrors
 * proto's CustomerEditor (dealer-orders.jsx:472-581). Caller sends camelCase
 * partial fields under `customer` / `delivery` and we flatten to the
 * snake_case payload `update_order` RPC consumes.
 *
 * Only fields present in the payload are written. The RPC re-runs the same
 * status guard as the targeted RPCs (Place orders only) so an order that
 * just transitioned to Proceed under us cannot be edited mid-flight.
 */
ordersRouter.patch("/:id", async (c) => {
  const auth = c.var.auth;
  const idCheck = z.string().uuid().safeParse(c.req.param("id"));
  if (!idCheck.success || !idCheck.data) {
    throw new HTTPException(404, { message: "Order not found" });
  }
  const id: string = idCheck.data;

  if (
    auth.role !== "dealer" && auth.role !== "salesperson" && auth.role !== "showroom" &&
    auth.role !== "principal" && auth.role !== "logistics" &&
    auth.role !== "finance" && auth.role !== "bd"
  ) {
    throw new HTTPException(403, { message: "Role cannot edit orders" });
  }
  if ((auth.role === "dealer" || auth.role === "salesperson" || auth.role === "showroom") && !auth.dealerId) {
    throw new HTTPException(403, { message: "Dealer scope missing on JWT" });
  }

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Body must be valid JSON" });
  }
  const parsed = updateOrderInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: "Invalid edit input: " + (parsed.error.issues[0]?.message ?? "unknown"),
    });
  }

  // Flatten camelCase nested input to the snake_case keys the RPC reads via
  // jsonb_object_field. Only keys present on the input object are forwarded
  // so the RPC's "this key was specified" detection works.
  const flat: Record<string, unknown> = {};
  const cust = parsed.data.customer;
  if (cust) {
    if ("name" in cust) flat.customer_name = cust.name;
    if ("phone" in cust) flat.customer_phone = cust.phone ?? "";
    if ("address" in cust) flat.customer_address = cust.address ?? "";
    if ("addressUnknown" in cust) flat.customer_address_unknown = cust.addressUnknown;
    if ("billing" in cust) flat.customer_billing = cust.billing ?? "";
    if ("billingSame" in cust) flat.customer_billing_same = cust.billingSame;
    if ("emergency" in cust) flat.customer_emergency = cust.emergency ?? "";
  }
  const del = parsed.data.delivery;
  if (del) {
    if ("date" in del) flat.delivery_date = del.date ?? "";
    if ("dateTbd" in del) flat.delivery_date_tbd = del.dateTbd;
    if ("floor" in del) flat.delivery_floor = del.floor;
    if ("hasLift" in del) flat.delivery_has_lift = del.hasLift;
  }

  if (Object.keys(flat).length === 0) {
    throw new HTTPException(400, { message: "No editable fields in payload" });
  }

  const sb = userClient(c.env, auth.jwt);
  const { error: rpcError } = await sb.rpc("update_order", {
    p_order_id: id,
    p_payload: flat,
  });
  if (rpcError) {
    const sqlstate = rpcError.code;
    if (sqlstate === "42501") throw new HTTPException(403, { message: "Forbidden" });
    if (sqlstate === "42P01") throw new HTTPException(404, { message: "Order not found" });
    if (sqlstate === "22023" || sqlstate === "P0001") {
      return c.json(
        {
          error: "update_order_blocked",
          code: rpcError.details ?? null,
          message: rpcError.message ?? "Unprocessable entity",
        },
        422,
      );
    }
    throw new HTTPException(500, { message: rpcError.message });
  }

  return c.json(await fetchAndShapeOrder(sb, id));
});

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
  // totalAmount mirrors the list endpoint formula so proceedBlockers, the
  // ActionPanel, and the order detail footer all read the same value (the
  // detail view used to omit it which surfaced a phantom "Order pricing"
  // blocker on every Place order — see Phase 2C.1a).
  const totalAmount = computeTotalFromLines(row.order_lines, row.order_addons);
  const signed = { ...order, signatureUrl, paymentSlipUrl, totalAmount };

  return c.json(orderSchema.parse(signed));
});

export default ordersRouter;

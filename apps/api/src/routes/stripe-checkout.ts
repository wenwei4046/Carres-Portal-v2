import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { createStripeCheckoutInputSchema } from "@carres/shared";
import { mapPgError, parseJsonBody } from "../lib/route-helpers";
import { describePaymentMethod, receiptUrlOf, stripeClient, stripeConfigured } from "../lib/stripe";
import { adminClient, userClient } from "../lib/supabase";
import type { AppEnv } from "../types";

/**
 * Stripe online collection (Loo 2026-07-14) — the POS side of migration 0223.
 *
 *   POST /api/orders/:id/stripe/checkout        — mint a Checkout link (QR /
 *                                                 WhatsApp) for RM<amount>
 *   GET  /api/orders/:id/stripe/checkout/:sid   — poll one link's status; while
 *                                                 'open' it also live-reconciles
 *                                                 against Stripe, so the counter
 *                                                 flow works even before the
 *                                                 webhook endpoint is configured
 *
 * Trust model:
 *   - The ORDER is read through the caller's own JWT (userClient) — RLS is the
 *     visibility boundary, exactly like GET /orders/:id. A dealer can only mint
 *     links for orders RLS lets them see.
 *   - The AMOUNT is re-validated server-side against the live outstanding
 *     balance (lines + addons − paid, the same base top_up_order caps at). The
 *     client's number is a request, never the truth.
 *   - The sessions ROW is written with the service client (RLS has no client
 *     write policy on purpose); recording MONEY happens only in the 0223 RPC.
 *
 * Mounted at `/orders` in index.ts (inside the auth'd api group).
 */
const stripeCheckoutRouter = new Hono<AppEnv>();

const ORDER_ID = z.string().uuid();
/** Stripe Checkout session ids: cs_test_… / cs_live_… */
const SESSION_ID = z.string().regex(/^cs_[A-Za-z0-9_]+$/);

const SESSION_COLS =
  "id, order_id, session_id, payment_intent_id, amount, purpose, url, status, payment_method_detail, receipt_url, created_at, expires_at, paid_at";

/** Checkout links live ~24h — long enough for a WhatsApp'd link to be paid
 *  the same day, short enough that a stale amount can't linger for a week.
 *  5 minutes under Stripe's hard 24h ceiling so clock skew can't 400 the
 *  create call. */
const SESSION_TTL_SECONDS = 24 * 60 * 60 - 5 * 60;

type SessionRow = {
  order_id: string;
  session_id: string;
  amount: number | string;
  status: "open" | "paid" | "expired";
  url: string;
  payment_method_detail: string | null;
  receipt_url: string | null;
  paid_at: string | null;
  expires_at: string | null;
};

function shape(row: SessionRow) {
  return {
    sessionId: row.session_id,
    url: row.url,
    amount: Number(row.amount),
    status: row.status,
    paidAt: row.paid_at,
    expiresAt: row.expires_at,
    paymentMethodDetail: row.payment_method_detail,
    receiptUrl: row.receipt_url,
  };
}

function requireConfigured(c: { env: AppEnv["Bindings"] }) {
  if (!stripeConfigured(c.env)) {
    throw new HTTPException(503, {
      message: "Stripe is not set up yet — ask the principal to add the Stripe keys.",
    });
  }
}

/** Same visibility roles as the order mutations in orders.ts. */
function requireOrderRole(role: string) {
  const allowed = ["dealer", "salesperson", "showroom", "principal", "operation", "finance", "bd"];
  if (!allowed.includes(role)) {
    throw new HTTPException(403, { message: "Role cannot collect payments" });
  }
}

/** Fetch the order through the caller's JWT (RLS = visibility) with the money
 *  fields the balance check needs. 404s when RLS hides it. */
async function fetchOrderScoped(c: Context<AppEnv>, id: string) {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from("orders")
    .select(
      "id, so, dealer_id, status, paid, customer_name, customer_email, order_lines(unit_price, qty), order_addons(unit_price, qty)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new HTTPException(500, { message: error.message });
  if (!data) throw new HTTPException(404, { message: "Order not found" });
  return data as {
    id: string;
    so: number;
    dealer_id: string;
    status: string;
    paid: number | string;
    customer_name: string | null;
    customer_email: string | null;
    order_lines: Array<{ unit_price: number | string; qty: number }>;
    order_addons: Array<{ unit_price: number | string; qty: number }>;
  };
}

/**
 * The RPC's balance base: lines + addons — mirroring `top_up_order` keeps
 * every cap consistent.
 *
 * ⛔ THE OLD NOTE CALLED stair carry "a client-side display extra". That is
 * RETIRED (owner ruling YH, 2026-08-28): it is money the customer owes, and
 * while it was excluded this function returned 422 `amount_exceeds_outstanding`
 * BEFORE Stripe was ever called — the customer could not pay the balance they
 * had signed for.
 *
 * The arithmetic below is UNCHANGED and deliberately so. 0393 makes the fee an
 * `order_addons` row, so `addons` now carries it and the cap rises with it. The
 * cap itself is the surviving invariant: a payment may never exceed what is
 * owed. This ruling changed what IS owed, never whether the cap holds.
 */
function orderTotal(order: { order_lines: Array<{ unit_price: number | string; qty: number }>; order_addons: Array<{ unit_price: number | string; qty: number }> }): number {
  const lines = (order.order_lines ?? []).reduce((s, l) => s + Number(l.unit_price) * l.qty, 0);
  const addons = (order.order_addons ?? []).reduce((s, a) => s + Number(a.unit_price) * a.qty, 0);
  return lines + addons;
}

// POST /:id/stripe/checkout — mint one Checkout link for RM<amount>.
stripeCheckoutRouter.post("/:id/stripe/checkout", async (c) => {
  requireConfigured(c);
  requireOrderRole(c.var.auth.role);

  const idCheck = ORDER_ID.safeParse(c.req.param("id"));
  if (!idCheck.success) throw new HTTPException(404, { message: "Order not found" });

  const parsed = await parseJsonBody(c, createStripeCheckoutInputSchema);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const amount = parsed.data.amount;

  const order = await fetchOrderScoped(c, idCheck.data);
  if (order.status === "delivered" || order.status === "cancelled") {
    return c.json(
      { error: "stripe_checkout_blocked", code: "wrong_status", message: "Order is closed — no balance to collect." },
      422,
    );
  }

  const total = orderTotal(order);
  if (total <= 0) {
    return c.json(
      { error: "stripe_checkout_blocked", code: "total_amount_missing", message: "Order has no priced items." },
      422,
    );
  }
  const outstanding = Math.max(0, total - Number(order.paid));
  if (outstanding <= 0) {
    return c.json(
      { error: "stripe_checkout_blocked", code: "already_paid", message: "Order is already fully paid." },
      422,
    );
  }
  // Half-sen epsilon absorbs float noise from the numeric→JSON round-trip.
  if (amount > outstanding + 0.005) {
    return c.json(
      {
        error: "stripe_checkout_blocked",
        code: "amount_exceeds_outstanding",
        message: `Amount is above the outstanding balance (RM ${outstanding.toFixed(2)}).`,
        maxAmount: Number(outstanding.toFixed(2)),
      },
      422,
    );
  }

  const webBase = (c.env.PUBLIC_WEB_URL ?? "https://carres-portal.pages.dev").replace(/\/$/, "");
  const stripe = stripeClient(c.env);
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    currency: "myr",
    // No payment_method_types: the Stripe dashboard controls which methods
    // show (FPX / card / GrabPay …) — turning one on needs no deploy.
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "myr",
          unit_amount: Math.round(amount * 100), // RM → sen
          product_data: {
            name: `Carres order #${order.so}`,
            description: "Payment toward order balance",
          },
        },
      },
    ],
    customer_email: order.customer_email || undefined,
    metadata: { order_id: order.id, so: String(order.so), created_by: c.var.auth.id },
    payment_intent_data: {
      description: `Carres order #${order.so}`,
      metadata: { order_id: order.id, so: String(order.so) },
    },
    success_url: `${webBase}/pay/success?so=${order.so}`,
    cancel_url: `${webBase}/pay/cancelled?so=${order.so}`,
    expires_at: expiresAt,
  });
  if (!session.url) {
    throw new HTTPException(500, { message: "Stripe returned no checkout URL" });
  }

  // Track the link. Service client — RLS has no client write policy (0223).
  const admin = adminClient(c.env);
  const { data: row, error: insErr } = await admin
    .from("stripe_checkout_sessions")
    .insert({
      order_id: order.id,
      session_id: session.id,
      amount,
      purpose: "order_balance",
      url: session.url,
      status: "open",
      created_by: c.var.auth.id,
      expires_at: new Date(expiresAt * 1000).toISOString(),
    })
    .select(SESSION_COLS)
    .single();
  if (insErr) {
    // Money safety: a link we can't track must not stay payable.
    await stripe.checkout.sessions.expire(session.id).catch(() => {});
    const m = mapPgError(insErr);
    return c.json(m.body, m.status);
  }

  return c.json({ session: shape(row as SessionRow) }, 201);
});

// GET /:id/stripe/checkout/:sid — status poll + live reconcile while open.
// The reconcile makes the counter QR flow self-sufficient: even with the
// webhook down (or not yet configured) the payment records within one poll.
stripeCheckoutRouter.get("/:id/stripe/checkout/:sid", async (c) => {
  requireConfigured(c);
  requireOrderRole(c.var.auth.role);

  const idCheck = ORDER_ID.safeParse(c.req.param("id"));
  const sidCheck = SESSION_ID.safeParse(c.req.param("sid"));
  if (!idCheck.success || !sidCheck.success) {
    throw new HTTPException(404, { message: "Checkout session not found" });
  }

  // Visibility gate first — RLS decides whether the caller may see the order.
  await fetchOrderScoped(c, idCheck.data);

  const admin = adminClient(c.env);
  const { data: row, error } = await admin
    .from("stripe_checkout_sessions")
    .select(SESSION_COLS)
    .eq("session_id", sidCheck.data)
    .eq("order_id", idCheck.data)
    .maybeSingle();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  if (!row) throw new HTTPException(404, { message: "Checkout session not found" });

  let current = row as SessionRow;
  if (current.status === "open") {
    const stripe = stripeClient(c.env);
    const live = await stripe.checkout.sessions.retrieve(current.session_id, {
      expand: ["payment_intent.latest_charge"],
    });
    if (live.payment_status === "paid") {
      const pi = typeof live.payment_intent === "string" ? null : live.payment_intent;
      const { error: rpcErr } = await admin.rpc("record_stripe_checkout_payment", {
        p_session_id: current.session_id,
        p_payment_intent_id: pi?.id ?? (typeof live.payment_intent === "string" ? live.payment_intent : null),
        p_payment_method_detail: describePaymentMethod(pi),
        p_receipt_url: receiptUrlOf(pi),
      });
      if (rpcErr) throw new HTTPException(500, { message: rpcErr.message });
    } else if (live.status === "expired") {
      await admin
        .from("stripe_checkout_sessions")
        .update({ status: "expired" })
        .eq("session_id", current.session_id)
        .eq("status", "open");
    }
    const { data: fresh } = await admin
      .from("stripe_checkout_sessions")
      .select(SESSION_COLS)
      .eq("session_id", current.session_id)
      .maybeSingle();
    if (fresh) current = fresh as SessionRow;
  }

  return c.json({ session: shape(current) });
});

export default stripeCheckoutRouter;

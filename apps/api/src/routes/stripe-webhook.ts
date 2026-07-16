import { Hono, type Context } from "hono";
import type Stripe from "stripe";
import { describePaymentMethod, receiptUrlOf, stripeClient, stripeConfigured, webCryptoProvider } from "../lib/stripe";
import { adminClient } from "../lib/supabase";
import type { AppEnv } from "../types";

/**
 * Stripe webhook (Loo 2026-07-14 — online collection, migration 0223).
 *
 * Mounted at `/stripe` on the ROOT app, OUTSIDE the auth'd /api group — Stripe
 * calls it with a signature header, not a Supabase JWT. The signature check
 * (STRIPE_WEBHOOK_SECRET, WebCrypto provider — Workers have no Node crypto)
 * is the entire trust boundary: an unsigned or tampered body never reaches
 * the handler.
 *
 * Events:
 *   checkout.session.completed         → record if payment_status='paid'
 *                                        (FPX/card settle synchronously; an
 *                                        async method stays 'unpaid' here and
 *                                        lands via async_payment_succeeded)
 *   checkout.session.async_payment_succeeded → record
 *   checkout.session.expired           → mark the tracker row expired
 *   everything else                    → 200 ignored
 *
 * Recording goes through the 0223 RPC — idempotent (row lock + status guard),
 * so Stripe's at-least-once delivery and the POS poll's live-reconcile can
 * race freely. Unknown session ids (e.g. a link minted straight from the
 * Stripe dashboard) are acknowledged with 200 so Stripe doesn't retry them
 * forever; real processing failures return 500 so Stripe DOES retry.
 */
const stripeWebhookRouter = new Hono<AppEnv>();

stripeWebhookRouter.post("/webhook", async (c) => {
  if (!stripeConfigured(c.env) || !c.env.STRIPE_WEBHOOK_SECRET) {
    return c.json({ error: "stripe_not_configured" }, 503);
  }

  const signature = c.req.header("stripe-signature");
  if (!signature) return c.json({ error: "missing_signature" }, 400);

  const payload = await c.req.text();
  const stripe = stripeClient(c.env);

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      c.env.STRIPE_WEBHOOK_SECRET,
      undefined,
      webCryptoProvider,
    );
  } catch {
    return c.json({ error: "invalid_signature" }, 400);
  }

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object;
      if (session.payment_status !== "paid") break; // async method still pending
      return recordSession(c, stripe, session);
    }
    case "checkout.session.expired": {
      const session = event.data.object;
      await adminClient(c.env)
        .from("stripe_checkout_sessions")
        .update({ status: "expired" })
        .eq("session_id", session.id)
        .eq("status", "open");
      break;
    }
    default:
      break;
  }
  return c.json({ received: true });
});

async function recordSession(c: Context<AppEnv>, stripe: Stripe, session: Stripe.Checkout.Session) {
  // Payment-method detail + receipt link are display/reconciliation sugar —
  // never let their lookup block the money from being recorded.
  let detail: string | null = null;
  let receiptUrl: string | null = null;
  const piId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
  if (piId) {
    try {
      const pi = await stripe.paymentIntents.retrieve(piId, { expand: ["latest_charge"] });
      detail = describePaymentMethod(pi);
      receiptUrl = receiptUrlOf(pi);
    } catch {
      detail = null;
    }
  }

  const { error } = await adminClient(c.env).rpc("record_stripe_checkout_payment", {
    p_session_id: session.id,
    p_payment_intent_id: piId,
    p_payment_method_detail: detail,
    p_receipt_url: receiptUrl,
  });
  if (error) {
    // Foreign session (not minted by us) — acknowledge, don't retry forever.
    if (error.details === "session_not_found" || /Unknown checkout session/.test(error.message ?? "")) {
      return c.json({ received: true, ignored: "unknown_session" });
    }
    return c.json({ error: "record_failed", message: error.message }, 500);
  }
  return c.json({ received: true });
}

export default stripeWebhookRouter;

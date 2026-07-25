import { Hono, type Context } from "hono";
import type Stripe from "stripe";
import { ensureFixedTermSchedule } from "../lib/rental-stripe";
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
      // 0254 — a SUBSCRIPTION-mode session is a rental signup (card saved +
      // first month collected): wrap the fixed-term schedule + link the ids,
      // never the order-balance money RPC.
      if (session.mode === "subscription") {
        return recordRentalSession(c, stripe, session);
      }
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

/**
 * 0254 — rental signup completion. Order of operations matters: the
 * fixed-term schedule wraps FIRST (its failure 500s so Stripe retries and the
 * subscription can never stay open-ended while marked linked), then the
 * link_rental_subscription RPC stamps the ids — both idempotent, so this and
 * the POS poll's live-reconcile can race freely. Recording each month's MONEY
 * (rental_billings.paid + splits) is segment ②'s invoice.paid engine — not
 * here.
 */
async function recordRentalSession(c: Context<AppEnv>, stripe: Stripe, session: Stripe.Checkout.Session) {
  const subId =
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
  if (!subId) return c.json({ received: true, ignored: "no_subscription" });

  const admin = adminClient(c.env);
  // The agreement's term drives the schedule length. An untracked session
  // (minted straight from the Stripe dashboard) is acknowledged, not retried.
  const { data: row } = await admin
    .from("stripe_checkout_sessions")
    .select("agreement_id")
    .eq("session_id", session.id)
    .maybeSingle();
  const agreementId = (row as { agreement_id: string | null } | null)?.agreement_id ?? null;
  if (!agreementId) return c.json({ received: true, ignored: "unknown_session" });

  const { data: ag } = await admin
    .from("rental_agreements")
    .select("term_months")
    .eq("id", agreementId)
    .maybeSingle();
  if (ag) {
    try {
      await ensureFixedTermSchedule(stripe, subId, Number((ag as { term_months: number }).term_months));
    } catch (e) {
      return c.json(
        { error: "schedule_failed", message: e instanceof Error ? e.message : "schedule wrap failed" },
        500, // Stripe retries; the POS poll retries too
      );
    }
  }

  const { error } = await admin.rpc("link_rental_subscription", {
    p_session_id: session.id,
    p_stripe_subscription_id: subId,
    p_stripe_customer_id:
      typeof session.customer === "string" ? session.customer : session.customer?.id ?? null,
  });
  if (error) {
    if (error.details === "session_not_found" || /Unknown checkout session/.test(error.message ?? "")) {
      return c.json({ received: true, ignored: "unknown_session" });
    }
    return c.json({ error: "record_failed", message: error.message }, 500);
  }
  return c.json({ received: true });
}

export default stripeWebhookRouter;

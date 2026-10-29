import Stripe from "stripe";
import type { Bindings } from "../types";

/**
 * Stripe client for Cloudflare Workers (Loo 2026-07-14 — online collection).
 *
 * Workers have no Node net stack at runtime, so the SDK is pinned to its
 * fetch-based HTTP client, and webhook signature checks use the WebCrypto
 * provider (constructEventAsync) — the sync constructEvent throws on Workers.
 *
 * Keys are Worker secrets (`wrangler secret put … --env production`):
 *   STRIPE_SECRET_KEY      — sk_test_… first, sk_live_… at cutover
 *   STRIPE_WEBHOOK_SECRET  — whsec_… from the dashboard's webhook endpoint
 * Both unset ⇒ the feature is OFF: routes answer 503 stripe_not_configured
 * and the POS shows a friendly "not set up yet" message.
 */

export function stripeConfigured(env: Bindings): boolean {
  return !!env.STRIPE_SECRET_KEY;
}

export function stripeClient(env: Bindings): Stripe {
  return new Stripe(env.STRIPE_SECRET_KEY!, {
    httpClient: Stripe.createFetchHttpClient(),
  });
}

/**
 * Expire every open Checkout link of one order, at Stripe and in our table.
 * One live link per order is what stops two links collecting the same balance,
 * and a re-mint (card failed, wrong amount) is never locked out by an old link.
 * Returns false when Stripe refuses to expire one (it is being paid or already
 * paid): the caller must not mint a twin then. Rows are marked only after
 * Stripe agreed, so a paid link is never recorded as expired.
 */
export async function expireOpenCheckoutLinks(
  stripe: Stripe,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  orderId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("stripe_checkout_sessions")
    .select("session_id")
    .eq("order_id", orderId)
    .eq("status", "open");
  if (error) return false;
  for (const r of (data ?? []) as { session_id: string }[]) {
    try {
      await stripe.checkout.sessions.expire(r.session_id);
    } catch {
      return false;
    }
    await admin.from("stripe_checkout_sessions").update({ status: "expired" }).eq("session_id", r.session_id).eq("status", "open");
  }
  return true;
}

export const webCryptoProvider = Stripe.createSubtleCryptoProvider();

/**
 * Human line for order_history / the sessions row, from an expanded
 * PaymentIntent's latest charge. Display only — never parsed downstream.
 * e.g. 'fpx (maybank2u)' / 'card (visa **** 4242)' / 'grabpay'.
 */
export function describePaymentMethod(pi: Stripe.PaymentIntent | null): string | null {
  const charge = pi?.latest_charge;
  if (!charge || typeof charge === "string") return null;
  const d = charge.payment_method_details;
  if (!d) return null;
  if (d.type === "fpx" && d.fpx?.bank) return `fpx (${d.fpx.bank})`;
  if (d.type === "card" && d.card) {
    const brand = d.card.brand ?? "card";
    return d.card.last4 ? `card (${brand} **** ${d.card.last4})` : `card (${brand})`;
  }
  return d.type;
}

/** Stripe's hosted receipt for the captured charge (0224) — the payment's
 *  "slip" for finance reconciliation. Needs latest_charge expanded. */
export function receiptUrlOf(pi: Stripe.PaymentIntent | null): string | null {
  const charge = pi?.latest_charge;
  if (!charge || typeof charge === "string") return null;
  return charge.receipt_url ?? null;
}

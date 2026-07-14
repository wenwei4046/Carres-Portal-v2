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

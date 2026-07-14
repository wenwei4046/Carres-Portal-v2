import { z } from "zod";

/**
 * Stripe online collection (Loo 2026-07-14) — the POS mints a Stripe Checkout
 * link (QR at the counter / WhatsApp link) for a slice of an order's balance;
 * the customer pays on Stripe's hosted page (FPX / card / whatever the Stripe
 * dashboard enables); the webhook or the POS poll's live-reconcile records the
 * payment. Server-side the amount is re-validated against the CURRENT
 * outstanding balance — the client number is a request, never the truth
 * (2990s recompute doctrine).
 */

/** Create a checkout link — POST /api/orders/:id/stripe/checkout. */
export const createStripeCheckoutInputSchema = z.object({
  /** RM, 2dp. Must be > 0 and ≤ the order's outstanding balance (server-checked). */
  amount: z
    .number()
    .positive("amount must be greater than 0")
    .max(1_000_000, "amount too large")
    .multipleOf(0.01, "amount must be a sen-precise RM value"),
});
export type CreateStripeCheckoutInput = z.infer<typeof createStripeCheckoutInputSchema>;

export const STRIPE_SESSION_STATUSES = ["open", "paid", "expired"] as const;
export type StripeSessionStatus = (typeof STRIPE_SESSION_STATUSES)[number];

/** One checkout link as the API returns it (both create + status poll). */
export interface StripeCheckoutSessionInfo {
  sessionId: string;
  url: string;
  amount: number;
  status: StripeSessionStatus;
  /** ISO timestamps (null until the respective transition). */
  paidAt: string | null;
  expiresAt: string | null;
  /** e.g. 'fpx (maybank2u)' / 'card (visa **** 4242)' — display only. */
  paymentMethodDetail: string | null;
}

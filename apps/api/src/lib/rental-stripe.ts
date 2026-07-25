import type Stripe from "stripe";
import type { DB } from "@carres/shared";

/**
 * Rental ↔ Stripe glue (0255, Loo 2026-07-25 — rental segment ①).
 *
 * Metadata namespace (LOCKED by the live pilot, 2026-07-25): the CARRESS
 * Stripe account still carries the old carressglobal.com system's products
 * (metadata `product_id`/`variant_id`), so every object WE create is stamped
 * `carres_source=carres-portal` and looked up only through our own DB anchor
 * columns — the legacy objects are never touched.
 *
 *   Product  carres_kind=rental_plan        (one per rentable SKU, reused
 *                                            across terms via sibling lookup)
 *   Price    carres_kind=rental_plan_price  (one per plan; amounts are
 *                                            IMMUTABLE on Stripe, so a fee
 *                                            change mints a new price and
 *                                            archives the old)
 *
 * The fixed 84-month term is a subscription SCHEDULE (84 iterations,
 * end_behavior=cancel) — Loo's lock; NOT the old system's open-ended pattern.
 */

export const CARRES_SOURCE = "carres-portal";

/** RM → sen for Stripe amounts. */
const sen = (rm: number): number => Math.round(Number(rm) * 100);

export interface RentalPlanStripeIds {
  productId: string;
  priceId: string;
  /** The price id that was archived because the fee changed (display only). */
  archivedPriceId: string | null;
}

/**
 * Idempotently ensure the Stripe Product + recurring monthly Price backing a
 * rental plan. `siblingProductId` is a same-SKU sibling plan's product (DB
 * lookup — deterministic, no Stripe search) so two terms on one mattress
 * share one Product.
 */
export async function ensureRentalPlanStripeObjects(
  stripe: Stripe,
  plan: DB.RentalPlanRow,
  siblingProductId: string | null,
): Promise<RentalPlanStripeIds> {
  let productId = plan.stripe_product_id ?? siblingProductId ?? null;
  if (!productId) {
    const product = await stripe.products.create({
      name: `Rent-to-Own · ${plan.sku}`,
      metadata: {
        carres_source: CARRES_SOURCE,
        carres_kind: "rental_plan",
        carres_sku: plan.sku,
      },
    });
    productId = product.id;
  }

  const wantAmount = sen(plan.monthly_fee);
  let archivedPriceId: string | null = null;
  let priceId = plan.stripe_price_id ?? null;

  if (priceId) {
    const price = await stripe.prices.retrieve(priceId);
    const productOf = typeof price.product === "string" ? price.product : price.product?.id;
    const stillGood =
      price.active &&
      price.unit_amount === wantAmount &&
      price.recurring?.interval === "month" &&
      productOf === productId;
    if (!stillGood) {
      // Amount/product moved — archive the old price so no NEW subscription
      // can pick it up (existing subscriptions keep charging their own price
      // until segment ② decides re-pricing policy).
      await stripe.prices.update(priceId, { active: false }).catch(() => {});
      archivedPriceId = priceId;
      priceId = null;
    }
  }

  if (!priceId) {
    const price = await stripe.prices.create({
      product: productId,
      currency: "myr",
      unit_amount: wantAmount,
      recurring: { interval: "month" },
      nickname: `${plan.sku} × ${plan.term_months}mo @ RM${Number(plan.monthly_fee).toFixed(2)}/mo`,
      metadata: {
        carres_source: CARRES_SOURCE,
        carres_kind: "rental_plan_price",
        carres_sku: plan.sku,
        carres_term_months: String(plan.term_months),
        carres_monthly_fee: Number(plan.monthly_fee).toFixed(2),
      },
    });
    priceId = price.id;
  }

  return { productId, priceId, archivedPriceId };
}

/**
 * Wrap a just-created Checkout subscription into the FIXED-TERM schedule:
 * `termMonths` monthly iterations from the subscription's own start, then
 * end_behavior=cancel (month 85 never bills — the rent-to-own completion
 * flow takes over). Idempotent: a subscription already under a schedule is
 * left alone, so the webhook and the POS poll can race freely.
 */
export async function ensureFixedTermSchedule(
  stripe: Stripe,
  subscriptionId: string,
  termMonths: number,
): Promise<void> {
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  if (sub.schedule) return; // already wrapped (webhook/poll race)

  const priceId = sub.items.data[0]?.price?.id;
  if (!priceId) {
    throw new Error(`subscription ${subscriptionId} has no price item to schedule`);
  }

  const schedule = await stripe.subscriptionSchedules.create({
    from_subscription: subscriptionId,
  });
  // from_subscription mints a schedule mirroring the live phase; the update
  // re-states that phase with a hard duration (SDK v22 vocabulary for the
  // classic "84 iterations"): `termMonths` months from the phase start, on a
  // monthly price = exactly termMonths billing cycles. start_date must echo
  // the schedule's own current phase start or Stripe rejects the edit.
  await stripe.subscriptionSchedules.update(schedule.id, {
    end_behavior: "cancel",
    phases: [
      {
        items: [{ price: priceId, quantity: 1 }],
        start_date: schedule.phases[0]!.start_date,
        duration: { interval: "month", interval_count: termMonths },
      },
    ],
  });
}

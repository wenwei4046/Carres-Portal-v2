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
 *   invoice.paid                       → 0281: record the rental instalment
 *                                        (the collection ledger's only entry
 *                                        point from Stripe)
 *   invoice.payment_failed             → 0295: record the decline, so finance
 *                                        can tell "the card was refused" from
 *                                        "we have not billed this month yet"
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
      // 0255 — a SUBSCRIPTION-mode session is a rental signup (card saved +
      // first month collected): wrap the fixed-term schedule + link the ids,
      // never the order-balance money RPC.
      if (session.mode === "subscription") {
        return recordRentalSession(c, stripe, session);
      }
      if (session.payment_status !== "paid") break; // async method still pending
      return recordSession(c, stripe, session);
    }
    case "invoice.paid": {
      // 0281 — segment 2a. Every month after signup arrives here.
      return recordRentalInvoice(c, event.data.object);
    }
    case "invoice.payment_failed": {
      // 0295 — the bank said no. Until this branch existed the system wrote
      // NOTHING, so a declined card and a month we had simply not billed yet
      // looked identical on the finance screen. The event id is passed down
      // because a failure changes no state and so has nothing else to be
      // idempotent by.
      return recordRentalInvoiceFailure(c, stripe, event.id, event.data.object);
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
 * 0255 — rental signup completion. Order of operations matters: the
 * fixed-term schedule wraps FIRST (its failure 500s so Stripe retries and the
 * subscription can never stay open-ended while marked linked), then the
 * link_rental_subscription RPC stamps the ids — both idempotent, so this and
 * the POS poll's live-reconcile can race freely.
 *
 * 0281 — and THEN the signup month is recorded. The one-time line item on this
 * session IS instalment seq 1 of Loo's calendar, collected at the counter; the
 * subscription carries the rest on the 7th. Recording it here closes CF
 * `rental-first-month-vs-billing-row`, which existed precisely because this
 * money landed in Stripe and never in our books.
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
      // 0281 — term - 1 (the signup month rode the checkout as a one-time line)
      await ensureFixedTermSchedule(
        stripe,
        subId,
        Number((ag as { term_months: number }).term_months) - 1,
      );
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

  // 0281 — the signup month. Keyed on the SESSION id (this money arrived as a
  // one-time line item, not an invoice), so a re-delivered session is a no-op
  // through the RPC's own idempotency rather than a second collection.
  const { error: payErr } = await admin.rpc("rental_record_payment", {
    p_agreement_id: agreementId,
    p_seq: 1,
    p_stripe_invoice_id: `cs:${session.id}`,
    p_method: "stripe",
    p_reference: session.id,
    p_note: "First month, collected at signup",
  });
  if (payErr) {
    // The subscription IS linked at this point, so failing hard would make
    // Stripe retry the whole handler and re-do work that already succeeded
    // (all idempotent, but noisy). The instalment is recoverable by hand from
    // the finance screen, so say so loudly and acknowledge.
    console.error("rental first-month record failed:", payErr.message);
    return c.json({ received: true, warning: "first_month_not_recorded" });
  }
  return c.json({ received: true });
}

/**
 * 0281 — an invoice was paid. This is the collection ledger's only entry point
 * from Stripe for months 2..N.
 *
 * Matching is by `stripe_invoice_id` and NOT by due date, deliberately: our
 * calendar anchors on the 7th while Stripe's anchors on the trial end, and a
 * link paid days late drifts them further (CF `rental-billing-anchor-drift`).
 * The invoice id is the only identifier that survives both the drift and
 * Stripe's at-least-once delivery. When the id is new, the RPC takes the
 * OLDEST still-owing instalment, which is what "paying your rent" means.
 */
async function recordRentalInvoice(c: Context<AppEnv>, invoice: Stripe.Invoice) {
  // Both invoice shapes — see subscriptionIdOf. Reading only the v22 field was
  // a live no-op against our acacia-pinned endpoint.
  const subId = subscriptionIdOf(invoice);
  // No subscription = not a rental instalment (a one-off invoice, say). Ignore
  // rather than guess, and acknowledge so Stripe stops retrying.
  if (!subId) return c.json({ received: true, ignored: "not_a_subscription_invoice" });
  if (!invoice.id) return c.json({ received: true, ignored: "no_invoice_id" });

  const admin = adminClient(c.env);
  const { data: ag } = await admin
    .from("rental_agreements")
    .select("id")
    .eq("stripe_subscription_id", subId)
    .maybeSingle();
  const agreementId = (ag as { id: string } | null)?.id ?? null;
  // A subscription we do not own (the CARRESS account still carries the old
  // carressglobal system's objects) — acknowledge, never retry.
  if (!agreementId) return c.json({ received: true, ignored: "unknown_subscription" });

  const { data, error } = await admin.rpc("rental_record_payment", {
    p_agreement_id: agreementId,
    p_stripe_invoice_id: invoice.id,
    // Stripe reports sen; the ledger keeps ringgit. `amount_paid` is what was
    // ACTUALLY collected, which is the only figure worth recording.
    p_amount: (invoice.amount_paid ?? 0) / 100,
    p_paid_at: new Date((invoice.status_transitions?.paid_at ?? invoice.created) * 1000).toISOString(),
    p_method: "stripe",
    p_reference: invoice.number ?? invoice.id,
  });
  if (error) {
    // Every instalment already collected (a trailing invoice, or a manual one
    // raised in the dashboard) — nothing to record, and retrying will not help.
    if (error.details === "billing_not_found") {
      return c.json({ received: true, ignored: "no_open_instalment" });
    }
    return c.json({ error: "record_failed", message: error.message }, 500);
  }
  const out = data as { already?: boolean; seq?: number } | null;
  return c.json({ received: true, seq: out?.seq ?? null, already: out?.already ?? false });
}

/**
 * Which subscription an invoice belongs to — under BOTH invoice shapes.
 *
 * Found 2026-07-27 while checking the live endpoint: it is pinned to API
 * version `2025-02-24.acacia`, while our SDK is v22 (Basil-era). Stripe shapes
 * a webhook payload to the ENDPOINT's pinned version, not to the SDK's — and
 * Basil is where `invoice.subscription` was replaced by
 * `parent.subscription_details.subscription`. So the acacia-shaped payload we
 * actually receive has no `parent`, and reading only the new field meant every
 * rental invoice — paid or refused — resolved to "not a subscription invoice"
 * and was silently dropped.
 *
 * Rather than pin down which release moved it and code to that answer, read
 * both. It is correct under either version, it survives the endpoint being
 * upgraded later, and it costs one fallback. `subscription` is absent from the
 * v22 types, hence the narrow cast — the shape is asserted by the tests below.
 */
function subscriptionIdOf(invoice: Stripe.Invoice): string | null {
  const viaParent = invoice.parent?.subscription_details?.subscription ?? null;
  if (viaParent) return typeof viaParent === "string" ? viaParent : viaParent.id ?? null;
  const legacy =
    (invoice as unknown as { subscription?: string | { id?: string } | null }).subscription ?? null;
  if (!legacy) return null;
  return typeof legacy === "string" ? legacy : legacy.id ?? null;
}

/**
 * Why the bank said no, in words finance can act on (0295).
 *
 * Lives here rather than in lib/stripe with its siblings for one deliberate
 * reason: this file's tests mock that whole module, so a reader parked there is
 * a reader no test can exercise — it would have been stubbed and the test would
 * have asserted the stub. It has exactly one caller, so local is honest.
 *
 * The distinction matters to the person making the phone call: "insufficient
 * funds" means ask them to top up and we retry, "expired card" means we need a
 * new card on file. Stripe's own `message` is already a plain, customer-safe
 * sentence, so it wins over the raw code and the code is only the fallback.
 *
 * NOTE the reason is NOT on the Invoice: `last_finalization_error` is the
 * invoice failing to finalise, a different failure entirely. A card decline
 * lives on the PaymentIntent.
 */
function declineMessageOf(pi: Stripe.PaymentIntent | null): string | null {
  const err = pi?.last_payment_error;
  if (!err) return null;
  const msg = err.message?.trim();
  if (msg) return msg;
  const code = err.decline_code ?? err.code;
  return code ? String(code) : null;
}

/**
 * 0295 — Stripe tried the card and the bank said no.
 *
 * Everything about the resolution is deliberately the SAME as the paid path
 * above (subscription → agreement, then let the RPC find the instalment), so
 * the two halves of a month's story cannot drift apart. Two things differ, and
 * both follow from the fact that a decline changes no state:
 *
 *  1. The idempotency key is Stripe's EVENT id, not the invoice id. A retry of
 *     the same delivery must be a no-op; a genuine second attempt on the same
 *     invoice (Smart Retries) is a real, separate event and must be a second
 *     row. Keying on the invoice would collapse three refusals into one.
 *  2. `amount_due` is the figure, not `amount_paid` — nothing was paid, and the
 *     amount we FAILED to collect is the number finance cares about.
 *
 * Unlike the paid path, an unresolvable agreement is still the end of the road
 * (we cannot file a decline against a subscription that is not ours), but a
 * missing INSTALMENT is not: the RPC files those against the agreement alone.
 */
async function recordRentalInvoiceFailure(
  c: Context<AppEnv>,
  stripe: Stripe,
  eventId: string,
  invoice: Stripe.Invoice,
) {
  const subId = subscriptionIdOf(invoice);
  if (!subId) return c.json({ received: true, ignored: "not_a_subscription_invoice" });

  const admin = adminClient(c.env);
  const { data: ag } = await admin
    .from("rental_agreements")
    .select("id")
    .eq("stripe_subscription_id", subId)
    .maybeSingle();
  const agreementId = (ag as { id: string } | null)?.id ?? null;
  if (!agreementId) return c.json({ received: true, ignored: "unknown_subscription" });

  // Why the card was refused is what turns this row into an action ("ask for a
  // new card" vs "ask them to top up"), but it lives on the PaymentIntent, not
  // on the invoice. Same discipline as the receipt lookup in recordSession:
  // sugar, fetched in a try, never allowed to stop the money fact landing.
  let reason: string | null = null;
  if (invoice.id) {
    try {
      const full = await stripe.invoices.retrieve(invoice.id, {
        expand: ["payments.data.payment.payment_intent"],
      });
      const pi = full.payments?.data?.[0]?.payment?.payment_intent ?? null;
      reason = typeof pi === "string" || !pi ? null : declineMessageOf(pi);
    } catch {
      reason = null;
    }
  }

  const attempted = (invoice.amount_due ?? 0) / 100;
  const { data, error } = await admin.rpc("rental_record_payment_failure", {
    p_agreement_id: agreementId,
    p_stripe_invoice_id: invoice.id ?? null,
    p_stripe_event_id: eventId,
    // 0 would be a lie about a real charge attempt; null lets the RPC fall back
    // to the instalment's own amount, which is what Stripe was asking for.
    p_amount: attempted > 0 ? attempted : null,
    p_failed_at: new Date(invoice.created * 1000).toISOString(),
    p_reason: reason,
    p_reference: invoice.number ?? invoice.id ?? null,
  });
  if (error) {
    return c.json({ error: "record_failed", message: error.message }, 500);
  }
  const out = data as { already?: boolean; seq?: number | null } | null;
  return c.json({ received: true, seq: out?.seq ?? null, already: out?.already ?? false });
}

export default stripeWebhookRouter;

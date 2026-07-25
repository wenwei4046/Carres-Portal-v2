-- =============================================================================
-- 0255_rental_sell_lane.sql (Loo 2026-07-25 — rental segment ①: the POS sell lane)
-- =============================================================================
-- The 0247-0249 base is DORMANT config + registry. This migration wakes the
-- SELL side: a store (dealer / showroom / bd / internal on-behalf) signs a
-- rent-to-own agreement at the POS and Stripe collects the monthly fee by
-- card-on-file subscription (Loo's lock: collection = Stripe auto-debit;
-- 84-month fixed term = a subscription SCHEDULE, wired API-side).
--
-- Five objects:
--   1. Stripe landing columns — rental_plans.stripe_product_id/stripe_price_id
--      (the plan-sync engine's anchors) + customers.stripe_customer_id (one
--      Stripe Customer per person, reused across agreements).
--   2. stripe_checkout_sessions widening — 0223 anticipated this exact reuse
--      (`purpose` already CHECKs 'rental_subscription'); order_id goes nullable
--      and agreement_id arrives, with a belt-and-braces "exactly one target"
--      CHECK. Existing order rows are untouched.
--   3. rental_plans_pos — the DELIBERATE store-side read widening promised by
--      0253 (CF rental-pos-config-projection): a definer view exposing ONLY
--      the sellable face of an ACTIVE plan. The split percentages
--      (supplier_rate_pct / commission_base_pct — cross-party commercial
--      terms) are NOT in the column list, which is the entire point.
--   4. create_rental_agreement(...) — SECURITY DEFINER. Store JWTs cannot
--      write the is_internal()-locked rental tables (by design), so signup is
--      ONE atomic definer transaction: customer upsert by canonical phone
--      (pwp_phone_key — server-side identity, 0247 doctrine) → agreement with
--      plan SNAPSHOTS (price/split re-read from the DB row, the client only
--      names a plan_id — no client-trusted money, the sofa-P4 trust-gate
--      doctrine) → the full term's rental_billings schedule → the RU asset
--      row → the included service entitlement + pre-generated visits.
--   5. link_rental_subscription(...) — service_role ONLY (webhook / poll
--      reconcile): marks the checkout session paid and stamps the Stripe
--      customer/subscription ids onto the agreement. Idempotent via row lock +
--      status guard, mirroring record_stripe_checkout_payment. Recording the
--      MONEY of each cycle (rental_billings.paid + splits) is deliberately NOT
--      here — that is segment ②'s billing engine behind its own DEFINER RPC
--      (CF rental-billing-writes-need-rpc, guardrail #4).
--
-- Safety: additive columns + new view/functions only; no existing row changes;
-- reversible (drop view/functions, drop columns, re-set NOT NULL).
-- =============================================================================

-- ── 1) Stripe landing columns ────────────────────────────────────────────────

ALTER TABLE public.rental_plans
  ADD COLUMN stripe_product_id text,
  ADD COLUMN stripe_price_id   text;

COMMENT ON COLUMN public.rental_plans.stripe_price_id IS
  'Recurring monthly Stripe Price backing this plan (sync engine, 0255). NULL = not yet synced — the POS lane refuses online collection until the principal re-saves/syncs the plan. Prices are immutable on amount: a fee change mints a NEW price and archives the old one.';

ALTER TABLE public.customers
  ADD COLUMN stripe_customer_id text;

COMMENT ON COLUMN public.customers.stripe_customer_id IS
  'One Stripe Customer per canonical phone, minted lazily at first rental checkout and reused for later agreements (0255).';

-- ── 2) stripe_checkout_sessions — the 0223-anticipated rental reuse ─────────

ALTER TABLE public.stripe_checkout_sessions
  ALTER COLUMN order_id DROP NOT NULL;

ALTER TABLE public.stripe_checkout_sessions
  ADD COLUMN agreement_id uuid REFERENCES public.rental_agreements(id) ON DELETE CASCADE;

-- A session must aim at exactly one collectable: an order's balance OR a
-- rental agreement's subscription signup. (Both-set is nonsensical; both-null
-- would orphan money.)
ALTER TABLE public.stripe_checkout_sessions
  ADD CONSTRAINT stripe_checkout_sessions_one_target
    CHECK (
      (order_id IS NOT NULL AND agreement_id IS NULL)
      OR (order_id IS NULL AND agreement_id IS NOT NULL)
    );

CREATE INDEX stripe_checkout_sessions_agreement_idx
  ON public.stripe_checkout_sessions(agreement_id);

-- ── 3) rental_plans_pos — the stripped store-side projection ────────────────
-- Definer view (security_invoker OFF — the default, stated explicitly): the
-- view owner reads THROUGH the is_internal()-only RLS of 0253, exposing only
-- these columns to any signed-in seller. NO pct columns — a dealer must never
-- see the supplier's cut nor a supplier the dealer's base (0253 MAJOR).
-- `stripe_ready` lets the POS grey the lane out instead of failing at pay.

CREATE VIEW public.rental_plans_pos
  WITH (security_invoker = false) AS
  SELECT
    rp.id,
    rp.sku,
    rp.term_months,
    rp.monthly_fee,
    rp.included_package_id,
    sp.name            AS package_name,
    sp.service_type    AS package_service_type,
    sp.visits_per_year AS package_visits_per_year,
    (rp.stripe_price_id IS NOT NULL) AS stripe_ready
  FROM public.rental_plans rp
  LEFT JOIN public.service_packages sp ON sp.id = rp.included_package_id
  WHERE rp.active;

COMMENT ON VIEW public.rental_plans_pos IS
  'Store-facing rental offers (0255) — the deliberate stripped widening 0253 promised (CF rental-pos-config-projection). Active plans only; the supplier/commission split columns are intentionally absent. Definer view: bypasses the internal-only RLS for exactly this column list.';

-- Supabase default privileges hand new objects to anon+authenticated — a
-- definer view bypasses RLS, so anon must be cut explicitly.
REVOKE ALL ON public.rental_plans_pos FROM anon;
GRANT SELECT ON public.rental_plans_pos TO authenticated;

-- ── 4) create_rental_agreement — the atomic POS signup ──────────────────────

CREATE OR REPLACE FUNCTION public.create_rental_agreement(
  p_plan_id          uuid,
  p_customer_name    text,
  p_customer_phone   text,
  p_customer_email   text DEFAULT NULL,
  p_customer_address text DEFAULT NULL,
  p_dealer_id        uuid DEFAULT NULL,  -- honored ONLY when the JWT carries no dealer (internal/bd on-behalf)
  p_salesperson_id   uuid DEFAULT NULL,  -- workflow attribution (FK-checked), not a security boundary
  p_start_date       date DEFAULT NULL,  -- default: today MYT
  p_notes            text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role        text := (SELECT auth.jwt()->'app_metadata'->>'role');
  v_jwt_dealer  uuid := (SELECT public.app_dealer_id());
  v_dealer_id   uuid;
  v_phone_key   text;
  v_today       date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_start       date;
  v_plan        rental_plans;
  v_pkg         service_packages;
  v_customer    customers;
  v_agreement   rental_agreements;
  v_unit        rental_stock_units;
  v_entitlement_id uuid;
  v_visits_total   integer := 0;
BEGIN
  -- "Everyone can sell" (Loo) = the same set that can transact at the POS
  -- (mirrors requireOrderRole in apps/api). Suppliers/partners cannot.
  IF v_role IS NULL OR v_role NOT IN
     ('dealer','salesperson','showroom','bd','principal','operation','finance') THEN
    RAISE EXCEPTION 'Role cannot sell rental plans'
      USING errcode = '42501', detail = 'forbidden';
  END IF;

  -- A store JWT's own dealer always wins (no spoofing); only a dealer-less
  -- JWT (principal / operation / finance / bd on-behalf) may pass p_dealer_id.
  -- Both null = an HQ-direct agreement — allowed.
  v_dealer_id := coalesce(v_jwt_dealer, p_dealer_id);

  IF coalesce(trim(p_customer_name), '') = '' THEN
    RAISE EXCEPTION 'Customer name is required'
      USING errcode = 'P0001', detail = 'invalid_customer';
  END IF;

  v_phone_key := public.pwp_phone_key(p_customer_phone);
  IF coalesce(v_phone_key, '') = '' THEN
    RAISE EXCEPTION 'Customer phone has no usable digits'
      USING errcode = 'P0001', detail = 'invalid_phone';
  END IF;

  v_start := coalesce(p_start_date, v_today);
  -- A week of backdating covers "signed on paper yesterday"; 180 days forward
  -- covers a pre-sold launch. Outside that is almost certainly a typo.
  IF v_start < v_today - 7 OR v_start > v_today + 180 THEN
    RAISE EXCEPTION 'Start date out of range'
      USING errcode = 'P0001', detail = 'invalid_start_date';
  END IF;

  SELECT * INTO v_plan FROM rental_plans WHERE id = p_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rental plan not found'
      USING errcode = 'P0001', detail = 'plan_not_found';
  END IF;
  IF NOT v_plan.active THEN
    RAISE EXCEPTION 'Rental plan is not active'
      USING errcode = 'P0001', detail = 'plan_inactive';
  END IF;

  IF p_salesperson_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM salespersons s WHERE s.id = p_salesperson_id) THEN
    RAISE EXCEPTION 'Unknown salesperson'
      USING errcode = 'P0001', detail = 'invalid_salesperson';
  END IF;

  -- Customer upsert by canonical phone. An EXISTING customer keeps their name
  -- and stored phone (identity anchor — a store terminal must not silently
  -- rename someone with live agreements); email/address only fill blanks.
  INSERT INTO customers (name, phone, phone_key, email, address, created_by)
  VALUES (
    trim(p_customer_name),
    trim(p_customer_phone),
    v_phone_key,
    nullif(trim(coalesce(p_customer_email, '')), ''),
    nullif(trim(coalesce(p_customer_address, '')), ''),
    auth.uid()
  )
  ON CONFLICT (phone_key) DO UPDATE
    SET email      = coalesce(customers.email,   excluded.email),
        address    = coalesce(customers.address, excluded.address),
        updated_at = now()
  RETURNING * INTO v_customer;

  -- Agreement — sku/term/fee/splits are SNAPSHOTS from the plan row read
  -- HERE, inside the definer transaction. The client named a plan; the DB
  -- priced it.
  INSERT INTO rental_agreements (
    customer_id, dealer_id, salesperson_id, plan_id,
    sku, term_months, monthly_fee, supplier_rate_pct, commission_base_pct,
    start_date, status, notes, created_by
  ) VALUES (
    v_customer.id, v_dealer_id, p_salesperson_id, v_plan.id,
    v_plan.sku, v_plan.term_months, v_plan.monthly_fee,
    v_plan.supplier_rate_pct, v_plan.commission_base_pct,
    v_start, 'active', nullif(trim(coalesce(p_notes, '')), ''), auth.uid()
  )
  RETURNING * INTO v_agreement;

  -- The full term's schedule, all 'due'. Month N is due start + (N-1) months
  -- (Postgres clamps Jan-31 → Feb-28 the way finance expects). Segment ②'s
  -- billing engine marks these paid from Stripe invoices.
  INSERT INTO rental_billings (agreement_id, seq, due_date, amount_due, status)
  SELECT v_agreement.id,
         gs,
         (v_start + make_interval(months => gs - 1))::date,
         v_plan.monthly_fee,
         'due'
    FROM generate_series(1, v_plan.term_months) AS gs;

  -- The rented-out ASSET (Loo: still Carres property until ownership
  -- transfers). Born 'allocated'; ops flips it in_rental at deployment.
  INSERT INTO rental_stock_units (sku, agreement_id, customer_id, status, updated_by)
  VALUES (v_plan.sku, v_agreement.id, v_customer.id, 'allocated', auth.uid())
  RETURNING * INTO v_unit;

  INSERT INTO rental_unit_events (unit_id, event_type, description, actor)
  VALUES (
    v_unit.id, 'note',
    'Allocated at signup for ' || v_agreement.agreement_no,
    auth.uid()
  );

  -- Included service package → ONE entitlement whose visits ride the TERM
  -- (0248 doctrine), pre-generated visits spaced 12/visits_per_year months
  -- apart (landed as whole days: round(seq × 365/visits_per_year)). Mirrors
  -- shared serviceVisitsTotal: floor(term × visits/yr ÷ 12), min 1.
  IF v_plan.included_package_id IS NOT NULL THEN
    SELECT * INTO v_pkg FROM service_packages WHERE id = v_plan.included_package_id;
    IF FOUND THEN
      v_visits_total := greatest(
        1, floor((v_plan.term_months * v_pkg.visits_per_year)::numeric / 12)::integer
      );

      INSERT INTO service_entitlements (
        customer_id, package_id, source, agreement_id,
        visits_total, starts_on, expires_on, status, created_by
      ) VALUES (
        v_customer.id, v_pkg.id, 'rental', v_agreement.id,
        v_visits_total, v_start,
        (v_start + make_interval(months => v_plan.term_months))::date,
        'active', auth.uid()
      )
      RETURNING id INTO v_entitlement_id;

      INSERT INTO service_visits (entitlement_id, seq, due_date, unit_id, status)
      SELECT v_entitlement_id,
             gs,
             v_start + round(gs * 365.0 / v_pkg.visits_per_year)::integer,
             v_unit.id,
             'pending'
        FROM generate_series(1, v_visits_total) AS gs;
    END IF;
  END IF;

  -- audit_log's role column is the app enum; 'salesperson' etc. live outside
  -- it, so the seller role travels in actor_text (the 0223 webhook precedent).
  INSERT INTO audit_log (role, actor_text, action, dealer_id, ref)
  VALUES (NULL, 'pos-rental:' || v_role, 'rental.agreement_created',
          v_dealer_id, v_agreement.agreement_no);

  RETURN jsonb_build_object(
    'agreement',     to_jsonb(v_agreement),
    'customer',      to_jsonb(v_customer),
    'unit',          to_jsonb(v_unit),
    'entitlementId', v_entitlement_id,
    'visitsTotal',   v_visits_total
  );
END;
$$;

-- Callable by any signed-in user — the role gate INSIDE is the boundary
-- (store roles must reach it; RLS on the tables stays internal-only).
REVOKE EXECUTE ON FUNCTION public.create_rental_agreement(uuid, text, text, text, text, uuid, uuid, date, text) FROM public;
REVOKE EXECUTE ON FUNCTION public.create_rental_agreement(uuid, text, text, text, text, uuid, uuid, date, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.create_rental_agreement(uuid, text, text, text, text, uuid, uuid, date, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.create_rental_agreement(uuid, text, text, text, text, uuid, uuid, date, text) TO service_role;

-- ── 5) link_rental_subscription — webhook/poll stamps the Stripe ids ────────
-- NOT money: cycle collections (billings.paid + splits) are segment ②'s RPC.

CREATE OR REPLACE FUNCTION public.link_rental_subscription(
  p_session_id             text,
  p_stripe_subscription_id text,
  p_stripe_customer_id     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session stripe_checkout_sessions;
  v_ra      rental_agreements;
  v_already boolean;
BEGIN
  -- Row lock serialises webhook vs poll-reconcile racing on the same session.
  SELECT * INTO v_session
    FROM stripe_checkout_sessions
   WHERE session_id = p_session_id
     FOR UPDATE;
  -- Same vocabulary as record_stripe_checkout_payment so the webhook's
  -- "foreign session → acknowledge, don't retry" branch matches both.
  IF NOT FOUND OR v_session.purpose <> 'rental_subscription'
     OR v_session.agreement_id IS NULL THEN
    RAISE EXCEPTION 'Unknown checkout session'
      USING errcode = '42P01', detail = 'session_not_found';
  END IF;

  v_already := v_session.status = 'paid';

  UPDATE stripe_checkout_sessions
     SET status  = 'paid',
         paid_at = coalesce(paid_at, now())
   WHERE id = v_session.id;

  -- coalesce keeps the FIRST linked ids — at-least-once delivery can never
  -- re-point a live agreement at a different subscription.
  UPDATE rental_agreements
     SET stripe_subscription_id = coalesce(stripe_subscription_id, p_stripe_subscription_id),
         stripe_customer_id     = coalesce(stripe_customer_id, p_stripe_customer_id),
         updated_at             = now()
   WHERE id = v_session.agreement_id
   RETURNING * INTO v_ra;

  IF NOT v_already THEN
    INSERT INTO audit_log (role, actor_text, action, dealer_id, ref)
    VALUES (NULL, 'stripe-webhook', 'rental.subscription_linked',
            v_ra.dealer_id, v_ra.agreement_no);
  END IF;

  RETURN jsonb_build_object(
    'already',      v_already,
    'agreementId',  v_ra.id,
    'agreementNo',  v_ra.agreement_no
  );
END;
$$;

-- service_role only — the webhook / API server calls this; no browser ever.
REVOKE EXECUTE ON FUNCTION public.link_rental_subscription(text, text, text) FROM public;
REVOKE EXECUTE ON FUNCTION public.link_rental_subscription(text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.link_rental_subscription(text, text, text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.link_rental_subscription(text, text, text) TO service_role;

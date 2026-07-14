-- =============================================================================
-- 0223_stripe_checkout.sql (Loo 2026-07-14)
-- =============================================================================
-- Feature: Stripe online collection — POS generates a Stripe Checkout link
-- (QR at the counter / WhatsApp link) for an order's balance; the customer
-- pays by FPX / card on Stripe's hosted page; the webhook (or the POS poll's
-- live reconcile) records the payment automatically. Mirrors what a manual
-- top-up does today: orders.paid moves + an order_history entry — no separate
-- balance source of truth.
--
-- Two objects:
--   1. stripe_checkout_sessions — one row per checkout link we mint. Tracks
--      who created it, for which order, the FIXED amount, and its lifecycle
--      (open → paid | expired). `purpose` is forward-looking: the mattress
--      RENTAL plan (RM/month subscriptions) will reuse this table's shape.
--   2. record_stripe_checkout_payment(...) — SECURITY DEFINER, service_role
--      ONLY (the Stripe webhook has no user JWT). Idempotent: the row lock +
--      status guard means Stripe's at-least-once webhook delivery (and the
--      poll-reconcile racing it) can never double-credit an order.
--
-- Safety:
--   - ADDITIVE — new table + new function; no existing object is touched.
--   - RLS: internal roles read (ops debugging / finance recon); NO client
--     writes — every write goes through the Hono API (explicit role checks)
--     or the webhook, both using service_role.
--   - Reversible: drop function + drop table.
-- =============================================================================

-- 1) The checkout-session tracker.
create table if not exists public.stripe_checkout_sessions (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null references public.orders(id) on delete cascade,
  -- Stripe's ids. session_id is the idempotency anchor (unique).
  session_id            text not null unique,
  payment_intent_id     text,
  amount                numeric(12, 2) not null check (amount > 0),
  currency              text not null default 'myr',
  -- 'order_balance' today; the rental plan adds 'rental_subscription' later.
  purpose               text not null default 'order_balance'
                        check (purpose in ('order_balance', 'rental_subscription')),
  url                   text not null,
  status                text not null default 'open'
                        check (status in ('open', 'paid', 'expired')),
  -- e.g. 'fpx (maybank2u)' / 'card (visa **** 4242)' — display only.
  payment_method_detail text,
  created_by            uuid references auth.users(id),
  created_at            timestamptz not null default now(),
  expires_at            timestamptz,
  paid_at               timestamptz
);
create index if not exists stripe_checkout_sessions_order_idx
  on public.stripe_checkout_sessions(order_id);

alter table public.stripe_checkout_sessions enable row level security;

-- Internal roles read (mirrors order_payments_read_internal, 0184). No client
-- write policy on purpose: inserts/updates are API- or webhook-side only.
drop policy if exists stripe_checkout_sessions_read_internal on public.stripe_checkout_sessions;
create policy stripe_checkout_sessions_read_internal on public.stripe_checkout_sessions
  for select
  using ( (select public.is_internal()) );

-- 2) Record a completed Checkout payment. Called by the webhook AND by the
--    POS poll's live-reconcile — whichever lands first wins, the other is a
--    no-op (already=true). NOT capped at the outstanding balance: by the time
--    this runs Stripe has ALREADY captured the money, so the ledger must
--    record reality (the create-session API caps the amount at outstanding,
--    so an overshoot needs a concurrent manual payment — display clamps at
--    100%, and finance sees the true figure).
create or replace function public.record_stripe_checkout_payment(
  p_session_id            text,
  p_payment_intent_id     text default null,
  p_payment_method_detail text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session stripe_checkout_sessions;
  v_order   orders;
  v_new_paid numeric(12,2);
begin
  -- Row lock serialises webhook vs poll-reconcile racing on the same session.
  select * into v_session
    from stripe_checkout_sessions
   where session_id = p_session_id
     for update;
  if not found then
    raise exception 'Unknown checkout session'
      using errcode = '42P01', detail = 'session_not_found';
  end if;

  if v_session.status = 'paid' then
    return jsonb_build_object(
      'already', true,
      'orderId', v_session.order_id,
      'amount',  v_session.amount
    );
  end if;

  select * into v_order from orders where id = v_session.order_id for update;
  if not found then
    raise exception 'Order not found'
      using errcode = '42P01', detail = 'order_not_found';
  end if;

  update stripe_checkout_sessions
     set status                = 'paid',
         paid_at               = now(),
         payment_intent_id     = coalesce(p_payment_intent_id, payment_intent_id),
         payment_method_detail = coalesce(p_payment_method_detail, payment_method_detail)
   where id = v_session.id;

  v_new_paid := v_order.paid + v_session.amount;
  update orders
     set paid = v_new_paid,
         updated_at = now()
   where id = v_order.id;

  -- Same history vocabulary as top_up_order so every payment surface (drawer
  -- timeline, activity feed) renders it without a new branch. by_role NULL:
  -- the customer paid — no staff role to attribute.
  insert into order_history (order_id, text, by_role, metadata)
  values (
    v_session.order_id,
    format(
      'Top-up RM %s via Stripe%s%s',
      v_session.amount::text,
      case
        when p_payment_method_detail is not null and trim(p_payment_method_detail) <> ''
        then ' · ' || p_payment_method_detail
        else ''
      end,
      case
        when p_payment_intent_id is not null and trim(p_payment_intent_id) <> ''
        then ' · ref ' || p_payment_intent_id
        else ''
      end
    ),
    null,
    jsonb_build_object(
      'kind', 'top_up',
      'amount', v_session.amount,
      'method', 'stripe',
      'method_label', 'Stripe (online)',
      'reference', p_payment_intent_id,
      'stripe_session_id', p_session_id,
      'date', (now() at time zone 'Asia/Kuala_Lumpur')::date,
      'photo_paths', '[]'::jsonb
    )
  );

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values (
    null,
    'stripe-webhook',
    'order.stripe_payment',
    v_order.dealer_id,
    'DL-' || v_order.dl::text
  );

  return jsonb_build_object(
    'already', false,
    'orderId', v_session.order_id,
    'amount',  v_session.amount,
    'paid',    v_new_paid
  );
end;
$$;

-- service_role only — the webhook / API server calls this; no browser ever.
revoke execute on function public.record_stripe_checkout_payment(text, text, text) from public;
revoke execute on function public.record_stripe_checkout_payment(text, text, text) from anon;
revoke execute on function public.record_stripe_checkout_payment(text, text, text) from authenticated;
grant  execute on function public.record_stripe_checkout_payment(text, text, text) to service_role;

-- =============================================================================
-- 0224_stripe_receipt_url.sql (Loo 2026-07-15)
-- =============================================================================
-- Feature: finance reconciliation trail for Stripe payments. Every captured
-- charge gets Stripe's hosted receipt persisted on the checkout-session row
-- and into the order_history metadata — the system-generated equivalent of
-- the manual slip photo + approval code (Loo: "finance 要 track back 做 bank
-- reconciliation"). The reconciliation chain becomes:
--   bank statement line → Stripe payout id → charges (order #SO in metadata)
--   → this receipt_url + payment_intent reference on the order.
--
-- Changes:
--   1. stripe_checkout_sessions.receipt_url — Stripe's permanent hosted
--      receipt for the captured charge.
--   2. record_stripe_checkout_payment gains p_receipt_url. Postgres would
--      treat a defaulted 4th arg as a NEW OVERLOAD next to the 0223 3-arg
--      function — two overloads make PostgREST RPC dispatch ambiguous, so the
--      old signature is DROPPED and recreated (idempotency semantics
--      unchanged; grants re-applied).
--
-- Safety: ADDITIVE column; function swap is transactional. The API deploy
-- that passes the 4th arg ships together with this migration.
-- =============================================================================

alter table public.stripe_checkout_sessions
  add column if not exists receipt_url text;

drop function if exists public.record_stripe_checkout_payment(text, text, text);

create or replace function public.record_stripe_checkout_payment(
  p_session_id            text,
  p_payment_intent_id     text default null,
  p_payment_method_detail text default null,
  p_receipt_url           text default null
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
    -- Already recorded — still backfill the receipt if the first recorder
    -- (e.g. a fast poll without the charge expanded yet) missed it.
    if p_receipt_url is not null and v_session.receipt_url is null then
      update stripe_checkout_sessions set receipt_url = p_receipt_url where id = v_session.id;
    end if;
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
         payment_method_detail = coalesce(p_payment_method_detail, payment_method_detail),
         receipt_url           = coalesce(p_receipt_url, receipt_url)
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
      'receipt_url', p_receipt_url,
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
revoke execute on function public.record_stripe_checkout_payment(text, text, text, text) from public;
revoke execute on function public.record_stripe_checkout_payment(text, text, text, text) from anon;
revoke execute on function public.record_stripe_checkout_payment(text, text, text, text) from authenticated;
grant  execute on function public.record_stripe_checkout_payment(text, text, text, text) to service_role;

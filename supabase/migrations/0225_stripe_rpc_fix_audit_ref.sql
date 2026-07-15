-- =============================================================================
-- 0225_stripe_rpc_fix_audit_ref.sql (2026-07-15, hotfix)
-- =============================================================================
-- Bug: 0223/0224's record_stripe_checkout_payment copied its audit_log line
-- from the REPO copy of top_up_order (0105): `'DL-' || v_order.dl` — but
-- orders.dl does not exist on prod (the LIVE top_up_order was already fixed
-- there to `'SO-' || v_order.so` by a dashboard-era migration the repo never
-- captured — the migration-ledger≠disk drift bites again). plpgsql only
-- resolves column refs at EXECUTION, so 0223/0224 applied cleanly and the
-- function would have thrown on the first real payment.
--
-- Fix: recreate the 4-arg function with the audit ref the live top_up_order
-- uses. Everything else is byte-identical to 0224. Grants re-applied.
-- =============================================================================

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
  select * into v_session
    from stripe_checkout_sessions
   where session_id = p_session_id
     for update;
  if not found then
    raise exception 'Unknown checkout session'
      using errcode = '42P01', detail = 'session_not_found';
  end if;

  if v_session.status = 'paid' then
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
    'SO-' || v_order.so::text
  );

  return jsonb_build_object(
    'already', false,
    'orderId', v_session.order_id,
    'amount',  v_session.amount,
    'paid',    v_new_paid
  );
end;
$$;

revoke execute on function public.record_stripe_checkout_payment(text, text, text, text) from public;
revoke execute on function public.record_stripe_checkout_payment(text, text, text, text) from anon;
revoke execute on function public.record_stripe_checkout_payment(text, text, text, text) from authenticated;
grant  execute on function public.record_stripe_checkout_payment(text, text, text, text) to service_role;

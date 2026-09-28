-- 0594 — a receipt recorded on AR · Receivables is dated today in Kuala Lumpur.
--
-- finance_record_receipt passed current_date as the payment's paid_on.
-- current_date is the database clock's day, and Supabase's clock is UTC, so a
-- receipt recorded between 00:00 and 08:00 KL was dated yesterday. 0519 fixed
-- the other dated doors with (timezone('Asia/Kuala_Lumpur', now()))::date;
-- this is the same fix for this door.
--
-- Body: the latest, 0500 (its role gate rewrite of 0476's body). Only the
-- date changes. create or replace keeps 0476's grants (authenticated only,
-- not public or anon) and its comment. No RLS change.

create or replace function public.finance_record_receipt(
  p_order_id uuid, p_amount numeric, p_method text, p_reference text,
  p_idempotency_key text default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  -- 0476: coalesced — an unknown caller's NULL role is refused, not waved through (0448's lesson).
  if coalesce((public.app_role() is null or public.app_role() not in ('finance','principal')), true) then raise exception 'forbidden' using errcode='42501'; end if;
  return public._customer_payment_post(p_order_id, p_amount, (timezone('Asia/Kuala_Lumpur', now()))::date, p_method, 'payment',  -- 0594: KL today
    'finance_ar', coalesce(nullif(p_idempotency_key,''), gen_random_uuid()::text), p_reference,
    p_reference, null, null, null, '{}'::jsonb, true);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 0559 . EVERY DOOR THAT TAKES MONEY ASKS FOR THE REFERENCE
--         (owner, 2026-09-22 - "if the usual way has a guard, the other ways
--          should have the same guard too")
--
-- WHAT WAS BROKEN
-- 0535 put the section 16 reference rule inside the ONE customer-payment
-- writer, _customer_payment_post, and 0551 widened it to bank transfer and
-- DuitNow QR. But three doors never call that writer. They INSERT into the
-- `payments` table themselves, and so the rule never reached them:
--
--   . finance_topup_approve  - the dealer top-up approval door. Inserts the
--                              payment AND bumps dealers.deposit_balance.
--   . dealer_topup           - the same top-up, without the approval row.
--   . order_record_payment   - the 0062-era customer receipt door; inserts
--                              the payment and bumps orders.paid.
--
-- The approvals drawer added a form check, but a form check is not a guard: a
-- stale browser tab, a direct RPC call or any other entrance still posted a
-- top-up with a blank reference. Confirmed by reading pg_proc.prosrc on a
-- clone of carres_main_0549, not by grepping the migration files.
--
-- WHAT CHANGES
-- One tiny helper, _payment_reference_guard, carries the SAME four refusal
-- sentences 0551 already uses, word for word - the owner has approved those
-- and nothing new is invented here. The three doors call it before they write
-- anything. Cash and dealer_deposit stay optional for the same reason 0551
-- left cash optional: there is no number a person could type.
--
-- The refusal is a plain RAISE, so the whole call rolls back: the approval
-- stays pending, no payments row is written and deposit_balance does not move.
--
-- NOT TOUCHED: _customer_payment_post keeps its own inline branches. It is
-- being rewritten on another branch (0551) and a refactor here would collide.
-- Section 6: no existing row is read, written or backfilled by this file.
-- No RLS change. No secret. No row count asserted.
-- ---------------------------------------------------------------------------

begin;

-- The guard itself. Method folding is payment_method_key's job (0476), so the
-- enum spellings (bank_transfer, credit_card, debit_card) and the text keys
-- both land on the right branch.
create or replace function public._payment_reference_guard(
  p_method text,
  p_reference text
) returns void
language plpgsql immutable
as $fn$
declare
  v_method text;
begin
  if nullif(btrim(coalesce(p_reference, '')), '') is not null then
    return;
  end if;
  v_method := public.payment_method_key(p_method);
  if v_method = 'cheque' then
    raise exception 'a cheque payment needs its cheque number'
      using errcode = '22023', detail = 'payment_reference_required';
  elsif v_method in ('card', 'credit_card', 'debit_card') then
    raise exception 'a card payment needs its approval code'
      using errcode = '22023', detail = 'payment_reference_required';
  elsif v_method = 'bank' then
    raise exception 'a bank transfer needs its reference number'
      using errcode = '22023', detail = 'payment_reference_required';
  elsif v_method = 'duitnow_qr' then
    raise exception 'a DuitNow QR payment needs its reference number'
      using errcode = '22023', detail = 'payment_reference_required';
  end if;
end;
$fn$;

comment on function public._payment_reference_guard(text,text) is
  'The section 16 reference rule (0535, widened by 0551) for the doors that do not route through _customer_payment_post. Same four sentences, word for word. Cash, dealer_deposit and anything else stay optional - there is no number a person could type.';

revoke all on function public._payment_reference_guard(text,text) from public, anon;
grant execute on function public._payment_reference_guard(text,text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The three doors. Bodies are the ones standing in carres_main_0549; the ONLY
-- change in each is the guard call, placed before the first write.
-- ---------------------------------------------------------------------------

create or replace function public.finance_topup_approve(
  p_approval_id uuid,
  p_method payment_method,
  p_reference text,
  p_receipt_url text
) returns payments
language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare
  v_app approvals;
  v_pay payments;
begin
  if (public.app_role() is null or public.app_role() not in ('finance','principal')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_app from approvals where id = p_approval_id for update;
  if not found then
    raise exception 'approval not found' using errcode = 'P0002';
  end if;

  if v_app.kind <> 'top_up' then
    raise exception 'approval kind must be top_up, got %', v_app.kind
      using errcode = '22023';
  end if;

  if v_app.status <> 'pending' then
    raise exception 'approval already decided (status %)', v_app.status
      using errcode = '22023';
  end if;

  if v_app.dealer_id is null then
    raise exception 'approval missing dealer_id' using errcode = '23502';
  end if;

  if v_app.amount is null or v_app.amount <= 0 then
    raise exception 'approval amount must be positive' using errcode = '22023';
  end if;

  -- 0559: the section 16 reference, before anything is written. The approval
  -- stays pending and the deposit balance does not move.
  perform public._payment_reference_guard(p_method::text, p_reference);

  update approvals
     set status        = 'approved',
         decided_at    = now(),
         decided_by    = auth.uid(),
         decision_note = format('Top-up approved · %s · %s',
                                p_method,
                                coalesce(p_reference, '—'))
   where id = p_approval_id;

  insert into payments (direction, amount, method, reference,
                        paid_at, receipt_url, recorded_by)
  values ('in', v_app.amount, p_method, p_reference,
          current_date, p_receipt_url, auth.uid())
  returning * into v_pay;

  update dealers
     set deposit_balance = deposit_balance + v_app.amount,
         updated_at      = now()
   where id = v_app.dealer_id;

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values (public.app_role(),
          (select name from app_users where id = auth.uid()),
          format('Top-up approve · RM %s · %s', v_app.amount, p_method),
          v_app.dealer_id,
          p_reference);

  return v_pay;
end;
$fn$;

create or replace function public.dealer_topup(
  p_dealer_id uuid,
  p_amount numeric,
  p_method payment_method,
  p_reference text,
  p_receipt_url text
) returns payments
language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare v_pay payments;
begin
  -- 0559: same guard, same sentences.
  perform public._payment_reference_guard(p_method::text, p_reference);

  insert into payments (direction, amount, method, reference, paid_at, receipt_url, recorded_by)
  values ('in', p_amount, p_method, p_reference, current_date, p_receipt_url, auth.uid())
  returning * into v_pay;

  update dealers set deposit_balance = deposit_balance + p_amount where id = p_dealer_id;

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values (public.app_role(),
          (select name from app_users where id = auth.uid()),
          format('Top-up · RM %s · %s', p_amount, p_method),
          p_dealer_id,
          p_reference);

  return v_pay;
end;
$fn$;

create or replace function public.order_record_payment(
  p_order_id uuid,
  p_amount numeric,
  p_method payment_method,
  p_reference text,
  p_note text,
  p_receipt_url text
) returns payments
language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare v_pay payments;
begin
  -- 0559: same guard, same sentences.
  perform public._payment_reference_guard(p_method::text, p_reference);

  insert into payments (direction, amount, method, reference, note, paid_at,
                        order_id, receipt_url, recorded_by)
  values ('in', p_amount, p_method, p_reference, p_note, current_date,
          p_order_id, p_receipt_url, auth.uid())
  returning * into v_pay;

  update orders set paid = paid + p_amount where id = p_order_id;

  insert into order_history (order_id, text, by_role, by_user_id)
  values (p_order_id,
          format('Payment received · RM %s · %s', p_amount, p_method),
          public.app_role(), auth.uid());

  return v_pay;
end;
$fn$;

-- -- sanity ------------------------------------------------------------------
do $sanity$
declare
  v_src text;
  v_name text;
begin
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_payment_reference_guard';
  if v_src is null then
    raise exception '0559 sanity: the guard is missing';
  end if;
  -- The four sentences are 0551s, byte for byte.
  if v_src !~ 'a cheque payment needs its cheque number'
     or v_src !~ 'a card payment needs its approval code'
     or v_src !~ 'a bank transfer needs its reference number'
     or v_src !~ 'a DuitNow QR payment needs its reference number' then
    raise exception '0559 sanity: a refusal sentence does not match 0551';
  end if;
  -- Nothing here may ask cash or the dealer deposit for a number.
  if v_src ~ '''cash''' or v_src ~ '''dealer_deposit''' then
    raise exception '0559 sanity: cash or dealer deposit was given a rule it cannot answer';
  end if;
  -- Every direct-insert door calls the guard.
  foreach v_name in array array['finance_topup_approve','dealer_topup','order_record_payment'] loop
    select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_name;
    if v_src is null or v_src !~ '_payment_reference_guard' then
      raise exception '0559 sanity: % does not call the guard', v_name;
    end if;
  end loop;
  if has_function_privilege('anon', 'public._payment_reference_guard(text,text)', 'execute') then
    raise exception '0559 sanity: anon may execute the guard';
  end if;
end;
$sanity$;

commit;

-- =============================================================================
-- 0593_legacy_money_doors_close_to_signed_in_users.sql
-- Two old money doors that skip the ledger are closed to signed in users.
--
-- WHAT WAS WRONG
--   order_record_payment (latest body 0559) and dealer_topup (latest body
--   0559) are SECURITY DEFINER with no role check, and 0003 granted EXECUTE on
--   both to authenticated. 0482 took anon and public away but left
--   authenticated. So any signed in user, of any role, could call them
--   straight through PostgREST:
--     . order_record_payment raises orders.paid with a bare payments row: no
--       order_payments row, no receipt, no journal. A raised orders.paid also
--       opens the delivery order money gate.
--     . dealer_topup raises dealers.deposit_balance with no ledger entry.
--
-- WHO STILL NEEDS THEM: nobody signed in.
--   . No app code calls either one (git grep over apps/ and packages/ finds
--     only comments and docs).
--   . No SQL function calls either one. finance_topup_approve (latest body
--     0559) does NOT call dealer_topup: it writes its own payments row and
--     bumps deposit_balance itself, so this file cannot break it.
--
-- WHAT THIS CHANGES (grants only)
--   EXECUTE is revoked from public, anon and authenticated on both functions.
--   service_role keeps EXECUTE, and the owner always has it. No function body,
--   no table, no RLS policy and no row is touched. Nothing is dropped.
--
-- NO ROW COUNT IS ASSERTED (CLAUDE.md section 5.8).
-- IDEMPOTENT: revoke and grant are safe to re-run.
-- =============================================================================

begin;

revoke execute on function public.order_record_payment(uuid, numeric, payment_method, text, text, text)
  from public, anon, authenticated;
grant execute on function public.order_record_payment(uuid, numeric, payment_method, text, text, text)
  to service_role;

revoke execute on function public.dealer_topup(uuid, numeric, payment_method, text, text)
  from public, anon, authenticated;
grant execute on function public.dealer_topup(uuid, numeric, payment_method, text, text)
  to service_role;

-- -- sanity ------------------------------------------------------------------
do $sanity$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.order_record_payment(uuid, numeric, payment_method, text, text, text)',
    'public.dealer_topup(uuid, numeric, payment_method, text, text)'
  ] loop
    if has_function_privilege('authenticated', v_fn, 'execute') then
      raise exception '0593 sanity: authenticated may still execute %', v_fn;
    end if;
    if has_function_privilege('anon', v_fn, 'execute') then
      raise exception '0593 sanity: anon may still execute %', v_fn;
    end if;
    if not has_function_privilege('service_role', v_fn, 'execute') then
      raise exception '0593 sanity: service_role lost execute on %', v_fn;
    end if;
  end loop;
  -- The approval door is untouched and stays open to signed in finance staff.
  if not has_function_privilege('authenticated',
       'public.finance_topup_approve(uuid, payment_method, text, text)', 'execute') then
    raise exception '0593 sanity: finance_topup_approve lost its authenticated grant';
  end if;
end;
$sanity$;

commit;

-- =============================================================================
-- 0515_a_money_account_stays_in_use_while_a_payment_method_points_at_it.sql
-- =============================================================================
-- WHAT WAS WRONG
--   Finance could take a money account out of use on Finance -> Settings
--   (gl_money_account_update, 0512) while an active payment method in
--   Settings -> Payment still pointed at it (gl_payment_account_map). Customer
--   payments with that method would still post to the out-of-use account.
--   The same state could be reached the other way round: a method that was
--   off, on an account that later went out of use, could be turned back on
--   with the Active switch (payment_set_method_active, 0431). Choosing an
--   out-of-use account in the method form was already refused
--   (payment_method_save, 0476, through gl_money_account_ok).
--
-- WHAT THIS CHANGES
--   Two functions, each redefined from its latest body with one check added.
--   1. gl_money_account_update (0512): taking an account out of use is refused
--      while an active payment method points at it (detail
--      money_account_used_by_method).
--   2. payment_set_method_active (0431): turning a method on is refused while
--      its account is out of use (detail money_account_out_of_use).
--   Both raise P0001, which the API returns as 422 with the sentence.
--   No table, row, grant or RLS policy changes.
-- =============================================================================

create or replace function public.gl_money_account_update(p_code text, p_name text, p_is_active boolean)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role   text := public.app_role()::text;
  v_m      public.gl_money_accounts%rowtype;
  v_old    text;
  v_name   text;
  v_total  numeric(14,2);
  v_method text;
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'Only Finance changes the money accounts.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  select * into v_m from public.gl_money_accounts where account_code = p_code for update;
  if not found then
    raise exception 'That money account is not on the list.'
      using errcode = 'P0002', detail = 'money_account_missing';
  end if;
  select a.name into v_old from public.gl_accounts a where a.code = p_code;
  v_name := public._gl_money_account_name(p_name, p_code);

  -- Out of use only at RM 0.00: money still on it would drop out of every
  -- picker while the ledger still holds it.
  if v_m.is_active and p_is_active is false then
    select coalesce(sum(l.debit - l.credit), 0) into v_total
      from public.gl_entry_lines l where l.account_code = p_code;
    if v_total <> 0 then
      raise exception '% % is not at RM 0.00 in the ledger. It stays in use until it is.', p_code, v_old
        using errcode = 'P0001', detail = 'money_account_not_zero';
    end if;
    -- 0515: nor while an active payment method still lands money here.
    select m.label into v_method
      from public.gl_payment_account_map g
      join public.payment_manual_methods m on m.method = g.method
     where g.account_code = p_code and m.active
     order by m.sort, m.label
     limit 1;
    if v_method is not null then
      raise exception '% % is the account for the % payment method. It stays in use until that payment method uses another account.',
        p_code, v_old, v_method
        using errcode = 'P0001', detail = 'money_account_used_by_method';
    end if;
  end if;

  if v_name is distinct from v_old then
    update public.gl_accounts set name = v_name where code = p_code;
  end if;
  update public.gl_money_accounts
     set is_active  = coalesce(p_is_active, v_m.is_active),
         updated_at = now(),
         updated_by = auth.uid()
   where account_code = p_code;
  return p_code;
end;
$fn$;

comment on function public.gl_money_account_update(text, text, boolean) is
  '0512, 0515: renames a money account, or takes it in or out of use. Out of use is refused while its ledger total is not RM 0.00, or while an active payment method points at it. Finance or principal.';
revoke all on function public.gl_money_account_update(text, text, boolean) from public, anon;
grant execute on function public.gl_money_account_update(text, text, boolean) to authenticated;

create or replace function public.payment_set_method_active(
  p_method text,
  p_active boolean
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_old  payment_manual_methods;
  v_new  payment_manual_methods;
  v_acct text;
begin
  perform public.payment_settings_gate();
  select * into v_old from payment_manual_methods where method = p_method for update;
  if not found then
    raise exception 'unknown payment method' using errcode = '22023', detail = 'bad_method';
  end if;
  if p_active is null then
    raise exception 'say Active yes or no' using errcode = '22023', detail = 'bad_active';
  end if;
  if v_old.active and not p_active
     and (select count(*) from payment_manual_methods where active) <= 1 then
    raise exception 'at least one manual method must stay Active'
      using errcode = '22023', detail = 'last_method';
  end if;
  -- 0515: a method goes on only while its money account is in use.
  if not v_old.active and p_active then
    v_acct := public.gl_account_for_payment_method(p_method, null);
    if not public.gl_money_account_ok(v_acct) then
      raise exception '% % is out of use. Choose another account for the % payment method first.',
        coalesce(v_acct, ''), coalesce((select a.name from gl_accounts a where a.code = v_acct), ''), v_old.label
        using errcode = 'P0001', detail = 'money_account_out_of_use';
    end if;
  end if;
  update payment_manual_methods
     set active = p_active, updated_by = auth.uid(), updated_at = now()
   where method = p_method
   returning * into v_new;
  insert into payment_setting_changes (what, old_value, new_value, actor_id)
  values ('manual_method:' || p_method, to_jsonb(v_old), to_jsonb(v_new), auth.uid());
  return to_jsonb(v_new);
end;
$fn$;

comment on function public.payment_set_method_active(text, boolean) is
  '0431, 0515: turns a payment method on or off. At least one stays on. Turning one on is refused while its money account is out of use. Manager gate (payment_settings_gate).';
revoke all on function public.payment_set_method_active(text, boolean) from public, anon;
grant execute on function public.payment_set_method_active(text, boolean) to authenticated;

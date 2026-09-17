-- =============================================================================
-- 0523_the_switch_off_check_counts_every_payment_account_map_row.sql
-- =============================================================================
-- WHAT WAS WRONG
--   0515 refuses taking a money account out of use while a payment method
--   points at it, but it only looked at ACTIVE rows of payment_manual_methods,
--   the methods a manager sees on Settings -> Payment. gl_payment_account_map
--   also holds rows no screen shows: 'card' (POS Credit / Instalment fold to it,
--   0476 payment_method_key) and 'online' / 'online'+'stripe_checkout' (the
--   Stripe webhook, 0351). Move the three card methods to a holding account,
--   bring 1130 to RM 0.00, tick it off: 0515 lets it through, and the next
--   Stripe checkout or POS card deposit posts to an account that reads
--   "Not active". A switched-off manual method keeps its row too, and the
--   Finance receipt door still posts through it (0476:653).
--
-- WHAT THIS CHANGES
--   1. gl_money_account_update (0515 body): the refusal now counts EVERY
--      gl_payment_account_map row that points at the account, on or off,
--      manual or system. Same sentence, same detail. A system row is named
--      by its screen word: 'online' -> Online payment, 'card' -> Card.
--   2. payment_set_method_active (0515 body): takes a share lock on the
--      gl_money_accounts row before its check, so "turn the method on" and
--      "take the account out of use" cannot both pass at the same moment
--      (gl_money_account_update already locks that row for update).
--   The writers are NOT touched: a refused ledger post cancels the customer's
--   payment (0468), so the guard stays on the switch, never on the post.
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
    -- 0515, widened by 0523: nor while ANY payment method still lands money
    -- here, including the rows no screen shows (POS card, Stripe).
    select coalesce(m.label, case g.method when 'online' then 'Online payment'
                                           when 'card'   then 'Card'
                                           else g.method end)
      into v_method
      from public.gl_payment_account_map g
      left join public.payment_manual_methods m on m.method = g.method
     where g.account_code = p_code
     order by (m.method is null), coalesce(m.active, false) desc, m.sort, m.label, g.method
     limit 1;
    if v_method is not null then
      raise exception '% still uses % %. Move % to another account first.',
        v_method, p_code, v_old, v_method
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
  '0512, 0515, 0523: renames a money account, or takes it in or out of use. Out of use is refused while its ledger total is not RM 0.00, or while any payment method row (manual or system, on or off) points at it. Finance or principal.';
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
    -- 0523: wait for a Finance Settings save on this account, so the two
    -- checks cannot pass side by side.
    perform 1 from public.gl_money_accounts where account_code = v_acct for share;
    if not public.gl_money_account_ok(v_acct) then
      raise exception '% % is out of use. Move % to another account first.',
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
  '0431, 0515, 0523: turns a payment method on or off. At least one stays on. Turning one on is refused while its money account is out of use. Manager gate (payment_settings_gate).';
revoke all on function public.payment_set_method_active(text, boolean) from public, anon;
grant execute on function public.payment_set_method_active(text, boolean) to authenticated;

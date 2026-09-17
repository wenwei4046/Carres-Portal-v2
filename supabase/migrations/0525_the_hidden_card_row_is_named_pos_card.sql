-- 0525 — the hidden card row is named POS card.
--
-- 0523 made gl_money_account_update count every gl_payment_account_map row
-- that points at an account, including the two rows no screen shows, and
-- named each of those by a screen word: 'online' reads Online payment and
-- 'card' reads Card. COPY-STANDARD held Card as a proposal pending approval.
-- On 17 Sep YH approved "POS card" instead: the money on that row is POS
-- credit, debit and instalment money. The change reached the #1376 branch
-- after it was merged, so main's 0523 still says Card, and a committed
-- migration is never edited.
--
-- This is the 0523 body with one word changed: the 'card' row now reads
-- POS card. The Finance Settings refusal then reads "POS card still uses
-- {code} {name}. Move POS card to another account first." Same signature,
-- same SECURITY DEFINER, same search_path, same sentence, errcode and detail.
-- The comment is replayed with 0525 added; the revoke and grant are replayed
-- as 0523 wrote them. Run it after 0523.
-- Nothing else changes: payment_set_method_active, tables, rows, grants and
-- RLS are not touched.

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
                                           when 'card'   then 'POS card'
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
  '0512, 0515, 0523, 0525: renames a money account, or takes it in or out of use. Out of use is refused while its ledger total is not RM 0.00, or while any payment method row (manual or system, on or off) points at it. Finance or principal.';
revoke all on function public.gl_money_account_update(text, text, boolean) from public, anon;
grant execute on function public.gl_money_account_update(text, text, boolean) to authenticated;

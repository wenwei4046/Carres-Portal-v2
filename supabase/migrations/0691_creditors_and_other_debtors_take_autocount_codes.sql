-- =============================================================================
-- 0691_creditors_and_other_debtors_take_autocount_codes.sql
-- =============================================================================
-- THE RULING (Chew 2026-10-12, 「A 可以，B 可以，做吧」; docs/finance/MASTER.md
--   §3.2 "Codes" and §4 "Finance Settings"):
--   A. Every supplier, other creditor and other debtor has a code in
--      AutoCount's form, made by the system and changeable by Finance:
--      400-A001 for a supplier (Trade Creditors' number and the name's first
--      letter), 405-N001 for an other creditor, 305-A001 for an other debtor.
--   B. Money accounts take AutoCount's numbering: 1130 CARD - MACHINE NOT
--      KNOWN becomes 315-9000, beside the merchants under 315-0000.
--
-- WHAT THIS CHANGES
--   1. fin_party_codes: Finance's own code for a supplier (Purchasing's
--      record, only read) or an other debtor (finance_parties). A code is
--      unique and is never a chart account's number.
--   2. _fin_party_codes_fill(): gives every supplier and other debtor without
--      a code the next one, in name order. The number before the dash is the
--      payables account of its kind (TRADE_PAYABLE, OTHER_PAYABLE) or the
--      other debtors' control account; the letter is the name's first letter
--      or digit (0 when it has none); then the next number after the highest
--      under that number and letter, skipping one a chart account uses.
--   3. fin_party_codes(): Finance reads every code, a new supplier or party
--      getting its own first. fin_party_code_set(supplier, party, code):
--      Finance changes one; the change is written to the audit log.
--   4. 1130 is renumbered 315-9000 the way the chart's own door renumbers
--      (gl_account_update): every key onto the account follows it (ON UPDATE
--      CASCADE: money accounts, card routes, payment maps, posted lines).
--   Then every supplier and other debtor gets its code.
--
-- RLS: fin_party_codes is closed to every role (RLS on, no policy); only the
--   definer functions read and write it.
-- DATA: a code per supplier and other debtor; 1130's new number. DR/CR: none.
-- =============================================================================

begin;

set local search_path = public, pg_temp;

-- ── 1 · the codes ────────────────────────────────────────────────────────────
create table public.fin_party_codes (
  supplier_id uuid unique references public.suppliers(id) on delete cascade,
  party_id    uuid unique references public.finance_parties(id) on delete cascade,
  code        text not null unique,
  set_at      timestamptz not null default now(),
  set_by      uuid,
  constraint fin_party_codes_one_party check ((supplier_id is null) <> (party_id is null)),
  constraint fin_party_codes_shape check (code ~ '^[0-9]{3}-[0-9A-Z][0-9]{3}$')
);

comment on table public.fin_party_codes is
  '0691: Finance''s AutoCount-style code for each supplier (or other creditor) and other debtor, like 400-A001. Written only by the definer functions.';

alter table public.fin_party_codes enable row level security;
revoke all on table public.fin_party_codes from public, anon, authenticated;

-- ── 2 · the next code, and the fill ──────────────────────────────────────────
-- The three digits before the dash of an account, like 400 of 400-0000.
create function public._fin_code_prefix(p_account text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $fn$
  select substring(p_account from '^([0-9]{3})-');
$fn$;

create function public._fin_party_code_next(p_prefix text, p_name text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_letter text := coalesce(substring(upper(coalesce(p_name, '')) from '[A-Z0-9]'), '0');
  v_n      integer;
begin
  if p_prefix is null then
    raise exception 'There is no account to number the code from.'
      using errcode = 'P0001', detail = 'code_prefix_missing';
  end if;
  select coalesce(max(substring(c.code from 6 for 3)::integer), 0) + 1 into v_n
    from public.fin_party_codes c
   where c.code like p_prefix || '-' || v_letter || '___';
  -- A chart account may use a number in the same run (AutoCount's 900-A001).
  while exists (select 1 from public.gl_accounts a
                 where a.code = p_prefix || '-' || v_letter || lpad(v_n::text, 3, '0'))
     or exists (select 1 from public.fin_party_codes c
                 where c.code = p_prefix || '-' || v_letter || lpad(v_n::text, 3, '0')) loop
    v_n := v_n + 1;
  end loop;
  if v_n > 999 then
    raise exception 'Every code from %-%001 to %-%999 is taken. Type a code.', p_prefix, v_letter, p_prefix, v_letter
      using errcode = 'P0001', detail = 'code_run_full';
  end if;
  return p_prefix || '-' || v_letter || lpad(v_n::text, 3, '0');
end;
$fn$;

revoke all on function public._fin_party_code_next(text, text) from public, anon, authenticated;

create function public._fin_party_codes_fill()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_trade  text := public._fin_code_prefix(public.gl_account_for('TRADE_PAYABLE'));
  v_other  text := public._fin_code_prefix(public.gl_account_for('OTHER_PAYABLE'));
  v_debtor text := public._fin_code_prefix((
                     select a.code from public.gl_accounts a
                      where a.kind = 'ASSET' and a.is_control and a.control_for = 'OTHER' and a.is_active
                      order by a.code
                      limit 1));
  v_given  integer := 0;
  r        record;
begin
  perform pg_advisory_xact_lock(hashtext('fin_party_codes'));
  for r in
    select s.id, s.name, s.kind::text as kind
      from public.suppliers s
     where not exists (select 1 from public.fin_party_codes c where c.supplier_id = s.id)
     order by s.name, s.id
  loop
    insert into public.fin_party_codes (supplier_id, code)
    values (r.id, public._fin_party_code_next(case when r.kind = 'other_creditor' then v_other else v_trade end, r.name));
    v_given := v_given + 1;
  end loop;
  for r in
    select p.id, p.name
      from public.finance_parties p
     where not exists (select 1 from public.fin_party_codes c where c.party_id = p.id)
     order by p.name, p.id
  loop
    insert into public.fin_party_codes (party_id, code)
    values (r.id, public._fin_party_code_next(v_debtor, r.name));
    v_given := v_given + 1;
  end loop;
  return v_given;
end;
$fn$;

revoke all on function public._fin_party_codes_fill() from public, anon, authenticated;

-- ── 3 · the doors ────────────────────────────────────────────────────────────
create function public.fin_party_codes()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.gl_may_read() then
    raise exception 'Only Finance reads the codes.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  perform public._fin_party_codes_fill();
  return coalesce((
    select jsonb_agg(jsonb_build_object('supplier_id', c.supplier_id, 'party_id', c.party_id, 'code', c.code)
                     order by c.code)
      from public.fin_party_codes c), '[]'::jsonb);
end;
$fn$;

revoke all on function public.fin_party_codes() from public, anon;
grant execute on function public.fin_party_codes() to authenticated;

comment on function public.fin_party_codes() is
  '0691: every supplier''s and other debtor''s code, a new one getting its own first. Finance only.';

create function public.fin_party_code_set(p_supplier_id uuid, p_party_id uuid, p_code text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role   text := public.app_role()::text;
  v_code   text := btrim(coalesce(p_code, ''));
  v_name   text;
  v_holder text;
begin
  if v_role is null or v_role not in ('finance', 'principal') then
    raise exception 'Only Finance changes a code.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  if (p_supplier_id is null) = (p_party_id is null) then
    raise exception 'Choose a supplier or an other debtor.'
      using errcode = '22023', detail = 'code_party_missing';
  end if;
  -- Stored in capitals, as the chart's numbers are: 400-a001 is kept as 400-A001.
  if v_code ~ '^[0-9]{3}-[0-9A-Za-z][0-9]{3}$' then
    v_code := upper(v_code);
  end if;
  if v_code !~ '^[0-9]{3}-[0-9A-Z][0-9]{3}$' then
    raise exception 'Type a code like 400-A001.'
      using errcode = '22023', detail = 'code_shape';
  end if;
  if p_supplier_id is not null then
    select s.name into v_name from public.suppliers s where s.id = p_supplier_id;
    if not found then
      raise exception 'That supplier does not exist.'
        using errcode = 'P0002', detail = 'supplier_missing';
    end if;
  else
    select p.name into v_name from public.finance_parties p where p.id = p_party_id;
    if not found then
      raise exception 'That party does not exist.'
        using errcode = 'P0002', detail = 'party_missing';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('fin_party_codes'));
  if exists (select 1 from public.gl_accounts a where a.code = v_code) then
    raise exception '% is an account in the chart. Choose another code.', v_code
      using errcode = '22023', detail = 'code_is_account';
  end if;
  select coalesce(s.name, p.name) into v_holder
    from public.fin_party_codes c
    left join public.suppliers s on s.id = c.supplier_id
    left join public.finance_parties p on p.id = c.party_id
   where c.code = v_code
     and not (c.supplier_id is not distinct from p_supplier_id
              and c.party_id is not distinct from p_party_id);
  if found then
    raise exception '% is already the code of %.', v_code, coalesce(v_holder, 'another party')
      using errcode = '22023', detail = 'code_exists';
  end if;

  if p_supplier_id is not null then
    insert into public.fin_party_codes (supplier_id, code, set_at, set_by)
    values (p_supplier_id, v_code, now(), auth.uid())
    on conflict (supplier_id) do update
      set code = excluded.code, set_at = excluded.set_at, set_by = excluded.set_by;
  else
    insert into public.fin_party_codes (party_id, code, set_at, set_by)
    values (p_party_id, v_code, now(), auth.uid())
    on conflict (party_id) do update
      set code = excluded.code, set_at = excluded.set_at, set_by = excluded.set_by;
  end if;

  insert into public.audit_log (role, actor_text, action, ref)
  values (public.app_role(),
          (select u.name from public.app_users u where u.id = auth.uid()),
          format('Code %s · %s', v_code, v_name),
          v_code);
  return v_code;
end;
$fn$;

revoke all on function public.fin_party_code_set(uuid, uuid, text) from public, anon;
grant execute on function public.fin_party_code_set(uuid, uuid, text) to authenticated;

comment on function public.fin_party_code_set(uuid, uuid, text) is
  '0691: Finance changes a supplier''s or other debtor''s code. Unique, never a chart account''s number; audited.';

-- ── 4 · 1130 takes AutoCount's numbering ─────────────────────────────────────
-- As gl_account_update renumbers: the two settings tell each frozen
-- document's trigger that this is a renumber, and are cleared straight after.
do $renumber$
begin
  perform pg_advisory_xact_lock(hashtext('gl_chart_structure'));
  if exists (select 1 from public.gl_accounts a where a.code = '1130')
     and not exists (select 1 from public.gl_accounts a where a.code = '315-9000') then
    perform set_config('carres.gl_renumber_from', '1130', true),
            set_config('carres.gl_renumber_to',   '315-9000', true);
    update public.gl_accounts set code = '315-9000' where code = '1130';
    perform set_config('carres.gl_renumber_from', '', true),
            set_config('carres.gl_renumber_to',   '', true);
  end if;
end
$renumber$;

-- ── 5 · every supplier and other debtor gets its code ────────────────────────
select public._fin_party_codes_fill();

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
begin
  if exists (select 1 from public.suppliers s
              where not exists (select 1 from public.fin_party_codes c where c.supplier_id = s.id))
     or exists (select 1 from public.finance_parties p
              where not exists (select 1 from public.fin_party_codes c where c.party_id = p.id)) then
    raise exception '0691: a supplier or an other debtor has no code';
  end if;
  if exists (select 1 from public.fin_party_codes c join public.gl_accounts a on a.code = c.code) then
    raise exception '0691: a code is a chart account''s number';
  end if;
  if exists (select 1 from public.gl_accounts a where a.code = '1130') then
    raise exception '0691: 1130 was not renumbered';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname in ('_fin_party_code_next', '_fin_party_codes_fill', 'fin_party_codes', 'fin_party_code_set')
                and not (p.prosecdef and p.proconfig @> array['search_path=public, pg_temp'])) then
    raise exception '0691: a code function lost security definer or its search_path';
  end if;
  if has_function_privilege('authenticated', 'public._fin_party_codes_fill()', 'execute')
     or has_function_privilege('authenticated', 'public._fin_party_code_next(text, text)', 'execute')
     or has_function_privilege('anon', 'public.fin_party_codes()', 'execute')
     or has_function_privilege('anon', 'public.fin_party_code_set(uuid, uuid, text)', 'execute') then
    raise exception '0691: a code function is open to the wrong role';
  end if;
  if has_table_privilege('authenticated', 'public.fin_party_codes', 'select') then
    raise exception '0691: the codes are open to read around Finance''s doors';
  end if;
end
$sanity$;

commit;

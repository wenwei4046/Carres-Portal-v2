-- =============================================================================
-- 0682_finance_records_a_bills_foreign_currency.sql
-- =============================================================================
-- THE RULING (Chew 2026-10-03, docs/finance/MASTER.md §3.2 "Foreign
--   currency"): needed, but rarely used. Record the foreign amount and the rate
--   only; the books stay in RM, and no exchange gain or loss is worked out
--   automatically. Built on Chew's word 2026-10-10 (「做」).
--
-- WHAT THIS ADDS
--   supplier_bill_foreign_amounts: for a bill a supplier invoiced in another
--   currency, the currency (three letters, never MYR), the amount on the
--   supplier's invoice and the rate used. A record only: the bill's lines stay
--   in RM and post as before; nothing here posts.
--   supplier_bill_foreign_amount_set(bill, currency, amount, rate): Finance
--   records or changes it, or removes it (no currency), on a bill that is not
--   cancelled. The bill's history says so.
--
-- RLS: the table reads for Finance (gl_may_read); written only by its door.
-- DATA: none. DR/CR: none.
-- =============================================================================

begin;

set local search_path = public, pg_temp;

create table public.supplier_bill_foreign_amounts (
  bill_id        uuid primary key references public.supplier_bills(id),
  currency       text not null check (currency ~ '^[A-Z]{3}$' and currency <> 'MYR'),
  foreign_amount numeric(14,2) not null check (foreign_amount > 0),
  rate           numeric(14,6) not null check (rate > 0),
  set_at         timestamptz not null default now(),
  set_by         uuid references public.app_users(id)
);
comment on table public.supplier_bill_foreign_amounts is
  '0682: the currency, amount and rate of a bill a supplier invoiced in another currency. A record only: the bill stays in RM, nothing posts. Written only by supplier_bill_foreign_amount_set.';

alter table public.supplier_bill_foreign_amounts enable row level security;
revoke all on public.supplier_bill_foreign_amounts from anon, authenticated;
grant select on public.supplier_bill_foreign_amounts to authenticated;
create policy supplier_bill_foreign_amounts_read_internal on public.supplier_bill_foreign_amounts
  for select using ((select public.gl_may_read()));

create or replace function public.supplier_bill_foreign_amount_set(
  p_bill_id        uuid,
  p_currency       text,
  p_foreign_amount numeric,
  p_rate           numeric
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role text := public.app_role()::text;
  v_me   uuid := (select u.id from public.app_users u where u.id = auth.uid());
  v_bill public.supplier_bills%rowtype;
  v_cur  text := upper(btrim(coalesce(p_currency, '')));
begin
  if v_role is null or v_role not in ('finance', 'principal') then
    raise exception 'Only Finance records a bill''s foreign currency.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  select * into v_bill from public.supplier_bills where id = p_bill_id for update;
  if not found then
    raise exception 'That bill does not exist.' using errcode = 'P0002', detail = 'bill_missing';
  end if;
  if v_bill.status = 'cancelled' then
    raise exception 'A cancelled bill takes no change.' using errcode = 'P0001', detail = 'bill_cancelled';
  end if;

  -- No currency: the bill was in ringgit after all.
  if v_cur = '' then
    delete from public.supplier_bill_foreign_amounts where bill_id = p_bill_id;
    if found then
      perform public._ap_event('SUPPLIER_BILL', p_bill_id, 'edited', 'Foreign currency removed');
    end if;
    return p_bill_id;
  end if;

  if v_cur !~ '^[A-Z]{3}$' then
    raise exception 'Type the currency as three letters, like USD.' using errcode = 'P0001', detail = 'currency_invalid';
  end if;
  if v_cur = 'MYR' then
    raise exception 'A bill in ringgit has no foreign currency. Leave the currency empty.'
      using errcode = 'P0001', detail = 'currency_is_myr';
  end if;
  if p_foreign_amount is null or p_foreign_amount <= 0 or round(p_foreign_amount, 2) <> p_foreign_amount then
    raise exception 'Type the amount on the supplier''s invoice, like 1250.00.' using errcode = 'P0001', detail = 'amount_invalid';
  end if;
  if p_rate is null or p_rate <= 0 or round(p_rate, 6) <> p_rate then
    raise exception 'Type the rate as a number above 0, like 4.215.' using errcode = 'P0001', detail = 'rate_invalid';
  end if;

  insert into public.supplier_bill_foreign_amounts (bill_id, currency, foreign_amount, rate, set_by)
  values (p_bill_id, v_cur, p_foreign_amount, p_rate, v_me)
  on conflict (bill_id) do update
     set currency       = excluded.currency,
         foreign_amount = excluded.foreign_amount,
         rate           = excluded.rate,
         set_at         = now(),
         set_by         = excluded.set_by;

  perform public._ap_event('SUPPLIER_BILL', p_bill_id, 'edited',
    format('Foreign currency %s %s at %s', v_cur, to_char(p_foreign_amount, 'FM999,999,999,990.00'),
           trim_scale(p_rate)::text));
  return p_bill_id;
end;
$fn$;

revoke all on function public.supplier_bill_foreign_amount_set(uuid, text, numeric, numeric) from public, anon;
grant execute on function public.supplier_bill_foreign_amount_set(uuid, text, numeric, numeric) to authenticated;

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'supplier_bill_foreign_amount_set'
                and not (p.prosecdef and p.proconfig @> array['search_path=public, pg_temp'])) then
    raise exception '0682 sanity: the door lacks security definer or its search_path';
  end if;
  if has_table_privilege('authenticated', 'public.supplier_bill_foreign_amounts', 'insert')
     or has_table_privilege('authenticated', 'public.supplier_bill_foreign_amounts', 'delete')
     or has_function_privilege('anon', 'public.supplier_bill_foreign_amount_set(uuid, text, numeric, numeric)', 'execute') then
    raise exception '0682 sanity: a bill''s foreign currency can be written around its door';
  end if;
end
$sanity$;

commit;

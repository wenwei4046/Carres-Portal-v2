-- =============================================================================
-- 0664_a_dealer_sees_its_commission_statement.sql
-- =============================================================================
-- THE RULING (Chew, Finance, 2026-10-05, confirmed by management 2026-10-07,
--   D3; docs/finance/MASTER.md §3.2 "Dealer statement"; build step 3
--   「可以，开始做第3步」, 「直接做完」 2026-10-09): a statement like a
--   supplier's — what Carres owes the dealer and when it was paid — live, with
--   the commission still waiting on orders whose balance is not in yet; and
--   each dealer logs in and sees its own statement (「dealer 要能看自己的
--   statement」). Emailing it is not built (「email 可以不用做先」).
--
-- WHAT WAS MISSING (measured 2026-10-09)
--   - No statement: the report showed one month at a time, and nothing tied a
--     payment voucher to the dealer it paid (a voucher names a payee by text).
--   - A dealer login could read nothing of its commission.
--
-- WHAT THIS ADDS
--   1. _dealer_commission_orders(dealer, end): the orders the commission is
--      worked from, for one dealer or every dealer, placed before `end`, with
--      their lines, payments and refunds before it — the one place this shape
--      is built. dealer_commission_source now reads it (same output).
--   2. dealer_commission_payments: a paid payment voucher counted as a payment
--      to a dealer. Taking it off keeps the row (unlinked_at).
--   3. Doors (Finance and principal): dealer_commission_payment_link and
--      dealer_commission_payment_unlink, and the read
--      dealer_commission_payment_choices (paid direct vouchers not yet given
--      to a dealer).
--   4. dealer_commission_statement(dealer): everything a dealer's statement
--      is worked from, up to today. Finance and principal read any dealer; a
--      dealer login reads its own only. The arithmetic is
--      packages/shared/src/dealer-commission.ts (one place).
--
-- RLS: dealer_commission_payments is read by Finance (gl_may_read) and
--   written only by its doors. A dealer reads its statement through the
--   statement door alone. DATA: none. DR/CR: none.
-- =============================================================================

begin;

set local search_path = public, pg_temp;

-- ── 1 · the orders the commission is worked from ─────────────────────────────
create or replace function public._dealer_commission_orders(p_dealer_id uuid, p_end date)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $fn$
  -- Collected = live customer payments that are not storage (the 0351 rule).
  -- An order with none of those is still here, earning nothing and carrying
  -- its whole commission in "still to collect".
  select coalesce((
    select jsonb_agg(jsonb_build_object(
      'orderId', ord.id, 'so', ord.so, 'dealerId', ord.dealer_id, 'outletId', ord.outlet_id,
      -- 0661: the order day in Malaysia, whose rates the order takes.
      'orderedOn', (ord.placed_at at time zone 'Asia/Kuala_Lumpur')::date,
      'customer', ord.customer_name,
      -- 0662: the day a cancelled order was cancelled (its cancel or abandon
      -- line, else the day the order last changed), and the day Finance
      -- took its commission back.
      'cancelledOn', case when ord.status = 'cancelled' then coalesce(
          (select (max(h.occurred_at) at time zone 'Asia/Kuala_Lumpur')::date
             from order_history h
            where h.order_id = ord.id
              and (h.metadata ->> 'kind' = 'cancel' or h.text like 'Order cancelled%' or h.text like 'Order abandoned%')),
          (ord.updated_at at time zone 'Asia/Kuala_Lumpur')::date) end,
      'takeBackOn', (select t.taken_back_on from public.dealer_commission_take_backs t
                      where t.order_id = ord.id and t.undone_at is null),
      'addons', (select coalesce(sum(a.qty * a.unit_price), 0)
                   from order_addons a where a.order_id = ord.id),
      'lines', (select coalesce(jsonb_agg(jsonb_build_object(
                         'modelId', m.id, 'category', m.category, 'value', l.qty * l.unit_price, 'qty', l.qty,
                         'rate', public.dealer_commission_rate(ord.dealer_id, m.id, m.category::text,
                                   (ord.placed_at at time zone 'Asia/Kuala_Lumpur')::date))), '[]'::jsonb)
                  from order_lines l
                  left join product_skus sk on sk.sku = l.sku
                  left join product_models m on m.id = sk.model_id
                 where l.order_id = ord.id),
      'payments', (select jsonb_agg(jsonb_build_object('paidOn', op.paid_on, 'amount', op.amount))
                     from order_payments op
                    where op.order_id = ord.id and op.kind <> 'storage'
                      and op.voided_at is null and op.paid_on < p_end),
      -- Refunds HQ has PAID OUT, by the Malaysian day paid (0597).
      'refunds', (select jsonb_agg(jsonb_build_object(
                           'paidOn', (rf.paid_at at time zone 'Asia/Kuala_Lumpur')::date,
                           'amount', rf.amount))
                    from order_refunds rf
                   where rf.order_id = ord.id and rf.status = 'paid'
                     and (rf.paid_at at time zone 'Asia/Kuala_Lumpur')::date < p_end))
      -- By dealer, then the day placed: the order the report reads them in.
      order by d.name, ord.placed_at, ord.so)
      from orders ord
      join dealers d on d.id = ord.dealer_id and d.channel = 'dealer'
     where (p_dealer_id is null or ord.dealer_id = p_dealer_id)
       -- The day the order was placed IN MALAYSIA; a bare timestamptz < date
       -- comparison would read it off the session's TimeZone (UTC).
       and (ord.placed_at at time zone 'Asia/Kuala_Lumpur')::date < p_end), '[]'::jsonb);
$fn$;

comment on function public._dealer_commission_orders(uuid, date) is
  '0664: the dealer orders commission is worked from (one dealer, or every dealer when null), placed before p_end, with lines (rate on the order day), payments and paid refunds before it. Private: read through dealer_commission_source and dealer_commission_statement.';

revoke all on function public._dealer_commission_orders(uuid, date) from public, anon, authenticated;

create or replace function public.dealer_commission_source(p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_end date := (date_trunc('month', p_month) + interval '1 month')::date;
begin
  if not coalesce(public.gl_may_read(), false) then
    raise exception 'Finance or Principal only' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'settings', jsonb_build_object('defaultRate',
                   public.dealer_commission_rate(null, null, null, (now() at time zone 'Asia/Kuala_Lumpur')::date)),
    'rates', coalesce((
      select jsonb_agg(jsonb_build_object('modelId', r.model_id, 'modelName', pm.name, 'rate', r.rate)
                       order by pm.name)
        from public.dealer_commission_rules r join product_models pm on pm.id = r.model_id
       where r.kind = 'product' and r.removed_at is null
         and (r.starts_on is null or r.starts_on <= (now() at time zone 'Asia/Kuala_Lumpur')::date)
         and not exists (select 1 from public.dealer_commission_rules x
                          where x.kind = 'product' and x.model_id = r.model_id and x.removed_at is null
                            and x.starts_on <= (now() at time zone 'Asia/Kuala_Lumpur')::date
                            and x.starts_on > coalesce(r.starts_on, '-infinity'::date))), '[]'::jsonb),
    'quotas', coalesce((
      select jsonb_agg(jsonb_build_object('dealerId', q.dealer_id, 'quota', q.quota,
                                          'rebateRate', q.rebate_rate, 'startsOn', q.starts_on))
        from dealer_rebate_quotas q), '[]'::jsonb),
    'models', coalesce((
      select jsonb_agg(jsonb_build_object('id', pm.id, 'name', pm.name) order by pm.name)
        from product_models pm
       where pm.discontinued_at is null
         and pm.category::text not in ('service', 'guarantee', 'accessory')), '[]'::jsonb),
    'dealers', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name) order by d.name)
        from dealers d where d.channel = 'dealer'), '[]'::jsonb),
    'outlets', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'dealerId', o.dealer_id)
                       order by o.name)
        from outlets o join dealers d on d.id = o.dealer_id and d.channel = 'dealer'), '[]'::jsonb),
    -- 0664: one place builds the orders (the statement reads the same).
    'orders', public._dealer_commission_orders(null, v_end)
  );
end
$fn$;

-- ── 2 · payments to a dealer ─────────────────────────────────────────────────
create table if not exists public.dealer_commission_payments (
  id           uuid primary key default gen_random_uuid(),
  dealer_id    uuid not null references public.dealers(id),
  voucher_id   uuid not null references public.payment_vouchers(id),
  linked_by    uuid references public.app_users(id),
  linked_at    timestamptz not null default now(),
  unlinked_by  uuid references public.app_users(id),
  unlinked_at  timestamptz
);

comment on table public.dealer_commission_payments is
  '0664: a paid payment voucher counted as a payment to a dealer on its commission statement. Taking it off keeps the row (unlinked_at). Written only by dealer_commission_payment_link / _unlink.';

create unique index if not exists dealer_commission_payments_one_live
  on public.dealer_commission_payments (voucher_id) where unlinked_at is null;

alter table public.dealer_commission_payments enable row level security;

drop policy if exists dealer_commission_payments_finance_read on public.dealer_commission_payments;
create policy dealer_commission_payments_finance_read on public.dealer_commission_payments
  for select using ((select public.gl_may_read()));

revoke all on public.dealer_commission_payments from anon;
revoke insert, update, delete on public.dealer_commission_payments from authenticated;

-- ── 3 · the doors ────────────────────────────────────────────────────────────
create or replace function public.dealer_commission_payment_link(p_voucher_id uuid, p_dealer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role    text := (select public.app_role())::text;
  v_voucher record;
  v_live    public.dealer_commission_payments;
begin
  if v_role is null or v_role not in ('finance', 'principal') then
    raise exception 'Only Finance records payments to a dealer.' using errcode = '42501', detail = 'not_finance';
  end if;
  if not exists (select 1 from public.dealers d where d.id = p_dealer_id and d.channel = 'dealer') then
    raise exception 'That dealer is not on the list.' using errcode = 'P0002', detail = 'dealer_not_found';
  end if;
  select v.id, v.voucher_no, v.status, v.purpose into v_voucher
    from public.payment_vouchers v where v.id = p_voucher_id for update;
  if not found then
    raise exception 'That payment voucher is not on the list.' using errcode = 'P0002', detail = 'voucher_not_found';
  end if;
  if v_voucher.status <> 'approved' or v_voucher.purpose <> 'DIRECT' then
    raise exception 'Only a paid direct payment voucher counts as a payment to a dealer.'
      using errcode = '22023', detail = 'voucher_not_paid_direct';
  end if;

  select * into v_live from public.dealer_commission_payments
   where voucher_id = p_voucher_id and unlinked_at is null for update;
  if found then
    if v_live.dealer_id = p_dealer_id then
      return jsonb_build_object('id', v_live.id, 'already', true);
    end if;
    raise exception 'Payment voucher % is already a payment to another dealer.', v_voucher.voucher_no
      using errcode = '22023', detail = 'voucher_taken';
  end if;
  insert into public.dealer_commission_payments (dealer_id, voucher_id, linked_by)
  values (p_dealer_id, p_voucher_id, auth.uid())
  returning * into v_live;
  return jsonb_build_object('id', v_live.id, 'already', false);
end;
$fn$;

create or replace function public.dealer_commission_payment_unlink(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role text := (select public.app_role())::text;
  v_row  public.dealer_commission_payments;
begin
  if v_role is null or v_role not in ('finance', 'principal') then
    raise exception 'Only Finance records payments to a dealer.' using errcode = '42501', detail = 'not_finance';
  end if;
  select * into v_row from public.dealer_commission_payments where id = p_id for update;
  if not found then
    raise exception 'That payment is not on the statement.' using errcode = 'P0002', detail = 'not_found';
  end if;
  if v_row.unlinked_at is not null then
    return jsonb_build_object('id', v_row.id, 'already', true);
  end if;
  update public.dealer_commission_payments
     set unlinked_at = now(), unlinked_by = auth.uid()
   where id = p_id;
  return jsonb_build_object('id', v_row.id, 'already', false);
end;
$fn$;

create or replace function public.dealer_commission_payment_choices()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not coalesce(public.gl_may_read(), false) then
    raise exception 'Only Finance records payments to a dealer.' using errcode = '42501', detail = 'not_finance';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', v.id, 'voucherNo', v.voucher_no, 'voucherDate', v.voucher_date,
             'payee', v.payee_name, 'amount', v.amount, 'narration', v.narration)
           order by v.voucher_date desc, v.voucher_no desc)
      from public.payment_vouchers v
     where v.status = 'approved' and v.purpose = 'DIRECT'
       and not exists (select 1 from public.dealer_commission_payments p
                        where p.voucher_id = v.id and p.unlinked_at is null)), '[]'::jsonb);
end;
$fn$;

-- ── 4 · the statement ────────────────────────────────────────────────────────
create or replace function public.dealer_commission_statement(p_dealer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role   text := (select public.app_role())::text;
  v_today  date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_dealer uuid;
begin
  if coalesce(public.gl_may_read(), false) then
    v_dealer := p_dealer_id;
  elsif v_role = 'dealer' then
    -- A dealer login reads its own statement, never another's.
    v_dealer := public.app_dealer_id();
    if p_dealer_id is not null and p_dealer_id is distinct from v_dealer then
      raise exception 'A dealer sees only its own statement.' using errcode = '42501', detail = 'not_own_dealer';
    end if;
  else
    raise exception 'Only Finance and the dealer see this statement.' using errcode = '42501', detail = 'not_allowed';
  end if;
  if v_dealer is null or not exists (select 1 from public.dealers d where d.id = v_dealer and d.channel = 'dealer') then
    raise exception 'That dealer is not on the list.' using errcode = 'P0002', detail = 'dealer_not_found';
  end if;

  return jsonb_build_object(
    'today', v_today,
    'dealer', (select jsonb_build_object('id', d.id, 'name', d.name) from public.dealers d where d.id = v_dealer),
    'orders', public._dealer_commission_orders(v_dealer, v_today + 1),
    'quotas', coalesce((
      select jsonb_agg(jsonb_build_object('dealerId', q.dealer_id, 'quota', q.quota,
                                          'rebateRate', q.rebate_rate, 'startsOn', q.starts_on))
        from public.dealer_rebate_quotas q where q.dealer_id = v_dealer), '[]'::jsonb),
    -- Paid vouchers counted as payments to this dealer; a cancelled voucher
    -- is not money paid.
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'voucherId', v.id, 'voucherNo', v.voucher_no,
               'paidOn', v.voucher_date, 'amount', v.amount)
             order by v.voucher_date, v.voucher_no)
        from public.dealer_commission_payments p
        join public.payment_vouchers v on v.id = p.voucher_id
       where p.dealer_id = v_dealer and p.unlinked_at is null and v.status = 'approved'), '[]'::jsonb));
end;
$fn$;

comment on function public.dealer_commission_statement(uuid) is
  '0664: everything a dealer''s commission statement is worked from, up to today. Finance and principal read any dealer; a dealer login reads its own only.';

revoke all on function public.dealer_commission_payment_link(uuid, uuid) from public, anon;
revoke all on function public.dealer_commission_payment_unlink(uuid) from public, anon;
revoke all on function public.dealer_commission_payment_choices() from public, anon;
revoke all on function public.dealer_commission_statement(uuid) from public, anon;
grant execute on function public.dealer_commission_payment_link(uuid, uuid) to authenticated;
grant execute on function public.dealer_commission_payment_unlink(uuid) to authenticated;
grant execute on function public.dealer_commission_payment_choices() to authenticated;
grant execute on function public.dealer_commission_statement(uuid) to authenticated;

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
declare
  v_src text;
  v_out jsonb;
begin
  select pg_get_functiondef('public.dealer_commission_source(date)'::regprocedure) into v_src;
  if position('_dealer_commission_orders(null, v_end)' in v_src) = 0 or position('gl_may_read' in v_src) = 0 then
    raise exception '0664: dealer_commission_source does not read the one orders shape, or lost its check';
  end if;
  select pg_get_functiondef('public._dealer_commission_orders(uuid, date)'::regprocedure) into v_src;
  if position('dealer_commission_rate(ord.dealer_id' in v_src) = 0 or position('order_refunds' in v_src) = 0
     or position('''cancelledOn''' in v_src) = 0 or position('''qty'', l.qty' in v_src) = 0 then
    raise exception '0664: _dealer_commission_orders lost 0597, 0661 or 0662';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname in ('dealer_commission_source', 'dealer_commission_statement', 'dealer_commission_payment_link',
                                  'dealer_commission_payment_unlink', 'dealer_commission_payment_choices')
                and not (p.prosecdef and p.proconfig @> array['search_path=public, pg_temp'])) then
    raise exception '0664: a door or read lost security definer or its search_path';
  end if;
  if has_function_privilege('authenticated', 'public._dealer_commission_orders(uuid, date)', 'execute')
     or has_function_privilege('anon', 'public.dealer_commission_statement(uuid)', 'execute')
     or has_function_privilege('anon', 'public.dealer_commission_payment_link(uuid, uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.dealer_commission_statement(uuid)', 'execute') then
    raise exception '0664: a commission door or helper has the wrong callers';
  end if;
  if has_table_privilege('authenticated', 'public.dealer_commission_payments', 'insert')
     or has_table_privilege('authenticated', 'public.dealer_commission_payments', 'update')
     or has_table_privilege('authenticated', 'public.dealer_commission_payments', 'delete') then
    raise exception '0664: dealer_commission_payments can be written around its doors';
  end if;
  -- A caller with no role is refused before anything is read or written.
  begin
    v_out := public.dealer_commission_statement(null);
    raise exception '0664: the statement ran for a caller with no role';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.dealer_commission_payment_link(gen_random_uuid(), gen_random_uuid());
    raise exception '0664: the payment door ran for a caller with no role';
  exception when insufficient_privilege then
    null;
  end;
end $sanity$;

commit;

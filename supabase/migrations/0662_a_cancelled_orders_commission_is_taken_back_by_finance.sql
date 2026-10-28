-- =============================================================================
-- 0662_a_cancelled_orders_commission_is_taken_back_by_finance.sql
-- =============================================================================
-- THE RULING (Chew, Finance, 2026-10-05, confirmed by management 2026-10-07,
--   D4; docs/finance/MASTER.md §3.2 "Cancelled orders"; build step 2
--   「可以，开始做第2步」 2026-10-08): a cancelled order has nothing still to
--   collect. Commission already earned on money Carres kept stays; each
--   cancelled order carries a switch, off by default, that Finance turns on to
--   take it back (「照理我是根据收到的钱出commission, 所以取消的单就不再有
--   [还没收的佣金]，所以已付的没有影响不是」, 「可以」). Money refunded is
--   taken back in the month it is refunded (0597, unchanged).
--
-- WHAT WAS MISSING (measured 2026-10-08)
--   - dealer_commission_source left cancelled orders out, so what they earned
--     on money Carres kept vanished from every month, and nothing could take
--     it back on purpose.
--   - No record of the day an order was cancelled: cancel_order and
--     operation_abandon_order write it to order_history only.
--
-- WHAT THIS ADDS
--   1. dealer_commission_take_backs: Finance took a cancelled order's
--      commission back, from a day. Undoing it is kept too (undone_at).
--   2. dealer_commission_take_back(order, yes or no): the door, Finance and
--      principal; only a cancelled dealer order.
--   3. dealer_commission_source (guarded rewrite, 0500/0503 style): cancelled
--      orders are read too, each order says its customer, the day it was
--      cancelled (its cancel or abandon line in order_history, else the day
--      the order last changed) and the day its commission was taken back, and
--      each line its quantity (mattress pieces share a bundle discount).
--   4. dealer_commission_rules_read lists the kinds of product in the
--      catalog's order (mattress, bedframe, sofa, accessory).
--   The arithmetic is packages/shared/src/dealer-commission.ts (one place).
--
-- RLS: dealer_commission_take_backs is read by Finance (gl_may_read) and
--   written only by its door. DATA: none. DR/CR: none.
-- =============================================================================

begin;

set local search_path = public, pg_temp;

-- ── 1 · the take-backs ───────────────────────────────────────────────────────
create table if not exists public.dealer_commission_take_backs (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders(id),
  -- The day Finance took it back (Malaysia): its commission counts back in
  -- that month.
  taken_back_on  date not null,
  set_by         uuid references public.app_users(id),
  set_at         timestamptz not null default now(),
  undone_by      uuid references public.app_users(id),
  undone_at      timestamptz
);

comment on table public.dealer_commission_take_backs is
  '0662: Finance took a cancelled dealer order''s commission back, from taken_back_on. Undoing keeps the row (undone_at). Written only by dealer_commission_take_back.';

create unique index if not exists dealer_commission_take_backs_one_live
  on public.dealer_commission_take_backs (order_id) where undone_at is null;

alter table public.dealer_commission_take_backs enable row level security;

drop policy if exists dealer_commission_take_backs_finance_read on public.dealer_commission_take_backs;
create policy dealer_commission_take_backs_finance_read on public.dealer_commission_take_backs
  for select using ((select public.gl_may_read()));

revoke all on public.dealer_commission_take_backs from anon;
revoke insert, update, delete on public.dealer_commission_take_backs from authenticated;

-- ── 2 · the door ─────────────────────────────────────────────────────────────
create or replace function public.dealer_commission_take_back(p_order_id uuid, p_take_back boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role  text := (select public.app_role())::text;
  v_order record;
  v_live  public.dealer_commission_take_backs;
begin
  if v_role is null or v_role not in ('finance', 'principal') then
    raise exception 'Only Finance takes commission back.' using errcode = '42501', detail = 'not_finance';
  end if;
  if p_take_back is null then
    raise exception 'Say whether to take the commission back.' using errcode = '22023', detail = 'take_back_required';
  end if;
  select o.id, o.so, o.status::text as status, d.channel
    into v_order
    from public.orders o join public.dealers d on d.id = o.dealer_id
   where o.id = p_order_id
   for update of o;
  if not found or v_order.channel is distinct from 'dealer' then
    raise exception 'That dealer order is not on the list.' using errcode = 'P0002', detail = 'not_found';
  end if;
  if p_take_back and v_order.status <> 'cancelled' then
    raise exception 'Only a cancelled order''s commission is taken back.' using errcode = '22023', detail = 'not_cancelled';
  end if;

  select * into v_live from public.dealer_commission_take_backs
   where order_id = p_order_id and undone_at is null for update;

  if p_take_back then
    if found then
      return jsonb_build_object('orderId', p_order_id, 'takenBackOn', v_live.taken_back_on, 'already', true);
    end if;
    insert into public.dealer_commission_take_backs (order_id, taken_back_on, set_by)
    values (p_order_id, (now() at time zone 'Asia/Kuala_Lumpur')::date, auth.uid())
    returning * into v_live;
    return jsonb_build_object('orderId', p_order_id, 'takenBackOn', v_live.taken_back_on, 'already', false);
  end if;

  if not found then
    return jsonb_build_object('orderId', p_order_id, 'takenBackOn', null, 'already', true);
  end if;
  update public.dealer_commission_take_backs
     set undone_at = now(), undone_by = auth.uid()
   where id = v_live.id;
  return jsonb_build_object('orderId', p_order_id, 'takenBackOn', null, 'already', false);
end;
$fn$;

comment on function public.dealer_commission_take_back(uuid, boolean) is
  '0662: Finance takes a cancelled dealer order''s commission back (from today, Malaysia), or keeps it again. Finance and principal only.';

revoke all on function public.dealer_commission_take_back(uuid, boolean) from public, anon;
grant execute on function public.dealer_commission_take_back(uuid, boolean) to authenticated;

-- ── 3 · the report's read ────────────────────────────────────────────────────
-- Each changes one short piece of the LIVE body, which must hold it exactly
-- once (line ends read as LF); everything else in the body stays as it is.
create or replace function pg_temp.mig0662_rewrite(p_fn regprocedure, p_old text, p_new text)
returns void
language plpgsql
as $rw$
declare
  v_def text := replace(pg_get_functiondef(p_fn), E'\r\n', E'\n');
  v_n   integer;
begin
  v_n := (length(v_def) - length(replace(v_def, p_old, ''))) / greatest(length(p_old), 1);
  if v_n <> 1 then
    raise exception '0662: % holds the text to change % times, not once: %', p_fn, v_n, left(p_old, 90);
  end if;
  execute replace(v_def, p_old, p_new);
end;
$rw$;

-- (a) cancelled orders count too.
select pg_temp.mig0662_rewrite('public.dealer_commission_source(date)'::regprocedure,
$old$where ord.status <> 'cancelled'$old$,
$new$where true  -- 0662: a cancelled order keeps what it earned (Finance MASTER §3.2)$new$);

-- (b) each order: its customer, the day it was cancelled, the day its
--     commission was taken back.
select pg_temp.mig0662_rewrite('public.dealer_commission_source(date)'::regprocedure,
$old$'orderedOn', (ord.placed_at at time zone 'Asia/Kuala_Lumpur')::date,$old$,
$new$'orderedOn', (ord.placed_at at time zone 'Asia/Kuala_Lumpur')::date,
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
                        where t.order_id = ord.id and t.undone_at is null),$new$);

-- (c) each line: its quantity.
select pg_temp.mig0662_rewrite('public.dealer_commission_source(date)'::regprocedure,
$old$'value', l.qty * l.unit_price,$old$,
$new$'value', l.qty * l.unit_price, 'qty', l.qty,$new$);

-- (d) Commission rates lists the kinds of product in the catalog's order
--     (mattress, bedframe, sofa, accessory), not by name.
select pg_temp.mig0662_rewrite('public.dealer_commission_rules_read()'::regprocedure,
$old$order by r.kind, coalesce(d.name, m.name, r.category::text, ''), r.starts_on nulls first$old$,
$new$order by r.kind, r.category, coalesce(d.name, m.name, ''), r.starts_on nulls first$new$);

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
declare
  v_src text;
begin
  select pg_get_functiondef('public.dealer_commission_source(date)'::regprocedure) into v_src;
  if position('ord.status <> ''cancelled''' in v_src) > 0
     or position('''cancelledOn''' in v_src) = 0 or position('''takeBackOn''' in v_src) = 0
     or position('''customer''' in v_src) = 0 or position('''qty'', l.qty' in v_src) = 0
     or position('dealer_commission_rate(ord.dealer_id' in v_src) = 0 or position('order_refunds' in v_src) = 0 then
    raise exception '0662: dealer_commission_source does not read cancelled orders, their days or line quantities, or lost 0597 or 0661';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname in ('dealer_commission_source', 'dealer_commission_rules_read')
                and not (p.prosecdef and p.proconfig @> array['search_path=public, pg_temp'])) then
    raise exception '0662: a rewritten read lost security definer or its search_path';
  end if;
  select pg_get_functiondef('public.dealer_commission_rules_read()'::regprocedure) into v_src;
  if position('order by r.kind, r.category,' in v_src) = 0 or position('gl_may_read' in v_src) = 0 then
    raise exception '0662: dealer_commission_rules_read lost its check or does not list the kinds in the catalog''s order';
  end if;
  if has_function_privilege('anon', 'public.dealer_commission_take_back(uuid, boolean)', 'execute')
     or not has_function_privilege('authenticated', 'public.dealer_commission_take_back(uuid, boolean)', 'execute') then
    raise exception '0662: the take-back door is open to signed-out callers or closed to signed-in ones';
  end if;
  if has_table_privilege('authenticated', 'public.dealer_commission_take_backs', 'insert')
     or has_table_privilege('authenticated', 'public.dealer_commission_take_backs', 'update')
     or has_table_privilege('authenticated', 'public.dealer_commission_take_backs', 'delete') then
    raise exception '0662: dealer_commission_take_backs can be written around its door';
  end if;
  -- A caller with no role is refused before anything is read or written.
  begin
    perform public.dealer_commission_take_back(gen_random_uuid(), true);
    raise exception '0662: the take-back door ran for a caller with no role';
  exception when insufficient_privilege then
    null;
  end;
end $sanity$;

commit;

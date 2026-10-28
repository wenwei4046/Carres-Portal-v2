-- =============================================================================
-- 0661_commission_rates_start_on_a_date.sql
-- =============================================================================
-- THE RULING (Chew, Finance, 2026-10-05 to 2026-10-07, confirmed by management
--   2026-10-07; docs/finance/MASTER.md §3.2 "Dealer commission rules"; build
--   step 1 「可以，从第1步开始做」 2026-10-08):
--   - every rate has a start date, and an order uses the rate in force on its
--     order date (「新的% 要可以决定几时开始，然后是根据订单的日期决定」);
--   - a rate is kept per product and per dealer, with the rule (memo) it comes
--     from; the order is a product's own rate, else the dealer's, else the
--     standard rate (「顺序对」);
--   - a promotion item takes 5 points off the rate that applies (「25% 变20%」);
--   - whether a kind of product earns commission is a switch with a start
--     date; accessories earn (「配件也是25%。但到时可能会取消，所以要做可以
--     toggle 的」, management D1); sofas earn; service and the guarantee
--     never do.
--
-- WHAT WAS MISSING (measured 2026-10-08)
--   - One default rate and an optional rate per product, with no start date:
--     changing a rate changed every past month. No rate per dealer, no
--     promotion items, no record of the memo a rate comes from.
--   - Accessories earned nothing (the arithmetic left them out, 30 Sep).
--
-- WHAT THIS ADDS
--   1. dealer_commission_rules: one row per rate or switch, each from its day
--      (or from the start), with its memo, who added it and when. A row is
--      never changed: a new rate is a new row, and a row added by mistake is
--      removed (kept, marked removed, with who and when).
--        standard   the rate every product takes
--        dealer     a dealer's own rate
--        product    a product's own rate
--        promotion  a product is a promotion item (points off) or is not
--        category   a kind of product earns commission or does not
--   2. dealer_commission_rate(dealer, model, category, day): the rate a line
--      earns on that day. Service and the guarantee earn 0; a kind switched
--      off earns 0; otherwise the product's rate, else the dealer's, else the
--      standard, less a promotion item's points, never below 0.
--   3. The starting rows, from the start: the standard rate and any product
--      rates kept until now, and mattress, bedframe, sofa and accessory
--      earning.
--   4. Doors: dealer_commission_rule_add and dealer_commission_rule_remove
--      (Finance and principal), and the read dealer_commission_rules_read.
--   5. dealer_commission_source (by guarded rewrite, 0500/0503 style): each
--      order says its order day, each line the rate it earns on that day. The
--      report reads the rate from the line. `settings` and `rates` still say
--      today's standard rate and product rates.
--
-- RLS: dealer_commission_rules is read by Finance (gl_may_read) and written
--   only by the doors. DATA: configuration only. dealer_commission_settings
--   and dealer_commission_rates are no longer read or written; they are kept.
-- DR/CR: none.
-- =============================================================================

begin;

set local search_path = public, pg_temp;

-- ── 1 · the rules ────────────────────────────────────────────────────────────
create table if not exists public.dealer_commission_rules (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null
              check (kind in ('standard', 'dealer', 'product', 'promotion', 'category')),
  dealer_id   uuid references public.dealers(id),
  model_id    uuid references public.product_models(id),
  category    public.product_category,
  -- standard, dealer, product: the percentage. promotion (on): the points off.
  rate        numeric(5,2) check (rate >= 0 and rate <= 100),
  -- category: the kind earns commission. promotion: the product is a promotion item.
  is_on       boolean,
  -- null: from the start.
  starts_on   date,
  memo        text check (memo is null or length(btrim(memo)) between 1 and 200),
  created_at  timestamptz not null default now(),
  created_by  uuid references public.app_users(id),
  removed_at  timestamptz,
  removed_by  uuid references public.app_users(id),
  constraint dealer_commission_rules_shape check (
    case kind
      when 'standard'  then dealer_id is null and model_id is null and category is null
                            and rate is not null and is_on is null
      when 'dealer'    then dealer_id is not null and model_id is null and category is null
                            and rate is not null and is_on is null
      when 'product'   then dealer_id is null and model_id is not null and category is null
                            and rate is not null and is_on is null
      when 'promotion' then dealer_id is null and model_id is not null and category is null
                            and is_on is not null and (rate is not null) = is_on
      when 'category'  then dealer_id is null and model_id is null and category is not null
                            and rate is null and is_on is not null
    end)
);

comment on table public.dealer_commission_rules is
  '0661: dealer commission rates and switches, each from its day (null: from the start). Written only by dealer_commission_rule_add / _remove; a row is never changed, only removed.';

-- One live row per thing per day (a null is a value here: from the start, or
-- no dealer, product or kind).
create unique index if not exists dealer_commission_rules_one_a_day
  on public.dealer_commission_rules (kind, dealer_id, model_id, category, starts_on)
  nulls not distinct
  where removed_at is null;

alter table public.dealer_commission_rules enable row level security;

drop policy if exists dealer_commission_rules_finance_read on public.dealer_commission_rules;
create policy dealer_commission_rules_finance_read on public.dealer_commission_rules
  for select using ((select public.gl_may_read()));

revoke all on public.dealer_commission_rules from anon;
revoke insert, update, delete on public.dealer_commission_rules from authenticated;

comment on table public.dealer_commission_settings is
  '0661: retired. The standard rate is a dealer_commission_rules row from its day. Kept, no longer read or written.';
comment on table public.dealer_commission_rates is
  '0661: retired. A product rate is a dealer_commission_rules row from its day. Kept, no longer read or written.';

-- ── 2 · the starting rows ────────────────────────────────────────────────────
insert into public.dealer_commission_rules (kind, rate, starts_on, memo)
select 'standard', s.default_rate, null, 'The rate before rates had a start date'
  from public.dealer_commission_settings s
 where s.id
   and not exists (select 1 from public.dealer_commission_rules r where r.kind = 'standard' and r.removed_at is null);

insert into public.dealer_commission_rules (kind, model_id, rate, starts_on, memo)
select 'product', d.model_id, d.rate, null, 'The rate before rates had a start date'
  from public.dealer_commission_rates d
 where not exists (select 1 from public.dealer_commission_rules r
                    where r.kind = 'product' and r.model_id = d.model_id and r.removed_at is null);

insert into public.dealer_commission_rules (kind, category, is_on, starts_on, memo)
select 'category', c.category::public.product_category, true, null, c.memo
  from (values
    ('mattress',  null::text),
    ('bedframe',  null),
    ('sofa',      'Sofas earn commission (Chew 2026-10-06)'),
    ('accessory', 'Accessories earn commission (Chew 2026-10-05, management 2026-10-07)')
  ) as c(category, memo)
 where not exists (select 1 from public.dealer_commission_rules r
                    where r.kind = 'category' and r.category::text = c.category and r.removed_at is null);

-- ── 3 · the rate a line earns on a day ───────────────────────────────────────
create or replace function public.dealer_commission_rate(p_dealer_id uuid, p_model_id uuid, p_category text, p_on date)
returns numeric
language sql
stable
set search_path = public, pg_temp
as $fn$
  -- The rows in force on the day: started on or before it, or from the start.
  with r as (
    select * from public.dealer_commission_rules
     where removed_at is null and (starts_on is null or starts_on <= p_on)
  )
  select case
           -- Service and the guarantee never earn (Finance MASTER §3.2).
           when p_category in ('service', 'guarantee') then 0::numeric
           -- A kind of product switched off earns nothing. A line with no
           -- kind (its SKU left the catalog) earns, as before 0661.
           when p_category is not null
                and not coalesce((select r.is_on from r
                                   where r.kind = 'category' and r.category::text = p_category
                                   order by r.starts_on desc nulls last limit 1), false)
             then 0::numeric
           else greatest(0::numeric,
                  coalesce((select r.rate from r where r.kind = 'product' and r.model_id = p_model_id
                             order by r.starts_on desc nulls last limit 1),
                           (select r.rate from r where r.kind = 'dealer' and r.dealer_id = p_dealer_id
                             order by r.starts_on desc nulls last limit 1),
                           (select r.rate from r where r.kind = 'standard'
                             order by r.starts_on desc nulls last limit 1),
                           0::numeric)
                  - coalesce((select case when r.is_on then r.rate else 0::numeric end from r
                               where r.kind = 'promotion' and r.model_id = p_model_id
                               order by r.starts_on desc nulls last limit 1),
                             0::numeric))
         end;
$fn$;

comment on function public.dealer_commission_rate(uuid, uuid, text, date) is
  '0661: the commission rate a line earns on a day: 0 for service, the guarantee and a kind switched off; else the product''s rate, else the dealer''s, else the standard, less a promotion item''s points, never below 0.';

revoke all on function public.dealer_commission_rate(uuid, uuid, text, date) from public, anon, authenticated;

-- ── 4 · the doors ────────────────────────────────────────────────────────────
create or replace function public.dealer_commission_rule_add(
  p_kind text, p_dealer_id uuid, p_model_id uuid, p_category text,
  p_rate numeric, p_is_on boolean, p_starts_on date, p_memo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role text := (select public.app_role())::text;
  v_memo text := nullif(btrim(coalesce(p_memo, '')), '');
  v_id   uuid;
begin
  if v_role is null or v_role not in ('finance', 'principal') then
    raise exception 'Only Finance changes the commission rates.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  if p_kind is null or p_kind not in ('standard', 'dealer', 'product', 'promotion', 'category') then
    raise exception 'Choose what the rate is for.' using errcode = '22023', detail = 'bad_kind';
  end if;
  if p_starts_on is null then
    raise exception 'Choose the day the rate starts.' using errcode = '22023', detail = 'starts_on_required';
  end if;
  if v_memo is not null and length(v_memo) > 200 then
    raise exception 'Keep the memo to 200 characters.' using errcode = '22023', detail = 'memo_too_long';
  end if;

  if p_kind = 'dealer'
     and not exists (select 1 from public.dealers d where d.id = p_dealer_id and d.channel = 'dealer') then
    raise exception 'Choose a dealer.' using errcode = '22023', detail = 'bad_dealer';
  end if;
  if p_kind in ('product', 'promotion')
     and not exists (select 1 from public.product_models m
                      where m.id = p_model_id and m.category::text not in ('service', 'guarantee')) then
    raise exception 'Choose a product that earns commission.' using errcode = '22023', detail = 'bad_product';
  end if;
  if p_kind = 'category'
     and (p_category is null or p_category in ('service', 'guarantee')
          or not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                          where t.typname = 'product_category' and e.enumlabel = p_category)) then
    raise exception 'Choose a kind of product.' using errcode = '22023', detail = 'bad_category';
  end if;
  if p_kind in ('standard', 'dealer', 'product')
     and (p_rate is null or p_rate < 0 or p_rate > 100 or p_rate <> round(p_rate, 2)) then
    raise exception 'The rate is a percentage from 0 to 100, with at most two decimals.'
      using errcode = '22023', detail = 'bad_rate';
  end if;
  if p_kind = 'category' and p_is_on is null then
    raise exception 'Say whether this kind of product earns commission.'
      using errcode = '22023', detail = 'is_on_required';
  end if;
  if p_kind = 'promotion' and p_is_on is null then
    raise exception 'Say whether the product is a promotion item.'
      using errcode = '22023', detail = 'is_on_required';
  end if;
  if p_kind = 'promotion' and p_is_on
     and (p_rate is null or p_rate <= 0 or p_rate > 100 or p_rate <> round(p_rate, 2)) then
    raise exception 'Type the points a promotion item takes off, more than 0 and at most 100.'
      using errcode = '22023', detail = 'bad_points';
  end if;

  -- One live row per thing per day; the unique index is the last word.
  perform pg_advisory_xact_lock(hashtextextended('dealer_commission_rules', 0));
  if exists (select 1 from public.dealer_commission_rules r
              where r.removed_at is null and r.kind = p_kind
                and r.dealer_id is not distinct from (case when p_kind = 'dealer' then p_dealer_id end)
                and r.model_id is not distinct from (case when p_kind in ('product', 'promotion') then p_model_id end)
                and r.category::text is not distinct from (case when p_kind = 'category' then p_category end)
                and r.starts_on = p_starts_on) then
    raise exception 'There is already one for this from %. Remove it first.',
      to_char(p_starts_on, 'FMDD Mon YYYY')
      using errcode = '22023', detail = 'already_on_that_day';
  end if;

  insert into public.dealer_commission_rules
    (kind, dealer_id, model_id, category, rate, is_on, starts_on, memo, created_by)
  values
    (p_kind,
     case when p_kind = 'dealer' then p_dealer_id end,
     case when p_kind in ('product', 'promotion') then p_model_id end,
     case when p_kind = 'category' then p_category::public.product_category end,
     case when p_kind in ('standard', 'dealer', 'product') then p_rate
          when p_kind = 'promotion' and p_is_on then p_rate end,
     case when p_kind in ('promotion', 'category') then p_is_on end,
     p_starts_on, v_memo, auth.uid())
  returning id into v_id;

  return jsonb_build_object('id', v_id);
end;
$fn$;

create or replace function public.dealer_commission_rule_remove(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role text := (select public.app_role())::text;
  v_row  public.dealer_commission_rules;
begin
  if v_role is null or v_role not in ('finance', 'principal') then
    raise exception 'Only Finance changes the commission rates.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  select * into v_row from public.dealer_commission_rules where id = p_id for update;
  if not found then
    raise exception 'That rate is not on the list.' using errcode = 'P0002', detail = 'not_found';
  end if;
  if v_row.removed_at is not null then
    return jsonb_build_object('id', v_row.id, 'already', true);
  end if;
  if v_row.starts_on is null then
    raise exception 'A rate from the start stays. Add a new one from a day instead.'
      using errcode = '22023', detail = 'from_the_start_stays';
  end if;
  update public.dealer_commission_rules
     set removed_at = now(), removed_by = auth.uid()
   where id = p_id;
  return jsonb_build_object('id', v_row.id, 'already', false);
end;
$fn$;

create or replace function public.dealer_commission_rules_read()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
begin
  if not coalesce(public.gl_may_read(), false) then
    raise exception 'Only Finance sees the commission rates.' using errcode = '42501', detail = 'not_finance';
  end if;
  return jsonb_build_object(
    'today', v_today,
    'rules', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'kind', r.kind,
               'dealerId', r.dealer_id, 'dealerName', d.name,
               'modelId', r.model_id, 'modelName', m.name,
               'category', r.category, 'rate', r.rate, 'isOn', r.is_on,
               'startsOn', r.starts_on, 'memo', r.memo,
               'createdAt', r.created_at, 'createdBy', u.name,
               -- in use: the latest row in force today for its thing;
               -- later: starts after today; replaced: an earlier one.
               'state', case
                          when r.starts_on > v_today then 'later'
                          when not exists (
                                 select 1 from public.dealer_commission_rules x
                                  where x.removed_at is null and x.kind = r.kind
                                    and x.dealer_id is not distinct from r.dealer_id
                                    and x.model_id is not distinct from r.model_id
                                    and x.category is not distinct from r.category
                                    and x.starts_on <= v_today
                                    and coalesce(x.starts_on, '-infinity'::date) > coalesce(r.starts_on, '-infinity'::date))
                            then 'in_use'
                          else 'replaced'
                        end)
             order by r.kind, coalesce(d.name, m.name, r.category::text, ''), r.starts_on nulls first)
        from public.dealer_commission_rules r
        left join public.dealers d on d.id = r.dealer_id
        left join public.product_models m on m.id = r.model_id
        left join public.app_users u on u.id = r.created_by
       where r.removed_at is null), '[]'::jsonb),
    'dealers', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name) order by d.name)
        from public.dealers d where d.channel = 'dealer'), '[]'::jsonb),
    'models', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'category', m.category) order by m.name)
        from public.product_models m
       where m.discontinued_at is null and m.category::text not in ('service', 'guarantee')), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(e.enumlabel order by e.enumsortorder)
        from pg_enum e join pg_type t on t.oid = e.enumtypid
       where t.typname = 'product_category' and e.enumlabel not in ('service', 'guarantee')), '[]'::jsonb));
end;
$fn$;

revoke all on function public.dealer_commission_rule_add(text, uuid, uuid, text, numeric, boolean, date, text) from public, anon;
revoke all on function public.dealer_commission_rule_remove(uuid) from public, anon;
revoke all on function public.dealer_commission_rules_read() from public, anon;
grant execute on function public.dealer_commission_rule_add(text, uuid, uuid, text, numeric, boolean, date, text) to authenticated;
grant execute on function public.dealer_commission_rule_remove(uuid) to authenticated;
grant execute on function public.dealer_commission_rules_read() to authenticated;

-- ── 5 · the report's read: each line's rate on its order day ─────────────────
-- Each changes one short piece of the LIVE body, which must hold it exactly
-- once (line ends read as LF); everything else in the body stays as it is.
create or replace function pg_temp.mig0661_rewrite(p_fn regprocedure, p_old text, p_new text)
returns void
language plpgsql
as $rw$
declare
  v_def text := replace(pg_get_functiondef(p_fn), E'\r\n', E'\n');
  v_n   integer;
begin
  v_n := (length(v_def) - length(replace(v_def, p_old, ''))) / greatest(length(p_old), 1);
  if v_n <> 1 then
    raise exception '0661: % holds the text to change % times, not once: %', p_fn, v_n, left(p_old, 90);
  end if;
  execute replace(v_def, p_old, p_new);
end;
$rw$;

-- (a) today's standard rate, from the rules.
select pg_temp.mig0661_rewrite('public.dealer_commission_source(date)'::regprocedure,
$old$(select jsonb_build_object('defaultRate', s.default_rate)
                   from dealer_commission_settings s)$old$,
$new$jsonb_build_object('defaultRate',
                   public.dealer_commission_rate(null, null, null, (now() at time zone 'Asia/Kuala_Lumpur')::date))$new$);

-- (b) today's product rates, from the rules.
select pg_temp.mig0661_rewrite('public.dealer_commission_source(date)'::regprocedure,
$old$from dealer_commission_rates r join product_models pm on pm.id = r.model_id$old$,
$new$from public.dealer_commission_rules r join product_models pm on pm.id = r.model_id
       where r.kind = 'product' and r.removed_at is null
         and (r.starts_on is null or r.starts_on <= (now() at time zone 'Asia/Kuala_Lumpur')::date)
         and not exists (select 1 from public.dealer_commission_rules x
                          where x.kind = 'product' and x.model_id = r.model_id and x.removed_at is null
                            and x.starts_on <= (now() at time zone 'Asia/Kuala_Lumpur')::date
                            and x.starts_on > coalesce(r.starts_on, '-infinity'::date))$new$);

-- (c) each order says its order day.
select pg_temp.mig0661_rewrite('public.dealer_commission_source(date)'::regprocedure,
$old$'orderId', ord.id, 'so', ord.so, 'dealerId', ord.dealer_id, 'outletId', ord.outlet_id,$old$,
$new$'orderId', ord.id, 'so', ord.so, 'dealerId', ord.dealer_id, 'outletId', ord.outlet_id,
        -- 0661: the order day in Malaysia, whose rates the order takes.
        'orderedOn', (ord.placed_at at time zone 'Asia/Kuala_Lumpur')::date,$new$);

-- (d) each line says the rate it earns on that day.
select pg_temp.mig0661_rewrite('public.dealer_commission_source(date)'::regprocedure,
$old$'modelId', m.id, 'category', m.category, 'value', l.qty * l.unit_price)$old$,
$new$'modelId', m.id, 'category', m.category, 'value', l.qty * l.unit_price,
                           'rate', public.dealer_commission_rate(ord.dealer_id, m.id, m.category::text,
                                     (ord.placed_at at time zone 'Asia/Kuala_Lumpur')::date))$new$);

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
declare
  v_src  text;
  v_std  numeric;
  v_out  jsonb;
begin
  select r.rate into v_std from public.dealer_commission_rules r
   where r.kind = 'standard' and r.starts_on is null and r.removed_at is null;
  if v_std is null or v_std is distinct from (select s.default_rate from public.dealer_commission_settings s where s.id) then
    raise exception '0661: the standard rate was not carried over';
  end if;
  if (select count(*) from public.dealer_commission_rules r
       where r.kind = 'product' and r.starts_on is null and r.removed_at is null)
     <> (select count(*) from public.dealer_commission_rates) then
    raise exception '0661: a product rate was not carried over';
  end if;
  if (select count(*) from public.dealer_commission_rules r
       where r.kind = 'category' and r.is_on and r.starts_on is null and r.removed_at is null
         and r.category::text in ('mattress', 'bedframe', 'sofa', 'accessory')) <> 4 then
    raise exception '0661: mattress, bedframe, sofa and accessory do not earn from the start';
  end if;

  -- the rate a line earns today
  if public.dealer_commission_rate(null, null, 'sofa', current_date) is distinct from v_std
     or public.dealer_commission_rate(null, null, 'accessory', current_date) is distinct from v_std
     or public.dealer_commission_rate(null, null, 'service', current_date) <> 0
     or public.dealer_commission_rate(null, null, 'guarantee', current_date) <> 0
     or public.dealer_commission_rate(null, null, null, current_date) is distinct from v_std then
    raise exception '0661: dealer_commission_rate does not give the standard rate, or pays service or the guarantee';
  end if;

  -- the report's read: the old keys still read, each order says its day and
  -- each line its rate
  select pg_get_functiondef('public.dealer_commission_source(date)'::regprocedure) into v_src;
  if position('dealer_commission_settings' in v_src) > 0 or position('dealer_commission_rates r' in v_src) > 0
     or position('''orderedOn''' in v_src) = 0 or position('dealer_commission_rate(ord.dealer_id' in v_src) = 0
     or position('order_refunds' in v_src) = 0 then
    raise exception '0661: dealer_commission_source still reads the retired tables, lost its refunds, or does not rate each line';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'dealer_commission_source'
                and not (p.prosecdef and p.proconfig @> array['search_path=public, pg_temp'])) then
    raise exception '0661: dealer_commission_source lost security definer or its search_path';
  end if;

  if has_function_privilege('anon', 'public.dealer_commission_rule_add(text, uuid, uuid, text, numeric, boolean, date, text)', 'execute')
     or has_function_privilege('anon', 'public.dealer_commission_rule_remove(uuid)', 'execute')
     or has_function_privilege('anon', 'public.dealer_commission_rules_read()', 'execute')
     or has_function_privilege('authenticated', 'public.dealer_commission_rate(uuid, uuid, text, date)', 'execute') then
    raise exception '0661: a commission door or helper is open to callers it should not be';
  end if;
  if not has_function_privilege('authenticated', 'public.dealer_commission_rule_add(text, uuid, uuid, text, numeric, boolean, date, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.dealer_commission_rules_read()', 'execute') then
    raise exception '0661: a commission door is closed to signed-in callers';
  end if;
  if has_table_privilege('authenticated', 'public.dealer_commission_rules', 'insert')
     or has_table_privilege('authenticated', 'public.dealer_commission_rules', 'update')
     or has_table_privilege('authenticated', 'public.dealer_commission_rules', 'delete') then
    raise exception '0661: dealer_commission_rules can be written around its doors';
  end if;

  -- A caller with no role is refused before anything is read or written.
  begin
    perform public.dealer_commission_rule_add('standard', null, null, null, 25, null, current_date, null);
    raise exception '0661: the add door ran for a caller with no role';
  exception when insufficient_privilege then
    null;
  end;
  begin
    v_out := public.dealer_commission_rules_read();
    raise exception '0661: the read ran for a caller with no role';
  exception when insufficient_privilege then
    null;
  end;
end $sanity$;

commit;

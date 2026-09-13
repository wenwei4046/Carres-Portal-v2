-- =============================================================================
-- 0503_finance_gates_refuse_a_caller_with_no_role.sql
-- =============================================================================
-- WHAT WAS WRONG, MEASURED
--   1. app_role() is NULL for a caller who is not signed in, for a signed-in
--      account with no app_users row, and for a disabled account. 0481 took
--      EXECUTE away from anon on eleven finance functions but, by its own
--      header, left ten of their bodies NULL-blind:
--          if public.app_role() not in ('finance','principal') then raise ...
--      `NULL not in (...)` is NULL, so the raise never runs. A signed-in
--      account with no role, or a disabled one, still ran them. 0500 swept
--      the same gate elsewhere and deliberately left these to Finance.
--      next_credit_note_no had no gate at all: any signed-in account could
--      draw a real credit-note number.
--   2. top_up_order (0351, re-gated by 0500) compares v_role with the label
--      'logistics'. 0121_rename_role_logistics_to_operation.sql:88 renamed
--      that enum value to 'operation', so casting 'logistics' to app_role
--      raises "invalid input value for enum" -- the top-up fails for every
--      caller, including the principal. The current label, from the app_role
--      enum and from the same gate written elsewhere (0500 on
--      _add_order_lines_0391_locked_impl: 'principal','operation','finance',
--      'bd'), is 'operation'.
--
-- WHAT THIS CHANGES
--   For each function, the body is the LATEST `create or replace` in this
--   repository's migration files, with only these edits:
--     - finance_ar_aging, finance_cashflow_series, finance_dashboard_summary,
--       finance_monthly_pl, finance_recon_suggest_matches, finance_top_skus,
--       finance_topup_approve, finance_apply_credit_note, refund_pay:
--           A not in (...)   ->   (A is null or A not in (...))
--     - next_credit_note_no: becomes plpgsql so it can carry the same gate
--       as its siblings; it then returns the same expression it selected.
--     - top_up_order: 'logistics' -> 'operation' in its cross-dealer gate.
--     - The nine finance bodies and next_credit_note_no had
--       `search_path = public`; they now pin `public, pg_temp`, so a definer
--       function cannot be steered by a caller's temporary objects.
--   For a caller who has a role the finance gates test exactly the same; they
--   only add a refusal for the caller who has none.
--   finance_recon_suggest_matches and finance_apply_credit_note were changed
--   after their last `create` by the dynamic dl -> so renames of 0123/0125
--   and 0126, so their source is the repo text with that same token rename
--   replayed (replaying the raw repo text would revert it).
--   Each rewrite is GUARDED as in 0500: it runs only if md5(live body) equals
--   the source it was derived from. A function whose live body matches
--   neither the source nor the rewrite is left untouched and the final block
--   raises a WARNING naming it. Every live setting other than search_path
--   must survive the rewrite, or that function alone is rolled back and
--   named. create or replace keeps owner, grants and comment; the final
--   block proves anon and authenticated EXECUTE did not change.
--   Running it twice is harmless: the second run reports 'already'.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   - No RLS or policy change. No grant change.
--   - Does not touch the identity helpers (app_role, app_dealer_id,
--     app_partner_id, app_supplier_id).
--   - finance_ap_aging is not here: 0481 already gave it the fail-closed gate.
--   - None of the ten was rewritten by 0500 (0500 left Finance to 0481), so
--     none is skipped for that reason. top_up_order IS in 0500; its latest
--     definition there is the source here.
--
-- RLS: none. GRANTS: none. DR/CR: none.
-- =============================================================================

begin;

-- Who can run these today, recorded so the final block can prove this
-- migration changed no EXECUTE privilege (create or replace keeps grants).
create temp table _auth_before_0503 (fn regprocedure, who text, primary key (fn, who)) on commit drop;
do $snap$
declare s text; p regprocedure; w text;
begin
  for s in select unnest(array[
    'public.finance_ar_aging()',
    'public.finance_cashflow_series(integer)',
    'public.finance_dashboard_summary()',
    'public.finance_monthly_pl(integer)',
    'public.finance_recon_suggest_matches(uuid)',
    'public.finance_top_skus(integer)',
    'public.finance_topup_approve(uuid, payment_method, text, text)',
    'public.finance_apply_credit_note(uuid, uuid)',
    'public.refund_pay(uuid, payment_method, text)',
    'public.next_credit_note_no()',
    'public.top_up_order(uuid, numeric, text, text, text, text, date, jsonb, text)'
  ]::text[]) loop
    p := to_regprocedure(s);
    if p is null then continue; end if;
    foreach w in array array['anon', 'authenticated'] loop
      if has_function_privilege(w, p, 'execute') then insert into _auth_before_0503 values (p, w); end if;
    end loop;
  end loop;
end
$snap$;

create temp table _g0503 (fn text primary key, result text) on commit drop;

-- finance_ar_aging()
--   source: repo 0125_fix_alias_dl_after_0123_rename.sql
--   edits: gate: A not in (...) -> (A is null or A not in (...)); search_path += pg_temp
do $g0503$
declare p regprocedure := to_regprocedure('public.finance_ar_aging()'); h text; cfg text[]; cfg_new text[];
begin
  if p is null then insert into _g0503 values ('finance_ar_aging()', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')), coalesce(proconfig, '{}') into h, cfg from pg_proc where oid = p and prosecdef;
  if h = '2d02c9ede191c1bd1654830d222007dd' then
    begin
      execute $s0503a$
CREATE OR REPLACE FUNCTION public.finance_ar_aging()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_result jsonb;
begin
  if (public.app_role() is null or public.app_role() not in ('finance','principal')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with order_totals as (
    select
      o.id,
      o.so,
      o.dealer_id,
      o.customer_name,
      o.status,
      o.placed_at,
      o.paid,
      o.invoice_no,
      coalesce((select sum(ol.unit_price * ol.qty)
                from order_lines ol where ol.order_id = o.id), 0) +
      coalesce((select sum(oa.unit_price * oa.qty)
                from order_addons oa where oa.order_id = o.id), 0)
        as total
    from orders o
    where o.status <> 'cancelled'
  ),
  rows_cte as (
    select
      ot.id   as order_id,
      ot.so,
      ot.customer_name,
      ot.dealer_id,
      d.name  as dealer_name,
      ot.placed_at,
      greatest(0, (current_date - ot.placed_at::date))::int as days,
      case
        when (current_date - ot.placed_at::date) <= 30 then '0-30'
        when (current_date - ot.placed_at::date) <= 60 then '31-60'
        when (current_date - ot.placed_at::date) <= 90 then '61-90'
        else '90+'
      end as aging,
      ot.total,
      ot.paid,
      greatest(0, ot.total - ot.paid)::numeric(14,2) as outstanding,
      coalesce(ot.invoice_no,
               'INV-' || to_char(current_date, 'YYYY') || '-' ||
                 lpad(ot.so::text, 4, '0')) as invoice_no,
      ot.status
    from order_totals ot
    left join dealers d on d.id = ot.dealer_id
    where ot.total > 0
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(r) order by r.outstanding desc)
                      from rows_cte r), '[]'::jsonb),
    'buckets', jsonb_build_object(
      '0-30',  (select jsonb_build_object('amount', coalesce(sum(outstanding), 0),
                                           'count',  count(*))
                 from rows_cte where aging = '0-30'  and outstanding > 0),
      '31-60', (select jsonb_build_object('amount', coalesce(sum(outstanding), 0),
                                           'count',  count(*))
                 from rows_cte where aging = '31-60' and outstanding > 0),
      '61-90', (select jsonb_build_object('amount', coalesce(sum(outstanding), 0),
                                           'count',  count(*))
                 from rows_cte where aging = '61-90' and outstanding > 0),
      '90+',   (select jsonb_build_object('amount', coalesce(sum(outstanding), 0),
                                           'count',  count(*))
                 from rows_cte where aging = '90+'   and outstanding > 0)
    )
  )
  into v_result;

  return v_result;
end;
$function$;
$s0503a$;
      select coalesce(proconfig, '{}') into cfg_new from pg_proc where oid = p;
      -- every live setting except search_path survives; search_path is now public, pg_temp
      if not (array(select c from unnest(cfg) c where c not like 'search_path=%') <@ cfg_new)
         or not ('search_path=public, pg_temp' = any(cfg_new)) then
        raise exception using errcode = 'P0503'; end if;
      insert into _g0503 values ('finance_ar_aging()', 'rewritten');
    exception when sqlstate 'P0503' then   -- rolls back this function's rewrite only
      insert into _g0503 values ('finance_ar_aging()', 'live settings would be lost - left untouched');
    end;
  elsif h = '47526e38b4b75f9a0998bd579eba32fc' then insert into _g0503 values ('finance_ar_aging()', 'already');
  else insert into _g0503 values ('finance_ar_aging()', 'live body differs - left untouched');
  end if;
end
$g0503$;

-- finance_cashflow_series(integer)
--   source: repo 0064_finance_chunk_b_rpcs.sql
--   edits: gate: A not in (...) -> (A is null or A not in (...)); search_path += pg_temp
do $g0503$
declare p regprocedure := to_regprocedure('public.finance_cashflow_series(integer)'); h text; cfg text[]; cfg_new text[];
begin
  if p is null then insert into _g0503 values ('finance_cashflow_series(integer)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')), coalesce(proconfig, '{}') into h, cfg from pg_proc where oid = p and prosecdef;
  if h = '18eafe230ec6a8c17f423f9f7394bbec' then
    begin
      execute $s0503a$
create or replace function public.finance_cashflow_series(
  p_weeks int default 12
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_weeks  int;
  v_result jsonb;
begin
  if (public.app_role() is null or public.app_role() not in ('finance','principal')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_weeks := greatest(1, least(coalesce(p_weeks, 12), 52));

  with weeks_axis as (
    select
      generate_series(0, v_weeks - 1) as week_offset,
      date_trunc('week',
        current_date - (v_weeks - 1 - generate_series(0, v_weeks - 1)) * interval '7 days'
      )::date as week_start
  ),
  weeks_axis_labelled as (
    select
      week_offset,
      week_start,
      'W' || lpad(extract(week from week_start)::text, 2, '0') as label
    from weeks_axis
  ),
  bucketed as (
    select
      date_trunc('week', p.paid_at)::date as week_start,
      sum(case when p.direction = 'in'  then p.amount else 0 end) as inflow,
      sum(case when p.direction = 'out' then p.amount else 0 end) as outflow
    from payments p
    where p.paid_at >= (current_date - (v_weeks * 7) * interval '1 day')::date
    group by 1
  )
  select jsonb_build_object(
    'labels',  coalesce((select jsonb_agg(w.label    order by w.week_offset) from weeks_axis_labelled w), '[]'::jsonb),
    'inflow',  coalesce((select jsonb_agg(coalesce(b.inflow, 0)  order by w.week_offset)
                          from weeks_axis_labelled w
                          left join bucketed b on b.week_start = w.week_start), '[]'::jsonb),
    'outflow', coalesce((select jsonb_agg(coalesce(-b.outflow, 0) order by w.week_offset)
                          from weeks_axis_labelled w
                          left join bucketed b on b.week_start = w.week_start), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;
$s0503a$;
      select coalesce(proconfig, '{}') into cfg_new from pg_proc where oid = p;
      -- every live setting except search_path survives; search_path is now public, pg_temp
      if not (array(select c from unnest(cfg) c where c not like 'search_path=%') <@ cfg_new)
         or not ('search_path=public, pg_temp' = any(cfg_new)) then
        raise exception using errcode = 'P0503'; end if;
      insert into _g0503 values ('finance_cashflow_series(integer)', 'rewritten');
    exception when sqlstate 'P0503' then   -- rolls back this function's rewrite only
      insert into _g0503 values ('finance_cashflow_series(integer)', 'live settings would be lost - left untouched');
    end;
  elsif h = '97a61d10dd1d9a7a91f3a03de93d48cb' then insert into _g0503 values ('finance_cashflow_series(integer)', 'already');
  else insert into _g0503 values ('finance_cashflow_series(integer)', 'live body differs - left untouched');
  end if;
end
$g0503$;

-- finance_dashboard_summary()
--   source: repo 0062_finance_chunk_a_rpcs.sql
--   edits: gate: A not in (...) -> (A is null or A not in (...)); search_path += pg_temp
do $g0503$
declare p regprocedure := to_regprocedure('public.finance_dashboard_summary()'); h text; cfg text[]; cfg_new text[];
begin
  if p is null then insert into _g0503 values ('finance_dashboard_summary()', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')), coalesce(proconfig, '{}') into h, cfg from pg_proc where oid = p and prosecdef;
  if h = '63358a34a48fd467fb0c1130f7be05a8' then
    begin
      execute $s0503a$
create or replace function public.finance_dashboard_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_aging         jsonb;
  v_ar_outstand   numeric := 0;
  v_ar_count      int     := 0;
  v_overdue_amt   numeric := 0;
  v_overdue_count int     := 0;
  v_ap_amt        numeric := 0;
  v_ap_count      int     := 0;
  v_cf_in         numeric := 0;
  v_cf_out        numeric := 0;
begin
  if (public.app_role() is null or public.app_role() not in ('finance','principal')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_aging := public.finance_ar_aging();

  -- AR totals across all four buckets
  select coalesce(sum((b.value->>'amount')::numeric), 0),
         coalesce(sum((b.value->>'count')::int),     0)
    into v_ar_outstand, v_ar_count
    from jsonb_each(v_aging->'buckets') b;

  -- Overdue = 31-60 + 61-90 + 90+
  v_overdue_amt   := ((v_aging->'buckets'->'31-60'->>'amount')::numeric)
                   + ((v_aging->'buckets'->'61-90'->>'amount')::numeric)
                   + ((v_aging->'buckets'->'90+'  ->>'amount')::numeric);
  v_overdue_count := ((v_aging->'buckets'->'31-60'->>'count')::int)
                   + ((v_aging->'buckets'->'61-90'->>'count')::int)
                   + ((v_aging->'buckets'->'90+'  ->>'count')::int);

  -- AP — POs received or sup_status=delivered (ready to pay)
  with po_costs as (
    select po.id,
           coalesce(sum(coalesce(pol.cost, 0) * pol.qty), 0)::numeric(14,2) as total
      from purchase_orders po
      left join purchase_order_lines pol on pol.po_id = po.id
     where po.status = 'received' or po.sup_status = 'delivered'
     group by po.id
  )
  select coalesce(sum(total), 0), count(*)
    into v_ap_amt, v_ap_count
    from po_costs;

  -- Cashflow last 12 weeks (84 days)
  select coalesce(sum(case when direction = 'in'  then amount else 0 end), 0),
         coalesce(sum(case when direction = 'out' then amount else 0 end), 0)
    into v_cf_in, v_cf_out
    from payments
   where paid_at >= current_date - interval '84 days';

  return jsonb_build_object(
    'ar',           jsonb_build_object('outstanding',  v_ar_outstand,
                                       'count',         v_ar_count,
                                       'overdueAmt',    v_overdue_amt,
                                       'overdueCount',  v_overdue_count),
    'ap',           jsonb_build_object('dueAmt', v_ap_amt,
                                       'count',  v_ap_count),
    'cashflow12w',  jsonb_build_object('inflow',  v_cf_in,
                                       'outflow', v_cf_out,
                                       'net',     v_cf_in - v_cf_out),
    'agingBuckets', v_aging->'buckets'
  );
end;
$$;
$s0503a$;
      select coalesce(proconfig, '{}') into cfg_new from pg_proc where oid = p;
      -- every live setting except search_path survives; search_path is now public, pg_temp
      if not (array(select c from unnest(cfg) c where c not like 'search_path=%') <@ cfg_new)
         or not ('search_path=public, pg_temp' = any(cfg_new)) then
        raise exception using errcode = 'P0503'; end if;
      insert into _g0503 values ('finance_dashboard_summary()', 'rewritten');
    exception when sqlstate 'P0503' then   -- rolls back this function's rewrite only
      insert into _g0503 values ('finance_dashboard_summary()', 'live settings would be lost - left untouched');
    end;
  elsif h = '69e62716a1aecabbad04103037ccc857' then insert into _g0503 values ('finance_dashboard_summary()', 'already');
  else insert into _g0503 values ('finance_dashboard_summary()', 'live body differs - left untouched');
  end if;
end
$g0503$;

-- finance_monthly_pl(integer)
--   source: repo 0064_finance_chunk_b_rpcs.sql
--   edits: gate: A not in (...) -> (A is null or A not in (...)); search_path += pg_temp
do $g0503$
declare p regprocedure := to_regprocedure('public.finance_monthly_pl(integer)'); h text; cfg text[]; cfg_new text[];
begin
  if p is null then insert into _g0503 values ('finance_monthly_pl(integer)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')), coalesce(proconfig, '{}') into h, cfg from pg_proc where oid = p and prosecdef;
  if h = '060040ac09033ccfb2b4013c30f99cab' then
    begin
      execute $s0503a$
create or replace function public.finance_monthly_pl(
  p_months int default 6
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_months int;
  v_opex   numeric := 42000;  -- V1 placeholder; per spec §6.2 + carry-forward note
  v_cogs_pct numeric := 0.55; -- V1 placeholder mirroring proto finance-data.jsx:79
  v_result jsonb;
begin
  if (public.app_role() is null or public.app_role() not in ('finance','principal')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_months := greatest(1, least(coalesce(p_months, 6), 24));

  with months_axis as (
    select
      generate_series(0, v_months - 1) as month_offset,
      date_trunc('month',
        current_date - (v_months - 1 - generate_series(0, v_months - 1)) * interval '1 month'
      )::date as month_start
  ),
  order_totals as (
    select
      date_trunc('month', o.placed_at)::date as month_start,
      coalesce(sum(
        coalesce((select sum(ol.unit_price * ol.qty)
                  from order_lines ol where ol.order_id = o.id), 0) +
        coalesce((select sum(oa.unit_price * oa.qty)
                  from order_addons oa where oa.order_id = o.id), 0)
      ), 0)::numeric(14,2) as revenue
    from orders o
    where o.status <> 'cancelled'
      and o.placed_at >= date_trunc('month', current_date - (v_months - 1) * interval '1 month')
    group by 1
  ),
  rows_cte as (
    select
      m.month_start,
      to_char(m.month_start, 'Mon YY') as m,
      coalesce(ot.revenue, 0)::numeric(14,2) as revenue,
      (coalesce(ot.revenue, 0) * v_cogs_pct)::numeric(14,2) as cogs,
      v_opex                                  as opex,
      (coalesce(ot.revenue, 0)
         - (coalesce(ot.revenue, 0) * v_cogs_pct)
         - v_opex)::numeric(14,2) as net
    from months_axis m
    left join order_totals ot on ot.month_start = m.month_start
  )
  select jsonb_build_object(
    'rows',
    coalesce(
      (select jsonb_agg(jsonb_build_object(
         'm',       r.m,
         'revenue', r.revenue,
         'cogs',    r.cogs,
         'opex',    r.opex,
         'net',     r.net
       ) order by r.month_start asc)
       from rows_cte r),
      '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;
$s0503a$;
      select coalesce(proconfig, '{}') into cfg_new from pg_proc where oid = p;
      -- every live setting except search_path survives; search_path is now public, pg_temp
      if not (array(select c from unnest(cfg) c where c not like 'search_path=%') <@ cfg_new)
         or not ('search_path=public, pg_temp' = any(cfg_new)) then
        raise exception using errcode = 'P0503'; end if;
      insert into _g0503 values ('finance_monthly_pl(integer)', 'rewritten');
    exception when sqlstate 'P0503' then   -- rolls back this function's rewrite only
      insert into _g0503 values ('finance_monthly_pl(integer)', 'live settings would be lost - left untouched');
    end;
  elsif h = '6ce3327314401a3b9041487e72e4ab52' then insert into _g0503 values ('finance_monthly_pl(integer)', 'already');
  else insert into _g0503 values ('finance_monthly_pl(integer)', 'live body differs - left untouched');
  end if;
end
$g0503$;

-- finance_recon_suggest_matches(uuid)
--   source: repo 0064_finance_chunk_b_rpcs.sql after 0123/0125's dl -> so rename (replayed on the repo text)
--   edits: gate: A not in (...) -> (A is null or A not in (...)); search_path += pg_temp
do $g0503$
declare p regprocedure := to_regprocedure('public.finance_recon_suggest_matches(uuid)'); h text; cfg text[]; cfg_new text[];
begin
  if p is null then insert into _g0503 values ('finance_recon_suggest_matches(uuid)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')), coalesce(proconfig, '{}') into h, cfg from pg_proc where oid = p and prosecdef;
  if h = 'a38814f9647cba969c4da347491bbe07' then
    begin
      execute $s0503a$
create or replace function public.finance_recon_suggest_matches(
  p_bank_statement_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_bs       bank_statements;
  v_result   jsonb;
begin
  if (public.app_role() is null or public.app_role() not in ('finance','principal')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_bs from bank_statements where id = p_bank_statement_id;
  if not found then
    raise exception 'bank statement not found' using errcode = 'P0002';
  end if;

  with order_outstanding as (
    select
      o.id,
      o.so,
      o.customer_name,
      o.dealer_id,
      o.invoice_no,
      o.paid,
      coalesce((select sum(ol.unit_price * ol.qty)
                from order_lines ol where ol.order_id = o.id), 0) +
      coalesce((select sum(oa.unit_price * oa.qty)
                from order_addons oa where oa.order_id = o.id), 0)
        as total
    from orders o
    where o.status <> 'cancelled'
  ),
  scored as (
    select
      oo.so,
      oo.customer_name,
      d.name                                          as dealer_name,
      oo.total,
      oo.paid,
      greatest(0, oo.total - oo.paid)::numeric(14,2)  as outstanding,
      coalesce(oo.invoice_no,
               'INV-' || to_char(current_date, 'YYYY') || '-' ||
                 lpad(oo.so::text, 4, '0'))           as invoice_no,
      abs(greatest(0, oo.total - oo.paid) - v_bs.amount) as distance
    from order_outstanding oo
    left join dealers d on d.id = oo.dealer_id
    where oo.total > oo.paid
  )
  select jsonb_build_object(
    'bank_statement', jsonb_build_object(
      'id',             v_bs.id,
      'statement_date', v_bs.statement_date,
      'description',    v_bs.description,
      'amount',         v_bs.amount,
      'reference',      v_bs.reference
    ),
    'candidates', coalesce(
      (select jsonb_agg(to_jsonb(s) order by s.distance asc)
         from (select * from scored order by distance asc limit 6) s),
      '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;
$s0503a$;
      select coalesce(proconfig, '{}') into cfg_new from pg_proc where oid = p;
      -- every live setting except search_path survives; search_path is now public, pg_temp
      if not (array(select c from unnest(cfg) c where c not like 'search_path=%') <@ cfg_new)
         or not ('search_path=public, pg_temp' = any(cfg_new)) then
        raise exception using errcode = 'P0503'; end if;
      insert into _g0503 values ('finance_recon_suggest_matches(uuid)', 'rewritten');
    exception when sqlstate 'P0503' then   -- rolls back this function's rewrite only
      insert into _g0503 values ('finance_recon_suggest_matches(uuid)', 'live settings would be lost - left untouched');
    end;
  elsif h = '8aadf65672898752f1a569c66269fe1e' then insert into _g0503 values ('finance_recon_suggest_matches(uuid)', 'already');
  else insert into _g0503 values ('finance_recon_suggest_matches(uuid)', 'live body differs - left untouched');
  end if;
end
$g0503$;

-- finance_top_skus(integer)
--   source: repo 0064_finance_chunk_b_rpcs.sql
--   edits: gate: A not in (...) -> (A is null or A not in (...)); search_path += pg_temp
do $g0503$
declare p regprocedure := to_regprocedure('public.finance_top_skus(integer)'); h text; cfg text[]; cfg_new text[];
begin
  if p is null then insert into _g0503 values ('finance_top_skus(integer)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')), coalesce(proconfig, '{}') into h, cfg from pg_proc where oid = p and prosecdef;
  if h = '27365821f2e853f6574c7ee9af6aecec' then
    begin
      execute $s0503a$
create or replace function public.finance_top_skus(
  p_limit int default 8
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit  int;
  v_result jsonb;
begin
  if (public.app_role() is null or public.app_role() not in ('finance','principal')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 8), 50));

  with sku_agg as (
    select
      ol.sku,
      coalesce(pm.name || ' · ' || ps.variant, ol.sku) as name,
      sum(ol.qty)::int                                  as qty,
      sum(ol.unit_price * ol.qty)::numeric(14,2)        as revenue
    from order_lines ol
    join orders o on o.id = ol.order_id
    left join product_skus    ps on ps.sku = ol.sku
    left join product_models  pm on pm.id  = ps.model_id
    where o.status <> 'cancelled'
    group by ol.sku, pm.name, ps.variant
    order by revenue desc
    limit v_limit
  )
  select jsonb_build_object(
    'rows',
    coalesce(
      (select jsonb_agg(to_jsonb(s) order by s.revenue desc) from sku_agg s),
      '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;
$s0503a$;
      select coalesce(proconfig, '{}') into cfg_new from pg_proc where oid = p;
      -- every live setting except search_path survives; search_path is now public, pg_temp
      if not (array(select c from unnest(cfg) c where c not like 'search_path=%') <@ cfg_new)
         or not ('search_path=public, pg_temp' = any(cfg_new)) then
        raise exception using errcode = 'P0503'; end if;
      insert into _g0503 values ('finance_top_skus(integer)', 'rewritten');
    exception when sqlstate 'P0503' then   -- rolls back this function's rewrite only
      insert into _g0503 values ('finance_top_skus(integer)', 'live settings would be lost - left untouched');
    end;
  elsif h = '83e0c8bd85c066901c19f67da98aca00' then insert into _g0503 values ('finance_top_skus(integer)', 'already');
  else insert into _g0503 values ('finance_top_skus(integer)', 'live body differs - left untouched');
  end if;
end
$g0503$;

-- finance_topup_approve(uuid, payment_method, text, text)
--   source: repo 0062_finance_chunk_a_rpcs.sql
--   edits: gate: A not in (...) -> (A is null or A not in (...)); search_path += pg_temp
do $g0503$
declare p regprocedure := to_regprocedure('public.finance_topup_approve(uuid, payment_method, text, text)'); h text; cfg text[]; cfg_new text[];
begin
  if p is null then insert into _g0503 values ('finance_topup_approve(uuid, payment_method, text, text)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')), coalesce(proconfig, '{}') into h, cfg from pg_proc where oid = p and prosecdef;
  if h = '5bfc751948beb0262d2ead5ecd1e6ab8' then
    begin
      execute $s0503a$
create or replace function public.finance_topup_approve(
  p_approval_id uuid,
  p_method      payment_method,
  p_reference   text,
  p_receipt_url text
) returns payments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;
$s0503a$;
      select coalesce(proconfig, '{}') into cfg_new from pg_proc where oid = p;
      -- every live setting except search_path survives; search_path is now public, pg_temp
      if not (array(select c from unnest(cfg) c where c not like 'search_path=%') <@ cfg_new)
         or not ('search_path=public, pg_temp' = any(cfg_new)) then
        raise exception using errcode = 'P0503'; end if;
      insert into _g0503 values ('finance_topup_approve(uuid, payment_method, text, text)', 'rewritten');
    exception when sqlstate 'P0503' then   -- rolls back this function's rewrite only
      insert into _g0503 values ('finance_topup_approve(uuid, payment_method, text, text)', 'live settings would be lost - left untouched');
    end;
  elsif h = 'd46c9c520eb93e205470d202e46b850d' then insert into _g0503 values ('finance_topup_approve(uuid, payment_method, text, text)', 'already');
  else insert into _g0503 values ('finance_topup_approve(uuid, payment_method, text, text)', 'live body differs - left untouched');
  end if;
end
$g0503$;

-- finance_apply_credit_note(uuid, uuid)
--   source: repo 0065_finance_chunk_c.sql after 0126's dl -> so rename (replayed on the repo text)
--   edits: gate: A not in (...) -> (A is null or A not in (...)); search_path += pg_temp
do $g0503$
declare p regprocedure := to_regprocedure('public.finance_apply_credit_note(uuid, uuid)'); h text; cfg text[]; cfg_new text[];
begin
  if p is null then insert into _g0503 values ('finance_apply_credit_note(uuid, uuid)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')), coalesce(proconfig, '{}') into h, cfg from pg_proc where oid = p and prosecdef;
  if h = 'eb44aa6f97eb0002909df3d6ac4efbb3' then
    begin
      execute $s0503a$
create or replace function public.finance_apply_credit_note(
  p_refund_id        uuid,
  p_target_order_id  uuid
) returns refunds
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_refund refunds;
  v_target_dl int;
begin
  if (public.app_role() is null or public.app_role() not in ('finance','principal')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_refund from refunds where id = p_refund_id for update;
  if not found then
    raise exception 'refund not found' using errcode = 'P0002';
  end if;

  if v_refund.credit_note_no is null then
    raise exception 'not a credit note (use refund_pay for refunds)'
      using errcode = '22023';
  end if;

  if v_refund.status <> 'approved' then
    raise exception 'credit note must be in approved (issued) state, got %', v_refund.status
      using errcode = '22023';
  end if;

  select so into v_target_dl from orders where id = p_target_order_id for update;
  if not found then
    raise exception 'target order not found' using errcode = 'P0002';
  end if;

  update refunds
     set status              = 'paid',
         paid_at             = now(),
         applied_to_order_id = p_target_order_id
   where id = p_refund_id
   returning * into v_refund;

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values (public.app_role(),
          (select name from app_users where id = auth.uid()),
          format('Credit note applied · %s · DL-%s · RM %s',
                 v_refund.credit_note_no, v_target_dl, v_refund.amount),
          v_refund.dealer_id,
          v_refund.credit_note_no);

  return v_refund;
end;
$$;
$s0503a$;
      select coalesce(proconfig, '{}') into cfg_new from pg_proc where oid = p;
      -- every live setting except search_path survives; search_path is now public, pg_temp
      if not (array(select c from unnest(cfg) c where c not like 'search_path=%') <@ cfg_new)
         or not ('search_path=public, pg_temp' = any(cfg_new)) then
        raise exception using errcode = 'P0503'; end if;
      insert into _g0503 values ('finance_apply_credit_note(uuid, uuid)', 'rewritten');
    exception when sqlstate 'P0503' then   -- rolls back this function's rewrite only
      insert into _g0503 values ('finance_apply_credit_note(uuid, uuid)', 'live settings would be lost - left untouched');
    end;
  elsif h = '969b5fb89876daa1e246cd39ade21138' then insert into _g0503 values ('finance_apply_credit_note(uuid, uuid)', 'already');
  else insert into _g0503 values ('finance_apply_credit_note(uuid, uuid)', 'live body differs - left untouched');
  end if;
end
$g0503$;

-- refund_pay(uuid, payment_method, text)
--   source: repo 0062_finance_chunk_a_rpcs.sql
--   edits: gate: A not in (...) -> (A is null or A not in (...)); search_path += pg_temp
do $g0503$
declare p regprocedure := to_regprocedure('public.refund_pay(uuid, payment_method, text)'); h text; cfg text[]; cfg_new text[];
begin
  if p is null then insert into _g0503 values ('refund_pay(uuid, payment_method, text)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')), coalesce(proconfig, '{}') into h, cfg from pg_proc where oid = p and prosecdef;
  if h = '44f45c55012ecf29be243964980caeda' then
    begin
      execute $s0503a$
create or replace function public.refund_pay(
  p_refund_id uuid,
  p_method    payment_method,
  p_reference text
) returns refunds
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ref refunds;
begin
  if (public.app_role() is null or public.app_role() not in ('finance','principal')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_ref from refunds where id = p_refund_id for update;
  if not found then
    raise exception 'refund not found' using errcode = 'P0002';
  end if;

  if v_ref.status <> 'approved' then
    raise exception 'refund must be approved before pay (status %)', v_ref.status
      using errcode = '22023';
  end if;

  insert into payments (direction, amount, method, reference,
                        paid_at, refund_id, recorded_by)
  values ('out', v_ref.amount, p_method, p_reference,
          current_date, p_refund_id, auth.uid());

  update refunds
     set status  = 'paid',
         paid_at = now()
   where id = p_refund_id
   returning * into v_ref;

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values (public.app_role(),
          (select name from app_users where id = auth.uid()),
          format('Refund paid · RM %s · %s', v_ref.amount, p_method),
          v_ref.dealer_id,
          p_reference);

  return v_ref;
end;
$$;
$s0503a$;
      select coalesce(proconfig, '{}') into cfg_new from pg_proc where oid = p;
      -- every live setting except search_path survives; search_path is now public, pg_temp
      if not (array(select c from unnest(cfg) c where c not like 'search_path=%') <@ cfg_new)
         or not ('search_path=public, pg_temp' = any(cfg_new)) then
        raise exception using errcode = 'P0503'; end if;
      insert into _g0503 values ('refund_pay(uuid, payment_method, text)', 'rewritten');
    exception when sqlstate 'P0503' then   -- rolls back this function's rewrite only
      insert into _g0503 values ('refund_pay(uuid, payment_method, text)', 'live settings would be lost - left untouched');
    end;
  elsif h = '114acce6aef3c4488b7ee578d0ab9e1f' then insert into _g0503 values ('refund_pay(uuid, payment_method, text)', 'already');
  else insert into _g0503 values ('refund_pay(uuid, payment_method, text)', 'live body differs - left untouched');
  end if;
end
$g0503$;

-- next_credit_note_no()
--   source: repo 0065_finance_chunk_c.sql
--   edits: language sql -> plpgsql; gate added (finance, principal); search_path += pg_temp
do $g0503$
declare p regprocedure := to_regprocedure('public.next_credit_note_no()'); h text; cfg text[]; cfg_new text[];
begin
  if p is null then insert into _g0503 values ('next_credit_note_no()', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')), coalesce(proconfig, '{}') into h, cfg from pg_proc where oid = p and prosecdef;
  if h = '1d3d44eb9e720194c057d0e895d1e32e' then
    begin
      execute $s0503a$
create or replace function public.next_credit_note_no()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (public.app_role() is null or public.app_role() not in ('finance','principal')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return 'CN-' || lpad(nextval('refund_credit_note_seq')::text, 4, '0');
end;
$$;
$s0503a$;
      select coalesce(proconfig, '{}') into cfg_new from pg_proc where oid = p;
      -- every live setting except search_path survives; search_path is now public, pg_temp
      if not (array(select c from unnest(cfg) c where c not like 'search_path=%') <@ cfg_new)
         or not ('search_path=public, pg_temp' = any(cfg_new)) then
        raise exception using errcode = 'P0503'; end if;
      insert into _g0503 values ('next_credit_note_no()', 'rewritten');
    exception when sqlstate 'P0503' then   -- rolls back this function's rewrite only
      insert into _g0503 values ('next_credit_note_no()', 'live settings would be lost - left untouched');
    end;
  elsif h = '1574b36c8ce7d907680e564468c5ed46' then insert into _g0503 values ('next_credit_note_no()', 'already');
  else insert into _g0503 values ('next_credit_note_no()', 'live body differs - left untouched');
  end if;
end
$g0503$;

-- top_up_order(uuid, numeric, text, text, text, text, date, jsonb, text)
--   source: repo 0500_role_gates_refuse_a_caller_with_no_role.sql
--   edits: 'logistics' -> 'operation' in the cross-dealer gate
do $g0503$
declare p regprocedure := to_regprocedure('public.top_up_order(uuid, numeric, text, text, text, text, date, jsonb, text)'); h text; cfg text[]; cfg_new text[];
begin
  if p is null then insert into _g0503 values ('top_up_order(uuid, numeric, text, text, text, text, date, jsonb, text)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')), coalesce(proconfig, '{}') into h, cfg from pg_proc where oid = p and prosecdef;
  if h = '2bb0645e8ca685ffa93504e9f2791311' then
    begin
      execute $s0503a$
create or replace function public.top_up_order(
  p_order_id uuid, p_amount numeric, p_method text, p_method_label text,
  p_reference text, p_note text, p_date date, p_photo_paths jsonb,
  p_idempotency_key text default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_order orders; v_role app_role; v_caller_dealer_id uuid;
  v_total numeric(12,2); v_amount numeric(12,2); v_post jsonb; v_existing order_payments;
begin
  v_role := public.app_role(); v_caller_dealer_id := public.app_dealer_id();
  if nullif(p_idempotency_key,'') is not null then
    select * into v_existing from order_payments
     where source_channel='sales_top_up' and idempotency_key=p_idempotency_key;
    if found then
      if v_existing.order_id is distinct from p_order_id then
        raise exception 'idempotency key was already used for a different payment'
          using errcode='22023',detail='idempotency_conflict';
      end if;
      select paid into v_total from orders where id=p_order_id;
      return jsonb_build_object('id',p_order_id,'amount',v_existing.amount,'paid',v_total,
                                'payment_id',v_existing.id,'already',true);
    end if;
  end if;
  select * into v_order from orders where id=p_order_id for update;
  if not found then raise exception 'Order not found' using errcode='42P01'; end if;
  if (v_role is null or v_role not in ('principal','operation','finance','bd'))
     and v_order.dealer_id is distinct from v_caller_dealer_id then
    raise exception 'forbidden: cross-dealer top-up' using errcode='42501';
  end if;
  if v_order.status in ('delivered','cancelled') then
    raise exception 'Top-up not allowed once order is delivered or cancelled' using errcode='22023',detail='wrong_status';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be greater than zero' using errcode='22023',detail='invalid_amount'; end if;
  select coalesce((select sum(unit_price*qty) from order_lines where order_id=p_order_id),0)
       + coalesce((select sum(unit_price*qty) from order_addons where order_id=p_order_id),0) into v_total;
  if v_total<=0 then raise exception 'Order has no priced items — cannot top up' using errcode='22023',detail='total_amount_missing'; end if;
  v_amount := least(p_amount, v_total-coalesce(v_order.paid,0));
  if v_amount<=0 then raise exception 'Order is already fully paid' using errcode='22023',detail='already_paid'; end if;
  v_post := public._customer_payment_post(p_order_id,v_amount,p_date,p_method,'payment','sales_top_up',
    coalesce(nullif(p_idempotency_key,''),gen_random_uuid()::text),p_reference,p_reference,p_note,
    null,null,jsonb_build_object('method_label',p_method_label,'photo_paths',coalesce(p_photo_paths,'[]'::jsonb)),true);
  insert into order_history(order_id,text,by_role,metadata) values(p_order_id,
    format('Top-up RM %s via %s%s',v_amount::text,coalesce(nullif(p_method_label,''),p_method),
      case when nullif(trim(coalesce(p_reference,'')),'') is not null then ' · ref '||p_reference else '' end),
    v_role,jsonb_build_object('kind','top_up','amount',v_amount,'method',p_method,
      'method_label',p_method_label,'reference',nullif(p_reference,''),'note',nullif(p_note,''),
      'date',p_date,'photo_paths',coalesce(p_photo_paths,'[]'::jsonb),'payment_id',v_post->'payment_id'));
  return jsonb_build_object('id',p_order_id,'amount',v_amount,'paid',v_post->'orders_paid','payment_id',v_post->'payment_id');
end;
$fn$;
$s0503a$;
      select coalesce(proconfig, '{}') into cfg_new from pg_proc where oid = p;
      -- every live setting except search_path survives; search_path is now public, pg_temp
      if not (array(select c from unnest(cfg) c where c not like 'search_path=%') <@ cfg_new)
         or not ('search_path=public, pg_temp' = any(cfg_new)) then
        raise exception using errcode = 'P0503'; end if;
      insert into _g0503 values ('top_up_order(uuid, numeric, text, text, text, text, date, jsonb, text)', 'rewritten');
    exception when sqlstate 'P0503' then   -- rolls back this function's rewrite only
      insert into _g0503 values ('top_up_order(uuid, numeric, text, text, text, text, date, jsonb, text)', 'live settings would be lost - left untouched');
    end;
  elsif h = '62742f252c83488d93581fdfb625ef1f' then insert into _g0503 values ('top_up_order(uuid, numeric, text, text, text, text, date, jsonb, text)', 'already');
  else insert into _g0503 values ('top_up_order(uuid, numeric, text, text, text, text, date, jsonb, text)', 'live body differs - left untouched');
  end if;
end
$g0503$;

do $sanity$
declare s text; p regprocedure; w text; r record;
begin
  for s in select unnest(array[
    'public.finance_ar_aging()',
    'public.finance_cashflow_series(integer)',
    'public.finance_dashboard_summary()',
    'public.finance_monthly_pl(integer)',
    'public.finance_recon_suggest_matches(uuid)',
    'public.finance_top_skus(integer)',
    'public.finance_topup_approve(uuid, payment_method, text, text)',
    'public.finance_apply_credit_note(uuid, uuid)',
    'public.refund_pay(uuid, payment_method, text)',
    'public.next_credit_note_no()',
    'public.top_up_order(uuid, numeric, text, text, text, text, date, jsonb, text)'
  ]::text[]) loop
    p := to_regprocedure(s);
    if p is null then continue; end if;
    foreach w in array array['anon', 'authenticated'] loop
      if has_function_privilege(w, p, 'execute')
           <> exists (select 1 from _auth_before_0503 b where b.fn = p and b.who = w) then
        raise exception '0503: % execute changed on %', w, p; end if;
    end loop;
  end loop;
  for r in select result, count(*) n from _g0503 group by result order by result loop
    raise notice '0503: % %', r.n, r.result;
  end loop;
  -- Every function left untouched is named here, so it shows in the SQL editor.
  for r in select fn, result from _g0503 where result like '%left untouched' order by fn loop
    raise warning '0503: gate NOT fixed on public.% (%) -- fix it by hand', r.fn, r.result;
  end loop;
end
$sanity$;

commit;

-- =============================================================================
-- 0665_the_rebate_follows_the_money_and_dealers_earn_a_kpi_allowance.sql
-- =============================================================================
-- THE RULING (Chew and management, 2026-10-05 to 2026-10-07; docs/finance/
--   MASTER.md §3.2, the final-check rules 7.2–7.4 and 8.1–8.4; build step 4,
--   「可以，开始做第4步」 2026-10-09):
--   - The renovation rebate's total can be filled in later; until then the
--     rebate is worked out with no limit (7.3). Its money follows commission's
--     rules (7.4): the half-paid rule, refunds, and a cancelled order's money
--     counting until Finance takes its commission back.
--   - The 15-year guarantee KPI allowance (8.1–8.3): each guarantee sold counts
--     on its order's day; a period pays an amount per guarantee plus the bonus
--     of the highest tier reached (tiers do not add up); the count starts again
--     each month or each year, a setting. A cancelled order's do not count (8.4).
--     Finance keeps the amounts (rule 11). They live in this table, never in
--     this repository: the memos and their amounts stay with Chew.
--
-- WHAT THIS ADDS
--   1. dealer_rebate_quotas.quota may be empty: the total is filled in later.
--   2. dealer_kpi_rules: the KPI allowance from a day, the guarantee it counts,
--      the amount per guarantee, the tiers and the period. A row is never
--      changed: a new rule is a new row, a mistake is removed.
--   3. Doors (Finance and principal): dealer_kpi_rule_add, dealer_kpi_rule_remove,
--      and the read dealer_kpi_rules_read.
--   4. dealer_commission_source and dealer_commission_statement also carry the
--      KPI rules, so the report, the statement and the dealer's own page work
--      the allowance out with the one arithmetic
--      (packages/shared/src/dealer-commission.ts).
--
-- RLS: dealer_kpi_rules is read by Finance (gl_may_read) and written only by
--   its doors; a dealer reads the rules only inside its own statement.
--   DATA: none (no amount is written here). DR/CR: none.
-- =============================================================================

begin;

set local search_path = public, pg_temp;

-- ── 1 · the rebate's total is filled in later (rule 7.3) ─────────────────────
alter table public.dealer_rebate_quotas alter column quota drop not null;

comment on column public.dealer_rebate_quotas.quota is
  '0665: the renovation rebate''s total. Empty until Finance fills it in; until then the rebate has no limit (rule 7.3).';

-- ── 2 · the KPI allowance rules ──────────────────────────────────────────────
create table if not exists public.dealer_kpi_rules (
  id          uuid primary key default gen_random_uuid(),
  starts_on   date not null,
  -- The guarantee product counted (the 15-year guarantee).
  model_id    uuid not null references public.product_models(id),
  per_unit    numeric(12,2) not null check (per_unit >= 0),
  -- [{ "units": n, "bonus": rm }], rising by units; the highest reached pays.
  tiers       jsonb not null default '[]'::jsonb check (jsonb_typeof(tiers) = 'array'),
  period      text not null default 'month' check (period in ('month', 'year')),
  memo        text check (memo is null or length(btrim(memo)) between 1 and 200),
  created_at  timestamptz not null default now(),
  created_by  uuid references public.app_users(id),
  removed_at  timestamptz,
  removed_by  uuid references public.app_users(id)
);

comment on table public.dealer_kpi_rules is
  '0665: the dealer 15-year guarantee KPI allowance, each rule from its day. Written only by dealer_kpi_rule_add / _remove; a row is never changed, only removed.';

create unique index if not exists dealer_kpi_rules_one_a_day
  on public.dealer_kpi_rules (starts_on) where removed_at is null;

alter table public.dealer_kpi_rules enable row level security;

drop policy if exists dealer_kpi_rules_finance_read on public.dealer_kpi_rules;
create policy dealer_kpi_rules_finance_read on public.dealer_kpi_rules
  for select using ((select public.gl_may_read()));

revoke all on public.dealer_kpi_rules from anon;
revoke insert, update, delete on public.dealer_kpi_rules from authenticated;

-- The rules as the arithmetic reads them. Private: read inside the source and
-- the statement.
create or replace function public._dealer_kpi_rules_json()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', k.id, 'startsOn', k.starts_on, 'modelId', k.model_id,
           'perUnit', k.per_unit, 'tiers', k.tiers, 'period', k.period)
         order by k.starts_on), '[]'::jsonb)
    from public.dealer_kpi_rules k
   where k.removed_at is null;
$fn$;

revoke all on function public._dealer_kpi_rules_json() from public, anon, authenticated;

-- ── 3 · the doors ────────────────────────────────────────────────────────────
create or replace function public.dealer_kpi_rule_add(
  p_starts_on date, p_model_id uuid, p_per_unit numeric, p_tiers jsonb, p_period text, p_memo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role  text := (select public.app_role())::text;
  v_memo  text := nullif(btrim(coalesce(p_memo, '')), '');
  v_t     jsonb;
  v_units numeric;
  v_bonus numeric;
  v_seen  numeric[] := '{}';
  v_tiers jsonb;
  v_id    uuid;
begin
  if v_role is null or v_role not in ('finance', 'principal') then
    raise exception 'Only Finance changes the KPI allowance.' using errcode = '42501', detail = 'not_finance';
  end if;
  if p_starts_on is null then
    raise exception 'Choose the day it starts.' using errcode = '22023', detail = 'starts_on_required';
  end if;
  if not exists (select 1 from public.product_models m where m.id = p_model_id and m.category::text = 'guarantee') then
    raise exception 'Choose the guarantee the allowance counts.' using errcode = '22023', detail = 'bad_guarantee';
  end if;
  if p_per_unit is null or p_per_unit < 0 or p_per_unit > 9999999.99 or p_per_unit <> round(p_per_unit, 2) then
    raise exception 'Type the amount per guarantee in ringgit and sen, like 10.00.'
      using errcode = '22023', detail = 'bad_per_unit';
  end if;
  if p_period is null or p_period not in ('month', 'year') then
    raise exception 'Choose whether the count starts again each month or each year.'
      using errcode = '22023', detail = 'bad_period';
  end if;
  if v_memo is not null and length(v_memo) > 200 then
    raise exception 'Keep the memo to 200 characters.' using errcode = '22023', detail = 'memo_too_long';
  end if;
  if p_tiers is null or jsonb_typeof(p_tiers) <> 'array' or jsonb_array_length(p_tiers) > 20 then
    raise exception 'The tiers are not readable.' using errcode = '22023', detail = 'bad_tiers';
  end if;
  for v_t in select value from jsonb_array_elements(p_tiers) loop
    if jsonb_typeof(v_t) <> 'object' or jsonb_typeof(v_t -> 'units') <> 'number'
       or jsonb_typeof(v_t -> 'bonus') <> 'number' then
      raise exception 'The tiers are not readable.' using errcode = '22023', detail = 'bad_tiers';
    end if;
    v_units := (v_t ->> 'units')::numeric;
    v_bonus := (v_t ->> 'bonus')::numeric;
    if v_units < 1 or v_units > 100000 or v_units <> trunc(v_units) then
      raise exception 'A tier starts at a whole number of guarantees, 1 or more.'
        using errcode = '22023', detail = 'bad_tier_units';
    end if;
    if v_bonus < 0 or v_bonus > 9999999.99 or v_bonus <> round(v_bonus, 2) then
      raise exception 'Type a tier''s bonus in ringgit and sen, like 100.00.'
        using errcode = '22023', detail = 'bad_tier_bonus';
    end if;
    if v_units = any (v_seen) then
      raise exception 'Two tiers start at % guarantees.', v_units using errcode = '22023', detail = 'tier_twice';
    end if;
    v_seen := v_seen || v_units;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('units', (t ->> 'units')::int,
                                               'bonus', round((t ->> 'bonus')::numeric, 2))
                            order by (t ->> 'units')::int), '[]'::jsonb)
    into v_tiers
    from jsonb_array_elements(p_tiers) t;

  -- One live rule a day; the unique index is the last word.
  perform pg_advisory_xact_lock(hashtextextended('dealer_kpi_rules', 0));
  if exists (select 1 from public.dealer_kpi_rules k where k.removed_at is null and k.starts_on = p_starts_on) then
    raise exception 'There is already a KPI allowance from %. Remove it first.', to_char(p_starts_on, 'FMDD Mon YYYY')
      using errcode = '22023', detail = 'already_on_that_day';
  end if;

  insert into public.dealer_kpi_rules (starts_on, model_id, per_unit, tiers, period, memo, created_by)
  values (p_starts_on, p_model_id, p_per_unit, v_tiers, p_period, v_memo, auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end;
$fn$;

create or replace function public.dealer_kpi_rule_remove(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role text := (select public.app_role())::text;
  v_row  public.dealer_kpi_rules;
begin
  if v_role is null or v_role not in ('finance', 'principal') then
    raise exception 'Only Finance changes the KPI allowance.' using errcode = '42501', detail = 'not_finance';
  end if;
  select * into v_row from public.dealer_kpi_rules where id = p_id for update;
  if not found then
    raise exception 'That KPI allowance is not on the list.' using errcode = 'P0002', detail = 'not_found';
  end if;
  if v_row.removed_at is not null then
    return jsonb_build_object('id', v_row.id, 'already', true);
  end if;
  update public.dealer_kpi_rules set removed_at = now(), removed_by = auth.uid() where id = p_id;
  return jsonb_build_object('id', v_row.id, 'already', false);
end;
$fn$;

create or replace function public.dealer_kpi_rules_read()
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
    raise exception 'Only Finance sees the KPI allowance.' using errcode = '42501', detail = 'not_finance';
  end if;
  return jsonb_build_object(
    'today', v_today,
    'rules', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', k.id, 'startsOn', k.starts_on, 'modelId', k.model_id, 'modelName', m.name,
               'perUnit', k.per_unit, 'tiers', k.tiers, 'period', k.period, 'memo', k.memo,
               'createdAt', k.created_at, 'createdBy', u.name,
               -- in use: the latest rule in force today; later: starts after
               -- today; replaced: an earlier one.
               'state', case
                          when k.starts_on > v_today then 'later'
                          when not exists (select 1 from public.dealer_kpi_rules x
                                            where x.removed_at is null and x.starts_on <= v_today
                                              and x.starts_on > k.starts_on) then 'in_use'
                          else 'replaced'
                        end)
             order by k.starts_on desc)
        from public.dealer_kpi_rules k
        left join public.product_models m on m.id = k.model_id
        left join public.app_users u on u.id = k.created_by
       where k.removed_at is null), '[]'::jsonb),
    'guarantees', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name) order by m.name)
        from public.product_models m
       where m.category::text = 'guarantee' and m.discontinued_at is null), '[]'::jsonb));
end;
$fn$;

revoke all on function public.dealer_kpi_rule_add(date, uuid, numeric, jsonb, text, text) from public, anon;
revoke all on function public.dealer_kpi_rule_remove(uuid) from public, anon;
revoke all on function public.dealer_kpi_rules_read() from public, anon;
grant execute on function public.dealer_kpi_rule_add(date, uuid, numeric, jsonb, text, text) to authenticated;
grant execute on function public.dealer_kpi_rule_remove(uuid) to authenticated;
grant execute on function public.dealer_kpi_rules_read() to authenticated;

-- ── 4 · the report's read and the statement carry the rules ─────────────────
create or replace function pg_temp.mig0665_rewrite(p_fn regprocedure, p_old text, p_new text)
returns void
language plpgsql
as $rw$
declare
  v_def text := replace(pg_get_functiondef(p_fn), E'\r\n', E'\n');
  v_n   integer;
begin
  v_n := (length(v_def) - length(replace(v_def, p_old, ''))) / greatest(length(p_old), 1);
  if v_n <> 1 then
    raise exception '0665: % holds the text to change % times, not once: %', p_fn, v_n, left(p_old, 90);
  end if;
  execute replace(v_def, p_old, p_new);
end;
$rw$;

select pg_temp.mig0665_rewrite('public.dealer_commission_source(date)'::regprocedure,
$old$'orders', public._dealer_commission_orders(null, v_end)$old$,
$new$'kpi', public._dealer_kpi_rules_json(),   -- 0665
    'orders', public._dealer_commission_orders(null, v_end)$new$);

select pg_temp.mig0665_rewrite('public.dealer_commission_statement(uuid)'::regprocedure,
$old$'orders', public._dealer_commission_orders(v_dealer, v_today + 1),$old$,
$new$'kpi', public._dealer_kpi_rules_json(),   -- 0665
    'orders', public._dealer_commission_orders(v_dealer, v_today + 1),$new$);

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
declare
  v_src text;
begin
  select pg_get_functiondef('public.dealer_commission_source(date)'::regprocedure) into v_src;
  if position('_dealer_kpi_rules_json()' in v_src) = 0 or position('gl_may_read' in v_src) = 0 then
    raise exception '0665: dealer_commission_source does not carry the KPI rules, or lost its check';
  end if;
  select pg_get_functiondef('public.dealer_commission_statement(uuid)'::regprocedure) into v_src;
  if position('_dealer_kpi_rules_json()' in v_src) = 0 or position('app_dealer_id()' in v_src) = 0 then
    raise exception '0665: dealer_commission_statement does not carry the KPI rules, or lost its own-dealer check';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'dealer_rebate_quotas'
                and column_name = 'quota' and is_nullable = 'NO') then
    raise exception '0665: a renovation rebate still needs its total';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname in ('dealer_kpi_rule_add', 'dealer_kpi_rule_remove', 'dealer_kpi_rules_read',
                                  'dealer_commission_source', 'dealer_commission_statement')
                and not (p.prosecdef and p.proconfig @> array['search_path=public, pg_temp'])) then
    raise exception '0665: a door or read lost security definer or its search_path';
  end if;
  if has_function_privilege('authenticated', 'public._dealer_kpi_rules_json()', 'execute')
     or has_function_privilege('anon', 'public.dealer_kpi_rule_add(date, uuid, numeric, jsonb, text, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.dealer_kpi_rules_read()', 'execute') then
    raise exception '0665: a KPI door or helper has the wrong callers';
  end if;
  if has_table_privilege('authenticated', 'public.dealer_kpi_rules', 'insert')
     or has_table_privilege('authenticated', 'public.dealer_kpi_rules', 'update')
     or has_table_privilege('authenticated', 'public.dealer_kpi_rules', 'delete') then
    raise exception '0665: dealer_kpi_rules can be written around its doors';
  end if;
  -- A caller with no role is refused before anything is written.
  begin
    perform public.dealer_kpi_rule_add(current_date, gen_random_uuid(), 0, '[]'::jsonb, 'month', null);
    raise exception '0665: the KPI door ran for a caller with no role';
  exception when insufficient_privilege then
    null;
  end;
end $sanity$;

commit;

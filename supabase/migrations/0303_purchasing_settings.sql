-- =====================================================================
-- 0303 — Purchasing P1: the numbers become settings
-- =====================================================================
-- Card: docs/purchasing-execution-queue.md § P1 (Jess-locked 2026-07-27).
--   "every number the purchasing engine uses stops being hard-coded and
--    becomes something Jess edits, with a record of who changed it and
--    what it was before."
--   Done when: Jess changes sofa production time on screen and the
--   order-by date on the To Order tab moves the same day; no purchasing
--   number is hard-coded anywhere.
--
-- The numbers are §2 of docs/PURCHASING-WORKING-FLOW.md. Today they live
-- in four constants in apps/api/src/routes/operation/purchase.ts, one in
-- packages/shared/src/constants.ts and one in delivery-queue.ts. This
-- migration gives them a home; the same PR DELETES every one of those
-- constants — no fallback, because a fallback is how a setting silently
-- stops mattering.
--
-- WHAT THIS ADDS
--   1. purchasing_settings          — the four single numbers (singleton)
--   2. purchasing_supplier_settings — the work week, per SUPPLIER
--   3. purchasing_production_days   — production working days, per
--                                     supplier × category
--   4. purchasing_setting_changes   — who changed it, when, and what it
--                                     was before (the screen reads this)
--   5. four audited DEFINER RPCs — the ONLY write doors
--
-- NO SILENT DEFAULT FOR PRODUCTION TIME (Jess 2026-07-28)
--   A supplier × category with no row does NOT quietly fall back to 7.
--   The screen says `Set a number` and that line's order-by date is not
--   computed at all — K1's rule, for the same reason: a quiet screen must
--   mean *watched and fine*, never *nobody looked*. That is why there is
--   no `production_days_<category>` default column anywhere below.
--
-- ONE BEHAVIOUR CHANGE ONLY (Jess 2026-07-28)
--   Sofa production time 10 → 14 working days. The order-by buffer stays
--   at today's 7 (the flow file's "10 at go-live" is an edit Jess makes on
--   the screen this card builds), and the earliest-sell number collapses
--   to 21 — the UPPER of today's 14/21, so no order becomes sellable
--   EARLIER than it is today.
--
-- WHY THE SEED IS DERIVED FROM SKUs, NOT TYPED BY NAME
--   Live 2026-07-28: only three supplier × category pairs own any SKU at
--   all (Nice Future × mattress, Ohana × bedframe, Ohana × sofa); the
--   other 8 suppliers own zero. A hand-typed seed would either miss a
--   pair or invent one, and would break the moment a supplier is renamed.
--
-- Tail re-checked immediately before apply (guardrail #8). Numbered 0303
-- because 0301/0302 are applied by parallel lines and not yet merged.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. The single numbers
-- ---------------------------------------------------------------------
create table if not exists public.purchasing_settings (
  id                          int primary key default 1 check (id = 1),
  -- Working days kept back between goods arriving and the customer's
  -- promised date, for arranging the delivery. §2 "order-by buffer".
  order_by_buffer_days        int not null default 7
                                check (order_by_buffer_days between 0 and 60),
  -- CALENDAR days. The earliest delivery date a store may sell.
  earliest_sell_days          int not null default 21
                                check (earliest_sell_days between 0 and 365),
  -- Working days before the customer's date that `Confirm delivery date`
  -- is raised (and turns late).
  logistics_call_working_days int not null default 1
                                check (logistics_call_working_days between 0 and 30),
  -- Weekdays POs are sent on, 0=Sun … 6=Sat. Mon/Wed/Fri today.
  po_days                     int[] not null default '{1,3,5}',
  updated_by                  uuid references public.app_users(id),
  updated_at                  timestamptz not null default now(),
  constraint purchasing_settings_po_days_shape check (
    array_length(po_days, 1) between 1 and 7
    and po_days <@ array[0,1,2,3,4,5,6]
  )
);

comment on table public.purchasing_settings is
  'The purchasing numbers that are a single value (P1, docs/PURCHASING-WORKING-FLOW.md §2). Production time and the work week are per supplier and live in their own tables. Written only by purchasing_set_number() / purchasing_set_po_days().';
comment on column public.purchasing_settings.earliest_sell_days is
  'CALENDAR days — every other number here is WORKING days. The POS refuses a delivery date closer than this for a sofa / bed frame / mattress cart.';
comment on column public.purchasing_settings.po_days is
  'ISO-free weekday numbers, 0=Sun … 6=Sat. A late line never waits for a PO day (the engine''s urgent bypass).';

insert into public.purchasing_settings (id) values (1)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 2. The work week, per supplier
-- ---------------------------------------------------------------------
create table if not exists public.purchasing_supplier_settings (
  supplier_id uuid primary key references public.suppliers(id) on delete cascade,
  -- Non-working weekdays for THIS factory, 0=Sun … 6=Sat.
  off_days    int[] not null default '{0}',
  updated_by  uuid references public.app_users(id),
  updated_at  timestamptz not null default now(),
  constraint purchasing_supplier_off_days_shape check (
    array_length(off_days, 1) between 1 and 6
    and off_days <@ array[0,1,2,3,4,5,6]
  )
);

comment on table public.purchasing_supplier_settings is
  'Supplier work week (P1). Replaces SUPPLIER_OFF_DAYS, which was keyed by CATEGORY — a proxy that was only ever true while one supplier owned each category.';

-- Seed the week the engine used yesterday, so nothing moves on apply.
-- The old proxy was: mattress = 5-day (Nice Future), bedframe / sofa =
-- 6-day (Ohana). Derived from the SKUs each supplier actually owns, so a
-- rename cannot break it. Sunday is off for everyone (the portal-wide
-- working-day definition); Saturday is off only for a mattress-only
-- factory.
insert into public.purchasing_supplier_settings (supplier_id, off_days)
select
  s.supplier_id,
  case
    when 'mattress' = any(s.cats) and not ('sofa' = any(s.cats) or 'bedframe' = any(s.cats))
      then array[0, 6]
    else array[0]
  end
from (
  select ps.supplier_id, array_agg(distinct pm.category) as cats
    from public.product_skus ps
    join public.product_models pm on pm.id = ps.model_id
   where ps.supplier_id is not null
     and pm.category in ('sofa', 'bedframe', 'mattress')
   group by ps.supplier_id
) s
on conflict (supplier_id) do nothing;

-- ---------------------------------------------------------------------
-- 3. Production working days, per supplier × category
-- ---------------------------------------------------------------------
create table if not exists public.purchasing_production_days (
  supplier_id  uuid not null references public.suppliers(id) on delete cascade,
  category     text not null check (category in ('sofa', 'bedframe', 'mattress')),
  working_days int  not null check (working_days between 1 and 180),
  updated_by   uuid references public.app_users(id),
  updated_at   timestamptz not null default now(),
  primary key (supplier_id, category)
);

comment on table public.purchasing_production_days is
  'How long a factory takes to make an item, in WORKING days, per supplier × category (P1). NO ROW = nobody has set a number: the screen says `Set a number` and the engine computes no order-by date for that line. There is deliberately no per-category default to fall back on.';

-- Seed = today's numbers, with Jess's one correction (sofa 10 → 14).
-- Derived from the SKUs each supplier owns: exactly the three pairs that
-- exist live, and nothing for the 8 suppliers that own no SKU.
insert into public.purchasing_production_days (supplier_id, category, working_days)
select distinct
  ps.supplier_id,
  pm.category,
  case pm.category when 'sofa' then 14 else 7 end
  from public.product_skus ps
  join public.product_models pm on pm.id = ps.model_id
 where ps.supplier_id is not null
   and pm.category in ('sofa', 'bedframe', 'mattress')
on conflict (supplier_id, category) do nothing;

-- ---------------------------------------------------------------------
-- 4. What it was before
-- ---------------------------------------------------------------------
-- audit_log carries the portal-wide trail as a SENTENCE; a sentence
-- cannot be read back as a number, and the card asks the screen to show
-- the previous value beside each setting. So the previous value is
-- STORED, not parsed.
create table if not exists public.purchasing_setting_changes (
  id          bigserial primary key,
  setting_key text not null,
  supplier_id uuid references public.suppliers(id) on delete cascade,
  category    text,
  old_value   text,
  new_value   text not null,
  changed_by  uuid references public.app_users(id),
  changed_at  timestamptz not null default now()
);

create index if not exists purchasing_setting_changes_key_idx
  on public.purchasing_setting_changes (setting_key, changed_at desc);

comment on table public.purchasing_setting_changes is
  'Every purchasing settings edit: who, when, and what it was before (P1). Values are held as text because one row may carry a number (7) and the next a weekday list ({1,3,5}).';

-- ---------------------------------------------------------------------
-- 5. RLS — read only; the RPCs are the only write door
-- ---------------------------------------------------------------------
alter table public.purchasing_settings          enable row level security;
alter table public.purchasing_supplier_settings enable row level security;
alter table public.purchasing_production_days   enable row level security;
alter table public.purchasing_setting_changes   enable row level security;

-- The singleton is read by the POS as well as by operations: a store's
-- date picker has to know the earliest date it may sell, and that read
-- happens on the dealer's own JWT through the catalog bundle. The numbers
-- are operating policy, not commercial secrets.
drop policy if exists purchasing_settings_read on public.purchasing_settings;
create policy purchasing_settings_read on public.purchasing_settings
  for select using (auth.role() = 'authenticated');

-- Per-supplier numbers stay internal — a factory's production time is not
-- something a store account has any business reading.
drop policy if exists purchasing_supplier_settings_read on public.purchasing_supplier_settings;
create policy purchasing_supplier_settings_read on public.purchasing_supplier_settings
  for select using ((select (auth.jwt() -> 'app_metadata') ->> 'role') in ('operation','principal'));

drop policy if exists purchasing_production_days_read on public.purchasing_production_days;
create policy purchasing_production_days_read on public.purchasing_production_days
  for select using ((select (auth.jwt() -> 'app_metadata') ->> 'role') in ('operation','principal'));

drop policy if exists purchasing_setting_changes_read on public.purchasing_setting_changes;
create policy purchasing_setting_changes_read on public.purchasing_setting_changes
  for select using ((select (auth.jwt() -> 'app_metadata') ->> 'role') in ('operation','principal'));

-- NO write policy exists on any of the four tables, on purpose: a direct
-- PostgREST insert / update / delete is then impossible for every role and
-- the manager gate below cannot be walked around (0279's lesson — a
-- blanket write policy is an open door no RPC gate can close).

-- ---------------------------------------------------------------------
-- 6. The gate, written once
-- ---------------------------------------------------------------------
-- Settings is manager-only (§1 of the working flow; the card names the key:
-- `ops_manager`, NO new duty key). `principal` is the standing role gate
-- (0260's law: never expressed as a duty); everyone else needs the seat.
create or replace function public.purchasing_settings_gate()
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role   text := (select public.app_role());
  v_duties text[];
begin
  if v_role is null then
    raise exception 'forbidden' using errcode = '42501',
      detail = 'no active account';
  end if;

  if v_role <> 'principal' then
    select coalesce(array_agg(pd.duty_key), '{}'::text[])
      into v_duties
      from app_users u
      join org_position_duties pd on pd.position_id = u.position_id
     where u.id = auth.uid()
       and u.role <> 'dealer'
       and u.status = 'active';

    if not ('ops_manager' = any(coalesce(v_duties, '{}'::text[]))) then
      raise exception 'forbidden' using errcode = '42501',
        detail = 'purchasing settings are set by the manager';
    end if;
  end if;

  return v_role;
end;
$function$;

-- One recorder, so every door writes the history the same way.
create or replace function public.purchasing_record_change(
  p_role        text,
  p_key         text,
  p_supplier_id uuid,
  p_category    text,
  p_old         text,
  p_new         text,
  p_sentence    text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into purchasing_setting_changes
    (setting_key, supplier_id, category, old_value, new_value, changed_by)
  values (p_key, p_supplier_id, p_category, p_old, p_new, auth.uid());

  -- `audit_log.role` is the app_role ENUM, not text — without the cast
  -- every successful write raises 42804 and only the refusal path appears
  -- to work (0286 caught this in a dry run, never in a UI click).
  insert into audit_log (role, actor_text, action, ref)
  values (p_role::public.app_role,
          (select name from app_users where id = auth.uid()),
          p_sentence,
          p_key);
end;
$function$;

-- ---------------------------------------------------------------------
-- 7. The write doors
-- ---------------------------------------------------------------------

-- 7a. One of the single numbers.
create or replace function public.purchasing_set_number(
  p_key   text,
  p_value int
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := (select public.purchasing_settings_gate());
  v_old  int;
begin
  if p_value is null then
    raise exception 'value_required' using errcode = '22023';
  end if;

  -- The key list is closed HERE as well as in the shared TS constant: a
  -- typo must be refused by the database, not only by the browser.
  if p_key not in ('order_by_buffer_days', 'earliest_sell_days', 'logistics_call_working_days') then
    raise exception 'unknown_setting' using errcode = '22023', detail = p_key;
  end if;

  select case p_key
           when 'order_by_buffer_days'        then order_by_buffer_days
           when 'earliest_sell_days'          then earliest_sell_days
           when 'logistics_call_working_days' then logistics_call_working_days
         end
    into v_old
    from purchasing_settings where id = 1;

  update purchasing_settings
     set order_by_buffer_days = case when p_key = 'order_by_buffer_days'
                                     then p_value else order_by_buffer_days end,
         earliest_sell_days = case when p_key = 'earliest_sell_days'
                                   then p_value else earliest_sell_days end,
         logistics_call_working_days = case when p_key = 'logistics_call_working_days'
                                            then p_value else logistics_call_working_days end,
         updated_by = auth.uid(),
         updated_at = now()
   where id = 1;

  -- The CHECK constraints above are the range rules; letting them raise
  -- keeps ONE definition of "a legal number" instead of a second copy here.

  perform purchasing_record_change(
    v_role, p_key, null, null, v_old::text, p_value::text,
    format('Purchasing setting · %s %s -> %s', p_key, coalesce(v_old::text, '-'), p_value));
end;
$function$;

-- 7b. The PO days.
create or replace function public.purchasing_set_po_days(p_days int[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := (select public.purchasing_settings_gate());
  v_old  int[];
begin
  if p_days is null or array_length(p_days, 1) is null then
    raise exception 'po_days_required' using errcode = '22023';
  end if;

  select po_days into v_old from purchasing_settings where id = 1;

  update purchasing_settings
     set po_days = (select array_agg(distinct d order by d) from unnest(p_days) as d),
         updated_by = auth.uid(),
         updated_at = now()
   where id = 1;

  perform purchasing_record_change(
    v_role, 'po_days', null, null, v_old::text, p_days::text,
    format('Purchasing setting · PO days %s -> %s', v_old::text, p_days::text));
end;
$function$;

-- 7c. Production working days for one supplier × category.
--     p_days null = clear the number (back to `Set a number`).
create or replace function public.purchasing_set_production_days(
  p_supplier_id uuid,
  p_category    text,
  p_days        int
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := (select public.purchasing_settings_gate());
  v_old  int;
  v_name text;
begin
  if p_supplier_id is null then
    raise exception 'supplier_required' using errcode = '22023';
  end if;
  if p_category not in ('sofa', 'bedframe', 'mattress') then
    raise exception 'unknown_category' using errcode = '22023', detail = coalesce(p_category, '-');
  end if;
  if not exists (select 1 from suppliers where id = p_supplier_id) then
    raise exception 'unknown_supplier' using errcode = '22023';
  end if;

  select working_days into v_old
    from purchasing_production_days
   where supplier_id = p_supplier_id and category = p_category;

  select name into v_name from suppliers where id = p_supplier_id;

  if p_days is null then
    delete from purchasing_production_days
     where supplier_id = p_supplier_id and category = p_category;
  else
    insert into purchasing_production_days
      (supplier_id, category, working_days, updated_by, updated_at)
    values (p_supplier_id, p_category, p_days, auth.uid(), now())
    on conflict (supplier_id, category) do update
      set working_days = excluded.working_days,
          updated_by   = excluded.updated_by,
          updated_at   = now();
  end if;

  perform purchasing_record_change(
    v_role, 'production_days', p_supplier_id, p_category,
    v_old::text, coalesce(p_days::text, ''),
    case when p_days is null
         then format('Purchasing setting · %s %s production working days cleared', v_name, p_category)
         else format('Purchasing setting · %s %s production working days %s -> %s',
                     v_name, p_category, coalesce(v_old::text, '-'), p_days)
    end);
end;
$function$;

-- 7d. One supplier's work week.
create or replace function public.purchasing_set_supplier_work_week(
  p_supplier_id uuid,
  p_off_days    int[]
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := (select public.purchasing_settings_gate());
  v_old  int[];
  v_new  int[];
  v_name text;
begin
  if p_supplier_id is null then
    raise exception 'supplier_required' using errcode = '22023';
  end if;
  if p_off_days is null or array_length(p_off_days, 1) is null then
    raise exception 'off_days_required' using errcode = '22023';
  end if;
  if not exists (select 1 from suppliers where id = p_supplier_id) then
    raise exception 'unknown_supplier' using errcode = '22023';
  end if;

  select array_agg(distinct d order by d) into v_new from unnest(p_off_days) as d;

  select off_days into v_old
    from purchasing_supplier_settings where supplier_id = p_supplier_id;
  select name into v_name from suppliers where id = p_supplier_id;

  insert into purchasing_supplier_settings (supplier_id, off_days, updated_by, updated_at)
  values (p_supplier_id, v_new, auth.uid(), now())
  on conflict (supplier_id) do update
    set off_days   = excluded.off_days,
        updated_by = excluded.updated_by,
        updated_at = now();

  perform purchasing_record_change(
    v_role, 'supplier_work_week', p_supplier_id, null,
    v_old::text, v_new::text,
    format('Purchasing setting · %s work week %s -> %s',
           v_name, coalesce(v_old::text, '-'), v_new::text));
end;
$function$;

-- ---------------------------------------------------------------------
-- 8. Grants — both directions, or it proves nothing
-- ---------------------------------------------------------------------
revoke all on function public.purchasing_settings_gate() from public;
revoke all on function public.purchasing_settings_gate() from anon;
revoke all on function public.purchasing_record_change(text, text, uuid, text, text, text, text) from public;
revoke all on function public.purchasing_record_change(text, text, uuid, text, text, text, text) from anon;
revoke all on function public.purchasing_set_number(text, int) from public;
revoke all on function public.purchasing_set_number(text, int) from anon;
revoke all on function public.purchasing_set_po_days(int[]) from public;
revoke all on function public.purchasing_set_po_days(int[]) from anon;
revoke all on function public.purchasing_set_production_days(uuid, text, int) from public;
revoke all on function public.purchasing_set_production_days(uuid, text, int) from anon;
revoke all on function public.purchasing_set_supplier_work_week(uuid, int[]) from public;
revoke all on function public.purchasing_set_supplier_work_week(uuid, int[]) from anon;

grant execute on function public.purchasing_set_number(text, int) to authenticated;
grant execute on function public.purchasing_set_po_days(int[]) to authenticated;
grant execute on function public.purchasing_set_production_days(uuid, text, int) to authenticated;
grant execute on function public.purchasing_set_supplier_work_week(uuid, int[]) to authenticated;
-- The two helpers are called from inside the four doors (SECURITY DEFINER
-- runs them as the owner), so nobody outside needs EXECUTE on them.

-- ---------------------------------------------------------------------
-- 9. Sanity — flags set inside handlers, ASSERTED OUTSIDE them
--    (guardrail #4: a RAISE inside its own EXCEPTION handler catches
--     itself and proves nothing).
-- ---------------------------------------------------------------------
do $sanity$
declare
  v_anon_exec   boolean;
  v_auth_exec   boolean;
  v_write_pol   int;
  v_read_pol    int;
  v_overloads   int;
  v_singleton   int;
  v_prod_rows   int;
  v_sofa_days   int;
  v_week_rows   int;
  v_week_gap    int;
  v_no_default  int;
begin
  select has_function_privilege('anon', 'public.purchasing_set_number(text, int)', 'execute')
    into v_anon_exec;
  select has_function_privilege('authenticated', 'public.purchasing_set_number(text, int)', 'execute')
    into v_auth_exec;

  select count(*) into v_write_pol
    from pg_policies
   where schemaname = 'public'
     and tablename in ('purchasing_settings', 'purchasing_supplier_settings',
                       'purchasing_production_days', 'purchasing_setting_changes')
     and cmd <> 'SELECT';

  select count(*) into v_read_pol
    from pg_policies
   where schemaname = 'public'
     and tablename in ('purchasing_settings', 'purchasing_supplier_settings',
                       'purchasing_production_days', 'purchasing_setting_changes')
     and cmd = 'SELECT';

  select count(*) into v_overloads
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('purchasing_set_number', 'purchasing_set_po_days',
                       'purchasing_set_production_days', 'purchasing_set_supplier_work_week');

  select count(*) into v_singleton from purchasing_settings;
  select count(*) into v_prod_rows from purchasing_production_days;
  select count(*) into v_week_rows from purchasing_supplier_settings;

  select count(*) into v_sofa_days
    from purchasing_production_days where category = 'sofa' and working_days = 14;

  -- The column that must NOT exist: a per-category default would be the
  -- silent 7 this card removes.
  select count(*) into v_no_default
    from information_schema.columns
   where table_schema = 'public' and table_name = 'purchasing_settings'
     and column_name like 'production_days%';

  if v_anon_exec then
    raise exception 'SANITY: anon can execute purchasing_set_number';
  end if;
  if not v_auth_exec then
    raise exception 'SANITY: authenticated cannot execute purchasing_set_number';
  end if;
  if v_write_pol <> 0 then
    raise exception 'SANITY: % write policies on the settings tables — the manager gate is walkable', v_write_pol;
  end if;
  if v_read_pol <> 4 then
    raise exception 'SANITY: expected 4 read policies, found %', v_read_pol;
  end if;
  if v_overloads <> 4 then
    raise exception 'SANITY: expected exactly 4 write doors, found % (a ghost overload)', v_overloads;
  end if;
  if v_singleton <> 1 then
    raise exception 'SANITY: purchasing_settings holds % rows, must hold exactly 1', v_singleton;
  end if;
  if v_prod_rows < 1 then
    raise exception 'SANITY: no production time seeded — every line would read `Set a number`';
  end if;
  if v_sofa_days < 1 then
    raise exception 'SANITY: sofa production time is not 14 working days';
  end if;
  -- Every supplier we can plan for must have a work week, or its lead
  -- leg would be counted on a calendar nobody chose.
  select count(*) into v_week_gap
    from (select distinct supplier_id from purchasing_production_days) d
   where not exists (
     select 1 from purchasing_supplier_settings w where w.supplier_id = d.supplier_id
   );
  if v_week_gap <> 0 then
    raise exception 'SANITY: % suppliers have a production time but no work week', v_week_gap;
  end if;
  if v_no_default <> 0 then
    raise exception 'SANITY: purchasing_settings carries a per-category production default — the silent 7 is back';
  end if;

  raise notice 'P1 sanity OK: anon=false auth=true write_policies=0 doors=4 production_rows=% work_weeks=%',
    v_prod_rows, v_week_rows;
end;
$sanity$;

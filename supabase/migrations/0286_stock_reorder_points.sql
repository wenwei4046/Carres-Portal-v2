-- =====================================================================
-- 0286 — Ready Stock K1: reorder points for import accessories
-- =====================================================================
-- Card: docs/ready-stock-execution-queue.md § K1 (Jess-locked 2026-07-27).
--   "pillow / mattress protector rows show current · reorder point ·
--    incoming and raise `Reorder stock` into the ops worklist when
--    current+incoming <= reorder point (2-month China lead = the alert
--    must fire early). Reorder points editable by COO only."
--   Done when: the <200 case can never be discovered by hitting zero.
--
-- WHAT THIS ADDS
--   1. ops_reorder_points  — one number per stock SKU, READ-ONLY over
--      PostgREST (no write policy at all; the RPC below is the only door).
--   2. org_duties key `stock_planner`, seeded to the COO seat.
--   3. ops_set_reorder_point() — audited DEFINER write, COO/principal.
--
-- WHY THE KEY IS THE STOCK SKU STRING, NOT product_skus.id
--   Measured on live prod 2026-07-27: all 49 distinct `ops_stock_items.sku`
--   values join to ZERO `product_skus` rows — the register holds free-text
--   names from Jess's Klg sheet ("Essential Memory Pillow(L)"), and the two
--   catalog accessory rows are separate codes nothing stocks. A catalog FK
--   would therefore be a column that can never point at the stock it means.
--
-- WHY NOT stock_balances.low_threshold (which already exists)
--   That column has been live since 0018 with a working alerts RPC and a
--   dashboard tile, and ZERO rows configured — but it cannot be the home for
--   this: ops_rollup_stock_balances() aggregates with count(*), written
--   before the bulk `qty` column arrived in 0218, so the 555-unit pillow row
--   rolls up as 1. Nothing in the app writes those balances for these SKUs
--   today, and the first rollup call would silently destroy the number. This
--   migration leaves that table and its RPC completely untouched.
--
-- NOT IN SCOPE (later cards, deliberately): the monthly propose→approve plan
-- (K2), the emergency lane (K3), reserve levels + usage reasons (K4), the
-- health ladder and slow-moving alerts (K5).
--
-- Tail re-checked immediately before apply (guardrail #8).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. The number a human chose
-- ---------------------------------------------------------------------
create table if not exists public.ops_reorder_points (
  sku           text primary key,
  reorder_point int  not null check (reorder_point >= 0 and reorder_point <= 100000),
  lead_days     int  check (lead_days >= 0 and lead_days <= 365),
  note          text,
  updated_by    uuid references public.app_users(id),
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

comment on table public.ops_reorder_points is
  'Reorder point per stock SKU (K1). Key = ops_stock_items.sku verbatim (free-text Klg sheet names, NOT a catalog code). reorder_point 0 = alert switched off. Written only by ops_set_reorder_point().';
comment on column public.ops_reorder_points.reorder_point is
  'Raise a PO when free + incoming falls to or below this. 0 = no alert.';
comment on column public.ops_reorder_points.lead_days is
  'Supplier lead in CALENDAR days — a China container is ~60. Shown so the operator can see why the number is high; the alert itself does not date-math on it (that is the MRP engine''s job).';

alter table public.ops_reorder_points enable row level security;

-- READ for the operation panel; NO write policy exists on purpose, so a
-- direct PostgREST insert/update/delete is impossible for every role and the
-- COO gate below cannot be walked around. (The 0279 lesson: a blanket write
-- policy is an open door that no RPC gate can close.)
drop policy if exists ops_reorder_points_read on public.ops_reorder_points;
create policy ops_reorder_points_read on public.ops_reorder_points
  for select
  using ((select (auth.jwt() -> 'app_metadata') ->> 'role') in ('operation','principal'));

-- ---------------------------------------------------------------------
-- 2. The duty — "only the COO edits reorder points"
-- ---------------------------------------------------------------------
insert into public.org_duties (key, name, description, sort) values
  ('stock_planner', 'Stock planner',
   'Set reorder points (and, later, reserve levels) for warehouse stock.', 60)
on conflict (key) do nothing;

-- SEED FROM LIVE HOLDERS, NOT FROM A POSITION NAME (0260's lesson: seeding
-- "the Operation Manager seat" would have stripped Jess, who holds COO).
-- Grant to every seat that already holds the STRICTEST existing duty
-- (po_duty_editor = "can edit roster only me") AND actually has an active
-- person in it. On live 2026-07-27 that resolves to exactly one seat: COO.
insert into public.org_position_duties (position_id, duty_key)
select distinct pd.position_id, 'stock_planner'
from public.org_position_duties pd
where pd.duty_key = 'po_duty_editor'
  and exists (
    select 1 from public.app_users u
    where u.position_id = pd.position_id and u.status = 'active'
  )
on conflict (position_id, duty_key) do nothing;

-- ---------------------------------------------------------------------
-- 3. The only write door — audited DEFINER RPC
-- ---------------------------------------------------------------------
create or replace function public.ops_set_reorder_point(
  p_sku       text,
  p_point     int,
  p_lead_days int  default null,
  p_note      text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sku    text := nullif(btrim(coalesce(p_sku, '')), '');
  v_role   text := (select public.app_role());
  v_duties text[];
begin
  if v_sku is null then
    raise exception 'sku_required' using errcode = '22023';
  end if;

  if p_point is null or p_point < 0 or p_point > 100000 then
    raise exception 'reorder_point_out_of_range' using errcode = '22023';
  end if;

  if p_lead_days is not null and (p_lead_days < 0 or p_lead_days > 365) then
    raise exception 'lead_days_out_of_range' using errcode = '22023';
  end if;

  -- principal is the standing role gate (0260's law: never expressed as a
  -- duty). Everyone else needs the seat. Read inline rather than through
  -- my_org_duties() so the gate cannot be loosened by editing that helper.
  if v_role <> 'principal' then
    select coalesce(array_agg(pd.duty_key), '{}'::text[])
      into v_duties
      from app_users u
      join org_position_duties pd on pd.position_id = u.position_id
     where u.id = auth.uid()
       and u.role <> 'dealer'
       and u.status = 'active';

    if not ('stock_planner' = any(coalesce(v_duties, '{}'::text[]))) then
      raise exception 'forbidden' using errcode = '42501',
        detail = 'reorder points are set by the COO';
    end if;
  end if;

  insert into ops_reorder_points (sku, reorder_point, lead_days, note, updated_by, updated_at)
  values (v_sku, p_point, p_lead_days, nullif(btrim(coalesce(p_note, '')), ''), auth.uid(), now())
  on conflict (sku) do update
    set reorder_point = excluded.reorder_point,
        lead_days     = excluded.lead_days,
        note          = excluded.note,
        updated_by    = excluded.updated_by,
        updated_at    = now();

  -- `audit_log.role` is the app_role ENUM, not text. v_role is held as text
  -- above so it can be compared to 'principal', so the cast is required here —
  -- without it EVERY successful write raises 42804 and only the gate-refusal
  -- path appears to work. (Caught by the dry run, never by a UI click.)
  insert into audit_log (role, actor_text, action, ref)
  values (v_role::public.app_role,
          (select name from app_users where id = auth.uid()),
          case when p_point = 0
               then format('Reorder alert OFF · %s', v_sku)
               else format('Reorder point set · %s -> %s', v_sku, p_point)
          end,
          v_sku);
end;
$function$;

revoke all on function public.ops_set_reorder_point(text, int, int, text) from public;
revoke all on function public.ops_set_reorder_point(text, int, int, text) from anon;
grant execute on function public.ops_set_reorder_point(text, int, int, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Sanity — flags set inside handlers, ASSERTED OUTSIDE them
--    (guardrail #4: a RAISE inside its own EXCEPTION handler catches
--     itself and proves nothing).
-- ---------------------------------------------------------------------
do $sanity$
declare
  v_anon_exec  boolean;
  v_auth_exec  boolean;
  v_overloads  int;
  v_write_pol  int;
  v_read_pol   int;
  v_duty_seats int;
begin
  select has_function_privilege('anon',
           'public.ops_set_reorder_point(text, int, int, text)', 'execute')
    into v_anon_exec;
  select has_function_privilege('authenticated',
           'public.ops_set_reorder_point(text, int, int, text)', 'execute')
    into v_auth_exec;

  select count(*) into v_overloads
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ops_set_reorder_point';

  select count(*) into v_write_pol
    from pg_policies
   where schemaname = 'public' and tablename = 'ops_reorder_points'
     and cmd <> 'SELECT';

  select count(*) into v_read_pol
    from pg_policies
   where schemaname = 'public' and tablename = 'ops_reorder_points'
     and cmd = 'SELECT';

  select count(*) into v_duty_seats
    from org_position_duties where duty_key = 'stock_planner';

  -- Both directions asserted: revoking without granting back is a silent
  -- lockout, granting without revoking is an open door.
  if v_anon_exec then
    raise exception 'SANITY: anon can execute ops_set_reorder_point';
  end if;
  if not v_auth_exec then
    raise exception 'SANITY: authenticated cannot execute ops_set_reorder_point';
  end if;
  if v_overloads <> 1 then
    raise exception 'SANITY: expected exactly 1 ops_set_reorder_point, found %', v_overloads;
  end if;
  if v_write_pol <> 0 then
    raise exception 'SANITY: ops_reorder_points has % write policies — the RPC gate is walkable', v_write_pol;
  end if;
  if v_read_pol <> 1 then
    raise exception 'SANITY: expected exactly 1 read policy, found %', v_read_pol;
  end if;
  if v_duty_seats < 1 then
    raise exception 'SANITY: stock_planner granted to no seat — nobody but principal could ever set a point';
  end if;

  raise notice 'K1 sanity OK: anon=false auth=true overloads=1 write_policies=0 stock_planner_seats=%', v_duty_seats;
end;
$sanity$;

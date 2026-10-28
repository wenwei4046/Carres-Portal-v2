-- =============================================================================
-- 0704_finance_tables_keep_personal_layouts.sql
-- =============================================================================
-- THE RULING (Chew 2026-10-21, 「可以」; docs/finance/MASTER.md §4.2 "The
--   Finance look"): every Finance table keeps the person's own saved column
--   layouts on the server — order, hidden, widths, sort — with a Default, the
--   same personal layouts Purchase Orders pilots (0528, Jess 2026-09-17). A
--   Finance exception: Finance listings join the pilot; no other module's
--   listing is admitted by this file. The General Ledger and the statements
--   keep their dragged widths as the person's layout named `Column widths`.
--
-- WHAT THIS CHANGES
--   1. register_layout_listing_ok(listing): the ONE answer to "may this
--      listing keep personal layouts" — `purchase_orders`, or a Finance
--      listing `finance_<name>` (lower-case letters, digits and `_`, 1 to 60
--      after the prefix).
--   2. register_personal_layouts' listing check (0528's closed list of one,
--      `register_personal_layouts_listing_check`) is replaced, under the same
--      name, by that answer.
--   3. register_layout_save asks the same answer instead of
--      `p_listing is distinct from 'purchase_orders'`. Every other line of
--      0528's body is unchanged: signed-in check, name, shape, the per-person
--      lock, replace-by-name, the 10-layout limit. register_layout_set_default
--      is not touched (it reads the listing from the caller's own row).
--   The doors keep `security definer`, their search_path and their grants:
--   PUBLIC and `anon` (0531) cannot execute them, `authenticated` can.
--
-- RLS: unchanged. The one policy is still SELECT own rows; writes still go
--   only through the two doors acting on auth.uid().
-- DATA: none. Every existing row is `purchase_orders`, which the new check
--   admits.
-- =============================================================================

begin;

set local search_path = public, pg_temp;

-- ── 1 · which listings may keep personal layouts ─────────────────────────────
create or replace function public.register_layout_listing_ok(p_listing text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(p_listing = 'purchase_orders' or p_listing ~ '^finance_[a-z0-9_]{1,60}$', false);
$$;

-- ── 2 · the table's check asks the same answer ───────────────────────────────
alter table public.register_personal_layouts
  drop constraint register_personal_layouts_listing_check;
alter table public.register_personal_layouts
  add constraint register_personal_layouts_listing_check
  check (public.register_layout_listing_ok(listing));

-- ── 3 · the save door asks it too ────────────────────────────────────────────
create or replace function public.register_layout_save(
  p_listing text,
  p_name text,
  p_layout jsonb
)
returns public.register_personal_layouts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := (select auth.uid());
  v_name text := btrim(coalesce(p_name, ''));
  v_row public.register_personal_layouts;
begin
  if v_user is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if not public.register_layout_listing_ok(p_listing) then
    raise exception 'register_layout_listing' using errcode = '22023';
  end if;
  if char_length(v_name) not between 1 and 60 then
    raise exception 'register_layout_name' using errcode = '22023';
  end if;
  if p_layout is null or not public.register_layout_shape_ok(p_layout) then
    raise exception 'register_layout_shape' using errcode = '22023';
  end if;

  -- One person's saves are serialised, so two tabs cannot both take the 10th slot.
  perform pg_advisory_xact_lock(hashtextextended('register_layout:' || v_user::text || ':' || p_listing, 0));

  update public.register_personal_layouts
     set layout = p_layout, updated_at = now()
   where user_id = v_user and listing = p_listing and name = v_name
  returning * into v_row;
  if found then
    return v_row;
  end if;

  if (select count(*) from public.register_personal_layouts
       where user_id = v_user and listing = p_listing) >= 10 then
    raise exception 'register_layout_limit' using errcode = '23514';
  end if;

  insert into public.register_personal_layouts (user_id, listing, name, layout)
  values (v_user, p_listing, v_name, p_layout)
  returning * into v_row;
  return v_row;
end;
$$;

-- The grants 0528 and 0531 left, stated again (create or replace keeps them;
-- this makes the file say so).
revoke all on function public.register_layout_save(text, text, jsonb) from public;
revoke execute on function public.register_layout_save(text, text, jsonb) from anon;
grant execute on function public.register_layout_save(text, text, jsonb) to authenticated;

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity_0704$
declare
  v_src text;
  v_def text;
begin
  -- The answer: purchase_orders and finance_* in, everything else out.
  if not public.register_layout_listing_ok('purchase_orders')
     or not public.register_layout_listing_ok('finance_bills')
     or not public.register_layout_listing_ok('finance_general_ledger')
     or not public.register_layout_listing_ok('finance_collection_deposit') then
    raise exception '0704: an admitted listing is refused';
  end if;
  if public.register_layout_listing_ok('sales_orders')
     or public.register_layout_listing_ok('finance_')
     or public.register_layout_listing_ok('finance_Bills')
     or public.register_layout_listing_ok('finance-bills')
     or public.register_layout_listing_ok('finance_bills;')
     or public.register_layout_listing_ok('finance_' || repeat('a', 61))
     or public.register_layout_listing_ok(null) then
    raise exception '0704: a listing outside purchase_orders and finance_* is admitted';
  end if;

  -- The door asks the answer, and no longer the closed list of one.
  select prosrc into v_src from pg_proc
   where oid = 'public.register_layout_save(text,text,jsonb)'::regprocedure;
  if position('register_layout_listing_ok(p_listing)' in v_src) = 0
     or position('is distinct from ''purchase_orders''' in v_src) > 0 then
    raise exception '0704: register_layout_save does not ask register_layout_listing_ok';
  end if;
  if not (select prosecdef from pg_proc where oid = 'public.register_layout_save(text,text,jsonb)'::regprocedure) then
    raise exception '0704: register_layout_save is no longer security definer';
  end if;

  -- The table's check asks the same answer.
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'public.register_personal_layouts'::regclass
     and conname = 'register_personal_layouts_listing_check';
  if v_def is null or position('register_layout_listing_ok' in v_def) = 0 then
    raise exception '0704: the listing check does not ask register_layout_listing_ok';
  end if;

  -- Grants unchanged: signed out cannot call either door, signed in can.
  if has_function_privilege('anon', 'public.register_layout_save(text,text,jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.register_layout_set_default(uuid)', 'EXECUTE') then
    raise exception '0704: anon can execute a layout door';
  end if;
  if not has_function_privilege('authenticated', 'public.register_layout_save(text,text,jsonb)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.register_layout_set_default(uuid)', 'EXECUTE') then
    raise exception '0704: authenticated cannot execute a layout door';
  end if;
end;
$sanity_0704$;

commit;

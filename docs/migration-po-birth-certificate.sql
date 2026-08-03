-- ============================================================================
-- THE PO'S BIRTH CERTIFICATE                          approved by Loo 2026-08-03
-- ============================================================================
--
-- ⚠ HOW TO APPLY (read before pasting)
--
--   1. Read the migration tracker's TAIL first. Number this file with the next
--      number the TRACKER shows — never `ls supabase/migrations`. The live tail
--      has been ahead of the repo before (0301 / 0302).
--   2. Paste this WHOLE file into the Supabase SQL editor and run it once.
--      It is idempotent (`if not exists` / `create or replace`) and the sanity
--      block at the end aborts the whole thing if anything is off.
--   3. Run the VERIFY queries at the bottom and check every line.
--   4. Only THEN does the application code merge and deploy. Shipping code
--      whose column does not exist 500s the whole Purchasing page.
--
-- WHY THIS EXISTS
--
--   A purchase order must be born carrying what the rest of the module reads.
--   Measured 2026-08-03: `purchasing_record_tomorrow_delivery` (0306, shipped)
--   raises `no_expected_arrival` when `purchase_orders.eta_date` is NULL, and
--   nothing has ever written `eta_date` on a PO created from To Order — so a
--   built, deployed supplier call can never open. This is the key.
--
-- THE DESIGN DECISION THIS ENCODES
--
--   eta_date             OUR prediction  — engine, stamped at Issue, then frozen
--   expected_ready_date  THEIR promise   — a human, only after the supplier answers
--
--   They are never merged and the engine may never write the second one:
--   R5's supplier scorecard grades a factory by `expected_ready_date`, so
--   seeding it with our own estimate would grade the factory on a number the
--   factory never gave. An empty `expected_ready_date` is not missing data —
--   it is the trigger of `Confirm ready date` (PURCHASING-WORKING-FLOW §3).
--
--   NO BACKFILL, on purpose. Every row in the database is test data, and an
--   `eta_date` invented for an old PO is a guess presented as a measurement.
-- ============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1 · Transit days — the eighth purchasing number, per supplier
--
-- It goes on `purchasing_supplier_settings` (0303), which is already THE
-- per-supplier settings table. No new table. Every existing row takes 1 from
-- the default, so nothing is seeded and nothing moves on apply.
-- ---------------------------------------------------------------------------
alter table public.purchasing_supplier_settings
  add column if not exists transit_days int not null default 1
    check (transit_days between 0 and 60);

comment on column public.purchasing_supplier_settings.transit_days is
  'WORKING days between the supplier finishing production and the goods reaching the destination. Seeded 1 for every supplier (both factories are local — Nice Future is collected by NETS, Ohana delivers). It is a SETTING because P1 proved a hard-coded purchasing number is how a setting silently stops mattering.';

-- The setter — a copy of purchasing_set_supplier_work_week (0303). Same gate,
-- same audit trail, same shape. Nothing new is invented.
create or replace function public.purchasing_set_supplier_transit_days(
  p_supplier_id uuid,
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
  if p_days is null or p_days < 0 or p_days > 60 then
    raise exception 'transit_days_out_of_range' using errcode = '22023';
  end if;
  if not exists (select 1 from suppliers where id = p_supplier_id) then
    raise exception 'unknown_supplier' using errcode = '22023';
  end if;

  select transit_days into v_old
    from purchasing_supplier_settings where supplier_id = p_supplier_id;
  select name into v_name from suppliers where id = p_supplier_id;

  insert into purchasing_supplier_settings (supplier_id, transit_days, updated_by, updated_at)
  values (p_supplier_id, p_days, auth.uid(), now())
  on conflict (supplier_id) do update
    set transit_days = excluded.transit_days,
        updated_by   = excluded.updated_by,
        updated_at   = now();

  perform purchasing_record_change(
    v_role, 'supplier_transit_days', p_supplier_id, null,
    v_old::text, p_days::text,
    format('Purchasing setting · %s transit days %s -> %s',
           v_name, coalesce(v_old::text, '-'), p_days::text));
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2 · The promise ledger takes a THIRD kind
--
-- 0306 froze two kinds and the P5 card predicted this one: "the `kind` takes a
-- third value and the RPC is a copy of purchasing_record_tomorrow_delivery."
--
-- The two column checks are inline and therefore auto-named. They are dropped
-- by name and replaced with NAMED constraints, so the next chat can find them.
-- ---------------------------------------------------------------------------
alter table public.po_supplier_promises
  drop constraint if exists po_supplier_promises_kind_check,
  drop constraint if exists po_supplier_promises_answer_check,
  drop constraint if exists po_promise_kind_answer,
  drop constraint if exists po_promise_scope;

alter table public.po_supplier_promises
  add constraint po_promise_kind_allowed check (
    kind in ('tomorrow_delivery','balance_delivery','ready_date')),
  add constraint po_promise_answer_allowed check (
    answer in ('shipping','delayed','balance_date','ready_date')),
  -- Each kind may only carry its own answers (0306's rule, extended).
  add constraint po_promise_kind_answer check (
    (kind = 'tomorrow_delivery' and answer in ('shipping','delayed')) or
    (kind = 'balance_delivery'  and answer = 'balance_date') or
    (kind = 'ready_date'        and answer = 'ready_date')),
  -- A PO-level answer names no line; a line answer names the line and the
  -- quantity it was about. `ready_date` is PO-level, and its `about_date` may
  -- be NULL because the FIRST answer is about no previous date at all — which
  -- is exactly the state the action exists to end.
  add constraint po_promise_scope check (
    (kind = 'tomorrow_delivery' and po_line_id is null
       and about_date is not null and about_qty is null) or
    (kind = 'balance_delivery'  and po_line_id is not null
       and about_qty  is not null) or
    (kind = 'ready_date'        and po_line_id is null
       and about_qty  is null));

-- `po_promise_new_date_required` is untouched and already covers `ready_date`:
-- the answer is not 'shipping', so `new_date` must be present.

-- ---------------------------------------------------------------------------
-- 3 · The write door for the supplier's promised ready date
--
-- `Confirm ready date` has been a live action with NO button in the portal
-- since it was written: no route anywhere writes `expected_ready_date`
-- (measured 2026-08-03). This is that button's server half.
-- ---------------------------------------------------------------------------
create or replace function public.purchasing_record_ready_date(
  p_po_id    text,
  p_new_date date,
  p_reason   text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid  uuid;
  v_po   purchase_orders;
  v_prev date;
begin
  perform public.purchasing_supplier_call_gate();
  v_uid := auth.uid();

  if p_po_id is null or p_new_date is null then
    raise exception 'p_po_id and p_new_date are required'
      using errcode = '22023', detail = 'invalid_input';
  end if;

  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'PO % not found', p_po_id
      using errcode = '42P01', detail = 'po_not_found';
  end if;
  if v_po.status <> 'open' then
    raise exception 'PO % is %', p_po_id, v_po.status
      using errcode = 'P0001', detail = 'po_not_open';
  end if;

  v_prev := v_po.expected_ready_date;

  -- Append, never overwrite. §3's "every promise is kept" is STRUCTURAL here
  -- because this table has no date column anybody can update.
  insert into po_supplier_promises
    (po_id, kind, answer, about_date, previous_date, new_date, reason, recorded_by)
  values
    (p_po_id, 'ready_date', 'ready_date', v_prev, v_prev, p_new_date,
     nullif(btrim(coalesce(p_reason, '')), ''), v_uid);

  -- The column carries the CURRENT answer, so a screen drawing one cell does
  -- not have to read a ledger. The ledger stays the history.
  update purchase_orders
     set expected_ready_date = p_new_date, updated_at = now()
   where id = p_po_id;

  insert into po_history (po_id, text, by_role, by_user_id)
  values (p_po_id,
          format('Supplier ready date %s -> %s',
                 coalesce(v_prev::text, '-'), p_new_date::text),
          public.app_role(), v_uid);

  return jsonb_build_object(
    'po_id', p_po_id, 'previous_date', v_prev, 'new_date', p_new_date);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 4 · Grants — BOTH directions, or they prove nothing
--
-- `revoke … from public` alone does NOT drop `anon` on Supabase, and
-- `from anon` alone leaves `public` in place. Assert both after apply.
-- ---------------------------------------------------------------------------
revoke all on function public.purchasing_set_supplier_transit_days(uuid, int) from public;
revoke all on function public.purchasing_set_supplier_transit_days(uuid, int) from anon;
revoke all on function public.purchasing_record_ready_date(text, date, text) from public;
revoke all on function public.purchasing_record_ready_date(text, date, text) from anon;

grant execute on function public.purchasing_set_supplier_transit_days(uuid, int) to authenticated;
grant execute on function public.purchasing_record_ready_date(text, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5 · Sanity — this ABORTS the migration rather than shipping a lie
-- ---------------------------------------------------------------------------
do $$
declare
  v_n  int;
  v_ok boolean := false;
begin
  -- the column exists on every supplier row and nothing is NULL
  select count(*) into v_n
    from public.purchasing_supplier_settings where transit_days is null;
  if v_n > 0 then
    raise exception 'SANITY: transit_days left % NULL row(s)', v_n;
  end if;

  -- exactly ONE function in the database may write expected_ready_date
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosrc like '%expected_ready_date =%';
  if v_n <> 1 then
    raise exception 'SANITY: expected exactly 1 writer of expected_ready_date, found %', v_n;
  end if;

  -- the third kind passes the checks (the FK is what stops it, nothing else).
  -- NOTE: the flag is set OUTSIDE the handler — an assertion that RAISEs inside
  -- its own EXCEPTION block catches itself and proves nothing (guardrail #4).
  begin
    insert into public.po_supplier_promises (po_id, kind, answer, new_date)
    values ('__sanity_never_exists__', 'ready_date', 'ready_date', current_date);
  exception
    when foreign_key_violation then v_ok := true;   -- checks passed, FK refused
    when check_violation       then v_ok := false;  -- a check refused: WRONG
  end;
  if not v_ok then
    raise exception 'SANITY: a ready_date row was refused by a CHECK, not by the FK';
  end if;

  raise notice 'SANITY OK — transit_days present, one ready-date writer, third kind accepted.';
end $$;

-- ============================================================================
-- VERIFY — run these AFTER the migration, check every line, before any deploy
-- ============================================================================
--
-- a) the column, and that nothing moved
--    select count(*) as suppliers, min(transit_days) as lo, max(transit_days) as hi
--      from purchasing_supplier_settings;
--    -- expect: every supplier, lo = hi = 1
--
-- b) the constraints — 5 named, 0 auto-named leftovers
--    select conname from pg_constraint
--     where conrelid = 'public.po_supplier_promises'::regclass and contype = 'c'
--     order by conname;
--    -- expect exactly: po_promise_answer_allowed · po_promise_kind_allowed ·
--    --                 po_promise_kind_answer · po_promise_new_date_required ·
--    --                 po_promise_scope
--
-- c) the two functions exist, and reconcile BYTE-IDENTICAL to this file
--    select proname, length(prosrc) as len, md5(prosrc) as md5
--      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public'
--       and proname in ('purchasing_set_supplier_transit_days',
--                       'purchasing_record_ready_date');
--
-- d) grants — BOTH directions asserted
--    select p.proname,
--           has_function_privilege('anon',          p.oid, 'execute') as anon,
--           has_function_privilege('authenticated', p.oid, 'execute') as auth
--      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public'
--       and proname in ('purchasing_set_supplier_transit_days',
--                       'purchasing_record_ready_date');
--    -- expect: anon = false, auth = true, on BOTH rows
--
-- e) NOTHING was backfilled
--    select count(*) as pos,
--           count(*) filter (where eta_date is not null)            as with_eta,
--           count(*) filter (where expected_ready_date is not null) as with_ready
--      from purchase_orders;
--    select count(*) as promises from po_supplier_promises;
--    -- expect: promises = 0, and the PO counts unchanged from before the run
-- ============================================================================

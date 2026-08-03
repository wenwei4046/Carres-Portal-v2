-- ============================================================================
-- PURCHASE DEMANDS — the manual entrance                 Jess ruling 2026-08-03
-- ============================================================================
--
-- ⚠ HOW TO APPLY
--   1. Read the migration tracker's TAIL and number this file from it — never
--      from `ls supabase/migrations`. The repo tail is 0317 as this is written.
--   2. Paste the whole file into the Supabase SQL editor and run it once.
--      Idempotent; the sanity block aborts everything if anything is off.
--   3. Run the VERIFY queries at the bottom.
--   4. Only THEN does the application code deploy.
--
-- THE RULING THIS IMPLEMENTS, verbatim in effect:
--
--   "Do not build a separate Ready Stock Planning module. Do not build Proposal
--    workflow. Do not build Approval workflow. The current business is simple:
--    Jess decides to buy. Operation executes."
--
--   So there is no proposal table, no approval column, no reviewer, no state
--   machine. A human types a demand and it joins the customer-order demand on
--   To Order the same second.
--
-- WHAT IS DELIBERATELY NOT HERE
--
-- · NO STATUS COLUMN. open / ordered / done are DERIVED from `po_id` — the
--   frozen rule (2026-08-01) and the same discipline that keeps every other
--   purchasing state computed. A stored status is a second truth that drifts.
--
-- · NO PARTIAL QUANTITY. One row = one issue. Upgrade later if the business
--   ever needs it; today it would be a column with no reader.
--
-- · NO `source` / `requested_by_role` / proposal columns, even though Phase 2
--   (Sales Portal) is coming. A column nobody writes is worse than a missing
--   one — that is exactly how `ops_order_control.balance` became a lock
--   reading a NULL for months.
--
--   **A future Sales Portal reaches this data through an APPROVED API /
--   business door, never by reading or writing this table directly.** That is
--   why no column is reserved for it here: the extension point is a new
--   server-side door (and, if the business ever needs one, a proposal table in
--   front of this one), not a field waiting in this schema.
--
-- · V1 HAS EXACTLY ONE PURPOSE: Ready Stock (Jess, 2026-08-03, narrowing her
--   own earlier scope). Display is initiated by the Dealer/Sales portal as a
--   Display Request, and Office by a future internal request workflow — both
--   reach purchasing THROUGH this table, but neither starts here, so neither
--   appears in the dialog, in the door, or as a disabled control anywhere.
--   The CHECK still admits all four because she ruled the ARCHITECTURE keeps
--   them: enabling one later must be a change to the gate above, never a
--   migration on a live table.
--
-- · THE SUPPLIER IS DERIVED FROM THE SKU, never chosen. A product has one
--   factory; asking a human to pick it is asking them to get it wrong.
--
-- · NO free-text item. `sku` references the catalog, so price, history and
--   analytics share one identity. Office purchases are NOT enabled in V1
--   precisely because an office chair is not a SKU and no temporary shape may
--   be invented for it (Jess, 2026-08-03).
-- ============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1 · The table
--
-- PURPOSE vs SOURCE — they are different questions and only one is stored.
--   purpose = WHY we are buying          (ready stock · display · office …)
--   source  = WHO asked for it           (Sales · Operation · System …)
-- V1 stores PURPOSE only. Source belongs to the Phase 2 proposal layer, which
-- does not exist, so it gets no column here.
--
-- The CHECK admits all four purposes because the ARCHITECTURE keeps four (Jess:
-- "keep Office as a planned future purpose"). The WRITE DOOR below admits ONE.
-- That split is the whole point: enabling a purpose later is a change to the
-- gate in one function, never a migration on a live table.
-- ---------------------------------------------------------------------------
create table if not exists public.purchase_demands (
  id             uuid primary key default gen_random_uuid(),

  purpose        text not null
                   check (purpose in ('ready_stock','display','office','warranty')),

  -- The catalog product. Free text is refused by design.
  sku            text not null check (btrim(sku) <> ''),
  supplier_id    uuid not null references public.suppliers(id),

  -- Where the goods go. READ FROM CONFIGURATION, never a hardcoded name, so a
  -- future warehouse (JB, Penang) is a Settings row and not a code change.
  destination_id uuid not null references public.purchasing_destinations(id),

  qty            int  not null check (qty > 0),

  -- NULL = buy it on the next run. A date = the engine plans it, exactly as a
  -- customer order's promised date does.
  required_by    date,
  remark         text,

  -- THE LINK THE STATE IS DERIVED FROM. NULL = still to order.
  po_id          text references public.purchase_orders(id) on delete set null,
  ordered_at     timestamptz,

  -- The ONE stored decision. A cancelled demand stays on the record with its
  -- reason; it is never deleted, because "we decided not to" is a business
  -- fact and a missing row cannot say it.
  cancelled_at   timestamptz,
  cancel_reason  text,

  created_by     uuid references public.app_users(id),
  created_at     timestamptz not null default now(),

  -- A cancellation without a reason is half a record.
  constraint purchase_demands_cancel_pair check (
    (cancelled_at is null and cancel_reason is null)
    or (cancelled_at is not null and btrim(coalesce(cancel_reason,'')) <> '')
  ),
  -- An ordered demand names the purchase order that ordered it.
  constraint purchase_demands_ordered_pair check (
    (po_id is null and ordered_at is null) or (po_id is not null and ordered_at is not null)
  )
);

comment on table public.purchase_demands is
  'Demand a human typed, as opposed to demand computed from customer orders (Jess, 2026-08-03). READY STOCK ONLY in V1 — Display begins at the Dealer/Sales portal and Office at a future internal request workflow, and both are in the CHECK because the architecture keeps them while the write door admits neither. The supplier is DERIVED from the SKU, never chosen. No status column: open/ordered/done derive from po_id. No proposal and no approval layer, because today one person decides and Operation executes.';

create index if not exists purchase_demands_open_idx
  on public.purchase_demands (supplier_id)
  where po_id is null and cancelled_at is null;

alter table public.purchase_demands enable row level security;

-- Read = internal. NO insert/update/delete policy at all, so PostgREST cannot
-- write one by hand; every write goes through the two DEFINER doors below.
drop policy if exists purchase_demands_read on public.purchase_demands;
create policy purchase_demands_read on public.purchase_demands
  for select to authenticated
  using ( (select public.is_internal()) );

grant select on public.purchase_demands to authenticated;
revoke insert, update, delete on public.purchase_demands from public;
revoke insert, update, delete on public.purchase_demands from anon;
revoke insert, update, delete on public.purchase_demands from authenticated;

-- ---------------------------------------------------------------------------
-- 2 · The write door
--
-- V1 ADMITS `ready_stock` AND NOTHING ELSE (Jess, 2026-08-03). Display starts
-- at the Dealer/Sales portal as a Display Request and Office at a future
-- internal request workflow; both will arrive HERE, but neither begins here.
-- The refusal is NAMED (`purpose_not_enabled`) rather than the value being
-- absent, so the day one is approved this gate is the only thing that changes.
-- ---------------------------------------------------------------------------
create or replace function public.purchasing_create_demand(
  p_sku            text,
  p_qty            int,
  p_destination_id uuid,
  p_required_by    date default null,
  p_remark         text default null,
  -- Defaulted, and V1 accepts nothing else. It is a parameter rather than a
  -- hardcoded literal so that enabling Display or Office later is a change to
  -- this function's GATE and never a signature change — adding a parameter to
  -- a live RPC creates a second signature, which is guardrail #8's own lesson.
  p_purpose        text default 'ready_stock'
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role     app_role;
  v_supplier uuid;
  v_id       uuid;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  if p_purpose <> 'ready_stock' then
    raise exception 'purpose % is not available yet', p_purpose
      using errcode = '22023', detail = 'purpose_not_enabled';
  end if;
  if p_qty is null or p_qty < 1 then
    raise exception 'qty must be at least 1' using errcode = '22023', detail = 'invalid_qty';
  end if;

  -- THE SUPPLIER IS DERIVED, NEVER CHOSEN (Jess, 2026-08-03). A product has
  -- exactly one factory; asking a human to pick one is asking them to get it
  -- wrong, and a demand pointed at the wrong factory becomes a purchase order
  -- pointed at the wrong factory.
  select supplier_id into v_supplier from product_skus where sku = p_sku;
  if not found then
    raise exception 'unknown sku %', p_sku using errcode = '22023', detail = 'unknown_sku';
  end if;
  if v_supplier is null then
    -- Not silently defaulted: a SKU nobody has mapped is a configuration hole
    -- and the operator must see it, not inherit a guess (P1's law).
    raise exception 'sku % has no supplier', p_sku
      using errcode = '22023', detail = 'sku_has_no_supplier';
  end if;

  if not exists (
    select 1 from purchasing_destinations where id = p_destination_id and active
  ) then
    raise exception 'unknown destination' using errcode = '22023', detail = 'unknown_destination';
  end if;

  insert into purchase_demands
    (purpose, sku, supplier_id, destination_id, qty, required_by, remark, created_by)
  values
    (p_purpose, p_sku, v_supplier, p_destination_id, p_qty, p_required_by,
     nullif(btrim(coalesce(p_remark,'')), ''), auth.uid())
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'supplier_id', v_supplier);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 3 · Cancelling one
--
-- The ONE stored decision on this table. A demand already on a purchase order
-- cannot be cancelled here: the goods are ordered, and stopping them is the
-- purchase order's own business (flow §9 — stopping is the whole PO).
-- ---------------------------------------------------------------------------
create or replace function public.purchasing_cancel_demand(
  p_id     uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role app_role;
  v_d    purchase_demands;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if btrim(coalesce(p_reason,'')) = '' then
    raise exception 'a reason is required' using errcode = '22023', detail = 'reason_required';
  end if;

  select * into v_d from purchase_demands where id = p_id for update;
  if not found then
    raise exception 'demand not found' using errcode = '42P01', detail = 'not_found';
  end if;
  if v_d.po_id is not null then
    raise exception 'already on purchase order %', v_d.po_id
      using errcode = 'P0001', detail = 'already_ordered';
  end if;
  if v_d.cancelled_at is not null then
    raise exception 'already cancelled' using errcode = 'P0001', detail = 'already_cancelled';
  end if;

  update purchase_demands
     set cancelled_at = now(), cancel_reason = btrim(p_reason)
   where id = p_id;

  return jsonb_build_object('id', p_id);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 4 · Grants — both directions, or they prove nothing
-- ---------------------------------------------------------------------------
revoke all on function public.purchasing_create_demand(text, int, uuid, date, text, text) from public;
revoke all on function public.purchasing_create_demand(text, int, uuid, date, text, text) from anon;
revoke all on function public.purchasing_cancel_demand(uuid, text) from public;
revoke all on function public.purchasing_cancel_demand(uuid, text) from anon;

grant execute on function public.purchasing_create_demand(text, int, uuid, date, text, text) to authenticated;
grant execute on function public.purchasing_cancel_demand(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5 · Sanity — aborts the migration rather than shipping a lie
-- ---------------------------------------------------------------------------
do $$
declare v_n int; v_def text;
begin
  -- NOTHING IN THIS BLOCK WRITES A ROW. The first draft proved the CHECK by
  -- attempting an insert and reading the failure — which is only safe if the
  -- whole file runs inside a transaction, and a migration runner that does not
  -- wrap it would leave a probe row behind or abort half-applied. Every
  -- assertion below reads the CATALOGUE instead, so the proof costs nothing and
  -- depends on no rollback.

  -- born empty; nothing is ever backfilled
  select count(*) into v_n from purchase_demands;
  if v_n <> 0 then raise exception 'SANITY: purchase_demands is not empty (%)', v_n; end if;

  -- NO write policy exists — the two DEFINER functions are the only doors
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'purchase_demands' and cmd <> 'SELECT';
  if v_n <> 0 then raise exception 'SANITY: % write policy(ies) on purchase_demands', v_n; end if;

  -- the ARCHITECTURE keeps four purposes even though the door admits one
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conrelid = 'public.purchase_demands'::regclass
     and conname = 'purchase_demands_purpose_check';
  if v_def is null then
    select pg_get_constraintdef(c.oid) into v_def
      from pg_constraint c
     where c.conrelid = 'public.purchase_demands'::regclass
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) like '%ready_stock%';
  end if;
  if v_def is null or v_def not like '%office%' or v_def not like '%display%' then
    raise exception 'SANITY: the purpose CHECK must keep the future purposes — they are disabled in the DOOR, not the schema';
  end if;

  -- both functions exist and neither is callable by anon
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('purchasing_create_demand','purchasing_cancel_demand')
     and has_function_privilege('anon', p.oid, 'execute');
  if v_n <> 0 then raise exception 'SANITY: % function(s) still executable by anon', v_n; end if;

  raise notice 'SANITY OK — empty, no write policy, four purposes in the schema, anon locked out.';
end $$;

-- ============================================================================
-- VERIFY — run after, check every line, before any deploy
-- ============================================================================
-- a) select count(*) from purchase_demands;                       -- expect 0
-- b) select cmd, policyname from pg_policies
--     where tablename = 'purchase_demands';                       -- expect SELECT only
-- c) select p.proname,
--           has_function_privilege('anon',          p.oid, 'execute') as anon,
--           has_function_privilege('authenticated', p.oid, 'execute') as auth
--      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public'
--       and p.proname in ('purchasing_create_demand','purchasing_cancel_demand');
--    -- expect anon = false, auth = true, on BOTH rows
-- d) select conname from pg_constraint
--     where conrelid = 'public.purchase_demands'::regclass and contype = 'c'
--     order by 1;   -- expect the two named pairs + the three column checks
-- ============================================================================

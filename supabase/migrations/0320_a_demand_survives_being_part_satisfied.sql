-- ============================================================================
-- A DEMAND SURVIVES BEING PART SATISFIED                  Loo ruling 2026-08-04
-- ============================================================================
--
-- ⚠ HOW TO APPLY
--   1. Number read from the TRACKER TAIL, never from `ls` (rule 17). The tail
--      on 2026-08-04 is `20260803105141 · 0317_the_record_stops_claiming_a_send`
--      — and 0318 and 0319 are APPLIED AND ABSENT FROM IT, because both were
--      run through the SQL editor rather than the mechanism. So the tracker
--      alone would hand out 0318 and collide with two live sets of objects.
--      The number is the MAX of (tracker tail, repository tail, every branch),
--      all three measured: 0317 · 0319 · 0319 → this file is 0320.
--   2. Paste the whole file into the Supabase SQL editor and run it once.
--      Idempotent; the sanity block aborts everything if anything is off.
--   3. Run the VERIFY queries at the bottom.
--   4. Only THEN does the application code deploy.
--
-- THE RULING THIS IMPLEMENTS (Loo, 2026-08-04, card P8):
--
--   "Build the store able to say `issued` and `remaining` from day one."
--
-- 0319 froze the opposite — *"NO PARTIAL QUANTITY. One row = one issue.
-- Upgrade later if the business ever needs it"* — and that sentence was written
-- on 2026-08-03 as the frozen §0A rule. Loo ruled on 2026-08-04 that the
-- business needs it: a demand's quantity FALLS when ready stock is taken
-- (card P10), so a row must survive being partly satisfied. The owner rule
-- applies; the older text does not outrank him. Adding these later would mean a
-- migration on a live table plus a rewrite of every reader.
--
-- ONE WRITABLE COUNTER, AND THE OTHER NUMBER IS DERIVED.
--
--   issued_qty     — how much of this demand has stopped being something to
--                    buy. WRITABLE, and only through the door below.
--   remaining_qty  — GENERATED (qty - issued_qty). It is a real column so the
--                    index and every reader can use it, and it is generated so
--                    it structurally CANNOT disagree with the counter. Two
--                    stored numbers that must agree is the whole disease this
--                    repo keeps paying for.
--
-- `issued_qty` COUNTS UNITS THAT LEFT THE DEMAND, WHATEVER TOOK THEM — a
-- purchase order today, a ready-stock take when P10 lands. It deliberately does
-- NOT split by cause, because the cause is already recorded where the act
-- happened: a purchase order line says what was ordered, and K4's pool-draw
-- ledger (0292/0294) says what was drawn and why. Splitting it here would be a
-- second telling of a fact that already has a home, and it would make P10 alter
-- the generated expression on a live table — the exact cost this card exists to
-- avoid.
--
-- WHAT IS DELIBERATELY NOT HERE
--
-- · NO STATUS COLUMN, still. open / ordered / done stay DERIVED — and the
--   derivation gets SHARPER, not weaker: "still to buy" is now `remaining_qty
--   > 0`, which is true of a partly satisfied row where `po_id is null` was
--   not.
--
-- · `purchasing_cancel_demand` IS NOT TOUCHED, and that is a decision rather
--   than an oversight. Its gate refuses a demand that is already on a purchase
--   order. Once P10 can satisfy part of a demand from stock, "may the operator
--   cancel the REMAINDER of a demand that was partly ordered?" becomes a real
--   business question with two defensible answers, and it is Loo's, not this
--   migration's. Today the two readings are indistinguishable — the issue path
--   always takes the whole demand, so `po_id is not null` and `issued_qty > 0`
--   are the same set. Reported in card P8, not quietly decided here.
--
-- · NO BACKFILL, and none is possible: `issued_qty` starts at 0 and the one
--   live demand (SONIC-S, qty 5, never ordered) is correctly 0 of 5 issued.
-- ============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1 · The two numbers
-- ---------------------------------------------------------------------------
alter table public.purchase_demands
  add column if not exists issued_qty int not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.purchase_demands'::regclass
       and conname = 'purchase_demands_issued_within_qty'
  ) then
    -- Over-issue is refused by the TABLE, not only by the door. A door can be
    -- bypassed by a future second door; a CHECK cannot.
    alter table public.purchase_demands
      add constraint purchase_demands_issued_within_qty
      check (issued_qty >= 0 and issued_qty <= qty);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'purchase_demands'
       and column_name = 'remaining_qty'
  ) then
    alter table public.purchase_demands
      add column remaining_qty int
        generated always as (qty - issued_qty) stored;
  end if;
end $$;

comment on column public.purchase_demands.issued_qty is
  'Units of this demand that have stopped being something to buy — ordered on a purchase order today, taken from ready stock when card P10 lands (Loo, 2026-08-04). It does not split by cause: a purchase order line already says what was ordered and K4''s pool-draw ledger already says what was drawn and why. Writable ONLY through purchasing_demand_record_issue.';

comment on column public.purchase_demands.remaining_qty is
  'What is still to buy. GENERATED from qty - issued_qty, so it can be indexed and read like a column and can never disagree with the counter it comes from.';

-- ---------------------------------------------------------------------------
-- 2 · "Still to buy" stops meaning "has no purchase order"
--
-- The old predicate (`po_id is null`) reads a partly satisfied demand as
-- finished, which is precisely the row this card exists to keep alive.
-- ---------------------------------------------------------------------------
drop index if exists purchase_demands_open_idx;
create index if not exists purchase_demands_open_idx
  on public.purchase_demands (supplier_id)
  where remaining_qty > 0 and cancelled_at is null;

-- ---------------------------------------------------------------------------
-- 3 · The door the quantity moves through
--
-- 0316 ruled that a purchase order line's quantities are RPC-only, for a reason
-- that applies here word for word: a quantity a client can PATCH is a quantity
-- that moves with no record, no arithmetic and no guard. `purchase_demands` has
-- no write policy at all, so PostgREST cannot reach it — this function is the
-- issue path's only way to move the number, and it is where the arithmetic and
-- the double-order claim live together.
--
-- IT IS ADDITIVE, NEVER ABSOLUTE. `p_qty` is how many units this act took, not
-- what the total becomes: two acts on one demand must add up, and a caller that
-- computes the new total has to read the old one first, which is a race.
-- ---------------------------------------------------------------------------
create or replace function public.purchasing_demand_record_issue(
  p_id    uuid,
  p_qty   int,
  p_po_id text default null
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
  if p_qty is null or p_qty < 1 then
    raise exception 'qty must be at least 1' using errcode = '22023', detail = 'invalid_qty';
  end if;

  -- FOR UPDATE, so two operators pressing Issue in the same second queue rather
  -- than both reading `issued_qty = 0` and both writing 2.
  select * into v_d from purchase_demands where id = p_id for update;
  if not found then
    raise exception 'demand not found' using errcode = '42P01', detail = 'not_found';
  end if;
  if v_d.cancelled_at is not null then
    raise exception 'demand is cancelled' using errcode = 'P0001', detail = 'already_cancelled';
  end if;
  if v_d.issued_qty + p_qty > v_d.qty then
    -- NAMED, and it carries both numbers: "taking twice cannot over-draw" is
    -- the property, and an operator who meets it must be told what is actually
    -- left rather than that something went wrong.
    raise exception 'demand % has only % left, cannot take %',
      p_id, v_d.qty - v_d.issued_qty, p_qty
      using errcode = 'P0001', detail = 'over_issue';
  end if;

  update purchase_demands
     set issued_qty = issued_qty + p_qty,
         -- The FIRST purchase order to take part of this demand keeps the link;
         -- a second one does not overwrite it. The link is a pointer to where
         -- the goods went first, and `purchase_order_lines` is the full record.
         po_id      = coalesce(po_id, p_po_id),
         ordered_at = case
                        when po_id is null and p_po_id is not null then now()
                        else ordered_at
                      end
   where id = p_id;

  select * into v_d from purchase_demands where id = p_id;
  return jsonb_build_object(
    'id',        p_id,
    'issued',    v_d.issued_qty,
    'remaining', v_d.remaining_qty
  );
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 4 · Grants — both directions, or they prove nothing
-- ---------------------------------------------------------------------------
revoke all on function public.purchasing_demand_record_issue(uuid, int, text) from public;
revoke all on function public.purchasing_demand_record_issue(uuid, int, text) from anon;
grant execute on function public.purchasing_demand_record_issue(uuid, int, text) to authenticated;

-- The generated column is computed by the database; nobody may be granted the
-- right to write it, and Postgres refuses the attempt outright. Stated so the
-- next reader does not go looking for the grant that is missing.

-- ---------------------------------------------------------------------------
-- 5 · Sanity — aborts the migration rather than shipping a lie
--
-- NOTHING IN THIS BLOCK WRITES A ROW (0319's own discipline). Every assertion
-- reads the CATALOGUE, so the proof costs nothing and depends on no rollback.
-- The ARITHMETIC is proved separately, in a rolled-back transaction against
-- production, because proving it here would mean writing a probe row into a
-- table that is now live.
-- ---------------------------------------------------------------------------
do $$
declare v_n int; v_txt text;
begin
  -- remaining_qty is GENERATED. If it were an ordinary column this whole design
  -- becomes two stored numbers that must agree — the thing it exists to avoid.
  select is_generated into v_txt
    from information_schema.columns
   where table_schema = 'public' and table_name = 'purchase_demands'
     and column_name = 'remaining_qty';
  if v_txt is distinct from 'ALWAYS' then
    raise exception 'SANITY: remaining_qty must be GENERATED, not stored by hand (is_generated = %)', coalesce(v_txt, '<missing>');
  end if;

  -- The over-issue refusal is on the TABLE, not only in the door.
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.purchase_demands'::regclass
       and conname = 'purchase_demands_issued_within_qty'
  ) then
    raise exception 'SANITY: the issued_qty <= qty CHECK is missing';
  end if;

  -- STILL no write policy: the DEFINER doors remain the only way in.
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'purchase_demands' and cmd <> 'SELECT';
  if v_n <> 0 then raise exception 'SANITY: % write policy(ies) on purchase_demands', v_n; end if;

  -- The open-demand index reads the REMAINDER, not the purchase order link.
  select pg_get_indexdef(indexrelid) into v_txt
    from pg_index i join pg_class c on c.oid = i.indexrelid
   where c.relname = 'purchase_demands_open_idx';
  if v_txt is null or v_txt not like '%remaining_qty%' then
    raise exception 'SANITY: purchase_demands_open_idx still keys on the old predicate (%)', coalesce(v_txt, '<missing>');
  end if;

  -- The new door is not callable by anon.
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'purchasing_demand_record_issue'
     and has_function_privilege('anon', p.oid, 'execute');
  if v_n <> 0 then raise exception 'SANITY: purchasing_demand_record_issue is executable by anon'; end if;

  -- Exactly ONE signature. A second overload is guardrail #8's own lesson.
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'purchasing_demand_record_issue';
  if v_n <> 1 then raise exception 'SANITY: % copies of purchasing_demand_record_issue', v_n; end if;

  -- No live demand may come out of this migration mis-stated.
  select count(*) into v_n from purchase_demands
   where issued_qty <> 0 or remaining_qty <> qty;
  if v_n <> 0 then
    raise exception 'SANITY: % existing demand(s) did not come through with issued 0 / remaining = qty', v_n;
  end if;

  raise notice 'SANITY OK — remaining is generated, over-issue is a CHECK, no write policy, the index reads the remainder, one door, anon locked out.';
end $$;

-- ============================================================================
-- VERIFY — run after, check every line, before any deploy
-- ============================================================================
-- a) select qty, issued_qty, remaining_qty from purchase_demands;
--    -- expect issued 0 and remaining = qty on every row
-- b) select column_name, is_generated, generation_expression
--      from information_schema.columns
--     where table_name = 'purchase_demands'
--       and column_name in ('issued_qty','remaining_qty');
--    -- expect issued_qty NEVER, remaining_qty ALWAYS with (qty - issued_qty)
-- c) select pg_get_indexdef(indexrelid) from pg_index i
--      join pg_class c on c.oid = i.indexrelid
--     where c.relname = 'purchase_demands_open_idx';
--    -- expect the predicate to read remaining_qty > 0
-- d) select has_function_privilege('anon','public.purchasing_demand_record_issue(uuid,int,text)','execute') as anon,
--           has_function_privilege('authenticated','public.purchasing_demand_record_issue(uuid,int,text)','execute') as auth;
--    -- expect anon = false, auth = true
-- e) select cmd, policyname from pg_policies where tablename = 'purchase_demands';
--    -- expect SELECT only, unchanged
-- ============================================================================

-- 0548_a_purchase_return_names_its_claim_and_every_unit_it_sends_back.sql
--
-- ⭐ PURCHASE RETURNS — the document Purchasing owns.
-- `docs/purchasing/MASTER.md` §7.4 and §9.6 (owner-confirmed 2026-09-18).
--
-- §9.6 confirmed the REGISTER. A register reads rows, and until this file there
-- was nowhere for a purchase return to be a row: the page had its approved
-- layout and no storage under it. This is that storage, and nothing else.
--
-- ── WHAT THIS FILE DOES NOT DO ──────────────────────────────────────────────
--
-- IT MOVES NO STOCK. §7.4 is explicit — *"Issuing the document does not move
-- custody. Exact-Unit scan/count, actual collector, time and handover proof
-- create the Stock consequence."* So no `ops_stock_items` row is written,
-- updated or read for a decision anywhere in this file. The Claim authorises,
-- Purchasing issues the paper, and Stock proves the physical act. Three owners,
-- and this file is the middle one only (ERP-ARCHITECTURE law A).
--
-- IT DERIVES NO CONSEQUENCE. `packages/shared/src/supplier-claim.ts` records
-- that `f(Resolution, Execution)` is computable but NOT RULED, and that a
-- screen which guessed would be wrong with a screen's authority. Nothing here
-- guesses it: the return is created because a human asked for one against a
-- claim whose Carres Execution already says `Return to Supplier`, and no stock,
-- finance or demand move follows from it.
--
-- IT TOUCHES NO FINANCE. §9.6: no Finance, no Credit Consequence. A supplier
-- credit note is Finance's own subject and 0288 already ruled that a claim
-- never produces one.
--
-- ── THE THREE RULES THE SHAPE ENFORCES ──────────────────────────────────────
--
--   1 · NO BLANK `+ New`. §9.6 and §7.4 both say a return exists only after an
--       approved claim/outcome. `supplier_claim_id` is NOT NULL, so a document
--       with no authorising claim cannot be stored at all — the rule is in the
--       column, not in a screen that could be bypassed.
--
--   2 · ONE TRACKED UNIT PER ROW, QTY 1. §9.6: *"never combine two physical
--       Units into one evidence row."* `purchase_return_units` therefore
--       carries NO quantity column. A quantity column is the door through
--       which two Units eventually share one row, and one shared row means one
--       set of pickup photos standing for two pieces of furniture nobody can
--       tell apart. The document's Qty is `count(*)` and cannot disagree with
--       its Units (ERP-ARCHITECTURE law D: one arithmetic).
--
--   3 · A DAMAGE PHOTO IS NEVER PICKUP PROOF. §9.6 separates three evidence
--       purposes and forbids relabelling one as another. `Problem evidence`
--       belongs to the CLAIM and is read from it, so this table's `evidence`
--       may only hold `pickup` and `receipt` — enforced by CHECK. There is no
--       way to file a damage photo here and have it counted as proof the goods
--       left.
--
-- ── AND UNKNOWN FACTS STAY UNKNOWN ──────────────────────────────────────────
--
-- §9.6: *"Unknown facts remain explicitly unrecorded; never fabricate dates,
-- collectors or receipt evidence."* Every fact that is not known at issue time
-- is NULLABLE and has NO DEFAULT: `confirmed_pickup_date`, `collected_by`,
-- `actual_pickup_date`, `supplier_received_date`. A `default now()` on any of
-- them would make the database invent the exact fact the owner said never to
-- invent. `return_to` is likewise recorded, never derived from the supplier's
-- registered address — §9.6 calls an assumed address out by name.
--
-- Live state when this was written: the two tables are NEW, so nothing existing
-- can violate any constraint here and no row is backfilled. Red line 8 — this
-- file asserts no production row count.
--
-- Numbering: measured when written AND AGAIN IMMEDIATELY BEFORE THE PUSH, which
-- is what ENGINEERING.md §"Migration tail" tells the next writer to do and what
-- caught nothing this time only because the answer did not move. At the second
-- measurement `0546` and `0547` had merged to `main`, so the repository tail
-- and the MAX across EVERY branch were both 0547 and nothing claimed 0548. The
-- applied tracker lags the repository — a tracker row exists only after a file
-- applies — so MAX of the three is 0547 and this is 0548. `pnpm ci:migrations`
-- catches a same-number collision if one lands between this push and the merge.

begin;

-- ── 1 · the document ─────────────────────────────────────────────────────────

create sequence if not exists public.purchase_returns_no_seq start with 1001;

create table if not exists public.purchase_returns (
  id                 uuid primary key default gen_random_uuid(),

  -- §9.6: *"Visible purchase-return references use `PR-`, not `PRTN-`."* This
  -- table is NEW, so the confirmed prefix is what it is born with and no stored
  -- identifier anywhere is migrated. The shape follows the module's other
  -- documents (`MPR-YYYYMMDD-RRRR`, `GRN-YYYYMMDD-NNNN`): the date a reader can
  -- scan, then the sequence that makes it unique.
  pr_no              text not null unique
                       default ('PR-' || to_char(now() at time zone 'Asia/Kuala_Lumpur', 'YYYYMMDD')
                                || '-' || nextval('public.purchase_returns_no_seq')),

  -- ⭐ RULE 1 — NOT NULL is the "no blank + New" rule, in the column.
  supplier_claim_id  uuid not null references public.supplier_claims(id),

  -- Snapshot, like the claim's own (0288): the chase must survive a rename and
  -- must never re-derive itself from today's master data.
  supplier_id        uuid not null references public.suppliers(id),

  -- §9.6: *"PR Doc Date is the document date, not goods movement."* It is the
  -- one date that IS known at issue time, so it is the one date with a default.
  pr_doc_date        timestamptz not null default now(),

  -- The GRN the goods arrived on, carried for the register's `GRN No.` column.
  -- SET NULL, not CASCADE: a receipt correction must not delete the return.
  warehouse_receipt_id uuid references public.warehouse_receipts(id) on delete set null,

  -- Has the return document been sent to the supplier? NULL is the rail's
  -- `Return document not sent`, and it is an absence, not a false.
  document_sent_at   timestamptz,

  -- The PLAN. Separate from `actual_pickup_date` on the Unit, because §9.6
  -- keeps the three dates apart and a plan is not an event.
  confirmed_pickup_date date,

  created_at         timestamptz not null default now(),
  created_by         uuid references auth.users(id),

  -- A document may be issued for a claim more than once (a second collection
  -- trip for Units the first one left behind), so `supplier_claim_id` is
  -- indexed rather than unique — §7.4: *"Partial collection leaves the
  -- remaining Units open."*
  constraint purchase_returns_doc_date_not_future
    check (pr_doc_date <= now() + interval '1 day')
);

create index if not exists purchase_returns_claim_idx
  on public.purchase_returns(supplier_claim_id);
create index if not exists purchase_returns_supplier_idx
  on public.purchase_returns(supplier_id);
create index if not exists purchase_returns_doc_date_idx
  on public.purchase_returns(pr_doc_date desc);

comment on table public.purchase_returns is
  '§9.6 (2026-09-18): the Purchasing-owned purchase return document. Issuing it moves NO custody (§7.4) — Stock proves the physical pickup. Created only from an approved Supplier Claim outcome; supplier_claim_id is NOT NULL because there is no blank + New.';
comment on column public.purchase_returns.pr_no is
  '§9.6: visible references wear PR-, never PRTN-. New table, so nothing is migrated.';
comment on column public.purchase_returns.confirmed_pickup_date is
  '§9.6: the PLANNED pickup. NULL is the rail condition `Pickup date not confirmed` and is never filled from the actual date.';

-- ── 2 · one tracked Unit per row ─────────────────────────────────────────────

create table if not exists public.purchase_return_units (
  id                 uuid primary key default gen_random_uuid(),
  purchase_return_id uuid not null references public.purchase_returns(id) on delete cascade,

  -- The exact Unit. `ops_stock_items` is the per-Unit register (0137/0153); the
  -- row is RESTRICTed rather than cascaded because a Unit that has been sent
  -- back is exactly the Unit whose history must not quietly disappear.
  stock_item_id      uuid not null references public.ops_stock_items(id),

  -- Snapshots, taken at issue. The register prints what was sent back, not what
  -- the catalog says today — 0285's law, the same one the claim follows.
  unit_code          text not null,

  -- ⭐ A SNAPSHOT, AND DELIBERATELY NOT A FOREIGN KEY.
  --
  -- The first draft of this file wrote `references purchase_orders(id)` and the
  -- local replay refused the door on real fixture stock: `ops_stock_items.po_no`
  -- is a PROVENANCE STRING (`PO/2510-098` in the seed) and is not required to
  -- name a row in `purchase_orders` — imported and legacy Units carry the
  -- reference they arrived with. A foreign key here would refuse to send back
  -- exactly the goods most likely to have a problem.
  --
  -- The Purchasing dictionary already rules this for the same fact on the stock
  -- picker: *"Missing provenance reads `Not recorded`; it is never a reason to
  -- invent a PO."* So the document records what the Unit says, unchanged, and
  -- the register prints it or prints the absence.
  po_id              text,
  category           text,
  item               text,
  item_spec          text,

  -- §9.6: where the goods are COLLECTED, and the supplier-DESIGNATED
  -- destination. Recorded, never assumed: a supplier's registered address is
  -- not where they asked the goods to go.
  pickup_location    text,
  return_to          text,

  -- ⭐ EVERY ONE OF THESE IS NULLABLE WITH NO DEFAULT. §9.6: never fabricate a
  -- date, a collector or receipt evidence.
  collected_by       uuid references auth.users(id),
  collected_by_name  text,
  actual_pickup_date timestamptz,
  supplier_received_date timestamptz,

  -- ⭐ RULE 3 — `pickup` and `receipt` only. `problem` evidence lives on the
  -- claim and is READ from there; storing it here is what would let a damage
  -- photo be counted as proof the goods left.
  evidence           jsonb not null default '[]'::jsonb,

  created_at         timestamptz not null default now(),

  -- One Unit cannot be on one return document twice.
  constraint purchase_return_units_once unique (purchase_return_id, stock_item_id),

  -- The supplier cannot receive goods that never left.
  constraint purchase_return_units_received_needs_pickup
    check (supplier_received_date is null or actual_pickup_date is not null),

  -- A collector is a fact about a collection that happened.
  constraint purchase_return_units_collector_needs_pickup
    check (
      (collected_by is null and collected_by_name is null)
      or actual_pickup_date is not null
    )
);

comment on table public.purchase_return_units is
  '§9.6: ONE tracked Unit per row, Qty 1 — there is deliberately no quantity column, because two physical Units may never share one evidence row. The document Qty is count(*) over this table (ERP-ARCHITECTURE law D).';
comment on column public.purchase_return_units.evidence is
  '§9.6: {purpose, path, at, by} entries, purpose in (pickup, receipt) ONLY. `Problem evidence` belongs to the linked Supplier Claim and is read from it — a damage photo is never pickup or receipt proof.';
comment on column public.purchase_return_units.return_to is
  '§9.6: the supplier-DESIGNATED destination as recorded. Never the supplier''s registered address, and never inferred.';

create index if not exists purchase_return_units_return_idx
  on public.purchase_return_units(purchase_return_id);
create index if not exists purchase_return_units_stock_idx
  on public.purchase_return_units(stock_item_id);

-- ⭐ RULE 3, ENFORCED. A CHECK cannot iterate a jsonb array, so the guard is a
-- trigger — and it refuses the row rather than dropping the bad entry, because
-- silently discarding evidence is worse than refusing to file it.
create or replace function public.purchase_return_evidence_purposes_allowed()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_bad text;
begin
  if jsonb_typeof(new.evidence) <> 'array' then
    raise exception 'purchase return evidence must be an array'
      using errcode = '23514', detail = 'evidence_not_an_array';
  end if;

  select string_agg(distinct coalesce(entry ->> 'purpose', '(none)'), ', ')
    into v_bad
    from jsonb_array_elements(new.evidence) as entry
   where coalesce(entry ->> 'purpose', '') not in ('pickup', 'receipt');

  if v_bad is not null then
    -- Named, so the caller learns WHICH purpose was refused. `problem` is the
    -- one people will try, and the message says where it belongs.
    raise exception 'a purchase return holds pickup and receipt proof only; refused: %', v_bad
      using errcode = '23514',
            detail = 'problem_evidence_belongs_to_the_supplier_claim';
  end if;

  return new;
end;
$function$;

drop trigger if exists purchase_return_units_evidence_guard on public.purchase_return_units;
create trigger purchase_return_units_evidence_guard
  before insert or update of evidence on public.purchase_return_units
  for each row execute function public.purchase_return_evidence_purposes_allowed();

-- ── 3 · RLS — read is internal, and there is NO write policy ─────────────────
--
-- 0288's shape exactly: every write goes through a SECURITY DEFINER door, so
-- there is no PostgREST route that can issue, edit or drop a return by hand.

alter table public.purchase_returns enable row level security;
alter table public.purchase_return_units enable row level security;

drop policy if exists purchase_returns_read_internal on public.purchase_returns;
create policy purchase_returns_read_internal on public.purchase_returns
  for select to authenticated
  using ( (select public.is_internal()) );

drop policy if exists purchase_return_units_read_internal on public.purchase_return_units;
create policy purchase_return_units_read_internal on public.purchase_return_units
  for select to authenticated
  using ( (select public.is_internal()) );

grant select on public.purchase_returns to authenticated;
grant select on public.purchase_return_units to authenticated;
revoke insert, update, delete on public.purchase_returns from authenticated;
revoke insert, update, delete on public.purchase_return_units from authenticated;

-- ── 4 · the one door that issues a return ────────────────────────────────────
--
-- §7.4, APPROVED / LOCKED: *"Purchase Return: only an approved Claim/outcome
-- creates it. Issuing the document does not move custody."* Both halves are
-- here and nothing else is:
--
--   · The claim must already carry `carres_execution = 'return_to_supplier'` —
--     the Carres Execution layer that means *send it back* (0409). A claim
--     without it is refused BY NAME, so the operator learns the outcome has
--     not been agreed rather than getting a silent no-op.
--   · Not one stock row is written or read for a decision.
--
-- The UI that calls this is NOT part of §9.6 — that ruling confirmed the
-- register, not a creation screen — so no page opens this door yet. It exists
-- because a table nothing can write is a table that can never hold the rows the
-- approved register was confirmed to display.
create or replace function public.purchasing_issue_purchase_return(
  p_claim_id   uuid,
  p_units      jsonb,          -- [{stock_item_id, pickup_location, return_to}]
  p_confirmed_pickup_date date default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role        app_role := (select public.app_role());
  v_claim       public.supplier_claims%rowtype;
  v_return_id   uuid;
  v_unit        jsonb;
  v_stock_id    uuid;
  v_count       int := 0;
begin
  -- 0500's law: a NULL app_role must never fall through a gate.
  if v_role is null or v_role not in ('operation', 'principal') then
    raise exception 'operation or principal only'
      using errcode = '42501', detail = 'not_purchasing';
  end if;

  select * into v_claim from public.supplier_claims where id = p_claim_id;
  if not found then
    raise exception 'supplier claim not found'
      using errcode = 'P0002', detail = 'claim_not_found';
  end if;

  -- ⭐ THE APPROVED OUTCOME, AND NOTHING LOOSER. §7.4 says an approved
  -- claim/outcome creates the return; `Return to Supplier` is the Carres
  -- Execution that says the goods go back with no customer leg (0409).
  if v_claim.carres_execution is distinct from 'return_to_supplier' then
    raise exception 'this claim has no agreed Return to Supplier outcome'
      using errcode = '23514', detail = 'outcome_not_return_to_supplier';
  end if;

  if jsonb_typeof(p_units) <> 'array' or jsonb_array_length(p_units) = 0 then
    raise exception 'a purchase return needs at least one Unit'
      using errcode = '23514', detail = 'no_units';
  end if;

  insert into public.purchase_returns (
    supplier_claim_id, supplier_id, warehouse_receipt_id,
    confirmed_pickup_date, created_by
  )
  values (
    v_claim.id, v_claim.supplier_id, v_claim.warehouse_receipt_id,
    p_confirmed_pickup_date, auth.uid()
  )
  returning id into v_return_id;

  for v_unit in select * from jsonb_array_elements(p_units) loop
    v_stock_id := nullif(v_unit ->> 'stock_item_id', '')::uuid;
    if v_stock_id is null then
      raise exception 'every Unit on a purchase return needs its stock_item_id'
        using errcode = '23514', detail = 'unit_missing_id';
    end if;

    -- ⭐ READ ONLY. The Unit's identity and provenance are SNAPSHOT here; its
    -- status, holder and location are not touched, not checked and not
    -- changed. Issuing paper is not moving furniture (§7.4).
    insert into public.purchase_return_units (
      purchase_return_id, stock_item_id, unit_code, po_id,
      category, item, item_spec, pickup_location, return_to
    )
    select
      v_return_id, s.id, s.unit_code, s.po_no,
      nullif(v_unit ->> 'category', ''),
      nullif(v_unit ->> 'item', ''),
      nullif(v_unit ->> 'item_spec', ''),
      nullif(v_unit ->> 'pickup_location', ''),
      nullif(v_unit ->> 'return_to', '')
    from public.ops_stock_items s
    where s.id = v_stock_id
      -- 0453: a counted quantity row has no Unit ID and may not be sent back as
      -- if it were one exact piece.
      and s.unit_code is not null;

    if not found then
      raise exception 'that Unit is not a tracked Unit'
        using errcode = '23514', detail = 'unit_not_tracked';
    end if;
    v_count := v_count + 1;
  end loop;

  insert into public.audit_log (role, actor_text, action, ref)
  values (
    v_role, auth.uid()::text, 'purchasing_issue_purchase_return',
    v_return_id::text || ' claim=' || v_claim.claim_no || ' units=' || v_count
  );

  return v_return_id;
end;
$function$;

revoke all on function public.purchasing_issue_purchase_return(uuid, jsonb, date) from public;
revoke all on function public.purchasing_issue_purchase_return(uuid, jsonb, date) from anon;
grant execute on function public.purchasing_issue_purchase_return(uuid, jsonb, date) to authenticated;

-- ── 5 · sanity — assert what this file claims, in the database ──────────────
--
-- Schema is what a migration owns; data is what it walks past (red line 8).
-- Every check below reads the catalog, never a row count.
do $$
declare
  v_ok boolean;
begin
  -- RLS on, and read-only: a non-SELECT policy would be a PostgREST write door.
  for v_ok in
    select relrowsecurity from pg_class
     where oid in ('public.purchase_returns'::regclass,
                   'public.purchase_return_units'::regclass)
  loop
    if not v_ok then raise exception 'sanity: RLS off on a purchase return table'; end if;
  end loop;

  if exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename in ('purchase_returns', 'purchase_return_units')
       and cmd <> 'SELECT'
  ) then
    raise exception 'sanity: a purchase return table has a non-SELECT policy';
  end if;

  -- ⭐ RULE 2 — no quantity column may appear on the Unit table. This is the
  -- assertion that outlives the comment: the day somebody adds `qty` "just for
  -- the summary", the migration chain stops.
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'purchase_return_units'
       and column_name in ('qty', 'quantity')
  ) then
    raise exception 'sanity: purchase_return_units grew a quantity column (§9.6: one Unit per row, Qty 1)';
  end if;

  -- The evidence guard is armed.
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.purchase_return_units'::regclass
       and tgname = 'purchase_return_units_evidence_guard'
       and not tgisinternal
  ) then
    raise exception 'sanity: the purchase return evidence guard is not installed';
  end if;

  -- The door is authenticated-only, asserted BOTH directions (0281's rule: a
  -- revoke alone proves nothing).
  if has_function_privilege('anon', 'public.purchasing_issue_purchase_return(uuid, jsonb, date)', 'execute') then
    raise exception 'sanity: anon can issue a purchase return';
  end if;
  if not has_function_privilege('authenticated', 'public.purchasing_issue_purchase_return(uuid, jsonb, date)', 'execute') then
    raise exception 'sanity: authenticated lost execute on the purchase return door';
  end if;

  -- Exactly one copy of the door — a second overload is how two callers end up
  -- on two different rule sets.
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'purchasing_issue_purchase_return') <> 1 then
    raise exception 'sanity: more than one purchasing_issue_purchase_return';
  end if;
end $$;

commit;

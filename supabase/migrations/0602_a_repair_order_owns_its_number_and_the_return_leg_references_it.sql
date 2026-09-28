-- 0602_a_repair_order_owns_its_number_and_the_return_leg_references_it.sql
--
-- ⭐ REPAIR ORDERS — SLICE A. `docs/purchasing/MASTER.md` §9.7 (owner-approved
-- 2026-09-18 / 19 / 20 / 28): the Purchasing-owned repair COMMISSION, its send
-- evidence, the Supplier's receipt of the document (which starts the Carres
-- return target), Supplier replies, owner consent for non-Carres-owned Units,
-- and the return leg REFERENCING the commission's number.
--
-- ── THE TWO 🔴 STRUCTURAL CONFLICTS §9.7 NAMED, RESOLVED HERE ─────────────────
--
--   1 · `RO No` WAS MINTED BY THE RETURN LEG. 0490 (`arrival_source_create`,
--       last rebuilt by 0560 — verified identical to production's
--       pg_get_functiondef on 2026-09-28) allocated `RO-…` for every
--       `repair-return` arrival source. The commission now mints the number at
--       creation (`repair_order_create`), and a `repair-return` source that
--       names a Repair Order WEARS that number instead of minting a second one
--       (ownership law A; law C "a door, never a duplicate"). The legacy
--       Claim/Case-only path keeps its old behaviour unchanged, because an
--       existing source's number is permanent (§6.1 Permanence).
--       0490's physical checks (exact Units at the recorded origin Site, status
--       free / reserved / on_hold) are carried forward UNCHANGED.
--
--   2 · THERE WAS NO DOCUMENT-AGNOSTIC SEND LEDGER. `po_sends` (0377) keys on
--       `po_id` + `po_version`. `document_sends` below lifts the same evidence
--       (version · recipient · channel · actor · time · confirmed) into a table
--       any formal document can use. The Repair Order uses it from day one.
--       `po_sends` is NOT touched: PO, PRTN and CO move onto this ledger in
--       their own scopes (recorded in §9.7).
--
-- ── WHAT THIS FILE DOES NOT DO ──────────────────────────────────────────────
--
--   · IT MOVES NO STOCK. Creating or issuing a Repair Order writes no
--     `ops_stock_items` row. The pickup is Stock's `arrival_source_handover`
--     on the RO's `repair-return` source (0490) — the ONE custody writer; this
--     file adds no second one.
--   · IT TOUCHES NO FINANCE. `price` is an optional recorded fact; NULL is
--     unknown, never RM0 (owner ruling 2026-09-19). No approval gate exists.
--   · IT INVENTS NO STATUS. Every stage on the object page is DERIVED from a
--     fact (a confirmed send, a recorded receipt, a pickup event, a posted
--     GRN). There is no `status` column to drift from those facts.
--
-- ── NUMBERING ───────────────────────────────────────────────────────────────
--
-- Measured 2026-09-28 before writing: production tracker tail 0601
-- (`0601_a_grn_names_who_received_it_and_when`), repository tail on
-- origin/main 0601, MAX across every remote branch 0601. So this is 0602.
-- Red line 8 — nothing here asserts a production row count.

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 0 · the governed return-target period (§9.7: "the governed setting supplies
--     the period; staff do not type the target on every order")
-- ════════════════════════════════════════════════════════════════════════════

alter table public.purchasing_settings
  add column if not exists repair_return_working_days int not null default 14;
alter table public.purchasing_settings
  drop constraint if exists purchasing_settings_repair_return_working_days_range;
alter table public.purchasing_settings
  add constraint purchasing_settings_repair_return_working_days_range
  check (repair_return_working_days between 1 and 90);
comment on column public.purchasing_settings.repair_return_working_days is
  '0602 (§9.7, owner correction 2026-09-20): the Carres repair return target, in OFFICE working days, counted from evidenced Supplier receipt of the Repair Order document. Snapshotted onto each RO when receipt is recorded.';

-- ════════════════════════════════════════════════════════════════════════════
-- 1 · the document-agnostic send ledger
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.document_sends (
  id             uuid primary key default gen_random_uuid(),
  -- The formal document kind. Only `repair_order` writes here today; PO,
  -- PRTN, CO and CRTN join when their own scopes move off their own ledgers.
  document_kind  text not null check (document_kind in ('repair_order')),
  document_id    uuid not null,
  -- The EXACT version that left (0377's rule): a revised document is a new send.
  version        int  not null check (version >= 1),
  recipient      text not null check (coalesce(recipient, '') ~ '[^[:space:]]'),
  channel        text not null check (channel in ('whatsapp', 'email', 'print')),
  note           text,
  -- `confirmed` = the operator states the document actually reached the
  -- recipient. Opening an app or downloading a PDF is not a send (0377).
  confirmed      boolean not null default true,
  sent_by        uuid not null references auth.users(id),
  sent_at        timestamptz not null default now()
);

create index if not exists document_sends_document_idx
  on public.document_sends (document_kind, document_id, version);

comment on table public.document_sends is
  '0602: the document-agnostic send evidence lifted from po_sends (0377): version · recipient · channel · actor · time · confirmed. Repair Orders use it first; po_sends stays the PO ledger until PO/PRTN/CO migrate in their own scopes.';

alter table public.document_sends enable row level security;
drop policy if exists document_sends_read_internal on public.document_sends;
create policy document_sends_read_internal on public.document_sends
  for select to authenticated using ((select public.is_internal()));
grant select on public.document_sends to authenticated;
revoke insert, update, delete on public.document_sends from authenticated, anon;

-- ════════════════════════════════════════════════════════════════════════════
-- 2 · the Repair Order
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.repair_orders (
  id                          uuid primary key default gen_random_uuid(),
  -- A retry of the same Save answers with the RO it already created.
  request_id                  uuid not null unique,
  -- The commission owns the number (§9.7 conflict 1). Minted once, at create.
  ro_no                       text not null unique,
  -- §9.7: system-set to the Malaysia business date on creation; read-only,
  -- never backdated, never restamped by a later view.
  ro_doc_date                 date not null,
  version                     int  not null default 1 check (version >= 1),
  supplier_id                 uuid not null references public.suppliers(id),
  -- Optional related Claim — prefilled for Claim-origin repairs only.
  supplier_claim_id           uuid references public.supplier_claims(id),
  -- A responsibility WORD, never money (§9.7 register rule).
  cost_responsibility         text not null default 'not_decided'
                                check (cost_responsibility in ('carres_pays', 'supplier_pays', 'not_decided')),
  -- Optional. NULL is unknown — never RM0 (owner ruling 2026-09-19).
  price                       numeric(12, 2) check (price is null or price >= 0),
  quotation_path              text,
  -- Intended places; neither asserts a movement (§9.7).
  pickup_site_id              uuid not null references public.warehouses(id),
  return_site_id              uuid not null references public.warehouses(id),

  -- ⭐ EVIDENCED SUPPLIER RECEIPT OF THE DOCUMENT — the anchor of the target.
  supplier_received_at        timestamptz,
  supplier_received_version   int,
  supplier_received_source    text,
  supplier_received_evidence  text,
  supplier_received_by        uuid references auth.users(id),
  supplier_received_recorded_at timestamptz,
  -- The computed Carres target and the setting + calendar it was computed on.
  return_target_date          date,
  return_target_working_days  int,
  return_target_calendar      text,

  cancelled_at                timestamptz,
  cancelled_by                uuid references auth.users(id),
  cancel_reason               text,

  created_by                  uuid not null references auth.users(id),
  created_at                  timestamptz not null default now(),

  constraint repair_orders_receipt_is_whole check (
    (supplier_received_at is null
      and supplier_received_version is null and supplier_received_source is null
      and supplier_received_evidence is null and supplier_received_by is null
      and return_target_date is null and return_target_working_days is null
      and return_target_calendar is null)
    or
    (supplier_received_at is not null
      and supplier_received_version is not null
      and coalesce(supplier_received_source, '') ~ '[^[:space:]]'
      and coalesce(supplier_received_evidence, '') ~ '[^[:space:]]'
      and supplier_received_by is not null
      and return_target_date is not null and return_target_working_days is not null
      and coalesce(return_target_calendar, '') ~ '[^[:space:]]')
  ),
  constraint repair_orders_cancel_has_reason check (
    cancelled_at is null or coalesce(cancel_reason, '') ~ '[^[:space:]]'
  )
);

create index if not exists repair_orders_supplier_idx on public.repair_orders (supplier_id);
create index if not exists repair_orders_claim_idx on public.repair_orders (supplier_claim_id);
create index if not exists repair_orders_doc_date_idx on public.repair_orders (ro_doc_date desc, created_at desc);

comment on table public.repair_orders is
  '0602 (§9.7): the Purchasing-owned repair commission. It owns RO No. Creating or issuing it moves no stock; the pickup and return are Stock''s repair-return arrival source, which references this RO.';
comment on column public.repair_orders.price is
  '0602: optional recorded price. NULL = unknown, never RM0; recording it is neither expense approval nor payment (owner ruling 2026-09-19).';

-- ── one exact Unit per row ───────────────────────────────────────────────────

create table if not exists public.repair_order_units (
  id                  uuid primary key default gen_random_uuid(),
  repair_order_id     uuid not null references public.repair_orders(id),
  stock_item_id       uuid not null references public.ops_stock_items(id),
  -- Snapshots at creation (0285's law): the paper prints what was commissioned.
  unit_code           text not null,
  po_no               text,
  sku                 text,
  ownership           text,
  -- The SAME vocabulary as Report a problem (`unitProblemChoices`) — the three
  -- the create page offers. No second problem list.
  problem             text not null check (problem in ('damaged', 'missing_component', 'something_else')),
  problem_note        text not null check (coalesce(problem_note, '') ~ '[^[:space:]]' and length(problem_note) <= 300),
  repair_requirement  text not null check (coalesce(repair_requirement, '') ~ '[^[:space:]]' and length(repair_requirement) <= 500),
  -- [{path, kind: photo|video, source: unit|claim}] — Claim evidence is linked
  -- by REFERENCE, never re-uploaded (§9.7).
  evidence            jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  -- NULL = the repair is active for this Unit. Set on cancel (and, later, on
  -- the authorised completion). The partial unique index below is the
  -- "no duplicate active repair" rule, in the database.
  released_at         timestamptz,
  created_at          timestamptz not null default now(),
  constraint repair_order_units_once unique (repair_order_id, stock_item_id)
);

create unique index if not exists repair_order_units_one_active_repair
  on public.repair_order_units (stock_item_id) where released_at is null;
create index if not exists repair_order_units_ro_idx on public.repair_order_units (repair_order_id);

comment on table public.repair_order_units is
  '0602 (§9.7): ONE exact Unit per row, Qty 1 — no quantity column. A Unit may be on at most one active Repair Order (partial unique index).';

-- ── Supplier replies — append-only, and they never move the Carres target ────

create table if not exists public.repair_order_supplier_replies (
  id                    uuid primary key default gen_random_uuid(),
  repair_order_id       uuid not null references public.repair_orders(id),
  -- NULL = `Supplier date not reported`. Never guessed.
  expected_return_date  date,
  -- Reuses the governed PO delay reasons (0585) — no second reason list.
  reason                text not null,
  note                  text,
  reference             text not null check (coalesce(reference, '') ~ '[^[:space:]]'),
  evidence              text,
  -- The Units the reply concerns; empty = the whole RO.
  stock_item_ids        uuid[] not null default '{}',
  recorded_by           uuid not null references auth.users(id),
  recorded_at           timestamptz not null default now()
);
create index if not exists repair_order_supplier_replies_ro_idx
  on public.repair_order_supplier_replies (repair_order_id, recorded_at desc);

drop trigger if exists repair_order_supplier_replies_append_only on public.repair_order_supplier_replies;
create trigger repair_order_supplier_replies_append_only
  before update or delete on public.repair_order_supplier_replies
  for each row execute function public._purchasing_evidence_append_only();

-- ── owner consent for non-Carres-owned Units — append-only ───────────────────

create table if not exists public.repair_order_owner_consents (
  id               uuid primary key default gen_random_uuid(),
  repair_order_id  uuid not null references public.repair_orders(id),
  stock_item_ids   uuid[] not null check (cardinality(stock_item_ids) > 0),
  -- A refusal is recorded too: it leaves its scope visibly unresolved (§9.7).
  outcome          text not null check (outcome in ('given', 'refused')),
  evidence         text not null check (coalesce(evidence, '') ~ '[^[:space:]]'),
  note             text,
  recorded_by      uuid not null references auth.users(id),
  recorded_at      timestamptz not null default now()
);
create index if not exists repair_order_owner_consents_ro_idx
  on public.repair_order_owner_consents (repair_order_id, recorded_at desc);

drop trigger if exists repair_order_owner_consents_append_only on public.repair_order_owner_consents;
create trigger repair_order_owner_consents_append_only
  before update or delete on public.repair_order_owner_consents
  for each row execute function public._purchasing_evidence_append_only();

-- ── RLS: internal read, NO write policy (0548's shape) ───────────────────────

alter table public.repair_orders enable row level security;
alter table public.repair_order_units enable row level security;
alter table public.repair_order_supplier_replies enable row level security;
alter table public.repair_order_owner_consents enable row level security;

drop policy if exists repair_orders_read_internal on public.repair_orders;
create policy repair_orders_read_internal on public.repair_orders
  for select to authenticated using ((select public.is_internal()));
drop policy if exists repair_order_units_read_internal on public.repair_order_units;
create policy repair_order_units_read_internal on public.repair_order_units
  for select to authenticated using ((select public.is_internal()));
drop policy if exists repair_order_supplier_replies_read_internal on public.repair_order_supplier_replies;
create policy repair_order_supplier_replies_read_internal on public.repair_order_supplier_replies
  for select to authenticated using ((select public.is_internal()));
drop policy if exists repair_order_owner_consents_read_internal on public.repair_order_owner_consents;
create policy repair_order_owner_consents_read_internal on public.repair_order_owner_consents
  for select to authenticated using ((select public.is_internal()));

grant select on public.repair_orders, public.repair_order_units,
  public.repair_order_supplier_replies, public.repair_order_owner_consents to authenticated;
revoke insert, update, delete on public.repair_orders, public.repair_order_units,
  public.repair_order_supplier_replies, public.repair_order_owner_consents from authenticated, anon;

-- ════════════════════════════════════════════════════════════════════════════
-- 3 · helpers
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public._repair_order_gate()
returns app_role
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role app_role := (select public.app_role());
begin
  -- 0500's law: a NULL role never falls through a gate.
  if auth.uid() is null or v_role is null or v_role not in ('operation', 'principal') then
    raise exception 'operation or principal only' using errcode = '42501', detail = 'not_purchasing';
  end if;
  return v_role;
end;
$fn$;
revoke all on function public._repair_order_gate() from public, anon, authenticated;

/**
 * WHY A UNIT CANNOT BE TICKED — the words the Add Units drawer prints on the
 * row, and the words the door refuses with. NULL = eligible.
 * `p_claim` is the Claim a Claim-origin RO names: a Unit held on THAT Claim is
 * exactly the Unit the repair is for, so its hold is not a refusal.
 */
create or replace function public.repair_order_unit_refusal(p_item ops_stock_items, p_claim uuid default null)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_ro text;
  v_lock jsonb;
begin
  if p_item.unit_code is null or coalesce(p_item.qty, 1) <> 1 then
    return 'Counted stock';
  end if;
  select r.ro_no into v_ro
    from repair_order_units ru join repair_orders r on r.id = ru.repair_order_id
   where ru.stock_item_id = p_item.id and ru.released_at is null
   limit 1;
  if v_ro is not null then
    return format('Already on %s', v_ro);
  end if;
  v_lock := public.receiving_unit_lock_reason(p_item);
  if v_lock is not null
     and not (v_lock->>'reason' = 'on_supplier_claim' and p_claim is not null and p_item.hold_claim_id = p_claim) then
    return v_lock->>'words';
  end if;
  if p_item.status = 'incoming' then return 'Not received'; end if;
  if p_item.status = 'transferred' then return 'This Unit is on the road'; end if;
  if p_item.status in ('voided', 'written_off', 'returned_to_supplier') then return 'Not in stock'; end if;
  if p_item.status = 'on_hold' and not (p_claim is not null and p_item.hold_claim_id = p_claim) then
    return 'Waiting inspection';
  end if;
  if p_item.status not in ('free', 'on_hold') then return 'Not in stock'; end if;
  return null;
end;
$fn$;
revoke all on function public.repair_order_unit_refusal(ops_stock_items, uuid) from public, anon;
grant execute on function public.repair_order_unit_refusal(ops_stock_items, uuid) to authenticated;

/** The Add Units drawer's list: every exact Unit standing at one Carres Site,
 *  with the SAME refusal words the create door refuses with (one arithmetic).
 *  Counted rows, ended Units and delivered goods are not offered at all. */
create or replace function public.repair_order_eligible_units(
  p_site uuid, p_claim uuid default null, p_search text default null
)
returns table (
  id uuid, unit_code text, sku text, po_no text, warehouse_id uuid,
  condition text, ownership text, refusal text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  perform public._repair_order_gate();
  return query
    select i.id, i.unit_code, i.sku, i.po_no, i.warehouse_id, i.condition, i.ownership,
           public.repair_order_unit_refusal(i, p_claim)
      from ops_stock_items i
     where i.warehouse_id = p_site
       and i.unit_code is not null and coalesce(i.qty, 1) = 1
       and i.status not in ('voided', 'written_off', 'returned_to_supplier', 'sold')
       and (p_claim is null or i.hold_claim_id = p_claim)
       and (coalesce(p_search, '') !~ '[^[:space:]]'
            or i.unit_code ilike '%' || btrim(p_search) || '%'
            or i.sku ilike '%' || btrim(p_search) || '%'
            or coalesce(i.po_no, '') ilike '%' || btrim(p_search) || '%')
     order by (public.repair_order_unit_refusal(i, p_claim) is not null), i.unit_code
     limit 300;
end;
$fn$;
revoke all on function public.repair_order_eligible_units(uuid, uuid, text) from public, anon;
grant execute on function public.repair_order_eligible_units(uuid, uuid, text) to authenticated;

/** Mon–Fri days in (p_from, p_to]. A lower bound for the Office calendar,
 *  which also closes on Malaysian public holidays. */
create or replace function public._office_weekdays_between(p_from date, p_to date)
returns int
language sql
immutable
set search_path = public, pg_temp
as $fn$
  select count(*)::int
    from generate_series((p_from + 1)::timestamp, p_to::timestamp, interval '1 day') d
   where extract(isodow from d) < 6;
$fn$;

-- ════════════════════════════════════════════════════════════════════════════
-- 4 · the doors
-- ════════════════════════════════════════════════════════════════════════════

-- ── create ───────────────────────────────────────────────────────────────────
create or replace function public.repair_order_create(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role     app_role := public._repair_order_gate();
  v_request  uuid := nullif(p_input->>'request_id', '')::uuid;
  v_claim_id uuid := nullif(p_input->>'supplier_claim_id', '')::uuid;
  v_supplier uuid := nullif(p_input->>'supplier_id', '')::uuid;
  v_pickup   uuid := nullif(p_input->>'pickup_site_id', '')::uuid;
  v_return   uuid := nullif(p_input->>'return_site_id', '')::uuid;
  v_cost     text := coalesce(nullif(p_input->>'cost_responsibility', ''), 'not_decided');
  v_price    numeric;
  v_claim    supplier_claims;
  v_ro       repair_orders;
  v_id       uuid := gen_random_uuid();
  v_unit     jsonb;
  v_item     ops_stock_items;
  v_refusal  text;
  v_ids      uuid[] := '{}';
  v_entry    jsonb;
  v_count    int := 0;
begin
  if v_request is null then
    raise exception 'request_id is required' using errcode = '22023', detail = 'request_id_required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_request::text, 0));
  select * into v_ro from repair_orders where request_id = v_request;
  if found then
    if v_ro.created_by <> auth.uid() then
      raise exception 'request already used' using errcode = '40001', detail = 'request_already_used';
    end if;
    return jsonb_build_object('id', v_ro.id, 'ro_no', v_ro.ro_no, 'replayed', true);
  end if;

  if v_supplier is null or not exists (select 1 from suppliers where id = v_supplier) then
    raise exception 'Choose the Supplier' using errcode = '22023', detail = 'supplier_required';
  end if;
  if v_cost not in ('carres_pays', 'supplier_pays', 'not_decided') then
    raise exception 'Choose the Cost Responsibility' using errcode = '22023', detail = 'cost_responsibility_invalid';
  end if;
  if nullif(p_input->>'price', '') is not null then
    v_price := (p_input->>'price')::numeric;
    if v_price < 0 then
      raise exception 'Price cannot be negative' using errcode = '22023', detail = 'price_negative';
    end if;
  end if;

  -- ⭐ A Carres Site only. PJ Showroom is a governed Site (kind own); a Dealer
  -- is not a Carres Site (§7.4a), and a partner warehouse is not ours to send
  -- goods out of for repair from this form.
  if v_pickup is null or not exists (select 1 from warehouses where id = v_pickup and kind = 'own') then
    raise exception 'Choose where the goods are now' using errcode = '22023', detail = 'pickup_site_not_carres';
  end if;
  if v_return is null or not exists (select 1 from warehouses where id = v_return) then
    raise exception 'Choose the Supplier Return Location' using errcode = '22023', detail = 'return_site_required';
  end if;

  if v_claim_id is not null then
    select * into v_claim from supplier_claims where id = v_claim_id;
    if not found then
      raise exception 'Supplier Claim not found' using errcode = 'P0002', detail = 'claim_not_found';
    end if;
    -- 0490 reads the same owning outcome for its Claim repair path.
    if v_claim.customer_resolution is distinct from 'repair' then
      raise exception 'record the authorised repair outcome in the Claim first'
        using errcode = '22023', detail = 'claim_outcome_not_repair';
    end if;
  end if;

  if jsonb_typeof(p_input->'units') is distinct from 'array' or jsonb_array_length(p_input->'units') = 0 then
    raise exception 'Click Add Units' using errcode = '22023', detail = 'no_units';
  end if;
  if jsonb_array_length(p_input->'units') > 200 then
    raise exception 'too many Units on one Repair Order' using errcode = '22023', detail = 'too_many_units';
  end if;

  insert into repair_orders (
    id, request_id, ro_no, ro_doc_date, supplier_id, supplier_claim_id,
    cost_responsibility, price, quotation_path, pickup_site_id, return_site_id, created_by
  ) values (
    v_id, v_request,
    public.allocate_formal_document_code('RO', v_id::text),
    (timezone('Asia/Kuala_Lumpur', now()))::date,
    v_supplier, v_claim_id, v_cost, v_price,
    case when coalesce(p_input->>'quotation_path', '') ~ '[^[:space:]]' then btrim(p_input->>'quotation_path') end,
    v_pickup, v_return, auth.uid()
  ) returning * into v_ro;

  for v_unit in select * from jsonb_array_elements(p_input->'units') loop
    select * into v_item from ops_stock_items where id = nullif(v_unit->>'stock_item_id', '')::uuid for update;
    if not found then
      raise exception 'Only real Units can be sent for repair' using errcode = '22023', detail = 'unit_not_found';
    end if;
    if v_item.id = any (v_ids) then
      raise exception 'name each Unit once' using errcode = '22023', detail = 'unit_twice';
    end if;
    v_ids := v_ids || v_item.id;

    -- ⭐ REFUSED BY NAME: the operator reads why, not a code.
    v_refusal := public.repair_order_unit_refusal(v_item, v_claim_id);
    if v_refusal is not null then
      raise exception '%: %', v_item.unit_code, v_refusal
        using errcode = '23514', detail = 'unit_not_eligible', hint = v_refusal;
    end if;
    if v_item.warehouse_id is distinct from v_pickup then
      raise exception '%: is not at the Supplier Pickup Location', coalesce(v_item.unit_code, 'Unit')
        using errcode = '22023', detail = 'unit_not_at_pickup_site';
    end if;
    if v_claim_id is not null and v_item.hold_claim_id is distinct from v_claim_id then
      raise exception '%: does not belong to this Claim', v_item.unit_code
        using errcode = '22023', detail = 'unit_not_on_claim';
    end if;

    -- Evidence: a Unit photo must be an uploaded object; a Claim photo must
    -- be one the Claim already holds (read by reference, never re-uploaded).
    if jsonb_typeof(coalesce(v_unit->'evidence', '[]'::jsonb)) <> 'array' then
      raise exception 'evidence must be a list' using errcode = '22023', detail = 'evidence_not_a_list';
    end if;
    for v_entry in select * from jsonb_array_elements(coalesce(v_unit->'evidence', '[]'::jsonb)) loop
      if coalesce(v_entry->>'kind', '') not in ('photo', 'video')
         or coalesce(v_entry->>'source', '') not in ('unit', 'claim')
         or coalesce(v_entry->>'path', '') !~ '[^[:space:]]' then
        raise exception 'evidence entry is not recognised' using errcode = '22023', detail = 'evidence_invalid';
      end if;
      if v_entry->>'source' = 'claim' and (v_claim_id is null or not exists (
            select 1 from jsonb_array_elements(coalesce(v_claim.photos, '[]'::jsonb)) p where p->>'path' = v_entry->>'path')) then
        raise exception 'Claim evidence must belong to the Claim' using errcode = '22023', detail = 'evidence_not_on_claim';
      end if;
      if v_entry->>'source' = 'unit' and not exists (
            select 1 from storage.objects where bucket_id = 'issue-evidence' and name = v_entry->>'path') then
        raise exception 'upload the photo first' using errcode = '22023', detail = 'evidence_not_uploaded';
      end if;
    end loop;

    insert into repair_order_units (
      repair_order_id, stock_item_id, unit_code, po_no, sku, ownership,
      problem, problem_note, repair_requirement, evidence
    ) values (
      v_id, v_item.id, v_item.unit_code, v_item.po_no, v_item.sku, v_item.ownership,
      v_unit->>'problem',
      btrim(coalesce(v_unit->>'problem_note', '')),
      btrim(coalesce(v_unit->>'repair_requirement', '')),
      coalesce(v_unit->'evidence', '[]'::jsonb)
    );
    v_count := v_count + 1;
  end loop;

  insert into audit_log (role, actor_text, action, ref)
  values (v_role, auth.uid()::text, 'repair_order_create',
          v_ro.ro_no || ' units=' || v_count || coalesce(' claim=' || v_claim.claim_no, ''));

  return jsonb_build_object('id', v_ro.id, 'ro_no', v_ro.ro_no, 'replayed', false);
end;
$fn$;
revoke all on function public.repair_order_create(jsonb) from public, anon;
grant execute on function public.repair_order_create(jsonb) to authenticated;

-- ── issue: a confirmed send of the current version. Moves no stock. ─────────
create or replace function public.repair_order_issue(
  p_ro_id uuid, p_channel text, p_recipient text, p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role app_role := public._repair_order_gate();
  v_ro   repair_orders;
  v_id   uuid;
begin
  select * into v_ro from repair_orders where id = p_ro_id for update;
  if not found then
    raise exception 'Repair Order not found' using errcode = 'P0002', detail = 'ro_not_found';
  end if;
  if v_ro.cancelled_at is not null then
    raise exception '% is cancelled', v_ro.ro_no using errcode = '22023', detail = 'ro_cancelled';
  end if;
  if coalesce(p_channel, '') not in ('whatsapp', 'email', 'print') then
    raise exception 'Choose how it was sent' using errcode = '22023', detail = 'invalid_channel';
  end if;
  if coalesce(p_recipient, '') !~ '[^[:space:]]' then
    raise exception 'Say who received it' using errcode = '22023', detail = 'recipient_required';
  end if;

  insert into document_sends (document_kind, document_id, version, recipient, channel, note, confirmed, sent_by)
  values ('repair_order', v_ro.id, v_ro.version, btrim(p_recipient), p_channel,
          case when coalesce(p_note, '') ~ '[^[:space:]]' then btrim(p_note) end, true, auth.uid())
  returning id into v_id;

  insert into audit_log (role, actor_text, action, ref)
  values (v_role, auth.uid()::text, 'repair_order_issue',
          format('%s version %s sent to %s by %s', v_ro.ro_no, v_ro.version, btrim(p_recipient), p_channel));
  return v_id;
end;
$fn$;
revoke all on function public.repair_order_issue(uuid, text, text, text) from public, anon;
grant execute on function public.repair_order_issue(uuid, text, text, text) to authenticated;

-- ── Supplier receipt of the document: starts the Carres return target ──────
--
-- The Office working-day ARITHMETIC lives once, in `packages/shared`
-- (`working-days.ts` + the Purchasing Office calendar). The API computes the
-- target with it and passes it with the calendar's name; this door refuses a
-- target that is not a Mon–Fri day at least the governed period of Office
-- weekdays after the receipt date (and not absurdly further — holidays add
-- days, they do not add weeks).
create or replace function public.repair_order_record_supplier_receipt(
  p_ro_id       uuid,
  p_received_at timestamptz,
  p_source      text,
  p_evidence    text,
  p_target      date,
  p_calendar    text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role    app_role := public._repair_order_gate();
  v_ro      repair_orders;
  v_period  int;
  v_from    date;
  v_days    int;
begin
  select * into v_ro from repair_orders where id = p_ro_id for update;
  if not found then
    raise exception 'Repair Order not found' using errcode = 'P0002', detail = 'ro_not_found';
  end if;
  if v_ro.cancelled_at is not null then
    raise exception '% is cancelled', v_ro.ro_no using errcode = '22023', detail = 'ro_cancelled';
  end if;
  if v_ro.supplier_received_at is not null then
    raise exception 'Supplier receipt is already recorded' using errcode = '40001', detail = 'receipt_already_recorded';
  end if;
  -- §9.7: receipt of the SPECIFIC RO version — it must have been sent.
  if not exists (select 1 from document_sends where document_kind = 'repair_order'
                  and document_id = v_ro.id and version = v_ro.version and confirmed) then
    raise exception 'Issue repair order first' using errcode = '22023', detail = 'not_issued';
  end if;
  if p_received_at is null or p_received_at > now() + interval '5 minutes' then
    raise exception 'the received time cannot be in the future' using errcode = '22023', detail = 'received_in_future';
  end if;
  if p_received_at < v_ro.created_at then
    raise exception 'the received time is before the Repair Order existed' using errcode = '22023', detail = 'received_before_ro';
  end if;
  if coalesce(p_source, '') !~ '[^[:space:]]' or coalesce(p_evidence, '') !~ '[^[:space:]]' then
    raise exception 'Record how the Supplier confirmed and the reply reference'
      using errcode = '22023', detail = 'receipt_evidence_required';
  end if;
  if coalesce(p_calendar, '') !~ '[^[:space:]]' then
    raise exception 'the calendar is required' using errcode = '22023', detail = 'calendar_required';
  end if;

  select repair_return_working_days into v_period from purchasing_settings order by id limit 1;
  v_period := coalesce(v_period, 14);
  v_from := (timezone('Asia/Kuala_Lumpur', p_received_at))::date;
  if p_target is null or extract(isodow from p_target) >= 6 then
    raise exception 'the return target must be an Office working day' using errcode = '22023', detail = 'target_not_working_day';
  end if;
  v_days := public._office_weekdays_between(v_from, p_target);
  if v_days < v_period or v_days > v_period + 15 then
    raise exception 'the return target is not % Office working days after receipt', v_period
      using errcode = '22023', detail = 'target_not_governed_period';
  end if;

  update repair_orders set
    supplier_received_at = p_received_at,
    supplier_received_version = v_ro.version,
    supplier_received_source = btrim(p_source),
    supplier_received_evidence = btrim(p_evidence),
    supplier_received_by = auth.uid(),
    supplier_received_recorded_at = now(),
    return_target_date = p_target,
    return_target_working_days = v_period,
    return_target_calendar = btrim(p_calendar)
  where id = v_ro.id;

  insert into audit_log (role, actor_text, action, ref)
  values (v_role, auth.uid()::text, 'repair_order_record_supplier_receipt',
          format('%s received %s · target %s (%s working days)', v_ro.ro_no, p_received_at, p_target, v_period));

  return jsonb_build_object('id', v_ro.id, 'return_target_date', p_target, 'working_days', v_period);
end;
$fn$;
revoke all on function public.repair_order_record_supplier_receipt(uuid, timestamptz, text, text, date, text) from public, anon;
grant execute on function public.repair_order_record_supplier_receipt(uuid, timestamptz, text, text, date, text) to authenticated;

-- ── Supplier reply: its own date; NEVER moves the Carres target ─────────────
create or replace function public.repair_order_record_supplier_reply(p_ro_id uuid, p_input jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role   app_role := public._repair_order_gate();
  v_ro     repair_orders;
  v_reason text := case when coalesce(p_input->>'reason', '') ~ '[^[:space:]]' then btrim(p_input->>'reason') end;
  v_units  uuid[] := '{}';
  v_id     uuid;
begin
  select * into v_ro from repair_orders where id = p_ro_id for update;
  if not found then
    raise exception 'Repair Order not found' using errcode = 'P0002', detail = 'ro_not_found';
  end if;
  if v_ro.cancelled_at is not null then
    raise exception '% is cancelled', v_ro.ro_no using errcode = '22023', detail = 'ro_cancelled';
  end if;
  if not exists (select 1 from document_sends where document_kind = 'repair_order' and document_id = v_ro.id and confirmed) then
    raise exception 'Issue repair order first' using errcode = '22023', detail = 'not_issued';
  end if;
  if not (coalesce(v_reason, '') = any (public.purchasing_supplier_delay_reasons())) then
    raise exception 'Choose why the supplier gave this date.' using errcode = '22023', detail = 'reason_required';
  end if;
  if v_reason = 'Other' and coalesce(p_input->>'note', '') !~ '[^[:space:]]' then
    raise exception 'Say what the other reason is.' using errcode = '22023', detail = 'other_needs_note';
  end if;
  if coalesce(p_input->>'reference', '') !~ '[^[:space:]]' then
    raise exception 'Record the reply reference.' using errcode = '22023', detail = 'reference_required';
  end if;
  if jsonb_typeof(p_input->'stock_item_ids') = 'array' then
    select coalesce(array_agg(value::uuid), '{}') into v_units from jsonb_array_elements_text(p_input->'stock_item_ids');
    if exists (select 1 from unnest(v_units) x where not exists (
          select 1 from repair_order_units where repair_order_id = v_ro.id and stock_item_id = x)) then
      raise exception 'a Unit is not on this Repair Order' using errcode = '22023', detail = 'unit_not_on_ro';
    end if;
  end if;

  insert into repair_order_supplier_replies (
    repair_order_id, expected_return_date, reason, note, reference, evidence, stock_item_ids, recorded_by
  ) values (
    v_ro.id, nullif(p_input->>'expected_return_date', '')::date, v_reason,
    case when coalesce(p_input->>'note', '') ~ '[^[:space:]]' then btrim(p_input->>'note') end,
    btrim(p_input->>'reference'),
    case when coalesce(p_input->>'evidence', '') ~ '[^[:space:]]' then btrim(p_input->>'evidence') end,
    v_units, auth.uid()
  ) returning id into v_id;

  insert into audit_log (role, actor_text, action, ref)
  values (v_role, auth.uid()::text, 'repair_order_record_supplier_reply',
          format('%s · %s · %s', v_ro.ro_no, v_reason, coalesce(p_input->>'expected_return_date', 'Supplier date not reported')));
  return v_id;
end;
$fn$;
revoke all on function public.repair_order_record_supplier_reply(uuid, jsonb) from public, anon;
grant execute on function public.repair_order_record_supplier_reply(uuid, jsonb) to authenticated;

-- ── owner consent: only for non-Carres-owned Units; never an Issue gate ─────
create or replace function public.repair_order_record_owner_consent(p_ro_id uuid, p_input jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role    app_role := public._repair_order_gate();
  v_ro      repair_orders;
  v_units   uuid[];
  v_outcome text := p_input->>'outcome';
  v_id      uuid;
begin
  select * into v_ro from repair_orders where id = p_ro_id for update;
  if not found then
    raise exception 'Repair Order not found' using errcode = 'P0002', detail = 'ro_not_found';
  end if;
  if v_outcome is null or v_outcome not in ('given', 'refused') then
    raise exception 'Choose what the owner said' using errcode = '22023', detail = 'outcome_required';
  end if;
  if coalesce(p_input->>'evidence', '') !~ '[^[:space:]]' then
    raise exception 'Record the owner''s reply' using errcode = '22023', detail = 'consent_evidence_required';
  end if;
  if jsonb_typeof(p_input->'stock_item_ids') is distinct from 'array' or jsonb_array_length(p_input->'stock_item_ids') = 0 then
    raise exception 'Choose the Units' using errcode = '22023', detail = 'no_units';
  end if;
  select array_agg(distinct value::uuid) into v_units from jsonb_array_elements_text(p_input->'stock_item_ids');
  if exists (select 1 from unnest(v_units) x where not exists (
        select 1 from repair_order_units where repair_order_id = v_ro.id and stock_item_id = x
           and coalesce(ownership, 'carres_owned') <> 'carres_owned')) then
    raise exception 'owner consent is only for Units Carres does not own on this Repair Order'
      using errcode = '22023', detail = 'unit_not_consent_scope';
  end if;

  insert into repair_order_owner_consents (repair_order_id, stock_item_ids, outcome, evidence, note, recorded_by)
  values (v_ro.id, v_units, v_outcome, btrim(p_input->>'evidence'),
          case when coalesce(p_input->>'note', '') ~ '[^[:space:]]' then btrim(p_input->>'note') end, auth.uid())
  returning id into v_id;

  insert into audit_log (role, actor_text, action, ref)
  values (v_role, auth.uid()::text, 'repair_order_record_owner_consent',
          format('%s · %s · %s Unit(s)', v_ro.ro_no, v_outcome, cardinality(v_units)));
  return v_id;
end;
$fn$;
revoke all on function public.repair_order_record_owner_consent(uuid, jsonb) from public, anon;
grant execute on function public.repair_order_record_owner_consent(uuid, jsonb) to authenticated;

-- ── cancel: before pickup only ───────────────────────────────────────────────
create or replace function public.repair_order_cancel(p_ro_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role app_role := public._repair_order_gate();
  v_ro   repair_orders;
begin
  select * into v_ro from repair_orders where id = p_ro_id for update;
  if not found then
    raise exception 'Repair Order not found' using errcode = 'P0002', detail = 'ro_not_found';
  end if;
  if v_ro.cancelled_at is not null then
    raise exception '% is already cancelled', v_ro.ro_no using errcode = '22023', detail = 'ro_cancelled';
  end if;
  if coalesce(p_reason, '') !~ '[^[:space:]]' then
    raise exception 'Say why it is cancelled' using errcode = '22023', detail = 'reason_required';
  end if;
  -- Goods that left are a physical journey: Stock owns what happens next.
  if exists (select 1 from arrival_sources a join arrival_source_events e on e.source_id = a.id
              where a.repair_order_id = v_ro.id and e.kind in ('collected', 'carrier_received')) then
    raise exception 'the goods have been picked up; this Repair Order can no longer be cancelled'
      using errcode = '22023', detail = 'already_picked_up';
  end if;
  -- A planned pickup is Stock's record: cancel it there first, so the two
  -- records can never disagree about whether the goods are going.
  if exists (select 1 from arrival_sources where repair_order_id = v_ro.id and cancelled_at is null) then
    raise exception 'cancel the planned repair pickup first' using errcode = '22023', detail = 'pickup_planned';
  end if;

  update repair_orders set cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = btrim(p_reason)
   where id = v_ro.id;
  update repair_order_units set released_at = now() where repair_order_id = v_ro.id and released_at is null;

  insert into audit_log (role, actor_text, action, ref)
  values (v_role, auth.uid()::text, 'repair_order_cancel', v_ro.ro_no || ' · ' || btrim(p_reason));
  return jsonb_build_object('id', v_ro.id, 'cancelled', true);
end;
$fn$;
revoke all on function public.repair_order_cancel(uuid, text) from public, anon;
grant execute on function public.repair_order_cancel(uuid, text) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 5 · THE RETURN LEG REFERENCES THE RO (§9.7 conflict 1)
-- ════════════════════════════════════════════════════════════════════════════

alter table public.arrival_sources
  add column if not exists repair_order_id uuid references public.repair_orders(id);
create index if not exists arrival_sources_repair_order_idx on public.arrival_sources (repair_order_id);

-- 0490's `arrival_sources_check2` (repair-return needs a Claim or a Case)
-- widens to "or an authorised Repair Order". Nothing existing can violate the
-- wider rule. Its physical checks live in the function and are unchanged.
alter table public.arrival_sources drop constraint if exists arrival_sources_check2;
alter table public.arrival_sources drop constraint if exists arrival_sources_repair_return_source;
alter table public.arrival_sources add constraint arrival_sources_repair_return_source check (
  kind <> 'repair-return' or claim_id is not null or case_id is not null or repair_order_id is not null
);
alter table public.arrival_sources drop constraint if exists arrival_sources_repair_order_only_for_repair;
alter table public.arrival_sources add constraint arrival_sources_repair_order_only_for_repair check (
  repair_order_id is null or kind = 'repair-return'
);

-- arrival_source_create(p_input jsonb) — starts from the 0560 body, which is
-- byte-for-byte production's (pg_get_functiondef, 2026-09-28). 0602 changes:
--   · `repair_order_id` in the input names an authorised (not cancelled) RO;
--     the RO's Claim (if any) becomes the source's Claim; no Case may ride too
--   · the RO's Units only, still active on it
--   · source_no = the RO's own `ro_no` — no second RO number is minted
--   · the Claim/Case outcome gates apply only when no RO authorises the repair
-- Every other line, including both non-blank guards, is carried unchanged.
CREATE OR REPLACE FUNCTION public.arrival_source_create(p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 s arrival_sources; u ops_stock_items; cl supplier_claims; ca service_cases;
 v_id uuid := (p_input->>'id')::uuid; v_kind text := p_input->>'kind';
 v_units uuid[]; v_unit_id uuid; v_new_id uuid; v_no text;
 v_claim uuid := nullif(p_input->>'claim_id','')::uuid;
 v_case uuid := nullif(p_input->>'case_id','')::uuid;
 -- 0490: a failed-delivery return bound to the Delivery Visit that failed.
 v_attempt uuid := nullif(p_input->>'attempt_id','')::uuid;
 at delivery_attempts; v_attempt_order uuid;
 v_from uuid := nullif(p_input->>'from_site_id','')::uuid;
 v_to uuid := (p_input->>'to_site_id')::uuid;
 -- 0602: the Repair Order that authorises a repair-return.
 v_ro_id uuid := nullif(p_input->>'repair_order_id','')::uuid;
 ro repair_orders;
begin
 perform arrival_source_gate();
 perform pg_advisory_xact_lock(hashtextextended(v_id::text,0));
 select * into s from arrival_sources where id=v_id;
 if found then
  if s.created_by <> auth.uid() or not exists(select 1 from arrival_source_events where source_id=v_id and kind='planned' and payload=p_input) then raise exception 'source key already used' using errcode='40001'; end if;
  return to_jsonb(s);
 end if;
 if v_kind not in ('transfer','customer-return','failed-delivery-return','repair-return','supplier-replacement') or coalesce(p_input->>'reason', '') !~ '[^[:space:]]' then raise exception 'source type and reason required' using errcode='22023'; end if;
 -- 0602: an RO names only a repair-return, and it IS the authorising source.
 if v_ro_id is not null then
  if v_kind <> 'repair-return' then raise exception 'only a repair return is bound to a Repair Order' using errcode='22023'; end if;
  if v_case is not null then raise exception 'a Repair Order return names the Repair Order, not a Case' using errcode='22023'; end if;
  select * into ro from repair_orders where id=v_ro_id for update;
  if not found then raise exception 'Repair Order not found' using errcode='P0002'; end if;
  if ro.cancelled_at is not null then raise exception 'the Repair Order is cancelled' using errcode='22023'; end if;
  if v_claim is not null and v_claim is distinct from ro.supplier_claim_id then raise exception 'the Claim is not the Repair Order''s Claim' using errcode='22023'; end if;
  v_claim := ro.supplier_claim_id;
 end if;
 select array_agg(value::uuid order by value) into v_units from jsonb_array_elements_text(p_input->'unit_ids');
 if coalesce(cardinality(v_units),0)=0 or cardinality(v_units)>200 or cardinality(v_units) <> (select count(distinct x) from unnest(v_units) x) then raise exception 'name each exact Unit once' using errcode='22023'; end if;
 if not exists(select 1 from stock_operating_parties where id=(p_input->>'party_id')::uuid and active) then raise exception 'choose an active operating party' using errcode='22023'; end if;
 if v_claim is not null then select * into cl from supplier_claims where id=v_claim for update; if not found then raise exception 'Claim not found' using errcode='P0002'; end if; end if;
 if v_case is not null then select * into ca from service_cases where id=v_case for update; if not found then raise exception 'Case not found' using errcode='P0002'; end if; end if;
 if v_attempt is not null then
  if v_kind <> 'failed-delivery-return' then raise exception 'only a failed-delivery return is bound to a Delivery Visit' using errcode='22023'; end if;
  select * into at from delivery_attempts where id=v_attempt; if not found then raise exception 'Delivery Visit not found' using errcode='P0002'; end if;
  if at.result not in ('failed','partial') then raise exception 'goods come back from a failed or partially delivered visit' using errcode='22023'; end if;
  v_attempt_order := at.order_id;
 end if;
 if v_case is not null then
  if coalesce((p_input->'case_approval'->>'approved')::boolean,false) is not true or coalesce(p_input->'case_approval'->>'note', '') !~ '[^[:space:]]' or jsonb_typeof(p_input->'case_approval'->'condition_required') is distinct from 'boolean' or nullif(p_input->'case_approval'->>'photo_date','') is null then raise exception 'record the Case remedy approval and evidence first' using errcode='22023'; end if;
  if (p_input->'case_approval'->>'photo_date')::date>(now() at time zone 'Asia/Kuala_Lumpur')::date then raise exception 'evidence date cannot be in the future' using errcode='22023'; end if;
  if jsonb_typeof(p_input->'case_approval'->'evidence_paths') is distinct from 'array' or jsonb_array_length(p_input->'case_approval'->'evidence_paths')=0 then raise exception 'Case evidence required' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements_text(p_input->'case_approval'->'evidence_paths') path where not exists(select 1 from jsonb_array_elements(ca.evidence) file where file->>'path'=path and (not (p_input->'case_approval'->>'condition_required')::boolean or file->>'kind'='photo'))) then raise exception 'approval evidence must belong to the Case; condition review needs photos' using errcode='22023'; end if;
  if (p_input->'case_approval'->>'condition_required')::boolean and not coalesce(p_input->'case_approval'->'passed_conditions' @> '["no_stain","no_liquid_odour","no_pests","sanitary","no_tear_burn_cut","no_customer_damage","correct_item","safe_wrapped"]'::jsonb,false) then raise exception 'condition check failed or missing; do not book collection' using errcode='22023'; end if;
 end if;
 -- The owning outcome is read, never inferred from the independent execution layer.
 -- 0602: a Repair Order is itself the authorised repair commission.
 if v_kind='repair-return' and v_ro_id is null and ((v_claim is not null and cl.customer_resolution is distinct from 'repair') or (v_claim is null and ca.order_id is null)) then raise exception 'record the authorised repair outcome in the Claim first' using errcode='22023'; end if;
 if v_kind='supplier-replacement' and (cl.id is null or cl.customer_resolution is distinct from 'replace') then raise exception 'record the authorised replacement outcome in the Claim first' using errcode='22023'; end if;
 if v_kind in ('customer-return','failed-delivery-return') and v_attempt is null and ca.order_id is null then raise exception 'the Case must name its Sales Order' using errcode='22023'; end if;
 v_no := case when v_kind='transfer' then allocate_formal_document_code('TR',v_id::text)
              -- 0602: the commission owns the number; the return leg references it.
              when v_ro_id is not null then ro.ro_no
              when v_kind='repair-return' then allocate_formal_document_code('RO',v_id::text)
              when v_claim is not null then cl.claim_no
              -- 0490: the paper the goods went out on names the return.
              when v_attempt is not null then coalesce(at.do_number, 'SO-' || (select so::text from orders where id=v_attempt_order))
              else ca.case_no end;
 insert into arrival_sources(id,source_no,kind,claim_id,case_id,attempt_id,from_site_id,to_site_id,party_id,expected_date,collection_date,reason,created_by,sales_order_ref,case_approval,repair_order_id)
 values(v_id,v_no,v_kind,v_claim,v_case,v_attempt,v_from,v_to,(p_input->>'party_id')::uuid,(p_input->>'expected_date')::date,nullif(p_input->>'collection_date','')::date,btrim(p_input->>'reason'),auth.uid(),nullif(btrim(p_input->>'sales_order_ref'),''),case when v_case is not null then (p_input->'case_approval')||jsonb_build_object('approved_by',auth.uid(),'approved_at',now()) else null end,v_ro_id) returning * into s;
 foreach v_unit_id in array v_units loop
  select * into u from ops_stock_items where id=v_unit_id for update;
  if not found or u.qty<>1 then raise exception 'an exact Unit is required' using errcode='22023'; end if;
  -- 0602: an RO return carries only that RO's own, still-active Units.
  if v_ro_id is not null and not exists(select 1 from repair_order_units where repair_order_id=v_ro_id and stock_item_id=u.id and released_at is null) then raise exception 'Unit is not on this Repair Order' using errcode='22023'; end if;
  if exists(select 1 from arrival_source_units au join arrival_sources a on a.id=au.source_id where (au.stock_item_id=u.id or au.replaces_item_id=u.id) and a.cancelled_at is null and not exists(select 1 from receiving_unit_results ur join warehouse_receipts r on r.id=ur.receipt_id where r.arrival_source_id=a.id and r.status='posted' and ur.stock_item_id=au.stock_item_id and ur.outcome in ('received','received_with_issue'))) then raise exception 'Unit already has open arrival work' using errcode='40001'; end if;
  if v_kind='transfer' and (u.warehouse_id is distinct from v_from or u.status not in ('free','reserved')) then raise exception 'Unit must be at origin and movable' using errcode='22023'; end if;
  if v_kind='repair-return' and (v_from is null or u.warehouse_id is distinct from v_from or u.status not in ('free','reserved','on_hold')) then raise exception 'repair needs the exact Units at the recorded origin Site' using errcode='22023'; end if;
  if v_kind='transfer' and u.reserved_ref is not null and u.reserved_ref is distinct from nullif(btrim(p_input->>'sales_order_ref'),'') then raise exception 'a reserved Unit requires its owning Sales Order transfer instruction' using errcode='22023'; end if;
  if v_kind in ('repair-return','supplier-replacement') and v_claim is not null and u.hold_claim_id is distinct from v_claim then raise exception 'Unit does not belong to this Claim' using errcode='22023'; end if;
  if v_kind in ('customer-return','failed-delivery-return') and v_attempt is null and u.sold_order_id is distinct from ca.order_id then raise exception 'Unit does not belong to the Case Sales Order' using errcode='22023'; end if;
  -- 0490: a Unit coming back from a failed visit is one the visit's own document required
  -- (0424 scope) and is still reserved to that order, with the partner as its holder.
  if v_attempt is not null and not exists(select 1 from delivery_order_units du join ops_delivery_orders d on d.id=du.delivery_order_id where du.item_id=u.id and d.order_id=v_attempt_order and d.do_number is not distinct from at.do_number) then raise exception 'Unit was not on the failed visit''s Delivery Order' using errcode='22023'; end if;
  if v_attempt is not null and u.status <> 'reserved' then raise exception 'a Unit coming back from a failed visit is still reserved to its order' using errcode='22023'; end if;
  if v_kind='repair-return' and v_ro_id is null and v_claim is null and u.sold_order_id is distinct from ca.order_id then raise exception 'Unit does not belong to the Case Sales Order' using errcode='22023'; end if;
  if v_kind in ('customer-return','failed-delivery-return') and v_attempt is null and u.status not in ('sold','transferred') then raise exception 'Unit is already at Carres; use its inspection work' using errcode='22023'; end if;
  if v_kind <> 'supplier-replacement' and u.status in ('voided','written_off','returned_to_supplier') then raise exception 'ended Unit cannot return on this source' using errcode='22023'; end if;
  if v_kind='supplier-replacement' then
   -- New physical object: allocate identity from the existing single authority.
   -- No po_no: the original PO Receiving door must never consume this separately
   -- authorised replacement. Original PO lineage remains through Claim/replaces_item_id.
   insert into ops_stock_items(unit_code,sku,warehouse_id,status,supplier,po_no,ownership,qty)
   values(allocate_unit_id(),u.sku,v_to,'incoming',u.supplier,null,u.ownership,1) returning id into v_new_id;
   insert into arrival_source_units values(v_id,v_new_id,u.id,'incoming',null);
  else insert into arrival_source_units values(v_id,u.id,null,u.status,u.holder_party_id); end if;
 end loop;
 insert into arrival_source_events(source_id,kind,occurred_at,actor_id,payload)
 values(v_id,'planned',now(),auth.uid(),p_input);
 return to_jsonb(s);
end $function$;

-- ════════════════════════════════════════════════════════════════════════════
-- 6 · sanity — the catalog, never a row count (red line 8)
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_fn text;
begin
  if exists (select 1 from pg_policies where schemaname = 'public'
              and tablename in ('repair_orders', 'repair_order_units', 'repair_order_supplier_replies',
                                'repair_order_owner_consents', 'document_sends')
              and cmd <> 'SELECT') then
    raise exception 'sanity: a repair order table has a write policy';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public'
              and table_name = 'repair_order_units' and column_name in ('qty', 'quantity')) then
    raise exception 'sanity: repair_order_units grew a quantity column (§9.7: one Unit per row)';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public'
              and table_name = 'repair_orders' and column_name = 'status') then
    raise exception 'sanity: repair_orders grew a stored status; stages are derived from facts';
  end if;
  foreach v_fn in array array[
    'public.repair_order_create(jsonb)',
    'public.repair_order_issue(uuid,text,text,text)',
    'public.repair_order_record_supplier_receipt(uuid,timestamptz,text,text,date,text)',
    'public.repair_order_record_supplier_reply(uuid,jsonb)',
    'public.repair_order_record_owner_consent(uuid,jsonb)',
    'public.repair_order_cancel(uuid,text)'
  ] loop
    if has_function_privilege('anon', v_fn, 'execute') then
      raise exception 'sanity: anon can execute %', v_fn;
    end if;
    if not has_function_privilege('authenticated', v_fn, 'execute') then
      raise exception 'sanity: authenticated lost execute on %', v_fn;
    end if;
  end loop;
end $$;

commit;

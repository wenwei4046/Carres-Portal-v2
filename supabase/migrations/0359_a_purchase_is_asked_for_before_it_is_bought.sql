-- ---------------------------------------------------------------------------
-- 0359 · A purchase is asked for before it is bought
-- (CARD-2026-08-18-manual-purchase §3-§5, Jess 2026-08-18)
--
-- 0319 wrote, and 0323 kept: "No proposal and no approval layer, because
-- today one person decides and Operation executes." THIS MIGRATION IS THE
-- RULING THAT CHANGES THAT SENTENCE (the card says so in those words).
-- Manual Purchase becomes the Purchase Requisition every mature ERP carries
-- (SAP ME57, Dynamics purchase requisitions, Oracle AutoCreate): anyone
-- raises a request, an approver decides it, only then is it bought.
--
-- WHAT THIS ADDS
--   · `purchase_requests`  — the HEADER a human raises: one purpose, one
--     destination, one needed-by, one WHY (never blank — it is the sentence
--     the approver reads; "restock" answers nothing), and the approval
--     decision. One request, one decision.
--   · `purchase_demands.request_id`  — lines join their header. Loose legacy
--     rows (raised before requests existed) keep NULL; clean-start law says
--     they are never backfilled.
--   · `purchase_demands.approved_qty` — the approver may CUT the quantity;
--     cutting is not refusing, and the original stays on the record (`qty`).
--   · `spare_parts` joins the purpose CHECK and the door. 0323 left it out
--     because no business ruling had asked for it; the 2026-08-18 ruling did.
--   · `purchasing_purpose_approval`  — the per-purpose approval switch
--     (Settings §8). It carries NO amount: a threshold would make three
--     operators judge prices, and Purchasing has no money.
--
-- WHAT STAYS DERIVED (0323's own law, kept): open / ordered / done derive
-- from po_id; `Arrived` derives from the linked PO's posted receipt. Only
-- the states a human DECIDES (approval, refusal, Not going ahead) get
-- columns. 0320's partial-issue and 0321's cancel are reused, not rebuilt.
-- ---------------------------------------------------------------------------

set search_path = public, pg_temp;

-- ---------------------------------------------------------------------
-- 1. The header
-- ---------------------------------------------------------------------

create sequence if not exists public.purchase_request_no_seq;

create table if not exists public.purchase_requests (
  id             uuid primary key default gen_random_uuid(),
  -- `REQ-` and never `PR-`: 2990s already prints PR for a purchase return,
  -- and a prefix a new hire can read two ways gets filed wrong (card §7).
  req_no         text not null unique
                 default 'REQ-' || lpad(nextval('public.purchase_request_no_seq')::text, 4, '0'),
  purpose        text not null check (purpose in
                   ('ready_stock', 'display', 'office', 'warranty', 'spare_parts')),
  destination_id uuid not null references public.purchasing_destinations(id),
  required_by    date,
  why            text not null check (btrim(why) <> ''),
  -- Stamped at creation from the switch, so flipping the switch later never
  -- silently re-gates a request already on its way.
  approval_required boolean not null,
  approved_at    timestamptz,
  approved_by    uuid references public.app_users(id),
  refused_at     timestamptz,
  refused_by     uuid references public.app_users(id),
  refuse_reason  text,
  created_by     uuid references public.app_users(id),
  created_at     timestamptz not null default now(),
  -- A refusal without its reason is a request nobody can explain in three
  -- months (card §4). Approve and refuse are one decision, never both.
  constraint purchase_requests_refuse_pair check (
    (refused_at is null and refused_by is null and refuse_reason is null)
    or (refused_at is not null and refused_by is not null
        and btrim(coalesce(refuse_reason, '')) <> '')
  ),
  constraint purchase_requests_approve_pair check (
    (approved_at is null and approved_by is null)
    or (approved_at is not null and approved_by is not null)
  ),
  constraint purchase_requests_one_decision check (
    approved_at is null or refused_at is null
  )
);

comment on table public.purchase_requests is
  'The Manual Purchase request header (card 2026-08-18): one purpose, one destination, one why, one approval decision. Lines live in purchase_demands.request_id. States derive: Waiting for approval = approval_required and undecided; Ready to order = approved or not required; Ordered/Arrived derive from the lines'' po_id and its posted receipt; Not going ahead = every line cancelled (0321''s door, reason required).';
comment on column public.purchase_requests.why is
  'The sentence the approver reads. Door-enforced non-blank; "restock" answers nothing.';
comment on column public.purchase_requests.approval_required is
  'Stamped from purchasing_purpose_approval at creation. A purpose whose switch is off starts at Ready to order and still records why it was bought.';

alter table public.purchase_requests enable row level security;

drop policy if exists purchase_requests_read on public.purchase_requests;
create policy purchase_requests_read on public.purchase_requests
  for select using (public.is_internal());

revoke all on table public.purchase_requests from public, anon, authenticated;
grant select on table public.purchase_requests to authenticated;

-- ---------------------------------------------------------------------
-- 2. Lines join their header; the approver can cut a line
-- ---------------------------------------------------------------------

alter table public.purchase_demands
  add column if not exists request_id  uuid references public.purchase_requests(id),
  add column if not exists approved_qty int;

alter table public.purchase_demands
  drop constraint if exists purchase_demands_approved_within_qty;
alter table public.purchase_demands
  add constraint purchase_demands_approved_within_qty check (
    approved_qty is null or (approved_qty >= 0 and approved_qty <= qty)
  );

create index if not exists purchase_demands_request_idx
  on public.purchase_demands (request_id) where request_id is not null;

comment on column public.purchase_demands.request_id is
  'The Manual Purchase request this line was raised under. NULL only on loose rows raised before requests existed (clean-start: never backfilled).';
comment on column public.purchase_demands.approved_qty is
  'The approver''s cut. NULL = approved as asked. Issue acts on coalesce(approved_qty, qty); the original ask stays in qty.';

-- The fifth purpose. 0323 deliberately left it out ("no business ruling had
-- asked"); Jess's 2026-08-18 ruling names it, so the CHECK and the door admit
-- it together — a word offered in a dropdown that the server refuses by name
-- is the disease (0322).
alter table public.purchase_demands
  drop constraint if exists purchase_demands_purpose_check;
alter table public.purchase_demands
  add constraint purchase_demands_purpose_check check (purpose in
    ('ready_stock', 'display', 'office', 'warranty', 'spare_parts'));

-- 0323's table comment ends "No proposal and no approval layer, because today
-- one person decides and Operation executes." The card is the ruling that
-- changes that sentence, and orders it overwritten in the same migration.
comment on table public.purchase_demands is
  'A typed purchase demand line. Since 0359 a new line belongs to a purchase_requests header and the request carries the approval decision (Jess 2026-08-18 — this overwrites 0319/0323''s "no approval layer" ruling). No status column: open/ordered/done derive from po_id; the request''s states derive the same way.';

-- ---------------------------------------------------------------------
-- 3. The per-purpose approval switch (Settings §8)
-- ---------------------------------------------------------------------

create table if not exists public.purchasing_purpose_approval (
  purpose           text primary key check (purpose in
                      ('ready_stock', 'display', 'office', 'warranty', 'spare_parts')),
  requires_approval boolean not null default true,
  updated_by        uuid references public.app_users(id),
  updated_at        timestamptz not null default now()
);

comment on table public.purchasing_purpose_approval is
  'Per-purpose approval switch (card §4). Carries NO amount: a threshold would make three operators judge prices. A customer order requires no approval anywhere — the order IS the authority. Written only by purchasing_set_purpose_approval().';

insert into public.purchasing_purpose_approval (purpose)
values ('ready_stock'), ('display'), ('office'), ('warranty'), ('spare_parts')
on conflict (purpose) do nothing;

alter table public.purchasing_purpose_approval enable row level security;
drop policy if exists purchasing_purpose_approval_read on public.purchasing_purpose_approval;
create policy purchasing_purpose_approval_read on public.purchasing_purpose_approval
  for select using (public.is_internal());
revoke all on table public.purchasing_purpose_approval from public, anon, authenticated;
grant select on table public.purchasing_purpose_approval to authenticated;

create or replace function public.purchasing_set_purpose_approval(
  p_purpose text,
  p_value   boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role text := (select public.purchasing_settings_gate());
  v_old  boolean;
begin
  if p_purpose is null or p_purpose not in
     ('ready_stock', 'display', 'office', 'warranty', 'spare_parts') then
    raise exception 'purpose % is not a purpose', p_purpose
      using errcode = '22023', detail = 'unknown_purpose';
  end if;
  if p_value is null then
    raise exception 'value required' using errcode = '22023', detail = 'invalid_value';
  end if;

  select requires_approval into v_old
    from purchasing_purpose_approval where purpose = p_purpose for update;

  update purchasing_purpose_approval
     set requires_approval = p_value, updated_by = auth.uid(), updated_at = now()
   where purpose = p_purpose;

  perform public.purchasing_record_change(
    v_role, 'purpose_approval:' || p_purpose, null, null,
    v_old::text, p_value::text,
    'set approval for ' || p_purpose || ' to ' || p_value::text);
end;
$fn$;

revoke execute on function public.purchasing_set_purpose_approval(text, boolean)
  from public, anon;
grant execute on function public.purchasing_set_purpose_approval(text, boolean)
  to authenticated;

-- ---------------------------------------------------------------------
-- 4. The doors
-- ---------------------------------------------------------------------

-- 4a. The header door.
create or replace function public.purchasing_create_request(
  p_purpose        text,
  p_destination_id uuid,
  p_why            text,
  p_required_by    date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role     app_role;
  v_required boolean;
  v_id       uuid;
  v_no       text;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation', 'principal') then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  if p_purpose is null or p_purpose not in
     ('ready_stock', 'display', 'office', 'warranty', 'spare_parts') then
    raise exception 'purpose % is not a purpose', p_purpose
      using errcode = '22023', detail = 'unknown_purpose';
  end if;

  if nullif(btrim(coalesce(p_why, '')), '') is null then
    -- The door enforces it, not only the button: a blank why is a request
    -- the approver cannot read.
    raise exception 'why may not be blank' using errcode = '22023', detail = 'why_required';
  end if;

  if not exists (
    select 1 from purchasing_destinations where id = p_destination_id and active
  ) then
    raise exception 'unknown destination' using errcode = '22023', detail = 'unknown_destination';
  end if;

  select requires_approval into v_required
    from purchasing_purpose_approval where purpose = p_purpose;
  -- A missing switch row defaults to REQUIRING approval — the safe side.
  v_required := coalesce(v_required, true);

  insert into purchase_requests (purpose, destination_id, required_by, why,
                                 approval_required, created_by)
  values (p_purpose, p_destination_id, p_required_by, btrim(p_why),
          v_required, auth.uid())
  returning id, req_no into v_id, v_no;

  return jsonb_build_object('id', v_id, 'req_no', v_no,
                            'approval_required', v_required);
end;
$fn$;

revoke execute on function public.purchasing_create_request(text, uuid, text, date)
  from public, anon;
grant execute on function public.purchasing_create_request(text, uuid, text, date)
  to authenticated;

-- 4b. The line door keeps its name and gains its header. The ONE caller (the
-- retired 600px dialog's route) sent named parameters, and this stays a
-- SINGLE function — dropped and recreated, never overloaded (guardrail #8:
-- two signatures is the failure; one signature with a defaulted new
-- parameter is not).
drop function if exists public.purchasing_create_demand(text, int, uuid, date, text, text);

create function public.purchasing_create_demand(
  p_sku            text,
  p_qty            int,
  p_destination_id uuid,
  p_required_by    date default null,
  p_remark         text default null,
  p_purpose        text default 'ready_stock',
  p_request_id     uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role     app_role;
  v_supplier uuid;
  v_id       uuid;
  v_req      purchase_requests%rowtype;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation', 'principal') then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  if p_purpose is null or p_purpose not in
     ('ready_stock', 'display', 'office', 'warranty', 'spare_parts') then
    raise exception 'purpose % is not a purpose', p_purpose
      using errcode = '22023', detail = 'unknown_purpose';
  end if;
  if p_qty is null or p_qty < 1 then
    raise exception 'qty must be at least 1' using errcode = '22023', detail = 'invalid_qty';
  end if;

  if p_request_id is not null then
    select * into v_req from purchase_requests where id = p_request_id;
    if not found then
      raise exception 'unknown request' using errcode = '22023', detail = 'unknown_request';
    end if;
    -- A line inherits its header's meaning; a line that contradicts it is a
    -- second truth (Law D).
    if v_req.purpose <> p_purpose then
      raise exception 'line purpose % does not match request %', p_purpose, v_req.purpose
        using errcode = '22023', detail = 'purpose_mismatch';
    end if;
    if v_req.destination_id <> p_destination_id then
      raise exception 'line destination does not match request'
        using errcode = '22023', detail = 'destination_mismatch';
    end if;
    if v_req.refused_at is not null then
      raise exception 'request is refused' using errcode = '22023', detail = 'request_refused';
    end if;
  end if;

  -- THE SUPPLIER IS DERIVED, NEVER CHOSEN (Jess, 2026-08-03; kept verbatim
  -- from 0323). A product has exactly one factory; asking a human to pick one
  -- is asking them to get it wrong.
  select supplier_id into v_supplier from product_skus where sku = p_sku;
  if not found then
    raise exception 'unknown sku %', p_sku using errcode = '22023', detail = 'unknown_sku';
  end if;
  if v_supplier is null then
    raise exception 'sku % has no supplier', p_sku
      using errcode = '22023', detail = 'sku_has_no_supplier';
  end if;

  if not exists (
    select 1 from purchasing_destinations where id = p_destination_id and active
  ) then
    raise exception 'unknown destination' using errcode = '22023', detail = 'unknown_destination';
  end if;

  insert into purchase_demands
    (purpose, sku, supplier_id, destination_id, qty, required_by, remark,
     request_id, created_by)
  values
    (p_purpose, p_sku, v_supplier, p_destination_id, p_qty, p_required_by,
     nullif(btrim(coalesce(p_remark, '')), ''), p_request_id, auth.uid())
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'supplier_id', v_supplier);
end;
$fn$;

revoke execute on function public.purchasing_create_demand(text, int, uuid, date, text, text, uuid)
  from public, anon;
grant execute on function public.purchasing_create_demand(text, int, uuid, date, text, text, uuid)
  to authenticated;

-- ---------------------------------------------------------------------
-- VERIFY (read-only; a migration never asserts a production row count)
-- ---------------------------------------------------------------------
--   select req_no from purchase_requests limit 1;
--   -- EXPECT: no rows yet, or REQ-0001-style numbers
--
--   -- NEGATIVE CONTROL — the why gate must fire:
--   --   select purchasing_create_request('display', '<dest>', '   ');
--   --   EXPECT: ERROR why may not be blank (why_required)
--
--   -- NEGATIVE CONTROL — a dealer must be refused:
--   --   (as dealer) select purchasing_create_request('display', '<dest>', 'x');
--   --   EXPECT: ERROR not permitted (42501)
--
--   -- The switch defaults ON for all five:
--   select purpose, requires_approval from purchasing_purpose_approval order by 1;
--   -- EXPECT: five rows, all true

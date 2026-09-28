-- =============================================================================
-- 0589_a_unit_problem_is_reported_through_the_issue_door.sql
-- Stock MASTER §6 · §7 Unit Detail · §12.4 — owner rulings 2026-09-25 and the
-- Unit Detail `⋮` design the owner approved 2026-09-26.
--
-- SUPERSEDES 0588, WHICH WAS NEVER APPLIED ANYWHERE. 0588 recreated
-- `stock_unit_availability_v` in its 0453 shape and PostgreSQL refused it on
-- production ("cannot drop columns from view"): 0471 had since added
-- `reserved_order_line_id` and `reserved_purchase_demand_id` to the view.
-- A committed migration is never altered (CLAUDE.md §5.6), so this file is
-- the same change with the view in its live shape; 0588 stays in the
-- repository unapplied, like 0318/0347 before it.
--
-- WHAT THIS ADDS
--   1 · `ops_stock_items.sale_cleared_at` — the owner's clearance ruling: a
--       `Damaged` Unit may be `Available` again after an explicit
--       `Make available for sale`, while its Stock Condition keeps saying
--       Damaged so Sales sees exactly what it sells. The availability
--       arithmetic (0371) gains that fifth fact; the four-argument form stays
--       as the un-cleared reading so no caller breaks (Law D: ONE arithmetic).
--       Any later hold or repair clears the clearance again.
--   2 · `stock_unit_report_problem` — Report a problem from Unit Detail is the
--       ONE Issue door (`issue_record_issue`, 0526) plus the protective control
--       the Portal derives (§6: the observer never chooses Hold/Quarantine):
--       a free Unit enters the inspection hold (`ops_stock_hold_unit`, 0341)
--       and reads `Cannot sell · Waiting inspection`; a reserved Unit keeps
--       its Sales Order reservation (§6: "an existing SO reservation stays
--       linked but is shown at risk"); observed damage is written to the
--       condition. One transaction: Issue, links, proof, first action and the
--       control commit together or not at all.
--   3 · `stock_unit_make_available` — the way back from `Cannot sell`: refused
--       while a problem is open, the Unit needs repair, is in transit or has
--       no Site; a claim hold resolves through its claim. Otherwise the 0341
--       exit door returns it to the pool and a damaged Unit is cleared for
--       clearance sale.
--   4 · the private `issue-evidence` bucket for the photos a report carries.
--
-- RLS: no policy on ops_stock_items or the issue tables changes. The two new
--   doors are SECURITY DEFINER with the same operation/principal gate every
--   stock door carries. Bucket policies mirror 0477 (private, operation reads
--   and inserts, no update, no delete).
-- NO ROW COUNT IS ASSERTED (CLAUDE.md §5.8).
-- =============================================================================

begin;
set search_path = public, pg_temp;

-- ── 1 · clearance ────────────────────────────────────────────────────────────

alter table public.ops_stock_items
  add column if not exists sale_cleared_at timestamptz;

comment on column public.ops_stock_items.sale_cleared_at is
  '0589: when an authorised person made a Damaged Unit available for clearance sale (owner ruling 2026-09-25). Null = not cleared; a hold or repair clears it again.';

create or replace function public.unit_availability(
  p_status       text,
  p_needs_repair boolean,
  p_hold_reason  text,
  p_condition    text,
  p_sale_cleared boolean
)
returns text
language sql
immutable
as $$
  select case
    when p_status in ('sold','voided','returned_to_supplier','written_off') then 'ended'
    when p_status = 'transferred' then 'in_transit'
    when p_status = 'incoming'    then 'incoming'
    when p_status = 'reserved'    then 'reserved'
    when p_status = 'on_hold'     then 'not_available'
    when p_status = 'free' and coalesce(p_needs_repair, false) then 'not_available'
    -- A damaged Unit is controlled, not sellable — unless somebody explicitly
    -- made it available for clearance sale (owner ruling 2026-09-25).
    when p_status = 'free' and p_condition = 'damaged' and not coalesce(p_sale_cleared, false) then 'not_available'
    when p_status = 'free'        then 'available'
    else 'not_available'
  end;
$$;

comment on function public.unit_availability(text, boolean, text, text, boolean) is
  '0589 — THE availability arithmetic: status, repair flag, protection reason, condition AND the clearance fact. Nothing may re-derive this from a status alone.';

-- The four-argument form is the un-cleared reading; every earlier caller keeps working.
create or replace function public.unit_availability(
  p_status       text,
  p_needs_repair boolean,
  p_hold_reason  text,
  p_condition    text
)
returns text
language sql
immutable
as $$
  select public.unit_availability(p_status, p_needs_repair, p_hold_reason, p_condition, false);
$$;

create or replace view public.stock_unit_availability_v
  with (security_invoker = true) as
 SELECT id,
    unit_code,
    sku,
    stock_sku_category(sku) AS category,
    warehouse_id,
    holder_party_id,
    ownership,
    supplier,
    po_no,
    status,
    condition,
    needs_repair,
    hold_reason,
    reserved_ref,
    sold_order_id,
    qty,
    date_in,
    sold_at,
    last_verified_at,
    unit_availability(status, needs_repair, hold_reason, condition, sale_cleared_at is not null) AS availability,
    unit_lifecycle_outcome(status) AS lifecycle_outcome,
    identity_scope,
    reserved_order_line_id,
    reserved_purchase_demand_id
   FROM ops_stock_items i;

-- A hold or a repair ends the clearance; the next Make available for sale is a new decision.
create or replace function public.ops_stock_sale_clearance_reset()
returns trigger
language plpgsql
as $fn$
begin
  if new.status = 'on_hold' or coalesce(new.needs_repair, false) then
    new.sale_cleared_at := null;
  end if;
  return new;
end;
$fn$;

drop trigger if exists ops_stock_sale_clearance_reset on public.ops_stock_items;
create trigger ops_stock_sale_clearance_reset
  before update on public.ops_stock_items
  for each row execute function public.ops_stock_sale_clearance_reset();

-- ── 2 · Report a problem — ONE door ──────────────────────────────────────────

create or replace function public.stock_unit_report_problem(
  p_request_id uuid,
  p_item_id    uuid,
  p_observed   text,
  p_issue      jsonb,
  p_links      jsonb,
  p_evidence   jsonb,
  p_action     jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role  app_role;
  v_row   ops_stock_items;
  v_issue jsonb;
  v_protection text := 'none';
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'forbidden: only operation or principal can report a Unit problem'
      using errcode = '42501', detail = 'forbidden';
  end if;
  if p_item_id is null then
    raise exception 'p_item_id required' using errcode = '22023', detail = 'invalid_input';
  end if;
  if p_observed is null or p_observed not in ('damaged','missing','wrong_item','wrong_quantity','wrong_information','not_sure') then
    raise exception '% is not an observed Unit problem', coalesce(p_observed, 'null')
      using errcode = '22023', detail = 'bad_observed';
  end if;

  select * into v_row from ops_stock_items where id = p_item_id for update;
  if not found then
    raise exception 'unit not found' using errcode = '42P01', detail = 'unit_not_found';
  end if;
  if v_row.identity_scope <> 'unit' then
    raise exception 'a counted row is not a Unit — count it, do not report it'
      using errcode = 'P0001', detail = 'not_a_unit';
  end if;

  -- The Issue, its links, proof and first action: the 0526 door, unchanged.
  v_issue := public.issue_record_issue(p_request_id, p_issue, p_links, p_evidence, p_action);
  if coalesce((v_issue->>'replayed')::boolean, false) then
    -- The same request already recorded its Issue AND its control.
    return v_issue || jsonb_build_object('protection', 'replayed');
  end if;

  -- The protective control the Portal derives (Stock MASTER §6).
  if p_observed = 'damaged' and v_row.condition <> 'damaged'
     and v_row.status in ('free','reserved') then
    update ops_stock_items
       set condition = 'damaged', updated_at = now()
     where id = p_item_id;
  end if;

  if v_row.status = 'free' then
    perform public.ops_stock_hold_unit(p_item_id, 'inspection', 'Problem reported · ' || p_observed);
    v_protection := 'held';
  elsif v_row.status = 'reserved' then
    -- The reservation stays linked and is shown at risk (§6); Sales decides.
    v_protection := 'reserved_at_risk';
  end if;

  return v_issue || jsonb_build_object('protection', v_protection);
end;
$fn$;

revoke all on function public.stock_unit_report_problem(uuid, uuid, text, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.stock_unit_report_problem(uuid, uuid, text, jsonb, jsonb, jsonb, jsonb) to authenticated;

comment on function public.stock_unit_report_problem(uuid, uuid, text, jsonb, jsonb, jsonb, jsonb) is
  '0589: Report a problem on a Unit — records the Issue through issue_record_issue and applies the derived protective control in one transaction.';

-- ── 3 · Make available for sale — the way back from Cannot sell ─────────────

create or replace function public.stock_unit_make_available(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role app_role;
  v_row  ops_stock_items;
  v_open int;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'forbidden: only operation or principal can make a Unit available'
      using errcode = '42501', detail = 'forbidden';
  end if;
  if p_item_id is null then
    raise exception 'p_item_id required' using errcode = '22023', detail = 'invalid_input';
  end if;

  select * into v_row from ops_stock_items where id = p_item_id for update;
  if not found then
    raise exception 'unit not found' using errcode = '42P01', detail = 'unit_not_found';
  end if;

  select count(*) into v_open
    from issue_links l join issues i on i.id = l.issue_id
   where l.object_kind = 'unit' and l.object_id = p_item_id::text
     and i.status not in ('closed','voided');
  if v_open > 0 then
    raise exception 'a reported problem on this Unit is still open'
      using errcode = 'P0001', detail = 'problem_open';
  end if;
  if coalesce(v_row.needs_repair, false) then
    raise exception 'unit is in repair' using errcode = 'P0001', detail = 'in_repair';
  end if;
  if v_row.status = 'transferred' then
    raise exception 'unit is on the road' using errcode = 'P0001', detail = 'in_transit';
  end if;
  if v_row.warehouse_id is null then
    raise exception 'unit has no recorded Site' using errcode = 'P0001', detail = 'no_site';
  end if;

  if v_row.status = 'on_hold' then
    if v_row.hold_claim_id is not null then
      raise exception 'unit is held under supplier claim % — resolve it through the claim', v_row.hold_claim_id
        using errcode = 'P0001', detail = 'resolve_through_claim';
    end if;
    perform public.ops_stock_resolve_unit_hold(p_item_id, 'back_to_stock', 'Made available for sale');
  elsif v_row.status <> 'free' then
    raise exception 'unit is %, not Cannot sell', v_row.status
      using errcode = 'P0001', detail = 'not_cannot_sell';
  end if;

  -- Clearance only means something for a damaged Unit; the pool sells the rest already.
  update ops_stock_items
     set sale_cleared_at = case when condition = 'damaged' then now() else sale_cleared_at end,
         updated_at = now()
   where id = p_item_id;

  select * into v_row from ops_stock_items where id = p_item_id;
  return jsonb_build_object(
    'item_id', p_item_id,
    'status', v_row.status,
    'availability', public.unit_availability(v_row.status, v_row.needs_repair, v_row.hold_reason, v_row.condition, v_row.sale_cleared_at is not null)
  );
end;
$fn$;

revoke all on function public.stock_unit_make_available(uuid) from public, anon;
grant execute on function public.stock_unit_make_available(uuid) to authenticated;

comment on function public.stock_unit_make_available(uuid) is
  '0589: Make available for sale — refused while a problem is open, in repair, in transit or without a Site; resolves a claimless hold and clears a damaged Unit for clearance sale.';

-- ── 4 · the evidence bucket ──────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('issue-evidence', 'issue-evidence', false, 20971520,
        array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists issue_evidence_ops_select on storage.objects;
drop policy if exists issue_evidence_ops_insert on storage.objects;

create policy issue_evidence_ops_select on storage.objects
  for select to authenticated
  using (bucket_id = 'issue-evidence' and (select public.app_role()) in ('operation','principal'));

create policy issue_evidence_ops_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'issue-evidence' and (select public.app_role()) in ('operation','principal'));

commit;

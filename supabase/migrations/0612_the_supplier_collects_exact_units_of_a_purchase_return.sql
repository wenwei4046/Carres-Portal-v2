-- =============================================================================
-- 0612_the_supplier_collects_exact_units_of_a_purchase_return.sql
-- Stock MASTER §12.8 · Purchasing MASTER §9.6 — Stock builds the physical
-- handover for Purchase Returns (owner approval relayed by the Purchasing
-- lane, 2026-09-29).
--
-- WHAT WAS MISSING, measured on production 2026-09-29
--   · 0609 issues a Purchase Return from a Supplier Claim and moves no stock
--     (§7.4). `purchase_return_units.actual_pickup_date`, `collected_by_name`
--     and pickup proof have NO writer, so every return reads `Not picked up`.
--   · The only existing custody exit for a claim hold, `ops_stock_resolve_hold`
--     (0299), moves EVERY held Unit of a claim at once. A supplier's driver who
--     takes two of three Units cannot be recorded with it.
--
-- WHAT THIS ADDS
--   1 · `supplier_return_handovers` — the append-only handover fact: which
--       return, which exact Units, the actual collector, the actual time, the
--       proof and the Carres person who recorded it. One request records once.
--   2 · `stock_record_supplier_return_pickup` — the ONE writer. Per exact Unit
--       it checks the Unit is on this return, not yet collected, and still held
--       under the return's own Supplier Claim; then it moves custody
--       (`on_hold` → `returned_to_supplier`, allowed by the 0341 guard only for
--       a claim hold) and writes the pickup facts Purchasing reads onto
--       `purchase_return_units`. Units not named stay open: a partial pickup
--       leaves the rest `Not picked up`.
--
-- NOT HERE: `supplier_received_date` (Purchasing records it from supplier
-- evidence); the Repair Order pickup leg (same pattern, its own slice).
--
-- RLS: the new table has RLS ENABLED with one read policy for Operation and
--   Principal; no client role may insert, update or delete (the SECURITY
--   DEFINER door writes it, and an append-only trigger refuses UPDATE/DELETE).
--   No existing policy changes.
-- NO ROW COUNT IS ASSERTED (CLAUDE.md §5.8).
-- =============================================================================

begin;
set search_path = public, pg_temp;

create table if not exists public.supplier_return_handovers (
  id                 uuid primary key default gen_random_uuid(),
  request_id         uuid not null unique,
  purchase_return_id uuid not null references public.purchase_returns(id) on delete restrict,
  collector_name     text not null check (length(btrim(collector_name)) >= 2),
  picked_up_at       timestamptz not null,
  unit_ids           uuid[] not null check (cardinality(unit_ids) > 0),
  evidence           jsonb not null check (jsonb_typeof(evidence) = 'array' and jsonb_array_length(evidence) > 0),
  note               text check (note is null or length(note) <= 300),
  recorded_by        uuid not null references auth.users(id),
  recorded_at        timestamptz not null default clock_timestamp()
);

comment on table public.supplier_return_handovers is
  '0612: Stock''s Outbound `Return to supplier` handover — exact Units, actual collector, actual time, proof. Append-only; written only by stock_record_supplier_return_pickup.';

create index if not exists supplier_return_handovers_return
  on public.supplier_return_handovers (purchase_return_id, picked_up_at);

alter table public.supplier_return_handovers enable row level security;

drop policy if exists supplier_return_handovers_read on public.supplier_return_handovers;
create policy supplier_return_handovers_read on public.supplier_return_handovers
  for select to authenticated
  using ((select public.app_role()) in ('operation', 'principal'));

revoke insert, update, delete on public.supplier_return_handovers from anon, authenticated;

create or replace function public.supplier_return_handovers_append_only()
returns trigger
language plpgsql
as $fn$
begin
  raise exception 'a supplier return handover is a recorded fact and cannot be changed'
    using errcode = 'P0001', detail = 'handover_append_only';
end;
$fn$;

drop trigger if exists supplier_return_handovers_append_only on public.supplier_return_handovers;
create trigger supplier_return_handovers_append_only
  before update or delete on public.supplier_return_handovers
  for each row execute function public.supplier_return_handovers_append_only();

-- ── the ONE writer ───────────────────────────────────────────────────────────

create or replace function public.stock_record_supplier_return_pickup(
  p_request_id         uuid,
  p_purchase_return_id uuid,
  p_unit_ids           uuid[],
  p_collector_name     text,
  p_picked_up_at       timestamptz,
  p_evidence           jsonb,
  p_note               text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role      app_role;
  v_uid       uuid := auth.uid();
  v_actor     text;
  v_pr        purchase_returns;
  v_prior     supplier_return_handovers;
  v_collector text := nullif(btrim(coalesce(p_collector_name, '')), '');
  v_note      text := nullif(btrim(coalesce(p_note, '')), '');
  v_ids       uuid[];
  v_id        uuid;
  v_line      purchase_return_units;
  v_item      ops_stock_items;
  v_proof     jsonb;
  v_handover  uuid := gen_random_uuid();
  v_open      int;
  v_total     int;
begin
  v_role := public.app_role();
  if v_uid is null or v_role is null or v_role not in ('operation', 'principal') then
    raise exception 'forbidden: only operation or principal can record a supplier pickup'
      using errcode = '42501', detail = 'forbidden';
  end if;
  if p_request_id is null or p_purchase_return_id is null then
    raise exception 'a request id and a purchase return are required'
      using errcode = '22023', detail = 'invalid_input';
  end if;

  -- The same request answers with the handover it already recorded.
  select * into v_prior from supplier_return_handovers where request_id = p_request_id;
  if found then
    if v_prior.recorded_by is distinct from v_uid then
      raise exception 'request id already used' using errcode = '23505', detail = 'request_already_used';
    end if;
    select count(*) filter (where actual_pickup_date is null), count(*)
      into v_open, v_total
      from purchase_return_units where purchase_return_id = v_prior.purchase_return_id;
    return jsonb_build_object(
      'handover_id', v_prior.id, 'units', cardinality(v_prior.unit_ids),
      'open_units', v_open, 'total_units', v_total, 'replayed', true);
  end if;

  if v_collector is null or length(v_collector) < 2 then
    raise exception 'name the person who collected the goods'
      using errcode = '22023', detail = 'collector_required';
  end if;
  if p_picked_up_at is null or p_picked_up_at > now() + interval '10 minutes' then
    raise exception 'the pickup time cannot be in the future'
      using errcode = '22023', detail = 'pickup_in_future';
  end if;
  if jsonb_typeof(p_evidence) is distinct from 'array' or jsonb_array_length(p_evidence) = 0 then
    raise exception 'add the pickup proof'
      using errcode = '22023', detail = 'proof_required';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_evidence) e
     where length(btrim(coalesce(e->>'path', ''))) = 0
        or coalesce(e->>'kind', '') not in ('photo', 'video', 'pdf')
  ) then
    raise exception 'each proof names its file and whether it is a photo, video or PDF'
      using errcode = '22023', detail = 'proof_invalid';
  end if;

  select array_agg(distinct u) into v_ids from unnest(coalesce(p_unit_ids, '{}'::uuid[])) u;
  if v_ids is null or cardinality(v_ids) = 0 then
    raise exception 'choose the Units the supplier collected'
      using errcode = '22023', detail = 'units_required';
  end if;

  select * into v_pr from purchase_returns where id = p_purchase_return_id for update;
  if not found then
    raise exception 'purchase return not found' using errcode = '42P01', detail = 'return_not_found';
  end if;
  if p_picked_up_at < date_trunc('day', v_pr.pr_doc_date) then
    raise exception 'the pickup cannot be before the return was issued (%)', v_pr.pr_no
      using errcode = '22023', detail = 'pickup_before_issue';
  end if;

  -- One proof list for every Unit of this handover, in the shape 0609's guard admits.
  select jsonb_agg(jsonb_build_object(
           'purpose', 'pickup', 'path', btrim(e->>'path'), 'kind', e->>'kind',
           'handover_id', v_handover, 'recorded_by', v_uid, 'recorded_at', clock_timestamp()))
    into v_proof
    from jsonb_array_elements(p_evidence) e;

  foreach v_id in array v_ids loop
    select * into v_line from purchase_return_units
     where purchase_return_id = v_pr.id and stock_item_id = v_id
     for update;
    if not found then
      raise exception 'Unit % is not on %',
        coalesce((select unit_code from ops_stock_items where id = v_id), v_id::text), v_pr.pr_no
        using errcode = 'P0001', detail = 'not_on_this_return';
    end if;
    if v_line.actual_pickup_date is not null then
      raise exception 'Unit % on % was already picked up', v_line.unit_code, v_pr.pr_no
        using errcode = 'P0001', detail = 'already_picked_up';
    end if;

    select * into v_item from ops_stock_items where id = v_id for update;
    if v_item.status <> 'on_hold' or v_item.hold_claim_id is distinct from v_pr.supplier_claim_id then
      raise exception 'Unit % is not held for the claim on % (it is %)', v_line.unit_code, v_pr.pr_no, v_item.status
        using errcode = 'P0001', detail = 'not_held_for_this_claim';
    end if;

    -- Custody leaves Carres. The 0341 guard admits on_hold → returned_to_supplier
    -- only for a claim hold, which the check above has just proven.
    update ops_stock_items
       set status            = 'returned_to_supplier',
           hold_released_at  = now(),
           hold_release_note = format('Collected by %s · %s', v_collector, v_pr.pr_no),
           updated_at        = now()
     where id = v_id;

    update purchase_return_units
       set actual_pickup_date = p_picked_up_at,
           collected_by_name  = v_collector,
           evidence           = evidence || v_proof
     where id = v_line.id;
  end loop;

  insert into supplier_return_handovers
    (id, request_id, purchase_return_id, collector_name, picked_up_at, unit_ids, evidence, note, recorded_by)
  values
    (v_handover, p_request_id, v_pr.id, v_collector, p_picked_up_at, v_ids, v_proof, v_note, v_uid);

  v_actor := coalesce((select name from app_users where id = v_uid), initcap(v_role::text));
  insert into audit_log (role, actor_text, action, ref)
  values (v_role, v_actor,
          format('Supplier pickup recorded · %s · %s Unit(s) · collected by %s', v_pr.pr_no, cardinality(v_ids), v_collector),
          v_pr.pr_no);

  select count(*) filter (where actual_pickup_date is null), count(*)
    into v_open, v_total
    from purchase_return_units where purchase_return_id = v_pr.id;

  return jsonb_build_object(
    'handover_id', v_handover, 'pr_no', v_pr.pr_no, 'units', cardinality(v_ids),
    'open_units', v_open, 'total_units', v_total, 'replayed', false);
end;
$fn$;

revoke all on function public.stock_record_supplier_return_pickup(uuid, uuid, uuid[], text, timestamptz, jsonb, text) from public, anon;
grant execute on function public.stock_record_supplier_return_pickup(uuid, uuid, uuid[], text, timestamptz, jsonb, text) to authenticated;

comment on function public.stock_record_supplier_return_pickup(uuid, uuid, uuid[], text, timestamptz, jsonb, text) is
  '0612: the one writer of a supplier''s pickup — exact Units, collector, time, proof; moves each claim-held Unit to returned_to_supplier and fills the pickup facts on purchase_return_units. Partial pickups leave the rest open.';

commit;

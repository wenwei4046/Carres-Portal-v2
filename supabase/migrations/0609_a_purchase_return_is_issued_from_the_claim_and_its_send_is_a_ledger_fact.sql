-- =============================================================================
-- 0609_a_purchase_return_is_issued_from_the_claim_and_its_send_is_a_ledger_fact.sql
-- (numbered after 0607 = Supplier Claim reply, the production tracker tail, and
--  0608 = `a_heading_can_be_added_on_its_own` on branch fix/chart-heading-on-its-own)
-- =============================================================================
-- Purchasing MASTER §9.6 "CREATION DOOR — OWNER-APPROVED (Jess, 2026-09-25)".
-- The chain, on the ONE claim record:
--
--   Supplier reply → `Record what Carres does next` → `Issue Purchase Return`
--   → send (shared send area) → Confirm tomorrow's pickup → Outbound handover
--   (Stock) → Supplier Received Date
--
-- What this adds, each load-bearing:
--
--   1. `suppliers.return_address` — the supplier's RECORDED return address.
--      §9.6: `Return To` comes from Supplier Master; absent → `Add the return
--      address of {Supplier}`, never the registered address by assumption. The
--      column is schema only: its editor belongs to the Supplier Master /
--      Purchasing Settings lane, and nothing here writes it.
--   2. `document_sends` admits `purchase_return`. The send is the ledger row
--      (channel · recipient · actor · time); `purchase_returns.document_sent_at`
--      (0548) is KEPT and no longer written — the state is derived from the
--      ledger, the way Repair Orders and Supplier Claims already read theirs.
--   3. `purchase_return_pickup_confirmations` — append-only: the supplier's
--      confirmation of a pickup date, with its evidence, actor and time. The
--      day-before Work (`Confirm tomorrow's pickup · {Supplier}`) closes on
--      one of these for the current date; the confirmed date on the document
--      moves with the newest one.
--   4. `purchase_return_unit_refusal` / `purchase_return_eligible_units` — the
--      ONE eligibility the form lists with and the door refuses with: only
--      this claim's held tracked Units; everything else says why.
--   5. `purchasing_issue_purchase_return` — the SAME 0548 door (same signature,
--      still the only writer) re-issued from its production definition with:
--      the claim must be open; every Unit re-checked by the eligibility above
--      and against the `seen` token the form read (a Unit changed under the
--      form is refused BY NAME, and the whole issue rolls back); `Return To`
--      read from Supplier Master by the door itself, never from the caller.
--      It still moves NO stock (§7.4).
--   6. `purchase_return_record_send` · `purchase_return_record_pickup_confirmation`
--      — the two new writers; any active Operation person, the recorder kept.
--   7. `Record what Carres does next` — OWNER RULING (Jess, 2026-09-29):
--      the claim offers ONLY the three supplier-side decisions, `Return to
--      supplier` · `Repair` · `Replacement`, and that ONE decision IS the
--      Authorised Outcome. The four customer movements belong to the Service
--      Case. The existing door `supplier_claim_record_carres_execution` (0409)
--      is re-issued as the one decision writer; it writes the fact each
--      downstream door already reads, so there is one decision and no second
--      arithmetic (`supplier_claim_decision`):
--        Return to supplier → carres_execution = 'return_to_supplier'
--                             (purchasing_issue_purchase_return)
--        Repair             → customer_resolution = 'repair'
--                             (repair_order_create 0602, arrival_source_create)
--        Replacement        → customer_resolution = 'replace'
--                             (arrival_source_create, supplier-replacement)
--      Legacy stored values (the four customer movements, Accept As-Is, No
--      Replacement Required) are never deleted or translated: nothing here
--      rewrites them, and a decision that replaces one names it in History.
--      Only PO Duty, its dated cover or an Operations Superuser, through the
--      ONE Shared Duty Resolver (`workspace_resolve_duty('po_duty')`,
--      `purchasing_po_duty_may_act`) — the ops_po_duty month path is retired
--      for this door. The decision cannot change once its execution document
--      exists: a PR (Return), an active RO (Repair), an active
--      supplier-replacement arrival source (Replacement).
--   8. The legacy 0324 customer-resolution door is closed to signed-in
--      callers (EXECUTE revoked, function kept): it would be a second writer
--      of the Authorised Outcome.
--
-- What it deliberately does NOT do:
--   · no stock, holder, location or availability write — Stock's Outbound
--     `Return to supplier` handover owns the physical facts (Stock §12.8);
--   · no Supplier Received Date writer — recorded from supplier evidence in a
--     later scope;
--   · no row count is asserted and no existing row is changed (red line 8).
-- =============================================================================

set search_path = public;

-- ── 1 · the supplier's recorded return address ──────────────────────────────

alter table public.suppliers
  add column if not exists return_address text;

comment on column public.suppliers.return_address is
  '0609 (Purchasing §9.6, 2026-09-25): where the supplier asks returned goods to go. Read by purchasing_issue_purchase_return as the Purchase Return''s Return To. NULL means not recorded — never filled from `address`.';

-- ── 2 · the send ledger admits a Purchase Return ────────────────────────────

alter table public.document_sends
  drop constraint if exists document_sends_document_kind_check;
alter table public.document_sends
  add constraint document_sends_document_kind_check
  check (document_kind in ('repair_order', 'supplier_claim', 'purchase_return'));

comment on column public.purchase_returns.document_sent_at is
  '0548 column, KEPT and no longer written since 0609: `Return document sent to supplier` is a document_sends row (kind purchase_return); the sent state is derived from that ledger.';

-- ── 3 · evidenced pickup confirmations ──────────────────────────────────────

create table if not exists public.purchase_return_pickup_confirmations (
  id                    uuid primary key default gen_random_uuid(),
  purchase_return_id    uuid not null references public.purchase_returns(id) on delete cascade,
  confirmed_pickup_date date not null,
  -- Who confirmed and how (e.g. `Ah Seng on WhatsApp`): a date with no source
  -- is a guess, and the day-before Work exists to replace guesses.
  evidence              text not null check (evidence ~ '[^[:space:]]'),
  recorded_by           uuid not null references auth.users(id),
  recorded_at           timestamptz not null default now()
);

create index if not exists purchase_return_pickup_confirmations_return_idx
  on public.purchase_return_pickup_confirmations (purchase_return_id, recorded_at desc);

comment on table public.purchase_return_pickup_confirmations is
  '0609 (Purchasing §9.6): append-only supplier confirmations of the pickup date, with evidence, actor and time. The newest one sets purchase_returns.confirmed_pickup_date.';

alter table public.purchase_return_pickup_confirmations enable row level security;
drop policy if exists purchase_return_pickup_confirmations_read_internal on public.purchase_return_pickup_confirmations;
create policy purchase_return_pickup_confirmations_read_internal on public.purchase_return_pickup_confirmations
  for select to authenticated using ((select public.is_internal()));
grant select on public.purchase_return_pickup_confirmations to authenticated;
revoke insert, update, delete on public.purchase_return_pickup_confirmations from authenticated, anon;

-- ── 4 · one eligibility for the form and the door ───────────────────────────

create or replace function public.purchase_return_unit_refusal(p_item ops_stock_items, p_claim uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_doc text;
begin
  -- 0453: a counted row has no Unit ID; counted goods are claimed, never
  -- returned by document (§9.6).
  if p_item.unit_code is null or coalesce(p_item.qty, 1) <> 1 then
    return 'Counted stock';
  end if;
  if p_item.hold_claim_id is distinct from p_claim then
    return 'Not on this claim';
  end if;
  select r.pr_no into v_doc
    from purchase_return_units u join purchase_returns r on r.id = u.purchase_return_id
   where u.stock_item_id = p_item.id
   limit 1;
  if v_doc is not null then
    return format('Already on %s', v_doc);
  end if;
  select r.ro_no into v_doc
    from repair_order_units ru join repair_orders r on r.id = ru.repair_order_id
   where ru.stock_item_id = p_item.id and ru.released_at is null and ru.removed_at is null
     and r.cancelled_at is null
   limit 1;
  if v_doc is not null then
    return format('Already on %s', v_doc);
  end if;
  if p_item.status = 'incoming' then return 'Not received'; end if;
  if p_item.status = 'transferred' then return 'This Unit is on the road'; end if;
  if p_item.status in ('voided', 'written_off', 'returned_to_supplier', 'sold') then return 'Not in stock'; end if;
  -- "only this claim's HELD tracked Units": a released hold keeps its claim
  -- link (0288) but is no longer the claim's goods to send back.
  if p_item.status <> 'on_hold' then return 'Hold released'; end if;
  return null;
end;
$fn$;
revoke all on function public.purchase_return_unit_refusal(ops_stock_items, uuid) from public, anon;
grant execute on function public.purchase_return_unit_refusal(ops_stock_items, uuid) to authenticated;

/** The `Units to return` list: every tracked Unit the claim names, each with
 *  its default Pickup Location (the Unit's current Stock Location), the token
 *  the door compares, and the SAME refusal words the door refuses with. */
create or replace function public.purchase_return_eligible_units(p_claim uuid)
returns table (
  stock_item_id uuid, unit_code text, sku text, po_no text, warehouse_id uuid,
  pickup_location text, seen text, refusal text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  perform public.supplier_claim_gate();
  return query
    select i.id, i.unit_code, i.sku, i.po_no, i.warehouse_id, w.name, i.updated_at::text,
           public.purchase_return_unit_refusal(i, p_claim)
      from ops_stock_items i
      left join warehouses w on w.id = i.warehouse_id
     where i.hold_claim_id = p_claim
       and i.unit_code is not null and coalesce(i.qty, 1) = 1
     order by (public.purchase_return_unit_refusal(i, p_claim) is not null), i.unit_code;
end;
$fn$;
revoke all on function public.purchase_return_eligible_units(uuid) from public, anon;
grant execute on function public.purchase_return_eligible_units(uuid) to authenticated;

-- ── 5 · the ONE issue door, re-issued ───────────────────────────────────────
--
-- Same signature as 0548, so it stays the only overload (0548's sanity block
-- counts them). Each p_units entry: {stock_item_id, seen, pickup_location,
-- category, item, item_spec}. `return_to` from the caller is IGNORED — the door
-- reads it from Supplier Master.
create or replace function public.purchasing_issue_purchase_return(
  p_claim_id   uuid,
  p_units      jsonb,
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
  v_supplier    public.suppliers%rowtype;
  v_return_id   uuid;
  v_unit        jsonb;
  v_item        public.ops_stock_items%rowtype;
  v_refusal     text;
  v_ids         uuid[] := '{}';
  v_count       int := 0;
begin
  -- 0500's law: a NULL app_role must never fall through a gate.
  if v_role is null or v_role not in ('operation', 'principal') then
    raise exception 'operation or principal only'
      using errcode = '42501', detail = 'not_purchasing';
  end if;

  select * into v_claim from public.supplier_claims where id = p_claim_id for update;
  if not found then
    raise exception 'supplier claim not found'
      using errcode = 'P0002', detail = 'claim_not_found';
  end if;
  if v_claim.status is distinct from 'open' then
    raise exception 'Claim % is %', v_claim.claim_no, v_claim.status
      using errcode = '23514', detail = 'claim_not_open';
  end if;

  -- ⭐ THE APPROVED OUTCOME, AND NOTHING LOOSER (0548, unchanged).
  if v_claim.carres_execution is distinct from 'return_to_supplier' then
    raise exception 'this claim has no agreed Return to Supplier outcome'
      using errcode = '23514', detail = 'outcome_not_return_to_supplier';
  end if;

  -- ⭐ RETURN TO — the supplier's RECORDED return address, never assumed.
  select * into v_supplier from public.suppliers where id = v_claim.supplier_id;
  if coalesce(v_supplier.return_address, '') !~ '[^[:space:]]' then
    raise exception 'Add the return address of %', coalesce(v_supplier.name, 'the supplier')
      using errcode = '23514', detail = 'return_address_missing';
  end if;

  if p_confirmed_pickup_date is not null
     and p_confirmed_pickup_date < (timezone('Asia/Kuala_Lumpur', now()))::date then
    raise exception 'The Confirmed Pickup date has passed'
      using errcode = '22023', detail = 'pickup_date_passed';
  end if;

  if jsonb_typeof(p_units) is distinct from 'array' or jsonb_array_length(p_units) = 0 then
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
    select * into v_item from public.ops_stock_items
     where id = nullif(v_unit ->> 'stock_item_id', '')::uuid
     for update;
    if not found then
      raise exception 'that Unit is not a tracked Unit'
        using errcode = '23514', detail = 'unit_not_tracked';
    end if;
    if v_item.id = any (v_ids) then
      raise exception '%: named twice', coalesce(v_item.unit_code, 'Unit')
        using errcode = '23514', detail = 'unit_twice';
    end if;
    v_ids := v_ids || v_item.id;

    -- ⭐ REFUSED BY NAME, in the words the form listed it with.
    v_refusal := public.purchase_return_unit_refusal(v_item, v_claim.id);
    if v_refusal is not null then
      raise exception '%: %', coalesce(v_item.unit_code, 'Unit'), v_refusal
        using errcode = '23514', detail = 'unit_not_eligible', hint = v_refusal;
    end if;
    -- ⭐ A UNIT CHANGED UNDER THE FORM is refused by name; nothing is issued.
    if coalesce(v_unit ->> 'seen', '') = ''
       or v_item.updated_at is distinct from (v_unit ->> 'seen')::timestamptz then
      raise exception '%: Changed since the form opened', v_item.unit_code
        using errcode = '23514', detail = 'unit_changed';
    end if;

    -- ⭐ READ ONLY. The Unit is SNAPSHOT; its status, holder and location are
    -- not changed. Issuing paper is not moving furniture (§7.4).
    insert into public.purchase_return_units (
      purchase_return_id, stock_item_id, unit_code, po_id,
      category, item, item_spec, pickup_location, return_to
    )
    values (
      v_return_id, v_item.id, v_item.unit_code, v_item.po_no,
      nullif(btrim(v_unit ->> 'category'), ''),
      nullif(btrim(v_unit ->> 'item'), ''),
      nullif(btrim(v_unit ->> 'item_spec'), ''),
      coalesce(nullif(btrim(v_unit ->> 'pickup_location'), ''),
               (select w.name from public.warehouses w where w.id = v_item.warehouse_id)),
      btrim(v_supplier.return_address)
    );
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

-- ── 6a · `Return document sent to supplier` ─────────────────────────────────

create or replace function public.purchase_return_record_send(
  p_return_id uuid,
  p_channel   text,
  p_recipient text,
  p_note      text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role app_role := public.supplier_claim_gate();
  v_pr   purchase_returns;
  v_id   uuid;
begin
  select * into v_pr from purchase_returns where id = p_return_id for update;
  if not found then
    raise exception 'Purchase Return not found' using errcode = 'P0002', detail = 'return_not_found';
  end if;
  if coalesce(p_channel, '') not in ('whatsapp', 'email', 'print') then
    raise exception 'Choose how it was sent' using errcode = '22023', detail = 'invalid_channel';
  end if;
  if coalesce(p_recipient, '') !~ '[^[:space:]]' then
    raise exception 'Say who received it' using errcode = '22023', detail = 'recipient_required';
  end if;

  -- A Purchase Return has no revisions: every send is of version 1.
  insert into document_sends (document_kind, document_id, version, recipient, channel, note, confirmed, sent_by)
  values ('purchase_return', v_pr.id, 1, btrim(p_recipient), p_channel,
          case when coalesce(p_note, '') ~ '[^[:space:]]' then btrim(p_note) end, true, auth.uid())
  returning id into v_id;

  insert into audit_log (role, actor_text, action, ref)
  values (v_role, auth.uid()::text, 'purchase_return_send',
          format('%s sent to %s by %s', v_pr.pr_no, btrim(p_recipient), p_channel));
  return v_id;
end;
$fn$;
revoke all on function public.purchase_return_record_send(uuid, text, text, text) from public, anon;
grant execute on function public.purchase_return_record_send(uuid, text, text, text) to authenticated;

-- ── 6b · `Confirmed Pickup` — the supplier's confirmation, evidenced ────────

create or replace function public.purchase_return_record_pickup_confirmation(
  p_return_id uuid,
  p_date      date,
  p_evidence  text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role app_role := public.supplier_claim_gate();
  v_pr   purchase_returns;
  v_id   uuid;
begin
  select * into v_pr from purchase_returns where id = p_return_id for update;
  if not found then
    raise exception 'Purchase Return not found' using errcode = 'P0002', detail = 'return_not_found';
  end if;
  if p_date is null then
    raise exception 'Choose the Confirmed Pickup date' using errcode = '22023', detail = 'date_required';
  end if;
  if p_date < (timezone('Asia/Kuala_Lumpur', now()))::date then
    raise exception 'The Confirmed Pickup date has passed' using errcode = '22023', detail = 'pickup_date_passed';
  end if;
  if coalesce(p_evidence, '') !~ '[^[:space:]]' then
    raise exception 'Say who confirmed it and how' using errcode = '22023', detail = 'evidence_required';
  end if;
  -- Nothing left to collect: every Unit already has its actual pickup.
  if not exists (select 1 from purchase_return_units u
                  where u.purchase_return_id = v_pr.id and u.actual_pickup_date is null) then
    raise exception '% is fully picked up', v_pr.pr_no using errcode = '23514', detail = 'fully_picked_up';
  end if;

  insert into purchase_return_pickup_confirmations (purchase_return_id, confirmed_pickup_date, evidence, recorded_by)
  values (v_pr.id, p_date, btrim(p_evidence), auth.uid())
  returning id into v_id;

  update purchase_returns set confirmed_pickup_date = p_date where id = v_pr.id;

  insert into audit_log (role, actor_text, action, ref)
  values (v_role, auth.uid()::text, 'purchase_return_pickup_confirmation',
          format('%s pickup %s', v_pr.pr_no, p_date));
  return v_id;
end;
$fn$;
revoke all on function public.purchase_return_record_pickup_confirmation(uuid, date, text) from public, anon;
grant execute on function public.purchase_return_record_pickup_confirmation(uuid, date, text) to authenticated;

-- ── 7 · `Record what Carres does next` — the ONE supplier-side decision ─────

-- The ONE Shared Duty Resolver, asked for the PO Duty capability: the normal
-- holder, today's dated cover, or a governed Operations Superuser. The same
-- resolver Work owners read (Workspace §3); ops_po_duty is not consulted.
create or replace function public.purchasing_po_duty_may_act(p_user uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_duty jsonb;
begin
  if p_user is null then return false; end if;
  if public.is_operations_superuser(p_user) then return true; end if;
  v_duty := public.workspace_resolve_duty('po_duty', null);
  -- coalesce: an unassigned duty is NULL, and NULL must never pass a gate (0500).
  return coalesce(p_user = (v_duty->>'normal_user_id')::uuid, false)
      or coalesce(p_user = (v_duty->>'acting_user_id')::uuid, false);
end;
$fn$;
revoke all on function public.purchasing_po_duty_may_act(uuid) from public, anon;
grant execute on function public.purchasing_po_duty_may_act(uuid) to authenticated;

-- ONE arithmetic for the decision, read by the record, Work and the doors.
create or replace function public.supplier_claim_decision(p_claim supplier_claims)
returns text
language sql
stable
set search_path = public, pg_temp
as $fn$
  select case
    when p_claim.carres_execution = 'return_to_supplier' then 'return_to_supplier'
    when p_claim.customer_resolution = 'repair' then 'repair'
    when p_claim.customer_resolution = 'replace' then 'replacement'
  end;
$fn$;
grant execute on function public.supplier_claim_decision(supplier_claims) to authenticated;

create or replace function public.supplier_claim_record_carres_execution(
  p_claim_id uuid,
  p_execution text,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role     app_role;
  v_uid      uuid;
  v_actor    text;
  v_claim    supplier_claims;
  v_decision text;
  v_current  text;
  v_note     text;
  v_doc      text;
  v_was      text;
begin
  v_role := public.supplier_claim_gate();
  v_uid  := auth.uid();

  if not public.purchasing_po_duty_may_act(v_uid) then
    raise exception 'Only PO Duty records what Carres does next'
      using errcode = '42501', detail = 'not_po_duty';
  end if;

  v_decision := nullif(btrim(coalesce(p_execution, '')), '');
  v_note     := nullif(btrim(coalesce(p_note, '')), '');
  if p_claim_id is null or v_decision is null then
    raise exception 'p_claim_id and p_execution are required'
      using errcode = '22023', detail = 'invalid_input';
  end if;
  -- OWNER RULING 2026-09-29: three supplier-side decisions, nothing else.
  if v_decision not in ('return_to_supplier', 'repair', 'replacement') then
    raise exception '% is not one of the three supplier-side decisions', v_decision
      using errcode = 'P0001', detail = 'execution_invalid';
  end if;

  select * into v_claim from supplier_claims where id = p_claim_id for update;
  if not found then
    raise exception 'claim not found' using errcode = '42P01', detail = 'claim_not_found';
  end if;
  if v_claim.status = 'closed' then
    raise exception 'claim % is already closed', v_claim.claim_no
      using errcode = 'P0001', detail = 'claim_closed';
  end if;

  -- The decision cannot change once its execution document exists.
  v_current := public.supplier_claim_decision(v_claim);
  if v_current is not null and v_current <> v_decision then
    if v_current = 'return_to_supplier' then
      select pr_no into v_doc from purchase_returns where supplier_claim_id = v_claim.id limit 1;
      if v_doc is not null then
        raise exception '% is already issued', v_doc using errcode = '23514', detail = 'purchase_return_issued';
      end if;
    elsif v_current = 'repair' then
      select ro_no into v_doc from repair_orders
       where supplier_claim_id = v_claim.id and cancelled_at is null limit 1;
      if v_doc is not null then
        raise exception '% is already issued', v_doc using errcode = '23514', detail = 'repair_order_issued';
      end if;
    elsif v_current = 'replacement' then
      select source_no into v_doc from arrival_sources
       where claim_id = v_claim.id and kind = 'supplier-replacement' and cancelled_at is null limit 1;
      if v_doc is not null then
        raise exception '% is already issued', v_doc using errcode = '23514', detail = 'replacement_issued';
      end if;
    end if;
  end if;

  -- A legacy value this decision replaces is named in History, never lost
  -- silently (nothing here rewrites a legacy customer movement).
  v_was := case
    when v_decision <> 'return_to_supplier' and v_claim.customer_resolution is not null
         and v_claim.customer_resolution not in ('repair', 'replace') then v_claim.customer_resolution
  end;

  if v_decision = 'return_to_supplier' then
    update supplier_claims
       set carres_execution      = 'return_to_supplier',
           carres_execution_note = v_note,
           carres_execution_at   = now(),
           carres_execution_by   = v_uid,
           customer_resolution    = case when customer_resolution in ('repair', 'replace') then null else customer_resolution end,
           customer_resolution_at = case when customer_resolution in ('repair', 'replace') then null else customer_resolution_at end,
           customer_resolution_by = case when customer_resolution in ('repair', 'replace') then null else customer_resolution_by end,
           updated_at            = now()
     where id = p_claim_id;
  else
    update supplier_claims
       set customer_resolution      = case v_decision when 'repair' then 'repair' else 'replace' end,
           customer_resolution_note = v_note,
           customer_resolution_at   = now(),
           customer_resolution_by   = v_uid,
           carres_execution         = case when carres_execution = 'return_to_supplier' then null else carres_execution end,
           carres_execution_note    = case when carres_execution = 'return_to_supplier' then null else carres_execution_note end,
           carres_execution_at      = case when carres_execution = 'return_to_supplier' then null else carres_execution_at end,
           carres_execution_by      = case when carres_execution = 'return_to_supplier' then null else carres_execution_by end,
           updated_at               = now()
     where id = p_claim_id;
  end if;

  v_actor := coalesce((select name from app_users where id = v_uid), initcap(v_role::text));

  insert into po_history (po_id, text, by_role)
  values (v_claim.po_id,
          format('Claim %s — what Carres does next: %s%s%s', v_claim.claim_no, v_decision,
                 case when v_was is null then '' else format(' (was %s)', v_was) end,
                 case when v_note is null then '' else format(' (%s)', v_note) end),
          v_role);

  insert into audit_log (role, actor_text, action, ref)
  values (v_role, v_actor,
          format('Supplier claim %s — decision %s%s', v_claim.claim_no, v_decision,
                 case when v_was is null then '' else format(' (was %s)', v_was) end),
          v_claim.claim_no);

  return jsonb_build_object(
    'claim_no', v_claim.claim_no,
    'decision', v_decision,
    'status',   v_claim.status
  );
end;
$fn$;

revoke execute on function public.supplier_claim_record_carres_execution(uuid, text, text) from public;
revoke execute on function public.supplier_claim_record_carres_execution(uuid, text, text) from anon;
grant  execute on function public.supplier_claim_record_carres_execution(uuid, text, text) to authenticated;

-- ── 8 · the legacy customer-resolution door is no second writer ─────────────
revoke execute on function public.supplier_claim_record_customer_resolution(uuid, text, text) from authenticated;

-- ── sanity — the catalog, never a row count ─────────────────────────────────
do $$
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'purchasing_issue_purchase_return') <> 1 then
    raise exception 'sanity: more than one purchasing_issue_purchase_return';
  end if;
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'purchase_return_pickup_confirmations'
                and cmd <> 'SELECT') then
    raise exception 'sanity: purchase_return_pickup_confirmations has a write policy';
  end if;
  if has_function_privilege('anon', 'public.purchasing_issue_purchase_return(uuid, jsonb, date)', 'execute')
     or has_function_privilege('anon', 'public.purchase_return_record_send(uuid, text, text, text)', 'execute')
     or has_function_privilege('anon', 'public.purchase_return_record_pickup_confirmation(uuid, date, text)', 'execute')
     or has_function_privilege('anon', 'public.purchase_return_eligible_units(uuid)', 'execute') then
    raise exception 'sanity: anon can reach a purchase return door';
  end if;
  if not has_function_privilege('authenticated', 'public.purchasing_issue_purchase_return(uuid, jsonb, date)', 'execute') then
    raise exception 'sanity: authenticated lost execute on the purchase return door';
  end if;
  if has_function_privilege('authenticated', 'public.supplier_claim_record_customer_resolution(uuid, text, text)', 'execute') then
    raise exception 'sanity: the legacy customer-resolution door still writes the Authorised Outcome';
  end if;
  if has_function_privilege('anon', 'public.purchasing_po_duty_may_act(uuid)', 'execute') then
    raise exception 'sanity: anon can ask the PO Duty capability';
  end if;
  if pg_get_constraintdef((select oid from pg_constraint where conname = 'document_sends_document_kind_check')) !~ 'purchase_return' then
    raise exception 'sanity: document_sends does not admit purchase_return';
  end if;
end $$;

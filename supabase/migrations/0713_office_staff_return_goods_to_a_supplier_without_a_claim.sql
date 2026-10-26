-- 0713 · Office staff return goods to a supplier without a claim.
--
-- Weisiang's decision (Mr Lim, Houzs owner side, WhatsApp 2026-10-22, relayed
-- by YH 2026-10-23): "I think just clear Carress rules and Implement Houzs
-- inside". Houzs lets office staff open a blank Purchase Return
-- (PurchaseReturnNew.tsx). This overturns Jess's rules in
-- docs/purchasing/MASTER.md — "return Carres-owned purchased goods only after
-- an approved claim/outcome" (§9.6) and "no blank + New" (0548's NOT NULL).
-- Jess was not part of this decision.
--
-- What changes, and only this:
--   1. `purchase_returns.supplier_claim_id` may be NULL — a claimless return.
--   2. `purchase_return_unit_refusal(item, NULL)` judges a Unit for a claimless
--      return: a Carres-owned, Unit-tracked Unit that is free stock now.
--   3. `purchase_return_supplier_units(supplier)` lists the supplier's Units in
--      stock with those refusal words — the claimless twin of
--      `purchase_return_eligible_units(claim)`, same columns.
--   4. `purchasing_issue_purchase_return` takes either a claim (unchanged) or a
--      supplier (new, `p_supplier_id`). Same door, same Unit snapshot, same
--      Return To rule, same `Changed since the form opened` check. A Unit not
--      bought from that supplier is refused by name.
--   5. `stock_record_supplier_return_pickup` lets a claimless return's Unit
--      leave from free stock (`free → returned_to_supplier`, which the 0490
--      hold guard already admits). A claim return is checked exactly as before.
--   6. (YH, 2026-10-26) `purchasing_cancel_purchase_return` cancels a claimless
--      return the supplier has not collected, with who and why, the Houzs way
--      (Houzs `PATCH /purchase-returns/:id/cancel`). A cancelled return frees
--      its Units for another return, leaves Stock's pickup list and adds no
--      credit note to follow up.
--
-- Issuing still moves no stock (§7.4). A claimless return's Units stay `free`
-- until the supplier collects them; a Unit sold or reserved meanwhile is
-- refused at pickup by name; staff then cancel the return (section 6).

begin;

-- ── 1 · a return may name no claim ──────────────────────────────────────────

alter table public.purchase_returns alter column supplier_claim_id drop not null;

-- 6 (YH, 2026-10-26) · who cancelled a claimless return, when, and why.
alter table public.purchase_returns
  add column if not exists cancelled_at  timestamptz,
  add column if not exists cancelled_by  uuid references auth.users(id),
  add column if not exists cancel_reason text;
alter table public.purchase_returns drop constraint if exists purchase_returns_cancel_says_why;
alter table public.purchase_returns add constraint purchase_returns_cancel_says_why check (
  (cancelled_at is null and cancel_reason is null)
  or (cancelled_at is not null and coalesce(cancel_reason, '') ~ '[^[:space:]]'));

comment on column public.purchase_returns.supplier_claim_id is
  '0713 (Weisiang''s decision, Mr Lim, WhatsApp 2026-10-22): NULL = an office Purchase Return opened with no claim (supplier + Units in stock). Overturns 0548''s NOT NULL "no blank + New" rule (Jess); Jess was not part of the decision.';

-- ── 2 · the refusal words, for a claim or for no claim ──────────────────────

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
  if p_claim is not null and p_item.hold_claim_id is distinct from p_claim then
    return 'Not on this claim';
  end if;
  select r.pr_no into v_doc
    from purchase_return_units u join purchase_returns r on r.id = u.purchase_return_id
   where u.stock_item_id = p_item.id and r.cancelled_at is null
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
  -- 0713 · a claimless return (Weisiang's decision, 2026-10-22): Carres-owned
  -- free stock only. Held goods go back through their claim; consignment goods
  -- through the Consignment Return.
  if p_claim is null then
    if p_item.ownership is distinct from 'carres_owned' then return 'Consignment stock'; end if;
    if p_item.status = 'on_hold' then return 'On a claim hold'; end if;
    if p_item.status = 'reserved' then return 'Reserved for an order'; end if;
    if p_item.status <> 'free' then return 'Not in stock'; end if;
    return null;
  end if;
  -- "only this claim's HELD tracked Units": a released hold keeps its claim
  -- link (0288) but is no longer the claim's goods to send back.
  if p_item.status <> 'on_hold' then return 'Hold released'; end if;
  return null;
end;
$fn$;

-- ── 3 · a supplier's Units in stock, for the claimless form ─────────────────

create or replace function public.purchase_return_supplier_units(p_supplier uuid)
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
           public.purchase_return_unit_refusal(i, null)
      from ops_stock_items i
      join purchase_orders po on po.id = i.po_no and po.supplier_id = p_supplier
      left join warehouses w on w.id = i.warehouse_id
     where i.status = 'free'
       and i.unit_code is not null and coalesce(i.qty, 1) = 1
     order by (public.purchase_return_unit_refusal(i, null) is not null), i.unit_code;
end;
$fn$;
revoke all on function public.purchase_return_supplier_units(uuid) from public, anon;
grant execute on function public.purchase_return_supplier_units(uuid) to authenticated;

-- ── 4 · the issue door: a claim, or (0713) a supplier ─────────────────────

drop function if exists public.purchasing_issue_purchase_return(uuid, jsonb, date);
drop function if exists public.purchasing_issue_purchase_return(uuid, jsonb, date, uuid);

CREATE FUNCTION public.purchasing_issue_purchase_return(p_claim_id uuid, p_units jsonb, p_confirmed_pickup_date date DEFAULT NULL::date, p_supplier_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role        app_role := (select public.app_role());
  v_claim       public.supplier_claims%rowtype;
  v_supplier    public.suppliers%rowtype;
  v_return_to   text;
  v_return_id   uuid;
  v_unit        jsonb;
  v_item        public.ops_stock_items%rowtype;
  v_refusal     text;
  v_ids         uuid[] := '{}';
  v_count       int := 0;
  v_supplier_id uuid;
  v_receipt_id  uuid;
begin
  -- 0500's law: a NULL app_role must never fall through a gate.
  if v_role is null or v_role not in ('operation', 'principal') then
    raise exception 'operation or principal only'
      using errcode = '42501', detail = 'not_purchasing';
  end if;

  if p_claim_id is not null then
    select * into v_claim from public.supplier_claims where id = p_claim_id for update;
    if not found then
      raise exception 'supplier claim not found'
        using errcode = 'P0002', detail = 'claim_not_found';
    end if;
    if v_claim.status is distinct from 'open' then
      raise exception 'Claim % is %', v_claim.claim_no, v_claim.status
        using errcode = '23514', detail = 'claim_not_open';
    end if;

    -- THE APPROVED OUTCOME, AND NOTHING LOOSER (0548, unchanged).
    if v_claim.carres_execution is distinct from 'return_to_supplier' then
      raise exception 'this claim has no agreed Return to Supplier outcome'
        using errcode = '23514', detail = 'outcome_not_return_to_supplier';
    end if;
    v_supplier_id := v_claim.supplier_id;
    v_receipt_id  := v_claim.warehouse_receipt_id;
  else
    -- 0713 · Weisiang's decision (Mr Lim, WhatsApp 2026-10-22, relayed by YH
    -- 2026-10-23): office staff open a Purchase Return with no claim, the
    -- Houzs way — supplier + Units in stock. Overturns Jess's "only after an
    -- approved claim / no blank New" (Purchasing MASTER §9.6); Jess was not
    -- part of this decision. Every other check below still applies.
    if p_supplier_id is null or not exists (select 1 from public.suppliers where id = p_supplier_id) then
      raise exception 'choose the supplier'
        using errcode = '22023', detail = 'supplier_required';
    end if;
    v_supplier_id := p_supplier_id;
  end if;

  -- RETURN TO — owner ruling 2026-09-29: the recorded return address, else
  -- the recorded address. Never typed by the caller; refused only when both
  -- are blank.
  select * into v_supplier from public.suppliers where id = v_supplier_id;
  v_return_to := coalesce(nullif(btrim(v_supplier.return_address), ''), nullif(btrim(v_supplier.address), ''));
  if v_return_to is null then
    raise exception 'Add the address of %', coalesce(v_supplier.name, 'the supplier')
      using errcode = '23514', detail = 'address_missing';
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
    v_claim.id, v_supplier_id, v_receipt_id,
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

    -- REFUSED BY NAME, in the words the form listed it with.
    v_refusal := public.purchase_return_unit_refusal(v_item, v_claim.id);
    if v_refusal is null and p_claim_id is null and not exists (
      select 1 from public.purchase_orders po where po.id = v_item.po_no and po.supplier_id = v_supplier_id
    ) then
      v_refusal := 'Not bought from this supplier';
    end if;
    if v_refusal is not null then
      raise exception '%: %', coalesce(v_item.unit_code, 'Unit'), v_refusal
        using errcode = '23514', detail = 'unit_not_eligible', hint = v_refusal;
    end if;
    -- A UNIT CHANGED UNDER THE FORM is refused by name; nothing is issued.
    if coalesce(v_unit ->> 'seen', '') = ''
       or v_item.updated_at is distinct from (v_unit ->> 'seen')::timestamptz then
      raise exception '%: Changed since the form opened', v_item.unit_code
        using errcode = '23514', detail = 'unit_changed';
    end if;

    -- READ ONLY. The Unit is SNAPSHOT; its status, holder and location are
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
      v_return_to
    );
    v_count := v_count + 1;
  end loop;

  insert into public.audit_log (role, actor_text, action, ref)
  values (
    v_role, auth.uid()::text, 'purchasing_issue_purchase_return',
    v_return_id::text || ' claim=' || coalesce(v_claim.claim_no, 'none') || ' units=' || v_count
  );

  return v_return_id;
end;
$function$;

revoke all on function public.purchasing_issue_purchase_return(uuid, jsonb, date, uuid) from public, anon;
grant execute on function public.purchasing_issue_purchase_return(uuid, jsonb, date, uuid) to authenticated;

-- ── 5 · the supplier's pickup: a claimless Unit leaves from free stock ──────

CREATE OR REPLACE FUNCTION public.stock_record_supplier_return_pickup(p_request_id uuid, p_purchase_return_id uuid, p_unit_ids uuid[], p_collector_name text, p_picked_up_at timestamp with time zone, p_evidence jsonb, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  if v_pr.cancelled_at is not null then
    raise exception '% is cancelled', v_pr.pr_no using errcode = 'P0001', detail = 'return_cancelled';
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
    if v_pr.supplier_claim_id is not null
       and (v_item.status <> 'on_hold' or v_item.hold_claim_id is distinct from v_pr.supplier_claim_id) then
      raise exception 'Unit % is not held for the claim on % (it is %)', v_line.unit_code, v_pr.pr_no, v_item.status
        using errcode = 'P0001', detail = 'not_held_for_this_claim';
    end if;
    -- 0713 · Weisiang's decision (Mr Lim, WhatsApp 2026-10-22): a return with
    -- no claim takes Units that are still free stock at the moment of pickup.
    if v_pr.supplier_claim_id is null and v_item.status <> 'free' then
      raise exception 'Unit % is not in stock (it is %)', v_line.unit_code, v_item.status
        using errcode = 'P0001', detail = 'not_in_stock';
    end if;

    -- Custody leaves Carres. The 0341 guard admits on_hold → returned_to_supplier
    -- only for a claim hold, which the check above has just proven.
    update ops_stock_items
       set status            = 'returned_to_supplier',
           -- A claimless return's Unit was never held: it gets no release stamp.
           hold_released_at  = case when v_item.status = 'on_hold' then now() else hold_released_at end,
           hold_release_note = case when v_item.status = 'on_hold'
                                    then format('Collected by %s · %s', v_collector, v_pr.pr_no)
                                    else hold_release_note end,
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
$function$;

-- ── 6 · cancel a claimless return the supplier has not collected ───────────
--
-- YH, 2026-10-26: "yes, can remove afterwards if not needed". A claimless
-- return holds nothing at issue (§7.4, section 4), so a Unit can be sold
-- before pickup and the return then cannot finish. Houzs cancels a purchase
-- return that is not completed, and an already-cancelled one answers as
-- cancelled (backend/src/scm/routes/purchase-returns.ts:1469-1505). Here
-- "completed" is any Unit collected: those Units have left Carres.
-- Follows Houzs purchase-returns.ts:1486-1489 per Weisiang's ruling (2026-10-22): clear Carres rules, implement Houzs.
-- Nothing to undo on the Units: issuing put no hold on them and wrote no
-- Unit history. Cancelling frees them for another return (section 2) and
-- closes a credit note to follow up that Finance has not settled any of.
create or replace function public.purchasing_cancel_purchase_return(p_return_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role   app_role := (select public.app_role());
  v_pr     public.purchase_returns%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_actor  text;
begin
  if v_role is null or v_role not in ('operation', 'principal') then
    raise exception 'operation or principal only' using errcode = '42501', detail = 'not_purchasing';
  end if;
  if v_reason is null then
    raise exception 'Say why this return is cancelled' using errcode = '22023', detail = 'reason_missing';
  end if;
  if length(v_reason) > 500 then
    raise exception 'Keep the reason to 500 characters' using errcode = '22023', detail = 'reason_too_long';
  end if;

  select * into v_pr from public.purchase_returns where id = p_return_id for update;
  if not found then
    raise exception 'purchase return not found' using errcode = 'P0002', detail = 'return_not_found';
  end if;
  if v_pr.cancelled_at is not null then
    return v_pr.id;  -- Houzs: an already-cancelled return answers as cancelled.
  end if;
  if v_pr.supplier_claim_id is not null then
    raise exception '% was issued from a claim. Change it on the claim', v_pr.pr_no
      using errcode = '23514', detail = 'claim_return';
  end if;
  if exists (select 1 from public.purchase_return_units
              where purchase_return_id = v_pr.id and actual_pickup_date is not null) then
    raise exception 'The supplier has collected goods on %. It cannot be cancelled', v_pr.pr_no
      using errcode = '23514', detail = 'already_collected';
  end if;
  if exists (select 1 from public.supplier_note_followups f
               join public._supplier_note_followup_figures(f.id) fg on fg.followup_id = f.id
              where f.purchase_return_id = v_pr.id and fg.status in ('part', 'settled')) then
    raise exception 'Finance has settled a credit note on %. It cannot be cancelled', v_pr.pr_no
      using errcode = '23514', detail = 'credit_note_settled';
  end if;

  update public.purchase_returns
     set cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = v_reason
   where id = v_pr.id;
  update public.supplier_note_followups
     set closed_at = now(), closed_by = (select u.id from public.app_users u where u.id = auth.uid()),
         close_reason = format('%s cancelled: %s', v_pr.pr_no, v_reason), next_follow_up_on = null
   where purchase_return_id = v_pr.id and closed_at is null;

  v_actor := coalesce((select name from public.app_users where id = auth.uid()), initcap(v_role::text));
  insert into public.audit_log (role, actor_text, action, ref)
  values (v_role, v_actor, format('Purchase return cancelled · %s · %s', v_pr.pr_no, v_reason), v_pr.pr_no);
  return v_pr.id;
end;
$fn$;
revoke all on function public.purchasing_cancel_purchase_return(uuid, text) from public, anon;
grant execute on function public.purchasing_cancel_purchase_return(uuid, text) to authenticated;

-- A cancelled return takes no send and no pickup confirmation (coordinator,
-- 2026-10-26): a guard on the two ledgers, so every door that writes them refuses.
create or replace function public.purchase_return_refuse_cancelled()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_row jsonb := to_jsonb(new);
  v_id uuid := coalesce(v_row ->> 'purchase_return_id', v_row ->> 'document_id')::uuid;
  v_no text;
begin
  if tg_table_name = 'document_sends' and v_row ->> 'document_kind' is distinct from 'purchase_return' then
    return new;
  end if;
  select pr_no into v_no from public.purchase_returns where id = v_id and cancelled_at is not null;
  if found then
    raise exception '% is cancelled', v_no using errcode = '23514', detail = 'return_cancelled';
  end if;
  return new;
end;
$fn$;
drop trigger if exists purchase_return_refuse_cancelled on public.document_sends;
create trigger purchase_return_refuse_cancelled before insert on public.document_sends
  for each row execute function public.purchase_return_refuse_cancelled();
drop trigger if exists purchase_return_refuse_cancelled on public.purchase_return_pickup_confirmations;
create trigger purchase_return_refuse_cancelled before insert on public.purchase_return_pickup_confirmations
  for each row execute function public.purchase_return_refuse_cancelled();

-- A cancelled return owes no credit note (0676's function, one filter added).
create or replace function public._supplier_note_followups_from_returns()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_n integer;
begin
  insert into public.supplier_note_followups (supplier_id, kind, reason, purchase_return_id, amount, noted_on)
  select pr.supplier_id, 'CREDIT', 'RETURN', pr.id, v.amount, (pr.pr_doc_date at time zone 'Asia/Kuala_Lumpur')::date
    from public.purchase_returns pr
    cross join lateral (
      select round(sum(g.units * g.price), 2) as amount
        from (
          select least(count(*)::numeric, max(b.billed_qty)) as units, max(b.price) as price
            from public.purchase_return_units pru
            join public.ops_stock_items si on si.id = pru.stock_item_id
            join lateral (
              select r.receipt_id
                from public.receiving_unit_results r
               where r.stock_item_id = pru.stock_item_id
                 and r.issue_kind is distinct from 'wrong_item'
               order by r.created_at desc
               limit 1) rr on true
            join lateral (
              select sum(bl.qty) as billed_qty,
                     (select bl2.unit_price
                        from public.supplier_bill_lines bl2
                        join public.supplier_bills b2 on b2.id = bl2.bill_id
                       where b2.status = 'confirmed'
                         and bl2.warehouse_receipt_id = rr.receipt_id
                         and bl2.po_line_id = si.po_line_id
                       order by b2.confirmed_at desc, bl2.line_no desc
                       limit 1) as price
                from public.supplier_bill_lines bl
                join public.supplier_bills b on b.id = bl.bill_id
               where b.status = 'confirmed'
                 and bl.warehouse_receipt_id = rr.receipt_id
                 and bl.po_line_id = si.po_line_id) b on b.billed_qty > 0 and b.price is not null
           where pru.purchase_return_id = pr.id
           group by rr.receipt_id, si.po_line_id) g) v
   where v.amount > 0
     and pr.cancelled_at is null
     and not exists (select 1 from public.supplier_note_followups f where f.purchase_return_id = pr.id)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$fn$;

-- ── 7 · sanity ──────────────────────────────────────────────────────────────

do $sanity$
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'purchasing_issue_purchase_return') <> 1 then
    raise exception '0713 sanity: more than one purchasing_issue_purchase_return';
  end if;
  if has_function_privilege('anon', 'public.purchasing_issue_purchase_return(uuid, jsonb, date, uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.purchasing_issue_purchase_return(uuid, jsonb, date, uuid)', 'execute') then
    raise exception '0713 sanity: purchasing_issue_purchase_return grants changed';
  end if;
  if has_function_privilege('anon', 'public.purchase_return_supplier_units(uuid)', 'execute') then
    raise exception '0713 sanity: anon can list supplier Units';
  end if;
end;
$sanity$;

commit;

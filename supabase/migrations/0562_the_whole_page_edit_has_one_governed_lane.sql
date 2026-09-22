-- ---------------------------------------------------------------------------
-- 0562 . THE WHOLE-PAGE EDIT HAS ONE GOVERNED LANE, AND IT CARRIES THE WHOLE
--        CHANGE (owner rulings 2026-09-21 / 2026-09-22, orders/MASTER.md
--        § VIEW FIRST, EDIT ON PURPOSE · § Commercial change entry ·
--        § Customer agreement evidence — APPROVED / LOCKED)
--
-- WHAT WAS MISSING (measured on pg_proc.prosrc, 2026-09-23)
--   . No customer-agreement evidence anywhere. An amendment could be approved
--     with nothing recorded about the customer's acceptance.
--   . The amendment carried only lines(sku, qty, price), the delivery date and
--     the instalment plan. It could not carry a line's configuration (the
--     writer never wrote `attrs`), a service (order_addons), the proceed date
--     or the whole-page header a mixed change brings with it.
--   . A recorded proceed date could not move even by approved amendment (0391),
--     contradicting "proceed date can edit" (Jess, 2026-09-22).
--   . A stale request could only sit there: nothing could withdraw it, so the
--     one-live-request index blocked every new proposal on that order.
--
-- WHAT CHANGES
--   1. sales_order_amendments gains the evidence columns. Evidence is bound to
--      the exact proposal it covers by an md5 of `proposed_snapshot`: change
--      the proposal and the evidence no longer covers it.
--   2. sales_order_record_amendment_evidence — Sales/Operation records the
--      confirmation basis (a signed document, a WhatsApp reference). A
--      recorded reference authorises no contact with anybody.
--   3. sales_order_withdraw_amendment — a live request can be withdrawn with a
--      reason (status `withdrawn`, which the table has always allowed).
--   4. sales_order_decide_amendment — APPROVE now REFUSES without evidence that
--      covers this exact proposal (detail `evidence_required`), refuses when a
--      header value the proposal was computed from has moved (`amendment_stale`),
--      and applies the whole proposal: header keys, lines WITH configuration,
--      services and the instalment plan, in ONE new complete revision.
--   5. sales_order_save_revision — the proceed lock is exempted for the
--      approved amendment lane only (the 0420 transaction-local setting).
--   6. sales_order_save_revision_unchecked_0354 — writes `attrs` when a line
--      names it. Rebuilt from the LIVE body (0560, md5 f4d012cd…); the only
--      difference is the two line statements.
--   7. sales_order_amendment_live — returns the evidence and the proposal's base.
--
-- NOT CHANGED: who may submit (operation, principal) and who may decide
-- (principal) · the contractual hash · the impact read · attribution (0329
-- keeps its own lane) · the one-live-request index · any RLS policy.
-- Section 6: no existing row is read, written or backfilled by this file.
-- No secret. No row count asserted.
-- ---------------------------------------------------------------------------

begin;

alter table public.sales_order_amendments
  add column if not exists evidence_note text,
  add column if not exists evidence_recorded_by uuid references auth.users(id),
  add column if not exists evidence_recorded_at timestamptz,
  add column if not exists evidence_proposal_hash text;

comment on column public.sales_order_amendments.evidence_note is
  '0562 · the traceable basis for the customer''s acceptance (signed document or a confirmation reference). A statement that the customer agreed is not evidence.';
comment on column public.sales_order_amendments.evidence_proposal_hash is
  '0562 · md5(proposed_snapshot::text) when the evidence was recorded. Evidence covers only the proposal it was recorded against.';

-- ── 2 · record the customer's agreement against THIS proposal ─────────────
create or replace function public.sales_order_record_amendment_evidence(
  p_amendment_id uuid,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.app_role();
  v_a    sales_order_amendments%rowtype;
  v_note text := nullif(btrim(coalesce(p_note,'')), '');
  v_hash text;
begin
  if (v_role is null or v_role not in ('operation','principal')) then
    raise exception 'Operation/Principal only' using errcode = '42501';
  end if;
  if v_note is null then
    raise exception 'Name the customer''s confirmation - a signed document or a message reference'
      using errcode = '22023', detail = 'evidence_note_required';
  end if;
  if length(v_note) > 500 then
    raise exception 'Keep the evidence reference under 500 characters'
      using errcode = '22023', detail = 'evidence_note_too_long';
  end if;
  select * into v_a from sales_order_amendments where id = p_amendment_id for update;
  if not found then raise exception 'Amendment not found' using errcode = 'P0002'; end if;
  if v_a.status not in ('submitted','issued','accepted') then
    raise exception 'Amendment is already %', v_a.status using errcode = '22023', detail = 'already_decided';
  end if;
  v_hash := md5(v_a.proposed_snapshot::text);
  update sales_order_amendments
     set evidence_note = v_note, evidence_recorded_by = auth.uid(),
         evidence_recorded_at = now(), evidence_proposal_hash = v_hash
   where id = v_a.id;
  insert into order_history(order_id, text, by_role, by_user_id, metadata)
  values (v_a.order_id, 'Customer agreement recorded - ' || v_note, v_role::app_role, auth.uid(),
          jsonb_build_object('kind','amendment_evidence','amendment_id',v_a.id,
                             'evidence',v_note,'proposal_hash',v_hash));
  return jsonb_build_object('id', v_a.id, 'evidence_note', v_note,
                            'evidence_recorded_at', now(), 'evidence_proposal_hash', v_hash);
end $$;

-- ── 3 · withdraw a live request ─────────────────────────────────────────────
create or replace function public.sales_order_withdraw_amendment(
  p_amendment_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role   text := public.app_role();
  v_a      sales_order_amendments%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason,'')), '');
begin
  if (v_role is null or v_role not in ('operation','principal')) then
    raise exception 'Operation/Principal only' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'A withdrawal says why' using errcode = '22023', detail = 'reason_required';
  end if;
  select * into v_a from sales_order_amendments where id = p_amendment_id for update;
  if not found then raise exception 'Amendment not found' using errcode = 'P0002'; end if;
  if v_a.status not in ('submitted','issued','accepted') then
    raise exception 'Amendment is already %', v_a.status using errcode = '22023', detail = 'already_decided';
  end if;
  update sales_order_amendments set status = 'withdrawn' where id = v_a.id;
  insert into order_history(order_id, text, by_role, by_user_id, metadata)
  values (v_a.order_id, 'Amendment withdrawn - ' || v_reason, v_role::app_role, auth.uid(),
          jsonb_build_object('kind','amendment_withdrawn','amendment_id',v_a.id,'reason',v_reason));
  return jsonb_build_object('id', v_a.id, 'status', 'withdrawn');
end $$;

-- ── 4 · decide: evidence gate, base check, the whole proposal ──────────────
create or replace function public.sales_order_decide_amendment(
  p_amendment_id uuid,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.app_role();
  v_a sales_order_amendments%rowtype;
  v_o orders%rowtype;
  v_note text := nullif(btrim(coalesce(p_note,'')), '');
  v_impact jsonb;
  v_header jsonb := '{}'::jsonb;
  v_lines jsonb := null;
  v_line jsonb;
  v_addon jsonb;
  v_keep uuid[] := '{}';
  v_aid uuid;
  v_result jsonb;
  v_before jsonb;
  v_next int;
  v_key text;
  v_now jsonb;
  v_changed jsonb := '[]'::jsonb;
  v_services boolean := false;
begin
  if (v_role is null or v_role <> 'principal') then
    raise exception 'Principal only' using errcode = '42501';
  end if;
  if p_decision not in ('approve','reject') then
    raise exception 'Decision must be approve or reject' using errcode = '22023', detail = 'invalid_decision';
  end if;
  if v_note is null then
    raise exception 'A management decision says why' using errcode = '22023', detail = 'note_required';
  end if;

  select * into v_a from sales_order_amendments where id = p_amendment_id for update;
  if not found then raise exception 'Amendment not found' using errcode = 'P0002'; end if;
  if v_a.status not in ('submitted','issued','accepted') then
    raise exception 'Amendment is already %', v_a.status using errcode = '22023', detail = 'already_decided';
  end if;
  select * into v_o from orders where id = v_a.order_id for update;
  v_impact := public.sales_order_amendment_impact(v_a.id);

  if p_decision = 'reject' then
    update sales_order_amendments
       set status='rejected', decided_by=auth.uid(), decided_at=now(),
           decision_note=v_note, decision_impact=v_impact
     where id=v_a.id;
    insert into order_history(order_id,text,by_role,by_user_id,metadata)
    values(v_a.order_id,'Amendment rejected - ' || v_note,v_role::app_role,auth.uid(),
      jsonb_build_object('kind','amendment_rejected','amendment_id',v_a.id,
                         'reason',v_note,'before',public.sales_order_snapshot(v_a.order_id),
                         'after',public.sales_order_snapshot(v_a.order_id)));
    return jsonb_build_object('id',v_a.id,'status','rejected');
  end if;

  if (v_impact->>'stale')::boolean then
    raise exception 'The order changed after this amendment was proposed'
      using errcode = '22023', detail = 'amendment_stale';
  end if;

  -- 0562 · THE BASE OF EVERY PROPOSED HEADER VALUE MUST STILL BE TRUE. The
  -- contractual hash covers goods, services, the promise and the plan; a
  -- whole-page proposal can also carry the proceed date, delivery access and
  -- customer facts. Each carries the value it was computed from, and a value
  -- that has moved since makes the proposal stale — never a silent overwrite.
  if jsonb_typeof(v_a.proposed_snapshot->'base_header') = 'object' then
    v_now := to_jsonb(v_o);
    for v_key in select jsonb_object_keys(v_a.proposed_snapshot->'base_header') loop
      if v_key = 'entry_fields' then
        if (v_a.proposed_snapshot->'base_header'->'entry_fields') is distinct from
           coalesce(v_o.entry_data->'fields','{}'::jsonb) then
          raise exception 'The order changed after this amendment was proposed'
            using errcode = '22023', detail = 'amendment_stale';
        end if;
      elsif nullif(v_a.proposed_snapshot->'base_header'->>v_key,'') is distinct from nullif(v_now->>v_key,'') then
        raise exception 'The order changed after this amendment was proposed'
          using errcode = '22023', detail = 'amendment_stale';
      end if;
    end loop;
  end if;

  -- 0562 · CUSTOMER AGREEMENT EVIDENCE — APPROVED / LOCKED 2026-09-22. The
  -- request may exist without it; it cannot take effect without it, and
  -- evidence recorded against a different proposal does not cover this one.
  if nullif(btrim(coalesce(v_a.evidence_note,'')),'') is null
     or v_a.evidence_proposal_hash is distinct from md5(v_a.proposed_snapshot::text) then
    raise exception 'Record the customer''s agreement for this change before it takes effect'
      using errcode = '22023', detail = 'evidence_required';
  end if;

  if v_a.proposed_snapshot ? 'delivery_date' then
    v_header := v_header || jsonb_build_object('delivery_date',v_a.proposed_snapshot->'delivery_date');
  end if;
  if v_a.proposed_snapshot ? 'delivery_date_tbd' then
    v_header := v_header || jsonb_build_object('delivery_date_tbd',v_a.proposed_snapshot->'delivery_date_tbd');
  end if;
  if jsonb_typeof(v_a.proposed_snapshot->'header') = 'object' then
    v_header := v_header || (v_a.proposed_snapshot->'header');
  end if;
  v_before := public.sales_order_snapshot(v_a.order_id);
  if v_a.proposed_snapshot ? 'installment_months' then
    update orders set installment_months = nullif(v_a.proposed_snapshot->>'installment_months','')::int
      where id = v_a.order_id;
    v_changed := v_changed || '"installment_months"'::jsonb;
  end if;

  -- 0562 · SERVICES ARE PART OF WHAT WAS BOUGHT (CLASS A, order_addons). The
  -- proposal carries the complete service set: kept rows by id, new rows
  -- without one; a row it no longer names is removed.
  if jsonb_typeof(v_a.proposed_snapshot->'addons') = 'array' then
    for v_addon in select * from jsonb_array_elements(v_a.proposed_snapshot->'addons') loop
      if length(btrim(coalesce(v_addon->>'addon_key',''))) = 0 then
        raise exception 'A service needs its key' using errcode = '22023';
      end if;
      if coalesce((v_addon->>'qty')::int, 0) < 1 then
        raise exception 'Service % qty must be at least 1', v_addon->>'addon_key' using errcode = '22023';
      end if;
      if coalesce((v_addon->>'unit_price')::numeric, -1) < 0 then
        raise exception 'Service % needs a price of 0 or more', v_addon->>'addon_key' using errcode = '22023';
      end if;
      if nullif(v_addon->>'id','') is not null then
        v_aid := (v_addon->>'id')::uuid;
        update order_addons
           set addon_key = btrim(v_addon->>'addon_key'),
               qty = (v_addon->>'qty')::int,
               unit_price = (v_addon->>'unit_price')::numeric,
               attrs = case when v_addon ? 'attrs' then
                         case when jsonb_typeof(v_addon->'attrs') = 'object' then v_addon->'attrs' else null end
                       else attrs end
         where id = v_aid and order_id = v_a.order_id;
        if not found then
          raise exception 'A proposed service no longer belongs to this order'
            using errcode = '22023', detail = 'proposal_line_stale';
        end if;
      else
        insert into order_addons(order_id, addon_key, qty, unit_price, attrs)
        values (v_a.order_id, btrim(v_addon->>'addon_key'), (v_addon->>'qty')::int,
                (v_addon->>'unit_price')::numeric,
                case when jsonb_typeof(v_addon->'attrs') = 'object' then v_addon->'attrs' else null end)
        returning id into v_aid;
      end if;
      v_keep := array_append(v_keep, v_aid);
    end loop;
    delete from order_addons where order_id = v_a.order_id and not (id = any(v_keep));
    v_services := true;
  end if;

  if v_a.proposed_snapshot ? 'lines' then
    for v_line in select * from jsonb_array_elements(v_a.proposed_snapshot->'lines') loop
      if v_line ? 'id' and not exists (
        select 1 from order_lines where id=(v_line->>'id')::uuid and order_id=v_a.order_id
      ) then
        raise exception 'A proposed line no longer belongs to this order'
          using errcode = '22023', detail = 'proposal_line_stale';
      end if;
      if not (v_line ? 'id') and exists (
        select 1 from order_lines where order_id=v_a.order_id and sku=v_line->>'sku'
      ) then
        raise exception 'Re-propose this amendment with stable line identity'
          using errcode = '22023', detail = 'proposal_line_identity_required';
      end if;
    end loop;
    v_lines := v_a.proposed_snapshot->'lines';
  end if;

  if v_lines is null and v_header = '{}'::jsonb then
    -- Only the plan and/or the services moved: the writer has nothing to write,
    -- so the complete version is minted here (the 0348 installment branch,
    -- generalised).
    if public.sales_order_snapshot(v_a.order_id) = v_before then
      raise exception 'Nothing changed' using errcode = '22023', detail = 'nothing_changed';
    end if;
    if v_services then v_changed := v_changed || '"services"'::jsonb; end if;
    select coalesce(max(revision),1)+1 into v_next from sales_order_revisions where order_id=v_a.order_id;
    insert into sales_order_revisions(order_id,revision,snapshot,created_by,change_type,note)
    values(v_a.order_id,v_next,public.sales_order_snapshot(v_a.order_id),auth.uid(),'customer_change',coalesce(v_a.reason,v_note));
    insert into order_history(order_id,text,by_role,by_user_id,metadata)
    values(v_a.order_id,'Customer change - Rev '||v_next||' - '||
             (select string_agg(x,', ') from jsonb_array_elements_text(v_changed) x),
           v_role::app_role,auth.uid(),
      jsonb_build_object('kind','edit','changed',v_changed,'revision',v_next));
    v_result := jsonb_build_object('revision',v_next,'changed',v_changed);
  else
    -- 0420 · EVERY GUARD ABOVE HAS ALREADY PASSED. Only now does the lane name
    -- itself to the writer, so 0415's F-11/F-12 and (0562) the proceed lock know
    -- this is the door they point at. `true` is is_local: the setting dies with
    -- this transaction and no other caller can see it.
    perform set_config('carres.applying_amendment','on',true);
    begin
      v_result := public.sales_order_save_revision(
        v_a.order_id,v_header,v_lines,
        jsonb_build_object('change_type','customer_change','note',coalesce(v_a.reason,v_note)));
    exception when others then
      perform set_config('carres.applying_amendment','',true);
      raise;
    end;
    perform set_config('carres.applying_amendment','',true);
    if v_a.proposed_snapshot ? 'installment_months' then
      v_result := jsonb_set(v_result,'{changed}',coalesce(v_result->'changed','[]'::jsonb) || '"installment_months"'::jsonb);
    end if;
    if v_services then
      v_result := jsonb_set(v_result,'{changed}',coalesce(v_result->'changed','[]'::jsonb) || '"services"'::jsonb);
    end if;
  end if;

  update sales_order_amendments
     set status='applied', decided_by=auth.uid(), decided_at=now(), applied_at=now(),
         decision_note=v_note, decision_impact=v_impact
   where id=v_a.id;
  insert into order_history(order_id,text,by_role,by_user_id,metadata)
  values(v_a.order_id,'Amendment approved and applied - Rev ' || (v_result->>'revision'),
    v_role::app_role,auth.uid(),
    jsonb_build_object('kind','amendment_applied','amendment_id',v_a.id,
                       'reason',coalesce(v_a.reason,v_note),'decision_note',v_note,
                       'evidence',v_a.evidence_note,
                       'revision',(v_result->'revision'),'impact',v_impact));
  return jsonb_build_object('id',v_a.id,'status','applied','revision',v_result->'revision',
                            'changed',v_result->'changed');
end $$;

-- ── 5 · the save wrapper: proceed lock exempt for the approved lane only ──
create or replace function public.sales_order_save_revision(
  p_order_id uuid,
  p_header   jsonb default '{}'::jsonb,
  p_lines    jsonb default null,
  p_change   jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old        record;
  v_line       jsonb;
  v_attrs      jsonb;
  v_new_price  numeric;
  v_proceed    date;
  v_order      record;
  -- 0420 · Set only by `sales_order_decide_amendment`, transaction-local, and
  -- unreachable from a PostgREST caller. `current_setting(..., true)` returns
  -- NULL rather than raising when the setting was never set.
  v_amending   boolean := coalesce(current_setting('carres.applying_amendment', true), '') = 'on';
begin
  -- 0391 · THE PROCEED LOCK. Runs before anything is written, so a refused
  -- save changes nothing.
  -- 0562 · EXEMPTED FOR THE APPROVED AMENDMENT ONLY (owner ruling, Jess
  -- 2026-09-22: "proceed date can edit" — through Edit, a reason and the
  -- governed approval path). A direct save still cannot move a recorded date.
  if p_header ? 'proceed_date' and not v_amending then
    select proceed_date into v_proceed
      from public.orders
     where id = p_order_id;

    if v_proceed is not null
       and nullif(p_header->>'proceed_date','')::date is distinct from v_proceed then
      raise exception 'The proceed date is already recorded and cannot be changed here'
        using errcode = '22023', detail = 'proceed_date_recorded';
    end if;
  end if;

  -- ── 0415 · THE TWO NEW LOCKS ────────────────────────────────────────────
  -- One read, reused by both. A save that changes nothing they guard never
  -- notices they are here.
  select status, delivery_date, delivery_date_tbd,
         delivery_floor, delivery_has_lift, delivery_stair_items
    into v_order
    from public.orders
   where id = p_order_id;

  -- F-11 · THE PROMISED DATE MOVES THROUGH THE AMENDMENT, NEVER HERE.
  -- Tested on the VALUE: the office form posts the header it holds, and a save
  -- that echoes today's date is not a change to it.
  -- 0420 · …and when this IS the amendment, the sentence would refuse the door
  -- it names. `v_amending` is the amendment lane identifying itself.
  if not v_amending then
    if p_header ? 'delivery_date'
       and nullif(p_header->>'delivery_date','')::date is distinct from v_order.delivery_date then
      raise exception 'The promised delivery date is changed through the amendment, not here'
        using errcode = '22023', detail = 'promise_moves_by_amendment';
    end if;
    if p_header ? 'delivery_date_tbd'
       and coalesce((p_header->>'delivery_date_tbd')::boolean, false)
           is distinct from coalesce(v_order.delivery_date_tbd, false) then
      raise exception 'The promised delivery date is changed through the amendment, not here'
        using errcode = '22023', detail = 'promise_moves_by_amendment';
    end if;
  end if;

  -- F-12 · DELIVERY FACTS FREEZE AFTER PROCEED — the same rule `0222` gives
  -- the shop door, by VALUE for the reason in 0415's header.
  -- 0420 · The freeze protects the crew's briefing from a silent edit, not
  -- from a principal-approved amendment, which is how a re-brief is issued.
  if v_order.status = 'proceed_order' and not v_amending then
    if (p_header ? 'delivery_floor'
        and nullif(p_header->>'delivery_floor','')::int is distinct from v_order.delivery_floor)
    or (p_header ? 'delivery_has_lift'
        and (p_header->>'delivery_has_lift')::boolean is distinct from v_order.delivery_has_lift)
    or (p_header ? 'delivery_stair_items'
        and nullif(p_header->>'delivery_stair_items','')::int
            is distinct from v_order.delivery_stair_items) then
      raise exception 'Delivery fields are locked after Proceed'
        using errcode = '22023', detail = 'proceed_locked_fields';
    end if;
  end if;

  -- 0385 · PROMO PARITY, reproduced verbatim. A header-only correction does
  -- not touch goods. When the complete line payload is supplied, every
  -- protected line must survive unchanged. NOT exempted: a free gift is not
  -- the customer's to re-price through an amendment either.
  if p_lines is not null then
    for v_old in
      select id, sku, qty, unit_price, attrs
        from public.order_lines
       where order_id = p_order_id
    loop
      v_attrs := coalesce(v_old.attrs, '{}'::jsonb);
      if v_attrs ?| array['free_gift', 'free_item', 'pwp', 'bundle_group', 'combo_key'] then
        v_line := null;
        select l into v_line
          from jsonb_array_elements(p_lines) as e(l)
         where nullif(l->>'id', '') is not null
           and (l->>'id')::uuid = v_old.id;

        if v_line is null then
          raise exception 'line % is not editable', v_old.id
            using errcode = '22023', detail = 'line_not_editable';
        end if;

        v_new_price := nullif(v_line->>'unit_price', '')::numeric;
        if trim(coalesce(v_line->>'sku', '')) is distinct from v_old.sku
           or nullif(v_line->>'qty', '')::int is distinct from v_old.qty
           or v_new_price is distinct from v_old.unit_price then
          raise exception 'line % is not editable', v_old.id
            using errcode = '22023', detail = 'line_not_editable';
        end if;
      end if;
    end loop;
  end if;

  return public.sales_order_save_revision_unchecked_0354(
    p_order_id, p_header, p_lines, p_change
  );
end;
$$;

-- ── 6 · the writer: a line's configuration travels with it ────────────────
CREATE OR REPLACE FUNCTION public.sales_order_save_revision_unchecked_0354(p_order_id uuid, p_header jsonb DEFAULT '{}'::jsonb, p_lines jsonb DEFAULT NULL::jsonb, p_change jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role        text := public.app_role();
  v_order       orders%rowtype;
  v_changed     text[] := '{}';
  v_next        int;
  v_line        jsonb;
  v_keep_ids    uuid[] := '{}';
  v_id          uuid;
  v_old         jsonb;
  v_new         jsonb;
  v_keys        text[] := array[
    'customer_name','customer_phone','customer_email','customer_address',
    'customer_address_line1','customer_address_line2','customer_address_city',
    'customer_address_state','customer_address_postcode','customer_emergency',
    'customer_billing','delivery_date','delivery_date_tbd','proceed_date',
    'delivery_floor','delivery_has_lift',
    -- 0354 · every remaining question the Sales Portal asks
    'customer_race','customer_gender','customer_birthday',
    'customer_address_unknown','customer_billing_same','delivery_stair_items',
    'entry_fields'
  ];
  v_key         text;
  v_work        int := 0;
  v_change_type text;
  v_note        text;
  v_contractual boolean;
  v_thread      record;
  v_floor       jsonb;
  v_floor_names text[];
  v_proposed    jsonb := null;
  v_fields      jsonb;
begin
  if (v_role is null or v_role not in ('operation','principal')) then
    raise exception 'Operation/Principal only' using errcode = '42501';
  end if;
  if p_header ? 'salesperson_id' or p_header ? 'outlet_id'
     or p_header ? 'dealer_id' or p_header ? 'channel' then
    raise exception 'Attribution moves by request - submit an attribution change for approval'
      using errcode = '22023', detail = 'attribution_by_request';
  end if;

  -- The cause, validated up front. Whether it is REQUIRED is decided after
  -- the diff — only a change that moves the contractual fields demands it.
  if p_change is not null then
    if jsonb_typeof(p_change) <> 'object' then
      raise exception 'p_change must be an object' using errcode = '22023';
    end if;
    v_change_type := nullif(trim(coalesce(p_change->>'change_type','')), '');
    v_note        := nullif(trim(coalesce(p_change->>'note','')), '');
    if v_change_type is not null
       and v_change_type not in ('staff_correction','customer_change') then
      raise exception 'change_type must be staff_correction or customer_change'
        using errcode = '22023', detail = 'invalid_change_type';
    end if;
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if (p_header is null or p_header = '{}'::jsonb) and p_lines is null then
    raise exception 'Nothing to save' using errcode = '22023';
  end if;

  -- 0257 parity + Card 1 §7: a line with a live procurement thread is a
  -- production commitment. Removing it (the delete would CASCADE the thread,
  -- 0124) or changing its SKU refuses BEFORE anything is written. Qty and
  -- price edits pass through — the received floor and the operation gate
  -- speak to those below.
  if p_lines is not null and jsonb_typeof(p_lines) = 'array' then
    for v_thread in
      select ol.id, ol.sku
        from order_lines ol
       where ol.order_id = p_order_id
         and exists (select 1 from order_supplier_threads t where t.order_line_id = ol.id)
    loop
      select l into v_line
        from jsonb_array_elements(p_lines) l
       where nullif(l->>'id','') is not null
         and (l->>'id')::uuid = v_thread.id;
      if v_line is null then
        raise exception 'Line % is in production - it cannot be removed here', v_thread.sku
          using errcode = '22023', detail = 'line_in_production';
      end if;
      if trim(coalesce(v_line->>'sku','')) is distinct from v_thread.sku then
        raise exception 'Line % is in production - its item cannot be changed here', v_thread.sku
          using errcode = '22023', detail = 'line_in_production';
      end if;
    end loop;
  end if;

  v_old := public.sales_order_snapshot(p_order_id);
  if not exists (select 1 from sales_order_revisions where order_id = p_order_id) then
    insert into sales_order_revisions(order_id, revision, snapshot, created_by)
    values (p_order_id, 1, v_old, auth.uid());
  end if;

  foreach v_key in array v_keys loop
    if p_header ? v_key then
      case v_key
        when 'delivery_date' then
          update orders set delivery_date = nullif(p_header->>'delivery_date','')::date where id = p_order_id;
        when 'proceed_date' then
          update orders set proceed_date = nullif(p_header->>'proceed_date','')::date where id = p_order_id;
        when 'delivery_date_tbd' then
          update orders set delivery_date_tbd = coalesce((p_header->>'delivery_date_tbd')::boolean, false) where id = p_order_id;
        when 'delivery_floor' then
          update orders set delivery_floor = coalesce((p_header->>'delivery_floor')::int, 1) where id = p_order_id;
        when 'delivery_has_lift' then
          update orders set delivery_has_lift = coalesce((p_header->>'delivery_has_lift')::boolean, false) where id = p_order_id;
        when 'customer_name' then
          if coalesce(p_header->>'customer_name','') !~ '[^[:space:]]' then
            raise exception 'Customer name is required' using errcode = '22023';
          end if;
          update orders set customer_name = trim(p_header->>'customer_name') where id = p_order_id;
        -- 0354 · the typed columns cannot ride the generic text path.
        when 'customer_birthday' then
          update orders set customer_birthday = nullif(p_header->>'customer_birthday','')::date where id = p_order_id;
        when 'customer_address_unknown' then
          update orders set customer_address_unknown = coalesce((p_header->>'customer_address_unknown')::boolean, false) where id = p_order_id;
        when 'customer_billing_same' then
          update orders set customer_billing_same = coalesce((p_header->>'customer_billing_same')::boolean, true) where id = p_order_id;
        when 'delivery_stair_items' then
          update orders set delivery_stair_items = nullif(p_header->>'delivery_stair_items','')::int where id = p_order_id;
        -- 0219's bag: the building type and the operator's own fields. MERGED,
        -- never replaced — the form sends the keys it renders, and a config
        -- field retired last month must not be erased by an unrelated save.
        -- An explicit JSON null CLEARS one key, which is how the form empties
        -- a field the operator blanked.
        when 'entry_fields' then
          if jsonb_typeof(p_header->'entry_fields') <> 'object' then
            raise exception 'entry_fields must be an object' using errcode = '22023';
          end if;
          v_fields := coalesce(v_order.entry_data->'fields','{}'::jsonb) || (p_header->'entry_fields');
          v_fields := coalesce((
            select jsonb_object_agg(k, val)
              from jsonb_each(v_fields) e(k, val)
             where jsonb_typeof(val) <> 'null' and nullif(trim(val #>> '{}'),'') is not null
          ), '{}'::jsonb);
          update orders
             set entry_data = jsonb_set(
                   coalesce(entry_data, '{}'::jsonb), '{fields}', v_fields, true)
           where id = p_order_id;
        else
          execute format('update orders set %I = $1 where id = $2', v_key)
            using nullif(p_header->>v_key, ''), p_order_id;
      end case;
    end if;
  end loop;

  if p_lines is not null then
    if jsonb_typeof(p_lines) <> 'array' then
      raise exception 'p_lines must be an array' using errcode = '22023';
    end if;
    if jsonb_array_length(p_lines) = 0 then
      raise exception 'An order needs at least one item' using errcode = '22023';
    end if;
    for v_line in select * from jsonb_array_elements(p_lines) loop
      if length(trim(coalesce(v_line->>'sku',''))) = 0 then
        raise exception 'A line needs a SKU' using errcode = '22023';
      end if;
      if coalesce((v_line->>'qty')::int, 0) < 1 then
        raise exception 'Line % qty must be at least 1', v_line->>'sku' using errcode = '22023';
      end if;
      if coalesce((v_line->>'unit_price')::numeric, -1) < 0 then
        raise exception 'Line % needs a unit price of 0 or more', v_line->>'sku' using errcode = '22023';
      end if;
      if v_line ? 'id' and nullif(v_line->>'id','') is not null then
        v_id := (v_line->>'id')::uuid;
        -- 0562 · A LINE'S CONFIGURATION TRAVELS WITH IT. `attrs` is written only
        -- when the caller names it; a payload without the key leaves the stored
        -- configuration exactly as it was (the office Save never sends lines).
        update order_lines
           set sku = trim(v_line->>'sku'),
               qty = (v_line->>'qty')::int,
               unit_price = (v_line->>'unit_price')::numeric,
               attrs = case
                         when v_line ? 'attrs' then
                           case when jsonb_typeof(v_line->'attrs') = 'object' then v_line->'attrs' else null end
                         else attrs
                       end
         where id = v_id and order_id = p_order_id;
        if not found then
          raise exception 'Line % does not belong to this order', v_id using errcode = '22023';
        end if;
      else
        insert into order_lines(order_id, sku, qty, unit_price, attrs)
        values (p_order_id, trim(v_line->>'sku'), (v_line->>'qty')::int, (v_line->>'unit_price')::numeric,
                case when jsonb_typeof(v_line->'attrs') = 'object' then v_line->'attrs' else null end)
        returning id into v_id;
      end if;
      v_keep_ids := array_append(v_keep_ids, v_id);
    end loop;
    delete from order_lines
     where order_id = p_order_id
       and not (id = any(v_keep_ids));
  end if;

  v_new := public.sales_order_snapshot(p_order_id);
  if v_new = v_old then
    raise exception 'Nothing changed' using errcode = '22023';
  end if;

  foreach v_key in array v_keys loop
    if (v_old->'header'->v_key) is distinct from (v_new->'header'->v_key) then
      v_changed := array_append(v_changed, v_key);
    end if;
  end loop;
  if (v_old->'lines') is distinct from (v_new->'lines') then
    v_changed := array_append(v_changed, 'items');
  end if;

  -- CARD 1 §3 · a contractual change states its cause; a pure Class-B
  -- correction (contact / address / floor / proceed_date) IS a correction.
  v_contractual := ('items' = any(v_changed))
                or ('delivery_date' = any(v_changed))
                or ('delivery_date_tbd' = any(v_changed));
  if v_contractual and v_change_type is null then
    raise exception 'Say who asked: staff correction or customer change'
      using errcode = '22023', detail = 'change_type_required';
  end if;
  if not v_contractual then
    v_change_type := coalesce(v_change_type, 'staff_correction');
  end if;

  -- THE FLOORS BITE (0328, GATE 6/7) — evaluated on what ACTUALLY changed,
  -- inside the same transaction; any BLOCK rolls the whole save back.
  v_floor_names := array(select case when k = 'items' then 'order_lines' else k end
                           from unnest(v_changed) k);
  if 'order_lines' = any(v_floor_names) then
    select jsonb_agg(jsonb_build_object('sku', sku, 'qty', qty))
      into v_proposed
      from order_lines where order_id = p_order_id;
  end if;
  for v_floor in
    select f from jsonb_array_elements(
      public.sales_order_floors(p_order_id, v_floor_names, v_proposed)->'findings') f
    where f->>'severity' = 'BLOCK'
  loop
    raise exception '%', coalesce(v_floor->>'evidence', 'Blocked by a downstream floor')
      using errcode = '22023', detail = 'blocked_by_floor';
  end loop;

  select coalesce(max(revision), 1) + 1 into v_next
    from sales_order_revisions where order_id = p_order_id;
  insert into sales_order_revisions(order_id, revision, snapshot, created_by, change_type, note)
  values (p_order_id, v_next, v_new, auth.uid(), v_change_type, v_note);

  insert into order_history(order_id, text, by_role, by_user_id, metadata)
  values (p_order_id,
          case v_change_type
            when 'customer_change' then 'Customer change - Rev '
            else 'Staff correction - Rev '
          end || v_next || ' - ' || array_to_string(v_changed, ', '),
          v_role::app_role, auth.uid(),
          jsonb_build_object('kind','edit','changed', to_jsonb(v_changed), 'revision', v_next,
                             'change_type', v_change_type, 'note', v_note));

  -- 3.4 · the consequence outlives the tab (0332/0333, unchanged).
  begin
    v_work := public._raise_correction_work(p_order_id, v_floor_names, v_next, 'B');
  exception when others then
    raise warning 'correction work not raised for % rev %: %', p_order_id, v_next, sqlerrm;
  end;

  return jsonb_build_object('revision', v_next, 'changed', to_jsonb(v_changed),
                            'change_type', v_change_type,
                            'correction_work_raised', v_work);
end $function$;

-- ── 7 · the live read carries the evidence and the proposal's base ────────
create or replace function public.sales_order_amendment_live(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text := public.app_role();
  v_a    sales_order_amendments%rowtype;
  v_now  text;
begin
  if (v_role is null or v_role not in ('operation','principal','finance','hr','bd')) then
    raise exception 'Internal roles only' using errcode = '42501';
  end if;
  select * into v_a from sales_order_amendments
   where order_id = p_order_id
     and status in ('draft','submitted','issued','accepted')
   order by submitted_at desc limit 1;
  if not found then
    return jsonb_build_object('amendment', null);
  end if;
  v_now := public.sales_order_contractual_hash(p_order_id);
  return jsonb_build_object('amendment', jsonb_build_object(
    'id', v_a.id,
    'status', v_a.status,
    'reason', v_a.reason,
    'customer_asked_on', v_a.customer_asked_on,
    'base_revision', v_a.base_revision,
    'base_contractual_hash', v_a.base_contractual_hash,
    'current_contractual_hash', v_now,
    'stale', v_now is distinct from v_a.base_contractual_hash,
    'proposed_snapshot', v_a.proposed_snapshot,
    'submitted_at', v_a.submitted_at,
    'submitted_by', v_a.submitted_by,
    'evidence_note', v_a.evidence_note,
    'evidence_recorded_at', v_a.evidence_recorded_at,
    'evidence_covers_proposal',
      v_a.evidence_note is not null and v_a.evidence_proposal_hash = md5(v_a.proposed_snapshot::text)));
end $$;

revoke all on function public.sales_order_record_amendment_evidence(uuid, text) from public, anon;
revoke all on function public.sales_order_withdraw_amendment(uuid, text) from public, anon;
grant execute on function public.sales_order_record_amendment_evidence(uuid, text) to authenticated;
grant execute on function public.sales_order_withdraw_amendment(uuid, text) to authenticated;

commit;

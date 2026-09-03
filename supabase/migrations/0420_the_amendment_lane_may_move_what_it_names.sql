-- 0420_the_amendment_lane_may_move_what_it_names
--
-- THE LOCK REFUSED THE ONLY DOOR IT NAMED.
--
-- 0415 F-11 raises `The promised delivery date is changed through the
-- amendment, not here` whenever `p_header` carries a `delivery_date` whose
-- value differs from the order's. The sentence is correct and the rule is
-- correct. But the amendment lane APPLIES its approved proposal by calling
-- that very function:
--
--     0348 §264 · sales_order_decide_amendment
--       v_result := public.sales_order_save_revision(
--         v_a.order_id, v_header, v_lines, ...);
--
-- and `v_header` is built at 0348 §223-227 from `proposed_snapshot`, which
-- carries `delivery_date` precisely when the proposal moves the date. So F-11
-- fires on the approval itself.
--
-- MEASURED (YH, 2026-09-03, production). An old order with no proceed date:
-- the edit form refuses with F-11 and points at the amendment; the amendment
-- is submitted; `Approve and apply` then raises the SAME sentence as a toast.
-- Both doors refuse, and one of them refuses by quoting the other. There is no
-- third door. The date could not be changed at all.
--
-- F-12 has the same shape one step further on: an approved amendment that
-- moves `delivery_floor`, `delivery_has_lift` or `delivery_stair_items` on a
-- `proceed_order` order is refused by `proceed_locked_fields`. The Proceed
-- freeze exists so the crew is not sent to a different building than the one
-- they were briefed on — but a GOVERNED, principal-approved amendment is the
-- sanctioned way to re-brief them. Owner ruling (YH, 2026-09-03): the
-- amendment moves floor and lift too.
--
-- ---- HOW THE EXEMPTION IS SCOPED, AND WHY IT CANNOT LEAK ------------------
--
-- `sales_order_decide_amendment` sets a TRANSACTION-LOCAL setting immediately
-- before it calls the writer, and clears it immediately after:
--
--     perform set_config('carres.applying_amendment', 'on', true);
--
-- The third argument is `is_local` — the value dies at COMMIT or ROLLBACK, it
-- is never inherited by another session, and it cannot be set by a PostgREST
-- caller, because PostgREST gives each RPC its own transaction with exactly
-- one statement in it. A caller who reaches `sales_order_save_revision`
-- directly therefore never has the flag set, and the office door stays locked
-- exactly as 0415 left it.
--
-- What the flag does NOT open: the 0391 proceed-date lock, the 0385 promo
-- parity loop, the whole write whitelist in
-- `sales_order_save_revision_unchecked_0354`, and every guard downstream of
-- it. Only F-11 and F-12 read it. The amendment lane's own guards — principal
-- only, decision note required, staleness check, line-identity check — all run
-- before the flag is set and are untouched.
--
-- Both function bodies are reproduced from their current definitions (0415 for
-- the writer, 0348 for the decider) with ONLY the marked lines added. Nothing
-- else in either is retyped or reordered.
--
-- No column, no table, no grant on a new object, no RLS policy moves.

set search_path = public;

-- ---------------------------------------------------------------------
-- 1. The two locks learn one exemption
-- ---------------------------------------------------------------------

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
  -- save changes nothing. NOT exempted: an amendment proposes what the
  -- customer asked for, and the factory start date is not that.
  if p_header ? 'proceed_date' then
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

comment on function public.sales_order_save_revision(uuid, jsonb, jsonb, jsonb) is
  '0327 door; 0391 wrapper (proceed lock + 0385 promo parity); 0415 adds F-11 (the promised date moves through the amendment, never here) and F-12 (delivery floor/lift/stair count freeze after Proceed). 0420: F-11 and F-12 alone stand down when the transaction-local setting carres.applying_amendment is on, which only sales_order_decide_amendment sets and no PostgREST caller can. Delegates unchanged to sales_order_save_revision_unchecked_0354.';

-- ---------------------------------------------------------------------
-- 2. The amendment lane identifies itself to the writer
-- ---------------------------------------------------------------------
-- 0348's body, with two added lines around the one call it makes to the
-- writer. Every guard above that call is unchanged and still runs first.

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
  v_result jsonb;
  v_before jsonb;
  v_next int;
begin
  if v_role <> 'principal' then
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

  if v_a.proposed_snapshot ? 'delivery_date' then
    v_header := v_header || jsonb_build_object('delivery_date',v_a.proposed_snapshot->'delivery_date');
  end if;
  if v_a.proposed_snapshot ? 'delivery_date_tbd' then
    v_header := v_header || jsonb_build_object('delivery_date_tbd',v_a.proposed_snapshot->'delivery_date_tbd');
  end if;
  v_before := public.sales_order_snapshot(v_a.order_id);
  if v_a.proposed_snapshot ? 'installment_months' then
    update orders set installment_months = nullif(v_a.proposed_snapshot->>'installment_months','')::int
      where id = v_a.order_id;
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

  if v_lines is null and v_header = '{}'::jsonb and v_a.proposed_snapshot ? 'installment_months' then
    if public.sales_order_snapshot(v_a.order_id) = v_before then
      raise exception 'Nothing changed' using errcode = '22023', detail = 'nothing_changed';
    end if;
    select coalesce(max(revision),1)+1 into v_next from sales_order_revisions where order_id=v_a.order_id;
    insert into sales_order_revisions(order_id,revision,snapshot,created_by,change_type,note)
    values(v_a.order_id,v_next,public.sales_order_snapshot(v_a.order_id),auth.uid(),'customer_change',coalesce(v_a.reason,v_note));
    insert into order_history(order_id,text,by_role,by_user_id,metadata)
    values(v_a.order_id,'Customer change - Rev '||v_next||' - installment_months',v_role::app_role,auth.uid(),
      jsonb_build_object('kind','edit','changed',jsonb_build_array('installment_months'),'revision',v_next));
    v_result := jsonb_build_object('revision',v_next,'changed',jsonb_build_array('installment_months'));
  else
    -- 0420 · EVERY GUARD ABOVE HAS ALREADY PASSED — principal, decision note,
    -- not already decided, not stale, every proposed line still owned by this
    -- order. Only now does the lane name itself to the writer, so 0415's F-11
    -- and F-12 know this is the door they point at. `true` is is_local: the
    -- setting dies with this transaction and no other caller can see it.
    perform set_config('carres.applying_amendment','on',true);
    v_result := public.sales_order_save_revision(
      v_a.order_id,v_header,v_lines,
      jsonb_build_object('change_type','customer_change','note',coalesce(v_a.reason,v_note)));
    -- 0420 · Cleared the moment the writer returns, so nothing later in this
    -- transaction inherits the exemption.
    perform set_config('carres.applying_amendment','',true);
    if v_a.proposed_snapshot ? 'installment_months' then
      v_result := jsonb_set(v_result,'{changed}',coalesce(v_result->'changed','[]'::jsonb) || '"installment_months"'::jsonb);
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
                       'revision',(v_result->'revision'),'impact',v_impact));
  return jsonb_build_object('id',v_a.id,'status','applied','revision',v_result->'revision',
                            'changed',v_result->'changed');
end $$;

revoke all on function public.sales_order_decide_amendment(uuid,text,text) from public, anon;
grant execute on function public.sales_order_decide_amendment(uuid,text,text) to authenticated;

comment on function public.sales_order_decide_amendment(uuid,text,text) is
  '0348 governed amendment decision. 0420: before it applies an approved proposal it sets the transaction-local carres.applying_amendment, so 0415 F-11 (promised date) and F-12 (delivery floor/lift/stair after Proceed) stand down for the one door they name, and clears it as soon as the writer returns.';

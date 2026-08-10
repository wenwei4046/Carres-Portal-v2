-- 0329 · ATTRIBUTION MOVES BY REQUEST, AND THE SIDE DOORS CLOSE
-- (STAGE 3 · card 3.3 — Class B + Test 3: SUBMIT → APPROVE → APPLY)
--
-- GATES (frozen): GATE 2b — attribution moves money/commission between
-- parties → INTERNAL approval. GATE 3 — Salesperson/Showroom: hr OR
-- principal; Dealer: principal ONLY; the gate is a SERVER-SIDE RPC, because
-- internal roles have no dealer_id write floor in RLS. GATE 4 — APPROVE
-- changes exactly one thing (request.status); APPLY is the only verb that
-- moves the order: lock → re-run floors → explicit column allowlist → mint
-- revision → stamp applied_at; second call is a no-op.
--
-- Decisions logged for the wall report:
--   · `channel` approver = principal ONLY (it moves dealer↔showroom
--     economics; GATE 3 names only the other two lines — conservative).
--   · Rev-1-if-none + mint pattern inlined from 0327 (same six lines);
--     0327's proven function body is not touched in this card.
--   · SUBMIT does not pre-run floors — floors are re-run at APPLY where they
--     bind (GATE 4 step 3); a submit on a frozen order simply can never apply.
--
-- ── THE GRANT NARROWING (3.0 ② finding: "the APPLY-only RPC is theatre") ──
-- Inventory of every direct-write call site (2026-08-10, this repo):
--   orders.items_edited          apps/api routes/orders.ts:1795 (POS flag)
--   orders.ops_assigned_logistic apps/api routes/orders.ts:1842 (inbox triage)
--   orders.do_number             apps/api routes/operation/order-control.ts:742
--   order_lines.excluded_from_plan / exclude_from_plan_until
--                                apps/api routes/operation/purchase.ts:531/587
--   partner app                  orders partner-leg columns, guarded by the
--                                0228 column-whitelist trigger
--   apps/web                     ZERO direct table writes
-- Verified: NO invoker-rights function writes these tables (pg_proc sweep),
-- so every RPC path survives. The narrowing below revokes blanket writes and
-- re-grants EXACTLY the inventoried columns — everything else is RPC-only at
-- the GRANT layer, closing GATE 4's floor for 3.3 and 3.8.

-- 1 · kind + one-live-request guard
alter table public.order_change_requests
  drop constraint order_change_requests_kind_check;
alter table public.order_change_requests
  add constraint order_change_requests_kind_check
  check (kind = any (array['add_lines','replace_lines','edit_addon','promise_date','item_change','attribution']));

create unique index if not exists order_change_requests_one_pending_attribution
  on public.order_change_requests (order_id)
  where status = 'pending' and kind = 'attribution';

-- 2 · SUBMIT — records a request; touches the order never
create or replace function public.sales_order_submit_attribution(
  p_order_id uuid,
  p_changes  jsonb,
  p_reason   text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role   text := public.app_role();
  v_fields text[];
  v_id     uuid;
  v_key    text;
begin
  if v_role not in ('operation','principal') then
    raise exception 'Operation/Principal only' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason,''))) = 0 then
    raise exception 'A reason is required' using errcode = '22023', detail = 'reason_required';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception 'p_changes must be an object' using errcode = '22023';
  end if;
  v_fields := array(select jsonb_object_keys(p_changes));
  if array_length(v_fields,1) is null then
    raise exception 'Nothing to change' using errcode = '22023';
  end if;
  foreach v_key in array v_fields loop
    if v_key not in ('salesperson_id','dealer_id','outlet_id','channel') then
      raise exception 'Field % is not an attribution field', v_key using errcode = '22023';
    end if;
  end loop;
  if p_changes ? 'channel'
     and p_changes->>'channel' not in ('dealer','showroom') then
    raise exception 'channel must be dealer or showroom' using errcode = '22023';
  end if;
  if not exists (select 1 from orders where id = p_order_id) then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  begin
    insert into order_change_requests (order_id, kind, payload, status, requested_by)
    values (p_order_id, 'attribution',
            jsonb_build_object('changes', p_changes, 'reason', trim(p_reason)),
            'pending', auth.uid())
    returning id into v_id;
  exception when unique_violation then
    raise exception 'An attribution change is already waiting on this order'
      using errcode = '22023', detail = 'pending_exists';
  end;

  insert into order_history(order_id, text, by_role, by_user_id, metadata)
  values (p_order_id,
          'Attribution change requested — ' || array_to_string(v_fields, ', '),
          v_role::app_role, auth.uid(),
          jsonb_build_object('kind','attribution_requested','fields',to_jsonb(v_fields)));
  return jsonb_build_object('id', v_id, 'fields', to_jsonb(v_fields));
end $$;

-- 3 · APPROVE / REJECT — GATE 3's approver routes; writes the REQUEST only
create or replace function public.sales_order_decide_attribution(
  p_request_id uuid,
  p_decision   text,
  p_note       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.app_role();
  v_req  order_change_requests%rowtype;
  v_fields text[];
begin
  if p_decision not in ('approved','rejected') then
    raise exception 'decision must be approved or rejected' using errcode = '22023';
  end if;
  select * into v_req from order_change_requests where id = p_request_id for update;
  if not found or v_req.kind <> 'attribution' then
    raise exception 'Attribution request not found' using errcode = 'P0002';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'This request was already decided'
      using errcode = '22023', detail = 'already_decided';
  end if;
  v_fields := array(select jsonb_object_keys(v_req.payload->'changes'));
  -- GATE 3, frozen: Dealer → principal ONLY (channel rides the same lane —
  -- decision logged); Salesperson / Showroom → hr OR principal.
  if (v_fields && array['dealer_id','channel']) then
    if v_role <> 'principal' then
      raise exception 'Dealer/channel attribution is approved by the principal only'
        using errcode = '42501', detail = 'approver_principal_only';
    end if;
  else
    if v_role not in ('hr','principal') then
      raise exception 'Salesperson/showroom attribution is approved by HR or the principal'
        using errcode = '42501', detail = 'approver_hr_or_principal';
    end if;
  end if;

  update order_change_requests
     set status = p_decision,
         decided_by = auth.uid(),
         decided_at = now(),
         decision_note = nullif(trim(coalesce(p_note,'')), '')
   where id = p_request_id;

  insert into order_history(order_id, text, by_role, by_user_id, metadata)
  values (v_req.order_id,
          'Attribution change ' || p_decision || ' — ' || array_to_string(v_fields, ', '),
          v_role::app_role, auth.uid(),
          jsonb_build_object('kind','attribution_' || p_decision,'fields',to_jsonb(v_fields)));
  return jsonb_build_object('id', p_request_id, 'status', p_decision);
end $$;

-- 4 · APPLY — the only verb that moves the order
create or replace function public.sales_order_apply_attribution(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role     text := public.app_role();
  v_req      order_change_requests%rowtype;
  v_order    orders%rowtype;
  v_changes  jsonb;
  v_fields   text[];
  v_floors   jsonb;
  v_block    jsonb;
  v_old      jsonb;
  v_next     int;
begin
  if v_role not in ('operation','principal') then
    raise exception 'Operation/Principal only' using errcode = '42501';
  end if;
  select * into v_req from order_change_requests where id = p_request_id for update;
  if not found or v_req.kind <> 'attribution' then
    raise exception 'Attribution request not found' using errcode = 'P0002';
  end if;
  -- GATE 4: a second call is a no-op (applied_at is the idempotency guard).
  if v_req.applied_at is not null then
    return jsonb_build_object('id', p_request_id, 'already_applied', true);
  end if;
  if v_req.status <> 'approved' then
    raise exception 'Only an approved request can be applied'
      using errcode = '22023', detail = 'not_approved';
  end if;

  select * into v_order from orders where id = v_req.order_id for update;
  v_changes := v_req.payload->'changes';
  v_fields  := array(select jsonb_object_keys(v_changes));

  -- GATE 4 step 3: re-run EVERY floor — one may have been crossed since
  -- SUBMIT or APPROVE. Any BLOCK fails the apply WHOLE, with the floor's own
  -- sentence (0272's included).
  v_floors := public.sales_order_floors(v_req.order_id, v_fields);
  select f into v_block from jsonb_array_elements(v_floors->'findings') f
   where f->>'severity' = 'BLOCK' limit 1;
  if v_block is not null then
    raise exception '%', v_block->>'evidence' using errcode = '22023', detail = 'floor_blocked';
  end if;

  -- Rev 1 = the original, minted from the PRE-change state (0327 pattern).
  v_old := public.sales_order_snapshot(v_req.order_id);
  if not exists (select 1 from sales_order_revisions where order_id = v_req.order_id) then
    insert into sales_order_revisions(order_id, revision, snapshot, created_by)
    values (v_req.order_id, 1, v_old, auth.uid());
  end if;

  -- GATE 4 step 4: EXPLICIT COLUMN ALLOWLIST — never a payload spread.
  update orders set
    salesperson_id = case when v_changes ? 'salesperson_id'
                          then nullif(v_changes->>'salesperson_id','')::uuid
                          else salesperson_id end,
    dealer_id      = case when v_changes ? 'dealer_id'
                          then (v_changes->>'dealer_id')::uuid
                          else dealer_id end,
    outlet_id      = case when v_changes ? 'outlet_id'
                          then nullif(v_changes->>'outlet_id','')::uuid
                          else outlet_id end,
    channel        = case when v_changes ? 'channel'
                          then v_changes->>'channel'
                          else channel end,
    updated_at     = now()
  where id = v_req.order_id;

  select coalesce(max(revision), 1) + 1 into v_next
    from sales_order_revisions where order_id = v_req.order_id;
  insert into sales_order_revisions(order_id, revision, snapshot, created_by)
  values (v_req.order_id, v_next, public.sales_order_snapshot(v_req.order_id), auth.uid());

  update order_change_requests set applied_at = now() where id = p_request_id;

  insert into order_history(order_id, text, by_role, by_user_id, metadata)
  values (v_req.order_id,
          'Attribution change applied · Rev ' || v_next || ' — ' || array_to_string(v_fields, ', '),
          v_role::app_role, auth.uid(),
          jsonb_build_object('kind','attribution_applied','fields',to_jsonb(v_fields),'revision',v_next));

  return jsonb_build_object('id', p_request_id, 'revision', v_next,
                            'changed', to_jsonb(v_fields), 'findings', v_floors->'findings');
end $$;

-- 5 · Stage 2's SAVE loses the Test-3 fields — attribution moves by request
-- now. Same body as 0327's, with salesperson_id / outlet_id REMOVED from the
-- whitelist (a save carrying them raises, naming the request lane).
create or replace function public.sales_order_save_revision(
  p_order_id uuid,
  p_header   jsonb default '{}'::jsonb,
  p_lines    jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role      text := public.app_role();
  v_order     orders%rowtype;
  v_changed   text[] := '{}';
  v_next      int;
  v_line      jsonb;
  v_keep_ids  uuid[] := '{}';
  v_id        uuid;
  v_old       jsonb;
  v_new       jsonb;
  v_keys      text[] := array[
    'customer_name','customer_phone','customer_email','customer_address',
    'customer_address_line1','customer_address_line2','customer_address_city',
    'customer_address_state','customer_address_postcode','customer_emergency',
    'customer_billing','delivery_date','delivery_date_tbd','proceed_date',
    'delivery_floor','delivery_has_lift'
  ];
  v_key       text;
begin
  if v_role not in ('operation','principal') then
    raise exception 'Operation/Principal only' using errcode = '42501';
  end if;
  if p_header ? 'salesperson_id' or p_header ? 'outlet_id'
     or p_header ? 'dealer_id' or p_header ? 'channel' then
    raise exception 'Attribution moves by request — submit an attribution change for approval'
      using errcode = '22023', detail = 'attribution_by_request';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if (p_header is null or p_header = '{}'::jsonb) and p_lines is null then
    raise exception 'Nothing to save' using errcode = '22023';
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
          if length(trim(coalesce(p_header->>'customer_name',''))) = 0 then
            raise exception 'Customer name is required' using errcode = '22023';
          end if;
          update orders set customer_name = trim(p_header->>'customer_name') where id = p_order_id;
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
        update order_lines
           set sku = trim(v_line->>'sku'),
               qty = (v_line->>'qty')::int,
               unit_price = (v_line->>'unit_price')::numeric
         where id = v_id and order_id = p_order_id;
        if not found then
          raise exception 'Line % does not belong to this order', v_id using errcode = '22023';
        end if;
      else
        insert into order_lines(order_id, sku, qty, unit_price)
        values (p_order_id, trim(v_line->>'sku'), (v_line->>'qty')::int, (v_line->>'unit_price')::numeric)
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

  select coalesce(max(revision), 1) + 1 into v_next
    from sales_order_revisions where order_id = p_order_id;
  insert into sales_order_revisions(order_id, revision, snapshot, created_by)
  values (p_order_id, v_next, v_new, auth.uid());

  insert into order_history(order_id, text, by_role, by_user_id, metadata)
  values (p_order_id,
          'Order edited · Rev ' || v_next || ' — ' || array_to_string(v_changed, ', '),
          v_role::app_role, auth.uid(),
          jsonb_build_object('kind','edit','changed', to_jsonb(v_changed), 'revision', v_next));

  return jsonb_build_object('revision', v_next, 'changed', to_jsonb(v_changed));
end $$;

-- 6 · THE SIDE DOORS CLOSE — GRANT narrowing per the inventory above.
revoke all on public.orders from anon, authenticated;
revoke all on public.order_lines from anon, authenticated;
revoke all on public.order_addons from anon, authenticated;
grant select on public.orders to authenticated;
grant select on public.order_lines to authenticated;
grant select on public.order_addons to authenticated;
grant update (partner_stage, partner_picked_at, partner_eta, partner_accepted_at,
              partner_rejected_at, partner_rejected_reason, pod_signature_url,
              pod_signed_by, pod_signed_at, updated_at, items_edited,
              ops_assigned_logistic, do_number)
  on public.orders to authenticated;
grant update (excluded_from_plan, exclude_from_plan_until)
  on public.order_lines to authenticated;

revoke all on function public.sales_order_submit_attribution(uuid, jsonb, text) from public;
revoke all on function public.sales_order_decide_attribution(uuid, text, text) from public;
revoke all on function public.sales_order_apply_attribution(uuid) from public;
grant execute on function public.sales_order_submit_attribution(uuid, jsonb, text) to authenticated;
grant execute on function public.sales_order_decide_attribution(uuid, text, text) to authenticated;
grant execute on function public.sales_order_apply_attribution(uuid) to authenticated;

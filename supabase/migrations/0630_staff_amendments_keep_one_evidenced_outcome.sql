-- Scoped owner rulings 2026-10-01. No production apply or live assignments.
-- Existing amendment/revision writers remain the only writers of the SO.
begin;

alter table public.sales_order_amendments
  add column if not exists supplier_confirmations jsonb not null default '[]'::jsonb,
  add column if not exists sales_approved_by uuid,
  add column if not exists sales_approved_at timestamptz,
  add column if not exists sales_approved_terms text,
  add column if not exists sales_approval_note text;

-- Always resolve through the shared assignment authority; Principal role alone
-- is never sufficient. The resolved Sales Approver may decide their own SO exception.
create or replace function public.sales_approver_gate(p_submitter uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid;
begin
  v_actor := nullif(public.workspace_resolve_duty('sales_approver')->>'actor_user_id','')::uuid;
  if v_actor is null or not public.workspace_is_person(v_actor)
     or not exists(select 1 from app_users where id=v_actor and role='principal') then
    raise exception 'Sales Approver' using errcode='42501', detail='sales_approver_unassigned';
  end if;
  if auth.uid() is distinct from v_actor then
    raise exception 'Sales Approver' using errcode='42501', detail='sales_approver_required';
  end if;
end $$;
revoke all on function public.sales_approver_gate(uuid) from public,anon;
grant execute on function public.sales_approver_gate(uuid) to authenticated;

-- Changed physical lines only. Price alone does not change a supplier's goods.
-- Both source commitments and later exact-Unit allocations are authoritative.
create or replace function public._sales_order_amendment_supplier_scope(p_order_id uuid,p_proposed jsonb)
returns table(po_id text,po_line_id uuid,order_line_id uuid)
language sql stable security definer set search_path=public,pg_temp as $$
 with a as (select p_order_id as order_id,p_proposed as proposed_snapshot),
 changed as (
  select l.id from a join order_lines l on l.order_id=a.order_id
  left join lateral (select x from jsonb_array_elements(a.proposed_snapshot->'lines') x
    where x->>'id'=l.id::text) proposed on true
  where jsonb_typeof(a.proposed_snapshot->'lines')='array'
    and (proposed.x is null or (proposed.x->>'sku') is distinct from l.sku
      or (proposed.x->>'qty')::numeric is distinct from l.qty
      or (proposed.x ? 'attrs' and coalesce(proposed.x->'attrs','null'::jsonb) is distinct from coalesce(l.attrs,'null'::jsonb)))
 ), coverage as (
  select s.po_id,s.po_line_id,s.order_line_id from po_line_sources s join changed c on c.id=s.order_line_id
  union
  -- Same governed fallback as routeGoodsLinesOf: a legacy source can name
  -- its one unambiguous order line. Never spread one SKU across sibling lines.
  select s.po_id,s.po_line_id,l.id from a join po_line_sources s on s.order_id=a.order_id
  join order_lines l on l.order_id=a.order_id and l.sku=s.sku
  join changed c on c.id=l.id
  where s.order_line_id is null and (select count(*) from order_lines q where q.order_id=a.order_id and q.sku=s.sku)=1
  union
  select i.po_no,i.po_line_id,i.reserved_order_line_id from ops_stock_items i join changed c on c.id=i.reserved_order_line_id
  where i.po_no is not null and i.po_line_id is not null and i.status not in ('voided','returned_to_supplier','written_off')
 ) select distinct c.* from coverage c join purchase_orders p on p.id=c.po_id
   where p.status::text not in ('draft','cancelled');
$$;
revoke all on function public._sales_order_amendment_supplier_scope(uuid,jsonb) from public,anon,authenticated;
create or replace function public.sales_order_amendment_supplier_scope(p_amendment_id uuid)
returns table(po_id text,po_line_id uuid,order_line_id uuid)
language sql stable security definer set search_path=public,pg_temp as $$
 select s.* from sales_order_amendments a cross join lateral
 public._sales_order_amendment_supplier_scope(a.order_id,a.proposed_snapshot) s where a.id=p_amendment_id;
$$;
revoke all on function public.sales_order_amendment_supplier_scope(uuid) from public,anon,authenticated;

-- This same routing read powers the pre-submit preview and effective gates.
create or replace function public.sales_order_amendment_route(p_order_id uuid,p_proposed jsonb)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare o orders; current_total numeric; proposed_total numeric; price boolean; scope jsonb; sales_duty jsonb; supplier_duty jsonb;
begin
 if coalesce(public.app_role()::text,'') not in ('operation','principal','finance','hr','bd') then
  raise exception 'Internal roles only' using errcode='42501'; end if;
 select * into o from orders where id=p_order_id;
 if not found then raise exception 'Order not found' using errcode='P0002'; end if;
 -- Old SKU-only lineage with two matching lines is not proof about either
 -- one. Refuse the edit until Purchasing's existing line association is known.
 if exists(select 1 from po_line_sources src join purchase_orders po on po.id=src.po_id
   where src.order_id=p_order_id and src.order_line_id is null and po.status::text not in ('draft','cancelled')
     and (select count(*) from order_lines l where l.order_id=p_order_id and l.sku=src.sku)>1
     and p_proposed ? 'lines' and exists(select 1 from order_lines l
       left join lateral (select x from jsonb_array_elements(p_proposed->'lines') x where x->>'id'=l.id::text) proposed on true
       where l.order_id=p_order_id and l.sku=src.sku and (proposed.x is null or proposed.x->>'sku' is distinct from l.sku
         or (proposed.x->>'qty')::numeric is distinct from l.qty
         or (proposed.x ? 'attrs' and proposed.x->'attrs' is distinct from l.attrs)))) then
   raise exception 'Order line not recorded' using errcode='22023',detail='supplier_lineage_unresolved';
 end if;
 select coalesce(sum(qty*unit_price),0) into current_total from order_lines where order_id=p_order_id;
 if p_proposed ? 'lines' then
  select coalesce(sum((x->>'qty')::numeric*(x->>'unit_price')::numeric),0) into proposed_total from jsonb_array_elements(p_proposed->'lines') x;
 else proposed_total:=current_total; end if;
 price:=proposed_total<current_total or exists(select 1 from jsonb_array_elements(p_proposed->'lines') x
   join order_lines l on l.id=nullif(x->>'id','')::uuid and l.order_id=p_order_id where (x->>'unit_price')::numeric<l.unit_price);
 select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) into scope from public._sales_order_amendment_supplier_scope(p_order_id,p_proposed) s;
 sales_duty:=public.workspace_resolve_duty('sales_approver');
 supplier_duty:=public.workspace_resolve_duty('po_duty');
 sales_duty:=sales_duty||jsonb_build_object('acting_user_name',(select name from app_users where id=nullif(sales_duty->>'actor_user_id','')::uuid));
 supplier_duty:=supplier_duty||jsonb_build_object('acting_user_name',(select name from app_users where id=nullif(supplier_duty->>'actor_user_id','')::uuid));
 return jsonb_build_object('supplier_scope',scope,'sales_approval_required',price,
   'legacy_review_required',p_proposed ? 'addons' or (p_proposed ? 'installment_months' and (p_proposed->>'installment_months')::int is distinct from o.installment_months)
     or coalesce(p_proposed->'header','{}'::jsonb)<>'{}'::jsonb,
   'sales_approver',sales_duty,'po_duty',supplier_duty);
end $$;
revoke all on function public.sales_order_amendment_route(uuid,jsonb) from public,anon;
grant execute on function public.sales_order_amendment_route(uuid,jsonb) to authenticated;

-- One policy read, reused by submit, decisions and the page. Unsupported mixed
-- fields retain the old Principal review; this commission does not broaden them.
create or replace function public.sales_order_amendment_gates(p_amendment_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare a sales_order_amendments; route jsonb; scope jsonb; waiting jsonb;
begin
 if coalesce(public.app_role()::text,'') not in ('operation','principal','finance','hr','bd') then
  raise exception 'Internal roles only' using errcode='42501'; end if;
 select * into a from sales_order_amendments where id=p_amendment_id;
 if not found then raise exception 'Amendment not found' using errcode='P0002'; end if;
 route:=public.sales_order_amendment_route(a.order_id,a.proposed_snapshot);
 scope:=route->'supplier_scope';
 select coalesce(jsonb_agg(s),'[]'::jsonb) into waiting from jsonb_array_elements(scope) s
 where not exists(select 1 from (select value as c from jsonb_array_elements(a.supplier_confirmations) with ordinality
   where value->>'po_id'=s->>'po_id' and value->>'po_line_id'=s->>'po_line_id'
     and value->>'order_line_id'=s->>'order_line_id' order by ordinality desc limit 1) latest
   where c->>'answer'='confirmed'
     and nullif(c->>'supplier_date','') is not null
     and c->>'terms'=public.sales_order_amendment_terms_hash(a.proposed_snapshot));
 return route||jsonb_build_object('supplier_waiting',waiting,'supplier_confirmations',a.supplier_confirmations,
   'sales_approval',jsonb_build_object('by',a.sales_approved_by,'name',(select name from app_users where id=a.sales_approved_by),'at',a.sales_approved_at,'note',a.sales_approval_note),
   'sales_approval_recorded',a.sales_approved_by is not null and a.sales_approved_terms=public.sales_order_amendment_terms_hash(a.proposed_snapshot));
end $$;
revoke all on function public.sales_order_amendment_gates(uuid) from public,anon;
grant execute on function public.sales_order_amendment_gates(uuid) to authenticated;

create or replace function public.sales_order_amendment_work(p_id uuid default null,p_after uuid default null)
returns table(id uuid,order_id uuid,status text,so bigint,gates jsonb)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if coalesce(public.app_role()::text,'') not in ('operation','principal','finance','hr','bd') then
  raise exception 'Internal roles only' using errcode='42501'; end if;
 return query select a.id,a.order_id,a.status::text,o.so::bigint,public.sales_order_amendment_gates(a.id)
 from sales_order_amendments a join orders o on o.id=a.order_id
 where (p_id is not null and a.id=p_id or p_id is null and a.status in ('submitted','issued','accepted'))
   and (p_after is null or a.id>p_after) order by a.id limit 200;
end $$;
revoke all on function public.sales_order_amendment_work(uuid,uuid) from public,anon;
grant execute on function public.sales_order_amendment_work(uuid,uuid) to authenticated;

-- Read exact reserved goods and the existing Stock sellability arithmetic.
-- A future supplier date or a free shelf Unit is not this customer's ready goods.
create or replace function public._sales_order_goods_ready(p_order_id uuid,p_proposed jsonb)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 with a as (select p_order_id as order_id,p_proposed as proposed_snapshot),
 required as (
 select l.id,l.sku,l.qty,l.attrs from a join order_lines l on l.order_id=a.order_id
 where not (a.proposed_snapshot ? 'lines')
 union all
 select nullif(x->>'id','')::uuid,x->>'sku',(x->>'qty')::int,
 case when x ? 'attrs' then x->'attrs' else old.attrs end
 from a cross join lateral jsonb_array_elements(a.proposed_snapshot->'lines') x
 left join order_lines old on old.id=nullif(x->>'id','')::uuid and old.order_id=a.order_id
 ) select exists(select 1 from required)
 and not exists(select 1 from required r where
  coalesce((select sum(i.qty) from ops_stock_items i join warehouses w on w.id=i.warehouse_id
   join stock_operating_parties holder on holder.id=i.holder_party_id and holder.active and holder.kind='warehouse_operator'
   where i.reserved_order_line_id=r.id and i.sku=r.sku and i.status='reserved'
     and i.date_in is not null and i.hold_reason is null
     and public.unit_availability('free',i.needs_repair,i.hold_reason,i.condition,i.sale_cleared_at is not null)='available'
     and exists(select 1 from order_lines old where old.id=r.id
       and coalesce(old.attrs,'null'::jsonb)=coalesce(r.attrs,'null'::jsonb))),0)<r.qty);
$$;
revoke all on function public._sales_order_goods_ready(uuid,jsonb) from public,anon,authenticated;

create or replace function public.sales_order_amendment_ready(p_amendment_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public._sales_order_goods_ready(order_id,proposed_snapshot) from sales_order_amendments where id=p_amendment_id;
$$;
revoke all on function public.sales_order_amendment_ready(uuid) from public,anon,authenticated;

-- Delivery's server checks the same physical facts, never a second ready flag.
create or replace function public.sales_order_goods_ready(p_order_id uuid)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if coalesce(public.app_role()::text,'') not in ('operation','principal') and coalesce(auth.role(),'')<>'service_role' then
   raise exception 'Operation/Principal only' using errcode='42501'; end if;
 return public._sales_order_goods_ready(p_order_id,'{}'::jsonb);
end $$;
revoke all on function public.sales_order_goods_ready(uuid) from public,anon;
grant execute on function public.sales_order_goods_ready(uuid) to authenticated,service_role;

-- Additive shared activity, with actual actor and explicitly addressed PIC.
create or replace function public._sales_order_amendment_activity(p_id uuid,p_status text)
returns void language sql security definer set search_path=public,pg_temp as $$
 insert into ops_activity_log(order_id,action,actor_id,detail)
 select a.order_id,'amendment.'||p_status,auth.uid(),jsonb_build_object(
  'amendment_id',a.id,'status',p_status,'recipient_id',c.assigned_staff,
  'submitted_by',a.submitted_by,'reason',a.reason,
  'before_revision',a.base_revision,'proposed',a.proposed_snapshot)
 from sales_order_amendments a left join ops_order_control c on c.order_id=a.order_id where a.id=p_id;
$$;
revoke all on function public._sales_order_amendment_activity(uuid,text) from public,anon,authenticated;

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
  v_gates jsonb;
begin
  if (v_role is null or v_role not in ('operation','principal')) then
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

  v_gates := public.sales_order_amendment_gates(v_a.id);
  if p_decision = 'reject' then
    if v_role <> 'principal' then raise exception 'Principal only' using errcode='42501'; end if;
    if (v_gates->>'sales_approval_required')::boolean then perform public.sales_approver_gate(v_a.submitted_by); end if;
    update sales_order_amendments
       set status='rejected', decided_by=auth.uid(), decided_at=now(),
           decision_note=v_note, decision_impact=v_impact
     where id=v_a.id;
    insert into order_history(order_id,text,by_role,by_user_id,metadata)
    values(v_a.order_id,'Amendment rejected - ' || v_note,v_role::app_role,auth.uid(),
      jsonb_build_object('kind','amendment_rejected','amendment_id',v_a.id,
                         'reason',v_note,'before',public.sales_order_snapshot(v_a.order_id),
                         'after',public.sales_order_snapshot(v_a.order_id)));
    perform public._sales_order_amendment_activity(v_a.id,'rejected');
    return jsonb_build_object('id',v_a.id,'status','rejected');
  end if;

  -- Scope guards run before commercial or revision writes. A mixed request
  -- never applies its date half separately from supplier confirmation.
  if (v_gates->>'legacy_review_required')::boolean and v_role <> 'principal' then
    raise exception 'Principal only' using errcode='42501',detail='existing_review_required';
  end if;
  if (v_impact->>'stale')::boolean then
    raise exception 'The order changed after this amendment was proposed'
      using errcode='22023',detail='amendment_stale';
  end if;
  -- Exception approval and supplier feasibility may arrive in either order.
  -- Store the review against THESE terms; effectiveness remains one transaction.
  if (v_gates->>'sales_approval_required')::boolean and not coalesce((v_gates->>'sales_approval_recorded')::boolean,false) then
    perform public.sales_approver_gate(v_a.submitted_by);
    update sales_order_amendments set sales_approved_by=auth.uid(),sales_approved_at=now(),
      sales_approved_terms=public.sales_order_amendment_terms_hash(v_a.proposed_snapshot),sales_approval_note=v_note where id=v_a.id;
    insert into order_history(order_id,text,by_role,by_user_id,metadata)
    values(v_a.order_id,'Sales Approver · Approved',v_role::app_role,auth.uid(),
      jsonb_build_object('kind','amendment_sales_approval','amendment_id',v_a.id,'reason',v_note,
        'terms',public.sales_order_amendment_terms_hash(v_a.proposed_snapshot)));
    if jsonb_array_length(v_gates->'supplier_waiting')>0 or v_a.customer_agreement_kind is null then
      return jsonb_build_object('id',v_a.id,'status',v_a.status,'gates',public.sales_order_amendment_gates(v_a.id));
    end if;
  end if;
  if jsonb_array_length(v_gates->'supplier_waiting')>0 then
    raise exception 'Record supplier answer' using errcode='22023',detail='supplier_confirmation_required';
  end if;
  if nullif(coalesce(v_a.proposed_snapshot->'header'->>'delivery_date',v_a.proposed_snapshot->>'delivery_date'),'')::date < v_o.delivery_date then
    perform 1 from ops_stock_items i join order_lines l on l.id=i.reserved_order_line_id
      where l.order_id=v_a.order_id for share of i;
  end if;
  if nullif(coalesce(v_a.proposed_snapshot->'header'->>'delivery_date',v_a.proposed_snapshot->>'delivery_date'),'')::date < v_o.delivery_date
     and not public.sales_order_amendment_ready(v_a.id) then
    raise exception 'Goods not ready' using errcode='22023',detail='earlier_date_goods_not_ready';
  end if;

  -- ── 0564 · THE CUSTOMER AGREEMENT GATE ──────────────────────────────────
  -- APPROVED / LOCKED 2026-09-22. Everything below this point CHANGES the
  -- customer's order, so the customer's acceptance has to be on the record
  -- first, and it has to be the acceptance of THESE terms.
  --
  -- Re-computed here rather than read from `customer_agreement_covers` alone:
  -- the stored fingerprint says what the basis was recorded against, and this
  -- comparison is what proves it is still true of the proposal being applied.
  if v_a.customer_agreement_kind is null then
    raise exception 'Record how the customer agreed before this change takes effect'
      using errcode = '22023', detail = 'customer_agreement_required';
  end if;
  if v_a.customer_agreement_covers
     is distinct from public.sales_order_amendment_terms_hash(v_a.proposed_snapshot) then
    raise exception 'The recorded customer agreement does not cover these terms - record it again'
      using errcode = '22023', detail = 'customer_agreement_stale';
  end if;

  if (v_impact->>'stale')::boolean then
    raise exception 'The order changed after this amendment was proposed'
      using errcode = '22023', detail = 'amendment_stale';
  end if;

  -- 0564 · THE BASE OF EVERY PROPOSED HEADER VALUE MUST STILL BE TRUE. The
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

  -- 0564 · SERVICES ARE PART OF WHAT WAS BOUGHT (CLASS A, order_addons). The
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
  values(v_a.order_id,'Amendment applied - Rev ' || (v_result->>'revision'),
    v_role::app_role,auth.uid(),
    jsonb_build_object('kind','amendment_applied','amendment_id',v_a.id,
                       'reason',coalesce(v_a.reason,v_note),'decision_note',v_note,
                       'agreement_kind',v_a.customer_agreement_kind,
                       'agreement_reference',v_a.customer_agreement_reference,
                       'revision',(v_result->'revision'),'impact',v_impact));
  perform public._sales_order_amendment_activity(v_a.id,'applied');
  return jsonb_build_object('id',v_a.id,'status','applied','revision',v_result->'revision',
                            'changed',v_result->'changed');
end $$;


-- One transaction for proposal + governed evidence + ordinary application.
create or replace function public.sales_order_submit_staff_amendment(
 p_order_id uuid,p_proposed jsonb,p_reason text,p_customer_asked_on date default null,p_agreement jsonb default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb; a sales_order_amendments; gates jsonb; o orders;
begin
 if coalesce(public.app_role()::text,'') not in ('operation','principal') then raise exception 'Operation/Principal only' using errcode='42501'; end if;
 if nullif(btrim(p_reason),'') is null then raise exception 'Reason for change' using errcode='22023',detail='note_required'; end if;
 select * into o from orders where id=p_order_id for update;
 result:=public.sales_order_submit_amendment(p_order_id,p_proposed,p_reason,p_customer_asked_on);
 select * into a from sales_order_amendments where id=(result->>'id')::uuid;
 if nullif(coalesce(p_proposed->'header'->>'delivery_date',p_proposed->>'delivery_date'),'')::date<o.delivery_date then
  perform 1 from ops_stock_items i join order_lines l on l.id=i.reserved_order_line_id where l.order_id=p_order_id for share of i;
 end if;
 if nullif(coalesce(p_proposed->'header'->>'delivery_date',p_proposed->>'delivery_date'),'')::date<o.delivery_date and not public.sales_order_amendment_ready(a.id) then
  raise exception 'Goods not ready' using errcode='22023',detail='earlier_date_goods_not_ready'; end if;
 if p_agreement is not null then
  perform public.sales_order_record_amendment_agreement(a.id,p_agreement->>'kind',p_agreement->>'reference',p_agreement->>'detail');
 end if;
 gates:=public.sales_order_amendment_gates(a.id);
 if p_agreement is not null and not (gates->>'sales_approval_required')::boolean
    and not (gates->>'legacy_review_required')::boolean and jsonb_array_length(gates->'supplier_waiting')=0 then
  result:=result||public.sales_order_decide_amendment(a.id,'approve',p_reason);
 else perform public._sales_order_amendment_activity(a.id,'submitted'); end if;
 return result||jsonb_build_object('agreement_recorded',p_agreement is not null,'gates',gates);
end $$;
revoke all on function public.sales_order_submit_staff_amendment(uuid,jsonb,text,date,jsonb) from public,anon;
grant execute on function public.sales_order_submit_staff_amendment(uuid,jsonb,text,date,jsonb) to authenticated;

-- Supplier feasibility belongs to PO Duty, names exact covered lines and terms,
-- and records the actual answer, date and evidence. It never edits the PO.
create or replace function public.sales_order_record_supplier_confirmation(
 p_amendment_id uuid,p_po_id text,p_po_line_id uuid,p_order_line_id uuid,
 p_answer text,p_supplier_date date,p_reference text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a sales_order_amendments; gates jsonb; result jsonb;
begin
 if auth.uid() is null or auth.uid() is distinct from nullif(public.workspace_resolve_duty('po_duty')->>'actor_user_id','')::uuid
    or not public.workspace_is_person(auth.uid()) then
   raise exception 'PO Duty' using errcode='42501',detail='po_duty_required'; end if;
 select * into a from sales_order_amendments where id=p_amendment_id for update;
 if not found then raise exception 'Amendment not found' using errcode='P0002'; end if;
 if a.status not in ('submitted','issued','accepted') then raise exception 'Amendment is already decided' using errcode='22023',detail='already_decided'; end if;
 if p_answer is null or p_answer not in ('confirmed','waiting','refused') or nullif(btrim(p_reference),'') is null then
   raise exception 'Record supplier answer' using errcode='22023',detail='supplier_evidence_required'; end if;
 if not exists(select 1 from public.sales_order_amendment_supplier_scope(a.id) s
    where s.po_id=p_po_id and s.po_line_id=p_po_line_id and s.order_line_id=p_order_line_id) then
   raise exception 'Record supplier answer' using errcode='22023',detail='supplier_scope_invalid'; end if;
 update sales_order_amendments set supplier_confirmations = supplier_confirmations || jsonb_build_array(jsonb_build_object(
   'po_id',p_po_id,'po_line_id',p_po_line_id,'order_line_id',p_order_line_id,'answer',p_answer,
   'supplier_date',p_supplier_date,'reference',btrim(p_reference),'by',auth.uid(),'by_name',(select name from app_users where id=auth.uid()),'at',now(),
   'terms',public.sales_order_amendment_terms_hash(a.proposed_snapshot))) where id=a.id;
 gates:=public.sales_order_amendment_gates(a.id);
 result:=jsonb_build_object('id',a.id,'status',a.status,'gates',gates);
 if a.customer_agreement_kind is not null and a.customer_agreement_covers=public.sales_order_amendment_terms_hash(a.proposed_snapshot)
    and (not (gates->>'sales_approval_required')::boolean or (gates->>'sales_approval_recorded')::boolean) and not (gates->>'legacy_review_required')::boolean
    and jsonb_array_length(gates->'supplier_waiting')=0 then
   result:=result||public.sales_order_decide_amendment(a.id,'approve',a.reason);
 end if;
 return result;
end $$;
revoke all on function public.sales_order_record_supplier_confirmation(uuid,text,uuid,uuid,text,date,text) from public,anon;
grant execute on function public.sales_order_record_supplier_confirmation(uuid,text,uuid,uuid,text,date,text) to authenticated;

-- Refund remains the existing exceptional money workflow. Only its approval
-- qualification changes; no new request, payout, ledger or cancellation writer.
do $migration$
declare body text;
begin
 body:=pg_get_functiondef('public.refund_decide(uuid,text,text)'::regprocedure);
 if position('  update order_refunds' in body)=0 then raise exception 'refund decision writer changed; review required'; end if;
 if position('sales_approver_gate' in body)>0 then return; end if;
 body:=replace(body,'  update order_refunds',
   '  if p_decision = ''approve'' then perform public.sales_approver_gate(v_row.requested_by); end if;'||chr(10)||'  update order_refunds');
 execute body;
end $migration$;

create or replace function public.sales_order_record_staff_agreement(
 p_amendment_id uuid,p_kind text,p_reference text,p_detail text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb; a sales_order_amendments; gates jsonb;
begin
 result:=public.sales_order_record_amendment_agreement(p_amendment_id,p_kind,p_reference,p_detail);
 select * into a from sales_order_amendments where id=p_amendment_id for update;
 gates:=public.sales_order_amendment_gates(a.id);
 if (not (gates->>'sales_approval_required')::boolean or (gates->>'sales_approval_recorded')::boolean) and not (gates->>'legacy_review_required')::boolean
    and jsonb_array_length(gates->'supplier_waiting')=0 then
  result:=result||public.sales_order_decide_amendment(a.id,'approve',a.reason);
 end if;
 return result;
end $$;
revoke all on function public.sales_order_record_staff_agreement(uuid,text,text,text) from public,anon;
grant execute on function public.sales_order_record_staff_agreement(uuid,text,text,text) to authenticated;

commit;

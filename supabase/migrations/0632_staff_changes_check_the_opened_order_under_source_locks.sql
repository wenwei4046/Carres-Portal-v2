begin;

-- Review corrections to the commissioned staff-amendment slice. No live assignments.
-- Baseline is the exact unedited GET payload, not a newly read revision number.
create or replace function public._sales_order_edit_baseline(p_order_id uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('status',o.status,'header',jsonb_build_object(
      'customer_name',o.customer_name,
      'customer_phone',o.customer_phone,
      'customer_email',o.customer_email,
      'customer_race',o.customer_race,
      'customer_gender',o.customer_gender,
      'customer_birthday',o.customer_birthday,
      'customer_address',o.customer_address,
      'customer_address_line1',o.customer_address_line1,
      'customer_address_line2',o.customer_address_line2,
      'customer_address_city',o.customer_address_city,
      'customer_address_state',o.customer_address_state,
      'customer_address_postcode',o.customer_address_postcode,
      'customer_address_unknown',o.customer_address_unknown,
      'customer_emergency',o.customer_emergency,
      'customer_billing',o.customer_billing,
      'customer_billing_same',o.customer_billing_same,
      'entry_fields',coalesce(o.entry_data->'fields','{}'::jsonb),
      'delivery_floor',o.delivery_floor,
      'delivery_has_lift',o.delivery_has_lift,
      'delivery_stair_items',o.delivery_stair_items,
      'proceed_date',o.proceed_date,
      'delivery_date',o.delivery_date,
      'delivery_date_tbd',o.delivery_date_tbd),
 'lines',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'sku',l.sku,'qty',l.qty,'unit_price',l.unit_price,'attrs',l.attrs) order by l.id) from order_lines l where l.order_id=o.id),'[]'::jsonb),
 'addons',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'addon_key',a.addon_key,'qty',a.qty,'unit_price',a.unit_price,'attrs',a.attrs) order by a.id) from order_addons a where a.order_id=o.id),'[]'::jsonb),
 'installment_months',o.installment_months) from orders o where o.id=p_order_id;
$$;
revoke all on function public._sales_order_edit_baseline(uuid) from public,anon,authenticated;

-- Inputs and quote validation only: the ONE formula remains shared stairCarryFee,
-- called by the API's existing recomputeStairCarry. The existing stamp RPC already
-- accepts that server-computed amount; this integrates its write before snapshot.
create or replace function public._sales_order_stair_inputs(p_order_id uuid,p_proposed jsonb)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object(
  'floor',coalesce((coalesce(p_proposed->'header','{}'::jsonb)->>'delivery_floor')::numeric,o.delivery_floor,1),
  'has_lift',coalesce((coalesce(p_proposed->'header','{}'::jsonb)->>'delivery_has_lift')::boolean,o.delivery_has_lift,false),
  'stair_items',case when coalesce(p_proposed->'header','{}'::jsonb)?'delivery_stair_items' then (p_proposed->'header'->>'delivery_stair_items')::numeric else o.delivery_stair_items end,
  'items_total',case when p_proposed?'lines' then (select coalesce(sum((x->>'qty')::numeric),0) from jsonb_array_elements(p_proposed->'lines') x)
    else (select coalesce(sum(qty),0) from order_lines where order_id=o.id) end)
 from orders o where o.id=p_order_id;
$$;
create or replace function public._sales_order_stair_quote_valid(p_order_id uuid,p_proposed jsonb)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare o orders; q jsonb:=p_proposed->'_stair_quote'; fee numeric; after_fee numeric; rate jsonb;
begin
 if q is null then return public._sales_order_stair_inputs(p_order_id,p_proposed)=public._sales_order_stair_inputs(p_order_id,'{}'); end if;
 select * into o from orders where id=p_order_id;
 select coalesce(sum(qty*unit_price),0) into fee from order_addons where order_id=p_order_id and addon_key='STAIR_CARRY';
 if q->'inputs' is distinct from public._sales_order_stair_inputs(p_order_id,p_proposed)
    or q->'expected_pinned' is distinct from jsonb_build_object('rate',o.stair_rate_per_floor_per_item,'free',o.stair_rate_free_up_to_floor)
    or (q->>'previous_fee')::numeric is distinct from fee
    or coalesce((q->>'fee')::numeric,-1)<0 then return false; end if;
 if q->'rate' is not null and q->'rate'<>'null'::jsonb then
  if o.stair_rate_per_floor_per_item is not null and o.stair_rate_free_up_to_floor is not null then
   rate:=jsonb_build_object('perFloorPerItem',o.stair_rate_per_floor_per_item,'freeUpToFloor',o.stair_rate_free_up_to_floor);
  else select jsonb_build_object('perFloorPerItem',per_floor_per_item,'freeUpToFloor',free_up_to_floor) into rate from floor_config where id=1; end if;
  if q->'rate' is distinct from rate then return false; end if;
 end if;
 if p_proposed?'addons' then
  select coalesce(sum((x->>'qty')::numeric*(x->>'unit_price')::numeric),0) into after_fee from jsonb_array_elements(p_proposed->'addons') x where x->>'addon_key'='STAIR_CARRY';
 else after_fee:=fee; end if;
 return (q->>'fee')::numeric is not distinct from after_fee;
end $$;
create or replace function public._sales_order_nonstair_services_changed(p_order_id uuid,p_proposed jsonb)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select p_proposed?'addons' and
  coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'addon_key',a.addon_key,'qty',a.qty,'unit_price',a.unit_price,'attrs',a.attrs) order by a.id) from order_addons a where a.order_id=p_order_id and a.addon_key<>'STAIR_CARRY'),'[]'::jsonb)
  is distinct from coalesce((select jsonb_agg(x order by x->>'id') from jsonb_array_elements(p_proposed->'addons') x where x->>'addon_key'<>'STAIR_CARRY'),'[]'::jsonb);
$$;
create or replace function public._sales_order_lock_stair_quote(p_order_id uuid,p_proposed jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_proposed?'_stair_quote' and exists(select 1 from orders where id=p_order_id and (stair_rate_per_floor_per_item is null or stair_rate_free_up_to_floor is null)) then
  perform 1 from floor_config where id=1 for share;
 end if;
 if not public._sales_order_stair_quote_valid(p_order_id,p_proposed) then
  raise exception 'Action changed · Review again' using errcode='22023',detail='amendment_stale';
 end if;
end $$;
create or replace function public._sales_order_stamp_staff_quote(p_order_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare q jsonb:=nullif(current_setting('carres.staff_stair_quote',true),'')::jsonb;
begin
 if q is null then return; end if;
 perform public.order_stamp_stair_carry_pinned(p_order_id,(q->>'fee')::numeric,
  (q->'rate'->>'perFloorPerItem')::numeric,(q->'rate'->>'freeUpToFloor')::int);
 perform set_config('carres.staff_stair_quote','',true);
end $$;
revoke all on function public._sales_order_stair_inputs(uuid,jsonb),public._sales_order_stair_quote_valid(uuid,jsonb),
 public._sales_order_nonstair_services_changed(uuid,jsonb),public._sales_order_lock_stair_quote(uuid,jsonb),public._sales_order_stamp_staff_quote(uuid) from public,anon,authenticated;

-- Atomic comparison, stale-request replacement, evidence and existing writers.
create or replace function public.sales_order_commit_staff_change(
 p_order_id uuid,p_expected jsonb,p_action text,p_header jsonb,p_proposed jsonb,
 p_reason text,p_customer_asked_on date,p_agreement jsonb,p_replace uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare live jsonb; result jsonb;
begin
 if coalesce(public.app_role()::text,'') not in ('operation','principal') then raise exception 'Operation/Principal only' using errcode='42501'; end if;
 perform 1 from orders where id=p_order_id for update;
 if not found then raise exception 'Order not found' using errcode='P0002'; end if;
 -- Same order → exact source-line order as Purchasing issue; no SKU inference.
 perform 1 from order_lines where order_id=p_order_id order by id for update;
 perform 1 from order_addons where order_id=p_order_id order by id for update;
 if p_expected is null or public._sales_order_edit_baseline(p_order_id) is distinct from p_expected then
  raise exception 'Action changed · Review again' using errcode='22023',detail='order_edit_stale';
 end if;
 perform public._sales_order_lock_stair_quote(p_order_id,coalesce(p_proposed,'{}'::jsonb));
 if p_action='save' then
  perform set_config('carres.staff_stair_quote',coalesce((p_proposed->'_stair_quote')::text,''),true);
  result:=public.sales_order_save_revision(p_order_id,p_header,null,jsonb_build_object('change_type','staff_correction','note',p_reason));
  perform set_config('carres.staff_stair_quote','',true);
  return result;
 end if;
 if p_action is distinct from 'submit' then raise exception 'Invalid action' using errcode='22023'; end if;
 if p_replace is not null then
  live:=public.sales_order_amendment_live(p_order_id)->'amendment';
  if (live->>'id')::uuid is distinct from p_replace or not coalesce((live->>'stale')::boolean,false) then
   raise exception 'Action changed · Review again' using errcode='22023',detail='order_edit_stale';
  end if;
  perform public.sales_order_withdraw_amendment(p_replace,'Out of date - proposed again on the current order');
 end if;
 return public.sales_order_submit_staff_amendment(p_order_id,p_proposed,p_reason,p_customer_asked_on,p_agreement);
end $$;
revoke all on function public.sales_order_commit_staff_change(uuid,jsonb,text,jsonb,jsonb,text,date,jsonb,uuid) from public,anon;
grant execute on function public.sales_order_commit_staff_change(uuid,jsonb,text,jsonb,jsonb,text,date,jsonb,uuid) to authenticated;

-- Re-read feasibility only after locking the same source lines as PO issue.
-- Keep 0630 immutable and retain its single governed application writer.
do $$
declare definition text; old_text text := 'select * into v_o from orders where id = v_a.order_id for update;';
begin
 definition:=pg_get_functiondef('public.sales_order_decide_amendment(uuid,text,text)'::regprocedure);
 if position(old_text in definition)=0 then raise exception 'Amendment writer contract changed'; end if;
 definition:=replace(definition,old_text,old_text||E'\n  perform 1 from order_lines where order_id=v_a.order_id order by id for update;');
 execute definition;
end $$;

-- All new staff decision doors take the order before the amendment row.
-- This also prevents replacement (order → request) racing a decision in reverse.
do $$
declare signature text; definition text; needle text;
begin
 foreach signature in array array['public.sales_order_decide_amendment(uuid,text,text)',
   'public.sales_order_record_supplier_confirmation(uuid,text,uuid,uuid,text,date,text)',
   'public.sales_order_record_staff_agreement(uuid,text,text,text)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  needle:=case when signature like '%decide_amendment%' then
    'select * into v_a from sales_order_amendments where id = p_amendment_id for update;'
    else 'select * into a from sales_order_amendments where id=p_amendment_id for update;' end;
  if position(needle in definition)=0 then raise exception 'Staff decision contract changed: %',signature; end if;
  definition:=replace(definition,needle,
    E'perform 1 from orders where id=(select order_id from sales_order_amendments where id=p_amendment_id) for update;\n  '||needle);
  execute definition;
 end loop;
end $$;

-- Integrate the existing amount writer at the original revision boundary.
do $$
declare definition text; needle text;
begin
 definition:=pg_get_functiondef('public.sales_order_save_revision_unchecked_0354(uuid,jsonb,jsonb,jsonb)'::regprocedure);
 needle:='v_new := public.sales_order_snapshot(p_order_id);';
 if position(needle in definition)=0 then raise exception 'Revision snapshot boundary changed'; end if;
 if position('_sales_order_stamp_staff_quote' in definition)=0 then
  definition:=replace(definition,needle,E'perform public._sales_order_stamp_staff_quote(p_order_id);\n  '||needle);
  definition:=replace(definition,'  -- CARD 1 §3',E'  if (v_old->''addons'') is distinct from (v_new->''addons'') then\n    v_changed := array_append(v_changed, ''services'');\n  end if;\n\n  -- CARD 1 §3');
  definition:=replace(definition,'when k = ''items'' then ''order_lines'' else k end','when k = ''items'' then ''order_lines'' when k = ''services'' then ''order_addons'' else k end');
  execute definition;
 end if;
 definition:=pg_get_functiondef('public.sales_order_decide_amendment(uuid,text,text)'::regprocedure);
 needle:='v_impact := public.sales_order_amendment_impact(v_a.id);';
 if position(needle in definition)=0 then raise exception 'Amendment impact boundary changed'; end if;
 definition:=replace(definition,needle,E'if p_decision<>''reject'' then perform public._sales_order_lock_stair_quote(v_a.order_id,v_a.proposed_snapshot); end if;\n  '||needle);
 definition:=replace(definition,'v_before := public.sales_order_snapshot(v_a.order_id);',E'v_before := public.sales_order_snapshot(v_a.order_id);\n  perform set_config(''carres.staff_stair_quote'',coalesce((v_a.proposed_snapshot->''_stair_quote'')::text,''''),true);');
 -- System fee rows are written by the existing stamp helper, after line/header
 -- mutation and before its snapshot. Other services keep their original writer.
 definition:=replace(definition,'for v_addon in select * from jsonb_array_elements(v_a.proposed_snapshot->''addons'') loop',
  E'for v_addon in select * from jsonb_array_elements(v_a.proposed_snapshot->''addons'') loop\n      if v_a.proposed_snapshot ? ''_stair_quote'' and v_addon->>''addon_key''=''STAIR_CARRY'' then continue; end if;');
 definition:=replace(definition,'delete from order_addons where order_id = v_a.order_id and not (id = any(v_keep));',
  'delete from order_addons where order_id = v_a.order_id and not (id = any(v_keep)) and not (v_a.proposed_snapshot ? ''_stair_quote'' and addon_key=''STAIR_CARRY'');');
 definition:=replace(definition,'if v_lines is null and v_header = ''{}''::jsonb then',
  E'if v_lines is null and v_header = ''{}''::jsonb then\n    perform public._sales_order_stamp_staff_quote(v_a.order_id);');
 execute definition;
 definition:=pg_get_functiondef('public.sales_order_amendment_route(uuid,jsonb)'::regprocedure);
 needle:='p_proposed ? ''addons'' or';
 if position(needle in definition)=0 then raise exception 'Amendment route contract changed'; end if;
 definition:=replace(definition,needle,'(p_proposed ? ''addons'' and (not (p_proposed ? ''_stair_quote'') or public._sales_order_nonstair_services_changed(p_order_id,p_proposed))) or');
 execute definition;
 definition:=replace(pg_get_functiondef('public.sales_order_amendment_impact(uuid)'::regprocedure),E'\r','');
 needle:='  select count(*) into v_po';
 if position(needle in definition)=0 then raise exception 'Amendment money impact changed'; end if;
 definition:=replace(definition,needle,E'  v_current:=v_current+(select coalesce(sum(qty*unit_price),0) from order_addons where order_id=v_a.order_id);\n  v_proposed:=v_proposed+case when v_a.proposed_snapshot ? ''addons'' then (select coalesce(sum((x->>''qty'')::numeric*(x->>''unit_price'')::numeric),0) from jsonb_array_elements(v_a.proposed_snapshot->''addons'') x) else (select coalesce(sum(qty*unit_price),0) from order_addons where order_id=v_a.order_id) end;\n'||needle);
 definition:=replace(definition,'''stale'', v_stale,','''stale'', v_stale or not public._sales_order_stair_quote_valid(v_a.order_id,v_a.proposed_snapshot),');
 execute definition;
 definition:=pg_get_functiondef('public.sales_order_amendment_live(uuid)'::regprocedure);
 needle:='''stale'', v_now is distinct from v_a.base_contractual_hash,';
 if position(needle in definition)=0 then raise exception 'Amendment stale read changed'; end if;
 definition:=replace(definition,needle,'''stale'', v_now is distinct from v_a.base_contractual_hash or not public._sales_order_stair_quote_valid(p_order_id,v_a.proposed_snapshot),');
 execute definition;
end $$;

-- Workspace MASTER: Delivery Duty is the explicit customer-order fallback.
-- Unassigned stays visible in the shared activity facts; never invent a person.
create or replace function public._sales_order_amendment_activity(p_id uuid,p_status text)
returns void language sql security definer set search_path=public,pg_temp as $$
 insert into ops_activity_log(order_id,action,actor_id,detail)
 select a.order_id,'amendment.'||p_status,auth.uid(),jsonb_build_object(
  'amendment_id',a.id,'status',p_status,
  'recipient_id',coalesce(c.assigned_staff,(d.resolved->>'actor_user_id')::uuid),
  'recipient_duty',case when c.assigned_staff is null then 'delivery_duty' end,
  'recipient_outcome',case when c.assigned_staff is not null then 'assigned' else d.resolved->>'source' end,
  'submitted_by',a.submitted_by,'reason',a.reason,
  'before_revision',a.base_revision,'proposed',a.proposed_snapshot)
 from sales_order_amendments a left join ops_order_control c on c.order_id=a.order_id
 cross join lateral (select public.workspace_resolve_duty('delivery_duty') resolved) d where a.id=p_id;
$$;
revoke all on function public._sales_order_amendment_activity(uuid,text) from public,anon,authenticated;

-- New automatic submission is internal to the guarded whole-page commit.
revoke execute on function public.sales_order_submit_staff_amendment(uuid,jsonb,text,date,jsonb) from authenticated;
commit;

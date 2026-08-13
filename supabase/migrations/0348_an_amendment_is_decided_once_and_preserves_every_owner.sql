-- 0348 · AN AMENDMENT IS DECIDED ONCE AND PRESERVES EVERY OWNER
--
-- Completes the approved Sales Order Amendment / Approval / Revision / History
-- slice on top of 0327/0334/0340. A proposal is not a revision. Management's
-- approval applies it atomically through the ONE revision writer; rejection
-- records a decision but changes no order fact. Downstream owners are read for
-- impact and are never rewritten here.

begin;

alter table public.sales_order_amendments
  add column if not exists decided_by uuid references auth.users(id),
  add column if not exists decided_at timestamptz,
  add column if not exists decision_note text,
  add column if not exists decision_impact jsonb;

alter table public.sales_order_amendments
  drop constraint if exists sales_order_amendments_status_check;
alter table public.sales_order_amendments
  add constraint sales_order_amendments_status_check
  check (status in ('draft','submitted','issued','accepted','applied','rejected','withdrawn'));

alter table public.sales_order_amendments
  add constraint sales_order_amendments_decision_complete check (
    (status in ('applied','rejected') and decided_by is not null and decided_at is not null
      and nullif(btrim(coalesce(decision_note,'')), '') is not null)
    or status not in ('applied','rejected')
  );

-- A new order receives Rev 1 at the END of its birth transaction, after its
-- lines/add-ons exist. Existing orders are deliberately not backfilled: their
-- original state cannot be guessed from today's rows.
create or replace function public.sales_order_mint_original_at_birth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from sales_order_revisions where order_id = new.id) then
    insert into sales_order_revisions(order_id, revision, snapshot, created_by)
    values (new.id, 1, public.sales_order_snapshot(new.id), auth.uid());
  end if;
  return null;
end $$;

drop trigger if exists sales_order_original_at_birth on public.orders;
create constraint trigger sales_order_original_at_birth
  after insert on public.orders
  deferrable initially deferred
  for each row execute function public.sales_order_mint_original_at_birth();

-- 0327's snapshot predates instalment amendments. Complete versions must
-- carry the commercial plan as well as the line total.
create or replace function public.sales_order_snapshot(p_order_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'header', (
      select jsonb_build_object(
        'so',o.so,'status',o.status,'channel',o.channel,'dealer_id',o.dealer_id,
        'outlet_id',o.outlet_id,'salesperson_id',o.salesperson_id,
        'customer_name',o.customer_name,'customer_phone',o.customer_phone,
        'customer_email',o.customer_email,'customer_address',o.customer_address,
        'customer_address_line1',o.customer_address_line1,'customer_address_line2',o.customer_address_line2,
        'customer_address_city',o.customer_address_city,'customer_address_state',o.customer_address_state,
        'customer_address_postcode',o.customer_address_postcode,'customer_emergency',o.customer_emergency,
        'customer_billing',o.customer_billing,'delivery_date',o.delivery_date,
        'delivery_date_tbd',o.delivery_date_tbd,'proceed_date',o.proceed_date,
        'delivery_floor',o.delivery_floor,'delivery_has_lift',o.delivery_has_lift,
        'installment_months',o.installment_months,'placed_at',o.placed_at,
        'salesperson_name',sp.name,'outlet_name',ol.name,'dealer_name',d.name)
      from orders o left join salespersons sp on sp.id=o.salesperson_id
      left join outlets ol on ol.id=o.outlet_id left join dealers d on d.id=o.dealer_id
      where o.id=p_order_id),
    'lines',coalesce((select jsonb_agg(jsonb_build_object(
      'id',l.id,'sku',l.sku,'qty',l.qty,'unit_price',l.unit_price,'attrs',l.attrs,
      'source_po',l.source_po,'description',case
        when pm.name is not null and nullif(trim(ps.variant),'') is not null then pm.name||' ('||ps.variant||')'
        when pm.name is not null then pm.name else null end) order by l.created_at,l.id)
      from order_lines l left join product_skus ps on ps.sku=l.sku
      left join product_models pm on pm.id=ps.model_id where l.order_id=p_order_id),'[]'::jsonb),
    'addons',coalesce((select jsonb_agg(jsonb_build_object(
      'addon_key',a.addon_key,'qty',a.qty,'unit_price',a.unit_price,'attrs',a.attrs) order by a.id)
      from order_addons a where a.order_id=p_order_id),'[]'::jsonb)
  )
$$;

create or replace function public.sales_order_amendment_impact(p_amendment_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_role text := public.app_role();
  v_a sales_order_amendments%rowtype;
  v_o orders%rowtype;
  v_current numeric := 0;
  v_proposed numeric := 0;
  v_po int := 0;
  v_receiving int := 0;
  v_units int := 0;
  v_delivery int := 0;
  v_loans int := 0;
  v_tasks int := 0;
  v_refunds int := 0;
  v_stale boolean;
begin
  if v_role not in ('operation','principal','finance','hr','bd') then
    raise exception 'Internal roles only' using errcode = '42501';
  end if;
  select * into v_a from sales_order_amendments where id = p_amendment_id;
  if not found then raise exception 'Amendment not found' using errcode = 'P0002'; end if;
  select * into v_o from orders where id = v_a.order_id;

  select coalesce(sum(qty * unit_price),0) into v_current
    from order_lines where order_id = v_a.order_id;
  if v_a.proposed_snapshot ? 'lines' then
    select coalesce(sum((x->>'qty')::numeric * (x->>'unit_price')::numeric),0)
      into v_proposed from jsonb_array_elements(v_a.proposed_snapshot->'lines') x;
  else
    v_proposed := v_current;
  end if;
  select count(*) into v_po from purchase_orders where dl = v_o.dl;
  select count(*) into v_receiving from po_receipts r
    join purchase_orders p on p.id = r.po_id where p.dl = v_o.dl;
  select count(*) into v_units from ops_stock_items
    where reserved_ref = 'SO-' || v_o.so::text or sold_order_id = v_a.order_id;
  select count(*) into v_delivery from delivery_attempts where order_id = v_a.order_id;
  select count(*) into v_loans from ops_sofa_loans where order_id = v_a.order_id;
  select count(*) into v_tasks from ops_tasks
    where related_order_id = v_a.order_id and status in ('open','claimed');
  select count(*) into v_refunds from order_refunds
    where order_id = v_a.order_id and status in ('requested','approved');
  v_stale := public.sales_order_contractual_hash(v_a.order_id)
             is distinct from v_a.base_contractual_hash;

  return jsonb_build_object(
    'amendment_id', v_a.id,
    'order_id', v_a.order_id,
    'so', v_o.so,
    'base_revision', v_a.base_revision,
    'stale', v_stale,
    'commercial_delta', v_proposed - v_current,
    'findings', jsonb_build_array(
      jsonb_build_object('owner','Purchasing','kind','purchase_order','count',v_po,'blocks',false,'href','/operation?tab=purchase'),
      jsonb_build_object('owner','Receiving','kind','receipt','count',v_receiving,'blocks',false,'href','/operation?tab=receiving'),
      jsonb_build_object('owner','Stock','kind','unit','count',v_units,'blocks',false,'href','/operation?tab=stock-onhand'),
      jsonb_build_object('owner','Delivery','kind','attempt','count',v_delivery,'blocks',false,'href','/operation?tab=delivery'),
      jsonb_build_object('owner','Money','kind','commercial_delta','amount',v_proposed-v_current,'count',v_refunds,'blocks',false,'href','/operation?tab=payments'),
      jsonb_build_object('owner','Loan','kind','loan','count',v_loans,'blocks',false,'href','/operation?tab=loans'),
      jsonb_build_object('owner','Other Commitments','kind','work','count',v_tasks,'blocks',false,'href','/operation?tab=work')
    )
  );
end $$;

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
    v_result := public.sales_order_save_revision(
      v_a.order_id,v_header,v_lines,
      jsonb_build_object('change_type','customer_change','note',coalesce(v_a.reason,v_note)));
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

revoke all on function public.sales_order_amendment_impact(uuid) from public, anon;
revoke all on function public.sales_order_decide_amendment(uuid,text,text) from public, anon;
grant execute on function public.sales_order_amendment_impact(uuid) to authenticated;
grant execute on function public.sales_order_decide_amendment(uuid,text,text) to authenticated;

comment on table public.sales_order_amendments is
  'Governed Sales Order amendments. Proposal/rejection are not revisions. Principal approval applies atomically through sales_order_save_revision; impact is read-only across owning modules.';

commit;

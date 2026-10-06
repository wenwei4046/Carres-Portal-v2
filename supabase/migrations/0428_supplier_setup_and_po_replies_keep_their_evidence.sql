-- REVIEW DRAFT: Purchasing MASTER §§5.5, 5.7, 9.3 (approved 2026-09-04).
-- No row repair, category creation, RLS change, or historical evidence invention.
-- Additive schema; existing replies stay history and do not confirm a version.

create or replace function public.catalog_create_supplier_setup(
  p_name text, p_slug text, p_kind text, p_categories text[],
  p_production_days jsonb, p_off_days integer[]
) returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare v_supplier public.suppliers; v_row jsonb; v_categories text[];
begin
  if auth.uid() is null or public.app_role() is distinct from 'principal'::public.app_role then
    raise exception 'Only the Master Admin can add a supplier.' using errcode='42501';
  end if;
  if length(btrim(p_name)) not between 2 and 80 or p_name is null
    or p_slug is null or p_slug = ''
    or p_slug <> trim(both '-' from regexp_replace(lower(btrim(p_name)), '[^a-z0-9]+', '-', 'g'))
    or p_kind is null or p_kind not in ('own_logistics','factory_pickup') then
    raise exception 'Check the Supplier Name and Delivery Method.' using errcode='22023';
  end if;
  if coalesce(cardinality(p_categories),0) not between 1 and 3
    or not p_categories <@ array['mattress','bedframe','sofa']
    or array_position(p_categories,null) is not null
    or (select count(distinct c) from unnest(p_categories) c) <> cardinality(p_categories)
    or jsonb_typeof(p_production_days) is distinct from 'array' then
    raise exception 'Choose Mattress, Bedframe or Sofa.' using errcode='22023';
  end if;
  select array_agg(r->>'category' order by r->>'category') into v_categories
    from jsonb_array_elements(p_production_days) r;
  if v_categories is distinct from (select array_agg(c order by c) from unnest(p_categories) c) then
    raise exception 'Add Production Days for every selected category.' using errcode='22023';
  end if;
  if coalesce(cardinality(p_off_days),0) not between 1 and 6
    or not p_off_days <@ array[0,1,2,3,4,5,6]
    or array_position(p_off_days,null) is not null
    or (select count(distinct d) from unnest(p_off_days) d) <> cardinality(p_off_days) then
    raise exception 'Choose the Supplier work week.' using errcode='22023';
  end if;
  insert into public.suppliers(name,slug,kind,cat_covered)
    values(btrim(p_name),p_slug,p_kind::public.supplier_kind,p_categories) returning * into v_supplier;
  insert into public.purchasing_supplier_settings(supplier_id,off_days,updated_by)
    values(v_supplier.id,p_off_days,auth.uid());
  for v_row in select value from jsonb_array_elements(p_production_days) loop
    if jsonb_typeof(v_row->'workingDays') is distinct from 'number'
      or (v_row->>'workingDays')::numeric <> trunc((v_row->>'workingDays')::numeric)
      or (v_row->>'workingDays')::numeric not between 1 and 180 then
      raise exception 'Enter Production Days from 1 to 180.' using errcode='22023';
    end if;
    insert into public.purchasing_production_days(supplier_id,category,working_days,updated_by)
      values(v_supplier.id,v_row->>'category',(v_row->>'workingDays')::int,auth.uid());
    perform public.purchasing_record_change('principal','production_days',v_supplier.id,v_row->>'category',
      null,v_row->>'workingDays','Supplier Production Days saved');
  end loop;
  perform public.purchasing_record_change('principal','supplier_work_week',v_supplier.id,null,
    null,p_off_days::text,'Supplier work week saved');
  return to_jsonb(v_supplier);
end;
$fn$;
revoke all on function public.catalog_create_supplier_setup(text,text,text,text[],jsonb,integer[]) from public,anon;
grant execute on function public.catalog_create_supplier_setup(text,text,text,text[],jsonb,integer[]) to authenticated;

alter table public.purchase_orders add column official_delivery_date date;
comment on column public.purchase_orders.official_delivery_date is
  'Original supplier-facing PO Delivery Date, captured at birth, immutable. NULL on earlier records: no historical date is guessed or backfilled.';
create or replace function public.purchasing_keep_official_delivery_date()
returns trigger language plpgsql set search_path=public,pg_temp as $fn$
begin
  if tg_op='INSERT' then
    new.official_delivery_date := new.eta_date;
  elsif new.official_delivery_date is distinct from old.official_delivery_date then
    raise exception 'The original PO Delivery Date cannot change.' using errcode='22023';
  end if;
  return new;
end;
$fn$;
create trigger purchasing_keep_official_delivery_date before insert or update on public.purchase_orders
  for each row execute function public.purchasing_keep_official_delivery_date();

alter table public.po_supplier_promises
  add column po_version integer,
  add column channel text,
  add column recipient text,
  add column evidence text,
  add column reported_by text,
  add column reported_at timestamptz,
  add column duty_user_id uuid references public.app_users(id),
  add column acting_user_id uuid references public.app_users(id);

-- Replies use the current cross-module Duty resolver, never a local rota.
create or replace function public.purchasing_supplier_reply_actor()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $fn$
declare v_uid uuid:=auth.uid();
  v_duty jsonb:=public.workspace_resolve_duty('po_duty',null);
begin
  return v_duty || jsonb_build_object('actual_user_id',v_uid,'allowed',
    v_uid is not null and coalesce(public.is_operations_superuser(v_uid)
      or nullif(v_duty->>'actor_user_id','')::uuid=v_uid,false));
end;
$fn$;
revoke all on function public.purchasing_supplier_reply_actor() from public,anon;
grant execute on function public.purchasing_supplier_reply_actor() to authenticated;

-- This trigger also seals the old unsupported-answer RPC and direct writes.
create or replace function public.purchasing_require_reply_evidence()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $fn$
declare v_po public.purchase_orders; v_who jsonb;
begin
  if new.kind <> 'tomorrow_delivery' then return new; end if;
  v_who := public.purchasing_supplier_reply_actor();
  if (v_who->>'allowed')::boolean is not true then
    raise exception 'Ask PO Duty to record the supplier answer.' using errcode='42501';
  end if;
  select * into v_po from public.purchase_orders where id=new.po_id for update;
  if new.po_version is distinct from coalesce(v_po.version,1) then
    raise exception 'Open the current PO and record the supplier answer.' using errcode='22023',detail='stale_po_version';
  end if;
  if v_po.status <> 'open' or not exists(select 1 from public.purchase_order_lines
    where po_id=v_po.id and qty>received_qty) then
    raise exception 'This PO has no goods left to deliver.' using errcode='22023',detail='po_not_open';
  end if;
  if not exists(select 1 from public.po_sends where po_id=v_po.id
    and kind='confirmed_sent' and po_version=new.po_version) then
    raise exception 'Record the current PO PDF sent before the supplier answer.' using errcode='22023',detail='po_not_sent';
  end if;
  if new.answer is null or new.answer not in ('shipping','delayed')
    or (new.answer='shipping' and ((v_po.official_delivery_date is not null and new.about_date is distinct from v_po.official_delivery_date) or new.about_date is null or new.new_date is not null))
    or (new.answer='delayed' and (new.new_date is null or coalesce(new.reason,'') not in ('Production Delay','Material Shortage','Transport Delay','Waiting Customer Confirmation','Factory Closed','Other'))) then
    raise exception 'Record the supplier delivery date and reason.' using errcode='22023',detail='invalid_input';
  end if;
  if new.channel is null or new.channel not in ('whatsapp','email','phone','in_person')
    or nullif(btrim(new.recipient),'') is null or nullif(btrim(new.evidence),'') is null
    or nullif(btrim(new.reported_by),'') is null or new.reported_at is null
    or left(new.evidence,length(new.po_id)+1) is distinct from new.po_id || '/'
    or not exists(select 1 from storage.objects where bucket_id='delivery-orders' and name=new.evidence)
    or length(new.recipient)>200 or length(new.reported_by)>200 or length(new.evidence)>2000
    or length(new.remarks)>500
    or new.reported_at < (select min(sent_at) from public.po_sends where po_id=v_po.id and kind='confirmed_sent' and po_version=new.po_version)
    or new.reported_at > now() or new.recorded_by is distinct from auth.uid()
    or auth.uid() is null then
    raise exception 'Record the reply channel, recipient, evidence, reporter and time.' using errcode='22023',detail='reply_evidence_required';
  end if;
  new.duty_user_id := nullif(v_who->>'normal_user_id','')::uuid;
  new.acting_user_id := nullif(v_who->>'acting_user_id','')::uuid;
  new.recorded_at:=clock_timestamp();
  return new;
end;
$fn$;
create trigger purchasing_require_reply_evidence before insert on public.po_supplier_promises
  for each row execute function public.purchasing_require_reply_evidence();

create or replace function public.purchasing_record_supplier_reply(p_po_id text,p_reply jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $fn$
declare v_po public.purchase_orders; v_role public.app_role; v_date date; v_id uuid;
  v_previous date; v_answer text; v_who jsonb;
begin
  v_role:=public.purchasing_supplier_call_gate();
  v_who := public.purchasing_supplier_reply_actor();
  if (v_who->>'allowed')::boolean is not true then
    raise exception 'Ask PO Duty to record the supplier answer.' using errcode='42501';
  end if;
  select * into v_po from public.purchase_orders where id=p_po_id for update;
  if not found then raise exception 'Purchase Order not found.' using errcode='22023',detail='po_not_found'; end if;
  v_answer:=p_reply->>'answer';
  if v_answer='shipping' then
    if p_reply->>'newDate' is not null then
      raise exception 'Record one supplier date.' using errcode='22023',detail='invalid_input';
    end if;
    v_date:=coalesce(v_po.official_delivery_date,(p_reply->>'firstDate')::date);
    if v_date is null or (p_reply->>'firstDate' is not null and (p_reply->>'firstDate')::date<>v_date) then
      raise exception 'Record the supplier delivery date.' using errcode='22023',detail='new_date_required';
    end if;
  elsif v_answer='delayed' then
    v_date:=(p_reply->>'newDate')::date;
    if v_date is null or coalesce(p_reply->>'reason','') not in ('Production Delay','Material Shortage','Transport Delay','Waiting Customer Confirmation','Factory Closed','Other') then
      raise exception 'Record the new date and reason.' using errcode='22023',detail='new_date_required';
    end if;
  else raise exception 'Record the supplier answer.' using errcode='22023',detail='invalid_input';
  end if;
  select case when answer='shipping' then about_date else new_date end into v_previous
    from public.po_supplier_promises where po_id=p_po_id and kind='tomorrow_delivery'
      and po_version=coalesce(v_po.version,1) order by recorded_at desc,id desc limit 1;
  insert into public.po_supplier_promises(po_id,kind,answer,about_date,previous_date,new_date,
    reason,remarks,recorded_by,po_version,channel,recipient,evidence,reported_by,reported_at)
    values(p_po_id,'tomorrow_delivery',v_answer,coalesce(v_po.official_delivery_date,v_date),v_previous,
      case when v_answer='delayed' then v_date end,p_reply->>'reason',p_reply->>'remarks',auth.uid(),
      (p_reply->>'poVersion')::integer,p_reply->>'channel',btrim(p_reply->>'recipient'),
      btrim(p_reply->>'evidence'),btrim(p_reply->>'reportedBy'),(p_reply->>'reportedAt')::timestamptz)
    returning id into v_id;
  -- Exact persisted PO line sources own Sales planning; no SO-reference/SKU inference.
  -- This updates goods arrival planning, never the customer promise.
  insert into public.ops_order_control(order_id,line_etas,updated_at)
    select s.order_id,jsonb_object_agg(s.sku,to_jsonb(v_date::text)),now()
      from public.po_line_sources s
      join public.purchase_order_lines l on l.id=s.po_line_id and l.po_id=s.po_id and l.sku=s.sku
      join public.order_lines ol on ol.id=s.order_line_id and ol.order_id=s.order_id and ol.sku=s.sku
      where s.po_id=p_po_id and l.qty>l.received_qty
      group by s.order_id
    on conflict(order_id) do update set
      line_etas=coalesce(ops_order_control.line_etas,'{}'::jsonb)||excluded.line_etas,
      updated_at=excluded.updated_at;
  insert into public.po_history(po_id,text,by_role,by_user_id)
    values(p_po_id,format('Supplier answer recorded · PO V%s · %s',v_po.version,v_date),v_role,auth.uid());
  insert into public.audit_log(role,actor_text,action,ref)
    values(v_role,(select name from public.app_users where id=auth.uid()),'Supplier answer recorded',p_po_id);
  return jsonb_build_object('po_id',p_po_id,'reply_id',v_id,'supplier_delivery_date',v_date);
end;
$fn$;
revoke all on function public.purchasing_record_supplier_reply(text,jsonb) from public,anon;
grant execute on function public.purchasing_record_supplier_reply(text,jsonb) to authenticated;

-- Preserve the authoritative PDF fields and destination rules; print the original PO date.
create or replace function public.purchasing_po_document(p_po_id text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_role     app_role;
  v_po       purchase_orders;
  v_dest     purchasing_destinations;
  v_sup      suppliers;
  v_address  text;
  v_sup_addr text;
  v_lines    jsonb;
  v_issuer   text;
  v_missing_destination_name text;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation', 'principal') then
    raise exception 'forbidden: only operation or principal can export a PO document'
      using errcode = '42501', detail = 'forbidden';
  end if;

  select * into v_po from purchase_orders where id = p_po_id;
  if not found then
    raise exception 'PO % not found', p_po_id
      using errcode = '42P01', detail = 'po_not_found';
  end if;

  if v_po.status = 'cancelled' then
    raise exception 'PO % is cancelled and cannot be exported', p_po_id
      using errcode = 'P0001', detail = 'po_not_printable';
  end if;

  select * into v_dest from purchasing_destinations where id = v_po.destination_id;
  select * into v_sup from suppliers where id = v_po.supplier_id;

  if v_dest.warehouse_id is not null then
    select address into v_address from warehouses where id = v_dest.warehouse_id;
  else
    v_address := v_dest.address;
  end if;

  if v_address is null or length(btrim(v_address)) = 0 then
    raise exception 'no address on file for %', v_dest.name
      using errcode = 'P0001', detail = 'destination_address_missing';
  end if;

  -- One PO may carry several destinations. Every line must still resolve to a
  -- real printable address before the formal document can leave Carres.
  select coalesce(d.name, 'the recorded Deliver To')
    into v_missing_destination_name
    from purchase_order_lines l
    left join purchasing_destinations d
      on d.id = coalesce(l.destination_id, v_po.destination_id)
    left join warehouses w on w.id = d.warehouse_id
   where l.po_id = p_po_id
     and nullif(btrim(case when d.warehouse_id is not null then w.address else d.address end), '') is null
   limit 1;

  if found then
    raise exception 'no address on file for %', v_missing_destination_name
      using errcode = 'P0001', detail = 'destination_address_missing';
  end if;

  v_sup_addr := nullif(btrim(coalesce(v_sup.address, '')), '');

  -- audit_log's one timestamp is `occurred_at` (0001). This was incorrectly
  -- spelled `created_at` in 0383, making every document call fail before any
  -- payload could be returned.
  select actor_text into v_issuer
    from audit_log
   where ref = p_po_id and action like 'Created PO %'
   order by occurred_at asc
   limit 1;

  select coalesce(jsonb_agg(x order by x->>'sku'), '[]'::jsonb) into v_lines
    from (
      select jsonb_build_object(
               'sku',         l.sku,
               'description', coalesce(ps.variant, l.sku),
               'qty',         l.qty,
               'unit',        'pc',
               'destination', (
                 select jsonb_build_object(
                          'name', d.name,
                          'address', case when d.warehouse_id is not null then w.address else d.address end
                        )
                   from purchasing_destinations d
                   left join warehouses w on w.id = d.warehouse_id
                  where d.id = coalesce(l.destination_id, v_po.destination_id)
               ),
               'attrs',       (
                 select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
                   from jsonb_each(coalesce(l.attrs, '{}'::jsonb)) as e(k, v)
                  where k in ('color', 'gap', 'fabric_name')
               ),
               'unit_codes', (
                 select coalesce(jsonb_agg(si.unit_code order by si.unit_code), '[]'::jsonb)
                   from ops_stock_items si
                  where si.po_no = l.po_id and si.sku = l.sku
               ),
               'sources', (
                 select coalesce(
                          jsonb_agg(jsonb_build_object('so', s.so, 'qty', s.qty)
                                    order by s.so nulls last),
                          '[]'::jsonb)
                   from po_line_sources s
                  where s.po_line_id = l.id
               )
             ) as x
        from purchase_order_lines l
        left join product_skus ps on ps.sku = l.sku
       where l.po_id = p_po_id
    ) s;

  return jsonb_build_object(
    'po_number',   v_po.id,
    'po_id',       v_po.id,
    'version',     coalesce(v_po.version, 1),
    'issue_date',  to_char(coalesce(v_po.placed_at, now()), 'YYYY-MM-DD'),
    'supplier', jsonb_build_object(
      'name',    coalesce(v_sup.name, 'Supplier'),
      'address', v_sup_addr,
      'contact', v_sup.contact
    ),
    'destination', jsonb_build_object(
      'name',    v_dest.name,
      'address', v_address
    ),
    'delivery_instructions', nullif(btrim(coalesce(v_po.delivery_instructions, '')), ''),
    'eta_date',    v_po.official_delivery_date,
    'so_refs',     to_jsonb(coalesce(v_po.so_refs, array[]::int[])),
    'issued_by',   v_issuer,
    'lines',       v_lines,
    'terms',       null
  );
end;
$function$;

comment on function public.purchasing_po_document(text) is
  '0402: money-free formal PO document authority; reads audit_log.occurred_at and returns every goods line effective governed Deliver To.';

revoke execute on function public.purchasing_po_document(text) from public, anon;
grant execute on function public.purchasing_po_document(text) to authenticated;

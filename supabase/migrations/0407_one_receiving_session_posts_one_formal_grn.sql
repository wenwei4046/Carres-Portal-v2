-- ============================================================================
-- 0407 — one Receiving Session posts one formal GRN
--
-- This migration defines the governed database authority. It does NOT authorise
-- a production apply. Production apply remains a separate Owner-governed gate.
-- ============================================================================

begin;

-- 1 · Session identity, immutable source snapshots and formal document facts.
alter table public.warehouse_receipts
  add column if not exists source_kind text not null default 'purchase_order',
  add column if not exists source_id text,
  add column if not exists source_version integer,
  add column if not exists source_snapshot jsonb,
  add column if not exists destination_snapshot jsonb,
  add column if not exists supplier_snapshot jsonb,
  add column if not exists goods_received_timestamp timestamptz,
  add column if not exists grn_number text,
  add column if not exists grn_posting_date date,
  add column if not exists grn_snapshot jsonb,
  add column if not exists normal_grn_duty_user_id uuid references public.app_users(id),
  add column if not exists grn_cover_user_id uuid references public.app_users(id),
  add column if not exists post_authority text,
  add column if not exists lock_version integer not null default 1,
  add column if not exists amended_at timestamptz,
  add column if not exists voided_at timestamptz;

update public.warehouse_receipts wr
   set source_id = wr.po_id,
       source_version = coalesce(po.version, 1),
       goods_received_timestamp = coalesce(
         wr.goods_received_timestamp,
         wr.goods_received_at::timestamp at time zone 'Asia/Kuala_Lumpur'
       ),
       source_snapshot = coalesce(wr.source_snapshot, jsonb_build_object(
         'sourceKind', 'purchase_order',
         'sourceId', po.id,
         'sourceVersion', coalesce(po.version, 1),
         'poIssuedAt', po.placed_at,
         'poDeliveryDate', po.po_delivery_date,
         'lines', coalesce((
           select jsonb_agg(jsonb_build_object(
             'poLineId', l.id,
             'sku', l.sku,
             'orderQty', l.qty,
             'receivedQtyAtOpen', l.received_qty
           ) order by l.sku, l.id)
             from public.purchase_order_lines l
            where l.po_id = po.id
         ), '[]'::jsonb)
       )),
       destination_snapshot = coalesce(wr.destination_snapshot, jsonb_build_object(
         'id', d.id,
         'name', d.name,
         'warehouseId', d.warehouse_id,
         'address', case when d.warehouse_id is not null then w.address else d.address end
       )),
       supplier_snapshot = coalesce(wr.supplier_snapshot, jsonb_build_object(
         'id', s.id,
         'name', s.name,
         'address', s.address,
         'contact', s.contact
       ))
  from public.purchase_orders po
  join public.purchasing_destinations d on d.id = po.destination_id
  left join public.warehouses w on w.id = d.warehouse_id
  join public.suppliers s on s.id = po.supplier_id
 where wr.po_id = po.id;

alter table public.warehouse_receipts
  alter column source_id set not null,
  alter column source_version set not null,
  alter column source_snapshot set not null,
  alter column destination_snapshot set not null,
  alter column supplier_snapshot set not null,
  add constraint warehouse_receipts_source_kind_check
    check (source_kind in ('purchase_order', 'consignment_order')),
  add constraint warehouse_receipts_lock_version_check check (lock_version > 0),
  add constraint warehouse_receipts_post_authority_check
    check (post_authority is null or post_authority in
      ('grn_duty', 'grn_duty_cover', 'operations_superuser')),
  add constraint warehouse_receipts_grn_number_shape
    check (grn_number is null or grn_number ~ '^GRN-[0-9]{8}-[0-9]{4}$');

-- Historical posted/voided sessions receive a STORED legacy formal identity.
-- The date is their recorded Malaysia posting date; no physical receiving date
-- is moved and no number is derived later by a browser.
with ranked as (
  select wr.id,
         coalesce(
           (wr.posted_at at time zone 'Asia/Kuala_Lumpur')::date,
           (wr.reviewed_at at time zone 'Asia/Kuala_Lumpur')::date,
           (wr.submitted_at at time zone 'Asia/Kuala_Lumpur')::date
         ) as posting_date,
         row_number() over (
           partition by coalesce(
             (wr.posted_at at time zone 'Asia/Kuala_Lumpur')::date,
             (wr.reviewed_at at time zone 'Asia/Kuala_Lumpur')::date,
             (wr.submitted_at at time zone 'Asia/Kuala_Lumpur')::date
           )
           order by coalesce(wr.posted_at, wr.reviewed_at, wr.submitted_at), wr.id
         ) as sequence
    from public.warehouse_receipts wr
   where wr.status in ('posted', 'voided') and wr.grn_number is null
)
update public.warehouse_receipts wr
   set grn_posting_date = ranked.posting_date,
       posted_at = coalesce(wr.posted_at, wr.reviewed_at, wr.submitted_at),
       grn_number = format(
         'GRN-%s-%s', to_char(ranked.posting_date, 'YYYYMMDD'),
         lpad(ranked.sequence::text, 4, '0')
       )
  from ranked
 where wr.id = ranked.id;

-- Historical formal documents are frozen from the evidence that survives on
-- the stored session. The migration never reconstructs a supplier promise or
-- actor that the legacy row did not record.
update public.warehouse_receipts wr
   set grn_snapshot = jsonb_build_object(
     'grnNumber', wr.grn_number,
     'grnPostingDate', wr.grn_posting_date,
     'receivingSessionId', wr.id,
     'sourceSnapshot', wr.source_snapshot,
     'supplierSnapshot', wr.supplier_snapshot,
     'destinationSnapshot', wr.destination_snapshot,
     'supplierDeliveryDate', null,
     'goodsReceivedAt', wr.goods_received_timestamp,
     'supplierDoNo', wr.do_number,
     'signedDoPath', wr.do_file_path,
     'lines', wr.lines,
     'unitOutcomes', '[]'::jsonb,
     'submission', jsonb_build_object(
       'from', wr.submitted_from, 'submittedBy', wr.submitted_by,
       'submittedAt', wr.submitted_at
     ),
     'actualActor', jsonb_build_object(
       'userId', wr.posted_by,
       'name', (select u.name from public.app_users u where u.id = wr.posted_by)
     ),
     'normalGrnDuty', null,
     'datedCover', null,
     'postAuthority', 'legacy',
     'postedAt', wr.posted_at
   )
 where wr.status in ('posted', 'amended', 'voided') and wr.grn_snapshot is null;

alter table public.warehouse_receipts
  drop constraint if exists warehouse_receipts_status_check,
  drop constraint if exists warehouse_receipts_lines_is_array,
  drop constraint if exists wr_posted_stamp;

alter table public.warehouse_receipts
  add constraint warehouse_receipts_status_check
    check (status in ('draft', 'submitted', 'returned', 'posted', 'amended', 'voided')),
  add constraint warehouse_receipts_lines_is_array
    check (jsonb_typeof(lines) = 'array'
      and (status = 'draft' or jsonb_array_length(lines) > 0)),
  add constraint warehouse_receipts_formal_grn_state
    check (
      (status in ('posted', 'amended', 'voided')
        and grn_number is not null
        and grn_posting_date is not null
        and grn_snapshot is not null
        and posted_at is not null)
      or
      (status in ('draft', 'submitted', 'returned')
        and grn_number is null
        and grn_posting_date is null
        and grn_snapshot is null)
    );

drop index if exists public.wr_one_live_session_per_po_do;
create unique index warehouse_receipts_one_live_source_do
  on public.warehouse_receipts (source_kind, source_id, lower(btrim(do_number)))
  where status <> 'voided' and nullif(btrim(do_number), '') is not null;
create unique index warehouse_receipts_grn_number_uq
  on public.warehouse_receipts (grn_number)
  where grn_number is not null;

comment on column public.warehouse_receipts.grn_number is
  '0407: allocated and stored only when posting succeeds. Retries return this same number; void never releases it.';
comment on column public.warehouse_receipts.goods_received_timestamp is
  '0407: when the goods physically arrived. Separate from PO Issued, PO Delivery Date, Supplier Delivery Date and formal GRN posting time.';
comment on column public.warehouse_receipts.grn_snapshot is
  '0407: immutable official GRN evidence frozen at posting. Print/reprint reads this snapshot only.';

create or replace function public.receiving_grn_snapshot_is_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.grn_snapshot is not null and new.grn_snapshot is distinct from old.grn_snapshot then
    raise exception 'A posted GRN snapshot is immutable'
      using errcode = 'P0001', detail = 'grn_snapshot_immutable';
  end if;
  return new;
end;
$$;
drop trigger if exists warehouse_receipts_grn_snapshot_immutable on public.warehouse_receipts;
create trigger warehouse_receipts_grn_snapshot_immutable
before update of grn_snapshot on public.warehouse_receipts
for each row execute function public.receiving_grn_snapshot_is_immutable();

-- A Unit identity belongs to the exact PO line and governed Deliver To. Older
-- rows only carried PO + SKU, which was ambiguous when one SKU was split.
alter table public.ops_stock_items
  add column if not exists po_line_id uuid references public.purchase_order_lines(id) on delete restrict,
  add column if not exists purchasing_destination_id uuid references public.purchasing_destinations(id) on delete restrict;

with line_slots as (
  select l.po_id, l.sku, l.id as po_line_id,
         coalesce(l.destination_id, po.destination_id) as destination_id,
         row_number() over (
           partition by l.po_id, l.sku order by l.id, slot.n
         ) as position
    from public.purchase_order_lines l
    join public.purchase_orders po on po.id = l.po_id
    cross join lateral generate_series(1, greatest(l.qty, 0)) slot(n)
), unit_slots as (
  select i.id, i.po_no, i.sku,
         row_number() over (
           partition by i.po_no, i.sku order by i.created_at, i.id
         ) as position
    from public.ops_stock_items i
   where i.po_no is not null
)
update public.ops_stock_items i
   set po_line_id = l.po_line_id,
       purchasing_destination_id = l.destination_id
  from unit_slots u
  join line_slots l
    on l.po_id = u.po_no and l.sku = u.sku and l.position = u.position
 where i.id = u.id and i.po_line_id is null;

update public.ops_stock_items i
   set status = 'incoming', updated_at = now()
  from public.purchase_orders po
 where po.id = i.po_no and po.status = 'open'
   and i.po_line_id is not null and i.status = 'voided'
   and i.source_ref = 'po_mint';

create index if not exists ops_stock_items_po_line_idx
  on public.ops_stock_items(po_line_id);
create index if not exists ops_stock_items_purchasing_destination_idx
  on public.ops_stock_items(purchasing_destination_id);

create or replace function public.purchasing_sync_po_unit_identity(p_po_id text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_po public.purchase_orders;
  v_line record;
  v_supplier_name text;
  v_have integer;
  v_reopened integer;
  v_target_warehouse uuid;
begin
  select * into v_po from public.purchase_orders where id = p_po_id;
  if not found then return; end if;
  select name into v_supplier_name from public.suppliers where id = v_po.supplier_id;

  for v_line in
    select l.id, l.sku, l.qty,
           coalesce(l.destination_id, v_po.destination_id) as destination_id,
           d.warehouse_id as destination_warehouse_id
      from public.purchase_order_lines l
      join public.purchasing_destinations d
        on d.id = coalesce(l.destination_id, v_po.destination_id)
     where l.po_id = v_po.id
     order by l.id
  loop
    v_target_warehouse := coalesce(v_line.destination_warehouse_id, v_po.warehouse_id);
    if v_target_warehouse is null then
      raise exception 'Deliver To has no Unit identity host'
        using errcode = 'P0001', detail = 'destination_unit_host_missing';
    end if;
    update public.ops_stock_items
       set purchasing_destination_id = v_line.destination_id,
           warehouse_id = v_target_warehouse,
           updated_at = now()
     where po_line_id = v_line.id and status in ('incoming', 'voided');

    select count(*) into v_have from public.ops_stock_items
     where po_line_id = v_line.id and status = 'incoming';
    if v_have < v_line.qty then
      with reopen as (
        select id from public.ops_stock_items
         where po_line_id = v_line.id and status = 'voided' and source_ref = 'po_mint'
         order by created_at, id limit v_line.qty - v_have
      )
      update public.ops_stock_items i
         set status = 'incoming', updated_at = now()
        from reopen r where i.id = r.id;
      get diagnostics v_reopened = row_count;
      v_have := v_have + v_reopened;
    end if;
    if v_have < v_line.qty then
      insert into public.ops_stock_items (
        unit_code, sku, warehouse_id, status, supplier, po_no, source_ref,
        date_in, po_line_id, purchasing_destination_id
      )
      select public.gen_unit_code(), v_line.sku, v_target_warehouse, 'incoming',
             v_supplier_name, v_po.id, 'po_mint', current_date,
             v_line.id, v_line.destination_id
        from generate_series(1, v_line.qty - v_have);
    elsif v_have > v_line.qty then
      update public.ops_stock_items
         set status = 'voided', updated_at = now()
       where id in (
         select id from public.ops_stock_items
          where po_line_id = v_line.id and status = 'incoming'
          order by created_at desc, id desc limit v_have - v_line.qty
       );
    end if;
  end loop;

  update public.ops_stock_items i
     set status = 'voided', updated_at = now()
   where i.po_no = v_po.id and i.status = 'incoming'
     and (i.po_line_id is null or not exists (
       select 1 from public.purchase_order_lines l
        where l.id = i.po_line_id and l.po_id = v_po.id
     ));
end;
$$;

create or replace function public.trg_po_units_follow_destination()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.purchasing_sync_po_unit_identity(new.id);
  return null;
end;
$$;

create or replace function public.trg_po_line_units_follow_destination()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.purchasing_sync_po_unit_identity(coalesce(new.po_id, old.po_id));
  return null;
end;
$$;
drop trigger if exists trg_po_line_units_follow_destination on public.purchase_order_lines;
create constraint trigger trg_po_line_units_follow_destination
after insert or update of qty, sku, destination_id or delete on public.purchase_order_lines
deferrable initially deferred
for each row execute function public.trg_po_line_units_follow_destination();

do $$ declare v_po_id text;
begin
  for v_po_id in select id from public.purchase_orders where status = 'open' loop
    perform public.purchasing_sync_po_unit_identity(v_po_id);
  end loop;
end $$;

-- 2 · Every exact Unit has one physical outcome in this session.
create table public.receiving_session_unit_outcomes (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.warehouse_receipts(id) on delete restrict,
  po_line_id uuid not null references public.purchase_order_lines(id) on delete restrict,
  unit_code text not null,
  outcome text not null check (outcome in ('received', 'damaged', 'wrong_item', 'extra')),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (receipt_id, unit_code)
);

alter table public.receiving_session_unit_outcomes enable row level security;
create policy receiving_session_unit_outcomes_internal_read
  on public.receiving_session_unit_outcomes for select to authenticated
  using ((select public.is_internal()));
grant select on public.receiving_session_unit_outcomes to authenticated;
revoke insert, update, delete on public.receiving_session_unit_outcomes
  from public, anon, authenticated;

-- 3 · Formal numbering is a locked server fact, never browser arithmetic.
create table public.grn_number_series (
  singleton boolean primary key default true check (singleton),
  posting_date date not null,
  last_sequence integer not null check (last_sequence between 0 and 9999)
);
insert into public.grn_number_series (singleton, posting_date, last_sequence)
select true,
       coalesce(latest.posting_date, date '1970-01-01'),
       coalesce((
         select max(right(wr.grn_number, 4)::integer)
           from public.warehouse_receipts wr
          where wr.grn_posting_date = latest.posting_date
       ), 0)
  from (select max(grn_posting_date) as posting_date from public.warehouse_receipts) latest
on conflict (singleton) do nothing;
revoke all on public.grn_number_series from public, anon, authenticated;

create or replace function public.allocate_grn_number(p_posting_date date)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_sequence integer;
begin
  if p_posting_date is null then
    raise exception 'posting date is required'
      using errcode = '22023', detail = 'posting_date_required';
  end if;
  update public.grn_number_series
     set last_sequence = case
           when posting_date = p_posting_date then last_sequence + 1 else 1 end,
         posting_date = p_posting_date
   where singleton
   returning last_sequence into v_sequence;
  if v_sequence > 9999 then
    raise exception 'the GRN number range is exhausted for %', p_posting_date
      using errcode = 'P0001', detail = 'grn_number_exhausted';
  end if;
  return format('GRN-%s-%s', to_char(p_posting_date, 'YYYYMMDD'), lpad(v_sequence::text, 4, '0'));
end;
$$;

-- 4 · GRN Duty is the following PO-rota month; actor, normal holder and cover
-- remain three facts. An Operations Superuser may act without becoming Duty.
create or replace function public.receiving_grn_actor(p_business_date date)
returns jsonb
language plpgsql
stable security definer
set search_path = public, pg_temp
as $$
declare
  v_month text := to_char((date_trunc('month', p_business_date) + interval '1 month'), 'YYYY-MM');
  v_normal uuid;
  v_cover uuid;
  v_cover_id uuid;
begin
  select user_id into v_normal from public.ops_po_duty where month = v_month;
  select id, acting_user_id into v_cover_id, v_cover
    from public.ops_po_duty_cover
   where month = v_month
     and p_business_date between starts_on and ends_on
     and (v_normal is null or normal_user_id = v_normal)
   order by created_at desc
   limit 1;
  return jsonb_build_object(
    'month', v_month,
    'normal_user_id', v_normal,
    'cover_user_id', v_cover,
    'actor_user_id', coalesce(v_cover, v_normal),
    'cover_id', v_cover_id
  );
end;
$$;

create or replace function public.receiving_actor_may_post(p_user uuid, p_business_date date)
returns boolean
language sql
stable security definer
set search_path = public, pg_temp
as $$
  select p_user is not null and (
    public.is_operations_superuser(p_user)
    or nullif(public.receiving_grn_actor(p_business_date)->>'actor_user_id', '')::uuid = p_user
  );
$$;

-- 5 · The event ledger carries source version, ownership context and actual actor.
alter table public.receiving_events
  drop constraint if exists receiving_events_event_check,
  add column if not exists source_version integer,
  add column if not exists normal_grn_duty_user_id uuid references public.app_users(id),
  add column if not exists grn_cover_user_id uuid references public.app_users(id),
  add column if not exists actual_actor_user_id uuid references public.app_users(id),
  add column if not exists authority text,
  add column if not exists event_date_myt date not null
    default ((now() at time zone 'Asia/Kuala_Lumpur')::date),
  add constraint receiving_events_event_check check (event in (
    'submitted', 'returned', 'resubmitted', 'posted', 'voided', 'amended',
    'draft_started', 'draft_saved', 'count_submitted', 'count_returned',
    'count_resubmitted', 'grn_posted', 'grn_amended', 'grn_voided', 'evidence_added',
    'stock_continuation_failed'
  )),
  add constraint receiving_events_authority_check check (
    authority is null or authority in
      ('warehouse', 'office', 'grn_duty', 'grn_duty_cover', 'operations_superuser')
  );

create or replace function public.receiving_append_event(
  p_receipt_id uuid,
  p_event text,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt public.warehouse_receipts;
  v_actor uuid := auth.uid();
  v_date date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_who jsonb := public.receiving_grn_actor((now() at time zone 'Asia/Kuala_Lumpur')::date);
  v_authority text;
begin
  select * into v_receipt from public.warehouse_receipts where id = p_receipt_id;
  if not found then raise exception 'receiving session not found'; end if;
  v_authority := case
    when public.app_role() = 'warehouse' then 'warehouse'
    when v_actor = nullif(v_who->>'cover_user_id', '')::uuid then 'grn_duty_cover'
    when v_actor = nullif(v_who->>'normal_user_id', '')::uuid then 'grn_duty'
    when public.is_operations_superuser(v_actor) then 'operations_superuser'
    else 'office'
  end;
  insert into public.receiving_events (
    receipt_id, event, actor_id, payload, source_version,
    normal_grn_duty_user_id, grn_cover_user_id, actual_actor_user_id,
    authority, event_date_myt
  ) values (
    p_receipt_id, p_event, v_actor, coalesce(p_payload, '{}'::jsonb),
    v_receipt.source_version,
    nullif(v_who->>'normal_user_id', '')::uuid,
    nullif(v_who->>'cover_user_id', '')::uuid,
    v_actor, v_authority, v_date
  );
end;
$$;

create or replace function public.record_receiving_continuation_failure(
  p_receipt_id uuid,
  p_code text,
  p_message text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_receipt public.warehouse_receipts;
begin
  if public.app_role() not in ('operation', 'principal') then
    raise exception 'Operations access required' using errcode = '42501', detail = 'forbidden';
  end if;
  select * into v_receipt from public.warehouse_receipts where id = p_receipt_id;
  if not found or v_receipt.status not in ('posted', 'amended') then
    raise exception 'Posted Receiving Session not found'
      using errcode = 'P0002', detail = 'receipt_not_found';
  end if;
  perform public.receiving_append_event(
    p_receipt_id,
    'stock_continuation_failed',
    jsonb_build_object(
      'code', nullif(btrim(coalesce(p_code, '')), ''),
      'message', nullif(btrim(coalesce(p_message, '')), '')
    )
  );
end;
$$;

-- 6 · One persistent save door. NULL receipt id creates the draft.
create or replace function public.save_receiving_session(
  p_receipt_id uuid,
  p_expected_version integer,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.app_role := public.app_role();
  v_source_kind text := coalesce(p_payload->>'sourceKind', 'purchase_order');
  v_source_id text := nullif(btrim(coalesce(p_payload->>'sourceId', '')), '');
  v_source_version integer := nullif(p_payload->>'expectedVersion', '')::integer;
  v_po public.purchase_orders;
  v_receipt public.warehouse_receipts;
  v_prior public.warehouse_receipts;
  v_id uuid;
  v_destination jsonb;
  v_destination_id uuid;
  v_destination_warehouse_id uuid;
  v_line jsonb;
  v_line_destination_id uuid;
  v_supplier jsonb;
  v_source jsonb;
  v_lines jsonb := coalesce(p_payload->'lines', '[]'::jsonb);
  v_do text := nullif(btrim(coalesce(p_payload->>'supplierDoNo', '')), '');
  v_signed text := nullif(btrim(coalesce(p_payload->>'signedDoPath', '')), '');
  v_received_at timestamptz;
begin
  if v_actor is null or v_role not in ('warehouse', 'operation', 'principal') then
    raise exception 'receiving access required' using errcode = '42501', detail = 'forbidden';
  end if;
  if v_source_kind <> 'purchase_order' then
    raise exception 'the governed Consignment Order source is not available'
      using errcode = 'P0001', detail = 'source_not_available';
  end if;
  if v_source_id is null or v_source_version is null then
    raise exception 'source and expected version are required'
      using errcode = '22023', detail = 'invalid_input';
  end if;
  if jsonb_typeof(v_lines) <> 'array' then
    raise exception 'lines must be an array' using errcode = '22023', detail = 'invalid_input';
  end if;
  begin
    v_received_at := nullif(p_payload->>'goodsReceivedAt', '')::timestamptz;
  exception when others then
    raise exception 'Goods Received At is invalid' using errcode = '22023', detail = 'invalid_input';
  end;

  select * into v_po from public.purchase_orders where id = v_source_id for update;
  if not found then
    raise exception 'Purchase Order not found' using errcode = 'P0002', detail = 'source_not_found';
  end if;
  if coalesce(v_po.version, 1) <> v_source_version then
    raise exception 'The Purchase Order changed. Reload the Receiving Session.'
      using errcode = '40001', detail = 'stale_source_version';
  end if;

  for v_line in select * from jsonb_array_elements(v_lines) loop
    select coalesce(l.destination_id, v_po.destination_id)
      into v_line_destination_id
      from public.purchase_order_lines l
     where l.id = (v_line->>'poLineId')::uuid and l.po_id = v_po.id;
    if not found then
      raise exception 'The Purchase Order line changed'
        using errcode = '40001', detail = 'stale_source_version';
    end if;
    if v_destination_id is null then
      v_destination_id := v_line_destination_id;
    elsif v_destination_id is distinct from v_line_destination_id then
      raise exception 'One Receiving Session must use one Deliver To'
        using errcode = 'P0001', detail = 'mixed_receiving_destination';
    end if;
  end loop;

  select d.warehouse_id into v_destination_warehouse_id
    from public.purchasing_destinations d where d.id = v_destination_id;
  if v_role = 'warehouse'
     and v_destination_warehouse_id is distinct from public.app_warehouse_id() then
    raise exception 'this delivery is not for your warehouse'
      using errcode = '42501', detail = 'wrong_destination';
  end if;

  select jsonb_build_object(
      'id', d.id, 'name', d.name, 'warehouseId', d.warehouse_id,
      'address', case when d.warehouse_id is not null then w.address else d.address end
    ) into v_destination
    from public.purchasing_destinations d
    left join public.warehouses w on w.id = d.warehouse_id
   where d.id = v_destination_id;
  select jsonb_build_object('id', s.id, 'name', s.name, 'address', s.address, 'contact', s.contact)
    into v_supplier from public.suppliers s where s.id = v_po.supplier_id;
  select jsonb_build_object(
      'sourceKind', 'purchase_order', 'sourceId', v_po.id,
      'sourceVersion', coalesce(v_po.version, 1), 'poIssuedAt', v_po.placed_at,
      'poDeliveryDate', v_po.po_delivery_date,
      'lines', coalesce((select jsonb_agg(jsonb_build_object(
        'poLineId', l.id, 'sku', l.sku, 'orderQty', l.qty,
        'receivedQtyAtOpen', l.received_qty,
        'destinationId', coalesce(l.destination_id, v_po.destination_id)
      ) order by l.sku, l.id) from public.purchase_order_lines l where l.po_id = v_po.id), '[]'::jsonb)
    ) into v_source;

  if v_do is not null then
    select * into v_prior
      from public.warehouse_receipts prior
     where prior.source_kind = v_source_kind
       and prior.source_id = v_source_id
       and prior.id is distinct from p_receipt_id
       and lower(btrim(prior.do_number)) = lower(v_do)
       and prior.status <> 'voided'
     order by prior.created_at
     limit 1;
    if found then
      raise exception 'Supplier DO % already belongs to %',
        v_do, coalesce(v_prior.grn_number, 'Receiving Session ' || v_prior.id::text)
        using errcode = '23505', detail = 'duplicate_supplier_do';
    end if;
  end if;

  if p_receipt_id is null then
    if coalesce(p_expected_version, 0) <> 0 then
      raise exception 'a new Receiving Session starts at version 0'
        using errcode = '40001', detail = 'stale_receiving_session';
    end if;
    insert into public.warehouse_receipts (
      po_id, warehouse_id, source_kind, source_id, source_version,
      source_snapshot, destination_snapshot, supplier_snapshot,
      do_number, do_file_path, goods_received_at, goods_received_timestamp,
      note, lines, status, submitted_from, submitted_by, lock_version
    ) values (
      v_po.id, coalesce(v_destination_warehouse_id, v_po.warehouse_id),
      'purchase_order', v_po.id, coalesce(v_po.version, 1),
      v_source, v_destination, v_supplier,
      v_do, v_signed,
      coalesce((v_received_at at time zone 'Asia/Kuala_Lumpur')::date,
               (now() at time zone 'Asia/Kuala_Lumpur')::date),
      v_received_at, nullif(btrim(coalesce(p_payload->>'note', '')), ''),
      v_lines, 'draft', case when v_role = 'warehouse' then 'warehouse' else 'office' end,
      v_actor, 1
    ) returning id into v_id;
    perform public.receiving_append_event(v_id, 'draft_started', '{}'::jsonb);
  else
    select * into v_receipt from public.warehouse_receipts where id = p_receipt_id for update;
    if not found then raise exception 'Receiving Session not found' using errcode = 'P0002', detail = 'receipt_not_found'; end if;
    if v_receipt.lock_version <> p_expected_version then
      raise exception 'The Receiving Session changed. Reload it.'
        using errcode = '40001', detail = 'stale_receiving_session';
    end if;
    if v_receipt.status not in ('draft', 'returned') then
      raise exception 'This Receiving Session is sealed'
        using errcode = 'P0001', detail = 'receipt_not_editable';
    end if;
    if v_receipt.source_id <> v_po.id or v_receipt.source_version <> coalesce(v_po.version, 1) then
      raise exception 'The source snapshot does not match this Purchase Order'
        using errcode = '40001', detail = 'stale_source_version';
    end if;
    if v_receipt.destination_snapshot->>'id' is distinct from v_destination_id::text then
      raise exception 'The Deliver To changed. Reload the Receiving Session.'
        using errcode = '40001', detail = 'stale_destination';
    end if;
    update public.warehouse_receipts
       set do_number = v_do, do_file_path = v_signed,
           goods_received_at = coalesce((v_received_at at time zone 'Asia/Kuala_Lumpur')::date, goods_received_at),
           goods_received_timestamp = v_received_at,
           note = nullif(btrim(coalesce(p_payload->>'note', '')), ''),
           lines = v_lines, lock_version = lock_version + 1, updated_at = now()
     where id = p_receipt_id
     returning id into v_id;
    perform public.receiving_append_event(v_id, 'draft_saved', '{}'::jsonb);
  end if;
  return (select jsonb_build_object(
    'receipt_id', id, 'status', status, 'lock_version', lock_version,
    'grn_number', grn_number
  ) from public.warehouse_receipts where id = v_id);
end;
$$;

-- 7 · Submit and return move workflow only. Neither moves Stock nor allocates GRN.
create or replace function public.submit_receiving_session(
  p_receipt_id uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt public.warehouse_receipts;
  v_line jsonb;
  v_total integer := 0;
  v_was_returned boolean;
begin
  select * into v_receipt from public.warehouse_receipts where id = p_receipt_id for update;
  if not found then raise exception 'Receiving Session not found' using errcode = 'P0002', detail = 'receipt_not_found'; end if;
  if public.app_role() = 'warehouse' and v_receipt.warehouse_id is distinct from public.app_warehouse_id() then
    raise exception 'this Receiving Session is not for your warehouse'
      using errcode = '42501', detail = 'wrong_destination';
  elsif public.app_role() not in ('warehouse', 'operation', 'principal') then
    raise exception 'receiving access required' using errcode = '42501', detail = 'forbidden';
  end if;
  if v_receipt.lock_version <> p_expected_version then
    raise exception 'The Receiving Session changed. Reload it.'
      using errcode = '40001', detail = 'stale_receiving_session';
  end if;
  if v_receipt.status not in ('draft', 'returned') then
    raise exception 'only a Draft or returned count can be sent'
      using errcode = 'P0001', detail = 'receipt_not_editable';
  end if;
  if nullif(btrim(coalesce(v_receipt.do_number, '')), '') is null then
    raise exception 'Supplier DO is missing' using errcode = 'P0001', detail = 'supplier_do_missing';
  end if;
  if nullif(btrim(coalesce(v_receipt.do_file_path, '')), '') is null then
    raise exception 'Signed DO photo is missing' using errcode = 'P0001', detail = 'signed_do_missing';
  end if;
  if v_receipt.goods_received_timestamp is null then
    raise exception 'Goods Received At is missing' using errcode = 'P0001', detail = 'goods_received_at_missing';
  end if;
  for v_line in select * from jsonb_array_elements(v_receipt.lines) loop
    v_total := v_total
      + coalesce((v_line->>'receivedQty')::integer, 0)
      + coalesce((v_line->>'damagedQty')::integer, 0)
      + coalesce((v_line->>'wrongItemQty')::integer, 0)
      + coalesce((v_line->>'extraQty')::integer, 0);
    if coalesce((v_line->>'damagedQty')::integer, 0) > 0
       and jsonb_array_length(coalesce(v_line->'damagedPhotos', '[]'::jsonb)) = 0 then
      raise exception 'Damage evidence is missing' using errcode = 'P0001', detail = 'damage_evidence_missing';
    end if;
    if coalesce((v_line->>'wrongItemQty')::integer, 0) > 0 and (
       jsonb_array_length(coalesce(v_line->'wrongItemPhotos', '[]'::jsonb)) = 0
       or nullif(btrim(coalesce(v_line->>'wrongItemReason', '')), '') is null) then
      raise exception 'Wrong item details are missing' using errcode = 'P0001', detail = 'wrong_item_details_missing';
    end if;
    if coalesce((v_line->>'extraQty')::integer, 0) > 0
       and jsonb_array_length(coalesce(v_line->'extraEvidence', '[]'::jsonb)) = 0 then
      raise exception 'Extra goods evidence is missing' using errcode = 'P0001', detail = 'extra_evidence_missing';
    end if;
  end loop;
  if v_total = 0 then
    raise exception 'Count at least one Unit before sending this'
      using errcode = 'P0001', detail = 'nothing_counted';
  end if;
  v_was_returned := v_receipt.status = 'returned';
  update public.warehouse_receipts
     set status = 'submitted', submitted_by = auth.uid(), submitted_at = now(),
         return_reason = null, lock_version = lock_version + 1, updated_at = now()
   where id = p_receipt_id;
  perform public.receiving_append_event(
    p_receipt_id,
    case when v_was_returned then 'count_resubmitted' else 'count_submitted' end,
    '{}'::jsonb
  );
  return (select jsonb_build_object('receipt_id', id, 'status', status, 'lock_version', lock_version)
            from public.warehouse_receipts where id = p_receipt_id);
end;
$$;

-- Warehouse sends one count with one RPC and therefore one database
-- transaction. If validation/submission fails, the preceding save rolls back;
-- a retry edits the exact Draft/Returned session instead of stranding a row.
create or replace function public.save_and_submit_receiving_session(
  p_receipt_id uuid,
  p_expected_version integer,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_saved jsonb;
  v_id uuid;
  v_version integer;
begin
  if public.app_role() <> 'warehouse' then
    raise exception 'Warehouse access required'
      using errcode = '42501', detail = 'forbidden';
  end if;
  v_saved := public.save_receiving_session(p_receipt_id, p_expected_version, p_payload);
  v_id := (v_saved->>'receipt_id')::uuid;
  v_version := (v_saved->>'lock_version')::integer;
  return public.submit_receiving_session(v_id, v_version);
end;
$$;

-- Warehouse reads are scoped by the effective line Deliver To, never by the
-- PO's legacy warehouse column. Draft/Returned carries the exact recovery
-- identity; Submitted is visible but not editable.
create or replace function public.warehouse_incoming_pos()
returns jsonb
language plpgsql
stable security definer
set search_path = public, pg_temp
as $$
declare
  v_wh_id uuid := public.app_warehouse_id();
begin
  if public.app_role() <> 'warehouse' or v_wh_id is null then
    raise exception 'Warehouse access required'
      using errcode = '42501', detail = 'forbidden';
  end if;
  return jsonb_build_object(
    'warehouse', (select jsonb_build_object('id', w.id, 'name', w.name)
                    from public.warehouses w where w.id = v_wh_id),
    'pos', coalesce((
      select jsonb_agg(row_data order by row_data->>'po_id') from (
        select jsonb_build_object(
          'po_id', po.id,
          'scope_id', po.id || '::' || d.id::text,
          'source_version', coalesce(po.version, 1),
          'supplier_name', s.name,
          'po_delivery_date', po.po_delivery_date,
          'supplier_delivery_date', (
            select p.new_date from public.po_supplier_promises p
             where p.po_id = po.id order by p.recorded_at desc, p.id desc limit 1
          ),
          'deliver_to', jsonb_build_object('id', d.id, 'name', d.name, 'address', w.address),
          'sup_status', po.sup_status,
          'lines', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', l.id, 'sku', l.sku, 'qty', l.qty,
              'received_qty', l.received_qty,
              'damaged_qty', l.damaged_qty,
              'wrong_item_qty', l.wrong_item_qty,
              'destination_id', d.id,
              'category', public.claim_product_category(l.sku),
              'unit_ids', coalesce((
                select jsonb_agg(i.unit_code order by i.created_at, i.unit_code)
                  from public.ops_stock_items i
                 where i.po_line_id = l.id
                   and i.purchasing_destination_id = d.id
                   and i.status = 'incoming'
              ), '[]'::jsonb)
            ) order by l.sku, l.id)
              from public.purchase_order_lines l
             where l.po_id = po.id
               and coalesce(l.destination_id, po.destination_id) = d.id
          ), '[]'::jsonb),
          'open_receipt', (
            select jsonb_build_object(
              'id', wr.id, 'status', wr.status, 'lock_version', wr.lock_version,
              'do_number', wr.do_number, 'do_file_path', wr.do_file_path,
              'goods_received_timestamp', wr.goods_received_timestamp,
              'note', wr.note, 'lines', wr.lines, 'return_reason', wr.return_reason
            ) from public.warehouse_receipts wr
             where wr.source_id = po.id and wr.warehouse_id = v_wh_id
               and wr.destination_snapshot->>'id' = d.id::text
               and wr.status in ('draft', 'submitted', 'returned')
             order by wr.updated_at desc limit 1
          )
        ) as row_data
          from public.purchase_orders po
          join public.suppliers s on s.id = po.supplier_id
          join public.purchasing_destinations d on d.warehouse_id = v_wh_id
          join public.warehouses w on w.id = d.warehouse_id
         where po.status = 'open' and exists (
           select 1 from public.purchase_order_lines l
            where l.po_id = po.id
              and coalesce(l.destination_id, po.destination_id) = d.id
              and l.received_qty < l.qty
         )
      ) q
    ), '[]'::jsonb)
  );
end;
$$;

drop function if exists public.warehouse_my_receipts();
create or replace function public.warehouse_my_receipts(
  p_limit integer default 50,
  p_before timestamptz default null,
  p_before_id uuid default null,
  p_exact text default null
)
returns jsonb
language plpgsql
stable security definer
set search_path = public, pg_temp
as $$
declare
  v_wh_id uuid := public.app_warehouse_id();
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_exact text := nullif(lower(btrim(coalesce(p_exact, ''))), '');
  v_result jsonb;
begin
  if public.app_role() <> 'warehouse' or v_wh_id is null then
    raise exception 'Warehouse access required'
      using errcode = '42501', detail = 'forbidden';
  end if;
  with filtered as materialized (
    select wr.*, coalesce(wr.submitted_at, wr.created_at) as cursor_at
      from public.warehouse_receipts wr
     where wr.warehouse_id = v_wh_id
       and (v_exact is null
         or lower(wr.source_id) = v_exact
         or lower(wr.id::text) = v_exact
         or lower(coalesce(wr.grn_number, '')) = v_exact)
       and (p_before is null
         or coalesce(wr.submitted_at, wr.created_at) < p_before
         or (coalesce(wr.submitted_at, wr.created_at) = p_before
           and (p_before_id is null or wr.id < p_before_id)))
     order by coalesce(wr.submitted_at, wr.created_at) desc, wr.id desc
     limit v_limit + 1
  ), page as (
    select * from filtered
     order by cursor_at desc, id desc
     limit v_limit
  )
  select jsonb_build_object(
    'receipts', coalesce((select jsonb_agg(jsonb_build_object(
      'id', wr.id, 'po_id', wr.source_id, 'source_version', wr.source_version,
      'supplier_name', wr.supplier_snapshot->>'name',
      'deliver_to', wr.destination_snapshot,
      'do_number', wr.do_number, 'do_file_path', wr.do_file_path,
      'goods_received_at', wr.goods_received_timestamp,
      'status', wr.status, 'lock_version', wr.lock_version,
      'lines', wr.lines, 'note', wr.note,
      'submitted_at', wr.submitted_at, 'posted_at', wr.posted_at,
      'grn_number', wr.grn_number, 'return_reason', wr.return_reason,
      'claims', '[]'::jsonb
    ) order by wr.cursor_at desc, wr.id desc) from page wr), '[]'::jsonb),
    'next', case when (select count(*) from filtered) > v_limit then (
      select jsonb_build_object('before', wr.cursor_at, 'beforeId', wr.id)
        from page wr order by wr.cursor_at asc, wr.id asc limit 1
    ) else null end
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.return_receiving_session(
  p_receipt_id uuid,
  p_expected_version integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt public.warehouse_receipts;
  v_date date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
begin
  if not public.receiving_actor_may_post(auth.uid(), v_date) then
    raise exception 'GRN authority is required' using errcode = '42501', detail = 'grn_authority_required';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Say what the count must fix' using errcode = '22023', detail = 'reason_required';
  end if;
  select * into v_receipt from public.warehouse_receipts where id = p_receipt_id for update;
  if not found then raise exception 'Receiving Session not found' using errcode = 'P0002', detail = 'receipt_not_found'; end if;
  if v_receipt.lock_version <> p_expected_version then
    raise exception 'The Receiving Session changed. Reload it.'
      using errcode = '40001', detail = 'stale_receiving_session';
  end if;
  if v_receipt.status <> 'submitted' then
    raise exception 'only a submitted count can be returned'
      using errcode = 'P0001', detail = 'receipt_not_submitted';
  end if;
  update public.warehouse_receipts
     set status = 'returned', return_reason = btrim(p_reason),
         lock_version = lock_version + 1, updated_at = now()
   where id = p_receipt_id;
  perform public.receiving_append_event(
    p_receipt_id, 'count_returned', jsonb_build_object('reason', btrim(p_reason))
  );
  return (select jsonb_build_object('receipt_id', id, 'status', status, 'lock_version', lock_version)
            from public.warehouse_receipts where id = p_receipt_id);
end;
$$;

-- 8 · The ONE posting engine. Only received Units reduce Pending Delivery and
-- become available. Damaged/wrong/extra remain outside available Stock and do
-- not create Supplier Claims by themselves.
create or replace function public.post_receiving_session(
  p_receipt_id uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt public.warehouse_receipts;
  v_po public.purchase_orders;
  v_line jsonb;
  v_pol public.purchase_order_lines;
  v_unit record;
  v_received integer;
  v_damaged integer;
  v_wrong integer;
  v_extra integer;
  v_physical integer;
  v_pending integer;
  v_outcome text;
  v_destination_id uuid;
  v_destination_warehouse_id uuid;
  v_posts_stock boolean;
  v_grn text;
  v_posting_date date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_who jsonb := public.receiving_grn_actor((now() at time zone 'Asia/Kuala_Lumpur')::date);
  v_authority text;
  v_total_received integer := 0;
begin
  select * into v_receipt from public.warehouse_receipts where id = p_receipt_id for update;
  if not found then raise exception 'Receiving Session not found' using errcode = 'P0002', detail = 'receipt_not_found'; end if;

  if v_receipt.status in ('posted', 'amended') then
    return jsonb_build_object(
      'receipt_id', v_receipt.id, 'status', v_receipt.status,
      'po_id', v_receipt.source_id,
      'lock_version', v_receipt.lock_version, 'grn_number', v_receipt.grn_number,
      'grn_posting_date', v_receipt.grn_posting_date, 'idempotent', true
    );
  end if;
  if not public.receiving_actor_may_post(auth.uid(), v_posting_date) then
    raise exception 'GRN authority is required' using errcode = '42501', detail = 'grn_authority_required';
  end if;
  if v_receipt.lock_version <> p_expected_version then
    raise exception 'The Receiving Session changed. Reload it.'
      using errcode = '40001', detail = 'stale_receiving_session';
  end if;
  if v_receipt.status not in ('draft', 'submitted') then
    raise exception 'This Receiving Session cannot be posted'
      using errcode = 'P0001', detail = 'receipt_not_postable';
  end if;
  if v_receipt.source_kind <> 'purchase_order' then
    raise exception 'the governed Consignment Order source is not available'
      using errcode = 'P0001', detail = 'source_not_available';
  end if;
  if nullif(btrim(coalesce(v_receipt.do_number, '')), '') is null then
    raise exception 'Supplier DO is missing' using errcode = 'P0001', detail = 'supplier_do_missing';
  end if;
  if nullif(btrim(coalesce(v_receipt.do_file_path, '')), '') is null then
    raise exception 'Signed DO photo is missing' using errcode = 'P0001', detail = 'signed_do_missing';
  end if;
  if v_receipt.goods_received_timestamp is null then
    raise exception 'Goods Received At is missing' using errcode = 'P0001', detail = 'goods_received_at_missing';
  end if;

  select * into v_po from public.purchase_orders where id = v_receipt.source_id for update;
  if not found then raise exception 'Purchase Order not found' using errcode = 'P0002', detail = 'source_not_found'; end if;
  if coalesce(v_po.version, 1) <> v_receipt.source_version then
    raise exception 'The Purchase Order changed. Reload the Receiving Session.'
      using errcode = '40001', detail = 'stale_source_version';
  end if;
  if exists (
    select 1 from public.warehouse_receipts other
     where other.id <> v_receipt.id
       and other.source_kind = v_receipt.source_kind
       and other.source_id = v_receipt.source_id
       and lower(btrim(other.do_number)) = lower(btrim(v_receipt.do_number))
       and other.status <> 'voided'
  ) then
    raise exception 'This Supplier DO was already used'
      using errcode = '23505', detail = 'duplicate_supplier_do';
  end if;

  delete from public.receiving_session_unit_outcomes where receipt_id = v_receipt.id;
  for v_line in select * from jsonb_array_elements(v_receipt.lines) loop
    select * into v_pol from public.purchase_order_lines
     where id = (v_line->>'poLineId')::uuid and po_id = v_po.id for update;
    if not found then
      raise exception 'The Purchase Order line changed'
        using errcode = '40001', detail = 'stale_source_version';
    end if;
    if v_line->>'sku' is distinct from v_pol.sku then
      raise exception 'Unit source does not match the Purchase Order line'
        using errcode = 'P0001', detail = 'unit_id_mismatch';
    end if;
    v_received := coalesce((v_line->>'receivedQty')::integer, 0);
    v_damaged := coalesce((v_line->>'damagedQty')::integer, 0);
    v_wrong := coalesce((v_line->>'wrongItemQty')::integer, 0);
    v_extra := coalesce((v_line->>'extraQty')::integer, 0);
    if least(v_received, v_damaged, v_wrong, v_extra) < 0 then
      raise exception 'Receiving quantities cannot be negative'
        using errcode = '22023', detail = 'invalid_input';
    end if;
    v_pending := greatest(0, v_pol.qty - v_pol.received_qty);
    if v_received + v_damaged + v_wrong > v_pending then
      raise exception 'The count exceeds the Purchase Order balance'
        using errcode = 'P0001', detail = 'over_delivery_requires_exception';
    end if;
    v_physical := v_received + v_damaged + v_wrong + v_extra;
    v_destination_id := coalesce(v_pol.destination_id, v_po.destination_id);
    select d.warehouse_id,
           coalesce(d.warehouse_id is not null and w.kind = 'own', false)
      into v_destination_warehouse_id, v_posts_stock
      from public.purchasing_destinations d
      left join public.warehouses w on w.id = d.warehouse_id
     where d.id = v_destination_id;
    if v_destination_id::text is distinct from v_receipt.destination_snapshot->>'id' then
      raise exception 'The Deliver To changed. Reload the Receiving Session.'
        using errcode = '40001', detail = 'stale_destination';
    end if;
    if jsonb_array_length(coalesce(v_line->'unitIds', '[]'::jsonb)) <> v_physical then
      raise exception 'Every counted Unit needs its governed Unit ID'
        using errcode = 'P0001', detail = 'unit_id_mismatch';
    end if;
    if v_damaged > 0 and jsonb_array_length(coalesce(v_line->'damagedPhotos', '[]'::jsonb)) = 0 then
      raise exception 'Damage evidence is missing' using errcode = 'P0001', detail = 'evidence_missing';
    end if;
    if v_wrong > 0 and (
       jsonb_array_length(coalesce(v_line->'wrongItemPhotos', '[]'::jsonb)) = 0
       or nullif(btrim(coalesce(v_line->>'wrongItemReason', '')), '') is null) then
      raise exception 'Wrong item details are missing' using errcode = 'P0001', detail = 'evidence_missing';
    end if;
    if v_extra > 0 and jsonb_array_length(coalesce(v_line->'extraEvidence', '[]'::jsonb)) = 0 then
      raise exception 'Extra goods evidence is missing' using errcode = 'P0001', detail = 'evidence_missing';
    end if;

    for v_unit in
      select value #>> '{}' as unit_code, ordinality::integer as position
        from jsonb_array_elements(coalesce(v_line->'unitIds', '[]'::jsonb)) with ordinality
    loop
      v_outcome := case
        when v_unit.position <= v_received then 'received'
        when v_unit.position <= v_received + v_damaged then 'damaged'
        when v_unit.position <= v_received + v_damaged + v_wrong then 'wrong_item'
        else 'extra'
      end;
      if exists (
        select 1 from public.receiving_session_unit_outcomes o
         where o.receipt_id = v_receipt.id and o.unit_code = v_unit.unit_code
      ) then
        raise exception 'Unit ID % was counted more than once', v_unit.unit_code
          using errcode = 'P0001', detail = 'unit_id_mismatch';
      end if;
      if v_outcome <> 'extra' and not exists (
        select 1 from public.ops_stock_items i
         where i.unit_code = v_unit.unit_code
           and i.po_no = v_po.id and i.sku = v_pol.sku
           and i.po_line_id = v_pol.id
           and i.purchasing_destination_id = v_destination_id
           and i.status = 'incoming'
      ) then
        raise exception 'Unit ID % is not an incoming Unit on %', v_unit.unit_code, v_po.id
          using errcode = 'P0001', detail = 'unit_id_mismatch';
      end if;
      if v_outcome = 'extra' and exists (
        select 1 from public.ops_stock_items i where i.unit_code = v_unit.unit_code
      ) then
        raise exception 'Extra Unit ID % already belongs to a governed source', v_unit.unit_code
          using errcode = 'P0001', detail = 'unit_id_mismatch';
      end if;
      insert into public.receiving_session_unit_outcomes (
        receipt_id, po_line_id, unit_code, outcome, evidence
      ) values (
        v_receipt.id, v_pol.id, v_unit.unit_code, v_outcome,
        case v_outcome
          when 'damaged' then jsonb_build_object('photos', coalesce(v_line->'damagedPhotos', '[]'::jsonb))
          when 'wrong_item' then jsonb_build_object(
            'photos', coalesce(v_line->'wrongItemPhotos', '[]'::jsonb),
            'reason', v_line->>'wrongItemReason')
          when 'extra' then jsonb_build_object('evidence', coalesce(v_line->'extraEvidence', '[]'::jsonb))
          else '{}'::jsonb
        end
      );
    end loop;

    update public.ops_stock_items i
       set status = case when v_posts_stock then 'free' else 'transferred' end,
           source_ref = v_receipt.do_number,
           date_in = v_receipt.goods_received_at, last_verified_at = now(), updated_at = now()
      from public.receiving_session_unit_outcomes o
     where o.receipt_id = v_receipt.id and o.po_line_id = v_pol.id
       and o.outcome = 'received' and i.unit_code = o.unit_code;
    update public.ops_stock_items i
       set status = case when v_posts_stock then 'on_hold' else 'transferred' end,
           hold_reason = o.outcome,
           held_at = now(), last_verified_at = now(), updated_at = now()
      from public.receiving_session_unit_outcomes o
     where o.receipt_id = v_receipt.id and o.po_line_id = v_pol.id
       and o.outcome in ('damaged', 'wrong_item') and i.unit_code = o.unit_code;
    update public.purchase_order_lines
       set received_qty = received_qty + v_received
     where id = v_pol.id;
    v_total_received := v_total_received + v_received;
  end loop;

  if not exists (select 1 from public.receiving_session_unit_outcomes where receipt_id = v_receipt.id) then
    raise exception 'Count at least one Unit before posting'
      using errcode = 'P0001', detail = 'nothing_counted';
  end if;

  v_grn := public.allocate_grn_number(v_posting_date);
  v_authority := case
    when auth.uid() = nullif(v_who->>'cover_user_id', '')::uuid then 'grn_duty_cover'
    when auth.uid() = nullif(v_who->>'normal_user_id', '')::uuid then 'grn_duty'
    else 'operations_superuser'
  end;
  update public.warehouse_receipts
     set status = 'posted', grn_number = v_grn, grn_posting_date = v_posting_date,
         grn_snapshot = jsonb_build_object(
           'grnNumber', v_grn,
           'grnPostingDate', v_posting_date,
           'receivingSessionId', v_receipt.id,
           'sourceSnapshot', v_receipt.source_snapshot,
           'supplierSnapshot', v_receipt.supplier_snapshot,
           'destinationSnapshot', v_receipt.destination_snapshot,
           'supplierDeliveryDate', (
             select p.new_date from public.po_supplier_promises p
              where p.po_id = v_po.id
              order by p.recorded_at desc, p.id desc limit 1
           ),
           'goodsReceivedAt', v_receipt.goods_received_timestamp,
           'supplierDoNo', v_receipt.do_number,
           'signedDoPath', v_receipt.do_file_path,
           'lines', v_receipt.lines,
           'unitOutcomes', coalesce((
             select jsonb_agg(jsonb_build_object(
               'poLineId', o.po_line_id, 'unitId', o.unit_code,
               'outcome', o.outcome, 'evidence', o.evidence
             ) order by o.po_line_id, o.created_at, o.unit_code)
               from public.receiving_session_unit_outcomes o
              where o.receipt_id = v_receipt.id
           ), '[]'::jsonb),
           'submission', jsonb_build_object(
             'from', v_receipt.submitted_from,
             'submittedBy', v_receipt.submitted_by,
             'submittedAt', v_receipt.submitted_at
           ),
           'actualActor', jsonb_build_object(
             'userId', auth.uid(),
             'name', (select u.name from public.app_users u where u.id = auth.uid())
           ),
           'normalGrnDuty', jsonb_build_object(
             'userId', nullif(v_who->>'normal_user_id', '')::uuid,
             'name', (select u.name from public.app_users u
                       where u.id = nullif(v_who->>'normal_user_id', '')::uuid)
           ),
           'datedCover', case when nullif(v_who->>'cover_user_id', '') is null then null
             else jsonb_build_object(
               'userId', nullif(v_who->>'cover_user_id', '')::uuid,
               'name', (select u.name from public.app_users u
                         where u.id = nullif(v_who->>'cover_user_id', '')::uuid),
               'coverId', nullif(v_who->>'cover_id', '')::uuid
             ) end,
           'postAuthority', v_authority,
           'postedAt', now()
         ),
         posted_by = auth.uid(), posted_at = now(), reviewed_by = auth.uid(), reviewed_at = now(),
         normal_grn_duty_user_id = nullif(v_who->>'normal_user_id', '')::uuid,
         grn_cover_user_id = nullif(v_who->>'cover_user_id', '')::uuid,
         post_authority = v_authority,
         lock_version = lock_version + 1, updated_at = now()
   where id = v_receipt.id;

  if not exists (
    select 1 from public.purchase_order_lines l
     where l.po_id = v_po.id and l.received_qty < l.qty
  ) then
    update public.purchase_orders set status = 'received', updated_at = now() where id = v_po.id;
  end if;
  perform public.receiving_append_event(
    v_receipt.id, 'grn_posted',
    jsonb_build_object('grn_number', v_grn, 'grn_posting_date', v_posting_date,
                       'goods_received_at', v_receipt.goods_received_timestamp,
                       'received_qty', v_total_received)
  );
  insert into public.po_history (po_id, text, by_role, by_user_id)
  values (v_po.id, format('%s posted for Supplier DO %s', v_grn, v_receipt.do_number),
          public.app_role(), auth.uid());
  insert into public.audit_log (role, actor_text, action, ref)
  values (public.app_role(),
          coalesce((select name from public.app_users where id = auth.uid()), 'Operations'),
          format('%s posted for %s', v_grn, v_po.id), v_po.id);

  return (select jsonb_build_object(
    'receipt_id', id, 'po_id', source_id, 'status', status, 'lock_version', lock_version,
    'grn_number', grn_number, 'grn_posting_date', grn_posting_date,
    'idempotent', false
  ) from public.warehouse_receipts where id = v_receipt.id);
end;
$$;

-- 9 · Compatibility check-in is a wrapper, never another receiving writer.
create or replace function public.warehouse_receipt_check_in(p_receipt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_version integer;
begin
  select lock_version into v_version from public.warehouse_receipts where id = p_receipt_id;
  if not found then raise exception 'Receiving Session not found' using errcode = 'P0002', detail = 'receipt_not_found'; end if;
  return public.post_receiving_session(p_receipt_id, v_version);
end;
$$;

-- The old Office signature remains only so an overlapping deployment receives
-- an actionable refusal instead of invoking the retired direct stock engine.
create or replace function public.office_receive_post(
  p_po_id text,
  p_do_number text,
  p_do_file_path text,
  p_note text,
  p_lines jsonb,
  p_goods_received_at date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'Open Receiving and create a governed Receiving Session'
    using errcode = 'P0001', detail = 'receiving_session_required';
end;
$$;

-- 10 · Grants: browser roles call governed doors; helper/allocator stay closed.
revoke all on function public.allocate_grn_number(date) from public, anon, authenticated;
revoke all on function public.receiving_append_event(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.record_receiving_continuation_failure(uuid, text, text) from public, anon;
grant execute on function public.record_receiving_continuation_failure(uuid, text, text) to authenticated;
revoke all on function public.receiving_grn_actor(date) from public, anon;
grant execute on function public.receiving_grn_actor(date) to authenticated;
revoke all on function public.receiving_actor_may_post(uuid, date) from public, anon;
grant execute on function public.receiving_actor_may_post(uuid, date) to authenticated;
revoke all on function public.save_receiving_session(uuid, integer, jsonb) from public, anon;
grant execute on function public.save_receiving_session(uuid, integer, jsonb) to authenticated;
revoke all on function public.submit_receiving_session(uuid, integer) from public, anon;
grant execute on function public.submit_receiving_session(uuid, integer) to authenticated;
revoke all on function public.save_and_submit_receiving_session(uuid, integer, jsonb) from public, anon;
grant execute on function public.save_and_submit_receiving_session(uuid, integer, jsonb) to authenticated;
revoke all on function public.warehouse_my_receipts(integer, timestamptz, uuid, text) from public, anon;
grant execute on function public.warehouse_my_receipts(integer, timestamptz, uuid, text) to authenticated;
revoke all on function public.return_receiving_session(uuid, integer, text) from public, anon;
grant execute on function public.return_receiving_session(uuid, integer, text) to authenticated;
revoke all on function public.post_receiving_session(uuid, integer) from public, anon;
grant execute on function public.post_receiving_session(uuid, integer) to authenticated;
revoke all on function public.warehouse_receipt_check_in(uuid) from public, anon;
revoke all on function public.office_receive_post(text, text, text, text, jsonb, date) from public, anon;
revoke all on function public.operation_receive_po_with_do(text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.office_receive_post(text,text,text,text,jsonb,date) from public, anon, authenticated;
revoke all on function public.warehouse_submit_receipt(text,text,text,text,jsonb,date) from public, anon, authenticated;
revoke all on function public.warehouse_resubmit_receipt(uuid,text,text,text,jsonb,date) from public, anon, authenticated;
revoke all on function public.warehouse_receipt_check_in(uuid) from public, anon, authenticated;
revoke all on function public.warehouse_receipt_return(uuid,text) from public, anon, authenticated;

-- 11 · Apply-time sanity. These guards execute in the same transaction; a bad
-- authority shape rolls back the entire migration and allocates no number.
do $$
declare v_count integer;
begin
  select count(*) into v_count
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'post_receiving_session';
  if v_count <> 1 then raise exception '0407: exactly one post_receiving_session is required'; end if;
  if has_function_privilege('anon', 'public.post_receiving_session(uuid,integer)', 'execute') then
    raise exception '0407: anon may not post a GRN';
  end if;
  if has_function_privilege('authenticated', 'public.allocate_grn_number(date)', 'execute') then
    raise exception '0407: clients may not allocate GRN numbers';
  end if;
  if has_function_privilege('authenticated', 'public.operation_receive_po_with_do(text,text,text,jsonb)', 'execute') then
    raise exception '0407: retired operation receive writer remains executable';
  end if;
  if has_function_privilege('authenticated', 'public.office_receive_post(text,text,text,text,jsonb,date)', 'execute') then
    raise exception '0407: retired office receive writer remains executable';
  end if;
  if has_function_privilege('authenticated', 'public.warehouse_submit_receipt(text,text,text,text,jsonb,date)', 'execute') then
    raise exception '0407: retired warehouse submit writer remains executable';
  end if;
  if has_function_privilege('authenticated', 'public.warehouse_resubmit_receipt(uuid,text,text,text,jsonb,date)', 'execute') then
    raise exception '0407: retired warehouse resubmit writer remains executable';
  end if;
  if has_function_privilege('authenticated', 'public.warehouse_receipt_check_in(uuid)', 'execute') then
    raise exception '0407: retired warehouse check-in writer remains executable';
  end if;
  if has_function_privilege('authenticated', 'public.warehouse_receipt_return(uuid,text)', 'execute') then
    raise exception '0407: retired warehouse return writer remains executable';
  end if;
  if (select count(*) from pg_indexes
       where schemaname = 'public' and indexname = 'warehouse_receipts_grn_number_uq') <> 1 then
    raise exception '0407: stored GRN identity must be unique';
  end if;
  if (select count(*) from pg_policies
       where schemaname = 'public' and tablename = 'receiving_session_unit_outcomes'
         and cmd <> 'SELECT') <> 0 then
    raise exception '0407: Unit outcomes are RPC-write only';
  end if;
end;
$$;

commit;

-- GOVERNED APPLY VERIFICATION (not executed by this repository change):
-- 1. ordinary Operations refusal; normal GRN Duty; dated cover; Superuser actor
-- 2. draft/submitted carry no number; missing evidence and wrong Unit refuse
-- 3. one successful post stores GRN-YYYYMMDD-RRRR and exact Unit outcomes
-- 4. retry returns the same number; duplicate Supplier DO names the earlier GRN
-- 5. damaged/wrong/extra do not reduce Pending Delivery or enter available Stock

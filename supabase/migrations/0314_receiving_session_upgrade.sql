-- =====================================================================
-- 0314_receiving_session_upgrade
-- The Receiving Session Information Model (docs/RECEIVING-INFORMATION-MODEL.md)
-- becomes structure. Approved by Jess 2026-08-02 after a 24-assertion
-- dry-run on prod (rolled back; negative control proven).
-- Her frozen conditions, all honoured here: resubmitted is a first-class
-- event · submit/resubmit are separate doors · no photos[] jsonb (a real
-- receiving_photos table comes later) · reviewed_* KEPT and compat-written
-- (the drop is its own later migration, after every reader moves to
-- posted_*) · payload keys come from the Event Payload Dictionary (§6.1).
-- 0 live receipts measured before apply, so nothing to backfill.
-- =====================================================================

-- §1 · Session new columns ---------------------------------------------------
alter table warehouse_receipts
  add column submitted_from    text not null default 'warehouse'
             check (submitted_from in ('office','warehouse')),
  add column goods_received_at date not null
             default ((now() at time zone 'Asia/Kuala_Lumpur')::date),
  add column posted_at   timestamptz,
  add column posted_by   uuid references app_users(id) on delete set null,
  add column void_at     timestamptz,
  add column void_by     uuid references app_users(id) on delete set null,
  add column void_reason text;

-- §2 · five status words · default draft · DO may be absent on a Draft -------
alter table warehouse_receipts drop constraint warehouse_receipts_status_check;
alter table warehouse_receipts drop constraint warehouse_receipts_reviewed_stamp;
alter table warehouse_receipts drop constraint warehouse_receipts_do_number_check;
alter table warehouse_receipts drop constraint warehouse_receipts_do_file_path_check;
update warehouse_receipts set status = 'posted' where status = 'checked_in';

alter table warehouse_receipts
  alter column status set default 'draft',
  alter column do_number    drop not null,
  alter column do_file_path drop not null;

alter table warehouse_receipts
  add constraint warehouse_receipts_status_check
      check (status in ('draft','submitted','returned','posted','voided')),
  add constraint wr_do_number_shape
      check (do_number is null or length(btrim(do_number)) >= 3),
  add constraint wr_do_required_past_draft
      check (status in ('draft','voided')
             or (nullif(btrim(coalesce(do_number,'')),'') is not null
                 and nullif(btrim(coalesce(do_file_path,'')),'') is not null)),
  add constraint wr_posted_stamp
      check (status <> 'posted' or posted_at is not null),
  add constraint wr_void_stamp
      check (status <> 'voided'
             or (void_at is not null
                 and length(btrim(coalesce(void_reason,''))) > 0)),
  add constraint wr_return_reason
      check (status <> 'returned'
             or length(btrim(coalesce(return_reason,''))) > 0);

-- §3 · ONE live session per Supplier+PO+DO (Draft-without-DO and Voided step aside)
create unique index wr_one_live_session_per_po_do
  on warehouse_receipts (po_id, lower(btrim(do_number)))
  where status <> 'voided'
    and nullif(btrim(do_number), '') is not null;

-- §4 · receiving_events — the ONE history (append-only) ----------------------
create table receiving_events (
  id         uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references warehouse_receipts(id) on delete restrict,
  event      text not null check (event in
             ('submitted','returned','resubmitted','posted','voided','amended')),
  actor_id   uuid references app_users(id) on delete set null,
  event_at   timestamptz not null default now(),
  payload    jsonb not null default '{}'::jsonb
);
comment on table receiving_events is
  '0314: the ONE history of a Receiving Session. Append-only — RESTRICT on the FK so deleting a Session can never take its audit trail with it. Writes happen only inside the receiving RPCs, in the same transaction as the status change. Payload keys come from the Event Payload Dictionary (RECEIVING-INFORMATION-MODEL §6.1). Activity reads this and nothing else.';
alter table receiving_events enable row level security;
create policy receiving_events_internal_read on receiving_events
  for select using ((select public.is_internal()));
revoke insert, update, delete on receiving_events from authenticated, anon;

-- §5 · the Session itself: writes are RPC-only, deletion closed to app roles -
revoke insert, update, delete on warehouse_receipts from authenticated, anon;

-- §6 · the shared validation — ONE copy of the counting/evidence law ---------
create function public.warehouse_receipt_validate_lines(
  p_po_id text,
  p_lines jsonb,
  p_uid   uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_line jsonb; v_line_id uuid; v_recv int; v_damaged int; v_wrong int;
  v_type text; v_pol purchase_order_lines; v_reportable int;
  v_counted int := 0; v_clean jsonb := '[]'::jsonb;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'p_lines required (at least one line)'
      using errcode = '22023', detail = 'invalid_input';
  end if;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_line_id := nullif(v_line->>'id', '')::uuid;
    v_recv    := coalesce(nullif(v_line->>'received_now', '')::int, 0);
    v_damaged := coalesce(nullif(v_line->>'damaged_qty', '')::int, 0);
    v_wrong   := coalesce(nullif(v_line->>'wrong_item_qty', '')::int, 0);
    if v_line_id is null then
      raise exception 'invalid line: missing id' using errcode = '22023', detail = 'invalid_line';
    end if;
    if v_recv < 0 or v_damaged < 0 or v_wrong < 0 then
      raise exception 'invalid line: negative quantity' using errcode = '22023', detail = 'invalid_line';
    end if;
    select * into v_pol from purchase_order_lines where id = v_line_id and po_id = p_po_id;
    if not found then
      raise exception 'PO line not found for id=%', v_line_id using errcode = '42P01', detail = 'po_line_not_found';
    end if;
    v_reportable := greatest(0, v_pol.qty - least(v_pol.qty, v_pol.received_qty));
    if v_recv + v_damaged + v_wrong > v_reportable then
      raise exception 'line % counts % units but the PO still owes %',
                      v_pol.sku, v_recv + v_damaged + v_wrong, v_reportable
        using errcode = 'P0001', detail = 'line_over_reported';
    end if;
    if v_damaged > 0 then
      if jsonb_array_length(public.supplier_claim_photo_entries(v_line->'damaged_photos', p_uid)) = 0 then
        raise exception 'damaged units on % need at least one photo', v_pol.sku
          using errcode = 'P0001', detail = 'damaged_photo_required';
      end if;
    end if;
    if v_wrong > 0 then
      v_type := nullif(btrim(coalesce(v_line->>'wrong_item_claim_type', '')), '');
      if v_type is null then
        raise exception 'wrong-item units on % need a claim type', v_pol.sku
          using errcode = 'P0001', detail = 'wrong_item_type_required';
      end if;
      if not public.supplier_claim_type_allowed(public.claim_product_category(v_pol.sku), v_type) then
        raise exception 'claim type % is not offered for %', v_type, v_pol.sku
          using errcode = 'P0001', detail = 'wrong_item_type_invalid';
      end if;
      if jsonb_array_length(public.supplier_claim_photo_entries(v_line->'wrong_item_photos', p_uid)) = 0 then
        raise exception 'wrong-item units on % need at least one photo', v_pol.sku
          using errcode = 'P0001', detail = 'wrong_item_photo_required';
      end if;
    end if;
    v_counted := v_counted + v_recv + v_damaged + v_wrong;
    if v_recv + v_damaged + v_wrong > 0 then
      v_clean := v_clean || jsonb_build_array(jsonb_build_object(
        'id', v_line_id, 'sku', v_pol.sku, 'received_now', v_recv,
        'damaged_qty', v_damaged, 'wrong_item_qty', v_wrong,
        'wrong_item_claim_type', case when v_wrong > 0 then v_type else null end,
        'damaged_photos', coalesce(v_line->'damaged_photos', '[]'::jsonb),
        'wrong_item_photos', coalesce(v_line->'wrong_item_photos', '[]'::jsonb)));
    end if;
  end loop;
  if v_counted = 0 then
    raise exception 'count at least one unit before sending this'
      using errcode = 'P0001', detail = 'nothing_counted';
  end if;
  return jsonb_build_object('lines', v_clean, 'counted', v_counted);
end;
$fn$;

-- §7 · warehouse_submit_receipt — signature grows p_goods_received_at.
drop function public.warehouse_submit_receipt(text, text, text, text, jsonb);
create function public.warehouse_submit_receipt(
  p_po_id             text,
  p_do_number         text,
  p_do_file_path      text,
  p_note              text,
  p_lines             jsonb,
  p_goods_received_at date default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_wh_id uuid; v_uid uuid; v_po purchase_orders; v_valid jsonb;
  v_receipt_id uuid; v_grn_date date;
  v_today_myt date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_prior warehouse_receipts;
begin
  v_uid := auth.uid();
  if public.app_role() <> 'warehouse' then
    raise exception 'forbidden: warehouse role required' using errcode = '42501', detail = 'forbidden';
  end if;
  v_wh_id := public.app_warehouse_id();
  if v_wh_id is null then
    raise exception 'this login is not bound to a warehouse' using errcode = '42501', detail = 'no_warehouse';
  end if;
  if length(btrim(coalesce(p_do_number, ''))) < 3 then
    raise exception 'a DO number is required' using errcode = '22023', detail = 'do_number_required';
  end if;
  if length(btrim(coalesce(p_do_file_path, ''))) = 0 then
    raise exception 'a photo of the signed DO is required' using errcode = '22023', detail = 'do_file_required';
  end if;
  v_grn_date := coalesce(p_goods_received_at, v_today_myt);
  if v_grn_date > v_today_myt then
    raise exception 'Goods Received At cannot be in the future'
      using errcode = '22023', detail = 'received_date_future';
  end if;
  select * into v_po from purchase_orders where id = p_po_id and warehouse_id = v_wh_id for update;
  if not found then
    raise exception 'PO not found for this warehouse'
      using errcode = '42501', detail = 'po_not_found_or_cross_tenant';
  end if;
  if v_po.status <> 'open' then
    raise exception 'PO % is no longer open', p_po_id using errcode = '22023', detail = 'po_not_open';
  end if;
  if v_grn_date < (v_po.placed_at at time zone 'Asia/Kuala_Lumpur')::date then
    raise exception 'Goods Received At cannot be before the PO date (%)',
                    to_char((v_po.placed_at at time zone 'Asia/Kuala_Lumpur')::date, 'DD Mon YY')
      using errcode = '22023', detail = 'received_date_before_po';
  end if;
  if exists (select 1 from warehouse_receipts where po_id = p_po_id and status = 'submitted') then
    raise exception 'a receiving for % is already waiting for Carres', p_po_id
      using errcode = 'P0001', detail = 'receipt_already_open';
  end if;
  select * into v_prior from warehouse_receipts
   where po_id = p_po_id and lower(btrim(do_number)) = lower(btrim(p_do_number))
     and status <> 'voided';
  if found then
    if v_prior.status = 'returned' then
      raise exception 'DO % was returned — reopen and resubmit that receiving, do not file a new one',
                      btrim(p_do_number)
        using errcode = 'P0001', detail = 'do_returned_use_resubmit';
    else
      raise exception 'DO % was already received on % (session %)',
                      btrim(p_do_number), to_char(v_prior.goods_received_at, 'DD Mon YY'), v_prior.id
        using errcode = 'P0001', detail = 'do_already_received';
    end if;
  end if;
  v_valid := public.warehouse_receipt_validate_lines(p_po_id, p_lines, v_uid);
  insert into warehouse_receipts (
    po_id, warehouse_id, do_number, do_file_path, note, lines,
    goods_received_at, submitted_from, status, submitted_by
  ) values (
    p_po_id, v_wh_id, btrim(p_do_number), btrim(p_do_file_path),
    nullif(btrim(coalesce(p_note, '')), ''), v_valid->'lines',
    v_grn_date, 'warehouse', 'submitted', v_uid
  ) returning id into v_receipt_id;
  insert into receiving_events (receipt_id, event, actor_id, payload)
  values (v_receipt_id, 'submitted', v_uid,
          jsonb_build_object('do_number', btrim(p_do_number),
                             'goods_received_at', v_grn_date,
                             'units_counted', (v_valid->>'counted')::int));
  insert into po_history (po_id, text, by_role, by_user_id)
  values (p_po_id,
          format('%s filed a receiving with DO %s — waiting Carres check',
                 coalesce((select name from warehouses where id = v_wh_id), 'The warehouse'),
                 btrim(p_do_number)),
          'warehouse', v_uid);
  return jsonb_build_object('id', v_receipt_id, 'po_id', p_po_id, 'status', 'submitted');
end;
$fn$;

-- §8 · warehouse_resubmit_receipt — the RETURNED session's own door.
create function public.warehouse_resubmit_receipt(
  p_receipt_id        uuid,
  p_do_number         text,
  p_do_file_path      text,
  p_note              text,
  p_lines             jsonb,
  p_goods_received_at date default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_wh_id uuid; v_uid uuid; v_receipt warehouse_receipts; v_po purchase_orders;
  v_valid jsonb; v_grn_date date;
  v_today_myt date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_clash warehouse_receipts;
begin
  v_uid := auth.uid();
  if public.app_role() <> 'warehouse' then
    raise exception 'forbidden: warehouse role required' using errcode = '42501', detail = 'forbidden';
  end if;
  v_wh_id := public.app_warehouse_id();
  if v_wh_id is null then
    raise exception 'this login is not bound to a warehouse' using errcode = '42501', detail = 'no_warehouse';
  end if;
  select * into v_receipt from warehouse_receipts
   where id = p_receipt_id and warehouse_id = v_wh_id for update;
  if not found then
    raise exception 'receipt not found for this warehouse' using errcode = '42P01', detail = 'receipt_not_found';
  end if;
  if v_receipt.status <> 'returned' then
    raise exception 'only a returned receiving can be resubmitted (this one is %)', v_receipt.status
      using errcode = '22023', detail = 'receipt_not_returned';
  end if;
  if length(btrim(coalesce(p_do_number, ''))) < 3 then
    raise exception 'a DO number is required' using errcode = '22023', detail = 'do_number_required';
  end if;
  if length(btrim(coalesce(p_do_file_path, ''))) = 0 then
    raise exception 'a photo of the signed DO is required' using errcode = '22023', detail = 'do_file_required';
  end if;
  v_grn_date := coalesce(p_goods_received_at, v_today_myt);
  if v_grn_date > v_today_myt then
    raise exception 'Goods Received At cannot be in the future'
      using errcode = '22023', detail = 'received_date_future';
  end if;
  select * into v_po from purchase_orders where id = v_receipt.po_id for update;
  if v_po.status <> 'open' then
    raise exception 'PO % is no longer open', v_receipt.po_id using errcode = '22023', detail = 'po_not_open';
  end if;
  if v_grn_date < (v_po.placed_at at time zone 'Asia/Kuala_Lumpur')::date then
    raise exception 'Goods Received At cannot be before the PO date (%)',
                    to_char((v_po.placed_at at time zone 'Asia/Kuala_Lumpur')::date, 'DD Mon YY')
      using errcode = '22023', detail = 'received_date_before_po';
  end if;
  select * into v_clash from warehouse_receipts
   where po_id = v_receipt.po_id and lower(btrim(do_number)) = lower(btrim(p_do_number))
     and id <> v_receipt.id and status <> 'voided';
  if found then
    raise exception 'DO % already belongs to another receiving (session %)',
                    btrim(p_do_number), v_clash.id
      using errcode = 'P0001', detail = 'do_already_received';
  end if;
  v_valid := public.warehouse_receipt_validate_lines(v_receipt.po_id, p_lines, v_uid);
  update warehouse_receipts
     set status = 'submitted', do_number = btrim(p_do_number),
         do_file_path = btrim(p_do_file_path),
         note = nullif(btrim(coalesce(p_note, '')), ''),
         lines = v_valid->'lines', goods_received_at = v_grn_date,
         submitted_by = v_uid, submitted_at = now(), updated_at = now()
   where id = p_receipt_id;
  insert into receiving_events (receipt_id, event, actor_id, payload)
  values (p_receipt_id, 'resubmitted', v_uid,
          jsonb_build_object('do_number', btrim(p_do_number),
                             'goods_received_at', v_grn_date,
                             'units_counted', (v_valid->>'counted')::int));
  insert into po_history (po_id, text, by_role, by_user_id)
  values (v_receipt.po_id,
          format('%s resubmitted the receiving with DO %s — waiting Carres check',
                 coalesce((select name from warehouses where id = v_wh_id), 'The warehouse'),
                 btrim(p_do_number)),
          'warehouse', v_uid);
  return jsonb_build_object('id', p_receipt_id, 'po_id', v_receipt.po_id, 'status', 'submitted');
end;
$fn$;

-- §9 · warehouse_receipt_check_in — the word is 'posted'; stamps posted_*;
-- reviewed_* is COMPAT-WRITTEN (Jess 2026-08-02: keep the old pair until the
-- reader-rename slice drops it).
create or replace function public.warehouse_receipt_check_in(p_receipt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_receipt warehouse_receipts; v_uid uuid; v_line jsonb;
  v_pol purchase_order_lines; v_payload jsonb := '[]'::jsonb;
  v_before uuid[]; v_result jsonb; v_linked int;
begin
  v_uid := auth.uid();
  if not public.is_operation() then
    raise exception 'forbidden: operation or principal required' using errcode = '42501', detail = 'forbidden';
  end if;
  select * into v_receipt from warehouse_receipts where id = p_receipt_id for update;
  if not found then
    raise exception 'receipt not found' using errcode = '42P01', detail = 'receipt_not_found';
  end if;
  if v_receipt.status <> 'submitted' then
    raise exception 'this receiving has already been reviewed' using errcode = '22023', detail = 'receipt_not_open';
  end if;
  for v_line in select * from jsonb_array_elements(v_receipt.lines) loop
    select * into v_pol from purchase_order_lines
     where id = (v_line->>'id')::uuid and po_id = v_receipt.po_id;
    if not found then
      raise exception 'PO line % is gone — send this receiving back and ask for a fresh count', v_line->>'sku'
        using errcode = 'P0001', detail = 'po_line_not_found';
    end if;
    v_payload := v_payload || jsonb_build_array(jsonb_build_object(
      'id', v_line->>'id',
      'received_qty', v_pol.received_qty + coalesce((v_line->>'received_now')::int, 0),
      'damaged_qty', coalesce((v_line->>'damaged_qty')::int, 0),
      'wrong_item_qty', coalesce((v_line->>'wrong_item_qty')::int, 0),
      'wrong_item_claim_type', v_line->>'wrong_item_claim_type',
      'damaged_photos', coalesce(v_line->'damaged_photos', '[]'::jsonb),
      'wrong_item_photos', coalesce(v_line->'wrong_item_photos', '[]'::jsonb)));
  end loop;
  select coalesce(array_agg(id), '{}'::uuid[]) into v_before
    from supplier_claims where po_id = v_receipt.po_id;
  v_result := public.operation_receive_po_with_do(
    v_receipt.po_id, v_receipt.do_file_path, v_receipt.do_number, v_payload);
  update supplier_claims
     set warehouse_receipt_id = v_receipt.id
   where po_id = v_receipt.po_id and not (id = any(v_before)) and warehouse_receipt_id is null;
  get diagnostics v_linked = row_count;
  update warehouse_receipts
     set status = 'posted', posted_by = v_uid, posted_at = now(),
         reviewed_by = v_uid, reviewed_at = now(), updated_at = now()
   where id = p_receipt_id;
  insert into receiving_events (receipt_id, event, actor_id, payload)
  values (p_receipt_id, 'posted', v_uid,
          jsonb_build_object('do_number', v_receipt.do_number, 'claims_linked', v_linked));
  insert into audit_log (role, actor_text, action, ref)
  values (public.app_role(),
          coalesce((select name from app_users where id = v_uid), 'Operations'),
          format('Checked in %s from %s (DO %s)', v_receipt.po_id,
                 coalesce((select name from warehouses where id = v_receipt.warehouse_id), 'the warehouse'),
                 v_receipt.do_number),
          v_receipt.po_id);
  return jsonb_build_object('receipt_id', p_receipt_id, 'po_id', v_receipt.po_id,
                            'status', 'posted', 'claims_linked', v_linked, 'receive', v_result);
end;
$fn$;

-- §10 · warehouse_receipt_return — unchanged logic + the event (compat writes kept).
create or replace function public.warehouse_receipt_return(p_receipt_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_receipt warehouse_receipts; v_uid uuid;
begin
  v_uid := auth.uid();
  if not public.is_operation() then
    raise exception 'forbidden: operation or principal required' using errcode = '42501', detail = 'forbidden';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'say what the warehouse must fix' using errcode = '22023', detail = 'reason_required';
  end if;
  select * into v_receipt from warehouse_receipts where id = p_receipt_id for update;
  if not found then
    raise exception 'receipt not found' using errcode = '42P01', detail = 'receipt_not_found';
  end if;
  if v_receipt.status <> 'submitted' then
    raise exception 'this receiving has already been reviewed' using errcode = '22023', detail = 'receipt_not_open';
  end if;
  update warehouse_receipts
     set status = 'returned', return_reason = btrim(p_reason),
         reviewed_by = v_uid, reviewed_at = now(), updated_at = now()
   where id = p_receipt_id;
  insert into receiving_events (receipt_id, event, actor_id, payload)
  values (p_receipt_id, 'returned', v_uid, jsonb_build_object('reason', btrim(p_reason)));
  insert into po_history (po_id, text, by_role, by_user_id)
  values (v_receipt.po_id,
          format('Receiving with DO %s sent back to %s — %s', v_receipt.do_number,
                 coalesce((select name from warehouses where id = v_receipt.warehouse_id), 'the warehouse'),
                 btrim(p_reason)),
          public.app_role(), v_uid);
  return jsonb_build_object('receipt_id', p_receipt_id, 'status', 'returned');
end;
$fn$;

-- §11 · grants (the 0268 lesson: public AND anon, then the explicit grant back)
revoke execute on function public.warehouse_receipt_validate_lines(text, jsonb, uuid) from public, anon, authenticated;
revoke execute on function public.warehouse_submit_receipt(text, text, text, text, jsonb, date) from public, anon;
grant  execute on function public.warehouse_submit_receipt(text, text, text, text, jsonb, date) to authenticated;
revoke execute on function public.warehouse_resubmit_receipt(uuid, text, text, text, jsonb, date) from public, anon;
grant  execute on function public.warehouse_resubmit_receipt(uuid, text, text, text, jsonb, date) to authenticated;

-- §12 · sanity ---------------------------------------------------------------
do $$
declare v int;
begin
  select count(*) into v from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'warehouse_submit_receipt';
  if v <> 1 then raise exception 'sanity: % copies of warehouse_submit_receipt', v; end if;
  select count(*) into v from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'warehouse_resubmit_receipt';
  if v <> 1 then raise exception 'sanity: % copies of warehouse_resubmit_receipt', v; end if;
  if has_function_privilege('authenticated',
       'public.warehouse_receipt_validate_lines(text, jsonb, uuid)', 'execute') then
    raise exception 'sanity: validate_lines must not be callable by authenticated';
  end if;
  select count(*) into v from pg_policies
   where schemaname = 'public' and tablename = 'receiving_events';
  if v <> 1 then raise exception 'sanity: receiving_events must have exactly 1 policy'; end if;
  select count(*) into v from pg_constraint
   where conrelid = 'receiving_events'::regclass and contype = 'f' and confdeltype = 'r';
  if v <> 1 then raise exception 'sanity: receiving_events FK must be RESTRICT'; end if;
  if (select column_default from information_schema.columns
       where table_name = 'warehouse_receipts' and column_name = 'status') not like '%draft%' then
    raise exception 'sanity: status default must be draft';
  end if;
  select count(*) into v from information_schema.columns
   where table_name = 'warehouse_receipts' and column_name in ('reviewed_by','reviewed_at');
  if v <> 2 then raise exception 'sanity: reviewed_* must survive'; end if;
end $$;

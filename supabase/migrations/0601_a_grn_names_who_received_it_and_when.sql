-- =============================================================================
-- 0601_a_grn_names_who_received_it_and_when.sql
-- Purchasing MASTER §7.3 + §9.4 · RECEIVING CLOSURE (owner rulings
-- 2026-09-17, 2026-09-25 and 2026-09-28, Jess).
--
-- WHAT WAS WRONG (read from pg_proc on production 2026-09-28; every body below
-- starts from that exact definition, equal to the repository chain):
--
--   A  `Goods Received Date` was a DATE column (0314). The arrival clock was
--      never stored, so every GRN printed `Time not recorded`.
--   B  The GRN named no receiver. Only the posting-evidence trio existed.
--   C  `receiving_require_post_authority()` (0426) still refused everyone but
--      GRN Duty, its dated cover and an Operations Superuser
--      (`no_grn_duty_holder` / `not_grn_duty`), although the owner ruled on
--      2026-09-25 that every active Operation staff member may post.
--   D  `receiving_amend` (0560 body) PICKED the Units itself: an under-count
--      freed the oldest incoming Unit of the line, an over-count sent back
--      the newest received one. It checked no DO, reservation, delivery or
--      Supplier Claim per Unit, and two people could both save an amendment
--      from the same starting record.
--
-- WHAT THIS FILE DOES
--
--   1  `warehouse_receipts` gains `goods_received_time` (timestamptz), the
--      receiver facts (`received_by_kind` · `_party_id` · `_user_id` ·
--      `_name`) and `revision`. The old `goods_received_at` DATE stays and is
--      kept in step (the KL date of the time). OLD ROWS ARE NOT BACKFILLED:
--      their time stays null and prints `Time not recorded`; their receiver
--      stays null (never guessed from the saver).
--   2  `receiving_receiver_of(site, saver)` — the ONE rule for who received:
--      a Site whose governed operating party (Warehouse Settings `Operated
--      by`, `warehouse_site_profiles.operating_party_id`) is an outside
--      company (not the Carres party, not a showroom) → that company; else
--      the Carres staff member who saved.
--      `receiving_receiver_preview(site)` answers the same rule for the
--      signed-in saver, so the form shows it before saving.
--   3  One BEFORE trigger stamps the receiver and the posting authority on
--      the moment a session becomes `posted`, whichever door posts it
--      (office, check-in, arrival source). Five copied door bodies would
--      drift; one trigger cannot.
--   4  Posting authority: every active Operation staff member (and the
--      principal) may post. `receiving_actor_context().allowed` now answers
--      exactly that; the duty trio is still returned and stored as evidence.
--      `posted_authority` gains `operation_staff`. The Warehouse role stays
--      refused (it is not Operation).
--   5  `office_receive_post` and `warehouse_submit_receipt` take
--      `p_goods_received_time`. Omitted → now. Never in the future, never
--      before the PO date. (Signature change: the old overloads are dropped
--      and recreated with the same grants — one door per name.)
--   6  `receiving_amend` names exact Units in both directions
--      (`Received` ↔ `Not received`); the system never picks one. Each
--      affected Unit that is reserved, on a live DO, delivered or on a
--      Supplier Claim refuses BY NAME. A change of `Goods arrived at` moves
--      this GRN's arrived Units and refuses the same way. The save carries
--      the revision it started from; an older one is refused whole with
--      `Someone changed this GRN. Check it again.` Quantity lines keep
--      quantity edits.
--
-- NO RLS CHANGE. NO VIEW TOUCHED. NO ROW COUNT ASSERTED (CLAUDE.md §5.8).
-- =============================================================================

begin;
set search_path = public, pg_temp;

-- ───────────────────────────────────────────────────────────────────────────
-- 1 · the columns
-- ───────────────────────────────────────────────────────────────────────────
alter table public.warehouse_receipts
  add column if not exists goods_received_time timestamptz,
  add column if not exists received_by_kind text,
  add column if not exists received_by_party_id uuid references public.stock_operating_parties(id),
  add column if not exists received_by_user_id uuid references public.app_users(id),
  add column if not exists received_by_name text,
  add column if not exists revision integer not null default 0;

do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'wr_received_by_kind_valid') then
    alter table public.warehouse_receipts
      add constraint wr_received_by_kind_valid check (
        received_by_kind is null
        or (received_by_kind = 'company' and received_by_party_id is not null)
        or (received_by_kind = 'staff' and received_by_user_id is not null));
  end if;
end
$c$;

alter table public.warehouse_receipts
  drop constraint if exists warehouse_receipts_posted_authority_check;
alter table public.warehouse_receipts
  add constraint warehouse_receipts_posted_authority_check check (
    posted_authority is null
    or posted_authority = any (array['grn_duty','cover','superuser','operation_staff']));

comment on column public.warehouse_receipts.goods_received_time is
  '0601 — Goods Received Date as a time point (physical arrival). Null on a record saved before 0601: it prints `Time not recorded` and is never back-filled.';
comment on column public.warehouse_receipts.received_by_kind is
  '0601 — `company` (a partner-run Site: the operating company) or `staff` (a Carres-run Site: the Carres staff member who saved). Null before 0601.';
comment on column public.warehouse_receipts.revision is
  '0601 — bumped by every saved amendment. An amendment based on an older revision is refused whole.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2 · who received — ONE rule
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.receiving_receiver_of(p_site_id uuid, p_saver uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_party stock_operating_parties;
  v_user app_users;
begin
  select sp.* into v_party
    from warehouse_site_profiles p
    join stock_operating_parties sp on sp.id = p.operating_party_id
   where p.site_id = p_site_id;
  if found
     and v_party.kind in ('warehouse_operator', 'partner')
     and v_party.code <> 'carres_warehouse' then
    -- A partner-run Site: the operating company received. Its PIC changes, so
    -- no person is asked or recorded; the signed Supplier DO is the proof.
    return jsonb_build_object('kind', 'company', 'party_id', v_party.id,
                              'user_id', null, 'name', v_party.name);
  end if;
  -- A Carres-run Site (or a Site with no outside operator): the Carres staff
  -- member who saved. A shared login is not a person — no name is invented.
  select * into v_user from app_users where id = p_saver;
  if not found then
    return null;
  end if;
  return jsonb_build_object('kind', 'staff', 'party_id', null, 'user_id', v_user.id,
                            'name', case when v_user.is_person then v_user.name else null end);
end;
$function$;

revoke execute on function public.receiving_receiver_of(uuid, uuid) from public, anon;

comment on function public.receiving_receiver_of(uuid, uuid) is
  '0601 — the GRN receiver: the Site''s outside operating company (Warehouse Settings `Operated by`), else the saving Carres staff member (name only when the account is a person).';

-- The receiving form shows the receiver BEFORE saving, as a grey automatic
-- fact: the same rule, asked for the signed-in saver. Operation only.
create or replace function public.receiving_receiver_preview(p_site_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not public.is_operation() then
    raise exception 'Only Operation staff may save a receiving.'
      using errcode = '42501', detail = 'not_operation_staff';
  end if;
  return public.receiving_receiver_of(p_site_id, auth.uid());
end;
$function$;

revoke execute on function public.receiving_receiver_preview(uuid) from public, anon;
grant execute on function public.receiving_receiver_preview(uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 3 · the posting authority label — derived from WHO saved
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.receiving_posted_authority(p_saver uuid, p_holder uuid, p_cover uuid)
returns text
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select case
    when p_saver is null then null
    when p_cover is not null and p_saver = p_cover then 'cover'
    when p_holder is not null and p_saver = p_holder then 'grn_duty'
    when public.is_operations_superuser(p_saver) then 'superuser'
    else 'operation_staff' end;
$function$;

revoke execute on function public.receiving_posted_authority(uuid, uuid, uuid) from public, anon;

create or replace function public.warehouse_receipts_stamp_posting()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_receiver jsonb;
begin
  if new.status = 'posted' and (tg_op = 'INSERT' or old.status is distinct from 'posted') then
    new.posted_authority := public.receiving_posted_authority(
      new.posted_by, new.posted_duty_holder, new.posted_duty_cover);
    if new.received_by_kind is null then
      v_receiver := public.receiving_receiver_of(
        coalesce(new.actual_site_id, new.warehouse_id), new.posted_by);
      if v_receiver is not null then
        new.received_by_kind    := v_receiver->>'kind';
        new.received_by_party_id := nullif(v_receiver->>'party_id', '')::uuid;
        new.received_by_user_id := nullif(v_receiver->>'user_id', '')::uuid;
        new.received_by_name    := v_receiver->>'name';
      end if;
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists warehouse_receipts_stamp_posting on public.warehouse_receipts;
create trigger warehouse_receipts_stamp_posting
  before insert or update of status on public.warehouse_receipts
  for each row execute function public.warehouse_receipts_stamp_posting();

comment on function public.warehouse_receipts_stamp_posting() is
  '0601 — when a Receiving Session becomes posted (any door), stamp the receiver (receiving_receiver_of) and the posting authority (receiving_posted_authority). A receiver already recorded is never overwritten.';

-- ───────────────────────────────────────────────────────────────────────────
-- 4 · who may post — every active Operation staff member (owner 2026-09-25)
--     Starts from the 0425 / 0426 bodies read on production.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.receiving_actor_context()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_duty jsonb := public.workspace_resolve_duty('grn_duty', null);
  v_super boolean := public.is_operations_superuser(v_uid);
  v_staff boolean := public.is_operation();
begin
  -- GRN Duty still OWNS the Work card; the duty trio is returned as evidence.
  -- Posting is open to every active Operation staff member and the principal.
  return v_duty || jsonb_build_object(
    'uid', v_uid,
    'is_superuser', v_super,
    'is_operation_staff', v_staff,
    'allowed', v_uid is not null and v_staff);
end;
$function$;

create or replace function public.receiving_require_post_authority()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ctx jsonb := public.receiving_actor_context();
begin
  if not coalesce((v_ctx->>'allowed')::boolean, false) then
    raise exception 'Only Operation staff may save a receiving.'
      using errcode = '42501', detail = 'not_operation_staff';
  end if;
  return v_ctx;
end;
$function$;

-- ───────────────────────────────────────────────────────────────────────────
-- 5a · office direct receiving — starts from the 0560 body on production
-- ───────────────────────────────────────────────────────────────────────────
drop function if exists public.office_receive_post(text, text, text, text, jsonb, date, uuid, jsonb, jsonb, uuid);
drop function if exists public.office_receive_post(text, text, text, text, jsonb, date, uuid, jsonb, jsonb, uuid, timestamptz);

create function public.office_receive_post(
  p_po_id text, p_do_number text, p_do_file_path text, p_note text, p_lines jsonb,
  p_goods_received_at date default null, p_actual_site_id uuid default null,
  p_arrival_evidence jsonb default null, p_extra_lines jsonb default null,
  p_save_key uuid default null, p_goods_received_time timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid; v_po purchase_orders; v_valid jsonb; v_line jsonb;
  v_pol purchase_order_lines; v_payload jsonb := '[]'::jsonb;
  v_receipt_id uuid; v_grn_date date; v_counted int;
  v_today_myt date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_prior warehouse_receipts; v_before uuid[]; v_result jsonb; v_linked int;
  v_ctx jsonb; v_extras jsonb; v_grn text; v_units int;
  v_time timestamptz;
begin
  v_uid := auth.uid();

  -- The one authority (0601): every active Operation staff member. The duty
  -- trio is still stored as evidence, never collapsed.
  v_ctx := public.receiving_require_post_authority();

  if p_save_key is not null then
    select * into v_prior from warehouse_receipts where save_key = p_save_key;
    if found then
      return jsonb_build_object(
        'receipt_id', v_prior.id, 'po_id', v_prior.po_id,
        'status', v_prior.status, 'grn_no', v_prior.grn_no,
        'already_saved', true);
    end if;
  end if;

  if (length(btrim(coalesce(p_do_number, ''))) < 3 or coalesce(p_do_number, '') !~ '[^[:space:]]') then
    raise exception 'a DO number is required'
      using errcode = '22023', detail = 'do_number_required';
  end if;
  if coalesce(p_do_file_path, '') !~ '[^[:space:]]' then
    raise exception 'a photo of the signed DO is required'
      using errcode = '22023', detail = 'do_file_required';
  end if;

  -- 0601 · the arrival TIME. A stated time wins and decides the date; a
  -- date-only caller keeps a date with no clock; nothing stated = now.
  if p_goods_received_time is not null then
    if p_goods_received_time > now() + interval '2 minutes' then
      raise exception 'Goods Received Date cannot be in the future'
        using errcode = '22023', detail = 'received_date_future';
    end if;
    v_time := p_goods_received_time;
    v_grn_date := (p_goods_received_time at time zone 'Asia/Kuala_Lumpur')::date;
  elsif p_goods_received_at is not null then
    v_time := null;
    v_grn_date := p_goods_received_at;
  else
    v_time := now();
    v_grn_date := v_today_myt;
  end if;
  if v_grn_date > v_today_myt then
    raise exception 'Goods Received Date cannot be in the future'
      using errcode = '22023', detail = 'received_date_future';
  end if;

  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'PO % not found', p_po_id
      using errcode = '42P01', detail = 'po_not_found';
  end if;
  if v_po.status <> 'open' then
    raise exception 'PO % is no longer open', p_po_id
      using errcode = '22023', detail = 'po_not_open';
  end if;
  if v_grn_date < (v_po.placed_at at time zone 'Asia/Kuala_Lumpur')::date then
    raise exception 'Goods Received Date cannot be before the PO date (%)',
                    to_char((v_po.placed_at at time zone 'Asia/Kuala_Lumpur')::date, 'DD Mon YY')
      using errcode = '22023', detail = 'received_date_before_po';
  end if;
  if p_actual_site_id is not null and not exists (
    select 1 from warehouses where id = p_actual_site_id
  ) then
    raise exception 'actual site not found' using errcode = '22023', detail = 'actual_site_invalid';
  end if;

  select * into v_prior from warehouse_receipts
   where po_id = p_po_id and status = 'submitted' limit 1;
  if found then
    raise exception 'the warehouse already filed a receiving for % (DO %) — check that one in instead',
                    p_po_id, coalesce(v_prior.do_number, '—')
      using errcode = 'P0001', detail = 'receipt_awaiting_review';
  end if;

  select * into v_prior from warehouse_receipts
   where po_id = p_po_id
     and lower(btrim(do_number)) = lower(btrim(p_do_number))
     and status <> 'voided'
   limit 1;
  if found then
    if v_prior.status = 'returned' then
      raise exception 'DO % was returned to the warehouse — reopen that receiving, do not file a new one',
                      btrim(p_do_number)
        using errcode = 'P0001', detail = 'do_returned_use_resubmit';
    else
      raise exception 'DO % was already received on % (session %)',
                      btrim(p_do_number),
                      to_char(v_prior.goods_received_at, 'DD Mon YY'), v_prior.id
        using errcode = 'P0001', detail = 'do_already_received';
    end if;
  end if;

  v_valid   := public.warehouse_receipt_validate_lines(p_po_id, p_lines, v_uid);
  v_counted := (v_valid->>'counted')::int;
  v_extras  := public.receiving_validate_session_extras(p_arrival_evidence, p_extra_lines);

  for v_line in select * from jsonb_array_elements(v_valid->'lines') loop
    select * into v_pol from purchase_order_lines
     where id = (v_line->>'id')::uuid and po_id = p_po_id;
    if not found then
      raise exception 'PO line % is gone — reload the purchase order and count again',
                      v_line->>'sku'
        using errcode = 'P0001', detail = 'po_line_not_found';
    end if;
    v_payload := v_payload || jsonb_build_array(jsonb_build_object(
      'id', v_line->>'id',
      'received_qty', v_pol.received_qty + coalesce((v_line->>'received_now')::int, 0),
      'damaged_qty', coalesce((v_line->>'damaged_qty')::int, 0),
      'wrong_item_qty', coalesce((v_line->>'wrong_item_qty')::int, 0),
      'wrong_item_claim_type', v_line->>'wrong_item_claim_type',
      'damaged_photos', coalesce(v_line->'damaged_photos', '[]'::jsonb),
      'wrong_item_photos', coalesce(v_line->'wrong_item_photos', '[]'::jsonb),
      'units', coalesce(v_line->'units', '[]'::jsonb)));
  end loop;

  -- posted_authority and the receiver are stamped by the 0601 trigger.
  insert into warehouse_receipts (
    po_id, warehouse_id, do_number, do_file_path, note, lines,
    goods_received_at, goods_received_time, submitted_from, status,
    submitted_by, submitted_at, posted_by, posted_at,
    reviewed_by, reviewed_at,
    actual_site_id, save_key, arrival_evidence, extra_lines,
    posted_duty_holder, posted_duty_cover,
    po_status_before, sup_status_before
  ) values (
    p_po_id, v_po.warehouse_id, btrim(p_do_number), btrim(p_do_file_path),
    nullif(btrim(coalesce(p_note, '')), ''), v_valid->'lines',
    v_grn_date, v_time, 'office', 'posted',
    v_uid, now(), v_uid, now(),
    v_uid, now(),
    p_actual_site_id, p_save_key,
    v_extras->'arrival_evidence', v_extras->'extra_lines',
    nullif(v_ctx->>'normal_user_id','')::uuid,
    nullif(v_ctx->>'acting_user_id','')::uuid,
    v_po.status, v_po.sup_status::text
  ) returning id into v_receipt_id;

  select coalesce(array_agg(id), '{}'::uuid[]) into v_before
    from supplier_claims where po_id = p_po_id;

  v_result := public.operation_receive_po_with_do(
    p_po_id, btrim(p_do_file_path), btrim(p_do_number), v_payload, p_actual_site_id);

  update supplier_claims
     set warehouse_receipt_id = v_receipt_id
   where po_id = p_po_id and not (id = any(v_before))
     and warehouse_receipt_id is null;
  get diagnostics v_linked = row_count;

  v_grn := public.allocate_formal_document_code('GRN', v_receipt_id::text);
  update warehouse_receipts set grn_no = v_grn where id = v_receipt_id;

  v_units := public.receiving_record_unit_results(v_receipt_id, v_valid->'lines');

  insert into receiving_events (receipt_id, event, actor_id, payload)
  values (v_receipt_id, 'posted', v_uid,
          jsonb_build_object('do_number', btrim(p_do_number),
                             'goods_received_at', v_grn_date,
                             'goods_received_time', v_time,
                             'units_counted', v_counted,
                             'entry_source', 'office',
                             'claims_linked', v_linked,
                             'grn_no', v_grn,
                             'actual_site_id', p_actual_site_id,
                             'unit_results', v_units,
                             'extra_lines', jsonb_array_length(coalesce(v_extras->'extra_lines','[]'::jsonb)),
                             'normal_user_id', v_ctx->>'normal_user_id',
                             'acting_user_id', v_ctx->>'acting_user_id'));

  insert into po_history (po_id, text, by_role, by_user_id)
  values (p_po_id,
          format('Received %s unit%s against DO %s · %s',
                 v_counted, case when v_counted = 1 then '' else 's' end,
                 btrim(p_do_number), v_grn),
          public.app_role(), v_uid);

  insert into audit_log (role, actor_text, action, ref)
  values (public.app_role(),
          coalesce((select name from app_users where id = v_uid), 'Operations'),
          format('Checked in %s (DO %s, %s unit%s) · %s', p_po_id, btrim(p_do_number),
                 v_counted, case when v_counted = 1 then '' else 's' end, v_grn),
          p_po_id);

  return jsonb_build_object('receipt_id', v_receipt_id, 'po_id', p_po_id,
                            'status', 'posted', 'grn_no', v_grn,
                            'units_counted', v_counted,
                            'claims_linked', v_linked, 'receive', v_result);
end;
$function$;

revoke execute on function public.office_receive_post(text, text, text, text, jsonb, date, uuid, jsonb, jsonb, uuid, timestamptz) from public, anon;
grant execute on function public.office_receive_post(text, text, text, text, jsonb, date, uuid, jsonb, jsonb, uuid, timestamptz) to authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 5b · the Warehouse count submission — starts from the 0560 body
-- ───────────────────────────────────────────────────────────────────────────
drop function if exists public.warehouse_submit_receipt(text, text, text, text, jsonb, date, jsonb, jsonb);
drop function if exists public.warehouse_submit_receipt(text, text, text, text, jsonb, date, jsonb, jsonb, timestamptz);

create function public.warehouse_submit_receipt(
  p_po_id text, p_do_number text, p_do_file_path text, p_note text, p_lines jsonb,
  p_goods_received_at date default null, p_arrival_evidence jsonb default null,
  p_extra_lines jsonb default null, p_goods_received_time timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_wh_id uuid; v_uid uuid; v_po purchase_orders; v_valid jsonb;
  v_receipt_id uuid; v_grn_date date;
  v_today_myt date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_prior warehouse_receipts; v_extras jsonb;
  v_time timestamptz;
begin
  v_uid := auth.uid();
  if (public.app_role() is null or public.app_role() <> 'warehouse') then
    raise exception 'forbidden: warehouse role required' using errcode = '42501', detail = 'forbidden';
  end if;
  v_wh_id := public.app_warehouse_id();
  if v_wh_id is null then
    raise exception 'this login is not bound to a warehouse' using errcode = '42501', detail = 'no_warehouse';
  end if;
  if (length(btrim(coalesce(p_do_number, ''))) < 3 or coalesce(p_do_number, '') !~ '[^[:space:]]') then
    raise exception 'a DO number is required' using errcode = '22023', detail = 'do_number_required';
  end if;
  if coalesce(p_do_file_path, '') !~ '[^[:space:]]' then
    raise exception 'a photo of the signed DO is required' using errcode = '22023', detail = 'do_file_required';
  end if;
  -- 0601 · the arrival TIME is captured at the count (never at filing).
  if p_goods_received_time is not null then
    if p_goods_received_time > now() + interval '2 minutes' then
      raise exception 'Goods Received Date cannot be in the future'
        using errcode = '22023', detail = 'received_date_future';
    end if;
    v_time := p_goods_received_time;
    v_grn_date := (p_goods_received_time at time zone 'Asia/Kuala_Lumpur')::date;
  elsif p_goods_received_at is not null then
    v_time := null;
    v_grn_date := p_goods_received_at;
  else
    v_time := now();
    v_grn_date := v_today_myt;
  end if;
  if v_grn_date > v_today_myt then
    raise exception 'Goods Received Date cannot be in the future'
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
    raise exception 'Goods Received Date cannot be before the PO date (%)',
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
  v_valid  := public.warehouse_receipt_validate_lines(p_po_id, p_lines, v_uid);
  v_extras := public.receiving_validate_session_extras(p_arrival_evidence, p_extra_lines);
  insert into warehouse_receipts (
    po_id, warehouse_id, do_number, do_file_path, note, lines,
    goods_received_at, goods_received_time, submitted_from, status, submitted_by,
    arrival_evidence, extra_lines
  ) values (
    p_po_id, v_wh_id, btrim(p_do_number), btrim(p_do_file_path),
    nullif(btrim(coalesce(p_note, '')), ''), v_valid->'lines',
    v_grn_date, v_time, 'warehouse', 'submitted', v_uid,
    v_extras->'arrival_evidence', v_extras->'extra_lines'
  ) returning id into v_receipt_id;
  insert into receiving_events (receipt_id, event, actor_id, payload)
  values (v_receipt_id, 'submitted', v_uid,
          jsonb_build_object('do_number', btrim(p_do_number),
                             'goods_received_at', v_grn_date,
                             'goods_received_time', v_time,
                             'units_counted', (v_valid->>'counted')::int,
                             'arrival_evidence', jsonb_array_length(coalesce(v_extras->'arrival_evidence','[]'::jsonb)),
                             'extra_lines', jsonb_array_length(coalesce(v_extras->'extra_lines','[]'::jsonb))));
  insert into po_history (po_id, text, by_role, by_user_id)
  values (p_po_id,
          format('%s filed a receiving with DO %s — waiting Carres check',
                 coalesce((select name from warehouses where id = v_wh_id), 'The warehouse'),
                 btrim(p_do_number)),
          'warehouse', v_uid);
  return jsonb_build_object('id', v_receipt_id, 'po_id', p_po_id, 'status', 'submitted');
end;
$function$;

revoke execute on function public.warehouse_submit_receipt(text, text, text, text, jsonb, date, jsonb, jsonb, timestamptz) from public, anon;
grant execute on function public.warehouse_submit_receipt(text, text, text, text, jsonb, date, jsonb, jsonb, timestamptz) to authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 6 · Amend Receiving — starts from the 0560 body on production
-- ───────────────────────────────────────────────────────────────────────────

-- Why an exact Unit may not change: reserved · on a live DO · delivered · on a
-- Supplier Claim. Null = free to change. The words are COPY-STANDARD's.
create or replace function public.receiving_unit_lock_reason(p_item ops_stock_items)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_do text; v_claim text;
begin
  if p_item.status = 'sold' or p_item.sold_at is not null then
    return jsonb_build_object('reason', 'delivered', 'words', 'Delivered');
  end if;
  select d.do_number into v_do
    from delivery_order_units u
    join ops_delivery_orders d on d.id = u.delivery_order_id
   where u.item_id = p_item.id and d.voided_at is null
   order by d.do_number
   limit 1;
  if v_do is not null then
    return jsonb_build_object('reason', 'on_delivery_order', 'words', format('On %s', v_do));
  end if;
  if p_item.status = 'reserved' or p_item.reserved_ref is not null
     or p_item.reserved_order_line_id is not null
     or p_item.reserved_purchase_demand_id is not null then
    return jsonb_build_object('reason', 'reserved',
      'words', case when p_item.reserved_ref is not null
                    then format('Reserved for %s', p_item.reserved_ref) else 'Reserved' end);
  end if;
  if p_item.hold_claim_id is not null then
    select claim_no into v_claim from supplier_claims where id = p_item.hold_claim_id;
    return jsonb_build_object('reason', 'on_supplier_claim',
      'words', format('On %s', coalesce(v_claim, 'a Supplier Claim')));
  end if;
  return null;
end;
$function$;

revoke execute on function public.receiving_unit_lock_reason(ops_stock_items) from public, anon;

create or replace function public.receiving_amend(p_receipt_id uuid, p_reason text, p_changes jsonb, p_save_key uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_ctx jsonb;
  v_receipt warehouse_receipts;
  v_po purchase_orders;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_new_date date; v_new_do text; v_new_site uuid; v_new_time timestamptz;
  v_clash warehouse_receipts;
  v_lines jsonb; v_chg jsonb; v_stored jsonb; v_stored_lines jsonb;
  v_line_id uuid; v_old_recv int; v_new_recv int; v_d int;
  v_pol purchase_order_lines;
  v_posts_stock boolean; v_site uuid; v_old_site uuid;
  v_moved int; v_supplier_name text;
  v_today_myt date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_qty_changed boolean := false;
  v_outstanding int;
  v_prior_event receiving_events;
  v_new_do_file text;
  v_evidence_add jsonb;
  v_evidence_before int;
  v_rest int;
  v_bulk ops_stock_items;
  -- 0601
  v_based_on int;
  v_units jsonb;
  v_unit jsonb;
  v_item ops_stock_items;
  v_want text;
  v_have text;
  v_lock jsonb;
  v_locked jsonb := '[]'::jsonb;
  v_seen uuid[] := '{}'::uuid[];
  v_line_delta jsonb := '{}'::jsonb;
  v_unit_before jsonb := '[]'::jsonb;
  v_unit_after jsonb := '[]'::jsonb;
  v_receipt_line_ids uuid[];
  v_line_key text;
  v_receiver jsonb;
begin
  v_ctx := public.receiving_require_post_authority();
  if coalesce(p_reason, '') !~ '[^[:space:]]' then
    raise exception 'a correction reason is required'
      using errcode = '22023', detail = 'amend_reason_required';
  end if;

  -- Idempotency: the same amendment save key returns the recorded event.
  if p_save_key is not null then
    select * into v_prior_event from receiving_events
     where receipt_id = p_receipt_id and event = 'amended'
       and payload->>'save_key' = p_save_key::text
     limit 1;
    if found then
      return jsonb_build_object('receipt_id', p_receipt_id,
                                'status', 'posted', 'already_saved', true);
    end if;
  end if;

  select * into v_receipt from warehouse_receipts where id = p_receipt_id for update;
  if not found then
    raise exception 'receipt not found' using errcode = '42P01', detail = 'receipt_not_found';
  end if;
  if v_receipt.status <> 'posted' then
    raise exception 'only a posted receiving can be amended'
      using errcode = '22023', detail = 'receipt_not_posted';
  end if;

  -- 0601 · FIRST SAVE WINS. The amendment states the revision it was drawn
  -- from; anything older is refused whole, nothing partly saved.
  v_based_on := nullif(p_changes->>'based_on_revision', '')::int;
  if v_based_on is null then
    raise exception 'Someone changed this GRN. Check it again.'
      using errcode = '22023', detail = 'revision_required';
  end if;
  if v_based_on <> v_receipt.revision then
    raise exception 'Someone changed this GRN. Check it again.'
      using errcode = '40001', detail = 'receipt_changed';
  end if;

  select * into v_po from purchase_orders where id = v_receipt.po_id for update;

  v_old_site := coalesce(v_receipt.actual_site_id, v_po.warehouse_id);
  v_site := v_old_site;
  select (pd.warehouse_id is not null and pd.warehouse_id = v_po.warehouse_id)
    into v_posts_stock
    from purchasing_destinations pd
   where pd.id = v_po.destination_id;
  v_posts_stock := coalesce(v_posts_stock, false) or v_receipt.actual_site_id is not null;
  select name into v_supplier_name from suppliers where id = v_po.supplier_id;
  select coalesce(array_agg((t.val->>'id')::uuid), '{}'::uuid[]) into v_receipt_line_ids
    from jsonb_array_elements(coalesce(v_receipt.lines, '[]'::jsonb)) as t(val);

  -- ── header facts ─────────────────────────────────────────────────────────
  -- 0601 · the arrival TIME (a time point, shown in KL).
  if p_changes ? 'goods_received_time' then
    v_new_time := nullif(p_changes->>'goods_received_time', '')::timestamptz;
    if v_new_time is null or v_new_time > now() + interval '2 minutes' then
      raise exception 'Goods Received Date cannot be in the future'
        using errcode = '22023', detail = 'received_date_future';
    end if;
    v_new_date := (v_new_time at time zone 'Asia/Kuala_Lumpur')::date;
    if v_new_date < (v_po.placed_at at time zone 'Asia/Kuala_Lumpur')::date then
      raise exception 'Goods Received Date cannot be before the PO date (%)',
                      to_char((v_po.placed_at at time zone 'Asia/Kuala_Lumpur')::date, 'DD Mon YY')
        using errcode = '22023', detail = 'received_date_before_po';
    end if;
    if v_new_time is distinct from v_receipt.goods_received_time then
      v_before := v_before || jsonb_build_object(
        'goods_received_time', v_receipt.goods_received_time,
        'goods_received_at', v_receipt.goods_received_at);
      v_after  := v_after  || jsonb_build_object(
        'goods_received_time', v_new_time, 'goods_received_at', v_new_date);
      update warehouse_receipts
         set goods_received_time = v_new_time, goods_received_at = v_new_date,
             updated_at = now()
       where id = p_receipt_id;
    end if;
  elsif p_changes ? 'goods_received_at' then
    -- A date-only correction keeps no clock: the time it replaced is no
    -- longer known, so it is cleared rather than left to lie.
    v_new_date := nullif(p_changes->>'goods_received_at','')::date;
    if v_new_date is null or v_new_date > v_today_myt then
      raise exception 'Goods Received Date cannot be in the future'
        using errcode = '22023', detail = 'received_date_future';
    end if;
    if v_new_date < (v_po.placed_at at time zone 'Asia/Kuala_Lumpur')::date then
      raise exception 'Goods Received Date cannot be before the PO date (%)',
                      to_char((v_po.placed_at at time zone 'Asia/Kuala_Lumpur')::date, 'DD Mon YY')
        using errcode = '22023', detail = 'received_date_before_po';
    end if;
    if v_new_date is distinct from v_receipt.goods_received_at then
      v_before := v_before || jsonb_build_object('goods_received_at', v_receipt.goods_received_at);
      v_after  := v_after  || jsonb_build_object('goods_received_at', v_new_date);
      update warehouse_receipts
         set goods_received_at = v_new_date, goods_received_time = null, updated_at = now()
       where id = p_receipt_id;
    end if;
  end if;

  if p_changes ? 'do_number' then
    v_new_do := btrim(coalesce(p_changes->>'do_number',''));
    if (length(v_new_do) < 3 or coalesce(v_new_do, '') !~ '[^[:space:]]') then
      raise exception 'a DO number is required' using errcode = '22023', detail = 'do_number_required';
    end if;
    if lower(v_new_do) is distinct from lower(coalesce(v_receipt.do_number,'')) then
      select * into v_clash from warehouse_receipts
       where po_id = v_receipt.po_id and lower(btrim(do_number)) = lower(v_new_do)
         and id <> v_receipt.id and status <> 'voided' limit 1;
      if found then
        raise exception 'DO % already belongs to another receiving (session %)', v_new_do, v_clash.id
          using errcode = 'P0001', detail = 'do_already_received';
      end if;
      v_before := v_before || jsonb_build_object('do_number', v_receipt.do_number);
      v_after  := v_after  || jsonb_build_object('do_number', v_new_do);
      update warehouse_receipts set do_number = v_new_do, updated_at = now()
       where id = p_receipt_id;
    end if;
  end if;

  -- ── 0427 · the paper's evidence (never blocked by locked Units) ──────────
  if p_changes ? 'do_file_path' then
    v_new_do_file := btrim(coalesce(p_changes->>'do_file_path',''));
    if (length(v_new_do_file) < 3 or coalesce(v_new_do_file, '') !~ '[^[:space:]]') then
      raise exception 'a corrected DO file is required'
        using errcode = '22023', detail = 'do_file_invalid';
    end if;
    if v_new_do_file is distinct from coalesce(v_receipt.do_file_path,'') then
      v_before := v_before || jsonb_build_object('do_file_path', v_receipt.do_file_path);
      v_after  := v_after  || jsonb_build_object('do_file_path', v_new_do_file);
      update warehouse_receipts set do_file_path = v_new_do_file, updated_at = now()
       where id = p_receipt_id;
    end if;
  end if;

  if p_changes ? 'arrival_evidence_add' then
    v_evidence_add := p_changes->'arrival_evidence_add';
    if v_evidence_add is not null and jsonb_typeof(v_evidence_add) = 'array'
       and jsonb_array_length(v_evidence_add) > 0 then
      for v_chg in select * from jsonb_array_elements(v_evidence_add) loop
        if (length(btrim(coalesce(v_chg->>'path',''))) < 3 or coalesce(v_chg->>'path','') !~ '[^[:space:]]')
           or coalesce(v_chg->>'kind','') not in ('photo','video') then
          raise exception 'invalid arrival evidence entry'
            using errcode = '22023', detail = 'evidence_invalid';
        end if;
      end loop;
      v_evidence_before :=
        coalesce(jsonb_array_length(coalesce(v_receipt.arrival_evidence, '[]'::jsonb)), 0);
      v_before := v_before || jsonb_build_object('arrival_evidence_count', v_evidence_before);
      v_after  := v_after  || jsonb_build_object(
        'arrival_evidence_count', v_evidence_before + jsonb_array_length(v_evidence_add));
      update warehouse_receipts
         set arrival_evidence = coalesce(arrival_evidence, '[]'::jsonb) || v_evidence_add,
             updated_at = now()
       where id = p_receipt_id;
    end if;
  end if;

  -- ── 0601 · Goods arrived at — this GRN's arrived goods move with it ──────
  if p_changes ? 'actual_site_id' then
    v_new_site := nullif(p_changes->>'actual_site_id','')::uuid;
    if v_new_site is not null and not exists (select 1 from warehouses where id = v_new_site) then
      raise exception 'actual site not found' using errcode = '22023', detail = 'actual_site_invalid';
    end if;
    if v_new_site is distinct from v_receipt.actual_site_id
       and coalesce(v_new_site, v_po.warehouse_id) is distinct from v_old_site then
      if v_posts_stock then
        -- Every exact Unit this GRN physically received (with or without an
        -- issue) that still sits at the old site; each locked one refuses.
        for v_item in
          select i.* from receiving_unit_results r
            join ops_stock_items i on i.id = r.stock_item_id
           where r.receipt_id = p_receipt_id
             and r.outcome in ('received', 'received_with_issue')
             and i.identity_scope = 'unit'
             and i.warehouse_id = v_old_site
           order by i.id
           for update of i
        loop
          v_lock := public.receiving_unit_lock_reason(v_item);
          if v_lock is not null then
            v_locked := v_locked || jsonb_build_array(jsonb_build_object(
              'unit_code', v_item.unit_code, 'reason', v_lock->>'reason', 'words', v_lock->>'words'));
          end if;
        end loop;
        -- Counted goods this GRN posted (a quantity line's register rows).
        for v_item in
          select i.* from ops_stock_items i
           where i.identity_scope = 'quantity'
             and i.po_line_id = any(v_receipt_line_ids)
             and i.source_ref = v_receipt.do_number
             and i.warehouse_id = v_old_site
             and i.status in ('free', 'on_hold')
           order by i.id
           for update
        loop
          v_lock := public.receiving_unit_lock_reason(v_item);
          if v_lock is not null then
            v_locked := v_locked || jsonb_build_array(jsonb_build_object(
              'unit_code', 'Counted stock', 'reason', v_lock->>'reason', 'words', v_lock->>'words'));
          end if;
        end loop;
      end if;
      v_before := v_before || jsonb_build_object('actual_site_id', v_receipt.actual_site_id);
      v_after  := v_after  || jsonb_build_object('actual_site_id', v_new_site);
      if jsonb_array_length(v_locked) = 0 and v_posts_stock then
        update ops_stock_items i
           set warehouse_id = coalesce(v_new_site, v_po.warehouse_id), updated_at = now()
          from receiving_unit_results r
         where r.receipt_id = p_receipt_id and r.stock_item_id = i.id
           and r.outcome in ('received', 'received_with_issue')
           and i.identity_scope = 'unit' and i.warehouse_id = v_old_site;
        update ops_stock_items i
           set warehouse_id = coalesce(v_new_site, v_po.warehouse_id), updated_at = now()
         where i.identity_scope = 'quantity'
           and i.po_line_id = any(v_receipt_line_ids)
           and i.source_ref = v_receipt.do_number
           and i.warehouse_id = v_old_site
           and i.status in ('free', 'on_hold');
      end if;
      v_site := coalesce(v_new_site, v_po.warehouse_id);
      update warehouse_receipts set actual_site_id = v_new_site, updated_at = now()
       where id = p_receipt_id;
      -- The receiver follows the corrected Site (the original saver stays).
      v_receiver := public.receiving_receiver_of(v_site, v_receipt.posted_by);
      if v_receiver is not null
         and (v_receiver->>'name') is distinct from v_receipt.received_by_name
         and v_receipt.received_by_kind is not null then
        v_before := v_before || jsonb_build_object('received_by', v_receipt.received_by_name);
        v_after  := v_after  || jsonb_build_object('received_by', v_receiver->>'name');
      end if;
      if v_receiver is not null and v_receipt.received_by_kind is not null then
        update warehouse_receipts
           set received_by_kind = v_receiver->>'kind',
               received_by_party_id = nullif(v_receiver->>'party_id','')::uuid,
               received_by_user_id = nullif(v_receiver->>'user_id','')::uuid,
               received_by_name = v_receiver->>'name'
         where id = p_receipt_id;
      end if;
    end if;
  end if;

  -- ── 0601 · named Unit outcomes — the person names each Unit ──────────────
  v_units := p_changes->'units';
  if v_units is not null and jsonb_typeof(v_units) = 'array' and jsonb_array_length(v_units) > 0 then
    for v_unit in
      select value from jsonb_array_elements(v_units) order by value->>'stock_item_id'
    loop
      v_want := v_unit->>'outcome';
      if v_want not in ('received', 'not_received') then
        raise exception 'A Unit is corrected to Received or Not received only.'
          using errcode = '22023', detail = 'unit_outcome_not_amendable';
      end if;
      select * into v_item from ops_stock_items
       where id = nullif(v_unit->>'stock_item_id','')::uuid for update;
      if not found or v_item.identity_scope <> 'unit'
         or not (v_item.po_line_id = any(v_receipt_line_ids)) then
        raise exception 'Unit % is not a Unit of this GRN.', coalesce(v_unit->>'stock_item_id','?')
          using errcode = 'P0001', detail = 'unit_not_on_this_receipt';
      end if;
      if v_item.id = any(v_seen) then
        raise exception 'Unit % is named twice.', v_item.unit_code
          using errcode = '22023', detail = 'unit_named_twice';
      end if;
      v_seen := v_seen || v_item.id;
      select outcome into v_have from receiving_unit_results
       where receipt_id = p_receipt_id and stock_item_id = v_item.id;
      v_have := coalesce(v_have, 'not_received');
      if v_have = 'received_with_issue' then
        raise exception 'Unit % was received with an issue. Correct it through its Supplier Claim.', v_item.unit_code
          using errcode = 'P0001', detail = 'unit_outcome_not_amendable';
      end if;
      continue when v_have = v_want;

      v_lock := public.receiving_unit_lock_reason(v_item);
      if v_want = 'not_received' and v_lock is null and v_posts_stock
         and v_item.status <> 'free' then
        v_lock := jsonb_build_object('reason', 'moved', 'words', 'cannot change');
      end if;
      if v_want = 'received' and v_lock is null and v_item.status <> 'incoming' then
        v_lock := jsonb_build_object('reason', 'already_received', 'words', 'cannot change');
      end if;
      if v_lock is not null then
        v_locked := v_locked || jsonb_build_array(jsonb_build_object(
          'unit_code', v_item.unit_code, 'reason', v_lock->>'reason', 'words', v_lock->>'words'));
        continue;
      end if;

      v_line_key := v_item.po_line_id::text;
      v_line_delta := jsonb_set(v_line_delta, array[v_line_key],
        to_jsonb(coalesce((v_line_delta->>v_line_key)::int, 0)
                 + case when v_want = 'received' then 1 else -1 end));
      v_unit_before := v_unit_before || jsonb_build_array(jsonb_build_object(
        'unit_code', v_item.unit_code, 'outcome', v_have));
      v_unit_after := v_unit_after || jsonb_build_array(jsonb_build_object(
        'unit_code', v_item.unit_code, 'outcome', v_want));

      if v_posts_stock then
        if v_want = 'received' then
          -- The 0600 arrival trigger turns a Unit bound on its PO into
          -- `reserved` for its line — the same as every receiving door.
          update ops_stock_items
             set status = 'free', warehouse_id = v_site, updated_at = now(),
                 ownership = case when v_po.is_consignment
                                  then 'supplier_consignment' else ownership end,
                 supplier = coalesce(nullif(btrim(coalesce(supplier, '')), ''), v_supplier_name)
           where id = v_item.id;
        else
          update ops_stock_items
             set status = 'incoming', warehouse_id = v_po.warehouse_id, updated_at = now()
           where id = v_item.id;
        end if;
      end if;
      insert into receiving_unit_results (receipt_id, stock_item_id, unit_code, outcome)
      values (p_receipt_id, v_item.id, v_item.unit_code, v_want)
      on conflict (receipt_id, stock_item_id)
        do update set outcome = excluded.outcome, issue_kind = null;
    end loop;
  end if;

  -- Every locked Unit refuses BY NAME, and nothing is saved.
  if jsonb_array_length(v_locked) > 0 then
    raise exception '%', (
      select string_agg(format('%s cannot change. %s', x->>'unit_code', x->>'words'), ' ')
        from jsonb_array_elements(v_locked) x)
      using errcode = 'P0001', detail = 'units_locked', hint = v_locked::text;
  end if;

  -- Apply each line's net Unit change: the PO line, the session's own record
  -- (received_now and the per-Unit outcome) — Received Qty counts `Received`
  -- Units only.
  for v_line_key, v_d in select key, value::int from jsonb_each_text(v_line_delta) loop
    continue when v_d = 0;
    v_line_id := v_line_key::uuid;
    v_qty_changed := true;
    select * into v_pol from purchase_order_lines
     where id = v_line_id and po_id = v_receipt.po_id for update;
    if v_pol.received_qty + v_d > v_pol.qty then
      raise exception 'line % would exceed its Order Qty', v_pol.sku
        using errcode = 'P0001', detail = 'over_received';
    end if;
    if v_pol.received_qty + v_d < 0 then
      raise exception 'line % cannot go below zero received', v_pol.sku
        using errcode = 'P0001', detail = 'lines_block_amend';
    end if;
    update purchase_order_lines set received_qty = received_qty + v_d where id = v_line_id;
    select t.val into v_stored
      from jsonb_array_elements(coalesce(v_receipt.lines, '[]'::jsonb)) as t(val)
     where (t.val->>'id')::uuid = v_line_id limit 1;
    v_before := v_before || jsonb_build_object('line_' || v_line_id,
      coalesce((v_stored->>'received_now')::int, 0));
    v_after := v_after || jsonb_build_object('line_' || v_line_id,
      coalesce((v_stored->>'received_now')::int, 0) + v_d);
  end loop;
  if jsonb_array_length(v_unit_before) > 0 then
    -- The session's record states the corrected outcomes and counts (a swap
    -- of two Units on one line is a real correction even at a net zero).
    update warehouse_receipts w
       set lines = (
         select jsonb_agg(
           case when (v_line_delta ? (t.val->>'id'))
                then jsonb_set(
                       jsonb_set(t.val, '{received_now}',
                         to_jsonb(coalesce((t.val->>'received_now')::int, 0)
                                  + (v_line_delta->>(t.val->>'id'))::int)),
                       '{units}',
                       coalesce((
                         select jsonb_agg(case
                           when r.outcome is not null
                           then u.val || jsonb_build_object('outcome', r.outcome,
                                                            'issue_kind', r.issue_kind)
                           else u.val end)
                           from jsonb_array_elements(coalesce(t.val->'units', '[]'::jsonb)) as u(val)
                           left join receiving_unit_results r
                             on r.receipt_id = p_receipt_id
                            and r.stock_item_id = (u.val->>'stock_item_id')::uuid), '[]'::jsonb))
                else t.val end)
           from jsonb_array_elements(w.lines) as t(val)),
           updated_at = now()
     where w.id = p_receipt_id;
    if jsonb_array_length(v_unit_before) > 0 then
      v_before := v_before || jsonb_build_object('units', v_unit_before);
      v_after  := v_after  || jsonb_build_object('units', v_unit_after);
    end if;
  end if;

  -- ── quantity lines keep quantity edits (0560 body, no Unit picked) ──────
  v_lines := p_changes->'lines';
  if v_lines is not null and jsonb_typeof(v_lines) = 'array' and jsonb_array_length(v_lines) > 0 then
    select * into v_receipt from warehouse_receipts where id = p_receipt_id;
    v_stored_lines := coalesce(v_receipt.lines, '[]'::jsonb);
    for v_chg in select * from jsonb_array_elements(v_lines) loop
      v_line_id := nullif(v_chg->>'id','')::uuid;
      v_new_recv := nullif(v_chg->>'received_now','')::int;
      if v_line_id is null or v_new_recv is null or v_new_recv < 0 then
        raise exception 'invalid correction line' using errcode = '22023', detail = 'invalid_line';
      end if;
      select t.val into v_stored
        from jsonb_array_elements(v_stored_lines) as t(val)
       where (t.val->>'id')::uuid = v_line_id limit 1;
      if v_stored is null then
        raise exception 'this receiving did not count that line'
          using errcode = '22023', detail = 'line_not_in_session';
      end if;
      v_old_recv := coalesce((v_stored->>'received_now')::int, 0);
      v_d := v_new_recv - v_old_recv;
      if v_d = 0 then continue; end if;

      select * into v_pol from purchase_order_lines
       where id = v_line_id and po_id = v_receipt.po_id for update;
      if not found then
        raise exception 'PO line not found for id=%', v_line_id
          using errcode = '42P01', detail = 'po_line_not_found';
      end if;
      -- 0601 · the system never picks a Unit: an exact-unit line is corrected
      -- by naming its Units.
      if v_pol.identity_mode = 'exact_unit' then
        raise exception 'Line % is traced by Unit ID. Name each Unit you correct.', v_pol.sku
          using errcode = 'P0001', detail = 'exact_unit_line_needs_units';
      end if;
      v_qty_changed := true;

      if v_d > 0 then
        if v_pol.received_qty + v_d > v_pol.qty then
          raise exception 'line % would exceed its Order Qty', v_pol.sku
            using errcode = 'P0001', detail = 'over_received';
        end if;
        update purchase_order_lines set received_qty = received_qty + v_d
         where id = v_line_id;
        if v_posts_stock then
          insert into ops_stock_items
            (unit_code, sku, warehouse_id, status, supplier, po_no, po_line_id,
             identity_scope, qty, source_ref, date_in)
          values
            (public.gen_quantity_key(), v_pol.sku, v_site, 'free',
             v_supplier_name, v_receipt.po_id, v_line_id,
             'quantity', v_d, format('amend:%s', p_receipt_id), current_date);
        end if;
      else
        if exists (
          select 1 from order_supplier_threads
           where po_id = v_receipt.po_id
             and operation_stage in ('ready_to_dispatch','dispatched','delivered')
        ) then
          raise exception 'goods from % already moved to dispatch — the count cannot be lowered', v_receipt.po_id
            using errcode = 'P0001', detail = 'threads_block_amend';
        end if;
        if v_pol.received_qty + v_d < 0 then
          raise exception 'line % cannot go below zero received', v_pol.sku
            using errcode = 'P0001', detail = 'lines_block_amend';
        end if;
        if v_posts_stock then
          v_moved := 0;
          while v_moved < (-v_d) loop
            select * into v_bulk from ops_stock_items
             where po_line_id = v_line_id and identity_scope = 'quantity' and status = 'free'
             order by created_at desc limit 1 for update;
            exit when not found;
            v_rest := least(v_bulk.qty, (-v_d) - v_moved);
            if v_rest = v_bulk.qty then
              update ops_stock_items set status = 'voided', updated_at = now() where id = v_bulk.id;
            else
              update ops_stock_items set qty = qty - v_rest, updated_at = now() where id = v_bulk.id;
            end if;
            v_moved := v_moved + v_rest;
          end loop;
          if v_moved < (-v_d) then
            raise exception 'Counted stock on % is reserved or moved. The count cannot be lowered.', v_pol.sku
              using errcode = 'P0001', detail = 'units_block_amend';
          end if;
        end if;
        update purchase_order_lines set received_qty = received_qty + v_d
         where id = v_line_id;
      end if;

      v_before := v_before || jsonb_build_object('line_' || v_line_id, v_old_recv);
      v_after  := v_after  || jsonb_build_object('line_' || v_line_id, v_new_recv);
      update warehouse_receipts
         set lines = (
           select jsonb_agg(case when (t.val->>'id')::uuid = v_line_id
                                 then jsonb_set(t.val, '{received_now}', to_jsonb(v_new_recv))
                                 else t.val end)
             from jsonb_array_elements(warehouse_receipts.lines) as t(val)),
             updated_at = now()
       where id = p_receipt_id;
    end loop;
  end if;

  -- The PO follows the corrected lines: un-completing restores the snapshot
  -- taken at posting; completing marks it received as the engine does.
  if v_qty_changed then
    select count(*) into v_outstanding
      from purchase_order_lines where po_id = v_receipt.po_id and received_qty < qty;
    if v_po.status = 'received' and v_outstanding > 0 then
      if v_receipt.po_status_before is null then
        raise exception 'this receiving completed the PO before state snapshots existed'
          using errcode = 'P0001', detail = 'legacy_completion_block_amend';
      end if;
      update purchase_orders
         set status = v_receipt.po_status_before::po_status,
             sup_status = v_receipt.sup_status_before::po_sup_status,
             updated_at = now()
       where id = v_receipt.po_id;
    elsif v_po.status = 'open' and v_outstanding = 0 then
      update purchase_orders
         set status = 'received',
             sup_status = case when v_po.sup_status = 'relocated'
                               then 'at_warehouse_waiting'::po_sup_status
                               else 'delivered'::po_sup_status end,
             updated_at = now()
       where id = v_receipt.po_id;
    end if;
  end if;

  if v_before = '{}'::jsonb then
    raise exception 'nothing changed — state the correction first'
      using errcode = '22023', detail = 'nothing_to_amend';
  end if;

  update warehouse_receipts set revision = revision + 1 where id = p_receipt_id;

  insert into receiving_events (receipt_id, event, actor_id, payload)
  values (p_receipt_id, 'amended', v_uid,
          jsonb_build_object('reason', btrim(p_reason),
                             'before', v_before, 'after', v_after,
                             'save_key', p_save_key,
                             'grn_no', v_receipt.grn_no,
                             'revision', v_based_on + 1,
                             'quantities_changed', v_qty_changed,
                             'normal_user_id', v_ctx->>'normal_user_id',
                             'acting_user_id', v_ctx->>'acting_user_id'));
  insert into po_history (po_id, text, by_role, by_user_id)
  values (v_receipt.po_id,
          format('Receiving %s amended — %s',
                 coalesce(v_receipt.grn_no, 'record'), btrim(p_reason)),
          public.app_role(), v_uid);
  insert into audit_log (role, actor_text, action, ref)
  values (public.app_role(),
          coalesce((select name from app_users where id = v_uid), 'Operations'),
          format('Amended %s — %s', coalesce(v_receipt.grn_no, p_receipt_id::text), btrim(p_reason)),
          v_receipt.po_id);

  return jsonb_build_object('receipt_id', p_receipt_id, 'status', 'posted',
                            'revision', v_based_on + 1,
                            'before', v_before, 'after', v_after);
end;
$function$;

-- ───────────────────────────────────────────────────────────────────────────
-- 7 · sanity — the SHAPE, never the data
-- ───────────────────────────────────────────────────────────────────────────
do $sanity$
declare
  v_n int;
begin
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'office_receive_post';
  if v_n <> 1 then
    raise exception '0601 sanity: office_receive_post must stay ONE door, found %', v_n;
  end if;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'warehouse_submit_receipt';
  if v_n <> 1 then
    raise exception '0601 sanity: warehouse_submit_receipt must stay ONE door, found %', v_n;
  end if;
  if not exists (select 1 from pg_trigger
                  where tgname = 'warehouse_receipts_stamp_posting'
                    and tgrelid = 'public.warehouse_receipts'::regclass) then
    raise exception '0601 sanity: the posting stamp trigger is missing';
  end if;
  if position('order by created_at' in (select prosrc from pg_proc
       where oid = 'public.receiving_amend(uuid, text, jsonb, uuid)'::regprocedure)) > 0
     and position('identity_scope = ''unit'' and status = ''incoming''' in (select prosrc from pg_proc
       where oid = 'public.receiving_amend(uuid, text, jsonb, uuid)'::regprocedure)) > 0 then
    raise exception '0601 sanity: receiving_amend still picks Units by age';
  end if;
  if position('no_grn_duty_holder' in (select prosrc from pg_proc
       where oid = 'public.receiving_require_post_authority()'::regprocedure)) > 0 then
    raise exception '0601 sanity: posting is still refused for a missing GRN Duty holder';
  end if;
end
$sanity$;

commit;

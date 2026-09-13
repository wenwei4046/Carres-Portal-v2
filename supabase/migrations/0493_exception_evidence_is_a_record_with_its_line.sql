-- 0493 · Exception evidence is a RECORD with its line — never a JSON array that
--        is rebuilt, never a photo without a stable line identity.
--
-- ─── WHY ─────────────────────────────────────────────────────────────────────
-- The Receiving redesign (owner instruction 2026-09-13) asks for six evidence
-- doors on every GRN: Damaged · Wrong Item · Extra, each with Photos and
-- Videos, scoped by GRN + stable line identity + exception type + media kind.
-- Today (0426/0444):
--   · damaged/wrong evidence is a PHOTO path list inside `warehouse_receipts.lines`
--     (`damaged_photos` · `wrong_item_photos`) — no videos, no per-file record;
--   · extra goods (`extra_lines`) carry `{sku, qty, note}` — no identity at all,
--     so nothing can be attached to an extra line and stay attached;
--   · a path is stored exactly as the browser sent it — never checked for
--     shape, kind or existence.
-- Appending to those arrays with `set arr = arr || new` is a read-modify-write
-- of one JSON value; two operators appending at once lose one of them. This
-- migration gives exception evidence its own append-only table, so an append
-- is one INSERT and concurrency is PostgreSQL's problem, not ours.
--
-- ─── WHAT ────────────────────────────────────────────────────────────────────
-- §1  `receiving_line_evidence` — one row per file: receipt · exception type ·
--     line key (the PO line id, or the extra line's own id) · media kind · path.
--     Read = internal/operation (RLS); written ONLY by the doors below.
-- §2  Media path law — `receiving_media_kind_of_path` (extension → kind) and
--     `receiving_validate_media_paths` (shape · kind · object exists in
--     `delivery-orders`; optionally under the PO's own prefix).
-- §3  Extra goods get an identity — `receiving_validate_session_extras` stamps
--     a uuid `id` on every extra line (keeps a valid one the caller passes) and
--     validates its optional `photos` / `videos`. It was declared IMMUTABLE and
--     now generates ids, so it is VOLATILE.
-- §4  The line validator accepts `damaged_videos` / `wrong_item_videos`, validates
--     every photo/video path, and SNAPSHOTS the goods' full name (`item_label` =
--     `Model · Variant` from the catalog at posting) so the paper and the
--     Register can print a HISTORICAL name later — a name resolved from today's
--     catalog is a fallback, and the reader must be able to tell.
-- §5  Projection — `receiving_project_line_evidence` turns a posted receipt's
--     jsonb evidence into rows (`insert … on conflict do nothing`, idempotent), a
--     trigger runs it whenever a receipt is posted/voided or its lines/extras
--     change, and the one-off backfill below is an INSERT…SELECT — it touches
--     no `updated_at` and asserts no row count (Constitution §5 red line 8).
-- §6  `receiving_line_evidence_add` — the append door for a posted GRN: GRN Duty /
--     cover / superuser only, the line must exist on THIS receipt with a positive
--     quantity of THAT exception, paths validated under the receipt's PO prefix,
--     rows inserted (never an array rebuilt), one append-only `amended` event.
--
-- No RLS policy on an existing table changes. No committed migration is edited.

-- ─── §1 · the record ─────────────────────────────────────────────────────────
create table if not exists public.receiving_line_evidence (
  id              uuid primary key default gen_random_uuid(),
  receipt_id      uuid not null references public.warehouse_receipts(id) on delete cascade,
  exception_type  text not null check (exception_type in ('damaged','wrong_item','extra')),
  /* purchase_order_lines.id for damaged/wrong_item; the extra line's own id for extra. */
  line_key        text not null check (length(line_key) between 1 and 80),
  media_kind      text not null check (media_kind in ('photo','video')),
  bucket          text not null default 'delivery-orders',
  path            text not null check (length(path) between 3 and 400),
  /* posting = written with the receipt · amend = appended later through the
     door · projection = the 0493 one-off from existing jsonb. */
  source          text not null check (source in ('posting','amend','projection')),
  added_by        uuid references public.app_users(id),
  added_at        timestamptz not null default now(),
  unique (receipt_id, exception_type, line_key, media_kind, path)
);
create index if not exists receiving_line_evidence_receipt_idx
  on public.receiving_line_evidence (receipt_id, exception_type, line_key);

comment on table public.receiving_line_evidence is
  '0493: one row per exception evidence file on a GRN — receipt · damaged|wrong_item|extra · line key · photo|video · storage path. Append-only; written only by the receiving doors.';

alter table public.receiving_line_evidence enable row level security;
drop policy if exists receiving_line_evidence_read on public.receiving_line_evidence;
create policy receiving_line_evidence_read on public.receiving_line_evidence
  for select to authenticated
  using ( (select public.is_internal()) or (select public.is_operation()) );
grant select on public.receiving_line_evidence to authenticated;
revoke insert, update, delete on public.receiving_line_evidence from authenticated, anon;

-- ─── §2 · the media path law ─────────────────────────────────────────────────
create or replace function public.receiving_media_kind_of_path(p_path text)
returns text
language sql
immutable
as $$
  select case
    when p_path ~* '\.(jpe?g|png|webp)$' then 'photo'
    when p_path ~* '\.(mp4|mov|webm)$'   then 'video'
    else null
  end;
$$;

/**
 * Validates a list of storage paths for ONE media kind and returns the clean,
 * de-duplicated list. A path must look like an object key (no `..`, no leading
 * slash, the characters the signing door emits), carry an extension of the
 * asked kind, and EXIST in the `delivery-orders` bucket. When `p_po_id` is
 * given the path must sit under that PO's own prefix — the signing door names
 * every receiving file `<po_id>/<uuid>-…`, so a path outside it was not signed
 * for this source.
 */
create or replace function public.receiving_validate_media_paths(
  p_paths jsonb,
  p_kind  text,
  p_po_id text,
  p_what  text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v jsonb; v_path text; v_out jsonb := '[]'::jsonb; v_seen text[] := '{}'::text[];
begin
  if p_paths is null or jsonb_typeof(p_paths) <> 'array' then
    return v_out;
  end if;
  if p_kind not in ('photo','video') then
    raise exception 'unknown media kind %', p_kind using errcode = '22023', detail = 'evidence_kind_invalid';
  end if;
  for v in select * from jsonb_array_elements(p_paths) loop
    if jsonb_typeof(v) <> 'string' then
      raise exception '% evidence must be a storage path', p_what
        using errcode = '22023', detail = 'evidence_path_invalid';
    end if;
    v_path := btrim(v #>> '{}');
    if v_path = '' or length(v_path) > 400
       or v_path !~ '^[A-Za-z0-9][A-Za-z0-9._/-]*$'
       or position('..' in v_path) > 0 then
      raise exception '% evidence path is not a storage object key', p_what
        using errcode = '22023', detail = 'evidence_path_invalid';
    end if;
    if public.receiving_media_kind_of_path(v_path) is distinct from p_kind then
      raise exception '% evidence % is not a %', p_what, v_path, p_kind
        using errcode = '22023', detail = 'evidence_kind_mismatch';
    end if;
    if p_po_id is not null and v_path not like p_po_id || '/%' then
      raise exception '% evidence % was not uploaded for %', p_what, v_path, p_po_id
        using errcode = '22023', detail = 'evidence_path_foreign';
    end if;
    if not exists (select 1 from storage.objects o
                    where o.bucket_id = 'delivery-orders' and o.name = v_path) then
      raise exception '% evidence % has not finished uploading', p_what, v_path
        using errcode = 'P0001', detail = 'evidence_object_missing';
    end if;
    if not (v_path = any(v_seen)) then
      v_seen := v_seen || v_path;
      v_out := v_out || to_jsonb(v_path);
    end if;
  end loop;
  return v_out;
end;
$fn$;
revoke execute on function public.receiving_validate_media_paths(jsonb, text, text, text)
  from public, anon, authenticated;

-- ─── §3 · extra goods get an identity, and may carry evidence ───────────────
drop function if exists public.receiving_validate_session_extras(jsonb, jsonb);
create or replace function public.receiving_validate_session_extras(
  p_arrival_evidence jsonb,
  p_extra_lines jsonb
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $fn$
declare
  v jsonb; v_ev jsonb := '[]'::jsonb; v_extra jsonb := '[]'::jsonb;
  v_id uuid; v_qty int;
begin
  if p_arrival_evidence is not null and jsonb_typeof(p_arrival_evidence) = 'array' then
    for v in select * from jsonb_array_elements(p_arrival_evidence) loop
      if length(btrim(coalesce(v->>'path',''))) = 0
         or coalesce(v->>'kind','') not in ('photo','video') then
        raise exception 'arrival evidence must be a photo or video file'
          using errcode = '22023', detail = 'evidence_kind_invalid';
      end if;
      v_ev := v_ev || jsonb_build_array(jsonb_build_object(
        'path', btrim(v->>'path'), 'kind', v->>'kind'));
    end loop;
  end if;
  if p_extra_lines is not null and jsonb_typeof(p_extra_lines) = 'array' then
    for v in select * from jsonb_array_elements(p_extra_lines) loop
      v_qty := coalesce(nullif(v->>'qty','')::int, 0);
      if length(btrim(coalesce(v->>'sku',''))) = 0 or v_qty <= 0 then
        raise exception 'an extra goods line needs a SKU and a quantity'
          using errcode = '22023', detail = 'extra_line_invalid';
      end if;
      -- A stable identity: keep a valid uuid the caller round-trips
      -- (resubmit), mint one otherwise. It never changes after posting.
      begin
        v_id := nullif(v->>'id','')::uuid;
      exception when others then
        v_id := null;
      end;
      if v_id is null then v_id := gen_random_uuid(); end if;
      v_extra := v_extra || jsonb_build_array(jsonb_build_object(
        'id', v_id,
        'sku', btrim(v->>'sku'),
        'qty', v_qty,
        'note', nullif(btrim(coalesce(v->>'note','')), ''),
        'photos', public.receiving_validate_media_paths(v->'photos', 'photo', null, 'extra goods'),
        'videos', public.receiving_validate_media_paths(v->'videos', 'video', null, 'extra goods')));
    end loop;
  end if;
  return jsonb_build_object('arrival_evidence', v_ev, 'extra_lines', v_extra);
end;
$fn$;
revoke execute on function public.receiving_validate_session_extras(jsonb, jsonb)
  from public, anon, authenticated;

-- ─── §4 · the line validator: videos, validated paths, the name snapshot ────
create or replace function public.warehouse_receipt_validate_lines(
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
  v_units jsonb; v_unit jsonb; v_ucode text; v_uitem ops_stock_items;
  v_outcome text; v_u_recv int; v_u_dmg int; v_u_wrong int; v_u_notrecv int;
  v_seen text[]; v_clean_units jsonb; v_has_units boolean;
  -- 0493
  v_dmg_photos jsonb; v_dmg_videos jsonb; v_wrong_photos jsonb; v_wrong_videos jsonb;
  v_model_name text; v_variant text; v_label text;
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
    if v_pol.identity_mode is null then
      raise exception 'line % has no stock identity mode — set it for the SKU in Catalog', v_pol.sku
        using errcode = 'P0001', detail = 'line_identity_mode_missing';
    end if;
    v_reportable := greatest(0, v_pol.qty - least(v_pol.qty, v_pol.received_qty));

    v_units := v_line->'units';
    v_has_units := v_units is not null and jsonb_typeof(v_units) = 'array'
                   and jsonb_array_length(v_units) > 0;
    v_clean_units := '[]'::jsonb;

    -- ⭐ 0444 · THE MODE DECIDES THE SHAPE. Neither path can be forced by the
    -- shape of the submission.
    if v_pol.identity_mode = 'quantity' then
      if v_has_units then
        raise exception 'line % is counted by quantity — it has no Unit IDs to scan', v_pol.sku
          using errcode = 'P0001', detail = 'quantity_line_takes_no_units';
      end if;
      if v_recv + v_damaged + v_wrong > v_reportable then
        raise exception 'line % counts % units but the PO still owes %',
                        v_pol.sku, v_recv + v_damaged + v_wrong, v_reportable
          using errcode = 'P0001', detail = 'line_over_reported';
      end if;
    else
      if not v_has_units then
        raise exception 'line % is traced by Unit ID — record one result for each expected Unit', v_pol.sku
          using errcode = 'P0001', detail = 'exact_unit_line_needs_units';
      end if;
      v_seen := '{}'::text[];
      v_u_recv := 0; v_u_dmg := 0; v_u_wrong := 0; v_u_notrecv := 0;
      for v_unit in select * from jsonb_array_elements(v_units) loop
        v_ucode := public.normalise_unit_id(coalesce(v_unit->>'unit_code', ''));
        v_outcome := coalesce(v_unit->>'outcome', '');
        if v_outcome not in ('received','received_with_issue','not_received') then
          raise exception 'unit % has no valid outcome', coalesce(v_unit->>'unit_code','?')
            using errcode = '22023', detail = 'unit_outcome_invalid';
        end if;
        select * into v_uitem from ops_stock_items
         where public.normalise_unit_id(unit_code) = v_ucode
           and identity_scope = 'unit';
        if not found then
          raise exception 'Unit % is not a Carres Unit ID', coalesce(v_unit->>'unit_code','?')
            using errcode = 'P0001', detail = 'unit_unknown';
        end if;
        if v_uitem.po_no is distinct from p_po_id then
          raise exception 'Unit % does not belong to %', v_uitem.unit_code, p_po_id
            using errcode = 'P0001', detail = 'unit_not_on_this_po';
        end if;
        if v_uitem.po_line_id is distinct from v_line_id then
          raise exception 'Unit % belongs to another line of %, not %', v_uitem.unit_code, p_po_id, v_pol.sku
            using errcode = 'P0001', detail = 'unit_not_on_this_line';
        end if;
        if v_uitem.unit_code = any(v_seen) then
          raise exception 'Unit % was scanned twice', v_uitem.unit_code
            using errcode = 'P0001', detail = 'unit_scanned_twice';
        end if;
        v_seen := v_seen || v_uitem.unit_code;
        if v_uitem.status <> 'incoming' then
          raise exception 'Unit % was already received (session for %)', v_uitem.unit_code, p_po_id
            using errcode = 'P0001', detail = 'unit_already_received';
        end if;
        if v_outcome = 'received' then v_u_recv := v_u_recv + 1;
        elsif v_outcome = 'not_received' then v_u_notrecv := v_u_notrecv + 1;
        else
          if coalesce(v_unit->>'issue_kind', '') = 'wrong_item' then v_u_wrong := v_u_wrong + 1;
          else v_u_dmg := v_u_dmg + 1;
          end if;
        end if;
        v_clean_units := v_clean_units || jsonb_build_array(jsonb_build_object(
          'stock_item_id', v_uitem.id,
          'unit_code', v_uitem.unit_code,
          'outcome', v_outcome,
          'issue_kind', case when v_outcome = 'received_with_issue'
                             then coalesce(nullif(v_unit->>'issue_kind',''), 'damaged')
                             else null end,
          'note', nullif(btrim(coalesce(v_unit->>'note','')), '')));
      end loop;
      v_recv := v_u_recv; v_damaged := v_u_dmg; v_wrong := v_u_wrong;
      if v_recv + v_damaged + v_wrong > v_reportable then
        raise exception 'line % scans % received units but the PO still owes %',
                        v_pol.sku, v_recv + v_damaged + v_wrong, v_reportable
          using errcode = 'P0001', detail = 'line_over_reported';
      end if;
    end if;

    -- ⭐ 0493 · every evidence path is a checked storage object of the asked
    -- kind, under this PO's own prefix. A zero exception carries no evidence.
    v_dmg_photos   := case when v_damaged > 0 then public.receiving_validate_media_paths(v_line->'damaged_photos',    'photo', p_po_id, 'damaged') else '[]'::jsonb end;
    v_dmg_videos   := case when v_damaged > 0 then public.receiving_validate_media_paths(v_line->'damaged_videos',    'video', p_po_id, 'damaged') else '[]'::jsonb end;
    v_wrong_photos := case when v_wrong   > 0 then public.receiving_validate_media_paths(v_line->'wrong_item_photos', 'photo', p_po_id, 'wrong-item') else '[]'::jsonb end;
    v_wrong_videos := case when v_wrong   > 0 then public.receiving_validate_media_paths(v_line->'wrong_item_videos', 'video', p_po_id, 'wrong-item') else '[]'::jsonb end;

    if v_damaged > 0 then
      if jsonb_array_length(public.supplier_claim_photo_entries(v_dmg_photos, p_uid)) = 0 then
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
      if jsonb_array_length(public.supplier_claim_photo_entries(v_wrong_photos, p_uid)) = 0 then
        raise exception 'wrong-item units on % need at least one photo', v_pol.sku
          using errcode = 'P0001', detail = 'wrong_item_photo_required';
      end if;
    end if;

    -- ⭐ 0493 · the goods' full name, snapshotted with the receipt: the paper
    -- and the Register print the name the catalog held WHEN the goods arrived.
    select m.name, s.variant into v_model_name, v_variant
      from product_skus s left join product_models m on m.id = s.model_id
     where s.sku = v_pol.sku
     limit 1;
    v_label := nullif(concat_ws(' · ', nullif(btrim(coalesce(v_model_name,'')),''),
                                       nullif(btrim(coalesce(v_variant,'')),'')), '');

    v_counted := v_counted + v_recv + v_damaged + v_wrong;
    if v_recv + v_damaged + v_wrong > 0
       or jsonb_array_length(v_clean_units) > 0 then
      v_clean := v_clean || jsonb_build_array(jsonb_build_object(
        'id', v_line_id, 'sku', v_pol.sku, 'received_now', v_recv,
        'damaged_qty', v_damaged, 'wrong_item_qty', v_wrong,
        'wrong_item_claim_type', case when v_wrong > 0 then v_type else null end,
        'damaged_photos', v_dmg_photos,
        'damaged_videos', v_dmg_videos,
        'wrong_item_photos', v_wrong_photos,
        'wrong_item_videos', v_wrong_videos,
        'item_label', v_label,
        'units', v_clean_units));
    end if;
  end loop;
  if v_counted = 0 then
    raise exception 'count at least one unit before sending this'
      using errcode = 'P0001', detail = 'nothing_counted';
  end if;
  return jsonb_build_object('lines', v_clean, 'counted', v_counted);
end;
$fn$;

comment on function public.warehouse_receipt_validate_lines(text, jsonb, uuid) is
  '0493: 0444''s validator plus damaged/wrong-item VIDEOS, checked evidence paths (shape · kind · exists under the PO prefix) and the goods'' full-name snapshot (`item_label` = Model · Variant at posting). Never allocates.';

-- ─── §5 · projection: the jsonb evidence becomes rows, idempotently ─────────
create or replace function public.receiving_project_line_evidence(
  p_receipt_id uuid,
  p_source text default 'posting'
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_receipt warehouse_receipts;
  v_line jsonb; v_extra jsonb; v_path jsonb; v_n int := 0; v_ins int;
  v_by uuid;
begin
  select * into v_receipt from warehouse_receipts where id = p_receipt_id;
  if not found then return 0; end if;
  v_by := coalesce(v_receipt.posted_by, v_receipt.submitted_by);

  for v_line in select * from jsonb_array_elements(coalesce(v_receipt.lines, '[]'::jsonb)) loop
    if jsonb_typeof(v_line) <> 'object' or coalesce(v_line->>'id','') = '' then continue; end if;
    for v_path in select * from jsonb_array_elements(case when jsonb_typeof(v_line->'damaged_photos') = 'array' then v_line->'damaged_photos' else '[]'::jsonb end) loop
      if jsonb_typeof(v_path) <> 'string' or btrim(v_path #>> '{}') = '' then continue; end if;
      insert into receiving_line_evidence (receipt_id, exception_type, line_key, media_kind, path, source, added_by)
      values (p_receipt_id, 'damaged', v_line->>'id', 'photo', btrim(v_path #>> '{}'), p_source, v_by)
      on conflict do nothing;
      get diagnostics v_ins = row_count; v_n := v_n + v_ins;
    end loop;
    for v_path in select * from jsonb_array_elements(case when jsonb_typeof(v_line->'damaged_videos') = 'array' then v_line->'damaged_videos' else '[]'::jsonb end) loop
      if jsonb_typeof(v_path) <> 'string' or btrim(v_path #>> '{}') = '' then continue; end if;
      insert into receiving_line_evidence (receipt_id, exception_type, line_key, media_kind, path, source, added_by)
      values (p_receipt_id, 'damaged', v_line->>'id', 'video', btrim(v_path #>> '{}'), p_source, v_by)
      on conflict do nothing;
      get diagnostics v_ins = row_count; v_n := v_n + v_ins;
    end loop;
    for v_path in select * from jsonb_array_elements(case when jsonb_typeof(v_line->'wrong_item_photos') = 'array' then v_line->'wrong_item_photos' else '[]'::jsonb end) loop
      if jsonb_typeof(v_path) <> 'string' or btrim(v_path #>> '{}') = '' then continue; end if;
      insert into receiving_line_evidence (receipt_id, exception_type, line_key, media_kind, path, source, added_by)
      values (p_receipt_id, 'wrong_item', v_line->>'id', 'photo', btrim(v_path #>> '{}'), p_source, v_by)
      on conflict do nothing;
      get diagnostics v_ins = row_count; v_n := v_n + v_ins;
    end loop;
    for v_path in select * from jsonb_array_elements(case when jsonb_typeof(v_line->'wrong_item_videos') = 'array' then v_line->'wrong_item_videos' else '[]'::jsonb end) loop
      if jsonb_typeof(v_path) <> 'string' or btrim(v_path #>> '{}') = '' then continue; end if;
      insert into receiving_line_evidence (receipt_id, exception_type, line_key, media_kind, path, source, added_by)
      values (p_receipt_id, 'wrong_item', v_line->>'id', 'video', btrim(v_path #>> '{}'), p_source, v_by)
      on conflict do nothing;
      get diagnostics v_ins = row_count; v_n := v_n + v_ins;
    end loop;
  end loop;

  for v_extra in select * from jsonb_array_elements(coalesce(v_receipt.extra_lines, '[]'::jsonb)) loop
    -- An extra line without an id predates 0493 and cannot be pointed at; it
    -- projects nothing rather than an invented key.
    if jsonb_typeof(v_extra) <> 'object' or coalesce(v_extra->>'id','') = '' then continue; end if;
    for v_path in select * from jsonb_array_elements(case when jsonb_typeof(v_extra->'photos') = 'array' then v_extra->'photos' else '[]'::jsonb end) loop
      if jsonb_typeof(v_path) <> 'string' or btrim(v_path #>> '{}') = '' then continue; end if;
      insert into receiving_line_evidence (receipt_id, exception_type, line_key, media_kind, path, source, added_by)
      values (p_receipt_id, 'extra', v_extra->>'id', 'photo', btrim(v_path #>> '{}'), p_source, v_by)
      on conflict do nothing;
      get diagnostics v_ins = row_count; v_n := v_n + v_ins;
    end loop;
    for v_path in select * from jsonb_array_elements(case when jsonb_typeof(v_extra->'videos') = 'array' then v_extra->'videos' else '[]'::jsonb end) loop
      if jsonb_typeof(v_path) <> 'string' or btrim(v_path #>> '{}') = '' then continue; end if;
      insert into receiving_line_evidence (receipt_id, exception_type, line_key, media_kind, path, source, added_by)
      values (p_receipt_id, 'extra', v_extra->>'id', 'video', btrim(v_path #>> '{}'), p_source, v_by)
      on conflict do nothing;
      get diagnostics v_ins = row_count; v_n := v_n + v_ins;
    end loop;
  end loop;
  return v_n;
end;
$fn$;
revoke execute on function public.receiving_project_line_evidence(uuid, text)
  from public, anon, authenticated;

create or replace function public.trg_receiving_line_evidence_project()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if new.status in ('posted', 'voided') then
    perform public.receiving_project_line_evidence(new.id, 'posting');
  end if;
  return new;
end;
$fn$;

drop trigger if exists receiving_line_evidence_project on public.warehouse_receipts;
create trigger receiving_line_evidence_project
  after insert or update of status, lines, extra_lines on public.warehouse_receipts
  for each row execute function public.trg_receiving_line_evidence_project();

-- The one-off: every GRN that already exists gets its rows. INSERT…SELECT only —
-- no receipt row is updated, no `updated_at` moves, no row count is asserted.
select public.receiving_project_line_evidence(r.id, 'projection')
  from public.warehouse_receipts r
 where r.status in ('posted', 'voided');

-- ─── §6 · the append door for a posted GRN ───────────────────────────────────
/**
 * `receiving_line_evidence_add(receipt, entries, reason)` — appends exception
 * evidence to a POSTED GRN. `entries` = [{line_key, exception_type, kind, path}].
 *   · GRN Duty / dated cover / Operations Superuser (0425), like every door;
 *   · the receipt is `posted` (a cancelled GRN takes no new evidence);
 *   · `line_key` names one of THIS receipt's lines (a PO line id) or extra
 *     lines (an extra id), and that line carries a POSITIVE quantity of the
 *     named exception — a zero exception has no evidence door;
 *   · every path passes the media law under the receipt's PO prefix;
 *   · rows are INSERTED — never an array rebuilt — and a duplicate path is a
 *     no-op, so a retried request appends nothing twice;
 *   · one append-only `amended` event records what was added.
 * Returns {receipt_id, added, before, after}.
 */
create or replace function public.receiving_line_evidence_add(
  p_receipt_id uuid,
  p_entries jsonb,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  v_ctx jsonb;
  v_receipt warehouse_receipts;
  v_e jsonb; v_key text; v_type text; v_kind text; v_path text;
  v_line jsonb; v_extra jsonb; v_qty int; v_found boolean;
  v_added int := 0; v_ins int; v_before int; v_after int;
  v_summary jsonb := '[]'::jsonb;
begin
  v_ctx := public.receiving_require_post_authority();
  select * into v_receipt from warehouse_receipts where id = p_receipt_id for update;
  if not found then
    raise exception 'receiving record not found' using errcode = 'P0002', detail = 'receipt_not_found';
  end if;
  if v_receipt.status <> 'posted' then
    raise exception 'evidence can only be added to a saved receiving (%)', v_receipt.status
      using errcode = 'P0001', detail = 'receipt_not_posted';
  end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) = 0 then
    raise exception 'nothing to add' using errcode = '22023', detail = 'invalid_input';
  end if;
  select count(*) into v_before from receiving_line_evidence where receipt_id = p_receipt_id;

  for v_e in select * from jsonb_array_elements(p_entries) loop
    v_key  := btrim(coalesce(v_e->>'line_key',''));
    v_type := coalesce(v_e->>'exception_type','');
    v_kind := coalesce(v_e->>'kind','');
    if v_key = '' or v_type not in ('damaged','wrong_item','extra') or v_kind not in ('photo','video') then
      raise exception 'an evidence entry needs a line, an exception type and a media kind'
        using errcode = '22023', detail = 'evidence_entry_invalid';
    end if;
    -- The line must be THIS receipt's, and carry that exception.
    v_found := false; v_qty := 0;
    if v_type = 'extra' then
      for v_extra in select * from jsonb_array_elements(coalesce(v_receipt.extra_lines,'[]'::jsonb)) loop
        if coalesce(v_extra->>'id','') = v_key then
          v_found := true; v_qty := coalesce(nullif(v_extra->>'qty','')::int, 0);
        end if;
      end loop;
    else
      for v_line in select * from jsonb_array_elements(coalesce(v_receipt.lines,'[]'::jsonb)) loop
        if coalesce(v_line->>'id','') = v_key then
          v_found := true;
          v_qty := case when v_type = 'damaged'
                        then coalesce(nullif(v_line->>'damaged_qty','')::int, 0)
                        else coalesce(nullif(v_line->>'wrong_item_qty','')::int, 0) end;
        end if;
      end loop;
    end if;
    if not v_found then
      raise exception 'line % is not on this receiving', v_key
        using errcode = 'P0001', detail = 'evidence_line_not_on_receipt';
    end if;
    if v_qty <= 0 then
      raise exception 'line % records no % on this receiving', v_key, replace(v_type, '_', ' ')
        using errcode = 'P0001', detail = 'evidence_exception_zero';
    end if;
    -- One path per entry, validated as a checked object under this PO.
    v_path := (public.receiving_validate_media_paths(jsonb_build_array(v_e->'path'), v_kind, v_receipt.po_id, replace(v_type,'_',' ')) ->> 0);
    insert into receiving_line_evidence (receipt_id, exception_type, line_key, media_kind, path, source, added_by)
    values (p_receipt_id, v_type, v_key, v_kind, v_path, 'amend', v_uid)
    on conflict do nothing;
    get diagnostics v_ins = row_count;
    v_added := v_added + v_ins;
    if v_ins > 0 then
      v_summary := v_summary || jsonb_build_array(jsonb_build_object(
        'line_key', v_key, 'exception_type', v_type, 'kind', v_kind, 'path', v_path));
    end if;
  end loop;

  select count(*) into v_after from receiving_line_evidence where receipt_id = p_receipt_id;
  if v_added > 0 then
    insert into receiving_events (receipt_id, event, actor_id, payload)
    values (p_receipt_id, 'amended', v_uid, jsonb_build_object(
      'kind', 'line_evidence',
      'reason', nullif(btrim(coalesce(p_reason,'')), ''),
      'grn_no', v_receipt.grn_no,
      'before', jsonb_build_object('exception_evidence_count', v_before),
      'after',  jsonb_build_object('exception_evidence_count', v_after),
      'evidence_added', v_summary,
      'duty_holder', v_ctx->'normal_user_id',
      'acting_user', v_ctx->'acting_user_id',
      'authority',   v_ctx->'source'));
  end if;
  return jsonb_build_object('receipt_id', p_receipt_id, 'added', v_added,
                            'before', v_before, 'after', v_after);
end;
$fn$;
revoke execute on function public.receiving_line_evidence_add(uuid, jsonb, text) from public, anon;
grant execute on function public.receiving_line_evidence_add(uuid, jsonb, text) to authenticated;

comment on function public.receiving_line_evidence_add(uuid, jsonb, text) is
  '0493: appends exception evidence (damaged|wrong_item|extra × photo|video) to a posted GRN as ROWS under the GRN Duty gate; a zero exception or a foreign line refuses by name; one append-only amended event.';

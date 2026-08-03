-- =====================================================================
-- 0315_office_receiving_door
-- Slice B — the Office Receiving Workspace's ONE write door.
--
-- Today the Office receives through `operation_receive_po_with_do` alone,
-- so it produces NO Receiving Session, NO event, and no GRN record —
-- measured 2026-08-03: 19 POs, 0 warehouse_receipts, 0 receiving_events.
-- 0314 built the Session for the Warehouse door only.
--
-- Jess, 2026-08-03 (her ruling, overriding this chat's proposal): the
-- Office writes exactly ONE event, `posted`. An Event records what
-- happened in the BUSINESS world, not the steps the system walked —
-- the Warehouse flow is two people, two acts, two times, so it is
-- `submitted` then `posted`; the Office is one operator pressing Save
-- once, so a `submitted` event would be an act nobody performed. The
-- Event Payload Dictionary (RECEIVING-INFORMATION-MODEL §6.1) is
-- EXTENDED instead: `posted` gains goods_received_at · units_counted ·
-- entry_source.
--
-- Nothing here changes the lifecycle, the statuses, the duplicate guard
-- or the validation law — the same helper
-- `warehouse_receipt_validate_lines` is the ONE copy of the counting and
-- evidence rules, and the same `operation_receive_po_with_do` moves the
-- stock. This migration adds one door and widens one payload.
-- =====================================================================

-- §1 · office_receive_post — Draft → Posted in ONE act ----------------------
--
-- The Draft lives in the browser (Receiving Mode) and is discarded if the
-- operator walks away: model §4, "An unsubmitted Draft is discarded, not
-- voided — nothing happened business-wise." So nothing is persisted until
-- Save, and what Save persists is already Posted.
create function public.office_receive_post(
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
  v_uid uuid; v_po purchase_orders; v_valid jsonb; v_line jsonb;
  v_pol purchase_order_lines; v_payload jsonb := '[]'::jsonb;
  v_receipt_id uuid; v_grn_date date; v_counted int;
  v_today_myt date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_prior warehouse_receipts; v_before uuid[]; v_result jsonb; v_linked int;
begin
  v_uid := auth.uid();
  -- Same gate as the review door (0314 §9): operation or principal.
  if not public.is_operation() then
    raise exception 'forbidden: operation or principal required'
      using errcode = '42501', detail = 'forbidden';
  end if;

  -- Evidence is required at the door, not only by the CHECK, so the
  -- operator gets a sentence instead of a constraint name.
  if length(btrim(coalesce(p_do_number, ''))) < 3 then
    raise exception 'a DO number is required'
      using errcode = '22023', detail = 'do_number_required';
  end if;
  if length(btrim(coalesce(p_do_file_path, ''))) = 0 then
    raise exception 'a photo of the signed DO is required'
      using errcode = '22023', detail = 'do_file_required';
  end if;

  -- Goods Received At — the SAME bounds 0314 §7 gives the warehouse door.
  -- Two doors on one business date may not disagree about what a legal
  -- date is.
  v_grn_date := coalesce(p_goods_received_at, v_today_myt);
  if v_grn_date > v_today_myt then
    raise exception 'Goods Received At cannot be in the future'
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
    raise exception 'Goods Received At cannot be before the PO date (%)',
                    to_char((v_po.placed_at at time zone 'Asia/Kuala_Lumpur')::date, 'DD Mon YY')
      using errcode = '22023', detail = 'received_date_before_po';
  end if;

  -- A warehouse count already waiting for Carres is the SAME goods. Posting
  -- over it would book the units twice and leave the warehouse's session
  -- stranded — so the office is sent to check that one in instead.
  select * into v_prior from warehouse_receipts
   where po_id = p_po_id and status = 'submitted' limit 1;
  if found then
    raise exception 'the warehouse already filed a receiving for % (DO %) — check that one in instead',
                    p_po_id, coalesce(v_prior.do_number, '—')
      using errcode = 'P0001', detail = 'receipt_awaiting_review';
  end if;

  -- Duplicate guard, NAMED (checkpoint §3: "duplicate PO+DO — name the
  -- earlier session"). The partial unique index stays the backstop; this
  -- lookup is what turns a 23505 into a sentence an operator can act on.
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

  -- ONE copy of the counting + evidence law (0314 §6).
  v_valid   := public.warehouse_receipt_validate_lines(p_po_id, p_lines, v_uid);
  v_counted := (v_valid->>'counted')::int;

  -- The receive payload carries the CUMULATIVE total, read BEFORE the
  -- receive runs (0314 §9's own shape). The Session stores the delta.
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
      'wrong_item_photos', coalesce(v_line->'wrong_item_photos', '[]'::jsonb)));
  end loop;

  -- The warehouse is a SNAPSHOT off the PO (model §3.1: "never re-derived
  -- after a PO relocation"). An office login has no app_warehouse_id().
  insert into warehouse_receipts (
    po_id, warehouse_id, do_number, do_file_path, note, lines,
    goods_received_at, submitted_from, status,
    submitted_by, submitted_at, posted_by, posted_at,
    reviewed_by, reviewed_at
  ) values (
    p_po_id, v_po.warehouse_id, btrim(p_do_number), btrim(p_do_file_path),
    nullif(btrim(coalesce(p_note, '')), ''), v_valid->'lines',
    v_grn_date, 'office', 'posted',
    v_uid, now(), v_uid, now(),
    -- reviewed_* stays COMPAT-WRITTEN until the reader-rename slice drops
    -- it (0314 §9's own discipline).
    v_uid, now()
  ) returning id into v_receipt_id;

  select coalesce(array_agg(id), '{}'::uuid[]) into v_before
    from supplier_claims where po_id = p_po_id;

  v_result := public.operation_receive_po_with_do(
    p_po_id, btrim(p_do_file_path), btrim(p_do_number), v_payload);

  update supplier_claims
     set warehouse_receipt_id = v_receipt_id
   where po_id = p_po_id and not (id = any(v_before))
     and warehouse_receipt_id is null;
  get diagnostics v_linked = row_count;

  -- ONE event (Jess, 2026-08-03). Keys are the Event Payload Dictionary's
  -- (§6.1), as widened by her same ruling.
  insert into receiving_events (receipt_id, event, actor_id, payload)
  values (v_receipt_id, 'posted', v_uid,
          jsonb_build_object('do_number', btrim(p_do_number),
                             'goods_received_at', v_grn_date,
                             'units_counted', v_counted,
                             'entry_source', 'office',
                             'claims_linked', v_linked));

  insert into po_history (po_id, text, by_role, by_user_id)
  values (p_po_id,
          format('Received %s unit%s against DO %s',
                 v_counted, case when v_counted = 1 then '' else 's' end,
                 btrim(p_do_number)),
          public.app_role(), v_uid);

  insert into audit_log (role, actor_text, action, ref)
  values (public.app_role(),
          coalesce((select name from app_users where id = v_uid), 'Operations'),
          format('Checked in %s (DO %s, %s unit%s)', p_po_id, btrim(p_do_number),
                 v_counted, case when v_counted = 1 then '' else 's' end),
          p_po_id);

  return jsonb_build_object('receipt_id', v_receipt_id, 'po_id', p_po_id,
                            'status', 'posted', 'units_counted', v_counted,
                            'claims_linked', v_linked, 'receive', v_result);
end;
$fn$;

-- §2 · the WAREHOUSE door's `posted` event speaks the widened dictionary too.
--
-- Without this, `posted.units_counted` would be present on exactly half the
-- sessions and a report reading it would silently under-count. The numbers
-- are read off the Session the door is already holding — no new input, no
-- behaviour change, nothing about the review flow moves.
create or replace function public.warehouse_receipt_check_in(p_receipt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_receipt warehouse_receipts; v_uid uuid; v_line jsonb;
  v_pol purchase_order_lines; v_payload jsonb := '[]'::jsonb;
  v_before uuid[]; v_result jsonb; v_linked int; v_counted int := 0;
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
    v_counted := v_counted
               + coalesce((v_line->>'received_now')::int, 0)
               + coalesce((v_line->>'damaged_qty')::int, 0)
               + coalesce((v_line->>'wrong_item_qty')::int, 0);
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
          jsonb_build_object('do_number', v_receipt.do_number,
                             'goods_received_at', v_receipt.goods_received_at,
                             'units_counted', v_counted,
                             'entry_source', 'warehouse',
                             'claims_linked', v_linked));
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

-- §3 · grants (the 0268 lesson: public AND anon, then the explicit grant back)
revoke execute on function public.office_receive_post(text, text, text, text, jsonb, date) from public, anon;
grant  execute on function public.office_receive_post(text, text, text, text, jsonb, date) to authenticated;

-- §4 · sanity ---------------------------------------------------------------
do $$
declare v int;
begin
  select count(*) into v from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'office_receive_post';
  if v <> 1 then raise exception 'sanity: % copies of office_receive_post', v; end if;
  select count(*) into v from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'warehouse_receipt_check_in';
  if v <> 1 then raise exception 'sanity: % copies of warehouse_receipt_check_in', v; end if;
  if has_function_privilege('anon',
       'public.office_receive_post(text, text, text, text, jsonb, date)', 'execute') then
    raise exception 'sanity: office_receive_post must not be callable by anon';
  end if;
  if not has_function_privilege('authenticated',
       'public.office_receive_post(text, text, text, text, jsonb, date)', 'execute') then
    raise exception 'sanity: office_receive_post must be callable by authenticated';
  end if;
  -- The office door may never become a second copy of the counting law.
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'office_receive_post')
     not like '%warehouse_receipt_validate_lines%' then
    raise exception 'sanity: office_receive_post must call the shared validator';
  end if;
  -- ONE event, and it is `posted` (Jess, 2026-08-03). Counted on the INSERT
  -- itself, not on the word `submitted` — that word legitimately appears in
  -- the awaiting-review guard, and a check that trips on it would be
  -- measuring the wrong thing.
  select (length(prosrc) - length(replace(prosrc, 'into receiving_events', '')))
         / length('into receiving_events')
    into v
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'office_receive_post';
  if v <> 1 then
    raise exception 'sanity: office_receive_post writes % receiving_events inserts, expected 1', v;
  end if;
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'office_receive_post')
     not like '%''posted'', v_uid%' then
    raise exception 'sanity: office_receive_post''s one event must be posted';
  end if;
end $$;

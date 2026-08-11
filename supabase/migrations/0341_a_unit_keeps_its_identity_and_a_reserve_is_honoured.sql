-- =============================================================================
-- 0341_a_unit_keeps_its_identity_and_a_reserve_is_honoured.sql
-- SALES ORDER V2 · CARD 2 — UNIT / STOCK ALLOCATION TRUTH (owner ruling
-- 2026-08-11, docs/orders/MASTER.md).
--
-- The Card 2 trace (2026-08-11) measured that the physical spine ALREADY runs:
-- units are born at PO placement (`_operation_create_po_inner`, 0153/0154 —
-- 47 live `po_mint` units), Receiving flips them free / on_hold with an
-- auto-claim (0299 via `operation_receive_po_with_do`), cancel voids them,
-- and the pool draw is one governed door with a reason ledger (0292/0322).
-- What the trace found BROKEN against the approved Card 2 law is exactly four
-- things, and this migration closes the three that live in the database:
--
--   ① `operation_attach_do_and_deliver` picked sold units FIFO from
--      status IN ('incoming','free','reserved') with NO reserved_ref filter —
--      a delivery could silently take a unit reserved to a DIFFERENT customer
--      order. Card 2: "Never silently auto-allocate or reallocate."
--   ② A wrong / surplus / released / customer-rejected unit had NO route to
--      Hold: 0299's guard admits `on_hold` from 'incoming' only, and the only
--      exit (`ops_stock_resolve_hold`) is keyed on a supplier CLAIM. Card 2:
--      a returned unit "returns through location + inspection to Available or
--      Hold; it does not disappear with the old SO."
--   ③ `DELETE /ops/stock/:itemId` could hard-delete a reserved or even a sold
--      unit — an identity that must follow the physical item forever simply
--      vanished. Only the on_hold state was protected.
--
--   (④ — the silent whole-pool auto-reserve at receive — lives in the API,
--    `autoReserveReceivedToSourceOrder`, and is scoped to the PO's own units
--    in the same PR. The DB half and the API half ship together.)
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO:
--   - It does NOT open a second supplier-claim entrance. Claim reasons
--     ('damaged','wrong_item') still enter quarantine ONLY from 'incoming' at
--     receiving — the purchasing MASTER's law stands untouched. The new
--     inspection reasons ('customer_return','inspection') carry NO claim and
--     can NEVER leave as 'returned' — a supplier return without a claim would
--     bypass the claims engine.
--   - It does NOT touch the commitment truth (Card 1), booking, money or the
--     work engine. The original SO continues to owe its commitment through
--     Card 1's bundle, which reads nothing from units (proven by Card 1's
--     negative control).
--   - Per the Stock MASTER §6 condition, the ENTRY rule and the way OUT move
--     in the SAME change: entry = `ops_stock_hold_unit`, exit =
--     `ops_stock_resolve_unit_hold` (back_to_stock / written_off), both here.
--
-- Live bodies read before redefinition (2026-08-11):
--   ops_stock_hold_transition_guard  == 0299's text (md5 d0632d5e…)
--   operation_attach_do_and_deliver  == 0153 §7's text (unit pick verbatim)
-- =============================================================================

-- ── 1 · the two inspection reasons ───────────────────────────────────────────
alter table public.ops_stock_items
  drop constraint if exists ops_stock_items_hold_reason_valid;
alter table public.ops_stock_items
  add constraint ops_stock_items_hold_reason_valid
    check (hold_reason is null
           or hold_reason in ('damaged','wrong_item','customer_return','inspection'));

comment on column public.ops_stock_items.hold_reason is
  'Why this unit is quarantined. damaged/wrong_item = receiving exception (carries a claim, 0299). customer_return/inspection = pool/reservation return through the Card 2 inspection door (0341, no claim).';

-- ── 2 · the guard learns the two new rules ───────────────────────────────────
-- Verbatim 0299 body PLUS: ① claim reasons still only from incoming;
-- inspection reasons only from free/reserved. ② a committed unit cannot be
-- hard-deleted — only 'incoming', 'free' and 'voided' rows (mis-key fixes)
-- may leave the register.
create or replace function public.ops_stock_hold_transition_guard()
returns trigger
language plpgsql
as $fn$
begin
  if tg_op = 'DELETE' then
    if old.status = 'on_hold' then
      raise exception
        'unit % is on hold under an open supplier claim and cannot be deleted', old.id
        using errcode = 'P0001', detail = 'held_unit_not_deletable';
    end if;
    -- 0341 (Card 2): identity permanence. A unit that is reserved, sold,
    -- transferred or terminally resolved is a business record; it can be
    -- released, resolved or written off, never deleted. Hard delete stays
    -- ONLY for mis-keyed rows that never carried a commitment.
    if old.status not in ('incoming','free','voided') then
      raise exception
        'unit % is % — a committed unit is resolved, never deleted', old.id, old.status
        using errcode = 'P0001', detail = 'unit_committed_not_deletable';
    end if;
    return old;
  end if;

  if new.status is distinct from old.status then
    -- Leaving quarantine: three ways out, and none of them sells the unit.
    if old.status = 'on_hold'
       and new.status not in ('free','returned_to_supplier','written_off') then
      raise exception
        'unit % is on hold: it cannot become %, only free, returned_to_supplier or written_off',
        old.id, new.status
        using errcode = 'P0001', detail = 'held_unit_not_available';
    end if;

    -- 0341: a claimless inspection hold can never leave as returned_to_supplier
    -- — a supplier return without a claim would bypass the claims engine.
    if old.status = 'on_hold'
       and new.status = 'returned_to_supplier'
       and old.hold_claim_id is null then
      raise exception
        'unit % is held without a supplier claim — it cannot be returned to a supplier', old.id
        using errcode = 'P0001', detail = 'return_needs_claim';
    end if;

    -- Goods that physically left do not come back.
    if old.status in ('returned_to_supplier','written_off') then
      raise exception
        'unit % already left as % — a replacement is a new unit, not this one',
        old.id, old.status
        using errcode = 'P0001', detail = 'terminal_unit_status';
    end if;

    -- Entering quarantine — two doors, decided by the REASON (0341):
    --   damaged/wrong_item        = receiving's claim quarantine, from 'incoming'
    --                               only (0299's law, unchanged).
    --   customer_return/inspection = the Card 2 inspection door, from the pool
    --                               ('free') or a reservation ('reserved') only.
    if new.status = 'on_hold' then
      if coalesce(new.hold_reason, '') in ('customer_return','inspection') then
        if old.status not in ('free','reserved') then
          raise exception
            'an inspection hold takes a pool or reserved unit (unit % is %)', old.id, old.status
            using errcode = 'P0001', detail = 'inspection_hold_needs_pool_unit';
        end if;
      elsif old.status <> 'incoming' then
        raise exception
          'only an arriving unit can be put on hold (unit % is %)', old.id, old.status
          using errcode = 'P0001', detail = 'hold_only_from_incoming';
      end if;
    end if;
  end if;

  return new;
end;
$fn$;

-- ── 3 · the inspection ENTRY door ────────────────────────────────────────────
-- free | reserved → on_hold, no claim. A reserved unit's ref moves into
-- ref_history — the unit stops pointing at the old SO; the SO keeps owing its
-- commitment through Card 1's truth, which never reads units.
create or replace function public.ops_stock_hold_unit(
  p_item_id uuid,
  p_reason  text,
  p_note    text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role   app_role;
  v_uid    uuid;
  v_note   text := nullif(btrim(coalesce(p_note, '')), '');
  v_row    ops_stock_items;
  v_old_ref text;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'forbidden: only operation or principal can hold stock'
      using errcode = '42501', detail = 'forbidden';
  end if;
  v_uid := auth.uid();

  if p_item_id is null then
    raise exception 'p_item_id required' using errcode = '22023', detail = 'invalid_input';
  end if;
  if p_reason is null or p_reason not in ('customer_return','inspection') then
    raise exception '% is not an inspection-hold reason (customer_return · inspection)', coalesce(p_reason, 'null')
      using errcode = '22023', detail = 'bad_reason';
  end if;

  select * into v_row from ops_stock_items where id = p_item_id for update;
  if not found then
    raise exception 'unit not found' using errcode = '42P01', detail = 'unit_not_found';
  end if;
  if v_row.status not in ('free','reserved') then
    raise exception 'unit is % — an inspection hold takes a pool or reserved unit', v_row.status
      using errcode = 'P0001', detail = 'inspection_hold_needs_pool_unit';
  end if;

  v_old_ref := v_row.reserved_ref;

  update ops_stock_items
     set status       = 'on_hold',
         hold_reason  = p_reason,
         held_at      = now(),
         reserved_ref = null,
         ref_history  = case when v_old_ref is not null
                             then array_append(ref_history, v_old_ref)
                             else ref_history end,
         updated_at   = now()
   where id = p_item_id;

  insert into audit_log (role, actor_text, action, ref)
  values (v_role,
          (select name from app_users where id = v_uid),
          format('Unit held for inspection · %s · %s%s',
                 v_row.sku, p_reason,
                 case when v_note is not null then ' · ' || v_note else '' end),
          coalesce(v_old_ref, v_row.unit_code, p_item_id::text));

  insert into ops_activity_log (order_id, action, actor_id, detail)
  values (
    case when v_old_ref is not null
         then public._activity_log_order_id_from_ref(v_old_ref) end,
    'stock_hold',
    v_uid,
    jsonb_build_object('item_id', p_item_id, 'sku', v_row.sku,
                       'reason', p_reason, 'note', v_note,
                       'was_status', v_row.status, 'was_ref', v_old_ref)
  );

  return jsonb_build_object(
    'item_id', p_item_id,
    'status', 'on_hold',
    'hold_reason', p_reason,
    'released_from_ref', v_old_ref
  );
end;
$fn$;

revoke all on function public.ops_stock_hold_unit(uuid, text, text) from public;
revoke all on function public.ops_stock_hold_unit(uuid, text, text) from anon;
grant execute on function public.ops_stock_hold_unit(uuid, text, text) to authenticated;

-- ── 4 · the inspection EXIT door ─────────────────────────────────────────────
-- A claimless hold ends exactly two ways: back to Available, or written off.
-- 'returned' is refused here AND by the guard — that word belongs to
-- `ops_stock_resolve_hold`, which walks with its supplier claim.
create or replace function public.ops_stock_resolve_unit_hold(
  p_item_id uuid,
  p_outcome text,
  p_note    text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role app_role;
  v_uid  uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_row  ops_stock_items;
  v_new  text;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'forbidden: only operation or principal can resolve held stock'
      using errcode = '42501', detail = 'forbidden';
  end if;
  v_uid := auth.uid();

  if p_item_id is null then
    raise exception 'p_item_id required' using errcode = '22023', detail = 'invalid_input';
  end if;
  if p_outcome is null or p_outcome not in ('back_to_stock','written_off') then
    raise exception '% is not a way a claimless hold ends (back_to_stock · written_off)', coalesce(p_outcome, 'null')
      using errcode = 'P0001', detail = 'outcome_invalid';
  end if;
  if p_outcome = 'written_off' and v_note is null then
    raise exception 'a write-off must say why the unit was destroyed'
      using errcode = 'P0001', detail = 'note_required';
  end if;

  select * into v_row from ops_stock_items where id = p_item_id for update;
  if not found then
    raise exception 'unit not found' using errcode = '42P01', detail = 'unit_not_found';
  end if;
  if v_row.status <> 'on_hold' then
    raise exception 'unit is %, not on hold', v_row.status
      using errcode = 'P0001', detail = 'not_on_hold';
  end if;
  if v_row.hold_claim_id is not null then
    raise exception 'unit is held under supplier claim % — resolve it through the claim', v_row.hold_claim_id
      using errcode = 'P0001', detail = 'resolve_through_claim';
  end if;

  v_new := case p_outcome when 'back_to_stock' then 'free' else 'written_off' end;

  update ops_stock_items
     set status            = v_new,
         hold_released_at  = now(),
         hold_release_note = v_note,
         updated_at        = now()
   where id = p_item_id;

  insert into audit_log (role, actor_text, action, ref)
  values (v_role,
          (select name from app_users where id = v_uid),
          format('Inspection hold resolved · %s · %s%s',
                 v_row.sku, p_outcome,
                 case when v_note is not null then ' · ' || v_note else '' end),
          coalesce(v_row.unit_code, p_item_id::text));

  insert into ops_activity_log (order_id, action, actor_id, detail)
  values (null, 'stock_hold_resolve', v_uid,
          jsonb_build_object('item_id', p_item_id, 'sku', v_row.sku,
                             'outcome', p_outcome, 'note', v_note));

  return jsonb_build_object('item_id', p_item_id, 'status', v_new, 'outcome', p_outcome);
end;
$fn$;

revoke all on function public.ops_stock_resolve_unit_hold(uuid, text, text) from public;
revoke all on function public.ops_stock_resolve_unit_hold(uuid, text, text) from anon;
grant execute on function public.ops_stock_resolve_unit_hold(uuid, text, text) to authenticated;

-- ── 5 · a delivery honours the reservation ───────────────────────────────────
-- Verbatim live body (read 2026-08-11) with ONE change, in the unit pick:
-- a 'reserved' unit is taken ONLY when it is reserved to THIS order
-- (reserved_ref = 'SO-{so}'), and this order's own reserved units come FIRST.
-- Another customer's reservation — and a loan reservation ('LOAN SO-…') —
-- can no longer be silently sold out from under them.
CREATE OR REPLACE FUNCTION public.operation_attach_do_and_deliver(
  p_order_id      uuid,
  p_do_number     text,
  p_do_note       text,
  p_signed        boolean,
  p_do_file_path  text,
  p_signature_url text default null,
  p_signed_by     text default null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order   orders;
  v_actor   text;
  v_line    record;
  v_user_id uuid;
  v_threads_advanced int;
  v_units_sold int := 0;
  v_line_sold  int;
BEGIN
  v_user_id := (select auth.uid());

  IF NOT public.is_operation() THEN
    RAISE EXCEPTION 'forbidden: logistics only' USING ERRCODE = '42501';
  END IF;

  IF p_signed IS NULL OR p_signed = false THEN
    RAISE EXCEPTION 'customer must sign DO'
      USING ERRCODE = 'P0001', DETAIL = 'do_required';
  END IF;

  IF p_do_number IS NULL OR length(btrim(p_do_number)) < 3 THEN
    RAISE EXCEPTION 'DO number must be at least 3 characters'
      USING ERRCODE = 'P0001', DETAIL = 'do_required';
  END IF;

  IF p_do_file_path IS NULL OR length(btrim(p_do_file_path)) = 0 THEN
    RAISE EXCEPTION 'DO file required'
      USING ERRCODE = 'P0001', DETAIL = 'do_file_required';
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found'
      USING ERRCODE = '42P01', DETAIL = 'order_not_found';
  END IF;

  IF v_order.operation_stage IS DISTINCT FROM 'dispatched'
     OR v_order.status <> 'proceed_order' THEN
    RAISE EXCEPTION 'order is not in dispatched state'
      USING ERRCODE = '22023', DETAIL = 'wrong_stage';
  END IF;

  v_actor := coalesce((SELECT name FROM app_users WHERE id = v_user_id), 'Logistics');

  UPDATE orders
     SET status            = 'delivered',
         operation_stage   = 'delivered',
         do_number         = btrim(p_do_number),
         do_note           = nullif(btrim(coalesce(p_do_note, '')), ''),
         do_file_path      = btrim(p_do_file_path),
         do_uploaded_at    = now(),
         do_uploaded_by    = v_user_id,
         pod_signature_url = nullif(btrim(coalesce(p_signature_url, '')), ''),
         pod_signed_by     = nullif(btrim(coalesce(p_signed_by, '')), ''),
         pod_signed_at     = now(),
         delivered_at      = now(),
         updated_at        = now()
   WHERE id = p_order_id;

  PERFORM public._operation_release_order_reserve(p_order_id);

  FOR v_line IN
    SELECT sku, qty FROM order_lines WHERE order_id = p_order_id
  LOOP
    UPDATE stock_balances
       SET qty        = qty - v_line.qty,
           updated_at = now()
     WHERE sku = v_line.sku
       AND warehouse_id = v_order.warehouse_id;

    INSERT INTO stock_movements
      (sku, warehouse_id, qty, kind, ref, by_role, by_user_id)
    VALUES
      (v_line.sku, v_order.warehouse_id, -v_line.qty, 'out',
       'SO-' || v_order.so::text, 'operation', v_user_id);

    -- 0153: mark up to v_line.qty tracked units SOLD. 0341 (Card 2): the pick
    -- honours the reservation — THIS order's reserved units first, then free /
    -- incoming; a unit reserved to ANY OTHER ref (another SO, a loan) is never
    -- taken. Best-effort; never fails the delivery.
    UPDATE ops_stock_items i
       SET status        = 'sold',
           sold_at       = now(),
           sold_order_id = p_order_id,
           reserved_ref  = 'SO-' || v_order.so::text,
           ref_history   = array_append(coalesce(i.ref_history, '{}'::text[]),
                                         'SO-' || v_order.so::text),
           updated_at    = now()
     WHERE i.id IN (
       SELECT s.id FROM ops_stock_items s
        WHERE s.sku = v_line.sku
          AND s.warehouse_id = v_order.warehouse_id
          AND ( (s.status = 'reserved' AND s.reserved_ref = 'SO-' || v_order.so::text)
             OR s.status IN ('incoming','free') )
        ORDER BY
          CASE WHEN s.status = 'reserved' THEN 0
               WHEN s.po_no IN (
                 SELECT t.po_id FROM order_supplier_threads t
                  WHERE t.order_id = p_order_id AND t.po_id IS NOT NULL
               ) THEN 1 ELSE 2 END,
          s.date_in, s.created_at
        LIMIT v_line.qty
     );
    GET DIAGNOSTICS v_line_sold = ROW_COUNT;
    v_units_sold := v_units_sold + v_line_sold;
  END LOOP;

  UPDATE order_supplier_threads
     SET operation_stage = 'delivered',
         delivered_at    = COALESCE(delivered_at, now()),
         updated_at      = now()
   WHERE order_id = p_order_id
     AND operation_stage <> 'delivered';
  GET DIAGNOSTICS v_threads_advanced = ROW_COUNT;

  INSERT INTO order_history (order_id, text, by_role)
  VALUES (
    p_order_id,
    format('Delivered · DO %s · file %s · signed by %s · %s unit(s) sold%s',
           btrim(p_do_number),
           btrim(p_do_file_path),
           coalesce(nullif(btrim(coalesce(p_signed_by, '')), ''), 'customer'),
           v_units_sold,
           CASE WHEN v_threads_advanced > 0
                THEN format(' · %s thread(s) advanced', v_threads_advanced)
                ELSE '' END),
    'operation'
  );

  INSERT INTO audit_log (role, actor_text, action, dealer_id, ref)
  VALUES ('operation', v_actor,
          format('Delivered SO-%s · DO %s', v_order.so, btrim(p_do_number)),
          v_order.dealer_id, 'SO-' || v_order.so::text);

  RETURN jsonb_build_object(
    'id',                v_order.id,
    'so',                v_order.so,
    'status',            'delivered',
    'operation_stage',   'delivered',
    'do_number',         btrim(p_do_number),
    'do_file_path',      btrim(p_do_file_path),
    'pod_signature_url', nullif(btrim(coalesce(p_signature_url, '')), ''),
    'pod_signed_by',     nullif(btrim(coalesce(p_signed_by, '')), ''),
    'delivered_at',      now(),
    'units_sold',        v_units_sold,
    'threads_advanced',  v_threads_advanced
  );
END;
$function$;

-- ── 6 · sanity ───────────────────────────────────────────────────────────────
do $sanity$
declare
  v_def text;
  v int;
begin
  -- The reason list carries all four words.
  if not exists (
    select 1 from pg_constraint
     where conname = 'ops_stock_items_hold_reason_valid'
       and pg_get_constraintdef(oid) like '%customer_return%'
       and pg_get_constraintdef(oid) like '%inspection%'
       and pg_get_constraintdef(oid) like '%damaged%'
       and pg_get_constraintdef(oid) like '%wrong_item%'
  ) then
    raise exception '0341 sanity: hold_reason constraint missing a reason';
  end if;

  -- The guard carries identity permanence, both entry doors and the
  -- claimless-return refusal.
  v_def := pg_get_functiondef('public.ops_stock_hold_transition_guard()'::regprocedure);
  if position('unit_committed_not_deletable' in v_def) = 0
     or position('inspection_hold_needs_pool_unit' in v_def) = 0
     or position('hold_only_from_incoming' in v_def) = 0
     or position('return_needs_claim' in v_def) = 0 then
    raise exception '0341 sanity: transition guard missing a Card 2 rule';
  end if;

  -- The delivery pick honours the reservation and no longer grabs any
  -- 'reserved' unit bare.
  v_def := pg_get_functiondef(
    'public.operation_attach_do_and_deliver(uuid,text,text,boolean,text,text,text)'::regprocedure);
  if position('s.reserved_ref = ''SO-'' || v_order.so::text' in v_def) = 0 then
    raise exception '0341 sanity: deliver pick does not filter reserved_ref to this SO';
  end if;
  if position('IN (''incoming'',''free'',''reserved'')' in v_def) > 0 then
    raise exception '0341 sanity: deliver pick still takes any reserved unit';
  end if;

  -- Both inspection doors exist, gated exactly like the other stock RPCs.
  select count(*) into v from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('ops_stock_hold_unit','ops_stock_resolve_unit_hold');
  if v <> 2 then
    raise exception '0341 sanity: expected 2 inspection-door RPCs, got %', v;
  end if;
  if has_function_privilege('anon',
       'public.ops_stock_hold_unit(uuid,text,text)', 'execute') then
    raise exception '0341 sanity: ops_stock_hold_unit callable by anon';
  end if;
  if has_function_privilege('anon',
       'public.ops_stock_resolve_unit_hold(uuid,text,text)', 'execute') then
    raise exception '0341 sanity: ops_stock_resolve_unit_hold callable by anon';
  end if;

  raise notice '0341 OK: inspection doors + delivery honours reservation + identity permanence';
end $sanity$;

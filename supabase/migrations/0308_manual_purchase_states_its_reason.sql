-- 0308_manual_purchase_states_its_reason
--
-- Separate Manual Purchase from To Order.
-- Design: the approved card (Loo, 2026-07-29). Words: docs/COPY-STANDARD.md.
--
-- To Order answers ONE question — "which customer orders should be issued as
-- Purchase Orders today?" A purchase nobody's customer asked for is a different
-- business event, it is entered from Purchase Orders → Create Purchase, and it
-- never appears in that plan.
--
-- =====================================================================
-- WHY THERE IS NO `origin` COLUMN
-- =====================================================================
-- The card rules it out by name, and the reason is that it would be a SECOND
-- way to say something the record already says. A manual purchase is exactly a
-- purchase that states why it was bought; a customer-driven one is exactly a
-- purchase that points at a customer order. An `origin` word beside those two
-- facts can disagree with them, and then nothing says which one is true — the
-- disease this codebase has already paid for with `ops_order_control.balance`.
--
-- So `reason_code IS NOT NULL` IS the marker. That is why it may be changed but
-- never cleared (the trigger below): clearing it would silently convert a manual
-- purchase into a customer-driven one that points at no customer.
--
-- =====================================================================
-- WHAT THIS MIGRATION DOES NOT DO
-- =====================================================================
-- It does not require a reason on every PO, because SQL cannot know which door
-- a PO came through. "Required before submit" is the API's gate and the screen's
-- (the card's item 5). What SQL CAN hold alone is the pair rule, and it holds it
-- as a CHECK rather than as route code: `purchase_orders` carries a blanket
-- internal write policy, so a rule living in one RPC is a rule PostgREST walks
-- around (0299's discipline).

-- =====================================================================
-- 1 · The two columns
-- =====================================================================
alter table public.purchase_orders
  add column if not exists reason_code text;

alter table public.purchase_orders
  add column if not exists reason_note text;

comment on column public.purchase_orders.reason_code is
  'Why this was bought when no customer order asked for it. NOT NULL <=> this is a manual purchase — it is the SOLE stored marker of that fact, which is why 0308 forbids clearing it. Free text until the reason dictionary lands.';

comment on column public.purchase_orders.reason_note is
  'Optional free-text detail beside reason_code. Never a substitute for it.';

-- A blank reason is not a reason. Without this the marker could be set to a
-- space, which reads as "manual purchase" to every query and as "nothing" to a
-- human — the two truths one column may never hold at once.
alter table public.purchase_orders
  drop constraint if exists purchase_orders_reason_not_blank;
alter table public.purchase_orders
  add constraint purchase_orders_reason_not_blank
  check (reason_code is null or length(btrim(reason_code)) > 0);

-- The card's item 6, whole: a PO with a purchase reason carries no customer
-- order. `so_refs` is checked by CARDINALITY, not by IS NULL — an empty array
-- is not a customer order, and `so_refs = '{}'` is a shape the batch RPC can
-- produce.
alter table public.purchase_orders
  drop constraint if exists purchase_orders_manual_has_no_customer_order;
alter table public.purchase_orders
  add constraint purchase_orders_manual_has_no_customer_order
  check (
    reason_code is null
    or (so is null and coalesce(cardinality(so_refs), 0) = 0)
  );

-- =====================================================================
-- 2 · A purchase reason may be changed, never removed
-- =====================================================================
-- A trigger rather than a CHECK because the rule is about the TRANSITION, not
-- about the row: NULL is a legal value for every customer-driven PO and an
-- illegal one only for a PO that already had a reason.
create or replace function public.trg_po_reason_never_cleared()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.reason_code is null or length(btrim(new.reason_code)) = 0 then
    raise exception
      'a purchase reason may be changed but never removed (PO %)', old.id
      using errcode = '22023', detail = 'reason_cannot_be_cleared';
  end if;
  return new;
end;
$function$;

drop trigger if exists po_reason_never_cleared on public.purchase_orders;
create trigger po_reason_never_cleared
  before update on public.purchase_orders
  for each row
  when (old.reason_code is not null)
  execute function public.trg_po_reason_never_cleared();

-- =====================================================================
-- 3 · The two create RPCs learn the reason
-- =====================================================================
-- DROP then CREATE, never `create or replace` with new DEFAULTed parameters:
-- adding a defaulted argument to a live function creates a SECOND signature,
-- and PostgREST then cannot choose between them. The sanity block at the end
-- asserts exactly one survives.
drop function if exists public.operation_create_po(uuid, uuid, jsonb, integer, integer[], uuid);

CREATE OR REPLACE FUNCTION public.operation_create_po(p_supplier_id uuid, p_warehouse_id uuid, p_lines jsonb, p_so integer DEFAULT NULL::integer, p_so_refs integer[] DEFAULT NULL::integer[], p_procurement_partner_id uuid DEFAULT NULL::uuid, p_reason_code text DEFAULT NULL::text, p_reason_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_po_id      text;
  v_line_count int;
  v_reason     text;
begin
  if not public.is_operation() then
    raise exception 'forbidden: logistics only' using errcode = '42501';
  end if;

  v_reason := nullif(btrim(coalesce(p_reason_code, '')), '');

  -- The boundary, stated early so a caller gets a NAMED detail rather than a
  -- raw 23514 from the CHECK that backs it. The CHECK is still the enforcement:
  -- this is the courtesy layer, the same shape 0296 added for attribution.
  if p_reason_code is not null and v_reason is null then
    raise exception 'a manual purchase must state a reason'
      using errcode = '22023', detail = 'reason_required';
  end if;
  if v_reason is not null
     and (p_so is not null or coalesce(array_length(p_so_refs, 1), 0) > 0) then
    raise exception 'a manual purchase does not come from a customer order'
      using errcode = '22023', detail = 'manual_purchase_has_no_customer_order';
  end if;

  v_po_id := public._operation_create_po_inner(
    p_supplier_id            := p_supplier_id,
    p_warehouse_id           := p_warehouse_id,
    p_lines                  := p_lines,
    p_eta_date               := null,
    p_so_refs                := p_so_refs,
    p_note                   := null,
    p_procurement_partner_id := p_procurement_partner_id
  );

  if v_reason is not null then
    update purchase_orders
       set reason_code = v_reason,
           reason_note = nullif(btrim(coalesce(p_reason_note, '')), '')
     where id = v_po_id;
  end if;

  if p_so is not null then
    update purchase_orders set so = p_so where id = v_po_id;
  end if;

  perform public._v3_claim_threads_for_po(v_po_id);

  select count(*)::int into v_line_count
    from purchase_order_lines where po_id = v_po_id;

  return jsonb_build_object(
    'id',                     v_po_id,
    'supplier_id',            p_supplier_id,
    'warehouse_id',           p_warehouse_id,
    'so',                     p_so,
    'so_refs',                p_so_refs,
    'procurement_partner_id', p_procurement_partner_id,
    'reason_code',            v_reason,
    'line_count',             v_line_count
  );
end;
$function$;

-- The batch RPC takes its reason off each JSONB entry, so its signature does
-- not move and `create or replace` is correct here.
CREATE OR REPLACE FUNCTION public.operation_create_pos_batch(p_pos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_count       int;
  v_idx         int;
  v_po          jsonb;
  v_po_id       text;
  v_po_ids      jsonb := '[]'::jsonb;
  v_so_refs     int[];
  v_eta         date;
  v_partner_id  uuid;
  v_reason      text;
  v_reason_note text;
  v_err_state   text;
  v_err_msg     text;
  v_err_detail  text;
begin
  if not public.is_operation() then
    raise exception 'forbidden: logistics only' using errcode = '42501';
  end if;
  if p_pos is null or jsonb_typeof(p_pos) <> 'array' then
    raise exception 'p_pos must be a JSON array'
      using errcode = '22023', detail = 'invalid_batch_size';
  end if;
  v_count := jsonb_array_length(p_pos);
  if v_count < 1 or v_count > 20 then
    raise exception 'batch size must be between 1 and 20 (got %)', v_count
      using errcode = '22023', detail = 'invalid_batch_size';
  end if;

  v_idx := 0;
  for v_po in select * from jsonb_array_elements(p_pos)
  loop
    if v_po->>'eta_date' is not null and v_po->>'eta_date' <> '' then
      v_eta := (v_po->>'eta_date')::date;
    else
      v_eta := null;
    end if;
    if v_po ? 'so_refs' and jsonb_typeof(v_po->'so_refs') = 'array' then
      select coalesce(array_agg((elem)::int), array[]::int[])
        into v_so_refs
        from jsonb_array_elements_text(v_po->'so_refs') as elem;
      if array_length(v_so_refs, 1) is null then
        v_so_refs := null;
      end if;
    else
      v_so_refs := null;
    end if;
    v_partner_id  := nullif(v_po->>'procurement_partner_id', '')::uuid;
    v_reason      := nullif(btrim(coalesce(v_po->>'reason_code', '')), '');
    v_reason_note := nullif(btrim(coalesce(v_po->>'reason_note', '')), '');

    begin
      if v_po ? 'reason_code'
         and v_po->>'reason_code' is not null
         and v_reason is null then
        raise exception 'a manual purchase must state a reason'
          using errcode = '22023', detail = 'reason_required';
      end if;
      if v_reason is not null and coalesce(array_length(v_so_refs, 1), 0) > 0 then
        raise exception 'a manual purchase does not come from a customer order'
          using errcode = '22023', detail = 'manual_purchase_has_no_customer_order';
      end if;

      v_po_id := public._operation_create_po_inner(
        p_supplier_id            := nullif(v_po->>'supplier_id', '')::uuid,
        p_warehouse_id           := nullif(v_po->>'warehouse_id', '')::uuid,
        p_lines                  := v_po->'lines',
        p_eta_date               := v_eta,
        p_so_refs                := v_so_refs,
        p_note                   := v_po->>'note',
        p_procurement_partner_id := v_partner_id
      );

      if v_reason is not null then
        update purchase_orders
           set reason_code = v_reason,
               reason_note = v_reason_note
         where id = v_po_id;
      end if;

      perform public._v3_claim_threads_for_po(v_po_id);
    exception
      when others then
        get stacked diagnostics
          v_err_state  = returned_sqlstate,
          v_err_msg    = message_text,
          v_err_detail = pg_exception_detail;
        raise exception using
          errcode = v_err_state,
          message = v_err_msg,
          detail  = coalesce(nullif(v_err_detail, ''), 'helper_failed'),
          hint    = format('pos_index=%s', v_idx);
    end;

    v_po_ids := v_po_ids || to_jsonb(v_po_id);
    v_idx := v_idx + 1;
  end loop;

  return jsonb_build_object('po_ids', v_po_ids);
end;
$function$;

-- =====================================================================
-- 4 · Sanity
-- =====================================================================
do $$
declare
  v_n int;
begin
  -- Exactly ONE operation_create_po. A surviving 6-arg ghost is the failure
  -- mode a DEFAULTed parameter creates, and PostgREST reports it as a 300.
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'operation_create_po';
  if v_n <> 1 then
    raise exception '0308 sanity: expected exactly 1 operation_create_po, found %', v_n;
  end if;

  -- Both CHECKs present. They are the enforcement; the RPC guards are only the
  -- courtesy layer that names the failure.
  select count(*) into v_n
    from pg_constraint
   where conrelid = 'public.purchase_orders'::regclass
     and conname in (
       'purchase_orders_reason_not_blank',
       'purchase_orders_manual_has_no_customer_order'
     );
  if v_n <> 2 then
    raise exception '0308 sanity: expected 2 reason CHECKs, found %', v_n;
  end if;

  -- No `origin` column, ever. The card rules it out and a later hand may not
  -- add one back without deciding what happens when it disagrees with the
  -- reason and the customer order.
  perform 1 from information_schema.columns
   where table_schema = 'public' and table_name = 'purchase_orders'
     and column_name = 'origin';
  if found then
    raise exception '0308 sanity: purchase_orders.origin exists — the card forbids it';
  end if;
end $$;

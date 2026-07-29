-- 0308_manual_purchase_states_its_reason
--
-- Manual Purchase leaves To Order and gets its own door on the Purchase Orders
-- tab. The boundary between a CUSTOMER-DRIVEN purchase order and a MANUAL
-- purchase stops being a convention and becomes a database rule.
--
-- Business rules made structural here (frozen, Loo 2026-07-29):
--   · a manual purchase ALWAYS states a reason
--   · a customer-driven PO carries NO purchase reason
--   · a PO with a purchase reason can never carry `so` or `so_refs`
--   · once a reason is set it may be CHANGED, never CLEARED
--
-- ============================================================================
-- THERE IS NO `origin` COLUMN, AND ONE MAY NOT BE ADDED.
-- ============================================================================
-- An `origin text` column was proposed, challenged by Loo, and WITHDRAWN after
-- review. `reason_code IS NOT NULL` *is* "this is a manual purchase" — not by
-- convention but by the frozen rules themselves:
--   · manual purchasing requires a reason            (frozen business rule 7)
--   · a customer-driven PO's justification IS the customer order, so it has
--     no purchase reason                             (PURCHASING-WORKING-FLOW §3)
-- The two statements are a biconditional, so a second column would encode a
-- fact the first already encodes — the exact failure
-- `docs/PURCHASING-INFORMATION-MODEL.md` §2 names ("two truths in one list is
-- how a number quietly stops being true"), and the one `ops_order_control.
-- balance` already cost this codebase.
--
-- The review also measured why the distinction cannot be DERIVED from the
-- existing structure: `Send separately` (OperationPurchase.tsx) raises a
-- genuinely customer-driven PO carrying neither `so` nor `so_refs`, so
-- "both null ⟹ manual" misclassifies a live path.
--
-- And it found the argument that decides it: `operation_issue_pos_for_order`
-- is a THIRD writer of `purchase_orders` (called from the Orders route). A
-- NOT NULL `origin` with no default would have thrown 23502 there — a 500 in a
-- live customer path. It writes no reason, so under this design it is correctly
-- customer-driven and is NOT TOUCHED by this migration.
--
-- WORDS: `reason_code` is FREE TEXT for this implementation (Loo, 2026-07-29 —
-- Decision B deferred). A controlled dictionary replaces it later as a CHECK
-- mirroring a shared constant. Nothing here presumes its values, and no
-- allowed-value list is invented.
--
-- DELIBERATELY NOT HERE: no origin column · no reason dictionary · no
-- destination work (0307 is frozen) · no Draft PO · no Region E · no Receiving
-- · no Claims · no rename of any existing word.
--
-- NO BACKFILL, and none is possible: `purchase_orders` holds 0 rows (measured
-- immediately before this migration was written). Both columns are additive and
-- nullable, so there is no transitional state to manage.

-- ============================================================================
-- 1 · The reason store
-- ============================================================================
-- Nullable ON PURPOSE. NULL is not a missing value here — it is the statement
-- "this PO came from a customer order", which is the majority case and the one
-- every existing writer already produces.

alter table public.purchase_orders
  add column if not exists reason_code text,
  add column if not exists reason_note text;

comment on column public.purchase_orders.reason_code is
  'Why this was bought when no customer order asked for it. NOT NULL <=> this is a manual purchase — it is the SOLE stored marker of that fact, which is why 0308 forbids clearing it. Free text until the reason dictionary lands.';
comment on column public.purchase_orders.reason_note is
  'Optional free-text detail beside reason_code. Never a substitute for it.';

-- ============================================================================
-- 2 · A purchase reason is a real reason
-- ============================================================================
-- Without this, an empty string would be a manual purchase that states nothing,
-- and the marker would be true while the requirement behind it is not.

alter table public.purchase_orders
  drop constraint if exists purchase_orders_reason_not_blank;
alter table public.purchase_orders
  add constraint purchase_orders_reason_not_blank
    check (reason_code is null or length(btrim(reason_code)) > 0);

-- ============================================================================
-- 3 · A manual purchase never originates from a customer order
-- ============================================================================
-- BOTH columns are named, and that is load-bearing: the two customer-driven
-- writers record the same fact differently — `_operation_create_po_inner`
-- writes `so_refs`, `operation_issue_pos_for_order` writes `so`. A check on one
-- would be half a rule.
--
-- A CHECK rather than route code, because `purchase_orders` carries a blanket
-- `po_scoped_update` policy (0002) and PostgREST is a live door. It also
-- re-evaluates on UPDATE, which matters: `operation_create_po` writes `so` in a
-- post-insert UPDATE, so attaching a customer order to a manual PO afterwards
-- is refused at the moment of attachment rather than at insert.

alter table public.purchase_orders
  drop constraint if exists purchase_orders_manual_has_no_customer_order;
alter table public.purchase_orders
  add constraint purchase_orders_manual_has_no_customer_order
    check (
      reason_code is null
      or (so is null and coalesce(cardinality(so_refs), 0) = 0)
    );

-- ============================================================================
-- 4 · The reason may be changed. It may never be cleared.
-- ============================================================================
-- Required by Loo 2026-07-29, and it is the direct consequence of there being
-- no `origin` column: `reason_code` is the SOLE stored marker of a manual
-- purchase, so clearing it would silently convert a manual purchase into a
-- customer-driven PO that has no customer — destroying the boundary this
-- migration exists to draw.
--
-- A TRIGGER rather than a CHECK because the rule is about the TRANSITION
-- (old vs new), which a CHECK cannot see.
--
-- The WHEN clause means it costs nothing on the rows that do not have a reason,
-- which today is all of them and tomorrow will be nearly all of them.

create or replace function public.trg_po_reason_never_cleared()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $fn$
begin
  if new.reason_code is null or length(btrim(new.reason_code)) = 0 then
    raise exception
      'a purchase reason may be changed but never removed (PO %)', old.id
      using errcode = '22023', detail = 'reason_cannot_be_cleared';
  end if;
  return new;
end;
$fn$;

drop trigger if exists po_reason_never_cleared on public.purchase_orders;
create trigger po_reason_never_cleared
  before update on public.purchase_orders
  for each row
  when (old.reason_code is not null)
  execute function public.trg_po_reason_never_cleared();

-- ============================================================================
-- 5 · operation_create_po — DROP + CREATE, never an added defaulted parameter
-- ============================================================================
-- CLAUDE.md rule 8: adding DEFAULTED parameters to a live RPC creates a SECOND
-- signature. The old one is dropped and the verification asserts exactly one
-- survives.
--
-- The reason is written by a post-insert UPDATE inside the function, exactly
-- as `p_so` already is. Inside a plpgsql function that is ONE transaction, so
-- the PO and its reason land together or not at all — this is not the
-- API-level two-step that `eta_date` does in pos.ts.

drop function if exists public.operation_create_po(uuid, uuid, jsonb, integer, integer[], uuid);

create function public.operation_create_po(
  p_supplier_id            uuid,
  p_warehouse_id           uuid,
  p_lines                  jsonb,
  p_so                     integer   default null,
  p_so_refs                integer[] default null,
  p_procurement_partner_id uuid      default null,
  p_reason_code            text      default null,
  p_reason_note            text      default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
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
$fn$;

-- Grants restored to exactly what the dropped function carried. The gate is the
-- internal `is_operation()` call, not the grant — unchanged, and not this
-- card's to narrow.
grant execute on function public.operation_create_po(
  uuid, uuid, jsonb, integer, integer[], uuid, text, text
) to anon, authenticated, service_role;

-- ============================================================================
-- 6 · operation_create_pos_batch — same signature, new keys
-- ============================================================================
-- NO DROP needed and none is done: the signature is `(p_pos jsonb)` and stays
-- `(p_pos jsonb)`, so CREATE OR REPLACE cannot mint a second signature. The
-- reason travels as two more keys on each entry.
--
-- The reason write sits INSIDE the per-PO exception block so a boundary
-- violation still carries the `pos_index=N` hint the FE reads for per-row
-- feedback.

create or replace function public.operation_create_pos_batch(p_pos jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
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
$fn$;

grant execute on function public.operation_create_pos_batch(jsonb)
  to anon, authenticated, service_role;

-- ============================================================================
-- 7 · Sanity — this migration must not have invented an origin column
-- ============================================================================
-- The one rule a later hand is most likely to "helpfully" add back. It fails
-- the migration rather than living as a comment nobody reads.

do $chk$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'purchase_orders'
       and column_name  = 'origin'
  ) then
    raise exception
      'purchase_orders.origin exists — 0308 rules it out: reason_code IS NOT NULL is the marker';
  end if;
end $chk$;

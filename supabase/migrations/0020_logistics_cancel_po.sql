-- =============================================================================
-- 0020_logistics_cancel_po.sql — Phase 4 M3 procurement: cancel-PO RPC
-- =============================================================================
-- Source spec: docs/superpowers/specs/2026-05-03-phase-4-logistics-design.md
--   §7  — listed cancel PO endpoint (line 258 "cancel PO (status=open only)")
--   §17 — RPC pattern, SQLSTATE error contract (CQ2)
--
-- Why this migration exists:
--   M1 spec listed `POST /api/logistics/pos/:id/cancel` but the corresponding
--   RPC was not in 0019's function set. Loo confirmed 2026-05-03: add the RPC
--   in M3 (option B from the M3 brainstorm — full RPC pattern, no direct UPDATE).
--
-- Pattern (matches 0019 exactly):
--   - SECURITY DEFINER + manual is_logistics() guard
--   - SQLSTATE codes per §17.5 CQ2:
--       42501 forbidden / 42P01 not_found / 22023 wrong_status /
--       P0001 reason_required
--   - Reason text required (matches abandon_order pattern from 0019)
--   - audit_log entry mirrors 0019's logistics PO-related entries:
--     (role, actor_text, action, dealer_id, ref)
--   - revoke from public + grant to authenticated (Phase 3 0013 pattern)
--
-- No stock effects: PO is for future stock that hasn't arrived yet. Cancelling
-- doesn't release any reserved stock_balances. Awaiting_stock orders waiting on
-- this PO will stay in awaiting_stock — logistics needs to issue a fresh PO or
-- abandon the order via existing logistics_abandon_order RPC.
-- =============================================================================

create or replace function public.logistics_cancel_po(
  p_po_id text,
  p_reason text
)
returns purchase_orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_po        purchase_orders;
  v_dealer_id uuid;
  v_actor     text;
begin
  -- 1. Role guard
  if not public.is_logistics() then
    raise exception 'forbidden: logistics role required'
      using errcode = '42501', detail = 'forbidden';
  end if;

  -- 2. Reason required (mirrors abandon_order pattern in 0019 line 1351-1354)
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reason required'
      using errcode = 'P0001', detail = 'reason_required';
  end if;

  -- 3. Fetch PO
  select * into v_po from purchase_orders where id = p_po_id;
  if not found then
    raise exception 'PO not found: %', p_po_id
      using errcode = '42P01', detail = 'po_not_found';
  end if;

  -- 4. State machine: only open POs can be cancelled (spec §7 line 258)
  if v_po.status <> 'open' then
    raise exception 'PO is not open (current status: %)', v_po.status
      using errcode = '22023', detail = 'wrong_status';
  end if;

  -- 5. Derive dealer_id for audit_log (matches 0019 receive-line pattern at
  --    line 811: pull from orders by dl, LIMIT 1; null when PO is stock-only
  --    with no dl).
  if v_po.dl is not null then
    select dealer_id into v_dealer_id
      from orders where dl = v_po.dl
      limit 1;
  end if;

  -- 6. Resolve actor name for audit_log (mirrors 0019 line 539 / 710 / etc.)
  v_actor := coalesce((select name from app_users where id = auth.uid()), 'Logistics');

  -- 7. Cancel
  update purchase_orders
    set status = 'cancelled',
        updated_at = now()
    where id = p_po_id
    returning * into v_po;

  -- 8. Audit (column shape matches 0019 logistics RPC inserts:
  --    role, actor_text, action, dealer_id, ref)
  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values (
    'logistics',
    v_actor,
    format('Cancelled PO %s · %s', p_po_id, p_reason),
    v_dealer_id,
    p_po_id
  );

  return v_po;
end;
$$;

revoke all on function public.logistics_cancel_po(text, text) from public;
grant execute on function public.logistics_cancel_po(text, text) to authenticated;

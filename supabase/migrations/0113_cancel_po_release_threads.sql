-- 0113 — logistics_cancel_po also releases claimed threads
--
-- Bug surfaced (Loo 2026-05-16):
--
-- The cancel RPC at 0020 only flips `purchase_orders.status` to 'cancelled'.
-- It does NOT touch `order_supplier_threads.po_id`. Threads claimed by the
-- cancelled PO keep pointing at it, which the race guard in
-- `_v3_claim_threads_for_po` (0037) treats as still-claimed:
--
--   select count(*) into v_already_claimed
--     from order_supplier_threads
--    where supplier_id = v_po.supplier_id
--      and po_id is not null              -- <-- doesn't check PO status
--      and order_id in (...);
--
-- Net effect: cancelling a PO and trying to re-bundle its DLs into a new PO
-- raises `40001 concurrent_claim` and the operator has no way to recover
-- through the UI — the DLs are stuck on a tombstoned PO forever. This was
-- caught when Loo cancelled PO-2031 to re-bundle DL #1001-#1004 and the
-- new bundle hit the race guard on the now-orphan threads.
--
-- Fix: release `po_id` back to NULL inside the same txn as the cancel. The
-- cancel only succeeds if `status='open'` (existing guard at the top of the
-- function) — and at status='open' the supplier has not started anything,
-- so detaching the threads is safe by construction. Higher-state cancels
-- (received / etc.) are not allowed by this RPC and are not affected.

create or replace function public.logistics_cancel_po(p_po_id text, p_reason text)
returns purchase_orders
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_po               purchase_orders;
  v_dealer_id        uuid;
  v_actor            text;
  v_threads_released int;
begin
  if not public.is_logistics() then
    raise exception 'forbidden: logistics role required'
      using errcode = '42501', detail = 'forbidden';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reason required'
      using errcode = 'P0001', detail = 'reason_required';
  end if;

  select * into v_po from purchase_orders where id = p_po_id;
  if not found then
    raise exception 'PO not found: %', p_po_id
      using errcode = '42P01', detail = 'po_not_found';
  end if;

  if v_po.status <> 'open' then
    raise exception 'PO is not open (current status: %)', v_po.status
      using errcode = '22023', detail = 'wrong_status';
  end if;

  if v_po.dl is not null then
    select dealer_id into v_dealer_id
      from orders where dl = v_po.dl
      limit 1;
  end if;

  v_actor := coalesce((select name from app_users where id = auth.uid()), 'Logistics');

  update purchase_orders
    set status = 'cancelled',
        updated_at = now()
    where id = p_po_id
    returning * into v_po;

  -- Release claimed threads so the same DLs can be re-bundled into a new PO.
  -- See migration header for the race-guard rationale.
  update order_supplier_threads
     set po_id = null
   where po_id = p_po_id;
  get diagnostics v_threads_released = row_count;

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values (
    'logistics',
    v_actor,
    format('Cancelled PO %s · %s threads released · %s',
           p_po_id, v_threads_released, p_reason),
    v_dealer_id,
    p_po_id
  );

  return v_po;
end;
$function$;

-- 0720 · Office staff open a Consignment Order with no source, the Houzs way.
--
-- Weisiang's decision (Mr Lim, WhatsApp 2026-10-22, relayed by YH 2026-10-23):
-- "I think just clear Carress rules and Implement Houzs inside". Houzs's
-- Purchase Consignment Order is a blank form with prices. This overturns
-- Jess's "no blank order that bypasses its source" and "cloned business
-- writers rejected" (docs/purchasing/MASTER.md §9.9 and the capability matrix);
-- Jess was not part of this decision.
-- Follows Houzs frontend/src/pages/scm-v2/PurchaseConsignmentOrderNew.tsx:2-10
-- (blank Create form, priced lines) per Weisiang's ruling (2026-10-22): clear Carres rules, implement Houzs.
--
-- NOT a second creation engine. A Carres Consignment Order is a purchase order
-- with `is_consignment` set (0426). This door calls the ONE creation authority
-- `purchasing_issue_pos_batch` unchanged — actor gate, supplier truth, price
-- gate, Deliver To check, numbering and per-piece Unit ID birth all apply —
-- and then, in the same transaction, marks exactly the orders it just issued
-- as consignment. Receiving already turns their Units supplier-owned when they
-- arrive (0698) and Finance already refuses to bill a consignment receipt (0570).

create or replace function public.purchasing_issue_consignment_order(p_pos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_result jsonb;
  v_ids text[];
begin
  v_result := public.purchasing_issue_pos_batch(p_pos);
  select array_agg(x) into v_ids from jsonb_array_elements_text(coalesce(v_result->'po_ids', '[]'::jsonb)) x;
  if coalesce(array_length(v_ids, 1), 0) = 0 then
    return v_result;
  end if;
  update public.purchase_orders set is_consignment = true where id = any(v_ids);
  return v_result;
end;
$function$;

revoke all on function public.purchasing_issue_consignment_order(jsonb) from public, anon;
grant execute on function public.purchasing_issue_consignment_order(jsonb) to authenticated;

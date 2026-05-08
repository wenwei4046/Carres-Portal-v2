-- Phase 5 Chunk A — finance_ap_aging RPC.
-- Spec: docs/superpowers/specs/2026-05-08-phase-5-finance-spec.md §5.5 + §6.2
--
-- Counterpart to finance_ar_aging (0062): single-RPC payload that returns
-- BOTH the per-PO row list AND the bucket aggregates so FinanceDashboard
-- and FinanceAP never disagree.
--
-- Key derivation: pay_status_ui is a 5-value UI bucket (matched, scheduled,
-- paid, in_transit, in_production) computed from purchase_orders.status,
-- sup_status, pay_status. The DB column purchase_orders.pay_status is a
-- 3-value enum (unpaid|scheduled|paid). The proto's "matched" state is the
-- 3-way-match-passed bucket: status='received' with pay_status='unpaid'.
--
-- po_status enum is { open | received | cancelled }. There is NO 'dispatched'
-- value at the order level; 'dispatched' lives only conceptually as part of
-- the sup_status flow. po_sup_status enum has 17 values bucketed below into
-- pre-shipment vs shipment-in-motion.
--
-- Mapping (precedence top to bottom):
--   pay_status='paid'                                      -> 'paid'
--   pay_status='scheduled'                                 -> 'scheduled'
--   status='received'  AND pay_status='unpaid'             -> 'matched'
--   sup_status in pre-shipment set                         -> 'in_production'
--   else (sup_status in shipment-in-motion set)            -> 'in_transit'
--
-- Pre-shipment sup_status set:
--   pending, acknowledged, in_production, reassign_needed,
--   ready_confirm_sent, customer_rejected, ready_for_pickup
-- Shipment-in-motion sup_status set (everything else):
--   shipped, delivered, pickup_assigned, pickup_accepted, picked_up,
--   partner_confirmed, relocated, at_partner_wh, at_own_wh_waiting,
--   at_warehouse_waiting
--
-- Returned shape:
--   {
--     "rows": [
--       { po_id, dl, supplier_id, supplier_name, placed_at, eta_date,
--         expected_ready_date, status, sup_status, pay_status,
--         pay_status_ui, qty, total, lines, do_number, has_do,
--         history, due_in }, ...
--     ],
--     "byPayStatus": {
--       "matched":       { amount, count },
--       "scheduled":     { amount, count },
--       "paid":          { amount, count },
--       "in_transit":    { amount, count },
--       "in_production": { amount, count }
--     }
--   }
--
-- total = sum(purchase_order_lines.cost * qty). NULL costs treated as 0
-- (matches finance_dashboard_summary's AP derivation in 0062:430-438).
-- qty   = sum of line qtys.
-- lines = jsonb array of {sku, sku_name, qty, received_qty, unit_cost,
--         line_total} sorted by sku ascending. sku_name = model.name ||
--         ' · ' || skus.variant when both joins resolve, else raw sku.
-- do_number = most recent po_receipts row's do_number for this PO (or
--             null if no receipt yet — drives the 3-way match's "DO" pill).
-- history = jsonb array of {text, occurred_at, by_role} sorted occurred_at
--           desc. Drives the APDrawer "PO history" card.
-- due_in  = days until eta_date (or expected_ready_date if eta missing).
--           Negative = overdue. Null = neither date set.
--
-- Sort order: matched first (ready to pay, ops priority), then scheduled,
-- in_transit, in_production, paid (least urgent). Within each bucket sort
-- by placed_at desc so newest POs surface first.
--
-- STABLE: read-only against purchase_orders, purchase_order_lines,
-- po_history, po_receipts, suppliers, product_skus, product_models.
-- security definer + finance/principal gate matches the rest of 0062.

create or replace function public.finance_ap_aging()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if public.app_role() not in ('finance','principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with po_lines_agg as (
    select
      pol.po_id,
      jsonb_agg(
        jsonb_build_object(
          'sku',          pol.sku,
          'sku_name',     coalesce(pm.name || ' · ' || ps.variant, pol.sku),
          'qty',          pol.qty,
          'received_qty', pol.received_qty,
          'unit_cost',    pol.cost,
          'line_total',   coalesce(pol.cost, 0) * pol.qty
        )
        order by pol.sku
      )                                                    as lines,
      sum(pol.qty)::int                                    as total_qty,
      sum(coalesce(pol.cost, 0) * pol.qty)::numeric(14,2)  as total_cost
    from purchase_order_lines pol
    left join product_skus    ps on ps.sku      = pol.sku
    left join product_models  pm on pm.id       = ps.model_id
    group by pol.po_id
  ),
  po_history_agg as (
    select
      ph.po_id,
      jsonb_agg(
        jsonb_build_object(
          'text',        ph.text,
          'occurred_at', ph.occurred_at,
          'by_role',     ph.by_role
        )
        order by ph.occurred_at desc
      ) as history
    from po_history ph
    group by ph.po_id
  ),
  po_receipts_agg as (
    -- Latest receipt per PO drives the "DO" pill in the 3-way match card.
    -- Multi-line / partial-receive POs may have multiple rows in po_receipts;
    -- the page only needs ONE do_number for the match badge, so take the
    -- newest by received_at.
    select distinct on (pr.po_id)
      pr.po_id,
      pr.do_number,
      pr.received_at
    from po_receipts pr
    order by pr.po_id, pr.received_at desc
  ),
  rows_cte as (
    select
      po.id                                                as po_id,
      po.dl,
      po.supplier_id,
      sup.name                                             as supplier_name,
      po.warehouse_id,
      po.delivery_partner_id,
      po.placed_at,
      po.expected_ready_date,
      po.eta_date,
      po.pickup_date,
      po.status,
      po.sup_status,
      po.pay_status,
      coalesce(pla.lines, '[]'::jsonb)                     as lines,
      coalesce(pla.total_qty, 0)                           as qty,
      coalesce(pla.total_cost, 0)::numeric(14,2)           as total,
      pra.do_number,
      (pra.do_number is not null)                          as has_do,
      coalesce(pha.history, '[]'::jsonb)                   as history,
      case
        when po.eta_date is not null
          then (po.eta_date - current_date)::int
        when po.expected_ready_date is not null
          then (po.expected_ready_date - current_date)::int
        else null
      end                                                  as due_in,
      case
        when po.pay_status = 'paid'                                   then 'paid'
        when po.pay_status = 'scheduled'                              then 'scheduled'
        when po.status     = 'received' and po.pay_status = 'unpaid'  then 'matched'
        when po.sup_status in ('pending','acknowledged','in_production',
                               'reassign_needed','ready_confirm_sent',
                               'customer_rejected','ready_for_pickup') then 'in_production'
        else                                                                'in_transit'
      end                                                  as pay_status_ui
    from purchase_orders po
    left join suppliers       sup on sup.id    = po.supplier_id
    left join po_lines_agg    pla on pla.po_id = po.id
    left join po_history_agg  pha on pha.po_id = po.id
    left join po_receipts_agg pra on pra.po_id = po.id
    where po.status <> 'cancelled'
  )
  select jsonb_build_object(
    'rows', coalesce(
      (select jsonb_agg(
         to_jsonb(r)
         order by
           case r.pay_status_ui
             when 'matched'       then 0
             when 'scheduled'     then 1
             when 'in_transit'    then 2
             when 'in_production' then 3
             when 'paid'          then 4
             else 5
           end,
           r.placed_at desc
       )
       from rows_cte r),
      '[]'::jsonb),
    'byPayStatus', jsonb_build_object(
      'matched',       (select jsonb_build_object('amount', coalesce(sum(total), 0),
                                                   'count',  count(*))
                          from rows_cte where pay_status_ui = 'matched'),
      'scheduled',     (select jsonb_build_object('amount', coalesce(sum(total), 0),
                                                   'count',  count(*))
                          from rows_cte where pay_status_ui = 'scheduled'),
      'paid',          (select jsonb_build_object('amount', coalesce(sum(total), 0),
                                                   'count',  count(*))
                          from rows_cte where pay_status_ui = 'paid'),
      'in_transit',    (select jsonb_build_object('amount', coalesce(sum(total), 0),
                                                   'count',  count(*))
                          from rows_cte where pay_status_ui = 'in_transit'),
      'in_production', (select jsonb_build_object('amount', coalesce(sum(total), 0),
                                                   'count',  count(*))
                          from rows_cte where pay_status_ui = 'in_production')
    )
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.finance_ap_aging() from public;
grant execute on function public.finance_ap_aging() to authenticated;

-- =============================================================================
-- finance_po_pay — finance pays out a supplier PO (3-way matched / advance)
-- =============================================================================
-- Atomically:
--   1. Locks the purchase_orders row (FOR UPDATE).
--   2. Inserts payments(direction='out', po_id, amount, method, reference,
--      paid_at=current_date, recorded_by=auth.uid()).
--   3. Updates purchase_orders.pay_status='paid', updated_at=now().
--   4. Audit-logs.
--
-- Race protection: row lock + status check rejects double-pay
-- (pay_status='paid' already). Caller may pay before the 3-way match
-- (advance payment); the API layer trusts the caller's UI gate. There is
-- no schedule_for column to clear since we don't store one.
--
-- Returns the new payments row (mirrors finance_record_receipt's contract
-- in 0062). 0046_partner_role_rls trigger allows finance/principal to
-- mutate pay_status via SECURITY DEFINER bypass.
create or replace function public.finance_po_pay(
  p_po_id     text,
  p_amount    numeric,
  p_method    payment_method,
  p_reference text
) returns payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_po  purchase_orders;
  v_pay payments;
begin
  if public.app_role() not in ('finance','principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive' using errcode = '22023';
  end if;

  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'purchase order not found' using errcode = 'P0002';
  end if;

  if v_po.pay_status = 'paid' then
    raise exception 'po already paid' using errcode = '22023';
  end if;

  insert into payments (direction, amount, method, reference,
                        paid_at, po_id, recorded_by)
  values ('out', p_amount, p_method, p_reference,
          current_date, p_po_id, auth.uid())
  returning * into v_pay;

  update purchase_orders
     set pay_status = 'paid',
         updated_at = now()
   where id = p_po_id;

  insert into audit_log (role, actor_text, action, ref)
  values (public.app_role(),
          (select name from app_users where id = auth.uid()),
          format('PO paid · RM %s · %s · %s', p_amount, p_method, p_po_id),
          p_reference);

  return v_pay;
end;
$$;

revoke all on function public.finance_po_pay(text, numeric, payment_method, text) from public;
grant execute on function public.finance_po_pay(text, numeric, payment_method, text) to authenticated;

-- =============================================================================
-- finance_po_schedule — finance schedules a future payment for a PO
-- =============================================================================
-- Flips purchase_orders.pay_status from 'unpaid' to 'scheduled'. No row in
-- payments is created (the actual payment lands later via finance_po_pay).
-- p_scheduled_for is captured in the audit log only — V1 doesn't store the
-- planned date on purchase_orders.
--
-- Race protection: row lock + status check rejects re-scheduling (must be
-- unpaid). Already-scheduled or paid POs raise ERRCODE 22023.
create or replace function public.finance_po_schedule(
  p_po_id          text,
  p_scheduled_for  date
) returns purchase_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_po purchase_orders;
begin
  if public.app_role() not in ('finance','principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'purchase order not found' using errcode = 'P0002';
  end if;

  if v_po.pay_status <> 'unpaid' then
    raise exception 'cannot schedule (current pay_status: %)', v_po.pay_status
      using errcode = '22023';
  end if;

  update purchase_orders
     set pay_status = 'scheduled',
         updated_at = now()
   where id = p_po_id
   returning * into v_po;

  insert into audit_log (role, actor_text, action, ref)
  values (public.app_role(),
          (select name from app_users where id = auth.uid()),
          format('PO scheduled · %s · %s', p_po_id,
                 coalesce(p_scheduled_for::text, 'no date')),
          p_po_id);

  return v_po;
end;
$$;

revoke all on function public.finance_po_schedule(text, date) from public;
grant execute on function public.finance_po_schedule(text, date) to authenticated;

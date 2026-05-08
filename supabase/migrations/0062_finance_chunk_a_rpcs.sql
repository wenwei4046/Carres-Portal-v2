-- Phase 5 Chunk A foundation — 5 finance RPCs.
-- Spec: docs/superpowers/specs/2026-05-08-phase-5-finance-spec.md §6.2
--
-- Locked decisions reflected here:
--   Q1=A — finance_topup_approve is a wrapper RPC (does NOT modify the
--          deployed 0016 approval_decide). It approves the approval row
--          AND records the payment AND bumps deposit_balance in a single
--          transaction. If a top_up approval is auto-decided via the
--          existing approval_decide path, no payment is recorded — that
--          path is for the non-finance happy path that currently does not
--          exist (and won't be exposed by Phase 5 finance UI).
--   Q6=A — finance_ar_aging returns BOTH rows AND bucket aggregates in a
--          single jsonb shape so the dashboard / AR page never disagree.
--
-- Why all 5 in one migration: they share the same role-gate prelude and
-- their tests can run as one suite. The two read-only ones are STABLE so
-- the planner can cache them per snapshot. The three writers are plpgsql
-- with FOR UPDATE row locks to prevent double-spend / double-receipt /
-- double-pay races.
--
-- Permissions: all functions REVOKE from public, GRANT EXECUTE to
-- authenticated. The role gate inside each function enforces finance /
-- principal — anyone else gets ERRCODE 42501 (forbidden).
--
-- Idempotent: CREATE OR REPLACE FUNCTION on every function. The DROP +
-- recreate dance is unnecessary because none of these RPCs change their
-- signature in this migration.

-- =============================================================================
-- 1. finance_topup_approve — Q1=A — wraps approval_decide + dealer_topup
-- =============================================================================
-- One-shot finance approval of a top_up approval row. Atomically:
--   1. Locks the approval row (FOR UPDATE) and verifies kind=top_up,
--      status=pending, dealer_id present, amount > 0.
--   2. Marks approval approved with decision_note "Top-up approved · {method}
--      · {reference|—}".
--   3. Inserts payments (direction='in', amount=approval.amount, recorded_by
--      =auth.uid).
--   4. Bumps dealers.deposit_balance += amount.
--   5. Audit-logs.
--
-- Race protection: row lock on approvals + the status check. A second
-- caller against the same approval_id will see status='approved' and
-- raise ERRCODE 22023.
--
-- Returns the new payments row (mirrors dealer_topup's contract from 0003).
create or replace function public.finance_topup_approve(
  p_approval_id uuid,
  p_method      payment_method,
  p_reference   text,
  p_receipt_url text
) returns payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app approvals;
  v_pay payments;
begin
  if public.app_role() not in ('finance','principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_app from approvals where id = p_approval_id for update;
  if not found then
    raise exception 'approval not found' using errcode = 'P0002';
  end if;

  if v_app.kind <> 'top_up' then
    raise exception 'approval kind must be top_up, got %', v_app.kind
      using errcode = '22023';
  end if;

  if v_app.status <> 'pending' then
    raise exception 'approval already decided (status %)', v_app.status
      using errcode = '22023';
  end if;

  if v_app.dealer_id is null then
    raise exception 'approval missing dealer_id' using errcode = '23502';
  end if;

  if v_app.amount is null or v_app.amount <= 0 then
    raise exception 'approval amount must be positive' using errcode = '22023';
  end if;

  update approvals
     set status        = 'approved',
         decided_at    = now(),
         decided_by    = auth.uid(),
         decision_note = format('Top-up approved · %s · %s',
                                p_method,
                                coalesce(p_reference, '—'))
   where id = p_approval_id;

  insert into payments (direction, amount, method, reference,
                        paid_at, receipt_url, recorded_by)
  values ('in', v_app.amount, p_method, p_reference,
          current_date, p_receipt_url, auth.uid())
  returning * into v_pay;

  update dealers
     set deposit_balance = deposit_balance + v_app.amount,
         updated_at      = now()
   where id = v_app.dealer_id;

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values (public.app_role(),
          (select name from app_users where id = auth.uid()),
          format('Top-up approve · RM %s · %s', v_app.amount, p_method),
          v_app.dealer_id,
          p_reference);

  return v_pay;
end;
$$;

revoke all on function public.finance_topup_approve(uuid, payment_method, text, text) from public;
grant execute on function public.finance_topup_approve(uuid, payment_method, text, text) to authenticated;

-- =============================================================================
-- 2. finance_record_receipt — AR drawer Record receipt
-- =============================================================================
-- Records an inbound payment against a customer order. Atomically:
--   1. Locks the order row (FOR UPDATE) and verifies it exists.
--   2. Inserts payments (direction='in', order_id, amount, recorded_by
--      =auth.uid).
--   3. Bumps orders.paid += amount.
--   4. Audit-logs with dealer_id from the order + DL ref.
--
-- Does NOT cap orders.paid at total — overpayment is allowed and surfaces
-- in AR as outstanding=0 (or negative if the implementation later adds
-- reverse handling). Phase 5 V1 doesn't auto-credit overpayment; that's
-- a Phase 9 item.
create or replace function public.finance_record_receipt(
  p_order_id  uuid,
  p_amount    numeric,
  p_method    payment_method,
  p_reference text
) returns payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay       payments;
  v_dl        int;
  v_dealer_id uuid;
begin
  if public.app_role() not in ('finance','principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive' using errcode = '22023';
  end if;

  select dl, dealer_id into v_dl, v_dealer_id
    from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  insert into payments (direction, amount, method, reference,
                        paid_at, order_id, recorded_by)
  values ('in', p_amount, p_method, p_reference,
          current_date, p_order_id, auth.uid())
  returning * into v_pay;

  update orders set paid = paid + p_amount where id = p_order_id;

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values (public.app_role(),
          (select name from app_users where id = auth.uid()),
          format('Receipt · RM %s · %s · DL-%s', p_amount, p_method, v_dl),
          v_dealer_id,
          format('DL-%s', v_dl));

  return v_pay;
end;
$$;

revoke all on function public.finance_record_receipt(uuid, numeric, payment_method, text) from public;
grant execute on function public.finance_record_receipt(uuid, numeric, payment_method, text) to authenticated;

-- =============================================================================
-- 3. refund_pay — finance pays out an approved refund
-- =============================================================================
-- Marks an approved refund as paid AND records the outbound payment.
-- Atomically:
--   1. Locks the refund row (FOR UPDATE) and verifies status='approved'.
--   2. Inserts payments (direction='out', refund_id, amount, recorded_by
--      =auth.uid).
--   3. Updates refunds.status='paid' + paid_at=now().
--   4. Audit-logs with refund.dealer_id + reference.
--
-- Race protection: status check rejects double-pay. Caller must approve
-- the refund first via approval_decide kind=refund (which 0016 already
-- handles).
create or replace function public.refund_pay(
  p_refund_id uuid,
  p_method    payment_method,
  p_reference text
) returns refunds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref refunds;
begin
  if public.app_role() not in ('finance','principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_ref from refunds where id = p_refund_id for update;
  if not found then
    raise exception 'refund not found' using errcode = 'P0002';
  end if;

  if v_ref.status <> 'approved' then
    raise exception 'refund must be approved before pay (status %)', v_ref.status
      using errcode = '22023';
  end if;

  insert into payments (direction, amount, method, reference,
                        paid_at, refund_id, recorded_by)
  values ('out', v_ref.amount, p_method, p_reference,
          current_date, p_refund_id, auth.uid());

  update refunds
     set status  = 'paid',
         paid_at = now()
   where id = p_refund_id
   returning * into v_ref;

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values (public.app_role(),
          (select name from app_users where id = auth.uid()),
          format('Refund paid · RM %s · %s', v_ref.amount, p_method),
          v_ref.dealer_id,
          p_reference);

  return v_ref;
end;
$$;

revoke all on function public.refund_pay(uuid, payment_method, text) from public;
grant execute on function public.refund_pay(uuid, payment_method, text) to authenticated;

-- =============================================================================
-- 4. finance_ar_aging — Q6=A — single RPC returns rows + bucket totals
-- =============================================================================
-- Per-order outstanding aging. Returns:
--   {
--     "rows": [
--       { order_id, dl, customer_name, dealer_id, dealer_name,
--         placed_at, days, aging, total, paid, outstanding,
--         invoice_no, status }, ...
--     ],
--     "buckets": {
--       "0-30":  { "amount": <num>, "count": <int> },
--       "31-60": { "amount": <num>, "count": <int> },
--       "61-90": { "amount": <num>, "count": <int> },
--       "90+":   { "amount": <num>, "count": <int> }
--     }
--   }
--
-- total = sum(order_lines.unit_price * qty) + sum(order_addons.unit_price * qty).
-- aging buckets are inclusive at the upper bound (0-30 means 0..30 days,
-- 31-60 means 31..60). Bucket aggregates only count outstanding > 0 rows.
-- Rows array includes settled rows too so the AR page's status filter
-- can show "Settled" without a second round-trip.
--
-- Sorted by outstanding desc to match proto's `sort((a,b) => b.outstanding
-- - a.outstanding)` (proto: finance-data.jsx:62).
--
-- STABLE: read-only against orders / order_lines / order_addons / dealers.
create or replace function public.finance_ar_aging()
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

  with order_totals as (
    select
      o.id,
      o.dl,
      o.dealer_id,
      o.customer_name,
      o.status,
      o.placed_at,
      o.paid,
      o.invoice_no,
      coalesce((select sum(ol.unit_price * ol.qty)
                from order_lines ol where ol.order_id = o.id), 0) +
      coalesce((select sum(oa.unit_price * oa.qty)
                from order_addons oa where oa.order_id = o.id), 0)
        as total
    from orders o
    where o.status <> 'cancelled'
  ),
  rows_cte as (
    select
      ot.id   as order_id,
      ot.dl,
      ot.customer_name,
      ot.dealer_id,
      d.name  as dealer_name,
      ot.placed_at,
      greatest(0, (current_date - ot.placed_at::date))::int as days,
      case
        when (current_date - ot.placed_at::date) <= 30 then '0-30'
        when (current_date - ot.placed_at::date) <= 60 then '31-60'
        when (current_date - ot.placed_at::date) <= 90 then '61-90'
        else '90+'
      end as aging,
      ot.total,
      ot.paid,
      greatest(0, ot.total - ot.paid)::numeric(14,2) as outstanding,
      coalesce(ot.invoice_no,
               'INV-' || to_char(current_date, 'YYYY') || '-' ||
                 lpad(ot.dl::text, 4, '0')) as invoice_no,
      ot.status
    from order_totals ot
    left join dealers d on d.id = ot.dealer_id
    where ot.total > 0
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(r) order by r.outstanding desc)
                      from rows_cte r), '[]'::jsonb),
    'buckets', jsonb_build_object(
      '0-30',  (select jsonb_build_object('amount', coalesce(sum(outstanding), 0),
                                           'count',  count(*))
                 from rows_cte where aging = '0-30'  and outstanding > 0),
      '31-60', (select jsonb_build_object('amount', coalesce(sum(outstanding), 0),
                                           'count',  count(*))
                 from rows_cte where aging = '31-60' and outstanding > 0),
      '61-90', (select jsonb_build_object('amount', coalesce(sum(outstanding), 0),
                                           'count',  count(*))
                 from rows_cte where aging = '61-90' and outstanding > 0),
      '90+',   (select jsonb_build_object('amount', coalesce(sum(outstanding), 0),
                                           'count',  count(*))
                 from rows_cte where aging = '90+'   and outstanding > 0)
    )
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.finance_ar_aging() from public;
grant execute on function public.finance_ar_aging() to authenticated;

-- =============================================================================
-- 5. finance_dashboard_summary — single-RPC dashboard payload
-- =============================================================================
-- Aggregate KPI payload for FinanceDashboard:
--   {
--     "ar":           { outstanding, count, overdueAmt, overdueCount },
--     "ap":           { dueAmt, count },
--     "cashflow12w":  { inflow, outflow, net },
--     "agingBuckets": { same as finance_ar_aging.buckets }
--   }
--
-- AR / agingBuckets are sourced from finance_ar_aging() (one query, four
-- buckets). Overdue = sum of 31-60, 61-90, 90+ buckets.
--
-- AP = POs that are received OR sup_status=delivered (matches proto's
-- `payStatus = 'matched'` derivation in finance-data.jsx:97). Cost from
-- purchase_order_lines.cost (added in 0055). NULL costs are treated as
-- zero (legacy POs pre-0055; per CQ3 lock NULL is a real value).
--
-- Cashflow 12w = sum of payments by direction within the last 84 days.
-- Reuse this for the cashflow card; the proto's per-week breakdown is
-- a separate RPC (Chunk B).
--
-- STABLE: depends only on tables, not session state beyond app_role.
create or replace function public.finance_dashboard_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_aging         jsonb;
  v_ar_outstand   numeric := 0;
  v_ar_count      int     := 0;
  v_overdue_amt   numeric := 0;
  v_overdue_count int     := 0;
  v_ap_amt        numeric := 0;
  v_ap_count      int     := 0;
  v_cf_in         numeric := 0;
  v_cf_out        numeric := 0;
begin
  if public.app_role() not in ('finance','principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_aging := public.finance_ar_aging();

  -- AR totals across all four buckets
  select coalesce(sum((b.value->>'amount')::numeric), 0),
         coalesce(sum((b.value->>'count')::int),     0)
    into v_ar_outstand, v_ar_count
    from jsonb_each(v_aging->'buckets') b;

  -- Overdue = 31-60 + 61-90 + 90+
  v_overdue_amt   := ((v_aging->'buckets'->'31-60'->>'amount')::numeric)
                   + ((v_aging->'buckets'->'61-90'->>'amount')::numeric)
                   + ((v_aging->'buckets'->'90+'  ->>'amount')::numeric);
  v_overdue_count := ((v_aging->'buckets'->'31-60'->>'count')::int)
                   + ((v_aging->'buckets'->'61-90'->>'count')::int)
                   + ((v_aging->'buckets'->'90+'  ->>'count')::int);

  -- AP — POs received or sup_status=delivered (ready to pay)
  with po_costs as (
    select po.id,
           coalesce(sum(coalesce(pol.cost, 0) * pol.qty), 0)::numeric(14,2) as total
      from purchase_orders po
      left join purchase_order_lines pol on pol.po_id = po.id
     where po.status = 'received' or po.sup_status = 'delivered'
     group by po.id
  )
  select coalesce(sum(total), 0), count(*)
    into v_ap_amt, v_ap_count
    from po_costs;

  -- Cashflow last 12 weeks (84 days)
  select coalesce(sum(case when direction = 'in'  then amount else 0 end), 0),
         coalesce(sum(case when direction = 'out' then amount else 0 end), 0)
    into v_cf_in, v_cf_out
    from payments
   where paid_at >= current_date - interval '84 days';

  return jsonb_build_object(
    'ar',           jsonb_build_object('outstanding',  v_ar_outstand,
                                       'count',         v_ar_count,
                                       'overdueAmt',    v_overdue_amt,
                                       'overdueCount',  v_overdue_count),
    'ap',           jsonb_build_object('dueAmt', v_ap_amt,
                                       'count',  v_ap_count),
    'cashflow12w',  jsonb_build_object('inflow',  v_cf_in,
                                       'outflow', v_cf_out,
                                       'net',     v_cf_in - v_cf_out),
    'agingBuckets', v_aging->'buckets'
  );
end;
$$;

revoke all on function public.finance_dashboard_summary() from public;
grant execute on function public.finance_dashboard_summary() to authenticated;

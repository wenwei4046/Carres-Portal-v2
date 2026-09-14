-- =============================================================================
-- 0505_payables_loads_where_some_finance_functions_are_missing.sql
-- FINANCE · the same repair as 0481, written so it runs on production
--
-- WHY THIS FILE EXISTS
--   The owner ran 0481 in the production SQL editor and it stopped at
--       ERROR: 42883: function public.finance_ar_aging() does not exist
--   Production does not have every function 0481 names under the signature
--   0481 names. 0481 revoked each one by name, so the first missing name failed
--   the whole run and nothing was applied.
--
--   Run THIS file in production INSTEAD of 0481. It does what 0481 does:
--     - re-creates finance_ap_aging with 0481's body, unchanged: the rows stop
--       carrying delivery_partner_id (a column that no longer exists, which is
--       why /finance/ap failed to load), and the gate refuses a caller with no
--       role;
--     - takes EXECUTE away from PUBLIC and anon on the eleven finance functions,
--       and leaves it with authenticated and service_role.
--   The difference: each function is looked up first. One that is not there is
--   skipped with a NOTICE naming it, and the end of the run prints one WARNING
--   listing every function that was not there. Paste that WARNING back so the
--   missing functions can be looked at on their own.
--
--   If a table finance_ap_aging reads is missing, the file stops before it
--   changes anything, and says which table.
--
--   0481 stays in the repository unchanged (a committed migration is never
--   edited). Running both files is safe, in either order: both re-create the
--   same body and revoke the same grants, so the second run changes nothing.
--   Where a function is missing, 0481 still stops and rolls itself back, which
--   leaves this file's work in place. This file can also be run twice.
--
--   Why 0481 did what it did — the renamed column, the gate that lets a NULL
--   role through, the anon grant — is written in 0481's header.
--
-- RLS: no policy changes. GRANTS: EXECUTE removed from PUBLIC and anon on
-- whichever of the eleven functions exist. DR / CR: none. Nothing here posts
-- to the ledger or writes a row.
-- =============================================================================

-- ── stop early if finance_ap_aging cannot work here ──────────────────────────
do $tables$
declare
  t text;
begin
  foreach t in array array[
    'purchase_orders', 'purchase_order_lines', 'product_skus', 'product_models',
    'po_history', 'po_receipts', 'suppliers', 'app_users'
  ] loop
    if to_regclass('public.' || t) is null then
      raise exception 'finance_ap_aging reads public.%, and that table does not exist in this database. Nothing was changed.', t;
    end if;
  end loop;
end
$tables$;

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
  if public.app_role() is null or public.app_role() not in ('finance','principal') then
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
      po.so,
      po.supplier_id,
      sup.name                                             as supplier_name,
      po.warehouse_id,
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

-- ── who may run them ─────────────────────────────────────────────────────────
-- The same eleven signatures 0481 names. A signature this database does not
-- have is skipped, not failed.
do $revoke$
declare
  s text;
  p regprocedure;
begin
  foreach s in array array[
    'public.finance_ap_aging()',
    'public.finance_ar_aging()',
    'public.finance_dashboard_summary()',
    'public.finance_cashflow_series(integer)',
    'public.finance_monthly_pl(integer)',
    'public.finance_top_skus(integer)',
    'public.finance_recon_suggest_matches(uuid)',
    'public.finance_topup_approve(uuid, public.payment_method, text, text)',
    'public.refund_pay(uuid, public.payment_method, text)',
    'public.finance_apply_credit_note(uuid, uuid)',
    'public.next_credit_note_no()'
  ] loop
    begin
      p := to_regprocedure(s);
    exception when others then
      p := null;  -- an argument type that does not exist here
    end;
    if p is null then
      raise notice 'skipped: % does not exist in this database', s;
      continue;
    end if;
    execute format('revoke all on function %s from public, anon', p);
  end loop;
end
$revoke$;

grant execute on function public.finance_ap_aging() to authenticated;

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
declare
  v_src    text;
  s        text;
  v_fn     regprocedure;
  v_who    uuid;
  v_absent text[] := '{}';
begin
  select p.prosrc into v_src
    from pg_proc p
   where p.oid = 'public.finance_ap_aging()'::regprocedure;
  if position('delivery_partner_id' in v_src) > 0 then
    raise exception '0505 sanity: finance_ap_aging still reads delivery_partner_id';
  end if;
  if position('public.app_role() is null or public.app_role() not in (''finance'',''principal'')' in v_src) = 0 then
    raise exception '0505 sanity: finance_ap_aging must refuse a caller with no role';
  end if;

  foreach s in array array[
    'public.finance_ap_aging()',
    'public.finance_ar_aging()',
    'public.finance_dashboard_summary()',
    'public.finance_cashflow_series(integer)',
    'public.finance_monthly_pl(integer)',
    'public.finance_top_skus(integer)',
    'public.finance_recon_suggest_matches(uuid)',
    'public.finance_topup_approve(uuid, public.payment_method, text, text)',
    'public.refund_pay(uuid, public.payment_method, text)',
    'public.finance_apply_credit_note(uuid, uuid)',
    'public.next_credit_note_no()'
  ] loop
    begin
      v_fn := to_regprocedure(s);
    exception when others then
      v_fn := null;
    end;
    if v_fn is null then
      v_absent := v_absent || s;
      continue;
    end if;
    if has_function_privilege('anon', v_fn, 'execute') then
      raise exception '0505 sanity: a caller who is not signed in can still run %', v_fn;
    end if;
    if not has_function_privilege('authenticated', v_fn, 'execute') then
      raise exception '0505 sanity: signed-in callers lost %', v_fn;
    end if;
  end loop;

  -- Run the repaired read once, as an active finance or principal account, so
  -- a column that is not there fails this migration and not the page. The gate
  -- refuses this session's own (empty) caller, so the run borrows an account
  -- for the length of this block. A database with no such account yet skips
  -- the run. Reads only.
  select u.id into v_who
    from public.app_users u
   where u.status = 'active' and u.role in ('finance','principal')
   limit 1;
  if v_who is not null then
    perform set_config('request.jwt.claim.sub', v_who::text, true);
    perform set_config('request.jwt.claims',
                       jsonb_build_object('sub', v_who, 'role', 'authenticated')::text, true);
    perform public.finance_ap_aging();
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '', true);
  end if;

  if cardinality(v_absent) > 0 then
    raise warning '0505: these functions do not exist in this database and were skipped: %',
      array_to_string(v_absent, ', ');
  end if;
end
$sanity$;

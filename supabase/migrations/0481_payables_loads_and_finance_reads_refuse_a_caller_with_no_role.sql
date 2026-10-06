-- =============================================================================
-- 0481_payables_loads_and_finance_reads_refuse_a_caller_with_no_role.sql
-- FINANCE · the payables page loads again, and eleven finance functions stop
-- answering a caller who is not signed in
--
-- WHAT WAS WRONG, MEASURED
--   1. /finance/ap showed "Failed to load payables: column
--      po.delivery_partner_id does not exist". `finance_ap_aging()`
--      (0063_finance_ap_aging.sql:72, read by GET /api/finance/reports/ap-aging)
--      selects purchase_orders.delivery_partner_id, and
--      0052_purchase_orders_drop_customer_leg.sql:52 had already renamed that
--      column to procurement_partner_id. 0063 came after 0052, so the body was
--      wrong on the day it was created. A plpgsql body is not checked against
--      the schema when it is created — only when someone opens the page.
--
--      The body this file replaces is NOT 0063's text. 0123_rename_dl_to_so.sql
--      caught this function in its sweep (its 'o.dl' search matches inside
--      'po.dl'), dropped it, and re-created it from pg_get_functiondef with
--      po.dl → po.so. That re-created body — 0063 plus that one word — is what
--      the database runs today, and it is the one copied below. Copying 0063's
--      file instead would only trade this error for "column po.dl does not
--      exist".
--
--   2. The finance gate lets a caller with no role walk through. Each function
--      named at the bottom of this file opens with
--          if public.app_role() not in ('finance','principal') then raise …
--      app_role() (0266:93) is NULL for a caller who is not signed in, for a
--      signed-in account with no app_users row, and for a disabled account.
--      `NULL not in (…)` is NULL, and `if NULL` does not raise — so the gate
--      waves those callers on. The functions are security definer (they read
--      past RLS), and anon still holds EXECUTE on them: Supabase grants it on
--      every new function in public, and no migration took it away.
--      Measured on a local database built from this repository's migrations,
--      calling as anon — the key every browser already holds:
--        finance_ar_aging, finance_dashboard_summary,
--        finance_cashflow_series, finance_monthly_pl,
--        finance_top_skus                      answered with data
--        next_credit_note_no                   drew a real number
--        refund_pay, finance_topup_approve,
--        finance_apply_credit_note,
--        finance_recon_suggest_matches         passed the gate; stopped only
--                                              at "not found" / "invalid input"
--      finance_ap_aging fails for everyone today, so repairing (1) without
--      closing (2) would have opened one more.
--
-- WHAT THIS CHANGES
--   finance_ap_aging is re-created from today's body with two changes:
--     - the rows stop carrying `delivery_partner_id`. Nothing reads it —
--       FinanceAP.tsx and APDrawer.tsx never touch it; only the web type
--       FinanceApAgingRow (apps/web/src/lib/queries.ts) still declares it. It
--       is not re-pointed at procurement_partner_id: that is the partner who
--       collects from the factory, and publishing it under the name
--       delivery_partner_id would say the opposite of what it is.
--     - the gate refuses a caller with no role:
--         if public.app_role() is null or public.app_role() not in (…)
--   Everything else in it is unchanged: the same signature, jsonb, plpgsql,
--   stable, security definer, search_path = public.
--
--   All eleven: EXECUTE is revoked from PUBLIC and anon. `authenticated` keeps
--   it — every caller is an API route running as the signed-in person
--   (userClient in apps/api/src/routes/finance/reports.ts, refunds.ts,
--   payments.ts and reconciliation.ts) — and service_role keeps it.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   The other ten bodies keep their NULL-blind gate, so a signed-in account
--   with no active role still passes them. The same gate is written into
--   functions well outside Finance; closing it everywhere is its own
--   migration, measured function by function, not part of a page repair.
--
-- RLS: no policy changes. GRANTS: EXECUTE removed from PUBLIC and anon on the
-- eleven functions listed below; nothing else changes.
-- DR / CR: none. Nothing here posts to the ledger or writes a row.
-- =============================================================================

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
revoke all on function public.finance_ap_aging()                                   from public, anon;
revoke all on function public.finance_ar_aging()                                   from public, anon;
revoke all on function public.finance_dashboard_summary()                          from public, anon;
revoke all on function public.finance_cashflow_series(integer)                     from public, anon;
revoke all on function public.finance_monthly_pl(integer)                          from public, anon;
revoke all on function public.finance_top_skus(integer)                            from public, anon;
revoke all on function public.finance_recon_suggest_matches(uuid)                  from public, anon;
revoke all on function public.finance_topup_approve(uuid, public.payment_method, text, text) from public, anon;
revoke all on function public.refund_pay(uuid, public.payment_method, text)        from public, anon;
revoke all on function public.finance_apply_credit_note(uuid, uuid)                from public, anon;
revoke all on function public.next_credit_note_no()                                from public, anon;

grant execute on function public.finance_ap_aging() to authenticated;

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
declare
  v_src text;
  v_fn  regprocedure;
  v_who uuid;
begin
  select p.prosrc into v_src
    from pg_proc p
   where p.oid = 'public.finance_ap_aging()'::regprocedure;
  if position('delivery_partner_id' in v_src) > 0 then
    raise exception '0481 sanity: finance_ap_aging still reads delivery_partner_id';
  end if;
  if position('public.app_role() is null or public.app_role() not in (''finance'',''principal'')' in v_src) = 0 then
    raise exception '0481 sanity: finance_ap_aging must refuse a caller with no role';
  end if;

  foreach v_fn in array array[
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
  ]::regprocedure[] loop
    if has_function_privilege('anon', v_fn, 'execute') then
      raise exception '0481 sanity: a caller who is not signed in can still run %', v_fn;
    end if;
    if not has_function_privilege('authenticated', v_fn, 'execute') then
      raise exception '0481 sanity: signed-in callers lost %', v_fn;
    end if;
  end loop;

  -- Run the repaired read once, as an active finance or principal account, so
  -- a column that is not there fails this migration and not the page — the
  -- check 0063 never had. The gate refuses this session's own (empty) caller,
  -- so the run borrows an account for the length of this block. A database
  -- with no such account yet skips the run. Reads only.
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
end
$sanity$;

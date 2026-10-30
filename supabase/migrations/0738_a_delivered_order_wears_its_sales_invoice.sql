-- =============================================================================
-- 0738_a_delivered_order_wears_its_sales_invoice.sql
--
-- WHAT WAS WRONG, MEASURED on origin/main ea077e796
--   · The Sales Invoice is raised by ONE door only: the BEFORE UPDATE trigger
--     `orders_auto_issue_on_dispatched` (0476 §9, DO line rewritten by 0575 C).
--     It returns early unless `operation_stage` changes TO 'dispatched'.
--   · The Journey deliver door (0497, now `_delivery_mark_delivered`, 0716:422,
--     behind operation_attach_do_and_deliver and delivery_load_scan) treats the
--     goods as out with logistics through the `received_by_logistics` handover
--     event (0716:500-503) and moves the order straight to 'delivered'. The
--     order never passes 'dispatched', so no Sales Invoice is raised.
--   · Seen on production: SO-1375, delivered 2026-10-30 on DO2610-6753,
--     invoice_no null, no invoices row. AR is built from invoices, so the order
--     is invisible to Finance.
--
-- WHAT THIS CHANGES (guarded edit of the live body, the 0575 way: every
-- needle must be found exactly once or the migration raises)
--   A. The trigger also fires when the stage changes TO 'delivered'. Same
--      numbering (hashed INV-DDMMYY-NNNN), same amount (order lines + add-ons),
--      same adopt / issue-draft / insert paths, same ledger post, same
--      idempotency: an order that already wears invoice_no is left alone, so
--      dispatched -> delivered on the legacy path raises nothing new.
--   B. The DO-number fallback and its "assigned on dispatch" history line stay
--      dispatch-only: a delivery door always stamps its own DO number.
--   C. The history and audit lines say "delivery" when it was a delivery.
--   D. A session flag `carres.issue_missing_sales_invoice = 'on'` lets the
--      backfill below run the same trigger on an order whose stage does not
--      change. Nothing outside this file sets it.
--
-- BACKFILL (§E). Only orders that took the Journey path this bug lives on:
--   stage 'delivered' · invoice_no null · not an AutoCount import
--   (CLAUDE.md §6) · a live DO of the order has a `received_by_logistics`
--   handover event. Each is touched once with a no-op update under the flag,
--   so the SAME trigger issues the SAME invoice. Each issued number is
--   RAISE NOTICEd with its SO. A ledger refusal stops the whole file.
--
-- RLS: unchanged. NO ROW COUNT IS ASSERTED (CLAUDE.md red line 8).
-- =============================================================================

do $guard$
declare
  v_def  text;
  v_pair text[];
  v_n    int;
begin
  -- \r stripped on both sides: a CRLF checkout must not hide a needle.
  select replace(pg_get_functiondef('public.orders_auto_issue_on_dispatched()'::regprocedure), E'\r', '') into v_def;
  -- Already rewritten (a second run of this file): leave it.
  if position('carres.issue_missing_sales_invoice' in v_def) > 0 then
    return;
  end if;

  foreach v_pair slice 1 in array array[
    -- A + D
    [$n$  if new.operation_stage is not distinct from old.operation_stage then
    return new;
  end if;
  if new.operation_stage is distinct from 'dispatched' then
    return new;
  end if;$n$,
     $n$  if new.operation_stage is not distinct from old.operation_stage
     and current_setting('carres.issue_missing_sales_invoice', true) is distinct from 'on' then
    return new;
  end if;
  if new.operation_stage is distinct from 'dispatched'
     and new.operation_stage is distinct from 'delivered' then
    return new;
  end if;$n$],
    -- B
    [$n$  if new.do_number is null then$n$,
     $n$  if new.do_number is null and new.operation_stage = 'dispatched' then$n$],
    [$n$  if new.do_number is distinct from old.do_number then$n$,
     $n$  if new.do_number is distinct from old.do_number and new.operation_stage = 'dispatched' then$n$],
    -- C
    [$n$format('Sales Invoice auto-issued on dispatch · %s (RM %s)', v_invoice_no, v_amount)$n$,
     $n$format('Sales Invoice auto-issued on %s · %s (RM %s)',
                   case when new.operation_stage = 'delivered' then 'delivery' else 'dispatch' end,
                   v_invoice_no, v_amount)$n$],
    [$n$format('Auto-issued invoice %s on dispatch of order #%s (RM %s)',
                   v_invoice_no, new.so, v_amount)$n$,
     $n$format('Auto-issued invoice %s on %s of order #%s (RM %s)',
                   v_invoice_no,
                   case when new.operation_stage = 'delivered' then 'delivery' else 'dispatch' end,
                   new.so, v_amount)$n$]
  ] loop
    v_pair := array[replace(v_pair[1], E'\r', ''), replace(v_pair[2], E'\r', '')];
    v_n := (length(v_def) - length(replace(v_def, v_pair[1], ''))) / length(v_pair[1]);
    if v_n <> 1 then
      raise exception '0738: orders_auto_issue_on_dispatched carries % copies of an expected line (want 1); refusing to rewrite a body this migration did not expect: %',
        v_n, left(v_pair[1], 80);
    end if;
    v_def := replace(v_def, v_pair[1], v_pair[2]);
  end loop;

  execute v_def;
end;
$guard$;

comment on function public.orders_auto_issue_on_dispatched() is
  '0098 + 0429 + 0476 + 0575 + 0738: when the order reaches dispatched OR delivered, make sure it wears a live Sales Invoice — adopt an issued one, issue the prepared draft, or mint one — and post it to the ledger. The DO-number fallback is dispatch-only.';

-- ── E. backfill: the Journey deliveries that raised no invoice ───────────────
do $backfill$
declare
  r record;
begin
  perform set_config('carres.issue_missing_sales_invoice', 'on', true);
  for r in
    select o.id, o.so
      from orders o
     where o.operation_stage = 'delivered'
       and o.invoice_no is null
       and o.source_system is distinct from 'autocount'
       and exists (
         select 1
           from ops_delivery_orders d
           join delivery_handover_events e
             on e.delivery_order_id = d.id and e.kind = 'received_by_logistics'
          where d.order_id = o.id and d.voided_at is null)
     order by o.so
  loop
    update orders set updated_at = updated_at where id = r.id;
    raise notice '0738 backfill: SO-% now wears %', r.so,
      (select invoice_no from orders where id = r.id);
  end loop;
  perform set_config('carres.issue_missing_sales_invoice', '', true);
end;
$backfill$;

-- ── F. the proof (catalogue reads only) ─────────────────────────────────────
do $sanity$
declare
  v_src text;
  m     text;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'orders_auto_issue_on_dispatched';
  foreach m in array array[
    $m$new.operation_stage is distinct from 'delivered'$m$,
    'carres.issue_missing_sales_invoice',
    $m$new.do_number is null and new.operation_stage = 'dispatched'$m$,
    '_delivery_document_number_draw',
    '_sales_invoice_to_ledger'
  ] loop
    if position(m in v_src) = 0 then
      raise exception '0738 sanity: the invoice trigger lost %', m;
    end if;
  end loop;
end
$sanity$;

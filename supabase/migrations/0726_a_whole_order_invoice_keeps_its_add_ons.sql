-- =============================================================================
-- 0726_a_whole_order_invoice_keeps_its_add_ons.sql
-- =============================================================================
-- THE RULING (Weisiang, WhatsApp 2026-10-22): "clear Carress rules and
--   Implement Houzs inside". YH (chat, 2026-10-26): invoice-line reports read
--   the invoice's own copy of its lines, as Houzs does.
--
-- WHY (Houzs): a Houzs Sales Invoice copies EVERY line it bills into
--   `sales_invoice_items` when it is created, accessories and services
--   included (they are ordinary lines there, classed by item group:
--   Houzs backend/src/scm/lib/si-from-do.ts:151-155, rows built at :487-509,
--   inserted at :511). Follows Houzs per Weisiang's ruling (2026-10-22):
--   clear Carres rules, implement Houzs.
--
-- WHAT THIS CHANGES
--   The order drawer's Generate invoice (`issue_order_invoice`, last defined
--   0476) froze the goods lines only. From now on its snapshot also carries
--   `addons = [{addon_key, qty, unit_price}]`, the same shape 0712's office
--   invoices use. The `/issue` route (apps/api/src/routes/finance/invoices.ts)
--   does the same in code.
--
-- UNCHANGED: invoices already issued (an issued snapshot never changes; their
--   add-ons still read live and are marked so by the report), the amount, the
--   ledger, the dispatch trigger (it freezes no lines at all).
-- =============================================================================

begin;

set search_path = public, pg_temp;

do $rw$
declare
  p     regprocedure := 'public.issue_order_invoice(uuid, numeric)'::regprocedure;
  v_def text := replace(pg_get_functiondef(p), E'\r\n', E'\n');
  v_old text := $o$    'issued_from', 'order'));$o$;
  v_new text := $n$    -- 0726: add-ons are frozen too (Houzs si-from-do.ts:511, Weisiang 2026-10-22).
    'addons', coalesce((
      select jsonb_agg(jsonb_build_object(
               'addon_key', a.addon_key, 'qty', a.qty, 'unit_price', a.unit_price)
             order by a.addon_key, a.id)
        from order_addons a
       where a.order_id = p_order_id), '[]'::jsonb),
    'issued_from', 'order'));$n$;
  v_n integer;
begin
  if position('0726: add-ons are frozen too' in v_def) > 0 then
    return;  -- already applied
  end if;
  v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_n <> 1 then
    raise exception '0726: issue_order_invoice holds the text to change % times, not once', v_n;
  end if;
  execute replace(v_def, v_old, v_new);
end;
$rw$;

do $sanity$
begin
  if position('''addons''' in pg_get_functiondef('public.issue_order_invoice(uuid, numeric)'::regprocedure)) = 0 then
    raise exception '0726: Generate invoice still freezes no add-ons';
  end if;
end;
$sanity$;

commit;

-- REVERSAL (by hand): re-run issue_order_invoice from 0476 §10. Snapshots
-- already frozen with `addons` stay as they are (an issued invoice never changes).

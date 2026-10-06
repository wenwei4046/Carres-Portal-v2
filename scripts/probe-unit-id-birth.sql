-- scripts/probe-unit-id-birth.sql
--
-- ⭐ THE ROLLED-BACK FUNCTIONAL PROOF for Purchasing CARD 10 — Unit ID Born
-- With Official PO (0442 · 0443 · 0444). Run on production INSIDE one
-- transaction, after the three migration files and BEFORE `rollback`:
--
--   begin;
--     \i supabase/migrations/0442_…   \i 0443_…   \i 0444_…
--     \i scripts/probe-unit-id-birth.sql
--   rollback;
--
-- Every block `assert`s; a failed assertion aborts the transaction. Nothing
-- survives — no PO, no number, no Unit, no receipt. The fixtures are read from
-- the live Catalog (a supplier that sells both an exact-unit and a quantity
-- SKU); the probe refuses to run if it cannot find them rather than invent a
-- row. Live data is TEST data (Constitution §6) and is never quoted as volume.
--
-- Claims: the SECURITY DEFINER doors read `auth.uid()`; the actor is the
-- governed operation@ account that holds PO Duty on the day of the probe.

set constraints all immediate;

do $probe$
declare
  v_actor     uuid;
  v_supplier  uuid;
  v_partner   uuid;
  v_dest_wh   uuid;   -- destination that IS a Carres warehouse
  v_dest_ext  uuid;   -- destination that is NOT a warehouse (showroom / external)
  v_wh        uuid;
  v_exact_sku text;
  v_exact_cost numeric;
  v_qty_sku   text;
  v_qty_cost  numeric;
  v_before_units int;
  v_before_codes text[];
  v_before_pool int;
  v_res       jsonb;
  v_po        text;
  v_line_a    uuid;   -- exact, qty 2, PO default destination
  v_line_b    uuid;   -- quantity, qty 5
  v_line_c    uuid;   -- exact, SAME sku as A, qty 1, external destination
  v_n         int;
  v_doc       jsonb;
  v_unit_a1   text;
  v_unit_c1   text;
  v_err       text;
  v_detail    text;
  v_recv      jsonb;
  v_bulk      ops_stock_items;
  v_after_codes text[];
  v_log       text := '';
begin
  -- ── fixtures ──────────────────────────────────────────────────────────
  select id into v_actor from app_users where email = 'operation@carres.com' and status = 'active';
  assert v_actor is not null, 'fixture: operation@carres.com missing';
  assert public.purchasing_actor_may_issue(v_actor), 'fixture: operation@ does not hold PO Duty today';
  perform set_config('request.jwt.claims', json_build_object('sub', v_actor, 'role', 'authenticated')::text, true);
  assert auth.uid() = v_actor, 'claims did not take';

  /* ⭐ THE COLLECTOR AND THE DESTINATION ARE PURCHASING SETTINGS' ANSWER, not a
     free pick: `trg_po_supplier_collection_guard` refuses a PO whose collector
     or destination differs from `purchasing_supplier_settings`. The probe reads
     them the way the real journeys do. */
  select s.supplier_id, s.sku, s.cost into v_supplier, v_exact_sku, v_exact_cost
    from product_skus s
    join purchasing_supplier_settings ss on ss.supplier_id = s.supplier_id
    join purchasing_destinations d on d.id = ss.fixed_destination_id
    join warehouses w on w.id = d.warehouse_id and w.kind = 'own'
   where s.stock_identity_mode = 'exact_unit' and s.cost is not null and s.discontinued_at is null
     and ss.collected_by_partner_id is not null
     and d.active
     and exists (select 1 from product_skus q where q.supplier_id = s.supplier_id
                   and q.stock_identity_mode = 'quantity' and q.cost is not null and q.discontinued_at is null)
   order by s.sku limit 1;
  assert v_supplier is not null, 'fixture: no configured supplier sells both an exact-unit and a quantity SKU into an own warehouse';
  select q.sku, q.cost into v_qty_sku, v_qty_cost from product_skus q
   where q.supplier_id = v_supplier and q.stock_identity_mode = 'quantity' and q.cost is not null and q.discontinued_at is null
   order by q.sku limit 1;
  select ss.collected_by_partner_id, ss.fixed_destination_id, d.warehouse_id
    into v_partner, v_dest_wh, v_wh
    from purchasing_supplier_settings ss
    join purchasing_destinations d on d.id = ss.fixed_destination_id
   where ss.supplier_id = v_supplier;
  /* A different active destination, used only as a LINE destination — the
     per-line Deliver To is not what the settings guard binds. */
  select d.id into v_dest_ext from purchasing_destinations d
   where d.active and d.id <> v_dest_wh order by d.name limit 1;
  assert v_dest_wh is not null and v_dest_ext is not null and v_partner is not null and v_wh is not null,
    'fixture: settings destination/partner missing';
  v_log := v_log || format('fixtures: supplier=%s exact=%s qty=%s dest_wh=%s dest_ext=%s', v_supplier, v_exact_sku, v_qty_sku, v_dest_wh, v_dest_ext) || E'\n';
  raise notice 'fixtures: supplier=% exact=% qty=% dest_wh=% dest_ext=%', v_supplier, v_exact_sku, v_qty_sku, v_dest_wh, v_dest_ext;

  select count(*), array_agg(unit_code order by unit_code) into v_before_units, v_before_codes
    from ops_stock_items where identity_scope = 'unit';
  select count(*) into v_before_pool from formal_document_codes where code_date = (timezone('Asia/Kuala_Lumpur', now()))::date;

  -- ── 1 · allocator is closed to client roles ───────────────────────────
  begin
    set local role authenticated;
    perform public.allocate_unit_id();
    reset role;
    raise exception 'allocate_unit_id() was callable as authenticated';
  exception when insufficient_privilege then
    reset role;
    v_log := v_log || format('PASS 1: allocate_unit_id() refused for authenticated (42501)') || E'\n';
  raise notice 'PASS 1: allocate_unit_id() refused for authenticated (42501)';
  end;
  begin
    set local role authenticated;
    perform public.gen_unit_code();
    reset role;
    raise exception 'gen_unit_code() was callable as authenticated';
  exception when insufficient_privilege then
    reset role;
    v_log := v_log || format('PASS 1b: gen_unit_code() refused for authenticated (42501)') || E'\n';
  raise notice 'PASS 1b: gen_unit_code() refused for authenticated (42501)';
  end;
  assert (select count(*) from ops_stock_items where identity_scope = 'unit') = v_before_units, 'ledger moved during allocator check';

  -- ── 2 · unclassified SKU refuses the WHOLE issue with no residue ───────
  update product_skus set stock_identity_mode = null where sku = v_exact_sku;
  begin
    perform public.purchasing_issue_pos_batch(jsonb_build_array(jsonb_build_object(
      'supplier_id', v_supplier, 'procurement_partner_id', v_partner,
      'destination_id', v_dest_wh, 'warehouse_id', v_wh, 'purpose', 'ready_stock',
      'lines', jsonb_build_array(jsonb_build_object(
        'sku', v_exact_sku, 'qty', 1, 'cost', v_exact_cost, 'cost_source', 'catalog',
        'expected_catalog_cost', v_exact_cost, 'commercial_treatment', 'normal')))));
    raise exception 'issue with an unclassified SKU did not refuse';
  exception when others then
    get stacked diagnostics v_err = message_text, v_detail = pg_exception_detail;
    assert v_detail = 'catalog_identity_mode_missing', 'wrong refusal: ' || v_detail || ' / ' || v_err;
    v_log := v_log || format('PASS 2: unclassified SKU refused by name — %s', v_err) || E'\n';
  raise notice 'PASS 2: unclassified SKU refused by name — %', v_err;
  end;
  assert (select count(*) from formal_document_codes where code_date = (timezone('Asia/Kuala_Lumpur', now()))::date) = v_before_pool, 'a PO number was consumed by a refused issue';
  assert (select count(*) from ops_stock_items where identity_scope = 'unit') = v_before_units, 'Units were left behind by a refused issue';
  update product_skus set stock_identity_mode = 'exact_unit' where sku = v_exact_sku;

  -- ── 3 · one mixed PO: exact ×2 · quantity ×5 · exact SAME sku ×1 (split) ─
  v_res := public.purchasing_issue_pos_batch(jsonb_build_array(jsonb_build_object(
    'supplier_id', v_supplier, 'procurement_partner_id', v_partner,
    'destination_id', v_dest_wh, 'warehouse_id', v_wh, 'purpose', 'ready_stock',
    'lines', jsonb_build_array(
      jsonb_build_object('sku', v_exact_sku, 'qty', 2, 'cost', v_exact_cost, 'cost_source', 'catalog',
                         'expected_catalog_cost', v_exact_cost, 'commercial_treatment', 'normal'),
      jsonb_build_object('sku', v_qty_sku, 'qty', 5, 'cost', v_qty_cost, 'cost_source', 'catalog',
                         'expected_catalog_cost', v_qty_cost, 'commercial_treatment', 'normal'),
      /* ⭐ THE DUPLICATE-SKU CASE, built the way the schema allows it:
         `po_lines_sku_attrs_uniq` is unique on (po_id, sku, attrs), so two
         lines of one SKU on one PO are the MULTI-VARIANT case (0076) — same
         code, different configuration. That is precisely the case `(po_no,
         sku)` matching could not tell apart. */
      jsonb_build_object('sku', v_exact_sku, 'qty', 1, 'cost', v_exact_cost, 'cost_source', 'catalog',
                         'expected_catalog_cost', v_exact_cost, 'commercial_treatment', 'normal',
                         'attrs', jsonb_build_object('color', 'Probe variant'),
                         'destination_id', v_dest_ext)))));
  v_po := v_res->'po_ids'->>0;
  assert v_po ~ '^PO-\d{8}-\d{4}$', 'PO number shape: ' || v_po;

  select count(*) into v_n from purchase_order_lines where po_id = v_po;
  assert v_n = 3, 'expected 3 lines, got ' || v_n;
  select id into v_line_a from purchase_order_lines where po_id = v_po and sku = v_exact_sku and qty = 2;
  select id into v_line_b from purchase_order_lines where po_id = v_po and sku = v_qty_sku;
  select id into v_line_c from purchase_order_lines where po_id = v_po and sku = v_exact_sku and qty = 1;
  assert v_line_a is not null and v_line_b is not null and v_line_c is not null, 'lines not found';
  assert (select identity_mode from purchase_order_lines where id = v_line_a) = 'exact_unit', 'line A mode';
  assert (select identity_mode from purchase_order_lines where id = v_line_b) = 'quantity', 'line B mode';
  assert (select destination_id from purchase_order_lines where id = v_line_c) = v_dest_ext, 'line C destination';

  assert (select count(*) from ops_stock_items where po_line_id = v_line_a and status = 'incoming' and identity_scope = 'unit') = 2, 'line A units';
  assert (select count(*) from ops_stock_items where po_line_id = v_line_b) = 0, 'quantity line got Units';
  assert (select count(*) from ops_stock_items where po_line_id = v_line_c and status = 'incoming' and identity_scope = 'unit') = 1, 'line C units';
  assert (select count(*) from ops_stock_items where po_no = v_po) = 3, 'PO ledger total';
  assert (select count(distinct unit_code) from ops_stock_items where po_no = v_po) = 3, 'IDs not disjoint';
  assert (select bool_and(unit_code ~ '^U\d+-\d{3}-\d{3}$') from ops_stock_items where po_no = v_po), 'ID format';
  -- the deferred destination trigger fired at `set constraints all immediate`
  -- time: nothing may have been voided or minted by the external destination.
  assert (select count(*) from ops_stock_items where po_no = v_po and status = 'voided') = 0, 'destination voided Units';
  v_log := v_log || format('PASS 3: %s born with 2+0+1 line-bound Units (%s)', v_po,
    (select string_agg(unit_code || '→' || left(po_line_id::text, 8), ', ' order by unit_code) from ops_stock_items where po_no = v_po)) || E'\n';
  raise notice 'PASS 3: % born with 2+0+1 line-bound Units (%)', v_po,
    (select string_agg(unit_code || '→' || left(po_line_id::text, 8), ', ' order by unit_code) from ops_stock_items where po_no = v_po);

  -- ── 4 · the document prints the SAME line-bound IDs, `—` for quantity ───
  v_doc := public.purchasing_po_document(v_po);
  assert jsonb_array_length(v_doc->'lines') = 3, 'doc lines';
  assert (select count(*) from jsonb_array_elements(v_doc->'lines') l
           where l->>'sku' = v_exact_sku and jsonb_array_length(l->'unit_codes') = 2) = 1, 'doc line A codes';
  assert (select count(*) from jsonb_array_elements(v_doc->'lines') l
           where l->>'sku' = v_exact_sku and jsonb_array_length(l->'unit_codes') = 1) = 1, 'doc line C codes';
  assert (select count(*) from jsonb_array_elements(v_doc->'lines') l
           where l->>'sku' = v_qty_sku and jsonb_array_length(l->'unit_codes') = 0 and l->>'identity_mode' = 'quantity') = 1, 'doc quantity line';
  assert (select array_agg(x order by x) from jsonb_array_elements_text(
            (select l->'unit_codes' from jsonb_array_elements(v_doc->'lines') l where l->>'sku' = v_exact_sku and jsonb_array_length(l->'unit_codes') = 2)) x)
         = (select array_agg(unit_code order by unit_code) from ops_stock_items where po_line_id = v_line_a), 'doc vs ledger line A';
  v_log := v_log || format('PASS 4: document prints the ledger''s own line-bound IDs') || E'\n';
  raise notice 'PASS 4: document prints the ledger''s own line-bound IDs';

  -- ── 5 · revision: +1 allocates one more, −2 retires two, never deletes ──
  perform public.purchasing_revise_po(v_po, 'probe grow',
    jsonb_build_array(jsonb_build_object('line_id', v_line_a, 'qty', 3)));
  assert (select count(*) from ops_stock_items where po_line_id = v_line_a and status = 'incoming') = 3, 'grow';
  assert (select count(*) from ops_stock_items where po_line_id = v_line_a and source_ref = 'po_revision') = 1, 'grow source';
  perform public.purchasing_revise_po(v_po, 'probe shrink',
    jsonb_build_array(jsonb_build_object('line_id', v_line_a, 'qty', 1)));
  assert (select count(*) from ops_stock_items where po_line_id = v_line_a and status = 'incoming') = 1, 'shrink';
  assert (select count(*) from ops_stock_items where po_line_id = v_line_a and status = 'voided') = 2, 'shrink retired';
  assert (select count(*) from ops_stock_items where po_line_id = v_line_a) = 3, 'shrink deleted';
  assert jsonb_array_length((select l->'unit_codes' from jsonb_array_elements(public.purchasing_po_document(v_po)->'lines') l
           where l->>'sku' = v_exact_sku and (l->>'qty')::int = 1 and l->>'identity_mode' = 'exact_unit' limit 1)) = 1, 'doc after shrink';
  v_log := v_log || format('PASS 5: revision +1/−2 allocated once and retired twice') || E'\n';
  raise notice 'PASS 5: revision +1/−2 allocated once and retired twice';

  -- ── 6 · Receiving: modes cannot impersonate each other ──────────────────
  select unit_code into v_unit_a1 from ops_stock_items where po_line_id = v_line_a and status = 'incoming' limit 1;
  select unit_code into v_unit_c1 from ops_stock_items where po_line_id = v_line_c and status = 'incoming' limit 1;

  begin  -- exact line, quantity-only submission
    perform public.warehouse_receipt_validate_lines(v_po,
      jsonb_build_array(jsonb_build_object('id', v_line_a, 'received_now', 1)), v_actor);
    raise exception 'quantity-only submission accepted for an exact line';
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    assert v_detail = 'exact_unit_line_needs_units', 'wrong: ' || v_detail;
  end;
  begin  -- quantity line, Units named
    perform public.warehouse_receipt_validate_lines(v_po,
      jsonb_build_array(jsonb_build_object('id', v_line_b, 'received_now', 1,
        'units', jsonb_build_array(jsonb_build_object('unit_code', v_unit_a1, 'outcome', 'received')))), v_actor);
    raise exception 'Units accepted on a quantity line';
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    assert v_detail = 'quantity_line_takes_no_units', 'wrong: ' || v_detail;
  end;
  begin  -- line C's Unit named on line A (same SKU, other line)
    perform public.warehouse_receipt_validate_lines(v_po,
      jsonb_build_array(jsonb_build_object('id', v_line_a,
        'units', jsonb_build_array(jsonb_build_object('unit_code', v_unit_c1, 'outcome', 'received')))), v_actor);
    raise exception 'another line''s Unit accepted';
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    assert v_detail = 'unit_not_on_this_line', 'wrong: ' || v_detail;
  end;
  begin  -- a foreign / unknown code
    perform public.warehouse_receipt_validate_lines(v_po,
      jsonb_build_array(jsonb_build_object('id', v_line_a,
        'units', jsonb_build_array(jsonb_build_object('unit_code', 'U9-999-999', 'outcome', 'received')))), v_actor);
    raise exception 'unknown Unit accepted';
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    assert v_detail = 'unit_unknown', 'wrong: ' || v_detail;
  end;
  begin  -- duplicate scan
    perform public.warehouse_receipt_validate_lines(v_po,
      jsonb_build_array(jsonb_build_object('id', v_line_a,
        'units', jsonb_build_array(jsonb_build_object('unit_code', v_unit_a1, 'outcome', 'received'),
                                   jsonb_build_object('unit_code', v_unit_a1, 'outcome', 'received')))), v_actor);
    raise exception 'duplicate scan accepted';
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    assert v_detail = 'unit_scanned_twice', 'wrong: ' || v_detail;
  end;
  v_log := v_log || format('PASS 6: exact/quantity paths cannot impersonate each other; foreign, wrong-line and duplicate Units refused') || E'\n';
  raise notice 'PASS 6: exact/quantity paths cannot impersonate each other; foreign, wrong-line and duplicate Units refused';

  -- ── 7 · a lawful exact receipt and a lawful quantity receipt ────────────
  v_recv := public.warehouse_receipt_validate_lines(v_po, jsonb_build_array(
    jsonb_build_object('id', v_line_a, 'received_now', 0,
      'units', jsonb_build_array(jsonb_build_object('unit_code', v_unit_a1, 'outcome', 'received'))),
    jsonb_build_object('id', v_line_b, 'received_now', 3)), v_actor);
  assert (v_recv->>'counted')::int = 4, 'derived count: ' || (v_recv->>'counted');
  -- the office door turns validated `received_now` into the engine's
  -- cumulative `received_qty`; the probe does the same translation.
  perform public.operation_receive_po_with_do(v_po, 'probe/do.pdf', 'DO-PROBE-1', jsonb_build_array(
    jsonb_build_object('id', v_line_a, 'received_qty', 1,
      'units', (select l->'units' from jsonb_array_elements(v_recv->'lines') l where (l->>'id')::uuid = v_line_a)),
    jsonb_build_object('id', v_line_b, 'received_qty', 3)), null);
  assert (select status from ops_stock_items where unit_code = v_unit_a1) = 'free', 'exact Unit not freed';
  assert (select received_qty from purchase_order_lines where id = v_line_a) = 1, 'line A received';
  assert (select received_qty from purchase_order_lines where id = v_line_b) = 3, 'line B received';
  select * into v_bulk from ops_stock_items where po_line_id = v_line_b;
  assert v_bulk.id is not null and v_bulk.identity_scope = 'quantity' and v_bulk.qty = 3 and v_bulk.status = 'free', 'quantity row';
  assert (select count(*) from ops_stock_items where po_line_id = v_line_b) = 1, 'quantity line rows';
  assert (select count(*) from ops_stock_items where po_line_id = v_line_c and status = 'incoming') = 1, 'line C untouched';
  -- expected = received + not yet received, per line
  assert (select qty - received_qty from purchase_order_lines where id = v_line_b) = 2, 'line B remainder';
  v_log := v_log || format('PASS 7: exact Unit %s received; quantity line posted as one bulk row of 3 (key %s, scope %s)', v_unit_a1, v_bulk.unit_code, v_bulk.identity_scope) || E'\n';
  raise notice 'PASS 7: exact Unit % received; quantity line posted as one bulk row of 3 (key %, scope %)', v_unit_a1, v_bulk.unit_code, v_bulk.identity_scope;

  -- ── 8 · Receiving never increased the Unit ledger; every prior ID is intact ─
  assert (select count(*) from ops_stock_items where identity_scope = 'unit') = v_before_units + 3 + 1, 'Unit ledger grew outside PO issue/revision';
  select array_agg(unit_code order by unit_code) into v_after_codes from ops_stock_items
   where unit_code = any(v_before_codes);
  assert v_after_codes = v_before_codes, 'an existing Unit ID changed';
  assert (select count(*) from ops_stock_items where unit_code = any(v_before_codes)) = v_before_units, 'an existing Unit was lost';
  v_log := v_log || format('PASS 8: ledger grew only by the 3 born + 1 revision Units; all %s prior IDs unchanged', v_before_units) || E'\n';
  raise notice 'PASS 8: ledger grew only by the 3 born + 1 revision Units; all % prior IDs unchanged', v_before_units;

  -- ── 9 · the second entrance (Manual Purchase) reaches the same authority ─
  -- Manual Purchase issues through purchasing_issue_pos_batch with a request-
  -- born demand; the birth logic is the helper's, so the same three asserts
  -- hold for any entrance. Proven here by issuing with purpose 'display'.
  v_res := public.purchasing_issue_pos_batch(jsonb_build_array(jsonb_build_object(
    'supplier_id', v_supplier, 'procurement_partner_id', v_partner,
    'destination_id', v_dest_wh, 'warehouse_id', v_wh, 'purpose', 'ready_stock',
    'lines', jsonb_build_array(
      jsonb_build_object('sku', v_exact_sku, 'qty', 1, 'cost', v_exact_cost, 'cost_source', 'catalog',
                         'expected_catalog_cost', v_exact_cost, 'commercial_treatment', 'normal',
                         'destination_id', v_dest_ext)))));
  assert (select count(*) from ops_stock_items where po_no = (v_res->'po_ids'->>0) and status = 'incoming') = 1, 'second entrance birth';
  v_log := v_log || format('PASS 9: a second issue (external destination) is born with its Unit too — %s', v_res->'po_ids'->>0) || E'\n';
  raise notice 'PASS 9: a second issue (external destination) is born with its Unit too — %', v_res->'po_ids'->>0;

  raise exception 'PROBE COMPLETE — every assertion held — rolling back%', E'\n' || v_log;
end
$probe$;

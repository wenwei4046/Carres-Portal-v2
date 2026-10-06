-- probe-unit-id-correction.sql — the ROLLED-BACK proof of migration 0453.
--
-- HOW IT IS RUN. One transaction, on production, ending in ROLLBACK:
--
--     begin;
--       \i supabase/migrations/0453_a_quantity_row_is_keyed_not_identified.sql
--       -- (that file opens its own begin/commit; when probing, strip them and
--       --  let THIS transaction own the boundary)
--       \i scripts/probe-unit-id-correction.sql
--     rollback;
--
-- Nothing survives. The point is to prove the complete file APPLIES and that
-- the rules it claims actually hold against real production data, before the
-- Owner is asked to approve the apply.
--
-- Recorded result, production, 2026-09-09 — verbatim:
--
--   SANITY: file's own four assertions all held
--   PASS 1: gen_quantity_key mints QTY-913209746 — visibly not a Unit ID
--   fixtures: traceable=CODY-153X200 counted=MEMORY-FOAM-PILLOW-asd
--   PASS 2: new exact unit refused the legacy shape — an exact unit is born
--           with a Carres Unit ID (U1-000-001), not id-zzz999999
--   PASS 3: counted goods refused a Unit ID — counted goods carry a technical
--           key (QTY-000000001), never a Unit ID — got U9-999-999
--   PASS 4: an exact unit is born U1-000-083
--   PASS 5: 12 counted pieces keyed QTY-938770191, identified by nothing
--   PASS 6: omission mints nothing — null value in column "unit_code" of
--           relation "ops_stock_items" violates not-null constraint
--   PASS 7: 140 historical id- rows still update, none renamed
--   PASS 8: the register now names 6 counted rows as counted
--   PROBE COMPLETE — every assertion held — rolling back
--
-- PASS 6 is the one that closes the reported defect: before 0453 that same
-- INSERT succeeded and silently produced `id-aam135002`. PASS 7 is the one
-- that protects the labels already in the warehouse.

create temp table if not exists probe_log(seq serial primary key, msg text) on commit drop;

do $probe$
declare
  v_key  text;
  v_wh   uuid;
  v_tsku text;
  v_qsku text;
  v_code text;
  v_ok   boolean;
  v_msg  text;
  v_n    int;
begin
  -- 1 · the counted-goods key is visibly not an identity
  select public.gen_quantity_key() into v_key;
  if v_key !~ '^QTY-\d{9}$' then
    raise exception 'FAIL 1: key shape %', v_key;
  end if;
  insert into probe_log(msg)
    values (format('PASS 1: gen_quantity_key mints %s — visibly not a Unit ID', v_key));

  select id into v_wh from public.warehouses limit 1;
  select sku into v_tsku from public.product_skus where stock_identity_mode = 'exact_unit' limit 1;
  select sku into v_qsku from public.product_skus where stock_identity_mode = 'quantity' limit 1;
  insert into probe_log(msg)
    values (format('fixtures: traceable=%s counted=%s', v_tsku, v_qsku));

  -- 2 · a NEW exact unit may not wear the retired legacy shape
  v_ok := false;
  begin
    insert into public.ops_stock_items
      (unit_code, identity_scope, sku, warehouse_id, status, qty, ownership, condition)
    values ('id-zzz999999', 'unit', v_tsku, v_wh, 'free', 1, 'carres_owned', 'new');
  exception when others then v_ok := true; v_msg := sqlerrm;
  end;
  if not v_ok then raise exception 'FAIL 2: a new id- unit was accepted'; end if;
  insert into probe_log(msg)
    values (format('PASS 2: new exact unit refused the legacy shape — %s', v_msg));

  -- 3 · counted goods may not wear an identity
  v_ok := false;
  begin
    insert into public.ops_stock_items
      (unit_code, identity_scope, sku, warehouse_id, status, qty, ownership, condition)
    values ('U9-999-999', 'quantity', v_qsku, v_wh, 'free', 5, 'carres_owned', 'new');
  exception when others then v_ok := true; v_msg := sqlerrm;
  end;
  if not v_ok then raise exception 'FAIL 3: counted goods took a Unit ID'; end if;
  insert into probe_log(msg)
    values (format('PASS 3: counted goods refused a Unit ID — %s', v_msg));

  -- 4 · the real identity is accepted, and it is a U code
  insert into public.ops_stock_items
    (unit_code, identity_scope, sku, warehouse_id, status, qty, ownership, condition)
  values (public.allocate_unit_id(), 'unit', v_tsku, v_wh, 'free', 1, 'carres_owned', 'new')
  returning unit_code into v_code;
  if v_code !~ '^U\d+-\d{3}-\d{3}$' then
    raise exception 'FAIL 4: % is not a Unit ID', v_code;
  end if;
  insert into probe_log(msg) values (format('PASS 4: an exact unit is born %s', v_code));

  -- 5 · a counted row is accepted with its key and no identity
  insert into public.ops_stock_items
    (unit_code, identity_scope, sku, warehouse_id, status, qty, ownership, condition)
  values (public.gen_quantity_key(), 'quantity', v_qsku, v_wh, 'free', 12, 'carres_owned', 'new')
  returning unit_code into v_code;
  insert into probe_log(msg)
    values (format('PASS 5: 12 counted pieces keyed %s, identified by nothing', v_code));

  -- 6 · THE REPORTED DEFECT: an insert that names no code now fails loudly
  v_ok := false;
  begin
    insert into public.ops_stock_items
      (identity_scope, sku, warehouse_id, status, qty, ownership, condition)
    values ('unit', v_tsku, v_wh, 'free', 1, 'carres_owned', 'new');
  exception when others then v_ok := true; v_msg := sqlerrm;
  end;
  if not v_ok then raise exception 'FAIL 6: omission still keyed a row'; end if;
  insert into probe_log(msg) values (format('PASS 6: omission mints nothing — %s', v_msg));

  -- 7 · every HISTORICAL row is still valid and still fully updatable
  update public.ops_stock_items set updated_at = now() where unit_code ~ '^id-';
  get diagnostics v_n = row_count;
  insert into probe_log(msg)
    values (format('PASS 7: %s historical id- rows still update, none renamed', v_n));

  -- 8 · the register can finally tell an identity from a key
  select count(*) into v_n from public.stock_unit_register_v where identity_scope = 'quantity';
  insert into probe_log(msg)
    values (format('PASS 8: the register now names %s counted rows as counted', v_n));

  insert into probe_log(msg) values ('PROBE COMPLETE — every assertion held — rolling back');
end
$probe$;

select string_agg(msg, E'\n' order by seq) as probe_result from probe_log;

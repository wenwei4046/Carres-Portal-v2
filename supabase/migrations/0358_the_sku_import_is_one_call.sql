-- =============================================================================
-- 0358_the_sku_import_is_one_call.sql — the SKU import stops running out of
-- subrequests halfway through the file.
-- 2026-08-18
--
-- WHY
-- POST /api/catalog/import-skus advertises 500 rows (skuImportInput caps the
-- batch there) and completes about 45. It spends 3 + M + W subrequests:
--   3   batched reads (product_models, suppliers, product_skus)
--   M   one INSERT per NEW product_model, in a loop
--   W   one UPDATE or INSERT per row, in a loop
-- Cloudflare Workers cap a single invocation at 50 subrequests on the Free
-- plan, and every supabase-js call is one subrequest. A 40-row file that
-- introduces 8 new models is 3 + 8 + 40 = 51. Over.
--
-- It is not wall-clock and not CPU: a Worker has no request-duration cap while
-- the client stays connected, and awaiting I/O accrues no CPU time. The obvious
-- diagnosis is the wrong one.
--
-- The failure is SILENT. postgrest-js RESOLVES `{data, error}` instead of
-- throwing, so the per-row `if (error)` swallows "Too many subrequests by
-- single Worker invocation" and the route returns HTTP 200 with upserted ~45,
-- failed ~455 and 455 identical reasons — indistinguishable from a bad
-- spreadsheet. CLAUDE.md §6 says the database starts CLEAN at go-live and
-- CONFIGURATION must survive. SKUs are configuration, so this breaks on the
-- first real product list; it is invisible today only because every row is test
-- data.
--
-- FIX — the pattern this repository already owns
-- 0143 solved exactly this for the AutoCount order import: same 50-subrequest
-- cap, same "48 updated, 67 failed" signature, fixed by collapsing the N
-- per-record subrequests into ONE batch RPC that loops server-side inside a
-- single transaction, each record in its own BEGIN/EXCEPTION subtransaction so
-- one bad record is reported without aborting the batch.
--
-- This migration does the same for the catalog. After it the route spends a
-- CONSTANT 4 subrequests — three batched reads plus this call — whether the
-- file carries 10 rows or 500. The product_models read stayed on the
-- TypeScript side deliberately: it is what lets the cross-model collision
-- check keep its unit test and keep every operator-facing reason in one
-- language. 4 against a cap of 50 is not the problem; the `+ M + W` was.
--
-- ORDER IS THE CONTRACT. The loop walks `rows` IN INPUT ORDER and re-reads
-- product_skus by code on every iteration. Because it is one transaction,
-- iteration N sees iteration N-1's INSERT, so a duplicated code inside one
-- file still merges last-wins with the earlier row's fields preserved:
--   `price 100, desc X` then `price 200, no desc`  ->  price 200, desc X.
-- A concurrent pool would break that and fix nothing that is actually broken,
-- because it does not reduce the subrequest count.
--
-- SECURITY INVOKER, DELIBERATELY. The route writes as the caller through
-- userClient/RLS and never as service_role. The two tables this touches are
-- already governed by `catalog_write_internal` and `skus_write_internal`
-- (0002), and product_skus.price/cost by the 0175 principal-only trigger — a
-- trigger fires regardless of RLS, and app_role() still reads the caller's JWT
-- claims here. So this function adds NO privilege: the existing boundaries stay
-- exactly where they are. A SECURITY DEFINER version would have silently
-- handed every internal role the principal's pricing rights.
--
-- ORDERING: 0358 — the THIRD number this file has worn in one hour. Written as
-- 0356; `0356_a_delivery_order_is_a_document_with_its_own_register` turned up
-- applied (20260818031718) twenty minutes after a fetch that read the tail as
-- 0355. Renumbered to 0357; eighteen minutes later
-- `0357_a_cancelled_order_voids_its_delivery_orders` (20260818033500) turned up
-- applied too — from `origin/feat/do-auto-complete`, a branch that has not
-- merged, so `main` alone would never have shown it.
--
-- THE NUMBER IS NOT SAFE UNTIL IT IS APPLIED. Do not check the tail, go and do
-- something else, and come back: check it and apply in the same minute. Prove
-- the SQL FIRST with the dry run below, which creates the function inside a
-- transaction and rolls it back — that costs nothing and cares about no number
-- at all, so the only thing left at apply time is the number itself.
-- (CLAUDE.md §5 red line 7.)
-- =============================================================================

create or replace function public.catalog_import_skus(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_model        jsonb;
  v_row          jsonb;
  v_comp         text;
  v_sizes        jsonb;
  v_model_ids    jsonb := '{}'::jsonb;  -- "category::model_key" -> model id (text)
  v_model_errs   jsonb := '{}'::jsonb;  -- "category::model_key" -> failure reason
  v_created      int   := 0;
  v_model_id     uuid;
  v_sku          text;
  v_existing_id  uuid;
  v_existing_mid uuid;
  v_results      jsonb := '[]'::jsonb;
begin
  -- The RLS policies are still the boundary, but an UPDATE they block affects
  -- ZERO ROWS SILENTLY rather than raising. Ask the same question they ask,
  -- once, up front, so a caller who may not write gets a refusal instead of a
  -- clean report saying nothing happened.
  if not public.is_internal() then
    raise exception 'forbidden: catalog import is internal only'
      using errcode = '42501';
  end if;

  if p_payload is null or jsonb_typeof(p_payload->'rows') <> 'array' then
    raise exception 'payload.rows must be a JSON array' using errcode = '22023';
  end if;

  -- ---------------------------------------------------------------------------
  -- 1. Find or create every distinct model the batch names.
  --    (category, model_key) is the unique key from 0001 — this is a lookup on
  --    it, not a second copy of any derivation. The derived SKU CODE stays in
  --    deriveSkuCode() on the TypeScript side and arrives as `sku`; a SQL copy
  --    of it would drift and silently mislabel SKUs.
  -- ---------------------------------------------------------------------------
  for v_model in
    select * from jsonb_array_elements(coalesce(p_payload->'models', '[]'::jsonb))
  loop
    v_comp     := (v_model->>'category') || '::' || (v_model->>'model_key');
    v_model_id := null;

    select id into v_model_id
      from product_models
     where category  = (v_model->>'category')::product_category
       and model_key = v_model->>'model_key';

    if v_model_id is null then
      begin
        -- allowed_options.sizes is seeded from the size variants the file
        -- carries for this model (Modular parity) — same as the route did.
        v_sizes := coalesce(v_model->'sizes', '[]'::jsonb);
        insert into product_models (category, model_key, name, allowed_options)
        values (
          (v_model->>'category')::product_category,
          v_model->>'model_key',
          v_model->>'name',
          case when jsonb_array_length(v_sizes) > 0
               then jsonb_build_object('sizes', v_sizes)
               else '{}'::jsonb
          end
        )
        returning id into v_model_id;
        v_created := v_created + 1;
      exception when others then
        -- Isolate it: every row that wanted this model fails with this reason,
        -- and the rest of the batch still commits.
        v_model_errs := jsonb_set(
          v_model_errs, array[v_comp],
          to_jsonb(format('model "%s": %s', v_model->>'model_key', SQLERRM)));
        v_model_id := null;
      end;
    end if;

    if v_model_id is not null then
      v_model_ids := jsonb_set(v_model_ids, array[v_comp], to_jsonb(v_model_id::text));
    end if;
  end loop;

  -- ---------------------------------------------------------------------------
  -- 2. Upsert every row, IN INPUT ORDER. One element out per element in, so the
  --    route can zip results back to file line numbers by index.
  -- ---------------------------------------------------------------------------
  for v_row in select * from jsonb_array_elements(p_payload->'rows') loop
    v_comp := (v_row->>'category') || '::' || (v_row->>'model_key');
    v_sku  := v_row->>'sku';

    if jsonb_exists(v_model_errs, v_comp) then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'result', 'error', 'error', v_model_errs->>v_comp));
      continue;
    end if;

    v_model_id := nullif(v_model_ids->>v_comp, '')::uuid;
    if v_model_id is null then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'result', 'error',
        'error', format('model "%s" could not be resolved', v_row->>'model_key')));
      continue;
    end if;

    -- Fresh read every iteration: this is what makes last-wins work inside one
    -- file. Iteration N sees iteration N-1's INSERT because they share the
    -- transaction.
    v_existing_id  := null;
    v_existing_mid := null;
    select id, model_id into v_existing_id, v_existing_mid
      from product_skus where sku = v_sku;

    -- A code that already lives under a DIFFERENT model is a cross-category
    -- collision ({MODEL_KEY}-{variant} does not encode the category). Fail the
    -- row rather than re-target an unrelated SKU.
    if v_existing_id is not null and v_existing_mid <> v_model_id then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'result', 'error',
        'error', format('code %s already belongs to another model — pick a distinct model_key', v_sku)));
      continue;
    end if;

    begin
      if v_existing_id is not null then
        -- UPDATE — an ABSENT KEY MEANS PRESERVE. A blank cell was dropped
        -- upstream precisely so an export -> edit -> re-import round-trip can
        -- never zero a price or re-type a preset SKU to 'size'. `variant` is
        -- the one field the row always states.
        --
        -- Writing the column back to itself also keeps the 0175 trigger quiet:
        -- NEW.price IS NOT DISTINCT FROM OLD.price, so a non-principal editing
        -- a description is not accused of setting a price.
        update product_skus set
          variant      = v_row->>'variant',
          variant_kind = case when jsonb_exists(v_row, 'variant_kind')
                              then (v_row->>'variant_kind')::variant_kind
                              else variant_kind end,
          price        = case when jsonb_exists(v_row, 'price')
                              then (v_row->>'price')::numeric
                              else price end,
          cost         = case when jsonb_exists(v_row, 'cost')
                              then (v_row->>'cost')::numeric
                              else cost end,
          description  = case when jsonb_exists(v_row, 'description')
                              then v_row->>'description'
                              else description end,
          pos_active   = case when jsonb_exists(v_row, 'pos_active')
                              then (v_row->>'pos_active')::boolean
                              else pos_active end,
          -- Only a row that NAMED a supplier moves one; an update that is
          -- silent about it keeps the stored supplier.
          supplier_id  = case when coalesce((v_row->>'supplier_explicit')::boolean, false)
                              then nullif(v_row->>'supplier_id', '')::uuid
                              else supplier_id end
        where id = v_existing_id;

        -- RLS refuses by matching nothing, not by raising. Without this the row
        -- would report success while the database was never touched.
        if not found then
          raise exception
            'sku % was not updated — row-level security refused it, or it was deleted concurrently', v_sku
            using errcode = '42501';
        end if;

        v_results := v_results || jsonb_build_array(jsonb_build_object('result', 'updated'));
      else
        -- INSERT — omitted variant_kind defaults to 'size', omitted price to 0,
        -- omitted cost to null, omitted pos_active to true.
        insert into product_skus (
          model_id, sku, variant, variant_kind,
          price, cost, supplier_id, description, pos_active
        ) values (
          v_model_id,
          v_sku,
          v_row->>'variant',
          coalesce((v_row->>'variant_kind')::variant_kind, 'size'),
          coalesce((v_row->>'price')::numeric, 0),
          (v_row->>'cost')::numeric,
          nullif(v_row->>'supplier_id', '')::uuid,
          v_row->>'description',
          coalesce((v_row->>'pos_active')::boolean, true)
        );

        v_results := v_results || jsonb_build_array(jsonb_build_object('result', 'inserted'));
      end if;
    exception when others then
      -- One bad row is one reported row. The batch still commits — including
      -- the 0175 pricing refusal, which arrives here as a per-row reason
      -- instead of a 500.
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'result', 'error', 'error', SQLERRM));
    end;
  end loop;

  return jsonb_build_object('created_models', v_created, 'rows', v_results);
end;
$$;

comment on function public.catalog_import_skus(jsonb) is
  'Batch SKU import: find-or-create the models, then upsert every row in input order inside ONE transaction. Holds POST /api/catalog/import-skus at a constant 4 Cloudflare subrequests instead of 3 + models + rows, which truncated files past ~45 rows against the 50-subrequest cap. SECURITY INVOKER on purpose — RLS (0002) and the principal-only price trigger (0175) remain the boundaries.';

revoke all on function public.catalog_import_skus(jsonb) from public;
grant execute on function public.catalog_import_skus(jsonb) to authenticated;

-- =============================================================================
-- Sanity — schema facts only. This migration asserts nothing about the rows it
-- walks past (CLAUDE.md §5 red line 8).
-- =============================================================================
do $sanity$
declare
  n_fn      int;
  v_secdef  boolean;
begin
  select count(*) into n_fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'catalog_import_skus';
  if n_fn <> 1 then
    raise exception '0358 sanity: catalog_import_skus missing or duplicated (%)', n_fn;
  end if;

  -- The whole safety argument rests on this staying INVOKER: as DEFINER it
  -- would run as the owner, RLS would not apply, and every internal role would
  -- inherit the principal's pricing rights.
  select p.prosecdef into v_secdef
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'catalog_import_skus';
  if v_secdef then
    raise exception '0358 sanity: catalog_import_skus must be SECURITY INVOKER';
  end if;

  -- The 0175 price lock must still be on the table this function writes.
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.product_skus'::regclass
       and tgname  = 'trg_enforce_sku_price_cost_principal_only'
  ) then
    raise exception '0358 sanity: the 0175 principal-only price trigger is missing';
  end if;

  raise notice '0358 OK: catalog_import_skus added (SECURITY INVOKER); 0175 price trigger intact';
end $sanity$;

-- =============================================================================
-- VERIFY BEFORE MERGING (ENGINEERING.md §5). Not part of the migration: it
-- writes rows, and a migration never asserts anything about data.
--
-- These checks are the ONLY proof of the rules that moved out of TypeScript and
-- into SQL. vitest cannot reach them — a mock that re-implemented them would be
-- testing itself.
--
-- HOW TO RUN IT WITHOUT APPLYING ANYTHING. `create function` is transactional in
-- Postgres, so paste THIS ENTIRE FILE and the checks below into one
-- `begin; … rollback;`. The function exists for the length of that transaction
-- and vanishes with it. Nothing is applied, no number is claimed, and the SQL is
-- fully proved — which is what lets you leave the number until the last minute.
--
-- The SQL editor connects as `postgres`, where `auth.uid()` is NULL: is_internal()
-- returns false, the guard refuses you, and RLS would not apply to the owner
-- anyway. So each check impersonates a real user:
--     set local request.jwt.claims = '{"sub":"<app_users.id>"}';
--     set local role authenticated;
-- Get the ids from:
--     select id, email, role from public.app_users
--      where status = 'active' and role in ('principal','operation','dealer');
--
--   begin;
--
--   -- 1. IN-ORDER LAST-WINS. Iteration N sees N-1's insert because they share
--   --    this transaction. Row B carries only the fields it states, so B's
--   --    price must land and A's description must survive.
--   select public.catalog_import_skus(jsonb_build_object(
--     'models', jsonb_build_array(jsonb_build_object(
--       'category','sofa','model_key','zzz-verify','name','ZZZ Verify','sizes',jsonb_build_array('1S'))),
--     'rows', jsonb_build_array(
--       jsonb_build_object('category','sofa','model_key','zzz-verify','sku','ZZZ-VERIFY-1S',
--                          'variant','1S','price',100,'description','X',
--                          'supplier_id',null,'supplier_explicit',false),
--       jsonb_build_object('category','sofa','model_key','zzz-verify','sku','ZZZ-VERIFY-1S',
--                          'variant','1S','price',200,
--                          'supplier_id',null,'supplier_explicit',false))));
--   -- EXPECT: created_models 1, rows [inserted, updated]
--   select price, description, variant_kind from product_skus where sku = 'ZZZ-VERIFY-1S';
--   -- EXPECT: 200.00 | X | size      <- NOT 200 | null. A null description here
--   --         means absent-key-means-preserve is broken and every re-import
--   --         would wipe the columns the file left blank.
--
--   -- 2. THE MODEL IS FOUND, NOT DUPLICATED, ON A SECOND RUN.
--   select public.catalog_import_skus(jsonb_build_object(
--     'models', jsonb_build_array(jsonb_build_object(
--       'category','sofa','model_key','zzz-verify','name','ZZZ Verify','sizes','[]'::jsonb)),
--     'rows', '[]'::jsonb));
--   -- EXPECT: created_models 0
--
--   -- 3. NEGATIVE CONTROL — the guard must actually fire. Run this as a DEALER
--   --    (or any non-internal user). It must RAISE 42501, not return a clean
--   --    report saying nothing happened.
--   --      select public.catalog_import_skus('{"models":[],"rows":[]}'::jsonb);
--   --    EXPECT: ERROR: forbidden: catalog import is internal only
--
--   -- 4. NEGATIVE CONTROL — the 0175 price lock still bites through the RPC.
--   --    Run as OPERATION (not principal) against an existing sku:
--   --      ... 'rows' with 'price', 999 ...
--   --    EXPECT: that row comes back {"result":"error"} naming the principal —
--   --    a per-row refusal, and the rest of the batch still commits.
--
--   rollback;
-- =============================================================================

-- 0376_the_import_carries_the_suppliers_own_code.sql
-- ===========================================================================
-- THE SKU IMPORT CARRIES `supplier_code` (2026-08-21).
--
-- WHY. 0375 gave product_skus the supplier's own item code, and the ADD-SKU
-- form can write it. The IMPORT could not - `catalog_import_skus` (0358) names
-- its columns explicitly, so a CSV column the function does not know is simply
-- dropped. Keying the Hookka quotation in one SKU at a time is the exact work
-- 0358 exists to avoid.
--
-- WHAT CHANGES. Two statements inside one function: the INSERT gains the
-- column, and the UPDATE gains an absent-key-means-PRESERVE branch. Everything
-- else is BYTE-IDENTICAL to 0358's body - same signature, same SECURITY
-- INVOKER, same is_internal() gate, same per-row BEGIN/EXCEPTION subtransaction,
-- same in-order last-wins replay. Produced by copying the committed body and
-- editing those two places, not by retyping it.
--
-- ABSENT IS NOT BLANK, and this is the rule the whole importer turns on. A file
-- with NO supplier_code column leaves existing codes alone (`jsonb_exists` is
-- false, so preserve). A file WITH the column and a blank cell CLEARS it - the
-- only way the importer can remove one. Getting this backwards would mean
-- every re-import silently wipes codes somebody keyed in by hand.
--
-- SECURITY: unchanged. SECURITY INVOKER on purpose - RLS (0002) and the
-- principal-only price trigger (0175) stay the boundaries, and supplier_code is
-- not money so 0175 never sees it. No RLS change, no grant change.
--
-- NOT APPLIED BY THE AUTHOR. Number taken 2026-08-21 as MAX(repo tail, every
-- remote branch, tracker) = 0375 (applied), so this is 0376 - RE-CHECK THE
-- TRACKER IN THE SAME MINUTE YOU APPLY:
--     select name, version from supabase_migrations.schema_migrations
--     order by version desc limit 5;
-- The SQL editor writes NO tracker row; insert it by hand, WITH the 0376_
-- prefix.
-- ===========================================================================

begin;

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
          -- 0376 - ABSENT means PRESERVE, exactly like every column around it:
          -- a re-import whose file has no supplier_code column must not wipe
          -- codes somebody keyed in by hand. A PRESENT but blank cell clears,
          -- which is the only way the importer can ever remove one.
          supplier_code = case when jsonb_exists(v_row, 'supplier_code')
                              then nullif(v_row->>'supplier_code', '')
                              else supplier_code end,
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
          price, cost, supplier_id, supplier_code, description, pos_active
        ) values (
          v_model_id,
          v_sku,
          v_row->>'variant',
          coalesce((v_row->>'variant_kind')::variant_kind, 'size'),
          coalesce((v_row->>'price')::numeric, 0),
          (v_row->>'cost')::numeric,
          nullif(v_row->>'supplier_id', '')::uuid,
          -- 0376 - the SUPPLIER'S own code. '' is not a code, so it stores null.
          nullif(v_row->>'supplier_code', ''),
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

commit;

-- ===========================================================================
-- VERIFY - run AFTER applying, inside a rolled-back transaction so nothing
-- survives. `create function` is transactional, which is how 0358 itself was
-- proven before it was applied.
--
-- 1 - the function still exists exactly once and is still INVOKER
--     select proname, prosecdef from pg_proc
--     where proname = 'catalog_import_skus';
--     -- expect ONE row, prosecdef = FALSE
--
-- 2 - a code imports, and a re-import WITHOUT the column preserves it
--     begin;
--       set local request.jwt.claims = '{"sub":"PUT-AN-OPERATION-APP-USER-ID"}';
--       set local role authenticated;
--
--       select public.catalog_import_skus(jsonb_build_object(
--         'models', jsonb_build_array(jsonb_build_object(
--           'category','accessory','model_key','verify-0376','name','Verify 0376')),
--         'rows', jsonb_build_array(jsonb_build_object(
--           'category','accessory','model_key','verify-0376','variant','X',
--           'sku','ZZZ-0376','supplier_code','THEIR-CODE-1'))));
--       select sku, supplier_code from product_skus where sku = 'ZZZ-0376';
--       -- expect THEIR-CODE-1
--
--       -- re-import the SAME row with NO supplier_code key at all:
--       select public.catalog_import_skus(jsonb_build_object(
--         'models', '[]'::jsonb,
--         'rows', jsonb_build_array(jsonb_build_object(
--           'category','accessory','model_key','verify-0376','variant','X',
--           'sku','ZZZ-0376','description','touched'))));
--       select sku, supplier_code, description from product_skus where sku = 'ZZZ-0376';
--       -- NEGATIVE CONTROL: expect THEIR-CODE-1 STILL, not null.
--
--       -- and a PRESENT but blank cell clears it:
--       select public.catalog_import_skus(jsonb_build_object(
--         'models', '[]'::jsonb,
--         'rows', jsonb_build_array(jsonb_build_object(
--           'category','accessory','model_key','verify-0376','variant','X',
--           'sku','ZZZ-0376','supplier_code',''))));
--       select sku, supplier_code from product_skus where sku = 'ZZZ-0376';
--       -- expect NULL
--     rollback;
--
-- 3 - NEGATIVE CONTROL: the internal gate still bites. Use a DEALER app_users
--     id (not your own - you are internal, so the check would pass vacuously).
--     -- expect ERROR 42501 forbidden: catalog import is internal only
-- ===========================================================================

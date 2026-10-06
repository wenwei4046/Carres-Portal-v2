-- 0384_the_import_carries_the_pwp_price.sql
-- ===========================================================================
-- THE SKU IMPORT CARRIES `pwp_price` (2026-08-24).
--
-- WHY. 0186 gave product_skus the per-SKU PWP reward price and the SKU Master
-- cell can write it. The IMPORT could not - `catalog_import_skus` names its
-- columns explicitly, so a pwp_price column in the sheet was silently dropped
-- while the import reported success. Keying a promotion's reward prices one
-- SKU at a time is the exact work the batch importer exists to avoid - the
-- same defect 0376 closed for supplier_code, closed the same way.
--
-- WHAT CHANGES. Two statements inside one function: the INSERT gains the
-- column, and the UPDATE gains an absent-key-means-PRESERVE branch. Everything
-- else is BYTE-IDENTICAL to 0376's committed body - same signature, same
-- SECURITY INVOKER, same is_internal() gate, same per-row BEGIN/EXCEPTION
-- subtransaction, same in-order last-wins replay. Produced by copying the
-- committed 0376 body and editing those two places, not by retyping it.
--
-- NO CLEAR-BY-BLANK, unlike supplier_code, on purpose: the client mapper OMITS
-- a blank cell and REFUSES a literal 0 (0186 law: `p == null || p <= 0` means
-- NOT SET - a free reward is a 'promo' rule, never a price of 0). So a present
-- key always carries a real positive price, and clearing one stays a
-- deliberate act on the SKU Master cell.
--
-- SECURITY: unchanged, and the 0175 interaction is THE POINT. pwp_price is
-- principal-locked by the extended 0175 trigger and this function is SECURITY
-- INVOKER on purpose - so a NON-principal import carrying pwp_price fails on
-- the lock. The route already refuses such a batch whole (hasPricingIntent
-- counts pwpPrice), so the trigger is the second wall, not the first. No RLS
-- change, no grant change. KEEP INVOKER - as DEFINER every internal role would
-- inherit the principal's pricing rights, which is what 0358's sanity block
-- exists to prevent.
--
-- DEPLOY-ORDER SAFE, unlike 0375's column: the client sends pwp_price as a KEY
-- IN A JSONB PAYLOAD and this function reads only the keys it knows. Client
-- deployed first = the key is ignored (rows import, prices don't land yet).
-- Migration applied first = older clients simply never send the key.
--
-- NOT APPLIED BY THE AUTHOR. Number taken 2026-08-24 as MAX(repo tail, every
-- remote branch, tracker) = 0383 (origin/claude/purchasing-02-so-batch-purchase,
-- unmerged), so this is 0384 - RE-CHECK IN THE SAME MINUTE YOU APPLY:
--     select name, version from supabase_migrations.schema_migrations
--     order by version desc limit 5;
-- and re-scan the branches with git ls-tree across refs - NOT `git log
-- --diff-filter=A`, which misses renames; a renumber IS a rename and that
-- mistake was made once already today. The SQL editor writes NO tracker row;
-- insert it by hand, WITH the 0384_ prefix.
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
          -- 0384 - pwp_price: ABSENT means PRESERVE. There is no clear-by-blank
          -- branch ON PURPOSE, unlike supplier_code: the client mapper OMITS a
          -- blank cell and REFUSES a literal 0, so a present key always carries
          -- a real price. Clearing a PWP price is a deliberate act that belongs
          -- to the SKU Master cell, not to a spreadsheet's empty cell.
          pwp_price = case when jsonb_exists(v_row, 'pwp_price')
                              then (v_row->>'pwp_price')::numeric
                              else pwp_price end,
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
          price, cost, pwp_price, supplier_id, supplier_code, description, pos_active
        ) values (
          v_model_id,
          v_sku,
          v_row->>'variant',
          coalesce((v_row->>'variant_kind')::variant_kind, 'size'),
          coalesce((v_row->>'price')::numeric, 0),
          (v_row->>'cost')::numeric,
          -- 0384 - the 0186 PWP reward price. NULL when the file omits it; the
          -- client refuses a literal 0 (0 means NOT SET under the 0186 law).
          (v_row->>'pwp_price')::numeric,
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
-- survives (`create function` is transactional).
--
-- 1 - the function still exists exactly once and is still INVOKER
--     select proname, prosecdef from pg_proc
--     where proname = 'catalog_import_skus';
--     -- expect ONE row, prosecdef = FALSE
--
-- 2 - a PRINCIPAL imports a price, and a column-less re-import PRESERVES it
--     begin;
--       set local request.jwt.claims = '{"sub":"PUT-A-PRINCIPAL-APP-USER-ID"}';
--       set local role authenticated;
--
--       select public.catalog_import_skus(jsonb_build_object(
--         'models', jsonb_build_array(jsonb_build_object(
--           'category','accessory','model_key','verify-0384','name','Verify 0384')),
--         'rows', jsonb_build_array(jsonb_build_object(
--           'category','accessory','model_key','verify-0384','variant','X',
--           'sku','ZZZ-0384','pwp_price','88.50'))));
--       select sku, pwp_price from product_skus where sku = 'ZZZ-0384';
--       -- expect 88.50
--
--       -- re-import the SAME row with NO pwp_price key at all:
--       select public.catalog_import_skus(jsonb_build_object(
--         'models', '[]'::jsonb,
--         'rows', jsonb_build_array(jsonb_build_object(
--           'category','accessory','model_key','verify-0384','variant','X',
--           'sku','ZZZ-0384','description','touched'))));
--       select sku, pwp_price, description from product_skus where sku = 'ZZZ-0384';
--       -- MIDDLE ASSERTION: expect 88.50 STILL, not null.
--     rollback;
--
-- 3 - NEGATIVE CONTROL: a NON-principal internal user (a real operation
--     app_users id, not your own) importing a row WITH pwp_price fails ON THAT
--     ROW via the 0175 lock (the route would have refused the batch earlier;
--     this proves the second wall). Their import WITHOUT pwp_price still works.
--
-- 4 - NEGATIVE CONTROL: a DEALER id gets 42501 forbidden: catalog import is
--     internal only (the is_internal gate is untouched).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0323 · A typed demand can say what it is for (card P15, Loo 2026-08-04)
--
-- ONE GATE MOVES AND NOTHING ELSE. 0319 shipped `purchasing_create_demand`
-- refusing every purpose but `ready_stock`, and its own comment said why the
-- refusal was written that way rather than by leaving the values out of the
-- CHECK:
--
--     "The refusal is NAMED (`purpose_not_enabled`) rather than the value
--      being absent, so the day one is approved this gate is the only thing
--      that changes."
--
-- That day is today. Loo ruled 2026-08-04 (card P15) that a typed demand must
-- record what it is FOR — `purchase_demands` exists to tell Warranty from
-- Display from Office, and with one purpose admitted it could tell them apart
-- from nothing. So the gate becomes the CHECK's own list.
--
-- THE CHECK IS NOT WIDENED AND MUST NOT BE. It already holds exactly these
-- four (`ready_stock` · `display` · `office` · `warranty`), because 0319 kept
-- the architecture while the door admitted one. This migration adds no value,
-- removes none, and re-orders none — it stops the door refusing three the
-- table was always able to store.
--
-- WHY THE GATE STAYS AT ALL RATHER THAN FALLING THROUGH TO THE CHECK. A CHECK
-- violation reaches the operator as `23514` and a constraint name; a named
-- refusal reaches them as a sentence the route can map. The list is therefore
-- spelt HERE too, and `DEMAND_PURPOSES` in `packages/shared` mirrors it — the
-- same three-place discipline 0322 paid for on the pool's reasons, where a
-- word offered in a dropdown that the server refuses by name is the disease.
--
-- `Spare Parts` and `Other…` are DELIBERATELY ABSENT. Both are words in
-- `TO_ORDER_WORDS`; neither has ever had a database value, and inventing one
-- here would be this migration ruling on a business question nobody has asked
-- ("other" than what, recorded where?). They stay off the screen with the
-- server, not against it.
--
-- NO BACKFILL AND NOTHING TO BACK-FILL. Every existing row is `ready_stock`
-- because nothing else could ever have been written; those rows are still
-- correct and are not touched.
-- ---------------------------------------------------------------------------

create or replace function public.purchasing_create_demand(
  p_sku            text,
  p_qty            int,
  p_destination_id uuid,
  p_required_by    date default null,
  p_remark         text default null,
  -- Still defaulted, and still a parameter rather than a literal — 0319's own
  -- reason holds: enabling a purpose is a change to this function's GATE and
  -- never a signature change, because adding a parameter to a live RPC creates
  -- a second signature (guardrail #8).
  p_purpose        text default 'ready_stock'
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role     app_role;
  v_supplier uuid;
  v_id       uuid;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  -- The four the table can store, named here so an unknown one is refused by
  -- NAME rather than by a raw constraint violation.
  if p_purpose is null
     or p_purpose not in ('ready_stock', 'display', 'office', 'warranty') then
    raise exception 'purpose % is not a purpose', p_purpose
      using errcode = '22023', detail = 'unknown_purpose';
  end if;
  if p_qty is null or p_qty < 1 then
    raise exception 'qty must be at least 1' using errcode = '22023', detail = 'invalid_qty';
  end if;

  -- THE SUPPLIER IS DERIVED, NEVER CHOSEN (Jess, 2026-08-03). A product has
  -- exactly one factory; asking a human to pick one is asking them to get it
  -- wrong, and a demand pointed at the wrong factory becomes a purchase order
  -- pointed at the wrong factory.
  --
  -- P15 shows the supplier in the dialog as a FACT the moment an item is
  -- picked. That is a display of what THIS function derives, never a second
  -- answer: the client sends no supplier and there is no parameter to send.
  select supplier_id into v_supplier from product_skus where sku = p_sku;
  if not found then
    raise exception 'unknown sku %', p_sku using errcode = '22023', detail = 'unknown_sku';
  end if;
  if v_supplier is null then
    -- Not silently defaulted: a SKU nobody has mapped is a configuration hole
    -- and the operator must see it, not inherit a guess (P1's law).
    raise exception 'sku % has no supplier', p_sku
      using errcode = '22023', detail = 'sku_has_no_supplier';
  end if;

  if not exists (
    select 1 from purchasing_destinations where id = p_destination_id and active
  ) then
    raise exception 'unknown destination' using errcode = '22023', detail = 'unknown_destination';
  end if;

  insert into purchase_demands
    (purpose, sku, supplier_id, destination_id, qty, required_by, remark, created_by)
  values
    (p_purpose, p_sku, v_supplier, p_destination_id, p_qty, p_required_by,
     nullif(btrim(coalesce(p_remark,'')), ''), auth.uid())
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'supplier_id', v_supplier);
end;
$fn$;

-- The table's own sentence stops saying V1 buys one thing.
comment on table public.purchase_demands is
  'Demand a human typed, as opposed to demand computed from customer orders (Jess, 2026-08-03). The write door admits the four purposes the CHECK holds — ready_stock, display, office, warranty — since 0323 (Loo, card P15); Spare Parts and Other have no value here and are not offered anywhere. The supplier is DERIVED from the SKU, never chosen. No status column: open/ordered/done derive from po_id. No proposal and no approval layer, because today one person decides and Operation executes.';

-- ---------------------------------------------------------------------------
-- Sanity — asserted, never promised.
-- ---------------------------------------------------------------------------
do $$
declare
  v_src text;
  v_check text;
  v_word text;
begin
  select prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'purchasing_create_demand';

  -- The gate this migration exists to remove is gone.
  if v_src like '%purpose_not_enabled%' then
    raise exception '0323: the ready_stock-only gate is still in the function body';
  end if;
  -- ...and it was replaced by a refusal, not by nothing.
  if v_src not like '%unknown_purpose%' then
    raise exception '0323: an unknown purpose is no longer refused by name';
  end if;

  -- The CHECK is UNTOUCHED. Four values, exactly the four the door now admits.
  select pg_get_constraintdef(oid) into v_check
    from pg_constraint
   where conrelid = 'public.purchase_demands'::regclass
     and conname = 'purchase_demands_purpose_check';
  if v_check is null then
    raise exception '0323: purchase_demands_purpose_check has gone';
  end if;
  foreach v_word in array array['ready_stock','display','office','warranty'] loop
    if position(v_word in v_check) = 0 then
      raise exception '0323: % is not in the purpose CHECK', v_word;
    end if;
  end loop;
  if position('spare_parts' in v_check) > 0 or position('''other''' in v_check) > 0 then
    raise exception '0323: a purpose nobody ruled has entered the CHECK';
  end if;

  -- Exactly ONE signature. A second one is guardrail #8's own failure.
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'purchasing_create_demand') <> 1 then
    raise exception '0323: purchasing_create_demand has more than one signature';
  end if;

  -- The table still has no write policy — every write stays behind the door.
  if exists (
    select 1 from pg_policy
     where polrelid = 'public.purchase_demands'::regclass
       and polcmd in ('a', 'w', 'd')
  ) then
    raise exception '0323: purchase_demands has gained a write policy';
  end if;
end $$;

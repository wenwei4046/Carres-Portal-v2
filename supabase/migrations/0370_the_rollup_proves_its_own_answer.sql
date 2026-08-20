-- =============================================================================
-- 0370_the_rollup_proves_its_own_answer.sql
-- WAREHOUSE UNIT AUTHORITY — the cache was silently wiped, and nothing noticed.
--
-- WHAT HAPPENED, measured on production 2026-08-20.
--
-- Between 0368 (which changed the view from `count(*) filter` to
-- `sum(qty) filter`) and 0369 (which coalesced the result), the view returned
-- NULL for any empty bucket — `reserved` was NULL on 73 of 74 rows. During that
-- window `ops_rollup_stock_balances` ran, and it is built on two predicates
-- that both read `(a.sellable + a.reserved)`:
--
--     insert ... where (a.sellable + a.reserved) > 0          -- NULL > 0 → NULL → row skipped
--     update ... set qty = 0 where not exists (... > 0)       -- so the row matched, and was ZEROED
--
-- The result: `stock_balances` said Carres held **5** units across 1 SKU while
-- the register held **980** across 50. Eighteen live SECURITY DEFINER functions
-- across Orders, Purchasing, Receiving and Delivery read that cache. It was
-- repaired by re-running the rollup once the view coalesced — 980 = 980, zero
-- drifted rows — and 0369 removed the NULLs that caused it.
--
-- BUT THE REAL DEFECT IS NOT THE NULL. It is that a function whose entire job
-- is to keep two numbers equal could write a wrong answer and return success.
-- The card's own sanity block ran BEFORE the wipe and could not have caught it;
-- nothing between the wipe and a human reading the number would have.
--
-- SO THE ROLLUP NOW PROVES ITS OWN ANSWER:
--
--   ① It upserts EVERY (sku, Site) pair the register knows about, zeros are
--      included, and zeroes any cache row the register no longer has. The
--      `> 0` predicate that the NULL slipped through is gone entirely — there
--      is no longer a value that can make a row silently skip its update.
--   ② After writing, it RE-READS what it wrote and compares it with the view.
--      A disagreement raises, which aborts the statement that triggered it. A
--      refused write is recoverable; a silently wrong inventory total is what
--      this whole card exists to make impossible.
--
-- Asserts NO production row count.
-- =============================================================================

set search_path = public;

create or replace function public.ops_rollup_stock_balances(p_wh uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_drift int;
begin
  perform set_config('carres.stock_rollup', '1', true);

  -- ① Every pair the register knows, zeros included. No `> 0` predicate: a
  --    value that skips its own row is exactly how the cache was wiped.
  insert into public.stock_balances (sku, warehouse_id, qty, reserved)
  select a.sku, a.warehouse_id, (a.sellable + a.reserved), a.reserved
    from public.stock_sku_availability a
   where a.warehouse_id = p_wh
  on conflict (sku, warehouse_id)
    do update set
      qty        = excluded.qty,
      reserved   = excluded.reserved,
      updated_at = now();

  -- A cache row for goods the register no longer holds anywhere is zero, not
  -- stale. `not exists` is NULL-safe by construction.
  update public.stock_balances sb
     set qty = 0, reserved = 0, updated_at = now()
   where sb.warehouse_id = p_wh
     and (sb.qty <> 0 or sb.reserved <> 0)
     and not exists (
       select 1 from public.stock_sku_availability a
        where a.warehouse_id = p_wh and a.sku = sb.sku
     );

  -- ② Prove it. Read back what was just written and compare it with the
  --    authority. `is distinct from` so a NULL can never make this vacuous —
  --    that is the mistake that let the wipe through in the first place.
  select count(*) into v_drift
    from public.stock_balances sb
    left join public.stock_sku_availability a
      on a.sku = sb.sku and a.warehouse_id = sb.warehouse_id
   where sb.warehouse_id = p_wh
     and (sb.qty      is distinct from coalesce(a.sellable + a.reserved, 0)
       or sb.reserved is distinct from coalesce(a.reserved, 0));

  if v_drift > 0 then
    raise exception
      'stock totals for site % disagree with the unit register on % rows — refusing to leave a wrong number behind',
      p_wh, v_drift
      using errcode = 'P0001', detail = 'stock_rollup_disagrees';
  end if;

  perform set_config('carres.stock_rollup', '0', true);
end;
$$;

comment on function public.ops_rollup_stock_balances(uuid) is
  '0370 — derives the non-authoritative `stock_balances` cache from the unit '
  'register and then PROVES the two agree, raising if they do not. It was able '
  'to wipe the cache silently before this.';

-- Repair every Site now, and let the new post-condition confirm each one.
do $$
declare v_wh uuid;
begin
  for v_wh in select distinct warehouse_id from public.ops_stock_items where warehouse_id is not null loop
    perform public.ops_rollup_stock_balances(v_wh);
  end loop;
end $$;

-- ─── SANITY ─────────────────────────────────────────────────────────────────
do $$
declare
  v_drift int;
  v_cache bigint;
  v_reg   bigint;
begin
  select count(*) into v_drift
    from public.stock_balances sb
    left join public.stock_sku_availability a
      on a.sku = sb.sku and a.warehouse_id = sb.warehouse_id
   where sb.qty      is distinct from coalesce(a.sellable + a.reserved, 0)
      or sb.reserved is distinct from coalesce(a.reserved, 0);
  if v_drift > 0 then
    raise exception '0370 sanity: % cached totals still disagree with the register', v_drift;
  end if;

  -- The two numbers a human would compare, compared.
  select coalesce(sum(qty), 0) into v_cache from public.stock_balances;
  select coalesce(sum(sellable + reserved), 0) into v_reg from public.stock_sku_availability;
  if v_cache is distinct from v_reg then
    raise exception '0370 sanity: cache holds % where the register holds %', v_cache, v_reg;
  end if;

  -- NEGATIVE CONTROL — the post-condition must be capable of failing.
  select count(*) into v_drift
    from public.stock_balances sb
    left join public.stock_sku_availability a
      on a.sku = sb.sku and a.warehouse_id = sb.warehouse_id
   where sb.qty is distinct from coalesce(a.sellable + a.reserved, 0) + 1;
  if v_drift = 0 then
    raise exception '0370 sanity: the drift check cannot fail — it is not a check';
  end if;

  raise notice '0370 OK: the cache equals the register, and the rollup proves it every time';
end $$;

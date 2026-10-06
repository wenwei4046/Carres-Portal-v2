-- =============================================================================
-- 0558_a_renamed_product_code_carries_through_to_the_records_that_name_it.sql
-- =============================================================================
-- WHAT WAS BROKEN
--   product_skus.sku is the product CODE, and it is editable (PATCH /skus/:id).
--   Every record that names a product stores that code as free text: order_lines.sku,
--   purchase_order_lines.sku, stock_balances.sku, supplier_bill_lines.sku and two
--   dozen more. None of them has a foreign key to product_skus, so a rename changed
--   the catalogue and left every existing record pointing at a code that no longer
--   exists. The owner's ruling, 22 Sep 2026: "if someone renames a product, then the
--   existing records that have that name should reflect the change no? it's like the
--   account code name change then all reflect scenario all over again."
--
--   Where it showed: dealer_commission_source (0544) reaches a line's product with
--   `left join product_skus sk on sk.sku = l.sku`. After a rename the join misses,
--   the line comes back with a NULL category, the service/guarantee exclusion in
--   packages/shared/src/dealer-commission.ts does not fire, and the line is paid at
--   the DEFAULT 25% instead of nothing. Measured on a local clone: a dealer order of
--   one sofa line (RM1000) and one service line (RM1000), fully collected, earned
--   RM250.00; after renaming the service SKU it earned RM500.00, with nothing on the
--   report saying anything had changed.
--
-- WHAT THIS CHANGES
--   The same shape as 0550, one step down: there the account code cascaded along
--   foreign keys, here there are no foreign keys to cascade along, so the rename
--   carries itself. An after-update trigger on product_skus walks every text column
--   in public named `sku` or `*_sku` on a base table and rewrites the old code to
--   the new one. The walk is done in the catalog at run time, not typed out, so a
--   table added after this migration is carried too.
--
--   Nothing else moves. No commission rate, no money rule, no RLS policy, no grant.
--   The trigger fires only when the code actually changes.
--
-- WHAT IT DOES NOT DO
--   DELETION is untouched, on the owner's instruction ("as for remove, that is a
--   edge case, ignore that first"). No foreign key is added — a foreign key would
--   also have started REFUSING the delete of a SKU that any order line names, which
--   is the ruling he has not made. Deleting a SKU still succeeds and still leaves
--   records naming a code that is gone; those lines still fall through to the
--   default commission rate exactly as they do today.
--
-- KNOWN CEILING, recorded rather than hidden: the cascade is a plain UPDATE, so it
--   fires whatever update triggers those tables carry. No table in the sweep has a
--   frozen-document trigger today (0464/0477/0478/0529 sit on bills, vouchers,
--   invoices, receipts and money moves, none of which holds a sku column). If one
--   ever gains one, a renumber will be refused there, the way 0550 recorded for the
--   chart of accounts.
--
-- RLS: unchanged. No policy is created, dropped or altered. The trigger function is
--   SECURITY DEFINER so the cascade is not half-done by a caller who can write the
--   catalogue but cannot see every row that names it; only the catalogue write
--   itself is gated, and that gate (principal-only sku writes, 0178) is unchanged.
-- DATA: none. §6 — no backfill, no cleanup. The next rename carries its own rows.
-- DR/CR: none.
-- =============================================================================

begin;

create or replace function public.product_sku_code_cascade()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  r record;
begin
  for r in
    select c.table_name, c.column_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema
       and t.table_name = c.table_name
       and t.table_type = 'BASE TABLE'
     where c.table_schema = 'public'
       and c.data_type = 'text'
       and (c.column_name = 'sku' or c.column_name like '%\_sku')
       and c.table_name <> 'product_skus'
     order by c.table_name, c.column_name
  loop
    execute format('update public.%I set %I = $1 where %I = $2',
                   r.table_name, r.column_name, r.column_name)
      using new.sku, old.sku;
  end loop;
  return new;
end
$fn$;

comment on function public.product_sku_code_cascade() is
  'A product code that changes carries itself into every record that names it: every text column in public called sku or *_sku on a base table (0558). Deletion is not handled — the owner set that aside.';

drop trigger if exists product_skus_code_cascade on public.product_skus;
create trigger product_skus_code_cascade
  after update of sku on public.product_skus
  for each row
  when (new.sku is distinct from old.sku)
  execute function public.product_sku_code_cascade();

revoke execute on function public.product_sku_code_cascade() from public, anon;

commit;

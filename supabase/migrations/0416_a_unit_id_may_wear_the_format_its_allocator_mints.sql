-- 0416_a_unit_id_may_wear_the_format_its_allocator_mints.sql
--
-- NO PURCHASE ORDER CAN BE ISSUED. Reported by YH, 2026-09-02, from the SO
-- Batch Purchase issue screen — the blue `Issue PO` button, pressed, answered:
--
--     new row for relation "ops_stock_items" violates check constraint
--     "ops_stock_items_unit_code_format"
--     Nothing was created. Tell IT the message on screen.
--
-- ---- TWO MIGRATIONS DISAGREE ABOUT WHAT A UNIT ID LOOKS LIKE ---------------
--
-- `0366` put a format check on the column:
--
--     check (unit_code ~ '^id-[a-z]{3}[0-9]{6}$')      -- id-abc123456
--
-- `0381` then minted the LOCKED identity in a different shape entirely
-- (`format_unit_id`, MASTER §6.2):
--
--     format('U%s-%s-%s', series, lpad(n / 1000, 3, '0'), lpad(n % 1000, 3, '0'))
--                                                      -- U1-000-001
--
-- and `0382:202` made that the generator the PO issue path calls, for EVERY
-- destination:
--
--     insert into ops_stock_items (unit_code, ...)
--     select public.allocate_unit_id(), ...
--       from generate_series(1, v_qty);
--
-- The two patterns have no string in common. So `_operation_create_po_inner`
-- cannot insert one stock item, the whole batch rolls back, and the operator
-- is told to call IT — which is the correct message and a dead end, because
-- the refusal is not about their data at all.
--
-- ⭐ 0381 KNEW THE SHAPE AND MISSED THE CHECK. Its own seeding statement reads
-- the register with `where unit_code ~ '^U\d-\d{3}-\d{3}$'` (0381:199) — the
-- author was already thinking about `U…` codes sitting in this exact column.
-- The CHECK constraint three migrations upstream was simply never revisited.
-- Nothing failed at apply time because no row of the new shape existed yet;
-- the first one is minted by an operator, in production, on a Wednesday.
--
-- ---- WIDENED, NOT REPLACED, AND THAT IS THE WHOLE RULING -------------------
--
-- Both formats are live and both are correct for what mints them. This is not
-- a transition with an old side to sunset:
--
--   `gen_unit_code()`     id-abc123456   the column DEFAULT, and the generator
--                                        used by receiving (0153, 0154), the
--                                        quarantine release (0299) and the
--                                        goods-arrival trigger (0307).
--   `allocate_unit_id()`  U1-000-001     0382's PO mint, the locked identity
--                                        the supplier writes on the package.
--
-- Replacing the pattern would validate against every existing row and fail on
-- all of them; narrowing later is a data question (what happens to the `id-`
-- units already in the warehouse) and a §6.2 ruling, not a constraint edit. So
-- this file does the one thing that is unambiguously true today: the check
-- admits what the system actually mints.
--
-- ⛔ IT STILL REFUSES A TYPO. This is not a loosening to `text`. Anything that
-- is neither shape — a blank, a SKU pasted into the wrong column, a truncated
-- code — is refused exactly as it was before.
--
-- Series is `\d+`, not `\d`. `format_unit_id` interpolates the series as a
-- plain integer and `allocate_unit_id` rolls it over at 999999, so the day the
-- second series opens the code is `U10-000-001`. A check that admits only one
-- digit would fail on that mint the same way this one fails today, and there
-- is no reason to write the same defect twice.

alter table public.ops_stock_items
  drop constraint if exists ops_stock_items_unit_code_format;

alter table public.ops_stock_items
  add constraint ops_stock_items_unit_code_format
  check (
    unit_code ~ '^id-[a-z]{3}[0-9]{6}$'
    or unit_code ~ '^U\d+-\d{3}-\d{3}$'
  );

comment on constraint ops_stock_items_unit_code_format on public.ops_stock_items is
  '0416 — a Unit ID wears one of the two formats the system mints: 0153''s '
  'gen_unit_code() (id-abc123456, still the column default) or 0381''s '
  'allocate_unit_id() (U1-000-001, the locked identity 0382 stamps on a PO). '
  'Widened from 0366, which admitted only the first and so refused every PO.';

-- ---- PROBES, after applying ------------------------------------------------
--
--   -- 1 · THE CONSTRAINT IS THE NEW ONE.
--   select pg_get_constraintdef(oid)
--     from pg_constraint
--    where conname = 'ops_stock_items_unit_code_format';
--   -- EXPECT: a definition containing BOTH '^id-' and '^U'. Only '^id-' means
--   -- this migration never ran.
--
--   -- 2 · THE SHAPE THAT WAS BEING REFUSED NOW PASSES. Rolled back, so it
--   -- mints nothing and burns no number from the series.
--   --   begin;
--   --   insert into ops_stock_items (unit_code, sku, warehouse_id, status, date_in)
--   --   values ('U1-000-001', (select sku from product_skus limit 1),
--   --           (select id from warehouses limit 1), 'incoming', current_date);
--   --   -- EXPECT: succeeds. A check violation means the drop did not take.
--   --   rollback;
--
--   -- 3 · NEGATIVE CONTROL — the check still refuses a shape nothing mints.
--   --   begin;
--   --   insert into ops_stock_items (unit_code, sku, warehouse_id, status, date_in)
--   --   values ('U1-00-1', (select sku from product_skus limit 1),
--   --           (select id from warehouses limit 1), 'incoming', current_date);
--   --   -- EXPECT: ERROR (ops_stock_items_unit_code_format). Success here means
--   --   -- the constraint was widened to nothing and no longer guards anything.
--   --   rollback;
--
--   -- 4 · THE ONE THAT MATTERS — issue a PO from
--   --   /operation?tab=purchase, tick a row, press Issue PO.
--   --   EXPECT: the screen moves to the evidence panel with a PO number.
--   --   The `ops_stock_items` message means it is still refusing.

-- 0411_an_instalment_term_is_any_whole_number_of_months.sql
--
-- AN INSTALMENT TERM IS ANY WHOLE NUMBER OF MONTHS — owner ruling, YH,
-- 2026-09-01.
--
-- THE FAILURE THAT PRODUCED THE RULING. An amendment proposing 9 instalment
-- months saved, travelled through every layer, and died on this constraint at
-- the PRINCIPAL's Approve press — raw constraint text on the screen of the one
-- person who had just decided the change was fine, after the customer had been
-- told it was going in.
--
-- The 9 was not the mistake. Refusing it was.
--
-- WHERE 6 AND 12 CAME FROM, because it matters that nobody defended them.
-- `0007` added this CHECK on 2026-05-03 and its header explains only why the
-- COLUMN exists — "the wizard already collects these three fields in Step 3
-- and validates them". The constraint copied a hardcoded pair of buttons in
-- `Step3SignaturePayment.tsx`. Measured 2026-09-01: there is NO business ruling
-- about instalment terms anywhere in this repository, from Jess, Chai or Loo.
--
-- ⛔ AND THE "6/12" IN THE DOCS IS A DATE. `Jess 2026-07-19 … shipped 6/12`,
-- `the 6/12 ops overhaul`, `on prod since 6/12` — every one of those is 12 June
-- or 6 December, not a month count. Anyone who greps for the ruling will find
-- them. They are not it.
--
-- ---- WHAT THIS DOES NOT CHANGE ---------------------------------------------
--
-- THE POS STILL SELLS TWO PLANS. `create_order` (0230:85) still raises
-- `installment_months must be 6 or 12` on its own, and the wizard still renders
-- exactly two buttons. That is deliberate and it is not an oversight: a shop
-- sells the standard plans, and an AMENDMENT is a negotiated change the
-- principal approves one at a time. An offer and a limit are different facts,
-- and it was collapsing them that let the shop's button list refuse a decision
-- the principal had already made.
--
-- So the widened floor is reached only through the amendment door today.
-- Offering more plans on the POS is a separate change to a picker, not to this
-- constraint.
--
-- ---- WHY `>= 1` AND NOT "ANY INTEGER" --------------------------------------
--
-- Zero months is not an instalment plan and a negative one is not a number
-- anybody meant. `NULL` is how "no instalment" is already said, and an
-- amendment uses it to take a plan off. The ruling was "as long as it's an
-- int" — this is that, with the two values that cannot mean anything excluded.
--
-- ---- HOW THIS COPES WITH WHAT IS ALREADY STORED ----------------------------
--
-- It cannot fail on existing rows, and that is a property of the change rather
-- than an assumption about the data: the new predicate is strictly WIDER than
-- the old one. Every row that satisfies `in (6, 12)` satisfies `>= 1`. There is
-- nothing to backfill, nothing to repair, and no row count is asserted anywhere
-- in this file (CLAUDE.md §5.8).
--
-- A row holding 0 or a negative could only exist if it predates the original
-- CHECK, which `0007` added with `NOT VALID` semantics nowhere — it added the
-- constraint outright, so the table was already clean at that moment. The drop
-- and re-add below therefore validates the whole table, and if it were ever to
-- fail, it fails LOUDLY at apply time rather than admitting a row nobody meant.

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'orders_installment_months_chk'
  ) then
    alter table public.orders drop constraint orders_installment_months_chk;
  end if;

  alter table public.orders
    add constraint orders_installment_months_chk
      check (
        installment_months is null
        or installment_months >= 1
      );
end $$;

comment on constraint orders_installment_months_chk on public.orders is
  '0411 (YH, 2026-09-01): any whole number of months, one or more, or NULL for no instalment. Widened from 0007''s {6, 12}, which had copied the POS wizard''s two buttons and was never a recorded business decision. create_order still refuses anything but 6 or 12 on its own — the POS sells the standard plans; a negotiated term reaches this column through the amendment door.';

-- ---------------------------------------------------------------------
-- VERIFY (read-only; a migration never asserts a production row count)
-- ---------------------------------------------------------------------
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'orders_installment_months_chk';
--   -- EXPECT: CHECK (installment_months IS NULL OR installment_months >= 1)
--   -- The old text — "installment_months = ANY (ARRAY[6, 12])" — means this
--   -- migration never ran.
--
--   -- POSITIVE (roll it back) — the term that produced the ruling:
--   --   begin;
--   --   update orders set installment_months = 9 where id = '<a test order>';
--   --   -- EXPECT: 1 row updated, no error
--   --   rollback;
--
--   -- NEGATIVE CONTROL — the two values that cannot mean anything:
--   --   begin;
--   --   update orders set installment_months = 0 where id = '<a test order>';
--   --   -- EXPECT: ERROR, orders_installment_months_chk
--   --   rollback;
--
--   -- AND THE POS DOOR IS UNCHANGED — still two plans, by its own rule:
--   select prosrc like '%installment_months must be 6 or 12%' as pos_still_two
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'create_order';
--   -- EXPECT: true

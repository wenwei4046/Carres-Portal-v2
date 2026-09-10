-- ═══════════════════════════════════════════════════════════════════════════
-- 0467 · A customer without a phone is not a customer
-- ═══════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS DOES
--   Makes `orders.customer_phone` mandatory in the database, not only in the
--   browser.
--
-- WHY
--   The POS textbox already refuses an empty phone. That guard is real, and it
--   is also the only one: `customer_phone` has been a plain nullable column
--   since `0001_init.sql:252`, and no migration since has constrained it. So
--   the rule lives in exactly one place, and that place is the client.
--
--   Until now a missing phone was cosmetic. From the general ledger onward it
--   is not: the ledger identifies a customer BY that phone
--   (`gl_customer_party_for_order`), so an order without one cannot have its
--   payment posted at all. The operator would meet a refusal on an order that
--   looks completely ordinary, and nothing on the screen would explain it.
--
--   One constraint moves the rule to where the data lives. The textbox stays
--   what it should have been all along -- a courtesy that catches the mistake
--   early, rather than the only thing standing between the ledger and an
--   unattributable payment.
--
-- WHY A BLANK STRING IS REFUSED TOO
--   `not null` alone would still admit `''` and `'   '`. A single space
--   satisfies both the textbox and the constraint while carrying no more
--   identity than null did. The check below asks for one digit -- the weakest
--   possible test that still means "somebody typed a phone number".
--
-- MEASURED BEFORE WRITING (10 Sep 2026)
--   Every order then in the database carried a usable phone: no nulls, no
--   blanks, nothing digitless. So this applies without a data fix first, and
--   the constraint is created VALID rather than deferred.
--
--   That count is evidence about the writers, not about business volume --
--   every row today is test data (Constitution §6), and this migration
--   deliberately asserts no count of its own (Red line 8).
--
-- WHAT COULD STILL FAIL ON APPLY
--   Only one thing: a row added between the measurement and the apply that has
--   no phone. If that happens the ALTER refuses and changes nothing -- fix the
--   row, run it again. It is not a partial state.
--
-- WHAT THIS DOES NOT DO
--   It does not touch `customer_email` or `customer_address`, which are
--   genuinely optional, and it does not validate the SHAPE of a phone number.
--   Carres takes Malaysian mobiles, landlines and the occasional foreign
--   number, and a format rule written today would reject a real customer
--   tomorrow.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · the column becomes mandatory ────────────────────────────────────────

alter table public.orders
  alter column customer_phone set not null;

-- ── 2 · and "mandatory" has to mean something ───────────────────────────────
--
-- Separate from the NOT NULL so the two failures are told apart: a null phone
-- and a phone of spaces are different mistakes by different callers, and a
-- single combined rule would report them identically.

alter table public.orders
  add constraint orders_customer_phone_not_blank
  check (customer_phone ~ '[0-9]');

comment on constraint orders_customer_phone_not_blank on public.orders is
  'A customer phone must contain at least one digit. Not a format rule -- the shape of a phone number is deliberately unconstrained. This only refuses the empty string and whitespace, which NOT NULL alone would let through. Added 10 Sep 2026 because the general ledger identifies a customer by this phone.';

-- ── 3 · prove it took ───────────────────────────────────────────────────────
--
-- `create or replace` chains have silently reverted earlier migrations in this
-- repository before. A constraint cannot be replaced that way, but the same
-- discipline applies: assert the end state, so a half-applied paste fails here
-- rather than three months from now in the ledger.

do $$
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'orders'
       and column_name  = 'customer_phone'
       and is_nullable  = 'YES'
  ) then
    raise exception '0467 did not take: orders.customer_phone is still nullable';
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname  = 'orders_customer_phone_not_blank'
       and conrelid = 'public.orders'::regclass
  ) then
    raise exception '0467 did not take: orders_customer_phone_not_blank is missing';
  end if;
end
$$;

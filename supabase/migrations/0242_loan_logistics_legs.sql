-- 0242_loan_logistics_legs.sql
-- The loaner lifecycle gains its LOGISTICS LEGS (Jess 2026-07-19, option 乙):
-- a loaner is a small delivery journey — OUT (to the customer), IN (collected
-- back at the real delivery), and for a borrowed piece a RETURN-to-supplier leg
-- (piggybacked on the supplier's next new-stock delivery to the warehouse).
--
-- All columns are ADDITIVE + nullable/defaulted → existing loans are unaffected
-- and the layer stays dormant until the UI writes it. RLS is inherited from
-- ops_sofa_loans (no policy change). Applied to prod via MCP execute_sql
-- 2026-07-19 (tracker keys on timestamp; this file is the source of truth).

alter table ops_sofa_loans
  -- OUT leg — how the loaner reaches the customer:
  --   warehouse_customer          : own stock, WH -> customer
  --   supplier_customer           : borrowed, logistic picks from supplier -> customer
  --   supplier_warehouse_customer : borrowed, supplier -> WH first, then -> customer
  add column if not exists out_route text not null default 'warehouse_customer'
    check (out_route in ('warehouse_customer', 'supplier_customer', 'supplier_warehouse_customer')),
  add column if not exists out_partner_id uuid references delivery_partners(id),  -- logistic on the OUT leg
  add column if not exists dispatched_at        timestamptz,   -- OUT leg departed its source
  add column if not exists arrived_warehouse_at timestamptz,   -- route B: supplier -> WH before customer
  add column if not exists loan_note_no          text,         -- LN-xxxx (the "ON LOAN" delivery note)
  add column if not exists loan_note_signed_at   timestamptz,  -- customer signed on receipt (proof + agreement)
  -- RETURN-to-supplier leg (borrowed loaners only):
  add column if not exists supplier_return_due   date,         -- soft due to return to the supplier
  add column if not exists supplier_return_ref   text;         -- return-note no / stock-delivery it rode back on

-- LN-xxxx running number for the loan note.
create sequence if not exists ops_loan_note_seq start 1;

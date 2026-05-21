-- 0146: dealers.contact_name + contact_phone columns
-- Loo 2026-05-22 (Batch 1.b follow-up): split the single free-text `contact`
-- column into structured fields so the create-account form can collect the
-- dealer's PIC (Person In Charge) name + phone explicitly. Existing `contact`
-- column stays as a derived display string ("name · phone") for backwards
-- compatibility with reads that already render it (DealerRow, DealerDrawer,
-- proto-aligned tooltips). Required at create-account time (zod + UI gate).

alter table dealers
  add column if not exists contact_name  text,
  add column if not exists contact_phone text;

comment on column dealers.contact_name is
  'Dealer-side PIC name (e.g. "Aisha Rahman"). Required when creating a
   dealer via Principal Accounts. Backfills the legacy `contact` text column
   on the same insert ("name · phone" format).';

comment on column dealers.contact_phone is
  'Dealer-side PIC phone (e.g. "+60 12-3344556" or "012-3344556"). Required
   when creating a dealer via Principal Accounts.';

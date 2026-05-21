-- 0145: dealers.ssm_code column
-- Loo 2026-05-22 (Batch 1.b follow-up): SSM (Suruhanjaya Syarikat Malaysia)
-- registration number per dealer company. Required at create-account time
-- (zod + UI both gate), persisted alongside the legal company name. Region
-- column stays (existing dealers carry values like "Klang Valley") but is
-- dropped from the create form because the structured address already carries
-- state/city — no need for a free-text duplicate.

alter table dealers
  add column if not exists ssm_code text;

comment on column dealers.ssm_code is
  'Malaysia SSM registration number — old format "123456-A" or new 12-digit
   "201801234567". Required when creating a dealer via Principal Accounts;
   editable later via Principal Dealers drawer.';

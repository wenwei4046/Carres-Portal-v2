-- Phase 4.5 Chunk 1 carry-forward: `phase-4.5-chunk-1-lp-address-column`
--
-- Task 19's POST /api/principal/partners workaround folded the LP postal
-- address into the `contact` column as `"${contactNumber} · ${address}"`
-- because `delivery_partners` had no dedicated `address` column. This
-- migration adds the column and backfills any rows still carrying the
-- concat'd format.
--
-- Schema change:
--   delivery_partners.address text (NULLABLE, no default).
--
-- NULL-tolerant by design: legacy rows pre-Task-19 had only a phone in
-- `contact` and we don't synthesize an address for them. The API layer
-- treats NULL as "address unknown".
--
-- Backfill: idempotent split — only acts on rows where `contact` still has
-- the literal ' · ' separator AND `address IS NULL`. Re-running on a
-- post-migration row is a no-op because the predicate fails after the first
-- pass (separator is gone from contact, address is set).
--
-- Postgres SET-clause semantics: right-hand expressions evaluate against the
-- pre-update row state, so referencing `contact` twice in one UPDATE is
-- safe (both reads see the OLD concat'd value).

alter table public.delivery_partners
  add column if not exists address text;

update public.delivery_partners
   set contact = split_part(contact, ' · ', 1),
       address = nullif(split_part(contact, ' · ', 2), '')
 where contact like '% · %'
   and address is null;

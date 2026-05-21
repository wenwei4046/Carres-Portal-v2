-- 0144: dealer.address column + KL Showroom outlet address fix
-- Loo 2026-05-22 (Batch 1.b.3): Sales Order PDF needs the seller's physical
-- address in the "Sold By" block. Showroom orders use outlets.address (which
-- the PDF template already wires in). Pure dealer orders (no outlet) had no
-- fallback because dealers had no address column — this migration plugs it.
--
-- One-shot data updates:
--   (a) Carres KL Showroom outlet's placeholder "Address TBD..." replaced
--       with the real Petaling Jaya address Loo provided.
--   (b) Carres KL Showroom dealer.address mirrored so both code paths
--       resolve to the same address.
--   (c) Mattress King (the lone alpha test dealer) seeded with a plausible
--       Klang Valley fixture (both dealer.address + outlet.address) so the
--       dealer-channel PDF path can be exercised end-to-end before real
--       dealer onboarding starts populating addresses.

alter table dealers
  add column if not exists address text;

comment on column dealers.address is
  'Dealer-side fallback address shown in the Sales Order PDF "Sold By" block
   when the order is not tied to a specific outlet (outlets.address takes
   precedence when present). Editable via Principal -> Dealers drawer.';

-- (a) KL Showroom outlet — only the placeholder row matches; idempotent.
update outlets
   set address = '109, Jalan SS 25/2, Taman Mayang, 47301 Petaling Jaya, Selangor'
 where dealer_id in (select id from dealers where channel = 'showroom')
   and address like 'Address TBD%';

-- (b) Carres KL Showroom dealer.address — mirrors the outlet so both code
--     paths (showroom-with-outlet, hypothetical showroom-without-outlet)
--     resolve to the same address.
update dealers
   set address = '109, Jalan SS 25/2, Taman Mayang, 47301 Petaling Jaya, Selangor'
 where channel = 'showroom' and name = 'Carres KL Showroom';

-- (c) Mattress King — fixture address for dealer-channel PDF testing.
--     Mirrored into the outlet for the same multi-path consistency reason.
update dealers
   set address = 'Lot 28, Jalan Bestari 8/2, Taman Bestari Indah, 43200 Cheras, Selangor'
 where name = 'Mattress King' and address is null;

update outlets
   set address = 'Lot 28, Jalan Bestari 8/2, Taman Bestari Indah, 43200 Cheras, Selangor'
 where dealer_id in (select id from dealers where name = 'Mattress King')
   and address like 'Address TBD%';

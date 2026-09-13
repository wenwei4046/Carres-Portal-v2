# DELIVERY — CARD 17 · Central Delivery reports

> Module **DELIVERY** · Card **17** · authored 2026-09-13 under the BUILD/DELIVERY takeover of the
> owner-approved Delivery Blueprint (PR #1255, #1256). Steps use checkbox syntax for tracking.

**Goal:** Build `Reports → Delivery` with the §12 catalogue, every measure naming its source fact, date basis and coverage, drilling to its records, and withholding rates with too few records.

**Authority:** `docs/delivery/MASTER.md` §12 · `docs/payment/MASTER.md` Reports grammar · `docs/ui/MASTER.md` Register Template. The approved MASTER decides the design; this Card adds no design of its own.

**Dependencies:** Cards 11, 13.

**Runtime readers and writers affected:** Readers: arrangements, contact records, attempts, proof reviews, handover events, partners; writers: none.

**Migrations required:** none.

**Production acceptance surface:** Production `Reports → Delivery` renders the ten listings from real rows with exclusions stated on screen and Excel export.

## Global constraints

- Reuse existing Carres components, arithmetics and write doors; no duplicate quantity, owner, duty, date, payment or stock truth.
- Every visible word comes from `docs/COPY-STANDARD.md`; dates through `fmtDate`; no em dash joins a Delivery Work sentence.
- No `New DO`, `Issue`, `Release` or `Approve` control; no new payment exception or COD door; no Delivery-local roster; no Operations Superuser fallback.
- Loading, error, empty and no-results states, keyboard and focus, responsive behaviour, permissions and proxy-recording boundaries are tested.
- A Card is complete only after PR merge, exact-SHA deployment and authenticated production verification with the resulting records re-read.

## Tasks

- [ ] Report reads on the shared arithmetics; the ten listings
- [ ] Export; every row a door
- [ ] Tests, typecheck, design guard
- [ ] PR → merge → deploy → authenticated production verification

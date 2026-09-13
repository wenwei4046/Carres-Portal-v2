# DELIVERY — CARD 16 · Delivery Order object sections

> Module **DELIVERY** · Card **16** · authored 2026-09-13 under the BUILD/DELIVERY takeover of the
> owner-approved Delivery Blueprint (PR #1255, #1256). Steps use checkbox syntax for tracking.

**Goal:** Grow the DO object into the seven governed sections on the Object Detail Template (Delivery Order with the live document · Delivery history · Warehouse handover · Evidence · Exceptions · History · Related records) with no tab strip.

**Authority:** `docs/delivery/MASTER.md` §9 · `docs/ui/MASTER.md` §4.1 Object Header template · `docs/COPY-STANDARD.md` Delivery Order document words. The approved MASTER decides the design; this Card adds no design of its own.

**Dependencies:** Card 13.

**Runtime readers and writers affected:** Readers: `DeliveryOrderPage.tsx`, the governed DO renderer, handover events, attempts, proof reviews, exceptions, history; writers: none new.

**Migrations required:** none.

**Production acceptance surface:** Production DO object: the Object Header, the seven sections in order, the live document in the first, `Print` reprint with the same number, no tab strip.

## Global constraints

- Reuse existing Carres components, arithmetics and write doors; no duplicate quantity, owner, duty, date, payment or stock truth.
- Every visible word comes from `docs/COPY-STANDARD.md`; dates through `fmtDate`; no em dash joins a Delivery Work sentence.
- No `New DO`, `Issue`, `Release` or `Approve` control; no new payment exception or COD door; no Delivery-local roster; no Operations Superuser fallback.
- Loading, error, empty and no-results states, keyboard and focus, responsive behaviour, permissions and proxy-recording boundaries are tested.
- A Card is complete only after PR merge, exact-SHA deployment and authenticated production verification with the resulting records re-read.

## Tasks

- [ ] Section composition on kit `Panel`; the live document in section one
- [ ] Exceptions and Related records sections
- [ ] Tests, typecheck, design guard
- [ ] PR → merge → deploy → authenticated production verification

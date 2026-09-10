# 【DELIVERY】 — CARD 04 · REGION rail + the six-day operating window

**Module:** Delivery · **Sequence:** 04 · **Lane:** BUILD — approved by the owner in-session
2026-09-01 (ASCII review, four corrections absorbed: no `Other` bucket of any spelling · no
`No region found` row · states never merged · East Malaysia clearly separated).

**Authority:** `docs/delivery/MASTER.md` §8 (rail ruling as amended by this card) ·
ACTION-FLOW-STANDARD Law 2A (Delivery calendar: six days, Sunday closed, Malaysian public
holidays excluded) · the 2026-08-24 zero-visible and combine rulings · measured production
state distribution (SQL, 2026-09-01: Pahang is the second-largest real region).

## What shipped

1. **REGION rail group** between DELIVERY SCHEDULE and LOGISTICS: Peninsular states by their
   own names (appear while holding scopes, ordered by count; picked-at-zero preserved);
   fixed `EAST MALAYSIA` sub-heading with Sabah/Sarawak always visible (a different journey —
   HOUZS); fixed `SINGAPORE` sub-heading with Singapore always visible. Leg 1 of a Singapore
   journey counts under **Johor**, leg 2 under **Singapore**. Classification prefers the
   structured `customer_address_state` column, then the ONE shared address classifier
   (`@/lib/region`); an unresolvable row joins no region and stays reachable through `All`.
   Three groups combine; `?region=` rides the URL.
2. **The generated date window obeys the Delivery calendar**: next seven OPERATING days —
   Sunday and Malaysian public holidays are never offered as plannable choices (shared
   `myHolidaySet`, no second engine). A genuinely recorded Sunday/holiday date still shows
   through its own count: evidence is never hidden.
3. **Rail recipe recorded honestly**: the page uses the ONE shared 240px `RailGroup`/`RailItem`
   recipe; the MASTER's page-local 200px predated that shared law and is overwritten.

## Not in this card

The avatar/duty question raised in the same review is answered by architecture, not this card:
the listing carries no owner/avatar (locked 2026-08-24); avatars appear in My Work / Team Work
through the Shared Duty Resolver (Law F.1) when that resolver is built.

# DELIVERY — CARD 14 · Journey legs and returned-goods handling

> Module **DELIVERY** · Card **14** · authored 2026-09-13 under the BUILD/DELIVERY takeover of the
> owner-approved Delivery Blueprint (PR #1255, #1256). Steps use checkbox syntax for tracking.

**Goal:** Issue and result a Delivery Order per Journey leg, receive returned goods after a failed trip through Inbound as `Check required`, and admit leg rows to the Warehouse schedule feed.

**Authority:** `docs/delivery/MASTER.md` §1.1, §3.1, §4, §7, §13.3, §14.1 · `docs/stock/MASTER.md` §5, §12.6, §12.8 · `docs/ERP-ARCHITECTURE.md` §3.5.1, §6.2. The approved MASTER decides the design; this Card adds no design of its own.

**Dependencies:** Cards 10, 13.

**Runtime readers and writers affected:** Writers: `apps/api/src/lib/delivery-order-issue.ts` per-leg mint, `delivery_attempt_record` per leg, the returned-goods Inbound source; readers: the Warehouse schedule feed, Outbound, Monitor leg rows.

**Migrations required:** yes: leg binding on `ops_delivery_orders` and `delivery_attempts`; the returned-goods arrival source.

**Production acceptance surface:** Production: a Singapore order shows two leg rows with their own partner, day, DO and result; a failed trip's goods appear in Inbound as `Check required`; the schedule feed carries the leg.

## Global constraints

- Reuse existing Carres components, arithmetics and write doors; no duplicate quantity, owner, duty, date, payment or stock truth.
- Every visible word comes from `docs/COPY-STANDARD.md`; dates through `fmtDate`; no em dash joins a Delivery Work sentence.
- No `New DO`, `Issue`, `Release` or `Approve` control; no new payment exception or COD door; no Delivery-local roster; no Operations Superuser fallback.
- Loading, error, empty and no-results states, keyboard and focus, responsive behaviour, permissions and proxy-recording boundaries are tested.
- A Card is complete only after PR merge, exact-SHA deployment and authenticated production verification with the resulting records re-read.

## Tasks

- [ ] Per-leg DO issuance through the one path; per-leg results
- [ ] Returned-goods receipt as an Inbound arrival source
- [ ] Leg rows in the Warehouse schedule feed and Outbound
- [ ] Tests, probes, typecheck, design guard
- [ ] PR → merge → apply → deploy → authenticated production verification

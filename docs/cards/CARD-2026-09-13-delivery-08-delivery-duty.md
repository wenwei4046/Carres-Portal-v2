# DELIVERY — CARD 08 · Delivery Duty in the shared catalogue

> Module **DELIVERY** · Card **08** · authored 2026-09-13 under the BUILD/DELIVERY takeover of the
> owner-approved Delivery Blueprint (PR #1255, #1256). Steps use checkbox syntax for tracking.

**Goal:** Expose the engine's existing `delivery_duty` owner rule as the assignable `Delivery Duty` in the shared Workspace catalogue, resolve every routine Delivery action through the Shared Duty Resolver, and print the governed no-holder failure with its door.

**Authority:** `docs/delivery/MASTER.md` §10, §13.1 · `docs/workspace/MASTER.md` §4 · `docs/ERP-ARCHITECTURE.md` Law F.1 · `docs/COPY-STANDARD.md` (Monitor register, status and Payment words: `Nobody holds Delivery Duty.`). The approved MASTER decides the design; this Card adds no design of its own.

**Dependencies:** none.

**Runtime readers and writers affected:** Readers: `packages/shared/src/work-engine.ts` owner resolution · `apps/api/src/routes/operation/work.ts` duty resolutions · `apps/web/src/pages/operation/OperationWork.tsx` Team groups · `StaffDuties.tsx` catalogue. Writers: none new; `Workspace → Staff & Duties` assigns through the existing 0425 doors.

**Migrations required:** none — `workspace_duty_assignments.duty_key` is a shape check, not a whitelist.

**Production acceptance surface:** Production `Workspace → Staff & Duties` lists `Delivery Duty` with `Nobody holds Delivery Duty.` until the owner assigns; `Work → Team Work` groups Delivery actions under `Delivery Duty` with the door to Staff & Duties; `GET /api/operation/workspace-duties` returns the key.

## Global constraints

- Reuse existing Carres components, arithmetics and write doors; no duplicate quantity, owner, duty, date, payment or stock truth.
- Every visible word comes from `docs/COPY-STANDARD.md`; dates through `fmtDate`; no em dash joins a Delivery Work sentence.
- No `New DO`, `Issue`, `Release` or `Approve` control; no new payment exception or COD door; no Delivery-local roster; no Operations Superuser fallback.
- Loading, error, empty and no-results states, keyboard and focus, responsive behaviour, permissions and proxy-recording boundaries are tested.
- A Card is complete only after PR merge, exact-SHA deployment and authenticated production verification with the resulting records re-read.

## Tasks

- [x] Add `delivery_duty` · `Delivery Duty` to the catalogue and its route test
- [x] Resolve `delivery_duty` through `dutyOwner` in the engine; move `assign_logistics` · `confirm_delivery_date` · `deliver_today` · `upload_delivery_photo` to `ownerRule: delivery_duty`
- [x] Resolve `delivery_duty` in the Work feed and pass it to the projections; the storage-invoice item reads the same resolution
- [x] Team Work prints `Nobody holds Delivery Duty.` with `Set the holder in Workspace → Staff & Duties` for an unresolved duty group
- [x] Tests: engine ownership, feed resolution, catalogue list, Team Work door; typecheck; design guard
- [ ] PR → merge → deploy → authenticated production verification of the catalogue and the Team group

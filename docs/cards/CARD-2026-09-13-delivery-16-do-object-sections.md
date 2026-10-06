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

- [x] Section composition on kit `Panel`; the live document in section one — seven `Panel`s in §9 order, no tab strip; the document is rendered by `renderDoPdf` from the same `print-do-data` read `Print` uses and shown in an inline viewer (`Rendering the document…` / stated failure); the detail read carries the arrangement, the site facts, the Warehouse name and the two money records
- [x] Exceptions and Related records sections — failed/partial visits, open Finance exception, pending payment approval, cancellation and the Work action lines with owner (`No open problems`); doors to SO, Order Route, Payments, each exact Unit, each Service Case (unknown stated, never zero) and each sibling document
- [x] Tests, typecheck, design guard — `DeliveryOrderPage.test.tsx` and the operation page suites green (53 targeted after the rebase onto main; full web/api/shared suites green on the merged head); tsc ×3 clean; `pnpm --filter web lint` clean; `pnpm ci:migrations` no change
- [x] PR → merge → deploy → authenticated production verification — PR #1276 squash-merged `e0a6dc4932972a56089cad40d3d8f74810a1870e`; deploy converged (`erp` `__carres_deploy.json` + Worker `/health` both report that SHA); walked as operation@carres.com on the two SO-1362 Journey documents: `/operation/delivery-orders/ac2cf852-…` (DO-130926-0842, leg 1, NETS) and `/operation/delivery-orders/55269444-…` (DO-130926-3223, leg 2, AL). Both pages draw exactly the seven Panels in §9 order with no tab strip — `Delivery Order` (`do-section-order`: name, phone, emergency contact, delivery address, warehouse, logistics partner NETS/AL per leg, appointment; `do-document` renders the live document in an inline `blob:` viewer from the same `print-do-data` read the header `Print` uses) · `Delivery history` (`do-delivery-history`: leg 1 `Delivered Recorded · Arrived at JB transit warehouse · Card 14 walk`; leg 2 `Delivered Recorded`) · `Warehouse handover` (leg 1 `Handed over — to NETS · received by NETS driver Azman · Vehicle: WXY 1234 · Goods: JAGER-SS × 1 · Open handover proof →` then `Received by logistics … NETS`; leg 2 `Handed over — to AL · received by AL driver Kumar · NETS · Vehicle: JHR 5678` then `Received by logistics … AL`) · `Evidence` (`Signed document on file · Sun, 13 Sep`, `Upload delivery photo`, the proof-review doors) · `Exceptions` (`do-no-problems` = `No open problems`) · `History` (`do-history`: the whole SO-1362 chain — `DO-130926-0842 issued for leg 1 · Carres Klang Warehouse → JB transit warehouse`, `Handed over 1 of 1 Units to NETS …`, `Delivery attempt 1 · leg 1 arrived · JB transit warehouse`, `DO-130926-3223 issued for leg 2 · JB transit warehouse → Customer (Singapore)`, the loan lines) · `Related records` (`do-related-records`: `Open SO-1362 →`, `Open Order Route →`, `Open Payments →` (`/finance/payments?order=1362`), `Open Unit id-dtd627907 →` (`/operation/stock/unit/id-dtd627907`), `No Service Case on this order`, and the sibling document door — leg 1 links `Open DO-130926-3223 →`, leg 2 links `Open DO-130926-0842 →`). 🟡 both pages print `WAREHOUSE No warehouse recorded` although each leg's source is a named stop (Carres Klang Warehouse / JB transit warehouse) — the section reads the order's warehouse fact, not the leg's `from_loc`; and leg 1's `Evidence` heading calls its arrival `Delivered` (the Card 14 intermediate-leg wording note). Neither blocks the Card; both are recorded in the Delivery MASTER §16 closure notes.

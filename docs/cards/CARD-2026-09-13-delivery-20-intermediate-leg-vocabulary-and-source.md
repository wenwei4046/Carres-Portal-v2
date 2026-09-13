# DELIVERY — CARD 20 · An intermediate leg ARRIVES; every leg names its own source

> Module **DELIVERY** · Card **20** · authored 2026-09-13 under the Delivery final-convergence
> takeover (owner mission of 2026-09-13, closing the three 🟡 notes of Delivery MASTER §16 after
> Cards 08–18). Steps use checkbox syntax for tracking. **Surface owned by this Card:** the two
> Delivery status arithmetics (document ladder · Monitor status), the Delivery Orders register,
> the DO object, the Evidence section, `Reports → Delivery`, the Work Engine's Delivery
> destination. **May not touch:** any writer, any gate, any migration, Stock truth, Orders truth.

**Goal:** `Delivered` is reserved for goods that reached the CUSTOMER. An intermediate Journey leg
whose goods reached the named partner warehouse reads **`Arrived`** over the warehouse's name on
Monitor, the Delivery Orders register, the DO object header, Delivery history, the Evidence
section and every report, through the SAME two arithmetics every surface already calls (Law D);
the partner listing no longer counts a warehouse arrival as a customer delivery; a leg document's
`Warehouse` fact reads that leg's own source stop (`from_loc`), never the order-level warehouse;
and the Work Engine's Delivery deep-link lands on the Monitor row, not on the retired Edit
Delivery address.

**Measured defects (2026-09-13, production `36c98830`, SO-1362 · DO-130926-0842 leg 1 NETS
`Carres Klang Warehouse → JB transit warehouse`):**
1. `packages/shared/src/delivery-order-status.ts:129` and `delivery-work-status.ts:271` turn ANY
   latest `delivered` attempt into `Delivered`; `delivery-work.ts:284` maps a chain `handed_off`
   stop to `delivered` "on purpose". The register, Monitor (`Delivered · Delivery photo not
   uploaded`), the DO header pill, Delivery history (`Delivery on … · Delivered`) and
   `Logistics Partner Performance` (`NETS · 1 trip · 1 delivered`) all print a customer delivery
   that never happened. Commitment, First Delivery and Proof Control already exclude the leg
   (`reachesCustomer`, `delivery-report.ts:188`); the partner listing does not.
2. `DeliveryOrderPage.tsx:388` prints `warehouse?.name` — `orders.warehouse_id` is null on
   SO-1362 — so both leg documents read `No warehouse recorded` beside a named `Route`.
3. `apps/api/src/routes/operation/work.ts:869` still sends Delivery-owned work to
   `/operation/delivery/edit/{order}` — the address Card 11 retired (it redirects, but a Work row
   must name its real door).

**Authority:** `docs/delivery/MASTER.md` §3.1 (the document ladder), §4 (an intermediate leg
records its ARRIVAL, moving no Unit), §8.4 (the Monitor status dictionary), §9 (the DO object),
§12 (reports state their coverage), §14.1 (leg 1 completion means the goods reached the named JB
warehouse, never that the customer received them), §16 (the three 🟡 notes) ·
`docs/ERP-ARCHITECTURE.md` §3.5.1 (`collected = arrived + still with the holder`) and Law D ·
`docs/COPY-STANDARD.md` (`Arrived` · `Record arrival` · `Arrival recorded`, RULED 2026-09-13,
Card 14; `Delivered` = the goods actually reached the customer). This Card adds no word the
dictionary does not already rule; it registers where the ruled word now prints.

**Dependencies:** Cards 14, 16, 17 (shipped).

**Runtime readers and writers affected:** Readers: `delivery-order-status.ts`,
`delivery-work-status.ts`, `delivery-work.ts`, `delivery-orders-register.ts`,
`DeliveryOrdersRegister.tsx`, `DeliveryOrderPage.tsx`, `DeliveryEvidencePanel.tsx`,
`delivery-report.ts`, `OperationDeliveryReport.tsx`, `work.ts` (destination only). Writers: none.

**Migrations required:** none — `delivery_attempts.leg` (0491) already binds the result to its
scope; the arrival stays stored as the leg's `delivered` result, exactly as 0496 writes it.

**Production acceptance surface:** On SO-1362: Monitor (`?q=1362`) is empty because the order is
delivered (entry rule), so the leg rows are proven on the seeded Monitor fixture; the Delivery
Orders register prints DO-130926-0842 `Arrived` over `JB transit warehouse` and DO-130926-3223
`Delivered`; `/operation/delivery-orders/ac2cf852-…` header pill `Arrived`, `Warehouse` `Carres
Klang Warehouse`, Delivery history `Delivery on Sun, 13 Sep · Arrived`, Evidence section stating
that a warehouse arrival owes no delivery proof; `/operation/delivery-orders/55269444-…`
`Warehouse` `JB transit warehouse`; `Reports → Delivery` `Logistics Partner Performance` NETS
`0 trips` for September (AL `1 trip · 1 delivered`), the coverage sentence naming the exclusion.

## Global constraints

- Reuse existing Carres components, arithmetics and write doors; no duplicate quantity, owner, duty, date, payment or stock truth.
- Every visible word comes from `docs/COPY-STANDARD.md`; dates through `fmtDate`; no em dash joins a Delivery Work sentence.
- No `New DO`, `Issue`, `Release` or `Approve` control; no new payment exception or COD door; no Delivery-local roster; no Operations Superuser fallback.
- Loading, error, empty and no-results states, keyboard and focus, responsive behaviour, permissions and proxy-recording boundaries are tested.
- A Card is complete only after PR merge, exact-SHA deployment and authenticated production verification with the resulting records re-read.

## Tasks

- [ ] Document ladder: `deliveryOrderStatusOf` takes the scope (`intermediateLeg`, `legStop`) and answers `arrived` · `Arrived` over the stop for an intermediate leg's `delivered` result; `Delivered` only for the customer leg; `DO_STATUS_KEYS`, the register tones, labels and rails carry the sixth word; line 2 of `Arrived` is the stop
- [ ] Monitor ladder: `deliveryWorkStatusOf` answers `arrived` (green, line 2 the stop) for the same facts; `legWorkStatusOf` reads a chain `handed_off` stop as `Arrived` over its `to_loc`; the `DELIVERY STATUS` dropdown lists it; an intermediate leg owes no delivery photo, signed paper or proof review (`missingDeliveryProofOf`, `proofReviewOf`, `doWorkQueueOf`)
- [ ] DO object: header pill `Arrived` (green), `Warehouse` prints the leg's `from_loc` on a leg document (leg 1 the configured source, later legs the previous partner warehouse) and the order's warehouse on a whole-order document, never a silent substitute; Delivery history, History and Exceptions spell the arrival `Arrived`; the Evidence section states that a warehouse arrival owes no delivery proof and offers no signed-DO attach
- [ ] Reports: `Logistics Partner Performance` counts the customer legs only (`reachesCustomer`), its coverage sentence says so; Excel follows the same rows
- [ ] Work Engine: the Delivery-scope destination is the Monitor row (`/operation?tab=delivery&view=all&open={order}`), never the retired Edit Delivery address
- [ ] Tests: shared ladder cases (arrived vs delivered, tones, dropdown length), register (status, rails, no proof queue on a leg), Monitor rows (leg with and without a document), DO page (pill, Warehouse per leg, history word, evidence sentence), report (partner exclusion), Work destination; typecheck ×3; design guard
- [ ] Docs: Delivery MASTER §3.1 · §8.4 · §9 · §12 · §16; COPY-STANDARD register/Monitor/report rows
- [ ] PR → CI → merge → deploy → authenticated production verification on both SO-1362 documents and the report

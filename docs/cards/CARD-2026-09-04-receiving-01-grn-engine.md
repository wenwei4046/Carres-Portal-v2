# 【RECEIVING】 — CARD 01 · Receiving & GRN — one session engine, formal GRN, amend/void

- **Module / surface owned:** Receiving — the Purchasing → RECEIVE → Receiving destination, the
  Receiving Session, GRN posting, Amend/Void, and the NETS Warehouse submission seam. Plus the
  minimal shared Staff & Duties foundation this card depends on (GRN Duty resolution under
  ERP Architecture Law F.1), because no shared resolver exists yet in SQL.
- **May NOT touch:** PO issue/commercial flow, Sales Orders, Delivery, Payment, Catalog writes,
  Stock's own transfer/count/adjustment doors, Supplier Claim decision layers (0409), Manual
  Purchase pages. Purchase Order pages gain only read-only receiving facts and `[Open Receiving]`.
- **Lane:** BUILD/DELIVERY under owner-approved instruction 2026-09-04, CONTINUED by the owner's
  second instruction the same day: **the one Card means the complete delivery** — implementation →
  tests → migrations applied safely → merge → deploy → authenticated production verification —
  and that second instruction is the owner authorisation for apply/merge/deploy. Nothing in the
  approved blueprint is deferred to a later card.
- **Branch:** `build/receiving-grn` from `origin/main` `79f9417d`.
- **Migrations:** start at `0425` (max of repo tail `0424`×2, production tracker tail `0424`,
  and open-branch numbers 0406/0407/0408/0410/0365). Both were functionally proven against the
  production schema in rolled-back transactions (DDL, duty gates, GRN minting, exact-Unit flips,
  derived-stock rollup, idempotent retry, amend, void, consignment ownership, cover, superuser,
  and the full Warehouse submit → return → resubmit → check-in lifecycle) before applying.

## Authority resolution

| Fact | Class | Evidence |
|---|---|---|
| Receiving owns session/GRN/three times/amend/void; `received_qty` moves only through Receiving | RESOLVED FROM AUTHORITY | ERP-ARCHITECTURE §3.4 |
| Per-Unit outcomes `Received · Received with issue · Not received`; `Expected Units = Received Units + Not received Units` | RESOLVED FROM AUTHORITY | ERP-ARCHITECTURE §3.4 Unit Reconciliation, owner ruling 2026-09-01 |
| One Receiving engine for PO and CO arrivals; no Manual receipt lane; navigation word `Receiving`; `Goods Receipts` retired as navigation; `GRN` banned from navigation/status copy | RESOLVED FROM AUTHORITY | ERP-ARCHITECTURE §2.1; purchasing/MASTER §9.4 |
| Quantity words `Order Qty · Received Qty · Damaged Qty · Wrong Item Qty · Pending Delivery Qty`; damaged/wrong/extra never reduce Pending Delivery Qty, never create available stock | RESOLVED FROM AUTHORITY | purchasing/MASTER §5.7, §9.4 |
| Office direct receiving posts one `posted` event; Warehouse submission is two acts (`submitted` → `posted`); `GRN-…` exists only from the posted session | RESOLVED FROM AUTHORITY | purchasing/MASTER §7.3; Jess rulings 2026-08-02/03 (0314/0315) |
| GRN Duty / dated cover / Operations Superuser are the posting authority at web+API+SQL; actor ≠ owner | RESOLVED FROM AUTHORITY | purchasing/MASTER §7.3, §13; spec 2026-08-29 §4 |
| No page may read a rota table directly; owner resolution goes through one Shared Duty Resolver | RESOLVED FROM AUTHORITY | ERP-ARCHITECTURE Law F.1; workspace/MASTER (LOCKED 2026-09-03) |
| Shared Duty Resolver + Staff & Duties assignment surface | APPROVED TARGET / NOT BUILT | no `workspace_dut*`/`staff_dut*` in supabase/migrations; only legacy `ops_po_duty` (0236) + `purchasing_po_actor()` |
| Receiving Session engine (sessions, events, submit/resubmit/return/check-in, office door, validation law, claim minting, incoming-unit flips) | BUILT / VERIFIED | 0284/0288/0299/0302/0307/0314/0315/0341; `warehouse_receipts`, `receiving_events`, `operation_receive_po_with_do` |
| Expected Units minted `incoming` into `ops_stock_items` at PO issue | BUILT / VERIFIED | 0382 `_operation_create_po_inner`; 0366 register authority |
| Formal-code allocator `allocate_formal_document_code(prefix)` unique per (date, code) | BUILT / VERIFIED | 0381 |
| `is_operations_superuser()` | BUILT / VERIFIED (applied) | 0403, production tracker 20260829084610 |
| Current posting gate is `is_operation()` (any Operation/Principal), not GRN Duty | BUILT / DEFECT vs approved authority | 0314 §9, 0315 §1 |
| No GRN number stamped at posting; no Actual Site; no amend/void doors; quantity-FIFO unit flips instead of exact-Unit outcomes; no idempotency key | REAL GAP — this card's work | measured 0307/0314/0315 |
| Consignment Orders (CO) upstream | APPROVED TARGET / NOT BUILT — but the RECEIVING side ships in this card | purchasing/MASTER §9.9; 0426 `purchase_orders.is_consignment` + `supplier_consignment` Unit ownership, no AP consequence |
| Sibling PRs #986 (docs) / #1000 (implementation, 2026-09-01) | SUPERSEDED PROPOSALS | owner instruction 2026-09-04 §1: do not inherit retired Receiving proposals; built fresh from `origin/main`; PR #1000 used only as reference evidence |
| `docs/UI-KIT.md` named in instruction | RESOLVED — successor chain | superseded 2026-07-31 → `docs/ui/MASTER.md` + `01/02/03` design system (AGENTS.md pointer is stale; fixed in this PR) |

## Word rulings carried by this card (owner instruction 2026-09-04 → COPY-STANDARD in this PR)

`Receiving` (navigation; `Goods Receipts` label retired from the rail) · `Start Receiving` (session
hero; the Work-row button stays the five-string `Start receiving`) · `Save Receiving` +
`Save — {first missing fact}` · `Pending Delivery Qty after save: {n}` · Receiving Summary speaks
`Order Qty · Received Qty · Damaged Qty · Wrong Item Qty · Pending Delivery Qty` ·
`Actual Site` (where goods physically arrived; never overwrites `Deliver To`) · `Extra Qty`
(separate record, outside pending arithmetic) · unit outcomes `Received · Received with issue ·
Not received` (already owner-ruled in ERP-ARCHITECTURE §3.4, 2026-09-01) · `Amend Receiving` ·
`Void Receiving` (GRN-specific acts, distinct from the order-word `Cancel`; ERP-ARCHITECTURE §3.4
names Amend/Void as Receiving's acts) · NETS two-step copy `Return count to Carres` /
`Return count to {warehouse}` (existing five-strings, instantiated `NETS Warehouse`).

## Measured deltas this card closes (from the 2026-09-04 measurement)

- Posting gate is `is_operation()` (0314/0315) → becomes GRN Duty / dated cover / Operations
  Superuser through the one shared resolver.
- GRN number is derived client-side (`receivingRecordNo`) → stored `grn_no` allocated at posting
  through `allocate_formal_document_code('GRN')`; legacy posted sessions keep the derived display.
- No `Actual Site`, no arrival photo/video evidence store, no `Extra Qty`, no idempotency key,
  no amend/void doors, quantity-FIFO unit flips instead of exact-Unit outcomes → all added in 0426.
- Sidebar RECEIVE row says `Goods Receipts` → `Receiving`.
- Register is a 200px `RailGroup` + kit `DataTable` two-queue listing → becomes the governed
  Register (240px `FilterRail`, register `DataGrid`, 36/38/32 density, status footer, no Work
  column, toolbar law).
- Session copy: `Received / Outstanding` summary and `Remaining after save:` → the governed five
  quantity words and `Pending Delivery Qty after save: {n}`.
- `receiving.check_in` work rule registered but feeds nothing → Receiving feed wired into
  `useOpenWorkSet` with duty-resolved owner (`Goods to receive` five-strings).

## Scope — build slices, dependency order

1. **0425 — Staff & Duties core (Law F.1 dependency):** duty catalogue row `grn_duty`,
   effective-dated primary + dated cover assignments, one resolver
   `workspace_resolve_duty(key, date)`, audited assignment writes. No module rota copies, and
   **no rota fallback** (owner correction 2026-09-04): with no assignment the resolver answers
   `not_assigned`, the pages show the honest unassigned state, and protected posting refuses
   (`no_grn_duty_holder`). A rota recommendation is never silently turned into an assignment.
2. **0426 — the Receiving engine completion:** `receiving_save` posting door (GRN Duty/cover/
   superuser gate; idempotent by client save key; stamps `grn_no` via
   `allocate_formal_document_code('GRN')`), `actual_site`, per-Unit outcome results table for
   governed Units, `extra_qty` recorded separately (no stock, no pending arithmetic), arrival
   photo+video evidence, `receiving_amend` (reason + before/after + safe recalcs) and
   `receiving_void` (impact review, downstream blockers, append-only), duty-gated
   check-in/return doors replacing the `is_operation()` gate.
3. **API routes** for register/object/session/save/amend/void/NETS review, permission-mirrored.
4. **Web:** Receiving Register (`ListPageShell` + 240px `FilterRail` + register `DataGrid`),
   pre-start Receiving object (`[Start Receiving]`, `Find PO or CO`), active Session (full-width
   one-scroll, dynamic `Save — …` validation actions, posting consequences), posted GRN
   (read-only full width, `[Open in Claims]` only on issue results), Amend (local 50/50
   comparison), Void (impact review), NETS Warehouse copy
   (`[Return count to Carres]` / `[Return count to NETS Warehouse]`), mobile single-column cards.
5. **Work Engine:** `Goods to receive` queue rows (`Check in {document} from {supplier}` ·
   `[Start receiving]`), completion `GRN posted · {n} received · {m} pending delivery`, empty
   `No supplier delivery is ready to receive.`, duty-resolved avatars, actual-date grouping.
6. **`Workspace → Staff & Duties` page** (`StaffDuties.tsx` + `/operation/workspace-duties`
   router): resolution today, assign + cover forms behind the mirrored manager gate, immutable
   history — the ONE assignment surface for every duty-consuming module.
7. **`Reports → Receiving & Inbound`** (`OperationReceivingReport.tsx` under PurchasingTabs):
   every non-draft session, GRN or `No GRN yet`, month filter, shared arithmetics, supplier
   names, `Still owed by suppliers` pending section.
8. **External Warehouse per-Unit scan + evidence** (`WarehouseCountModal.tsx` +
   `warehouse_incoming_pos().expected_units` + 8-arg submit/resubmit doors): one outcome row per
   expected Unit, derived counts drive the gate and payload, arrival photo/video block; GRN Duty
   verifies/corrects `Actual Site` on the submitted path at check-in (`Deliver To` preserved).
9. **CO / consignment receiving** through the same engine: `purchase_orders.is_consignment`,
   `supplier_consignment` ownership on received Units, supplier named, no AP consequence.
10. **Docs:** overwrite purchasing/MASTER §9.4+ Receiving truth, COPY-STANDARD additions,
    carry-forwards — same PR.

## Acceptance boundary

The instruction's §17 verification matrix at unit/web/API/SQL layers; desktop + mobile
screenshots; `pnpm --filter @carres/web lint`; repo migration gates; rolled-back functional SQL
probes against production before apply. Delivery ends only at: green CI → 0425/0426 applied
through the governed path → merge → deploy → authenticated production smoke (Session → Save
Receiving → numbered GRN → Inventory/Pending consequences; NETS flow, evidence, Actual Site,
partial, issues, consignment, Amend, Void) → MASTER production-verified → Card complete.

## Owner-approved production UI correction — 2026-09-06 (same Card, continued)

The owner reviewed the shipped surfaces and issued one correction instruction; this Card
continues under it (no new Card). Scope and rulings:

1. **Register boundary** — `Receiving` is the formal GRN Register (`Valid` / `Cancelled`
   rows only); My Work / Team Work own what staff must receive or review. The permanent
   state rail (`All receiving` · `Count waiting for check` · `Sent back to recount` ·
   `Posted` · `Voided`) is removed; a submitted count deep-links to its review and never
   becomes a Register row. `Posted`/`Voided` stay internal database statuses.
2. **Filter Rail** — exactly `CATEGORY` (Mattress · Bedframe · Sofa · Pillow ·
   Mattress protector, shared-ladder order, catalog-governed, `MP` never printed) ·
   `SUPPLIER` · `GOODS ARRIVED AT` · `Clear filters`. No `Any`/`All …`/invented category;
   no rail date filter — the `Goods received on` column owns dates. The category ladder was
   EXTRACTED to `@carres/shared` (`goodsCategoryWordOf`) so Sales Orders and Receiving speak
   one rule (Law D); the list API resolves each record's words server-side
   (`receiptCategoryWords` + the one catalog reader).
3. **Corrected words** — `Deliver To` · `Goods arrived at` · `Goods received on`;
   `Actual Site`, `Delivery Location`, `Goods Received At` retired everywhere (register,
   object, session, review, report, SQL refusal sentences, COPY-STANDARD, MASTER). A source
   scan in the Receiving suite keeps the retired words out of every branch.
4. **Formal GRN document** — `grn-template.tsx` (SO-PDF-STANDARD chrome, money-free A4
   `GOODS RECEIVED NOTE`) with identity, GRN No, linked PO/CO, Supplier, Supplier DO No.,
   the three location/date facts, description + SKU + governed Category, the five quantity
   words with totals, exact-Unit outcomes, extra goods, evidence references, the
   duty-evidence trio, and AMENDED/CANCELLED marking printed on the paper. Data flows
   through ONE pure builder (`grn-template-data.ts`) feeding preview, Print and Download.
5. **GRN object 50/50** — Receiving Record left; OFFICIAL GRN PREVIEW right
   (`usePdfCanvases` painting the real renderer) with `[Print]` `[Download PDF]`; one
   Object Header; mobile stacks; `Void Receiving` moved into `More ▾`.
6. **Amend 50/50** — the left half becomes the governed `Original → Corrected` form while
   the right half live-previews the proposed document (same number, amendment marked,
   `UNSAVED` watermark as chrome). Amendable: date, physical arrival location, Supplier DO
   number **and evidence** — migration **0427** extends `receiving_amend` with
   `do_file_path` (replace; before/after preserved) and `arrival_evidence_add`
   (append-only). Not amendable: GRN number, source PO/CO, Supplier.
7. **Warehouse boundary** re-asserted at web/API/SQL and covered by tests (warehouse role
   403 on review/amend/void).
8. **Verification** — regression suites updated/added: the exact five category rows and
   order · no invented category · no state rail · corrected words (render + source scan) ·
   Valid/Cancelled presentation · register lists GRNs only · 50/50 view · Amend 50/50 live
   preview with watermark · More ▾ void walk · duty gates · API categories/line_info/limit
   cap/evidence-amend mapping · shared ladder + status words. Register fetch limit raised
   (`?limit`, hard cap 1000) with virtualised rows for large record counts.

## Second owner correction — 2026-09-06 (same Card, continued): one page, rail Calendar, server pagination

The owner issued a further correction superseding the earlier `Calendar View / GRN Register
View` proposal. Scope and rulings (this Card, no new Card, no new navigation destination):

1. **One Receiving page only** — `Purchasing → Receiving`. No Receiving Monitor, no
   Calendar/Register view switch, no permanent tabs, no second Receiving page. Left: the
   240px rail with the full month Calendar and the filters; right: the complete GRN Register,
   always.
2. **Rail month Calendar** — fixed at the top of the rail (`FilterRail` gained a fixed
   `header` slot; the filters scroll independently beneath). The kit gained `MonthCalendar`
   (same `react-day-picker` engine and token skin as `DatePicker`). ‹ › move exactly one
   month; Sunday visible and muted (Warehouse working calendar Mon–Sat); expected-arrival
   days print an accessible COUNT from the linked POs' governed `Supplier Delivery Date`
   (`expectedArrivalCounts` over `poSupplierDeliveryDateOf` — one arithmetic; a Carres-only
   estimate never marks a day, a fully received PO stops being expected). Picking a date
   filters the SAME register by that Supplier Delivery Date; picking again or
   `Clear filters` restores; the right side never becomes a weekly calendar and never shows
   work cards.
3. **Server-side pagination** — `GET /api/operation/warehouse-receipts?scope=grn` scans light
   rows, resolves the shared facts, and answers page + facets + total through the ONE pure
   arithmetic `@carres/shared buildGrnRegisterView` (also what the page tests run). Footer:
   `Showing {from}–{to} of {total}` + `Previous`/`Next` (default 50/page); rail counts speak
   for the COMPLETE filtered result set; a changed filter or search returns to page 1;
   search runs server-side over GRN/PO/DO/supplier.
4. **CATEGORY shows only governed rows present** in the result set (ladder order; the active
   pick stays visible so it can be cleared) — no `Any`, no invented category, unchanged
   shared ladder.
5. **Register columns** — `GRN No` · `Supplier Delivery Date` (governed supplier answer;
   `Not confirmed` absence; date-filterable) · `Goods received on` (owns detailed date
   filtering) · `PO/CO No` · `Supplier` · `Product` (the GRN paper's words —
   `product_skus.variant`, else SKU) · `Deliver To` · `Goods arrived at` · `Received Qty` ·
   `Status`, then `Supplier DO No.` and damaged/wrong/extra.
6. **Verification** — new/updated regression: one destination + no view switch (portal nav
   holds exactly one `Receiving` row) · Calendar fixed / filters scroll independently ·
   month navigation · Sunday muted · accessible markers and counts · date-pick filtering and
   restore · Clear filters clears the pick · only present governed categories · server
   pagination (range sentence, Next/Previous offsets, filter reset to page 1) · corrected
   words retained · new columns · the shared view/marker arithmetic unit-tested in
   `@carres/shared` (`receiving-register.test.ts`).

**Delivery evidence — second correction, CLOSED 2026-09-07.** PR #1117 squash-merged
`00bf3cedfe5544bf71a12ad0cfd33af400026bee`; deploy automatic on merge, both canonical surfaces
(`erp.carresofficial.com` and `carres-portal.pages.dev`) reporting `__carres_deploy.json`
commit `00bf3ced…` — the exact merge SHA. Served-bundle proof: `expected supplier arrival` ·
`PO/CO No` · `Supplier Delivery Date` · the pager template and the `grn` scope present; zero
occurrences of `Actual Site` · `Goods Received At` · `Calendar View` · `GRN Register View` ·
`Receiving Monitor`. Authenticated production walk as operation@ (read-only, no records
created): the fixed SEPTEMBER 2026 calendar with today highlighted and Sundays muted; only
present governed categories (Bedframe 3 on the trial data — the ladder's honest answer);
seven real GRNs under the new columns with `Not confirmed` supplier dates (truthful: no live
PO carries an evidenced reply, so no day is marked); `Showing 1–7 of 7`; picking 4 Sep
narrowed to `Showing 0–0 of 0` with the governed no-match sentence and picking it again
restored the complete listing; a row still opens the 50/50 GRN object with the A4 preview.
Local gates at merge: shared receiving-register 8 · page 49 · API 33 targeted tests green,
web+API typecheck clean, design-standard green; full matrix by CI (`verify` pass). Two CI
catches folded in: `disabled:text-kit-slate-8` was an unpublished palette step (→ slate-9),
and the kit one-calendar source law now names `MonthCalendar` as the second governed
react-day-picker skin. Delivery's same-day #1119 collided on the FilterRail header slot; the
merge keeps the sibling's shipped structure plus the `{testId}-fixed/-scroll` regions, and
Delivery's page-level `MonitorMonthCalendar` migrates onto kit `MonthCalendar` in its own
card (ui/MASTER §6.1 second-occurrence rule).

**Delivery evidence — CLOSED 2026-09-06.** PR #1106 merged
`f755dea80fb7a60c0b0dc481841bfcf7757f5cc1`; deploy automatic on merge, both canonical surfaces
(`erp.carresofficial.com` and the Pages origin) reporting `__carres_deploy.json` commit
`f755dea8…` — the exact merge SHA. Migration 0427 applied through the governed path (tracker
`0427_an_amendment_may_correct_the_papers_evidence`) after a rolled-back functional probe
against production (evidence replace + append, named refusal `evidence_invalid`, legacy date
amend unchanged; rollback verified). Served-bundle proof: `Goods arrived at` ·
`Goods received on` · `GOODS RECEIVED NOTE` · `GOODS ARRIVED AT` · `Clear filters` present;
`Actual Site` and `Goods Received At` absent. Committed production smoke on the designated
smoke record GRN-20260904-1064: 0427 evidence amend recorded (before `smoke/do-b.jpg` →
after `smoke/do-b-corrected.jpg`, evidence 0 → 1, reason on the append-only event), idempotent
retry answered `already_saved`, and a caller outside GRN Duty/cover/superuser was refused
`no_grn_duty_holder`. Local gates at merge: web 3864 · api 2712 · shared 2880 tests green,
typechecks clean, migration gate green, design lint stage-1 with zero findings in the changed
files. Desktop and mobile walks of the Register, the 50/50 GRN object, the live Amend preview
and the More ▾ Void door performed on the dev preview entry against the real pages.

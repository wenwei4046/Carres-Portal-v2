# PURCHASING — CARD 12 · RECEIVING REGISTER UI

**Module:** Purchasing / Receiving · **Sequence:** 12
**Status:** BUILT 2026-09-18 — owner approved 2026-09-18 · **PRODUCTION VERIFICATION OWED**
**Lane:** BUILD / DELIVERY (owner explicitly requested this Card)
**Scope:** Receiving Register and read-only goods expansion
**Dependencies:** coordinate shared Register/DataGrid ownership with ongoing SO Batch, Manual
Purchase and PO work. PR #1458 contains common geometry; inspect its latest state before reuse.
**Migration:** none expected; prove an actual read-model gap before expanding backend scope.

## Outcome and authority

Implement the approved Receiving listing using CLAUDE.md, Purchasing MASTER §9.4,
UI MASTER and COPY-STANDARD. This Card executes those authorities, never becomes a second MASTER.
Receiving lists saved formal GRNs. Pending receiving/review work stays in My Work / Team Work.
No date selection is required to see records. Date counts are GRN counts, not outstanding work.
Normal GRNs have no Status column; Cancelled appears under the GRN number where applicable.
Partial/completed PO receipt progress is not a GRN status.

## Exact parent columns

GRN Date → GRN No → SO No / MPR No / CO No / RO No → PO No → Supplier →
Supplier Deliver To → Goods arrived at → Supplier Confirmed Delivery Date → Goods Received Date →
Supplier DO No. → Items → Received Qty → Damaged Qty → Wrong Item Qty → Extra Qty.

Preserve all genuine linked documents; no fabricated PO for CO/RO-only receipts. GRN Date is creation;
Goods Received Date is physical receipt. Instruction destination and actual arrival location are
separate. Preserve recorded timestamps and missing-time evidence under §9.4; date-only sample
values are not permission to discard stored precision.

## Goods expansion

Category → Supplier → Supplier Deliver To → PO No / Ref No + Unit ID → Items →
Received Qty → Damaged Qty → Wrong Item Qty → Extra Qty.

PO/source number occupies the first line, actual line-bound Unit IDs underneath. Configuration is
beneath Items. No purchasing or stock-allocation checkboxes. Preserve counted-goods absence of
Unit IDs and separate extra goods from ordered lines. Do not copy sample IDs into real data.
Use the shared goods table and connected expansion, not a new page-local table.

## Rail and shared presentation

Rail groups: GRN date; Received with (Damaged goods, Wrong items, Extra goods); Category;
Goods arrived at; Supplier; Cancelled GRNs. Use shared heading icons, neutral colour, 16px size,
2px stroke and 8px text gap. Date range selection is optional. Existing authority covers week/day
expansion, month choices and Choose dates; implement the full behaviour, not the abbreviated mock.
One choice per group, selected facets toggle off. A GRN can have multiple exception types;
never add overlapping counts as a total. Use full-set server-side counts, not loaded-page counts.
No permanent Clear filters button at the bottom of the rail; preserve active toolbar clearing.

Receiving is ungrouped and has one sticky header. The newly approved group-local header pattern
applies only if a Register has business groups; do not invent GRN groups just to use it. Shared
field widths/padding, two-line headers and pinned identities follow UI MASTER. Freeze GRN Date
and GRN No at >=768px canvas, GRN No alone below. Do not hide columns on narrow screens.

## Preserve capability

Use existing OperationReceiving, DataGrid, warehouse-receipts scope=grn and buildGrnRegisterView.
These already provide a Register read and pagination; this is UI/read-projection convergence, not
a new receiving engine. Reuse exact stock/receipt authorities and permission checks.
Search, column filters, Columns and Export remain functional. Default production page size is 50;
the mock's 2-row page exists only to demonstrate pagination. Filter changes reset page 1.
GRN number opens the existing governed 50/50 record + official PDF object. Do not replace it with
the mock's read-only dialog. Preserve Amend Receiving, Void Receiving, evidence, history and guards.
No Finance, demand forecasting, new receiving queue or reservation workflow.

## Acceptance / evidence

- Initial unfiltered listing visible without choosing a date; optional date toggle works.
- Date/supplier/location/category/exception counts agree with complete server-filtered results.
- Damaged/wrong/extra evidence and accepted-stock arithmetic retain canonical meanings; investigate
  the known COPY wording ambiguity rather than treating sample quantities as a new business rule.
- Genuine SO/MPR/CO/RO links, multi-source receipts, partial PO receipts and cancelled GRNs.
- Zero, missing and failed quantities distinguished; no failed read becomes an empty clean list.
- Search, pagination, export, column settings, expand/collapse and official object navigation.
- Header/column alignment, pinning, connectors and long identities at 1440/1180/820/390, keyboard
  and 200% zoom. Compare shared fields directly with SO Batch / Manual Purchase / PO.
- Targeted tests and repository release checks; CI passes before merge. Verify deployed SHA and
  authenticated production behaviour; do not post/void real receipts merely to test presentation.

Update the owning MASTER with implementation and verification evidence. READY is not BUILT;
BUILT is not PRODUCTION-VERIFIED. Do not mark this Card complete after only delivering a mock.

---

# BUILD RECORD — 2026-09-18

**State: BUILT, NOT PRODUCTION-VERIFIED.** The implementation below is committed and covered by
tests. It has not yet been merged, deployed, or walked signed-in against production data, so
nothing here may be read as production proof.

## Where the earlier rounds disagreed, and what was applied

PR #1443 measured this page honestly and raised two items the owner has since settled. Both are
resolved here in favour of the LATER owner confirmation, and the older text is superseded:

| #1443 said | The later owner confirmation | Applied |
|---|---|---|
| "Does this Register get a row expansion? An owner decision, not a planner's" | The read-only goods expansion is APPROVED (2026-09-18) with its exact composition | The expansion is BUILT, in the approved order, with no buying controls |
| "Receiving KEEPS its `Clear filters` control: the removal is a Purchase Orders correction and applies there only" | No permanent bottom-of-rail `Clear filters`; active-filter clearing stays in the toolbar | The rail button is removed; the toolbar's active-condition chips name and clear each filter |

#1443's five measured retired labels and its two build deltas were all real, and all are fixed.

## What was built

**The retired words are gone** (`apps/web/src/pages/operation/OperationReceiving.tsx`):

| Was on screen | Now |
|---|---|
| `Supplier Delivery Date` | `Supplier Confirmed Delivery Date` |
| `Goods received on` | `Goods Received Date` |
| `Deliver To` | `Supplier Deliver To` |
| `Product` | `Items` |
| the `Status` column (`Valid` / `Cancelled`) | no status label on a normal GRN; `Cancelled` under the GRN No of a cancelled one |
| one merged `PO/CO No` | `SO No / MPR No / CO No / RO No` and `PO No` as separate columns |
| no `GRN Date` column at all | `GRN Date` leads, and `leadingColumns` pins it with `GRN No` |

**The rail** is the six approved groups, and the month Calendar is retired from this page (the
expected-arrival view belongs to Warehouse Arrival Schedule). `GRN date` lists the weeks present
(Monday–Sunday, `31 Aug – 6 Sep`), each week's arrow opening its days **without filtering**, then
the months present, then `Choose dates…`. `Received with` counts GRN records and its three numbers
OVERLAP by construction — they are never added into a total. `Cancelled GRNs` is the last row.
Every count comes from the server's complete filtered set through the one shared arithmetic.

**The read-only goods expansion** renders through the shared `GoodsMiniTable`, asked for the
approved Receiving composition. It carries no checkbox, no `Ready Stock` and no reservation
control. The source number leads its cell with the line-bound Unit IDs beneath; a quantity-managed
line says `Counted stock` (its register row carries a technical key, which is not an identity) and
a FAILED read says `Could not be loaded` rather than claiming counted stock. Extra goods keep
their own rows and their own `Extra Qty`.

**The field-width registry** is now real code —
`apps/web/src/components/register/register-field-widths.ts` — holding UI MASTER §6.8's approved
starting widths. Receiving's four gaps were measured and added THERE, not guessed on the page:

| Field | Width | Why |
|---|---|---|
| `SO No / MPR No / CO No / RO No` | 176 | the four-way header wraps inside the shared two-line header height, so the CONTENT sets the width, and it is the same 17-character document number as the two-way entry |
| `Goods arrived at` | 150 | a receiving SITE name — deliberately not `Stock Location` (160), which names a stock position |
| `Received Qty` · `Damaged Qty` · `Wrong Item Qty` · `Extra Qty` | 112 | four adjacent quantity columns read as one family; the `Qty` role's 64 cannot hold a two-line header whose widest line is `Wrong Item` plus the sort and filter affordances |
| `Supplier DO No.` | 150 | the supplier's own reference, which obeys no Carres format; 150 holds every value measured and a longer one wraps |

## Tests

- `packages/shared/src/receiving-register.test.ts` — the six groups' arithmetic: the inclusive
  date range, overlapping `Received with` counts that exceed the records carrying them, the
  `Cancelled GRNs` row, weeks running Monday–Sunday with only the days that exist, and months.
- `apps/api/src/routes/operation/warehouse-receipts.test.ts` — `GRN Date` as creation and never
  the arrival date, the genuine linked documents (`SO-1303` · `MPR-20260904-8935`), an
  arrival-source receipt keeping its own `RO-…` number with **no** purchase order, the quantity
  row excluded from Unit IDs, and the date/exception/cancelled filters.
- `apps/web/src/pages/operation/OperationReceiving.test.tsx` — the six rail groups, no month
  Calendar, no rail `Clear filters`, the register listing without choosing a date, the approved
  column words and the absence of every retired one, the arrow that opens a week without
  filtering, the toolbar's active-condition clearing, and the expansion's exact column order with
  no checkbox and no `Ready Stock`.

## Measured gaps and honest limits — NOT fixed here

- 🟡 **`CO No` has no document to name today.** A consignment order is a FLAG on the purchase
  order (`purchase_orders.is_consignment`), not a separate numbered document, and §9.9 Consignment
  Orders is not built. The column therefore prints the SO and MPR references it genuinely has and
  stays blank where a CO number does not exist. **Nothing is invented.** When §9.9 mints CO
  numbers, they join `source_refs` server-side and this page needs no change.
- 🟡 **`Goods Received Date` is still date-only in storage** for existing records. §9.4 approved a
  time point with `Time not recorded` for older rows; that is a Receiving-engine change, not a
  listing change, and it is not in this card's scope.
- 🟡 **The `GRN date` group lists every week and month present.** On a young register that is a
  handful of rows. **Falsifier:** an operator walk on a register with two years of GRNs where the
  ladder pushes `Received with` and `Category` below the fold — then the group needs a coarse-first
  ladder, decided on that evidence rather than guessed now.
- 🔴 **Production verification is OWED**: deployed SHA, an authenticated walk, and the
  1440/1180/820/390 · keyboard · 200% zoom pass against real data.

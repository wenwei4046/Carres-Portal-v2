# PURCHASING — CARD 12 · RECEIVING REGISTER UI

**Module:** Purchasing / Receiving · **Sequence:** 12
**Status:** READY FOR BUILD — owner approved 2026-09-18
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

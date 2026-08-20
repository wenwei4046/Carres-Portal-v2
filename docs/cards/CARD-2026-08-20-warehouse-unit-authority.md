STATUS: EXECUTED
DATE: 2026-08-20
PR: #878 — migration 0366, applied and production-verified 2026-08-20.
CLOSURE: measured BUILT / VERIFIED evidence in docs/stock/MASTER.md §12.1.
IMPLEMENTATION: APPROVED — Warehouse Blueprint persisted in docs/stock/MASTER.md
and owner instructed 2026-08-20 to open the first two build Cards.

# WAREHOUSE UNIT AUTHORITY FOUNDATION

**SCOPE — make the exact physical Unit register the one inventory authority, with the minimum
facts required for NETS, another 3PL or future Carres Warehouse operation. NOTHING ELSE.**

Read latest main: CLAUDE.md, docs/ERP-ARCHITECTURE.md §3.5, docs/stock/MASTER.md,
docs/COPY-STANDARD.md, docs/ACTION-FLOW-STANDARD.md, and the relevant Purchasing, Receiving,
Orders and Delivery MASTER boundaries before editing.

This Card precedes the Stock Register Card. It does not redesign the sidebar or build Transfers,
Counts, month-end reports, full partner portal, Ready stock page, heavy WMS or historical cleanup.
Every existing row is test data; do not create a backfill or repair worklist.

## 1 · Authoritative Unit facts

Each independently traceable physical sofa or saleable/replaceable module has one permanent
Carres Unit ID. Pure shipping packages are children, not saleable Units.

The authoritative Unit supports:

- Catalog product / SKU reference;
- source PO or Consignment Order;
- ownership: Carres Owned or Supplier Consignment, with supplier where applicable;
- current Site / Where;
- current responsible operating party / Who has it;
- condition facts and active protection reason;
- reservation link read from Sales Order authority;
- last verified date;
- append-only identity and physical event lineage.

Site, operating party and role are separate. Carres Klang Warehouse is a Site. NETS Warehouse
and NETS Delivery are operating-role identities, never Sites. Do not hard-code NETS as the only
future operator.

## 2 · Unit birth and identity

- Confirming a PO or Consignment Order creates the required permanent Unit IDs.
- Receiving must use the expected IDs; it cannot mint an accidental duplicate to bypass a wrong
  or unreadable label.
- Unit IDs are never reused after cancellation, delivery, supplier return, write-off or disposal.
- A governed replacement label keeps the original ID and append-only reason/evidence.
- No bulk sofa row may act as several independently reservable physical Units.

## 3 · One availability arithmetic

The Unit register is the only source for availability. Any rollup is derived and non-authoritative.

- Available requires receipt, inspection/completeness, no active protection and no reservation.
- Incoming is ordered but not received and is never available.
- Reserved / sold comes from the Sales Order's exact-Unit binding.
- In transit comes from physical handover facts and is unavailable.
- A problem/inspection/repair/missing component makes the Unit unavailable.
- Ended Units remain in history and never return through a direct status edit.

Remove or route around every path where stock_balances, a stored total, bulk quantity or a generic
status independently decides whether goods can be offered. Negative stock is impossible.

## 4 · Ownership boundaries

- Sales Order owns choose, reserve, substitute and release decisions. Stock exposes no second
  reservation editor.
- Purchasing owns ownership source and supplier commercial terms.
- Receiving owns receipt session/evidence.
- Delivery owns carrier journey/handover proof.
- Warehouse owns Unit physical truth and may protect a problematic reserved Unit, but never silently
  releases or substitutes it.
- Finance reads ownership for valuation/settlement and cannot edit physical facts.

## 5 · Controlled writes and audit

- Every change to Where, Who has it, condition protection, identity correction or lifecycle end has
  one governed door and append-only evidence.
- No generic Edit, Delete, Add stock, Remove stock or status selector.
- A correction links original fact, corrected fact, reason, actor, time and required approval.
- Role/RLS rules permit each actor only the facts it owns; no broad internal path may bypass the
  same invariant.

## 6 · Verification

Tests must prove:

- duplicate and reused Unit IDs are refused;
- independently traceable sofas cannot be represented by an over-reserving bulk row;
- Carres Owned and Supplier Consignment remain distinct;
- Site and operating party can change independently through governed facts;
- Sales Order reservation is reflected without a second Stock writer;
- Incoming, in-transit, protected, incomplete and reserved Units are absent from available results;
- every derived total drills to the exact contributing IDs;
- direct/unauthorised writes and deletes are refused;
- existing Purchasing, Receiving, Orders and Delivery tests remain green.

Use the migration-number law at build time. Do not infer production row counts or clean test imports.

## Acceptance boundary

The production system has one enforceable exact-Unit authority and one availability arithmetic.
All other modules read or link to it through their ownership seam. The implementing PR updates
docs/stock/MASTER.md with measured BUILT / VERIFIED evidence and completes CI, merge, deployment
and production SHA verification.


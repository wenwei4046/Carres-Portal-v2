# PURCHASING — CARD 02-B · SO BATCH PURCHASE RIGHT REGISTER — ONE ROW PER PROCEEDED SALES ORDER

**Card path:** `docs/cards/CARD-2026-08-27-purchasing-02b-so-batch-right-register.md`
**Module:** Purchasing
**Page:** SO Batch Purchase
**Surface:** Right Register only
**Sequence:** 02-B
**Status:** IN DELIVERY — owner commissioned 2026-08-27
**Lane:** BUILD / DELIVERY
**Depends on:** Purchasing Card 02 and production-verified Card 02-A
**Base:** Latest `origin/main`

## Authority classification

**RESOLVED FROM AUTHORITY — owner-approved SO Batch Purchase right-register correction, 2026-08-27.**
This Card does not reopen ordinary design decisions.
Implement the approved model, verify it, open the PR, pass CI, merge, deploy and verify production
without returning for routine engineering, merge or deployment approval.
Interrupt only for: a genuinely new Carres business rule; a governed migration that is actually
required; missing production credentials; irreversible production-data risk; an emergency that
cannot safely be resolved from repository authority.
No database migration is expected for this Card.

---

## 1. Purpose

Rebuild the SO Batch Purchase right Register so an inexperienced operator can answer, without
relying on memory:

1. Which proceeded Sales Orders exist?
2. Has each order been fully ordered, partly ordered or not ordered?
3. Which PO covers it?
4. Who is the customer?
5. Where is the customer's delivery location?
6. What date did the customer first request?
7. Which supplier is involved?
8. Where must the supplier deliver?
9. What official delivery date is written on the PO?
10. Which item lines use Ready Stock and which item lines require purchasing?

Every proceeded physical-goods Sales Order must remain visible after PO issue. The Register is both
the buying surface and the permanent purchasing audit register. Do not remove completed/ordered
records after issuing a PO.

## 2. Mandatory authority correction before UI work

The approved customer-date wording `Requested Delivery Date` already landed on `main`
(`453f610b`, owner ruling 2026-08-27) — preserve it, do not duplicate or reverse it.

Date distinctions:

| Visible term | Meaning |
|---|---|
| Proceed Date | Date Sales pressed Proceed and Operations received the Sales Order |
| Requested Delivery Date | Current date requested by the customer |
| PO Delivery Date | Official delivery date recorded on the Purchase Order |
| Confirmed Delivery | Customer-confirmed logistics appointment; not part of this Register |

`Goods Must Arrive` remains an internal scheduling calculation. It is not the PO delivery date and
must not appear as a right-Register column.

## 3. Approved Register structure

**Row grain:** one row per proceeded physical-goods Sales Order (`proceed_order` only; `place` is
not proceeded; Service-only Sales Orders stay outside Purchasing). Item-level information lives
under the row expansion using the shared `GoodsMiniTable`.

**Exact business-column order:** `Status` · `Proceed Date` · `PO No` · `SO No` · `Customer` ·
`Delivery Location` · `Requested Delivery Date` · `Supplier` · `Deliver To` · `PO Delivery Date`.
`Delivery Location` sits immediately after `Customer`.

**Removed visible columns:** `Source SO` · `Required For` · `SKU / configuration` · `Required` ·
`Stock` · `Open PO` · `Buy` · `Goods Must Arrive` · `Work` · `Action`. The internal facts survive
(`goodsMustArrive` keeps feeding the left rail and Work Engine; structured actions keep feeding
central Work) — they simply stop being drawn as Register columns.

## 4. Column contracts

**Status** — derived, never stored. Visible values: blank · `Partial` · `Ordered`.
`sentCoverage` = quantity covered by a non-cancelled PO whose current PDF version has
confirmed-sent evidence (`po_sends.kind = 'confirmed_sent' AND po_sends.po_version =
COALESCE(purchase_orders.version, 1)`). `external_open` never counts; cancelled POs never count;
supplier silence changes nothing; a numbered unsent PO shows in `PO No` with blank Status; a new
unsent revision invalidates older-version send completeness; received lineage with valid
current-version evidence stays `Ordered`; a fully Ready-Stock-covered SO stays visible, blank and
unselectable, with the coverage explained in expansion.

**Proceed Date** — `orders.proceed_date`, shared formatter, never `Today`/`Tomorrow`.

**PO No** — authoritative lineage `po_line_sources` ONLY (never `purchase_orders.so`, `so_refs`,
global SKU/supplier/customer inference). `—` · one linked number (direct link) · `2 POs` with the
exact numbers in expansion. A numbered unsent PO remains visible here.

**SO No** — the row identity, a direct link, sticky during horizontal scrolling.

**Customer** — Sales-owned customer name, its own column.

**Delivery Location** — immediately after Customer; `conciseLocality(city, state)` via the neutral
shared web helper; distinct from `Deliver To`.

**Requested Delivery Date** — `orders.delivery_date`, shared formatter.

**Supplier** — before issue, the resolved outstanding-demand supplier; after issue, the linked PO
lineage supplier; `—` / name / `2 suppliers` with exact mapping in expansion.

**Deliver To** — the destination Carres tells the supplier. Before issue: the existing editable
control, existing default, Split preserved; one shared destination prints its name, differing
destinations print `Multiple` with exact item allocation in expansion. After issue: the actual PO
destination; issued supplier instructions are never silently rewritten.

**PO Delivery Date** — `purchase_orders.eta_date`. `—` / one formatted date / `Multiple` with exact
dates in expansion; a PO without a date prints `—`; no "if ordered today" estimate.

## 5–9. Expansion · selection · permanent Register · data contract · sticky identity

- Expansion uses the shared `GoodsMiniTable` (new columns optional so Sales Orders and Delivery
  keep their layouts); it shows item/SKU/qty, Ready Stock coverage, linked PO coverage, Unit ID
  where allocated, supplier, Deliver To and PO Delivery Date, with exact mapping when one SO has
  multiple POs. It does not repeat the parent row.
- Selection: parent checkbox = all eligible uncovered child demand; Partial selects only the
  uncovered remainder; Ordered and fully Ready-Stock rows unselectable; indeterminate for partial
  child selection; header checkbox covers visible eligible children only; the issue contract stays
  the current leaf `SoBatchSelection[]`; grouping/demand arithmetic/50-50 issue unchanged.
- The default no-filter view shows all proceeded purchasing records. `All not ordered` becomes a
  real outstanding-only filter and count; timing facets count unique Sales Orders with outstanding
  eligible child demand; the Card 02-A left-rail wording/layout/Safety-days law is preserved.
- Data contract: additive `registerRows: SoBatchOrderRow[]` beside the existing authoritative
  `rows: PurchaseDemandRow[]`; one canonical server read; no duplicate business arithmetic in
  React.
- `SO No` is the explicit sticky identity (optional `DataGrid` capability; existing callers keep
  their default); the saved Register-layout key is bumped so stale layouts cannot override the
  approved order.

## 10–11. Surface and out of scope

As commissioned 2026-08-27: shared `purchase-demands.ts` / `so-batch-purchase.ts` + tests, API
`purchase-demand-read.ts` / `purchase-demands.ts` + tests, web `SoBatchRegister.tsx` /
`OperationToOrder.tsx` + tests, optional `GoodsMiniTable` fields, `DataGrid` sticky identity,
neutral `conciseLocality` helper. Out of scope: left-rail wording/design, 50/50 Issue PO journey,
PO PDF, Purchase Orders Register, Manual Purchase, Receiving, sidebar, Sales Orders body, central
Work, PO revision law, production-day/Safety-days arithmetic, destination ownership, supplier
confirmation workflow, schema.

## 12–15. Proof · walk · delivery gate · completion

Thirty automated proofs (columns/order/links/status derivation/lineage-only attribution/selection
law/rail counts/sticky identity/no migration) on controlled fixtures — no real PO, WhatsApp or
email. Owner walk at 1440px and 1130px with original-size readable evidence. Deliver autonomously:
implement → gates → walk → PR → CI → merge → deploy → verify production SHA → close.

**Completion condition:** production proves one permanent row per proceeded physical-goods Sales
Order with the approved ten-column structure, Delivery Location immediately after Customer, simple
blank/Partial/Ordered status, exact PO lineage, shared item expansion, correct selection behavior
and no duplicated Work or internal arrival calculation on the Register.

---

## Completion evidence

_To be filled at delivery._

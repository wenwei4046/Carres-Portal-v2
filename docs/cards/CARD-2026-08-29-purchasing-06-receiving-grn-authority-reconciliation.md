# PURCHASING — CARD 06 · RECEIVING / GRN AUTHORITY RECONCILIATION

**Module:** Purchasing → Receiving
**Owner rulings:** 29–31 Aug 2026
**Status:** OWNER-APPROVED DESIGN — implementation remains gated
**Lane:** PLAN / AUTHORITY RECONCILIATION
**Branch:** `codex/receiving-grn`

## 1 · Why this Card exists

PR #980 corrected the Purchasing → Receiving seam, but later/current authority still carried old
words and layouts: `Goods Receipts` navigation, delivery-note copy, `Receive` as an action,
status/Work rails, `Accepted`/`Rejected` columns, derived GRN identity and a no-preview rule. These
contradicted the Owner's later Receiving decisions and could make a correct implementation fail the
wrong blueprint.

This Card reconciles authority only. It authorises no Receiving UI, API, SQL or production
migration.

## 2 · RESOLVED FROM AUTHORITY

| Concept | Final Carres word / rule |
|---|---|
| navigation and page | `Receiving` |
| operational object | `Receiving Session` — one physical delivery |
| posted inventory transaction | `Goods Receipt` |
| official document | `GRN`; formal title `GOODS RECEIPT NOTE` |
| number label / format | `GRN No.` / stored `GRN-YYYYMMDD-RRRR` allocated at posting; date segment is Malaysia posting date, not `Goods Received At` |
| supplier evidence | `Supplier DO No.` · `Signed DO photo` |
| start / Carres station | `Start Receiving` · `Save Receiving` |
| external Warehouse | `Send count` |
| GRN Duty review | `Check in` · `Return count to {warehouse}` |
| dates | `PO Issued` · `PO Delivery Date` · `Supplier Delivery Date` · `Goods Received At` |
| quantities | `Order Qty` · `Received Qty` · `Damaged Qty` · `Wrong Item Qty` · `Pending Delivery Qty`; `Extra Qty` is a recorded exception |
| work placement | central `My Work` / `Team Work` deep-links the exact PO/session; no Receiving Work column/panel |
| local rail | `RECEIVING DATE`: Late · six Warehouse work dates · Later · No delivery date |

Manual Purchase and SO Batch Purchase are separate demand doors, then one PO authority, one
Purchase Orders supplier-response door and one Receiving engine. No Manual receipt lane exists.

## 3 · Approved Register and object shape

The Register's parent is the open PO/CO delivery balance. Each physical Receiving Session / posted
GRN discloses beneath it. Default columns are:

`GRN No.` · `PO No.` · `PO Issued` · `Supplier` · `Deliver To` · `PO Delivery Date` · conditional
`Supplier Delivery Date` · `Goods Received At` · `Order Qty` · `Received Qty` · `Damaged Qty` ·
`Wrong Item Qty` · `Pending Delivery Qty` · `Supplier DO No.` · `Unit ID`.

There is no `Source`, purchase-origin, `Arrival Date`, status, `Accepted`, `Rejected` or Work column.
Draft/count/review is full-width and autosaved. A posted record is read-only and may show 50%
operational facts + 50% official GRN from 1130px; below that, the GRN stacks after the facts.

## 4 · Authority corrections made by this Card

- `docs/COPY-STANDARD.md` — one Receiving vocabulary, Supplier DO copy and formal GRN title.
- `docs/ui/MASTER.md` — dated Receiving rail exception, posted-GRN split exception and stored-GRN
  lookup.
- `docs/ERP-ARCHITECTURE.md` — one Receiving writer, explicit actions and formal stored GRN.
- `docs/purchasing/MASTER.md` — PO/Receiving date and quantity names, approved Register/object seam,
  owner/capability wording.
- PR #979 Work spec/plan — Receiving removed from the local `WORK TO DO` rollout while retaining
  central Work projection and deep links.
- `docs/carry-forwards.md` — stale Receiving rail findings explicitly superseded.

## 5 · Delivery gates

- [x] Latest main and PR #979 seam re-read
- [x] Naming, flow, Register, date rail and Object Detail owner-approved
- [x] Cross-authority contradictions reconciled in the working tree
- [x] Exception journeys owner-approved
- [x] Two-line action copy owner-approved
- [x] Permissions/evidence/numbering/audit/external boundaries owner-approved
- [x] Complete Blueprint persisted in `docs/superpowers/specs/2026-08-31-receiving-grn-owner-approved-design.md`
- [ ] Governance PR merged
- [ ] Receiving implementation recut from merged authority
- [ ] CI, governed migration approval, deployment and real-account browser walk

No production migration is introduced or applied by this Card.

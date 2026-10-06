# 【PURCHASING】 — CARD 【08】 · REMOVE MPR FROM MANUAL PURCHASE AND USE ONLY PO NO

Module: Purchasing · Sequence: 08
Pages: Manual Purchase · Purchase Orders · Work · Principal Audit
Status: COMPLETE / PRODUCTION-VERIFIED 2026-09-04 (owner-approved 2026-09-04)
Lane: BUILD / DELIVERY
Start from: latest `origin/main` in a fresh dedicated worktree
Expected migration: ONE non-destructive migration
Owner approval: The exact non-destructive migration defined in this Card is approved. Do not
return to the Owner for routine migration numbering, implementation, testing, PR, merge,
deployment or verification choices.

## 1 · Owner-approved outcome

Remove the visible `MPR` identity completely.

Manual Purchase is an internal way to prepare and approve a purchase. It is not a second
supplier document and must not have a second operator-facing document number.

Both buying doors produce the same formal Purchase Order:

```
SO Batch Purchase ─┐
                   ├─ Issue PO → PO-YYYYMMDD-RRRR
Manual Purchase ───┘
```

Before `Issue PO`, a Manual Purchase has no visible document number. After `Issue PO`, the
only visible purchasing document identity is its actual `PO No`.

No operator, approver, supplier or Principal Audit screen may need to understand `MPR`.

## 2 · Authority correction

This Card records the Owner's 2026-09-04 correction and replaces the current visible-MPR
rules in:

- `docs/purchasing/MASTER.md`
- `docs/COPY-STANDARD.md`

Overwrite those files with one current truth. Delete obsolete current rules requiring:

- `MPR-YYYYMMDD-RRRR`
- `Manual Purchase No`
- an MPR identity in the object header
- MPR wording in Work actions
- MPR as a Purchase Order source label

Do not append a competing "superseded" model.

Executed Cards 04–06 remain historical execution evidence and must not be rewritten.

Mature ERP evidence confirms that a separate purchase-requisition number is a possible
operating model, not an international requirement. Odoo can progress a draft/RFQ into a PO,
while SAP supports the more formal requisition model. Carres has chosen the simpler direct
Manual Purchase → PO model:

- https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/purchase/manage_deals/rfq.html
- https://help.sap.com/doc/0fcc5ce29eab45d88a729c1f5b6e6fac/2502/en-US/PurchasingGuidePro.pdf

External systems are evidence only. The Owner-approved Carres model above is the
specification.

## 3 · Exact final UI contract

### 3.1 Create Manual Purchase

Keep the existing business fields, purposes, stock facts, approval rules and submission
process. The page remains `+ Manual Purchase` / `New Manual Purchase`.

After successful submission: do not show or announce an MPR number; do not create a
replacement `Request No`; show the saved Manual Purchase using its business facts; a success
message may say `Manual Purchase saved`. The invisible UUID remains the navigation and
transaction identity.

### 3.2 Permanent Register

Remove the `Manual Purchase No` column. Exact columns, in this order:

```
Proceed Date · Approval Status · PO No · Delivery Date · For · Items · Qty · Supplier ·
Deliver To · Requested By
```

`PO No` displays: before PO issue `—` · one PO issued the actual clickable
`PO-YYYYMMDD-RRRR` · several POs issued `{n} POs` (opens the exact linked PO list). `—` is a
fact, not a button. Do not write `MPR`, `Request No`, `Not MPR`, `Draft PO` or another
replacement number. Keep selection, approval eligibility, `Issue PO`, PO Duty, filters,
counts and expansion behaviour unchanged. The `For` cell becomes the clear single-click
entrance to the Manual Purchase object and the sticky business column. The row and deep-link
continue to use the invisible Manual Purchase UUID. Do not make `PO No` the Manual Purchase
identity: a purchase may have no PO or several POs.

### 3.3 Manual Purchase Object Detail

The object header contains no MPR or UUID:

```
‹ Manual Purchase

{Need for} · {For}                         [Approval Status]   {n} of {m}
{Proceed Date} · {Supplier summary}
```

Keep the governed sections and their facts: `Request · Items Requested · What We Already
Have · Approval · Purchase Orders · History`. The Purchase Orders section shows only actual
PO identities. No PO lineage row may show MPR. The browser title must not contain MPR.

### 3.4 Approval and Work

Keep the same approval authority, Purchasing Approver Duty, PO Duty, buddy cover and
completion facts. Action sentences become `Approve purchase` and `Issue PO`. The action
sentence must not contain MPR, a person's name or a technical UUID. Each Work record remains
distinct through its structured `orderId = purchase request UUID`; its visible context
distinguishes the purchase using existing business facts
(`Manual Purchase · Ready Stock · Carres Klang · Nice Future`). My Work, Team Work and the
Manual Purchase rail must use the same action identity and completion truth. Do not create a
second Work record.

### 3.5 Purchase Orders source lineage

Preserve Manual Purchase lineage through the invisible source UUID. Visible Purchase Order
source wording: one source `Manual Purchase` · several sources `{n} Manual Purchases`. When
detailed source lines are shown, distinguish them with business facts such as purpose,
`For`, Proceed Date and quantity — not MPR numbers. Do not collapse several Manual Purchases
into one source merely because their visible label is the same; deduplication and links must
use the source UUID. SO-origin sources continue to display their real `SO No`.

### 3.6 Supplier documents

Every supplier-facing Purchase Order uses only `PO-YYYYMMDD-RRRR`. No PO PDF,
email/WhatsApp message, print view, document preview or supplier evidence may contain
`MPR`, `MPR-` or `Manual Purchase No`. Do not add an internal request number to the PO PDF.

### 3.7 Search, filters, export and audit

Remove MPR from: Manual Purchase Register search · Purchase Orders source search · exports ·
browser titles · object headings · Work · Order Route/source displays · Principal Audit
presentation · success/error messages.

Existing raw audit and legacy database values must remain unchanged. Principal Audit may
translate a stored legacy `MPR-…` or `REQ-…` reference to the visible label
`Manual Purchase`; it must not rewrite or delete the stored evidence. New audit actions use
plain business wording (`Manual Purchase saved` · `Purchase approved` · `Purchase refused` ·
`Deliver To changed` · `Purchase order issued`); their internal object reference remains the
UUID and must not be printed.

## 4 · Internal identity and migration

`purchase_requests.id` is the canonical invisible identity. Create ONE new migration after
checking the production migration tracker tail, the latest repository migration, and every
active branch.

The migration must: preserve every existing `REQ-…` and `MPR-…` value unchanged; preserve
all historical audit rows unchanged; remove the MPR allocator default from
`purchase_requests.req_no`; allow `req_no` to be null for new Manual Purchases; document
`req_no` as legacy compatibility data only; update current Manual Purchase database
functions so new records do not depend on or announce MPR; make new audit actions use
generic Manual Purchase wording and the UUID as the internal reference; preserve atomic
creation, approval, refusal, destination change and PO issuance.

It must not: delete, update or renumber an existing transaction; drop `purchase_requests`;
change purpose, quantity, approval, price, destination or PO rules; alter the formal PO
allocator; expose a UUID as a replacement document number.

Application/API contracts must tolerate both a historical record (`req_no` contains stored
REQ/MPR) and a new record (`req_no` is null). No operator-facing component may consume
`req_no`.

Use a backward-compatible rollout: make application code safe with both the old and new
schema → pass all gates → merge and deploy the compatible application → apply the approved
non-destructive migration through the governed production path → verify the new schema and
all production surfaces.

## 5 · Boundaries that must not change

This Card does not change: Manual Purchase purposes; when approval is required; who
approves; approved quantity; purchase-demand arithmetic; stock and open-PO coverage;
Supplier × Category production days; Delivery Date or Order By calculations; supplier or
destination ownership; transaction cost authority; PO Duty and buddy cover; PO grouping; PO
numbering; the one `purchasing_issue_pos_batch` authority; Receiving/GRN ownership; Purchase
Order revision or confirmed-sent evidence; the Manual Purchase left filter rail, except
removing MPR-dependent presentation.

Do not create: Purchase Requisition; Request No; RFQ; Draft PO number; a second approval
object; a second PO issue route; a second receiving entrance.

## 6 · Minimum affected surfaces

`docs/purchasing/MASTER.md` · `docs/COPY-STANDARD.md` · shared Manual Purchase words, status
and Work composition · Manual Purchase API list/detail/create/decision responses · Manual
Purchase Register and Object Detail · Work and Work deep-links · Purchase Orders source
models and UI · Principal Audit presentation · search/export contracts · development
previews · focused tests · one new migration. Treat this as a complete vertical correction.

## 7 · Acceptance contract

1. No current operator-visible screen contains `MPR`, `MPR-` or `Manual Purchase No`.
2. Creating a new Manual Purchase succeeds without showing or returning an operator-facing
   request number.
3. After the migration, a new Manual Purchase does not receive a new MPR number.
4. Historical MPR/REQ values and audit rows remain stored unchanged.
5. An unissued Manual Purchase still opens, filters, approves/refuses and deep-links
   correctly through its invisible UUID.
6. Its `PO No` cell shows `—`.
7. After `Issue PO`, the cell shows the actual clickable `PO-YYYYMMDD-RRRR`.
8. One Manual Purchase linked to several POs correctly shows `{n} POs`.
9. One PO linked to several Manual Purchases preserves every source separately by UUID.
10. Work actions remain distinct and complete from authoritative facts without printing MPR
    or UUID.
11. Purchase Orders, source details, Order Route and Principal Audit print no MPR.
12. Supplier PO PDF and outbound supplier communication contain only the formal PO number.
13. Approval, demand, price, duty, destination, issue, sent-evidence and Receiving laws
    remain unchanged.
14. Tests cover historical non-null `req_no`, new null `req_no`, unissued, one-PO, many-PO
    and many-source cases.
15. Focused tests, full shared/API/web suites, typecheck, lint, migration validation,
    production build and `git diff --check` pass.
16. GitHub CI passes before merge.
17. After merge and migration apply, every production surface reports the exact merge SHA.
18. An authenticated production walk proves the create flow, permanent Register, unissued
    object, Work, issued PO lineage, Purchase Orders source and Principal Audit.
19. Update this Card's completion section and overwrite MASTER/COPY with final production
    truth in the same delivery.
20. Engineering completes PR, merge, deployment, migration and verification autonomously.
    Return to the Owner only if completing the Card would require deleting or rewriting
    historical data or changing an approved business rule.

## 8 · Owner Decision Gate

No Owner question remains. The Owner explicitly decided: Remove MPR. Manual Purchase and SO
Batch Purchase both create the same formal PO type and numbering. Before issue, Manual
Purchase has no visible document number. After issue, only PO No is shown. Do not offer MPR,
Request No or Draft PO as alternatives.

## 9 · Completion evidence

```
Branch / commits:  build/purchasing-08-remove-mpr (vertical slice) ·
                   build/purchasing-08-baseline-0424 (collision repair)
PR:                #1093 (slice) · #1094 (0424 collision baseline)
CI:                verify SUCCESS on both PRs; full gates local: shared 60 ·
                   api 159 (focused) · web 287 files / 3785 tests · typecheck ·
                   lint · ci:migrations · production build all green
Migration created: supabase/migrations/0424_a_manual_purchase_has_no_number_only_its_po_does.sql
                   (collided with Warehouse Card 03's 0424 merged 8 minutes
                   earlier; both committed → pair baselined per the 0417
                   precedent in #1094 — committed migrations do not rename)
Migration applied: 2026-09-04 via the governed Supabase path, AFTER the
                   compatible app deployed. Verified: req_no default gone,
                   nullable YES, both doors speak plain audit words, every
                   stored REQ-/MPR- value unchanged, historical audit rows
                   byte-identical.
Merge SHA:         bc96a1e30d6c358b32c280e1cee201c3b08a3ed2 (slice) ·
                   23ab3121bb3757c3e067a28193bf577cc38a186f (repair)
Production SHA convergence: 23ab3121 on carres-portal.pages.dev ·
                   carres-pos.pages.dev · erp.carresofficial.com ·
                   pos.carresofficial.com · api.carresofficial.com/health
Authenticated production walk (operation@, 2026-09-04): Register shows the
                   ten columns and NO number; issued rows show clickable
                   PO-20260904-5805 / PO-20260904-9834; created a new Manual
                   Purchase (Ready Stock · 8022-1NA · Ohana collection lock ·
                   Delivery Date defaulted Wed, 23 Sep) — no number shown or
                   announced, DB row 0ecd0138… has req_no NULL while both
                   historical rows keep their stored MPR- values; its PO No
                   cell reads `—`; the unissued object opened via `For` with
                   heading `Ready Stock · Ohana · Fri, 4 Sep · Ohana`
                   [Waiting for approval] 1 of 3, browser title
                   `Manual Purchase — Carres`; Team Work shows Jess holding
                   `Approve purchase` and PO Duty holding two distinct
                   `Issue PO` records, all with the
                   `Manual Purchase · Ready Stock · Ohana` context; the served
                   bundle greps clean of `Manual Purchase No` and literal
                   MPR-dated strings. Principal Audit presentation is the
                   deployed translation (unit-covered); stored audit rows
                   verified unchanged by SQL. The waiting request is left for
                   Jess — approving it will mint the first plain-worded
                   `Purchase approved` audit row.
MASTER/COPY overwrite: docs/purchasing/MASTER.md + docs/COPY-STANDARD.md in
                   #1093; production stamps in this closure commit.
Final status: COMPLETE / PRODUCTION-VERIFIED
```

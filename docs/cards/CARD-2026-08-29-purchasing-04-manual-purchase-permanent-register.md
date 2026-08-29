# PURCHASING — CARD 04 · MANUAL PURCHASE PERMANENT REGISTER

**Card path:** `docs/cards/CARD-2026-08-29-purchasing-04-manual-purchase-permanent-register.md`
**Module:** Purchasing · **Sequence:** 04
**Page:** Manual Purchase
**Surface:** The permanent right-side Register (columns, expansion, selection, toolbar),
the `MPR-` number series, and the sixth approved purpose
**Status:** IN BUILD
**Lane:** BUILD / DELIVERY
**Depends on:** Purchasing Card 03 (the four-section rail — byte-behaviourally unchanged here)
**Expected migration:** ONE — `0401` (0400 lives on PR #977's open branch; next free number
across tracker `0399`, repository `0399` and every remote branch, measured 2026-08-29)

---

## 1 · Outcome

Rebuild the Manual Purchase Register on the exact Carres Register engine and visual grammar the
production Sales Orders page uses — `components/register/DataGrid`, `appearance="reference"`,
the 50px Destination Header, the 8px Register frame, governed 36px header / 38px rows / 32px
footer, the existing Search / per-column filters / sorting / Export / Columns controls, sticky
Manual Purchase identity, horizontal scrolling that never squeezes Card 03's 240px rail.

Reuse the Sales Orders UI kit, never its business content. No new table engine, no legacy kit
`DataTable` for the register, no KPI cards, no duplicate page title, no empty side panel, no
PDF preview (Manual Purchase is an internal request — the supplier-facing preview belongs only
to the existing PO issue surface), no second toolbar.

This Card does not touch Card 03's left rail beyond wiring the sixth purpose row the vocabulary
correction adds (`Other Purchase` joins `PURCHASE PURPOSE` because `DEMAND_PURPOSES` is the
rail's one creatable list — Law D; the shell, sections, order, meanings and counts are
unchanged).

## 2 · Authority read

`CLAUDE.md` · `docs/ERP-ARCHITECTURE.md` (Laws A–D) · `docs/ui/MASTER.md` §6.7 (the Register
Shell — selection replaces Row 2 in place; no KPI preamble) · `docs/COPY-STANDARD.md` (Manual
Purchase block — `+ Manual Purchase`, `New Manual Purchase`, `MPR-YYYYMMDD-RRRR` already
governed) · `docs/purchasing/MASTER.md` §§5.2 · 5.3 · 6.1 · 9.2 · Card 03 (rail law,
production-verified) · Card 02-B (the SO Batch permanent register — the sibling grammar) ·
current implementation: `OperationManualPurchase.tsx`, `manual-purchase.ts` (API + shared),
`SoBatchRegister.tsx`, `DataGrid.tsx`, migrations 0359/0361/0380/0381/0399.

## 3 · The permanent Register

One Manual Purchase request per parent row. The default population is the complete permanent
history, ordered records included — `All not ordered` stays an explicit rail filter, never a
silent default. Default order: newest `Requested Date` first.

Selection and expansion controls precede the business columns but are not business columns.
**Columns, exactly and in this order:**

```text
Requested Date · Approval Status · Manual Purchase No · PO No · Needed By · For ·
Items · Qty · Supplier · Deliver To · Requested By
```

1. **Requested Date** — the request's actual `created_at`, newest first by default. Never
   Needed By, approval date or PO date.
2. **Approval Status** — the approval FACT: `Need approval` · `Approved` · `Refused` ·
   `No approval needed`. While approval is needed, a quiet second line names the real
   configured approver — `{name} approves` (the Card 03 §3 arithmetic; never `operation`,
   an email, a role name or `(you)`).
3. **Manual Purchase No** — the object identity and link; sticky during horizontal scroll.
   New requests mint `MPR-YYYYMMDD-RRRR` through the one governed allocator
   (`allocate_formal_document_code`, §6.1) — never `PR-`. Historical numbers print exactly
   as stored; no cosmetic relabelling.
4. **PO No** — ONLY the request lines' real PO lineage (`purchase_order_lines.demand_id`,
   with the demand's own `po_id` as the pre-0361 fallback) resolved to actual
   `purchase_orders.po_no`. None: `Not ordered yet`. One: the clickable PO number. Several:
   `{n} POs`. Never a UUID; never inferred from SKU / supplier / date matching.
5. **Needed By** — the request's actual required date. It creates no Order Today / Order
   Late arithmetic.
6. **For** — the structured object the purchase serves: `Ready Stock` → the governed
   destination context; `Showroom Display` → the actual showroom destination;
   `Service Case` → the linked Service Case number; `Internal Staff Purchase` → the real
   staff member; `Subsidiary Purchase` → the actual subsidiary company;
   `Other Purchase` → its required `What is this for?` answer. Never a generic free-text
   remark where a structured relationship is required; a historical row without the
   structured fact prints nothing rather than a guess.
7. **Items** — human Catalog words via the ONE item-label arithmetic (`railItemLabel`).
   One item: its name. Several: `{first item} + {n} more`. SKU stays searchable and shows
   in the expansion.
8. **Qty** — the total originally requested quantity, never remaining-to-order.
9. **Supplier** — Card 03's own Catalog-derived projection. One: the actual name. Several:
   `{n} suppliers`. Never `Supplier not selected`.
10. **Deliver To** — the governed Purchasing destination; several destinations print
    `Multiple`.
11. **Requested By** — the real staff name from authoritative identity; never a shared
    account, role, email or `(you)`.

**Purpose is NOT a parent column** — it lives in the rail, the expansion context and the
object.

**Toolbar (one compact DataGrid band):** `[+ Manual Purchase] [Search] [Filters] [Export]
[Columns]`. Search covers Manual Purchase No · PO No · item/model · SKU · supplier ·
destination · the structured For · Requested By.

**Row expansion — one quiet read-only child table:**

```text
SKU · Item · Requested Qty · Approved Qty · Ordered Qty · Still To Order · Supplier ·
Deliver To · PO No
```

`Still To Order` is the ONE governed remainder arithmetic
(`max(0, (approved ?? asked) − issued)` — the same function the issue door and issue-costs
read use; spelt once in shared). No Approve / Refuse / Receive / price / PO-creation controls
inside the expansion, and no PDF preview.

**Selection and PO Duty.** Only requests whose derived status is `Ready to order`
(`manualPurchaseStatusOf`) with live remaining quantity may be selected. Need approval,
governed blockers, fully ordered, arrived, refused and withdrawn rows refuse the tick. With
no selection there is no PO Duty block, initials or reminder anywhere on the page. With a
selection, PO Duty appears once, beside the issue action, in the SO Batch sibling grammar:

```text
1 selected · 1 unit · Issue 1 PO        [YJ] [Issue PO]
```

Pluralised from facts; the PO count is the document-partition arithmetic the issue door
groups by (supplier × category × destination × purpose, merged across requests). Work
ownership and reminders stay in central `Work`; issuance authority remains the ONE
`purchasing_issue_pos_batch` door.

## 4 · The purpose correction — persisted by this Card

The six approved purposes are exactly:

```text
Ready Stock · Showroom Display · Service Case · Internal Staff Purchase ·
Subsidiary Purchase · Other Purchase
```

Only `Other Purchase` asks `What is this for?` (stored in `why`; required by the door).
Routine purposes no longer ask a duplicate `Why`. No stored value is relabelled; the four
retired values stay history-only. New structured request facts, door-required per purpose:
`for_service_case_id` (Service Case) · `for_staff_user_id` (Internal Staff Purchase) ·
`for_subsidiary_name` (Subsidiary Purchase). `Ready Stock` and `Showroom Display` are served
by the governed destination already on the request.

**Migration `0401`** (new file; nothing committed is edited):

1. `purchase_requests.req_no` default becomes `allocate_formal_document_code('MPR')`;
   existing identities are permanent and never renumbered.
2. Purpose CHECKs on `purchase_requests`, `purchase_demands`,
   `purchasing_purpose_approval` and `purchase_orders` widen by `other_purchase`; the
   approval switch row for `other_purchase` is seeded ON (the safe side).
3. `why` drops NOT NULL; the new CHECK requires a non-blank `why` exactly when
   `purpose = 'other_purchase'`, and the three structured For columns land with per-purpose
   CHECKs.
4. `purchasing_create_request` is DROPPED and recreated with the new signature (the three
   For parameters) — six-value gate, per-purpose For requirement, a For fact on the wrong
   purpose refused by name. `purchasing_create_demand` and
   `purchasing_set_purpose_approval` are replaced whole with the six-value gate.
5. `purchasing_issue_pos_batch` is restated whole (0399's body) with only its purpose gate
   widened by `other_purchase`.

## 5 · Absolute exclusions (parent table)

`Purchase Purpose` · `ORDER TIMING` · `Order late` · `Need price` · `Part received` ·
`Received` · `Arrived` · `Work` · `Next action` · `Reason` · `Remark` · `Price` · permanent
PO Duty · row action buttons.

## 6 · Acceptance

1. All 11 columns, exact order. 2. Card 03's rail unchanged (plus only the vocabulary-driven
sixth purpose row). 3. Same `register/DataGrid` + reference appearance as Sales Orders.
4. Default results include ordered history. 5. PO numbers from real lineage only. 6. Items
in Catalog human words. 7. One supplier projection for column and rail. 8. Real staff names
for Requested By and the approver. 9. Expansion shows exact per-line quantities and lineage.
10. Search/filters/sorting/export match displayed truth. 11. Sticky identity; rail never
squeezed. 12. Only eligible approved remaining demand selectable. 13. PO Duty only beside
the selected issue action. 14. Other Purchase end to end, alone requiring its explanation.
15. Focused + full repository gates pass. 16. PR merged, production converges on the exact
main SHA, authenticated checks prove normal and narrow desktop behaviour.

---

## Completion evidence

_To be written at closure._

# PURCHASING — CARD 03 · MANUAL PURCHASE LEFT FILTER RAIL AND THE APPROVED PURPOSE VOCABULARY

**Card path:** `docs/cards/CARD-2026-08-28-purchasing-03-manual-purchase-left-filter-rail.md`
**Module:** Purchasing · **Sequence:** 03
**Page:** Manual Purchase
**Surface:** Left filter rail + the purpose vocabulary it filters by
**Status:** COMPLETE — production-verified 2026-08-28; migration `0398` committed, its
production APPLY awaits the governed §5 apply path (see Completion evidence)
**Lane:** BUILD / DELIVERY
**Depends on:** Purchasing Card 02-C (the shared 240px `FilterRail` shell)
**Expected migration:** ONE — `0398` (purpose vocabulary; next free number across tracker,
repository and every branch, measured 2026-08-28)

---

## 1 · Outcome

Replace the Manual Purchase page's legacy 200px queue/facet rail with the governed 240px
`FilterRail`, carrying the owner-approved four sections, and make the approved purpose
vocabulary true end to end — shared types, API validation, SQL doors and schema constraints —
with no false relabelling of any stored value.

This Card owns the Manual Purchase left rail and the purpose vocabulary only. It does not
redesign the Register columns, the create workspace, the approval journey, the issue journey,
PO issuance authority or SO Batch Purchase.

## 2 · Authority read

`CLAUDE.md` · `docs/ERP-ARCHITECTURE.md` (Catalog owns category; Purchasing owns demand) ·
`docs/ui/MASTER.md` (LOCAL FILTER RAIL — READABLE SHELL, locked) · `docs/COPY-STANDARD.md` ·
`docs/purchasing/MASTER.md` §§5.2, 9.2 · Card 02-C (rail shell + Manual Purchase template
boundary) · migrations 0323 / 0359 / 0361 / 0380 (the purpose gates) · the current
implementation (`OperationManualPurchase.tsx`, `manual-purchase.ts` API,
`manual-purchase.ts` shared, `workspace-rail.tsx`).

Card 02-C §10 already rules what Manual Purchase imports (the 240px shell, group-heading
typography, blue `NavRow`, no checkboxes, Product Catalog authority, dynamic Supplier
behaviour, unique-object counts) and what it must not copy (`ORDER TIMING`, Safety-days
arithmetic, the SO-specific `All not ordered` meaning).

## 3 · Final left rail — owner approved 2026-08-28

```text
TO ORDER

  All not ordered                        12
  Need approval                           3
  Ready to order                          5


PURCHASE PURPOSE

  All purposes

  Ready Stock                             6
  Showroom Display                        2
  Service Case                            1
  Internal Staff Purchase                 2
  Subsidiary Purchase                     1


PRODUCT

  All products

  Mattress                                4
  Bedframe                                5
  Sofa                                    3


SUPPLIER

  All suppliers

  [actual supplier names, alphabetical — never hardcoded]
```

All numbers are examples; production calculates live counts. Exactly these groups, in exactly
this order. No fifth group, ever, on this surface.

## 4 · Filter meanings

- The **default no-filter Register** remains the permanent Manual Purchase listing, ordered
  history included.
- **`All not ordered`** — requests with live quantity not yet fully issued to a PO: the
  derived request status is `Waiting for approval`, `Waiting for the SKU` or
  `Ready to order`. Fully ordered/arrived requests leave it but stay in the Register;
  refused / fully cancelled requests (`Not going ahead`) are not awaiting ordering and do
  not count.
- **`Need approval`** — submitted requests still awaiting the configured approver's decision
  (derived: `approval_required` and undecided). The rail says `Need approval`; the
  Register/object continues to show the real state and action owner.
- **`Ready to order`** — approved (or approval-free) requests with remaining quantity
  available for PO Duty to issue (derived status `Ready to order`).
- **`PURCHASE PURPOSE`** — the five approved purposes, one row each. A historical request
  whose stored purpose is a retired value appears under `All purposes` only; it is never
  falsely relabelled into an approved row.
- **`PRODUCT`** — the authoritative Catalog category (`product_models.category`) of the
  request's line SKUs. Never SKU text, model-name inference or a browser-only mapping. A
  request whose lines span categories counts once under every matching category and appears
  once in the Register.
- **`SUPPLIER`** — actual supplier names only, dynamic, alphabetical. The supplier fact is
  the demand line's Catalog-derived `supplier_id` (0323/0359: derived from the SKU, never
  chosen by Operation); issued PO lineage carries the same supplier by the issuance walls.
  A selected supplier stays visible with `0` while other filters temporarily remove its
  matches.
- Counts are **unique Manual Purchase requests** — never lines, SKU quantities, POs or
  notifications — and each section's counts are computed under the OTHER sections'
  selections, so the printed number predicts the click.
- One active filter per section · a second click on the active row clears it · filters
  across sections combine with AND · `All purposes` / `All products` / `All suppliers`
  clear only their own section · clearing everything restores the complete permanent
  Register.
- No checkboxes anywhere in the rail; rows use the governed blue `NavRow` treatment; labels
  wrap and never truncate; counts stay visible and right-aligned; the rail scrolls
  vertically; the Register scrolls horizontally when narrow and the rail is never squeezed
  below 240px.

## 5 · Absolute exclusions

Never render on this rail: `Supplier not selected` · `No supplier` · `Not in catalog` ·
`Need price` · `Ordered` · `Part received` · `Received` · `Arrived` · `Cancelled` ·
`My drafts` · `Need correction` · `Queues` · `ORDER TIMING` · any safety-days row. A missing
SKU or supplier is named inside the affected request/object and handled through its owning
Catalog boundary; it never becomes a permanent rail facet. Price is not a rail state or
filter.

The legacy rail's `Queues` heading, `Approve the purchase` / `Issue PO` / `Check the SKU`
queue rows and the `Need for` facet section are retired from this surface by this Card.

## 6 · Purpose authority — owner ruling 2026-08-28

The visible, creatable Manual Purchase purposes are exactly:

| Stored value | Visible word |
|---|---|
| `ready_stock` | `Ready Stock` |
| `showroom_display` | `Showroom Display` |
| `service_case` | `Service Case` |
| `internal_staff_purchase` | `Internal Staff Purchase` |
| `subsidiary_purchase` | `Subsidiary Purchase` |

Management is included under `Internal Staff Purchase`; there is no `Management Purchase`.

**No stored value is relabelled.** The four pre-ruling values (`display` · `warranty` ·
`office` · `spare_parts`) are RETIRED: no door accepts them for a new request, no picker
offers them, and existing rows keep printing their original truthful words (`Display` ·
`Warranty` · `Office` · `Spare Parts`) in the Register and object — under `All purposes`
only. Relabelling `office` as `Internal Staff Purchase` (or `warranty` as `Service Case`)
would claim old rows meant something they were never asked as; the clean-start law
(Constitution §6) makes the historical cost of retirement nil.

**Migration `0398`** (new file; no committed migration is edited):

1. Widen the `purchase_requests.purpose`, `purchase_demands.purpose` and
   `purchasing_purpose_approval.purpose` CHECKs to the nine values (five approved + four
   retired, which existing rows still hold).
2. Widen `purchase_orders_purpose_check` the same way (plus `customer_sales`).
3. Seed `purchasing_purpose_approval` rows for the four new values
   (`requires_approval` defaults true — the safe side).
4. Recreate `purchasing_create_request`, `purchasing_create_demand` and
   `purchasing_set_purpose_approval` admitting ONLY the five approved values — a retired
   value is refused by name (`unknown_purpose`), exactly as an invented one is.
5. Restate `purchasing_issue_pos_batch` (0380's body, whole) with its purpose gate widened
   to the nine + `customer_sales`, so an approved request created under the new vocabulary
   can be issued and a historical PO purpose remains valid.

Shared truth: `DEMAND_PURPOSES` becomes the approved five (display order = the approved
order); a separate retired-value label map keeps historical rows readable; `poPurposeLabelOf`
and the Register/object label lookups answer for all nine + `customer_sales`. The API zod
enums follow `DEMAND_PURPOSE_VALUES` and therefore admit exactly the approved five.

## 7 · Approval boundary — unchanged, restated

Operation prepares and submits; Operation does not approve and does not control price. The
approver is the configured Purchasing Settings manager gate (`ops_manager` duty or
principal) — Jess today, changeable without touching this rail. Jess may approve a purchase
for herself. Approved requests continue into the existing governed PO Duty issuance door
(`purchasing_issue_pos_batch` behind `purchasing_actor_may_issue`); this Card creates no
second issuance authority and does not merge Manual Purchase with SO Batch Purchase.

## 8 · Implementation surfaces

`packages/shared/src/manual-purchase.ts` (+ new rail model + words) ·
`packages/shared/src/to-order.ts` (purpose vocabulary) ·
`packages/shared/src/index.ts` · `apps/api/src/routes/operation/manual-purchase.ts`
(register read gains the line's Catalog category; zod follows shared values) ·
`apps/web/src/pages/operation/OperationManualPurchase.tsx` (FilterRail import) ·
`apps/web/src/lib/queries.ts` (payload type) · `supabase/migrations/0398_*.sql` ·
`docs/COPY-STANDARD.md` · `docs/purchasing/MASTER.md` · this Card.

## 9 · Required proof (tests)

1. The Manual Purchase rail uses the shared 240px `FilterRail`.
2. Exact group and row order matches §3.
3. Every §5 banned row/word is absent from the rail.
4. Default Register includes history; `All not ordered` excludes fully ordered requests.
5. `Need approval` and `Ready to order` use the derived request truth
   (`manualPurchaseStatusOf`), not a stored status.
6. Product categories come from Catalog authority (a SKU whose text screams a category but
   whose Catalog category is absent is not counted).
7. Supplier rows contain actual names only, alphabetical, dynamic.
8. No missing-SKU / missing-supplier placeholder becomes a rail facet.
9. Counts are unique Manual Purchase requests, cross-computed per section.
10. Cross-section filters combine with AND.
11. Purpose values work end to end: the five approved values create/validate/label; the four
    retired values are refused by the doors and keep their original labels on old rows;
    no false mapping anywhere.
12. Existing SO Batch Purchase behaviour and PO issuance authority are unchanged.
13. Full repository release gate passes.
14. Production renders the approved rail and reports the merged main SHA.

## 10 · Failure conditions

The Card fails if: a banned row renders · Product is inferred from SKU text · supplier names
are hardcoded or placeholder · counts are line or quantity counts · rail rows use
checkboxes · an old stored purpose is printed as an approved word it never meant · a door
still accepts a retired value · a committed migration is edited · SO Batch Purchase or PO
issuance behaviour changes · a second PO issuance authority appears.

## 11 · Out of scope, recorded

The `MPR-YYYYMMDD-RRRR` number series, the `+ Manual Purchase` / `New Manual Purchase`
create-surface words and the §9.2 column evolution remain approved-target gaps owned by
their own future cards; this Card neither builds nor blocks them.

## 12 · Delivery

One production vertical slice from latest `main`: implement → full release gate → PR → CI →
merge → deploy → production verification → overwrite `docs/purchasing/MASTER.md` §9.2 and
the COPY-STANDARD Manual Purchase block with the final truth → close this Card.

---

## Completion evidence — 2026-08-28

- **PR:** [#973](https://github.com/wenwei4046/Carres-Portal-v2/pull/973), built from `main`
  `97b7acd2` with the Card 02-D closure (`f76ee00a`) merged in before CI; CI green on head
  `db0b8f20`; merged to `main` as `4c8aa6d527ccd3b4e87f09994ccc91456203f01b`.
- **Authority persisted in the same PR:** this Card · `docs/purchasing/MASTER.md`
  §5.2 (approved purpose vocabulary; retirement, never relabelling), §9.1 (Manual Purchase
  now imports the shared shell), §9.2 (the four-section rail law, APPROVED / LOCKED) ·
  `docs/COPY-STANDARD.md` (the approved five purpose words + the retired four as
  history-only, and the Manual Purchase rail block with its banned rows).
- **The model:** `MANUAL_PURCHASE_RAIL` + `manualPurchaseRailFacts` +
  `manualPurchaseRailModel` (`packages/shared/src/manual-purchase.ts`) — every count is
  unique requests computed under the OTHER sections' selections; the three `TO ORDER` rows
  ride the ONE status arithmetic (`manualPurchaseStatusOf`); `PRODUCT` is SO Batch's own
  Catalog list by reference (`SO_BATCH_RAIL.product`, Law D — the two rails cannot drift);
  a Catalog hole contributes nothing and never grows a facet. The purposes:
  `DEMAND_PURPOSES` became the approved five, `RETIRED_DEMAND_PURPOSE_LABELS` +
  `demandPurposeLabelOf` keep history printing its own truthful words.
- **The shell:** the page draws Card 02-C's shared `FilterRail` / `FilterRailGroup` /
  `FilterRailRow` (240px, wrap-never-truncate, blue `NavRow`, no checkboxes), with the
  locked `Hide filters` / `Show filters` collapse remembered per staff browser
  (`carres.manualPurchase.filterRail.v1`). The legacy 200px `RailAside` (Queues + Need
  for) is deleted from this surface.
- **The API:** the register read stamps each line with the CATALOG's category
  (`product_models.category`, whole-catalog read — never `.in()` over free-text SKUs);
  the create doors follow `DEMAND_PURPOSE_VALUES`, so a retired value is refused before
  the RPC.
- **Migration `0398`** (`0398_a_purchase_names_the_approved_purpose.sql`, the next free
  number across tracker, repository and every remote branch, measured 2026-08-28):
  CHECKs widened to the union (POs keep `customer_sales`), the four new approval switches
  seeded ON, `purchasing_create_request` / `purchasing_create_demand` /
  `purchasing_set_purpose_approval` narrowed to the approved five,
  `purchasing_issue_pos_batch` restated whole (0380's body) with only its purpose gate
  widened. **COMMITTED, NOT YET APPLIED TO PRODUCTION** — this session holds no Supabase
  credential and CI never applies SQL, so the §5 governed apply (exact repository file,
  rolled-back production assertions + negative control first) is the one remaining step,
  Jess's or a credentialed session's. Until it runs, the deployed create form stores
  `Ready Stock` requests normally; the other four approved purposes are refused BY NAME
  (`unknown_purpose`) at the old door — named, not silent, and nothing is corrupted. The
  rail, Register, filters, history labels and issue journey are unaffected.
- **Gates:** 8,852 tests green (shared 2,752 · api 2,537 · web 3,563 — including 20 new
  shared rail-model proofs, the API category/door proofs and the web rail proofs),
  `ci:migrations` (410 filenames), lint, typecheck, production build, `git diff --check`.
- **Production:** deploy run
  [33182163936](https://github.com/wenwei4046/Carres-Portal-v2/actions/runs/33182163936)
  SUCCEEDED at 15:03:58Z; its `ci:smoke` step (`scripts/verify-production.mjs`) converged
  all five governed surfaces (carres-portal Pages · carres-pos Pages · ERP canonical ·
  POS canonical · API Worker `/health`) on the exact merge SHA. The build's own bundle
  count before merge: `PURCHASE PURPOSE` · the five approved purpose words ·
  `All not ordered` · `Need approval` all present; `Management Purchase` **0**.
- The authenticated production walk on live data remains the owner's, per the standing
  owner-only acceptance law.

```text
PURCHASING CARD 03 COMPLETE — pending only the governed 0398 production apply
Production SHA: 4c8aa6d527ccd3b4e87f09994ccc91456203f01b
```

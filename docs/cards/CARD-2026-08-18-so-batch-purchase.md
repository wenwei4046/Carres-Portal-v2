STATUS: QUEUED
DATE: 2026-08-18 · rewritten to final authority 2026-08-20
PR: pending
IMPLEMENTATION: APPROVED TARGET — build after Purchase Demands; no Owner Decision remains

# SO BATCH PURCHASE — arrange ready customer demand and issue the correct POs

【TAB】 — CARD-2026-08-18-so-batch-purchase · Select shortage, set or split Deliver To, then issue the governed supplier POs

**Depends on:** `CARD-2026-08-20-purchase-demands.md` shared demand read and live Register.

**Owns:** the `SO Batch Purchase` work surface, its visit-local Issue arrangement, and the one
customer-demand call into `purchasing_issue_pos_batch(jsonb)`.

**May touch:** the shared to-order plan/types, To Order API/UI/tests, the sole issue RPC through a
new migration, the PO-line destination split invariant, governed copy, and Purchasing MASTER
closure evidence.

**Must not touch:** Purchase Demands' no-Issue boundary, Manual Purchase, PO follow-up/revision
screens, Sales Order writers, Receiving, Claims, supplier acknowledgement, automatic WhatsApp/
email, or external cutover.

Read on latest `origin/main`: `CLAUDE.md` → `docs/ERP-ARCHITECTURE.md` →
`docs/purchasing/MASTER.md` §1/§2/§3/§4 → `docs/orders/MASTER.md` Purchasing read boundary →
`docs/stock/MASTER.md` coverage/Unit boundary → `docs/delivery/MASTER.md` dated-arrival seam →
`docs/ui/MASTER.md` Shell/Register/Object rules → `docs/COPY-STANDARD.md` and
`docs/ACTION-FLOW-STANDARD.md`. Execute as BUILD/DELIVERY through production verification. Do not
ask the Owner to choose files, state shape, test order, migration number, branch, PR or deploy
mechanics.

## 1 · Final authority — old Card statements are dead

This rewrite removes the old competing statements. The build must obey only this target:

1. `Purchase Demands` inspects/prepares; **SO Batch Purchase is the customer-demand lane's only
   `Issue PO` workspace**.
2. `Deliver To` is Purchasing-owned. It defaults to `Carres Klang`, is directly editable before
   Issue and may split one SKU quantity across destinations.
3. `Deliver To` is not derived from Sales Order/showroom/warehouse location. Sales reads the final
   PO/line result only.
4. Customer delivery remains Sales' date and drives the engine; Operations does not retype it.
5. **Price does not stop Operations from ordering.** No price/FOC question appears here and a
   missing/changed Catalog cost may not disable Issue.
6. Sofa remains together by Sales Order; other goods group by item.
7. The server decides document grouping. There is no Combined/Per-SO choice.
8. `purchasing_issue_pos_batch(jsonb)` remains the one PO creation authority.

Emergency/urgent Ready Stock is Manual Purchase and is outside this Card.

## 2 · Operator journey

The page must allow a new staff member to complete the job without remembering a procedure:

```text
1  Open SO Batch Purchase.
2  The PO Schedule opens the governed run; each row prints weekday + date.
3  Read Qty Needed · Ready Stock · On PO · To Buy.
4  Select only the shortage to order now.
5  Check Deliver To. Leave Carres Klang, or change/split only the exception.
6  Press Issue {n} PO(s).
7  The system creates the PO number(s) and shows each supplier; every PO number opens Purchase Orders.
8  Purchase Orders tells staff to share the correct PO PDF and later what supplier fact to chase.
```

No `Today`, `Tomorrow`, `Needs attention`, generic `Follow up`, `Priority`, `Prepare PO`, `Send PO`
or `Acknowledged` stage may be added. Issuing creates the formal PO; sharing the PDF and every later
supplier update remain Purchase Orders work.

## 3 · Page composition

Keep the approved Sales Orders-sized Destination Header and the existing 200px left working rail:

```text
SO Batch Purchase                           Jump to…  Alerts  Help  Settings
────────────────────────────────────────────────────────────────────────────
PO SCHEDULE     │ [Search…]                         Updated 10:32 AM
Overdue         │
Wed, 19 Aug     │ Item · Description     Qty Needed  Ready Stock  On PO  To Buy
Fri, 21 Aug     │   └─ variant
Mon, 24 Aug     │       └─ SO No · Customer · Customer Delivery · Qty ·
                │           Coverage · Supplier
CATEGORY        │
All             │
Mattress        │
Bedframe        │
Sofa            │
────────────────────────────────────────────────────────────────────────────
                │ N units selected                         Issue N PO(s)
```

The rail remains exactly the current PO Schedule + Category concept: rolling actual dates,
`Overdue` above the days, zero-count configured days still visible, multi-select filters, URL state,
no new Queue/Status/Settings block.

The grid becomes the approved hierarchy:

```text
Item · Description              Qty Needed · Ready Stock · On PO · To Buy
  └─ variant (size / fabric / colour)
       └─ SO No · Customer · Customer Delivery · Qty · Coverage · Supplier
```

- `To Buy` is printed, server-derived and never editable.
- shortage floats; `To Buy = 0`, fully-on-PO and blocked demand are visible as receipts/explanation
  when reached from a scoped SO but are never selectable;
- selection is at build/shortage grain; parent selection cycles none/partial/all;
- mattress, bedframe, pillow and protector group by item;
- sofa groups by Sales Order; selecting one module selects the complete same-SO matched set;
- a single-variant item may render two levels rather than an empty middle level;
- customer date missing, supplier missing and production days missing name the fact and cannot be
  selected; the fixing writer remains its owning module;
- Ready Stock is only an offer. The existing `Reserve` act remains human and server-recomputed;
- current search, column filters, sorting, footer, horizontal grid overflow and PO links survive;
- no Sales Orders child mini-table and no Unit ID column.

Refactor the 2,800-line `OperationToOrder.tsx` into page-level components only where it reduces
duplicate state. The page remains one work surface; do not turn each hierarchy level into a card.

## 4 · Deliver To — default, change and split before Issue

The selection state exposes one compact arrangement table before the Issue action:

```text
ITEM / SKU          QTY      DELIVER TO
B1201S-K             10      Carres Klang ▾
CODY-Q                 1      AL Sungai Buloh ▾
SOFA-01                1      HOUZS ▾
```

Every selected unit defaults from `purchasing_default_destination()` and must resolve to the active
governed destination named `Carres Klang`. Normal buying requires no extra click.

`Split` appears only when quantity is greater than one:

```text
B1201S-K · Qty 11

Carres Klang       10
AL Sungai Buloh     1
                   ──
                   11 ✓
```

Rules:

- integer quantity at least 1; allocation total must equal the server's current `To Buy` qty;
- the same destination entered twice merges into one allocation row;
- removing a split returns its quantity to the original/default row;
- changing a sofa build applies to every module in that matched build;
- destination changes are visit-local until Issue; refresh restores the fresh server plan and
  default rather than pretending a draft PO exists;
- different destinations create separate lines inside the same supplier PO, never separate POs;
- the PO header keeps `Carres Klang` as default; only exception lines store an override;
- no Warehouse transfer is inferred from a supplier delivery instruction;
- after Issue, every destination change uses §4 Purchase Order edit/revision law and cannot be
  performed here.

Use governed `Select`, `Input`, `Button`, inline validation and row/disclosure components. Do not
open a second sidebar, nested window or permanent third header band. This pre-Issue arrangement is
not a formal PO object and therefore does not use the 50%/50% Object Detail PDF layout.

## 5 · Shared plan contract

Extend `packages/shared/src/to-order.ts` and `packages/shared/src/to-order.test.ts` with one explicit
allocation model; do not create a second arithmetic file:

```ts
interface DestinationAllocation {
  sourceLineId: string;
  qty: number;
  destinationId: string;
}

interface IssueDocument {
  key: string;
  include: boolean;
  buildKeys: string[];
  destinationAllocations: DestinationAllocation[];
}
```

The pure validation/plan functions must:

1. prove each allocation line belongs to an included build in that document;
2. prove exact integer totals per current source line;
3. reject unknown/duplicate source lines, unknown builds, duplicate builds, empty documents,
   merged sofa SOs and batches over the existing maximum;
4. default every selected source line to the governed default destination;
5. group output PO lines by SKU + configuration + effective destination, not SKU alone;
6. preserve source SO references and sofa one-PO-per-SO construction;
7. remain deterministic regardless of selection order.

Write failing unit tests for default, whole-line change, 10/1 split, duplicate-destination merge,
under/over allocation, stale qty, sofa modules and mixed suppliers before changing the planner.

## 6 · API and one creation authority

Update `apps/api/src/routes/operation/to-order.ts` and its tests:

- the Issue body carries destination allocations per document, not one client-trusted header
  destination;
- reload the current demand plan and active destination registry before validating;
- compute the default destination on the server; never trust a client label/default;
- validate every allocation against current source-line quantity;
- continue grouping by governed supplier/category/SO rules;
- call only `purchasing_issue_pos_batch(jsonb)`; no compatibility endpoint or direct insert;
- return created PO ids with supplier/destination summary so the UI can show the exact documents;
- keep current per-supplier progress/retry behaviour: a completed supplier group is never issued
  twice, and a failed group remains named and retryable.

### Price boundary

Delete the Operations commercial-decision review from `OperationToOrder.tsx` and the Issue body.
The Issue route reads the latest Catalog cost immediately before creation:

- known positive cost → snapshot it on the PO line;
- missing/changed cost → Issue continues with cost explicitly unknown; only an authorised
  Purchase Order/Finance surface may later resolve it, and this Card creates no Operations action
  or new AP model;
- Operations never sees price, types price, chooses FOC or receives `stale_catalog_cost`;
- no write silently updates Catalog.

Add negative tests proving a missing cost and a cost changed after page load both still issue, while
supplier mismatch, invalid destination, stale demand, invalid quantity and missing pickup partner
still refuse by name.

## 7 · Migration and database invariants

Create a new migration numbered from the maximum of production tracker, repository and every branch
at execution time. Never edit 0311/0337/0361.

Extend the existing authority in place so each line payload may carry `destination_id` and the
constructor writes the line override atomically with PO creation. Preserve:

- operation/principal gate and `SECURITY DEFINER` search path;
- one advisory lock and one transaction;
- supplier/SKU/destination validation;
- PO number allocator;
- Unit minting and demand-thread conflict protection;
- PO purpose, SO references, partner, ETA, History and audit;
- revocation of every legacy/direct PO creation authority.

The current `po_lines_sku_attrs_uniq` index ignores destination while
`purchasing_split_line_destination` creates a second same-SKU/config line. Measure the deployed
schema with a rolled-back split negative control. The migration must make duplicate protection
destination-aware so exactly one SKU/config/effective-destination line is allowed while two real
destinations are allowed. Because replacing an existing index is governed destructive DDL, obtain
the repository-required explicit migration approval immediately before applying it; this is a
deployment gate, not an Owner operating-model decision.

Also update the creation RPC's cost validation so unknown cost is allowed and recorded honestly.
Do not invent a fake zero. Preserve explicit FOC/history on existing POs, but remove it from the
Operations Issue decision.

Migration verification must run inside a rollback and prove:

1. default-only issue writes header Carres Klang and null line overrides;
2. 10 Klang + 1 AL creates one PO with two lines and effective destinations 10/1;
3. invalid/inactive destination and allocation mismatch roll back the whole PO;
4. two operators cannot double-issue the same demand;
5. direct authenticated calls to legacy functions/table INSERT still fail;
6. missing cost creates the PO with unknown cost, never zero;
7. existing PO destination set/split/revision functions continue to work.

## 8 · UI state, feedback and next document

Modify `apps/web/src/pages/operation/OperationToOrder.tsx` and
`apps/web/src/pages/operation/OperationToOrder.test.tsx`; extract focused components/tests if the
page would otherwise grow further.

The selected Toolbar replaces the normal Toolbar in the same height. Opening the arrangement keeps
the grid position. Issue is disabled only for a named demand/destination/partner/quantity blocker,
never for price.

During Issue, disable repeat submission. On success, rows update in place and show formal results:

```text
PO-2041 is ready
Open PO-2041 and share its PDF with Nice Future.
```

The PO number is the door to Purchase Orders with that document open. Do not add a second PDF,
email or WhatsApp sender here. Purchase Orders owns `shared_at`, the document snapshot, later
supplier-date calls and revision rules. Do not label the PO `Acknowledged`; sharing the issued PDF
means it was ordered unless the supplier later reports a model/fabric/date exception.

Ordinary success uses the governed toast tray without moving the grid. Business blockers remain
inline beside the affected document/line. A partial supplier-group failure names the supplier and
keeps `Retry`; it never returns already-created groups to the selection.

## 9 · Tests and regression boundary

Required targeted suites:

```bash
pnpm --filter @carres/shared test -- to-order
pnpm --filter @carres/api test -- to-order purchase-demands
pnpm --filter @carres/web test -- OperationToOrder OperationPurchaseDemands OperationPurchaseOrders OperationApp PurchasingTabs PortalSidebar
```

Then run the exact release gate from `docs/ENGINEERING.md`, `git diff --check`, migration guards,
and `check:v4`.

Keep tests for every current capability this rewrite can accidentally erase:

- actual-date PO Schedule, Overdue and category multi-filter;
- search, per-column filters, sorting, totals, narrow-width horizontal scroll;
- server preselection plus human deltas after refetch;
- reserve-ready-stock offer and server recomputation;
- recent issued PO rows and PO deep links;
- missing customer date/supplier/production days blockers;
- factory-pickup procurement partner;
- no Manual Purchase typed demand in this grid;
- one Issue authority and no old Orders/Delivery/PO-register Issue door.

## 10 · Production acceptance

Authenticated owner walk at 1440×900 and 1130×820 on real representative demand:

1. Header matches Sales Orders; sidebar BUY and exactly one active state are correct.
2. PO Schedule prints weekday + date, never Today/Tomorrow.
3. Hierarchy groups an ordinary repeated SKU by item and a sofa by Sales Order.
4. Qty Needed, Ready Stock, On PO, To Buy and every SO/customer leaf reconcile.
5. Only shortage is selectable; sofa set selection is atomic.
6. Default Issue needs no Deliver To click and produces Carres Klang.
7. Whole-line change and 10/1 split show correct totals and create one supplier PO with correct
   effective line destinations.
8. Missing/changed price does not appear and does not stop Issue.
9. Repeated click cannot double issue; stale quantity/destination refuses with the fix.
10. Success names the created PO and opens Purchase Orders; there is no duplicate PDF/send flow.
11. Existing Purchase Demands Register remains no-Issue.
12. No console error, no clipped business value and no new UI component outside the kit.

**Done means merged, deployed and production verified.** Record exact SHA, Worker/pages convergence,
screenshots and measured current behaviour in `docs/purchasing/MASTER.md`; mark this Card
`EXECUTED`. Do not declare Purchasing complete merely because these two pages shipped: the MASTER's
other approved but unbuilt Purchasing objects remain separate scopes.

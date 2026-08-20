STATUS: QUEUED
DATE: 2026-08-20
PR: pending
IMPLEMENTATION: APPROVED TARGET — build and deliver autonomously; no Owner Decision remains

# PURCHASE DEMANDS — the complete customer-demand Register

【TAB】 — CARD-2026-08-20-purchase-demands · Show every customer buying demand, its coverage and the exact reason it cannot be bought

**Owns:** the new `Purchase Demands` Listing destination and its read model.

**May touch:** the shared customer-demand read engine, Purchasing header/router/sidebar wiring,
Register UI, its tests, governed copy, and the Purchasing MASTER closure record.

**Must not touch:** `Issue PO`, PO construction, PO destination writes, Manual Purchase,
Purchase Orders, Receiving, Stock writers, Sales Order writers, supplier/Settings editors, or the
SO Batch Purchase arrangement UI. Those remain behind their existing doors.

Read on latest `origin/main`: `CLAUDE.md` → `docs/ERP-ARCHITECTURE.md` →
`docs/purchasing/MASTER.md` §1/§2/§3 → `docs/orders/MASTER.md` current Blueprint boundary →
`docs/stock/MASTER.md` demand/coverage seam → `docs/ui/MASTER.md` Shell + Register Template →
`docs/COPY-STANDARD.md` and `docs/ACTION-FLOW-STANDARD.md`. This is a BUILD/DELIVERY Card:
implement → test → self-review → PR → CI → merge → deploy → authenticated production walk →
overwrite measured current truth in the Purchasing MASTER. Do not return engineering choices to
the Owner.

## 1 · Result and page boundary

Make the existing sidebar row live:

```text
Purchasing
└─ BUY
   ├─ Purchase Demands       ← this Card
   ├─ SO Batch Purchase      ← unchanged by this Card
   └─ Purchase Orders
```

`Purchase Demands` answers one question:

> What customer goods need buying, what already covers them, and what must be fixed before they
> can be bought?

It is an authoritative Register over the same server recomputation used by SO Batch Purchase. It
does not persist another demand remainder. It has no checkbox that can issue a PO, no `Issue PO`
button, no draft PO and no copy of a Sales/Catalog/Settings writer.

## 2 · Route, shell and navigation

- `apps/web/src/pages/portal/portal-nav.ts`: remove `soon: true` from `purchase-demands`; keep its
  existing key, label, BUY group and order. Its governed address is
  `/operation?tab=purchase-demands`.
- `apps/web/src/pages/operation/OperationApp.tsx`: mount `OperationPurchaseDemands` for exactly
  that tab, suppress the duplicate global top bar exactly like the other Purchasing pages, and
  preserve every existing URL-driven route.
- `apps/web/src/pages/operation/PurchasingTabs.tsx`: admit `purchase-demands` and resolve the
  Destination Header word from the same sidebar-approved label. Header geometry is the Sales
  Orders header: 50px, 24px word, no icon, no `Purchasing ·` prefix, no tabs.
- Update `apps/web/src/pages/portal/purchasing-sidebar.test.ts`,
  `apps/web/src/pages/portal/PortalSidebar.test.tsx`,
  `apps/web/src/pages/operation/PurchasingTabs.test.tsx` and
  `apps/web/src/pages/operation/OperationApp.test.tsx` before implementation. Prove the row is a
  real link, BUY opens automatically, exactly one active indication exists in all rail states,
  and the correct page renders after refresh/back/forward.

No second Purchasing sidebar, module tab, breadcrumb, KPI strip or page title is allowed.

## 3 · One shared demand read, two projections

The current customer-demand recomputation is trapped inside
`apps/api/src/routes/operation/to-order.ts`. Extract its reads and engine assembly without changing
the arithmetic:

- create `apps/api/src/lib/purchase-demand-read.ts` for the current `loadToOrder` read and its
  private read helpers;
- keep `GET /api/operation/purchase/to-order` byte-compatible by making it call that shared read;
- create `apps/api/src/routes/operation/purchase-demands.ts` and mount
  `GET /api/operation/purchase/demands` in `apps/api/src/index.ts`;
- create `packages/shared/src/purchase-demands.ts`, export it from
  `packages/shared/src/index.ts`, and put the Register response schema plus pure grouping/filter
  functions there.

The Register endpoint returns one deterministic response containing:

```text
item/model · variant · category · SKU · source order line/build
SO No · customer · customer delivery · supplier
Qty Needed · Ready Stock · On PO (+ PO numbers) · To Buy
Coverage · blocker · owning-object href
```

The server must retain every customer line in one of six derived states once a positive Catalog
category either includes or excludes it:

```text
Ready to buy
Customer delivery date missing
SKU not found
Supplier not assigned
Production days missing
Covered — no buying needed
```

Do not manufacture a stored status. The state is recomputed from current Sales Order, Catalog,
Stock, open PO and Purchasing Settings facts. A Catalog SKU positively classified as Service or
another non-procurable category remains outside this Register. A sold SKU absent from Catalog is
not silently assumed to be Service: it remains visible as `SKU not found`, because Catalog is the
only authority able to decide what it is. A procurable SKU with missing supplier may never
disappear into `unresolved[]` with too little information to identify it.

### Required API tests first

Add `apps/api/src/routes/operation/purchase-demands.test.ts` and extend
`apps/api/src/routes/operation/to-order.test.ts`:

1. the two endpoints call the same arithmetic/read core;
2. the existing To Order response and Issue behaviour do not drift;
3. a sold SKU absent from Catalog remains visible as `SKU not found`; a Catalog Service SKU is
   positively excluded;
4. a supplier-less mattress/bedframe/sofa returns its line id, model/SKU, qty, SO, customer and
   customer date as `Supplier not assigned`;
5. a dateless Sales Order remains visible but is not ready to buy;
6. missing production days block only the affected supplier/category;
7. fully and partly covered demand state the exact stock/PO coverage and PO numbers;
8. cancelled/non-live SO lines and positively non-procurable categories stay out;
9. operation/principal are admitted and every external role is refused by the existing guard;
10. no write occurs while reading the Register.

## 4 · Register composition

Create:

- `apps/web/src/pages/operation/OperationPurchaseDemands.tsx`
- `apps/web/src/pages/operation/OperationPurchaseDemands.test.tsx`

Apply the shared Register Template top to bottom:

```text
Purchase Demands                            Jump to…  Alerts  Help  Settings
────────────────────────────────────────────────────────────────────────────
View: All demands   [Search purchase demands…]             Export ▾  Columns
────────────────────────────────────────────────────────────────────────────
WORK TO DO      │ Item · Description     Qty Needed  Ready Stock  On PO  To Buy
Ready to buy    │   └─ variant
No customer date│       └─ SO No · Customer · Customer Delivery · Qty ·
No SKU          │           Coverage · Supplier
No supplier     │           Coverage · Supplier
No production days│
Covered         │
────────────────────────────────────────────────────────────────────────────
                │ N demand lines · N units needed · N units to buy
```

The 200px left rail is page-owned filtering, not portal navigation. It uses the existing
`NavRow` geometry and names concrete facts; it must not say `Today`, `Tomorrow`, `Needs attention`,
`Follow up`, `Pending` or `Waiting`. Multi-select rail filters are allowed; URL query parameters
must preserve the chosen view on refresh/share/back.

The centre is a real Register:

- one search over SO, customer, model, SKU, supplier and PO number;
- content-matched per-column filters and sort;
- Columns and Export through existing kit powers;
- 36px table header, 38px parent row, flat dividers, 32px fixed footer;
- item/model parent → variant → SO/customer leaves;
- shortages first; `To Buy` printed and never editable;
- mattress/bedframe/pillow/protector group by item; sofa keeps one customer's matched set together;
- a single-variant item may collapse directly to the SO/customer level;
- a PO number opens Purchase Orders; an SO number opens the Sales Order; no copied editor;
- no Unit ID column: Stock has not created/allocated a Unit merely because demand exists;
- no `Deliver To` editor: pre-Issue arrangement belongs to SO Batch Purchase, final truth to PO.

The Register may show the governed compact two-line fact/help treatment:

```text
Customer delivery date is missing
[SH] Ask customer for a delivery date

SKU not found
[YJ] Add this item to the SKU catalog

Supplier not assigned
[YJ] Check the supplier for B1201S

Production days are missing
[JL] Add production days for Nice Future · Mattress
```

`[SH]`, `[YJ]` and `[JL]` illustrate the separate resolved-owner avatar chip; the person's name is
not sentence text. Owner rules are Responsible Salesperson for the customer date, current PO Duty
for SKU/supplier preparation, and the authorised Purchasing Settings holder for production days.
The complete action stays in the shared Work Engine; the Register does not create a page-local
action/status store.

## 5 · Handoff to SO Batch Purchase

The normal Toolbar carries one navigation door: `Open SO Batch Purchase`. It opens the existing
workspace and does not issue anything. A ready leaf may expose the same door in its row disclosure
with the SO scope in the URL; blocked/covered leaves do not pretend they can be bought.

Card 2 may later add a selected-demand entrance, but this Card must not invent a stored batch or
make Register selection a prerequisite. The scheduled Batch workspace remains independently usable.

## 6 · Copy and accessibility

Add only the missing approved strings to `docs/COPY-STANDARD.md` in the same implementation PR;
then keep the runtime words in one shared constant, not scattered JSX. Required visible words are:

```text
Purchase Demands · Search purchase demands… · Work to do
Ready to buy · Customer delivery date is missing · SKU not found · Supplier not assigned
Production days are missing · Covered — no buying needed
Open SO Batch Purchase · No purchase demands.
```

Use primary-school English. Every blocker is two lines: fact first, smaller help/action second.
Rows, expand controls, links, filters and rail toggles require keyboard focus, visible focus,
accessible names and no hover-only information. PO coverage hidden visually in a compact cell must
remain available to keyboard and screen-reader users.

## 7 · Non-goals and frozen truths

- no application writer and no migration;
- no `Issue PO`, `Send PO`, price, FOC or approval;
- no Manual Purchase demand;
- no auto-reservation of Ready Stock;
- no second demand arithmetic or supplier resolution rule;
- no change to PO Schedule, expected-arrival arithmetic, Purchase Orders, Receiving or Claims;
- no `Needs attention`, Priority or generic Next Action column;
- no 50/50 document preview: this is a Register, not a formal object detail.

## 8 · Release and acceptance gate

Targeted tests:

```bash
pnpm --filter @carres/shared test -- purchase-demands to-order
pnpm --filter @carres/api test -- purchase-demands to-order
pnpm --filter @carres/web test -- OperationPurchaseDemands OperationToOrder OperationApp PurchasingTabs purchasing-sidebar PortalSidebar
```

Then run the repository release gate from `docs/ENGINEERING.md`, `git diff --check`, and
`check:v4`. Production owner walk at 1440×900 and 1130×820 must prove:

1. sidebar → BUY → Purchase Demands is live and exactly one row is active;
2. full and narrow header match Sales Orders;
3. each of the six derived states can be found without Today/Tomorrow/generic attention words;
4. hierarchy, search, filters, Columns, Export and footer work;
5. blocked supplier/date/production cases remain visible and explain the fix;
6. SO and PO links open their owner;
7. there is no Issue/price/editor on the page;
8. opening SO Batch Purchase still reaches the existing, unchanged Issue workspace;
9. no console error and no horizontal clipping outside the governed grid overflow.

**Done means production verified, not code complete.** Record the deployed SHA, screenshots and
measured current page in `docs/purchasing/MASTER.md`; change this Card to `EXECUTED`. Do not mark
the SO Batch Purchase Card complete from this work.

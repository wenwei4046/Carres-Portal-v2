# PURCHASING — CARD 01 · FIX SIDE MENU TO THE FINAL 4-GROUP / 11-PAGE LISTING

**Module:** Purchasing · **Sequence:** 01
**Owner authority:** `docs/purchasing/MASTER.md` — approved / locked 2026-08-22
**Status:** EXECUTED — built, gated and locally walked 2026-08-22; production proof in §11
**Lane:** BUILD / DELIVERY
**Base:** local `main` containing Purchasing Blueprint commit `7de0a27a`

> **For the build agent:** read `CLAUDE.md`, `docs/purchasing/MASTER.md` §§4, 8–9,
> `docs/ui/MASTER.md` §§4.1–4.2 and `docs/COPY-STANDARD.md` Purchasing words first.
> Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` as required by the
> selected execution method. Engineering chooses the method and completes the normal repository
> delivery gates without asking the owner to choose technical mechanics.

---

## 1 · Outcome

Keep the shipped Purchasing module accordion, rounded-elbow wire grammar, active indication and
232px/60px Portal Sidebar. Replace only its obsolete contents with the final approved map:

```text
Purchasing ▾
├─ BUY ▾
│  ├─ SO Batch Purchase
│  ├─ Manual Purchase
│  └─ Purchase Orders
├─ RECEIVE ▾
│  └─ Goods Receipts
├─ PROBLEMS ▾
│  ├─ Supplier Claims
│  ├─ Purchase Returns                  Coming soon
│  └─ Repair Orders                     Coming soon
└─ SHOWROOM ▾
   ├─ Display Requests                  Coming soon
   ├─ Consignment Orders                Coming soon
   ├─ Consignment Returns               Coming soon
   └─ Consignment Sale Notices          Coming soon
```

Exactly 4 group headers and exactly 11 page rows render. No direct row, Report row or hairline
renders above/below the groups.

## 2 · Current defect → approved correction

| Current production rail | Why it is wrong | Approved correction |
|---|---|---|
| 5 groups and 18 page rows | It carries an earlier Blueprint that the owner rejected | 4 groups and 11 page rows from Purchasing MASTER §4 |
| `Purchasing Home` | Registers and central reports already own the useful summary | Delete the row; do not replace it |
| `My Purchasing Work` | Shared My Work / Team Work owns all action truth | Delete the row; do not replace it |
| `REQUESTS` | Supplier/SKU blockers are in-context Catalog governance; Display belongs to showroom | Delete the group |
| `New Supplier Requests` / `New SKU Requests` | They are not permanent Purchasing destinations | Delete both rows |
| `Manual Purchase Requests` under REQUESTS | Final operator door is one internal buying record | Rename to `Manual Purchase`; move to BUY |
| `Purchase Demands` | `purchase_demand` is hidden canonical truth, not a staff destination | Delete the sidebar / Jump To row |
| `CONSIGNMENT` | Final grouping includes bought and supplier-owned showroom work | Rename to `SHOWROOM` |
| `Consignment Overview` | Stock/Register reports already own the overview | Delete the row |
| `Consignment Receipts` | `Goods Receipts` is the one physical receipt engine | Delete the row |
| `Report` and hairline | Reports are central/Register exports | Delete both from Purchasing rail |

This is **RESOLVED FROM AUTHORITY**. No new business decision is open.

## 3 · Preserved without change

- `Purchasing` remains an icon + name + chevron module row.
- Clicking the Purchasing parent toggles the tree without changing the URL.
- More than one Purchasing group may remain open.
- The group containing the current destination opens automatically and cannot hide that destination.
- Open tree: exactly the current child is blue; group and parent remain neutral.
- Closed tree on a Purchasing destination: the Purchasing parent is blue.
- 60px rail on a Purchasing destination: the one Purchasing icon is blue.
- The 60px icon permanently links to `SO Batch Purchase` at `/operation?tab=purchase`.
- One module opens at a time; per-user presentation memory remains isolated.
- 232px expanded width, 60px collapsed width, wire/elbow geometry, scrolling and tokens remain.
- No destination icons; `Coming soon` stays a non-control with no href/focus/badge.
- All live addresses remain:

| Visible page | Address |
|---|---|
| SO Batch Purchase | `/operation?tab=purchase` and active alias `/operation/to-order` |
| Manual Purchase | `/operation?tab=manual-purchase` |
| Purchase Orders | `/operation/procurement` |
| Goods Receipts | `/operation?tab=receiving` |
| Supplier Claims | `/operation?tab=claims` |

## 4 · Explicit scope boundary

This Card changes navigation and the matching Manual Purchase destination header only.

It does **not** delete or redesign the existing `OperationPurchaseDemands` or
`OperationPurchasingReport` page body/route. Those legacy direct URLs may remain reachable for now,
but neither page appears in the Portal Sidebar or Jump To because neither is a final destination.
Their later capability convergence is not part of this Card.

Do not touch:

```text
apps/api/**
packages/shared/**
supabase/**
Purchasing Register/page body/forms/left 200px rails
Purchase demand arithmetic or database truth
PO, Receiving, Claim, Return, Repair or Consignment workflow
Quick Rail, Work Engine, Calendar, PDF or document numbers
Sales, Delivery, Warehouse or Finance navigation
```

No migration, API or production-data change is allowed.

## 5 · File map

| File | Responsibility in this Card |
|---|---|
| `apps/web/src/pages/portal/portal-nav.ts` | final 11 Purchasing page rows, order, words, routes and `soon` truth |
| `apps/web/src/pages/portal/purchasing-sidebar.ts` | final four group keys/labels, grouping, landing key and versioned presentation state |
| `apps/web/src/pages/portal/purchasing-sidebar.test.ts` | pure contract for group/page order, live routes, removed rows and state parsing |
| `apps/web/src/pages/portal/PortalSidebar.tsx` | only the minimal type/storage-key adaptation required by the final group contract; no renderer redesign |
| `apps/web/src/pages/portal/PortalSidebar.test.tsx` | DOM, interaction, active, 60px, memory and non-control regression |
| `apps/web/src/pages/operation/PurchasingTabs.tsx` | `Manual Purchase` destination-header word only; legacy hidden-page words stay with their legacy pages |
| `apps/web/src/pages/operation/PurchasingTabs.test.tsx` | exact Manual Purchase and Goods Receipts destination headers |
| `apps/web/src/pages/operation/components/JumpTo.test.tsx` | final live Purchasing destinations only; removed rows absent |
| `docs/cards/CARD-2026-08-22-purchasing-01-final-sidebar-listing.md` | execution record, gates, PR/deploy proof and owner-walk evidence |

`docs/purchasing/MASTER.md`, `docs/ui/MASTER.md`, `docs/COPY-STANDARD.md` and
`docs/ERP-ARCHITECTURE.md` already contain final truth. The implementation must conform to them;
do not append another design version.

## 6 · Interfaces

### Final group contract

```ts
export type PurchasingPageGroupKey =
  | "purchasing-buy"
  | "purchasing-receive"
  | "purchasing-problems"
  | "purchasing-showroom";

export const PURCHASING_PAGE_GROUPS = [
  { key: "purchasing-buy", label: "BUY" },
  { key: "purchasing-receive", label: "RECEIVE" },
  { key: "purchasing-problems", label: "PROBLEMS" },
  { key: "purchasing-showroom", label: "SHOWROOM" },
] as const;

export const PURCHASING_LANDING_KEY = "purchase";
```

### Presentation-state version

The allowed group keys change, so do not read the old five-group preference as final truth. Use:

```ts
export interface PurchasingSidebarStateV2 {
  moduleOpen: boolean;
  openGroups: ReadonlyArray<PurchasingPageGroupKey>;
}

carres:portal-sidebar:purchasing:v2:{auth-user-id}
```

- Do not delete the old `v1` localStorage key; the new code simply does not read it.
- Persist only human parent/group toggles.
- Do not persist route, active key, counts, actions or business facts.
- Missing/malformed/old JSON falls back safely.
- A route-derived active group still wins over stored closed state.

### Final `portal-nav.ts` page membership

```ts
// BUY
purchase             → SO Batch Purchase      → LIVE → purchasing-buy
manual-purchase      → Manual Purchase        → LIVE → purchasing-buy
purchase-orders      → Purchase Orders        → LIVE → purchasing-buy

// RECEIVE
receiving            → Goods Receipts         → LIVE → purchasing-receive

// PROBLEMS
claims               → Supplier Claims        → LIVE → purchasing-problems
purchase-returns     → Purchase Returns       → soon → purchasing-problems
repair-orders        → Repair Orders          → soon → purchasing-problems

// SHOWROOM
display-requests             → Display Requests             → soon → purchasing-showroom
consignment-orders           → Consignment Orders           → soon → purchasing-showroom
consignment-returns          → Consignment Returns          → soon → purchasing-showroom
consignment-sale-notices     → Consignment Sale Notices     → soon → purchasing-showroom
```

The order above is the rendered order. Do not sort alphabetically.

---

## 7 · Build tasks

### Task 1 · Lock the final navigation contract with failing tests

**Files:**

- Modify: `apps/web/src/pages/portal/purchasing-sidebar.test.ts`
- Modify: `apps/web/src/pages/portal/PortalSidebar.test.tsx`
- Modify: `apps/web/src/pages/operation/components/JumpTo.test.tsx`

- [ ] Replace the old five-group assertions with the exact four-group contract.
- [ ] Assert all 11 rows in exact order and exact group membership.
- [ ] Assert the five live routes byte-for-byte.
- [ ] Assert the six planned rows are unfocusable `Coming soon` non-controls.
- [ ] Assert these retired rows are absent from the Purchasing tree and Jump To:

```ts
const retired = [
  "purchasing-home",
  "purchasing-work",
  "new-supplier-requests",
  "new-sku-requests",
  "purchase-demands",
  "consignment-overview",
  "consignment-receipts",
  "purchasing-report",
];
```

- [ ] Assert no Purchasing hairline remains.
- [ ] Run the focused tests and prove they fail against the old 18-row implementation.

Minimum pure-contract assertion:

```ts
expect(PURCHASING_PAGE_GROUPS.map((group) => group.label)).toEqual([
  "BUY",
  "RECEIVE",
  "PROBLEMS",
  "SHOWROOM",
]);

expect(group("purchasing-buy")).toEqual([
  "SO Batch Purchase",
  "Manual Purchase",
  "Purchase Orders",
]);
expect(group("purchasing-receive")).toEqual(["Goods Receipts"]);
expect(group("purchasing-problems")).toEqual([
  "Supplier Claims",
  "Purchase Returns",
  "Repair Orders",
]);
expect(group("purchasing-showroom")).toEqual([
  "Display Requests",
  "Consignment Orders",
  "Consignment Returns",
  "Consignment Sale Notices",
]);
```

### Task 2 · Replace the obsolete page/group data

**Files:**

- Modify: `apps/web/src/pages/portal/portal-nav.ts`
- Modify: `apps/web/src/pages/portal/purchasing-sidebar.ts`
- Modify only if required by the V2 type/key: `apps/web/src/pages/portal/PortalSidebar.tsx`

- [ ] Delete all eight retired `PortalNavItem` rows. Do not hide them with another flag.
- [ ] Replace the five group keys/labels with the four-group interface in §6.
- [ ] Move `display-requests` into `purchasing-showroom`.
- [ ] Rename `Manual Purchase Requests` to `Manual Purchase`, move it into BUY and place it after
      `SO Batch Purchase`.
- [ ] Preserve all five live routes and `SO Batch Purchase.activeFor` exactly.
- [ ] Keep the six approved-but-unbuilt pages as `soon: true` non-controls.
- [ ] Remove stale comments that describe direct Home/Work/Report rows, REQUESTS, five groups,
      eighteen destinations or a future Purchasing Home landing change.
- [ ] Keep `PURCHASING_LANDING_KEY = "purchase"` permanent.
- [ ] Change presentation storage/type to V2; update renderer imports/types without changing its
      accordion/geometry algorithm.
- [ ] Remove only imports that become unused; do not refactor unrelated Portal nav data.
- [ ] Run focused tests and prove Task 1 now passes.

### Task 3 · Correct the destination header and protect other modules

**Files:**

- Modify: `apps/web/src/pages/operation/PurchasingTabs.tsx`
- Modify: `apps/web/src/pages/operation/PurchasingTabs.test.tsx`
- Modify: `apps/web/src/pages/portal/PortalSidebar.test.tsx`

- [ ] Change the visible `manual-purchase` header word to `Manual Purchase`.
- [ ] Keep the approved Destination Header: 50px, 24px title, no leading icon, no
      `Purchasing ·` prefix.
- [ ] Keep `Goods Receipts`, `SO Batch Purchase`, `Purchase Orders` and `Supplier Claims` unchanged.
- [ ] Do not change the legacy hidden page bodies/routes or their own header words.
- [ ] Prove Sales, Delivery, Warehouse, Finance, collapsed rail, role visibility, badges and
      Settings regressions still pass.

Expected header assertion:

```ts
renderAt("/operation?tab=manual-purchase");
expect(screen.getByTestId("purchasing-tabs")).toHaveTextContent("Manual Purchase");
expect(screen.getByTestId("purchasing-tabs")).not.toHaveTextContent(
  "Manual Purchase Requests",
);
```

### Task 4 · Prove interaction, memory and active-indication laws

**Files:**

- Modify: `apps/web/src/pages/portal/purchasing-sidebar.test.ts`
- Modify: `apps/web/src/pages/portal/PortalSidebar.test.tsx`

- [ ] Prove all four group headers are full-width buttons with `aria-expanded`.
- [ ] Prove more than one group can remain open.
- [ ] Prove the active group opens itself and cannot be closed while its current page is visible.
- [ ] Prove open tree has exactly one active child and neutral parent/group.
- [ ] Prove closed tree moves the active indication to the Purchasing parent without changing URL.
- [ ] Prove 60px mode shows one active Purchasing icon linked to SO Batch Purchase.
- [ ] Prove V2 state is per signed-in user, safely parsed and contains only `moduleOpen` and
      `openGroups`.
- [ ] Re-run the same-mounted user A → user B regression with V2 and prove B does not inherit A's
      group state while B's current destination remains visible.
- [ ] Prove the old V1 key is not read, modified or deleted.

### Task 5 · Full gates, owner walk and autonomous delivery

**Focused tests:**

```bash
pnpm --filter @carres/web test -- \
  src/pages/portal/purchasing-sidebar.test.ts \
  src/pages/portal/PortalSidebar.test.tsx \
  src/pages/operation/PurchasingTabs.test.tsx \
  src/pages/operation/components/JumpTo.test.tsx
```

**Repository gates:**

```bash
pnpm --filter @carres/web test
pnpm --filter @carres/web typecheck
pnpm --filter @carres/web lint
pnpm --filter @carres/web check:v4
pnpm --filter @carres/web build
```

- [ ] Run `git diff --check` and confirm only Card scope files changed.
- [ ] Perform the authenticated owner walk against real local rendering, not a static mock.
- [ ] Capture these four screenshots:

```text
1. 1440px · Purchasing open · all four group headers visible · BUY + SHOWROOM open
2. 1130px · Manual Purchase active · BUY forced open · exactly one blue child
3. 1130px · Goods Receipts active · RECEIVE forced open · exactly one blue child
4. 60px rail · Purchasing icon active · link is /operation?tab=purchase
```

- [ ] Assert in the rendered DOM: 4 groups, 11 page rows, 0 retired rows, 0 Report hairline, exactly
      one active indication and no destination icons.
- [ ] Record screenshot paths and measured results in this Card.
- [ ] Self-review against `docs/purchasing/MASTER.md` §4 and fix any drift found.
- [ ] Follow the repository's normal PR, CI, merge, deploy and authenticated production-SHA proof.
- [ ] Production-walk the same four states after deployment and record the proof here.
- [ ] Do not ask the owner to choose branch strategy, test batching, merge mechanics or deployment.

---

## 8 · Acceptance boundary

The Card is complete only when all are true:

- [ ] Purchasing renders exactly the final 4 groups / 11 rows.
- [ ] The exact row order matches Purchasing MASTER §4.
- [ ] The five current pages remain live at their unchanged addresses.
- [ ] The six future pages say `Coming soon` and are not controls.
- [ ] Every retired row is absent from the Sidebar and Jump To; no hairline remains.
- [ ] Manual Purchase rail and Destination Header use the same exact word.
- [ ] Parent/group/child/collapsed active behaviour remains exactly one visible indication.
- [ ] Existing accordion, wire/elbow geometry, dimensions, per-user memory and named landing hold.
- [ ] No Purchasing page body, 200px local rail, business workflow, API, database, PDF, Quick Rail or
      Work Engine changed.
- [ ] Focused/full gates, CI, deployment proof and authenticated production walk pass.

## 9 · Failure conditions

The Card fails if any of these occurs:

- any fifth Purchasing group or twelfth page row;
- Home, module Work, Purchase Demands, New Supplier/New SKU, Consignment Overview/Receipts or Report
  remains visible in the Purchasing rail or Jump To;
- `Manual Purchase Requests`, `REQUESTS` or `CONSIGNMENT` remains visible;
- an unbuilt row becomes a link, focus stop, badge or fake page;
- a live route/key changes;
- the collapsed Purchasing icon derives its destination from first-row order;
- clicking Purchasing navigates instead of toggling;
- opening one group closes another;
- active destination can be hidden, two rows are blue or no row is blue on an approved destination;
- a second sidebar, flyout, tab strip, child icon, heavy box/card/shadow or new UI grammar appears;
- a Purchasing page body/workflow or another module changes;
- old V1 presentation data is treated as business truth;
- merge/deploy happens without the required tests, production SHA proof and authenticated walk.

## 10 · Paste-to-Claude execution handoff

```text
PURCHASING — CARD 01 · FIX SIDE MENU TO THE FINAL 4-GROUP / 11-PAGE LISTING

Work in /Users/chaichiewlim/Desktop/Carres-Portal-v2 from local main containing commit 7de0a27a.
Read CLAUDE.md, docs/purchasing/MASTER.md, docs/ui/MASTER.md §4.2,
docs/COPY-STANDARD.md Purchasing words, then execute:
docs/cards/CARD-2026-08-22-purchasing-01-final-sidebar-listing.md

This Card owns only the Purchasing Portal Sidebar listing, its tests, the Manual Purchase
Destination Header word and required delivery evidence. Do not change Purchasing page bodies,
business workflow, API, database, PDF, Quick Rail, Work Engine or another module. Follow the
repository's autonomous BUILD/DELIVERY gates through production verification. Do not ask me to
choose engineering mechanics. Report only a genuine business-rule conflict or governed production
approval that cannot be resolved from authority.
```

---

## 11 · Execution record — 2026-08-22

**Branch:** `claude/purchasing-01-final-sidebar-listing` · **Base:** local `main` `0f52e23c`

### 11.1 What changed

| File | Change |
|---|---|
| `apps/web/src/pages/portal/portal-nav.ts` | eight retired rows DELETED; `Manual Purchase Requests` → `Manual Purchase`, moved into BUY after `SO Batch Purchase`; `display-requests` moved to SHOWROOM; the `dividerAbove` hairline gone with `Report`; the stale five-group / eighteen-destination / Home-landing comments replaced |
| `apps/web/src/pages/portal/purchasing-sidebar.ts` | four group keys/labels; `PurchasingSidebarStateV1` → `V2`; storage key `:v1:` → `:v2:`; `PURCHASING_LANDING_KEY` kept `"purchase"` and documented as permanent |
| `apps/web/src/pages/portal/PortalSidebar.tsx` | type/import adaptation to `V2` and three stale comments only — no renderer, geometry or accordion algorithm change |
| `apps/web/src/pages/operation/PurchasingTabs.tsx` | `manual-purchase` destination word → `Manual Purchase`; every other word, key and route untouched |
| four test files | the contract above, plus the retired-row and V1/V2 regressions |

Deliberately NOT changed: `OperationPurchaseDemands`, `OperationPurchasingReport` and their
routes/words (§4 boundary), `apps/api/**`, `packages/shared/**`, `supabase/**`, every page body,
every 200px page rail, and every other module's navigation.

### 11.2 Gates

| Gate | Result |
|---|---|
| focused four files | **143 passed** (`purchasing-sidebar` 22 · `PortalSidebar` 97 · `PurchasingTabs` 6 · `JumpTo` 18) |
| `pnpm --filter @carres/web test` | **274 files / 3254 tests passed, 0 failed** |
| `typecheck` | clean |
| `lint` | `design-standard: no new violations`, guard stage 1 warn-only, exit 0 |
| `check:v4` | `v4-guard: clean.` |
| `build` | `✓ built in 9.36s` |
| `git diff --check` | clean; exactly the eight Card-scope source files + this Card + `docs/evidence/` |

**Task 1 failure proof:** with the new contract written and the old eighteen-row implementation
still in place, the run was `Test Files 4 failed | 270 passed` · `Tests 33 failed | 3221 passed` —
the 33 failures were confined to the four Card files, so nothing outside this scope depended on the
rows being deleted.

### 11.3 Owner walk — local, real rendering

Walked with Playwright at real viewports against the dev server rendering the REAL `PortalSidebar`,
the REAL stylesheet and the REAL `portal-nav.ts`. The signed-in identity was seeded rather than
typed (the live rail is behind a password), following the repository's existing
`src/dev/route-preview.tsx` precedent; the harness entry was transient and is not committed.

| # | Screenshot | Viewport / route | Measured in the rendered DOM |
|---|---|---|---|
| 1 | `docs/evidence/purchasing-01-sidebar/1-1440-purchasing-open.png` | 1440×900 · `?tab=purchase` · BUY + SHOWROOM open | rail **232px** · groups `BUY · RECEIVE · PROBLEMS · SHOWROOM` · 7 rows visible · **0** retired rows · **0** hairlines · **1** lit row (`nav-child-purchase`) · parent neutral · **0** destination icons · every `Coming soon` row a `SPAN` with no `href` and `tabindex="-1"` |
| 2 | `.../2-1130-manual-purchase-active.png` | 1130×900 · `?tab=manual-purchase` | BUY `aria-expanded=true` (forced), other three `false` · rows `SO Batch Purchase · Manual Purchase · Purchase Orders` · **1** lit row (`nav-child-manual-purchase`) · parent + group neutral |
| 3 | `.../3-1130-goods-receipts-active.png` | 1130×900 · `?tab=receiving` | RECEIVE `aria-expanded=true` (forced), other three `false` · row `Goods Receipts` · **1** lit row (`nav-child-receiving`) |
| 4 | `.../4-60px-rail-purchasing-active.png` | 60px rail · `?tab=receiving` | rail **60px** · the one Purchasing icon lit · `href="/operation?tab=purchase"` · no group, child or word rendered |

Retired-row sweep ran in all four states over
`purchasing-home · purchasing-work · new-supplier-requests · new-sku-requests · purchase-demands ·
consignment-overview · consignment-receipts · purchasing-report` — **absent in every one.**

The harness mounts the rail alone, so the right-hand area of each screenshot is empty canvas: it
proves the RAIL, not the page beside it. The page bodies are unchanged by this Card and the
destination header is proved by `PurchasingTabs.test.tsx`.

### 11.4 Self-review against `docs/purchasing/MASTER.md` §4

Every §4 rule holds in the built rail — the four drawers, the multi-open behaviour, the one visible
active indication in all three modes, the permanent 60px landing, the destination header format, and
the absence of Home, module Work, Purchase Demands, the two request pages, Consignment Overview and
Consignment Receipts.

🟡 **One honest gap, carried forward, not fixed here.** §4 says *"There is no Purchase Demands
page"*, and this Card's §4 boundary deliberately leaves `OperationPurchaseDemands` and
`OperationPurchasingReport` reachable at their direct URLs with their own header words. The rail and
Jump To no longer offer them, so no operator is sent there — but the pages still exist, so the
MASTER sentence is true of the NAVIGATION and not yet of the CODE. Retiring or converging those two
page bodies is its own scope and needs its own Card.

### 11.5 Delivery


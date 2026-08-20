【BUILD】 — CARD-2026-08-20-purchasing-sidebar-groups · Extend PR #861 with the complete Purchasing navigation tree

STATUS: OWNER APPROVED — local owner-walk build only; do not merge or deploy before visual approval
DATE: 2026-08-20
LANE: BUILD/DELIVERY takeover commissioned by Jess after the Purchasing Blueprint sidebar ASCII was approved
BASE: latest `origin/main`; PR #861 is existing capability and must be extended, not rebuilt

# PURCHASING SIDEBAR GROUPS — extend the shipped module accordion into the complete Purchasing map

> **For the build agent:** read `CLAUDE.md`, `docs/purchasing/MASTER.md` §1 and
> `docs/ui/MASTER.md` §4.2 first. Use the repository's current autonomous BUILD/DELIVERY process.
> This Card owns only the existing `PortalSidebar`, its Purchasing navigation contract, the two
> governed destination-header word corrections below, tests and local visual evidence. It may not
> change a Purchasing page body, business workflow, API, database, PDF, Quick Rail or Work Engine.

## Outcome

The shipped PR #861 already provides the correct outer grammar: one 232px/60px portal rail, one
expandable module row, one module icon and icon-free children on rounded elbows. Keep it.

This Card makes Purchasing's long list understandable to a new employee by adding five named,
independently expandable groups inside that existing module. Staff no longer need experience to
guess which Purchasing page contains a request, buying document, receipt, supplier problem or
consignment document.

## Current → problem → approved correction

| Current `origin/main` | Problem | Approved correction |
|---|---|---|
| `Purchasing` opens one flat list from PR #861 | Eighteen final destinations cannot be scanned as one undifferentiated list | Keep the module accordion; add direct Home/Work rows plus five group accordions |
| Clicking a module opens its first live page | The Purchasing header cannot be used only to reveal/hide the map | Clicking the full Purchasing row toggles its tree and does not navigate |
| Only one module-level open state exists | REQUESTS/BUY/RECEIVE/PROBLEMS/CONSIGNMENT cannot be opened independently | Multiple Purchasing groups may remain open; active group is forced open |
| State is location/override only | Staff must reopen their usual Purchasing groups every time | Remember Purchasing parent/group choices per signed-in user |
| Current live names include `Manual Purchase` and `Receiving` | They no longer match the approved object/register names | Rail and Destination Header say `Manual Purchase Requests` and `Goods Receipts`; routes and page bodies do not change |
| Several approved destinations do not exist | A guessed link would open a fake or wrong page | Render the complete map using the existing truthful `Coming soon` non-control contract |

## Approved hierarchy and route truth

```text
Purchasing                                               ▾
│  Purchasing Home                                      Coming soon
│  My Purchasing Work                                   Coming soon
│
│  REQUESTS                                              ▾
│  │  New Supplier Requests                             Coming soon
│  │  New SKU Requests                                  Coming soon
│  │  Display Requests                                  Coming soon
│  │  Manual Purchase Requests                          LIVE
│
│  BUY                                                   ▾
│  │  Purchase Demands                                  Coming soon
│  │  SO Batch Purchase                                 LIVE
│  │  Purchase Orders                                   LIVE
│
│  RECEIVE                                               ▾
│  │  Goods Receipts                                    LIVE
│
│  PROBLEMS                                              ▾
│  │  Supplier Claims                                   LIVE
│  │  Purchase Returns                                  Coming soon
│  │  Repair Orders                                     Coming soon
│
│  CONSIGNMENT                                           ▾
│  │  Consignment Overview                              Coming soon
│  │  Consignment Orders                                Coming soon
│  │  Consignment Receipts                              Coming soon
│  │  Consignment Returns                               Coming soon
│  │  Consignment Sale Notices                          Coming soon
│
│  ─────────────────────────────────────────────────────
│  Report                                                LIVE · existing temporary door
```

Exact current live addresses remain:

| Approved rail word | Current route | Rule |
|---|---|---|
| Manual Purchase Requests | `/operation?tab=manual-purchase` | Rename the rail and Destination Header only |
| SO Batch Purchase | `/operation?tab=purchase` and existing `/operation/to-order` entrance | Keep both; active resolution is one destination |
| Purchase Orders | `/operation/procurement` | Keep the nested path |
| Goods Receipts | `/operation?tab=receiving` | Rename the rail and Destination Header only |
| Supplier Claims | `/operation?tab=claims` | Keep |
| Report | `/operation?tab=purchasing-report` | Keep below the existing hairline until central Report consolidation |

All other rows are non-controls in this Card. They must have no `href`, no click navigation, no
focus stop, no badge and no fake route. They use the existing two-line `Coming soon` treatment.
There is still no Settings row; the Page Header gear remains the one Settings door.

## Interaction contract

### Purchasing module row

- The full row is a `button` with `aria-expanded`.
- A click only expands/collapses the Purchasing tree; it must not change the URL.
- Opening Purchasing closes another open module, preserving PR #861's one-open-module rule.
- Entering a real Purchasing route by URL, Jump To or in-page link opens Purchasing so the active
  destination is visible. This safety rule wins over a stored closed state.
- Closing Purchasing while standing on a Purchasing page is permitted, and **the Purchasing parent
  row then carries the active indication** — the shared module active-indication law, which
  Purchasing does not override. The rule is `ALWAYS EXACTLY ONE VISIBLE ACTIVE INDICATION`:
  tree open → only the exact current child row is blue, parent and group neutral ·
  tree shut on a Purchasing page → the parent row is blue ·
  60px collapsed on a Purchasing page → the Purchasing icon is blue.
  Never two, and never none. Purchasing is not an exception to the shipped module rule.
- Other modules retain their current PR #861 click/navigation behaviour in this Card.

### Purchasing group rows

- `REQUESTS`, `BUY`, `RECEIVE`, `PROBLEMS` and `CONSIGNMENT` are full-width buttons with
  `aria-expanded` and uppercase 11px semibold labels.
- Each group opens/closes independently. Opening one does not close another.
- The group containing the current destination opens automatically and cannot be closed while its
  destination is current and the Purchasing tree is visible.
- Direct `Purchasing Home`, `My Purchasing Work` and trailing `Report` do not belong to a group.

### Per-user memory

Persist only presentation state:

```ts
type PurchasingSidebarStateV1 = {
  moduleOpen: boolean;
  openGroups: Array<
    "purchasing-requests" |
    "purchasing-buy" |
    "purchasing-receive" |
    "purchasing-problems" |
    "purchasing-consignment"
  >;
};
```

Use the exact versioned key:

```text
carres:portal-sidebar:purchasing:v1:{auth-user-id}
```

- Use `session.user.id`, never email and never a global key.
- If no signed-in user id exists, keep state in memory only.
- Invalid/old JSON falls back safely; it never breaks navigation.
- Store no route, active key, count, business status or action fact.
- Active-route auto-open is derived from the URL and is never persisted as business truth.

## Visual contract

- Keep the existing 232px expanded / 60px collapsed widths and `ops-sidebar-collapsed` key.
- Keep the brand/collapse region fixed at top, user identity fixed at bottom and only middle nav
  scrolling.
- Reuse PR #861's measured rounded-elbow geometry. Add one nested level for group children; derive
  its x positions from the current `ROW_PAD_X`, `MODULE_ICON`, `ELBOW_X`, `ELBOW_W` and
  `CHILD_PAD_L` constants instead of writing unrelated guessed geometry.
- Use quiet 1px neutral connectors/separators. No box, card, heavy outline, popover or shadow.
- Purchasing carries the one module icon. Direct rows, group rows and Listing rows carry no
  individual leading icons.
- Direct/listing words use body 13px. Group words use label 11px semibold uppercase. `Coming soon`
  remains the smaller second line from the shipped contract.
- The governed `kit-blue-3` wash and `kit-blue-9` active line follow the single-indication rule
  above: the exact current destination while the tree is open, the parent row while it is shut, the
  module icon while the rail is collapsed. There is no double-active state and no no-active state.
- In 60px collapsed mode, show only the Purchasing module icon; hide every direct/group/listing
  row. **That icon links to a NAMED destination — `SO Batch Purchase` (`/operation?tab=purchase`) —
  never to "the first live row"**: `SO Batch Purchase` is the module's existing landing
  destination, and grouping the rows may not relocate it. When `Purchasing Home` is built, its own
  approved scope may change this. Jump To ordering is not touched.
- Keep the active row visible with `scrollIntoView({ block: "nearest" })`; no centring or animation.

## File boundary

Expected application files:

```text
apps/web/src/pages/portal/portal-nav.ts
apps/web/src/pages/portal/purchasing-sidebar.ts                 CREATE
apps/web/src/pages/portal/purchasing-sidebar.test.ts            CREATE
apps/web/src/pages/portal/PortalSidebar.tsx
apps/web/src/pages/portal/PortalSidebar.test.tsx
apps/web/src/pages/operation/PurchasingTabs.tsx
apps/web/src/pages/operation/PurchasingTabs.test.tsx             CREATE
```

`purchasing-sidebar.ts` owns only `PurchasingPageGroupKey`, `PURCHASING_PAGE_GROUPS`,
`purchasingChildBlocks()`, `activePurchasingGroup()`, `PurchasingSidebarStateV1` and the safe
`parsePurchasingSidebarState(raw: string | null)` /
`serializePurchasingSidebarState(state: PurchasingSidebarStateV1)` helpers. It keeps pure
grouping/state logic out of the already-large
`PortalSidebar.tsx`. It does not own routes or duplicate pages: `portal-nav.ts` remains the
page/route source and every helper consumes those same `PortalNavItem` objects.

Do not touch:

```text
apps/api/**
packages/shared/**
supabase/**
Purchasing page bodies, Registers, Quick Rails, actions or PDFs
Delivery / Warehouse / Sales module hierarchy or click behaviour
```

## Build tasks

### Task 1 — navigation contract, test first

- [ ] Add failing tests that assert the complete hierarchy, exact group order, direct rows, live
  route mapping, trailing Report and every `Coming soon` non-control.
- [ ] Create `PurchasingPageGroupKey`, `PURCHASING_PAGE_GROUPS` and
  `purchasingChildBlocks(pages: PortalNavItem[])` in `purchasing-sidebar.ts`. Add
  `pageGroup?: PurchasingPageGroupKey` to `PortalNavItem` and attach every grouped Purchasing
  destination to one exact group. Keep the ordered `PortalNavItem` collection as Jump To's page
  source; no second route list.
- [ ] Replace the current flat Purchasing item sequence with the hierarchy above. Add every missing
  approved destination using `soon: true`.
- [ ] Give `SO Batch Purchase` the exact `activeFor` values `tab:purchase` and
  `path:/operation/to-order`, while its rail href remains `/operation?tab=purchase`; both entrances
  must resolve to one active BUY destination.
- [ ] Rename only the two current words: `Manual Purchase` → `Manual Purchase Requests` and
  `Receiving` → `Goods Receipts`; preserve their keys/routes.
- [ ] Prove the focused navigation tests pass.

Minimum assertions in `purchasing-sidebar.test.ts`:

```ts
expect(PURCHASING_PAGE_GROUPS.map((group) => group.label)).toEqual([
  "REQUESTS",
  "BUY",
  "RECEIVE",
  "PROBLEMS",
  "CONSIGNMENT",
]);

const purchasing = PORTAL_NAV[0].items.filter((item) => item.section === "Purchasing");
expect(
  purchasing
    .filter((item) => !item.soon)
    .map((item) => [item.label, navItemHref(PORTAL_NAV[0], item)]),
).toEqual([
  ["Manual Purchase Requests", "/operation?tab=manual-purchase"],
  ["SO Batch Purchase", "/operation?tab=purchase"],
  ["Purchase Orders", "/operation/procurement"],
  ["Goods Receipts", "/operation?tab=receiving"],
  ["Supplier Claims", "/operation?tab=claims"],
  ["Report", "/operation?tab=purchasing-report"],
]);
```

### Task 2 — Purchasing-only nested accordion, test first

- [ ] Add failing tests for full-row parent toggle without navigation, five independent group
  toggles, multiple groups open, active-group forced open and exact active-row selection.
- [ ] Extend the shipped module renderer only for `section === "Purchasing"`; do not redesign the
  generic PR #861 module accordion or other modules.
- [ ] Reuse the existing child/non-control renderer semantics. Add nested connectors by deriving
  geometry from the shipped rail constants.
- [ ] Prove keyboard semantics: module/group buttons have `aria-expanded`; live rows are links;
  `Coming soon` rows remain unfocusable `aria-disabled` spans.
- [ ] Prove a Purchasing parent/group never receives selected blue while an exact destination row
  is visible.
- [ ] Prove `/operation/to-order` opens Purchasing + BUY and selects only `SO Batch Purchase`.

Minimum interaction assertions:

```ts
function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location-probe">
      {location.pathname}{location.search}
    </output>
  );
}

// Add useLocation to the existing react-router-dom import, then add <LocationProbe /> beside
// <PortalSidebar /> inside the existing renderAt() MemoryRouter.

const before = screen.getByTestId("location-probe").textContent;
fireEvent.click(screen.getByRole("button", { name: "Purchasing" }));
expect(screen.getByTestId("location-probe")).toHaveTextContent(before ?? "");

fireEvent.click(screen.getByRole("button", { name: "BUY" }));
fireEvent.click(screen.getByRole("button", { name: "PROBLEMS" }));
expect(screen.getByText("SO Batch Purchase")).toBeVisible();
expect(screen.getByText("Supplier Claims")).toBeVisible();
```

### Task 3 — per-user presentation memory, test first

- [ ] Add failing tests for the exact versioned user-id key, reload restoration, user isolation,
  malformed JSON fallback and active-route override.
- [ ] Implement the `PurchasingSidebarStateV1` contract. Keep unauthenticated state memory-only.
- [ ] Persist only after a human toggles the Purchasing parent/group; never persist derived active
  route, count or status.
- [ ] Prove changing from user A to user B does not carry A's open groups.

### Task 4 — destination-header words and regression

- [ ] Add failing `PurchasingTabs` assertions for `Manual Purchase Requests` and `Goods Receipts`.
- [ ] Change the two `PAGE_WORD` values only. Keep the Sales Orders Destination Header component,
  50px geometry, 24px word, no icon and no `Purchasing ·` prefix.
- [ ] Run every existing PortalSidebar test. Update tests that encode the superseded flat
  Purchasing list, `Receiving` word or Purchasing-click navigation; do not weaken Delivery,
  Warehouse, Sales, collapsed-mode, badge or Settings regressions.

### Task 5 — gates and local owner walk

- [ ] Run focused tests:

```bash
pnpm --filter @carres/web test -- src/pages/portal/purchasing-sidebar.test.ts src/pages/portal/PortalSidebar.test.tsx src/pages/operation/PurchasingTabs.test.tsx
```

- [ ] Run the web gates:

```bash
pnpm --filter @carres/web typecheck
pnpm --filter @carres/web lint
pnpm --filter @carres/web check:v4
```

- [ ] Open the authenticated local app at 1440px and 1130px and verify there is exactly one left
  Portal Sidebar and the existing right Quick Rail/page rail remains where its page owns it.
- [ ] Capture four screenshots:
  1. 1440px — Purchasing open; BUY + PROBLEMS open; SO Batch Purchase active.
  2. 1130px — Purchasing open; RECEIVE forced open; Goods Receipts active.
  3. 1130px — portal rail collapsed to 60px; one Purchasing icon, active and linked to
     `SO Batch Purchase`.
  4. 1440px — Purchasing tree closed, the Purchasing parent active, the URL unchanged.
- [ ] Report the local URL, focused test totals, gate results and all four screenshots.
- [ ] Stop for Jess's visual walk. Do not merge, deploy or start another Purchasing page.

## Failure conditions

The Card fails if any of these appears:

- a second sidebar, flyout Purchasing menu, module tab strip or page-owned destination column;
- rebuilding/removing PR #861 instead of extending it;
- clicking Purchasing navigates to SO Batch Purchase;
- opening one Purchasing group closes another;
- an active group hides the current destination;
- parent + group + child all look selected, **or nothing at all is selected while the operator is
  standing on a Purchasing page**;
- the collapsed Purchasing icon derives its destination from row order;
- an individual child icon;
- a heavy box/card/shadow around a group;
- a dead link, fake Register or missing `Coming soon` reason for an unbuilt destination;
- loss of the live Manual Purchase, Receiving, Report or another current route;
- a Settings row in the rail;
- any Purchasing page-body/API/database/PDF/business-rule change;
- merge or deployment before the four-screen owner walk.

## Completion boundary

Completion is not “the tests pass.” Completion is: the existing PR #861 rail remains intact for
every other module; Purchasing exposes the approved full map with independent group accordions;
current real pages remain reachable; unreleased pages remain truthful non-controls; state is
isolated per user — including a user change on a still-mounted rail; exactly one active indication
is visible in every rail state; the collapsed icon opens its named destination; the two current
destination headers use the approved object words; and Jess has reviewed the four local
screenshots.

## Correction record — `RESOLVED FROM AUTHORITY`

**These were ordinary architecture corrections, not a new Carres operating-model decision, and
not an owner ruling.** Each was already settled by existing authority: the shared module
active-indication law, and the preservation of an existing Purchasing capability.

`RESOLVED FROM AUTHORITY — shared module active-indication law and preservation of the existing
Purchasing landing capability.`

1. **Receiving wording.** `Goods Receipts` stands as the destination/header word. `Receiving
   Summary` and `Start Receiving` are approved workspace/action words in `docs/COPY-STANDARD.md`
   and are KEPT. No page body changes in this Card. `Receiving Progress` is recorded as a separate
   pre-existing out-of-scope copy defect in `docs/carry-forwards.md`; it does not block this Card
   and no new Card is opened for it now.
2. **Closed/collapsed active indication** follows the shared shipped module rule. A module-scoped
   exception around `const lit` had no authority behind it and is removed; Purchasing is governed
   by the same rule as every other module.
3. **Collapsed landing destination.** `SO Batch Purchase` was the Purchasing module's landing
   destination before grouping. Grouping is presentation and may not change that capability merely
   because row order changed, so the destination is named rather than derived from row order.
4. **Per-user state across a user change on a still-mounted rail.** Proving the existing per-user
   requirement exposed a real dependency gap: the route-forces-open rule was keyed only on the
   active route, so loading the incoming user's empty state left them on a rail hiding their own
   current page. Fixed.

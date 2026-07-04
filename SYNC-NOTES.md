# SYNC NOTES — cross-session coordination

> Multiple Claude Code chats work this repo in parallel. When `main` moves, other
> chats' feature branches must **rebase** so they don't clobber shipped work
> (especially the brand logo + shared shell files). Append a dated entry whenever
> you ship something to `main`.

---

## 2026-07-05 — POS prototype program: configurator + Order Status (PRs #51-#54)

Three slices, merged + deployed (web Pages `caefea95`, bundle `index-BF-4hRJF.js`;
NO api change, NO migration):

1. **PR #51** — mattress/bedframe now jump into a FULL-PAGE configurator
   (`pos/PosConfigurePage.tsx`, design `prototype/pos-configurator.jsx`): plan-view
   canvas + cfg-* controls + live-total header. **The drawer stays** for
   accessory/pillow/dropdown-sofa/service. DraftLine emit byte-identical.
   ⚠ The `.pos-proto` button/input CSS reset is now `:where()`-wrapped (element-level
   specificity) — do NOT re-raise it; single-class prototype rules must win.
2. **PR #52** — `SofaConfigurePage` + `SofaBuildCanvas` re-skinned (`sof-qp` rail+hero
   quick pick, `sof-cv` room/grid/dim-callouts/tool-pill). Geometry/pricing untouched.
3. **PR #53** — **Order Status** board behind the POS "My orders" pill
   (`pos/OrderStatusPage.tsx`): PIN gate (**227737** = CARRES on the keypad),
   revenue summary, 3 lanes, card → the existing `DealerOrderDetail` overlay.
   Principal's pill still links to the portal orders tab.

4. **PR #54** — accessory POS cards (rail row + generic Option configurator) ·
   corner-combo quick-pick seeds as a self-validated L (analyzeSofa-searched
   rotations) · `orders.sourceSystem` surfaced (shared schema/adapter/domain) so
   AutoCount rows sit in the Order Status Proceed lane. Shared adapter changed
   → API redeployed (`f3f741e7`); web `a78e33b8`. Prod catalog gained the 2990s
   pilot trio: Cloud Series Mattress · Kayu Platform Bed · Pasir Wool Rug.

If your branch touches `CatalogStep` / `SofaConfigurePage` / `SofaBuildCanvas` /
`DealerPos` / `pos-prototype.css`: rebase and take these shapes.

— from the POS-prototype session (Loo's machine)

## 2026-07-03 — POS 2990s-parity program (branch `feat/pos-2990s-parity`, PR #47)

Five slices, one branch. **⚠ migration 0200 must be applied BEFORE this deploys**
(orders += customer_email/race/gender/birthday + create_order re-issue).

1. **POS shell**: `PosSidebar` (sectioned: Categories/Quick/**MAINTAIN
   principal-only**/pricing footer) replaced `CategoryRail` (deleted); single
   "CARRES" series group in the grid; topbar = 01 CART/02 CUSTOMER/03 CONFIRMED
   + Quotes + My orders + cart chip + staff chip. **`PrincipalPos` (dealer
   pre-pick page) is DELETED** — principal `?tab=pos` mounts `DealerPos`
   directly; the dealer is picked IN-FLOW at the CUSTOMER step
   (`draft.actingDealerId`).
2. **MAINTAIN → New Order**: `POST /api/orders/raw` (principal/operation; same
   create_order RPC, NO POS gates/recomputes) + `PrincipalNewOrder`
   (`?tab=new-order`).
3. **CUSTOMER step (Image-#4 parity)**: **`Step1Customer` is DELETED** —
   absorbed into the rebuilt `CustomerStep` (4 section chips + sticky
   `OrderSummaryRail`); EMAIL/RACE/GENDER/BIRTHDAY now **POS-required**
   (step1 gate — dealers included), server stays lenient. New
   `GET /api/orders/customer-type?phone=` probe.
4. **Sales analysis**: `GET /api/analytics/sales` + `lib/sales-analysis.ts`
   summarizers + `PrincipalSalesAnalysis` (`?tab=sales-analysis`).
5. **Quotes**: device-local saved quotes (`pos/quotes.ts`, sanitized lines) +
   `QuotesDrawer` + CartDrawer "Save as quote".

If your branch touches `DealerPos` / `CatalogStep` / `CustomerStep` /
`PrincipalApp` / `portal-nav`: rebase and take this branch's shapes; don't
re-introduce `CategoryRail` / `Step1Customer` / `PrincipalPos`.

— from the POS-parity session

## 2026-06-30 — unified internal portal (Operation + Principal + Finance)

The three internal portals merged into ONE role-aware portal. **The three
private sidebars (`OperationSidebar` / `PrincipalSidebar` / `FinanceSidebar`)
are DELETED** — replaced by `apps/web/src/pages/portal/{portal-nav,PortalSidebar}`
(one role-filtered area accordion: Operations / Finance / Admin). principal sees
+ operates all three; operation sees Operations; finance sees Finance.

**If your branch predates this and touches any of those 3 sidebars or
`OperationApp` / `PrincipalApp` / `FinanceApp`:** those files changed shape (now
mount `<PortalSidebar/>`, grid column is `auto`, Operation/Principal read `?tab=`).
The 2026-06-29 collapse + real-logo work was **carried into PortalSidebar** (it
self-owns collapse + the `/carres-logo.png` heart when collapsed) — don't
re-introduce the old per-area sidebars.

**Backend:** migration **0189** widens `is_operation()` → `('operation',
'principal')`; `requireOperation` + the inline operation guards now admit
principal (so does `/operation/*` RequireRole). Operation guard tests probe the
403 with `finance` now (internal-but-not-operation).

— from the unified-internal-portal session

## 2026-06-29 — collapsible sidebar + the real CARRES logo (LIVE on main)

`origin/main` @ `586975f` · deployed to <https://carres-portal.pages.dev>.

**What landed:**

1. **Collapsible sidebar** — a hide button on the "Carres" row collapses the
   operation sidebar to an icon rail (more room for the table). State lives in
   `apps/web/src/pages/operation/OperationApp.tsx` (`sidebarCollapsed` + the grid
   column flips `232px ⇄ 60px`). Touches `OperationApp.tsx` + `OperationSidebar.tsx`.

2. **The real CARRES logo** — `apps/web/src/components/CarresLockup.tsx` now uses
   the official wordmark image `apps/web/public/carres-wordmark.webp` (replacing the
   old DM-Sans **"Carres."** text). `OperationSidebar.tsx`'s collapsed mark uses the
   real heart logo `/carres-logo.png` (NOT a generic lucide `Flame`).

**If your branch predates this (e.g. `feat/orders-drawer-redesign`):**
it still carries the OLD logo, lacks the hide-menu, and edits the SAME
`OperationApp.tsx` / `OperationSidebar.tsx` files.

➡ **Before you push or merge:** `git fetch origin && git rebase origin/main`
(or merge `origin/main`). When resolving `CarresLockup.tsx` + `OperationSidebar.tsx`
conflicts, **take main's versions** (wordmark image + real heart) — do NOT
re-introduce the old flame / "Carres." text logo.

— from the sidebar-collapse + follow-up-flag session

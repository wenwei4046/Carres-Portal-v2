# SYNC NOTES — cross-session coordination

> Multiple Claude Code chats work this repo in parallel. When `main` moves, other
> chats' feature branches must **rebase** so they don't clobber shipped work
> (especially the brand logo + shared shell files). Append a dated entry whenever
> you ship something to `main`.

---

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

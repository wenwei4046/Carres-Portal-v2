# SYNC NOTES — cross-session coordination

> Multiple Claude Code chats work this repo in parallel. When `main` moves, other
> chats' feature branches must **rebase** so they don't clobber shipped work
> (especially the brand logo + shared shell files). Append a dated entry whenever
> you ship something to `main`.

---

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

# Checkpoint — Orders filter + Action/ETA/Follow-up redesign (2026-06-25)

**Branch:** `feat/orders-drawer-redesign` · **Worktree:** `C:\Users\User\carres-worktrees\orders-drawer`
**Status:** local commits only — **NOT pushed, NOT deployed.** Awaiting Loo's `上线`.

### ⚠️ RESUME IN THE WORKTREE — do NOT work in the main repo
ALL of this work lives in the **worktree** `C:\Users\User\carres-worktrees\orders-drawer` (already checked out on `feat/orders-drawer-redesign`). The main repo (`…\OneDrive\Desktop\Carres-Portal v2`) stays on `main` and is a DIFFERENT checkout.
- **Edit/read files with absolute worktree paths** (`C:\Users\User\carres-worktrees\orders-drawer\apps\web\...`). Do NOT edit the same file under the OneDrive main-repo path — that's a different branch and the change would be lost.
- Run tooling with `-C`: `corepack pnpm -C 'C:\Users\User\carres-worktrees\orders-drawer' --filter @carres/web ...`.
- Commit from the worktree (`cd` into it, or it's the path in the Bash tool). The **preview MCP is already pinned to this worktree** (`.claude/launch.json` web → `…/carres-worktrees/orders-drawer/apps/web`) — just `preview_start` name `web`, no reconfig.
- **Do NOT `git checkout feat/orders-drawer-redesign` in the main repo** — a branch checked out in a worktree can't be checked out elsewhere; it errors. Nothing to fetch/checkout; the worktree is already there with all 6 commits.

Read this file ▶ RESUME (below).

---

## ▶▶ UPDATE 2026-06-25 (cont.) — #3 LOCKED + #4 export + drawer edit SHIPPED (local, NOT pushed)
- **#3 filter layout → LOCKED 丙** (keep the shipped 3-row boxes). Loo's call; **no code change** (line layout was already the live terminal state).
- **#4 top-bar Export menu — DONE** (`66e089f`): header **Export ⋮** next to Import → exports the *filtered* view (every row matching the active filters, not just selection) as **CSV** (UTF-8 BOM so Excel reads Chinese names; +Address column) or **Print / Save as PDF** (lib-free HTML print window). Logic is a pure `buildOrdersCsv` + `buildOrdersPrintHtml` (shared `exportRow`); the bulk selected-CSV reuses it. Live-verified ("Export 124 orders" + both items).
- **#4 drawer customer edit — DONE** (`86c1717`): inline **Edit** (pencil) on the Order section's Customer/Phone/Address for a **Place** order → `useUpdateOrder` (PATCH `/api/orders/:id`, existing Phase-2C.2 path), sends only changed fields, validates with the SAME shared `updateOrderInputSchema`, refreshes `qk.operation.order`. The `update_order` RPC 422s on non-Place, so Edit only shows for status 'place'. Live-verified (Placed #1001 → Edit + form opens/cancels; Delivered #1007 → no Edit).
- **Excel decision = lib-free** (the CSV opens in Excel). NO dependency added → bundle CF stays flat. If Loo wants a true formatted `.xlsx`, add a small lib then (his call, overridable).
- **#4 Ref No column + Deadline** = already shipped earlier this checkpoint (no work needed).
- Tests **+10** → web **735/740** (5 pre-existing fails: OhanaSofaTab ×4 + NiceFutureMattressTab ×1). tsc + build clean; SERVICE_ROLE dist scan 0. **2 new commits, NOT pushed / NOT deployed — await `上线`.**

### Still open after this session
- **Unassigned-carrier alert** (small #4 polish): the amber **No ETA** QuickView already exists, and the Logistic group already has an **Unassigned** filter chip + count. Only the red/amber "Unassigned carrier" *action* chip alongside No ETA is left (cosmetic prominence; capability already present).
- **#2 Follow-up form** — the BIG phase (extend right-rail Tasks: preset-title dropdown + force-assign one person + due dropdown + urgent + escalate-to-Jess + warning state machine). Own session; confirm approach first (draft in RESUME #2 below).

---

## What shipped this session (commits, newest first)
- `50f750d` Deadline cell = date (black base-900) + weekday (grey), **dropped the countdown** (Loo: `+2d` was confusing).
- `2814fac` Flag now opens an **inline box to TYPE a real follow-up note** (no more "Flagged for follow-up" placeholder) · Deadline shows on **completed** orders too (+ weekday) · headers → base-900 bold · "No ETA" quick-view → Region/Logistic row.
- `f388719` **Merged Due + Deadline** into one column · new **ETA column** = `ops_order_control.logistic_eta` (inline-editable, red "No ETA" alert when missing + deadline ≤7d) · **"No ETA" quick-view** · API list embed `+logistic_eta`.
- `d8675a4` Left **flag-icon column** (scan) · Category **+Pillow/M.P** · Logistic `—`→`Unassigned` · smaller quick-views · **Ref No black**.
- `ae945b2` **Boxed 3-row filter** (Status / Due+Stock+Category / Region+Logistic) · **DUE filter group** (Overdue/Urgent/Attention/Upcoming/Later, heat colours) · two **action lanes** (🚩 Follow-up amber Flag · ⏫ For Jess red ChevronsUp, Lucide icons) · **Action column** (note + Resolve) distinct from the 4-party **Remark** column.

Files touched: `apps/web/src/pages/operation/OperationOrdersControl.tsx` (+test), `apps/web/src/lib/queries.ts` (`opsRemarkEmbed` +logistic_eta), `apps/api/src/routes/operation/orders.ts` (list embed +logistic_eta).

**Tests:** 29/29 component · full web 725 pass / **5 pre-existing fails** (OhanaSofaTab ×4 + NiceFutureMattressTab ×1 — unrelated). Build clean. tsc (web+api) clean.

**`logistic_eta`** field already exists via **migration 0180** (this branch, NOT applied to prod). The backend save + drawer edit + zod were already wired by the redesign; this session just surfaced it in the list.

---

## DEPLOY (上线) needs
1. Apply migrations **0180–0183** (incl. `logistic_eta`) to prod via MCP. 2. Deploy **API** (logistic_eta embed). 3. Deploy **web**. Until then the ETA column shows "No ETA" everywhere (no data yet) and the Remark/Action embeds are pre-deploy.

> Layout note: the boxed filter is **3 rows at ≥1440px viewport, 4 rows on narrower laptops** (Loo accepted this, Q1=A). The "3 rows" needs a wide screen.

---

## ▶ RESUME — pending decisions (Loo to answer)
1. ~~**#3 filter layout — LOCK ONE**~~ → **RESOLVED 2026-06-25: LOCKED 丙** (keep the shipped 3-row boxes; no code change). The other options were 甲 5-column / 乙 4-column — both dropped because column grids wrap chips taller, which Jess had already rejected.
2. **#2 Follow-up form — confirm approach = EXTEND the existing right-rail Tasks** (`OperationRightRail`, `ops_tasks`). Form opened by clicking **Flag**:
   - **Title = dropdown** of preset common follow-ups (team's English is poor) + free "what to do".
   - **Force-assign ONE person** (no "Anyone").
   - **Due = dropdown** (Today before 6pm / Tomorrow / +3d / pick a date).
   - **Urgent** toggle.
   - **Escalate to Jess** = click reveals: report title + content + **reason dropdown** (Request discount / Refund / Ask a question / Other).
   - **Warning state machine** (this is what Loo kept asking for): 🚩 amber = assigned + taken, in progress · **⚠ red = nobody took it (after a window) OR overdue** · ⏫ red = escalated · ✓ = resolved. Overdue/untaken → also lands in a **Warning panel everyone sees** + chase the assignee.
   - The **Action column STAYS** (it's the per-order view of the follow-up/task state). Notify the assignee + Take-it tracking.
   - This is the **big phase** — build on its own after #3/#4.

## APPROVED — build next (no decision needed)
- ~~**#4** — Ref No column + export menu + edit address in the drawer~~ → **DONE 2026-06-25** (`66e089f` export menu · `86c1717` drawer edit; Ref No column + Deadline were already shipped). Excel = lib-free CSV (no dep). See the UPDATE block at the top.
- **Logistic alert wording** (confirmed): **"Unassigned carrier"** (orders with no carrier → assign) + **"No ETA"** (carrier set, no ETA → chase) — action chips near the Logistic group, red/amber. **Partial**: "No ETA" amber QuickView + a Logistic "Unassigned" filter chip+count already exist; only the red/amber "Unassigned carrier" *action* chip is left (cosmetic).
- **Deadline** = date(black)+weekday(grey), no countdown — DONE.

## Agreed design facts
- Follow-up **replaces** "Carres remark" (both internal); Remark column keeps the 3 party notes (Customer request / Action for logistic / Warehouse). Existing 30 Carres remarks shown as the first follow-up.
- Action lanes use **Lucide icons, never emoji**.
- DUE buckets: Overdue (past) · Urgent (≤1d) · Attention (2–3d) · Upcoming (4–7d) · Later (7+d).

## Env reminders (from memory)
- pnpm: `corepack pnpm -C <worktree> --filter @carres/web ...` (COREPACK_ENABLE_DOWNLOAD_PROMPT=0).
- Commit: `git -c user.name="Chai Chiew Lim" -c user.email="limchaichiew@gmail.com" ...`, explicit paths, commit -F tmpfile (here-string fails); the worktree `.git` is a file so tmpfiles go to /tmp. A benign "failed to delete .git/worktrees/orders-column: Permission denied" appears on commit — harmless.
- Preview MCP is pinned to this worktree (`.claude/launch.json` web → `../../../carres-worktrees/orders-drawer/apps/web`), reads LIVE prod data + the DEPLOYED API. Supabase MCP `execute_sql` = permission-denied this session (can't write prod; Loo runs SQL).
- Don't auto-commit/push/deploy without `push`/`上线`.

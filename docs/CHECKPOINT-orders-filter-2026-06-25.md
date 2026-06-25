# Checkpoint — Orders filter + Action/ETA/Follow-up redesign (2026-06-25)

**Branch:** `feat/orders-drawer-redesign` · **Worktree:** `C:\Users\User\carres-worktrees\orders-drawer`
**Status:** local commits only — **NOT pushed, NOT deployed.** Awaiting Loo's `上线`.
**To resume:** `git fetch origin && git checkout feat/orders-drawer-redesign`, read this file ▶ RESUME.

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
1. **#3 filter layout — LOCK ONE** (we iterated 3/4/5-column; mockups shown):
   - **甲** 5-column (the 4 short groups + Logistic on top; **Region spans 3 cols**; "No ETA" under Logistic)
   - **乙** 4-column (Region + Logistic each span 2)
   - **丙** keep the current boxed rows (shipped)
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
- **#4** — Ref No column + **export menu** (Excel `.xlsx` needs a lib · PDF via print · CSV) at the top header (⋮) · **edit address etc. in the order drawer** (Q5 = **A**, drawer edit, NOT a full Excel-grid edit).
- **Logistic alert wording** (confirmed): **"Unassigned carrier"** (orders with no carrier → assign) + **"No ETA"** (carrier set, no ETA → chase) — action chips near the Logistic group, red/amber.
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

# HANDOFF — Carres Portal v2 · continuous build

Paste everything below the line into a fresh session. It is self-contained.

> **`docs/handoff/` HOLDS EXACTLY ONE LIVE PROMPT, AND THIS IS IT.** When this lane's mission
> changes, OVERWRITE this file — never add a second one beside it. Git history keeps the earlier
> checkpoints (`git log -p -- docs/handoff/CARRES-CONTINUOUS-BUILD-HANDOFF.md`). Re-measure every
> SHA and status below before trusting it.

---

CARRES PORTAL v2 — CONTINUOUS BUILD · checkpoint 2026-10-15 00:15 MYT (UI kit lane, PR #2066)

## 0 · Owner scope carried forward (Jess, 14 Oct 2026 — do not ask her to reconfirm)

1. Apply the existing UI kit across the whole Portal; remove verified superseded implementations
   after preserving recoverable work (Git history or a named branch), in the same change.
2. Complete Sales Order, SO Batch, Workspace and Tasks, including source links and task
   completion updates.
3. Merge, deploy and verify approved scope when the required gates pass. Earlier blanket
   deployment holds are lifted; unapproved previews stay outside a release.
4. Keep every later module on the same kit, Workspace/Tasks and the Settings it needs.

Never report progress as a percentage; list the exact remaining obligations (§4).

## 1 · Where the work is

- Repo `wenwei4046/Carres-Portal-v2` is PUBLIC: never commit customer data, real-looking names or
  the design package's `sales-real.js`.
- **Branch `build/so-outright-kit` · PR #2066 (open, not merged, not deployed).**
  Worktree `/Users/chaichiewlim/carres-worktrees/so-outright-kit`. Code head **`3b83a1838`**
  (this handoff is the commit after it).
- Uncommitted tracked files: none. Untracked and git-ignored, local only: `apps/api/.dev.vars` and
  `apps/web/.env.local`, copied from the main checkout for the local API (never print or commit).
- PR preview https://pr-2066.carres-portal.pages.dev serves `3b83a1838`; it reads production data:
  READ ONLY, no Save, no Send. Kit page `/ui` on the same host.
- Production (`erp.carresofficial.com`) runs `origin/main` without PR #2066; re-measure its SHA
  (`/__carres_deploy.json`) before quoting it. PR #2066 has no migration.

### Local services (`/Users/chaichiewlim/Desktop/Carres-Portal-v2/.claude/launch.json`)

| Config | URL | What |
|---|---|---|
| `so-outright-kit-pr2066` | http://localhost:5415/sales-orders-shell-preview.html (TEST fixture, no login) · http://localhost:5415/operation/orders (signed in) | Portal web from the worktree, `VITE_API_BASE_URL=http://127.0.0.1:8888` |
| `so-outright-kit-api` | http://127.0.0.1:8888 | `wrangler dev` from the worktree's `apps/api` (has the new Supplier read), production Supabase, used read-only. Jess signed in on localhost:5415 on 14 Oct; the session lives in that browser pane only |
| `design-round4-pr2066` | http://localhost:5417/Sales%20Order%20Outright%20v12.dc.html | Design's Round 4 package. Its folder was a session scratchpad: re-extract `~/Downloads/Sales Order (15).zip` into a new empty folder outside the repo and re-point the config |
| `so-v12-design-pr2066` | http://localhost:5416/Sales%20Order%20Outright%20v12.dc.html | The repo's design reference (`docs/ui-reference/sales-order-design`) |

Toolbar comparison, same page and viewport (1025 × 860, side menu and Tasks open, one filter):
`/operation/orders?search=1363` (one line, default) · `/operation/orders?search=1363&toolbar=two-rows`.

## 2 · Checks

| Commit | Result |
|---|---|
| `7617d9e2b` | CI green: web 7,107 tests, api 4,403, kit check 119 passed |
| `3b83a1838` | Preview deployed; CI was running at writing — read `gh pr checks 2066` |
| local, head code | web typecheck clean; 1,035 related web tests; api register-facts 7; all kit specs 74 passed at 1025/1164/1440 |
| preview, real data | 12 states (3 widths × Summary/Tasks): carres-align = v12 except the owner's date-header words, carres-check PASS, rows 54, no cell past its column, no page side scroll, no overlap |

Baselines: `e2e-kit/kit-baselines.spec.ts-snapshots/` (45); the label `update-baselines` retakes
them on Linux. **CI renders two anti-aliasing variants** on rounded edges at fractional x (±1
colour level, ≤52 px), alternating between runs — proved on 6 runs including `1d58ff552`; the 0.2 %
gate absorbs them. A ≤52 px corner-only change is not a code change. Follow-up: run the baseline
job in the pinned Playwright image so runs are identical.

## 3 · Done in PR #2066 (built and verified on preview/localhost, not yet on production)

- Sales Order Outright page 1 on the v12 kit: `CTable` (one-line 54 rows; a column widens to its
  longest value; the list scrolls in its own box with ▸ ☐ SO no. fixed; the box takes keyboard
  focus), grey 40 header, toolbar buttons 32, ⋮ 32 × 32, year rule, footer
  `{n} orders · Qty: …` in the fixed order Mattress · Pillow · Bedframe · Mattress protector · Sofa ·
  Service · Others (two lines at most, then MS · BF · M.P · SOF; `1 order`).
- Owner decisions of 14 Oct: preserved date header `Customer’s original` / `requested delivery`
  (never ETA, no `· passed`, line 2 at 12/400); Summary icon-only on a short toolbar, the view
  button always named, no overlap; customer name one line with … and the full name on hover and in
  the order; ⋮ 32 in code and in the design reference.
- Supplier in item rows, source-owned only (Orders MASTER Order Route): non-cancelled POs through
  `po_line_sources.order_line_id`, else the bound Unit's own PO; neither → `Not recorded`; unread →
  `Could not read`; never the Catalog. Server field `owned.lineSuppliers` + `failed.suppliers` on
  `GET /api/operation/orders/register-facts`. **Verified end to end on localhost through the local
  API with Jess's login:** SO-1371 B1201S-K → Nice Future · SO-1363 TRION-Q → Ohana, CODY-SK → Ohana,
  MEMORY-FOAM-PILLOW-asd → Not recorded · SO-1362 JAGER-SS → Ohana (Unit path, PO-2054) · SO-1340
  H1401F-K → Nice Future. Production TRIAL records, not proven business data (§6).
- `CPopover` as a menu (WAI-ARIA menu button): `aria-haspopup="menu"`; ↓ opens on the ticked item;
  ↑ ↓ Home End move; Escape/Tab close and return focus to the button (about 50 ms later); an
  outside click does not steal focus. Real-key check on the signed-in localhost page + unit tests.
- Two toolbar candidates on one page (pending, §5): one line (Code) and `?toolbar=two-rows`
  (Design); with two rows the Summary/Tasks bodies stay level with the table (`--c-toolbar-extra`).
- Design reference synced: v12 two-line date header, ⋮ 32 (Carres Shell, Carres UI Kit), Carres
  Table footer two lines at most, v12 footer in the fixed order, UX-FLOWS.
- `carres-align.js` beside `carres-check.js` (detection fix: Portal icons are `data-icon`).
- Docs updated: COPY-STANDARD "Sales Order Outright list — the cell words"; 01-design-tokens §3
  (icon button 32, segmented 32), §4 toolbar row (two candidates pending), §5 header / list row /
  footer; Orders MASTER "Current cross-module dependency boundary" (Supplier source rule and the
  counted-goods gap); UI MASTER status line (carres-align).

## 4 · Remaining obligations, in order (the next executable step is 4.1)

1. **Finish PR #2066's gates.** CI green on the head (`gh pr checks 2066`). Take the unapproved
   `?toolbar=two-rows` preview out of the release first: push it to branch
   `preview/two-row-toolbar` (recoverable), remove its code and its kit-outright case, keep the
   `--c-toolbar-extra` hook only if two rows win, and update 01 §4's toolbar row. The one-line steps
   stay: they implement the approved "no control may overlap". Then merge (squash).
2. **Verify live, read only** (merge to main deploys automatically): every surface serves the merge
   SHA; carres-align and carres-check at 1025/1164/1440 × Summary/Tasks on
   `erp.carresofficial.com/operation/orders`; Supplier for SO-1371, SO-1363, SO-1362, SO-1340 equals
   §3; menu keyboard; footer. Report `example · expected · seen on live · PASS/FAIL`.
3. **Kit gaps, authorised engineering (01 rules):** Tasks title row `Tasks · Log call · ⤢ · ›`
   (01 §4; the Portal shows `+ Task` and ›); v12's header "Show all items" ▸ on `CTable`;
   `components/kit/DropdownMenu` (6 users) duplicates the `CPopover` menu — move its users, then
   delete it.
4. **Whole-Portal adoption (scope 1–2).** The one list table is `CTable` (UI MASTER: one kit,
   `/ui`); it serves only Sales Order Outright today. `components/register/DataGrid` still serves 56
   pages (SO Batch, Forecast Purchase, Purchase Orders, Receiving, Warehouse, Delivery, Payments,
   Finance, Workspace Tasks, Settings lists…). Order (UI MASTER): SO Batch → Workspace and Tasks
   (source links, task completion updates) → then down the side menu. Per page: map the DataGrid
   powers it uses (sort, filter, column chooser, grouping, export) onto `CTable` or into the kit,
   build, kit-check at three widths, baselines, then delete what it replaced. Never delete a
   working component before its replacement is verified on real data.
5. **Settings per module** at completion (owner 2026-10-05): every setting, its door, its current
   value or default, which are empty, who sets it.

## 5 · Pending owner/design decisions (bring only these)

- Short toolbar: **one line (recommended)** — keeps 01 §4 "36 high, one line, never wraps"; the table
  and panels never move; chips become icons (words on hover) — vs **two rows** — chip words stay
  visible; costs 40 px of list; the layout jumps when a filter is added; panels need the offset;
  carres-check rule 2 must change.
- Design package conflicts, to settle in Design's files: Layout Standard says header "white" (01 and
  v12 measure #F8F9FA) and footer "never short forms" (fix list answer 1 of 14 Oct asked for short
  forms); package brief `1 Sales Order Outright.md` is stale (Title Case headers, 2-digit years).
- Long product names in MPR create (`…` + full identity under the row): Design PREVIEW pending
  Jess. Manual Purchase Request is NOT started.
- Earlier lane, still open (2026-09-14 Payment checkpoint, see Git history): the unresolved-owner
  sentence `Nobody holds Delivery Duty.`; a permanent home for the assignment pool; the pooled
  test account `operation-test@x.com`.

Do NOT ask Jess again about `· passed` (removed; the governed preserved-date behaviour stands) or
any decision already recorded in COPY or a MASTER.

## 6 · Data truth and unverified items

- No order row is proven genuine business data (CLAUDE.md §6). Flags: dealer `AutoCount Archive`
  / `source_system = autocount` (37 orders, imported), `rental` (11), test-looking names (SO-1340,
  1339, 1333, 1328), test SKU `MEMORY-FOAM-PILLOW-asd` (also in the catalog). Supplier master and
  catalog are configuration, not yet verified by the owner.
- SO-1340: 14 open, unsent, version-1 POs (all Nice Future) source one qty-1 line; 6 order lines
  are over-covered like this. Read-only finding; no record changed.
- UNVERIFIED: PO review (this login shows no Issue PO; the issue workspace POSTs only on Issue);
  SO editing/amendment (not opened — it may create a draft); long product names on SO item rows (no
  Outright order carries a long catalog item).

## 7 · Shared kit sources (one kit)

`apps/web/src/components/carres/` (CTable, CToolbar, CPopover, CSidePanel, CPill, MIcon) ·
`apps/web/src/components/kit/` (Tabs `SEGMENT` 32, Button, DialogFrame/Modal, FieldFrame,
CompactModuleCard, …) · `/ui` (`pages/dev/UiShowcase.tsx`) · `docs/01-design-tokens.md`,
`docs/02-components.md`, `docs/03-page-patterns.md`, `docs/ui/MASTER.md` §6.0 · checks
`docs/ui-reference/sales-order-design/carres-check.js` and `carres-align.js` · specimens
`docs/ui-reference/sales-order-design/*.dc.html` (content and flow only; never copy their styles).
Design Round 4 → Portal: Shell → PortalSidebar · ShellHeader/ModuleHeader · CToolbar · CSidePanel ·
ShellTasks; Table → CTable; Button → kit Button; Dialog → kit DialogFrame/Modal; Field → kit
FieldFrame / CompactModuleCard rows; Menu → CPopover/CMenuItem.

## 8 · Restart message

`Carres UI kit lane — CONTINUOUS BUILD. Read CLAUDE.md, docs/ui/MASTER.md "How design and Code
work", and docs/handoff/CARRES-CONTINUOUS-BUILD-HANDOFF.md on branch build/so-outright-kit
(PR #2066). Start at §4.1 and follow §4 in order; bring only §5 decisions to the owner. Do not
start Manual Purchase Request.`

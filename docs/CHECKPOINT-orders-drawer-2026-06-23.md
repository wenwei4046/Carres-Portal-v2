# CHECKPOINT — Operation order-drawer redesign (2026-06-23)

## ▶ RESUME (session 3 — READ THIS FIRST)

**Where the work is:** branch **`feat/orders-drawer-redesign`** (PUSHED to origin), in a git
**worktree** at `C:/Users/User/carres-worktrees/orders-drawer` (deps installed, `.env.local`
copied in, the in-app preview `.claude/launch.json` already points here). HEAD = `ad537ba`
(or later). Main repo `…/OneDrive/Desktop/Carres-Portal v2` stays on `main` = `origin/main`.

- **SAME machine (new chat opens here):** the worktree already exists — **just keep working
  IN it**. Operate on files under `C:/Users/User/carres-worktrees/orders-drawer/...` and run
  git as `git -C "C:/Users/User/carres-worktrees/orders-drawer" …`. **Do NOT delete the
  worktree. Do NOT `git checkout feat/…` in the main repo** (the branch is held by the
  worktree → that checkout errors). No fetch/checkout needed; the work is already on disk.
- **DIFFERENT machine (e.g. home):** no worktree there — `git fetch origin && git checkout
  feat/orders-drawer-redesign` directly in the cloned repo (a worktree is NOT required).
- Delete the worktree (`git worktree remove`) ONLY after this feature is merged to main + shipped.

**NOT merged to main, NOT deployed** — await `上线`. Tune visuals in the LIVE v19 preview
(operation@carres.com, real prod data) — NOT in mocks (the muted mock palette misled us for
~11 iterations; real v17 colour is stronger).

**DONE (all committed on feat):**
- ✅ **RECONCILE** with origin/main (Jess phase 11 + sofa engine) — migrations renumbered
  **0167-0170 → 0180-0183** (NOT applied to prod). See §0.
- ✅ **Drawer tweaks** (`1f040dc`): #SO bigger+bold; outstation "Call before PO" copy.
- ✅ **⭐ Follow-up star** (`a3ba0f3` + kit-fix `29258cf`): Gmail-style, **web-only, NO
  migration** — reuses `order_annotations` follow_up/resolved tags. Drawer-header star +
  Orders-list ⭐ column + "Starred" filter chip; `useAddAnnotation` now also invalidates
  the orders list. On the v17 `warning` token. Helper `apps/web/src/lib/follow-up.ts`.
- ✅ **Orders list redesign B1** (`ad537ba`): rebuilt the `OperationOrdersControl` table —
  Order split into 3 cols (Order ID · Ref No · Customer); **Due** (countdown, red when
  urgent) its own col before **Deadline** (date); Logistic→**Carrier**; **Stock** before
  **Qty**(total)/**Items**(2-line summary: core dark on top, accessories dim below, each
  tag keeps its size e.g. `1× MS(K)`, each tier truncates → 2 lines max); ⭐ promoted to
  its own column; column grid-lines + zebra; minWidth 1280 (horizontal scroll); top
  pagination + Region/Stock filter rows kept; Process column dropped. 29/29 tests pass.

**ACTIVE: the Orders PANEL redesign — B1 done, B1b/B2/B3 next** (Jess drove 11 mocks; the
LOCKED spec is this):
- **B1b** — every column filterable (a `▾` per header, reuse the SO Maintenance DataGrid
  filter pattern) + **FREEZE the left columns** (sticky Order ID) for the horizontal scroll.
- **B2** — an **"Action needed" column**: typed, labelled, clickable chips per order
  (🔔 follow-up / 🚨 escalate / 💰 refund / 📋 service) so operators see WHAT to do without
  opening each order. follow-up/escalate come from `order_annotations` (have); **refund +
  service cases need the list query to embed/count them** (backend). ONE column, NOT five
  (Jess agreed: 5 columns would be 90% empty).
- **B3** — a right-hand **Alerts rail** in the ops-cockpit right rail (beside
  Calendar/Keep/Tasks): escalate-tagged notes surface here FOR JESS (not just the dashboard
  `EscalationInboxCard`). `useEscalations` + `/api/operation/escalations` already exist.
- **Header polish** — keep all rows (tabs + Region + Stock — Jess: do NOT delete) but fix
  hierarchy: status tabs = segmented PRIMARY; Region/Stock = labelled SECONDARY filter rows.
- **Colour restraint** — one signal colour per row: Stock carries colour, Due-overdue red,
  **Status pill → demote to quiet** (Jess wants it calmer; it's still a filled pill after B1).
- Live-tune with Jess: row height/spacing + exact colours, in the v19 preview.

**PAUSED: STORAGE-FEE COLLECTION** (approved earlier, full plan in §"NEXT" below + tasks
#7-#10). Resume after the Orders panel redesign, OR when Jess says.

**Detail of the two features decided earlier (STAR = ✅ done; STORAGE = paused):**
1. **STORAGE-FEE COLLECTION — APPROVED, build next.** Workflow: storage fee accrues
   from ETA (**MS/BF RM150/mo, Sofa RM200/2wk**, auto + editable); operation **collects
   it BEFORE delivery** → issues a **receipt** (PDF, opened from the ⋮ menu) → **delivery
   is GATED** until collected → if customer won't pay, operation requests a **waiver that
   needs principal (Jess) approval**. Build plan (also tasks #7-#10, office-only):
   (a) migration **0184** — add `storage_paid_amount` / `storage_collected_at` /
   `storage_receipt_no` to `ops_order_control` + `storage_waiver` value to the
   `approval_kind` enum; (b) shared storage-owing calc + zod; API `collect-storage` /
   `request-waiver` (creates an `approvals` row) / `storage-receipt-data` + a
   **storage-unpaid GUARD** on the dispatch RPC; (c) drawer Storage section Collect +
   Request-waiver buttons + **rebuild the ⋮ Download submenu Google-Sheets style**
   (Excel / PDF / CSV always-on + SO / Invoice / DO / **Receipt**) + a storage-receipt
   PDF template; (d) extend `approval_decide` for `storage_waiver` + show it in the
   principal Approvals list. Mirror: `approval_decide` (migrations 0001/0014 + apps/api
   principal/approvals.ts + apps/web ApprovalDrawer.tsx); invoice/DO PDF
   (apps/web/src/lib/pdf/{invoice,do}-template.tsx, JSON-from-API → browser @react-pdf);
   dispatch RPCs `operation_attach_do_and_deliver` (0128) + `operation_confirm_proceed_request_v3`.
2. **STAR / follow-up flag — ✅ DONE** (`a3ba0f3`, web-only via `order_annotations`; see
   RESUME above). Original plan: Operation is run by MULTIPLE people with mid-order handoffs. Plan
   (my rec, Jess liked it): a Gmail-style **⭐ Star in the drawer header** → shows in the
   Orders list + a **"⭐ Follow-up" filter chip** (next to the Urgent chip) → filter to
   flagged orders. The "why / what's left for the next person" reuses the existing
   AnnotationTimeline note (records who/when/what). Unify with the existing
   list-invisible `🔔 Follow up` annotation tag. Small: 1 boolean on `ops_order_control`
   + header star + list icon + filter chip.

**Still pending from before:** Q2 (GRN two-way sync + stock reserve), Q5 (courier-when-received).

> Preview note (office machine only, ignore at home): ran from the worktree at
> localhost:5173 (operation@carres.com, live prod). The office main repo's
> `.claude/launch.json` `web` was repointed at the worktree — uncommitted, local-only.

---

Handoff for a new chat. The redesign was built in worktree `orders-column`
(branch `phase/10-orders-column`), then **fast-forward merged into LOCAL `main`**
(HEAD `14d43a3`); the branch + worktree were removed. **It was NOT pushed to origin.**

---

## 0. ✅ GIT STATE — RECONCILE DONE (2026-06-23)

**Reconciled 2026-06-23** — the work now lives in worktree
`C:/Users/User/carres-worktrees/orders-drawer` on branch **`feat/orders-drawer-redesign`**
(merge `da5dba8` + reconcile-fix `fc24777`). Main repo `main` = `origin/main`
(`3d69fc2`), clean + deployable; the 32 commits were NOT lost. Safety nets:
`backup/orders-drawer-2026-06-23` + reflog `69d7d1d`. **NOT pushed / NOT deployed** —
awaiting `push` / `上线`. What the reconcile did:
- migrations **0167–0170 → 0180–0183** (origin reached 0179; pure `ALTER TABLE
  ops_order_control ADD COLUMN`, renamed only). **Still NOT applied to prod.**
- OperationOrdersControl: kept the orders-drawer layout; phase 11's **Process**
  (`proceed_date`) column auto-merged in → table is now 9 cols (colSpan 9).
- OrderControlPanel: kept the field-group refactor (the `OrderControlPanel` default
  export is GONE); phase 11's `proceedDate` sewn into `RoutingFields` (set_order_date
  now requires `proceedDate <= delivery date`).
- OrderDetailDrawer: kept the redesigned body; phase 11's enum rename
  (`proceed_request→confirmed`, `awaiting_operation_action→in_production`) auto-merged
  into stage derivation + ActionBar.
- CLAUDE.md §17.1 → took origin's status table (through 0179).
- The DECISION below resolved itself: phase 11 touched these files only ~40 lines
  (enum + proceedDate) vs the redesign's 1528 → orders-drawer is the body, phase 11 a graft.
- **Verified**: tsc shared/api/web clean · web 725 pass / 5 fail + api 805 pass / 3 fail
  (all §17.7 pre-existing) · shared 344/344 · vite build OK.
- **To ship** (after go): apply 0180–0183 to prod (project `kfprgpjpaffedghytstl`) →
  merge `feat/orders-drawer-redesign` → `main` → push → deploy api+web (§4, new numbers).

<details><summary>Original divergence analysis + reconcile plan (now executed)</summary>

After the merge, local `main` and `origin/main` had **DIVERGED**:
- **local `main` is ~32 commits ahead of origin** = this whole redesign (incl.
  migrations **0167–0170**) + a few earlier unpushed docs commits. **Unpushed + precious.**
- **`origin/main` is ~104 commits ahead** (Jess/wenwei **phase 11 state-redesign**,
  sofa phases, product catalog…). Common ancestor ~`750681f`.
- A plain `git pull` merges 104+32 → **conflicts** in migrations (number collision) and
  the operation pages (Jess redesigned the SAME files). **Never reset/force the 32 away.**

**Safe reconcile (no `reset --hard`):**
```bash
git fetch origin
git branch backup/orders-drawer-2026-06-23 main      # 1. double safety (also in reflog)
git branch feat/orders-drawer-redesign main           # 2. park the work
git checkout feat/orders-drawer-redesign
git branch -f main origin/main                         # 3. align main to origin (main not
                                                        #    checked out → moving ref is safe)
# 4. on feat branch: rebase/merge onto new main + resolve. KEY:
#    - renumber migrations 0167–0170 to after origin's highest (`ls supabase/migrations | tail`);
#      they're independent `ALTER TABLE ops_order_control ADD COLUMN IF NOT EXISTS` → rename only.
#    - operation pages conflict with Jess's phase 11 → see DECISION below.
# 5. push + deploy after clean.
```
**DECISION needed from Loo:** Jess's phase 11 redesigned the operation pages
(`OrderDetailDrawer` / `OperationOrdersControl` / `OrderControlPanel`) — confirm whether
the orders-drawer redesign re-applies on top of phase 11 or is partly superseded, before
resolving those file conflicts.

**Leftover clutter:** `.claude/worktrees/orders-column` (+ old `order-panel`) folders are
de-registered (`git worktree list` shows only main) but the physical dirs couldn't be
deleted (OneDrive/long-path lock — that's the `git worktree prune` Permission-denied).
Harmless; delete manually or on reboot.

</details>

---

## 1. State at checkpoint

- Branch `phase/10-orders-column`, 29 commits ahead of `main` (`git log main..HEAD`).
- **New migrations (NOT applied to prod DB yet; renumbered to `0180`–`0183` in the 2026-06-23 reconcile — see §0):** `0167`–`0170` (now `0180`–`0183`) on `ops_order_control`:
  - 0167 — `logistic_eta`, `paid_amount`, `storage_paid`
  - 0168 — `line_locations` jsonb, `called_customer` bool
  - 0169 — `storage_to` date
  - 0170 — `line_etas` jsonb
- Tests: web **537 pass / 5 fail** (all 5 pre-existing per CLAUDE.md §17.7 — OhanaSofaTab×4, NiceFutureMattressTab×1). typecheck shared/api/web clean.
- Verified in preview against live data throughout.
- ⚠ **Deploy-gated:** the new overlay fields (line_locations, line_etas, logistic_eta,
  paid_amount, storage_paid, storage_to, called_customer) **render + edit in preview but
  cannot SAVE** until migrations 0167–0170 are applied AND the API is deployed (live API
  zod is `.strict()`, rejects unknown fields).

## 2. What shipped this session (all committed)

Orders **list**: free-text SKU → MS/BF/SOF classifier; per-size tags (`1× MS(K)` +
`2× MS(Q)`, not `3× MS(K,Q)`); fixed item sequence (mattress→bedframe→sofa→pillow→M.P→
service); compact customer name; darker table headers; **Stock-status filter row**
(All/Ready/Waiting/Not set); ref-no (`source_ref`) shown under customer on Order ID cell.

Order **drawer** (`OrderDetailDrawer.tsx`): 5 colour-accented collapsible sections;
**Order header** holds `#SO` + status chip + ⋮ menu + × (no separate top bar);
**Items table** = Item · Qty · **Ready** · **Location** · **ETA**, duplicate-SKU rows
combined; per-item **Location** (defaults: mattress→Nice Future, bedframe/sofa→Ohana,
accessories→Carres Klang, service→N/A; dropdown `STOCK_LOCATIONS` = Carres Klang / Houzs
Balakong / Nice Future / Ohana / at-supplier); per-item **ETA** (defaults to linked PO's
`eta_date`, overridable); **Ready** column = live free warehouse stock per item;
**Delivery & control** 2-col (LEFT Operation: Region/Logistic/Deadline/Called? · RIGHT
Logistic updates: Logistic ETA/Time slot · remarks full-width below); call-first
proceed gate (outstation must tick Called?); **Payment** 2-col (Bill/Paid/Outstanding/Pay
status | Storage); **Storage** From→To (To auto = logistic ETA else today, editable),
auto fee MS/BF RM150/mo + Sofa RM200/2wk split lines, **storage alert chip** (deadline-
style pills `Due soon Nd` amber / `Overdue Nd` red+⚠, no emoji); ⋮ menu = Google-Sheets
style with **Download ▶** flyout (SO PDF / Invoice / DO / Excel); drawer width 920px.

Shared/infra: extracted `apps/web/src/lib/line-category.ts` (lineCategory/lineSize/
accShort/lineKind/lineSortRank/defaultLineLocation) — ONE copy shared by the list + drawer
(mirrors server `resolve_demand_category`, migration 0148). Storage rule + `computeStorageFee`
in `@carres/shared`.

## 3. PENDING — pick up here in the new chat

### Q2 — GRN two-way sync + stock reservation (the big one)
Today the drawer's per-item **Location/ETA are manual overlay notes** (`line_locations`,
`line_etas`); the **Receiving panel** (`OperationReceiving.tsx`) does the real GRN
(PO `received_qty` + `stock_movements`). They are NOT linked. Build:
- **Reserve from ready stock**: when an item's Location = `Carres Klang` for N units →
  reserve N from free stock (free→reserved); GRN receipt flips reserved→fulfilled; order
  cancel returns them. (This is also Jess's *"ready should put warehouse, once click the
  warehouse column"* — clicking the warehouse location should pull/reserve ready stock.)
- **Two-way GRN**: GRN received in Receiving → reflect "received/at warehouse" on the
  drawer item; allow the equivalent action from the drawer.
- Needs backend (RPC + stock_movements), schema, and Receiving-panel wiring — scope it
  properly; do NOT fake it as overlay-only notes.

### Q5 — courier-when-received (per item)
Out-of-stock accessory (e.g. pillow) ordered + couriered to the customer when stock
arrives. Per-item flag + a reminder/Task when its GRN posts. Belongs WITH Q2 (post-
receiving handling). V1 today = manual (set Location=at-supplier + a Task).

### Other open (lower priority)
- Storage alert: only renders in the drawer (Payment section); the Orders **list** row
  has no overlay data, so no list chip without extra fetch.
- On `bulk`/list visibility of storage owing if wanted later.

## 4. To deploy this session (上线) — exact steps
1. Apply migrations **0180, 0181, 0182, 0183** to prod DB (Supabase MCP `apply_migration`,
   project `kfprgpjpaffedghytstl`). All additive/nullable → zero-downtime.
2. `git checkout main` (main repo) → merge `phase/10-orders-column` → push.
3. Build + deploy **api** (wrangler) + **web** (`wrangler pages deploy --branch=main`,
   Wenwei4046 CF account `CLOUDFLARE_ACCOUNT_ID=e2494242…`). See memory
   `project-web-deploy-mechanism`.
4. Verify: 401 health on api; web bundle markers; `SERVICE_ROLE` grep on dist clean.
5. Remove the worktree `.claude/worktrees/orders-column` once merged.

## 5. Key files
- `apps/web/src/pages/operation/components/OrderDetailDrawer.tsx` — the drawer.
- `apps/web/src/pages/operation/components/OrderControlPanel.tsx` — `useOrderControlForm`
  (overlay draft: line_locations, line_etas, logistic_eta, paid_amount, storage_*,
  called_customer) + field-group components + Storage block + storage alert.
- `apps/web/src/pages/operation/OperationOrdersControl.tsx` — the list + filters + itemTags.
- `apps/web/src/lib/line-category.ts` — shared line classifier + defaults.
- `packages/shared/src/schemas/ops-order-control.ts` — overlay zod + STOCK_LOCATIONS +
  STORAGE_RATES + computeStorageFee.
- `apps/api/src/routes/operation/order-control.ts` — GET/PUT overlay (select lists carry
  all the new cols).
- `supabase/migrations/0180–0183` — the overlay columns (renumbered from 0167–0170 in the 2026-06-23 reconcile).

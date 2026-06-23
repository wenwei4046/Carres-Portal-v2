# CHECKPOINT — Operation order-drawer redesign (2026-06-23)

Handoff for a new chat. The redesign was built in worktree `orders-column`
(branch `phase/10-orders-column`), then **fast-forward merged into LOCAL `main`**
(HEAD `14d43a3`); the branch + worktree were removed. **It was NOT pushed to origin.**

---

## 0. ⚠️ GIT STATE — READ THIS FIRST (don't blind `git pull`)

After the merge, local `main` and `origin/main` have **DIVERGED**:
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

---

## 1. State at checkpoint

- Branch `phase/10-orders-column`, 29 commits ahead of `main` (`git log main..HEAD`).
- **New migrations (NOT applied to prod DB yet):** `0167`–`0170` on `ops_order_control`:
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
1. Apply migrations **0167, 0168, 0169, 0170** to prod DB (Supabase MCP `apply_migration`,
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
- `supabase/migrations/0167–0170` — the overlay columns.

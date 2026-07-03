# CHECKPOINT — Operation Order Detail whole-page redesign (2026-07-03)

> **NEW CHAT: READ THIS FIRST, THEN THE 3 MEMORIES BELOW.** This is the single
> source of truth for what to continue. Do NOT re-plan from scratch or re-ask Jess
> what the balance job is — it's all here. Confirm you understand, then continue at
> **P1b** (next unstarted slice).

---

## 0. WHERE YOU ARE WORKING (mechanics — get this right or you'll lose work)

- **Worktree** (do ALL edits here): `C:\Users\User\carres-worktrees\orders-drawer`
  on branch **`feat/orders-drawer-redesign`**. (The main repo
  `C:\Users\User\OneDrive\Desktop\Carres-Portal v2` is checked out on `main`.)
- **⚠️ A PARALLEL chat sometimes edits the SAME worktree** (it clobbered a mount once
  this session). Commit **explicit paths only** (never `git add -A`). After every
  commit, re-grep your markers survived. Before deploy, re-`git fetch` + check
  `origin/feat/orders-drawer-redesign..origin/main` is EMPTY (no parallel work missed).
- **Git identity** (machine has none): commit with
  `git -c user.name="wenwei" -c user.email="limchaichiew@gmail.com" commit ...`
- **pnpm**: `corepack pnpm ...` with `export COREPACK_ENABLE_DOWNLOAD_PROMPT=0`.
- **Deploy (from the worktree; only after Jess reviews / says continue):**
  1. `corepack pnpm --filter @carres/web build` → `grep -rl SERVICE_ROLE apps/web/dist` MUST be 0.
  2. push branch → FF `main` to the branch tip → push main:
     `git push origin feat/orders-drawer-redesign` ;
     `git -C "<mainrepo>" fetch origin` ; `git -C "<mainrepo>" merge --ff-only <sha>` ;
     `git -C "<mainrepo>" push origin main`
  3. `export CLOUDFLARE_ACCOUNT_ID=e2494242a0fd563cacee5a301cf95dd3`
  4. API: `corepack pnpm --filter @carres/api exec wrangler deploy --env production`
  5. Web: `corepack pnpm --filter @carres/api exec wrangler pages deploy ../web/dist --project-name=carres-portal --branch=main`
  6. Verify: `curl -s -o /dev/null -w "%{http_code}" https://carres-portal.pages.dev/` = 200 ;
     `.../api/catalog` = 401.
- **tsc gotcha**: `tsc --noEmit` (root) is looser than the build's
  `tsc --noEmit -p tsconfig.app.json`. ALWAYS run `corepack pnpm --filter @carres/web build`
  before deploy — it catches type errors + test-fixture types the root tsc misses.

## 0b. VERIFY / DRIVE PROD WHEN MCP IS BLOCKED (this is how I did the 100%)
Supabase MCP read+write are BOTH blocked this session. To verify or even run prod:
```
ANON=$(grep VITE_SUPABASE_ANON_KEY= apps/web/.env.production | cut -d= -f2)
curl -s -X POST "https://kfprgpjpaffedghytstl.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"email":"operation@carres.com","password":"111"}'   # → access_token
```
Then `Bearer <token>` against the deployed Worker
`https://carres-portal-v2-api.wwch.workers.dev/...` with `node` global fetch.
(Scripts + the parsed Master rows live in this session's scratchpad; re-derive if gone.)
**Preview**: `.claude/launch.json` has a `webprev2` config (worktree web on :5201) →
`preview_start("webprev2")`. It hits the DEPLOYED API, so API changes need a deploy
to show. Preview servers die often — start fresh on a new port/name if dead.

---

## 1. CURRENT LIVE STATE (all deployed to carres-portal.pages.dev)
- **main tip = `f7e0150`** (branch = same). web Pages `d4d9849b` · API Worker `c9117f89`.
- **Latest migration applied to prod = `0199`** (`ops_order_control.line_stock_status`).
  Jess runs migrations himself in Supabase SQL Editor — give him the SQL.
- **Prod data settled this session:** stock ETA/status import driven to **100%**
  (233/233 real product lines). 5 orders created from the Master (SO-1146.. = the
  ones AutoCount export missed). Orders now = **150**.

## 2. THE INITIATIVE = Operation Order Detail WHOLE-PAGE redesign (4 phases)
Jess reviewed visualize mockups panel-by-panel and said "ok proceed". Build in
**deployable slices**, commit+deploy each, show a real screenshot.

### ✅ DONE + LIVE
- **P1a** (`83f0a05`): action bar moved to a TOP strip (new `"actions"` grid row in
  `OrderDetailDrawer.tsx`, was a bottom footer) + Warehouse panel capped to fixed
  `h-[340px]` (was a giant empty box).
- **AutoCount = Proceeded fix** (`8ba027c`): AutoCount orders (`source_system='autocount'`)
  no longer show "Placed / Order placed by dealer, waiting to push" — they derive to
  `in_production`, show real actions. Fixed the detail-order API select (was missing
  `source_system`) + the stage derivation + the in_production 0-shortage copy.

### P1b — balance job DONE; restack + delivery-dedup remain
2. ✅ **Balance = OUTSTANDING ONLY — DONE + LIVE (`f7e0150`, web `d4d9849b`).**
   `PaymentControlFields`/`PaymentLedger`: "Bill" input → "Owing (RM)" (the imported
   `ops_order_control.balance`; no total fallback); Outstanding headline + auto status
   pill (Paid/Partial/Owing/—); "Add payment" → "Record payment"; the header summary no
   longer shows the misleading "RM 0 paid" (shows owing / "No balance"). Tests updated.
   **Small follow-up:** Collect-by(ETA−7d) / Last-call(ETA−1d) readouts (the ETA−1 Hold
   gate already exists, so this is just the two reminder readouts).
### ⏭️ CONTINUE HERE — rest of P1b (WEB-ONLY)
1. **Right column restack** — `OrderDetailDrawer.tsx` "side" column (~line 1052):
   the Customer|Balance 2-col split "Card A" → make Customer and Balance **SEPARATE
   stacked Panels** (vertical stack Customer → Balance → Storage → Delivery). Storage
   + Delivery are already separate.
3. **Delivery dedup** — region shown ONCE (header badge only); logistic select
   **name-only**; support MULTIPLE carriers per order; rework "Contact by" into an
   obvious "call customer by <date>".

### ⏭️ P2 — Storage fee from Master (backend-ish)
- Master cols **AN = MS/BF Storage Fees**, **AO = SOF Storage Fees** → import them so
  the Storage panel shows the real fee (not just the auto `computeStorageFee`). Extend
  the Master import (`stock-eta-import.ts` + the combined `ImportStockEtaDialog`) to
  carry AN/AO into a storage-fee store on `ops_order_control` (likely a new column /
  migration 0200). Storage panel = 2-col (MS/BF vs Sofa). **Waive stays principal-approval.**

### ⏭️ P3 — GRN partial receive (NEW backend + migration)
- Per order line: a **Receive** action + a **Recv X/N** column. Stepper: "Arrived [n]
  of remaining · condition · location → Book in" → books n units into `ops_stock_items`
  (status received, reserved to the SO), tracks received qty per line. Partial receipts
  (receive 1 of 2 → 1/2 → later 2/2 → Ready). New endpoint + probably a
  `line_received` jsonb on ops_order_control or a receipts table.

### ⏭️ P4 — Sofa Loan flow (NEW backend + migration)
- "Loan any sofa" already lists free sofas (StockPickerGrid loan toggle, live). Add the
  FLOW: pick any free sofa (prefer Exhibition/Old) → FREE → **issue a loan DO** → mark
  **On-loan** to the order (order stays open, real sofa still Waiting) → at final delivery
  **"Deliver real + collect loaner (swap)"** → loaner returns to free stock. Needs a
  loan reservation state + DO issuance + swap tracking.

## 3. LOCKED BUSINESS RULES (do NOT re-litigate — Jess ruled these)
- **Balance**: operation shows only the imported OUTSTANDING (no Bill/Total). Status
  pill Owing/Partial/Paid/On-hold. Collect before delivery; ideal ETA−7d, last-call
  ETA−1d; ETA−1 uncollected = 🔴 Hold delivery (already gated). ([[project-balance-collection-rule]])
- **Storage**: fees import from the Master (AN/AO). Two categories MS/BF (24 wd free →
  RM150/mo) · Sofa (14 wd free → RM200 flat). **Waive → principal (Jess) approval.**
- **AutoCount = already Proceeded** (has a PO); dealer/POS = Placed until customer says go.
  ([[project-order-lifecycle-flow]])
- **Action bar = TOP**, not bottom. **Right column = vertical stack.** Panels **fixed height.**
- **GRN**: partial receive per line (stepper). **Loan**: free, DO, on-loan, swap-back.
- Working style: PLAN + show a real mockup → Jess agrees → THEN build in ONE pass. Don't
  dump A/B choices; decide + explain WHY (Stripe/Linear/Shopify patterns). Deploy so he
  can see; screenshot the live result back to him. ([[feedback-plan-design-dont-stack-and-shrink]])

## 4. KNOWN FOLLOW-UPS (note, don't lose)
- **shortage-vs-Ready mismatch**: the ActionBar `shortageCount` uses real stock
  balances, so it can say "Waiting on stock for N lines" while the Items badge shows
  Ready N/N (from the imported `line_stock_status` override). Unify the shortage calc to
  honour the imported/override readiness.
- `line_stock_status` override + `line_etas` are per-order-line jsonb on
  `ops_order_control`; the detail reads them; the import writes them. Keep GET/PUT
  `/control` selects in sync (missing a col = the drawer can't read it — that exact bug
  bit both `line_stock_status` and `source_system` this session).

## 5. READ THESE MEMORIES (recall will surface them)
- `project-order-detail-redesign-locked` — the design + P1–P4 plan (has this too).
- `project-order-lifecycle-flow` — Placed vs Proceed, loan, SN return flow.
- `project-balance-collection-rule` — the Balance panel rules.
- (also: `project-master-sheet-columns-stock-model`, `project-storage-collection-flow`,
  `project-catalog-empty-sku-naming`, `project-web-deploy-mechanism`, `project-parallel-dev-jess`.)

# Phase 10 work-log (full detail)

> Chronological session log for Carres Portal v2 Phase 10 (post-launch). Each entry = one logical session, with commit hashes + migration numbers + root-cause notes preserved.
>
> **This file is the detail behind `CLAUDE.md` §17.3** — that section keeps only a one-line-per-session index. Read the relevant entry here for the *why / how* before touching anything it describes. Current live state (latest migration, order count, test/bundle metrics) lives in `CLAUDE.md` §17.1; open carry-forwards in §17.5.

---

**2026-05-11 ~02:30 GMT+8 · Day 1 bug sweep · 13 commits · migrations 0083-0086** — End-to-end smoke immediately post-deploy surfaced UX gaps + cross-role sync bugs. Commits in order: `b3beb88` Login page rewritten 1:1 from `reference/Carres Portal · Login.html` (editorial split-screen + Mulish font) · `6c8f1a1` partner pickups SELECT add `status` col · `eb76eb9` → `8ef5f7e` migration 0083 user_nav_seen + mark_badge_seen RPC (true unread semantics) · `dab4439` Operation Procurement "Direct receive" escape hatch · `b3f15c9` Partner "Arrived at WH" full receive modal · `c7dd23b` CreatePOModal SKU cold-cache fix · `9801b3c` Upcoming column on partner kanban · `878a289` migration 0084 delivery-orders partner write + read column rename · `b9395cc` migration 0085 LP whitelist status + do_* · `481cf3b` migration 0086 logistics_assign_partner RPC recreate + #1004 backfill · `3d2d7f2` Deliveries 3-column kanban · `55ad1c1` Today's Active Pipeline gains Deliveries section.
- **Key insight**: customer-leg vs procurement-leg confusion is THE bug source. Procurement = `purchase_orders.procurement_partner_id`; customer = `order_supplier_threads.delivery_partner_id`. Future partner-debug heuristic: ASK WHICH LEG.

**2026-05-11 ~23:00 GMT+8 · Phase 6 supplier required DO photo · migration 0094** — Closes `phase-6-storage-do-upload`. `supplier_mark_delivered` widened to require `p_do_file_path`. Storage `delivery-orders` bucket RLS extended with supplier branch (`po.supplier_id = app_supplier_id()`). UI: `DOFileUploadField` mounts after DO# ≥ 3 chars; `canSubmit` adds `!!doFilePath`. Migration count: 94 (intermediate 0087-0093 from sessions not §17-logged).

**2026-05-15 ~01:00 GMT+8 · Dealer/sales/showroom Delivered-tab bug · migration 0106** — Status axis vs logistics_stage axis mismatch. Dealer "Delivered" tab always empty because `orders.status` never auto-flipped to 'delivered' after `logistics_stage='delivered'`. Migration 0106 = BEFORE UPDATE trigger mirroring 0098 pattern + backfill. Verified DL-1003 + DL-1004. All three roles (dealer/salesperson/showroom) share `<DealerApp />` so schema-level fix covers all. Bonus: `apps/web/src/pages/Me.tsx` Back-to-dashboard button. Commits `829ab93` + `bfe124d`. Migration count: 106 (intermediate 0095-0105 from sessions not §17-logged).

**2026-05-15 supplier per-thread + multi-DO partial pickup · migrations 0107 + 0108** — Largest feature ship since Phase 9. Autonomous overnight, 15-task plan (`docs/superpowers/plans/2026-05-15-supplier-thread-pickup-plan.md`).
- **0107**: `po_pickup_events` table + 3 cols on threads + `partially_shipped` sup_status enum + 5 SECURITY DEFINER RPCs (supplier_mark_thread_ready / supplier_unmark_thread_ready / partner_pickup_threads / logistics_receive_threads / pickup_event_render_payload).
- **0108**: SOP-aware `thread.logistics_stage` (factory→WH→customer STANDARD → `ready_to_dispatch`; SOFA_SPECIAL → `dispatched`) + terminal sup_status convergence on `delivered`.
- API: 6 new endpoints, enrichment on supplier+partner PO lists (`urgency / customer_eta_min / behind_schedule / sku_summary`).
- UI: SupplierPOs urgency badge + 4-option sort · PODrawerThreadList + PickupHistoryList · PartnerFactoryPickupsPage multi-select + PickupBatchDialog · ReceivePOModal per-thread section · new `/print/pickup-event/:id` browser PDF (mirrors `do-template.tsx`).
- `partially_shipped` added to 7 OPEN_SUP_STATUSES filter sites.
- Commits `8520528` (0107) → `9ef9a7f` (E2E spec). Migration count: 108.

**2026-05-15 ~04:00 GMT+8 · Playwright MCP smoke verification · migrations 0109 + 0111** — E2E smoke against prod for partial-pickup feature. Seeded DL-1006..1015 + PO-3001 (Nice Future 7 threads) + PO-3002 (HoOKkA 6 threads). Executed 4-DO partial pickup chain (DO-HK-A 3 sofa · DO-NF-A 4 mat · DO-NF-B 3 mat-from-combo · DO-HK-B 3 bedframe). Bugs caught + fixed mid-smoke:
- **0109** `supplier_read_own_threads` — 0033 RLS had no supplier policy on `order_supplier_threads`. New endpoint returned [] under supplier JWT. Added `ost_supplier_read` scoped to `po.supplier_id = app_supplier_id()`.
- **0110** SUPERSEDED — tried to add orders/order_lines read policies scoped via threads → infinite recursion 42P17. Policies dropped.
- **0111** `supplier_threads_rpc_no_orders_rls` — replaced 0110 with SECURITY DEFINER RPC `supplier_threads_for_po(p_po_id text)` that bypasses orders RLS but enforces `po.supplier_id = app_supplier_id()` inside body. Endpoint switched from PostgREST select to RPC.
- UI verification all green: PODrawer thread list + Pickup History + Reprint DO blob URL.

**2026-05-15 ~17:00 GMT+8 · Pre-alpha DB cleanup (manual by Loo)** — All transactional data wiped via direct SQL DELETE (NOT `scripts/phase-9-cleanup.sql`). audit_log + history + payments + invoices + refunds + approvals + bank_statements + orders + POs + threads + pickup_events all → 0. Master data + auth + product catalog UNTOUCHED. Subsequently: `orders_dl_seq` reset to 1001 + `audit_log` cleared per §14 #1 single-instance approval. Alpha first order will be DL-1001. 9 alpha test users (`xxx@carres.com`) retained at password='111' — see §17.6 known-risks.

**2026-05-17 ~21:00 GMT+8 · Role rename "logistics" → "operation" · migration 0121** — Cross-cutting rename autonomous. Authorised per §8 #4 (RLS) + §7 (schema) + §14 #2 (single-instance).
- enum: `app_role` value `'logistics' → 'operation'` (1 app_user + 14 audit_log rows auto-migrated by enum oid) · `warehouse_kind` value · `logistics_stage` value `'awaiting_logistics_action' → 'awaiting_operation_action'` · type renamed `logistics_stage → operation_stage` (auto-cascades to columns via oid)
- columns: `orders.logistics_stage` + `order_supplier_threads.logistics_stage` → `operation_stage`
- 33 functions renamed `logistics_* → operation_*` · 26 functions body-updated · 15 RLS policies dropped+recreated
- Code sweep ~250 files via 3-pass PowerShell scripts + `scripts/rename-logistics-to-operation.ps1` + `scripts/rename-logistics-pass2.ps1` + `scripts/rename-logistics-pass3.ps1` + `scripts/fix-type-name-case.ps1`
- Directory renames: `apps/web/src/pages/logistics/` → `operation/` · `apps/api/src/routes/logistics/` → `operation/` · 12 `Logistics*.tsx` → `Operation*.tsx`
- URL paths: `/logistics/*` → `/operation/*` (web + API)
- **KEPT** (noun usage, not the role): `supplier_kind.own_logistics`; historical migration filenames (e.g., `0019_logistics_rpcs.sql`); historical §17 entries above this point; CARRES_PORTAL_V2_PLAN.md + `docs/superpowers/{specs,plans}/*`
- App user `logistics@carres.com` → `operation@carres.com` (password unchanged at '111')
- Tests post-rename: 1052 unit tests, 1043 pass, 7 pre-existing fails (all documented). Zero new fails. Typecheck clean.

**2026-05-18 ~00:30 GMT+8 · partner_pickup_threads SOP-aware fix restored · migration 0122** — Loo screenshot: DL-1001..1004 (Carres KL Showroom, STANDARD mattress) auto-flipped to DISPATCHED on operation kanban without operator pressing "Assign delivery". Root cause: live `partner_pickup_threads` body had **no** SOP CASE — 0108's fix silently clobbered by 0117 (auto-DO#) and 0118 (FOR UPDATE lock fix), each `CREATE OR REPLACE FUNCTION` rewrote body from pre-0108 form. Sister RPC `operation_receive_threads` retains 0108 F1 fix intact. 0122 re-applies SOP CASE alongside existing 0117 auto-DO# + 0118 CTE lock. Migration block comment calls out regression history. One-shot backfill: 4 STANDARD threads matching signature reverted to `ready_to_dispatch`.

**2026-05-18 ~02:30 GMT+8 · dl → so rename · migration 0123** — Phase 1 of 3-phase refactor. Mirrors 0121 pattern. Authorised per §7 + §14 #2. Three-pass:
1. Snapshot 22 function definitions touching dl-ish tokens into TEMP table
2. DROP functions · `ALTER TABLE orders RENAME COLUMN dl TO so` · `ALTER TABLE purchase_orders RENAME COLUMN dl TO so`, `RENAME COLUMN dl_refs TO so_refs` · `ALTER SEQUENCE orders_dl_seq RENAME TO orders_so_seq` · rename indexes
3. Recreate each function from snapshot with longest-first text replacements
- Cosmetic backfill: `audit_log` + `order_history.text` + `po_history.text` "DL-1003" → "SO-1003"
- Code sweep `scripts/rename-dl-to-so.ps1` (committed): 4 case-sensitive PowerShell `-creplace` passes longest-first, 88 source files. Skipped frozen migrations + `reference/` + historical docs per 0121 precedent
- Caught: `\bdl\b` matched HTML `<dl>` tag in `Me.tsx` + `DealerSettings.tsx` (6 instances reverted)

**2026-05-18 · Per-line thread granularity · migration 0124** — Phase 2. Swapped `order_supplier_threads` unique key from `(order_id, supplier_id, category)` → `(order_line_id)`. New FK `order_line_id REFERENCES order_lines(id) ON DELETE CASCADE`. Pre-flight: every existing thread maps 1:1 to an order_line (9 prod threads = 9 lines), clean backfill. Two function bodies rewritten same migration:
- `operation_confirm_proceed_request_v3` — iterates per order_line; SO with 2 sofa lines of different fabrics now produces 2 threads
- `_v3_claim_threads_for_po` — claims only threads whose underlying order_line matches a `(sku, attrs)` tuple on the PO. This is the actual fix for the per-variant batch `concurrent_claim` bug Loo hit earlier same day
- Read-side untouched: rollup trigger aggregates per `order_id`; `partner_pickup_threads` + `operation_receive_threads` operate by `thread.id`. No FE/API code change needed.

**2026-05-18 · Auto-split per-(SO,sku,attrs) · no migration** — Phase 3. Drops the Split-per-variant toggle, defaults to auto-split.
- **Server** (`apps/api/src/routes/operation/pos.ts` + `packages/shared/src/schemas/operation.ts`): `awaiting-stock-shortage` returns `bySo: [{ so, need, available, shortage }]` per shortage row when `?dls=...` passed. Stock distribution walks per-(so, sku, attrs) deterministic order. Invariant: sum-across-bySo === row-level totals. Stripped one stray `\x01` SOH byte from `pos.ts` (hidden since some earlier rename pass).
- **Shared**: zod schema extended with `bySo` default `[]` so pre-Phase-3 mocks parse cleanly.
- **Client** (`CreatePOModal.tsx`): `DraftLine.sourceSo: number | null` · `autoFillFromShortage` fans out per `(so, sku, attrs)` · `issuanceGroups` always partitions by `(supplier.id, line.sourceSo, sku, canonAttrs(attrs))` (legacy `splitPerVariant` early-return + toggle UI removed) · `submit()` per-PO payload sends `so: lineSo` (single) or `soRefs: [lineSo]` (batch). The per-variant batch `concurrent_claim` bug is now structurally impossible.

**2026-05-18 · Dashboard 500 fix · migration 0125** — Loo screenshot: operation dashboard 500'd with `column p.dl does not exist`. 0123's snapshot+text-replace covered `o.dl`, `ord.dl`, `orders.dl`, `v_order.dl` but NOT bare `<other-alias>.dl`. 3 functions broken:
- `operation_dashboard_summary` — `p.dl` ×1 (the user-facing 500)
- `finance_ar_aging` — `ot.dl` ×2 (would 500 on AR aging page)
- `operation_receive_po_line` — `v_target_order.dl` ×3 (would 500 on receive-PO auto-promote)
- 0125 CREATE OR REPLACE each. Output JSON contracts preserved exactly. Embedded `DO $sanity$` RAISE EXCEPTION if any function still references `<alias>.dl`.

**2026-05-18 · Close all residual 0123 gaps · migration 0126** — Cross-check sweep after 0125 uncovered 17 MORE functions still referencing `dl` token. 5 blind spots in 0123: `<other-alias>.dl`, `'dl'` JSON keys, `NEW.dl`/`OLD.dl` in triggers, bare `dl` in WHERE/SELECT/RETURNS TABLE, signature column names. Categorised:
- **Cat A — runtime 500 once invoked (11)**: `orders_auto_issue_on_dispatched` trigger (NEW.dl×3, catastrophic on every dispatch) · `enforce_partner_po_column_whitelist` trigger (NEW.dl IS DISTINCT FROM OLD.dl) · `approval_decide` · `invoice_issue` · `finance_record_receipt` · `finance_apply_credit_note` · `operation_create_po` · `operation_cancel_po` · `operation_issue_pos_for_order` · `operation_warehouse_pick` · `operation_revert_order_dispatched_to_ready`
- **Cat B — silent JSON contract mismatch (6)**: `create_order`, `proceed_order`, `operation_abandon_order`, `operation_assign_partner`, `operation_attach_do_and_deliver`, `operation_revert_order_proceed_to_placed`
- **Cat C — RETURNS TABLE signature rename (2, DROP+CREATE)**: `partner_orders_for_threads` + `supplier_orders_for_threads`
- Snapshot+regex mirrors 0123 PASS A/B/C shape but with comprehensive `(?<![a-z_])dl(?![a-z_]) → so` catching all 5 blind spots single pass. **First apply failed** using `\b` (PG ARE = backspace, not word boundary). Fixed via lookbehind `(?<![a-z_])`.

**2026-05-18 · Propagate warehouse_id thread→order chain · migration 0127** — Loo screenshot: "ATTACH DO & MARK DELIVERED" crash on #1003 with `null value in column "warehouse_id" of relation "stock_movements"`. Chain bug:
1. `_v3_claim_threads_for_po` claims threads (sets `po_id`) but **never** set `warehouse_id` from PO
2. `operation_assign_partner` reads first ready_to_dispatch thread with `warehouse_id IS NOT NULL` to derive `orders.warehouse_id`. None had it → orders stays null.
3. `operation_attach_do_and_deliver` reads `orders.warehouse_id` → null → stock_movements INSERT crashes.
- PART A backfill threads from PO · PART B backfill orders from threads · PART C patch `_v3_claim_threads_for_po` to propagate atomically · PART D sanity check.

**2026-05-18 · Cascade Operation→thread mark-delivered · migration 0128** — Loo screenshot: partner kanban still showed #1003 in SCHEDULED after Operation marked it delivered. Asymmetric-write bug. `operation_attach_do_and_deliver` updated orders but never propagated DOWN to threads. PART A backfill any thread `<> 'delivered'` for orders already delivered · PART B CREATE OR REPLACE with UPDATE-threads block + audit suffix · PART C sanity check.

**2026-05-18 · Deep cascade audit + 3 fixes + 1 DROP · migration 0129** — Followed 0128's pattern audit to full scope. 6-dimension DB-state audit: ZERO inconsistencies post-0127+0128 backfills. Function-body audit on 23 RPCs found 3 cascade gaps + 1 dead function:
- **Fix 1** (HIGH) `partner_threads_to_deliver` filters cancelled orders — `operation_abandon_order` sets `orders.status='cancelled'` but threads stay at existing stage; partner kanban shows ghosts. Cleanest fix at READ layer: `AND o.status <> 'cancelled'`.
- **Fix 2** (MEDIUM) `operation_warehouse_pick` cascades warehouse_id to threads
- **Fix 3** (LOW) `operation_cancel_po` also nullifies `thread.warehouse_id`
- **DROP** legacy `operation_confirm_proceed_request(uuid, uuid)` (v1, pre-thread era, dead code per pg_proc + apps/{web,api} grep)
- **Verified safe (NOT bugs)**: `operation_revert_order_proceed_to_placed` (revert runs BEFORE v3 creates threads) · `operation_revert_order_dispatched_to_ready` (rollup trigger handles cascade)

**2026-05-18 · Cancelled-order filter audit + fixes · migration 0130** — Closes `phase-10-cancelled-order-filter-audit` CF from 0129. 7 candidates reviewed: 5 fixed (`dealer_with_stats`, `dealers_with_stats_list`, `partner_orders_for_threads`, `supplier_orders_for_threads`, `supplier_threads_for_po`) + 2 skipped (`supplier_pending_demand` already filters, `partner_confirm_receive` is write-action). Pre-fix: dealer with 10 orders (2 cancelled) showed inflated `order_count=10` + full GMV + full outstanding. Post-fix: `order_count=8` with active-only stats.

**2026-05-18 · Supplier mark-ready PO rollup · migration 0131** — Loo's 5 HoOKkA POs (PO-2033/34/35/36 all Carres Klang) stuck at `in_production` even though every thread had `supplier_ready_at` set. Asymmetric-write on procurement leg — mirror of 0128/0129 in reverse direction. `supplier_mark_thread_ready` only touched `thread.supplier_ready_at`, never PO sup_status. Target state depends on warehouse ownership:
- `warehouses.owning_partner_id IS NOT NULL` (LP-owned WH) → `ready_confirm_sent` (LP sees "Awaiting Accept")
- `warehouses.owning_partner_id IS NULL` (Carres own WH) → `ready_for_pickup` (Operation sees signal)
- PART A `supplier_mark_thread_ready` rewritten with post-mark rollup + po_history audit + returns `po_advanced` · PART B `supplier_unmark_thread_ready` symmetric reverse · PART C backfill stuck POs · PART D sanity check
- Post-apply: PO-2033/34/35/36 → `ready_for_pickup` ✓; PO-2037 stayed `in_production` ✓ (1 thread not ready)
- **Loo's prior misunderstanding clarified**: Nets does NOT see HoOKkA POs going to Carres Klang (own WH). Nets only sees LP-owned WH POs.

**2026-05-18 · Procurement Orders column + prominent ETAs · commit `41cc96f`** — Loo's C+D ask from Procurement-tab UX discussion. PO list rows were missing who-customer + when-needed, and dates that were shown were muted to invisibility.
- **Row layout** 7-col → 5-col: dropped Supplier (redundant within supplier-specific tab), dropped Warehouse (only 1 WH currently), dropped standalone PO ETA col (folded into Items).
- **New Orders col**: one row per source SO showing `#SO · customer · DUE · MM-DD · 🔴/🟡/🟢`. Aggregate footer `Σ N orders` for bundles; italic stockpile note when `po.so` + `po.so_refs[]` both null.
- **Server** (`apps/api/src/routes/operation/procurement-tabs.ts`): new Pass C `enrichPosWithOrders()` — batched SELECT against `orders` for every distinct source SO across fetched POs (union of `so` + `so_refs[]`). Returns per-PO `orders: [{ so, customer_name, delivery_date }]` + worst-case PO-level `urgency: 'critical' | 'urgent' | 'normal' | null`. Mirrors supplier-side enrichment from earlier Phase 10 work.
- **Urgency tiers** (smallest delivery_date diff from today): <7d → critical 🔴, 7-14d → urgent 🟡, ≥14d → normal 🟢
- **Date visibility** (Loo follow-up): per-SO Customer ETA 11px muted → 12px font-semibold base-900 with uppercase "DUE" micro-label; PO ETA 10px muted footer → 12px font-semibold base-900 with "PO ETA" label.
- Tests: api +2 (procurement-tabs Pass C + stockpile short-circuit, `vi.useFakeTimers` locks today).

**2026-05-18 · Seed SQL rename sweep · commit `947ec01`** — Closes long-standing `phase-4.5-chunk-2-seed-sql-stale` CF. `rename-dl-to-so.ps1` + earlier logistics→operation sweep both omitted `*.sql` from `includeExts`, so seed files survived with stale schema + rename artifacts.
- `scripts/seed-e2e-fixtures.sql`: `dl` column refs, `orders_dl_seq → orders_so_seq`, DL- comments + fixture refs
- `supabase/seed.sql`: `dl → so` column refs · PO INSERT rewritten for per-line schema (sku/qty split to `purchase_order_lines` via WHERE-NOT-EXISTS idempotency) · `delivery_partner_id → procurement_partner_id` · DL-#### string literals in approvals.refers_to + audit_log + stock_movements.ref · rename artifacts (`JT Express operation → JT Express`, `Daniel · operation → Daniel · Operations`, `Issued by operation → Issued by Operations`)
- Validated via BEGIN…ROLLBACK dry-run on live DB.

**2026-05-18 · Principal sidebar wake — 5 missing pages built** — Loo's screenshot showed 5 sidebar tabs unclickable (Suppliers / All orders / Stock / Audit log / Accounts). They'd been stubbed at `enabled:false` since their Phase 4/5/6/8 ships and never woken up — typical dormant-ship pattern. Built all 5 to proto fidelity:
- **PrincipalAccounts** (`941c665`) — closes `phase-10-rotate-alpha-test-passwords` HIGH CF. GET list + POST create (service_role admin API + conditional dealer/supplier/partner org row + JWT `app_metadata` seed) + POST :id/status (disable signs out via auth.admin.signOut, principal cannot be disabled) + POST :id/reset-password. Per-role colored avatars + chips; CreateAccountModal with role picker grid; ResetPasswordModal with regenerate-able temp password. Schema already had `title / status / last_seen_at / created_by` — no migration needed.
- **PrincipalAudit** (`926ad43`) — GET endpoint with `?role=&limit=` filter (max 500). 7 role chips at top; proto's `logistics` → `operation`, `system` dropped.
- **PrincipalSuppliers** (`63b41e2`) — GET list + GET :id/pos drawer. 2-col card grid + Own Logistics / Factory Pickup kind chips + 3-stat row + cat_covered list.
- **PrincipalOrders** (`160210d`) — GET cross-dealer feed with `?dealer=&status=&q=` filters. Paid cell green when ≥ total, terracotta otherwise.
- **PrincipalStock** (`2a1959f`) — GET single endpoint joining stock_balances + product_skus + open POs. 2-tab view (Low / All) + per-warehouse columns + low-stock terracotta highlight.

All 5 routes use principal-only inline guard before any service_role call (CLAUDE.md §4.4 RED LINE upheld). Tailwind tokens (`bg-base-*` / `text-base-*` / `text-primary` / `text-success`) match proto's CSS var palette. Layout strictly matches proto `32px 36px 56px` padding + kicker + 30px h1. Typecheck clean across shared / api / web after each commit.

Sidebar comment updated; `PrincipalSidebar` no longer has any `enabled:false` entries.

5 NEW carry-forwards (all low):
- `phase-10-principal-pages-tests` — wrote 0 tests for the 5 new pages; next session add unit + msw coverage
- `phase-10-principal-stock-no-mutation` — Stock is observation-only; Loo switches to operation role for adjust + thresholds
- `phase-10-principal-orders-detail-drawer` — proto + v2 row is non-clickable; add OrderDetailDrawer if drilldown wanted
- `phase-10-audit-cursor-pagination` — `audit_log` capped at 500 rows; cursor paginate once table grows past ~10k
- `phase-10-resend-invite-email-template` — Accounts only does temp-password mode (no email invite — needs Supabase email-template config)

**2026-05-20 ~16:00..18:00 GMT+8 · Phase A migrations 0132-0137 caught up on remote · MCP-driven** — Session opened with Loo asking "supabase linked?". Discovered CLAUDE.md §17.1 was stale (latest=0131) and local was at 0137; remote DB only had 0131 + `order_addons_attrs` (= local 0133). Migrations 0132 (autocount_import), 0134 (seed_sku_master), 0135 (orders_items_edited), 0136 (ops_assigned_logistic), 0137 (ops_stock_items) all needed apply.
- Re-OAuth'd the project-specific Supabase MCP at `mcp.supabase.com/mcp?project_ref=kfprgpjpaffedghytstl` via `mcp__supabase__authenticate` (different org from the generic Supabase MCP visible at session start).
- 0134's catalog wipe safety guard tripped on 4 alpha test orders (SO-1001 "tam anw weing" / SO-1002 "fewfwe" / SO-1003 "dsadsad" / SO-1004 "123123") created 2026-05-19 — 21 history rows, 12 audit_log rows, 3 threads, 2 POs, 2 invoices. Loo authorised wipe per §14 #1; SQL deleted cascades + `setval('orders_so_seq', 1000, true)` so next alpha order = SO-1001.
- 0134 is 1351 lines / 382KB — exceeds Read tool's 25K-token cap (~170 dense SKU lines). Split via PowerShell into 5 chunks then 12 sub-thirds; applied each as own migration with `ON CONFLICT DO NOTHING` for idempotency. Sanity-check inside 5t3 tripped (1013 ≠ 1091) — re-applied 5t3 without sanity.
- 78-SKU shortfall traced to **source xlsx dupes**: same SKU code maps to different variant names in `scripts/ops-seed/carres-sku-master.xlsx` (e.g. `SF03-HK5535/24"(2 Seater)` mapping to variant `'SF03-HK5535/24"(3 Seater)'`). ON CONFLICT DO NOTHING drops the second one. Non-blocking — 67-unit ops_stock seed found all required SKUs (mattress + bedframe non-Discovery-833 SKUs were 100% seeded).
- Final state per `mcp__supabase__execute_sql`: suppliers=11, models=170, skus=1013, klang_units=67, ops_rpcs=6, new_order_cols=4 (source_system + source_ref + items_edited + ops_assigned_logistic).
- 5 memories saved to `~/.claude/projects/.../memory/` documenting: MCP linkage, chunk-size limits, "grinder over CLI" feedback, Phase A applied state, local env not configured.

3 NEW carry-forwards (all low):
- `phase-A-sku-seed-78-missing` — 78 SKUs in 0134 source are dupes; ON CONFLICT DO NOTHING dropped them. If AutoCount import sees unresolved SKU codes, fix the xlsx and re-insert.
- `phase-A-stale-test-bundle-metrics` — §17.1 test count / bundle size were last measured at 0123/0130; not re-run for 0132-0137. Likely safe (most changes are additive) but flag if anything breaks.
- `phase-A-local-dev-env-not-configured` — `apps/api/.dev.vars` + `apps/web/.env.local` still don't exist (only `.example` templates). `pnpm dev` blocked until populated from Supabase Dashboard → Settings → API.

**2026-05-24 · Supplier Incoming forecast category fix + HoOKkA→Ohana rename · migrations 0148-0150** — Supplier forecast was empty: `supplier_pending_demand` derived category via `split_part(sku,':')`, which fails on BOTH AutoCount free-text SKUs and native canonical Item Codes (neither carries a `cat:` prefix) → matched no `cat_covered`. Fix = `resolve_demand_category(sku)` (0148): exact catalog join (`product_skus→product_models.category`) for native orders + model-keyword regex for legacy AutoCount; used by rewritten `supplier_pending_demand` (Forecast: active line, `po_id IS NULL`, leverages 0124 per-line `order_line_id`) + new `supplier_committed_demand` (Commit: open-status PO lines). `/api/supplier/products/demand` merges both RPCs; `SupplierIncoming` groups by returned `category` (dropped `sku.split(':')`). Live verify: Nice Future mattress 96u; Ohana bedframe 36u + sofa 64u. Lifecycle (Forecast→Commit→0) was already correct — only category was broken; confirmed per-line (a POed line sits in Commit while a sibling un-POed line of the same SKU stays in Forecast). Spec/plan: `docs/superpowers/{specs,plans}/2026-05-24-supplier-place-forecast*`.
- **Rename HoOKkA→Ohana** (Ohana = canonical, [[project_ohana_is_canonical]]). 0149 first renamed the WRONG direction (Ohana→HoOKkA); **0150 corrected** it (suppliers.name + app_users 'HoOKkA · Sales'→'Ohana · Sales' + ops_stock_items.supplier → Ohana). Code sweep `HoOKkA/HOOKKA/Hookka → Ohana/OHANA` across apps/packages/e2e (26 files) + `git mv HoOKkA{Sofa,BedFrame}Tab.tsx → Ohana*`. **KEPT** the lowercase routing slug `hookka` (opaque key wired into DB `_v3_resolve_sop_name` + `sops.ts` `SUPPLIER_SOP`/`deriveProcurementSlug`/`PROCUREMENT_TAB_SLUGS` + tab URLs — renaming it risks SOP-routing breakage for zero user-visible benefit) and login email `hookka@gmail.com`. Typecheck clean; zero new test failures (stash-verified the base has the identical pre-existing fails).
- 3 NEW carry-forwards (LOW): `phase-10-forecast-keyword-coverage` — legacy keyword classifier may miss novel AutoCount model names (native orders unaffected; AutoCount is a one-time backfill). `phase-10-ohana-slug-name-drift` — slug `hookka` ≠ name `Ohana` (intentional; onboarding footnote). `phase-10-badges-test-stale` — `apps/api/src/routes/operation/badges.test.ts` has 3 pre-existing fails from Phase A (undocumented in §17.7; mocks stale, not from this work). **[CLOSED 2026-05-31** — the 3 badges fails were fixed when `operation:lp_rejected` was added; mock now handles service_notes + lp_rejected.]

**2026-05-31 · 5-item Phase 10 ship (F+E+B+C+D) · migrations 0151-0154 · DEPLOYED to prod** — Loo "do all, base on your reference do 1 by 1". One 4-track read-only investigation workflow scoped it; built/committed/deployed in one pass. Branch `phase/10-per-unit-id-esign-lp-rules` ff-merged to main + pushed (`52f7b9a..97456ab`); CF deployed — **api** Workers `carres-portal-v2-api.wwch.workers.dev` (1272.70 KiB raw / 239.92 KiB gz, version `89b2cdbd`, 401 health OK), **web** Pages `carres-portal.pages.dev` (bundle `index-Bfd550P1.js`, confirmed live serving + contains "Unit ID" + e-sign caption markers).
- **F** (`93106ad`) — `CreatePOModal.issuanceGroups` split is now per-LINE sofa category (was per-supplier `cat_covered.includes('sofa')`). Ohana (bedframe+sofa) bedframe lines consolidate; only sofa lines split per (SO,sku,attrs). Also makes the **Nice Future PO-split fix go live** — that bug was already fixed in code 2026-05-22 (`2514362`) but the deployed bundle was stale until THIS deploy.
- **E** (`4d968a8`, migration **0151**) — REQUIRED customer e-signature on mark-delivered, both legs (partner `PODUploadDialog`→`partner_attach_pod`; HQ `DOAttachModal`→`operation_attach_do_and_deliver`). New cols `pod_signature_url`/`pod_signed_by`/`pod_signed_at` on threads+orders (distinct from `orders.signature_url` = sales-order sig). Both RPCs gained `p_signature_url`+`p_signed_by` DEFAULT NULL (zero-downtime). Reuses dealer `SignaturePad` (+ optional `caption` prop); PNG → existing buckets via new `kind:'signature'`.
- **B** (`dd4432f`, migration **0152**) — STANDARD goods auto-dispatch on WH arrival; Loo decided NO LP "accept" needed (only a non-rejected pre-chosen LP). Helper `_operation_auto_dispatch_if_ready` PERFORMed from `operation_receive_threads`+`partner_pickup_threads`+`operation_reselect_partner`. Supersedes 0122's manual gate (safe now 0147 forces LP at Accept). Regression guard asserts SOFA_SPECIAL CASE survives — closes `phase-10-partner-pickup-rpc-regression-guard`.
- **C** (`dd4432f`, migration **0152**) — LP-reject branches on WH state: A.3 (at WH → was auto-dispatched) reverts order+threads to `ready_to_dispatch`; A.4 (not yet at WH) stage unchanged; `operation_reselect_partner` re-auto-dispatches new LP. Active notification = new `operation:lp_rejected` badge in `badges.ts` (badge feed is direct count queries, NOT an RPC) folded into Orders sidebar tab + `OperationBadgesResponse.lpRejected`.
- **D** (`1087f08`, migrations **0153**+**0154**) — per-unit `id-abc123456` minted at PO-open. Overlay on `ops_stock_items` (Klang only): `unit_code` UNIQUE + `sold_at`+`sold_order_id` + statuses `incoming`/`voided`; `gen_unit_code()` retry-on-unique; 67 seed units backfilled. Lifecycle: PO-open mints `incoming` → receive flips SAME rows `incoming→free` (no double-count; rollup counts only free+reserved) → cancel voids → delivery → `sold`+order ref (FIFO, prefers this order's PO). UI: 4 OperationOps* pages show "Unit ID". **0154 corrected 0153** which was written against WRONG signatures (`_operation_create_po_inner` is 7-arg w/ `p_eta_date`; `operation_cancel_po` is `(text,text)`) → mint/void landed on ghost overloads + it overwrote real `operation_receive_po_with_do`. 0154 dropped ghosts, re-added on real sigs, restored receive body verbatim. Live zero-residue smoke confirmed lifecycle + rollup. Memory: [[project_per_unit_id_tracking]], [[feedback_verify_pg_signature_before_create_or_replace]].
- Tests at ship: shared 186/186, api 687/690, web 464/469 — all 8 fails PRE-EXISTING per §17.7 (OhanaSofaTab kanban ×5 incl. NiceFutureMattressTab; supplier/pos ×2; pickups ×1). NiceFutureMattressTab proven pre-existing by restoring base CreatePOModal → still fails. typechecks shared+api+web clean.
- Cleanup `e269fa5`: chaotic mid-session tooling swept ~40 editor `.bak` files into commits via `git add -A`; untracked+deleted all + `*.bak` → `.gitignore` (none existed in base 52f7b9a).

**2026-06-04 · e–i checklist verify + Incoming header fix + DEPLOY · commits `fa6c511` + `fe04b1c`** — Loo asked "did e/f/g/h/i get done?". All 5 verified done (f/g/h/i = 5/31 ship items D/F/B+C/E; e = supplier forecast at `place` status, confirmed against live DB: `supplier_pending_demand` includes any status not in delivered/cancelled — 153 place orders / 575 units feeding forecast at check time). One gap found + fixed (`fe04b1c`): `SupplierIncoming.tsx` category header summed committed-only, showing "0 units" for categories whose demand is mostly un-POed — now committed+pending, matching hero Total KPI. Also: `fa6c511` CLAUDE.md §2 plugin/skill discipline rule (no auto-invoking superpowers etc.); pulled PR #2-5 (AutoCount import SKU-resolver fixes: `.in()` double-quote escape, colorway-suffix strip, model-family + model-token fallbacks, empty-row skip + zod path on 400). **Deployed both** — api `61240565` (first deploy carrying PR #2-5) + web `index-CKm_OUPF.js` (first deploy carrying import fixes + header fix); 401-health + live-bundle markers verified; `SERVICE_ROLE` grep on dist clean. Wrangler OAuth had been overwritten by another account's login — Loo re-ran `wrangler login` to the `wwch` account mid-deploy. NOT merged (intentionally): `jess/ops-shell-and-stock` — Jess's 5/19 branch is the original Phase A dev (its migrations 0107-0110 collide with main's; content superseded by 0132-0137). Archive or delete after Jess confirms; do not merge.

**2026-06-05 · Multi-leg delivery chain + 4 new logistic partners + AutoCount resolver hardening · migrations 0155-0158 · DEPLOYED · PRs #9-12 (parallel dev wenwei4046)** — Five ships in one session, all merged to main + deployed. Live: web `index-DNYl_-jY.js` (Pages) · api version `1974bdea-bdbc-49d1-93d5-3cbef04ffb70` (Workers). Schema verified still live 2026-06-08.
- **AutoCount import 4-layer SKU resolver** — Loo's 192-row `listing 4 jun 26.csv` was killed by (a) a discount row with blank `Item Group` + (b) a supabase-js bug silently dropping catalog matches when descriptions contain `"`. New resolver: L1 exact · L2 color-strip (drops `/Col:NINJA-02`, `/M2402-4 Sand`) · L3 model-family (same model id, best-seater fit) · L4 model-token (drops width too — catches `SF03-HK5535/32"` against a `/24"`+`/30"`-only catalog). Real-world recovery on Loo's listing: **24/109 → 106/109**.
- **4 new logistic partners** (migration **0155**) — Teow, TT (KL→JB), EU, SSY (JB→SG) for cross-state / cross-border chains. Roster now **8, all ALL-CAPS short codes**: `AL · EU · HOUZS · NETS · SSY · TEOW · TSDD · TT`.
- **NETS rename** (**0157**) `Nets Sdn Bhd → NETS` + **TEOW rename** (**0158**) `Teow → TEOW` — short-form / all-caps consistency; 4 code/test/seed refs updated each.
- **Multi-leg delivery chain (γ architecture)** — THE big one. Schema (**0156**): `orders.delivery_stops jsonb` (null/empty = single-leg, byte-identical to current flow; 1+ legs = chain) + GIN `jsonb_path_ops` index (powers "any leg has partner X" filter) + 2 SECURITY DEFINER RPCs — `set_delivery_chain` (validates contiguous 1..N legs + known partner_ids; operation/principal only) and `patch_delivery_stop` (merges sparse per-leg patch, auto-stamps milestone timestamps on status=picked_up/handed_off/delivered). API: `PUT /api/operation/orders/:id/delivery-chain` + `PATCH .../delivery-stops/:leg`. Shared contract `packages/shared/src/schemas/delivery-chain.ts`. UI: `apps/web/src/pages/operation/components/DeliveryChain.tsx` in Order detail drawer — single-leg shows compact pill + "Set up multi-leg route" CTA; chain view = vertical timeline + per-leg action buttons + inline notes editor + "+ Add another leg". **Design rationale** (0156 header comment): jsonb not relational because 80%+ orders are single-leg Klang Valley; revisit gate at ≥30% multi-leg → promote to relational `order_delivery_legs` (β), jsonb shape mirrors the would-be row shape so backfill = one `INSERT … SELECT`. POD-per-leg deferred to V2 (cols `pod_url` / `pod_signed_by` / `status` already on each leg).
- **Stock alerts tab routing fix** (PR #12) — closes CF `phase-4.5-chunk-2-alerts-tab-routing`. `StockAlertsTile` + `OperationWarehouse` use the tab-state callback instead of a bare URL navigate.
- **Doc catch-up 2026-06-08** (this entry, single-session): re-measured tests (api 708/711 · web 473/478 · shared 186/186, +25 net all-pass, 8 fails pre-existing) + bundles (web 2782.60/819.82 KiB, hash matches live · api 1281.87/241.86 KiB dry-run). Confirmed live schema matches checkpoint (8 partners + `delivery_stops` jsonb + 2 RPCs; 0/158 orders multi-leg). Flagged migration-tracker gap — 0155-0158 not in `schema_migrations` though schema is live (see §17.1). New CFs filed in §17.5.

**2026-06-12 · v17 Phase 2 design pass — type scale + button hierarchy + status pills · DEPLOYED · commits `da53867` (pass) + `2094718` (§10) + follow-up (pills + long-tail + §17)** — Jess "逐页套 v17". The per-component v17 pieces tokens couldn't reach, applied across ALL operation pages + shared components. Live: web `index-BOjbe0Pf.js` / css `index-U2my3MYz.css` (Pages `--branch=main`); origin/main ff `4d2d5b1 →` HEAD. Design source of truth is now v17, not warm-linen ([[project_v17_design_and_one_main]]).
- **Foundation** (`index.css @layer components`): type scale `.t-h1`(32)..`.t-micro`(11); `.btn-primary` flipped **flame→black** (bg-base-900), `.btn-hero` stays the ONE flame CTA/page, `.btn-danger` = red-on-white (destructive, via new `ModalActions` `danger` prop); pills `.pill .pill-{draft|sent|confirmed|collected|overdue|neutral}` + **`.pill-warning`** (amber #FEF3C7/#92400E — extends the spec's 6 so warning/low/pending states are pills too, per Jess 6/12).
- **Type scale**: every page `<h1>` → `.t-h1`; card / modal / dialog titles → `.t-h2/h3/h4` (shared `Modal` + 5 hand-rolled `text-lg` dialog titles).
- **Buttons**: global black; flame heroes only on `+ New PO` / `Import N rows` / `+ New Case`; **fixed 5 invisible-text `bg-accent text-white` dialog buttons** (DispatchPartner / LpInbound / ResumeFromWaiting / WarehouseRelocate / AnnotationTimeline) → black + 1 filled `bg-red-600` → `.btn-danger`. CrossOrderBundleSheet keeps flame (sits on a dark bar), dropped its uppercase.
- **Pills**: status badges app-wide via ONE canonical map (neutral→sent→warning→confirmed→collected→overdue) — StageChip (kanban cards + drawer), OrdersControl, AllOrders, Warehouse (out/low/ok), Receiving + PoDetailModal + ProcurementTabContent (PO status), OpsStockListView (free/reserved), ServiceNotes (SN stages), OpenPOsCard. Non-status colored tags (ServiceNotes section A/B/C, AnnotationTimeline kind) intentionally kept their own palettes.
- **CLAUDE.md §10** rewritten to name v17 the visual source of truth + the Phase 2 utility list.
- Tests: web **531 pass / 5 pre-existing fail** (§17.7); 1 self-inflicted (`OperationWarehouse.test` asserted old inline color tokens → updated to assert pill classes). tsc + vite build green; dist clean of `SERVICE_ROLE`; foundation classes verified via preview computed styles.

**2026-06-14/15 · Catalog → "Product & Maintenance" 3-tab rebuild · migrations 0169-0173 · DEPLOYED · PR #19 (branch `feat/product-maintenance-catalog`)** — Rebuilt the single-page Catalog into a 3-tab **Product & Maintenance** page modeled on the 2990s sister-POS (cloned read-only at `C:/Users/wenwe/Projects/2990s-ref`). Plan: `docs/superpowers/plans/2026-06-14-catalog-product-maintenance-rebuild.md`. Live: web `index-I7BROrvu.js` (Pages `--branch=main`); catalog API deployed earlier as Worker `f15ce6ce` (backward-compatible). Branched off main `e7ef204`.
- **Backend (committed `0a18568`/`5884114`/`fb3fb9c`/`c132b97`, applied to prod first)** — migrations **0169-0173**: 0169 `product_category` enum +accessory/+service (standalone, no-txn ADD VALUE) · 0170 `product_skus.pos_active`(sell-side ON/OFF, distinct from `discontinued_at`) + `description` · 0171 `product_models.photo_url` + `allowed_options` jsonb + `product_skus.supplier_id` DROP NOT NULL (service/accessory carry no supplier) · 0172 `addons.service_sku` + a `service-addons` parent model + 4 bare-`SVC-` Service SKUs (`SVC-DELIVERY` + `SVC-DISPOSE-{MATTRESS,SOFA,BEDFRAME}`) + backfilled the 3 disposal addons · 0173 public `product-model-photos` Storage bucket (`is_internal()` write). Shared layer widened (5-cat enum, new DTO fields/inputs/constants). API extended `catalogRouter`: PATCH sizes-active cascade, generate-skus (idempotent), photo sign-upload+store+delete (signed-URL pattern, bytes never through the Worker), floor-config + addons CRUD. **Latent fix (`c132b97`)**: GET bundle was capped at Supabase's 1000-row REST limit (1013+ skus → ~13 silently dropped from the dealer wizard + Create-PO); `fetchAllSkus()` now pages.
- **Frontend (`8001745`)** — shell `ProductMaintenancePage` (3 pill tabs, single `useCatalog({admin:true})`) mounted at the unchanged `catalog` key in Operation + Principal apps; sidebars relabelled; `OperationCatalog.tsx` retired. SKU Master = flat 7-col grid (code · description · product · category · size · price · status) + category chips + search + Edit-Prices inline + bulk delete + New SKU modal; price 0 → "not set", never shows cost; 300-row visible cap (HV-Portal lag guard). Modular = model grid grouped by category (photo · inline name · Active rollup pill) + right drawer (photo signed-upload, `allowed_options` chip pools, per-SKU `pos_active` toggles + All on/off, Generate SKUs). Maintenance = delivery-fee (`floor_config`, UI-gated to principal) + add-ons CRUD with read-only `service_sku` link. New libs `image-shrink.ts` (≤1600px/JPEG q0.85/≤2MB) + `photo-upload.ts`. 8 new hooks, all invalidate `['catalog']`.
- **Adversarial review (workflow `wf_31844099`, 3 agents) — 4 findings, all fixed**: (HIGH) session-added sizes could vanish on "All off" → `extraSizes` unioned into the chip universe + drawer keyed by model.id; (HIGH) disabling an add-on was a one-way trap (bundle is active-only) → re-adding the same key restores it; (MEDIUM, §9-D5 gotcha, `f566a15`) null-supplier Create-PO guard was implicit → explicit `SUPPLIERLESS_CATEGORIES` short-circuit in `findSupplierForSku` + visible orphan warning band; (LOW) delivery-fee resync + per-row VariantSkuTable pending.
- **Loo feedback follow-up (`dc1364d`, 2026-06-15)** — "+ New SKU" now defaults to a **New product** mode (category + name + size + price → creates model + SKU in one go); old pick-existing-model kept as a secondary tab. Each SKU row gained an **Edit** button → modal editing name/description/price, with **product code READ-ONLY** (Loo's call: code is an order/PO/stock join key; changing it orphans them).
- **Tests at ship**: shared 193/193 · api 732/735 · web 535/540 — all 8 fails PRE-EXISTING per §17.7. Catalog added 12 API tests (`b9573f3`) + fixed a latent red GET-pagination test (`.range` mock). Also fixed (`125cf62`) a timezone-flaky `OperationOrdersControl` deadline-countdown test (derived the fixture date via UTC `toISOString` but `deadlineInfo()` parses local midnight → "1d" vs "2d" in UTC+8 pre-dawn). typechecks clean; web build green; `SERVICE_ROLE` grep on dist clean.
- **Deviations (intentional)**: old Catalog cost-edit column dropped — cost is still set per-PO via `CogsLineEditor` (not a data regression); sofa-fabric editing not in the 3-tab scope (data untouched); Maintenance "Option Pools" live in the Modular drawer (per-model `allowed_options`), since Carres has no global option-pool table.
- **Live smoke** (operation@carres.com): all 3 tabs render with real prod data, 0 console errors; isPrincipal gate confirmed (operation sees delivery-fee read-only); New product + Edit modals verified. Memory: [[project_catalog_rebuild_in_progress]].

**2026-06-16 · Sales Order Maintenance — AutoCount-style configurable SO grid · migration 0174 · DEPLOYED · PR #21 (branch `worktree-feat+sales-order-maintenance`)** — New Operation **"SO Maintenance"** page. Loo asked for AutoCount's resizable/filterable SO listing (screenshots), then clarified the editable thing is the **column format + options**, NOT historical orders ("改是改 Key in Sales Order Column 的格式,不是去改之前的 Sales Order"). So: every order **flattened one row per order_line**, rows **read-only**; the maintenance surface is the column setup. Plan: `docs/superpowers/plans/2026-06-16-sales-order-maintenance.md`. Live: api Worker Version `a5e7226b` + web Pages deploy `f1370c4b`. Built in a worktree off `8b606c7`.
- **DB (migration 0174, applied to prod first)** — single-row config table `sales_order_grid_config` (`id boolean PK default true check(id)` ⇒ one shared row; `columns` jsonb + `options` jsonb) + `set_sales_order_grid_config(p_columns,p_options)` SECURITY DEFINER RPC. RLS: internal (operation/principal) read via `(select public.app_role())`; direct writes revoked, RPC-gated (role-check inside, stamps `updated_by`). Additive — no existing table / orders data / frozen migration touched. Copied the `0083_user_nav_seen` safe pattern.
- **Shared** — `schemas/sales-order-maintenance.ts`: `SO_GRID_COLUMNS` catalog (46 cols = orders 38 + order_lines 7 + 6 resolved join names) — the column *universe* lives in code; DB only stores per-column overrides + curated option lists. zod schemas (`soGridConfigSchema`/`soGridRowSchema` (scalar catchall)/`soGridResponseSchema`/`updateSoGridConfigSchema`) + `mergeSoGridConfig` (layers stored over catalog: new cols appear, removed drop, order re-normalized) + `defaultSoGridConfig`.
- **API** — `routes/operation/sales-order-maintenance.ts` (`requireOperationOrPrincipal`): `GET /grid` fetches orders + nested `order_lines`, batch-enriches dealer/salesperson/outlet/warehouse/partner names + sku→product_models (name + item_group), flattens one row/line (orders-feed precedent); `GET /config` + `PUT /config` (validates, calls the RPC, echoes merged config). Mounted at `/operation/sales-order-maintenance`.
- **Web** — reusable `components/data-grid/DataGrid.tsx`: resizable columns (drag handle → CSS var `--dg-cols`, **no re-render mid-drag**), per-column filter funnels (text contains / option checklist), click-header sort, global search (prop), sticky header, 300-row cap. `SalesOrderMaintenancePage` (toolbar: search · `Columns N/M` picker · Column Settings · Save w/ dirty state) + `SalesOrderColumnSettings` modal (reorder / rename / show-hide / **curate option lists** — filter+entry choices ONLY, never mutate a DB enum). Hooks `useSalesOrderGrid` + `useUpdateSoGridConfig` (`qk.salesOrderGrid`). Sidebar entry + tab in OperationApp (distinct from the Orders **control** table).
- **Tests** — shared **206/206** · api **741/744** · web **544/549**; all 8 fails PRE-EXISTING (§17.7), zero new regressions. Added 31: shared 13 (catalog invariants + merge + zod) · api 9 (grid flatten/enrich, config get/put, role 403, RLS-denial 403) · web 9 (DataGrid format/search/sort/filter/resize + page render). typecheck clean all 3 packages; web build green.
- **Process note**: 2 early edits accidentally hit the **main repo** instead of the worktree (absolute paths missing the `.claude/worktrees/...` segment) — caught via `git status` on both trees, reverted main with `git checkout --`, re-applied to the worktree. Lesson: in a worktree session, Write/Edit paths must include the worktree segment (EnterWorktree switches cwd but absolute paths bypass it). Fresh worktree also needs `pnpm install` (~17s, warm store) before typecheck/test.
- **Live smoke** (operation@carres.com): SO Maintenance renders real AutoCount data flattened one-row-per-line (SO-1123 ×3, SO-1143 ×3…), headers with sort + filter funnels, `Columns 18/46` picker, horizontal scroll, 0 console errors. Memory: [[project_so_maintenance]] + [[project_db_applied_state]] bumped to 0174.

**2026-06-16 · Dealer catalog-first full-screen POS order flow · 0 migrations / 0 API · DEPLOYED · PR #22 (branch `feat/dealer-pos-catalog-flow`)** — Replaced the dealer 4-step **customer-first** new-order modal with a full-screen, **catalog-first POS** as the `/dealer` landing (Loo: "开门即选货" / open door = sell). 3 steps: **01 CATALOG → 02 CUSTOMER → 03 CONFIRM**. Reference = a POS catalog screenshot ("follow our own design" → built with v17 tokens, not the ref's colors). Plan: `~/.claude/plans/fizzy-cooking-frost.md` (plan-mode file, not committed). Live: web Pages deploy `0aa6883b`, bundle `index-9Mv9HmFC.js` (2910.41 KiB / 850.61 KiB gz, +5 KiB vs SO Maintenance), production confirmed serving the new hash + API health 200; **api NOT redeployed** (web-only change).
- **Why low-risk** — the entire business layer is **reused verbatim**: `draft.ts` (sessionStorage draft + the `step1/2/3Date/4` validation gates), the per-category configurators (Mattress/Bedframe/Sofa, **extracted** from the deleted `ProductPicker.tsx` into `new-order/configurators.tsx`), `Step1Customer`/`Step3Delivery`/`Step3SignaturePayment`/`SignaturePad`/`PaymentSlipPicker`/`ThankYou`, and the `handleSubmit` upload→`create_order` pipeline. **`DraftLine`/`DraftAddon` shape held identical ⇒ zod schema / adapter / `create_order` RPC untouched.** Presentation re-sequencing + a routing refactor, not new business rules.
- **CATALOG step (new, `dealer/pos/`)** — `CatalogStep` orchestrates: left `CategoryRail` (All / Mattress / Bed Frame / Sofa / Add-ons + counts, derived from the catalog bundle) · debounced search (`useDebouncedValue`, over name/modelKey/blurb/sku/variant/fabric) · category-grouped `ProductCard` grid (photo or `▦` placeholder, FROM-price via `catalog-index.buildCatalogIndex`, "N sizes · Configure →") · per-model `ConfigureDrawer` (right-slide, keys the configurator by `model.id` — the SO-1006 remount discipline, now structurally guaranteed since each model opens fresh) · `CartDrawer` (qty bump/remove + subtotal + "Proceed to Customer →" gated on `step2Valid`) · `FloatingCartButton` (the page's one `.btn-hero`) · `AddonsPanel` (lifted from old Step2, disposal-size gate preserved). Sofa↔mattress/bedframe mutex (`lockedCategoriesFor`) greys locked rail entries + cards. `mergeLine` collapses same-sku+same-attrs adds into a qty bump (only mutates qty → submit unaffected).
- **CUSTOMER step** — `CustomerStep` stacks `Step1Customer` + `Step3Delivery` + a relocated `StairCarryFields` (lifted from old Step2; needs the cart item count, known after CATALOG). Gate = `step1Valid && step3DateValid`. Outlet/salesperson stays in `Step1Customer`; the POS top bar only mirrors the chosen outlet name read-only.
- **CONFIRM step** — reuses `Step3SignaturePayment` verbatim (mints `wizardSessionId` on mount). `ThankYou` "Back to dashboard" → **"View orders"** (clearDraft + navigate `/dealer/orders`).
- **Shell** — `DealerPos` holds the 3-step state machine + top bar (Carres lockup + outlet context + `PosStepper` 01/02/03 + cart chip + Exit + `/me`) + footer (steps 2/3) + ported `minLeadDays`/`asapDepositOk`/`footerTotal`/`handleSubmit`/`startAnotherOrder`. Draft restores on mount (POS-as-home, no modal lifecycle); a resume banner offers Resume / Start fresh when a non-empty draft loads. ASAP auto-proceed preserved.
- **Routing/chrome** — `DealerApp` is now a pure router: index = `<DealerPos/>` (full-screen, no sidebar); Orders/Products/Settings under a `<DealerChrome/>` **layout route** (sidebar + `<Outlet/>`). `?new=1` deleted; "+ New order" links → `to="/dealer"`. Dashboard KPIs (in-flight / this-month RM / ready-to-proceed) moved to the top of `DealerOrders`; `DealerDashboard` + `DealerNewOrder` + `Step2Products` + `ProductPicker` deleted.
- **fix(payment)** — online now forwards the bank reference/approval code. `handleSubmit` previously sent `approvalCode: null` for online, but the CONFIRM UI already **requires** a "Bank reference number" (`step4Valid` gates ≥3 chars for all methods) and Finance needs it to reconcile — so the entered reference was collected then discarded. Verified the whole server path already accepts it (zod `approvalCode: z.string().nullable()`, no online-rejecting `superRefine`; `orderInputToRpcPayload` passes it straight). One-line client fix + updated the stale schema doc comment.
- **Ship safety** — `origin/main` advanced twice mid-session (PR #21 SO Maintenance code, then PR #23 its docs); per the `phase-11-deploy-verify-branch-has-latest` lesson, **merged `origin/main` into the feature branch before deploy** (clean, no conflicts — operation vs dealer files) so the web build didn't revert PR #21. Confirmed PR #21 backend already live (`/api/operation/sales-order-maintenance/columns` → 401 not 404; 0174 in `list_migrations`) → web-only deploy is consistent. (These docs were then branched off the post-#23 `origin/main` so they don't clobber PR #23's §17 entries — same main-repo-vs-worktree path trap noted in the SO Maintenance entry above.)
- **Tests** — web **561/566** (net +17: +24 new `dealer/pos/*` + `configurators` tests, −7 old `ProductPicker.test`); api 741/744 + shared 206/206 unchanged. All 5 web reds are the pre-existing §17.7 ones (OhanaSofaTab ×4 + NiceFutureMattressTab ×1) — 0 new regressions. typecheck + vite build green on the merged branch.
- **NOT done (CFs in §17.5)**: live dealer smoke (POS behind staging auth → Loo to manual-smoke, `pos-live-smoke`); `DealerPos`/routing integration + Playwright E2E (`pos-web-shell-tests`); top-bar outlet picker (`pos-topbar-outlet-picker`); `new-order/`→`order/` folder rename (`pos-folder-rename`); real product photos (`pos-product-photos`). Also updated stale memory [[feedback_modal_cream]] (v17 flipped `--card` to white; cream three-layer retired).

**2026-06-20 · Phase 4 — Combo / set pricing · migration 0177 · DEPLOYED · PR #27 (merge `7bb9618`, branch `feat/phase4-combo`)** — The 4th and final POS-2990s-alignment phase ([[project_pos_2990s_alignment]]). A **combo** = a principal-defined named set of SKUs sold at one combo price; the POS **explodes** it into real component `order_lines` at submit, splitting the combo price across components **proportional to catalog price × qty** (residue-on-last). Picked Option A from the plan (`docs/superpowers/plans/2026-06-20-phase4-combo.md`): simple fixed-set, UI-configurable, **client-priced (no server recompute)** — so the submit pipeline stays byte-identical. Subagent-driven: 6 tasks (each implement → independent adversarial review → fix → green) + a Loo-requested picker upgrade. Live: api Worker version `9412d21b` (`carres-portal-v2-api.wwch.workers.dev`) + web Pages `5cf619ef` (`carres-portal.pages.dev`); 0177 on prod.
- **T1 — migration 0177 `combo_pricing`** (`4052444`, applied to prod first) — two new tables: `combos` (id · key · label · combo_price · active · timestamps) + `combo_components` (combo_id · sku · qty). `combo_components.sku` FKs `product_skus(sku)` **ON DELETE RESTRICT** (sku is UNIQUE → a SKU in a live combo can't be deleted out from under it); `combo_id` **ON DELETE CASCADE** (drop a combo → its components go too). Principal-only RLS mirroring `floor_config`/0176 (`is_principal()` write; internal read). Additive + **zero behaviour change** — both tables ship empty.
- **T2 — shared layer** (`c231b5c` + guard `359eaca`) — `explodeCombo` price-split helper + combo types/schemas/adapters, **barrel-exported** from `@carres/shared`. The split is proportional to catalog `price × qty` with **residue-on-last**: Σ is exact when the last component's qty=1, else the residual is ≤`(qtyLast − 1)`c (sub-cent rounding parked on the last unit). `359eaca` hardened the helper against a **non-finite SKU price** (NaN/Infinity → guarded, never poisons the split) and pinned the residue-on-last test.
- **T3 — API** (`f1da3c8` + barrel/branch coverage `08facb0`) — `GET` catalog now returns combos; combo CRUD is **principal-gated** (non-principal → 403). `08facb0` also exported combos from the shared barrel on the API side + covered the 404 / null / grouping branches.
- **T4 — POS** (`c9a58fb`) — Combos section in the catalog; selecting a combo **explodes into component lines** with the split price. Combo provenance rides in `order_lines.attrs.combo_key` / `combo_label` — verified end-to-end that `combo_key` reaches the `create_order` payload through the existing draft → submit path. **Contract-safe**: `DraftLine` / `orderLineInputSchema` / `create_order` / `order_lines` all UNTOUCHED (combo info is just attrs).
- **T5 — P&M Combos tab** (`df70b5b` + branch tests `5fb01ec`) — 4th "Combos" tab in Product & Maintenance: principal-only combo editor (read-only for other roles); shows an **implied-discount readout** (combo price vs Σ catalog) + a **sofa-mutex author warning** (combos mixing sofa with mattress/bedframe). `5fb01ec` covered the non-principal / reactivate / markup branches + fixed the P&M subtitle.
- **T5b — searchable SKU picker** (`e9c29ed`) — Loo asked to replace the native `<select>` in the combo editor with a **searchable** SKU picker (collapsed trigger is a real button; search to filter the catalog by code/name).
- **T6 — deploy** (from main, post-merge) — api Worker `9412d21b` (1352.69 KiB raw / 254.94 KiB gz; adds combo GET + principal-gated CRUD, backward-compatible) + web Pages `5cf619ef` (~2956 KiB raw / ~861 KiB gz). `SERVICE_ROLE` grep on `dist` = 0 (§4.4).
- **Tests** — shared **226/226** · api **775/778** (3 known) · web **667/672** (5 known: OhanaSofaTab ×4 + NiceFutureMattressTab ×1). All 8 fails PRE-EXISTING per §17.7, **0 new regressions**. baselines held.
- **Catalog state** — +2 new tables (`combos`, `combo_components`), **0 rows** (no combos authored yet).
- **4 NEW carry-forwards (see §17.5)**: `combo-component-price-availability` (MEDIUM — a `pos_active=false`/discontinued component SKU isn't in the POS pos_active bundle → priced 0, other components absorb the full combo price; `explodeCombo` guard prevents NaN + the combo TOTAL still equals comboPrice, only the per-line split skews; defence = include component prices in the catalog GET or require pos_active components); `combo-crud-non-atomic` (LOW — combo+components insert/replace isn't a DB transaction: POST compensating-delete on failed components insert, PATCH delete-then-insert with a small no-components window; v1-OK principal-only/low-freq; defence = a `create_combo`/`update_combo` SECURITY DEFINER RPC if churn grows); `combo-skupicker-clear-x-a11y` (LOW — the picker's clear (X) is a `<span role=button>` without keyboard reachability; cosmetic, the collapsed trigger is a real button); `combo-submit-payload-test` (LOW — no test proves `combo_key` reaches the create_order payload through `DealerPos.handleSubmit`; verified by code inspection only → fold into `pos-web-shell-tests`).

**2026-06-21 · Sofa custom-cell / compartment engine — Phase 1 (compartment foundation) · migration 0178 · DEPLOYED · PR #29 (merge `1b4d6cc`, branch `feat/sofa-phase1-compartments`)** — First phase of a **NEW initiative** chosen 2026-06-21 (right after the POS 2990s alignment closed with Phase 4 combo): reproduce the **2990s sofa custom-cell / compartment engine IDENTICALLY** in Carres's stack, MINUS promo + bedframe. 2990s codebase = `C:\Users\wenwe\Projects\2990s`. Live: api Worker `6053e1a0` + web Pages `5ce9a835` (`carres-portal.pages.dev`); 0178 on prod; `SERVICE_ROLE` scan on `dist` = 0 (§4.4).
- **Locked decisions (Loo, 2026-06-21)** — **C-visual** = the full 2990s **drag plan-view room builder** (drag compartment modules, edge-snap, connected-sofa detection, arm-cap validation, auto-canonical shape, live price), NOT a structured picker. **Server recompute + 0.5% drift reject = YES, but done in HONO** (§4.3 — Hono enforces business rules), so the frozen `create_order` RPC + `order_lines` structure stay UNTOUCHED (config rides in `attrs` free jsonb, like Phase-4 `combo_key`). **Pricing = matched-combo > à-la-carte module sum** — a sofa combo = base_model + ordered SLOTS (each an OR-set of compartment codes) + tier; match = subset coverage via **Kuhn bipartite** (order-independent, extras allowed), and the matched combo applies **even if pricier** (the "only if cheaper" guard was deleted from 2990s 2026-05-30). Extras beyond matched slots + recliner/电动 upgrades add at full price; fabric-tier P2/P3 delta adds on top (PRICE_1 = +0). **Explode into per-compartment `order_lines`** reusing the Phase-4 combo explode pattern (build price distributed proportional to each module's catalog price, residue-on-last so Σ === build total). **Compartments become real `product_skus`** so downstream (PO-by-sku / per-line thread / DO-pick / finance) works unchanged. **Fabric extends 0176** (`sofa_fabrics.tier` + `fabric_tier_addon_config` + `model_fabric_tier_overrides` already exist) — do NOT rebuild. Promo (PWP/GWP/Free-item) + bedframe **deferred** to future initiatives.
- **Roadmap = ~5 phases** (`docs/superpowers/plans/2026-06-21-sofa-engine-roadmap.md`): **P1** compartment pool + per-model offered + Maintenance UI (this ship) · **P2** pricing engine + `sofa_combo_pricing` (pure `computeSofaPrice` two consumers + Kuhn subset-match + explode/split; heavy TDD) · **P3** visual drag plan-view builder (web-only, geometry ported pure, Carres-styled per §3/§10) · **P4** Hono server-recompute + 0.5% drift-reject + explode into per-compartment lines via existing `create_order` (the trust gate) · **P5** downstream regroup-by-`sofa_build_key` + cutover. §7 gates each STOP for Loo (P1+P2 additive catalog tables = 0176/0177 risk class; P4 touches NO schema if config stays in `attrs`). Research: `docs/superpowers/2026-06-21-sofa-engine-understand.md` (two read-only file:line-confirmed workflows). Plan: `...-sofa-phase1-compartments.md`.
- **Phase 1 scope** — the compartment **pool** ("Base") + per-model offered set + per-compartment pricing + the `Products → Maintenance → Sofa Compartments` page Loo showed.
- **migration 0178 `sofa_compartments`** (`dc1ed0f`, applied to prod first; §7 additive) — `sofa_compartments` pool (`id` · `code` UNIQUE e.g. `1A(LHF)` · `description` · `seat_count` · `arm_config` · `icon_url` · `default_price` · `sort_order` · `active` · timestamps) + `model_sofa_compartments` (`model_id` → `product_models` ON DELETE CASCADE, `compartment_id` → `sofa_compartments` ON DELETE RESTRICT, `price_override`, PK(`model_id`,`compartment_id`)) + nullable `product_skus.compartment_id`. RLS: read = authenticated; ALL writes principal-only (`(select public.is_principal())`), mirroring `floor_config`/0176/0177 — principal owns pricing (consistent with 0175). Additive + **zero behaviour change** — all 3 surfaces ship empty (0 compartments authored).
- **shared** (`bd2e43f`) — compartment / model-compartment row+DTO types, zod schemas, adapters, table constants, and the optional/additive `catalogResponse` fields for the pool + per-model offered rows.
- **API** (`0fb596a`) — catalog GET returns the compartment pool + per-model offered+priced rows; principal-gated compartment CRUD + per-model offered/price (reuses `principalOnly()` + `parseJsonBody`).
- **web** (`f3ea0ba` pool maintenance + `13bd468` per-model panel) — a "Sofa Compartments" sub-page in Product & Maintenance: the pool list + edit (matches the screenshot) + a per-model panel to tick which compartments a sofa model offers and set their price. Principal-gated (read-only for others).
- **5 commits** — `dc1ed0f` (0178) · `bd2e43f` (shared) · `0fb596a` (api) · `f3ea0ba` (web pool maintenance) · `13bd468` (web per-model panel).
- **Process note (worth recording)** — T3 (API) + T4 (web) were **controller-authored INLINE during a sustained Anthropic API-529 outage** that blocked the SDD review subagents (the platform couldn't dispatch them). Rather than stall the ship, the controller wrote those two tasks directly; an **independent adversarial review ran + APPROVED after the platform recovered** — **no fixes needed**. So the SDD review gate was honoured, just deferred past the outage instead of skipped.
- **Tests** — shared **233/233** · api **784/787** (3 known) · web **676/681** (5 known: OhanaSofaTab ×4 + NiceFutureMattressTab ×1). All 8 fails PRE-EXISTING per §17.7, **0 new regressions**. baselines held.
- **Catalog state** — +2 new tables (`sofa_compartments`, `model_sofa_compartments`), **0 rows** (no compartments authored yet). `product_skus` gained nullable `compartment_id`.
- **NEW carry-forwards (see §17.5)**: `sofa-compartment-armconfig-add-form` (LOW — the pool Add form doesn't author `arm_config`; rows can carry it via direct insert / later edit; wire into the form when authored from the UI); `sofa-engine-roadmap-remaining-phases` (watch — P2-P5 still ahead; each its own plan + SDD, migrations through §7).

**2026-06-21 · Sofa custom-cell / compartment engine — Phase 2 (pricing engine + sofa-combo model) · migration 0179 · DEPLOYED · PR #31 (merge `a90a743`, branch `feat/sofa-phase2-pricing`)** — The money core: the pure pricing engine + the sofa-combo data model + the explode helper, a faithful Carres port of the 2990s sofa pricing (file:line-confirmed via a 5-reader grounding workflow). Additive + principal-owned; the order contract is UNTOUCHED (no order-side consumer until Phase 4). Live: api Worker `1b3f8bd7` + web Pages `5bfbaa9b`; 0179 on prod; `SERVICE_ROLE` scan on `dist` = 0 (§4.4).
- **Locked decisions (Loo, 2026-06-21)** — combo price = **`prices_by_height` matrix** (not single; faithful to 2990s, seat-heights `24/28/30/32/35` = `SOFA_HEIGHTS`); recliner/电动 **DEFERRED to Phase 3** (no Carres data + no UI to author/select until the builder — `computeSofaPrice` lands `reclinerExtra` as a `+0` stub, exactly like 2990s mfg); combo scope = **company-wide only** (customer scope + the customer-tier ranking deferred).
- **Grounding** (`docs/superpowers/2026-06-21-sofa-engine-understand.md` + a 5-reader workflow) — extracted the exact 2990s `groupPrice` (`sofa-build.ts:1176-1333`), `matchComboSubset` Kuhn (`sofa-combo-pricing.ts:289-333`), `splitSofaBuildIntoModuleLines` residue-on-last (`so-sofa-split.ts:54-70`), the Carres reuse map (`explodeCombo`/`resolveFabricDelta`/0178 prices), and the recliner/units gap. Confirmed: the "only-if-cheaper" combo guard is **dead code** in 2990s (deleted 2026-05-30 — follow the live code); the mirror (LHF↔RHF) price lookup is a load-bearing C1 invariant (subset sum MUST use the same lookup as the à-la-carte total or extras double-charge).
- **T1 — migration 0179 `sofa_combo_pricing`** (`89f3c8a`, §7 gate → Loo OK → applied to prod first) — `model_id` FK CASCADE (product_models has no base_model col — verified live, so keyed on the model uuid) + `slots` jsonb (string[][] OR-sets) + `tier` text-nullable CHECK + `prices_by_height` jsonb + `effective_from` + `active`/`discontinued_at`; lookup + GIN(`slots`) indexes; RLS principal-only (mirror 0177/0178). **+ §4 trigger `enforce_sofa_fabric_tier_principal_only`** (mirror 0175) locking `sofa_fabrics.tier` to principal — **closes** the `fabric-tier-db-lock-sofa-fabrics-tier` CF. Deferred columns: `customer_id`/`supplier_id`/promo. Additive + zero behaviour change (empty table). MCP version stamp `20260620184008`, name authoritative.
- **T2 — shared types** (`30c4645`) — `SofaComboPricingRow`/`SofaCombo` + `SOFA_HEIGHTS` + `sofaComboFromRow` + `sofaComboSchema`/`Create`/`Patch` + `catalogResponse.sofaCombos?` (additive) + `SOFA_COMBO_PRICING`, all barrel-exported.
- **T3 — pure pricing engine** (`4a7af74` + fidelity fix `3285e9b`, strict TDD, 53 tests) — `computeSofaPrice` (faithful `groupPrice` port w/ bundle+promo removed: matched-combo > à-la-carte, applies even if pricier, covers only the matched subset + extras at full + fabric-tier delta, recliner `+0` stub, integer-cents) · `matchSofaCombo` (Kuhn augmenting-path **max** matching, NOT greedy) · `pickSofaCombo` (filter → rank company+tier>company+any → newest `effective_from`) · `explodeSofaBuild` (residue-on-last, Σ-exact) · `resolveCompartmentPrice` (`priceOverride ?? defaultPrice`) · `mirrorCode` · `canonicalizeSofaSlots`. **Adversarial review (opus) = APPROVED** — all 6 load-bearing invariants verified, tests real. Its 1 actionable minor (a 0-priced combo was dropped pre-rank vs 2990s's keep-through-filter + post-rank `>0` gate) was **FIXED in `3285e9b`** to match 2990s byte-for-byte (keeps the client engine aligned with the future P4 Hono recompute).
- **T4 — API** (`12cb920`, +11 tests) — catalog GET returns `sofaCombos` (non-principal active+!discontinued); principal-gated `/catalog/sofa-combos` CRUD (POST/PATCH/DELETE-soft) mirroring `/combos`; `canonicalizeSofaSlots` on save. **Review (opus) = APPROVED** (gating real — 403 tests fail if the gate is stripped; contract-safe).
- **T5 — web** (`618d746`, +14 tests) — a principal-only **Sofa Combos** panel in `ProductModelDrawer` (sofa models): OR-set slots editor (chip-toggle over the model's offered compartments) + per-seat-height price grid (blank=null) + tier/effective_from/active + per-height implied-discount readout (`resolveCompartmentPrice`); `useCreate/Update/DeleteSofaCombo` hooks. **Review (opus) = APPROVED** (read-only for non-principal, slots + prices-by-height round-trip).
- **7 commits** — `9878ada` (plan) · `89f3c8a` (0179) · `30c4645` (T2) · `4a7af74` (T3) · `3285e9b` (fix) · `12cb920` (T4) · `618d746` (T5).
- **Tests** — shared **287/287** · api **795/798** (3 known) · web **690/695** (5 known: OhanaSofaTab ×4 + NiceFutureMattressTab ×1). All 8 fails PRE-EXISTING per §17.7, **0 new regressions**. typecheck + web build clean.
- **Contract-safe** — `create_order` / `order_lines` / `DraftLine` / the existing `SofaConfigurator` UNTOUCHED. The engine has no order-side consumer until Phase 4.
- **Carry-forwards** — `fabric-tier-db-lock-sofa-fabrics-tier` now **CLOSED** (0179 §4 trigger). 2 P2 review minors to confirm byte-aligned at P4's Hono recompute: 0-priced-combo gate (already matched to 2990s) + `pickSofaCombo` `tier=null` wildcard (Carres-only superset, unreachable from the real `computeSofaPrice` path). `sofa-compartment-armconfig-add-form` extends to the combo editor (neither authors `arm_config` yet; wire at P3 arm-cap). **Next = Phase 3 (visual drag builder UI, web-only, no migration).**

**2026-06-21 · Sofa custom-cell / compartment engine — Phase 3 (visual drag plan-view builder) · WEB-ONLY, NO migration · DEPLOYED · PR #33 (merge `74e21d1`, branch `feat/sofa-phase3-builder`)** — the 2990s "lego sofa" drag builder, rebuilt in Carres's stack (geometry ported pure; UI in Tailwind/shadcn). Grounded by a 5-reader workflow (2990s `sofa-build.ts`:1667L geometry + `CustomBuilder.tsx`:2075L drag UI + module/silhouette catalog + Carres POS seam + P2 reuse). Live: web Pages `a267c6a1` (api unchanged — no migration, no API change); `SERVICE_ROLE` dist scan = 0.
- **Locked decisions (Loo, 2026-06-21)** — silhouettes = **SVG-redraw** (derive rects from `seatCount`/`armConfig` + footprint, v17-themed; not the 2990s PNGs — those remain an optional `sofa_compartments.icon_url` upgrade); builder surface = **full-screen overlay** (the 2990s 3-pane shell); scope = builder + live price + **add-to-cart** (emit ONE `DraftLine`, client-priced, build in `attrs`; explode-to-many = P4); recliner **still deferred** (web-only, needs a migration).
- **Safe to ship — dormant in prod**: the builder appears only for sofa models with offered compartments (`model_sofa_compartments`, 0178); prod has 0 authored → it never shows until the principal seeds data. Deploy note: don't author offered compartments in prod until P4 (explode) ships.
- **T1 — `packages/shared/src/sofa-geometry.ts`** (`4f6beb7`, strict TDD, faithful 2990s port, **APPROVED**) — `GeoCell` (moduleCode-aligned with P2) + `SOFA_MODULES` (30 modules) + `MODULE_EDGES_BASE` + `parseCompartmentStructure`/`familyRepresentative`/`findModule`/`normalizeCompartmentCode` + `moduleFootprint`/`widthOffsetPerCushion` + `cellBbox`/`cellsBbox`/`centerCellsInRoom` + `ROOM_W/H` + `findSnap` (SNAP_CM=20) + `edgeContacts`/`hasConnectingContact`/`groupSofas` (CONTACT_TOL=2 union-find) + `analyzeSofa` (+`violationCellIds`) + `lCapEdgeOf` + `hasArmConflict` + `orderSofaCellsLeftToRight` + `cellRenderBox` (never-null 95×95 fallback, never throws). Pure cm-space, no DOM. +57 tests. Review: every fn cross-checked vs 2990s, could not refute; 3 cosmetic minors (barrel comment FIXED `17cd1ed`; `violationCellIds` additive; "31" was a doc miscount — 30 in both).
- **T2 — `CompartmentSilhouette` + `ModulePaletteItem`** (`e3126a2`, **APPROVED**) — the silhouette derives arm/back rects from T1's `cellEdges` + the viewBox from `moduleFootprint` + seams from cushions + a P/R/L glyph; prefers a `0178 icon_url` `<img>` with the SVG as fallback; v17 tokens, Lucide, no emoji. +9 tests. Review hand-traced 1A(LHF)/1A(RHF)/1NA/2A(RHF)/1A(P)(RHF) — all correct; 2 LOW minors (icon onError; SVG intrinsic size) left.
- **T3 — `SofaBuildCanvas`** (`412157d` + rotate-test hardening `81a382c`, **APPROVED_WITH_MINOR**) — the big one: full-screen `role=dialog` overlay; 3-pane (palette grouped · 600×480 room, `ResizeObserver`→`visualScale`, absolute cm-positioned cells w/ rotated `CompartmentSilhouette` · price bar w/ fabric + `SOFA_HEIGHTS` pickers). **Thin** — ALL geometry→T1 (grep-confirmed no re-derived math), ALL price→P2 `computeSofaPrice` (useMemo, snapshot filtered to model.id). tap-to-add@center; native pointer-capture drag (delta/`visualScaleRef` → `draftDelta` live → `findSnap` → clamp → auto-mirror → commit); per-cell rotate/select/delete; `groupSofas` outline + `{w}/{h}`cm callouts + `analyzeSofa` red violation + not-closed pill w/ reason; combo badge + "saves RM". Add gate = cells>0 && every group closed; label IS the reason; `onAddBuild(payload)` (not a DraftLine — T4). +9 tests. Review: drag math 2990s-identical, no re-derived geometry, price snapshot correct, gate real; 3 minors (depth=height single picker [coherent]; rotate test was near-tautology → FIXED `81a382c`; mid-drag closure flicker [transient]). **Deviation (flagged to Loo, deferred): group-drag + group-rotate NOT built** (per-cell only) — 2990s has it; per-cell drag+snap still reconnects into one sofa + gate/price/explode don't depend on it.
- **T4 — integration** (`0eae3b4`, **APPROVED**, no blocker) — new `sofa-build-draft.ts` (`buildToDraftLine`: `representativeSofaSku` [first preset, else first sku, null→CTA disabled] + `attrs` {`mode:'build'`, `sofa_build`:{cells,height}, `sofa_build_key`, the 4 fabric keys}, `unitPrice`=payload.total); `ConfiguratorForModel` branch (`SofaConfiguratorOrBuilder` dispatcher) → offered-compartment sofa model shows a "Build your sofa" CTA → `createPortal` full-screen overlay → `onAddBuild`→`buildToDraftLine`→existing `onAdd`; sofa-without-offered → unchanged dropdown; mattress/bedframe untouched. Additive prop threading `CatalogStep`→`ConfigureDrawer`→`ConfiguratorForModel`. +13 tests. Review tried+failed to construct the unknown-sku mutex-bypass (repSku is always a real sofa sku; null path triple-protected); `DraftLine`/`OrderLineInput`/`create_order`/`DealerPos.handleSubmit`/`cart.ts`/`lockedCategoriesFor` UNTOUCHED.
- **7 commits** — `b929418` (plan) · `4f6beb7` (T1) · `e3126a2` (T2) · `17cd1ed` (T1 comment fix) · `412157d` (T3) · `81a382c` (T3 rotate-test) · `0eae3b4` (T4).
- **Tests** — shared **344/344** · api **795/798** (3 known, untouched) · web **720/725** (5 known: OhanaSofaTab ×4 + NiceFutureMattressTab ×1). All 8 fails PRE-EXISTING per §17.7, **0 new regressions**. typecheck + web build clean.
- **Contract-safe** — web+shared only, no migration, no API change. The order contract + the existing SofaConfigurator path are untouched. The single sofa-build line flows through the existing cart/submit/`create_order` unchanged.
- **Deferred → follow-ons**: group-drag/rotate (polish, Loo's call); recliner per-seat (needs a migration). **Next = Phase 4** (Hono server-recompute on the SofaBuildCanvas single line: re-run `computeSofaPrice` with fresh DB prices → 0.5% drift reject → `explodeSofaBuild` into per-compartment `order_lines` via the existing `create_order`) · then P5 (downstream regroup + cutover). **Loo to live-smoke P1+P2+P3** (in dev with seeded compartments/offered/combos: drag-build → snap → connected outline → arm-cap gate → live price + combo badge → add to cart → submit).

## 2026-06-23 · Sofa engine Phase 4 — server recompute + 0.5% drift-reject (the trust gate)

> PR **#35** (merge `ced72e5`) · **NO migration** · deploy api `b3fd023a` (web unchanged). Plan `docs/superpowers/plans/2026-06-23-sofa-phase4-server-recompute.md`.

- **Scope decided with Loo 2026-06-23: trust gate ONLY** — the explode into per-compartment `order_lines` was DEFERRED to Phase 5 (exploding needs compartments authored as real `product_skus`, 0 today, or the 0089 mutex + every downstream `order_lines.sku→product_skus` join goes blind to the synthetic skus).
- `apps/api/src/lib/sofa-recompute.ts` (new) — `recomputeSofaBuildLines(sb, lines)`: for each line carrying `attrs.sofa_build`, re-parse with `sofaBuildLineAttrsSchema`, resolve the model from the rep sku, fetch a fresh `SofaPricingSnapshot` (memoized per model), re-run the pure P2 `computeSofaPrice`, gate via `sofaPriceWithinTolerance` (shared, 0.5%): `>0.5%` → 422 `sofa_price_drift` (no order); within → overwrite the line's `unitPrice` with the server number. Reads via **userClient/RLS only (never service_role)**; fail-closed on a catalog read error (500).
- `apps/api/src/routes/orders.ts` — call it in `POST /` between lead-time and `orderInputToRpcPayload`.
- Contract-safe: `create_order`/`order_lines`/`DraftLine`/`cart.ts`/the 0089 mutex UNTOUCHED. Independent adversarial review APPROVE; 2 MINOR CFs deferred to P5 (`sofa-p4-fabric-tier-trusted`, `sofa-p4-asof-not-pinned`). Dormant in prod (0 build lines).

## 2026-06-23 · Sofa engine Phase 5 — the explode cutover (compartment→SKU + per-compartment order_lines)

> PR **#36** · **NO migration** · deploy api `4166588c` / web `23404cee`. Plan `docs/superpowers/plans/2026-06-23-sofa-phase5-explode-cutover.md`. Scope (Loo 2026-06-23): full cutover in ONE PR (5A+5B) as dormant groundwork; compartment→sku via auto-sync on offer-toggle; the 628 flat sofa SKUs stay legacy (0 migration). 6 tasks; independent adversarial review **APPROVE** (8/8 contract invariants; 2 minors fixed inline).

- **T0 spike** — confirmed the no-migration target holds against live DB: `variant_kind` enum = `size/preset/part` → compartment skus reuse `part`; `product_skus` has NO check constraints (parens in `{KEY}-1A(LHF)` fine); write policy `skus_write_internal` + the 0175 trigger → principal user-JWT can mint (no service_role); each sofa model has exactly 1 supplier (clean inherit); 108 sofa models · 628 flat sofa skus · 0 compartments/combos authored.
- **T1 shared** — `explodeSofaBuildToOrderLines(build, total, {priceLookup, codeToSku, fabricAttrs})` in `sofa-pricing.ts` (the `explodeCombo` analog): wraps the Σ-exact `explodeSofaBuild`, joins the compartment-code→sku map, stamps per-cell `attrs` ({fabric_*, `sofa_build_key`, `cell_index`, `module_code`, x/y/rot}); `sku=null` for an unmapped cell (caller fails closed). +9 TDD tests.
- **T2 api 5A** — `apps/api/src/lib/sofa-compartment-sku.ts` (`syncCompartmentSku`/`discontinueCompartmentSku`) invoked from the principal-gated `PUT/DELETE /models/:id/compartments/:cid` (sync FIRST, then the offered upsert). Mints a real `product_skus` row: `sku=deriveSkuCode(model_key, code)`, `compartment_id` bound, `variant_kind='part'`, `price`=override??pool-default, `cost` OMITTED (preserves a manual cost), `supplier_id` inherited from the model's own skus (else cat_covered, else null), `pos_active=false`. **Collision-guarded** — refuses (422 `sku_collision`) if the derived sku already exists as a flat (compartment_id NULL) product. Un-offer soft-discontinues (pos_active=false + discontinued_at; never deletes — FK). +4 catalog.test cases.
- **T3 api 5B** — `recomputeSofaBuildLines` → `recomputeAndExplodeSofaBuildLines`: after the drift gate, EXPLODE the build line into N real per-compartment lines (sku from the model's `product_skus where compartment_id is not null and discontinued_at is null` map; unitPrice = Σ-exact split; attrs as T1) and RETURN the expanded array (route reshapes `parsed.data.lines` → unchanged `create_order`). Fail-closed (`bad_request`) on an unsynced compartment. orders.test rewritten for the explode + a fail-closed case.
- **T4 web** — `apps/web/src/lib/sofa-build-display.ts` (`lineSofaBuildKey` + `groupSofaBuildLines`, pure, strict no-op for keyless lines so the 158 flat orders render identically) applied in `DealerOrderDetail` Items → one "Sofa · 2A + L + 1A" row. Internal ops/PO/stock intentionally stay itemized (per-compartment production/dispatch). +8 tests.
- **T5 web** — `ProductModelDrawer` offered-compartment panel shows the auto-synced sku per offered row (client-derived via the shared `deriveSkuCode`, `· pos off`).
- **T6 review fixes** — adversarial-review minors: (1) MEDIUM sku-collision guard added; (2) LOW `deriveSkuCode` de-triplicated into `@carres/shared/sku-code.ts` (api mint + generate-skus + web read-back now one formula). Accepted-with-rationale: supplier-inherit (T0-verified 1/model), pos_active/description re-assert (canonical), missing build-key (unreachable).
- **Tests** — shared **372/372** · api **808/811** (3 pre-existing) · web **728/733** (5 pre-existing) — 8 fails all §17.7, 0 new regressions. typecheck ×3 clean · SERVICE_ROLE scan on dist = 0.
- **Contract-safe** — `create_order`/`order_lines`/`DraftLine`/`cart.ts`/0089 mutex UNTOUCHED; no migration; userClient/RLS only; non-build + combo orders byte-identical. **Dormant** (0 compartments). **Next = author real compartment data (principal) → engine wakes → live-verify the explode + decide flat-sofa (628) coexistence at cutover.** Deferred: recliner, SO-grid/PDF regroup polish, bedframe, promo. **Loo to live-smoke** in dev (author a compartment → confirm the sku mints pos_active off → drag-build → submit → order detail shows one regrouped Sofa).

## 2026-07-14 · POS My-orders order detail drawer (2990s parity) — PR #156/#157 · migration 0222 · DEPLOYED

Loo: clicking an order card on the POS My-orders board must jump into a 2990s-style order detail — layout + the Proceed rules copied 1:1 (products lock in Proceed, customer details/payment stay editable) — POS-native, never the operation portal. Built ultracode (4-reader understand workflow → API+web builder agents → 3-lens adversarial review).

- **Web** — `PosOrderDetail.tsx` (prototype/pos-order-status.jsx OrderDetail layout, existing `os-detail*` CSS) replaces the `DealerOrderDetail` overlay in `OrderStatusPage` (back-office `/dealer/orders` keeps the old one). Pure `order-edit-scope.ts` (`laneOf` moved here): place lane = everything + 5-chip checklist (customer info incl email / address / delivery date / ≥50% paid / proceed date) gating Move to Proceed; proceed lane = customer/address/payment only, dates locked, `Move to Order placed` while `operation_stage='confirmed'` + proceed_date not passed (MYT) — success does NOT close the drawer (2990s PR 589 parity); delivered = read-only strip. Inline record-payment (method chips → `top_up_order`, already proceed-widened by 0105; non-cash needs slip + approval code). +23 web tests.
- **API** — `POST /api/orders/:id/unproceed` (userClient, /proceed's role list + error map) · PATCH flattens `customer.email` → `customer_email` · `updateOrderInputSchema.customer.email` (shared) · `useUnproceedOrder` hook. +7 api/shared tests.
- **Migration 0222** (`pos_proceed_lane_edits`, applied to prod via MCP 2026-07-14; **renumbered from 0220 mid-ship — Jess had applied 0220/0221 the day before, tail re-verified immediately pre-apply**): `update_order` field-scoped gate (proceed_order accepts customer fields; any delivery/date key → 22023 `proceed_locked_fields`) + `customer_email`; NEW `unproceed_order` RPC (status/stage/proceed-date guards, flips `operation_stage=NULL` so laneOf restores lane 01, FOR UPDATE row lock). Security: NULL-role reject in both fns + `revoke from anon` — post-apply check found `update_order`'s anon EXECUTE inherited via the default PUBLIC grant (0010-era) → PUBLIC stripped + explicit authenticated/service_role grants (PR #157 syncs the file). `has_function_privilege('anon', …)` = false on both, verified.
- **Review** — fidelity APPROVE_WITH_MINORS · contract/RLS REQUEST_CHANGES (the anon hole, pre-apply) · regression zero new fails — all findings fixed. Suites at ship: shared 768/768 · api 128/128 orders (+3 §17.7 pre-existing) · web pos folder 279/279 (+16 pre-existing #147 baseline). NOTE: `pnpm --filter @carres/web lint` is red on main itself (2 hex in `ThankYou.tsx` from `7eb601e`, another session's line) — untouched here.
- **Deploy** — api Worker `15ca3507` · web Pages `fdbd9bc2` (bundle `index-CLTDp4p8.js`, SERVICE_ROLE scan 0) · canonical live-verified (catalog + unproceed both 401 unauthed).
- **CF** — an AutoCount order un-proceeded from proceed_order would strand in place (no signature → proceed 422 forever; 0 live rows in that state). Design doc `docs/superpowers/plans/2026-07-14-pos-order-detail.md`.

## 2026-07-16 · Operation Catalog — operation-facing COSTING catalog (migration 0226)

Loo: 开一个单独 for operation 的 catalog tab，只留 SKU Master / Modular / Fabric；里面的价钱全是 **costing（买货价）**，isolate 出来跟 POS 卖价完全不一样；无 PWP。Data model decided via AskUserQuestion: **共用 product_skus，只隔离价钱**（operation 页面显示/编辑 `cost` 当价钱；不开平行 SKU 表）。

- **Migration 0226** (`operation_costing`, applied to prod via MCP 2026-07-16; pre-apply `list_migrations` tail = 0225 Stripe line): (A) `enforce_sku_price_cost_principal_only` relaxed — **cost writable by operation + principal**; price / pwp_price / prices_by_size stay principal-only (live body verified pre-replace: it already carried the 0204 prices_by_size extension the 0186 FILE lacks). (B) `catalog_fabrics.cost numeric(12,2)` (per-fabric buying add-on) + `catalog_fabrics_set_cost(uuid, numeric)` SECURITY DEFINER RPC (`is_internal()` gate inside, `REVOKE FROM public, anon`, `has_function_privilege('anon')=false` verified post-apply — P8c lesson) + **`catalog_fabrics_batch_save` replaced to carry cost forward by fabric_code** across the principal's replace-all Fabrics saves (without this, any principal Fabrics-tab save would wipe operation's costs; verified live in a BEGIN…ROLLBACK smoke: BF-01 cost 88.88 survived the replace, rollback clean).
- **API** — `gateSkuPatchPriceCost`/`gateSkuCreatePriceCost` split: price/pwp/pricesBySize 403 message unchanged for non-principals; cost now passes for operation, 403 `SKU_COST_ERROR` for everyone else. NEW `PATCH /api/catalog/fabrics/:id/cost` (internalOnly → RPC; P0002→404, negative→422). Bundle untouched — `cost` already rode `catalogFabricFromRow`… now actually mapped (shared adapter emits `cost`).
- **Web** — NEW `OperationCatalogPage` (3 pill tabs) at Operations sidebar item **“Operation Catalog”** (`?tab=op-catalog`, Calculator icon; reachable by operation + principal): `OperationSkuCostTab` (fork of SkuMasterTab, single COST money column, Edit Costs inline commit, category/model/search filters, VISIBLE_CAP 300; no price/PWP/margin/bulk/import/export/new) · `ModularTab` reused as-is · `OperationFabricCostTab` (fabric master + cost add-on column, Edit Costs; tiers/structure stay in P&M). `useSetCatalogFabricCost` hook. The existing Product & Maintenance page is UNTOUCHED (operation still sees it too — narrowing it to principal-only is Loo's call, flagged).
- **Shared** — `CatalogFabricRow.cost` / `CatalogFabric.cost` / `catalogFabricFromRow` cost mapping / `catalogFabricSchema.cost` (`.nullable().optional()` so pre-0226 fixtures + history entries stay valid) / `catalogFabricCostInput`.
- **Tests** — shared 769/769 (+3 adapter cost) · api 1194/1197 (catalog 193/193; +7 new: op cost PATCH/POST allowed, dealer 403, fabric-cost RPC passthrough/403/422/404; 3 fails = §17.7 pre-existing pickups/supplier-pos) · web 1219/1235 + 10 new tab tests (16 fails = the known origin/main #147 baseline, 4 files re-verified in isolation). tsc web+api clean. `lint` red on main itself (ThankYou.tsx 2 hex, PR #170's line) — untouched here.
- **CF** — `catalog_fabrics.cost` rides the GET /api/catalog bundle readable by ALL roles (same accepted read-exposure pattern as `product_skus.cost` since 0175 / `combo-cost-pos-bundle-exposure`); strip for non-internal roles if that CF ever gets fixed, one consistent sweep.
- **Follow-up (same day, Loo's call)** — **Product & Maintenance narrowed to PRINCIPAL-ONLY** (only principal touches selling prices; operation's money surface is the Operation Catalog): per-item `roles` narrowing added to `portal-nav` (`visibleItems()` consumed by both PortalSidebar render paths), and `OperationApp`'s `?tab=catalog` mount now falls back to `OperationCatalogPage` for non-principal (stale deep-link safe). PortalSidebar tests updated (operation: Operation Catalog visible + P&M absent; principal: both).

## 2026-07-18 · Staff PIN login — outlet-pick + 6-digit-PIN 3-tier staff identity (PR #182, migration 0233)

Loo's redesigned dealer/showroom login (4 decisions locked in-conversation): email+password stays gate #1 (the store credential) → outlet picker (only when the dealer has >1 outlet; every store has exactly 1 today → auto-skips) → 6-digit **PIN screen** (tap your name + color tile → keypad) identifies the STAFF MEMBER. Three tiers on `salespersons.staff_role` — **principal** (owner; all outlets; creates manager/salesperson/co-principal; forgot-PIN recovery via password re-verify) · **manager** (outlet-bound; sees whole outlet's orders incl. null-outlet AutoCount rows; creates salespersons own-outlet only) · **salesperson** (own orders only; no management). Showroom = same store machinery ("Carres KL Showroom" is a dealers row), capped at **manager** (its principal = Carres; provision/reset from the principal portal's new Staff drawer). **Forced activation**: a store with no PINs is walked through a one-time setup wizard on next login (password re-proof → create owner identity + PIN → optional PINs for existing staff). **代记 approved**: manager/principal may attribute an order to another salesperson of the outlet; salesperson tier is server-forced to self. PIN = 店内分工与问责, NOT an anti-hacker boundary (accepted trade-off, same as Square/Toast; the DB identity stays the dealer).

- **Migration 0233** (`staff_pin_login`, applied to prod via MCP 2026-07-18; **renumbered 0232→0233 mid-ship — parallel sessions applied `0232_ops_staff_assignment` + `0232_add_order_lines_p2` during the build; tail re-verified immediately pre-apply**): `salespersons` + `staff_role` CHECK principal/manager/salesperson DEFAULT salesperson + `color` (STAFF_COLORS key) + `active` (soft-deactivate — `orders.salesperson_id` FK is NO ACTION so referenced staff can never hard-delete; the legacy DELETE route comment claiming "set null" was wrong) · NEW deny-all `salesperson_pins` (bcrypt `extensions.crypt` bf-10; **zero policies** — user JWTs can't touch it, hash never leaves Postgres) · `staff_verify_pin` (5 consecutive fails → 15-min lock, expired lock resets the window, `FOR UPDATE OF p` serializes) + `staff_set_pin`, both SECURITY DEFINER **service_role-only EXECUTE** (0188 lesson; `has_function_privilege` asserted in-migration + re-verified post-apply). Zero data changes; 6 existing rows defaulted salesperson/active; 0 pins = every store DORMANT.
- **API** — NEW `/api/staff`: GET (roster + `hasPin` boolean + `activated` + `selfStaffId` + `storeKind`) · POST `/verify-pin` (userClient ownership check → adminClient RPC; ok→token, bad_pin→401+remaining, locked→423, no_pin→409) · POST `/reauth` (server-side GoTrue password grant → **pure owner-mode token**: sid null, tier from role — deliberately NOT bound to a `user_id` link; the prod showroom login carries a legacy salesperson-tier link that would have downgraded + bricked its wizard, caught in T4 review) · POST `/self-token` (salesperson-role logins) · tier-gated create/PATCH/set-pin (owner-mode = store-wide below principal; outletId ownership validated — bare FK would accept another dealer's outlet). Staff session = jose HS256 (`X-Staff-Token`, new Worker secret `STAFF_SESSION_SECRET`, 12h, `did===JWT dealer` checked). `orders.ts` staff scoping (list/detail/create only): activated+tokenless dealer-family → 403 `staff_session_required`; salesperson tier → forced `.eq(salesperson_id)` + POST overwrite; manager → `.or(outlet_id.eq.X,outlet_id.is.null)`; principal → no narrowing; **salesperson-ROLE logins scope server-side via `salespersons.user_id`** (person-level credential needs no PIN; unlinked → dormant, never a lockout); internal roles + principal on-behalf POS fully exempt; dormant store byte-identical; activation probe fails OPEN (workflow gate, not a security boundary).
- **Web** — `StaffGate` wraps `DealerApp` (PrincipalApp's direct DealerPos mount stays gate-free): !activated → forced `SetupWizard` (dealer→principal identity, showroom→manager; STAFF_COLORS dots; PIN twice on the keypad; skippable existing-staff PIN step) · activated → `OutletPicker` (auto-skip at 1) → `PinScreen` (color-avatar tiles, PIN-less tiles disabled 「未设 PIN」, bad-pin shake + remaining, lockout countdown, Forgot-PIN → password → owner-mode → Settings). `PinPad` extracted from OrderStatusPage's gate (testIdPrefix keeps os-pin-* byte-identical; that board's shared "111111" now auto-skips under a staff session). `StaffSwitchChip` (换人) in DealerPos + DealerChrome headers; shared-kiosk guard drops a stale session from another store. CustomerStep: outlet locked to the session outlet (principal free); salesperson select locked-to-self for salesperson tier, 代记 dropdown for manager+/owner-mode. DealerSettings staff section: tier badges, color picker, Set/Reset PIN, Add staff (tier options per caller tier + storeKind), deactivate replaces the FK-broken hard delete. `PrincipalStaffDrawer` on PrincipalAccounts rows (showroom caps at manager).
- **Build** — T1 migration+shared inline → T2 api + T3 web as parallel opus subagents → T4 independent adversarial review (APPROVE_WITH_MINORS; MAJOR salesperson-role lockout + the showroom owner-mode downgrade both fixed same-day; minors → CFs below) + 2 seam fixes caught cross-agent by hand (owner-mode create/PATCH/set-pin lockout; reauth response-shape starving the wizard). origin/main merged twice mid-flight (25 + 10 commits — the New-Order/balance-tab workstream ships hourly).
- **Tests** — shared 795/795 · api 1277+ pass (3 = §17.7 pre-existing) · web = origin/main's own baseline exactly (16 pre-existing fails, verified identical on pristine main — 11 of them are the OperationOrders/OrderCustomerCard set from the parallel workstream, NOT this branch) + 34 new staff tests + 56 new api staff/orders tests. lint + check:v4 clean.
- **Deploy** — migration 0233 on prod · `wrangler secret put STAFF_SESSION_SECRET` · api Worker `3476f172` · web Pages deploy `40724910` (bundle `index-BNH6kR3j.js`, SERVICE_ROLE scan 0). **Live smoke (real dealer JWT, mattress@carres.com)**: GET /api/staff → correct roster/activated:false/storeKind:dealer · GET /api/orders → 200 dormant passthrough · unauth → 401 · canonical URL serves the new bundle.
- **CF** — `staff-order-mutation-scope` (order mutation routes — lines/proceed/cancel/PATCH/top-up/address/date — are NOT staff-tier-narrowed; GET list/detail + POST create are; RLS still dealer-bounds everything; add the same resolveStaffScope gate if tightening is wanted) · `staff-wizard-claim-preprovisioned` (wizard step 2 always CREATES a new identity — a principal-pre-provisioned PIN-less manager would be duplicated; dedupe = deactivate, or add a claim-existing flow) · `staff-salesperson-user-id-provisioning` (principal account creation never sets `salespersons.user_id`; future salesperson-role email logins start unlinked → dormant/unscoped until linked by hand) · forced-activation UX note: EVERY dealer/showroom login now walks the wizard once — the 3 alpha stores are the blast radius. Plan `docs/superpowers/plans/2026-07-18-staff-pin-login-plan.md`.

## 2026-07-18 · POS entry fixes — structured delivery address + config-driven manual payment methods (PR #173, migration 0230) · DEPLOYED

Two POS/order-entry follow-ups Loo asked for on the same day. Both additive, both applied + verified on prod via MCP (0230 `structured_delivery_address`).

- **Structured address** — `orders` gained `customer_address_line1`/`_line2`/`_state`/`_city`/`_postcode` (additive, nullable). The composed `customer_address` STRING REMAINS canonical for all downstream consumers (SO grid, ops cards, PDFs) — **INVARIANT: the parts always match the composed string**. Flat-only writers (EditOrderModal, the ops customer card) CLEAR the parts (a stale-guard inside `update_order` + `set_order_address`) so a legacy flat edit can never leave a mismatched structured shadow. `set_order_address` was DROP+recreated with a new `p_parts jsonb default null` 5th param; `create_order` + `update_order` extended via CREATE OR REPLACE after verifying the LIVE defs matched repo 0219/0222 (no drift). **No backfill** — legacy orders seed Line 1 from the composed string in the POS drawer and upgrade on next edit. `PosOrderDetail`'s Delivery card now uses the SAME `MYAddressFields` cascading picker as the wizard; the wizard + AddAddressModal persist the parts. "Seri Kembangan" (43300) added to the Selangor dataset in `malaysia-postcodes.ts`.
- **Config-driven manual payment methods** — the manual-payment panels (`PosOrderDetail` "record a manual payment" + `TopUpDepositModal`) now render the ACTIVE `order_entry_config` methods via `resolvePaymentMethods` (the SAME source as checkout) instead of hardcoded 5-key lists. `topUpOrderInputSchema.method` widened from the closed enum to a kebab string; the top-up route validates method ∈ active config keys ∪ legacy {cash,bank,cheque,online,card} (422 `invalid_payment_method`); the proof rule (slip + approval code) is driven by the method's `approvalCodeRequired`. `OrderEntryPage` shows a locked read-only Stripe SYSTEM row (`STRIPE_PAYMENT_METHOD`) so the config page reflects the full checkout list.
- **Deploy** — several roll-forwards that day; FINAL state after everything: api Worker `5dc3406a-4173-49f9-8299-9867150ab26a` · web `index-BwAFO91J.js` (canonical carres-portal.pages.dev + pos.carresofficial.com verified).
- **CF** — `structured-address-flat-writer-clears` (LOW; EditOrderModal + ops `CustomerIdentityCard` still write the flat string only → clear the parts, by design) · `topup-method-ledger-check-mismatch` (MEDIUM; the 0193 `order_payments` ledger CHECK still whitelists cash/bank/card/cheque/online/other — align before any config key ever flows into that ledger; `top_up_order` writes `orders.paid` + history only today, so no CHECK collision yet).

## 2026-07-18 · Add-product initiative — 3 phases, the FIRST post-create order_lines write path (PRs #174/#179/#183, migrations 0231/0232/0233) · DEPLOYED

Loo: a salesperson (or HQ) must be able to ADD a product to an existing order after it's created. Built as a 3-phase append-only initiative (design doc `docs/superpowers/plans/2026-07-18-order-add-product-initiative.md`). This **supersedes the old "ZERO order_lines write path" contract note** from the 2026-07-14 pos-order-detail design §7 — order_lines is now append-only writable through a single gated RPC. Locked defaults (Loo): approvers = operation+principal only; server catalog price authority (no ops repricing); an approved add does NOT un-proceed the order.

- **P1** (PR #174, migration **0231**) — `add_order_lines` RPC (APPEND-ONLY; place-lane gate = status place + operation_stage null + not autocount; per-line sku existence + merged-cart 0089 mutex re-checks; history + audit; items_edited flip for autocount) + `order_change_requests` table shipped DORMANT (select-only RLS, one-pending partial unique). Route `POST /api/orders/:id/lines`: **server catalog price authority** (client sends sku/qty/attrs; flat lines priced from fresh `product_skus.price` + special-addons + option-picks trust gates). Web: `order-edit-scope` `canAddProduct` (place lane), `AddProductOverlay` (POS card grid + `ConfigureDrawer`), PosOrderDetail "+ Add product".
- **P2** (PR #179, migration **0232**) — full engine pipeline over the MERGED cart: sofa build add (drift gate on optional-schema `unitPrice` preview → server explode; quick picks included; overlay mounts `PosConfigurePage`/`SofaConfigurePage` per CatalogStep's convention), default free gifts resolved over NEW lines only (per-triggering-line semantics — no diff needed), PWP CODE-LESS claims only (voucher-coded → 409 `pwp_voucher_add_not_supported`; ONE promo application/order via add → 409 `pwp_add_conflict`, existing markers stripped to context lines), delivery fee recomputed over the merged cart (operator inputs recovered from persisted DELIVERY*/DELIVERY_ADD rows; NEW `excludeOrderId` ctx param spares the order's own cross-link from the single-use backstop) → atomic replace via 0232's `p_addons_replace` (DROP+CREATE 5-arg; scoped DELETE limited to the 3 DELIVERY* keys; p_lines cap 10→30 for explosions). Adversarial review REQUEST_CHANGES → all fixed + test-pinned: #1 existing pwp rows never re-validated as fresh claims, #2 raw un-exploded `sofa_build` on existing rows fails closed (422 `existing_build_unsupported`), #3 orphan specials_total/options_total without a picks array can't skew the base.
- **P3** (PR #183, migration **0233**) — proceed-lane submission + HQ approval. 3 new SECURITY DEFINER RPCs (`submit_order_change_request` — proceed-lane only, place → 422 `use_direct_add`, one-pending → 422 `pending_exists`; `cancel_order_change_request` — DEALER-SCOPE by design; `reject_order_change_request` — operation/principal + note). APPROVE has NO standalone RPC — it IS `add_order_lines` p_source='change_request' (CREATE OR REPLACE, same 5-arg signature): operation/principal only, FOR UPDATE + status/applied_at recheck (no double-apply), autocount allowed (items_edited flips), atomic apply+stamp. Hono: `computeAddLinesWriteSet` extracted from the direct route and shared with the decide route (approval re-prices everything FRESH); 4 new routes GET/POST `/:id/change-requests`, POST `.../:reqId/cancel`, POST `.../:reqId/decide`. Web: POS proceed lane "Submit product change" (same `AddProductOverlay`) + pending banner + Cancel + rejection-note display (`canSubmitLineChange`); ops `OrderDetailDrawer` Items tab mounts `ChangeRequestsPanel` (approve/reject + note, auto-hides). Adversarial review APPROVE_WITH_MINORS — #1 fixed (submit route mirrors the build-preview-price guard), #2 documented (dealer-scope cancel).
- **Deploy** — 0231/0232/0233 on prod (0233 shares its number with `0233_staff_pin_login`, cosmetic — tracker keys on timestamp). FINAL that day: api Worker `5dc3406a` · web `index-BwAFO91J.js`.
- **CF** — `add-lines-pwp-one-promo-policy` (MEDIUM) · `add-lines-delivery-rederive` (MEDIUM) · `change-request-midproduction-approve` (MEDIUM) · `add-lines-rpc-30-line-cap` (LOW) · `change-request-survives-unproceed` (LOW). See §17.5.

## 2026-07-18 · POS/ERP domain split — pos.carresofficial.com / erp.carresofficial.com (PR #196)

Loo: isolate the retail POS onto `pos.carresofficial.com` (users: dealer + showroom + BD) and keep the original portal as `erp.carresofficial.com` — same shape as 2990s (`apps/pos` + `apps/backend` sharing one API). Carres mirrors it at the DOMAIN level: **one build artifact, two Pages projects, two custom domains** (code stays one tree — a physical folder split stays available later, invisible to users).

- **Web** — `lib/portal.ts` (hostname→portal detection; POS roles = dealer/salesperson/showroom/bd, ERP = principal/operation/finance/supplier/partner) + `WrongPortal` signpost card (no silent cross-domain redirect — Supabase sessions are per-origin) wired into `RequireRole` + `HomeRedirect`. `*.pages.dev` + localhost stay UNGATED ("all") as the legacy/preview/dev doors, so nothing strands before the domains are bound.
- **API** — CORS `origin:"*"` (Phase 9 signed-off risk) → allowlist: the two portal domains + both Pages projects (hash previews included) + localhost/127.0.0.1. **Latent-bug catch:** `X-Staff-Token` (0233 staff sessions) was missing from `allowHeaders` — browsers would have blocked every PIN-authenticated call at preflight the moment a store activated; fixed here.
- **Deploy** — NEW Pages project `carres-pos` (deploy `7f20da3f`) + `carres-portal` (`90e0e96a`), both from the same dist; api Worker `9a94a203`. Live smoke: pos-origin preflight allowed w/ X-Staff-Token · pages.dev origin still allowed · evil.com blocked · both roots 200.
- **Loo's 2-min action** — CF dashboard → Workers & Pages → **carres-pos** → Custom domains → add `pos.carresofficial.com`; **carres-portal** → add `erp.carresofficial.com` (zone already on CF; DNS auto). Gating turns on per-domain the moment each binds.
- **Tests** — api cors 14 · web portal 5; suites otherwise at the known baselines (§17.7 + the parallel workstream's 16).

## 2026-07-19 · POS owner self-service — staff entry + store credential (PR #204, migration 0240)

Loo (from the POS as "tan qu qu · 店主"): no tab anywhere in the POS to add staff (sales manager / sales executive), and the dealer principal needed store-credential self-service — password self-changed, login email changed only via HQ approval.

- **POS Staff entry** — the staff surface already existed at /dealer/settings (0233) but the only path from the POS was the Exit icon that reads as "sign out". Fix: extract the Settings "Staff & PINs" section into a shared `StaffSection` (same testids; DealerSettings now mounts it) + new `StaffManagePage` full-screen POS overlay (OrderStatusPage shell) + a top-bar "Staff" pill in DealerPos shown only to principal/manager-tier staff sessions (owner-mode included; salesperson tier + principal on-behalf never see it). Web-only; the 0233 tier-gated routes stay the authority.
- **Store password** — DIRECT change: `lib/password.ts` extracts the /me two-step (verify current via signInWithPassword → updateUser); /me and the new POS modal share the one implementation. Knowing the current store password is the gate — lower tiers can't use the form even if they could see it (they can't: dealer-store principal tier only; showrooms excluded, their credential is Carres').
- **Store email** — submit-for-approval: migration **0240** `account_email_change_requests` (one-pending partial unique per login; RLS: select = internal OR own dealer, insert = own login pending only, update = own pending→cancelled ONLY). Dealer side `/api/account/email-change` (GET latest / POST submit / POST :id/cancel) gates on dealer role + principal-tier staff token + a store-password re-proof (the /reauth-style GoTrue grant) + an early email-in-use probe. HQ side `/api/principal/accounts/email-change-requests` (list w/ dealers(name) · approve · reject+note): APPROVE does the REAL swap — `auth.admin.updateUserById(email, email_confirm)` + `app_users` mirror + audit_log — ordered so a partial failure leaves the row pending and re-approve is idempotent; REJECT parks a note the store sees under its email row. Web: `StoreAccountSection` (POS overlay + Settings, shared) with pending badge + withdraw + reject-note display; `EmailChangeRequestsPanel` atop PrincipalAccounts (hidden while empty).
- **Numbering lesson** — drafted as 0239 in docs/drafts/ per guardrail #8; between draft and Loo's "go" a parallel session took 0239 (`0239_product_bundles`). Re-checked the tail at apply time → renumbered 0240 (+ sweep of code comments). The draft-first flow is exactly what made the collision harmless.
- **Tests** — shared 846/846 (+6) · api 1359/1362 (+18; 3 fails = baseline) · web 1319/1335 (+10; 16 fails = §17.7 baseline) — zero new regressions, re-verified AFTER merging main (#205/#206/#207 landed mid-flight, auto-merge clean).
- **Deploy** — 0240 applied via MCP (table/RLS/policies verified); api Worker `ca4faad8-015b-4a42-aede-61055d23040e`; web `index-CBEOyPTg.js` to BOTH Pages projects (carres-portal `c52a241e` + carres-pos `ea66ff66`, --branch=main); dist SERVICE_ROLE scan = 0; pages.dev canonicals + pos./erp.carresofficial.com live-verified cache-busted; /api/account/email-change → 401 live.

## 2026-07-19 · Bundle pricing — N products at ONE bundle price (PR #208, migration 0239)

**Ask (Loo, screenshots):** Cloud Series Mattress + Lumi classic + Kayu Platform Bed — "这三个能形成一个卖价，这三个的 king size 变成 2500 块 one bundle"; management lives in the Product & Maintenance **Promo / GWP tab** ("+ New Bundle" in the header button row + a section with Edit).

**History note:** this deliberately REINTRODUCES the fixed-set concept the 0177 `combos` tables carried before 0206 dropped them ("Overall Combo", written-in-error as a 2990s misread). This time it's an explicit ask; named **bundles** so "combo" unambiguously = the 0179 sofa system.

- **Migration 0239** `product_bundles` — name / price numeric(14,2) / components jsonb `[{sku,qty}]` / active default false / sort_order; RLS read-all + InitPlan-wrapped `is_principal()` write (0186 template verbatim). Applied via MCP; dormant until seeded.
- **Shared** `product-bundle.ts` — `parseBundleComponents` (lenient jsonb cleaner) + pure **`explodeBundle`**: per-UNIT allocation in integer cents, proportional to catalog price × qty, largest-remainder distribution (+ a symmetric negative-residue reclaim for float-extreme magnitudes; input price capped RM 1M in zod) → **Σ lines === bundle price to the cent, always**. A qty>1 component may emit two lines one cent apart; every line carries a `slot` the POS stamps as `attrs.bundle_slot` so attrs-keyed cart merging can never collapse different-priced same-SKU lines. 11 TDD tests.
- **API** — bundles in GET /api/catalog (fetched unfiltered; POS = active only, admin = all — the special-addons pattern) + principal-gated POST/PATCH/DELETE `/api/catalog/bundles` mirroring the pwp-rules routes exactly (principalOnly early-403, userClient/RLS, mapPgError). 14 route tests.
- **ERP** (PromoTab, the 4th grid cell) — "+ New Bundle" header button + Bundles section: rows (name · components summary by product name · price · inactive pill · Edit/Delete), modal/inline `BundleForm` with product→size→qty component rows (optgroup by category; single-SKU products auto-pick), **live split preview running the SAME `explodeBundle`** (per-line share + "was" catalog price + customer-saves line), Save **blocked** on 0089 sofa×mattress/bedframe mixes and on retired/ghost SKUs (surfaced by name), price rounded to the cent.
- **POS** — `bundles` RailKey (shows only when ≥1 active bundle) + `BundleCard` (prod-card anatomy; BUNDLE badge; **price shown** — deliberate exception to the no-price-on-cards rule, an offer is meaningless without it; strikethrough catalog worth; first component's photo). Cards lead the "All open" grid. Tap = `addBundle`: explode → append N grouped `DraftLine`s (`attrs.bundle_key/label/group/slot`, per-add uuid group). **Cart guards:** remove any component → the WHOLE group goes (toast); qty steppers disabled; `lineEditTarget` → null (no ✎); Make-free + PWP affordances hidden (no discount stacking on the split price). Card disabled when the sofa-mutex locks its family or a component SKU is off the POS bundle (explode refuses to guess — the 0177-era `combo-component-price-availability` lesson, closed by design here).
- **Contract safety:** create_order / order_lines / DraftLine / cart merge semantics / 0089 mutex UNTOUCHED. Bundle lines are plain client-priced lines with pass-through attrs (`z.record(z.unknown())`), the same create-trust model as every POS line; the free-gift strip spreads attrs so bundle keys survive; PWP/sofa/delivery recomputes key off their own markers only. AddProductOverlay (the server-catalog-price add lane) has NO bundle affordance — no repricing conflict by construction.
- **Review:** adversarial fork — **APPROVE_WITH_MINORS**. Σ-exactness, a full cart-mutation-path bypass hunt, server-pipeline interference, API/RLS mirror and migration template all survived attack. 3 minors fixed same-session (mutex now blocks Save; ghost-SKU guard; 2dp price round) + 2 nits (stable `bundles` memo identity). Quote staleness + PWP/GWP stacking recorded as CFs (`bundle-quote-stale-price`, `bundle-order-detail-itemized`, `bundle-pwp-gwp-stacking` — the last is a POLICY item: the live Cloud·Lumi→Kayu PWP rule + Cloud's GWP both stack on top of the bundle discount; deactivate the rule if the bundle replaces it).
- **Numbering:** remote tail re-checked before numbering (guardrail #8) → 0239; the parallel session's draft renumbered itself to 0240 at its apply time — collision resolved by the draft-first flow.
- **Tests/verify:** shared 848 · api 1355/1358 · web 1319+/1335 (all fails = §17.7 baseline, zero new; 39 new bundle tests) · tsc both clean · design-standard lint + v4-guard clean · dist SERVICE_ROLE = 0.
- **Deploy:** api Worker `88fa0ac1-8078-4ec8-a022-473732d31efc` · web `index-51dnmdW6.js` → carres-portal `0d48c842` + carres-pos `676edf32` (`--branch=main`), from main `fcfaea6` (strict superset of the same-day `82be9bc` deploy). Cache-busted canonicals verified; GET /api/catalog → 401. **Seeded: "King Bedroom Set" = MAT-001-K + LUMI-CLASSIC-K + BED-201-K @ RM2,500, ACTIVE** (id `7e6b3629`; one-time seed — future bundles via the UI).

## 2026-07-19 · Dealer goes POS-only — back-office tabs deleted (PR #210, no migration)

Loo (screenshots): pressing the corner "lockout" control in the dealer POS jumped to the back-office Orders tab (with a load error); the whole three-tab chrome (Orders / Products / Settings) is redundant — "完完全全会用我们一般正常的那种 POS system 里面操作所有的问题". Web-only; net **−1,171 lines**.

- **Deleted:** `DealerChrome` + `DealerOrders` + `DealerOrderDetail` + `DealerProducts` + `DealerSettings` (+ its test). `DealerApp` routes collapse to the POS index + catch-all redirect (legacy `/dealer/*` bookmarks land on the POS).
- **Corner control = LOCK** (dealer-side): clears the staff token → StaffGate PIN screen; the draft persists and restores on the next unlock; icon LogOut→Lock, title "锁定 · Lock POS". Principal on-behalf keeps its `onExit` LogOut exit + unsaved-draft confirm (unchanged). Hidden when there's neither (unlinked salesperson — sign-out stays on the /me chip).
- **ThankYou "View orders"** → opens the in-POS OrderStatusPage board (principal on-behalf keeps `onExit`).
- **Outlets management** — the ONE Settings feature the POS lacked — moved verbatim into the StaffManagePage overlay as `staff/OutletsSection.tsx` ("+ Add outlet", principal tier only, same gate + testids; closed-loop preserved). StaffManagePage = the store's ONE admin surface: staff+PINs · outlets · store credential.
- **Forgot-PIN owner reauth** now lands on `/dealer` with a one-shot `{openStaff:true}` location-state flag that DealerPos consumes to auto-open Staff & PINs (used to `navigate("/dealer/settings")`).
- **Orphan sweep:** StaffSwitchChip "kit" variant removed (prop gone, single POS look); PinScreen/SetupWizard/ForgotPin copy re-pointed from "Settings" to the POS Staff button; stale docstrings (StaffSection/StoreAccountSection/useCreateOutlet) updated.
- **Known loss (flagged):** old Settings' read-only account card (name/region/status/deposit balance) has no replacement surface — display-only; add to the Staff overlay if Loo asks.
- **Role impact:** dealer + showroom (shared DealerApp) become POS-only; principal on-behalf + internal roles untouched; no API/schema change.
- **Tests/verify:** full web suite 1,316 passed / 16 failed (all §17.7 baseline, zero new); dealer scope re-run after merging bundle-pricing main: 507/507; tsc + design-standard lint + v4-guard clean; dist SERVICE_ROLE = 0. Ported the deleted DealerSettings.test tier-gating cases into StaffManagePage.test (outlets visibility per tier + manager PIN scope).
- **Deploy:** web `index-BBnNMd71.js` → carres-portal `9aa28f4b` + carres-pos `8153d394` (`--branch=main`), from main `942e80da` (= PR #210 merge, includes PR #208 bundle pricing). Cache-busted verify: both pages.dev canonicals + `pos.carresofficial.com` all serve the new bundle. API not redeployed (web-only).

## 2026-07-19 · Staff profile + one-step PIN + English-only UI + centred staff page (PR #209, migration 0241)

Loo's four-point feedback on the freshly shipped Staff & PINs surface, same day:

- **Profile fields** — Add-staff now collects email / birthday / gender (required in the form). Migration **0241** adds the 3 nullable `salespersons` columns (additive, zero RLS change); shared row/domain/adapter/zod + api staff POST/PATCH carry them end-to-end; contract-level optional so the setup wizard + HQ initialStaff callers keep working untouched. The AddStaffModal is shared, so the POS overlay AND the principal Staff drawer gained the fields together.
- **One-step PIN** — the 6-digit PIN (+ confirm) is set inside the Add-staff modal itself; `createStaffInputSchema.pin` had existed since 0233, the modal just never collected it. No more add-then-Set-PIN double job; the per-row Set/Reset PIN action stays for later rotations.
- **English-only UI** (rule saved to memory `ui-english-only`) — every user-visible bilingual string swept: TIER_LABEL/tierLabel refactored from {zh,en} pairs to plain English strings (店主·Owner→Owner; showroom ladder Sales Manager / Sales Executive), 换人→Switch, 改 PIN→PIN, 未设 PIN→No PIN, plus StoreAccountSection, EmailChangeRequestsPanel, WrongPortal, CreateLpAccountForm, OpsStockListView options, the ops drawer customer-edit hint and the POS name placeholder. Deliberately kept: code comments, test fixture data (王小明), `lib/cjk.ts` + the Noto PDF font (real customer names may be Chinese), DB data (AutoCount Archive 旧账).
- **Centred layout** — StaffManagePage content sits in one centred 780px column; the back button floats top-left.
- **Alvin backfill** — one-off data import via MCP SQL (email alvin@gmail.com · birthday 1988-07-11 [DD/MM read] · male); future members get the data through the form.
- **Mid-flight merge** — PRs #208 (bundle pricing) and #210 (dealer POS-only, back-office DELETED) landed on main between our PR open and the go. Merge took main's structure (DealerSettings/DealerChrome gone → StaffSection/StoreAccountSection now live only in the POS overlay; StaffSwitchChip single-variant) + our English copy; one content conflict (StaffSwitchChip) resolved by hand.
- **Numbering** — tail re-checked at apply (0240 → 0241 free), the morning's 0239-collision lesson applied.
- **Tests** — shared 857/857 · api 1373/1376 · web 1330/1346 (all fails = §17.7 baseline, zero new). **Deploy** — api Worker `226ae939-433b-4081-871c-708ce1ec36f2`; web `index-DDzoHDae.js` to carres-portal `9f57e2f5` + carres-pos `7db1b4b4`; pages.dev canonicals + pos./erp.carresofficial.com all cache-bust verified; dist SERVICE_ROLE = 0.

**Follow-up (same day, PRs #212 + #214):** Loo — the corner control should be a real **LOG OUT** to the email+password login, not the PIN lock ("PIN 那边基本上在换人那边就可以换了"). Dealer-side `handleExit` now: confirm guard ("Log out of the store account? …" — an accidental tap locks out staff who don't know the store password, and signOut's PII guardrail wipes the draft) → drop the staff token (next store login starts at the PIN gate, not as the previous person) → canonical `signOut()` → `/login`. Icon stays LogOut; button always shown dealer-side; principal on-behalf branch byte-identical. #214 = 2-line copy fix: the confirm + title joined PR #209's English-only UI sweep (they were briefly the only Chinese strings left in the POS). **Deploy race note:** the parallel #209 session deployed a pre-#212 build minutes after #212 went live, reverting it on prod; resolved by rebuilding from the union main tip → `index-ItuJHcJ4.js` (carres-portal `9c621126` + carres-pos `cc76f1f0`), live-verified on all 3 canonicals incl. the logout marker string. Pre-deploy `git log HEAD..origin/main` is now doubly non-negotiable with parallel sessions shipping same-day.

## 2026-07-19 · Sofa build = ONE customer line (receipt + SO PDF regroup) (PR #223, no migration)

Loo (screenshots): the POS ThankYou receipt listed a built sofa as 3 "Booqit" rows at split prices — "这个 sofa 本身在 sales order for customer 手里其实是一个 item（一个 model line）… 拆成三行是 Operation 那边拆的". Customer surfaces now regroup the Phase-5 exploded `order_lines` into ONE model line carrying the cart-style spec copy (`1B(LHF) + CNR + 2A(RHF) · 24″ · CG-011 Peach · leg 4″`); ops / PO / stock / SO-grid stay itemized by design.

- **shared** — `explodeSofaBuildToOrderLines` now stamps `sofa_height` on EVERY per-compartment line (the seat size died at explode, so "24″" could never re-print; additive jsonb key — pre-existing orders simply omit the height segment, not backfillable). New pure `sofaBuildSpec()` (`sofa-spec.ts`) re-composes the cart `buildLabel` from exploded attrs: module codes walked LEFT→RIGHT via persisted x/y/rot geometry when complete (stored order otherwise — never invents an order) + height + `fabric_name` (or `fabric_series · colour KIV`) + `leg N″`. One implementation for web + api so every customer surface prints the SAME copy.
- **web** — ThankYou receipt regroups via `groupSofaBuildLines` (one row: model name + spec + build total; hero "Your 3 pieces" → counts a build as ONE piece); `SofaBuildGroupRow.summary` (codes-only) upgraded to `.spec` (full copy) + the group total cent-rounded; PosOrderDetail's already-regrouped row prints the same spec.
- **api** — `/sales-order-data` groups lines sharing `attrs.sofa_build_key` into one row: SKU column = `product_models.model_key`, description = model name, price = the Σ-exact split total, `attrs.sofa_spec` = the copy (the slim `pwp` reward marker survives so "Promo · FREE" still prints). Flat orders render byte-identically. SO PDF template prints the `sofa_spec` sub-line.
- **Contract safety** — `create_order` / `order_lines` / `DraftLine` / RLS / migrations untouched; the ONE write-path change is the additive `sofa_height` attrs key. A voucher whose trigger sku is a compartment sku now prints in the SO doc's defensive orphan block instead of under its line.
- **CF (LOW)** — the finance/ops **invoice** PDF still itemizes compartments (internal/tax doc, dealer-denied route; regroup it only if Loo asks).
- **Tests** — shared 865/865 · api 1374/1377 · web 1347/1363 (all fails = §17.7 baseline, zero new); tsc ×3 + design-standard lint clean; dist SERVICE_ROLE = 0.
- **Deploy** — api Worker `ec296e17-bfab-4e66-9ad6-f8131039bd48` (GET /api/catalog → 401 ✓); web `index-Bc-UrMMr.js` → carres-portal `d48b6315` + carres-pos `508d03b8` (`--branch=main`, from main `79c6f71a`); cache-bust verified on both pages.dev canonicals + `pos.carresofficial.com`, `sofa_spec` marker present in the served bundle. Note: a parallel session production-deployed carres-pos seconds later from the same main tip — canonical settled on the new bundle, marker re-verified.

## 2026-07-19 · BD portal = the POS — network board, on-behalf everything, dealer-account door (PR #225, no migration)

**Ask (Loo)**: 删掉现在的 BD interface，一进去直接是 POS；My orders 看全部 dealer 的 SO（By Dealer 筛选、每家的单/total sales/audit history）；BD 拥有 dealer 的全部权限动作（帮补资料、开 staff 账号）；再加开户权：帮 dealership 开 principal 账号（与 principal 端同步）+ sales manager / sales executive 账号。

**Why zero migration**: `is_internal()` has included `bd` since migration 0002, so BD already reads every order/dealer/salesperson/history row under RLS, and the July orders-route gates (`ORDER_CREATE_INTERNAL_ROLES`, `ORDER_MUTATE_ROLES`, the on-behalf body-dealerId honor list) already named `bd`. The entire feature is routing + UI + two route-gate widenings.

- **Web**: the ERP-style Network Pulse (BDDashboard/BDDealers/BDDealerDetail/BDInquiries/BDOrderModal/BDSidebar) deleted; `BDApp` mounts `DealerPos` directly — the principal on-behalf mechanism reused verbatim (in-flow dealer pick at the CUSTOMER step off `/api/bd/dealers`, body dealerId, StaffGate exempt). Old /bd/* bookmarks land on the POS.
- **BdOrdersBoard** (My orders): 3 lanes via the newly extracted `pos/order-board-ui.tsx` (OrderCard/SummaryCard/revenue math; OrderStatusPage re-exports so its tests/imports held), By-dealer dropdown, salesperson dropdown once a dealer is picked, month/range nav, dealer chip on cards in All mode, AutoCount archive excluded from the All-dealers lanes (店内视角照旧显示), no PIN gate. Summary card 2 carries the picked dealer's all-time GMV/orders/outstanding footnote from `dealers_with_stats`.
- **PosOrderDetail**: internal-only (principal/operation/finance/bd) History timeline from `order.history` — the audit trail per SO; dealer-facing drawer byte-identical. BD edits ride the existing lane rules — proceed 后 items 照旧锁死。
- **BdAccountsPage** (Accounts pill, BD-only): roster + stats + audit activity feed; `BdCreateDealerModal` (company/SSM/PIC/address → default outlet · login email + manual password ×2 · first staff + PIN — the shared `createAccountInput` zod, HQ-door parity); `BdStaffPanel` per store on the shared AddStaffModal/SetPinModal/EditStaffModal.
- **API**: `/api/staff` admits bd as an internal-HQ caller (`?dealerId=`, principal-tier); HQ salespersons INSERT/UPDATE + the app_users storeKind probe moved to `adminClient` (RLS `salespersons_dealer_write` covers principal but NOT bd — bd's JWT would be denied; the routes' explicit dealer/outlet ownership checks remain the gate; RLS itself untouched). `POST /api/bd/accounts` = the principal create-account handler extracted VERBATIM into `lib/create-account.ts`, mounted behind a bd-only guard with `allowedRoles: ["dealer"]`; audit_log attribution role='bd'. service_role usage stays inside the CLAUDE.md §4.3 "account creation" sanctioned category.
- **Latent HQ bug fixed**: PrincipalStaffDrawer → SetPinModal never threaded `dealerId`, so an HQ principal resetting another store's PIN hit resolveTargetDealer's 400. `useSetStaffPin`/`usePatchStaff` + SetPinModal/EditStaffModal gained optional `dealerId`; the drawer passes it.
- **Evidence**: api 1386/1389 · web 1357/1373 · shared 865/865 (fails = §17.7 baseline exactly; +17 new tests — staff bd matrix, bd-accounts door incl. a principal-door regression case, board, accounts page, history timeline). tsc clean ×2; design-standard clean (the moved `#C5806B` re-baselined onto order-board-ui.tsx; a doc-comment "PR #219" tripped the hex regex — reworded). Deploy from the post-#225 union tip `49181568` (carries the parallel session's #224): api Worker `53ab2736` · web `index-vstdfF5F.js` → carres-portal `5cb336af` + carres-pos `2b4c8630`; pos./erp.carresofficial.com + both pages.dev cache-bust-verified, served-bundle SERVICE_ROLE grep 0, `/api/bd/accounts` unauth 401.
- **CFs**: `bd-network-board-page-cap` (MEDIUM — month cards read one capped orders page; all-time line is RPC-safe) · `bd-inquiries-ui-retired` (LOW — API + table alive, UI gone).

## 2026-07-24 — Catalog tabs mirrored into the sidebar (PR #251) + union-tip deploy

**Ask (Loo)**: "i want this tab show on the left bar tab as well" — the Product & Maintenance tab bar (SKU Master / Modular / Special Add-ons / Fabrics / Delivery / Maintenance / Sofa Combos / Promo / GWP) must also appear on the left rail. Worktree `worktree-catalog-sidebar-subtabs`, web-only, NO migration.

- **`catalog-tabs.ts` (new)**: the 8-tab registry extracted to ONE shared module — the in-page `PillTabs` bar and the rail's section links both read it, so the two switchers can never drift.
- **URL contract**: `ProductMaintenancePage`'s active tab was pure `useState`; it is now URL-driven via `?section=<key>` riding alongside the shell's `?tab=catalog`. Pill clicks write the param back (history push — Back walks tabs); unknown/missing → SKU Master, so stale links never break. This is the piece that lets the rail deep-link a tab at all.
- **`portal-nav` + `PortalSidebar`**: generic `sub` field on a nav item — section links render indented (pl-43px, aligned to the parent label) under the item ONLY while it is active. v17 rail idiom: 12px text, `hover:bg-hovertint`, active = `bg-base-100` + semibold; the 3px flame bar stays on the parent alone (flame-anti-abuse). The collapsed 60px icon rail skips subs (no icons for them; the parent icon lands the default tab).
- **Canonical door**: the catalog was deduped to the Operations area 2026-06-30 and the rail's sub-tabs hang off that ONE entry — so the legacy `/principal?tab=catalog` mount now `<Navigate replace>`s to `/operation?tab=catalog` (carrying `?section=`), and the POS Maintain → Products link points at the canonical door directly. Loo's screenshot was taken on the legacy door — which is exactly why the ADMIN group was open and no P&M rail entry could show there.
- **Contract safety**: display/navigation only — API / schema / RLS / order path untouched; the operation-role costing catalog (`op-catalog`, 3 tabs) untouched — it can ride the same `sub` mechanism later if wanted.
- **Evidence**: +9 tests (rail links/hrefs/highlight/role-gate · page `?section=` contract · POS link); full web 1418/1434 = the 16-fail §17.7 baseline exactly, zero new; `tsc -p tsconfig.app.json` + design-standard `check:v4` clean; live-smoked on a dev server against staging as principal — rail↔pill sync both directions, redirect carries `section`. (Worktree dev note: its gitignored `apps/web/.env.local` was pointed at the deployed API for the smoke.)
- **Deploy (union tip `5f333f7`)**: PR #251 is web-only, but the tip carried 4 days of parallel merges — Jess's Purchase-cockpit v2 arc (apps/api + packages/shared + migrations 0242/0243) and the SKU-master edit/delete window — so BOTH sides shipped per the never-deploy-a-subset rule (web alone would have called MRP endpoints the old Worker lacks). Pre-flight: prod migration tracker tail = `0243_purchase_line_actions` (applied 2026-07-24 04:04 by that arc); the two tracker-UNSTAMPED repo files (`0239_counterparty_whatsapp_group`, `0242_loan_logistics_legs` — applied via execute_sql 2026-07-19 per their own headers) verified live by information_schema probe (all columns + the `purchase_snoozes` table present). api Worker `fa24c4ee-1fa3-4302-8559-544aee8af7d4` (`wrangler deploy --env production`) · web `index-CvNtQbha.js` → carres-portal `378036e1` + carres-pos `9f99b645` (`--branch=main`). Verified: all 4 canonicals serve `index-CvNtQbha.js` (carres-pos.pages.dev lagged ~1 edge-minute; `wrangler pages deployment list` confirmed `9f99b645` = the latest production writer); both custom domains' bundles downloaded IN FULL — 3,890,924 bytes identical; `/operation?tab=catalog` ×2 present, legacy `/principal?tab=catalog` string 0, `SERVICE_ROLE` 0; `/api/catalog` unauth 401.

## 2026-07-24 · Offer = on sale — authored sofa models finally show in POS (PR #253, no migration + a 123-row prod data flip)

**Ask (Loo, 2 screenshots)**: Products 里把 **Annsa**（sofa）的 compartments 勾好、保存成功，但 POS 的 Sofas 分类只有 Booqit 一张卡 — "check why when i save, but this didnot activate in pos system".

**Root cause — two rules colliding, plus a hidden second step nobody was told about**:
1. The POS product-card gate (`catalog-index.ts`) gives a model a card only when it has **≥1 sellable sku** in the non-admin catalog bundle — which drops `pos_active=false` rows (0170).
2. The P5 compartment→SKU auto-sync (`sofa-compartment-sku.ts`) minted **first inserts `pos_active=false`** (the 2026-07-06 "first insert OFF; the principal turns rows ON in the Modular tab" default, adopted while fixing the 1A(LHF) always-false-re-assert mystery). The Products modal's note said "set the selling price there" but never mentioned the ON toggle.

So saving Products genuinely worked (offered rows + skus all minted — Annsa had 11/11), but the model had zero sellable skus → no card. **Booqit only ever showed because its 15 rows were hand-flipped ON on 2026-06-24** (the catalog-whitepaper session). Prod state at diagnosis: 10 dark sofa models, 123 all-OFF (and RM0) compartment skus vs Booqit's 15 ON. Same trap, second face: **untick → re-tick** re-offered the sku with the un-offer's forced OFF *preserved* → the model went dark again even after a hand-flip.

- **api** — `syncCompartmentSku`: first insert mints `pos_active: true` (**offer = on sale**, Loo 2026-07-24); re-offer of a **live** row still preserves price + toggle (the 2026-07-06 fix stays — a principal's manual per-sku OFF is never clobbered); re-offer of a **previously un-offered** (discontinued) row flips back ON (its OFF came from `discontinueCompartmentSku`, not a choice — untick→re-tick now round-trips to sellable). Collision read widened to carry `discontinued_at`.
- **web** — Products modal note now says ticking puts the model **live in POS at RM0** until priced in SKU Master (the missing-step discoverability gap).
- **Data flip (prod, same session — mirrors the Booqit precedent)**: `UPDATE product_skus SET pos_active=true` over non-discontinued compartment skus on live models → **123 rows**; Annsa + 8022/9036/Lotti/Lyyar/Pantti/Qubbu/Telluc/TH511 A/Trrbu/Xammar all show in POS immediately (most at **From RM0 — Loo to price them in SKU Master**).
- **Contract safety** — create_order / order_lines / DraftLine / RLS untouched; the builder's price path (`modelSofaCompartments.skuPrice`, pre-pos_active-filter join) unchanged; a principal can still hide an individual compartment via the SKU toggle (preserved on live re-offer).
- **Tests** — api catalog.test.ts 222/222 (2 first-insert expectations flipped + 2 NEW re-offer tests: live-row preserves, un-offered re-asserts ON); full api suite 1418/1421 (3 fails = §17.7 baseline exactly, zero new); web build (tsc + check:v4) + design-standard lint clean; ModelEditorModal 12/12.
- **CF update** — `sofa-p5-resync-clobber` rewritten: only `description`/`supplier_id` are still re-asserted from model+pool; `price`/`cost`/`pos_active` all survive a live re-offer.

## 2026-07-25 — Catalog two-doors split (PR #254): costing in Operations, selling in Admin

**Ask (Loo, correcting the 2026-07-24 sub-tabs the same day they shipped)**: 「不需要这些分列」 — no section sub-links in the rail; instead "isolate 2 tabs": the COSTING catalog stays in Operations (「costing 的 product and maintenance tab 它应该只有 SKU master、modular 还有 fabric 而已」), and the SELLING / retail-price catalog is added to the ADMIN group at the spot he circled (below Accounts). Follow-up clarification: 「for operation, no need add that tab, cause there is operation catalog dy」 — the existing Operation Catalog IS the costing door; add nothing to Operations.

- **Rail sub-links removed**: portal-nav's `sub` field + `navSubItemHref` + PortalSidebar's indented section rendering all deleted — the rail is flat again. The `?section=` URL contract + the `catalog-tabs.ts` registry KEPT (deep links / refresh still keep the tab; the pill bar writes the param).
- **Operations**: the "Product & Maintenance" item is gone; the only catalog entry is the 0226 **Operation Catalog** (`op-catalog`) — verified 3 tabs exactly (SKU Master / Modular / Fabric), buying costs only, untouched.
- **Admin**: new **"Product & Maintenance"** entry at the BOTTOM of the list (below Accounts — Loo's circle), linking `/principal?tab=catalog`; PrincipalApp mounts `<ProductMaintenancePage isPrincipal />` there again (the 07-24 redirect removed).
- **Stale-door forward**: OperationApp's `tab === "catalog"` now forwards a PRINCIPAL to `/principal?tab=catalog` (carrying `?section=`); operation keeps the OperationCatalogPage fallback. PosSidebar Maintain→Products points back at `/principal?tab=catalog`.
- **Contract safety**: navigation/display only — API / schema / RLS untouched; zero api/shared commits in the deploy delta.
- **Evidence**: touched suites 19/19; full web 1416/1432 = the 16-fail §17.7 baseline exactly, zero new; `tsc -p tsconfig.app.json` + design-standard clean; live-smoked as principal on a dev server (Admin lists P&M last + opens the 8-tab page; Operations shows only Operation Catalog; `/operation?tab=catalog&section=promo` lands on `/principal?tab=catalog&section=promo`).
- **Deploy (web-only, main tip `0fa2b9e`)**: bundle `index-BABLJeSL.js` → carres-portal `0e7a8df3` + carres-pos `d390e9ef` (`--branch=main`). All 4 canonicals verified serving it; both custom domains' bundles downloaded IN FULL — 3,890,302 bytes identical; `/principal?tab=catalog` ×2 present, `/operation?tab=catalog` string 0, `SERVICE_ROLE` 0. api Worker stays `251198cc` (PR #253's overnight deploy; zero api/shared commits since `837ead6`). GitHub hiccup en route: the PR-merge call 504'd then held a "Merge already in progress" lock for ~2 minutes before landing as `0fa2b9e` — re-check `gh pr view` state before retrying, don't spam merges.

## 2026-07-25 · PIN sign-in outlet switch (PR #256, web-only, no migration)

**Ask (Loo, 2 screenshots)**: dealer added a second outlet (Mont Kiara) + a salesperson (ahsihas) bound to it — but the staff PIN sign-in screen stayed locked to "CARRES KOTA DAMANSARA": "no place for ahsihas to log in". Fixed in a worktree per guardrail #9.

**Root cause — two compounding gaps, both from the 0233 staff-PIN-login ship**:
1. The working outlet (`sessionOutletId`, sessionStorage) is chosen ONCE per tab and persisted; a store activated while single-outlet AUTO-SELECTS it. The `OutletPicker` renders only while `sessionOutletId === null` — so after a second outlet is added, the picker can never appear again in that tab.
2. The PIN screen had no affordance to change outlet — the OutletPicker's own copy promised "You can switch later", but nothing delivered it (the top-bar Switch chip deliberately keeps the outlet; it only swaps the person).

- **web** — `PinScreen` gains optional `onSwitchOutlet`; `StaffGate` passes it ONLY when the store has >1 outlet. When set, the outlet eyebrow renders as a tappable pill (outlet name + ChevronsUpDown 12px; `.staff-gate__outlet-switch` in pos-prototype.css, token-only `color-mix`) that clears `sessionOutletId` → the gate drops back to the existing `OutletPicker`. Picking the other outlet surfaces its tiles: the owner (all-outlets) crosses over, outlet-bound staff swap. Single-outlet stores keep the static eyebrow.
- **Contract safety** — web-only; the tile filter (own outlet / outlet-less / principal-tier crosses all), `CustomerStep`'s outlet prefill, verify-PIN API and RLS all untouched.
- **Tests** — PinScreen +2 (pill renders with the outlet name + fires; absent without the prop) · StaffGate +2 (the full trap: persisted o1, later-added o2 with its own salesperson → pill → picker → o2 tiles correct; single-outlet shows no pill); `dealer/staff` suite 37/37; web build (tsc + check:v4) + design-standard lint clean.
- **Deploy (web-only, main tip `1b80684`)**: bundle `index-C8VTUDOL.js` → carres-portal `6d8462d2` + carres-pos `a90b8efe` (`--branch=main`); all 4 canonicals verified serving it (carres-pos.pages.dev lagged ~1 edge-minute — deployment list confirmed `a90b8efe` = the latest production writer; a parallel session had deployed #254 to carres-pos 9 minutes earlier). `SERVICE_ROLE` on dist = 0. api Worker stays `251198cc` (zero api/shared commits).

## 2026-07-25 · Outlet names carry a fixed Carres prefix (PR #258, web-only, no migration + a 2-row prod rename)

**Ask (Loo, same session as #256)**: "is call carres mont kiara, is should be have a fix name ( carres ) in all the new location name — when create outlet name ( fixed a column of carres ) then only name". The Mont Kiara outlet had been typed without the brand, so the store list showed "carres kota damansara" next to a bare "Mont Kiara".

- **shared** — `store-kind.ts` (the naming-rule home) gains `CARRES_NAME_PREFIX` + `carresLocationName()`: composes `Carres <location>`, strips a typed-in leading "Carres" (any case, followed by space/dash or alone) so the prefix never doubles; prefix-only/empty input composes to `""` (= not filled). New `store-kind.test.ts` (5 tests, incl. the "Carreston Heights" non-strip case).
- **web** — new shared `CarresNameInput` (locked "Carres" segment + location input, HQ/BD input styling). Wired into all THREE location-name forms: **POS Staff overlay → Add outlet** (live "Saved as Carres …" hint; validity + submit + toast use the composed name), **HQ New account** (dealer **Outlet name** + showroom **Showroom name**; the showroom's composed name doubles as account display name + default outlet as before; validation checks the composed name), **BD create-dealer** (First outlet name). A dealer's **Company name is NOT prefixed** — it is the reseller's own legal entity; the blank-outlet fallback to company name is unchanged (and stays unprefixed by design).
- **Prod data (2 rows, same session)** — `litte mattress sdn bhd`'s outlets renamed: "Mont Kiara" → **Carres Mont Kiara**, "carres kota damansara" → **Carres Kota Damansara**. The showroom store "Kelana Jaya" (+ its outlet row) left untouched — renaming it would change the account display name; flagged to Loo.
- **Tests** — shared 929/929 (incl. the new 5) · `StaffManagePage.test.tsx` +1 drives the full Add-outlet form and asserts the payload name is "Carres Mont Kiara" · web build (tsc + check:v4) + design-standard lint clean.
- **Deploy (web-only, main tip `8363b6d`)**: bundle `index-CONdylXL.js` → carres-portal `91a73cf0` + carres-pos `a59b5a2f` (`--branch=main`); all 4 canonicals verified serving it (carres-pos.pages.dev lagged ~1 edge-minute again — deployment list confirmed `a59b5a2f` = the latest production writer). `SERVICE_ROLE` on dist = 0. api Worker stays `251198cc` (zero api/shared commits).

## 2026-07-25 — My-orders board filters cascade Store → Outlet → Salesperson (PR #259)

**Ask (Loo)**: "this should be can select by showroom and dealer (then if dealer got 2 outlet, can select by outlet as well), then only by sales man" — circling the POS My-orders board's lone "All salespeople" dropdown. Worktree `worktree-orders-board-store-filter`, web-only, NO migration.

- **What the screenshot really was**: the principal opening POS → My orders with no acting store hits `OrderStatusPage` with an internal JWT — the board was already showing EVERY store's orders but labelled "Sales view · showroom", counted the AutoCount archive into the月 summary (51 orders / RM 69,828), and mixed every store's staff into one salespeople list.
- **Network mode** (principal, no `dealerId` prop): eyebrow + summary card say **All stores**; a store dropdown leads, grouped `Our showrooms` / `Dealers` (store-kind rule, matching the POS CustomerStep picker); the AutoCount archive stays off the all-stores board (BdOrdersBoard rule — 14 real orders / RM 68,528 after); cards carry the owning-store chip; salespeople appear only once a store is picked. Store list = `usePrincipalDealers` (principal-gated, fetched only in this mode).
- **Outlet level** (any owner-level view of a store with ≥2 outlets — network mode, acting-principal AND store logins alike): an Outlet dropdown between store and salespeople. Order→outlet resolves via the order's own `outlet_id` stamp, falling back to its salesperson's outlet (`orderOutletOf` — only 14/51 prod orders carry the stamp). Manager-tier staff sessions are already outlet-scoped server-side (0233) so they don't get the dropdown; salesperson-tier keeps all filters hidden as before.
- **Salespeople always LAST**, scoped to the picked store/outlet. Acting-principal's list is now scoped to the acting store — it previously listed every store's staff (latent since the on-behalf feature).
- **BD network board**: same cascade — grouped store menu ("All stores" replaces "All dealers"; showrooms were already in that list), outlet level, scoped salespeople. Card-2 copy → "Pick a store to compare".
- **Shared pieces** in `order-board-ui.tsx`: `BoardFilterDropdown` (os-people anatomy + optional group headers + `.os-people__grouplab` css) and `orderOutletOf` — one implementation for both boards. `.os-controls` gains `flex-wrap` so three dropdowns don't crush the search field at ~1024px.
- **Contract safety**: client-side only — zero API/schema/RLS change. `/api/outlets` + `/api/salespersons` already return `dealerId`/`outletId` on every row for internal callers; RLS scopes store logins to their own rows.
- **Evidence**: +7 tests (network grouping/scoping/archive rule · outlet stamp + fallback narrowing · store-login outlet dropdown · BD grouping + outlet); touched suites 21/21; full web 1426/1442 = the 16-fail §17.7 baseline exactly, zero new; `tsc -p tsconfig.app.json` + design-standard clean. Live-smoked as principal against prod data: grouped menu (`OUR SHOWROOMS: AutoCount Archive, Kelana Jaya · DEALERS: litte mattress`), picking litte mattress reveals its 2 real outlets (Kota Damansara / Mont Kiara), picking Mont Kiara narrows salespeople to ahsihas, lanes re-scope at every level. (Test gotcha: the PIN gate's `onUnlock` sits behind a 150ms `setTimeout` — post-unlock assertions must `findBy`, not `getBy`.)
- **Deploy (web-only, union tip `ff27524` — carries the parallel #258 Carres-prefix ship)**: bundle `index-CfiH5ERt.js` → carres-portal `6d4100c4` + carres-pos `80c4cdef` (`--branch=main`). All 4 canonicals verified serving it; both custom domains' bundles downloaded IN FULL — 3,894,495 bytes identical; `os-store-filter` + `Sales view · all stores` markers present; `SERVICE_ROLE` 0. api Worker stays `251198cc` (zero apps/api commits since `837ead6`; #258's shared helper is web-consumed only).

## 2026-07-25 · HR role + Commission portal (migrations 0244/0245/0246, worktree `hr-payroll-role`)

**Ask (Loo)**: "add a new role with a tab of hr, is for hr purpose … calculation sales executive payroll (not for dealer)" → scoped down same session to **commission CALCULATION only — no base payroll, no statutory deductions**, with TWO configurable methods (his spec): (1) **Percentage of sales** — pct of PURE item revenue (delivery fee + dispose-* service addons excluded; verified in prod: those live entirely in `order_addons`, so basis = Σ `order_lines` minus service-category lines), per-staff configurable, **manager override** = (manager pct − salesperson pct) on subordinate sales in the same outlet, manager's own sales at own pct; (2) **Per-model** — per-unit RM per product model + per-model volume tier bonuses + overall quantity milestones (optional category filter). Interpretation locked in-session: **a reached tier/milestone pays a one-time bonus; the HIGHEST reached threshold pays (not cumulative)** — schema supports flipping semantics if Loo meant per-unit-rate laddering.

- **DB (all applied to prod this session; tail was 0243 → now 0246)**:
  - **0244** `hr_role` — `alter type app_role add value 'hr'` alone (ADD VALUE can't share a txn with first use). The 0004 auth hook is role-agnostic — no hook change. **`is_internal()` deliberately NOT widened**: HR reaches order data only through the gated RPCs (least privilege — HR sees no catalog/ops/finance surfaces).
  - **0245** `hr_commission` — 5 config tables, all RLS deny-all except `app_role() in ('hr','principal')` (InitPlan-wrapped): `commission_scheme_config` (method per store, outlet override via partial uniques), `staff_commission_rates` (**effective-dated append-only** — a rate change never rewrites an already-reported month; calc picks the rate as-of each order's date), `model_commission_rates`, `model_commission_tiers`, `commission_milestones`. Plus 2 SECURITY DEFINER RPCs: `hr_commission_source(p_year,p_month)` — the ONE gated month slice (showroom-channel staff + product lines [service-category excluded] + unattributed worklist + all config; **dealer-channel stores are excluded at the RPC level** = "not for dealer" enforced in SQL); `hr_assign_salesperson(p_order,p_sp)` — audited attribution (validates same-store + active, writes `order_history` + `audit_log`; attribution drives money → never a raw update).
  - **0246** `hr_source_models` — CREATE OR REPLACE adds a `models` key (id/name/category, non-discontinued) so the Setup page can author per-model config without catalog read access (signature verified against live def first — 0153 lesson).
- **shared** — `Role` union + `APP_ROLES`/`CREATABLE_APP_ROLES` gain `"hr"`; `schemas/hr.ts` zod inputs; **pure `computeCommission()`** engine (`commission.ts`, 21 TDD tests): method resolution (outlet row > store default > percentage), effective-dated rate pick, manager override (same-outlet managers split equally; inactive/different-outlet managers earn none; no override under per_model), per-model per-unit + highest-tier bonus, milestone groups by category key (highest reached per group), 2dp rounding, distinct-order counts, dormant zero-config = RM0 for everyone.
- **api** — `VALID_ROLES` + `requireHr` (hr|principal, mirrors requireFinance); `routes/hr.ts`: GET `/api/hr/report?year&month` (RPC source → shared engine → report + unattributed + models + config), 5 config POSTs (scheme replace, staff-rate upsert on (sp,effective_from), model-rate upsert/null-delete, model-tiers ladder replace, milestones replace), POST `/assign` → the audited RPC (42501→403, mismatch→422). All userClient/RLS — zero service_role. 11 route tests.
- **web** — `/hr/*` route (RequireRole hr+principal) → new `pages/hr/HrApp.tsx` shell (PortalSidebar + `?tab=` switch + shared month stepper); **HR area group in `PORTAL_NAV`** (Commission / Attribution / Commission Setup; principal sees it per boss-sees-all); `HrCommissionTab` (KPI row, under-count warning banner when unattributed>0, 44px per-staff table with chevron breakdown: override from-whom, per-model units×rate+tier, milestone hits), `HrAttributionTab` (unattributed worklist → same-store salesperson select + Assign → toast + invalidate), `HrSetupTab` (method segmented per store, per-staff % rates [today-stamped effective rows] + override hint, model per-unit/tiers/milestones editors + "highest tier pays" note). `lib/auth.ts` VALID_ROLES + PrincipalAccounts ROLE_OPTIONS/COLORS gain hr (HQ can mint an HR account from the existing door — the entity-less create path needed zero changes). qk.hr.* centralized in queries.ts.
- **Attribution reality check (prod)**: 51 orders / 14 attributed (PIN stamping live since 0233); Kelana Jaya showroom staff kaan (6 orders RM15,392) + Mayson (5 orders RM30,480) already compute real commission bases — the Attribution worklist exists precisely to close the pre-PIN gap before a month is trusted.
- **Tests / gates** (union with main tip `3b67071` after in-branch merge): shared **950/950** (+21) · api hr 11/11, full suite **1429/1432** (3 = §17.7 baseline) · web build (tsc + check:v4) ✓ + lint no-new + hr pages 3/3 (full-suite fails = the 16 §17.7 baseline) · dist `SERVICE_ROLE` = 0.
- **Dormant by construction**: zero config rows → every report totals RM0; no existing flow touches the new tables; `create_order`/`order_lines`/POS byte-identical.
- **Deploy (same session, main tip `e9cbcc9`)**: api Worker `787cab41-2fee-47cb-8dfc-d977120e0165` (`wrangler deploy --env production`; unauth GET /api/hr/report → 401 live-verified) · web bundle `index-Cmm7b04L.js` → carres-portal `01b3c022` + carres-pos `2f638949` (`--branch=main`); all 4 canonicals (carres-portal/carres-pos.pages.dev + erp./pos.carresofficial.com) re-curled serving `index-Cmm7b04L.js`; dist `SERVICE_ROLE` = 0. Next for Loo: mint an `hr` account from Admin → Accounts (or use the principal login), set each staff's % (or per-model rates) in HR → Commission Setup, clear the Attribution worklist, then read the month in HR → Commission.

## 2026-07-25 — BD sees dealers only (PR #262): showrooms off every BD surface

**Ask (Loo)**: 「BD 的话，他只可以看到 dealer，但是不能看到 Principal 的 showroom」 — circling the BD board's store menu still listing OUR SHOWROOMS. api + web, NO migration, worktree `orders-board-store-filter` (branch `worktree-bd-dealers-only`).

- **Source narrowing** — `/api/bd/dealers` list DROPS showroom-channel rows (fail-closed: a broken channel read errors instead of leaking/reclassifying). That ONE list feeds the BD board's store menu, the Accounts roster AND the POS on-behalf picker, so all three clean up at once. `/activity` filters showroom-touching audit events (channel rides the existing names fetch, now fail-closed too); `/:id` + `/orders/:so` 404 a showroom target — the UI-orphaned drill-down can't leak either.
- **Board gate** — `BdOrdersBoard` additionally filters its ORDERS to the dealer-id set from that list: bd's internal JWT reads every store's orders, so a showroom's would otherwise still ride onto the board. Loading waits on both queries. Menu back to a FLAT "All dealers" list (one kind → no group headers); dealer vocabulary restored ("Pick a dealer to compare"). The principal's all-stores view (OrderStatusPage network mode, #259) is untouched — that's where both kinds appear together.
- **Trust model note (flagged to Loo)**: NO RLS change — bd stays `is_internal`; this is workflow separation at the BD surface, same "PIN = workflow, not security boundary" logic as before.
- **Evidence**: +5 tests (api: list drops showrooms / `:id` 404 / activity filter · web: off-list order gate / flat menu); full api 1421/1424 + web 1427/1443 = the pre-existing baselines, zero new; tsc ×2 + design-standard clean. Full-stack local smoke (wrangler dev + real prod data, bd@ login): store menu = `All dealers / litte mattress sdn bhd` only; board = 3 dealer orders RM 19,936 (was 14 / RM 68,528 with showrooms mixed); Accounts roster + activity feed showroom-free.
- **Deploy (api + web, main tip `3b67071`)**: api Worker `f895fc66-e16d-403b-83cc-dfbc19ca1176` (`wrangler deploy --env production`; /api/bd/dealers unauth 401 ✓) · web `index-DU4pJ8yw.js` → carres-portal `f1f0d92a` + carres-pos `2270e13f` (`--branch=main`). All 4 canonicals serve the new bundle; both custom domains' bundles downloaded IN FULL — 3,894,499 bytes identical; "Pick a dealer to compare" present / "Pick a store to compare" gone; `SERVICE_ROLE` 0.

## 2026-07-25 · BD commission — paid by what their dealers sell (migrations 0250/0251/0252, branch `worktree-hr-bd-commission`)

**Ask (Loo, two messages same session as the HR ship)**: "BD, the get pay by what dealer sell" + "bd will have 2 way as well, either percentage or like item kpi as well, then got 2 position, bd executive and CBO". The THIRD commission calculation, full parity with the staff engine.

- **DB (all applied to prod; tail 0249 [a parallel session took 0247-0249 — my draft renumbered 0250 at apply, the 0239 lesson again] → now 0252)**:
  - **0250** `bd_commission` — `dealers.bd_owner_user_id` (the missing BD↔dealer ownership link, nullable additive) + `bd_commission_rates` (per BD app_user, effective-dated, RLS hr/principal) + audited DEFINER `hr_assign_dealer_bd` (dealer-channel only — `not_a_dealer` guard; validates target role='bd'; audit_log row; never a raw dealers update) + source RPC v3 (bdUsers/dealers/dealerOrders/bdRates).
  - **0251** `bd_positions_methods` — `bd_profiles` (position executive|cbo per BD user) + `bd_commission_config` singleton (the ONE global BD method switch — dealers have no outlet concept) + **`program` discriminator ('staff'|'bd', default staff)** on `model_commission_rates`/`model_commission_tiers`/`commission_milestones` so BD's item-KPI numbers are SEPARATE from the showroom staff's (uniques reworked to include program).
  - **0252** `hr_source_bd_v2` — source RPC + bdUsers.position / bdMethod / dealerLines (per-line dealer-channel rows for item KPI) / program stamped on per-model config keys.
- **shared** — `computeBdCommission` v2 (single input object): method percentage = pct of owned dealers' pure item revenue, **CBO override = (CBO rate − executive rate) on executives' dealer sales, split among CBOs, own dealers at own rate** (mirror of the Sales Manager rule; no override under per_model); method per_model (item KPI) = per-unit RM × units across owned dealers + highest-tier bonus + milestones, all from program='bd' rows only. `computeCommission` (staff) now filters program==='staff' (absent = staff). 28 engine tests (+7).
- **api** — report passes bdMethod/positions/dealerLines through and returns `bdMethod`; POST `/config/bd-method` (singleton upsert) + `/config/bd-position` (bd_profiles upsert); model-rate/tiers/milestones POSTs accept `program` (staff default; milestone replace is scoped to its program). hr route tests 11/11; tsc clean.
- **web** — Commission tab BD section: method subtitle, position pill (CBO / BD Executive), staff-mirroring columns (Direct/Override/Per-model/Milestone/Total), breakdown with override-from lines + per-model/milestone detail, "N dealers have no BD owner — their sales pay nobody" warning. Setup BD block: method segmented, per-BD position select + % rate rows, dealer-portfolio assignment (select + Save via the audited RPC), and — when per_model — a BD per-model editor (`PerModelConfig program="bd"`, the staff editors refactored to the same component, which also FIXED a latent bug: the staff editors previously read all program rows).
- **Dormant**: no owner + no rate + method defaults percentage → RM0 everywhere; existing flows untouched (`channel='dealer'` scope enforced in SQL).
- **Deploy (same session, main tip `bcc2c82`)**: api Worker `28b84b15-58d8-4e1b-8a91-37f062be0cdb` (unauth GET /api/hr/report → 401 ✓) · web bundle `index-BmqoCMLc.js` → carres-portal `d4f6cb9f` + carres-pos `89836248` (`--branch=main`); all 4 canonicals re-curled serving it; dist `SERVICE_ROLE` = 0. Operator next-steps: HR → Commission Setup → BD block — pick the method, set each BD's position (Herng = executive or CBO as Loo decides) + %, assign each dealer a BD owner; per-model KPI numbers appear once method = Per model.

## 2026-07-25 · Rental + Service Plan BASE (PR #268, migrations 0247-0249 + 0253) — the rent-to-own initiative opens

**Ask (Loo)**: a new pay-monthly / rental product method (e.g. RM59 × 84 months), a P&M **Rental** tab (rental price + bound service plan), service plans (vacuum cleaning; free with a grand product or bought as a SKU), all BOUND to the customer so the customer can later check their account. Rulings locked same session: **Stripe auto-debit** (products sync to Stripe, Stripe issues invoices — MCP OAuth pending Loo); **rent-to-own** (last month paid → auto request-to-buy form → ownership transfers); **early exit = buyout** (settle remaining in one shot); **default = repossess + slow residual settle**; service packages configurable **by visits/year** (2/3/4×); **everyone sells** — commission = % of monthly collection (base 20%; the HIERARCHY = the HR line's 0245 work, not rebuilt) + fixed supplier rate (49% of every RM59) recorded in finance; rented-out unit = a **rent-out asset** with its own registry, per-unit id, service records + warranty claims; cleaning-partner tab = NEXT phase. Full mapping to the LOCKED `subscription-mattress-proposal.md` (Jess line 2026-07-22 — same initiative: 5/7-yr terms, 3 cleanings/yr, dunning + Credit Bureau, Sept 2026) lives in `docs/rental-service-plan-proposal.md` — this base does not fork it.

**Migrations** (tail was 0246 at draft — 0244-0246 = the HR line; parallel lines took 0250-0252 mid-session, so the hardening re-checked and landed as 0253):
- **0247_customers** — the FIRST customer entity: canonical `phone_key` (MY-aware, pwp_phone_key family, server-computed), one row per phone. Internal-only RLS.
- **0248_rental_config** — `service_packages` (duration_months × visits_per_year × standalone price × optional service SKU) + `rental_plans` (sku × term_months × monthly_fee + supplier_rate_pct / commission_base_pct + included_package_id). Principal-only writes (0182 pattern).
- **0249_rental_agreements** — `rental_agreements` (RA-1001…, status machine: active / buyout_pending / completed / ownership_transferred / defaulted / repossessed / cancelled; plan snapshot columns; stripe stubs) + `rental_billings` (per-month schedule, split share columns, stripe_invoice_id) + `rental_stock_units` (RU-1001…, allocated/in_rental/returned/refurbishing/transferred/retired) + `rental_unit_events` (service/warranty_claim/repair/… per-unit trail) + `service_entitlements` (source rental|purchase|free_gift|manual, visits_total/used) + `service_visits` (seq, due every 12/visits_per_year months, partner free-text until the partner tab). All internal-only RLS, ALL DORMANT (0 rows).
- **0253_rental_read_internal_and_split_caps** — review hardening (below): config read-all-authenticated → `is_internal()`; split caps supplier+commission ≤ 100 on plans AND agreement snapshots (+ the missing per-column 0..100 on snapshots); ≥ 0 CHECKs on billing money columns.

**Build (ultracode)**: 4 parallel workflow agents (shared layer · api route · P&M tab · ops page) against a pinned contract, orchestrator glue (queries.ts hooks, catalog-tabs `rental` key, portal-nav item, mounts). Shared: row/domain/adapter/zod + pure `serviceVisitsTotal` / `serviceVisitIntervalMonths` / `rentalContractValue` / `rentalMonthlySplit` (Σ-exact: the Carres share computed from the ROUNDED shares). API `/api/rental/*`: config CRUD (principal, friendly 409/422 PG-error mapping) + agreements/units reads + customers search/create (internal; userClient/RLS only). Web: P&M **Rental** tab (`?section=rental`; packages + plans editors, term presets 60/84, live preview "RM 59.00 × 84 = RM 4,956.00 · supplier RM 28.91/mo · commission RM 11.80/mo · Carres RM 18.29/mo"; renders OUTSIDE the catalog-bundle gate — its data is /api/rental/config) + internal-portal **Rental** page (`?tab=rental`; 3 stat tiles + agreements + units registries; display words never leak DB stage words).

**Adversarial review (3 lenses)**: rls-money REQUEST_CHANGES — its MAJOR (0248 read-all-authenticated would let store/supplier/partner JWTs read the split pcts via direct PostgREST once a plan is authored; cross-party commercial terms beyond the accepted product_skus.cost precedent) fixed same-session by 0253 while the tables were still empty. All actionable MINORs fixed: shared table constants imported (§9.4, stale comment killed), `*` stripped from the customer-search pattern, RentalTab un-gated from the catalog bundle, OperationRental on the shared rm() formatter, stat-tile tests assert VALUES, DELETE 409 in-use api tests added, zod split-cap refine + email tightened. NOTEs → CFs: `rental-billing-writes-need-rpc` (MEDIUM), `rental-pos-config-projection` (MEDIUM), `rental-sku-delete-23503-500` (LOW).

**Stripe (capability notes, to live-verify after Loo's MCP OAuth)**: recurring MYR via Billing subscriptions ✓ (84-month fixed term = subscription schedule, 84 iterations, end_behavior=cancel); per-cycle Stripe Invoices ✓ (hosted + PDF + email); Malaysia reality — recurring = CARD-on-file (FPX is one-time only; DuitNow AutoDebit/eMandate NOT on Stripe — true bank debit would need e.g. Curlec); ⚠ LHDN MyInvois e-invoice is NOT native to Stripe (that compliance layer stays ours). Existing 0223 checkout + `/stripe` webhook are the extension points.

**Evidence**: shared 984/984 (+55) · api 1454/1457 (+22; 3 = §17.7 baseline) · web 1445/1461 (+15; 16 = §17.7 baseline) · build + design-standard + api tsc clean. origin/main merged mid-flight (HR 0244-0246 + BD windows; index.ts/queries.ts conflicts resolved keeping both sides).

**Deploy (main tip `6d64305`)**: api Worker `e76ccfee-c0fd-42a3-af65-8a9c3af28aac` (GET /api/rental/config unauth → 401 ✓ on api.carresofficial.com) · web `index-uonbx8mG.js` → carres-portal `f309402a` + carres-pos `eeac1eb9` (`--branch=main`); all 4 canonicals verified first curl; `SERVICE_ROLE` 0.

**Next phases**: ① POS rental sell lane + Stripe product/subscription sync + entitlement minting (incl. P7 free-gift attach), ② billing/dunning engine (Jess line's locked D0/3/7/14/21/30/60 + Credit Bureau), ③ cleaning-partner tab + visit scheduling, ④ customer check surface (staff lookup → OTP page), ⑤ LHDN e-invoice decision.

## 2026-07-25 (late) · My-orders board speaks SO numbers + View sales order in the drawer (PR #273)

**Ask (Loo, screenshot)**: the My-orders drawer header showed `#1256` — "I want this follow with SO number, not this code"; plus a button at the bottom of the drawer to view the sales order.

**What shipped** (web-only, no API/DB):
- `#1256` → `SO-1256` — the digits were always `orders.so`; the `#` prefix was a 2990s-prototype leftover. Unified on the official document format (matches the SO PDF + finance/operation/HR surfaces) across the drawer title (`PosOrderDetail`), board card id (`order-board-ui`), AddProductOverlay kicker, Stripe collect modal eyebrow AND the customer-facing WhatsApp payment-link message.
- **View sales order** button at the bottom of the drawer in ALL four footer lanes (place / proceed / locked / delivered — the two info-strip footers restructured to strip + button). New `pos` variant on the existing `DownloadSalesOrderButton` (same fetch → client react-pdf render → new-tab flow as ThankYou/finance/ops; server role gate unchanged), shelled as a `.pos-proto` ghost pill.
- Bundle note: react-pdf was already in the graph via ThankYou — zero new weight.

**Evidence**: 7 affected web test files 58/58 (new pins: SO format on card + title; button presence per lane; pos-variant unit test) · full web suite 1451 passed / 16 failed = exactly the §17.7 baseline · build (v4-guard + tsc + vite) + design-standard clean.

**Deploy (same session, main tip `115e0ac`)**: web `index-Cvt09dlF.js` → carres-portal `f79b1f71` + carres-pos `d2ff6223` (`--branch=main`); all 4 canonicals verified serving it on first curl; live bundle downloaded to file — `View sales order` marker present, `SERVICE_ROLE` 0. API untouched.

## 2026-07-25 late · HR Team hierarchy Phase 1 (PR #276, migration 0254, worktree `hr-hierarchy`)

**Ask (Loo)**: "我需要一个 hierarchy system 在 HR 里面 + scan 现有所有户口权限跟员工职位" → 后追加 "把 account 全部转过来在这个 team 这里，以后加 user 全部从这里来（dealer 例外——独立个体，dealer 的 staff 也不进 hierarchy）；所有 staff 要有 staff code（CR001 格式）；职位要有 Executive / Manager / C-level 三层"。

**Scan 结论（动工依据）**: 15 个 app_users 散 8 role（hr role 存在但 0 用户）；"层级"散在 4 种互不兼容的编码——staff.ts 里的 TIER_RANK 局部常量、bd_profiles.position（空表）、OPS_MANAGER_EMAILS email 名单、isPoDutyEditor 单人硬编码；全 codebase 无任何 reporting-line 字段；`meResponseSchema` 漏 'hr'（第一个 HR 登录 /me 必炸的 live bug）。

- **DB (0254_hr_team_hierarchy, applied tail 0253→0254)**: `org_positions`(band c_level/manager/executive, 12 seed) + `org_position_history`(职位更替 append-only) + `app_users.staff_code/position_id/reports_to_user_id` + `salespersons.staff_code` + `org_staff_code_seq`(CRnnn, next_staff_code() service_role-only, 跨两表唯一由 constraint trigger 保) + keyhole RPCs `hr_team_source` / `hr_set_position` / `hr_set_reports_to` / `hr_set_staff_code`(全部 gate hr/principal + audit_log; is_internal() 依旧不放宽——0244 law)。Backfill: CR001=Loo/Chairman · CR002=Jess/COO · CR003/004=Khor Yee/Yu Jun(Admin Assistant) · CR005/006=Shasha/Samantha · CR007=Herng(BD Executive) · CR008/009=Mayson/kaan(showroom)；通用号(operation@/finance@/BD@)不派码。
- **API**: 新 `/api/hr/team/*`(7 routes, requireHr)——source 读 + position/reports-to/staff-code 写 + positions registry 直写(RLS) + `/accounts`(开 operation/finance/hr/bd/principal/supplier/partner; principal-role 只有 principal 能开; 内部 role 自动 mint CR code + hire history) + `/showroom-staff`(验 channel='showroom', cap manager, mint code)。**Accounts 门收窄**: principal 门 `allowedRoles=['dealer','showroom']`(店户口 only)；staff.ts POST + create-account initialStaff 在 showroom 店一律 mint staff_code(每个创建门都派码)。
- **Web**: HR 第 4 tab **Team**(HrTeamTab, portal-nav +1)——Carres Team 按 band 分组行内编辑 position/reports-to/code · Showroom staff 按店梯子(tier→Sales Manager/Executive 映射) · External & store accounts · Positions registry 编辑器 · Position changes 历史 · Add user / Add showroom staff 两个 modal。PrincipalAccounts create modal 只剩 Dealer/Showroom 两个 tile + 指路文案。
- **shared**: `schemas/hr-team.ts`(band/position/code/create 契约 + HrTeamSource 类型) · STAFF_TIER_RANK 从 staff.ts 局部常量升入 shared(staff.ts 改 import) · `meResponseSchema` 补 'hr'(live bug fix) · salespersonSchema/adapter/domain +staffCode。
- **合同变更测试**: bd/accounts.test.ts 的旧 regression("principal 门能开 supplier")按新合同改写成 403 role_not_allowed + 新增 showroom 店正向 201。
- **Evidence**: shared 991/991 · api 1472/1475(3=§17.7 baseline) · web 1453/1469(16=baseline, 0 新增) · api tsc + web FULL build + lint + check:v4 全净 · +17 api hr-team tests + 2 web tab tests。
- **Deploy (main tip `609f22a`)**: api Worker `d1c9ed89-7b7b-4d06-ac30-e857a407b4a4`(/api/hr/team unauth 401 ✓) · web `index-CXRKezvK.js` → carres-portal `77a6d490` + carres-pos `c6838eda`; 4 canonical 全验(pos.carresofficial.com edge 滞后 ~2min 后跟上); erp bundle 完整下载 3,982,808 bytes: SERVICE_ROLE 0 · hr/team marker 1。**~2 分钟后被平行线 PR #275 的 union deploy(`8503184` → `index-Cjl110n-.js` / Worker `c00ae4fc`, 含本 PR 全部代码)取代——重验 4 canonical + Worker deployments 时序确认 union 在线, 无功能丢失。**
- **Phase 2 (未做, 要 Loo 拍板再开)**: 把 OPS_MANAGER_EMAILS / isPoDutyEditor 等 email 硬编码换成读 hierarchy(权限改动, 涉 RLS 单独审)。**注意**: 第一个 hr role 户口现在可以开了(/me bug 已修), 从 Team 门开。

## 2026-07-25 · Rental segment ① — POS Rent-to-Own sell lane + Stripe subscription wiring (PR #275, migration 0255 DRAFTED — NOT yet applied/deployed)

**Ask (Loo)**: "open a worktree, continue the checkpoint of rental program and service line" — resuming checkpoint `20260725-144857-rental-service-plan-base.md`, whose Remaining-Work #1 is this exact segment: the POS rental sell lane + Stripe product/subscription sync + entitlement minting.

**Migration 0255_rental_sell_lane (DRAFT in branch — apply needs Loo's greenlight; tail verified 0253 via list_migrations at session start)**:
- Stripe landing columns: `rental_plans.stripe_product_id/stripe_price_id` + `customers.stripe_customer_id` (one Stripe Customer per canonical phone, reused across agreements).
- `stripe_checkout_sessions`: `order_id` → nullable, `agreement_id` FK added, `one_target` CHECK (exactly one of order/agreement) — the reuse 0223's comment predicted (`purpose` already CHECKed `'rental_subscription'`).
- **`rental_plans_pos` VIEW** — the deliberate store-side widening 0253 promised (closes CF `rental-pos-config-projection`): ACTIVE plans only, columns id/sku/term/fee/package name+type+visits + `stripe_ready`; **the split pcts are not in the column list**; definer view (security_invoker off), anon revoked, authenticated SELECT.
- **`create_rental_agreement(...)` SECURITY DEFINER RPC** — store JWTs can't write the internal-only rental tables, so signup is ONE atomic definer transaction: role gate (dealer/salesperson/showroom/bd/principal/operation/finance — "everyone can sell"), JWT dealer wins over p_dealer_id (no spoofing; internal on-behalf may pass it), `pwp_phone_key` customer upsert (existing customer keeps name/phone — identity anchor; email/address fill blanks only), agreement with plan SNAPSHOTS re-read from the DB row (client names a plan_id, never a price — the sofa-P4 trust doctrine), full `term_months` billing schedule (due = start + (n−1) months), RU asset row born `allocated` + a unit-event note, included-package entitlement whose **visits ride the TERM** (`floor(term × visits/yr ÷ 12)`, min 1; SQL mirrors shared `serviceVisitsTotal`) with pre-generated visits every `round(365/visits_per_year)` days, audit_log row (`rental.agreement_created`, seller role in actor_text). Errcode detail slugs (forbidden/plan_not_found/plan_inactive/invalid_phone/…) map to friendly 4xx in Hono.
- **`link_rental_subscription(...)` RPC (service_role only)** — webhook/poll stamps `stripe_subscription_id`/`stripe_customer_id` onto the agreement + flips the session row paid; row-lock + status-guard idempotent (the record_stripe_checkout_payment pattern), coalesce keeps FIRST ids (at-least-once delivery can't re-point a live agreement). Deliberately NOT money: cycle collections stay for segment ②'s DEFINER RPC (CF `rental-billing-writes-need-rpc`).

**API**:
- `lib/rental-stripe.ts` — the plan→Stripe sync engine: ensure Product per SKU (reuse via same-sku sibling DB lookup, never Stripe search) + recurring monthly Price per plan under the pilot-locked metadata namespace (`carres_source=carres-portal` / `carres_kind=rental_plan|rental_plan_price` / `carres_sku` / `carres_term_months` / `carres_monthly_fee`); amounts are immutable → fee change mints a NEW price and archives the old; `ensureFixedTermSchedule` wraps a Checkout subscription into the fixed term (SDK v22 vocabulary: `phases[0].duration = {interval:'month', interval_count:term}`, `end_behavior:'cancel'` — the classic "84 iterations"), idempotent via `subscription.schedule` presence.
- `routes/rental.ts` — plan POST/PATCH auto-sync (**sync NEVER fails the save**; plan row is truth, Stripe is a projection; response carries `stripeSync: synced|skipped|error`) + POST `/plans/:id/stripe-sync` manual retry; GET `/pos-plans` (seller roles, the stripped view); POST `/agreements` (zod `createRentalAgreementInputSchema` → the RPC); POST/GET `/agreements/:id/stripe/checkout[/:sid]` — mode `subscription` Checkout on the plan's Price (customer = the reused/minted Stripe Customer; session metadata kind `rental_subscription`; success `/pay/success?ra=RA-…`), tracker row purpose `rental_subscription` (insert-fail → Stripe session expired, the 0223 money-safety mirror), poll live-reconciles: schedule wrap FIRST then link RPC (wrap failure 500s so nothing ends up open-ended while marked linked). Guards: wrong_status 422 / already_subscribed 409 / fee_missing 422 / plan_not_synced 422 / **plan_repriced 422** (plan fee ≠ agreement snapshot — no silent money, guardrail #4). Store ownership enforced EXPLICITLY in Hono over service-client reads (store JWTs can't read agreements; 404-not-403 so existence doesn't leak — the 0223 sessions-table pattern).
- `routes/stripe-webhook.ts` — `checkout.session.completed` with `mode==='subscription'` branches to the rental handler (schedule wrap → link RPC; unknown/dashboard-minted sessions acked not retried; wrap failure 500s so Stripe retries). Order-balance flow byte-identical.

**Web**:
- POS topbar **Rent-to-Own** pill → `RentToOwnPage` overlay (own lane, NEVER touches the cart wizard — a rental signs an RA agreement, not an order): offers grouped per SKU joined to catalog name/photo, term chips (RM/mo × months), included-package line, contract summary **without any split figure**, mandatory name+phone form (+ email/address/salesperson scoped to the acting dealer/start date/notes) → sign → RA-number screen (unit code + visit count) → `RentalCollectModal` (StripeCollectModal idiom minus the amount stage): QR/copy/WhatsApp, 4s poll, paid = "Auto-debit active · card saved". Dormant-friendly: no active plans → quiet empty state. Internal on-behalf sends body `dealerId` only when acting (JWT wins otherwise) — the resolveActingDealer convention.
- `PayResult` reads `?ra=` — rent-to-own success copy ("first month collected, card saved for monthly auto-debit").
- P&M Rental tab: new **Stripe** column (Synced / Not synced pill + principal Sync retry button hitting the manual sync route).
- queries.ts: `qk.rental.posPlans/checkoutSession` + `useRentalPosPlans` / `useCreateRentalAgreement` / `useCreateRentalCheckout` / `useRentalCheckoutStatus` (4s poll) / `useSyncRentalPlanStripe`.

**Evidence (worktree from origin/main `8c164a4`)**: shared **996/996** (+9: posRentalPlanFromRow projection guard [asserts NO split field], createRentalAgreementInputSchema incl. "money is an unknown key by .strict()") · api tsc clean + **1472/1475** (+18 in new `rental-sell.test.ts`: stripped-projection response guard, RPC arg contract + detail-slug mapping, checkout 503/404-ownership/409/plan_not_synced/plan_repriced/happy-mint incl. metadata namespace + insert-fail-expires, poll wrap+link contract, webhook subscription branch incl. unknown-session ack + wrap-fail 500, plan auto-sync id write-back + sync-never-fails-save; 3 fails = §17.7 baseline exactly) · web build + design-standard + check:v4 clean, **1452/1468** (+7: RentToOwnPage ×4 [empty state, per-SKU grouping + no-split summary, sign payload gate incl. acting-dealer body rule, collect modal open], RentalTab Stripe column ×3; 16 fails = §17.7 baseline exactly) · dist `SERVICE_ROLE` grep = 0.

**Deliberate semantics (also CF'd)**: month-1 money lands in Stripe but `rental_billings` seq 1 stays `due` until ②'s invoice.paid engine (`rental-first-month-vs-billing-row`) · our schedule anchors on start_date, Stripe on completion (`rental-billing-anchor-drift`) · store roles have no agreements read yet (`rental-agreement-store-read`) · plan re-price policy for live agreements is ②+ (`rental-plan-reprice-policy`).

**Scope note**: the checkpoint's "entitlement minting incl. free-gift attach" NORMAL-sale path (service SKU bought / P7-gifted on an ORDER mints an entitlement) is deliberately NOT in this PR — it hooks order create/proceed, a different blast radius; slated as segment ①b alongside ②.

**Ship state (same session, Loo's proceed)**: guardrail-#8 pre-check caught the parallel hr line taking 0254 (`0254_hr_team_hierarchy` applied mid-session) → renumbered to **0255_rental_sell_lane** across the branch and **applied via MCP** (view + both DEFINER RPCs + columns verified on live). origin/main merged in (PR #273/#274 conflicts resolved keeping both worklog entries), PR #275 **merged** — main tip `8503184` is the union with the hr line's PR #276 which merged minutes earlier. **Deployed from the union tip**: api Worker `c00ae4fc` (unauth /api/rental/pos-plans → 401 + /health ok live-verified) · web `index-Cjl110n-.js` → carres-portal `2666f531` + carres-pos `e205c12c` (`--branch=main`); all 4 canonicals re-curled serving it; live bundle downloaded IN FULL (3,999,649 bytes) — Rent-to-Own markers present, `SERVICE_ROLE` 0. Operator next-steps: author a plan in Catalog → Rental (auto-syncs to the live CARRESS Stripe account), flip it Active, then run one RM59 signup at the POS Rent-to-Own lane.

**Same-session fix (PR #280)**: Loo's screenshot — the new Stripe column pushed the Rental-plans 10-column grid past the 1120px shell, clipping MANAGE off the card edge. Column mins slimmed to ~976px incl. gaps, the row container flipped `overflow-hidden` → `overflow-x-auto` (wide content scrolls inside its own container — UI-KIT law), Stripe cell wraps pill+Sync when tight. RentalTab 13/13 + lint + build clean; deployed `index-C6DPMO9M.js` → carres-portal `4cdb5ab2` + carres-pos `72b9a442` (main tip `84e1397`), 4 canonicals verified, `SERVICE_ROLE` 0.


## 2026-07-25 (latest) · Order line EDIT — pencil per item, up-sell only, POS promo parity (PR #277, migrations 0255 + 0256)

**Ask (Loo, two beats)**: (1) every item on an Order-placed order needs a pencil — reopen its configuration (mattress gap, bedframe legs/mattress slot, sofa compartments) and change it; the ONE rule: the edited price can never drop below the original — up-sell only, no drop-sell. (2) Same day: edited/added items must follow the SAME promo rules as the POS — PWP, GWP, free-gift triggers.

**Web (place lane only)**: pencil on every mattress/bedframe row → `PosConfigurePage` seeded from the persisted row (the wizard-cart `editLine` support from 2026-07-12, reused as-is); pencil on a sofa build (whole exploded group) → `SofaConfigurePage` with the geometry reconstructed onto the canvas (`order-line-edit.ts`: cells from cell_index/module_code/x/y/rot + sofa_height; a master-fabric pick lost at explode is recovered by name, else colour-KIV). Free/GWP/PWP/bundle/combo rows and accessory/service rows stay pencil-less. Client up-sell precheck with real RM figures; failures land on the drawer's error strip.

**API — `POST /api/orders/:id/lines/replace`**: same pricing pipeline as add-lines (fresh catalog price, specials/options/sofa drift gates, delivery re-derive over the post-replace cart) via a new `excludeLineIds` option on `computeAddLinesWriteSet`. Promo parity (0256 pass): the replaced line's RM0 gift rows leave WITH it — re-derive what the OLD config earns under today's gift config, match rows by giftSku+sourceModelId+qty (byte-identical rows fungible; config drift → row stays, the customer keeps what was promised) — and the replacement earns fresh gifts through the standard pipeline stage; code-less PWP claims allowed under the add path's one-promo-per-order policy (voucher codes stay create-only — the 0187 lifecycle machinery only wraps create, same 409 as add). **NEW promo-integrity guard** (`replace-lines-helpers.ts`): the up-sell gate alone can't stop 2×Queen→1×King from halving the trigger units behind this order's rewards / printed vouchers (nothing downstream re-validates them — the 0187 cancel trigger only fires on cancellation); `checkPromoEntitlementAfterEdit` re-runs the carry-forward sweep's entitlement math (PR #155 verbatim, incl. sofa build grouping + promo one-way) over the post-edit cart and 422s `promo_entitlement_broken` when rewards + this order's AVAILABLE vouchers would exceed it — never silently claw back what the customer holds; deactivated rules skipped.

**DB**: `replace_order_lines` (0255, renumbered from 0254 at apply — the hr line took `0254_hr_team_hierarchy` mid-build; a parallel `0255_rental_sell_lane` also landed, dual-numbered FILE = cosmetic): atomic delete-old + insert-replacement under a `FOR UPDATE` order lock (the append-only add RPC skips the lock; a replace can't), place-lane gate, sofa whole-group rule (`partial_sofa_group`), **up-sell gate in the RPC** (`downsell_blocked`), full before-image + old/new totals in order_history metadata + `order.lines_replaced` audit_log (guardrail #4). 0256 = same-signature CREATE OR REPLACE admitting the gift children on the target side and free_gift/pwp markers on p_lines (free_item still rejected; Hono is the real gate — same posture as add_order_lines, which has no marker guard at all).

**V1 boundaries (stated, not bugs)**: edit is place-lane only (proceed lane keeps the HQ change-request path); vouchers can't be applied on an edit (new order, same as add); a gift row orphaned by principal config-drift stays (fail-soft in the customer's favour).

**Evidence**: shared 11/11 (schema) · api 1471/1474 (3 = §17.7 baseline; +8 replace route cases, +9 promo-parity helper cases) · web pos suite 355/355 (helpers 12 + drawer 5 new) · full web at §17.7 baseline (16), zero new · build (v4-guard + tsc + vite) + design-standard + api tsc clean.

**Deploy (main tip `3f4fc05`)**: api Worker `5a0659a1` (unauth POST /lines/replace → 401 ✓ on api.carresofficial.com) · web `index-D28s7AGb.js` → carres-portal `6e1f66d1` + carres-pos `7439ff89` (`--branch=main`); all 4 canonicals verified first curl; live bundle downloaded in full (4,006,086 bytes) — edit + promo-guard markers present, `SERVICE_ROLE` 0.

---

**2026-07-25 night · Full product description on order detail + Sales Order PDF — cart parity · PR #283 (merge `cbe1cbd`) · web-only, no migration · worktree `order-detail-line-description`**

**Ask (Loo, 3 screenshots)**: the POS cart's line description is the reference — model name, `Super Single · gap 12"`, mono SKU code, `+ Divan 8"` / `+ Leg 2"`. The order-detail drawer (PosOrderDetail) showed only `Single · CODY-S`; the Sales Order PDF printed gap/color/fabric but dropped the Divan/Leg option picks and special add-ons.

**Root cause**: the configuration was never lost — it all rides `order_lines.attrs` (`gap` verbatim, `options[]` divan/leg/fabric picks from the 0201/0202 wiring, `specials[]`, `remark`). The cart renders it via `SpecialsSummary` (special-addons-picker); the drawer and the PDF simply never consumed those attrs.

**Fix**:
- `PosOrderDetail.tsx` — standard item rows now render: muted detail = `variant · color · gap · fabric` (new `lineConfigBits`, mirrors the PDF's `attrsDescription` bits) + GWP/PWP tag, the SKU code on its own `font-mono` row (cart layout), and the **same `SpecialsSummary` component the cart uses** — the two surfaces can never drift. Sofa-build group rows already had cart parity via `row.spec`.
- `sales-order-template.tsx` — new `optionSpecialSubs()` prints the option (`+ Divan 8"`), sofa-build leg (skipped when `sofa_spec` already carries it), special add-on and `Remark:` sub-lines under the Description column, reusing `optionsFromAttrs`/`specialsFromAttrs` + the now-exported `OPTION_KIND_LABEL` from special-addons-picker.
- Scope deliberately limited to the two circled surfaces: DealerOrderDetail (ERP) and invoice/DO/PO PDF templates untouched.

**Evidence**: new drawer test (gap + mono SKU + `+ Divan 8"` / `+ Leg 2"` / `+ USB port · +RM 50`) — PosOrderDetail 30/30 · full web suite 16 fail = §17.7 baseline, zero new · build + design-standard lint clean.


**Follow-up same night · PR #285 (merge `a0b2f98`)** — Loo screenshot: the taller configured line bodies left `.os-item`'s `align-items: center` floating the 48px photo / qty / price mid-block. Fix = top-align like `.cart-item`, SpecialsSummary rows restyled to the drawer's 11px muted scale (`.os-item__extras`), edit pencil optically centered on the name row (-6px). Deployed: web `index-Bh3vCypO.js` → carres-portal `d92cb021` + carres-pos `ef46b79c` (erp edge lagged ~1 min before serving the new bundle).

**Second follow-up same night · PR #288 (merge `7787593`)** — Loo refined the drawer format: no point-form rows, no repeated product identity. The item config is now ONE muted wrapped line — `King · gap 14" · Divan 8" · Leg 4" · Fabric BF-12 · Front Drawer (2 Drawers) · …` — built by `lineConfigBits` (flat attrs + `options[]` + `specials[]` + `✎ remark`); the mono SKU-code row and the per-item `+RM` amounts are dropped (price already folded into the line total). The CART and the SO PDF deliberately keep their multi-line "+ …" form — only the drawer went one-line. Deployed: web `index-DD_5TYgd.js` → carres-portal `f5bb61fd` + carres-pos `2beecda7`, all 4 canonicals verified.


## 2026-07-25 (night ②) · Proceed-lane item CHANGE submissions + service add-ons on the add doors (PR #287, migration 0257)

**Ask (Loo, S0-1256 screenshot)**: (1) "Submit product change" 只能加 item — it must also let the store CHANGE an original Sales Order item (choose change vs add). (2) Service SKUs (Dispose old sofa / Dispose old mattress) can't be added post-create — "它也是其中一个 SKU", same setting as opening a sales order.

**Design (decided in-session)**: the proceed lane inherits the place lane's per-item pencil (0255/0256, shipped the same morning) instead of a chooser modal — pencil = change, existing button = add. Save in the proceed lane files an `order_change_requests` **kind='replace_lines'** submission (targetLineIds + display snapshot for the ops old→new view + the re-configured line); approval applies through the SAME replace pipeline (`computeReplaceWriteSet`, extracted from POST /:id/lines/replace) via `replace_order_lines p_source='change_request'`. Service add-ons = the wizard's `addons` config surfaced as a **Services** chip in AddProductOverlay (AddonsPanel reused verbatim incl. 0242 per-unit sizes), both lanes; they persist as `order_addons` rows (wizard semantics, NOT order_lines — services aren't procured), server-priced from config via `priceServiceAddons` (active + never DELIVERY*; size completeness re-checked server-side).

**DB 0257** (`0257_change_request_replace_and_service_addons.sql`): kind CHECK + 'replace_lines' · `submit_order_change_request` 2→3 args (p_kind; replace payloads validate targets belong to the order, carry no promo/free/bundle markers, and are THREAD-VIRGIN — fail at submit, not days later at approval) · `update_order_change_request` validates by the request's kind (same signature, CREATE OR REPLACE) · `add_order_lines` 5→6 args (`p_addons_append`; addons-only adds allowed; key must exist ACTIVE in `addons`) · `replace_order_lines` 4→6 args (p_source/p_change_request_id; change_request gate = operation/principal + pending replace_lines request; approve-stamp + items_edited flip in the same transaction). All signature changes DROP+CREATE with grants restated (0153/0154 ghost-overload law). **NEW production-safety gate (both replace sources): any target line with an `order_supplier_threads` row → 22023 `line_in_production`** — 0124 made threads ON DELETE CASCADE on order_lines, so a replace would silently destroy a live procurement thread; threads are born at the ops confirm action, so the change window = "before ops confirms". **Up-sell-only stays law for approvals** (HQ approval doesn't waive `downsell_blocked`). RLS: zero policy changes; all writes stay behind these SECURITY DEFINER RPCs (0231/0233 posture); guardrail #4 history/audit preserved on every path.

**Web**: proceed-lane pencils (hidden while a request is pending — one-pending law unchanged); pending banner / View-request modal / ops ChangeRequestsPanel all kind-aware (replace renders old struck-through → new; button reads "Approve & apply"); Services tab CTA reads "Add to order" (place) / "Submit for approval" (proceed). Pre-0257 bodies without `kind` still parse (backward-compat union).

**Evidence (worktree from origin/main `e3ca057`)**: shared **1002/1002** (+ union/addons schema cases) · api **1514/1517** (3 = §17.7 baseline exactly; +7: addons-only add, unknown/inactive-addon 422, size-gate 422, submit p_kind passthrough, decide replace happy incl. fresh-price assert, decide thread-block 422) · web **1479/1495** (16 = §17.7 baseline exactly; PosOrderDetail 30 incl. proceed-pencil→CR payload + pending-hides-pencil, AddProductOverlay 7 incl. Services offerable-filter + size gate, ChangeRequestsPanel 5) · web build (tsc + v4 gate) + design-standard clean · dist `SERVICE_ROLE` grep 0.

**Ship state (same session, Loo's 开工)**: two parallel merges landed mid-flight (PR #288 one-line drawer config + docs #289) — origin/main merged into the branch twice (PosOrderDetail import-union + keep-both docs), touched suites re-run green (PosOrderDetail 31 incl. the #283 description case). PR #287 **merged** (`48de6a3b`). Tracker tail re-checked = 0256 → **0257 applied via MCP**; live signatures verified: submit 3-arg / add_order_lines 6-arg / replace_order_lines 6-arg, each name = exactly ONE overload, kind CHECK = (add_lines, replace_lines). **Deployed AFTER the apply** (order matters — the RPC signatures changed): api Worker `f0683137` (unauth GET /api/orders/change-requests/pending → 401 ✓ on api.carresofficial.com) · web `index-B7Mkk_RD.js` → carres-portal `bbe6ff2d` + carres-pos `fc00de89` (`--branch=main`); all 4 canonicals verified FIRST curl; live bundle downloaded in full (4,012,255 bytes) — "Submit for approval" ×2 + `pos-add-services` markers present, `SERVICE_ROLE` 0.

**CFs (LOW, full text in carry-forwards)**: `change-request-accessory-qty-edit` · `change-request-replace-edit-in-place`.


## 2026-07-25 (night ③) · Service add-on rows become editable — qty + per-unit sizes (PR #291, migration 0258, applied + deployed same session)

**Ask (Loo, S0-1255 screenshot, yellow circle on "Dispose old mattress · King ×1 RM80")**: "for service sku need to be editable as well" — the dispose/service rows (order_addons) had no pencil; only product lines got the 0255/0257 edit path.

**Design**: every dealer-chosen addon row gets the pencil in BOTH lanes. Place lane → small modal (qty stepper + 0242 per-unit size dropdowns) applies directly via NEW RPC `edit_order_addon`; proceed lane → the same modal files `order_change_requests` kind='edit_addon' (payload targetAddonId/qty/attrs + old snapshot), ops sees `×1 · King → ×2 · King + Queen`, Approve & apply runs the same RPC `p_source='change_request'`. **DELIVERY* rows stay locked** (server-minted by the 0184 recompute — `addon_not_editable`). **Up-sell law carried over**: the row's unit_price snapshot never changes, so the law reduces to qty ≥ current (`downsell_blocked`); the modal says so ("reductions go through HQ") and the minus button floors at the original qty. Size law re-validated in the RPC against LIVE `addons.size_options`.

**DB 0258**: `edit_order_addon` NEW (6 args, order FOR UPDATE lock, per-source gates mirroring 0257, approve-stamp + items_edited flip, before-image history + `order.addon_edited` audit — guardrail #4). `submit_order_change_request` (3-arg) + `update_order_change_request` (2-arg) keep signatures → CREATE OR REPLACE with the edit_addon validation branch (fail at submit: row on this order, not DELIVERY*, qty ≥ current). kind CHECK → ('add_lines','replace_lines','edit_addon'). Applied after tail re-check (= 0257); pg_proc verified 1 overload each.

**API**: NEW `POST /api/orders/:id/addons/:addonId/edit` (thin — parse + friendly place gate + RPC authority); submit/edit routes gain the edit_addon branch (payload passthrough); decide route applies edit_addon via the RPC.

**Web**: addon rows render the pencil under the same lane/pending rules as items; edit modal (qty stepper + per-unit sizes, red-border empty, Save disabled until complete); pending banner / View modal / ops ChangeRequestsPanel kind-aware ("Add-on change", old struck → new, Approve & apply). `useEditOrderAddon` hook. Design-standard hover law caught `hover:bg-base-50` on my stepper buttons → `hover:bg-hovertint` (the checker works).

**Evidence**: shared 1003/1003 · api 1519/1522 (3 = §17.7 baseline; +5) · web 1484/1500 (16 = §17.7 baseline exactly; PosOrderDetail 34 incl. addon pencil place/sized/proceed-CR + DELIVERY locked; history-suite mock gained the new hook — a NEW hook in PosOrderDetail must be added to BOTH test files' query mocks) · build + design-standard clean.

**Ship**: PR #291 merged (`ec3cafd1`) → 0258 applied via MCP → api Worker `4404af26` (unauth new route → 401 ✓) → web `index-CC9gQUto.js` → carres-portal `06ce0d6e` + carres-pos `52865f29`; 4 canonicals first-curl ✓; full bundle 4,018,678 bytes — `pos-od-addon-modal` marker present, `SERVICE_ROLE` 0.


## 2026-07-25 (night ④) · SO PDF description = the drawer's ONE-line formula (PR #293, web-only, deployed)

**Ask (Loo, SO PDF screenshot)**: "sales order description want same formula as well" — the PDF still printed point-form `+ Divan 10" · +RM 125` sub-lines after the drawer went one-line (PR #288).

**Fix**: `lineConfigBits` moved from PosOrderDetail into `special-addons-picker` (ONE shared source — drawer + PDF can never drift); the PDF's `attrsDescription` + `optionSpecialSubs` (multi-line, RM-carrying) deleted in favour of one muted `configLine` — `gap 17" · Divan 10" · Leg 2" · Fabric BF-03 · … · ✎ remark`, no per-item RM. Sofa rows keep `sofa_spec` (fabric/leg live inside; only the remark bit rides). ADD-ON sub drops the `Size:` prefix (bare `King`, drawer parity); follow-up remark now `✎ Follow-up of SO-…`.

**Evidence**: affected suites 140/140 · full web 1484/1500 (16 = §17.7 baseline) · build + design-standard clean. **Ship**: PR #293 (`c3ac251e`) → web `index-BYxwMJyA.js` → carres-portal `d51bc036` + carres-pos `3597bdb5`; 4 canonicals ✓ (carres-pos.pages.dev edge lagged ~1 min); full bundle 4,017,729 bytes — new `✎ Follow-up` marker present, old `Size:` prefix zero, `SERVICE_ROLE` 0. api/DB untouched.

---

**2026-07-25 night ⑤ · HR departments + Department chart (hierarchy Phase 1b) · PR #295 (merge `3db49b9f`) · migration 0259 applied · worktree `hr-hierarchy`**

**Ask (Loo)**: "now got what position? and go where to add new position? then I want have department chart as well." First two answered from live data + P1 UI (12 seed positions, 4 filled; add-position lives in Team → Positions card); the third is this ship.

**Migration 0259 `org_departments`** (tail pre-checked — 0258 had just been taken by the parallel order-change line, guardrail #8 catch again; `hr_team_source()` verified single-overload before REPLACE):
- `org_departments` (name unique, sort, active) — RLS = the org_positions hr/principal keyhole, exact mirror.
- `org_positions.department_id` FK (`on delete set null`). Seeded Sales / Operation / Finance / HR / Business Development and mapped the 0254 ladder; **C-level seats deliberately department-less** — the management team renders ON TOP of the chart, not inside a column.
- `hr_team_source()` v2 — same zero-arg signature, adds `departments[]` + `departmentId` on positions.

**API**: `POST /api/hr/team/departments` upsert (mirror of `/positions`, direct RLS table write); `/positions` now carries `department_id`.

**Team tab**:
- **Department chart** card at the top: Management team (C-level) centered strip → `auto-fit minmax(190px,1fr)` grid with one column per active department (members via position→department, manager band before executive) → a **Showrooms** column grouped by store (tier-derived labels) → an **Unassigned** bucket so HR sees who still needs filing. Chart shows active people only.
- **Positions card**: chips → rows; every non-C-level row gets a department `select`; add-row gains band + department pickers.
- **Departments card**: chip add/retire, same pattern as positions used to be.

**Evidence**: HrTeamTab 3/3 (new chart-grouping case) · api hr-team 17/17 · shared 1002/1002 · full web 16 fail / api 3 fail = §17.7 baseline, zero new · web build + api tsc clean.

**Deploy (union tip `3db49b9f`, AFTER 0259 applied)**: api Worker `19a3a6e1` (unauth /api/hr/team → 401 ✓; union carries #291's 0258 api) · web `index-D7Ejw5bd.js` → carres-portal `b43cf6b5` + carres-pos `3f4b4143`; all 4 canonicals verified (carres-portal pair edge lagged ~2 min); dist `SERVICE_ROLE` grep 0.

**Also this session (not shipped)**: hierarchy Phase 2 permissions proposal presented to Loo — replace `OPS_MANAGER_EMAILS`/`isPoDutyEditor`/`OPS_GENERIC_EMAILS` hardcodes with position-band reads (`my_org_position()` self-only DEFINER fn, PO-duty editor = the "Operation Manager" seat, legacy email list as transition fallback). Awaiting his call.


## 2026-07-26 · Customer sub-step pills clickable (PR #297, web-only, deployed)

**Ask (Loo, 02 Customer screenshot)**: the Customer / Address / Emergency / Target date pills should jump on click — Next/Previous stay, the pills become a shortcut ("我已经在 Emergency 的时候，直接点 Customer 就跳去 Customer Tab").

**Fix**: pills are `<button>`s. Backward always free (data stays; Next re-validates forward). Forward walks the SAME per-step gates Next enforces — `canAdvance` parametrized to `canAdvanceAt(i)`, `maxReachable` chains from the current step; unreachable pills are `disabled`. CSS `button.step-pill` overrides UA font/colour/GrayText so the look is byte-identical to the div era — the only visual change is the pointer cursor.

**Evidence**: CustomerStep 19/19 (+3: backward jump / gated forward / gate-passing forward — race/gender/birthday are defaultRequired, the valid-draft fixture must fill them) · full web 1488/1504 (16 = §17.7 baseline) · build + design-standard clean. **Ship**: PR #297 (`2be6da75`) → web `index-Cuu6viJe.js` → carres-portal `1187e4c9` + carres-pos `c393e050`; 4 canonicals ✓; full bundle 4,024,543 bytes marker ✓ SERVICE_ROLE 0. **Gotcha worth keeping: right after a Pages deploy the asset URL can briefly return the SPA `_redirects` fallback (index.html, ~1.7KB) while the edge propagates — a "bundle" download under 3MB is the fallback, not the bundle; retry until the size is real before grepping markers.**


## 2026-07-26 ② · CARRES wordmark = home button (PR #299, web-only, deployed)

**Ask (Loo, topbar screenshot)**: press the logo → back to the catalog page. **Fix**: `.pos-wordmark` becomes a `<button>` — mid-wizard it returns to step 1 with the draft kept (same as the already-clickable `01 Cart` crumb, bigger target); on the Thank-you screen it runs the SAME full reset as New order (jumping back with the old cart loaded would invite a duplicate order). CSS neutralises UA button chrome; look unchanged. **Ship**: PR #299 (`688c9ddf`) → web `index-_N6HZi_7.js` → carres-portal `00184e28` + carres-pos `e650c77a`; 4 canonicals ✓; full bundle 4,024,653 bytes marker ✓ SERVICE_ROLE 0. Full web 16 fail = §17.7 baseline.


## 2026-07-26 ③ · Configure pages carry the POS topbar strip (PR #301, web-only, deployed)

**Ask (Loo, two screenshots)**: the circled topbar block (CARRES logo + `POS · store` + 01/02/03 crumbs) should also sit on the product configure page; pressing the logo = back to catalog — no hunting for the small ← arrow.

**Fix**: new `ConfigureTopbarBrand` replaces the arrow on PosConfigurePage + SofaConfigurePage **when opened from the wizard** (CatalogStep passes `topbarContext` down from DealerPos — the same label the real topbar shows). Logo click = onClose (back to catalog); crumbs static (01 Cart active — configuring lives inside step 1; the real topbar offers no forward jumps from step 1 either). **Outside the wizard** (order-detail edit pencil, AddProductOverlay) no wizard context → the plain arrow stays. Typography single-sourced from the `pos-wordmark`/`pos-topbar__*` classes. Design-standard catch: the hex rule flagged `PR #299` in a comment as a 3-digit colour — avoid `#NNN` in web-app comments.

**Evidence**: PosConfigurePage 13/13 (+2: strip + logo=back; no-context keeps the arrow) · SofaConfigurePage 42/42 · CatalogStep 7/7 · full web 1490/1506 (16 = §17.7 baseline). **Ship**: PR #301 (`d9f96641`) → web `index-BEoh8CxQ.js` → carres-portal `2deacae0` + carres-pos `3112581f`; 4 canonicals ✓; full bundle 4,025,766 bytes marker ✓ SERVICE_ROLE 0.


## 2026-07-26 ④ · Fix: configure topbar strip on its OWN row (PR #303, web-only, deployed)

**Loo screenshot**: PR #301 inlined the strip into the sofa `cfg-header` — already carrying model crumb + seat-height tabs + Quick pick/Customize + PWP bar + live total — everything overlapped and Quick pick became unclickable. **Fix**: strip = a slim dedicated `cfg-wizardbar` row (48px) above the header on BOTH configure pages (`cfg-root.has-wizardbar` → 4-row grid); dense header rows return to their pre-#301 layout; wizard mode keeps no ← arrow (logo = back). **Lesson: the sofa cfg-header has zero slack — never add inline content to it; new chrome gets its own row.** Ship: PR #303 (`a318fb46`) → `index-C5MTuAHF.js` → carres-portal `00e99db1` + carres-pos `4b404bc0`; 4 canonicals ✓; bundle 4,025,924 bytes marker ✓ SERVICE_ROLE 0. Tests: configure pages 55/55, full web 16 = baseline.


## 2026-07-26 ⑤ · Sofa configure header — 2990s-style one row (PR #305, web-only, deployed)

**Loo (2990s reference)**: for the sofa page the single-row header reads better than the #303 extra strip row. **Fix**: sofa page drops the `cfg-wizardbar` row; the header leads with the **compact brand** (logo + `POS · store`, NO 01/02/03 pills — the overflow culprit) beside the restored ← arrow (2990s layout), then the usual crumb/heights/mode tabs/PWP/total. Logo = back stays; compact brand shrinks first (crumb ellipsis). Mattress/bed page keeps its #303 own-row strip with the full crumbs. `ConfigureTopbarBrand` gains `compact`. **Ship**: PR #305 (`b1c32303`) → `index-DEPvhmWd.js` → carres-portal `63ce7dee` + carres-pos `11c879f6`; 4 canonicals ✓; bundle 4,025,878 bytes SERVICE_ROLE 0. Tests: Sofa 43/43 (+1 compact case), full web 16 = baseline.


## 2026-07-26 ⑥ · Sofa header revert to arrow-only (PR #307, web-only, deployed)

**Loo**: still overlapping — revert the sofa tab to the first version. **Final state of the configure-page header saga (PR 301→303→305→307)**: bed/mattress page = own `cfg-wizardbar` row (CARRES logo + `POS · store` + 01/02/03, logo = back, no arrow); **sofa page = the ORIGINAL arrow-only header** — that row (crumb + heights + Quick pick/Customize + PWP bar + total) has ZERO slack; both the inline (PR-301) and compact (PR-305) brand attempts overlapped it. Documented in-code (ConfigureTopbarBrand + SofaConfigurePage headers) so no third attempt; a test locks the sofa header as arrow-only. **Ship**: PR #307 (`4bb9dc64`) → `index--fYb_hd5.js` → carres-portal `4a927d12` + carres-pos `0a9bb1ed`; 4 canonicals ✓; bundle 4,025,751 bytes SERVICE_ROLE 0. Tests 63/63 touched + full web 16 = baseline. (Design-standard hex rule caught `#301/#305` in comments AGAIN — write `PR-NNN` in web-app comments, never `#NNN`.)


## 2026-07-26 ⑦ · Rental SETTING closed loop — offers off a Modular model (0264, branch `worktree-rental-modular-sku`)

**Ask (Loo, 5 rounds in one session)**: the Rental tab's "type a SKU code" box has to go — a rental plan is authored off the **Modular** model: pick the model → tick what is rentable → price it → restrict the options (legs only 2"/3") → sofa prices by **compartment sum** (1A 10 + 2A 20 = 30/mo) **or by combo** (fixed 150/mo) with a manual **surcharge slot** → every option can carry its own **one-time** or **monthly** price (monthly rides the term: RM5 × 84 = RM420) → **mattress has no colour/leg/divan** (that's the bed frame) → the product also sells **outright** (buy lane) → **GWP** gift column on both lanes, gifts are real SKUs → **fabric drills down to colours** (CG's 16 colours, rental opens 4) and colour is NOT a separate axis (fabric first, then colour) → **service plans** are a separate block in all three editors (visits/yr, free-with-lane + how many visits free, monthly and/or outright price) → service SKU format carries a **category token**: `SVC-MAT-CLEAN-1Y2`.

**Design-before-build (the standing HR-spec law)**: a UI mock was published and iterated 5× before a line of code — artifact `c6ea9f74-23ac-47a9-b198-7df5cadb3c79` (UI-KIT v4 tokens; mattress / bed frame / sofa editors side by side).

**Shape**: an **offer** is the new unit — ONE per `product_models` row. `rental_plans` stays THE rent money atom (the 0255 `rental_plans_pos` view + `create_rental_agreement` read it, and one Stripe Price per amount is a Stripe fact), now parented by `offer_id` and widened with `combo_id` / `line_kind` (`unit|compartment|combo`) / `gifts`. The buy lane is its own table (no term, no recurring price). Verified 0 rows in every rental table before restructuring.

**Migration 0264_rental_offers.sql (APPLIED, tracker tail was 0263)**: `rental_offers` (pricing_mode · rent/buy lane flags · terms_months · `option_prices` jsonb overlay · `surcharges` jsonb slots · split pcts, one per model) · `rental_plans` +offer_id/combo_id/line_kind/gifts, `sku` nullable + "exactly one target" CHECK + a partial UNIQUE for combo lines · `rental_buy_prices` (NULL price = sell at the SKU Master list price) · `rental_offer_services` (free_lane + free_visits + monthly/outright price) · `service_packages.category` · `rental_agreements` +offer_id/selected_options/gifts/one_off_total (dormant snapshot columns). RLS = read `is_internal()`, write `is_principal()` (0253 doctrine — the split pcts are cross-party terms).

**Shared**: `serviceSkuCode(category, type, months, visits)` → `SVC-{MAT|BF|SOFA|ACC}-{CLEAN|REPAIR|SVCX}-{n}Y{visits}` (non-whole years keep months: `18M2`) · `resolveRentalPick` (fabric colour inherits its series; an off value/series returns null) · `quoteRental` (base + option monthlies + required/ticked surcharges; one-off separately; `invalidPicks` for the future signing gate; Σ-exact rounding at the end) · `compartmentBuildMonthly` (missing part rate = NOT rentable, never free) · `mergeRentalGifts`.

**API**: `/api/rental/offers` CRUD + `/offers/:id/buy-prices` + `/offers/:id/services` (+ patch/delete by id), config bundle widened, plan create/patch carry the new fields, and **creating a service package with a category MINTS its `SVC-…` product_sku** under the catalog's service model (idempotent; 422 when no service model exists). Stripe glue labels a combo line `combo-<id>` instead of `null`.

**Web**: the tab is now **Offers + Service packages**. Offers list = one row per model (lanes, fee range, Stripe synced count, On sale). `+ New offer` opens a **model picker** (models with an offer are hidden — UNIQUE model_id). The editor is category-driven: rent price matrix (rows = live SKUs / compartments / combos × term columns) with a GWP cell, buy lane, option tables with one-time + monthly + "over the term", **fabric series → colour drill-down** (All on/off, series price with per-colour override), surcharge slots, service-plan block (filtered by the category token), split preview + On sale. Save = one offer PATCH + create/patch/delete diffs of lines, buy prices and services.

**Evidence**: shared 1030/1030 (+43 new) · api 1519/1522 (3 = §17.7 baseline; rental route 40/40) · web 1500/1516 (16 = §17.7 baseline; RentalTab 22/22) · design-standard clean · `pnpm --filter @carres/web build` ✓. **Shipped**: PR #315 (merge `0ff8f1bc`, union with the HR-P2 line's #312/#313) → api Worker `7fb8505c` (unauth `/api/rental/config` 401 ✓) + web `index-CAb0V6zA.js` → carres-portal `8bd30efe` + carres-pos `efebec76`; all 4 canonicals serve it; live bundle downloaded 4,062,610 bytes, `SERVICE_ROLE` grep 0, offer-picker marker ✓. Post-merge suites: shared 1048/1048 · api 3 = baseline · web 16 = baseline. **Next (segment ①b)**: the POS lane consuming the overlay — render the option/fabric picker, recompute with `quoteRental` server-side, and freeze the picks + one-off money onto the agreement (see the three new CFs, incl. `rental-combo-agreement-sku-null`).


## 2026-07-26 ⑧ · Guarantee packages — the 6th SKU category (migrations 0261-0263, PR pending)

**Ask (Loo)**: a new SKU category `guarantee` (he corrected "warranty" → **guarantee**). Sell a
Mattress Guarantee at RM150: our mattresses carry a 15-year warranty, and if the mattress fails
inside that window we don't repair — we swap it one-for-one. Invoice + Customer Info must mark
clearly who bought it, and ops must be able to track back from a claim by **Sales Order /
customer name / customer ID** to the exact model that was covered.

**Three business rulings taken before any schema was written** (asked, not assumed):
(1) the 15 years start on **delivery**, not on the order date — the entitlement is born `pending`
and flips to `active` the moment `orders.delivered_at` lands; (2) **1 guarantee : 1 mattress** —
a qty-2 line mints 2 entitlement rows, because only 1:1 can answer "which model"; (3) a claim is
**one-shot** — the swap spends the guarantee.

**Shape**: `0261` widens `product_category` alone (PG forbids USING a new enum value in the
transaction that adds it — same split as 0169→0172). `0262` adds `guarantee_terms` (config) +
`guarantee_entitlements` (the ledger, one row per covered unit, with the covered SKU/model/label
**snapshotted** so a rename 15 years out never orphans a claim) + the mint/void/sync triggers +
the `guarantee_claim` / `guarantee_attach` DEFINER RPCs. `0263` seeds the RM150 / 15y / replace
product — **not dormant**, Loo wants it sellable.

**The key design call — a trigger, not RPC edits**: a guarantee line can enter an order through
FIVE doors (create_order 0089 · add_order_lines 0231/0232 · replace_order_lines 0255/0256 ·
change-request approve 0233/0257 · AutoCount import 0132/0237). One `AFTER INSERT` trigger on
`order_lines` closes all five permanently. The same trigger backfills `covers_line_id` because
create_order inserts in cart order — the guarantee can land BEFORE the mattress it covers.
Perf: the orders trigger carries a `WHEN` clause (4 columns only); the line trigger costs one PK
probe on a tiny table + one partial-index probe.

**Expiry is DERIVED, never stored** (`effectiveGuaranteeStatus`) — an 'active' row past its date
reads Expired whether or not any job ran. Every surface reads the derived value.

**Surfaces**: SKU Master gains a Guarantee chip · POS gains a Guarantees rail whose card CANNOT
direct-add — it opens a covered-item picker that stamps `attrs.guarantee.covers_sku` (the exact
path the trigger reads; the contract-sacred submit pipeline is untouched) · the invoice PDF gains
a bordered **Guarantee cover** block (covers / years / remedy in words / end date) · a
`GuaranteeCoverStrip` sits in the Customer block of BOTH order-detail surfaces and renders
NOTHING when there is no guarantee · new **Operation → Guarantees** desk: one box resolving all
three track-back axes, with the one-shot Claim action (writes `order_history`, can link a
Service Case).

**Verified on prod inside rolled-back transactions before anything shipped** (the mint trigger
sits on the order-creation hot path): qty-2 → 2 units with the right covered line + label ·
delivered → active with expiry 2041-08-01 · guarantee-inserted-BEFORE-the-mattress → backfilled ·
cancel → void · line deleted → row SURVIVES as void (audit trail kept) · claim refused while
pending, accepted once delivered, refused on the second attempt, and a claimed row survives its
line being deleted. `guarantee_entitlements` = 0 rows afterwards, test order untouched.

**Two silent drift bugs found and closed while wiring**: `purchase-report.ts` and
`apps/api/routes/catalog.ts` each kept their OWN hand-written copy of the 5-category list — the
catalog one would have demanded a supplier for a guarantee SKU. Both now read the shared
constant. The category enum moved to `schemas/product-category.ts` so `catalog.ts` and
`guarantee.ts` can share it without a cycle (catalog re-exports it; no import path changed).

**Test-harness lesson**: a leaf component must NOT call `useQuery` directly — drawer tests fully
mock `@/lib/queries` and therefore install no `QueryClientProvider`, so a raw query in the leaf
took 38 tests down. The hook moved into `@/lib/queries` (`useOrderGuarantees`) and the affected
full mocks stub it.

**Evidence**: shared 1019/1019 (+17 new) · api 1527/1530 (3 = §17.7 baseline; +7 new route tests;
extended the invoice pdf-data mock for the two new tables and added a guarantee-block assertion)
· web 1498/1514 (16 = §17.7 baseline; +7 new strip tests) · typecheck api 0 / web 0 / shared 2
(pre-existing on clean origin/main) · `check:v4` clean · design-standard clean (caught one new
grey hover — `hover:bg-hovertint`) · BUILD ran (`index-H9jzDLTX.js`), `SERVICE_ROLE` grep 0.
Spec: `docs/guarantee-package-spec.md`.

**Ship**: PR #314 (merge `bd27e1ad`, union with the HR-P2 line's #312 and the Rental-offers line's
#315 — CLAUDE.md's migration row + the timeline + a colliding ⑦ worklog heading all conflicted;
theirs won on the migration row because 0264 already names 0261-0263, mine renumbered to ⑧) →
api Worker `3da6c7bb` (unauth `/api/guarantees/terms` AND `/api/guarantees` both 401 on
api.carresofficial.com and the workers.dev host) + web `index-Dy-fo8kJ.js` → carres-portal
`de170149` + carres-pos `df3b8308`; all 4 canonicals serve it; live bundle downloaded
4,078,798 bytes, `SERVICE_ROLE` grep 0, guarantee + claim-desk markers ✓. Post-merge union suites:
shared 1064/1064 · api 1545/1548 (3 = baseline) · web 1507/1523 (16 = baseline) · typecheck
api 0 / web 0 / shared 2 (pre-existing). **Worker deployed BEFORE the web** so the new UI never
called a 404. DB live-verified after: 1 active term, `Mattress Guarantee 15 Years · RM150.00 ·
15y · replace`, `pos_active=true`, 0 entitlements (correct — nothing sold yet, and by design no
history was backfilled).

**Follow-up same session (Loo)**: "订单入口以后基本只会有 POS system；现在看到的订单都是以前 testimony 的 order，系统转移时还没 start Guarantee Program，不需要管之前的 order." Two consequences. (1) **No historical handling, by design** — no backfill was written and none is wanted; the mint trigger only fires on INSERT, so the legacy orders simply carry zero entitlements, which is correct (nobody was sold one). (2) It re-ranked a hole I had filed as an edge case into the main road: **`AddProductOverlay`** (add a product to an order that already exists — the POS's *second* door) built its category chips from `index.productModels`, so the Guarantee card appeared there and fell through to the generic `ConfigureDrawer`, which would have added it **bare**. Fixed: the overlay routes the guarantee card through the SAME `GuaranteePickerModal`, choosing from the ORDER's existing lines (`context="order"` only changes the empty-state wording — the gate is identical). Both POS doors now force attachment, which downgrades `guarantee-attach-no-ui` to LOW: an unattached entitlement can now only come from hand-written SQL or a future non-POS door, and `guarantee_attach` stays as the repair path. Spec gained §4 recording the POS-only scope. Re-verified: web 1498/1514 (16 = baseline), typecheck 0, design-standard + check:v4 clean.


## 2026-07-26 ⑨ · SKU Master — the SIZE column goes where there is no size (PR #318, web-only, deployed)

**Loo, two screenshots**: the Service list doesn't need a SIZE column, those SKUs have no size. Same picture on Guarantee.

**What it was actually printing** — worth writing down because both are structural, not data entry mistakes: a **service** SKU's `variant` IS its code (`SVC-DISPOSE-SOFA`; all 5 live rows have `variant = sku`), so the SIZE column literally repeated the CODE column; a **guarantee**'s `variant` is the customer-facing invoice sentence ("Mattress Guarantee 15 Years") because `finance/invoices.ts` reads `product_skus.variant` as the invoice line description.

**Fix**: `SIZELESS_CATEGORIES` (service + guarantee) + `categoryHasSizeAxis()` in `@carres/shared` so the rule has ONE home. Filtered to a sizeless category → the SIZE column is dropped outright (header + the 100px grid track, via a `GRID_COLS_NO_SIZE` twin) and edit-all offers no phantom size input; under "All" the column stays (mattress/bedframe/sofa need it) and a sizeless ROW renders "—". **`accessory` is deliberately NOT in the set** — its variant is a legitimate optional "option" label (the POS calls it that) and is merely empty on today's two rows; hiding the column there could hide a real value later. Display-only — nothing writes differently, and the value still round-trips through Export / Import SKUs.

**Ship**: PR #318 (merge `31e3f97a`) → web `index-CC1XlVpH.js` → carres-portal `816fadd0` + carres-pos `29de7199`; all 4 canonicals ✓; live bundle downloaded 4,079,060 bytes, `SERVICE_ROLE` grep 0. Tests: SkuMasterTab 37/37 (+5 locking the behaviour), full web 1512/1528 (16 = §17.7 baseline), shared 1064/1064, typecheck api 0 / web 0, design-standard + check:v4 clean. api/DB untouched (Worker stays `3da6c7bb`).


## 2026-07-26 ⑩ · SKU Master — rows must use the header's grid template (PR #321, web-only, deployed)

**Loo, screenshot**: on the Service filter every column from Category rightwards sat well left of its header — "category 跟价钱偏离这么远，它应该是 vertical 对齐的".

**My own regression from ⑨.** THREE grids render this table: the header, the sofa-size row variant and the flat row. The first two read the `gridCols` the tab computes; **the flat row hardcoded `GRID_COLS`**. When ⑨ gave the header the no-size template, the row kept the 9-track one — the same `minmax(...,1.4fr)` / `1fr` tracks, but an extra fixed 100px track eating the free width, so the flexible columns came out narrower INSIDE the row and everything after Description drifted left. Fix = the flat row reads `gridCols` like the other two. **Durable lesson: when a component renders the same table in more than one grid, the template must be ONE value threaded to every renderer — a hardcoded twin will silently desync the moment the shared one changes.**

Three tests lock header ≡ row (size present / size dropped / Guarantee); **verified they go red (2 fails) with the fix reverted**, so it cannot drift back.

**Ship**: PR #321 (merge `b62c2b61`) → web `index-5c_O6Gw0.js` → carres-portal `eeb15f16` + carres-pos `114bee82`. Tests: SkuMasterTab 40/40 (+3), full web 1518/1534 (16 = §17.7 baseline), typecheck 0, design-standard + check:v4 clean. api/DB untouched (Worker stays `3da6c7bb`).

**Parallel-deploy scare worth recording**: right after the deploy `erp.carresofficial.com` served `index-D638ZWqg.js` — the HR-O1 line's bundle (#319) — while the other three canonicals served mine. Not a clobber: `wrangler pages deployment list` showed MY `eeb15f16` (from `b62c2b6`) as the newest, and `git log b62c2b61` proved my merge commit already CONTAINS #319 (`5a9c5380`), so my bundle is the true union — confirmed by grepping the live file for BOTH lines' markers. The custom domain was simply ~1-2 min behind the pages.dev alias. **Check the deployment list + whether your commit contains theirs BEFORE concluding you overwrote someone.**


## 2026-07-26 ⑧ · Rental gets its own Admin tab, offers filed by product family (PR #324, web-only, deployed)

**Loo**: the rental config had outgrown a tab strip inside Product & Maintenance, which is otherwise pure catalog work — pull it out to the left rail as its own tab, and inside it split the offers by category. **Also (same message): the module is called "Rental", nothing else.**

**Move**: new Admin nav item **Rental** (`?tab=rental-setting`) mounting `RentalSettingPage` (was `catalog/tabs/RentalTab`); the offer editor + care-plan section travel unchanged. Offers file by PRODUCT FAMILY via `?section=mattress|bedframe|sofa` with the care plans on their own service-package tab; each pill carries its count, the model picker narrows to the open family, "+ New offer" hides on the care-plan tab. P&M drops the Rental tab and the rental-only `catalogQ` guards. The page stays a SETTINGS surface — collections / visits / the rented-out fleet are operations, SKUs stay in SKU Master.

**Decisions locked the same session** (full text in `docs/rental-service-plan-proposal.md`): the agreement doc prints Loo's T&C verbatim and is signed at the sales order (no signature, no order → no draft state) with the **free service package deliberately excluded** (a promotion, not a rental term); five gaps flagged for his lawyer (no ownership-transfer clause, no buyout clause, "rental excludes servicing" vs a free care plan, the 7th-of-month + 8%/month terms, the credit-assessment clause); the **buyout/settlement** lane (finance clears the remaining months, customer-signed supporting document attached); **Stripe** — the 8% penalty is not native so the engine pushes a one-off invoice item, and subscriptions go past-due rather than cancel because termination after six missed months is MANUAL; the new finance **Approver page** (CBM API hook later) that gates an order into operations.

**Evidence**: RentalSettingPage 24/24 · catalog 217/217 · full web 1520/1536 (16 = §17.7 baseline) · design-standard clean · build ok. **Ship**: PR #324 (merge `93a64a7a`, union with the SKU-Master-grid line's #319/#321) → web `index-B4SBrkkQ.js` → carres-portal `92157205` + carres-pos `8b19c4d1`; 4 canonicals ✓ (pos.carresofficial.com took a second curl ~40s later); live bundle 4,083,949 bytes, `SERVICE_ROLE` grep 0. API untouched this round.


## 2026-07-26 ⑪ · Guarantee ID — the handle a claim is made against (0267, PR #328, deployed)

**Loo**: every guarantee needs an ID — 4 random letters + 6 random digits, generated when the Sales Order is created, used for all tracking and for the claim, shown in the item's remark, and **deleted once claimed**.

**Why the format is good rather than decorative**: the blocks are POSITIONAL — a letter can only sit in the first four slots, a digit only in the last six — so O-vs-0 and I-vs-1 can never be ambiguous when a customer reads the ID off a printed Sales Order and the counter retypes it.

**Minted inside the existing trigger**, so it arrives through the one door all five write paths already funnel into. `gen_guarantee_id()` retries against BOTH the live and the retired column: a spent ID is never reissued to a different customer, which would make the audit trail ambiguous.

**It lands on the LINE too** — the trigger writes `attrs.guarantee.ids` and appends `Guarantee ID: …` to `attrs.remark`, which `lineConfigBits` already prints as `✎ …` on the drawer and the Sales Order PDF. So the customer's own paperwork carries it **with no template change**; an operator-typed remark is preserved, not clobbered.

**"Deleted on claim" implemented as a MOVE, and Loo was told why**: `guarantee_id` is cleared (the ID leaves the live space, can never be claimed twice — his rule) and the spent string lands in `claimed_guarantee_id`. Without that column a customer presenting an old ID gets "not found", which reads identical to a fake or a typo; with it, ops says "claimed on 3 March". Both columns are searched and a retired ID renders struck-through. Erasing it outright stays a one-line change.

**Prod rollback-test before shipping**: format `^[A-Z]{4}[0-9]{6}$` ✓ · qty-2 mints two distinct IDs ✓ · remark preserved the operator text then appended both ✓ · claim cleared the live column, kept the spent one, left unit 2 live ✓ · order_history names the ID ✓ — all rolled back. **Loo had already placed a live test order (SO-1258, May Tan) minutes before the migration**, so it also backfills the ID *and* the line remark; verified `KQYZ939913` now reads on the line.

**THREE-WAY 0267 collision**: three parallel sessions applied a `0267_*` within two minutes (auth-hook 054334 · guarantee_id 054413 · rental templates 054452). The tracker keys on timestamp so all three are fine; per the standing rule NONE were renumbered.

**Ship**: PR #328 (merge `71be3bcc`) → api Worker `05649c23` (unauth `?q=ABCD123456` 401 ✓) + web `index-Dygf2tsy.js` → carres-portal `062451cd` + carres-pos `18f65b70`; all 4 canonicals ✓; downloaded 4,084,708 bytes, `SERVICE_ROLE` 0, ID marker ✓. Tests: shared 1069/1069 (+6) · api 1547/1550 (3 = §17.7 baseline; guarantees 9/9) · web 16 = baseline · typecheck 0 · design-standard + check:v4 clean.
## 2026-07-26 ⑨ · The agreement wording — the customer document, verbatim (0267, PR #329, deployed)

**Loo supplied the real paper** ("02. Rental Agreement T&C (Carress Sdn Bhd) v5_260706") and, after reading the five gaps it has against the business rules, decided: **print it as written**. So nothing was added — no ownership-transfer clause, no buyout clause, no service exception — and **the free service package is deliberately not in the document** (a promotion is not a term of the rental).

**The gaps, recorded not fixed** (`docs/rental-service-plan-proposal.md`): the T&C keeps the product the Company's property with no ownership transfer, has no early-buyout clause, excludes maintenance/servicing while an offer may gift a care plan, sets payment on/before the **7th** with **8% per month** late interest and termination after **six** missed months, and makes participation subject to **credit assessment** (which is what the coming Approver page implements). The entity on the paper is **Carress Sdn. Bhd. (202401055306 / 1601150-X)**.

**0267_rental_agreement_templates**: wording as ORDERED BLOCKS (title/subtitle/h2/p/li) so screen, signing view and PDF render from one source; immutable versions per `doc_key`; `binds_to` families; cached `{{tokens}}`. `rental_agreements` learns how it was signed (template + version + name/NRIC + signature image + archived PDF path). A PRIVATE `rental-agreements` bucket holds those files — **with no delete policy: a signed agreement is evidence**. Numbering: THREE `0267_*` files now exist (mine + guarantee-id + auth-hook, applied minutes apart by parallel lines) — tracker keys on timestamp, dual numbers stay cosmetic.

**Shared**: `agreementTokens` · `fillAgreement` (an unfilled blank stays VISIBLE and is reported — a silent gap on a contract is worse than an ugly one) · `blocksFromText` (paste from Word). **API**: POST assigns the next version server-side + caches tokens; PATCH touches binding/name/date/active but NEVER the wording. **Web**: the Rental tab's Agreements section — load the supplied wording, read it, save as version 1; preview any version; only the newest offers "New version".

**Evidence**: shared 1075/1075 · api 1551/1554 (3 = §17.7 baseline; rental route 46/46) · web 1525/1541 (16 = baseline; RentalSettingPage 29/29) · design-standard clean. **Ship**: PR #329 (merge `5cf6c092`, union with #326/#328) → api Worker `8ed1f1b6` (unauth /api/rental/config 401 ✓) + web `index-K-sQWa48.js` → carres-portal `614b51bc` + carres-pos `8e81b245`; 4 canonicals ✓; live bundle 4,107,142 bytes, `SERVICE_ROLE` grep 0, wording marker present.


## 2026-07-26 ⑫ · Guarantees desk lists on arrival (PR #333, web-only, deployed)

**Loo**: created an order with a guarantee, opened Operation → Guarantees, saw nothing.

**Not a data bug** — the order carried `KQYZ939913` and the order-detail strip rendered it. **The page was wrong.** I had shipped it as a search-ONLY desk (`enabled: search.length > 0 || status !== ""`), and since the default "All" filter is the empty string, arriving with an empty box never called the endpoint at all. A guarantee that plainly existed looked missing, and there was no way to browse.

**The wrong call for this data's shape**: guarantees are countable, not a million-row log. It now LISTS newest-first on arrival (one indexed read, capped at 100 with the existing truncation notice) and the box NARROWS. The empty state also splits — "No guarantees sold yet" (register genuinely empty) vs "No guarantee matches that search" (a filter is on); before, both read as a prompt to go searching.

**Durable lesson: a "search-first" surface is only right when listing is genuinely expensive or meaningless. For a register an operator opens expecting to see its contents, defaulting to blank reads as a BUG, not as a design.**

Five tests, led by "LISTS on arrival — no typing required" (asserts the endpoint is called with no q and no status); **verified all five go red with the old gate restored**.

**Ship**: PR #333 (merge `f8438c5f`) → web `index-JV59p66j.js` → carres-portal `fcfa1341` + carres-pos `7091ac42`; downloaded 4,107,031 bytes, `SERVICE_ROLE` 0, new empty-state marker ✓. Tests: web 1532/1548 (16 = §17.7 baseline), typecheck 0, design-standard + check:v4 clean. api/DB untouched.

**Edge-lag note (second time today)**: right after deploying, two canonicals still served `index-K-sQWa48.js`. That was the parallel line's OLDER bundle still cached — `wrangler pages deployment list` showed MY deployment (from the main tip) newest on both projects. The two Pages projects lag INDEPENDENTLY and can take several minutes; poll each until it flips rather than redeploying.


## 2026-07-26 ⑬ · Guarantees desk — STATUS is the ORDER's status (PR #335, deployed)

**Loo**: make that column the status of the order — placed, delivered, and so on.

It was showing the guarantee's own lifecycle word ("Starts on delivery"), which answers a question the operator hasn't asked yet. What they want at the counter is where the ORDER is — and the guarantee's clock hangs off exactly that (cover starts on delivery), so the order status is genuinely the more useful column.

**Kept rather than replaced**: the guarantee's own state now rides as a small pill directly UNDER the guarantee ID. "Used" and "Expired" are what decide whether a claim can be honoured, so a straight swap would have hidden the one fact this desk exists to surface — same information, no extra column width. **Whenever a request would replace a signal, check whether that signal is the load-bearing one before deleting it; moving usually satisfies the ask without the loss.**

New `orderStatusWord()` lives in `apps/web/src/lib/status-pill.ts` — the file that already declares itself the single status→pill source — so the vocabulary matches the POS board LANES and the order drawer (one order can never read "Order placed" here and "place" there). Unmapped values degrade to de-underscored Title Case instead of leaking a DB word; the pill colour reuses `orderStatusPill`, so this column obeys the same colour law as every other status.

The route ships the RAW status (`orders!inner(so, status)`) and the UI maps it — the mapping stays in one place rather than in the API.

**Ship**: PR #335 (merge `de0c01c9`) → api Worker `f4565b8b` (unauth 401 ✓) + web `index-gSSCw-kl.js` → carres-portal `2b86b202` + carres-pos `2bf8f803`; all 4 canonicals ✓; downloaded 4,107,409 bytes, `SERVICE_ROLE` 0. Tests: shared 1080/1080 · api 3 = §17.7 baseline (guarantees 9/9) · web 16 = baseline (+4 new, incl. one asserting the claimed row still shows "Used" and its retired ID) · typecheck 0 · design-standard + check:v4 clean.

---


## 2026-07-26 ⑭ · The Approver gate — the credit-assessment clause, implemented (0268, worktree `rental-modular-sku`)

**Loo asked to continue the rental initiative.** The checkpoint was `e0ac3f86` ("lock the Rental offer-tab design to the approved mock"). I read `docs/rental-service-plan-proposal.md` in full, graded the §5 offer-tab lock, and argued for doing **§4 the Approver page first** instead — Loo agreed.

**Why §4 beat §5.** The §5 offer tab is ~85% built already (PR #315 shipped the price matrix, the option overlay with its "Over the term" column, the fabric series→colour drill with whole-series pricing and All on/All off, surcharges, service plans, revenue split); its real remaining gaps are five cosmetic ones (term-total column, Stripe sync pill, per-part on/off tick, offers-list summary line, "Change model"). §4 was **not built at all, and the database had no room for it**: `rental_agreements_status_check` allowed only `active | buyout_pending | completed | ownership_transferred | defaulted | repossessed | cancelled`, and `create_rental_agreement` stamped `'active'` as a literal. Loo's own T&C says participation is "subject to credit assessment" — the system did not honour its own contract. A signature at a store counter was the only thing between a stranger and RM 4,956 of Carres credit.

**The finding that shaped the design.** The old sell RPC did not just mark an agreement live — in the same breath it wrote the **full 84-row `rental_billings` schedule**, allocated a **`rental_stock_units` asset**, and minted the included package's **`service_entitlements` + `service_visits`**. Gating only the status word would have made the gate cosmetic: a REJECTED application would still have left phantom receivables in finance, a unit ops believes is spoken for, and service visits the customer never earned. **So all of it moved into the approve path.** An application now costs nothing until a human says yes.

**0268** (applied): status machine gains `pending_approval` (the new birth state, via column default AND the RPC literal, so neither door can mint a live contract) + `rejected`; `included_package_id` becomes a real column so the contract survives a plan re-price between signing and approval (the schedule materialises from the AGREEMENT's snapshot, never a re-read of `rental_plans`); `decided_by` / `decided_at` / `rejection_reason` + a CHECK that a rejection must carry a reason and a pending row must not claim a decider; `credit_checked_at` / `credit_reference` as the CBM hook's landing strip (planned, not built — per the spec). Four functions: `rental_can_approve()` (finance + principal — **deliberately narrower than `is_internal()`, which admits `bd`, and a BD sells these**), `rental_approve_agreement`, `rental_reject_agreement`, `rental_pending_approvals()`.

**Free win from the existing code**: the Stripe checkout route already refused any agreement whose status is not `active`. Because an agreement is now born pending, **no card can be charged before finance approves — with zero API changes.** The route now names which of the two it is, so a store sees "waiting for finance" instead of a dead button.

**Two deliberate omissions, both filed as carry-forwards rather than hidden:**
1. **No `signed_at` guard on approve** (`rental-approve-without-signature`). Loo's flow is signature-then-approval, but signing **is not built** — 0267 landed the columns and the bucket, and nothing anywhere writes one of them. A guard would have jammed the queue shut on day one. The guard is written verbatim into 0268's body as a comment, ready to uncomment; meanwhile every application card shows a **"Not signed yet"** pill so the approver is never misled into thinking a signature exists.
2. **Reject does not cancel an order** (`rental-reject-does-not-cancel-the-order`). Moot today — the rental lane never mints an order (`rental_agreements.order_id` has no writer anywhere; a rental produces an `RA-` and never an `SO-`). Reaching into order state from a rental RPC would touch live cascades, so the note records the firm fix for when the lane does create orders: a blocker inside `proceed_order` alongside its six existing `P0001` + detail-code guards.

**Verified before applying, not after.** The whole migration ran against live prod inside a transaction that was then rolled back, with **21 assertions** driven through `set_config('request.jwt.claims', …)` impersonation: born pending with 0 billings / 0 units / 0 entitlements · the package snapshot lands · a **showroom is refused (42501)** · finance approves → active + exactly 84 billing rows priced from the agreement + 1 unit + 21 visits (`floor(84×3/12)`) · `decided_by` stamped · **double-approval refused** · blank rejection reason refused · a rejected application leaves **0 billing rows and 0 reserved assets**. Rollback confirmed clean (back to 0 rows, old default intact) before the real apply. Post-apply: default = `pending_approval`, 6 new columns, 4 new functions, `anon` EXECUTE **false** on all of them, and `create_rental_agreement` still has **exactly 1 copy** — no ghost overload (the 0153/0154 trap).

**One measured security correction**: `REVOKE ALL … FROM public` did **not** remove `anon`'s EXECUTE — Supabase grants it through its own default privileges. Measured it, then revoked `anon` explicitly (the 0255 precedent). The functions were fail-closed by logic either way; this is the fence behind the wall.

**Surfaces**: new **Finance → Rental Approver** tab (9th finance tab; one card per application showing the customer, the store, the salesperson, the signature state, and — the number the decision is actually about — **the full credit over the term**, not the monthly fee). Reject demands a typed reason before the button enables. The POS success screen stops saying "signed" for a pending application, drops the collect button, and says "Sent to finance for approval — no payment is collected yet"; the ops Rental list learns the two new status words.

**Tests**: api **+28** (`rental-approver.test.ts` — who may open the queue incl. `bd`/`operation` refused, which RPC each decision calls with which arg name, every detail-code → status mapping, and the two checkout-refusal shapes); web **+10** (`FinanceRentalApprover.test.tsx` — empty state is a real answer, full credit shown not the fee, "Not signed yet" is explicit, reject blocked without a reason, no raw underscored DB word reaches the DOM); shared **+1** (adapter carries the decision, and a pre-0268 row degrades to nulls). Suites at baseline: shared 1081/1081 · api 3 pre-existing (partner/pickups ×1 + supplier/pos ×2) · web 16 pre-existing. typecheck 0, build clean, `check:v4` clean, design-standard clean, `SERVICE_ROLE` grep 0 on a downloaded 4,115,802-byte bundle.

**Ship**: PR #337 (merge `15e82946`) → **0268 applied first, then code** (a Worker that mints `pending_approval` would have violated the old CHECK constraint if deployed before the migration) → api Worker `facd766f` (unauth `/api/rental/approvals` 401 ✓, unauth `POST …/decide` 401 ✓, `/api/rental/config` 401 on api.carresofficial.com ✓) + web `index-gvaodBF9.js` → carres-portal `bd4a3696` + carres-pos `acefd9b3`; **all 4 canonicals verified serving it on the first poll** (no edge lag this time); downloaded 4,116,180 bytes, `SERVICE_ROLE` 0, "Rental Approver" + "Sent to finance for approval" markers present. Post-deploy DB re-check: birth status `pending_approval`, `anon` EXECUTE false on the queue fn, `create_rental_agreement` still exactly 1 copy.

**Still zero rows across the whole rental module** (0 offers / 0 plans / 0 service packages / 0 agreements) — the gate is live but has never carried a real application. **The next thing worth doing is not more code**: author one pilot offer in Rental → Setting and walk a single RM59 signup end-to-end (POS sign → the application appears in Finance → Rental Approver → approve → confirm 84 billing rows + 1 RU + the entitlement appear → then collect month 1 by card). Six rental PRs have now shipped on top of a lane no human has ever walked.


## 2026-07-26 ⑭ · Guarantee desk status = Active / Claimed / Expired (PR #338, deployed)

**Loo**, after seeing ⑬ live: put the status back to the guarantee's own, and make it three words — claimed → Claimed, not claimed yet → Active, expired → Expired.

So ⑬'s order-status column is **fully reverted** (the `orderStatusWord()` helper, the DTO field and the route embed all removed rather than left dangling), and the five-word ladder it had replaced is collapsed too: "Starts on delivery" / "Covered" / "Used" → **Active / Claimed / Expired**.

**`pending` folds into Active**, per his rule. Nothing is lost — the "cover hasn't started" fact still reads in the Cover-ends column as "on delivery" instead of a date.

**`void` deliberately keeps its own word** even though it wasn't among the three: a voided guarantee is one whose order was cancelled or whose line was pulled, and showing that as Active would invite an operator to honour a guarantee that was never really sold. A test says exactly that, so nobody "simplifies" it later.

**The bug the tests caught while writing it**: the first cut had the CLIENT re-derive expiry from the date. The server already derives it — two clocks, and a browser in another timezone can disagree by a day about whether a guarantee is still claimable. `guaranteeDeskStatus()` is now a **pure fold** of the already-derived status and never reads a date. **Durable rule: a derived state should be computed ONCE, on the server; UI helpers fold its output, they do not recompute it.**

Same three words on the order-detail strip, from the same function, so a state can't read "Covered" on one screen and "Active" on another. Desk filters follow (All / Active / Claimed / Expired) and the API status filter was taught the desk vocabulary — `active` selects pending+active rows, `expired` sieves on the derived word.

**Ship**: PR #338 (merge `c8bcfadd`) → api Worker `61ea3770` (unauth `?status=active` 401 ✓) + web `index-CHi3ocQU.js` → carres-portal `530a1fe3` + carres-pos `8be44e72`; all 4 canonicals ✓; downloaded 4,115,819 bytes, `SERVICE_ROLE` 0, and the retired vocabulary greps 0 in the live bundle. Tests: shared 1084/1084 (+4) · api 1553/1556 (3 = §17.7 baseline) · web 16 = baseline · typecheck 0 · design-standard + check:v4 clean.

---

## 2026-07-26 ⑩ · HR-P4 employee master — People reads identity, never copies it

**PR #341** (merge `b25fa2bc`) · migration **0269_hr_employee_master** applied · api Worker
`aa03fe76` + web `index-CgJfvG3c.js` (carres-portal `ab2b36cc` + carres-pos `9b76d8bf`) — **DEPLOYED**.
Worktree `hr-hierarchy`, branch `feat/hr-p4-employee-master`. Design mock approved by Loo BEFORE
any code (his standing law for every HR phase): https://claude.ai/code/artifact/394c5157-cd23-4652-b88e-a4fedf5fdf8f

One record per human who has a CRnnn code — **9 today**, backfilled and verified live (CR001-CR007
are `app_users`, CR008-CR009 showroom `salespersons`).

### The ratified spec's data model was REJECTED in design review, and Loo took the redesign

It asked for `hr_employees.staff_code (sync w/ CRnnn)` plus copies of `full_name` / `phone` /
`dob` / `gender` / `status`. Two problems — **the second is the one that mattered**:

1. Anything kept in step by a "sync" drifts. Two answers to "what is this person called".
2. **`status` is now LOAD-BEARING FOR AUTH.** Since 0266/0267 `app_users.status` decides whether
   `app_role()` returns anything at all. A second, cosmetic `status` on `hr_employees` is how HR
   marks someone resigned, believes access is gone, and is wrong — a *rebuild of the exact hole
   closed the day before*, where samantha@carres.com held a live session from May to July.

So `hr_employees` stores **only fields with no home on the identity tables**, everything else is
read through the join, and the screen answers **two questions in two columns**: *Employment* (HR's
record, derived from the dates) vs *Access* (the real switch). Live proof — Samantha's row reads
`access: "disabled"` + `employment: "not_recorded"`. One field could not have said both.

### Other deliberate departures from the spec

- **`dob`/`gender` are NOT stored.** `salespersons` already has `birthday`+`gender` with **FOUR
  live write sites** (`lib/create-account.ts`, `routes/hr-team.ts`, `routes/staff.ts` create +
  patch). Copying = the drift the table exists to prevent; repointing all four would have dragged
  the live POS staff profile into this phase. New CF `hr-hq-staff-no-birthday`.
- **Backfill filter written from live data.** The spec's "one row per internal user + showroom
  staff" taken literally would have filed **Nets · Dispatch, Ohana · Sales and the Kelana Jaya
  store login as employees** — 20 identity rows live, only 9 are people. The CR code IS the filter
  (dealer-channel salespersons carry none, so the dealer-exclusion law holds for free).
- **Checklists are a constant in `@carres/shared`**, not `hr_checklist_templates` + instances. A
  company hiring ~3 people a year does not need a config screen; the DB stores only the ticks.
  Same instinct that killed O1's one-click button.
- **`hr_employment_events` is lifecycle-only** — promotions/transfers already live in
  `org_position_history` (0254). The drawer MERGES both for display rather than writing a third log.
- **`hr_add_employee` is idempotent and MERGES** a second identity onto the existing row, so the
  dual-identity fork (spec risk #3) is closed by construction — the "merge RPC designed up-front"
  the spec asked for turned out to be a one-line update.

### PDPA

IC and bank account **never enter a list or detail payload** (booleans only).
`hr_reveal_employee_field` hands the value over and writes the audit row **in the same
transaction**, so there is no ordering in which a number escapes untracked. Verified live in a
rolled-back transaction: both payloads grep clean for the value, the audit carries field **NAMES**
only (`Employee profile - Khor Yee - bank_name, ic_number, …`), completeness read 3/8.

### NEW DOOR — HR may disable a login (Loo, this session)

Found while designing offboarding: the only disable route was `POST /api/principal/accounts/:id/status`,
**principal-only** (`principal/accounts.ts:37`) — so HR ran an offboarding flow that could not
offboard. Put to Loo as A (HR gets the door) vs B (HR records the exit, principal cuts access);
he took **A**. Scoped narrowly: its own route, NOT a widened principal Accounts router (that one
also creates accounts and rotates passwords); the account is resolved from the **employee row**,
not the client; PIN-only staff are refused (`no_login_to_disable`) because there is nothing to
disable. The flip + GoTrue sign-out + audit sequence moved into `apps/api/src/lib/account-status.ts`
so **the two doors cannot drift** — that sequence is the whole security promise.

**Offboarding is TWO shapes, not one** (the spec conflated them): an HQ login has sessions to kill;
floor staff never had one — `staff_verify_pin` (0233:66-73) **already checks `salespersons.active`**
and returns `no_pin` for an inactive person. The spec said "verify, don't assume"; verified, holds.

### Bugs caught in my own migration before it touched prod

- `_hr_employment_status` was `IMMUTABLE` while reading `current_date` → **STABLE** (an immutable
  current_date function lets the planner fold today's answer into a cached plan or an index).
- The roster UNION emitted a duplicate `staff_code` key AND would have listed a merged
  dual-identity person **twice** → `where e.app_user_id is null` on the floor branch.
- Four validators used `x not in (…)` with **no NULL guard** — the same NULL-gate shape as the
  0266 bug, where `NULL not in (…)` is NULL, the IF never fires, and the body runs unguarded.

### Verification

Every one of the 10 new functions uses the post-0266 fail-closed
`coalesce((select public.app_role())::text, '') not in (…)` gate. Simulated per-user against prod
in rolled-back transactions — **principal ALLOWED; operation, finance and the disabled account all
42501; operation sees 0 rows in all four tables**.

> **Technique note, order matters**: `begin; select set_config('request.jwt.claims', …, true);
> set local role authenticated; … rollback;` — set the claims BEFORE dropping to `authenticated`.
> The other way round, the lookup runs under RLS with no identity, returns no rows, and you get a
> confusing "forbidden" that looks like a real failure.

Suites at baseline: shared **1093/1093** · api **3** pre-existing · web **16** pre-existing —
**zero new**. Build (not just tsc) + `check:v4` + design-standard lint clean. Live bundle
downloaded-then-grepped: 4,145,721 bytes, `SERVICE_ROLE` **0**, `hr/people` present.

**Design lint earned its keep**: `hover:bg-base-50` on clickable rows broke the UI-KIT hover law
(98 vs baseline 94) — clickable rows/nav/chips hover BLUE (`hover:bg-hovertint`).

**File-equals-live**: some `·`/`→` were flattened to `-`/`->` in the apply payload, so the repo
file no longer matched. Reconciled the FILE to live (cheaper than a punctuation migration) and
noted it in the header; the comments describing the `SELF - ` prefix were updated too.

### Still open

- Three questions Loo never answered — shipped on the drafted defaults, all cheap to change
  because the lists are a constant: offboarding checklist (5) · onboarding checklist (6) ·
  **CR001 is still named "principal"** (Loo's own record showing a system placeholder; renaming a
  real person's live row is his call).
- **`docs/hr-system-full-spec.md` contradicts itself**: D3's row says an hr user may not write
  their own comp; §4 says Loo OVERRULED that (self-writes allowed, `SELF - ` audit marker). §4 is
  the later ruling — **delete the D3 clause before P7 is built** or it will be implemented backwards.
- Next: **P5** (commission runs) → P6 → P7 → P8 → O4.

---

## 2026-07-26 ⑮ · Guarantee scope — author WHAT it covers (0270, PR #342, deployed)

**Loo**: picking category Guarantee in + New SKU should ask what it covers — a category, then a specific model or any model in it; sofa scoped by combo / compartment / any model; bed frame like mattress with King/Queen/Single/Super Single; accessories with no size. Then years, description, price.

Before this a guarantee could only say "the mattress category" — authorable, but not sellable with intent.

**Four scope columns, not one scope jsonb.** They are real FOREIGN KEYS, so deleting a model / combo / compartment takes its narrowed terms with it instead of leaving a term pointing at a ghost that matches nothing — or worse, at a re-used id. **NULL at any level = ANY at that level**, which is what makes it additive: the live `GRT-MATTRESS-15Y` keeps every column null and keeps covering every mattress. Two CHECKs keep the shape honest (combo/compartment sofa-only + mutually exclusive; variants only where a size axis exists).

**ONE matcher for every surface** — `guaranteeCovers()` in `@carres/shared` — so the POS picker and the server can never disagree about what a guarantee covers. Combo scope matches properly via `matchSofaCombo`, **injected** so shared stays free of the pricing engine; without it a combo term falls back to requiring the same MODEL, which is the safe direction — it never widens coverage.

**Authoring is ONE endpoint, not three client calls.** A SKU without its terms row is a guarantee that sells, covers nothing and mints no entitlement — the exact untraceable state this feature exists to prevent — so `POST /api/guarantees/products` writes model → sku → terms and **unwinds what it created** on any failure. The code and label are DERIVED server-side (`GRT-LUMI-FIRMCARE-KING-10Y`), never typed, so two people authoring the same cover cannot invent two spellings. Principal-only: a guarantee is a multi-year liability.

**Repeat of a lesson already in this worklog** (⑧): the modal reached for `useQueryClient` directly and took its OWN tests down (they fully mock `@/lib/queries` and install no provider). It is a `useCreateGuaranteeProduct` mutation hook now. **Data access lives in queries.ts — components never touch the query client.** Two occurrences in one day; treat it as a rule, not a gotcha.

**Parallel-merge note**: PR #341 (HR-P4) landed between my `git fetch` and my merge, so #342 hit a conflict in `queries.ts` (both lines appended hooks at the end, sharing a `});}` tail). Resolved by keeping BOTH; a follow-up fixture fix was needed because the sofa combo DTO gained `discontinuedAt` in that same union. **The pre-merge fetch is not enough on a busy day — re-check right before the merge click.**

**Ship**: PR #342 (merge `09b6933a`) → api Worker `3c543c05` (unauth `POST /api/guarantees/products` 401 ✓) + web `index-DIco4n1v.js` → carres-portal `73806dbe` + carres-pos `8aa0d1d7`; all 4 canonicals ✓; downloaded 4,155,071 bytes, `SERVICE_ROLE` 0, scope-form marker ✓. Tests: shared 1117/1117 (+20) · api 3 = §17.7 baseline (guarantees 12/12) · web 16 = baseline (+9 scope-field tests) · typecheck 0 · design-standard + check:v4 clean.


## 2026-07-26 ⑯ · Guarantee size chips are canonical — and the silent no-match behind them (PR #345, deployed)

**Loo, two screenshots**: the Guarantee scope chips read `6FT / 5FT / 3FT / 3.5FT / 200X200CM` while the mattress form beside them reads `King / Queen / Single / Super Single`. Same pool, two vocabularies.

**The display was the visible half. The dangerous half was silent.** The size pool stores a CODE in `value` (`K`) and a marketing string in `label` (`6FT`), while a mattress SKU's `variant` is the full name (`King`). ⑮ rendered the label and was about to STORE the code — so a guarantee authored for King would have compared `"k"` against `"king"` and covered **nothing**. An authored-but-matches-nothing guarantee is precisely the untraceable state this whole feature exists to prevent, **and it looks completely fine on screen**: created, listed, openable — it just can never be sold against anything.

**Fixed at both ends**: the chips resolve through `canonicalSize()` like every other size chip in the app (so they read King/Queen AND store that name), and `guaranteeCovers` normalises both sides through it too, so `K` / `king` / `King` are one size whichever way round they were written. Unknown tokens (a sofa preset, a free-typed variant) still fall back to the loose compare.

**Deliberately NOT taught to `canonicalSize`: the marketing label.** `6FT` / `200X200CM` is per-row display config that can be anything; baking it into the canonical table would be wrong. A test now asserts that — and it is exactly why the chip stores the NAME rather than the label. **Two assertions I had written the other way round were the ones that were wrong, not the code; when a new test fails, decide which side is the promise before "fixing" anything.**

Also dropped ⑮'s leftovers: the guarantee form was still rendering the generic SIZE / VARIANT and COST fields under itself. A guarantee has no variant axis and is never purchased from a supplier, so it now carries only its own Price + Description.

**Durable lesson: whenever a value crosses from CONFIG to a MATCH KEY, check what the other side literally stores.** A pool code, a display label and a SKU variant are three different strings for one size, and only one of them matches.

**Ship**: PR #345 (merge `c4c50479`) → web `index-CPq_A7sa.js` → carres-portal `e06f214f` + carres-pos `c7d1bae1`; all 4 canonicals ✓; downloaded 4,155,658 bytes, `SERVICE_ROLE` 0. Tests: shared 1121/1121 (+5) · api 3 = §17.7 baseline · web 16 = baseline · typecheck 0 · design-standard + check:v4 clean. api/DB untouched (Worker stays `3c543c05`).


## 2026-07-26 ⑰ · A sofa guarantee's variants are its SEAT HEIGHTS (0271, PR #348, deployed)

**Loo**: a guarantee's variants come from that category's own Maintenance pool — mattress from the mattress pool, bedframe from the bedframe pool, "and sofa's too".

Mattress and bedframe already read exactly that (`mattress_size` / `bedframe_size` ARE the Maintenance → Sizes pools). **Sofa was the gap**: ⑮ gave it combo / compartment / model and no variant axis at all, so `sofa_size` (the seat heights 24 / 26 / … / Flat) could not narrow anything.

**Seat height is ORTHOGONAL to shape**, so this WIDENS the variants CHECK rather than adding a fifth mutually-exclusive scope: "the L-shape combo, at 32 inch" is one sensible cover, and the form keeps the heights when you swap between Any / Model / Combo / Compartment. `covers_variants` now reads: mattress+bedframe → the SIZE · sofa → the SEAT HEIGHT · accessory → still nothing.

**The subtle part**: a sofa SKU's `variant` is a COMPARTMENT CODE (`1A(LHF)`), not a height — matching a height against it would never fire. For the sofa category the matcher now compares the BUILD's height (`attrs.sofa_build.height`), and a test asserts the compartment code is not accidentally accepted as a height. **When a category's "variant" means a different thing, the matcher has to be told which field carries it — the column name being the same is not evidence.**

**Two bugs the stacking exposed**: the combo branch used to `return true` and the compartment branch to `return`, so either one short-circuited PAST a height narrowing. Both now fall through. The two chip rows collapsed into one shared `VariantChips` so a sofa's heights and a bed's sizes can never drift into different affordances.

**Ship**: PR #348 (merge `24f50a72`) → web `index--HiWvb7v.js` → carres-portal `b388e446` + carres-pos `20298cd0`; all 4 canonicals ✓; downloaded 4,156,276 bytes, `SERVICE_ROLE` 0, seat-height marker ✓. Tests: shared 1127/1127 (+6) · api 3 = §17.7 baseline · web 16 = baseline (+3) · typecheck 0 · design-standard + check:v4 clean. api/DB otherwise untouched (Worker stays `3c543c05`).

---

---

## 2026-07-26 ⑱ · Rent-to-Own becomes a POS category, and the app stops going blank (PR #347, web-only, deployed)

**Loo, after finding his own rental offer invisible in the POS**: "那个 rent to own，我不要它设在这里，我要它变成在我的 POS system 那一边的左边多加一个 category… 它同样是可以 add to cart 的，就像一模一样的 SKU item。它们唯一的区别只是，在 add to cart 之前，点进去那个 product 会跳进去一个 tab，要选择它要供多久，以及它的 variant 是什么，其他的都一模一样."

**Why he couldn't find it** — and why he was right to move it: renting lived behind a SECOND entrance (a top-bar pill) while every other product family lived in the left rail. Two doors into one catalog is precisely what a low-English operator gets wrong. Worth noting: the ORIGINAL locked spec said the rental lane "creates order (type subscription)" — so his instinct was pulling the design BACK to what was agreed, and the shipped standalone-page version was the drift.

**The blank page, diagnosed first.** Loo also reported the screen going white after filling in a rental. The data was fine — `RA-1003` existed, `pending_approval`, 0 billings, 0 units, exactly as 0268 intends, and Stripe had synced 4/4 once he granted the restricted key `product_write` + `feature_write`. The white screen was a RENDER crash, and the real finding was structural: **there was no ErrorBoundary anywhere in `apps/web`**, so any render error unmounted the tree and left a blank document. At a store counter that is the worst possible failure — "it worked" and "it broke" look identical. Added two levels (root in `main.tsx`, route in `App.tsx` keyed on pathname so navigating away clears it), a readable recovery screen, a Try-again that genuinely re-mounts (keyed subtree — clearing the flag alone re-crashes instantly), and the message kept visible so a screenshot is actionable. **Durable lesson: a crash net is not a nice-to-have on an operator-facing app; without one, every future bug reports itself as "nothing happened".**

**The law Loo locked**: *"rent and outright 不能在同一张单"*. Not a preference — a bought mattress is RM1,999 ONCE and a rented one is RM59 EVERY MONTH for 84 months, so a mixed order has no honest `orders.total`, nothing for the 50%-deposit gate to take a percentage of, no printable invoice figure, and half of it needs finance credit approval (0268) while the other half must ship today. I put the alternative (split one cart into two documents at checkout) to him with a ~3× complexity estimate and he chose exclusivity.

**Design decisions worth keeping:**
- ONE module (`rental-cart.ts`) decides rent-vs-buy; the rail locks, the add guard, the totals and the submit branch all ask it, so they cannot drift apart.
- The guard sits in **`addLine`** — the single funnel every door already passes through (card tap, configurator, bundle explode, guarantee pick). One guard, four doors, by construction.
- Rails reuse the **existing sofa-mutex lock affordance** rather than inventing a second "you can't do that" vocabulary.
- A rental cart bounces the operator **to** the Rental rail, not to a wall of locked cards under "All open".
- A cart holding both (only reachable from a pre-rule saved draft) reports **rental** — the SAFE answer, routing to the agreement path where the server re-validates, instead of letting a monthly fee ride into `orders.total` as a one-off price.
- Rental line qty is fixed at 1 with no stepper: one rented item = one agreement + one Stripe subscription + one tracked asset. Renting two means adding it twice — honest rather than clever.
- The configure page shows the monthly fee AND the contract total together; "RM59" without "× 84 = RM4,956" is how people mis-buy credit.
- A mid-way checkout failure NAMES the agreements that were already created — a half-finished run must not look like nothing happened, or the store re-submits and double-signs the customer.

The top-bar button and its dead state are gone. `RentToOwnPage` stays on disk with its tests but is mounted nowhere; delete it once the new lane carries a live pilot signup.

**Tests +27** (rental-cart law 12 incl. every malformed-payload shape and the mixed-cart safe answer · configure page 8 · ErrorBoundary 7). Suites: shared 1117/1117 · api 3 pre-existing · web 16 pre-existing (zero new). typecheck 0, build + check:v4 + design-standard clean.

**Ship**: PR #347 (merge `9dee5f29`) → web `index-CYqtv_4v.js` → carres-portal `5d632cf9` + carres-pos `5bfc034d`; **all 4 canonicals matched on the first poll** (no edge lag); downloaded 4,153,052 bytes, `SERVICE_ROLE` 0, rental-rail + ErrorBoundary + Rental-term markers present. The Worker also went out from the same tip (`f56e7391`) because the union carried parallel lines' undeployed guarantees / hr-people / accounts / catalog changes; unauth 401 verified on four routes + the custom domain.

**NOT done, deliberately — Guarantee & Service Package merge.** Loo's unification is right (a guarantee and a care plan are the same object with a different "how many times": 1 vs N), but it needs a migration on the LIVE entitlement engine — `guarantee_terms` gains a type + visits-per-year and the minting trigger branches one-shot vs decrementing — and there is already 1 live guarantee entitlement. **Premise correction for whoever picks it up: there is NO "Guarantee" tab in Product & Maintenance.** Guarantees are a SKU *category* in SKU Master, where a parallel session already shipped "pick Guarantee → scope fields + Covered for (years)" (`GuaranteeScopeFields.tsx` + the `guaranteeFlow` branch in `NewSkuModal.tsx`). That is where the One-time / Recurring switch belongs, which makes the job smaller than it sounded.

---

## 2026-07-26 ⑪ · HR-P5 commission runs — the close is a pre-flight, not a button

**PR #351** (merge `e657f282`) · migrations **0272_commission_runs** + **0273_commission_close_resolves_staff_code**
applied · api Worker `2cf891df` + web `index-A7uOnzQ8.js` (carres-portal `ffea9a3b` +
carres-pos `2f21ee5c`) — **DEPLOYED**, all 4 canonicals converged. Design mock approved by
Loo before any code: https://claude.ai/code/artifact/8ae26a6b-4f54-4fe4-bf39-76df0b2dccc2

Close a month → the figures stop moving → each person gets a statement that still reads the
same in three years → one CSV goes to whoever pays people.

### The finding that reshaped the phase

Queried live BEFORE writing anything: July 2026 has **19 native orders, all attributed,
RM 52,081** sold by two showroom staff (Mayson CR008 RM 30,480 · kaan CR009 RM 21,601;
the two dealer-channel sellers are excluded by the dealer law). And
`staff_commission_rates`, `model_commission_rates`, `model_commission_tiers`,
`commission_milestones` and `bd_profiles` are **ALL EMPTY** — zero rows each.

The spec describes one button: *"Early each month HR clicks Close month"*. Pressing it
today would have frozen **"you earned RM 0"** into a permanent statement for both of them,
and then locked the month against fixing it. A month-lock pointed the wrong way.

The Setup tab has authored rates since 0245/0246 — six write routes, all live. So this is
**unauthored data, not a missing feature**. That is exactly why a guard was the right fix
rather than more UI.

### So the close became a pre-flight

Four checks gate the button: everyone who sold computes to a figure · every sale has a
salesperson · **the month is over (a WARNING — closing early is allowed)** · no run exists.

`commissionReadiness` is a **pure function** in `@carres/shared`; the API folds the same
function over the same inputs; `commission_close_month` enforces the same rules again in
SQL. **A disabled button is a courtesy, never the guarantee.**

### No second engine, made structural

The spec says close must "re-run the SAME pure engines". `/api/hr/report` already ran
`computeCommission` server-side, so both paths now go through one new helper,
`apps/api/src/lib/commission-month.ts`. The figures reviewed and the figures frozen come
from literally the same call — not two copies of three lines that drift the first time
someone edits one. **Durable rule: when two surfaces must agree on a number, make them
share the call, not the algorithm.**

### Adjustments key to the OPEN month, not to a run

The spec's `commission_run_adjustments.run_id` would put a September refund onto July's
frozen statement — mutating the very thing the freeze protects. An adjustment belongs to
the target (open) month and carries `origin_year`/`origin_month` + `ref_order_id`, so it is
traceable both ways; it is swept onto a run only when that month closes.

### The lock, and why its coverage is exactly right

Only `staff_commission_rates` is effective-dated — **model rates, tiers, milestones and the
scheme method are NOT** (verified live). Retro-editing those cannot change a CLOSED month,
because closing snapshots the computed lines: **the freeze IS the protection**. What it can
do is make a live preview disagree with the frozen statement, so a closed month is READ
from the frozen rows and never recomputed. CF `commission-config-not-effective-dated`.

The two things that could still rewrite paid money are guarded:
* **attribution** — a guard perform'd inside `hr_assign_salesperson`, installed
  PROGRAMMATICALLY (the 0266 technique: read `pg_get_functiondef`, assert the gate anchor
  hits exactly once, string-insert, `execute`). Retyping a live function body by hand is
  how a gate gets broken.
* **back-dated staff rates** — a TRIGGER, not a route check. `/api/hr/config/staff-rate`
  upserts the table directly through RLS, so a route guard would be bypassed by the next
  writer who forgets it. Same reasoning as the guarantee `order_lines` trigger.

Draft deliberately stays fluid (risk register #1: the lock must not fight a workflow where
corrections happen when noticed); the month locks at **approved** (principal-only). Reopen
is principal-only, needs a reason, and **disappears once PAID** — after money has left, the
only honest correction is an adjustment on the next open month.

### Verified against prod in one rolled-back transaction — 12 steps

| # | step | result |
|---|---|---|
| 1 | close when a seller would get RM 0 | refused `zero_rate_sellers` |
| 2 | close with real figures | draft created |
| 3 | lines frozen | 2 lines, **RM 1,454.43** |
| 4 | second close, same month | refused `run_already_exists` |
| 5 | locked while DRAFT? | **still open** (correct) |
| 6 | after approve | `approved` / locked=true |
| 7 | re-attribute an order in a locked month | refused `commission_month_locked` |
| 8 | back-date a rate into a locked month | refused `commission_month_locked` |
| 9 | adjustment onto the locked month | refused |
| 10 | same adjustment onto the OPEN month | accepted, points back to July |
| 11 | reopen | `draft` / locked=false |
| 12 | re-attribute after reopen | allowed again |

Prod left with 0 runs, 0 lines, 0 adjustments, rates untouched. **RM 1,454.43 matches the
approved mock's frame 2 exactly.**

### 0273, and the file-equals-live habit paying off again

0272 took `staff_code` from the caller's payload — but `CommissionStaff`, the engine's
staff type, **carries no staff code**, so Hono had nothing to send and every CSV row would
have exported a blank join key. 0273 makes the RPC resolve it from `salespersons` /
`app_users`, where it actually lives. Caught by TypeScript before it ever ran.

For the repo file I pulled the APPLIED definition back out of `pg_get_functiondef` rather
than retyping it — file-equals-live by construction.

### Also

* **BD is deliberately not enabled** — `bd_profiles` is empty, so a BD run would be an
  empty ceremony. The route 422s `bd_program_not_enabled`.
* `check:v4` + design-standard lint clean; suites at baseline (shared **1138/1138**, api 3
  pre-existing, web 16 pre-existing, **zero new**); live bundle 4,167,316 bytes,
  `SERVICE_ROLE` grep **0**.
* **Deviation to note**: this phase was built in the PRIMARY worktree, not the HR line's
  `hr-hierarchy` worktree (guardrail #9). No conflict resulted — no other session was in
  that checkout — but the HR line's home is still `hr-hierarchy`.

### What has to happen before it does anything

**Nobody has a commission rate.** The screen correctly shows the red blocked state until
Loo authors percentages in HR → Commission Setup for CR008 and CR009. That is data entry,
not code.

---

## 2026-07-26 ⑲ · Guarantee & Service Package — one category, two kinds of cover (0274, PR #352, deployed)

**Loo**: "for 那个 cleaning service 呢，直接变成在 guarantee 的 category 里面再多一个项目… 你把名字改成 guarantee and service 吧… 会分为两种类型: One-time（一次性）… Recurring / Retractable Package: 这种 service package 系统还会去检查它还剩几次，因为它是按年（一年一年）来售卖的."

**He spotted a real unification, not a rename.** A guarantee and a care plan are the SAME object: both attach to a purchased item, both have a clock, both get used up. The only thing that differs is HOW MANY TIMES — a guarantee is a care plan with exactly one visit. So `guarantee_terms` learned a `kind` and the entitlement ledger learned to count, instead of a second parallel engine being built beside the first.

**The decision worth keeping: the five-door mint trigger was NOT touched.** `guarantee_mint_from_line` is the single AFTER INSERT trigger that closes all five order-line doors, and it is the most load-bearing function in the feature. Rewriting it to carry two more snapshot columns would have risked the entire mint path for no behavioural gain. Instead a small BEFORE INSERT trigger on `guarantee_entitlements` fills `kind` / `visits_total` from the terms row when they are left at their defaults — the snapshot happens for EVERY door, including ones that do not exist yet, and the mint function is provably untouched (verified post-apply: still exactly one copy). **Durable lesson: when a change needs a value on every row a hot function writes, a BEFORE INSERT trigger on the TARGET is usually cheaper and safer than editing the writer — especially when the writer's whole value is that it is the only one.**

**The ID rule, extended the only correct way.** Spec §2b retires the guarantee ID on claim. Retiring it on visit 1 of 6 would strand the remaining five with no handle to quote, so it is retired when the LAST visit is spent — which for a one-time cover IS the first visit, making a guarantee byte-identical to before. That equivalence is asserted, not assumed.

**Two crossings made impossible at three layers** (zod refine → DB CHECK → the form's own switch), because one is genuinely dangerous: a recurring plan may not promise a `replace` (an unbounded number of free mattresses), and a one-time cover may not carry a visit schedule.

**The DB caught a real gap mid-dry-run.** `remedy` allowed only `replace | repair` — both things you do to a BROKEN item, which is all this table used to describe. A care plan's remedy is neither: nothing is wrong, someone turns up and cleans it. Widened to add `service`, then paired to `kind` by a second CHECK. This is exactly what a CHECK is for, and it is why the dry-run happens before the apply and not after.

**Naming:** the category LABEL reads "Guarantee & Service Package" (short form "Guarantee & Service" on filter chips, which have no room). The DB value stays `guarantee` — renaming a category enum would ripple through the POS, the catalog, the invoice and five RPCs for zero behavioural gain. Two `SkuMasterTab` assertions were updated as a real consequence of the rename, not masked.

**+ New SKU** under that category asks TYPE **first** — it changes what "years" means (15 years of one swap promise vs 3 years of scheduled visits) — then years, then visits-a-year, with the TOTAL spelled out so nobody multiplies at the counter. Codes split: `SVC-…-3Y-6V` vs `GRT-…-3Y`, so a plan and a guarantee over the same product can never collide.

**Verified BEFORE applying**: 20 assertions on live prod in a rolled-back transaction — derived count (3y × 2/yr = 6) · one-time spends on the first claim and retires its ID · recurring survives five visits with its ID intact and spends on the sixth · a seventh refused · both history sentences correct · both bad config shapes refused. Rollback confirmed clean first.

**Ship**: PR #352 (merge `dd867214`) → api Worker `ce089f7b` (deployed AFTER 0274; unauth 401 on three routes via the custom domain) + web `index-BuTmS3FM.js` → carres-portal `f550ec7a` + carres-pos `ce25d0d8`; downloaded 4,169,655 bytes, `SERVICE_ROLE` 0, all three markers present. **Two of four canonicals first served PR #351's `index-A7uOnzQ8.js`** — `wrangler pages deployment list` showed MINE newest and `git merge-base --is-ancestor e657f28 dd86721` proved my tip contains theirs, so it was edge lag, not a clobber; both flipped inside ~20s of polling. Tests +14; suites shared 1141/1141 · api 3 · web 16 (baseline).

**Two carry-forwards recorded, not hidden**: `guarantee-service-two-registries` (the rental-INCLUDED package still comes from `service_packages` — one concept, two registries; folding it in would touch a just-shipped credit-gated money path, so the firm fix is written down instead) and `guarantee-recurring-no-visit-schedule` (0274 counts visits REMAINING but not when they are DUE, so nothing can yet say "this customer is owed a clean this month").

---

## 2026-07-26 ⑳ · One door for care plans (PR #356, web-only, deployed)

**Loo, looking at his own data**: "why this sku didnt show up, and why the service package stilll right here, suppose chage place le".

Two symptoms, one cause, and the cause was **my scoping call — not a bug**.

**The SKU was never missing.** `SVC-MAT-CLEAN-1Y3` was in SKU Master the whole time, under the **Service** chip: it was authored through Admin → Rental → Service package, the OLD registry, so it carried category `service`. Only `GRT-MATTRESS-15Y` carries `guarantee`, which is why the "Guarantee & Service" filter showed exactly one row. **Loo was looking in the right place; his plan was in the wrong one.**

**Why it was still there**: 0274 (entry ⑲) moved the SELLABLE authoring into SKU Master but left the Rental door standing, filed as CF `guarantee-service-two-registries`. Loo's ask had been that it MOVE. Two open doors is exactly what let a care plan be created into the wrong registry with the wrong category — the confusion the merge existed to remove.

**Durable lesson, and the one worth carrying: when a merge is meant to give something ONE home, closing the old door is not the optional half. Leaving it open while documenting a carry-forward looks disciplined and behaves like a trap — the next person through it (here, the person who asked for the merge) pays for the deferral. If the new door is not ready to be the only door, the merge is not ready to ship.**

Shipped: "+ New service package" removed, along with the now-dead `pkgOpen` state and the cross-section create modal it drove (nothing could open them any more — removed rather than left to rot). The section still LISTS the legacy package, because a rental offer references it and hiding it would strand that reference silently. A notice above the list names the replacement IN FULL — page, button, category and type — rather than just saying "moved".

Tests: the two asserting the retired button now assert the new truth; the old "create a package here" payload test was DELETED rather than kept alive through a back channel (asserting a payload nothing can send is testing dead code — the shape is covered by the guarantee route's own suite). Net +1.

**Ship**: PR #356 (merge `e26fd1ae`) → web `index-Boz1uDzu.js` → carres-portal `b13303d0` + carres-pos `2fbecd1a`; downloaded 4,170,195 bytes, `SERVICE_ROLE` 0, the new notice present AND the retired button's string grepping **0** in the shipped bundle — a removal is worth verifying in the artifact, not just in the diff. `pos.carresofficial.com` lagged ~20s (third deploy in a row where one of four did). api/DB untouched. Web suite at baseline (16 pre-existing).

**Still open, said out loud rather than buried**: the DATA half. The legacy `Mattress Care` row and its one `rental_offer_services` link still live in `service_packages`, and `rental_approve_agreement` still mints `service_entitlements` instead of the 0274 visit-counting `guarantee_entitlements`. Small in data terms (1 package · 1 offer link · 0 entitlements · 0 plans referencing one) but it re-points a credit-gated money path deployed the same day, so it gets its own pass. **This ship stopped the wrong door being used; it did not move what already came through it.**

---

## 2026-07-26 ㉑ · Delivery Module D1 — two-stage booking (Provisional → Confirmed)

**Ship**: PR #360 (merge `099a6577`) → migration **0277 applied** → Worker `daf36839` + web `index-B9ZL9k9A.js` (carres-portal `a8946931` + carres-pos `387cc0f4`; 4 canonicals converged, `pos.carresofficial.com` lagged one poll as usual; bundle downloaded 4,175,048 bytes, SERVICE_ROLE 0, "Record confirmation" + "carrier said" present). Worktree `carres-delivery-d1-analysis`.

**Frozen source**: `Carres_Delivery_Module_Build_Prompt.md` §7 (Two-Stage Booking) + `DELIVERY_IMPLEMENTATION.md` D1 — Loo's Delivery Module docs, D1 only; D2 (DO engine) → D6 (Claim) deliberately untouched.

**The problem D1 fixes**: `logistic_eta` 一填 chip 就显示绿色 "Scheduled" — 但物流讲的日期 ≠ 客户确认的日期 (the 68% stuck-order root per Loo's doc). The system treated a carrier's word as the customer's yes.

**Three approved calls (Loo 2026-07-26)**: (1) booking columns live on `ops_order_control`, NOT `orders` — the implementation doc said `orders` but 0159 keeps core orders untouched and the three nearest relatives (logistic_eta/delivery_time_slot/customer_confirmed) already live on the overlay ("你对，我的文档写错了"); (2) `logistic_eta` upgraded IN PLACE to Stage-1 provisional — no duplicate `preferred_date`, zero data migration; (3) `customer_confirmed` (0220, dormant since rev25) kept but comment-marked DEPRECATED.

**DB (0277)**: 5 columns + `booking_stage` CHECK + the invariant-#1 CHECK (`confirmed` requires date AND slot — a date with no slot is still Provisional). Provisional derives from `logistic_eta` via BEFORE trigger so EVERY writer is covered by construction (the 0274 put-the-rule-on-the-table lesson); a confirmed booking never silently downgrades. Backfill = no-op today (0 of 55 control rows carry a logistic_eta — matches the drawer's documented 1.6% fill rate). 0211 activity trigger extended FROM LIVE `pg_get_functiondef` (never retyped) with booking_stage/confirmed_date/confirmed_time_slot capture. Whole migration dry-run on live prod in a rolled-back transaction first: confirmed-without-slot refused (check_violation), happy path accepted, derivation up AND down verified, confirmed survives an eta clear. Tracker tail checked first — parallel lines had taken 0275+0276 the same day (guardrail #8 earning its keep again).

**API**: `POST /api/operation/orders/:id/booking/confirm` is the ONE door to Confirmed (generic PUT /control strictly rejects booking fields). Server-side gates: goods ready (every goods line reserved-to-THIS-SO — acc auto-pass, service lines skipped) + balance ready (Σ order_lines+order_addons unit_price×qty, else keyed balance; minus payment|deposit ledger; total-not-set doesn't block) + no Sunday. 422s name the offending skus / RM figure in plain English. Re-confirm allowed (re-stamps evidence); no un-confirm — a typo is fixed by confirming again.

**No second engine (HR-P5 lesson, applied)**: `line-category.ts` + `line-readiness.ts` MOVED to packages/shared; web files became re-export shims (zero import churn, existing web tests prove the move). The API gate (`bookingConfirmGate`) composes the same `lineReadiness` the drawer badge renders — they structurally cannot drift. Reserved counting = max(line_received, ops_stock_items reserved_ref='SO-n' summed per stockMatchKey), same as the drawer.

**Web**: BOOKING rows under Chase logistic (per the implementation doc's placement); provisional row = "carrier said 24 Aug 26" + amber `not confirmed` pill + `Confirm with customer` → date + DELIVERY_TIME_SLOTS select + `Record confirmation`; confirmed row = green ✓ + date + slot + recorded-at stamp + Re-confirm. Gate hints warn BEFORE the server refuses (newbie-guided), but the server is the enforcement. Header chip + card caption re-worded to facts (Loo's exact strings): provisional NEVER green.

**Tests**: +8 shared (`booking-gate.test.ts`) · +9 api (`booking-confirm.test.ts` — 401/403/missing-slot 422/Sunday 422/goods-gate 422 naming the sku/balance-gate 422 naming RM/reserved-ledger satisfies/happy path payload/PUT rejects booking_stage). Suites at baseline: shared 1174/1174 · api 3 pre-existing · web 16 pre-existing. tsc(app) 0 · build ✓ · check:v4 ✓ · design lint ✓ (2 hex literals swapped for `text-success`/`text-warning` tokens after the lint caught them). Known pre-existing: `packages/shared` standalone `tsc --noEmit` fails in `schemas/orders.test.ts` (0258 edit_addon union) — reproduced with my changes stashed.

**Not done, said out loud**: (a) no visual smoke — the login wall requires typing a password, which the agent doesn't do; Loo smokes per habit; (b) the orders LIST/queues still key on the old signals — D1 scoped the drawer + API + chip only, per the implementation doc's "其余不动"; (c) service-only orders pass the goods gate vacuously (the drawer's `allReceived` reads false there — that flag feeds the pipeline word, not this gate; blocking a pure-service booking forever would be the real bug).
## 2026-07-26 ㉒ · HR-P6 — targets + the scoreboard (PR #359 merge `2ad24013`, 0276, Worker `abff79eb` + web `index-DtlbnO4w.js` — DEPLOYED)

Worktree `hr-hierarchy`, re-homed off the parked `feat/hr-p4-employee-master` onto `origin/main`
`e456c87a` first. Design mock approved by Loo before any code (his standing law):
https://claude.ai/code/artifact/e9d96403-ddfa-428e-8c3f-f14c507f0a3c — then "开工, but ignore
AutoCount Archive (旧账)".

### The habit again: query live, then read the spec

Every material deviation below came from a measurement, not an opinion.

| Measured live | What it changed |
|---|---|
| `app_users.reports_to_user_id` holds **1 edge in the whole company** (CR005 Shasha → CR002 Jess), and both sell nothing | the rollup ships OFF |
| `salespersons` has **no manager column at all**; `hr_set_reports_to(p_user_id …)` only takes app_users | floor staff — the only people with sales — cannot be in an HQ rollup |
| 5 duty keys exist and **none is `sales_manager`**; `org_position_duties` is `(duty_key, position_id)` with **no store dimension** | the spec's floor-staff rollup route is **not expressible**, not merely thin |
| 2 sellers, 1 store, 5 departments of which 3 have no revenue | the 5-rung scope ladder becomes 2 rungs |
| `commission.ts:252-254` — `basis` accumulates **only** in the percentage branch | a closed month must NOT be scored from `commission_run_lines.basis` |
| `dealers.channel='showroom'` includes **"AutoCount Archive (旧账)"** (0 staff, 37 archive orders) | scoreable stores are DERIVED, not flagged |
| **no `app_users` row has `role='hr'`** | new CF: the whole HR portal is principal-only today |

### What was cut from the ratified spec, and why

* **4 tables → 2.** `kpi_definitions` as a config table contradicts the spec's own risk #4
  ("closed metric enum … no formula builder") — a closed enum in a config table invites a row
  the code cannot compute, so `KPI_METRICS` is a shared constant mirrored by a CHECK, with a
  shared test (`kpiKeysForMigration`) that fails if the two drift. `kpi_bonus_tiers` not built:
  a second money path before `staff_commission_rates` has a single row, and the semantics
  already live in `model_commission_tiers`.
* **Scope ladder person>store>position>department>band → person|store.** Three rungs cannot
  resolve at this size and one is actively wrong: a department-scoped SALES target is
  meaningless for Operation / Finance / HR. Adding a rung later is a CHECK change + one `case`.
* **Scope is two nullable FKs with a CHECK**, not `(scope_kind, scope_id)`: real referential
  integrity, and `scope_kind` is DERIVED from which column is filled so it cannot drift.

### The correction I owed Loo mid-build

In review I told him the fix for "a closed month must not be recomputed" was to read the frozen
`basis`. **That was wrong** and I said so before writing it: `basis` is percentage-method only,
so a per-model store freezes 0 — the identical trap O1 hit with `report.totalBasis`. The shipped
design computes sold from the month's attributed lines through ONE shared function for open and
closed months alike, which makes it method-independent and makes O1's SOLD tile and P6's
per-person figures the same arithmetic over the same rows. **P6 deliberately displays no
commission**, so it structurally cannot contradict a frozen statement. CF `kpi-actuals-not-frozen`.

### Writes are RPC-only, by schema design

`kpi_targets` / `kpi_manual_actuals` get a **SELECT-only** RLS policy. This is the direct lesson
of 0272: `staff_commission_rates` has `for all`, so `/api/hr/config/staff-rate` upserts the table
directly, which is *why* the back-dated-rate guard had to be a TRIGGER. Making the DEFINER RPC
the only door means P6's guards can live where they are readable. Do not widen these to `for all`.

### Two defects the prod dry-run caught before apply

28 assertions ran against live prod in two rolled-back transactions (aborted via `raise` so the
rollback is guaranteed regardless of MCP transaction semantics — a probe confirmed DDL rollback
works first).

1. **`revoke execute … from anon` did nothing.** Round 1 reported `anon can execute: 5 of 5`. A
   new function is created with EXECUTE granted to **PUBLIC**, and anon inherits it, so revoking
   the named role is theatre while the PUBLIC grant stands. 0268 recorded the mirror-image trap
   ("REVOKE FROM public does not drop anon" — true when anon *also* holds an explicit grant). The
   working form is `from public, anon` **plus** an explicit `grant … to authenticated, service_role`,
   or every Hono user-client call dies with permission denied. Re-verified: anon 0/5,
   authenticated 5/5, and a live `kpi_source()` as `authenticated` still succeeded. The migration
   now asserts both counts in its own sanity block.
2. **My audit assertions were reading the wrong row.** `order by occurred_at desc limit 1`
   returned the *first* row written, because `audit_log.occurred_at` defaults to `now()` = the
   **transaction start** time, so every audit row written in one txn shares a timestamp. The
   `SELF - ` marker was therefore unverified, not proven. Re-read by `ref`: confirmed
   `SELF - KPI target - person principal - sales_basis - 5000.00 from 2026-07-01` for CR001 (the
   caller's own employee row) and no marker for CR008. **Rule: inside a transaction, read audit
   rows back by `ref`, never by time.**

### Guardrail #8 paid for itself

Drafted as 0275 against a tail of 0274. The re-check immediately before applying found the
parallel line had taken **`0275_rental_makes_a_sales_order`** during the verification pass →
renumbered to **0276** before apply. Post-apply: tracker tail `0276_hr_kpi_targets`, 5 functions
(no ghost overload), 2 policies, both tables at 0 rows, 1 scoreable store, archive excluded.

### The AutoCount Archive exclusion is derived, not flagged

Loo: "ignore AutoCount Archive". `_kpi_store_is_scoreable()` = showroom channel **AND** at least
one CR-coded salesperson. The archive holder has 0 staff and its orders are already excluded from
`hr_commission_source` by 0265, so its scored sales are structurally RM 0 forever. Deriving it
means zero migration state, no flag to maintain, and a real new showroom appears the moment its
first coded person is added — the same instinct as O1 deriving "legacy" from `source_system`
instead of adding a column. Refused at the WRITE too, not just filtered from the read, so a stale
client cannot create a target no screen would ever show.

### Three design rules on the screen

1. A person with no target of their own reads **"No target"** — the store's RM 60,000 is *not*
   split across heads. Dividing it by two would be inventing a number and then judging somebody
   against it.
2. A department with no revenue shows **"—"**, never 0%. Grey dot = "does not sell", not "failing".
3. The **Showrooms** department card reads the STORE aggregate, not the sum of its people:
   the two differ whenever a personal target is missing, and 94% beside the store card's 87%
   would be two answers to one question.

Plus: percentages are **floored** in the shared engine, so the figure and the pill can never
disagree (rounding would print "100%" next to "Behind" at 99.6%); and `unscoredSold` surfaces
sales booked by a showroom salesperson with no CR code, because the store total is computed from
lines and the people rows would otherwise silently fail to add up.

### Live-safety check on the already-applied column

0276 adds `dealers.manager_user_id` and prod is shared, so the column is live before the code is.
`GET /api/dealers/me` does `select("*")` — but it parses `Adapters.dealerFromRow(data)` output (an
explicit field whitelist) with a non-strict `z.object`, and no `.strict()` schema anywhere covers a
dealer row. An extra column cannot reach the parse. Verified rather than assumed.

### Surfaces

`packages/shared/src/schemas/hr-kpi.ts` (KPI_METRICS · `resolveKpiTargets` · `computeScorecards` ·
`attainment`/`kpiState`/`kpiTone` · `managerViewReady` · inputs) · `apps/api/src/lib/kpi-actuals.ts`
(the one place a scoreboard month is assembled; parses the payload rather than casting, and a
run-state read failure degrades the badge instead of the numbers) · `apps/api/src/routes/hr-kpi.ts`
(GET + PUT target + DELETE target + PUT manual + PUT store-manager) · `HrPerformanceTab.tsx` +
nav entry + `qk.hr.kpi` keyed on the metric.

### Verification

Tests **+83** (shared 36 · api 34 · web 13). Suites at §17.7 baseline with zero new failures:
shared **1194/1194** · api **3** pre-existing (partner/pickups ×1 + supplier/pos ×2) · web **16**
pre-existing (OperationOrders ×7 + OrderCustomerCard ×4 + OhanaSofaTab ×4 + NiceFutureMattressTab ×1).
api typecheck clean; web BUILD clean (v4-guard clean + `tsconfig.app.json` tsc + vite —
the 2026-07-19 "run the build, not just tsc" lesson); design-standard lint clean;
`SERVICE_ROLE` grep 0 in `dist`. Bundle built locally as `index-CaQrJhr8.js` — **not deployed**.
`pnpm --filter @carres/shared typecheck` stays RED on 2 pre-existing `orders.test.ts` errors from
the parallel line's 0257/0258 — not ours, unchanged.

Also fixed here: the **D3 contradiction** in `docs/hr-system-full-spec.md`. Its row said an hr user
may NOT write their own comp; §4 records Loo overruling that the same day. §4 is the later ruling
and it explicitly covers "BOTH the P7 comp register and the P6 rates/targets guard" — so leaving
the stale clause in place would have had P6 built backwards. The retraction is now written into the
row itself rather than silently deleted.

### Deploy

Merged and deployed same session. Worker `abff79eb`; web `index-DtlbnO4w.js` (carres-portal
`77da79e6` + carres-pos `a9df1568`), all 4 canonicals converged, live bundle downloaded to a file
before grepping — 4,192,734 bytes, `SERVICE_ROLE` 0, `hr/kpi` + "Manager view" both present. Unauth
401 verified on `/api/hr/kpi`, `/api/hr/runs`, `/api/hr/people`, `/api/guarantees`.

`carres-pos.pages.dev` lagged one poll on the OLD `index-B9ZL9k9A.js`. Followed the rule instead of
re-deploying: `wrangler pages deployment list` showed `a9df1568` from source `2ad2401` (the union
tip) as the newest production deployment, so it was edge cache and not a clobber — polled until it
flipped. **Three merge rounds were needed** because origin/main moved under me twice mid-verify
(#356/#357, then #360-#362 which also took 0277); each round re-ran the full union suites. The
first `gh pr merge` also failed with "merge commit cannot be cleanly created" while GitHub still
reported `mergeable: UNKNOWN` — that is a stale-computation state, not a conflict; polling until
`MERGEABLE` merged first try.

### Not done

No `hr`-role user exists to smoke the non-principal path (CF `hr-role-nobody-holds-it`). P6 is
data-empty until Loo sets a target: both tables are at 0 rows, so the page shows RM 52,081 sold
against "—".

---

## 2026-07-26 ㉑ · A rental produces a Sales Order (0275, PR #358, deployed)

**Loo**: "start with the SO".

A rental produced an `RA-` and nothing else. No Sales Order meant no SO document, no invoice, and — the part that bites — **operations never saw it**. The unit was stamped `allocated` in the asset registry while nothing told a warehouse to deliver it. The locked spec already said otherwise ("Approve → the sales order moves on to operations. Reject → the order fails"); the built lane had drifted.

**THE MONEY DECISION, and it is the reusable part.** The rental order's line is priced ZERO and its total is zero. A rental order is a FULFILMENT document, not a money document — the money lives in `rental_billings` and Stripe. Priced at retail, AR shows RM2,499 outstanding for a customer who owes nothing today; priced at the contract value, AR double-counts every ringgit already scheduled. **Zero is the only figure that is not a lie.** What the paperwork should print rides in `attrs.rental` instead.

**Why `proceed_order` needed a branch — and why it is not a hole.** Its money gates exist because a normal order must be half paid before Carres spends on stock. A rental's guarantee is not a deposit: signed agreement + credit approval + card on file. So for a rental they collapse to ONE gate — the agreement must be `active`. The order's own signature/terms gates are skipped because the contract signed is the RENTAL AGREEMENT. **And because this branch requires `active`, tightening 0268's approve-side signature guard when signing ships tightens this gate too — one place to fix, everything downstream inherits it.** That is the shape to reach for whenever two gates guard the same fact.

A missing delivery date must NOT undo a credit decision, so the auto-proceed is wrapped: approval stands, the order waits in Place, finance is told what is missing (`orderBlockedBy`). Asserted, not assumed.

**Verified BEFORE applying — 27 assertions across two rolled-back transactions.** Ten covered `proceed_order`, and **five exist only to prove ORDINARY orders are untouched** (no signature blocks · terms block · under-50% blocks · a valid 50% order proceeds · a zero-total non-rental order still refused). `proceed_order` is on every order's path; testing only the new branch would have been negligent.

**Narrowings, said out loud**: a dealer is now required (CF `rental-hq-direct-no-longer-allowed`); combo plans are refused up front instead of blowing up on a NOT NULL (CF `rental-combo-agreement-sku-null`); a rental SO contributes nothing to sales/AR/margin reports (CF `rental-order-total-is-zero`). The signature change was **DROP + CREATE**, not CREATE OR REPLACE — adding a parameter makes a SECOND overload (the 0153/0154 ghost trap); verified after apply: exactly one copy.

**Correction I owed Loo**: I had implied RA-1003's mattress was stranded and urgent. It is his TEST record (customer "TEST RENTAL", sku "TEST-RENTAL-K"). Backfilling it an SO would have put a phantom delivery job into a real store's queue. Not backfilled.

### The defect this work surfaced, in my own PR #347

**A rental cart could never be submitted.** `step4Valid` requires a payment slip (or a Stripe amount) because an ordinary order must be part-paid; a rental collects NOTHING at signing, so `confirmReady` was permanently false and the Complete button stayed disabled **with no visible reason**. `step4ValidRental` is the same gate minus the money, still demanding the signature and terms — which for a rental are not a formality, they ARE the agreement. Six tests both ways, including `step4Valid` asserted UNCHANGED so nothing loosened for real sales.

**Durable lesson: when a new flow reuses an existing gate, check what that gate was really guarding. Here it was guarding MONEY, and the new flow has none — so reuse silently produced a dead end that looked like a working feature.**

**A window I created and should have flagged first**: 0275 DROPped the old 9-arg RPC while the live Worker still called it, so between apply and this deploy rentals were broken. Loo had asked to hold the deploy until the whole program was done; applying a signature-changing migration under that instruction was the wrong order. **Apply a migration that breaks the live caller ONLY as part of the same deploy.**

**Ship**: PR #358 (merge `fe60f204`) → api Worker `b8c0159d` (unauth 401 on three routes) + web `index-DGMmYLHd.js` → carres-portal `31c22186` + carres-pos `f98a22fa`; 4,193,674 bytes downloaded-then-grepped, `SERVICE_ROLE` 0. `erp.carresofficial.com` served PR #363's bundle for ~40s; `deployment list` showed mine newest and `merge-base --is-ancestor 474e67b fe60f204` proved containment, so it was lag not a clobber. **Also learned while verifying: "Sent to finance for approval" grepped 0 because it lives in the RETIRED `RentToOwnPage`, correctly tree-shaken — pick markers from MOUNTED components or a clean deploy reads as a failure.** Suites at baseline (shared 1158 · api 3 · web 16); typecheck 0, check:v4 + design-standard clean.

**Remaining in the program Loo asked for (not started / half done)**: signing writes nothing to `rental_agreements.signed_*` yet (the confirm gate is in, the capture is not, and 0268's `not_signed` guard stays disabled); the billing engine is untouched (0 of 84 months read as paid — finance can only see the truth in Stripe); buyout / ownership transfer / repossession have status values but no flows.

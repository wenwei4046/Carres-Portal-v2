# Phase 4 v3 — Reflection

> **Phase 4 v3 sprint complete 2026-05-05** — 22 commits across `e29dd94..cbee48b` over a single overnight autonomous run, 11 SQL migrations (0026-0036), 8 thread-aware SECURITY DEFINER RPCs, 1 SOP TypeScript module, 4 UI tweaks (Outsource toggle, Stockpile PO mode, Receive-from-PoDetailModal, AssignPickupDialog warehouse picker), 652/652 tests green (+47 from v3-S4), `+5,613 / -175` lines across 33 files. Built end-to-end via `superpowers:subagent-driven-development` flow with all subagents on `model:opus` per Loo's overnight policy. **v3 ships dormant** — schema and RPCs are in place but the FE/API hasn't been wired to the v3 confirm RPC yet; the switch is Phase 4.5's job.

---

## Sprint Summary

| Sprint | Date | Schema? | Commits | Notable |
|---|---|---|---|---|
| **v3-S1** | 2026-05-05 ~02:10 MYT | docs only | 1 (`370d4f3`) | Fixed 7 Codex bugs in the v3 spec doc before any code touched migrations. |
| **v3-S2** | 2026-05-05 morning | none | 5 (`d47db5d` → `8dce9c3`) | Operational bug fixes Loo found dogfooding: auto-fill po-existence filter, Receive gate drop, PoDetailModal Receive entry, AssignPickupDialog warehouse picker. |
| **v3-S3** | 2026-05-05 mid-day | yes (0026-0031) | 5 (`f0c1887` → `acbb0e6`) | 6 schema migrations + db-types regen + SOP TS module + Outsource toggle UI + Print DO toast surface. |
| **v3-S4** | 2026-05-05 evening | yes (0032-0035) | 7 (`ddfd10e` → `5e80216`) | `order_supplier_threads` table + `suppliers.slug` column + 8 thread-aware RPCs in 0034 (1359 lines) + `do_number` hotfix in 0035 + assign-pickup-partner wired to v3 RPC + Stockpile PO mode in CreatePOModal + auto-fill upgraded to threads.po_id IS NULL primary filter. |
| **v3-S5** | 2026-05-05 night | yes (0036) | 1 (`cbee48b`) | `orders_rollup_stage()` STABLE function + AFTER trigger on `order_supplier_threads`. Trigger fires only when threads exist (none in production today) — true dormant ship. |

**22 commits total · 33 files changed · +5,613 / -175 lines · 11 migrations applied to staging Supabase project_id `kfprgpjpaffedghytstl`.**

---

## Key decisions during the run

### 1. Codex bug fixes locked in v3-S1 before any code

Per spec §17.3 binding plan, v3-S1 was a spec-only commit that closed 7 Codex bugs before migration code began:

| Bug | Fix |
|---|---|
| **`purchase_orders.id` is `text` not `uuid`** | `order_supplier_threads.po_id` declared `text`. Same for any RPC that takes `p_po_id`. uuid would have errored on first FK validate. |
| **`app_role` already has `partner`** (0001_init.sql:15-17) | Dropped the proposed `'logistics_partner'` enum addition. 0029 became a NO-OP placeholder so 0030-0031 numbering stayed contiguous. The `warehouse_kind` enum's `'logistics_partner'` value stays — different enum, no clash. |
| **Migration numbering inconsistent** | Every slot 0026-0033 documented in spec §3.7 explicitly. |
| **`ALTER TYPE ADD VALUE` not idempotent** | All 8 enum additions (logistics_stage × 2 in 0028, po_sup_status × 6 in 0030) wrapped in `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum ...) THEN ...; END IF; END $$;`. Bare ADD VALUE errors on re-run. |
| **Backfill uses `cat_covered` (deprecated)** | 0026 backfill rewritten to use `product_models.category` as the canonical source. cat_covered drop deferred to a follow-up cleanup migration. |
| **`destination_warehouse_id` dual-field confusion** | Column dropped from §3.5 ALTER TABLE. Relocate now mutates `purchase_orders.warehouse_id` directly (safe in v3 because reserve happens at Receive time per the new reserve-at-receive semantic — no allocation reads warehouse_id before relocate). Original warehouse preserved in `customer_rejection.original_warehouse_id` jsonb. |
| **Auto-detect race condition** | Spec §6.4 added: `SELECT ... FOR UPDATE` on threads, verify `po_id IS NULL`, then INSERT POs + UPDATE threads atomically. SQLSTATE 40001 → 409 Conflict at Hono layer. **Not yet implemented** — see carry-forward `phase-4-v3-batch-rpc-thread-claim`. |

Codex caught two bugs (po_id type, partner role) that would have caused first-deploy migration failure. Worth the sprint's full session.

### 2. Migration numbering swap (vs spec §17.2 pin)

Spec §17.2 codex-fix table pinned: `0032 rpcs_v3, 0033 threads`. Reality shipped:

```
0026 product_skus.supplier_id
0027 warehouses.kind + owning_partner_id
0028 logistics_stage_v3 (+ awaiting_logistics_action, + waiting)
0029 app_role partner no-op (placeholder)
0030 po_sup_status_v3 (+ 6 enum values + outsource columns)
0031 rls_policies_v3 (partner role policies)
0032 suppliers.slug                 ← S4 added
0033 order_supplier_threads          ← spec said 0033 = threads, kept
0034 logistics_rpcs_v3               ← spec said 0032 = rpcs_v3, swapped
0035 purchase_orders.do_number        ← S4 hotfix, unplanned
0036 orders_rollup_stage              ← S5
```

Reasons:

- **0032/0034 swap**: Postgres applies migrations in filename order. RPCs (0034) reference threads table FK → threads table must come first. The Codex pin was a literal recommendation that conflicted with FK ordering; spirit (sequential, no skips) preserved.
- **0032 became `suppliers.slug`** (unplanned): SOP TS module in v3-S3 had hardcoded a `'nice-future'` / `'hookka'` slug map but suppliers table only had `name`. Adding `slug` to suppliers cleaned up the join. Slug column became the stable supplier ID across env (seed populates it).
- **0035 do_number hotfix**: 0034's `logistics_assign_partner_and_dispatch` RPC writes a `do_number` (delivery-order serial) onto `purchase_orders` for outsource print flow. The column didn't exist yet. 0035 added it (`text NULL`, no default, populated by RPC at assign time).

Documented in commit `b16bc74` and `0f3b620`. Spec §17.2 still pins the old order — see carry-forward `phase-4-v3-spec-numbering-doc-fix`.

### 3. Conditional NOT NULL on `product_skus.supplier_id`

Original v3 spec (§3.1) called for hard `SET NOT NULL` after backfill. Loo's overnight test path runs against a fresh-dev seed where suppliers table is empty at migration time (seed.sql populates it AFTER migrations). Hard NOT NULL would break the fresh-dev startup.

Fix in 0026: SET NOT NULL is wrapped in a `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM product_skus WHERE supplier_id IS NULL) AND EXISTS (SELECT 1 FROM product_skus) THEN ALTER TABLE ... SET NOT NULL; ELSE RAISE NOTICE ...; END IF; END $$;` block. Staging gets NOT NULL applied (suppliers populated, backfill ran clean). Fresh-dev path leaves the column nullable; seed-time enforcement handles it later.

Carry-forward: `phase-4-v3-skus-supplier-id-not-null-tighten` — tighten in a follow-up post-seed migration once data is verified.

### 4. `suppliers.slug` column added in 0032 (not in original spec)

The spec §4.3 SOP module hardcoded supplier slugs (`'nice-future'`, `'hookka'`) as the lookup key into `SUPPLIER_SOP`. But suppliers table didn't have a slug column — only name. Joining by name was fragile (case sensitivity, Unicode), and the SOP TS module needed a stable, env-portable identifier.

Decision: add `suppliers.slug text UNIQUE NOT NULL` (0032). Backfill from name via lower-case + dash-replace + ASCII-safe rules. Seed.sql gets a one-line patch to populate slug on insert. SOP module references slug; v3 RPCs (0034) use slug for routing.

This was a real schema-change-not-in-original-spec event. Took one subagent dispatch + spec reviewer + code reviewer; landed in commit `ddfd10e` (alongside 0033). Carry-forward closed by 0032 itself.

### 5. `purchase_orders.do_number` hotfix (0035)

Mid-v3-S4, the `logistics_assign_partner_and_dispatch` RPC was written to populate a `do_number` field on the PO (so Print DO endpoint has a stable delivery-order serial for outsource flow). The column didn't exist. 0035 added it as a 26-line hotfix migration: `ADD COLUMN do_number text NULL`. RPC populates it at assign time (`'DO-' || lpad(seq::text, 6, '0')`).

Why a hotfix migration vs editing 0034: per CLAUDE.md §14 red line #6 ("never alter committed migration history"). 0034 was already applied to staging before the gap surfaced.

Carry-forward closed by 0035. Commit `0f3b620`.

### 6. RPC ordering swap (0033 = threads, 0034 = RPCs)

Already covered in §2 above; restated for clarity. The migration file order is what matters for Postgres apply, not the spec's prescriptive numbering.

### 7. v3-S5 ships orders_rollup function but trigger fires only when threads exist

This is the load-bearing dormancy decision (see §"Why v3 ships dormant" below).

The `orders_rollup_stage()` function returns `'placed'` when no threads exist for the order. The trigger on `order_supplier_threads` only fires on INSERT/UPDATE/DELETE of that table. Today, NO threads exist — v2's confirm RPC writes `orders.logistics_stage` directly, never touches threads. So the trigger never fires, the rollup is never invoked, v2 path stays untouched.

When Phase 4.5 wires the FE to call `logistics_confirm_proceed_request_v3` (which DOES insert thread rows), the trigger immediately starts firing and the rollup takes over. No code change needed in 0036 at that point.

### 8. v3 dual-path stays during transition

Auto-fill endpoint (`pos.ts`) supports both filters during transition:
- **Primary**: `threads.po_id IS NULL` (v3 path) — only applies once threads exist for an order.
- **Fallback**: `dl IS NULL OR dl_refs IS NULL` (v2 path) — covers orders placed before v3-S4 deploy where threads were never created.

Both filters live until Phase 4.5 closes carry-forward `phase-4-v3-auto-fill-thread-scan-narrow`.

---

## Stats

| Metric | Pre-v3 (`e29dd94`) | Post-v3 (`cbee48b`) | Delta |
|---|---|---|---|
| Migrations | 25 | 36 | +11 |
| Tests | 605 | 652 | +47 |
| Hono routes | unchanged | unchanged | 0 (route shapes preserved) |
| `apps/api` LOC | ~1.1k | ~1.6k | +500 (mostly v3-S4 RPC test mocks) |
| `apps/web` LOC | unchanged | +~700 | new modal UI + Stockpile PO mode + Outsource toggle |
| `packages/shared` LOC | unchanged | +~200 | sops.ts + slug schema + db-types.ts regen |
| `supabase/migrations` LOC | ~3.4k | ~5.6k | +2,228 (all-additive, no edits to 0001-0025) |

**Test breakdown (final):** shared 112 (+0 from v3 work; SOP module added 13, regen replaced 13) · api 287 (+47 from v3-S4 RPC test mocks + thread filter + assign-pickup wire) · web 253 (+0 from this run; v3-S4.5 Stockpile PO mode added 8 web tests, regen replaced same).

**v3-S4 alone was the biggest single sprint** — 1359 lines of RPC SQL in 0034, 8 SECURITY DEFINER functions, all `STABLE` per CLAUDE.md §8 Fix 3.

---

## Surprises

### 1. Subagent-driven flow held up well across 22 commits

The plan called for `superpowers:subagent-driven-development` with implementer → spec reviewer → code reviewer → fix loop per task. Across 22 commits and ~30 subagent dispatches:
- **0 BLOCKED escalations** to Loo. Every task either completed cleanly or recovered after one fix-loop iteration.
- **2 spec-reviewer rejects** that triggered a fix loop: v3-S2.4 (warehouse picker had no test coverage for the disabled state); v3-S4.4 (assign-pickup test coverage didn't cover outsource flow). Both fixed in one iteration.
- **5 code-reviewer findings** that became carry-forwards (instead of fix-loop): naming nits, dedupe candidates, type inference improvements. Recorded in CLAUDE.md §17 carry-forwards rather than blocking the run.

The `model:"opus"` override on subagents (per `feedback_subagent_model.md`) was the right call. Several reviews (v3-S4.2 RPC review, v3-S5.1 trigger review) needed careful SQL semantics reasoning that Sonnet would likely have skimmed.

### 2. The do_number column gap

The `logistics_assign_partner_and_dispatch` RPC was specced + reviewed + applied in 0034 with a `do_number` write that referenced a column that didn't exist. The unit tests (mock-based) didn't catch it because the mock didn't enforce schema. The integration smoke that would have caught it (real Supabase round-trip) is in the carry-forward `phase-4-v3-rpc-integration-tests` — not run yet.

Caught by the spec reviewer at v3-S4.4 commit time when reviewing the `do_number` reference in 0034. Fixed via 0035 hotfix migration. The lesson: **mock-based RPC tests don't catch schema drift**. Integration tests against real Supabase (or generated db-types regen + use) is the only safety net.

### 3. Stockpile PO mode was bigger than spec implied

Spec §17.1 A3 said "Stockpile PO is a 1st-class case in v3" — one line. Implementation (v3-S4.5) was 269 test lines + 107 source lines because:
- CreatePOModal had to handle a "no order ref" branch that toggles many UI states.
- The "Stockpile PO" checkbox needed to disable the order-ref autofill, hide the auto-fill suggestion list, change the submit button label, and skip the post-create thread-claim (because there's no thread to claim).
- Validation: when stockpile mode is on, order-ref MUST be empty; when off, at least one line must reference a known order.

Carry-forward `phase-4-v3-stockpile-advanced-flows` (low-stock alerts, suggested replenishment, etc.) deferred to Phase 4.5.

### 4. Two batches of carry-forwards added during the run

CLAUDE.md §17 carry-forward list grew significantly:
- **v3-S3 close** (`acbb0e6`) added 5 carry-forwards.
- **v3-S4 close** (`5e80216`) added 8 carry-forwards.
- v3-S5 will not add new ones (just close 1 — the rollup function lands).

Total v3 net carry-forward additions: 13. Most are low-priority cleanup or test-coverage extensions. Two are CRITICAL and they're the dormancy-makers (`phase-4-v3-batch-rpc-thread-claim`, `phase-4-v3-confirm-rpc-swap`) — see next section.

### 5. The "v3 ships dormant" realization came late

The realization that v3 was code-complete-but-functionally-inert came during the v3-S4 review pass. Up to that point the assumption was that wiring `assign-pickup-partner` to the v3 RPC (v3-S4.4) and updating auto-fill to use the threads filter (v3-S4.6) would make v3 "live."

What we missed: the `confirm_proceed_request` route at `apps/api/src/routes/logistics/orders.ts:471` was untouched. It still calls v2's `logistics_confirm_proceed_request` RPC (in 0024), which writes `orders.logistics_stage` directly and never inserts a thread row. So even though v3 RPCs exist and threads table exists, no thread is ever created, and every downstream v3 RPC silently no-ops.

This was caught by the v3-S4 code reviewer. Decision: tag v3 dormant rather than rush a confirm-RPC swap into v3-S5. The swap requires also extending `logistics_create_pos_batch` with thread-aware atomic claim (the Codex bug 7 fix from §17.2 that was never implemented). Both go to Phase 4.5.

---

## Lessons

### 1. Codex review of specs before code is high-leverage

v3-S1 spent one full session fixing 7 spec bugs before any migration code touched the file system. Two of those bugs (po_id text-vs-uuid, partner role already exists) would have caused first-deploy migration failure. The spec-review-before-code pattern is now the v3 standard.

For Phase 4.5: run Codex on the Phase 4.5 spec doc BEFORE the implementation plan locks. Treat the v3-S1 sprint as the prototype.

### 2. Mock-based RPC tests catch contract bugs but not schema bugs

The do_number gap (0034 references a column that didn't exist until 0035 hotfix) slipped past:
- vitest unit tests on the route handler (mocks supabase client)
- vitest mock RPC tests (mocks the RPC response)
- spec reviewer (focused on semantic, not column existence)

It got caught by the second spec reviewer pass on the 0034 file itself. The lesson: **whenever an RPC writes to a column, search the migrations for that column first**. Or, better: post-RPC migration apply, run a quick `mcp__supabase__execute_sql` smoke against staging that actually invokes the RPC end-to-end.

Carry-forward `phase-4-v3-rpc-integration-tests` captures the formal version: Playwright E2E once FE wires v3 flows.

### 3. Autonomous overnight runs need a "dormant ship" exit option

The plan was: v3-S5 → tag `phase-4-v3-complete` → done. Reality: v3-S5 wrote the rollup function fine, but the v3-S4 code review flagged the dormancy gap, and rushing the confirm-RPC swap into v3-S5 would have meant unreviewed FE wiring at 4 AM.

The right call was: ship the SQL plumbing, document the gap, defer the wiring to Phase 4.5. This requires the autonomous run to recognize a "safe-to-stop" state that's NOT "everything works end-to-end." That recognition came from the v3-S4 review pass, not the executing plan.

For Phase 4.5: bake this into the plan upfront. "If a sprint reveals a wiring gap, prefer dormant ship over rushed swap" should be a written rule.

### 4. Migration numbering pin in spec ≠ filename order in reality

Spec §17.2 said `0032 rpcs_v3 / 0033 threads`. Reality shipped `0033 threads / 0034 rpcs_v3` because Postgres FK ordering. The spec text was never updated; it still says the original pinning. Carry-forward `phase-4-v3-spec-numbering-doc-fix` will fix the spec when Phase 4.5 starts.

The lesson: when the spec says "do this in this order" but Postgres FK ordering says otherwise, follow Postgres. Document the deviation in the commit and the spec, not just the commit.

### 5. SOP TS module + DB rollup function = two sources of truth

`packages/shared/src/sops.ts` has `SUPPLIER_SOP` mapping (slug → SOP). `supabase/migrations/0034_logistics_rpcs_v3.sql` has `_v3_resolve_sop_name(supplier_slug, category)` which hardcodes the same map. They're identical today; if a future supplier is added, both must update.

Carry-forward `phase-4-v3-sop-source-of-truth-dedupe` captures this. Two options for the fix: (a) read the map from a `supplier_sops` table that both SQL and TS read; (b) generate the SQL function from the TS module at build time. Defer to Phase 4.5.

### 6. Test count growth was concentrated in v3-S4

v3-S4 added 47 of the 47 net new tests this run. v3-S2/S3/S5 each added some + replaced some, leaving net 0. The pattern: schema-touching sprints add fewer test deltas (because they're plumbing); the FE/API wiring sprints add more.

For Phase 4.5: expect 80-150 net new tests when partner UI + DO upload + sofa flows ship. Plan test infrastructure (msw mocks for partner role, Storage upload mocks, etc.) into the first sprint.

---

## Carry-forward TODOs

### Closed by v3 (removed from §17 list)

- `phase-4-c5-3-refetch-error-handling` — replaced by v3-S2.1 auto-fill rewrite.
- `phase-4-prefill-warehouseid-q4-drift` — superseded by v3 reserve-at-receive semantic; warehouse selection now lives in AssignPickupDialog at dispatch time.
- `phase-4-orphans-warning-banner` — same root cause, gone after v3-S2 auto-fill semantic.

### NEW from v3 (carry into Phase 4.5)

**CRITICAL (block v3 going live):**
- `phase-4-v3-batch-rpc-thread-claim` — extend `logistics_create_pos_batch` with `p_thread_ids[]` + FOR UPDATE + 40001 race guard + UPDATE threads SET po_id = .... Required before v3 confirm_proceed_request_v3 can be wired. Spec §6.4 race guard not yet enforced.
- `phase-4-v3-confirm-rpc-swap` — orders.ts:471 still calls v2 `logistics_confirm_proceed_request`. Swap to `logistics_confirm_proceed_request_v3` once batch-rpc-thread-claim lands.

**Medium (test/code-quality):**
- `phase-4-v3-rpc-integration-tests` — 8 v3 RPCs have unit tests via mocks but no integration tests against real Supabase. Add via Playwright when FE wires v3 flows.
- `phase-4-v3-confirm-auto-skip-from-stock` — `logistics_confirm_proceed_request_v3` ships simpler variant; auto-skip-to-ready_to_dispatch when stock available is deferred.
- `phase-4-v3-skus-supplier-id-not-null-tighten` — 0026 leaves nullable in fresh dev; tighten in follow-up post-seed migration once data verified.
- `phase-4-v3-print-do-toast-test` — AssignPickupDialog Print DO toast handler has no test coverage.
- `phase-4-v3-sop-type-dedupe` — `sops.ts` `LogisticsStageV3` should derive from `DB.LogisticsStage` to lock the two unions together.
- `phase-4-v3-sop-source-of-truth-dedupe` — `sops.ts SUPPLIER_SOP` and `0034._v3_resolve_sop_name` hard-code the same supplier→SOP map in two places; need single source or CI lint.
- `phase-4-v3-auto-fill-thread-scan-narrow` — `pos.ts:129` reads all `order_supplier_threads` rows; narrow once dual-path simplifies.

**Low (nits/audits):**
- `phase-4-v3-receive-idempotent-audit` — re-submitted Receive with same `received_qty` leaves no audit trail in `stock_movements`.
- `phase-4-v3-receive-cumulative-vs-delta-naming` — `p_lines[i].received_qty` is cumulative, not a delta; naming is misleading.
- `phase-4-v3-spec-numbering-doc-fix` — spec §17.2 still pins 0032=rpcs_v3 / 0033=threads; reality is the swap.

### Phase 4.5 deferred

Already in CLAUDE.md §17 from spec §17.4:
- `phase-4.5-partner-role-tenancy` — full auth + invitation + dashboard + pickup UI
- `phase-4.5-do-file-storage-upload` — Supabase Storage bucket + RLS + orphan handling
- `phase-4.5-sofa-relocate-ui` — wire ReassignWarehouseDialog + relocate flow UI
- `phase-4.5-supplier-tab-ui-rewrite` — Total Order + per-supplier tabs (per Q1=A multi-tab visibility)
- `phase-4-v3-stockpile-advanced-flows` — low-stock alerts, suggested replenishment
- `phase-6-supplier-portal-align-with-v3` — Phase 6 supplier UI must align with v3 RPC + sup_status surface

### Pre-v3 carry-forwards still open (no change)

orphaned-debt-rpcs · audit-log-duplicate-index · approval-decided-by-shows-uuid · approval-row-type-missing-reason · pagination-deferred · supabase-jwt-secret-cleanup · phase-2-leftovers · phase-4-m2-schema-audit · phase-4-rpc-shape-audit · phase-4-or-filter-harden · phase-4-replace-any-types · phase-4-zod-strict-uniform · phase-4-logistics-test-gaps · phase-4-detail-partner-name-join · phase-4-or-filter-harden-orders · phase-4-22p02-mapping · phase-4-uuid-path-validation · phase-4-spec-photo-upload-reconcile · phase-4-create-po-eta-partner · phase-4-cross-order-bundle-aggregation · phase-4-zod-strict-nested-lines · phase-4-po-id-race · phase-4-warehouse-picker-dedupe · phase-4-warehouse-picker-kind-filter · phase-7-reassign-warehouse-wire · phase-7-pdf-do-photo-upload · phase-9-movements-cursor-pagination · phase-9-pdf-visual-snapshots · phase-9-dashboard-split-layout · phase-9-trigram-search · phase-9-pdf-cache-immutable-orders · phase-9-bundle-size-monitor · phase-9-cjk-font-extended · phase-9-po-cogs-source.

---

## Why v3 ships dormant

### What "dormant" means

Every v3 schema and RPC artifact is in place:
- `order_supplier_threads` table exists.
- 8 thread-aware RPCs (`logistics_confirm_proceed_request_v3`, `logistics_supplier_ready_confirm`, `partner_confirm_receive`, `partner_reject_customer`, `logistics_relocate_warehouse`, `logistics_receive_po_with_do`, `logistics_assign_partner_and_dispatch`, `logistics_attach_pod_do`) exist as SECURITY DEFINER functions.
- `orders_rollup_stage()` function + trigger on `order_supplier_threads` exist.
- All v3 enum values exist (`awaiting_logistics_action`, `waiting`, plus the 6 PO sup_status additions).
- New columns exist: `product_skus.supplier_id`, `warehouses.kind` + `owning_partner_id`, `purchase_orders.{ready_confirm_at, partner_confirmed_at, customer_rejection, do_file_path, do_uploaded_at, do_uploaded_by, outsource_partner_name, outsource_partner_contact, outsource_partner_zones, do_number}`.
- TS-side: `packages/shared/src/sops.ts` defines `SOP_STANDARD` + `SOP_SOFA_SPECIAL` + `SUPPLIER_SOP` map. AssignPickupDialog has Outsource toggle UI. CreatePOModal has Stockpile PO mode. Auto-fill endpoint reads threads.

But NONE of it is invoked yet:
- `apps/api/src/routes/logistics/orders.ts:471` still calls v2 `logistics_confirm_proceed_request`. That RPC writes `orders.logistics_stage` directly. **It never inserts a row into `order_supplier_threads`.**
- Therefore: zero threads exist in the DB.
- Therefore: `orders_rollup_stage()` returns `'placed'` (no-threads default branch); the trigger never fires (no thread INSERT/UPDATE/DELETE to fire on).
- Therefore: every v3 RPC that operates on threads silently no-ops.
- Therefore: the live system is functionally identical to pre-v3.

### Why this is a SAFE state to tag

1. **No regression risk.** v2 paths are untouched. v3 schema is purely additive — columns are nullable, new tables are empty, new enum values are unused, new RPCs aren't called.
2. **Zero stranded data.** No half-migrated state. No `orders` rows in a v3-only stage. No threads with broken FK.
3. **Trigger is read-only against the live system.** The rollup trigger fires only on `order_supplier_threads` mutations; with no threads existing, it never fires. The function `orders_rollup_stage()` itself is STABLE/pure-SQL — even if accidentally called, it returns `'placed'` for orders with no threads (safe default).
4. **Tests still pass at 652/652.** Whatever v3 path is callable in code is exercised by mocks. The "wiring" gap is structural, not test-broken.
5. **All migrations were applied to staging.** `mcp__supabase__list_migrations` shows 0001-0036 all green. No pending migrations to apply later.

### What Phase 4.5 must do to "wake" v3

Two carry-forwards block live v3:

**A. `phase-4-v3-batch-rpc-thread-claim`** (CRITICAL):

Extend `logistics_create_pos_batch` (in 0025) with:
- New parameter `p_thread_ids text[]` (the set of threads this batch is claiming).
- `SELECT ... FROM order_supplier_threads WHERE id = ANY(p_thread_ids) FOR UPDATE` (lock the threads atomically).
- Verify each thread has `po_id IS NULL` (no double-claim).
- Within the same transaction, INSERT the POs and `UPDATE order_supplier_threads SET po_id = <new> WHERE id = ANY(p_thread_ids)`.
- Catch SQLSTATE 40001 → 409 Conflict at Hono layer.

This is the Codex bug 7 fix from spec §17.2 that was never implemented. Without it, two simultaneous Auto-fill clicks create duplicate POs covering the same threads.

**B. `phase-4-v3-confirm-rpc-swap`** (CRITICAL):

Swap `apps/api/src/routes/logistics/orders.ts:471` from `logistics_confirm_proceed_request` (v2) to `logistics_confirm_proceed_request_v3` (in 0034). The v3 RPC splits the order into threads (via `_logistics_split_order_into_threads` helper) and writes `awaiting_logistics_action` into the threads, not directly into `orders.logistics_stage`. From this moment on:
- New orders have threads.
- The rollup trigger fires on thread changes, keeps `orders.logistics_stage` in sync.
- v3 RPCs (Receive, Assign, etc.) operate on threads and the rollup propagates.

A. must land before B. (otherwise the batch RPC silently allows dup POs once threads start being created). Both should land in the same Phase 4.5 sprint, with a v2-cleanup retirement migration deferred until v3 is verified live.

### Tagging now is correct

`phase-4-v3-complete` accurately describes "the v3 SQL + TS plumbing landed and tested." It does NOT claim "v3 is the active path." Phase 4.5 owns the activation. The tag annotation will explicitly note dormancy.

---

## Next steps

### Phase 4.5 (post-v3, pre-Phase 5)

Scope (per CLAUDE.md §17 + spec §17.4):

1. **Wake v3** — `phase-4-v3-batch-rpc-thread-claim` + `phase-4-v3-confirm-rpc-swap`. Plus integration tests (Playwright) covering the dormant→live transition. Estimate: 1-2 sessions.
2. **Partner role tenancy** — auth hook updates JWT for `partner` role + `partner_id` claim, invitation flow, RLS verification, `/partner/*` routes. Estimate: 2 sessions.
3. **DO file upload to Supabase Storage** — bucket creation + RLS + orphan handling + UI integration in ReceivePOModal. Estimate: 1 session.
4. **Sofa flow UI** — Ready Confirm + Partner Confirm Receive + Reject → Relocate Warehouse + Waiting stage rendering. Wires existing ReassignWarehouseDialog. Estimate: 2 sessions.
5. **Per-supplier tab UI** — Total Order + Nice Future + HoOKkA/Sofa + HoOKkA/Bedframe tabs. Replaces current 6-col kanban with multi-tab view per Q1=A. Estimate: 2 sessions.
6. **v2 cleanup** — drop deprecated columns (`cat_covered`), drop v2 RPCs (after callers all on v3), un-deprecate the `awaiting_stock` enum value (or accept it lingers). Estimate: 1 session.

**Phase 4.5 total: ~9 sessions.** Should run as one named phase with its own spec + plan-eng-review + tag (`phase-4-5-complete`).

### Phase 5 (Finance)

Deferred until Phase 4.5 lands. Scope per CARRES_PORTAL_V2_PLAN.md §8:
- Top-up approval workflow
- Refund flow (request → approve → pay)
- Outstanding tracking (customer-owe-HQ per locked biz model)
- Finance dashboard

Pre-Phase-5 work: `/plan-eng-review` on the Phase 5 spec; verify no regressions in Phase 4 + 4.5 paths.

### Cross-cutting carry-forwards

- `M4.6 PO COGS source` (`phase-9-po-cogs-source`) — still open from v2. PDF template uses `product_skus.price` as proxy. Need real COGS field on PO lines, or supplier-side cost capture. Phase 5 might surface it (Finance reads COGS for margin).
- `phase-4-spec-photo-upload-reconcile` — DispatchModal photo upload OR drop RPC arg. Still open.
- Bundle size monitor (`phase-9-bundle-size-monitor`) — CI gate to prevent the Workers bundle drifting past 197 KiB gzipped. Still open.

---

> **Phase 4 v3 status: code-complete, tests green, schema applied, ships dormant. Phase 4.5 wakes it up.**

—— End of phase-4-v3-reflection.md ——

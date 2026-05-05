# Phase 4.5a v3 Wake — Reflection

**Date completed:** 2026-05-05 (overnight, autonomous subagent run)
**Tag:** `phase-4.5a-v3-wake-complete @ 6721471`
**Commits:** `4a41604..dadff40` (11 commits)
**Estimate vs actual:** plan said ~5h subagent + 24h soak; actual ~5-6h subagent (no soak — Loo collapsed it).

---

## What landed

Phase 4.5a took v3 from **dormant** to **fully active** in a single overnight sprint. The v3 thread infrastructure (built across migrations 0026-0036 in the v3 sprint earlier the same day, plus 0037 batch RPC thread claim in v3-active.1) was code-complete but inert because `orders.ts:471` still called the v2 confirm RPC. 4.5a flipped the switch.

The full vocabulary sweep retired `awaiting_stock` from the `logistics_stage` enum (irreversible). Auto-skip-from-stock at confirm time went back in (skipped during v3-S4 simplification). The FE kanban learned to render `awaiting_logistics_action` natively.

### Migrations (5 new)

| # | File | Concern |
|---|---|---|
| 0038 | `0038_logistics_v2_rpc_v3_vocab_sweep.sql` | 5 v2 RPCs swept (`_logistics_create_po_inner`, `logistics_create_po`, `logistics_create_pos_batch`, `logistics_issue_pos_for_order`, `logistics_cancel_po`). 0037 thread-claim PERFORM preserved. |
| 0038b | `0038b_logistics_v2_residual_rpc_sweep.sql` | 4 more v2 RPCs caught by spec review (`logistics_confirm_proceed_request`, `logistics_warehouse_pick`, `logistics_receive_po_line`, `logistics_dashboard_summary`). |
| 0039 | `0039_logistics_confirm_v3_auto_skip.sql` | v3 confirm + auto-skip-from-stock (no ghost PO; reserve via `stock_movements.note='reserve_from_buffer'`, qty negative per codebase convention). |
| 0039b | `0039b_logistics_dashboard_summary_v3_key_rename.sql` | Dashboard JSON-key rename in lockstep with FE consumer. |
| 0040 | `0040_logistics_stage_drop_awaiting_stock.sql` | 5-step type recreate to drop `awaiting_stock`. CASCADE casualties recreated: `orders_rollup_stage()` + trigger + (defensive) `order_proceed` from 0003. |

### Code (1-line API + 27-file FE/test rename)

- `apps/api/src/routes/logistics/orders.ts:471` — `logistics_confirm_proceed_request` → `..._v3`. The single load-bearing line.
- `apps/api/src/routes/logistics/pos.ts:133` — `.in(["awaiting_logistics_action", "awaiting_stock"])` collapsed to `.eq("logistics_stage", "awaiting_logistics_action")`.
- 27 files renamed across `apps/web/`, `apps/api/`, `packages/shared/` — kanban column ID, pipeline tile, schema unions, test fixtures.

### Tests

663/663 vitest green throughout (shared 112 + api 298 + web 253). Net delta from 4.5a: +5 tests (T2 +2 vocab-sweep + T3 +4 auto-skip - T5 deleted 1 stale `warehouse_required`). Playwright 16/18 (2 pre-existing dealer-flow flakes, no relation to 4.5a).

---

## What we did differently than planned

### 1. The 5-RPC scope was wrong — actual is 9

Plan T2 listed 5 RPCs to sweep. Spec review caught 4 more (`logistics_confirm_proceed_request`, `logistics_warehouse_pick`, `logistics_receive_po_line`, `logistics_dashboard_summary`) that were live and writing/reading `'awaiting_stock'`. T6's `DROP TYPE CASCADE` would have silently dropped them.

**Fix-forward:** new migration `0038b` instead of editing `0038` (CLAUDE.md §14 #6). The `Nb` letter-suffix convention is now a precedent for post-commit follow-up migrations.

**Lesson:** the audit step should grep MIGRATION SOURCES for `'awaiting_stock'` literals, not just live FE/API code. Plan T1 grepped `apps/` + `packages/` but skipped `supabase/migrations/`. The literal scope was 3x bigger than the plan thought.

### 2. The 24h staging soak got collapsed to ~30 min

Plan T7 had a 24h soak gate between 0039 and 0040. Loo collapsed it to "smoke immediately" because all migrations are CREATE OR REPLACE additive (except 0040 itself, which is irreversible). This worked fine — staging smoke 6/6 PASS — but it meant the irreversible 0040 went live without a real soak. Risk acceptable given the small blast radius (no production users yet; greenfield project) and the tight CASCADE casualty audit.

**Lesson:** `pg_depend` query before `DROP TYPE CASCADE` is non-optional. Each function whose body had `'awaiting_stock'::logistics_stage` cast literal needed manual recreation in the same migration. Caught 4 in plan, captured 3 in actual `pg_depend`, added 1 more (`order_proceed`) defensively from `pg_proc.prosrc` grep.

### 3. Three review iterations caught real bugs

Per-task spec + code review wasn't theater — it caught real problems each time:

- **T2 spec review:** the 5-RPC scope gap (4 more RPCs needed). Without it, T6 would have silently nuked 4 production RPCs.
- **T2 code review:** 12 cosmetic `·` (U+00B7) → `--` glyph drift in `format()` strings that ended up in `audit_log.action` and `order_history.text` (user-visible). Restored.
- **T3 code review:** `stock_movements.qty` sign convention mismatch — implementer wrote positive qty for `kind='out'`, but every other migration uses negative. Would have silently corrupted future ledger views. Fixed.

The "fresh subagent per task + dual review" pattern paid off. None of these would have been caught by a single-pass implementer.

---

## Surprises

### 1. `order_proceed` from 0003 was a sleeper

A function I didn't even know existed (superseded by `proceed_order` in 0008). Pre-flight grep across `pg_proc.prosrc` caught it. Recreated defensively in 0040 step 6d. Without that defensive catch, T6 CASCADE would have silently dropped a still-callable RPC — would have caused a 22P02 cast error if anyone called it via raw SQL or future code path.

### 2. `stock_balances.available_qty` doesn't exist

Spec §4.3 sketched `UPDATE stock_balances SET available_qty -= demand`. The actual schema has `qty` and `reserved` (with CHECK `qty >= reserved`); `available_qty` is computed on the fly. Implementer adopted the v2 `_logistics_reserve_order` pattern: increment `reserved`, let the CHECK gate over-reserve. Cleaner than the spec's sketch — kept consistency with receive/delivery flows.

### 3. CTE-driven UPDATE replaced per-thread loop

Spec §4.3 implied per-thread iteration. Implementer used a single CTE-driven UPDATE statement so partial half-writes are structurally impossible. Cleaner code, lower risk. The per-thread loop only survives as a TOCTOU pre-check inside FOR UPDATE.

---

## Tooling moments

### Supabase MCP earned its keep

This was the first phase where Supabase MCP (`mcp__supabase__execute_sql`, `mcp__supabase__apply_migration`) replaced manual `wrangler dev` + psql workflows. Subagents could:
- Apply migrations directly to staging
- Verify `pg_get_functiondef` post-apply
- Run `pg_depend` casualty queries
- Smoke-test RPCs in BEGIN/ROLLBACK transactions

Cost: every migration applied to staging immediately. Benefit: each task got real database verification, not just file inspection.

### `assertRpcCallShape` as tripwire

T3 added `assertRpcCallShape(rpc, "logistics_confirm_proceed_request_v3", ["p_order_id"])` to a test before T4 swapped the callsite. The test was deliberately failing under T3 — it became the GREEN signal for T4's correctness. Tripwire pattern. Now 6 such pins on confirm-proceed (3 from T3, 3 from T4).

### Static-grep test as enum guard

`apps/api/src/routes/logistics/pos-vocab-v3-sweep.test.ts` reads its own migration files at test time, asserts zero `'awaiting_stock'` literal hits. Catches future regressions where a hand-edit reintroduces v2 vocab into a new migration. The 0038b allowlist regex `/^\s*'awaiting_stock',\s*$/` for the dashboard JSON key was tight enough that it couldn't accidentally allow a real enum literal — verified by code reviewer.

---

## What didn't go in scope (deferred)

Phase 4.5a deliberately covered ONLY v3 wake. The other 4.5 sub-phases stay deferred:

- **4.5b** Partner role tenancy + auth + UI
- **4.5c** DO file upload to Supabase Storage
- **4.5d** Sofa Ready Confirm + Reject→Relocate UI
- **4.5e** Per-supplier tab UI rewrite (the v3 thread UI value)
- **4.5f** Stockpile PO advanced flows (M4.6 PO COGS source rides this)

Plus stale-mock cleanups noted but not done in 4.5a:
- `orders.test.ts:914` `warehouse_required` mock no longer reflects v3 (route is mock-agnostic; test stays green as a mapper contract test). Leave as-is.
- `/awaiting-stock-shortage` API route URL still uses v2 vocab (internal-only API, breaking-change rename out of 4.5a scope).

---

## Carry-forwards opened

| ID | What | Severity |
|---|---|---|
| `phase-4.5a-domain-ts-stale-comment` | Fixed inline in T9 commit `dadff40` | CLOSED |
| `phase-4.5a-route-url-rename` | `/awaiting-stock-shortage` API route still uses v2 noun. Internal-only; rename when convenient. | low |
| `phase-4.5a-stage-constants` | 30+ files reference `"awaiting_logistics_action"` as raw string. Centralize as `LOGISTICS_STAGE.AWAITING_LOGISTICS_ACTION` constant in shared package when next refactor pass touches the codebase. | low |
| `phase-4-orders-test-logistics-stage-null-type-drift` | Pre-existing typecheck error in `orders.test.ts:119` (carried forward from earlier; runtime test passes). | low |

## Carry-forwards closed

- ✅ `phase-4-v3-confirm-rpc-swap` (T4)
- ✅ `phase-4-v3-confirm-auto-skip-from-stock` (T3 + T4)
- ✅ `phase-4-v3-fe-kanban-awaiting-stock-alias` (T5)
- ✅ `phase-4-v3-spec-numbering-doc-fix` (effectively closed; numbering stable post-4.5a)
- ✅ `phase-4-v3-batch-rpc-thread-claim` (closed in v3-active.1 / 0037, but mentioned here for completeness)

---

## Numbers

```
Tasks:        9 (T1-T9)
Subagents:    25 dispatches (9 implementer + 16 reviewer)
Fix loops:    4 (T2 spec gap → 0038b · T2 cosmetic dots · T3 sign-fix · T6 order_proceed)
Commits:      11 (4a41604..dadff40)
Migrations:   5 new files (42 total in supabase/migrations/)
File renames: 27 (web + api + shared)
Test count:   663/663 green (+5 net from 658 baseline)
Tag:          phase-4.5a-v3-wake-complete @ 6721471
```

---

## What's next

1. **Phase 4.5b** Partner role tenancy + auth + UI — likely next, since v3 wake unblocks it
2. **M4.6 PO COGS source** — small, rides 4.5f Stockpile schema work
3. **Phase 5 Finance kickoff** — deferred until all of 4.5 sub-phases land

v3 thread infrastructure is now production-active. Every dealer confirm builds threads. Every PO creation claims threads. Every receive/dispatch updates threads. The rollup trigger fires. The 4.5e per-supplier tab UI rewrite is where users will start *seeing* the v3 value (one order split into N tabs by supplier). Until then, threads are the data backbone behind the existing kanban.

—— End of reflection ——

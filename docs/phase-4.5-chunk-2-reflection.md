# Phase 4.5 Chunk 2 Reflection

> **Implementation period**: 2026-05-06 (single autonomous overnight run)
> **Tag pending**: `phase-4.5-chunk-2-complete` (T43)
> **Test baseline**: 731 → 840 (+109 net across Sprints A-G)
> **Commits in run**: 32 commits on `main` from `9aba0fd` (agenda) → `ada528e` (T38 E2E specs)

## 1. Estimated vs actual time

- **Original estimate** (master plan `2026-05-06-phase-4.5-chunk-2.md` line 378): "~41 tasks across 7 sprints" — explicit count, no wall-clock estimate (Chunk 1 burned ~14h overnight; same shape implied here).
- **Actual**: **43 tasks** (T9-T43 with T13.5 + T13.6 audit add-on; T1-T5 was Sprint A pre-autonomous-run executed earlier in the day before agenda lock). Two extra tasks (T13.5 + T13.6) emerged from the IRREVERSIBLE Sprint C audit and were essential — see §2.
- **Wall-clock**: this autonomous run started 2026-05-06 from `9aba0fd` (autonomous-run agenda commit at session start) and reached Sprint G T38 at `ada528e` over **~32 commits** in the run. Sprint A (T1-T5) was an earlier same-day sub-run before agenda lock; the autonomous overnight phase covered Sprint B onward.
- **Variance vs Chunk 1**: Chunk 2 had fewer dialogs but more cross-layer (DB → RPC → Hono → web → tests) refactors. Chunk 1 was 49 implementer dispatches + 7 migrations; Chunk 2 was ~32 commits + 8 migrations (0049-0056). Compute time felt similar; cross-task contract verification was lighter because the patterns from Chunk 1 carried through cleanly (see §5).

| Sprint | Tasks | Commits in run | Test delta |
|---|---|---|---|
| A (pre-autonomous, earlier same-day) | T1-T5 | 5 | 731 → 733 (+2) |
| B (RPC rewrites + thread reads) | T6-T11 | 5 | 733 → 771 (+38) |
| C (IRREVERSIBLE 0052 + 0053 + T8') | T12-T16 + T13.5 + T13.6 | 3 | 771 → 771 (rename-only, no test count delta) |
| D (stockpile thresholds) | T17-T23 | 6 | 771 → 800 (+29) |
| E (COGS + cost_source) | T24-T30 | 6 | 800 → 819 (+19) |
| F (tab UI shell + suppliers prep) | T31-T37 | 6 | 819 → 840 (+21) |
| G (E2E + reflection + §17) | T38-T43 | 1 (+ this doc) | 840 (+3 fixme E2E specs) |

## 2. Migration order surprises

Chunk 2 shipped 8 migrations: **0049 → 0050 → 0051 → 0052 → 0053 → 0054 → 0055 → 0055b → 0056**. The interesting ones:

### Sprint A: 0049 → 0050 (additive foundation)
Clean. 0049 added 5 nullable customer-leg columns + partial index `ost_rfd_pending_idx` on `order_supplier_threads`. 0050 backfilled from PO. Backfill row count: **0 rows updated** on staging — expected, no live LP threads on partner-tagged POs yet (LP test users still pending Loo's local seed from Chunk 1). Idempotent guard `WHERE t.delivery_partner_id IS NULL` lets re-run post-seed fill correctly.

### Sprint B: 0051 (4 customer-leg RPCs, not 8)
Master plan §Sprint B listed 8 RPCs to rewrite. Reality: only 4 customer-leg RPCs (`logistics_partner_accept_rfd`, `logistics_partner_reject_rfd`, `logistics_dispatch_customer_leg`, `logistics_resume_dispatch`) landed in 0051. The **4 procurement-leg RPCs** (`logistics_assign_partner_and_dispatch`, `lp_accept_inbound_delivery`, `lp_reject_inbound_delivery`, `logistics_receive_po_with_do`) had to defer to Sprint C T13.5 in `0053_logistics_rpcs_chunk2_part2.sql` because their bodies needed to land **after** the column rename in 0052. Split file = correct call. Commit: `a9ff78e`.

### Sprint C: T13.6 audit caught two silent killers
This was the highlight surprise of the whole chunk. The original spec said 4 procurement-leg RPCs needed rewriting in 0053. Before applying 0052 IRREVERSIBLE, I ran an exhaustive sweep of every plpgsql function body that referenced any of the 5 affected `purchase_orders` columns (5 dropped + 1 renamed). The audit (preflight-notes lines 166-265) found **two more**:

1. **`logistics_relocate_warehouse` (0045:351)** — actively wired into `lp-inbound.ts:69` + `WarehouseRelocateDialog.tsx`. Body referenced `delivery_partner_id`. Would have failed at every relocate call post-0052.
2. **`enforce_partner_po_column_whitelist()` (0046:64)** — TRIGGER FN that fires `BEFORE UPDATE` on `purchase_orders` for **every role**. References `NEW.delivery_partner_id` (renamed) and `NEW.request_for_delivery_at` (dropped). Would have broken every UPDATE on the table for every role, not just LP.

Both were appended to 0053, growing it from 4 → **6 entries** (5 RPCs + 1 trigger fn). The trigger function fix had a hidden bonus: it implicitly tightened the LP whitelist to a single allowed column (`customer_rejection`), since 3 of 4 originally-allowed columns were dropped by 0052. Functionally a no-op for current LP code paths since LP no longer touches PO at all in Chunk 2. Commit: `92f3dd6`.

### Sprint C: 0052 first-attempt failed (constraint predicate fix)
First `apply_migration` of 0052 failed with `23514: check constraint "po_outsource_xor_procurement_partner" of relation "purchase_orders" is violated by some row`. Root cause: master plan T14 spec used **strict XOR** (`(procurement_partner_id IS NULL) <> (outsource_partner_name IS NULL)`) but staging had **4 of 6 PO rows with both columns NULL** (legitimate pre-assign state — the assign RPC sets one of the two on first dispatch). Original 0030:75 used **at-most-one** semantics (`OR`) which permits both-NULL. Migration tx aborted atomically; verified no schema state drift via `pg_constraint` + `information_schema.columns` + `pg_indexes`.

Fix: align the new constraint to the original "at most one" semantics — swap `<>` for `OR`. The runtime XOR enforcement stays in the `logistics_assign_partner_and_dispatch` RPC body (0053 entry #1 lines 129-133). Table-level CHECK is the wider invariant; RPC is the narrower runtime gate. Commit: `92f3dd6`.

### Sprints D / E / F: 0054 → 0055 → 0055b → 0056 (additive, no surprises)
All four migrations applied cleanly on first attempt. 0055b is a sub-numbered companion to 0055 — extends `_logistics_create_po_inner` helper (0038:84-175) to validate `cost IS NULL OR cost_source IS NULL → RAISE EXCEPTION USING ERRCODE='22023', DETAIL='cost_required'` per input line. Authored as a separate migration file for audit-grep visibility. The two public wrappers `logistics_create_po` + `logistics_create_pos_batch` recreated via `CREATE OR REPLACE` (pure pass-throughs preserved).

## 3. Drift between spec v1 + actual schema

| Spec ID | Spec position | Delivered | Drift? |
|---|---|---|---|
| **CQ1** | Per-leg LP split: customer-leg moves to threads, PO renamed `delivery_partner_id → procurement_partner_id` | Delivered as designed (0049 + 0051 + 0052 + 0053). 4 customer-leg PO timestamps dropped. | ✅ None |
| **CQ2** | Stockpile thresholds: `stock_balances.low_threshold` + `high_threshold`, both nullable, both with non-negative CHECK | Delivered as designed (0054). | ⚠ Minor — see below |
| **CQ3** | `cost_source` backfill: NULL legacy, RPC validates non-NULL on insert | Delivered as designed (0055 + 0055b). | ✅ None |
| **CQ4** | Tab routing: separate URLs `/logistics/procurement/{slug}` via React Router 7 nested routes | Delivered as designed (T34 + T35 mounted inside `LogisticsApp.tsx` — see below). | ✅ None |
| **CQ5** | Phase 6 prep: pre-add `suppliers.portal_enabled` + `suppliers.contact_email` | Delivered as designed (0056). | ✅ None |

### CQ2 minor drift: `high_threshold` not exposed on alerts RPC
Spec implied `logistics_stock_alerts()` would expose both `low_threshold` and `high_threshold` for the suggested-replenishment formula. RPC actually returns `low_threshold` only. T22 master plan formula was `qty = (high_threshold || low_threshold * 2) - effective`; collapsed to `low_threshold * 2 - effective` because RPC doesn't expose `high_threshold` and 0054 is committed. Carry-forward `phase-4.5-chunk-2-stock-alerts-high-threshold-expose` opened to revisit (additive, non-IRREVERSIBLE follow-up).

### CQ4 wiring detail: tab routes mounted inside `LogisticsApp.tsx`, not hoisted to `App.tsx`
Master plan T35 said "Update `apps/web/src/App.tsx` with nested routes". Reality: `App.tsx` already has a `/logistics/*` wildcard giving `LogisticsApp` full sub-route control. Mounted both `/logistics/procurement` + `/logistics/procurement/:slug` route entries inside `LogisticsApp.tsx` instead. Tab-state-based pattern preserved for the other 4 tabs (Overview, Warehouse, Orders, Customers). Direct URL `/logistics/procurement/hookka-sofa` lands on the HoOKkA Sofa tab (acceptance criterion met). Commit: `e005c3d`.

## 4. F1-F12-equivalent fixes

Chunk 1 had Codex F1-F12 as a 12-fix outside-voice review surface. Chunk 2 had no equivalent named fix series — the patterns from Chunk 1 carried through. The closest equivalents (in-flight corrections that mattered):

### T9 review pass (3 issues, 2 fixed in pass)
T9 review surfaced 3 Important issues during the Sprint B frontend thread reads:
1. **Nullable type widened too eagerly** — `OrderSupplierThread.logisticsStage` had been widened to `LogisticsStage | null`, but migration 0033 line 51 declares the underlying column NOT NULL. **Fixed in `0c578d3`** by replacing the inline union with the named `LogisticsStage` import — re-aligns the camelCase mirror with schema reality.
2. **Missing all-null test coverage** — no test for the case where all 5 customer-leg fields are NULL on a thread. **Fixed in `f82005e`** with an added test.
3. **Dead prop drilling** — minor, deferred to Sprint C T8'.

### T13.6 audit (2 high-severity gaps fixed)
See §2 above. Both `logistics_relocate_warehouse` and `enforce_partner_po_column_whitelist` rewrites added to 0053. Commit: `92f3dd6`.

### T14 IRREVERSIBLE constraint predicate fix
See §2 above. XOR → OR. Commit: `92f3dd6`.

### T26 wire-contract gap (camelCase ↔ snake_case)
RPC validation in 0055b depended on snake_case `cost_source`, but the API was sending camelCase `costSource` through verbatim from the zod schema. T29 closed the gap at the api edge in `pos.ts` POST `/` + POST `/batch` — reshape camelCase `costSource` → snake_case `cost_source` before calling the RPC (matches existing convention from POST `/:id/receive` `receivedQty → received_qty`). RPC continues to read snake_case. CLAUDE.md §9 boundary discipline preserved. Commit: `d1b1779`.

### T36 test consolidation (35 → 28 + 11 = 39 across new homes; net -1)
`LogisticsProcurement.test.tsx` (35 tests) deleted. `LogisticsProcurement.tsx` (component) deleted (no production imports remain). Tests redistributed:
- 17 tests landed in NEW `ProcurementTabContent.test.tsx` (shared rendering/interaction logic)
- 11 tests landed back in `CreatePOModal.test.tsx` (auto-fill / supplier-group / lines-table tests that had been over-reaching from the legacy LogisticsProcurement scope)
- HoOKkASofaTab.test.tsx +6 (channel-specific)
- 4 tests consolidated via `it.each` (catch-all sup_status guards merged)
- 1 test dropped (Esc-closes-CreatePOModal already covered by Modal.test.tsx)

Net: web 309 → 308 (-1). Commit: `c04841f`.

All other Sprint D/E/F tasks: **zero F-equivalent fixes** — Chunk 1 patterns held cleanly. No outside-voice round was triggered mid-chunk; Codex review is scheduled for T42 against `ab26b43..HEAD` post-reflection per autonomous-run agenda.

## 5. Top 3 lessons

### Lesson 1: Audit-driven safety > spec-driven safety

T13.6 saved the system. The spec said 4 RPCs to rewrite in 0053; the audit found 6 (4 + `logistics_relocate_warehouse` + `enforce_partner_po_column_whitelist` trigger fn). Without that audit pass, the trigger function alone would have broken every UPDATE on `purchase_orders` for every role — not just LP — at the moment 0052 applied.

**The mechanism**: `pg_proc.prosrc` stores plpgsql function bodies as TEXT. They don't recompile on `ALTER TABLE … RENAME COLUMN` or `… DROP COLUMN`. The function body's column references are validated at CALL time, not at DDL time. Postgres's CREATE OR REPLACE doesn't catch this either — only running the function does.

**Takeaway**: when an IRREVERSIBLE migration touches column names, an exhaustive `grep -nE "<col-pattern>"` audit across all `supabase/migrations/*.sql` (including TRIGGER function bodies and dead-code functions that might still be referenced from `sops.ts` SOP maps) is mandatory before apply, even if the spec is explicit about which RPCs to rewrite. Spec authors can miss trigger functions because triggers fire silently.

下次 IRREVERSIBLE schema动作前，先跑一轮 `pg_proc.prosrc` 全文扫描，spec 写的 allowlist 不够 — 一定要 grep 兜底。

### Lesson 2: Wire contract discipline matters at the camelCase / snake_case boundary

T26 (Sprint E) added `cost_source` validation inside the RPC body, but the API was forwarding camelCase `costSource` from the zod schema to the RPC verbatim. The validation would have always fired (because the snake_case key was always missing) until T29 caught it during integration testing.

**The mechanism**: Hono receives JSON from browser (camelCase per `lib/api.ts` convention). Zod schemas in `packages/shared/src/schemas/*` mirror that camelCase. The RPC reads snake_case (Postgres convention). The api edge is the boundary that must reshape — and there's no compiler to catch a missed reshape because both sides are typed `unknown` after JSON parsing.

**Takeaway**: when adding new fields that flow through the api edge to an RPC, audit the api-edge reshape AT THE TIME of adding the field, not deferred to integration testing. The convention is established (existing `receivedQty → received_qty` in POST `/:id/receive`) — apply it consistently.

下次 RPC 加字段，api 边界的 camelCase → snake_case 转换要跟着字段一起加，不要等集成测试时才发现。

### Lesson 3: Convert STOP gates to "log + proceed" only with explicit single-instance authorization

The autonomous run started with §1 of `2026-05-06-phase-4.5-chunk-2-autonomous-run.md` — Loo's explicit single-instance pre-approval to convert two normally-blocking STOP gates to log-and-proceed:
1. T13 IRREVERSIBLE migration approval (CLAUDE.md §14 #1 + #7)
2. Carry-forward additions during the run (no need to wake Loo for each)

Without that pre-approval, T13 would have woken Loo up at 03:00 to confirm DROP COLUMN on 4 columns + RENAME on 1. The pre-approval made the autonomous run possible — but the audit trail (cite §1 in commit body) is the price.

**The mechanism**: CLAUDE.md §14 #7 reads "User said OK before is NOT permission — it must be explicit in current conversation". The autonomous-run agenda IS the current conversation for an overnight run. §1 is dated, signed, and visible in `git log` for audit. Future runs reading a different conversation context would not be covered.

**Takeaway**: STOP gates should default to actually stopping. Converting them to "log + proceed" requires the pre-approval to be scoped to the run (not blanket), dated (explicit single instance), and cited in every commit body that exercises it. The §1 mechanism is reusable for future autonomous runs but should never be the default.

下次 overnight run，agenda 里把 STOP gate 转 log-and-proceed 这件事写明白：scope 到当次 run，commit body 引用 §1。CLAUDE.md §14 红线不能默认绕过。

---

## Carry-forwards opened in Chunk 2

| ID | Severity | Surfaced |
|---|---|---|
| `phase-4.5-chunk-2-route-mount-middleware-leak` | medium | T10 spec review |
| `phase-4.5-chunk-2-stale-pre-0051-rpcs` | medium | T13.6 audit |
| `phase-4.5-chunk-2-partner-rfd-page-rebuild` | medium | T8' |
| `phase-4.5-chunk-2-dispatch-dialog-wiring-drift` | low | T8' grep |
| `phase-4.5-chunk-2-seed-sql-stale` | low | T8' grep |
| `phase-4.5-chunk-2-alerts-tab-routing` | low | T21 |
| `phase-4.5-chunk-2-stock-alerts-high-threshold-expose` | low | T22 |

## Carry-forwards closed in Chunk 2

- `phase-4.5-procurement-vs-delivery-partner-field-split` ✅ closed by Sprint A-C (CQ1)
- `phase-4.5-supplier-tab-ui-rewrite` ✅ closed by Sprint F (CQ4)
- `phase-4-v3-stockpile-advanced-flows` ✅ closed by Sprint D (CQ2)
- `phase-9-po-cogs-source` ✅ closed by Sprint E (CQ3)
- `phase-4-detail-partner-name-join` ✅ closed bonus during T9 (Sprint B) — pill renders 8-char UUID slug; full partner-name resolution remains separate concern out of Chunk 2 scope

## Next phase

- **Immediate**: T40 (CLAUDE.md §17 update) → T41 (final feature commit) → T42 (codex review against `ab26b43..HEAD` + fix all in-scope comments via fresh subagents) → T43 (annotated tag `phase-4.5-chunk-2-complete`, do NOT push). Loo confirms tag push manually.
- **Phase 5 Finance kickoff** — starts after Phase 4.5 fully complete. Separate spec + plan. Per `CARRES_PORTAL_V2_PLAN.md` §8.
- **Open carry-forwards to triage in Phase 5 prep**: `lp-whitelist-tighten`, `cleanup-old-partner-confirm-receive`, `cleanup-at-own-wh-waiting-rename`, the 7 new Chunk 2 carry-forwards above.

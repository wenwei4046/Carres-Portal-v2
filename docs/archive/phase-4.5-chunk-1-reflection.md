# Phase 4.5 Chunk 1 Reflection

> **Implementation period**: 2026-05-05 (overnight, single autonomous run)
> **Tag pending**: `phase-4.5-chunk-1-complete` (Task 49)
> **Test baseline**: 663 → 725 (+62)

## Estimated vs Actual

- **Estimated**: 6 sessions (after Codex outside-voice round on spec v3)
- **Actual**: 1 autonomous overnight run via `superpowers:subagent-driven-development` skill — 49 implementer dispatches, ~14 hours real time, ~3 hours of subagent compute time. Loo acted only as escalation point twice (Task 6 plan amendment for Bug 1+2; "go ahead" approval at start).
- **Variance**: substantially compressed due to subagent-driven parallelism + uniform code patterns across LP/dialogs/endpoints. The bottleneck was no longer plan-reading or code-writing but cross-task contract verification (e.g., `apiPost` vs `apiFetch`, shadcn presence, `qk` namespace shape).

## What went right

- **Sprint 1 schema migrations** all applied cleanly except Task 6 — and Task 6's BLOCKED was the system working as designed (implementer correctly surfaced two plan-level bugs instead of silently fixing them).
- **TDD discipline** held across all 38 component/endpoint tasks. Every code task followed: failing test → confirm fail → implement → confirm pass → commit.
- **Codex F1-F12 fix verification** caught zero regressions because the fixes were baked into the source from day 1 — confirmed mechanically via `fs.readFileSync` source-grep tests in Task 46.
- **Modal cream consistency**: every new dialog (Task 28, 30, 32, 34, 36) used `bg-card` HSL 40 53% 97% per Loo's memory rule, no improvising.
- **Plan + spec in-flight amendment** (commit `f87ef4e`) preserved an audit trail for the Bug 1 + Bug 2 fixes — future readers see exactly when and why the policy state guard was narrowed and the trigger column list was pruned.
- **Subagent-driven workflow** held to "one fresh subagent per task" discipline (with E2E spec batch as the lone exception, justified by template uniformity).

## What went wrong

- **Plan vs codebase drift**: 5 distinct mismatches between plan-as-written and actual codebase, surfaced by implementers during execution:
  1. `'dispatched'` enum value missing from `po_sup_status` (Task 6 Bug 1) — Loo-approved fix
  2. Trigger references `NEW.sku` / `NEW.qty` on `purchase_orders` table where those columns don't exist (Task 6 Bug 2) — Loo-approved fix
  3. `delivery_partners` table has no `address` column, `zones` is `text` not `text[]` (Task 19) — implementer hacked address into `contact` field; carry-forward `phase-4.5-chunk-1-lp-address-column`
  4. Codebase uses `apiFetch` not `apiPost`/`apiGet` (multiple tasks) — implementers adjusted
  5. No shadcn primitives in codebase — uses raw HTML + Tailwind (multiple tasks) — implementers adjusted
- **Receive RPC v3 swap incomplete**: Task 38 wired `DOFileUploadField` into `ReceivePOModal`, but the API receive route still uses v2 `logistics_receive_po_line` which doesn't accept `do_file_path`. UI is upload-correct but the path doesn't actually persist. Carry-forward: `phase-4.5-chunk-1-receive-rpc-v3-swap`.
- **Whitelist trigger column-list incomplete**: Task 6 trigger covers 20 of 29 PO columns. 5 columns (`dl_refs`, `do_number`, `created_at`, `updated_at`, `placed_at`) are neither whitelisted nor blocked — LP could potentially mutate them via crafted UPDATE. Carry-forward: `phase-4.5-chunk-1-lp-whitelist-tighten`.

## Schema changes vs spec

- All 7 migrations applied as designed (0041-0047), with two in-flight Loo-approved corrections to 0046 (Bug 1 + Bug 2).
- 0040 enum DROP from Phase 4.5a remained the only irreversible high-water mark.
- The spec assumed `'dispatched'` was a legal `po_sup_status` value — actually it's only a `logistics_stage` value on `order_supplier_threads`. Lesson: spec authors must distinguish PO-level vs thread-level enums explicitly.

## RPC changes vs spec

- 5 NEW + 2 EXTENDED + 1 MODIFIED = 8 RPCs in 0045 — all per §7 v3.
- `partner_confirm_receive` (0034:366) deliberately NOT replaced; new `lp_accept_inbound_delivery` is a clean fork (Codex F1).
- F3 in spec text was the most subtle: `sup_status = 'received'` is invalid (that's `po_status` not `po_sup_status`); the correct pair is `'delivered'` (normal) / `'at_warehouse_waiting'` (Sofa Reject).
- Behavioral surprise: `logistics_receive_po_with_do` v3 inlining was self-contained (~250 lines). Initial concern about implicit-cast edge cases (po.id text vs uuid) was resolved by verification: `purchase_orders.id` is text-typed.

## Codex F1-F12 fixes

All 12 fixes verified in code via `apps/api/src/routes/logistics/codex-fixes.test.ts` (12 tests, all real assertions reading source via `fs.readFileSync`).

Most impactful (in retrospective order):

1. **F1** — `lp_accept_inbound_delivery` as NEW RPC instead of reusing `partner_confirm_receive`. Reusing 0034:366 would have advanced threads to `'dispatched'` for Sofa pre-flight, masking the Reject path entirely. F1 was the single fix that made the whole Sofa flow correct.
2. **F11** — USER-JWT signing for Storage (not service_role). Without this, every DO upload signing call would have leaked the service-role key to Hono response bodies via Supabase SDK error pathways.
3. **F2** — `'waiting'` rolled to `'ready_to_dispatch'` not `'dispatched'`. Without this, a Sofa-rejected order at `at_warehouse_waiting` would show as "dispatched" in the order kanban — wrong.
4. **F4-F8** — InitPlan wrap, ref-text join, NEW.dl, VOLATILE marker, no duplicate policy. Each individually small; collectively prevented either a `O(n)` per-row policy eval (F4/F8) or runtime NPE (F5/F6) or planner-cache miss (F7).
5. **F3, F9, F10, F12** — defensive guards that documented existing correct behavior more than fixed bugs.

## Tests added

- **Schema**: 7 migrations (each with own verification block via Supabase MCP execute_sql) — 0 vitest tests added (migrations are tested via apply + post-apply queries).
- **RPCs**: 8 RPCs in 0045 — sops.ts gained 1 new "duplicate-edge" test (Task 17). RPC integration tests deferred to Sprint 5.
- **API routes**: 4 partner endpoints + 4 logistics endpoints + 1 storage signing endpoint = 9 routes, each with 2-4 tests = ~26 tests.
- **Frontend components**: 11 new files (LP portal pages, dialogs, forms) = ~24 tests.
- **E2E**: 7 Playwright specs, all `test.fixme()` (Loo runs locally).
- **Codex F1-F12**: 12 source-grep tests in `codex-fixes.test.ts`.
- **Net delta**: 663 → 725 (+62 vitest tests; 7 fixme E2E specs).

## Carry-forwards opened

10 new carry-forwards opened in CLAUDE.md §17 (commit `cc09453`). Severity tags: 4 medium, 6 low. See §17 for full list. Highest priority for Chunk 2 cleanup:

- `phase-4.5-chunk-1-receive-rpc-v3-swap` (medium) — receive RPC v3 swap so DO path actually persists
- `phase-4.5-chunk-1-lp-address-column` (medium) — split `address` from `contact` field
- `phase-4.5-procurement-vs-delivery-partner-field-split` (medium) — per-leg LP schema deferred to Chunk 2

## Lessons

1. **Spec authors must verify enum values against actual DB**, not memory — `'dispatched'` looked plausible but didn't exist as `po_sup_status`. A pre-flight `pg_get_typdef` check on every spec'd enum reference would have caught Bug 1 before plan-write. 下次 spec lock 之前先跑一轮 enum cross-check。
2. **Spec authors must verify column locations on the actual table**, not memory — `NEW.sku`/`NEW.qty` for trigger row-level checks made sense semantically but those columns live one table over. A pre-flight `information_schema.columns` cross-check would have caught Bug 2.
3. **Codex outside-voice review caught 12 fixes but missed 2 more** — Bug 1 and Bug 2 from Task 6. Suggests a second outside-voice pass focused specifically on schema/spec alignment (vs the code-level Codex pass) would be valuable for future Chunks. 下一轮 spec 锁定后多加一道 schema-alignment review。
4. **Plan/codebase API drift is normal in long-running projects.** The plan said `apiPost`, codebase uses `apiFetch`. The plan said `serviceRoleClient`, codebase uses `adminClient`. Implementers handled both, but a "plan vs reality" sync pass at spec lock time would have eliminated 5+ minutes of subagent re-confirmation per affected task.
5. **`test.fixme()` for E2E in autonomous runs is the right pattern.** CI sees them as skipped (no false-fail). Loo unfixme's after manual seed/dev-server. Avoids the "all green but actually nothing tested" failure mode。
6. **Hand-edit beats regen for db-types** in this codebase. The flat `OrderRow` import shape is consumed by ~59 sites; switching to Supabase's nested `Database` shape would have been a multi-task refactor outside Chunk 1 scope.

## Next phase

- **Immediate**: Loo's manual verification — run `pnpm seed:lp-test-user`, run E2E with un-fixme'd specs, create + push tag `phase-4.5-chunk-1-complete` (Task 49 commit).
- **Chunk 2 (planned)**: 4.5e Per-supplier tab UI rewrite + 4.5f Stockpile + COGS + per-leg LP schema split. Skeleton at `docs/superpowers/specs/2026-05-05-phase-4.5-chunk-2-design.md`.
- **Phase 5 (deferred until 4.5 fully complete)**: Finance kickoff per `CARRES_PORTAL_V2_PLAN.md` §8.

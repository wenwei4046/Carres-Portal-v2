# Phase 4 v3 — Execution Plan (overnight run 2026-05-05)

> **Status:** EXECUTING — Loo authorized full overnight run 2026-05-05 night.
> **Source spec:** `docs/superpowers/specs/2026-05-04-phase-4-v3-spec.md` §17.3 binding plan.
> **Approvals captured:** Migration apply 0026–0033 to staging Supabase project_id `kfprgpjpaffedghytstl` via `mcp__supabase__apply_migration`; direct-to-main commits; push-per-task; subagent-driven-development with all subagents on `model:"opus"`; final tag `phase-4-v3-complete`.

---

## Sprint summary

| Sprint | Status | Schema? | Sessions |
|---|---|---|---|
| **v3-S1** | ✅ DONE 2026-05-05 | docs only | 1 |
| **v3-S2** | ✅ DONE 2026-05-05 | no schema | 1 |
| **v3-S3** | NEXT | yes (0026-0031) | 1-2 |
| **v3-S4** | pending | yes (0032-0033) | 1-2 |
| **v3-S5** | pending | yes (0034 rollup) | 1 |

---

## v3-S1 [✅ DONE]

Commit `370d4f3` — fixed 7 Codex bugs in v3 spec doc (po_id text vs uuid, drop `logistics_partner` enum addition, 0029 no-op, ALTER TYPE idempotent guards, cat_covered → product_models.category, drop destination_warehouse_id dual-field, auto-detect race FOR UPDATE guard).

Follow-up commit (this plan's prep): backfill supplier name corrected from `'Nice Future Mattress'` → `'Nice Future'` (matches seed.sql:51); SET NOT NULL guarded so fresh-dev path doesn't break.

---

## v3-S2 [✅ DONE]

Commits: `d47db5d`, `1286ac8`, `a753a55`, `73187d3`, `8dce9c3`.

Tests: 568 → 605 (+37). Migrations unchanged (still 25). Subagent skill flow used: implementer → spec reviewer → code reviewer → fix loops where needed.

Tasks delivered:
- v3-S2.1 — Auto-fill endpoint po-existence filter (open POs exclude awaiting_stock orders covered by `dl` or `dl_refs`)
- v3-S2.2 — Drop sup_status='delivered' gate on Receive button (own_logistics path unblocks)
- v3-S2.3 — Receive PO button inside PoDetailModal (gated by same eligibility rule)
- v3-S2.4 — AssignPickupDialog warehouse picker (UI + zod + API plumb; RPC binding deferred to v3-S4)

Carry-forwards added (per code reviews):
- `phase-4-v3-receive-eligibility-extract` — extract shared `canReceivePo` helper before v3-S3 enum expansion
- `phase-4-warehouse-picker-dedupe` — extract shared `<WarehousePickerSection>` after v3-S3 Outsource toggle work
- `phase-4-warehouse-picker-kind-filter` — filter list by `warehouses.kind` once v3-S3 ships that column

Outsource toggle + Print DO surface (originally listed in §17.3 v3-S2) **deferred to v3-S3** because they need `outsource_partner_*` columns (schema work; v3-S2 is no-schema).

---

## v3-S3 [NEXT] — Schema migrations + SOP TS module + Outsource UI

### Estimate: 1-2 sessions

### Migration files to write

| # | File | What |
|---|---|---|
| 0026 | `0026_product_skus_supplier_id.sql` | ADD COLUMN nullable + index. Backfill via DO block per spec §3.1 (fixed 2026-05-05). SET NOT NULL guarded. |
| 0027 | `0027_warehouses_kind.sql` | NEW enum `warehouse_kind` (`'own' \| 'logistics_partner'`) + ADD COLUMN `kind` NOT NULL DEFAULT 'own' + ADD COLUMN `owning_partner_id uuid` FK + check constraint per spec §3.2 |
| 0028 | `0028_logistics_stage_v3.sql` | Idempotent ADD VALUE 'awaiting_logistics_action' BEFORE 'awaiting_stock' + 'waiting' AFTER 'dispatched'. UPDATE rebrand 'awaiting_stock' rows. Per spec §3.3 (post v3-S1 fix). |
| 0029 | `0029_app_role_partner_no_op.sql` | NO-OP placeholder per Codex bug 2 fix. RAISE NOTICE only. |
| 0030 | `0030_po_sup_status_v3.sql` | Idempotent ADD VALUE x6 (ready_confirm_sent, partner_confirmed, customer_rejected, relocated, at_partner_wh, at_own_wh_waiting). NEW columns: ready_confirm_at, partner_confirmed_at, customer_rejection jsonb, do_file_path, do_uploaded_at, do_uploaded_by + outsource_partner_name, outsource_partner_contact, outsource_partner_zones + po_outsource_xor_partner CHECK. Per spec §3.5 + §3.6. |
| 0031 | `0031_rls_policies_v3.sql` | RLS policies for `partner` role: partner_sees_own_po (per spec §3.4 RLS template), partner_sees_own_po_lines, partner_sees_own_warehouses (where owning_partner_id = my partner_id). Wrapped per CLAUDE.md §8.2 Fix 2; uses STABLE helpers per Fix 3. |

### Apply order (Loo pre-authorized)

```
mcp__supabase__apply_migration project_id=kfprgpjpaffedghytstl name=v3_s3_0026 query=(0026 contents)
... 0027 ... 0028 ... 0029 ... 0030 ... 0031
```

### Then regenerate types

```
mcp__supabase__generate_typescript_types project_id=kfprgpjpaffedghytstl
→ overwrite packages/shared/src/db-types.ts
```

### Code tasks after migrations apply

| # | Subagent task | Files |
|---|---|---|
| S3.1 | Write 6 migration files (above) | `supabase/migrations/0026-0031.sql` |
| S3.2 | Apply via MCP, regenerate db-types | `packages/shared/src/db-types.ts` |
| S3.3 | Add SOP TS module (`SOP_STANDARD`, `SOP_SOFA_SPECIAL`, `SUPPLIER_SOP`, `sopFor()`) per spec §4.3 | `packages/shared/src/sops.ts` + `sops.test.ts` |
| S3.4 | Update `assignPickupPartnerInput` zod to accept optional outsource fields | `packages/shared/src/schemas/logistics.ts` + `.test.ts` |
| S3.5 | AssignPickupDialog — add Outsource toggle UI (synthetic last partner option `+ Outsource (one-time)`); when selected, reveal name/contact/zones inputs; submit sends outsource_* fields | `apps/web/src/pages/logistics/components/AssignPickupDialog.tsx` + test |
| S3.6 | API route — extend body parsing to accept outsource fields; capture but DON'T pass to existing RPC (`logistics_assign_pickup_partner` doesn't accept; v3-S4 will swap to `logistics_assign_partner_and_dispatch`). Comment per v3-S2.4 pattern. | `apps/api/src/routes/logistics/pos.ts` + test |
| S3.7 | Print DO link surface — when Outsource selected and Assign succeeds, show toast with "Print DO for [name]" link (opens existing `/api/logistics/pos/:id/print` PDF endpoint) per spec §8.3 | `AssignPickupDialog.tsx` (toast handler) |
| S3.8 | Update CLAUDE.md §17 status (v3-S3 done; carry-forwards) | `CLAUDE.md` |
| S3.9 | Sprint final reviewer + `/review` skill (gstack) | — |
| S3.10 | Tag commit (no git tag — v3 sprints don't tag individually; final tag is v3-S5) | — |

### Critical decisions for v3-S3

- **Outsource columns** (`outsource_partner_name`, `outsource_partner_contact`, `outsource_partner_zones`) land on `purchase_orders` per spec §3.6 Q7B (don't pollute `delivery_partners` master table). XOR check via `po_outsource_xor_partner`: if outsource_partner_name is set, delivery_partner_id MUST be null (and vice versa).
- **0029 stays as no-op** (RAISE NOTICE) — slot kept so 0030-0031 numbering is unchanged. Per Codex bug 2 fix.
- **0026 SET NOT NULL is conditional** so fresh dev path (suppliers empty at migration time) doesn't break. Tighten in a follow-up post-seed migration (carry-forward `phase-4-v3-skus-supplier-id-not-null-tighten`).
- **0027 default kind='own'** — all existing warehouses become `kind='own'` on apply. owning_partner_id stays NULL. No partner-WH rows exist yet.
- **0031 RLS policies** are NEW (additive). Use existing `auth.app_role()` + add `auth.app_partner_id()` if not present.
- **Outsource UI** — when toggle selected, partner select disabled. Validation: outsource_partner_name + contact required (zones optional).

### Risks for v3-S3

- Migration 0028 ALTER TYPE ADD VALUE rebrand UPDATE: if production has many `awaiting_stock` rows, the UPDATE could be slow. Mitigation: single statement, indexed by stage anyway, expected fast.
- 0030 outsource columns: nullable (to not break existing rows). Existing POs continue working with null outsource.
- 0031 partner role RLS: `partner` role already exists in seed (line 382: `'supplier@carres.com', 'Alex · HoOKkA', 'supplier'`). Wait — that's `supplier` role. Need to verify `partner` role test users exist. If not, defer partner role testing to v3-S7/Phase 4.5.

---

## v3-S4 — Threads + RPCs + stockpile mode

### Estimate: 1-2 sessions

### Migration files to write

| # | File | What |
|---|---|---|
| 0032 | `0032_order_supplier_threads.sql` | NEW table per spec §4.4 (after v3-S1 fix: `po_id text` not uuid). Indexes (ost_order_idx, ost_supplier_stage_idx). UNIQUE (order_id, supplier_id, category). |
| 0033 | `0033_logistics_rpcs_v3.sql` | NEW RPCs per spec §4.5 + §6.4 race guard (FOR UPDATE on threads). Functions: `logistics_confirm_proceed_request_v3`, `logistics_supplier_ready_confirm`, `partner_confirm_receive`, `partner_reject_customer`, `logistics_relocate_warehouse`, `logistics_receive_po_with_do`, `logistics_assign_partner_and_dispatch`, `logistics_attach_pod_do`. All STABLE/SECURITY DEFINER per CLAUDE.md §8 Fix 3. |

### Migration ordering deviation from spec §17.2

Spec §17.2 (Codex bug 3 fix) pinned `0032 rpcs_v3 / 0033 threads`. **We swap**: `0032 threads, 0033 rpcs_v3`. Reason: RPCs reference threads table FK, so threads must be created first (Postgres applies migrations in filename order). The numerical pin from Codex was a literal recommendation that conflicts with FK ordering; the spirit (sequential numbering, no skipped slots) is preserved.

Document deviation in commit message + add a one-line note to spec §17.2.

### Code tasks for v3-S4

| # | Task | Files |
|---|---|---|
| S4.1 | Write migration 0032 (threads table) | `supabase/migrations/0032_order_supplier_threads.sql` |
| S4.2 | Write migration 0033 (RPCs v3) — large file, ~1000 lines | `supabase/migrations/0033_logistics_rpcs_v3.sql` |
| S4.3 | Apply via MCP, regenerate db-types | — |
| S4.4 | Wire `AssignPickupDialog.warehouseId` from v3-S2.4 captured-but-unwired to `logistics_assign_partner_and_dispatch` RPC | `apps/api/src/routes/logistics/pos.ts` |
| S4.5 | Stockpile PO mode in CreatePOModal — allow no-dl POs explicitly (per spec §17.1 A3) | `apps/web/src/pages/logistics/components/CreatePOModal.tsx` |
| S4.6 | Update Auto-fill endpoint to use threads.po_id IS NULL filter (replaces v3-S2.1 dl/dl_refs filter once threads exist) | `apps/api/src/routes/logistics/pos.ts` |
| S4.7 | RPC integration tests (vitest + msw mocks) | `apps/api/src/routes/logistics/pos.test.ts` |
| S4.8 | Sprint final reviewer + `/review` skill | — |

### Critical decisions for v3-S4

- **T1=A delete v2 tests + rewrite v3** (per spec §17.1) — but ONLY for tests of RPCs that v3 directly replaces. Keep tests for unchanged endpoints.
- **Auto-fill v3 upgrade**: the v3-S2.1 dl/dl_refs filter is preserved as a fallback when threads don't exist for an order yet (e.g., orders placed before v3-S4 deploy). After threads land, primary path is `threads.po_id IS NULL`.
- **`logistics_assign_partner_and_dispatch`** is the v3 replacement for `logistics_assign_pickup_partner`. Old RPC stays callable (no DROP); FE switches to new RPC. Per CLAUDE.md §13.2 backwards compat strategy.
- **Atomic claim** (Codex bug 7 fix): `logistics_create_pos_batch` extended with `SELECT FOR UPDATE` on threads + `concurrent_claim` SQLSTATE 40001. Per spec §6.4.

### Risks for v3-S4

- 0033 RPCs file is ~1000 lines per spec estimate. Subagent might need extra context. Consider splitting RPCs into multiple subagent dispatches (e.g., S4.2a = thread-aware confirm + receive RPCs; S4.2b = partner + relocate RPCs).
- Mocking thread-aware RPCs in tests is more complex. May need new mock helpers in `pos.test.ts`.
- Stockpile PO mode UI might need a toggle in CreatePOModal — keep it minimal (checkbox "Stockpile PO (no order ref)") to fit "1 session" estimate.

---

## v3-S5 — Rollup + cleanup + tag

### Estimate: 1 session

### Migration files to write

| # | File | What |
|---|---|---|
| 0034 | `0034_orders_rollup_stage.sql` | CREATE OR REPLACE FUNCTION orders_rollup_stage(p_order_id uuid) RETURNS logistics_stage LANGUAGE sql STABLE per spec §4.4. Trigger on order_supplier_threads UPDATE/INSERT/DELETE that updates orders.logistics_stage via this function. |

### Code tasks for v3-S5

| # | Task | Files |
|---|---|---|
| S5.1 | Write migration 0034 (rollup function + trigger) | `supabase/migrations/0034_orders_rollup_stage.sql` |
| S5.2 | Apply via MCP | — |
| S5.3 | Verify dealer-side reads still work (DealerOrders, OrderDetailDrawer) — they read `orders.logistics_stage`; rollup keeps that field populated | manual smoke or test |
| S5.4 | CLAUDE.md §17 cleanup: remove v3-S2/v3-S3/v3-S4 done items from carry-forward list; add Phase 4.5 deferred items per spec §17.4 | `CLAUDE.md` |
| S5.5 | Write `phase-4-v3-reflection.md` per CLAUDE.md §6.5 | new doc |
| S5.6 | Grand final reviewer + `/review` skill | — |
| S5.7 | Tag `phase-4-v3-complete` | git tag |

### Critical decisions for v3-S5

- **Rollup logic per spec §4.4**: returns 'placed' if no threads, 'delivered' if all threads delivered, 'dispatched' if all in dispatched/delivered/waiting, 'ready_to_dispatch' if all in ready_to_dispatch+, else 'awaiting_logistics_action'.
- **Trigger**: AFTER UPDATE OR INSERT OR DELETE on order_supplier_threads. Single-row update on orders table per affected order_id. Use COALESCE for OLD vs NEW.
- **No v2-cleanup migration in v3-S5** per binding plan (§17 is tighter than §1-16 §v3-S11). v2 RPCs + enum values + 6-col kanban UI all coexist post-v3. Cleanup deferred to Phase 4.5.

### Risks for v3-S5

- Trigger could cause cascading updates if not careful (UPDATE on orders triggers other triggers?). Mitigate: trigger uses `IS DISTINCT FROM` to skip no-op writes.
- Rollup function is STABLE — reads from threads table only. No race with writers (Postgres MVCC handles).

---

## Across-sprint commitments

### Subagent flow per task

1. **Implementer** (general-purpose, opus) — fresh context with full task spec + relevant code pasted; TDD; commits per task; Conventional Commits format with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
2. **Spec reviewer** (general-purpose, opus) — verifies code matches spec line-by-line; rejects extra work or missing pieces.
3. **Code quality reviewer** (`superpowers:code-reviewer`, opus) — checks single-responsibility, DRY tension, comment quality, edge cases, type safety.
4. **Fix loop** if reviewer finds issues — implementer (same instance via SendMessage where useful, or fresh dispatch) fixes; reviewer re-reviews until ✅.
5. **Mark task complete** in TaskList only after BOTH reviews pass.

### Push cadence (Loo Q3=A)

- Every commit pushed to origin/main immediately after each task completes.
- Loo wakes → can trace incremental progress on GitHub.

### Migration apply protocol

- Never apply a migration without it being committed to disk first (so source of truth is git, not just DB).
- Use `mcp__supabase__apply_migration` with the migration name + full SQL contents.
- After each apply, run a quick verification query (e.g., `mcp__supabase__execute_sql` to confirm enum values exist).
- After all migrations in a sprint apply, regenerate db-types and commit the regenerated file.

### BLOCKED handling

- Subagent reports BLOCKED → I retry once with more context (e.g., paste additional spec sections, RPC examples).
- Still BLOCKED → STOP autonomous run; write a status note for Loo with what was blocked, what was tried, recommended next action.
- Hard stop conditions: red-line conflict (DROP/TRUNCATE detected, unauthorized schema change requested by spec ambiguity), unrecoverable test failure, dependency mismatch.

### CLAUDE.md §17 update cadence

- After each sprint (S3, S4, S5) close, update §17 status block: phase progress, test count, migrations applied, carry-forwards added/removed.
- One commit per update. Push after.

### Test green policy

- Every commit must keep all tests green at HEAD.
- TDD: implementer writes failing tests → implements → verifies green.
- Pre-existing test failures (e.g., the orders.test.ts:119 typecheck issue from v3-S2) are documented but not fixed in this run unless they actively block.

### `/review` skill (gstack) usage

- Run at end of v3-S3 (schema introduced — backend safety review)
- Run at end of v3-S4 (RPCs introduced — RLS + trust boundary review)
- Run at end of v3-S5 (rollup function + trigger — final pre-tag safety pass)

### `/design-review` skill — SKIPPED for v3

v3 work is mostly state machine + RPC + minor UI tweaks (Outsource toggle, stockpile checkbox). Not significant new visual surface. Defer `/design-review` to Phase 4.5 when per-supplier tab UI rewrites land.

### Final tag

- After v3-S5 grand final reviewer passes, tag `phase-4-v3-complete` with annotated message summarizing v3 scope.
- Push tag to origin.

---

## Hard gates / red lines

- Migrations apply ONLY to staging Supabase project_id `kfprgpjpaffedghytstl`. Never to production.
- `SUPABASE_SERVICE_ROLE_KEY` never touched (per CLAUDE.md §4.4).
- No `DROP TABLE`, `TRUNCATE`, `DELETE FROM table` without per-conversation explicit approval. None planned for v3 (all migrations additive).
- `DROP FUNCTION` is allowed for `CREATE OR REPLACE` semantics (replaces existing v2 RPCs by name where v3 uses different name).
- `git push --force` never used.
- Every migration committed to disk BEFORE applying.

---

## Tracking

- Plan committed at start: this file (`docs/superpowers/plans/2026-05-05-phase-4-v3-execution.md`).
- CLAUDE.md §17 updated per sprint close.
- Final tag `phase-4-v3-complete` after v3-S5 done.
- Commit log on `main` is the audit trail; no separate progress file.

---

## Decision log (during run, append-only)

| Time (MYT) | Decision | Rationale |
|---|---|---|
| 2026-05-05 night | Loo authorized full v3 overnight run with blanket migration apply | Loo going to sleep; subagent-driven flow; all defaults accepted. |
| 2026-05-05 night | v3-S3 includes Outsource toggle (deferred from v3-S2) | Outsource needs `outsource_partner_*` columns; lands in 0030 with other PO column adds. |
| 2026-05-05 night | Migration ordering swap: 0032=threads, 0033=rpcs_v3 (vs spec §17.2 pin) | RPCs reference threads FK; Postgres applies in filename order. |
| 2026-05-05 night | Spec §3.1 backfill supplier name fixed: 'Nice Future Mattress' → 'Nice Future' | Match seed.sql:51 exactly to avoid migration failure. |
| 2026-05-05 night | Spec §3.1 SET NOT NULL guarded for fresh-dev path | Suppliers table empty at migration time in fresh dev; conditional avoids breakage. |

— End of execution plan —

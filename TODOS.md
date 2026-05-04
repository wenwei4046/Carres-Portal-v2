# TODOS

Deferred work captured during planning / review. Each item explains *why* it was deferred and *when* to revisit.

---

## RESOLVED

- phase-4-purchase-order-lines-rls-policies — RESOLVED 2026-05-04 in commit c6c4f07 via migration 0022_purchase_order_lines_rls (3 policies: scoped_read EXISTS-via-parent, logistics_insert, logistics_update; mirrors po_scoped_read pattern from 0002_rls.sql:241).

---

## pagination-deferred

**What**: Server-side pagination for `/api/principal/approvals` and `/api/principal/dealers` (and the corresponding UI infinite-scroll or page controls).

**Why deferred**: Current data volume is ~5 dealers + ~4 approvals (seed). Client-side filtering is fine. Pagination would be over-engineering today.

**Revisit when**: Either (a) Phase 9 go-live data load planning shows >50 dealers / >50 active approvals, or (b) page load time on these routes exceeds 500ms in production.

**Surfaced by**: `/plan-eng-review` on `docs/superpowers/specs/2026-05-03-phase-3-principal-mvp-design.md` (finding A3).

**Where to start**: Add `?limit=` + `?cursor=` to the two routes; introduce shared `paginated<T>` response type in `packages/shared`. UI: switch `useQuery` → `useInfiniteQuery` with cursor in queryKey.

---

## phase-2-leftovers

Phase 2 acceptance items NOT covered by 2C (carry-forward from `phase-2c-reflection.md`):

1. **Mobile (<768px) bottom-tab navigation** — touched lightly in 2A but not fully audited against `proto/dealer-mobile.jsx`. Triage: do as Phase 2D sweep, or accept as "desktop-first MVP" and revisit after go-live.
2. **Salesperson role outlet scoping** — not yet implemented. Spec'd in Phase 2 acceptance #6 but no code. Triage: Phase 2D or fold into Phase 3.5.
3. **Top-up requests appearing in `approvals` table** — Phase 2C `top_up_order` writes to `order_history` only; `dealer_topup` (Phase 1) bumps `deposit_balance` directly. Master plan §572 envisioned an approval gate but Loo confirmed (`/plan-eng-review` 2026-05-03) that direct self-record is the chosen flow. **No work needed** — close this item.

**Surfaced by**: `phase-2c-reflection.md` §10 acceptance check.

---

## orphaned-debt-rpcs-and-columns

**What**: After Phase 3 stripped the Credit terms feature (Loo confirmed: no HQ→dealer debt — customer pays HQ direct, dealer just sells), several DB artifacts are now orphaned with no caller:

- `dealer_set_terms(uuid, numeric, text)` RPC (migration `0013`) — no API route, no UI calls it
- `dealer_topup(uuid, numeric, payment_method, text, text)` RPC (migration `0003`) — also no caller; the dealer-side TopUpDepositModal uses `top_up_order` (Phase 2C `0009`), which writes to `orders.paid` not `dealers.deposit_balance`
- `dealers.credit_limit numeric` column — not exposed in any UI
- `dealers.payment_terms text` column — not exposed in any UI
- `dealers.deposit_balance numeric` column — not exposed in any UI

**Why deferred**: Dropping requires a migration with `drop function ...` + `alter table dealers drop column ...`. Schema changes need explicit Loo approval per project CLAUDE.md §7. Leaving them is harmless (functions sit unused; columns default to 0).

**Revisit when**: Phase 5 (Finance) — that phase will revisit how money flows through the system; if it confirms these are truly dead, do one cleanup migration `0XXX_drop_unused_dealer_credit.sql`.

**Risk if not cleaned**: Future engineer might re-discover these and assume they're load-bearing. Code reviewer might flag "why is dealer_set_terms here if nothing uses it?"

**Surfaced by**: Loo's biz-model clarification on 2026-05-03 — "my dealer wont have any debt to me, our system is about dealer sell item, customer pay HQ directly".

---

## approval-decided-by-shows-uuid

**What**: `approvals.decided_by uuid references app_users(id)` returns the UUID, not the name. The Approval drawer's "Decision" block shows `<UUID> · <timestamp>` instead of `<Name> · <timestamp>`.

**Why deferred**: Cosmetic. Drawer is functional, decisions are recorded correctly, audit_log has full names. Polish item.

**Revisit when**: M6 polish, or any time before Loo demos to a third party.

**Fix sketch**: Either (a) add `decided_by_name text` column populated from `app_users.name` in `approval_decide` RPC, or (b) add a join in the GET `/api/approvals` query, or (c) UI looks up name from a roster the dashboard already has.

**Surfaced by**: M4 implementer subagent on commit `dfecddd`.

---

## audit-log-duplicate-index

**What**: `audit_log` table now has two functionally identical indexes on `occurred_at desc`: `audit_log_at_idx` (from migration `0001`) and `audit_log_occurred_at_idx` (from migration `0013`).

**Why deferred**: Cost is negligible (~50 audit rows/day → tiny write amplification). Dropping in-place is a 1-line migration, not worth a separate cycle now.

**Revisit when**: Any other Phase 4+ migration touches `audit_log` — bundle the `drop index audit_log_at_idx` into that migration. Or anytime a perf pass on writes is needed.

**Surfaced by**: Phase 3 M1 implementer subagent on commit `b163ad1`.

---

## supabase-jwt-secret-cleanup

**What**: Remove `SUPABASE_JWT_SECRET` from `.dev.vars`, `.dev.vars.example`, and the `Bindings` type in `apps/api/src/index.ts`.

**Why deferred**: Phase 1 switched to ES256/JWKS; secret is unused but kept for potential HS256 service-to-service tokens in Phase 9.

**Revisit when**: Phase 9 deploy planning confirms no HS256 use case.

**Surfaced by**: `phase-1-reflection.md` §6.

---

## P4-polish-cancel-flow

**What**: Phase 4 MVP added `logistics_abandon_order` RPC for post-Proceed cancel (status='cancelled', release reserved stock). It does NOT issue refund or coordinate with Finance. Full post-Proceed cancel flow needs: (a) refund issuance via existing approvals table, (b) reservation release (already done), (c) audit trail linking cancel ↔ refund ↔ stock movement.

**Why deferred**: MVP needs at least an escape hatch (abandon = release stock). Full flow requires Finance phase coordination and is not in Phase 4 scope.

**Revisit when**: Phase 4 polish (after MVP ship) OR Phase 5 Finance — Phase 5 likely better since refund issuance is finance domain.

**Surfaced by**: `/plan-eng-review` 2026-05-03 finding A6 on Phase 4 spec.

---

## P4-perf-receive-loop

**What**: `logistics_receive_po_line` after receiving a line iterates ALL `awaiting_stock` orders to recompute shortages. O(N×M) where N=awaiting orders, M=lines per order. At MVP scale (<100 awaiting) fine; at >500 awaiting becomes slow.

**Why deferred**: Premature optimization at MVP volume. Phase 4 will have <50 awaiting orders during burn-in.

**Revisit when**: Production receive p95 latency exceeds 500ms OR `awaiting_stock` order count regularly exceeds 100. Optimization: filter to orders that have ANY line with the just-received SKU first (subset query before iterate).

**Surfaced by**: `/plan-eng-review` 2026-05-03 finding P2 on Phase 4 spec.

---

## P4-perf-movements-index

**What**: Add composite index `(warehouse_id, occurred_at desc)` on `stock_movements` for the Movements page filter-by-warehouse query.

**Why deferred**: Existing indexes `(sku)` and `(occurred_at desc)` cover the main use cases. Filter-by-warehouse uses sequential scan + sort which is fine at <10k movements. Phase 4 won't generate that volume in MVP.

**Revisit when**: Movements page p95 > 500ms OR `stock_movements` row count exceeds 50k.

**Surfaced by**: `/plan-eng-review` 2026-05-03 finding P4 on Phase 4 spec.

---

## phase-5-logistics-cancel

**What**: Phase 5 (Finance) needs proper post-Proceed cancel flow with refund coordination. Spec §12 lists this as NOT in MVP. Builds on `logistics_abandon_order` (Phase 4 MVP) by adding the refund leg.

**Why deferred**: Refund issuance is Finance phase domain. Phase 4 only releases reserved stock; doesn't return customer money.

**Revisit when**: Phase 5 Finance kickoff. Likely overlaps with the existing `refunds` table and `approval_decide` flow.

**Surfaced by**: `/plan-eng-review` 2026-05-03 finding A6 + spec §12 NOT in MVP.

---

## phase-7-pdf-gen-options — RESOLVED 2026-05-04

**Decision (Loo D1=A)**: `@react-pdf/renderer` chosen and shipped in M4 Task 4.

**F-11 outcome**: Bundle landed at **1034 KiB raw / 197 KiB gzipped** (Workers free-tier ceiling is 1 MiB gzipped). Comfortable headroom. Achieved via runtime font fetch from Fontsource jsdelivr CDN (`apps/api/src/lib/pdf/fonts/noto.ts`) — no font bytes in the bundle.

**Cold-start cost**: ~5 MB Noto Sans SC TTF pulled on first PDF render per Worker isolate. Subsequent renders reuse the in-isolate font cache.

**Failure mode**: If jsdelivr is unreachable on first render, that single PDF fails (route returns 500); next request retries.

**Surfaced by**: `/plan-eng-review` 2026-05-03 finding A8. Resolved by M4 Task 4.

---

## phase-4-reservation-expiry

**What**: When `logistics_stage='ready_to_dispatch'`, stock is reserved but not deducted. If logistics never dispatches (forgotten order), reservation sits forever. Auto-release after N days (e.g. 7) prevents zombie reservations.

**Why deferred**: Spec §12 explicit NOT in MVP. Edge case at MVP scale; not urgent.

**Revisit when**: Phase 4 polish or Phase 5. Implementation: cron RPC `logistics_release_stale_reservations()` runs daily, releases reservations older than 7 days, writes audit + history.

**Surfaced by**: `/plan-eng-review` 2026-05-03 confirmed spec §12 deferral.

---

## phase-4-multi-warehouse-split

**What**: Currently `pickWarehouseFor` picks ONE warehouse with full stock. If no single warehouse has full stock for all lines, falls back to first warehouse → shortages (auto-issue PO from that warehouse). Multi-warehouse split (one order's lines drawn from 2+ warehouses) not supported.

**Why deferred**: Spec §12 explicit. Adds significant complexity to dispatch logic (which warehouse owns which lines, multi-DO printing). Unnecessary at MVP scale.

**Revisit when**: Loo's network grows to 3+ warehouses with frequent inter-warehouse imbalance. Or when dealer feedback shows "can my order ship from KL even if half the lines are in Penang?"

**Surfaced by**: `/plan-eng-review` 2026-05-03 confirmed spec §12 deferral.

---

# Phase 4 closeout — 16 new TODOs (2026-05-04)

Surfaced during M4 + M5 + M6 by `/plan-eng-review`, `/review`, and `/design-review`. Grouped by priority. See `docs/phase-4-reflection.md` for context.

(`phase-4-purchase-order-lines-rls-policies` was originally listed CRITICAL here; resolved 2026-05-04 in commit c6c4f07 via migration 0022 — see RESOLVED section at top.)

## IMPORTANT (Phase 4 polish — after tag lands)

### phase-4-or-filter-harden-orders

**What**: Apply the M4.3 regex whitelist pattern (movements route) to `apps/api/src/routes/logistics/orders.ts:79-86` PostgREST `.or()` search interpolation. Without it, search input could inject filter operators.

**Why deferred**: M4.3 fixed movements; orders branch was scoped out of that refactor.

**Surfaced by**: `/review` 2026-05-04. Continuation of carry-forward `phase-4-or-filter-harden`.

### phase-4-22p02-mapping

**What**: Add SQLSTATE `22P02` (invalid_text_representation, e.g. malformed UUID) → HTTP 422 in `apps/api/src/lib/route-helpers.ts` `mapPgError`. Currently routes through to a generic 500.

**Why deferred**: Currently masked by zod validation at most route entries; surfaces only on edge cases.

**Surfaced by**: `/review` 2026-05-04.

### phase-4-uuid-path-validation

**What**: Wrap `:id` route params with zod UUID guard at entry (e.g., `c.req.param('id')` → `z.string().uuid().parse(...)`). Currently only some routes do this; consistency would let mapPgError 22P02 fix above stay rare.

**Why deferred**: Plumbing change across ~20 routes; bundle with `phase-4-22p02-mapping`.

**Surfaced by**: `/review` 2026-05-04.

### phase-4-spec-photo-upload-reconcile

**What**: `logistics_attach_do_and_deliver` RPC (migration 0019) accepts `photo_paths jsonb`. DispatchModal UI doesn't gather photos. Either add the photo upload flow or drop the RPC arg.

**Why deferred**: D10=A in `/plan-eng-review` chose to defer until Loo decides the workflow.

**Decision pending**: Loo to choose — add UI (with retention policy `phase-7-pdf-do-photo-upload`) or drop arg in next migration.

**Surfaced by**: `/plan-eng-review` 2026-05-04 D10.

### phase-4-create-po-eta-partner

**What**: Extend `createPoInput` zod schema to accept `eta date` + per-supplier `partnerId`. Currently both default at the RPC level.

**Why deferred**: D14 in `/plan-eng-review` flagged the gap; full UI for these fields wasn't in M5 scope.

**Surfaced by**: `/plan-eng-review` 2026-05-04.

### phase-4-cross-order-bundle-aggregation

**What**: D4=A chose client-side bundle aggregation in `CrossOrderBundleSheet`. Server-side bundle-prep endpoint (`POST /api/logistics/orders/bundle-prep`) would simplify client + cap query weight.

**Why deferred**: Client aggregation works at MVP volume (<50 awaiting orders). D4=A.

**Surfaced by**: `/plan-eng-review` 2026-05-04 D4.

### phase-4-replace-any-types

**What**: ~30 sites in `apps/api/src/routes/logistics/orders.ts` and `pos.ts` still have `// eslint-disable @typescript-eslint/no-explicit-any` annotations. Replace with proper db-types per CLAUDE.md §9.1.

**Why deferred**: Warehouse/movements/dashboard/partners/suppliers routes are clean; orders + pos are the holdouts. Bundling for next sweep.

**Surfaced by**: `/review` 2026-05-04. Continuation of carry-forward `phase-4-replace-any-types`.

### phase-4-logistics-test-gaps

**What**: Test coverage gaps in M4-M5: partners/suppliers happy-path-only (no JWT edge cases); JWT edge case coverage not uniform across routes; SQLSTATE 42501 mapping not consistently asserted; dashboard error coverage thin.

**Why deferred**: 489 tests hit the M5 ship bar; gaps are acceptable for MVP.

**Surfaced by**: `/review` 2026-05-04.

### phase-4-rpc-shape-audit

**What**: `assertRpcCallShape` helper (refactor C1) is used in `warehouse.test` but not consistently in pos/orders test files. Audit + retrofit for RPC mock shape consistency.

**Why deferred**: D8=A approved partial rollout; finish in a polish pass.

**Surfaced by**: `/plan-eng-review` 2026-05-04 D8.

### phase-4-zod-strict-nested-lines

**What**: `createPoInput.lines` array — outer array is `.strict()` per refactor B2, but inner line objects aren't. Inconsistent with sibling schemas.

**Why deferred**: D9=A approved closing the outer-level uniformity TODO; nested case is Phase 9 polish.

**Surfaced by**: `/plan-eng-review` 2026-05-04 D9. Bridges to `phase-9-zod-strict-nested-lines`.

---

## MINOR (Phase 7+)

### phase-7-reassign-warehouse-wire

**What**: `ReassignWarehouseDialog.tsx` ships in M5 but no caller invokes it. The trigger state is partner-rejection (Phase 7 territory).

**Why deferred**: D3=A — UI is built; wiring waits for Phase 7 partner-rejection state machine.

**Surfaced by**: `/plan-eng-review` 2026-05-04 D3.

### phase-7-pdf-do-photo-upload

**What**: If `phase-4-spec-photo-upload-reconcile` adds photos to DO PDF, retention policy must be decided (signed URLs? embed in PDF? Storage lifecycle?).

**Why deferred**: Conditional on the photo-upload decision above.

**Surfaced by**: M6 reflection 2026-05-04.

### phase-9-movements-cursor-pagination

**What**: Movements page hard caps at LIMIT 200. At >200 movements per filter, oldest are silently dropped. Cursor pagination needed for high-volume warehouses.

**Why deferred**: D5=A — LIMIT 200 acceptable at MVP volume.

**Surfaced by**: `/plan-eng-review` 2026-05-04 D5.

### phase-9-pdf-visual-snapshots

**What**: Add Playwright visual snapshot test for DO and PO PDFs (rendered in headless Chrome, compared against golden image).

**Why deferred**: Phase 4 has unit tests for PDF route shape but no visual regression coverage.

**Surfaced by**: `/review` 2026-05-04.

### phase-9-dashboard-split-layout

**What**: D13=A kept LogisticsDashboard as a single page (KPIs + 3 pipeline columns + 2 side cards). At higher volume, split into a dedicated Kanban page + dashboard summary page.

**Why deferred**: D13=A — single page works at MVP. Revisit if dashboard load >500ms.

**Surfaced by**: `/plan-eng-review` 2026-05-04 D13.

### phase-9-trigram-search

**What**: Postgres `pg_trgm` index on `orders.dl_text`, `purchase_orders.id`, `dealers.name` for fuzzy search at scale. Current `.ilike('%query%')` is fine at MVP.

**Why deferred**: D14=A.

**Surfaced by**: `/plan-eng-review` 2026-05-04 D14.

### phase-9-pdf-cache-immutable-orders

**What**: Once an order is `delivered` and DO PDF is generated, the result is immutable. Cache by `order_id` in Workers KV (or R2) to skip future renders.

**Why deferred**: D6=A — current cost (one font fetch + render per print click) is low. KV setup is overhead.

**Surfaced by**: `/plan-eng-review` 2026-05-04 D6.

### phase-9-bundle-size-monitor

**What**: CI gate that fails if Workers bundle gzip size grows past a threshold (e.g., 500 KiB). Currently 197 KiB; would catch a bad dependency add early.

**Why deferred**: D11=A — current headroom is comfortable; gate is "nice to have", not "must have".

**Surfaced by**: `/plan-eng-review` 2026-05-04 D11.

### phase-9-cjk-font-extended

**What**: Fontsource Noto Sans SC subset is only `chinese-simplified-400`. If we ship to Hong Kong / Taiwan / Japan markets, need traditional + Japanese subsets.

**Why deferred**: MVP is Malaysia (English + Simplified Chinese for some product names).

**Surfaced by**: M6 reflection 2026-05-04.

### phase-9-po-cogs-source

**What**: M4.6 PO PDF computes `total = sum(line.qty * product_skus.price)` because `purchase_orders.total` doesn't exist. `product_skus.price` is the retail price — wrong proxy for COGS. Real fix: add `purchase_order_lines.unit_cost` column or `purchase_orders.total_cost` field.

**Why deferred**: Phase 5 (Finance) territory — finance phase will define COGS data model.

**Surfaced by**: M4.6 implementer subagent 2026-05-04.

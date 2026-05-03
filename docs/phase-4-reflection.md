# Phase 4 — Reflection

> **Phase 4 (Logistics) implementation completed 2026-05-04.** Tag `phase-4-complete` is **BLOCKED** on Loo's approval of migration `0022_purchase_order_lines_rls.sql` (purchase_order_lines RLS policies). 60 commits across the phase, 5 SQL migrations (0017-0021), 5 Logistics pages, ~30 React components, server-side PDF infrastructure landed under Workers free-tier ceiling, 489 tests green. Built end-to-end across Pre-M4 + M4 + M5 milestones via subagent-driven dispatch with `model:opus`.

---

## Phase 4 Summary

| Milestone | Deliverable | Notable commits |
|---|---|---|
| **Pre-M4** | Spec + `/plan-eng-review` decisions + 3 refactor passes (B1 mapPgError + parseJsonBody extraction, B2 strict zod uniformly, C1 assertRpcCallShape helper) before M4 work began. | de9a3b3 · 1bba68f · 4f4d181 · fdaa96f · 3e2b11d · a415e0a |
| **M1** | Foundation: 3 migrations (0017 multi-line POs + dl_refs, 0018 stock_balances.reserved, 0019 13 logistics RPCs) · 11 zod schemas · sidebar shell. | 12a9393 |
| **M2** | Backend orders: dashboard + GET list/detail + 6 mutation routes (assign-partner, attach-do, abandon, warehouse, recheck-stock). 3 schema-discovery fixes mid-M2 (showroom_id→outlet_id, eta→eta_date, sku→addon_key). | ddad6b5 · 7a23cc0 · 26cff31 · e49cebd · 78e1119 · c8e1706 · 09b2306 · 3df3879 · 01eb3bf · 576139f · 8756e2d · e7a0782 |
| **M3** | Backend procurement: GET pos list + 6 PO mutation routes (create, receive, cancel, assign-pickup-partner, reassign-warehouse, issue-pos). Migration 0020 added logistics_cancel_po RPC. | 7bb8827 · 211a95b · ef14dec · a6967be · cb145c4 · 0f1f1e8 · 39589a5 · 051d8d8 |
| **M4** | Warehouse + movements + PDF: GET warehouse with low_stock flags, POST adjust, GET movements (5 filters + 200 LIMIT). Migration 0021 added composite index. **Server-side PDF infra landed**: @react-pdf/renderer + Noto CJK runtime fetch + DO/PO templates + 2 print routes. | 59e21b0 · f8bc783 · 117bb7d · 49adf9f · a23e271 · 5b7d79a · 1de15eb · 67fc0ab |
| **M5** | 5 Logistics pages: Dashboard (KPI tiles + 3 pipeline columns), Orders (kanban + drawer + 4 modals), Procurement (PO list + 3 modals), Warehouse (tiles + category tabs), Movements (KPIs + period chips + filters + by-month + CSV). Plus partner+supplier picker endpoints, kanban primitives, AdjustStockModal, ReassignWarehouseDialog, CrossOrderBundleSheet wired. | 2ea6483 · fc7f92f · d977107 · 1892af2 · d51ac2d · d7f74ca · 6bb23f2 · 3742309 · 4890a90 · 1641eac · e58739f · d837e22 · d8ae8a2 · 57e0a73 |
| **M6** | Reflection (this file) + CLAUDE.md status update. Tag PENDING on RLS approval. | _this commit_ |

**60 commits since `phase-3-complete`, 189 files changed, +23,601 / -499 lines, 489 tests green** (309 → 489, +180 tests across the phase).

---

## Key Decisions Locked (per `/plan-eng-review` 2026-05-04)

The eng review walked the M4+M5+M6 plan and surfaced 14 decision points. All resolved before implementation began:

1. **D1=A — `@react-pdf/renderer` over puppeteer** — Workers bundle weight estimate (~200 KiB gzip) sat well under the 1 MiB free-tier ceiling. F-11 escape never triggered.
2. **D2=A — Runtime CJK font fetch from Fontsource jsdelivr CDN** — keeps font bytes out of the bundle; trade off: 5 MB cold-start fetch per Worker isolate, cached in-isolate after.
3. **D3=A — ReassignWarehouseDialog ships in M5 but stays inert until Phase 7 (partner-rejection state)** — UI is built; no caller wires it to a state transition yet. Recorded as `phase-7-reassign-warehouse-wire` carry-forward.
4. **D4=A — CrossOrderBundleSheet aggregation done client-side** — server-side aggregation deferred to `phase-4-cross-order-bundle-aggregation` follow-up. Client groups by `(supplier_id, sku)` across awaiting orders before submit.
5. **D5=A — Movements page filters by warehouse + sku + period chip + reason; LIMIT 200 hard cap** — pagination deferred to `phase-9-movements-cursor-pagination`.
6. **D6=A — Print endpoints stream Buffer, no caching** — caching by-order considered for `phase-9-pdf-cache-immutable-orders`.
7. **D7=A — F1 factory_pickup as supplier-side state, not a separate role** — drives `assign-pickup-partner` route shape.
8. **D8=A — `assertRpcCallShape` test helper retrofit** — applied to warehouse.test, partial in pos/orders (recorded as `phase-4-rpc-shape-audit`).
9. **D9=A — strict() zod across all 14 logistics schemas** — closes carry-forward `phase-4-zod-strict-uniform`. Inner `lines` objects in createPoInput remain non-strict; recorded as `phase-9-zod-strict-nested-lines`.
10. **D10=A — DispatchModal photo upload deferred** — RPC `logistics_attach_do_and_deliver` accepts `photo_paths jsonb` but UI doesn't gather photos. Reconcile in `phase-4-spec-photo-upload-reconcile`.
11. **D11=A — Workers bundle size monitor as Phase 9 follow-up** — current 197 KiB gzip is comfortable; CI gate deferred.
12. **D12=A — CSV export client-side** — Movements page builds blob from filtered rows; no server endpoint.
13. **D13=A — Dashboard split layout (separate kanban/cards page) deferred** — current single-page works at MVP volume; recorded as `phase-9-dashboard-split-layout`.
14. **D14=A — Trigram search index deferred** — orders.ts list `.or()` interpolation lives until `phase-9-trigram-search`.

---

## Schema Discoveries (db-types vs migrations drift)

8 schema-vs-types drifts caught by implementer subagents during Phase 4 — none of these would have shown up in unit tests (all of them mock Supabase shape). All discovered via reading existing migrations carefully against `packages/shared/src/db-types.ts`:

| Discovery | Where caught | Action |
|---|---|---|
| `purchase_orders.id IS the po_number` (no separate `po_number` column) | M4.6 PDF template | Used `id` directly in PO header. |
| `purchase_orders.total` doesn't exist | M4.6 PDF template | Fallback to `sum(line.qty * product_skus.price)`. Recorded as `phase-9-po-cogs-source` — proxy until real COGS field lands. |
| `purchase_order_lines` has no description column (uses `product_skus.variant`) | M4.6 + M5.3 | PDF + UI lookup variant via SKU join. |
| `suppliers` has no address column | M4.6 PDF template | "From: {supplier name}" only — no street address printed. |
| `orders.do_signed` / `do_attached_at` don't exist (gate on `status='delivered'` instead) | M4.5 print-DO route | Print allowed when status=delivered; signed-DO concept is implicit (DO PDF generated on delivery confirmation). |
| `purchase_orders.sku` and `qty` columns dropped in 0017 — but db-types.ts wasn't updated | M5.0 procurement page wiring | Patched db-types.ts to remove stale fields; added `dl_refs int[]`. |
| `stock_balances.reserved` added in 0018 — db-types.ts didn't declare it | M4.1 warehouse list route | Added to StockBalanceRow (commit 117bb7d). |
| `orders.dispatched_at` and `delivered_at` added in 0019 — db-types.ts didn't have them | M5.0 OrderCard time formatting | Added to OrderRow type. |

**Pattern observed**: every implementer sub-agent that touched a migration-introduced column hit the same trap. db-types.ts is hand-maintained, and it lags migrations unless someone explicitly updates it. The fix going forward is upstream — see Lessons §1 below.

---

## F-11 escape: PDF infrastructure

The biggest plan risk going into M4 was F-11: would `@react-pdf/renderer` push the Workers bundle past the 1 MiB free-tier gzipped limit?

**Outcome**: Workers bundle came in at **1034 KiB raw / 197 KiB gzipped** — about 19% of the ceiling. D1=A's "use Workers paid tier" fallback never triggered.

**How it stayed small:**
- `@react-pdf/renderer` itself is ~700 KiB raw; gzip compresses heavily.
- **Noto Sans SC TTF (~5 MB) lives outside the bundle** — fetched at runtime from Fontsource jsdelivr on first PDF render per Worker isolate, cached in-isolate after. `apps/api/src/lib/pdf/fonts/noto.ts` owns the fetch + register logic.
- Only Noto Sans + Noto Sans SC are bundled as font config (no other locales).

**Cold-start tax**: ~200ms first-render delay per Worker isolate (one-time font fetch). Subsequent renders inside the same isolate are warm.

**Failure mode**: jsdelivr unreachable on first render → that single PDF returns 500. Next request retries; not retried in-route by design (caller's responsibility).

**Bug caught in M4.5** (post-template, pre-print-route): font registration was registering `latin-400` AFTER `chinese-simplified-400`, with the same family alias `Noto Sans SC`. @react-pdf/renderer's font registry was picking the *last-registered* matching family for any fallback rendering, so Chinese characters were rendering as `.notdef` (□ boxes). Fixed by registering CJK first, then ASCII fallback under a different family alias. This bug only existed because the M4.4 commit shipped templates without an end-to-end PDF render check; M4.5 caught it during the print-route smoke.

---

## CRITICAL BLOCKER

### `purchase_order_lines` RLS policies missing — phase-4-complete tag is held

**Bug**: Migration `0017_purchase_order_lines.sql` created the `purchase_order_lines` table without any RLS policies. Subsequent migrations (no-op) called `alter table purchase_order_lines enable row level security` without adding policies. Result: every user-JWT read of this table returns empty rows because Postgres' default behavior with RLS enabled + zero policies is "deny all".

**Why tests didn't catch it**: vitest mocks Supabase responses. The `from('purchase_order_lines').select()` mocked output returns whatever the test fixture says — never the actual RLS-filtered DB shape. Integration tests with msw mock the same way.

**Why it's dormant in production**: production has 0 PO rows, so there are 0 lines to be denied. M2 + M3 + M4 all happily pass tests AND happily query the table — both return `[]` either way.

**Affected surfaces (all return empty until policies land):**
- M4.5 print-DO endpoint (linked POs section in DO drawer renders blank)
- M4.6 print-PO endpoint (PO PDF lines section is empty)
- M5.2 OrderDetailDrawer "Linked POs" panel (always blank)
- M5.3 LogisticsProcurement PO list (lines column always empty)

**Fix path**: New migration `0022_purchase_order_lines_rls.sql` adding `po_lines_scoped_read` policy (logistics + principal can read all; supplier-scoped read for own supplier — mirrors `po_scoped_read` from `0002_rls.sql:241`).

**Why blocked**: Per CLAUDE.md §14 RED LINE 2, RLS policy changes require explicit Loo approval in the current conversation. We're recording the fix path here; Loo to confirm before applying.

**`phase-4-complete` tag is held** until 0022 lands.

---

## Carry-forward TODOs (closed in Phase 4)

Three carry-forwards from prior phases / earlier Phase 4 milestones got closed during this phase:

- **`phase-4-or-filter-harden`** — partially closed. Movements got the regex whitelist in M4.3. Orders.ts:79-86 still pending (now tracked as `phase-4-or-filter-harden-orders`, see new TODOs).
- **`phase-4-zod-strict-uniform`** — closed. All 14 logistics zod schemas are `.strict()` after refactor B2. Caveat: `createPoInput.lines` inner-line objects still loose; recorded as `phase-9-zod-strict-nested-lines`.
- **`phase-4-detail-partner-name-join`** — partially mooted. The `useDeliveryPartners` client hook landed in M5.1, so partner name can be joined client-side from a small partner roster. The OrderCard "via partner" line is currently hidden (M5 design-review batch 57e0a73) until the full integration ships. The orders.ts:108 join is no longer load-bearing.

---

## New TODOs surfaced (16 total)

From `/plan-eng-review`, `/review`, and `/design-review` during M4-M6. Grouped by priority below; full entries appended to `TODOS.md` in this commit.

**CRITICAL (blocks tag)**
- `phase-4-purchase-order-lines-rls-policies` — see CRITICAL BLOCKER above

**IMPORTANT (Phase 4 polish)**
- `phase-4-or-filter-harden-orders` — apply M4.3 regex whitelist to orders.ts:79-86
- `phase-4-22p02-mapping` — add SQLSTATE 22P02 → 422 in mapPgError
- `phase-4-uuid-path-validation` — wrap `:id` route params with zod UUID guard at entry
- `phase-4-spec-photo-upload-reconcile` — decide DispatchModal photo upload OR drop `photo_paths jsonb` RPC arg
- `phase-4-create-po-eta-partner` — extend createPoInput zod to accept eta + per-supplier partnerId
- `phase-4-cross-order-bundle-aggregation` — server-side bundle-prep endpoint or solidify client aggregation
- `phase-4-replace-any-types` — ~30 sites in orders.ts/pos.ts (warehouse/movements/dashboard/partners/suppliers clean)
- `phase-4-logistics-test-gaps` — partners/suppliers happy-path-only; JWT edge cases not uniform
- `phase-4-rpc-shape-audit` — assertRpcCallShape used in warehouse.test but not consistently in pos/orders
- `phase-4-zod-strict-nested-lines` — createPoInput.lines inner objects not strict (only outer)

**MINOR (Phase 7+)**
- `phase-7-reassign-warehouse-wire` — wire ReassignWarehouseDialog when partner-rejection state ships
- `phase-7-pdf-do-photo-upload` — if photo upload added in Phase 7, retention TBD
- `phase-9-movements-cursor-pagination`
- `phase-9-pdf-visual-snapshots`
- `phase-9-dashboard-split-layout`
- `phase-9-trigram-search`
- `phase-9-pdf-cache-immutable-orders`
- `phase-9-bundle-size-monitor`
- `phase-9-cjk-font-extended`
- `phase-9-po-cogs-source`
- `phase-9-zod-strict-nested-lines`

---

## Surprises

### 1. PDF font handling ate ~30% of M4.4 budget

The Fontsource jsdelivr URL format (subset choice: `latin-400` vs `chinese-simplified-400`), the `@font-face` registration order trap, and the cold-start fetch latency all needed individual debug cycles. The font-fallback bug only showed up when M4.5 generated a real DO PDF with a Chinese character in the dealer name — pure-ASCII DOs rendered fine, masking the bug for a full M4.4 cycle.

**Carry forward**: future PDF/binary integrations need an end-to-end render check on representative fixture data immediately after the template lands, not at the print-route step.

### 2. M5 page implementations took ~30-45 min CC each (vs initial ~20 min estimate)

5 pages, all Wired with kanban + drawer + multiple modals + filters. Subagent-driven dispatch with `model:opus` was reliable but each page needed real proto-fidelity rigor: opening the corresponding `reference/proto/logistics-*.jsx`, matching color tokens, replacing arbitrary Tailwind values like `4.5/5.5` with proto-correct arbitrary syntax. The design-review batch (commit 57e0a73) caught 4 patterns of drift that needed fixing.

**Carry forward**: estimate Phase 5 page implementations at 35-45 min CC per page including review touch-ups, not 20.

### 3. Schema discoveries (8+ DB-vs-types drifts) ate ~10% of M4 time

Each drift cost 5-15 min: implementer subagent fails the type check, reads the migration to confirm the actual schema, patches `packages/shared/src/db-types.ts`, retries. Most subagents handled this gracefully; M4.5 took the longest because `do_signed` / `do_attached_at` were referenced from the proto but never schema'd, requiring a small spec-vs-schema reconciliation.

**Carry forward**: Lesson #1 below — every phase should kick off with a "db-types vs migrations diff" pass.

---

## Tests breakdown

| Workspace | Phase 3 close | Phase 4 close | Δ |
|---|---|---|---|
| **shared** | 53 | 69 | +16 (M4.3 listMovementsQuery + M4.2/M4.3 schema validation) |
| **api** | 157 | 232 | +75 (route-helpers, assertRpcCallShape, M4 routes incl. PDF, partners, suppliers) |
| **web** | 99 | 188 | +89 (cjk + 5 M5 pages with C2=C complete coverage) |
| **TOTAL** | 309 | 489 | **+180** |

5 Playwright E2E specs unchanged (Phase 2C/3 happy-path coverage still active; Phase 4 internal-role flows not yet covered by E2E — recorded for Phase 9 go-live).

---

## Lessons for Phase 5

1. **Always verify db-types.ts vs migrations BEFORE implementing.** Schema drift is invisible at compile time when Supabase queries use string column names. A pre-phase audit comparing `packages/shared/src/db-types.ts` against `supabase/migrations/*.sql` would have caught all 8 Phase 4 drifts in one pass instead of one-at-a-time during M2-M5.

2. **For new RLS-enabled tables, always add explicit policies in the same migration.** The `purchase_order_lines` 0017 oversight created a dormant blocker that survived M2-M5 because tests mocked Supabase. Migrations that introduce a new table should be required to either (a) include policies inline, or (b) be paired with a `_rls.sql` follow-up filed in the same PR. Test it live (real JWT, real DB) before claiming the milestone done.

3. **Reference proto JSX is the source of truth for color/layering; spec text can be loose paraphrase.** The design-review batch on M5 found 4 drift patterns that came from following the spec's English description instead of the proto's Tailwind classes. Default rule: when spec and proto disagree, proto wins for visuals; spec wins for behavior.

4. **PDF / heavy-binary integrations need bundle-size verification IMMEDIATELY post-install, not at deploy time.** F-11 was a planning concern; the actual measurement (Workers bundle at 197 KiB gzipped) only happened after install + first render. If `@react-pdf/renderer` had been 600 KiB gzipped, we would have lost a day to switching strategy. Add a `pnpm build:api` check immediately after any `pnpm add` of a heavy package, before writing any wrapper code.

5. **`subagent-driven-development` workflow with `model:opus` per Loo's preference is reliable for overnight runs.** Phase 4 dispatched 20+ subagent runs across M1-M5; 18 of them landed on the first dispatch with clean tests. The 2 retries were both schema-discovery cases (M2 outlet_id + M5 db-types drift). Pattern: clear plan + opus model + small task scope = subagents land it without orchestrator intervention.

---

## Acceptance check (final, partial — tag still pending)

- [x] M1 foundation (3 migrations + zod schemas + sidebar)
- [x] M2 backend orders (dashboard + 9 routes)
- [x] M3 backend procurement (POs + 7 routes + migration 0020)
- [x] M4 warehouse + movements + PDF (4 routes + 2 print routes + migration 0021)
- [x] M5 5 Logistics pages with kanban + drawers + modals
- [x] 489/489 tests green (shared 69 + api 232 + web 188)
- [x] Build green: web ~660 kB JS, api 197 KiB gzip
- [x] No `SUPABASE_SERVICE_ROLE_KEY` in `apps/web/dist/` (RED LINE check)
- [x] `phase-4-reflection.md` written (this file)
- [x] CLAUDE.md §17 status updated
- [ ] **`0022_purchase_order_lines_rls.sql` approved by Loo + applied** — BLOCKING
- [ ] `git tag phase-4-complete` and push (after RLS migration lands)

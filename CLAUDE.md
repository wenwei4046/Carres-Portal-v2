# CLAUDE.md — Carres Portal v2

> **You are working on Carres Portal v2.** Read this file fully before any task.
> Master plan lives in `CARRES_PORTAL_V2_PLAN.md` at repo root — read it for any planning, schema, or phase question.

---

## 1. Identity & context

This is a **complete rewrite** of the existing Carres-Portal (which is in production with testimony data only — no real data to preserve). The reference design is `Carres_Portal.zip`, **extracted into `reference/` at repo root and excluded from git via `.gitignore`** — meaning Claude Code can read it freely, but it never gets committed, built, or deployed. Loo is the Chairman of HOUZS Venture Sdn Bhd; **he has no coding background and relies on Claude Code for all technical execution**. Communicate clearly, default to Chinese with English tech terms preserved (Next.js, Supabase, RLS, Hono — never translate these).

---

## 2. Stack (do not deviate without asking)

| Layer | Technology |
|---|---|
| Web | Vite + React 18 + TypeScript + React Router 7 + Tailwind 3 + shadcn/ui + TanStack Query 5 + Zustand 5 |
| API | Hono v4 on Cloudflare Workers (Wrangler) |
| Shared | zod schemas + db-types + domain types + adapters in `packages/shared` |
| DB | Supabase Postgres + RLS + RPCs + Auth + Storage |
| Deploy | Cloudflare Pages (web) + Cloudflare Workers (api) |
| Package mgr | pnpm v9 + workspaces |

**Do not introduce**: Next.js, Vercel, Express, Prisma, Drizzle, NextAuth, MUI, Chakra, Bootstrap, styled-components, redux, or any ORM other than supabase-js. If you think one is needed, ask first.

---

## 3. Core principle: Frontend wins

The `reference/proto/*.jsx` files are **the source of truth for behavior**. Every button, modal, kanban column, status transition, and inter-role sync rule is defined there. When in doubt:

- **Frontend behavior > schema convenience.** If the schema makes a UI flow awkward, the schema is wrong.
- **Schema source**: `reference/production/supabase/migrations/000{1,2,3}.sql` — copied verbatim to `supabase/migrations/`. Do not modify these without explicit Loo approval.
- **Reference for data contract**: `reference/production/src/lib/queries.ts` and `adapters.ts`. Copy logic, not architecture (we use Hono, not direct Supabase).

---

## 4. Architecture rules

### 4.1 Three-tier flow

```
Browser (Vite SPA)
  ↓ Authorization: Bearer <Supabase JWT>
Hono on CF Workers (verify JWT, validate, business rules)
  ↓ user JWT (RLS) | service_role (admin/cron only)
Supabase (Postgres + RLS + RPCs)
```

### 4.2 Auth path exception

Login (`signInWithPassword`, `signUp`, `resetPassword`) goes **directly from browser to Supabase Auth**, not through Hono. After login, all other requests go through Hono with the JWT.

### 4.3 Trust boundaries

| Boundary | Rule |
|---|---|
| Browser → Hono | Hono trusts nothing. Always `jose` JWT verify + zod payload validate. |
| Hono → Supabase (user op) | Forward user JWT. RLS is the security boundary. |
| Hono → Supabase (admin/cron) | Use service_role. Restrict to specific routes (account creation, file signing, cron). |

### 4.4 service_role key — RED LINE

`SUPABASE_SERVICE_ROLE_KEY` lives **only in Cloudflare Workers secrets** (`wrangler secret put`). **Never**:
- Write it to source code
- Add it to `.env` that gets committed
- Reference it from `apps/web` (would bundle into browser)
- Log it
- Pass it through Hono response

Before each commit, grep for `SERVICE_ROLE` across `apps/web/dist` to confirm it never appears.

---

## 5. Repo layout

```
apps/web/         ← Vite SPA → Cloudflare Pages
apps/api/         ← Hono → Cloudflare Workers
packages/shared/  ← db-types, domain, adapters, zod schemas
supabase/         ← migrations + seed
```

Each `apps/*` and `packages/*` is its own pnpm workspace. Run scripts via `pnpm --filter <pkg> <cmd>` or root-level `pnpm dev` (which Turborepo orchestrates).

---

## 6. Phase discipline

The work is divided into **Phase 0 → Phase 9** in `CARRES_PORTAL_V2_PLAN.md` §8. **Always**:

1. Confirm with Loo which phase we're in before starting work.
2. Read the phase's `前置阅读` files in `reference/` first. Do not start coding without reading the relevant `reference/proto/*.jsx`.
3. Hit every `Acceptance` criterion before declaring the phase done.
4. Run `/review` (backend safety) and `/design-review` (frontend visual fidelity) before merge.
5. Write a `phase-{N}-reflection.md` after each phase: actual time, surprises, schema tweaks, lessons.

**Do not work across phases.** If you discover Phase 5 is needed mid-Phase 3, flag it and ask Loo whether to defer or pivot. No silent scope creep.

---

## 7. Schema discipline

The 3 SQL files in `supabase/migrations/` are **frozen** unless we hit a real frontend-vs-schema gap (rare). If you must change the schema:

1. Stop coding.
2. Explain to Loo: which UI behavior triggered this, which table/column needs to change, what the alternative is.
3. Get explicit approval **in this conversation** (per global rule: "User said OK before" doesn't count).
4. Write a new migration file (`0004_*.sql`, never edit committed migrations).
5. Re-run RLS audit (§9.2 of plan).

---

## 8. RLS performance — preempt the HV Portal trap

Loo's HV Portal currently has a 130-policies + heavy `dashboard_summary()` lag problem. **Do not repeat this here.** Phase 1 must apply all three of these fixes before any feature work begins:

### Fix 1: Custom JWT claims
Use Supabase Auth Hook to inject `role`, `dealer_id`, `supplier_id`, `partner_id` into JWT `app_metadata` at login. RLS policies read from `auth.jwt()`, never `auth.app_role()` (which queries `app_users` per row).

### Fix 2: InitPlan wrapping
Every policy that calls a function MUST wrap it: `( select auth.app_dealer_id() )` not `auth.app_dealer_id()`. PG14+ runs the wrapped form once per query (InitPlan); the unwrapped form runs per row.

### Fix 3: STABLE marker
All helper functions in `auth` schema MUST be declared `language sql stable security definer`. Missing `stable` defeats the planner's caching.

Phase 1 closes with a baseline test:
- dealer 50 active orders: < 100ms
- principal dashboard summary: < 500ms
- logistics 4-column kanban: < 200ms

Fail this → fix in Phase 1, do not move on.

---

## 9. Code style & conventions

### 9.1 Naming
- Database: `snake_case` (Postgres convention)
- TypeScript types in `db-types.ts`: `snake_case` matching DB rows
- TypeScript types in `domain.ts`: `camelCase` for UI consumption
- Conversion only via `packages/shared/src/adapters.ts`

### 9.2 Files
- Components: `PascalCase.tsx` (e.g. `DealerOrders.tsx`)
- Utilities: `kebab-case.ts` (e.g. `format-currency.ts`)
- One default export per component file
- Never barrel-export from `index.ts` in `apps/*` (only in `packages/shared`)

### 9.3 Imports order
1. Node/external (react, hono, zod...)
2. `@carres/shared/*`
3. Local `@/*` (alias to `apps/{web,api}/src`)
4. Relative `./...`

### 9.4 No magic strings
- All Supabase table names → constants in `packages/shared/src/tables.ts`
- All RPC names → constants in `packages/shared/src/rpcs.ts`
- All API routes → typed via Hono's RPC client, no string concatenation in `apps/web`

### 9.5 zod everywhere
- Every API route validates input with zod (in Hono middleware)
- Every form in `apps/web` uses the same zod schema from `packages/shared`
- One schema, two consumers — never duplicate validation logic

### 9.6 React Query keys
Centralize in `apps/web/src/lib/queries.ts`:
```ts
export const qk = {
  orders: (filters?: object) => ['orders', filters ?? {}] as const,
  order: (id: string) => ['orders', id] as const,
  // ...
};
```
Do not write inline `useQuery({ queryKey: ['orders'] })` anywhere else.

---

## 10. Visual fidelity

The `reference/` prototype is **the design**. Match pixel-for-pixel where reasonable. Do not improvise:

- **Brand color**: `#D64F20` (terracotta)
- **Default style preset**: Warm Linen (the `style-warm` preset in `reference/shared/styles.css`)
- **Display font**: Big Shoulders Stencil Display (login mark)
- **Body font**: DM Sans
- **Mono**: JetBrains Mono
- All design tokens in `apps/web/tailwind.config.ts` named `--base-50/100/.../900`, `--accent`, `--accent-soft` to match `reference/`

When implementing a page:
1. Open the corresponding `reference/proto/*.jsx` file
2. Build the component using shadcn primitives + Tailwind tokens
3. Run `/design-review` to compare against the prototype screenshot
4. Iterate until it matches

If the prototype has 4 style presets (warm/slate/press/editorial), implement **only warm-linen** in v2. Other presets are deferred.

---

## 11. Testing

### Required tests per phase
- **Unit (vitest)**: every adapter, every zod schema, every utility — 100% coverage on these
- **Integration (vitest + msw)**: every Hono route — mock Supabase responses
- **E2E (Playwright)**: at minimum the role's "happy path" defined in phase Acceptance
- **Manual smoke**: Loo runs through the role himself before merge

### Required E2E flows before Go-live (Phase 9)
- Dealer full order → logistics dispatch → partner deliver → finance receive payment
- Top-up approval (dealer → principal/finance approve → balance update)
- Supplier PO ack → ship → logistics receive
- Refund (request → approve → pay)

---

## 12. Cloudflare specifics

### 12.1 Workers env
Configure via Wrangler:
```
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_ANON_KEY
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put SUPABASE_JWT_SECRET
```

For local dev: use `.dev.vars` (gitignored) — `wrangler dev` reads it automatically.

### 12.2 Cron triggers
All cron jobs scheduled in MYT (Asia/Kuala_Lumpur). Cloudflare cron uses UTC, so adjust:
- 09:00 MYT = 01:00 UTC (`0 1 * * *`)
- 17:00 MYT = 09:00 UTC (`0 9 * * *`)

Document every cron in `apps/api/wrangler.toml` with a comment explaining the MYT time.

### 12.3 Pages routing
SPA fallback: `apps/web/public/_redirects`:
```
/*    /index.html   200
```

This makes React Router 7 client-side routes work on direct URL access.

---

## 13. Git & branch hygiene

- **Default branch**: `main` (always deployable to staging)
- **Feature branches**: `phase/{N}-{slug}` e.g. `phase/2-dealer-new-order`
- **No direct commits to main** during phase work; use PR
- **Commits**: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`)
- **Never `git push --force` on shared branches** (per global red line)
- **Never** `git reset --hard` on tracked work
- **Never** `rm -rf` on tracked directories without Loo's explicit confirmation in this conversation

After every phase, tag: `git tag phase-{N}-complete`.

---

## 14. Red lines (inherited from global CLAUDE.md, restated for project)

1. **Never DROP / TRUNCATE / DELETE** without explicit single-instance confirmation from Loo in current conversation.
2. **Never modify Supabase RLS** without explanation.
3. **Never write secrets in code**. Always `.env` / Wrangler secrets.
4. **Never `git push --force` / `reset --hard` / `rm -rf`** on tracked directories.
5. **Never delete files not requested**.
6. **Never alter committed migration history** — write a new migration instead.
7. **"User said OK before" is NOT permission** — it must be explicit in current conversation.

If a task seems to require violating any of these, **stop and ask**.

---

## 15. Communication protocol with Loo

Loo prefers:
- **Conclusion-first** answers, then reasoning
- **Chinese-primary, English tech terms preserved** (never translate `Next.js`, `Supabase`, `RLS`, `Hono`, `JWT`, `RPC`)
- **Casual, playful tone** — not stiff
- **Data-backed recommendations** — quote line counts, response times, costs
- **Risk warnings welcome but should not block** — flag, then proceed if Loo greenlights
- **Practical business / furniture analogies** over abstract theory
- **No coding background** — explain technical concepts when relevant, but don't be condescending

When you need a decision from Loo, say it once, clearly, and present the default option. Don't ping-pong.

---

## 16. When you're stuck

If you've spent more than 30 minutes on something without progress, or you find yourself about to make a non-obvious decision (schema change, dependency add, architecture deviation), **stop and write Loo a one-paragraph summary**:

```
我卡在 X，因为 Y。
我看到的两条路：A（成本 / 风险）vs B（成本 / 风险）。
我倾向 A 因为 Z。
要不要我直接走 A？还是你想先看 B？
```

Don't burn an hour spinning. Surface and ask.

---

## 17. Project status (update as we progress)

```
Current phase: Phase 4 v3 COMPLETE + v3-active.1 LANDED — full v3 sprint (S1-S5) shipped 2026-05-05 (overnight autonomous run); tag `phase-4-v3-complete` (annotated `2e6fdae`) on commit `d4ba236` created + pushed. Post-tag: v3-active.1 (migration 0037 batch RPC thread claim, commit `2da27f6`) lands the 1st of 4 closure tasks. v3-active.2 (confirm-RPC-swap) STOPPED before action — surfaced 3 hidden risks; Loo decision 2026-05-05: defer to Phase 4.5 (70% closure, not 100%). Total run: 23 commits across `e29dd94..2da27f6`, 12 migrations (0026-0037), 8 thread-aware RPCs + batch-RPC thread claim, SOP TS module, Outsource toggle UI, Stockpile PO mode, auto-fill thread filter, orders_rollup_stage() function + trigger. ⚠️ **v3 still ships dormant** — orders.ts:471 still calls v2 confirm RPC; v3 rollup trigger fires only when threads exist (none today). Reflection at `phase-4-v3-reflection.md` · checkpoint at `~/.gstack/projects/wenwei4046-Carres-Portal-v2/checkpoints/20260505-103814-v3-overnight-done-confirm-swap-pending.md`.
Project started: 2026-05-02
Last phase completed: Phase 4 (Logistics) — 2026-05-04, tag phase-4-complete · Pipeline v2 (C1-C5.3) landed post-tag 2026-05-04, untagged · v3 spec + eng review locked 2026-05-05 (commit `e29dd94`) · v3-S1 spec fixes 2026-05-05 (`370d4f3`) · v3-S2 ops bug fixes 5 commits 2026-05-05 (`d47db5d` → `8dce9c3`) · v3-S3 schema + outsource UI 5 commits 2026-05-05 (`f0c1887` → `acbb0e6`) · v3-S4 schema + RPCs + thread filter 7 commits 2026-05-05 (`ddfd10e` → `5e80216`) · v3-S5 rollup function + trigger 1 commit 2026-05-05 (`cbee48b`) · v3-active.1 batch RPC thread claim post-tag 2026-05-05 (`2da27f6`)
Tags so far: phase-0/1/2a/2b/2c/3/4-complete (7 tags) · `phase-4-v3-complete` annotated `2e6fdae` on commit `d4ba236` created + pushed 2026-05-05 (annotation: v3 code-complete but functionally inert pending Phase 4.5 wiring) · v3-active.1 (`2da27f6`) lands post-tag — same pattern as Pipeline v2 vs phase-4-complete
Test count: 656/656 green (shared 112 + api 291 + web 253) · 5 Playwright E2E specs unchanged · v3-active.1 added 4 net tests (batch RPC thread claim happy + 40001 race + empty-thread no-op + mapPgError concurrent_claim → 409)
Migrations applied: 37 (0001-0037, latest = 0037_logistics_create_po_thread_claim applied to staging Supabase project_id `kfprgpjpaffedghytstl` 2026-05-05). v3 + v3-active.1 migration sequence complete; Phase 4.5 will introduce additive migrations for partner role activation + Storage bucket RLS.
F-11 (Workers bundle size) status: 1034 KiB raw / 197 KiB gzipped after @react-pdf/renderer landed. Workers free-tier ceiling is 1 MiB gzipped — we sit at ~19% of the limit. Achieved via runtime CJK font fetch from Fontsource jsdelivr CDN (no font bytes in bundle). Resolves TODO `phase-7-pdf-gen-options`.
Biz model locked (per Loo 2026-05-03):
  • Dealer just sells. Customer pays HQ direct. No HQ→dealer credit / debt.
  • Outstanding column = customer-owe-HQ (dealer chases for 50% top-up gate)
  • Phase 4 (Logistics) and Phase 6 (Supplier) are HQ INTERNAL roles, NOT dealer-side
v3 sprint plan (per `docs/superpowers/specs/2026-05-04-phase-4-v3-spec.md` §17.3 binding + execution plan):
  • v3-S1 ✅ Codex bug fixes in spec doc (7 bugs landed `370d4f3`)
  • v3-S2 ✅ Operational bug fixes (Auto-fill po-existence filter · Receive gate drop · PoDetailModal Receive entry · AssignPickupDialog warehouse picker)
  • v3-S3 ✅ Schema migrations 0026-0031 + db-types regen + SOP TS module (`sops.ts`) + Outsource toggle UI + Print DO toast
  • v3-S4 ✅ Migration 0032 suppliers.slug + 0033 order_supplier_threads + 0034 logistics_rpcs_v3 (8 RPCs) + 0035 do_number hotfix + assign-pickup-partner wired to v3 RPC (closes outsource audit gap) + Stockpile PO mode + auto-fill threads.po_id IS NULL primary filter
  • v3-S5 ✅ Migration 0036 orders_rollup_stage() function + AFTER trigger on order_supplier_threads (DISTINCT FROM guard, fires only when threads exist)
v3-active closure (post-tag, partial — Loo decision 2026-05-05):
  • v3-active.1 ✅ Migration 0037 batch RPC thread claim (`_v3_claim_threads_for_po` helper + extends `logistics_create_po` + `logistics_create_pos_batch`; FOR UPDATE + 40001 race guard + UPDATE threads SET po_id; empty-thread case = no-op for v3-dormant safety) — commit `2da27f6`
  • v3-active.2 🛑 confirm-RPC-swap (orders.ts:471 v2→v3) — DEFERRED to Phase 4.5; 3 risks surfaced before action: (a) auto-skip-from-stock regression, (b) FE kanban hardcoded `awaiting_stock`, (c) per-supplier tab UI not built yet
  • v3-active.3 ⏸️ smoke test — pending v3-active.2
  • v3-active.4 ⏸️ cleanup + retag — pending
  Phase 4.5 deferred (post-v3, pre-Phase 5): **v3 functional wiring** (confirm-RPC-swap + auto-skip-from-stock restore + FE kanban awaiting_stock alias — must land together) · Partner role tenancy + auth + UI · DO file upload to Supabase Storage · Sofa Ready Confirm + Reject→Relocate UI · Per-supplier tab UI rewrite · Stockpile PO advanced flows
Next decision pending:
  1. Phase 4.5 spec + plan-eng-review (start with v3 wake — confirm-RPC-swap + auto-skip-from-stock + FE kanban awaiting_stock alias)
  2. M4.6 PO COGS source (still pending from v2 — `phase-9-po-cogs-source`)
  3. Phase 5 Finance kickoff (deferred until Phase 4.5 complete)
Carry-forward TODOs: orphaned-debt-rpcs · audit-log-duplicate-index · approval-decided-by-shows-uuid · approval-row-type-missing-reason · pagination-deferred · supabase-jwt-secret-cleanup · phase-2-leftovers (mobile nav, salesperson outlet scoping) · phase-4-m2-schema-audit (3 column-mismatches caught at M2 smoke; do an audit before M3-M5) · phase-4-rpc-shape-audit (recommended next; see 2026-05-03 schema audit §Methodology gaps) · phase-4-or-filter-harden (orders.ts:85,163 PostgREST .or() interpolation; tighten zod search to whitelist) · phase-4-replace-any-types (~40 eslint-disable any in logistics routes; use db-types per §9.1) · phase-4-zod-strict-uniform (logistics.ts: .strict() partial; pick a convention) · phase-4-logistics-test-gaps (search int/text branches, JWT edge cases, SQLSTATE 42501 mapping, dashboard error coverage) · phase-4-detail-partner-name-join (orders.ts:108 add delivery_partners(name) — verify against proto §18.3) · phase-4-or-filter-harden-orders (apply M4.3 regex whitelist to orders.ts:79-86) · phase-4-22p02-mapping (add SQLSTATE 22P02 → 422 in mapPgError) · phase-4-uuid-path-validation (wrap :id route params with zod UUID guard at entry) · phase-4-spec-photo-upload-reconcile (DispatchModal photo upload OR drop RPC arg) · phase-4-create-po-eta-partner (extend createPoInput zod for eta + per-supplier partnerId) · phase-4-cross-order-bundle-aggregation (server-side bundle-prep endpoint or client aggregation) · phase-4-zod-strict-nested-lines (createPoInput.lines inner objects not strict; propagated into createPosBatchInput.pos[].lines via re-use) · phase-4-po-id-race (0019/0025 MAX(seq)+1 PO id allocation; widened 20× by batch RPC; low-urgency since logistics is single-dept) · phase-4-prefill-warehouseid-q4-drift (CreatePOModal warehouseFor() falls back to prefill.warehouseId, silently bypassing Q4=A blank-required when callers populate it; currently dead code, tripwire for future shortage flows) · phase-4-orphans-warning-banner (CreatePOModal lacks top-level explanation when auto-fill produces only orphan SKUs; submit correctly disabled but UX confusing) · phase-4-v3-receive-eligibility-extract (from v3-S2.3 review: extract shared canReceivePo helper before v3-S3 enum expansion) · phase-4-warehouse-picker-dedupe (from v3-S2.4 review: 4 sibling dialogs duplicate warehouse picker pattern; extract during v3-S3 Outsource toggle work) · phase-4-warehouse-picker-kind-filter (from v3-S2.4 review: filter list by warehouses.kind — column now exists since 0027 in v3-S3) · phase-4-v3-skus-supplier-id-not-null-tighten (0026 leaves nullable in fresh dev; tighten in follow-up post-seed migration once data verified) · phase-4-v3-print-do-toast-test (from v3-S3.4 review: AssignPickupDialog Print DO toast handler at .tsx:114-148 has no test coverage) · phase-4-v3-sop-type-dedupe (from v3-S3.4 review: sops.ts LogisticsStageV3 should derive from DB.LogisticsStage to lock the two unions together) · phase-4-v3-confirm-auto-skip-from-stock (NEW from v3-S4 review + REINFORCED v3-active.2 stop 2026-05-05: logistics_confirm_proceed_request_v3 ships simpler variant; auto-skip-to-ready_to_dispatch when stock available is deferred — see 0034 file header. MUST land alongside confirm-RPC-swap to avoid stock-sufficient orders being stranded in awaiting_logistics_action) · phase-4-v3-rpc-integration-tests (NEW from v3-S4 review: 8 v3 RPCs have unit tests via mocks but no integration tests against real Supabase; add via Playwright when FE wires v3 flows) · **phase-4-v3-confirm-rpc-swap** (CRITICAL, v3-active.2 STOPPED, Loo deferred 2026-05-05 to Phase 4.5: orders.ts:471 still calls v2 logistics_confirm_proceed_request. Cannot swap to v3 until 3 dependencies land together — (1) auto-skip-from-stock RPC variant restored, (2) FE kanban awaiting_stock alias, (3) per-supplier tab UI. v3 thread system code-complete + batch-RPC thread claim live as of 0037, but confirm flow inert until 4.5) · phase-4-v3-sop-source-of-truth-dedupe (NEW: sops.ts SUPPLIER_SOP and 0034._v3_resolve_sop_name hard-code the same supplier→SOP map in two places; need single source or CI lint) · phase-4-v3-auto-fill-thread-scan-narrow (NEW: pos.ts:129 reads all order_supplier_threads rows; narrow to .eq logistics_stage filter once dual-path simplifies) · phase-4-v3-receive-idempotent-audit (NEW low: re-submitted Receive with same received_qty leaves no audit trail in stock_movements) · phase-4-v3-receive-cumulative-vs-delta-naming (NEW low: p_lines[i].received_qty is cumulative, not a delta — naming is misleading) · phase-4-v3-spec-numbering-doc-fix (NEW very low: spec §17.2 still pins 0032=rpcs_v3 / 0033=threads; reality is the swap to 0032=slug, 0033=threads, 0034=rpcs_v3, 0035=hotfix, 0036=rollup, 0037=batch-rpc-thread-claim) · **phase-4-v3-fe-kanban-awaiting-stock-alias** (NEW CRITICAL from v3-active.2 stop analysis 2026-05-05: apps/web/src/pages/logistics/LogisticsOrders.tsx hardcodes `stage-column-awaiting_stock`; 30+ tests reference same string. v3 rollup writes `awaiting_logistics_action` — orders disappear from kanban after confirm-RPC-swap. Either rename column id to alias both enum values, OR add migration to rename enum value. Required before confirm-RPC-swap can ship) · phase-4-orders-test-logistics-stage-null-type-drift (NEW pre-existing typecheck: apps/api/src/routes/logistics/orders.test.ts:119 `logistics_stage: null` not assignable; multiple subagent reviews verified pre-existing on baseline; surface for cleanup before Phase 5) · phase-7-reassign-warehouse-wire (wire ReassignWarehouseDialog when partner-rejection state ships) · phase-7-pdf-do-photo-upload (retention TBD if photo upload added) · phase-9-movements-cursor-pagination · phase-9-pdf-visual-snapshots · phase-9-dashboard-split-layout · phase-9-trigram-search · phase-9-pdf-cache-immutable-orders · phase-9-bundle-size-monitor · phase-9-cjk-font-extended · phase-9-po-cogs-source
```

Update this section at the start and end of every working session.

---

## 18. Reference files (in `reference/`, gitignored)

The `Carres_Portal.zip` design package is extracted into `reference/` at repo root. This directory is **listed in `.gitignore` and excluded from Vite/TypeScript compilation** — Claude Code can read it freely, but it never gets bundled, deployed, or committed.

If `reference/` does not exist in your working directory, ask Loo to extract the zip there before proceeding. Do not attempt the work without it.

| Path | Use |
|---|---|
| `reference/proto/*.jsx` | UI/UX source of truth — read before each phase |
| `reference/production/supabase/migrations/000{1,2,3}.sql` | Schema source (copied verbatim to `supabase/migrations/` in Phase 1) |
| `reference/production/src/lib/queries.ts` | Data contract reference (READ ONLY — we use Hono, not direct Supabase) |
| `reference/production/src/lib/adapters.ts` | snake↔camel conversion (copied to `packages/shared/src/adapters.ts` in Phase 1) |
| `reference/production/src/lib/db-types.ts` | Postgres row types (copied to `packages/shared/src/db-types.ts`) |
| `reference/production/src/lib/domain.ts` | UI domain types (copied to `packages/shared/src/domain.ts`) |
| `reference/MIGRATION_SPEC.md` | 1047-line spec — search by section number for any deep question |
| `reference/HANDOFF.md` | Original author's notes for context |
| `reference/shared/styles*.css` | Design tokens (warm-linen extracted to `apps/web/tailwind.config.ts` in Phase 0) |
| `reference/CLAUDE.md` | **DO NOT FOLLOW.** That file describes the prototype's no-build conventions and is irrelevant to the rewrite. |
| `CARRES_PORTAL_V2_PLAN.md` (repo root) | Master plan — phase definitions, acceptance criteria |
| `CLAUDE.md` (this file, repo root) | Project rules — what you're reading |

### Important: do not treat `reference/production/src/` as a starting codebase

The zip's `production/` folder contains a 60% complete Vite + React + TS implementation that connects **directly** to Supabase (no Hono layer). It is a **reference for data flow patterns only**. Do not copy its components, pages, or routing structure — we are rewriting the architecture with Hono in the middle, and that changes how queries, mutations, and auth flow.

Components in `apps/web/src/pages/` are **written from scratch by reading `reference/proto/*.jsx`**, not by copy-pasting from `reference/production/src/`.

---

> **Loo's stake**: 9 roles delivered, performance beats old system, on-time Go-live.
> **Your stake**: every phase acceptance ✅, no red lines crossed, docs updated as you go.

—— End of CLAUDE.md ——


## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health

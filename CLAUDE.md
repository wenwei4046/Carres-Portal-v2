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
Current phase: Phase 4.5 Chunk 1 SHIPPED + post-tag receive-rpc-v3-swap. Tag `phase-4.5-chunk-1-complete @ 210e222` created and pushed. Working through Chunk 1 medium carry-forwards before Chunk 2 starts. Latest: `phase-4.5-chunk-1-receive-rpc-v3-swap` closed — POST /api/logistics/pos/:id/receive now calls v3 batched RPC `logistics_receive_po_with_do` (0045:614) with single payload `{doNumber, doFilePath, lines: [{sku, receivedQty}]}` instead of v2 per-line loop, so the uploaded DO file path actually persists on the PO row. Implementation work (Tasks 1-48) landed across `f888cca..f9154d8` (49 commits). 7 migrations landed and applied to staging Supabase project_id `kfprgpjpaffedghytstl`: 0041 (app_users.partner_id CHECK + INDEX), 0042 (delivery-orders Storage bucket + RLS), 0043 (at_warehouse_waiting enum value), 0044 (4 PO RFD/dispatch columns + partial INDEX), 0045 (5 NEW + 2 EXTENDED + 1 MODIFIED RPCs), 0046 (LP role RLS + column whitelist VOLATILE trigger), 0047 (orders_rollup_stage Codex F2 amend). Plan + spec amended in-flight at `f87ef4e` for 2 Loo-approved fixes (Bug 1: `'dispatched'` enum drift → narrow policy to `sup_status = 'pickup_assigned'`; Bug 2: trigger NEW.sku/NEW.qty drop — columns live on purchase_order_lines).
Project started: 2026-05-02
Last phase completed: Phase 4.5 Chunk 1 — 2026-05-05, tag `phase-4.5-chunk-1-complete @ 210e222`. Post-tag carry-forward `receive-rpc-v3-swap` closed in this session.
Tags so far: phase-0/1/2a/2b/2c/3/4-complete (7 tags) · `phase-4-v3-complete` annotated `2e6fdae` on commit `d4ba236` created + pushed 2026-05-05 · `phase-4.5a-v3-wake-complete` annotated on commit `6721471` created + pushed 2026-05-05 · `phase-4.5-chunk-1-complete` annotated on commit `210e222` created + pushed 2026-05-05
Test count: 731/731 green (shared 117 + api 338 + web 276) — net +6 from Chunk 1 baseline 725 (4 new shared schema tests for receivePoWithDoInput shape + 2 new api tests for doNumber/lines empty-array validation). 7 Playwright E2E specs added during Chunk 1 (`mattress-full-happy`, `bed-frame-full-happy`, `sofa-accept-happy`, `sofa-reject-relocate`, `lp-update-column-whitelist`, `concurrent-rfd-race`, `lp-creation-and-login` extended) — all `test.fixme()` pending Loo's local seed + run.
Migrations applied: 49 files (0001-0040 baseline 42 + 0041/0042/0043/0044/0045/0046/0047 = 49 distinct files; latest = 0047_orders_rollup_stage_amend applied to staging Supabase project_id `kfprgpjpaffedghytstl` 2026-05-05).
F-11 (Workers bundle size) status: unchanged from Phase 4.5a — 1034 KiB raw / 197 KiB gzipped after @react-pdf/renderer landed.
Biz model locked (per Loo 2026-05-03):
  • Dealer just sells. Customer pays HQ direct. No HQ→dealer credit / debt.
  • Outstanding column = customer-owe-HQ (dealer chases for 50% top-up gate)
  • Phase 4 (Logistics) and Phase 6 (Supplier) are HQ INTERNAL roles, NOT dealer-side
Phase 4.5 Chunk 1 plan execution (per `docs/superpowers/plans/2026-05-05-phase-4.5-chunk-1.md`):
  • Sprint 1 (Tasks 1-8) ✅ Schema migrations 0041-0047 applied + db-types/domain hand-edit
  • Sprint 2 (Tasks 9-17) ✅ 8 RPCs in 0045 (incremental WIP commits); SOP_SOFA_SPECIAL v2 in `packages/shared/src/sops.ts`
  • Sprint 3 (Tasks 18-28) ✅ LP portal `/delivery-partner/*` + Principal create-LP form + `/api/principal/partners` + `/api/partner/*` + `PartnerRequestForDeliveryDialog`
  • Sprint 4 (Tasks 29-38) ✅ Logistics dialogs (`LpInboundConfirmDialog`, `WarehouseRelocateDialog`, `DispatchPartnerDialog` w/ RFD/Force toggle, `ResumeFromWaitingDialog`) + `/api/storage/dos/sign-upload` + `DOFileUploadField` (USER-JWT signing per Codex F11) + `ReceivePOModal` real-upload
  • Sprint 5 (Tasks 39-48) ✅ 7 Playwright E2E specs (`test.fixme`) + Codex F1-F12 verification tests (12 tests, all real assertions, no placeholders) + this §17 update + reflection
  • Tag (Task 49) ⏳ pending Loo's local verification
Next decision pending:
  1. Loo runs `pnpm seed:lp-test-user` against staging + dev server + un-fixme E2E specs one by one
  2. Loo creates + pushes annotated tag `phase-4.5-chunk-1-complete` on the post-Task-49 commit
  3. Phase 4.5b/4.5c/4.5d sub-phases per Loo's pick — partner role activation deeper, DO photo retention, Sofa Ready Confirm UI rewrite (or pivot directly to Phase 5 Finance kickoff)
Carry-forward TODOs (close 6, open 9):
  ## CLOSED in Chunk 1
  • phase-4.5-partner-role-tenancy ✅ closed (LP role + JWT + RLS + portal + Principal create-LP form all landed)
  • phase-4.5-do-file-storage-upload ✅ closed (`delivery-orders` Storage bucket + RLS + USER-JWT sign-upload endpoint + DOFileUploadField + ReceivePOModal wire-up)
  • phase-4.5-sofa-relocate-ui ✅ closed (`LpInboundConfirmDialog` + `WarehouseRelocateDialog` + `ResumeFromWaitingDialog` all landed)
  • phase-4-v3-print-do-toast-test ✅ closed (covered by `DOFileUploadField.test.tsx` upload-success path)
  • phase-4-v3-confirm-auto-skip-from-stock ✅ closed in Phase 4.5a wake
  ## CLOSED post-tag (Chunk 1.5)
  • phase-4.5-chunk-1-receive-rpc-v3-swap ✅ closed — `POST /:id/receive` now calls v3 batched `logistics_receive_po_with_do` (0045:614) with `{doNumber, doFilePath, lines}` payload; modal sends one atomic call carrying every ticked line + uploaded DO path. Semantic shift: `receivedQty` is now NEW TOTAL not delta (RPC computes delta + rejects decreases). 9 files touched across packages/shared, apps/api, apps/web.
  ## NEW (9 opened)
  • phase-4.5-chunk-1-lp-address-column (medium) — `delivery_partners` has no `address` column; Task 19 hack concatenates phone+address into `contact`. Schema migration to split needed.
  • phase-4.5-chunk-1-lp-whitelist-tighten (low) — Task 6 trigger covers 20 of 29 PO columns; 5 unprotected (`dl_refs`, `do_number`, `created_at`, `updated_at`, `placed_at`) — switch from deny-list to allow-list pattern.
  • phase-4.5-cleanup-at-own-wh-waiting-rename (low) — irreversible enum recreate to drop deprecated `at_own_wh_waiting` once `at_warehouse_waiting` is fully adopted.
  • phase-4.5-do-storage-retention-policy (low) — TTL or archive policy for `delivery-orders` bucket files.
  • phase-4.5-procurement-vs-delivery-partner-field-split (medium) — single `delivery_partner_id` field per PO; per-leg split deferred to Chunk 2.
  • phase-4.5-cleanup-old-partner-confirm-receive (medium) — Chunk 2 deprecate 0034:366 `partner_confirm_receive` once Sofa fully migrated to `lp_accept_inbound_delivery`.
  • phase-4.5-0036-rollup-amend-cleanup (low) — consolidate 0036 + 0047 `orders_rollup_stage` into single source-of-truth function definition.
  • phase-4.5-storage-signed-url-ttl-config (low) — explicit TTL config for signed-upload URLs (currently default).
  • phase-4.5-customer-pod-upload (medium) — separate POD (Proof of Delivery) bucket + flow (Chunk 2 / Phase 6) — distinct from supplier-side DO uploads.
Pre-Chunk-1 carry-forward TODOs (unchanged from Phase 4.5a): orphaned-debt-rpcs · audit-log-duplicate-index · approval-decided-by-shows-uuid · approval-row-type-missing-reason · pagination-deferred · supabase-jwt-secret-cleanup · phase-2-leftovers (mobile nav, salesperson outlet scoping) · phase-4-m2-schema-audit · phase-4-rpc-shape-audit · phase-4-or-filter-harden · phase-4-replace-any-types · phase-4-zod-strict-uniform · phase-4-logistics-test-gaps · phase-4-detail-partner-name-join · phase-4-or-filter-harden-orders · phase-4-22p02-mapping · phase-4-uuid-path-validation · phase-4-spec-photo-upload-reconcile · phase-4-create-po-eta-partner · phase-4-cross-order-bundle-aggregation · phase-4-zod-strict-nested-lines · phase-4-po-id-race · phase-4-prefill-warehouseid-q4-drift · phase-4-orphans-warning-banner · phase-4-v3-receive-eligibility-extract · phase-4-warehouse-picker-dedupe · phase-4-warehouse-picker-kind-filter · phase-4-v3-skus-supplier-id-not-null-tighten · phase-4-v3-sop-type-dedupe · phase-4-v3-rpc-integration-tests · phase-4-v3-sop-source-of-truth-dedupe · phase-4-v3-auto-fill-thread-scan-narrow · phase-4-v3-receive-idempotent-audit · phase-4-v3-receive-cumulative-vs-delta-naming · phase-4-orders-test-logistics-stage-null-type-drift · phase-7-reassign-warehouse-wire · phase-7-pdf-do-photo-upload · phase-9-movements-cursor-pagination · phase-9-pdf-visual-snapshots · phase-9-dashboard-split-layout · phase-9-trigram-search · phase-9-pdf-cache-immutable-orders · phase-9-bundle-size-monitor · phase-9-cjk-font-extended · phase-9-po-cogs-source
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

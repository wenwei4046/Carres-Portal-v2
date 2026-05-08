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
Current phase: Phase 4.5 Chunk 2 COMPLETE + PUSHED 2026-05-07, plus 1 post-push hotfix 2026-05-07, plus 2026-05-08 evening carry-forward sweep (4 CFs closed in 4 interactive commits + 2 new migrations). HEAD `c728c9d` synced with origin (2026-05-08 02:00 GMT+8). Sprint A pre-autonomous (T1-T5 baseline at ab26b43); Sprints B-G shipped autonomously per agenda 2026-05-06 §1 pre-approval (CLAUDE.md §14 #1 + #7). 2026-05-07 morning push synced 40 commits + 6 tags to origin; 2026-05-07 evening hotfix added LogisticsApp descendant-Routes regression suite (5 tests). 2026-05-08 evening sweep: CF #4 dispatch-dialog-wiring-drift (b087710), CF #2 partner-rfd-page-rebuild (424473e + migration 0059), CF #1 route-mount-middleware-leak (cdc50fc), CF #3 stale-pre-0051-rpcs (c728c9d + migration 0060 IRREVERSIBLE per Loo §14 #1+#7 in-conversation approval). Each commit pushed sequentially; tests stayed green throughout (856 → 871, +15). Post-push hotfix root cause from 2026-05-07: `LogisticsApp.tsx` descendant `<Routes>` used absolute paths which React Router 7 fails to match in nested context — fixed by switching to relative paths. Codex's 3 review passes + existing unit tests both missed this because `TabbedProcurementShell.test.tsx` mounts the shell at the top level, skipping the descendant-mount layer entirely.
Project started: 2026-05-02
Last phase completed: Phase 4.5 Chunk 2 — pushed origin 2026-05-07. 2026-05-08 evening swept 4 medium/low carry-forwards (#1/#2/#3/#4); 3 low-priority CFs remain open from the Chunk 2 NEW list (`seed-sql-stale`, `alerts-tab-routing`, `stock-alerts-high-threshold-expose`). Phase 5 Finance kicks off next.
Tags so far: phase-0/1/2a/2b/2c/3/4-complete (7 tags) · `phase-4-v3-complete` annotated `2e6fdae` on commit `d4ba236` created + pushed 2026-05-05 · `phase-4.5a-v3-wake-complete` annotated on commit `6721471` created + pushed 2026-05-05 · `phase-4.5-chunk-1-complete` annotated on commit `210e222` created + pushed 2026-05-05 · `phase-4.5-chunk-2-sprint-b-complete` (lightweight, created 2026-05-06, pushed 2026-05-07) · `phase-4.5-chunk-2-sprint-c-complete` (lightweight, created 2026-05-06, pushed 2026-05-07) · `phase-4.5-chunk-2-sprint-d-complete` (lightweight, created 2026-05-06, pushed 2026-05-07) · `phase-4.5-chunk-2-sprint-e-complete` (lightweight, created 2026-05-06, pushed 2026-05-07) · `phase-4.5-chunk-2-sprint-f-complete` (lightweight, created 2026-05-06, pushed 2026-05-07) · `phase-4.5-chunk-2-complete` (annotated, tag SHA `eefaba7` on commit `35f6c73`, created 2026-05-06, pushed 2026-05-07)
Test count: 871/871 green (shared 154 + api 392 + web 325) — net +140 from Chunk 2 baseline 731 (Sprint A pre-run +2, Sprints B-G + T42 codex passes +118, post-push hotfix LogisticsApp.test.tsx +5, 2026-05-08 carry-forward sweep +15: CF #4 web +3, CF #2 api+4 web+4, CF #1 api+4, CF #3 +0). 3 new Playwright E2E specs added during Sprint G T38 (`per-leg-lp-split`, `tab-routing`, `stockpile-alert-to-po`) — all `test.fixme()` pending Loo's local run. Chunk 1's 7 Playwright E2E specs still pending Loo's local seed + run from prior session. Note: the post-push descendant-Routes regression would have been caught earlier if `tab-routing.spec.ts` had been un-fixme'd against staging — argues for prioritizing E2E un-fixme + local Playwright run before Phase 5 Finance kickoff.
Migrations applied: 63 files (Chunk 1 baseline 50 + Chunk 2: 0049/0050/0051/0052/0053/0054/0055/0055b/0056/0057/0058 = 11 + 2026-05-08 sweep: 0059_logistics_partner_rfd_pending (CF #2) + 0060_drop_stale_chunk2_rpcs (CF #3 IRREVERSIBLE) = 63 distinct files; latest = 0060 (DROPs 6 stale Category C functions per Loo's explicit single-instance §14 #1+#7 approval) applied to staging Supabase project_id `kfprgpjpaffedghytstl` 2026-05-08).
F-11 (Workers bundle size) status: unchanged from Phase 4.5a — 1034 KiB raw / 197 KiB gzipped after @react-pdf/renderer landed.
Biz model locked (per Loo 2026-05-03):
  • Dealer just sells. Customer pays HQ direct. No HQ→dealer credit / debt.
  • Outstanding column = customer-owe-HQ (dealer chases for 50% top-up gate)
  • Phase 4 (Logistics) and Phase 6 (Supplier) are HQ INTERNAL roles, NOT dealer-side
Phase 4.5 Chunk 2 plan execution (per `docs/superpowers/plans/2026-05-06-phase-4.5-chunk-2-autonomous-run.md`):
  • Sprint A pre-autonomous (T1-T5 ✅ baseline at ab26b43): threads customer-leg cols (0049+0050) + db-types/domain/adapters
  • Sprint B autonomous (T6-T11): 4 customer-leg RPCs (0051) + Hono routes + frontend reads + integration tests + close-out
  • Sprint C autonomous (T12-T16, IRREVERSIBLE): 0052 (DROP 4 + RENAME 1) + 0053 (6 entries via T13.6 audit) + shared types + api+web rename refs + close-out. Loo §1 pre-approval converted T13 STOP gate.
  • Sprint D autonomous (T17-T23): stockpile thresholds (0054) + alerts RPC + thresholds POST + SetThresholdDialog + StockAlertsTile + CreatePOModal "Suggest from alerts" + close-out
  • Sprint E autonomous (T24-T30): COGS (0055) + cost_source enum + RPC validation (0055b) + recent-cost route + CogsLineEditor + CreatePOModal wire + wire-contract closure + close-out
  • Sprint F autonomous (T31-T37): suppliers Phase 6 prep (0056) + PROCUREMENT_TAB_SLUGS + procurement-tabs route + TabbedProcurementShell + 3 child tabs + nested routes + test redistribution + close-out. LogisticsProcurement.tsx + .test.tsx DELETED.
  • Sprint G autonomous (T38-T41): 3 Playwright E2E specs (test.fixme) + reflection doc + this §17 update + final feature commit
  • T42 codex review (autonomous): comments addressed via fresh subagents per cluster, re-run until clean
  • T43 annotated tag phase-4.5-chunk-2-complete (autonomous, pushed 2026-05-07)
Next decision pending:
  1. Verify Chunk 1 carry-forwards (LP seed + un-fixme E2E specs) — still pending from Chunk 1; un-fixme 3 new Chunk 2 Playwright specs (`per-leg-lp-split`, `tab-routing`, `stockpile-alert-to-po`) after seeding
  2. Phase 5 Finance — spec drafted 2026-05-08 21:42 GMT+8 at `docs/superpowers/specs/2026-05-08-phase-5-finance-spec.md` (~480 lines, 12 sections); 9 Q's locked in-conversation per Loo (Q1=A new RPC `finance_topup_approve` wrapper / Q2=A manual invoice issue / Q3=B CSV import day 1 / Q3.1=Maybank2u format / Q4=B auto-suggest top-6 recon candidates / Q5=A keep CN/RF distinction / Q6=A single AR aging RPC / Q7=A server-side @react-pdf invoice / Q8=A Chunk A/B/C split). Net new for Phase 5: migrations 0061 (bank_statements + reconciliations tables) + 0062 (~11 new RPCs); 5 Hono router files; 8 web pages; ~98 net new tests. Next: `/plan-eng-review` on the spec → `/make-plan docs/superpowers/plans/2026-05-09-phase-5-finance-chunk-A.md` for Chunk A (foundation: A1+A2 acceptance) → execute
Carry-forward TODOs (Chunk 2 close 9, open 3):
  ## CLOSED in Chunk 2
  • phase-4.5-procurement-vs-delivery-partner-field-split ✅ closed (Sprint A-C — CQ1: 0049+0051 thread customer-leg + 0052 PO column rename + 0053 procurement-leg RPCs)
  • phase-4-detail-partner-name-join ✅ closed bonus during T9 (Sprint B) — OrderCard LP pill renders thread.delivery_partner_id 8-char UUID slug; full partner-name resolution remains separate concern out of Chunk 2 scope
  • phase-9-po-cogs-source ✅ closed (Sprint E — CQ3: 0055 cost+cost_source + 0055b RPC validation)
  • phase-4.5-supplier-tab-ui-rewrite ✅ closed (Sprint F — CQ4: TabbedProcurementShell + 3 per-tab components + nested routes + test redistribution)
  • phase-4-v3-stockpile-advanced-flows ✅ closed (Sprint D — CQ2: 0054 thresholds + alerts RPC + SetThresholdDialog + StockAlertsTile + Suggest-from-alerts)
  ## CLOSED in 2026-05-08 evening sweep
  • phase-4.5-chunk-2-dispatch-dialog-wiring-drift ✅ closed 2026-05-08 commit `b087710` (CF #4 — DispatchPartnerDialog + PartnerRequestForDeliveryDialog rewired to thread-scoped routes; prop `poId` → `{ threadId, poLabel? }`; URL drops `:id`/`:po` path param; body camelCase + threadId; PartnerRequestForDeliveryDialog dead confirm-delivery-date input field removed; +3 web tests; both dialogs remain orphan code awaiting future mount sites)
  • phase-4.5-chunk-2-partner-rfd-page-rebuild ✅ closed 2026-05-08 commit `424473e` + migration 0059 (CF #2 — new SECURITY DEFINER RPC `logistics_partner_rfd_pending` joins orders.customer_name + filters by `app_partner_id()`; new `GET /api/partner/pickups/rfd-pending` Hono route; PartnerPickupsPage two-section rebuild with "RFD Pending" table + "View RFD" button mounting PartnerRequestForDeliveryDialog with `{ threadId, poLabel }`; on dialog close invalidates `qk.partner.rfdPending()`; +4 api +4 web tests)
  • phase-4.5-chunk-2-route-mount-middleware-leak ✅ closed 2026-05-08 commit `cdc50fc` (CF #1 — fix path (b) — new `apps/api/src/lib/auth-guards.ts` `requireLogistics` per-route middleware; replaced blanket `use("*", ...)` on logisticsPosRouter (9 routes) + logisticsOrdersRouter (11 routes); inline allowlists in lp-inbound + dispatch-customer-leg + resume-dispatch now effective. Behavior change: principal can now reach dispatch-customer-leg + resume-dispatch + lp-{accept,reject,relocate}-inbound; partner can reach lp-{accept,reject}-inbound — declared all along by inline allowlists. +4 api tests verifying principal/partner admit)
  • phase-4.5-chunk-2-stale-pre-0051-rpcs ✅ closed 2026-05-08 commit `c728c9d` + migration 0060 IRREVERSIBLE (CF #3 — DROP 6 dead-code Category C functions per Loo's explicit §14 #1+#7 in-conversation single-instance approval: `po_issue`, `logistics_assign_pickup_partner`, `partner_confirm_receive`, `logistics_attach_pod_do`, `partner_accept_dispatch`, `partner_reject_dispatch`. T13.6 audit confirmed no live callers; codex-fixes.test.ts F9/F12 read migration TEXT not live functions so still green. `logistics_attach_pod_do` referenced in sops.ts as a string literal but no runtime dispatcher reads that map yet — Phase 7 recreates with fresh body. Verified empty pg_proc lookup post-apply)
  ## STILL OPEN (3 low-priority from Chunk 2)
  • phase-4.5-chunk-2-seed-sql-stale (low) — `supabase/seed.sql` references old PO column names + columns dropped by 0017. Stale seed file. Worth fixing before any new dev needs to seed staging.
  • phase-4.5-chunk-2-alerts-tab-routing (low) — StockAlertsTile click navigates to URL `/logistics/warehouse?alert=true` via useNavigate but `LogisticsApp` is tab-state-based; URL changes but tab doesn't sync. Likely solved alongside Sprint F's nested-route work (already done in T35) but cross-impact unverified.
  • phase-4.5-chunk-2-stock-alerts-high-threshold-expose (low) — `logistics_stock_alerts()` RPC returns `low_threshold` only; spec implied `high_threshold` exposed too. Follow-up RPC migration if Loo wants per-row ceilings honored. T22 formula collapsed to `low_threshold * 2 - effective`.
Pre-Chunk-2 Chunk 1 carry-forward TODOs (still open, unchanged from Chunk 1 close-out):
  • phase-4.5-chunk-1-lp-whitelist-tighten (low) — Task 6 trigger covers 20 of 29 PO columns; switch from deny-list to allow-list pattern. (Note: T13.6 audit during Chunk 2 Sprint C tightened LP whitelist to 1 col post-0052 — this CF is now smaller in scope.)
  • phase-4.5-cleanup-at-own-wh-waiting-rename (low) — irreversible enum recreate to drop deprecated `at_own_wh_waiting` once `at_warehouse_waiting` is fully adopted.
  • phase-4.5-do-storage-retention-policy (low) — TTL or archive policy for `delivery-orders` bucket files.
  • phase-4.5-cleanup-old-partner-confirm-receive ✅ closed 2026-05-08 via CF #3 sweep (DROPPED in migration 0060 alongside the 5 other Category C functions; `partner_confirm_receive(text)` no longer exists in Postgres).
  • phase-4.5-0036-rollup-amend-cleanup (low) — consolidate 0036 + 0047 `orders_rollup_stage` into single source-of-truth function definition.
  • phase-4.5-storage-signed-url-ttl-config (low) — explicit TTL config for signed-upload URLs (currently default).
  • phase-4.5-customer-pod-upload (medium) — separate POD (Proof of Delivery) bucket + flow (Phase 6) — distinct from supplier-side DO uploads.
Pre-Chunk-1 carry-forward TODOs (unchanged from Phase 4.5a): orphaned-debt-rpcs · audit-log-duplicate-index · approval-decided-by-shows-uuid · approval-row-type-missing-reason · pagination-deferred · supabase-jwt-secret-cleanup · phase-2-leftovers (mobile nav, salesperson outlet scoping) · phase-4-m2-schema-audit · phase-4-rpc-shape-audit · phase-4-or-filter-harden · phase-4-replace-any-types · phase-4-zod-strict-uniform · phase-4-logistics-test-gaps · phase-4-or-filter-harden-orders · phase-4-22p02-mapping · phase-4-uuid-path-validation · phase-4-spec-photo-upload-reconcile · phase-4-create-po-eta-partner · phase-4-cross-order-bundle-aggregation · phase-4-zod-strict-nested-lines · phase-4-po-id-race · phase-4-prefill-warehouseid-q4-drift · phase-4-orphans-warning-banner · phase-4-v3-receive-eligibility-extract · phase-4-warehouse-picker-dedupe · phase-4-warehouse-picker-kind-filter · phase-4-v3-skus-supplier-id-not-null-tighten · phase-4-v3-sop-type-dedupe · phase-4-v3-rpc-integration-tests · phase-4-v3-sop-source-of-truth-dedupe · phase-4-v3-auto-fill-thread-scan-narrow · phase-4-v3-receive-idempotent-audit · phase-4-v3-receive-cumulative-vs-delta-naming · phase-4-orders-test-logistics-stage-null-type-drift · phase-7-reassign-warehouse-wire · phase-7-pdf-do-photo-upload · phase-9-movements-cursor-pagination · phase-9-pdf-visual-snapshots · phase-9-dashboard-split-layout · phase-9-trigram-search · phase-9-pdf-cache-immutable-orders · phase-9-bundle-size-monitor · phase-9-cjk-font-extended
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

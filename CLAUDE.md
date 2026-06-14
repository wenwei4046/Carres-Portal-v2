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

**Plugin / skill discipline**: Do **NOT** auto-invoke `superpowers` plugin skills (brainstorming, test-driven-development, systematic-debugging, writing-plans, subagent-driven-development, etc.) by default. The plugin's SessionStart hook demands skill invocation on every task — per the plugin's own priority rules, this CLAUDE.md instruction **overrides** that. Use a superpowers skill only when the task genuinely needs it (e.g. a large multi-session feature that benefits from a written plan), and state why before invoking. Same restraint applies to other third-party plugin skills (gstack, vercel, codex): plain tools first, skills only when they clearly add value.

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

The work is divided into **Phase 0 → Phase 10+** in `CARRES_PORTAL_V2_PLAN.md` §8. Phases 0-9 are complete; Phase 10 covers post-launch fixes + per-thread architecture (see §17 for current state). **Always**:

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

Loo's HV Portal currently has a 130-policies + heavy `dashboard_summary()` lag problem. **Do not repeat this here.** All three fixes below were applied in Phase 1 (baseline test PASSED 2026-05-03) and remain enforced rules:

### Fix 1: Custom JWT claims
Use Supabase Auth Hook to inject `role`, `dealer_id`, `supplier_id`, `partner_id` into JWT `app_metadata` at login. RLS policies read from `auth.jwt()`, never `auth.app_role()` (which queries `app_users` per row).

### Fix 2: InitPlan wrapping
Every policy that calls a function MUST wrap it: `( select auth.app_dealer_id() )` not `auth.app_dealer_id()`. PG14+ runs the wrapped form once per query (InitPlan); the unwrapped form runs per row.

### Fix 3: STABLE marker
All helper functions in `auth` schema MUST be declared `language sql stable security definer`. Missing `stable` defeats the planner's caching.

Phase 1 baseline (PASSED):
- dealer 50 active orders: < 100ms
- principal dashboard summary: < 500ms
- operation 4-column kanban: < 200ms

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

**Visual design source of truth = v17 (locked 2026-06-09), NOT the warm-linen prototype.** The `reference/proto/*.jsx` files remain the source of truth for **layout + behaviour** (what goes where, which buttons / modals / columns exist), but the **visual tokens are v17**: clean modern SaaS + Carres warmth. Token NAMES are unchanged (`base-*`, `primary`, `accent`…) so components re-theme with zero churn — only the values flipped.

- **Brand color**: `#C44D2B` (flame) — supersedes the old `#D64F20` terracotta
- **Neutrals**: Tailwind cool gray (`--base-50 … --base-900`)
- **Page bg**: cream `#F5F1EA` (warmth kept); cards = white (hierarchy from borders + subtle shadow)
- **Body + display font**: Inter (DM Sans in the fallback chain). Big Shoulders Stencil → `font-stencil`, login mark only
- **Mono**: JetBrains Mono
- Tokens live in `apps/web/src/index.css` (`:root`) + `apps/web/tailwind.config.ts`

**v17 component utilities** (Phase 2, in `index.css @layer components` — use these instead of hand-rolling `text-[Npx]` / `bg-primary` buttons):
- **Type scale**: `.t-h1` (32) · `.t-h2` (24) · `.t-h3` (18) · `.t-h4` (15) · `.t-body` (14) · `.t-small` (13) · `.t-tiny` (12) · `.t-micro` (11, uppercase)
- **Button hierarchy**: `.btn-hero` = the ONE flame CTA per page (a genuine create / commit action only) · `.btn-primary` = **black** workhorse for every other primary · `.btn-secondary` / `.btn-ghost` · `.btn-danger` = red text on white (destructive, never filled)
- **Status pills**: `.pill` + `.pill-{draft|sent|confirmed|collected|overdue|neutral}`. NOTE: the set has **no amber** — warning / low / pending states keep their semantic-color badges (add a `.pill-warning` from `--warning-soft` if pill coverage of those states is ever needed)

When implementing a page:
1. Open the corresponding `reference/proto/*.jsx` for **layout + behaviour**
2. Build with shadcn primitives + Tailwind tokens + the v17 utilities above
3. Run `/design-review` for **layout** fidelity (NOT colour — colour is v17, not the proto)
4. Iterate until layout matches + v17 tokens applied

Other proto style presets (slate / press / editorial) remain deferred; v17 is the single shipped look.

---

## 11. Testing

### Required tests per phase
- **Unit (vitest)**: every adapter, every zod schema, every utility — 100% coverage on these
- **Integration (vitest + msw)**: every Hono route — mock Supabase responses
- **E2E (Playwright)**: at minimum the role's "happy path" defined in phase Acceptance
- **Manual smoke**: Loo runs through the role himself before merge

### E2E flows verified at Phase 9 cutover (2026-05-10)
- Dealer full order → operation dispatch → partner deliver → finance receive payment
- Top-up approval (dealer → principal/finance approve → balance update)
- Supplier PO ack → ship → operation receive
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

## 17. Project status

### 17.1 Current state (as of 2026-06-15)

| | |
|---|---|
| Active phase | **Catalog "Product & Maintenance" shipped 2026-06-15** (PR #19): 3-tab page (SKU Master · Modular · narrow Maintenance) replacing the old single-page Catalog; backend migrations 0169-0173. Phase 11 shipped 2026-06-14 (PR #15): 11.1 Proceed Date + 11.2 `operation_stage` 7→6. Phase 10 post-launch fixes still ongoing. |
| Project started | 2026-05-02 |
| Web URL | https://carres-portal.pages.dev |
| API URL | https://carres-portal-v2-api.wwch.workers.dev |
| DB | staging Supabase = prod, project_id `kfprgpjpaffedghytstl` |
| Latest migration | **0173** `storage_product_model_photos_bucket` (Catalog rebuild, applied + on prod 2026-06-14). Catalog migrations 0169-0173: 0169 enum +accessory/+service · 0170 `product_skus.pos_active`+`description` · 0171 `product_models.photo_url`+`allowed_options` + `product_skus.supplier_id` nullable · 0172 `addons.service_sku` + 4 `SVC-` Service SKUs under the `service-addons` model · 0173 public `product-model-photos` bucket. Prior — **0168** `drop_set_order_date_2arg_shim`. Phase 11: 0165 = `orders.proceed_date` + 3-arg `set_order_date` · 0166 = temp 2-arg shim (dropped by 0168) · **0167** = `operation_stage` enum 7→6 (`placed`/`proceed_request`→`confirmed`, `awaiting_operation_action`→`in_production`, `waiting` kept; `orders.status` UNTOUCHED as anchor; 30 fns + 3 triggers self-adaptively recreated) · 0168 = drop shim. The 6/12 ops-cockpit migrations 0159-0166 (`ops_order_control`, `ops_notes_tasks`, `ops_order_control_payments`, `ops_bulk_complete_orders`, etc.) are main's authentic files. **NOTE**: 0165 + 0166 each have TWO distinct files (an ops_* migration + an 11.1 migration sharing the number) — cosmetic only, this project applies migrations manually via MCP (tracker keys on timestamp, not filename). The 5 branch backfill duplicates were deleted in cleanup. |
| Catalog state | 11 suppliers · 171 product_models (170 + the 0172 `service-addons` parent) · **1017 product_skus** (1013 AutoCount + 4 `SVC-` Service SKUs). Categories widened 3→5 (+accessory, +service). product_skus carry `pos_active` (sell-side ON/OFF, distinct from `discontinued_at`) + editable `description`; product_models carry `photo_url` + `allowed_options` jsonb. (Original target 1091, 78 source dupes in carres-sku-master.xlsx — see CFs.) |
| Orders state | **158 orders** (verified 2026-06-08): 153 AutoCount-imported (`source_system='autocount'`, all status `place`, SO-1001..1158, ~575 units feeding supplier forecast) + 5 native test orders (SO-1116..1120, cancelled/proceed_order). 0 have `delivery_stops` set — multi-leg chain never live-exercised (see §17.3 Pending). next `orders_so_seq` ≈ SO-1159. |
| Test count | api **732/735** (3 pre-existing fails) · web 535/540 (5 pre-existing fails) · shared 193/193 — measured 2026-06-15; all 8 fails pre-existing per §17.7, zero new regressions from the Catalog rebuild. (Catalog added 12 API tests + fixed a latent GET-pagination test (`.range` mock) + a timezone-flaky deadline countdown test.) |
| Web bundle | 2880.12 KiB raw / 843.65 KiB gzipped (bundle `index-I7BROrvu.js`; CSS `index-B295aI5-.css` 63.76 KiB; built+deployed 2026-06-15 = Catalog rebuild; bundle-size regression CF still open, see §17.5) |
| API bundle | 1304.42 KiB raw / 245.85 KiB gzipped baseline. **Catalog API deployed 2026-06-14 (Worker `f15ce6ce`, +catalog routes, backward-compatible)**; the PR #19 follow-ups were frontend-only and did not redeploy the Worker. |

### 17.2 Phase timeline

| Phase | Status | Closed | Tag(s) / key commit |
|---|---|---|---|
| 0 Setup | ✅ | 2026-05-02 | `phase-0-complete` |
| 1 Schema + RLS perf | ✅ | 2026-05-03 | `phase-1-complete` (baseline test PASSED) |
| 2 Dealer | ✅ | — | `phase-2a-complete`, `phase-2b-complete`, `phase-2c-complete` |
| 3 Principal | ✅ | — | `phase-3-complete` |
| 4 Operation v1 | ✅ | 2026-05-05 | `phase-4-complete`, `phase-4-v3-complete` (commit `d4ba236`) |
| 4.5 Operation v2 | ✅ | 2026-05-07 | `phase-4.5a-v3-wake-complete` (`6721471`), `phase-4.5-chunk-1-complete` (`210e222`), `phase-4.5-chunk-2-complete` (`35f6c73`) |
| 5 Finance | ✅ | 2026-05-09 ~01:00 | 8 finance pages + invoice PDF + credit-note apply. Final `6a8d1e0` |
| 6 Supplier | ✅ | 2026-05-09 ~01:55 | `phase-6-complete` · 13 commits `da0a988` → `606d792` |
| 7 Partner | ✅ | 2026-05-09 | `phase-7-complete` (`a1096fd`) · POD upload + Partner Fleet |
| 8 Showroom + BD | ✅ | 2026-05-09 | `phase-8-complete` (`1f71eea`) · BD inquiry pipeline (migration 0072) |
| 9 Production cutover | ✅ | 2026-05-10 ~23:25 | `phase-9-complete` · DB cleanup 2026-05-09, CF deploy 2026-05-10 |
| 10 Post-launch | 🔵 in progress | from 2026-05-11 | See §17.3 work-log |
| 11 Proceed Date + state collapse | ✅ | 2026-06-14 | PR #15 (`950c0ec`) · 11.1 proceed_date (0165) + 11.2 operation_stage 7→6 (0167). Spec: `docs/superpowers/plans/2026-06-14-phase-11-2-state-machine-spec.md`. Reconciled with main's 6/12 ops overhaul mid-merge (branch had forked 6/05 + missed it). |
| Catalog P&M rebuild | ✅ | 2026-06-15 | PR #19 · 3-tab **Product & Maintenance** (migrations 0169-0173 + shared + API + frontend) replacing the old single-page Catalog. Plan: `docs/superpowers/plans/2026-06-14-catalog-product-maintenance-rebuild.md`. Deployed + live-smoked. |

### 17.3 Phase 10 work-log

> **Full chronological detail → [`docs/phase-10-worklog.md`](docs/phase-10-worklog.md).** Each entry there = one logical session, with commit hashes + migration numbers + root-cause notes. The index below is date + one-line summary — open the doc for the *why / how* before touching anything it describes. Current live state → §17.1; open carry-forwards → §17.5.

- **2026-05-11** · Day 1 bug sweep · migrations 0083-0086 — login rewrite, badge unread semantics, partner kanban. **Heuristic: customer-leg (`order_supplier_threads.delivery_partner_id`) vs procurement-leg (`purchase_orders.procurement_partner_id`) confusion is THE partner-bug source — ASK WHICH LEG.**
- **2026-05-11** · Supplier required DO photo · migration 0094
- **2026-05-15** · Dealer/sales/showroom Delivered-tab bug · migration 0106
- **2026-05-15** · Supplier per-thread + multi-DO partial pickup · migrations 0107-0108 (largest ship since Phase 9)
- **2026-05-15** · Partial-pickup Playwright smoke + supplier RLS / SECURITY DEFINER RPC fixes · migrations 0109+0111
- **2026-05-15** · Pre-alpha DB cleanup (manual by Loo) — all transactional data → 0
- **2026-05-17** · Role rename logistics → operation · migration 0121 (~250 files)
- **2026-05-18** · partner_pickup_threads SOP-aware fix restored · migration 0122
- **2026-05-18** · dl → so rename · migration 0123 + gap-closes 0125/0126 (alias / regex blind spots)
- **2026-05-18** · Per-line thread granularity · migration 0124 + auto-split Phase 3 (no migration)
- **2026-05-18** · warehouse_id thread→order propagation · migration 0127
- **2026-05-18** · Cascade operation→thread mark-delivered + deep cascade audit · migrations 0128-0130
- **2026-05-18** · Supplier mark-ready PO rollup · migration 0131
- **2026-05-18** · Procurement Orders column + ETAs (`41cc96f`) · Seed SQL rename sweep (`947ec01`)
- **2026-05-18** · Principal sidebar wake — 5 pages built (Accounts / Audit / Suppliers / Orders / Stock)
- **2026-05-20** · Phase A migrations 0132-0137 caught up on remote (AutoCount import + per-unit stock seed)
- **2026-05-24** · Supplier Incoming forecast category fix · migrations 0148-0150 + HoOKkA→Ohana rename
- **2026-05-31** · 5-item ship F+E+B+C+D · migrations 0151-0154 (delivery e-sign / auto-dispatch + LP-reject / per-unit ID)
- **2026-06-04** · e–i checklist verify + Incoming header fix + deploy (`fa6c511` + `fe04b1c`)
- **2026-06-05** · Multi-leg delivery chain + 4 logistic partners + AutoCount resolver · migrations 0155-0158 · PRs #9-12
- **2026-06-12** · v17 Phase 2 design pass — type scale + button hierarchy + status pills (design SoT now v17)
- **2026-06-14/15** · Catalog → "Product & Maintenance" 3-tab rebuild · migrations 0169-0173 + shared + API + frontend · PR #19 · null-supplier Create-PO guard + deployed + live-smoked

### 17.4 Business model (locked 2026-05-03)

- Dealer just sells. Customer pays HQ direct. No HQ→dealer credit/debt.
- Outstanding column = customer-owe-HQ (dealer chases for 50% top-up gate).
- Phase 4 (Operation) + Phase 6 (Supplier) are HQ INTERNAL roles, NOT dealer-side.

### 17.5 Open carry-forwards

**HIGH**:
- `phase-10-rotate-alpha-test-passwords` — 9 alpha users at password='111' (sales / operation / hookka / nicefuture / nets / finance / bd / mattress / sales-mk). PrincipalAccounts UI built 2026-05-18 (commit `941c665`) gives Loo Reset password per row — rotate via UI before sharing portal externally.
- `phase-9-rotate-principal-password` — principal@carres.com still at password='111' (Phase 9 known-risk; rotate Week 2). If brute-force detected: `update auth.users set encrypted_password = crypt('<new>', gen_salt('bf')) where email='principal@carres.com'`. PDPA fine up to RM 300k if principal-level breach.

**MEDIUM**:
- `catalog-server-null-supplier-po-guard` — the null-supplier (service/accessory) Create-PO guard is FE-only (explicit `SUPPLIERLESS_CATEGORIES` short-circuit in `findSupplierForSku` + orphan band, 2026-06-15). Defense-in-depth: also reject any PO line whose `product_skus.supplier_id IS NULL` server-side in `operation_create_po` / `apps/api/src/routes/operation/pos.ts`, so a bypassed UI can't slip one through.
- `phase-10-supplier-pos-list-urgency-blank` — supplier PO LIST embed silently null because orders has no supplier read policy post-0111. Refactor list enrichment to SECURITY DEFINER RPC, OR add non-recursive supplier orders policy. Drawer works (uses RPC).
- `phase-10-abandon-cascade-to-po` — `operation_abandon_order` doesn't cascade to linked POs. PO may waste supplier production capacity.
- `phase-10-cogs-real-source` — `finance_monthly_pl` 55% revenue placeholder. Real: `sum(purchase_order_lines.cost * received_qty)` post-Phase-6.
- `phase-10-opex-real-source` — `finance_monthly_pl` constant RM 42k/month placeholder. Need opex schema (rent/payroll/ops).
- `phase-10-csv-bulk-import` — bank_statements manual-only. Maybank2u 5-col CSV format locked (Q3=B), deferred.
- `phase-10-partner-pickup-rpc-regression-guard` — 2 prior SOP-CASE regressions (0117 + 0118) in 2 days. Add regression test asserting CASE is in pg_get_functiondef.
- `phase-10-operation-to-thread-cascade-audit` — Mostly closed in 0129; spot-check remaining candidates (`operation_cancel_po`, `operation_warehouse_pick` — closed; `operation_revert_*` — verified safe).
- `phase-10-incoming-server-side` — `SupplierIncoming` V1 uses open-PO demand. Proto semantics: pending sales orders filtered by `supplier.cat_covered`. Dedicated `/api/supplier/incoming` RPC needed if precision matters.
- `phase-10-customer-pod-upload` — Separate POD bucket + flow distinct from supplier DO uploads.
- `phase-10-test-lp-confirm-flow` — Master data only has Carres Klang (own WH). To exercise `ready_confirm_sent` path (Nets sees "Awaiting Accept"), need LP-owned WH. Either add new WH or change Carres Klang's `owning_partner_id` to Nets.
- `phase-9-pdf-storage-persistence` — Phase 5 invoice PDF renders on-demand; 7-year tax retention needs Storage bucket + signed URLs.
- `phase-10-historical-doc-vocab-mismatch` — 600+ "logistics" refs in plan/spec docs describe "Phase 4 = the Logistics phase" while live role is "Operations". Glossary footnote could help onboarding.
- `phase-10-bundle-size-regression` — Web build jumped 1064 → 2620 KiB raw (266 → 781 gzipped) between 0121 and 0123. Investigate tree-shaking impact.
- `phase-10-issuance-groups-test-coverage` — `CreatePOModal.test.tsx` lacks end-to-end per-(sourceSo, sku, attrs) assertion. Add bundle-prefill test with `issuanceGroups.length === N`.
- `phase-10-shortage-by-so-test-coverage` — Phase 3 server endpoint has 1 bySo test. Add 3-SO disjoint-SKUs fan-out + stockpile vs bundle scope.
- `phase-10-multi-leg-pod-upload` — frontend Storage upload + bucket RLS for `delivery-orders/orders/<id>/legs/<n>/<ts>.<ext>` paths so partners can attach a POD photo per handoff. Each `delivery_stops` leg already carries `pod_url` / `pod_signed_by` / `status` cols (0156); needs RLS verification + UI wiring before frontend uploads via supabase-js. (From 2026-06-05 multi-leg ship — POD intentionally deferred to V2.)
- `phase-10-smart-partner-suggest` — multi-leg "+ Add leg" form + Inbox partner dropdown should auto-recommend a partner from the customer's delivery state (Klang→NETS, Johor→TEOW/TT, Singapore→EU/SSY). Operation currently picks manually.

**LOW**:
- `catalog-web-component-tests` — the new Product & Maintenance pages (`apps/web/src/pages/catalog/**`) have no web component/E2E tests yet (API side is covered in `catalog.test.ts`). Add a SkuMaster render + price-readback test, a Modular sizes-cascade test, and an E2E smoke (load page → filter Service → toggle a SKU off → persists after reload).
- `catalog-addon-reenable-by-key` — disabling an add-on removes it from the active-only GET bundle; restore is via re-adding the same key (the form PATCHes `active=true` on the duplicate-key 500). Fine for v1; a dedicated "show disabled add-ons" read would be cleaner if add-on churn grows.
- `phase-11-deploy-verify-branch-has-latest` — **LESSON (2026-06-14)**: deploying `phase/11.2-state-machine` straight to prod briefly reverted the 6/12 ops overhaul, because the branch had forked from main on 6/05 and never carried it. Fixed by merging main back in + reconciling the enum (PR #15). **Before deploying ANY branch to prod, confirm it contains main's latest *deployed* work** (`git log --oneline HEAD..origin/main` should be empty, or you're shipping a regression). Cheap pre-deploy check; would have caught this instantly.
- `phase-11-migration-0165-0166-dual-files` — 0165 + 0166 each have two distinct files (an `ops_*` migration + an 11.1 migration sharing the number). Cosmetic only — migrations apply manually via MCP (tracker keys on timestamp). Renumbering was deliberately NOT done: the tracker records the exact names `0165_add_proceed_date` / `0166_set_order_date_2arg_compat_shim`, so renaming the files would desync file↔tracker. Leave unless a fresh `supabase db push` pipeline is ever introduced.
- `phase-10-rename-script-blind-spot-doc` — 0121 + 0123 both missed alias patterns. Enumerate ALL alias patterns upfront next rename, OR use comprehensive regex `(?<![a-z_])<col>(?![a-z_])`. Worth a doc in `docs/superpowers/`.
- `phase-10-pg-regex-word-boundary` — PG ARE `\b` is backspace, NOT word boundary. Use `\y` (PG-specific) or lookbehind. Tripped 0126 first apply.
- `phase-10-historical-dl-literal-strings` — `audit_log` + `order_history` `'DL-'` / `Auto-promoted DL-%s` literals intentionally kept as historical record.
- `phase-10-frozen-migration-vocab-drift` — 700+ `dl` / `logistics` refs in frozen migrations 0001-0122 + historical docs. Onboarding glossary footnote.
- `phase-10-thread-reserved-at-null-but-stock-reserved` — thread #534e59eb of #1003 had `reserved_at IS NULL` while stock_balances showed `reserved=3`. Reservation via path that doesn't set `thread.reserved_at`. Cosmetic.
- `phase-10-operation-attach-do-defensive-fallback` — Could fall back to first thread's warehouse_id if `orders.warehouse_id IS NULL`. Currently relies on 0127 upstream fix.
- `phase-10-rollup-trigger-audit-after-partial-revert` — Defensive direct UPDATE in 0127 backfill may be unnecessary. Investigate trigger UPDATE behaviour.
- `phase-10-drop-other-pre-thread-legacy-functions` — Survey pg_proc for other `_v3`-superseded predecessors.
- `phase-10-purchase-orders-do-number-fallback` — `purchase_orders.do_number` not auto-updated by partial-pickup RPCs; legacy reads NULL. Most reads `?? null` already.
- `phase-10-stockpile-po-readiness` — Stockpile POs (no thread links) still use existing PO-level "Mark Ready". New thread checklist appropriately hides for stockpile.
- `phase-10-partner-side-reprint` — `PartnerFactoryPickupsPage` doesn't mount `PickupHistoryList`. Add `GET /api/partner/pos/:poId/pickup-events` for parity.
- `phase-10-e2e-fixtures-partial-pickup` — `seed-test-users.ts` needs `supplier-nicefuture@x.com` + `partner-nets@x.com`. `seed-e2e-fixtures.sql` needs `PO-FIX-NF-PARTIAL`. Then un-fixme `e2e/phase-10-partial-pickup-happy.spec.ts`.
- `phase-10-orders-status-rollup-from-threads` — DL-1006..1015 stayed at `proceed_order` after threads dispatched. 0106 trigger only fires on `orders.logistics_stage='delivered'`. Pickup ≠ customer-delivery. Reminder.
- `phase-10-operation-procurement-page-ready-pill` — Operation procurement page has `ready_confirm_sent` branch at `ProcurementTabContent.tsx:515`; verify `ready_for_pickup` equivalent exists.
- `phase-9-custom-domain` — Bind real domain to Pages once alpha stable. Q2 deferred Week 2+.
- `phase-9-secret-rotation-cadence` — Quarterly rotation policy for Workers secrets.
- `phase-10-orders-partner-filter-chip` — Orders kanban needs `[All] [NETS] [TEOW] …` filter chips so operation can see "all single-partner-X orders" the way the old spreadsheet had per-partner tabs. The 0156 GIN index on `delivery_stops` already supports the `@>` containment query.
- `phase-10-stock-indicator-on-order-card` — Order kanban cards should show a 🟢/🟡/🔴 stock indicator inline so operation needn't open every drawer to gauge availability.
- `phase-10-multi-leg-promotion-decision` (watch ~3 months from 2026-06-05) — γ jsonb design assumes <30% of orders are multi-leg. Track the ratio in production; if it crosses 30% OR per-partner reliability dashboards become a real ask, promote to first-class relational `order_delivery_legs` table (β). jsonb shape mirrors the relational shape so backfill = one `INSERT … SELECT`. (Currently 0/158 orders multi-leg.)

**Pre-Phase-10 still open (low, deferred)** — full list in git history:
- `phase-4.5-chunk-2-alerts-tab-routing` — StockAlertsTile useNavigate URL/tab desync **[CLOSED 2026-06-05** — PR #12: StockAlertsTile + OperationWarehouse now use the tab-state callback instead of a bare URL navigate.]
- `phase-4.5-chunk-2-stock-alerts-high-threshold-expose` — `logistics_stock_alerts()` returns `low_threshold` only
- `phase-4.5-chunk-1-lp-whitelist-tighten` — Trigger covers 20 of 29 PO columns; switch to allow-list
- `phase-4.5-cleanup-at-own-wh-waiting-rename` — Irreversible enum recreate to drop deprecated `at_own_wh_waiting`
- `phase-4.5-do-storage-retention-policy` — TTL or archive for delivery-orders bucket
- `phase-4.5-0036-rollup-amend-cleanup` — Consolidate 0036+0047 `orders_rollup_stage` into single source
- `phase-4.5-storage-signed-url-ttl-config` — Explicit TTL for signed-upload URLs
- Earlier pre-Chunk-1 CFs (pagination, type tightening, schema audits) preserved in git history

### 17.6 Known risks (signed-off by Loo)

- **principal@carres.com password='111'** — Phase 9 signoff 2026-05-09. Mitigation in `docs/runbook.md`. Rotate Week 2.
- **9 alpha test users at password='111'** — Phase 10 ad-hoc smoke seed 2026-05-15. Rotate before sharing portal externally.
- **Demo product catalog** (product_skus / product_models / sofa_fabrics / addons / floor_config) NOT wiped during Phase 9 cleanup — assumed Carres-branded real SKUs. If proven fictional, uncomment Layer 6 in `scripts/phase-9-cleanup.sql` and rerun.
- **CORS `origin: "*"`** in `apps/api/src/index.ts:48`. OK for V1 (auth = Bearer header, not cookies). Tighten before opening externally.

### 17.7 Pre-existing test failures (not from current sessions)

These pre-date Phase 10 cascade work and need separate cleanup. Documented so future sessions don't chase them as new regressions:

- **api**: `partner/pickups.test.ts > returns LP's POs` — mock chain stale post-0090
- **api**: `supplier/pos.test.ts > GET /api/supplier/pos/:poId/threads` (2 tests) — mocks `.from()` while route uses `.rpc("supplier_threads_for_po")` post-0111
- **web**: `OhanaSofaTab.test.tsx` (4 fails) — `dab4439` Direct-receive escape hatch regression (file was `HoOKkASofaTab.test.tsx` before the 0150 Ohana rename)
- **web**: `NiceFutureMattressTab.test.tsx` (1 fail) — supplier-name lookup assertion ("Nice Future Bedding" not rendered); pre-existing, verified via stash 2026-05-31, still failing 2026-06-08

### 17.8 Phase 9 alpha-readiness checklist (post-cleanup 2026-05-15)

- ✅ Master data + migrations 0001-0131 + Web + API all live
- ✅ `orders_dl_seq` reset to 1001 (first alpha order = DL-1001 / SO-1001)
- ✅ `audit_log` cleared
- ❓ 9 test users — keep `xxx@carres.com` + rotate passwords OR wipe + use PrincipalAccounts UI for real-email onboarding
- ☐ Secret rotation deferred per Phase 9 cutover decision
- ☐ Per-role manual smoke (only principal smoke-tested Day 1)
- ☐ 24h Cloudflare + Supabase log monitoring
- ☐ Old Carres-Portal repo + Workers + Pages retirement (Day 5+)
- ☐ `docs/phase-9-reflection.md` (post-stabilization)

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

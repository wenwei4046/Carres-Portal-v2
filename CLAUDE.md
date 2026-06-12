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

### 17.1 Current state (as of 2026-06-08)

| | |
|---|---|
| Active phase | **Phase 10** — post-launch fixes + Phase A (AutoCount import + per-unit stock) |
| Project started | 2026-05-02 |
| Web URL | https://carres-portal.pages.dev |
| API URL | https://carres-portal-v2-api.wwch.workers.dev |
| DB | staging Supabase = prod, project_id `kfprgpjpaffedghytstl` |
| Latest migration | **0158** `normalize_teow_name`. New since 0154: 0155 = +4 logistic partners (Teow/TT KL→JB, EU/SSY JB→SG) · 0156 = multi-leg delivery (`orders.delivery_stops` jsonb + GIN `jsonb_path_ops` index + `set_delivery_chain`/`patch_delivery_stop` RPCs) · 0157 = `NETS` rename · 0158 = `TEOW` all-caps rename. 0151-0154 = delivery e-sign / STANDARD auto-dispatch + LP-reject / per-unit `id-abc123456`. **TRACKER GAP**: `supabase_migrations.schema_migrations` (what `list_migrations` reads) stops at **0154** — 0155-0158 were applied out-of-band, so their 4 rows are missing even though the schema is fully live (verified 2026-06-08: 8 partners · `delivery_stops` jsonb · both RPCs). Backfill the 4 rows only if a clean `list_migrations` matters. |
| Catalog state | 11 suppliers · 170 product_models · 1013 product_skus (target 1091, 78 source dupes in carres-sku-master.xlsx — see CFs) |
| Orders state | **158 orders** (verified 2026-06-08): 153 AutoCount-imported (`source_system='autocount'`, all status `place`, SO-1001..1158, ~575 units feeding supplier forecast) + 5 native test orders (SO-1116..1120, cancelled/proceed_order). 0 have `delivery_stops` set — multi-leg chain never live-exercised (see §17.3 Pending). next `orders_so_seq` ≈ SO-1159. |
| Test count | api 708/711 (3 pre-existing fails) · web 473/478 (5 pre-existing fails) · shared 186/186 — measured 2026-06-08; all 8 fails pre-existing per §17.7, zero new regressions (+16 api delivery-chain, +9 web multi-leg/stock-alerts, all pass) |
| Web bundle | 2782.60 KiB raw / 819.82 KiB gzipped (bundle `index-DNYl_-jY.js`; built+deployed 2026-06-05, hash matches live; bundle-size regression CF still open, see §17.5) |
| API bundle | 1281.87 KiB raw / 241.86 KiB gzipped (dry-run measured 2026-06-08; live Worker version `1974bdea-bdbc-49d1-93d5-3cbef04ffb70` deployed 2026-06-05) |

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

### 17.3 Phase 10 work-log

Chronological — each entry = one logical session. Commit hashes preserved.

**2026-05-11 ~02:30 GMT+8 · Day 1 bug sweep · 13 commits · migrations 0083-0086** — End-to-end smoke immediately post-deploy surfaced UX gaps + cross-role sync bugs. Commits in order: `b3beb88` Login page rewritten 1:1 from `reference/Carres Portal · Login.html` (editorial split-screen + Mulish font) · `6c8f1a1` partner pickups SELECT add `status` col · `eb76eb9` → `8ef5f7e` migration 0083 user_nav_seen + mark_badge_seen RPC (true unread semantics) · `dab4439` Operation Procurement "Direct receive" escape hatch · `b3f15c9` Partner "Arrived at WH" full receive modal · `c7dd23b` CreatePOModal SKU cold-cache fix · `9801b3c` Upcoming column on partner kanban · `878a289` migration 0084 delivery-orders partner write + read column rename · `b9395cc` migration 0085 LP whitelist status + do_* · `481cf3b` migration 0086 logistics_assign_partner RPC recreate + #1004 backfill · `3d2d7f2` Deliveries 3-column kanban · `55ad1c1` Today's Active Pipeline gains Deliveries section.
- **Key insight**: customer-leg vs procurement-leg confusion is THE bug source. Procurement = `purchase_orders.procurement_partner_id`; customer = `order_supplier_threads.delivery_partner_id`. Future partner-debug heuristic: ASK WHICH LEG.

**2026-05-11 ~23:00 GMT+8 · Phase 6 supplier required DO photo · migration 0094** — Closes `phase-6-storage-do-upload`. `supplier_mark_delivered` widened to require `p_do_file_path`. Storage `delivery-orders` bucket RLS extended with supplier branch (`po.supplier_id = app_supplier_id()`). UI: `DOFileUploadField` mounts after DO# ≥ 3 chars; `canSubmit` adds `!!doFilePath`. Migration count: 94 (intermediate 0087-0093 from sessions not §17-logged).

**2026-05-15 ~01:00 GMT+8 · Dealer/sales/showroom Delivered-tab bug · migration 0106** — Status axis vs logistics_stage axis mismatch. Dealer "Delivered" tab always empty because `orders.status` never auto-flipped to 'delivered' after `logistics_stage='delivered'`. Migration 0106 = BEFORE UPDATE trigger mirroring 0098 pattern + backfill. Verified DL-1003 + DL-1004. All three roles (dealer/salesperson/showroom) share `<DealerApp />` so schema-level fix covers all. Bonus: `apps/web/src/pages/Me.tsx` Back-to-dashboard button. Commits `829ab93` + `bfe124d`. Migration count: 106 (intermediate 0095-0105 from sessions not §17-logged).

**2026-05-15 supplier per-thread + multi-DO partial pickup · migrations 0107 + 0108** — Largest feature ship since Phase 9. Autonomous overnight, 15-task plan (`docs/superpowers/plans/2026-05-15-supplier-thread-pickup-plan.md`).
- **0107**: `po_pickup_events` table + 3 cols on threads + `partially_shipped` sup_status enum + 5 SECURITY DEFINER RPCs (supplier_mark_thread_ready / supplier_unmark_thread_ready / partner_pickup_threads / logistics_receive_threads / pickup_event_render_payload).
- **0108**: SOP-aware `thread.logistics_stage` (factory→WH→customer STANDARD → `ready_to_dispatch`; SOFA_SPECIAL → `dispatched`) + terminal sup_status convergence on `delivered`.
- API: 6 new endpoints, enrichment on supplier+partner PO lists (`urgency / customer_eta_min / behind_schedule / sku_summary`).
- UI: SupplierPOs urgency badge + 4-option sort · PODrawerThreadList + PickupHistoryList · PartnerFactoryPickupsPage multi-select + PickupBatchDialog · ReceivePOModal per-thread section · new `/print/pickup-event/:id` browser PDF (mirrors `do-template.tsx`).
- `partially_shipped` added to 7 OPEN_SUP_STATUSES filter sites.
- Commits `8520528` (0107) → `9ef9a7f` (E2E spec). Migration count: 108.

**2026-05-15 ~04:00 GMT+8 · Playwright MCP smoke verification · migrations 0109 + 0111** — E2E smoke against prod for partial-pickup feature. Seeded DL-1006..1015 + PO-3001 (Nice Future 7 threads) + PO-3002 (HoOKkA 6 threads). Executed 4-DO partial pickup chain (DO-HK-A 3 sofa · DO-NF-A 4 mat · DO-NF-B 3 mat-from-combo · DO-HK-B 3 bedframe). Bugs caught + fixed mid-smoke:
- **0109** `supplier_read_own_threads` — 0033 RLS had no supplier policy on `order_supplier_threads`. New endpoint returned [] under supplier JWT. Added `ost_supplier_read` scoped to `po.supplier_id = app_supplier_id()`.
- **0110** SUPERSEDED — tried to add orders/order_lines read policies scoped via threads → infinite recursion 42P17. Policies dropped.
- **0111** `supplier_threads_rpc_no_orders_rls` — replaced 0110 with SECURITY DEFINER RPC `supplier_threads_for_po(p_po_id text)` that bypasses orders RLS but enforces `po.supplier_id = app_supplier_id()` inside body. Endpoint switched from PostgREST select to RPC.
- UI verification all green: PODrawer thread list + Pickup History + Reprint DO blob URL.

**2026-05-15 ~17:00 GMT+8 · Pre-alpha DB cleanup (manual by Loo)** — All transactional data wiped via direct SQL DELETE (NOT `scripts/phase-9-cleanup.sql`). audit_log + history + payments + invoices + refunds + approvals + bank_statements + orders + POs + threads + pickup_events all → 0. Master data + auth + product catalog UNTOUCHED. Subsequently: `orders_dl_seq` reset to 1001 + `audit_log` cleared per §14 #1 single-instance approval. Alpha first order will be DL-1001. 9 alpha test users (`xxx@carres.com`) retained at password='111' — see §17.6 known-risks.

**2026-05-17 ~21:00 GMT+8 · Role rename "logistics" → "operation" · migration 0121** — Cross-cutting rename autonomous. Authorised per §8 #4 (RLS) + §7 (schema) + §14 #2 (single-instance).
- enum: `app_role` value `'logistics' → 'operation'` (1 app_user + 14 audit_log rows auto-migrated by enum oid) · `warehouse_kind` value · `logistics_stage` value `'awaiting_logistics_action' → 'awaiting_operation_action'` · type renamed `logistics_stage → operation_stage` (auto-cascades to columns via oid)
- columns: `orders.logistics_stage` + `order_supplier_threads.logistics_stage` → `operation_stage`
- 33 functions renamed `logistics_* → operation_*` · 26 functions body-updated · 15 RLS policies dropped+recreated
- Code sweep ~250 files via 3-pass PowerShell scripts + `scripts/rename-logistics-to-operation.ps1` + `scripts/rename-logistics-pass2.ps1` + `scripts/rename-logistics-pass3.ps1` + `scripts/fix-type-name-case.ps1`
- Directory renames: `apps/web/src/pages/logistics/` → `operation/` · `apps/api/src/routes/logistics/` → `operation/` · 12 `Logistics*.tsx` → `Operation*.tsx`
- URL paths: `/logistics/*` → `/operation/*` (web + API)
- **KEPT** (noun usage, not the role): `supplier_kind.own_logistics`; historical migration filenames (e.g., `0019_logistics_rpcs.sql`); historical §17 entries above this point; CARRES_PORTAL_V2_PLAN.md + `docs/superpowers/{specs,plans}/*`
- App user `logistics@carres.com` → `operation@carres.com` (password unchanged at '111')
- Tests post-rename: 1052 unit tests, 1043 pass, 7 pre-existing fails (all documented). Zero new fails. Typecheck clean.

**2026-05-18 ~00:30 GMT+8 · partner_pickup_threads SOP-aware fix restored · migration 0122** — Loo screenshot: DL-1001..1004 (Carres KL Showroom, STANDARD mattress) auto-flipped to DISPATCHED on operation kanban without operator pressing "Assign delivery". Root cause: live `partner_pickup_threads` body had **no** SOP CASE — 0108's fix silently clobbered by 0117 (auto-DO#) and 0118 (FOR UPDATE lock fix), each `CREATE OR REPLACE FUNCTION` rewrote body from pre-0108 form. Sister RPC `operation_receive_threads` retains 0108 F1 fix intact. 0122 re-applies SOP CASE alongside existing 0117 auto-DO# + 0118 CTE lock. Migration block comment calls out regression history. One-shot backfill: 4 STANDARD threads matching signature reverted to `ready_to_dispatch`.

**2026-05-18 ~02:30 GMT+8 · dl → so rename · migration 0123** — Phase 1 of 3-phase refactor. Mirrors 0121 pattern. Authorised per §7 + §14 #2. Three-pass:
1. Snapshot 22 function definitions touching dl-ish tokens into TEMP table
2. DROP functions · `ALTER TABLE orders RENAME COLUMN dl TO so` · `ALTER TABLE purchase_orders RENAME COLUMN dl TO so`, `RENAME COLUMN dl_refs TO so_refs` · `ALTER SEQUENCE orders_dl_seq RENAME TO orders_so_seq` · rename indexes
3. Recreate each function from snapshot with longest-first text replacements
- Cosmetic backfill: `audit_log` + `order_history.text` + `po_history.text` "DL-1003" → "SO-1003"
- Code sweep `scripts/rename-dl-to-so.ps1` (committed): 4 case-sensitive PowerShell `-creplace` passes longest-first, 88 source files. Skipped frozen migrations + `reference/` + historical docs per 0121 precedent
- Caught: `\bdl\b` matched HTML `<dl>` tag in `Me.tsx` + `DealerSettings.tsx` (6 instances reverted)

**2026-05-18 · Per-line thread granularity · migration 0124** — Phase 2. Swapped `order_supplier_threads` unique key from `(order_id, supplier_id, category)` → `(order_line_id)`. New FK `order_line_id REFERENCES order_lines(id) ON DELETE CASCADE`. Pre-flight: every existing thread maps 1:1 to an order_line (9 prod threads = 9 lines), clean backfill. Two function bodies rewritten same migration:
- `operation_confirm_proceed_request_v3` — iterates per order_line; SO with 2 sofa lines of different fabrics now produces 2 threads
- `_v3_claim_threads_for_po` — claims only threads whose underlying order_line matches a `(sku, attrs)` tuple on the PO. This is the actual fix for the per-variant batch `concurrent_claim` bug Loo hit earlier same day
- Read-side untouched: rollup trigger aggregates per `order_id`; `partner_pickup_threads` + `operation_receive_threads` operate by `thread.id`. No FE/API code change needed.

**2026-05-18 · Auto-split per-(SO,sku,attrs) · no migration** — Phase 3. Drops the Split-per-variant toggle, defaults to auto-split.
- **Server** (`apps/api/src/routes/operation/pos.ts` + `packages/shared/src/schemas/operation.ts`): `awaiting-stock-shortage` returns `bySo: [{ so, need, available, shortage }]` per shortage row when `?dls=...` passed. Stock distribution walks per-(so, sku, attrs) deterministic order. Invariant: sum-across-bySo === row-level totals. Stripped one stray `\x01` SOH byte from `pos.ts` (hidden since some earlier rename pass).
- **Shared**: zod schema extended with `bySo` default `[]` so pre-Phase-3 mocks parse cleanly.
- **Client** (`CreatePOModal.tsx`): `DraftLine.sourceSo: number | null` · `autoFillFromShortage` fans out per `(so, sku, attrs)` · `issuanceGroups` always partitions by `(supplier.id, line.sourceSo, sku, canonAttrs(attrs))` (legacy `splitPerVariant` early-return + toggle UI removed) · `submit()` per-PO payload sends `so: lineSo` (single) or `soRefs: [lineSo]` (batch). The per-variant batch `concurrent_claim` bug is now structurally impossible.

**2026-05-18 · Dashboard 500 fix · migration 0125** — Loo screenshot: operation dashboard 500'd with `column p.dl does not exist`. 0123's snapshot+text-replace covered `o.dl`, `ord.dl`, `orders.dl`, `v_order.dl` but NOT bare `<other-alias>.dl`. 3 functions broken:
- `operation_dashboard_summary` — `p.dl` ×1 (the user-facing 500)
- `finance_ar_aging` — `ot.dl` ×2 (would 500 on AR aging page)
- `operation_receive_po_line` — `v_target_order.dl` ×3 (would 500 on receive-PO auto-promote)
- 0125 CREATE OR REPLACE each. Output JSON contracts preserved exactly. Embedded `DO $sanity$` RAISE EXCEPTION if any function still references `<alias>.dl`.

**2026-05-18 · Close all residual 0123 gaps · migration 0126** — Cross-check sweep after 0125 uncovered 17 MORE functions still referencing `dl` token. 5 blind spots in 0123: `<other-alias>.dl`, `'dl'` JSON keys, `NEW.dl`/`OLD.dl` in triggers, bare `dl` in WHERE/SELECT/RETURNS TABLE, signature column names. Categorised:
- **Cat A — runtime 500 once invoked (11)**: `orders_auto_issue_on_dispatched` trigger (NEW.dl×3, catastrophic on every dispatch) · `enforce_partner_po_column_whitelist` trigger (NEW.dl IS DISTINCT FROM OLD.dl) · `approval_decide` · `invoice_issue` · `finance_record_receipt` · `finance_apply_credit_note` · `operation_create_po` · `operation_cancel_po` · `operation_issue_pos_for_order` · `operation_warehouse_pick` · `operation_revert_order_dispatched_to_ready`
- **Cat B — silent JSON contract mismatch (6)**: `create_order`, `proceed_order`, `operation_abandon_order`, `operation_assign_partner`, `operation_attach_do_and_deliver`, `operation_revert_order_proceed_to_placed`
- **Cat C — RETURNS TABLE signature rename (2, DROP+CREATE)**: `partner_orders_for_threads` + `supplier_orders_for_threads`
- Snapshot+regex mirrors 0123 PASS A/B/C shape but with comprehensive `(?<![a-z_])dl(?![a-z_]) → so` catching all 5 blind spots single pass. **First apply failed** using `\b` (PG ARE = backspace, not word boundary). Fixed via lookbehind `(?<![a-z_])`.

**2026-05-18 · Propagate warehouse_id thread→order chain · migration 0127** — Loo screenshot: "ATTACH DO & MARK DELIVERED" crash on #1003 with `null value in column "warehouse_id" of relation "stock_movements"`. Chain bug:
1. `_v3_claim_threads_for_po` claims threads (sets `po_id`) but **never** set `warehouse_id` from PO
2. `operation_assign_partner` reads first ready_to_dispatch thread with `warehouse_id IS NOT NULL` to derive `orders.warehouse_id`. None had it → orders stays null.
3. `operation_attach_do_and_deliver` reads `orders.warehouse_id` → null → stock_movements INSERT crashes.
- PART A backfill threads from PO · PART B backfill orders from threads · PART C patch `_v3_claim_threads_for_po` to propagate atomically · PART D sanity check.

**2026-05-18 · Cascade Operation→thread mark-delivered · migration 0128** — Loo screenshot: partner kanban still showed #1003 in SCHEDULED after Operation marked it delivered. Asymmetric-write bug. `operation_attach_do_and_deliver` updated orders but never propagated DOWN to threads. PART A backfill any thread `<> 'delivered'` for orders already delivered · PART B CREATE OR REPLACE with UPDATE-threads block + audit suffix · PART C sanity check.

**2026-05-18 · Deep cascade audit + 3 fixes + 1 DROP · migration 0129** — Followed 0128's pattern audit to full scope. 6-dimension DB-state audit: ZERO inconsistencies post-0127+0128 backfills. Function-body audit on 23 RPCs found 3 cascade gaps + 1 dead function:
- **Fix 1** (HIGH) `partner_threads_to_deliver` filters cancelled orders — `operation_abandon_order` sets `orders.status='cancelled'` but threads stay at existing stage; partner kanban shows ghosts. Cleanest fix at READ layer: `AND o.status <> 'cancelled'`.
- **Fix 2** (MEDIUM) `operation_warehouse_pick` cascades warehouse_id to threads
- **Fix 3** (LOW) `operation_cancel_po` also nullifies `thread.warehouse_id`
- **DROP** legacy `operation_confirm_proceed_request(uuid, uuid)` (v1, pre-thread era, dead code per pg_proc + apps/{web,api} grep)
- **Verified safe (NOT bugs)**: `operation_revert_order_proceed_to_placed` (revert runs BEFORE v3 creates threads) · `operation_revert_order_dispatched_to_ready` (rollup trigger handles cascade)

**2026-05-18 · Cancelled-order filter audit + fixes · migration 0130** — Closes `phase-10-cancelled-order-filter-audit` CF from 0129. 7 candidates reviewed: 5 fixed (`dealer_with_stats`, `dealers_with_stats_list`, `partner_orders_for_threads`, `supplier_orders_for_threads`, `supplier_threads_for_po`) + 2 skipped (`supplier_pending_demand` already filters, `partner_confirm_receive` is write-action). Pre-fix: dealer with 10 orders (2 cancelled) showed inflated `order_count=10` + full GMV + full outstanding. Post-fix: `order_count=8` with active-only stats.

**2026-05-18 · Supplier mark-ready PO rollup · migration 0131** — Loo's 5 HoOKkA POs (PO-2033/34/35/36 all Carres Klang) stuck at `in_production` even though every thread had `supplier_ready_at` set. Asymmetric-write on procurement leg — mirror of 0128/0129 in reverse direction. `supplier_mark_thread_ready` only touched `thread.supplier_ready_at`, never PO sup_status. Target state depends on warehouse ownership:
- `warehouses.owning_partner_id IS NOT NULL` (LP-owned WH) → `ready_confirm_sent` (LP sees "Awaiting Accept")
- `warehouses.owning_partner_id IS NULL` (Carres own WH) → `ready_for_pickup` (Operation sees signal)
- PART A `supplier_mark_thread_ready` rewritten with post-mark rollup + po_history audit + returns `po_advanced` · PART B `supplier_unmark_thread_ready` symmetric reverse · PART C backfill stuck POs · PART D sanity check
- Post-apply: PO-2033/34/35/36 → `ready_for_pickup` ✓; PO-2037 stayed `in_production` ✓ (1 thread not ready)
- **Loo's prior misunderstanding clarified**: Nets does NOT see HoOKkA POs going to Carres Klang (own WH). Nets only sees LP-owned WH POs.

**2026-05-18 · Procurement Orders column + prominent ETAs · commit `41cc96f`** — Loo's C+D ask from Procurement-tab UX discussion. PO list rows were missing who-customer + when-needed, and dates that were shown were muted to invisibility.
- **Row layout** 7-col → 5-col: dropped Supplier (redundant within supplier-specific tab), dropped Warehouse (only 1 WH currently), dropped standalone PO ETA col (folded into Items).
- **New Orders col**: one row per source SO showing `#SO · customer · DUE · MM-DD · 🔴/🟡/🟢`. Aggregate footer `Σ N orders` for bundles; italic stockpile note when `po.so` + `po.so_refs[]` both null.
- **Server** (`apps/api/src/routes/operation/procurement-tabs.ts`): new Pass C `enrichPosWithOrders()` — batched SELECT against `orders` for every distinct source SO across fetched POs (union of `so` + `so_refs[]`). Returns per-PO `orders: [{ so, customer_name, delivery_date }]` + worst-case PO-level `urgency: 'critical' | 'urgent' | 'normal' | null`. Mirrors supplier-side enrichment from earlier Phase 10 work.
- **Urgency tiers** (smallest delivery_date diff from today): <7d → critical 🔴, 7-14d → urgent 🟡, ≥14d → normal 🟢
- **Date visibility** (Loo follow-up): per-SO Customer ETA 11px muted → 12px font-semibold base-900 with uppercase "DUE" micro-label; PO ETA 10px muted footer → 12px font-semibold base-900 with "PO ETA" label.
- Tests: api +2 (procurement-tabs Pass C + stockpile short-circuit, `vi.useFakeTimers` locks today).

**2026-05-18 · Seed SQL rename sweep · commit `947ec01`** — Closes long-standing `phase-4.5-chunk-2-seed-sql-stale` CF. `rename-dl-to-so.ps1` + earlier logistics→operation sweep both omitted `*.sql` from `includeExts`, so seed files survived with stale schema + rename artifacts.
- `scripts/seed-e2e-fixtures.sql`: `dl` column refs, `orders_dl_seq → orders_so_seq`, DL- comments + fixture refs
- `supabase/seed.sql`: `dl → so` column refs · PO INSERT rewritten for per-line schema (sku/qty split to `purchase_order_lines` via WHERE-NOT-EXISTS idempotency) · `delivery_partner_id → procurement_partner_id` · DL-#### string literals in approvals.refers_to + audit_log + stock_movements.ref · rename artifacts (`JT Express operation → JT Express`, `Daniel · operation → Daniel · Operations`, `Issued by operation → Issued by Operations`)
- Validated via BEGIN…ROLLBACK dry-run on live DB.

**2026-05-18 · Principal sidebar wake — 5 missing pages built** — Loo's screenshot showed 5 sidebar tabs unclickable (Suppliers / All orders / Stock / Audit log / Accounts). They'd been stubbed at `enabled:false` since their Phase 4/5/6/8 ships and never woken up — typical dormant-ship pattern. Built all 5 to proto fidelity:
- **PrincipalAccounts** (`941c665`) — closes `phase-10-rotate-alpha-test-passwords` HIGH CF. GET list + POST create (service_role admin API + conditional dealer/supplier/partner org row + JWT `app_metadata` seed) + POST :id/status (disable signs out via auth.admin.signOut, principal cannot be disabled) + POST :id/reset-password. Per-role colored avatars + chips; CreateAccountModal with role picker grid; ResetPasswordModal with regenerate-able temp password. Schema already had `title / status / last_seen_at / created_by` — no migration needed.
- **PrincipalAudit** (`926ad43`) — GET endpoint with `?role=&limit=` filter (max 500). 7 role chips at top; proto's `logistics` → `operation`, `system` dropped.
- **PrincipalSuppliers** (`63b41e2`) — GET list + GET :id/pos drawer. 2-col card grid + Own Logistics / Factory Pickup kind chips + 3-stat row + cat_covered list.
- **PrincipalOrders** (`160210d`) — GET cross-dealer feed with `?dealer=&status=&q=` filters. Paid cell green when ≥ total, terracotta otherwise.
- **PrincipalStock** (`2a1959f`) — GET single endpoint joining stock_balances + product_skus + open POs. 2-tab view (Low / All) + per-warehouse columns + low-stock terracotta highlight.

All 5 routes use principal-only inline guard before any service_role call (CLAUDE.md §4.4 RED LINE upheld). Tailwind tokens (`bg-base-*` / `text-base-*` / `text-primary` / `text-success`) match proto's CSS var palette. Layout strictly matches proto `32px 36px 56px` padding + kicker + 30px h1. Typecheck clean across shared / api / web after each commit.

Sidebar comment updated; `PrincipalSidebar` no longer has any `enabled:false` entries.

5 NEW carry-forwards (all low):
- `phase-10-principal-pages-tests` — wrote 0 tests for the 5 new pages; next session add unit + msw coverage
- `phase-10-principal-stock-no-mutation` — Stock is observation-only; Loo switches to operation role for adjust + thresholds
- `phase-10-principal-orders-detail-drawer` — proto + v2 row is non-clickable; add OrderDetailDrawer if drilldown wanted
- `phase-10-audit-cursor-pagination` — `audit_log` capped at 500 rows; cursor paginate once table grows past ~10k
- `phase-10-resend-invite-email-template` — Accounts only does temp-password mode (no email invite — needs Supabase email-template config)

**2026-05-20 ~16:00..18:00 GMT+8 · Phase A migrations 0132-0137 caught up on remote · MCP-driven** — Session opened with Loo asking "supabase linked?". Discovered CLAUDE.md §17.1 was stale (latest=0131) and local was at 0137; remote DB only had 0131 + `order_addons_attrs` (= local 0133). Migrations 0132 (autocount_import), 0134 (seed_sku_master), 0135 (orders_items_edited), 0136 (ops_assigned_logistic), 0137 (ops_stock_items) all needed apply.
- Re-OAuth'd the project-specific Supabase MCP at `mcp.supabase.com/mcp?project_ref=kfprgpjpaffedghytstl` via `mcp__supabase__authenticate` (different org from the generic Supabase MCP visible at session start).
- 0134's catalog wipe safety guard tripped on 4 alpha test orders (SO-1001 "tam anw weing" / SO-1002 "fewfwe" / SO-1003 "dsadsad" / SO-1004 "123123") created 2026-05-19 — 21 history rows, 12 audit_log rows, 3 threads, 2 POs, 2 invoices. Loo authorised wipe per §14 #1; SQL deleted cascades + `setval('orders_so_seq', 1000, true)` so next alpha order = SO-1001.
- 0134 is 1351 lines / 382KB — exceeds Read tool's 25K-token cap (~170 dense SKU lines). Split via PowerShell into 5 chunks then 12 sub-thirds; applied each as own migration with `ON CONFLICT DO NOTHING` for idempotency. Sanity-check inside 5t3 tripped (1013 ≠ 1091) — re-applied 5t3 without sanity.
- 78-SKU shortfall traced to **source xlsx dupes**: same SKU code maps to different variant names in `scripts/ops-seed/carres-sku-master.xlsx` (e.g. `SF03-HK5535/24"(2 Seater)` mapping to variant `'SF03-HK5535/24"(3 Seater)'`). ON CONFLICT DO NOTHING drops the second one. Non-blocking — 67-unit ops_stock seed found all required SKUs (mattress + bedframe non-Discovery-833 SKUs were 100% seeded).
- Final state per `mcp__supabase__execute_sql`: suppliers=11, models=170, skus=1013, klang_units=67, ops_rpcs=6, new_order_cols=4 (source_system + source_ref + items_edited + ops_assigned_logistic).
- 5 memories saved to `~/.claude/projects/.../memory/` documenting: MCP linkage, chunk-size limits, "grinder over CLI" feedback, Phase A applied state, local env not configured.

3 NEW carry-forwards (all low):
- `phase-A-sku-seed-78-missing` — 78 SKUs in 0134 source are dupes; ON CONFLICT DO NOTHING dropped them. If AutoCount import sees unresolved SKU codes, fix the xlsx and re-insert.
- `phase-A-stale-test-bundle-metrics` — §17.1 test count / bundle size were last measured at 0123/0130; not re-run for 0132-0137. Likely safe (most changes are additive) but flag if anything breaks.
- `phase-A-local-dev-env-not-configured` — `apps/api/.dev.vars` + `apps/web/.env.local` still don't exist (only `.example` templates). `pnpm dev` blocked until populated from Supabase Dashboard → Settings → API.

**2026-05-24 · Supplier Incoming forecast category fix + HoOKkA→Ohana rename · migrations 0148-0150** — Supplier forecast was empty: `supplier_pending_demand` derived category via `split_part(sku,':')`, which fails on BOTH AutoCount free-text SKUs and native canonical Item Codes (neither carries a `cat:` prefix) → matched no `cat_covered`. Fix = `resolve_demand_category(sku)` (0148): exact catalog join (`product_skus→product_models.category`) for native orders + model-keyword regex for legacy AutoCount; used by rewritten `supplier_pending_demand` (Forecast: active line, `po_id IS NULL`, leverages 0124 per-line `order_line_id`) + new `supplier_committed_demand` (Commit: open-status PO lines). `/api/supplier/products/demand` merges both RPCs; `SupplierIncoming` groups by returned `category` (dropped `sku.split(':')`). Live verify: Nice Future mattress 96u; Ohana bedframe 36u + sofa 64u. Lifecycle (Forecast→Commit→0) was already correct — only category was broken; confirmed per-line (a POed line sits in Commit while a sibling un-POed line of the same SKU stays in Forecast). Spec/plan: `docs/superpowers/{specs,plans}/2026-05-24-supplier-place-forecast*`.
- **Rename HoOKkA→Ohana** (Ohana = canonical, [[project_ohana_is_canonical]]). 0149 first renamed the WRONG direction (Ohana→HoOKkA); **0150 corrected** it (suppliers.name + app_users 'HoOKkA · Sales'→'Ohana · Sales' + ops_stock_items.supplier → Ohana). Code sweep `HoOKkA/HOOKKA/Hookka → Ohana/OHANA` across apps/packages/e2e (26 files) + `git mv HoOKkA{Sofa,BedFrame}Tab.tsx → Ohana*`. **KEPT** the lowercase routing slug `hookka` (opaque key wired into DB `_v3_resolve_sop_name` + `sops.ts` `SUPPLIER_SOP`/`deriveProcurementSlug`/`PROCUREMENT_TAB_SLUGS` + tab URLs — renaming it risks SOP-routing breakage for zero user-visible benefit) and login email `hookka@gmail.com`. Typecheck clean; zero new test failures (stash-verified the base has the identical pre-existing fails).
- 3 NEW carry-forwards (LOW): `phase-10-forecast-keyword-coverage` — legacy keyword classifier may miss novel AutoCount model names (native orders unaffected; AutoCount is a one-time backfill). `phase-10-ohana-slug-name-drift` — slug `hookka` ≠ name `Ohana` (intentional; onboarding footnote). `phase-10-badges-test-stale` — `apps/api/src/routes/operation/badges.test.ts` has 3 pre-existing fails from Phase A (undocumented in §17.7; mocks stale, not from this work). **[CLOSED 2026-05-31** — the 3 badges fails were fixed when `operation:lp_rejected` was added; mock now handles service_notes + lp_rejected.]

**2026-05-31 · 5-item Phase 10 ship (F+E+B+C+D) · migrations 0151-0154 · DEPLOYED to prod** — Loo "do all, base on your reference do 1 by 1". One 4-track read-only investigation workflow scoped it; built/committed/deployed in one pass. Branch `phase/10-per-unit-id-esign-lp-rules` ff-merged to main + pushed (`52f7b9a..97456ab`); CF deployed — **api** Workers `carres-portal-v2-api.wwch.workers.dev` (1272.70 KiB raw / 239.92 KiB gz, version `89b2cdbd`, 401 health OK), **web** Pages `carres-portal.pages.dev` (bundle `index-Bfd550P1.js`, confirmed live serving + contains "Unit ID" + e-sign caption markers).
- **F** (`93106ad`) — `CreatePOModal.issuanceGroups` split is now per-LINE sofa category (was per-supplier `cat_covered.includes('sofa')`). Ohana (bedframe+sofa) bedframe lines consolidate; only sofa lines split per (SO,sku,attrs). Also makes the **Nice Future PO-split fix go live** — that bug was already fixed in code 2026-05-22 (`2514362`) but the deployed bundle was stale until THIS deploy.
- **E** (`4d968a8`, migration **0151**) — REQUIRED customer e-signature on mark-delivered, both legs (partner `PODUploadDialog`→`partner_attach_pod`; HQ `DOAttachModal`→`operation_attach_do_and_deliver`). New cols `pod_signature_url`/`pod_signed_by`/`pod_signed_at` on threads+orders (distinct from `orders.signature_url` = sales-order sig). Both RPCs gained `p_signature_url`+`p_signed_by` DEFAULT NULL (zero-downtime). Reuses dealer `SignaturePad` (+ optional `caption` prop); PNG → existing buckets via new `kind:'signature'`.
- **B** (`dd4432f`, migration **0152**) — STANDARD goods auto-dispatch on WH arrival; Loo decided NO LP "accept" needed (only a non-rejected pre-chosen LP). Helper `_operation_auto_dispatch_if_ready` PERFORMed from `operation_receive_threads`+`partner_pickup_threads`+`operation_reselect_partner`. Supersedes 0122's manual gate (safe now 0147 forces LP at Accept). Regression guard asserts SOFA_SPECIAL CASE survives — closes `phase-10-partner-pickup-rpc-regression-guard`.
- **C** (`dd4432f`, migration **0152**) — LP-reject branches on WH state: A.3 (at WH → was auto-dispatched) reverts order+threads to `ready_to_dispatch`; A.4 (not yet at WH) stage unchanged; `operation_reselect_partner` re-auto-dispatches new LP. Active notification = new `operation:lp_rejected` badge in `badges.ts` (badge feed is direct count queries, NOT an RPC) folded into Orders sidebar tab + `OperationBadgesResponse.lpRejected`.
- **D** (`1087f08`, migrations **0153**+**0154**) — per-unit `id-abc123456` minted at PO-open. Overlay on `ops_stock_items` (Klang only): `unit_code` UNIQUE + `sold_at`+`sold_order_id` + statuses `incoming`/`voided`; `gen_unit_code()` retry-on-unique; 67 seed units backfilled. Lifecycle: PO-open mints `incoming` → receive flips SAME rows `incoming→free` (no double-count; rollup counts only free+reserved) → cancel voids → delivery → `sold`+order ref (FIFO, prefers this order's PO). UI: 4 OperationOps* pages show "Unit ID". **0154 corrected 0153** which was written against WRONG signatures (`_operation_create_po_inner` is 7-arg w/ `p_eta_date`; `operation_cancel_po` is `(text,text)`) → mint/void landed on ghost overloads + it overwrote real `operation_receive_po_with_do`. 0154 dropped ghosts, re-added on real sigs, restored receive body verbatim. Live zero-residue smoke confirmed lifecycle + rollup. Memory: [[project_per_unit_id_tracking]], [[feedback_verify_pg_signature_before_create_or_replace]].
- Tests at ship: shared 186/186, api 687/690, web 464/469 — all 8 fails PRE-EXISTING per §17.7 (OhanaSofaTab kanban ×5 incl. NiceFutureMattressTab; supplier/pos ×2; pickups ×1). NiceFutureMattressTab proven pre-existing by restoring base CreatePOModal → still fails. typechecks shared+api+web clean.
- Cleanup `e269fa5`: chaotic mid-session tooling swept ~40 editor `.bak` files into commits via `git add -A`; untracked+deleted all + `*.bak` → `.gitignore` (none existed in base 52f7b9a).

**2026-06-04 · e–i checklist verify + Incoming header fix + DEPLOY · commits `fa6c511` + `fe04b1c`** — Loo asked "did e/f/g/h/i get done?". All 5 verified done (f/g/h/i = 5/31 ship items D/F/B+C/E; e = supplier forecast at `place` status, confirmed against live DB: `supplier_pending_demand` includes any status not in delivered/cancelled — 153 place orders / 575 units feeding forecast at check time). One gap found + fixed (`fe04b1c`): `SupplierIncoming.tsx` category header summed committed-only, showing "0 units" for categories whose demand is mostly un-POed — now committed+pending, matching hero Total KPI. Also: `fa6c511` CLAUDE.md §2 plugin/skill discipline rule (no auto-invoking superpowers etc.); pulled PR #2-5 (AutoCount import SKU-resolver fixes: `.in()` double-quote escape, colorway-suffix strip, model-family + model-token fallbacks, empty-row skip + zod path on 400). **Deployed both** — api `61240565` (first deploy carrying PR #2-5) + web `index-CKm_OUPF.js` (first deploy carrying import fixes + header fix); 401-health + live-bundle markers verified; `SERVICE_ROLE` grep on dist clean. Wrangler OAuth had been overwritten by another account's login — Loo re-ran `wrangler login` to the `wwch` account mid-deploy. NOT merged (intentionally): `jess/ops-shell-and-stock` — Jess's 5/19 branch is the original Phase A dev (its migrations 0107-0110 collide with main's; content superseded by 0132-0137). Archive or delete after Jess confirms; do not merge.

**2026-06-05 · Multi-leg delivery chain + 4 new logistic partners + AutoCount resolver hardening · migrations 0155-0158 · DEPLOYED · PRs #9-12 (parallel dev wenwei4046)** — Five ships in one session, all merged to main + deployed. Live: web `index-DNYl_-jY.js` (Pages) · api version `1974bdea-bdbc-49d1-93d5-3cbef04ffb70` (Workers). Schema verified still live 2026-06-08.
- **AutoCount import 4-layer SKU resolver** — Loo's 192-row `listing 4 jun 26.csv` was killed by (a) a discount row with blank `Item Group` + (b) a supabase-js bug silently dropping catalog matches when descriptions contain `"`. New resolver: L1 exact · L2 color-strip (drops `/Col:NINJA-02`, `/M2402-4 Sand`) · L3 model-family (same model id, best-seater fit) · L4 model-token (drops width too — catches `SF03-HK5535/32"` against a `/24"`+`/30"`-only catalog). Real-world recovery on Loo's listing: **24/109 → 106/109**.
- **4 new logistic partners** (migration **0155**) — Teow, TT (KL→JB), EU, SSY (JB→SG) for cross-state / cross-border chains. Roster now **8, all ALL-CAPS short codes**: `AL · EU · HOUZS · NETS · SSY · TEOW · TSDD · TT`.
- **NETS rename** (**0157**) `Nets Sdn Bhd → NETS` + **TEOW rename** (**0158**) `Teow → TEOW` — short-form / all-caps consistency; 4 code/test/seed refs updated each.
- **Multi-leg delivery chain (γ architecture)** — THE big one. Schema (**0156**): `orders.delivery_stops jsonb` (null/empty = single-leg, byte-identical to current flow; 1+ legs = chain) + GIN `jsonb_path_ops` index (powers "any leg has partner X" filter) + 2 SECURITY DEFINER RPCs — `set_delivery_chain` (validates contiguous 1..N legs + known partner_ids; operation/principal only) and `patch_delivery_stop` (merges sparse per-leg patch, auto-stamps milestone timestamps on status=picked_up/handed_off/delivered). API: `PUT /api/operation/orders/:id/delivery-chain` + `PATCH .../delivery-stops/:leg`. Shared contract `packages/shared/src/schemas/delivery-chain.ts`. UI: `apps/web/src/pages/operation/components/DeliveryChain.tsx` in Order detail drawer — single-leg shows compact pill + "Set up multi-leg route" CTA; chain view = vertical timeline + per-leg action buttons + inline notes editor + "+ Add another leg". **Design rationale** (0156 header comment): jsonb not relational because 80%+ orders are single-leg Klang Valley; revisit gate at ≥30% multi-leg → promote to relational `order_delivery_legs` (β), jsonb shape mirrors the would-be row shape so backfill = one `INSERT … SELECT`. POD-per-leg deferred to V2 (cols `pod_url` / `pod_signed_by` / `status` already on each leg).
- **Stock alerts tab routing fix** (PR #12) — closes CF `phase-4.5-chunk-2-alerts-tab-routing`. `StockAlertsTile` + `OperationWarehouse` use the tab-state callback instead of a bare URL navigate.
- **Doc catch-up 2026-06-08** (this entry, single-session): re-measured tests (api 708/711 · web 473/478 · shared 186/186, +25 net all-pass, 8 fails pre-existing) + bundles (web 2782.60/819.82 KiB, hash matches live · api 1281.87/241.86 KiB dry-run). Confirmed live schema matches checkpoint (8 partners + `delivery_stops` jsonb + 2 RPCs; 0/158 orders multi-leg). Flagged migration-tracker gap — 0155-0158 not in `schema_migrations` though schema is live (see §17.1). New CFs filed in §17.5.

### 17.4 Business model (locked 2026-05-03)

- Dealer just sells. Customer pays HQ direct. No HQ→dealer credit/debt.
- Outstanding column = customer-owe-HQ (dealer chases for 50% top-up gate).
- Phase 4 (Operation) + Phase 6 (Supplier) are HQ INTERNAL roles, NOT dealer-side.

### 17.5 Open carry-forwards

**HIGH**:
- `phase-10-rotate-alpha-test-passwords` — 9 alpha users at password='111' (sales / operation / hookka / nicefuture / nets / finance / bd / mattress / sales-mk). PrincipalAccounts UI built 2026-05-18 (commit `941c665`) gives Loo Reset password per row — rotate via UI before sharing portal externally.
- `phase-9-rotate-principal-password` — principal@carres.com still at password='111' (Phase 9 known-risk; rotate Week 2). If brute-force detected: `update auth.users set encrypted_password = crypt('<new>', gen_salt('bf')) where email='principal@carres.com'`. PDPA fine up to RM 300k if principal-level breach.

**MEDIUM**:
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

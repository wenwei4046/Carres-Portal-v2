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

### 17.1 Current state (as of 2026-06-26)

| | |
|---|---|
| Active phase | **2990s Products 9-tab parity — Phase 5 (Combo cost/sell split) CODE-COMPLETE on branch `feat/2990s-products-p5-combo-cost-sell` (STACKED on P4; 2026-06-26; migration 0183 applied to prod; PENDING P4 merge → P5 merge → deploy).** P5 adds a principal-only COST benchmark alongside the existing SELLING on BOTH combo systems (Loo: both): `combos.cost` (single RM) + `sofa_combo_pricing.cost_by_height` (per-seat-height jsonb). Cost is benchmark-only (like `product_skus.cost`) — NO order/finance/PO consumer; the pure pricing engine (`computeSofaPrice`/`explodeCombo`) stays selling-only + UNTOUCHED. NO RLS/trigger (both combo tables already entirely principal-only write → cost inherits the lock). Web: CombosTab cost input + Σ-component-cost hint + Margin column; SofaCombosPanel per-height cost grid + margin; all margin readouts reuse the canonical `skuMargin` helper. 3-lens adversarial review APPROVE_WITH_MINORS (zero blockers; skuMargin-dedup MINOR fixed). Tests shared 418 · api 861 · web 790, zero new failures. CF `combo-cost-pos-bundle-exposure`. <br><br>**Prior — Phase 4 (Maintenance pools) CODE-COMPLETE on branch `feat/2990s-products-p4-maintenance-pools` (2026-06-26; migration 0182 applied to prod; PENDING merge + web/api deploy; PR #41).** P4 = ONE generic principal-owned table `catalog_option_pools` (a `pool` discriminator: supplier_category · bedframe_size · mattress_size; branding DROPPED per Loo — all Carres products are one brand; sizes carry label+dimensions; versioning deferred). Read-only curated reference lists — NOT a source of truth for any order-side consumer (sizes stay per-model in `allowed_options`, the pool only feeds the Modular drawer's size picker as quick-add suggestions; supplier_category stays in `suppliers.cat_covered`, curate-only this phase). API: optionPools in the catalog bundle + principal-gated POST/PATCH/DELETE `/api/catalog/option-pools` (UNIQUE(pool,value)→409, empty PATCH→422, hard DELETE; userClient/RLS only). Web: reusable `OptionPoolEditor` (3 editors in the Maintenance tab, principal-gated). Built ultracode (4-agent research → migration+shared inline → API+web subagent build → 3-lens adversarial review APPROVE, 2 MINORs + 1 docstring fixed). Contract-safe (create_order/order_lines/DraftLine/cart.ts/configurators UNTOUCHED); shared 417 · api catalog 112 · web optionpool 6 + drawer sizePool 3; full suite zero new failures (8 pre-existing §17.7). Roadmap `docs/superpowers/plans/2026-06-25-2990s-products-9tab-parity-roadmap.md`. **Next = P5 Combo cost/sell split (small) · P6 RuleTarget + Delivery Fee · P7 Default Free Gifts · P8 PWP+Promo.** <br><br>**Prior — 2990s Products 9-tab parity P1-P3 shipped 2026-06-24/25.** This is the big initiative chosen 2026-06-25: reproduce 2990s's entire **Products** admin page (all 9 tabs — SKU Master · Modular · Special Add-ons · Fabrics · Maintenance · Combo Pricing · Delivery Fee · PWP · Promo) in Carres. 8-phase roadmap `docs/superpowers/plans/2026-06-25-2990s-products-9tab-parity-roadmap.md`. **Shipped so far: P1 = SKU Import/Export (PR #38, no migration — unblocks the white-papered empty catalog) · P2 = SKU-Master + Modular polish (PR #39, no migration) · P3 = Special Add-ons (PR #40 merge `7544e22`, migration 0181 `special_addons` — per-model SELLING surcharges, negative allowed, nested follow-up option groups).** **Phase 4 = Maintenance pools** (this branch): Brandings · Supplier-Categories · Bedframe/Mattress Sizes global option pools (Carres currently has no global option-pool tables — sizes live per-model in `allowed_options`); the versioned config-history layer is DEFERRED. Remaining: P5 Combo cost/sell split · P6 shared `RuleTarget` port + Delivery Fee · P7 Default Free Gifts · P8 PWP voucher + Promo (heaviest, last). Effort = ultracode. <br><br>**Prior — principal portal create+trace orders (PR #37 merge `07b9ec1`, migration 0180):** principal can place an order on behalf of a picked dealer (reuses dealer POS via `DealerPos` `actingDealerId`; dealer flow byte-identical) + an Orders trace tab; 0180 = orders-attachments `is_internal` write branch. Deploy api `037e6e7d` / web `a6f54b2c`. <br><br>**Prior — Sofa custom-cell / compartment engine — Phase 5 shipped 2026-06-23 (the explode cutover; PR #36, deploy api `4166588c` / web `23404cee`, NO migration — DORMANT until compartments authored).** Phase 4 (trust gate ONLY) shipped 2026-06-23 (PR #35 merge `ced72e5`, deploy api `b3fd023a`, no migration). Phase 3 (drag builder) PR #33 merge `74e21d1`, web-only, deploy web `a267c6a1`. Phases 1+2 shipped 2026-06-21 (PR #29 / #31; migrations 0178 / 0179). NEW initiative chosen 2026-06-21 (after the POS 2990s alignment closed): reproduce the **2990s sofa engine identically** in Carres's stack, MINUS promo (PWP/GWP deferred) + bedframe deferred. Locked decisions (Loo): C-visual full drag plan-view builder; **server recompute + 0.5% drift reject = YES but done in HONO** (`create_order` untouched); pricing = matched-combo (subset Kuhn OR-set, applies even if pricier) > à-la-carte module sum + extras + recliner + fabric-tier delta; explode into per-compartment `order_lines` (reuses the Phase-4 combo explode pattern); compartments become real `product_skus`; fabric extends 0176. Roadmap = ~5 phases (P1 pool + maintenance · P2 pricing engine + `sofa_combo_pricing` · P3 visual drag builder · P4 Hono server-recompute + explode · P5 downstream + cutover) — `docs/superpowers/plans/2026-06-21-sofa-engine-roadmap.md`. **Phase 1 = compartment pool + per-model offered set + Maintenance UI** (migration 0178): additive, zero behaviour change, principal-only pricing. **Phase 2 = the pricing engine + sofa-combo model** (migration 0179, PR #31): the pure `computeSofaPrice` (matched-combo > à-la-carte, applies even if pricier, covers only the matched subset + extras at full + fabric-tier delta; recliner = `+0` Phase-3 stub) + `matchSofaCombo` (Kuhn bipartite max-matching over OR-set slots) + `pickSofaCombo` (company-scope, newest `effective_from`) + `explodeSofaBuild` (residue-on-last, Σ-exact) — all in `packages/shared`, strict TDD, faithful 2990s port. `sofa_combo_pricing` prices combos **per seat-height** (`prices_by_height`, Loo's call); a 0175-style trigger now also locks `sofa_fabrics.tier` to principal. API GET `sofaCombos` + principal-gated CRUD; a principal-only Sofa Combos panel in `ProductModelDrawer` (OR-set slots editor + per-height price grid + implied-discount readout). 5 tasks each independently adversarially reviewed + APPROVED; contract-safe — no order-side consumer until Phase 4. **Phase 3 = the visual drag plan-view builder** (web-only, no migration, PR #33): `packages/shared/src/sofa-geometry.ts` (the 2990s geometry ported PURE — footprint table / `findSnap` / `groupSofas` / `analyzeSofa` arm-cap closure, 57 TDD tests) + `CompartmentSilhouette` SVG + `SofaBuildCanvas` (full-screen 3-pane drag builder: native pointer + edge-snap + rotate + connected-sofa outline + arm-cap gate + live `computeSofaPrice`) + integration (a sofa model with offered compartments opens the overlay → `buildToDraftLine` emits ONE contract-safe `DraftLine`, representative sofa sku + build in `attrs.sofa_build`). Thin (geometry→shared, price→P2). **Dormant in prod** (builder shows only for offered-compartment sofa models; 0 authored). Deferred: group-drag/rotate (polish) + recliner. **Phase 4 = the trust gate ONLY** (Hono re-runs `computeSofaPrice` with fresh DB prices on a sofa-build line → `>0.5%` drift → 422 `sofa_price_drift`, else overwrites unitPrice with the server number; explode deferred to P5; PR #35). **Phase 5 = the explode cutover** (PR #36, NO migration): **5A** offering a compartment auto-syncs a real `product_skus` row (`{MODEL_KEY}-{code}`, `pos_active=false` so it never shows in the flat POS grid, supplier inherited from the model, principal-priced, **collision-guarded** against flat skus; un-offer soft-discontinues, never deletes); **5B** the server-recompute now, after the drift gate, **explodes** the build line into one `order_line` per compartment (real sku, `unitPrice` = Σ-exact proportional split, `attrs`={`sofa_build_key`/`cell_index`/`module_code`/geometry/fabric}) then calls the UNCHANGED `create_order`, **fail-closed** on an unsynced compartment; web customer order detail regroups exploded lines into one "Sofa" (ops/PO/stock stay itemized by design); `deriveSkuCode` de-triplicated to `@carres/shared`. NO migration (mints `product_skus` rows + reads 0176/0178/0179 via **userClient/RLS only — never service_role**); `create_order`/`order_lines`/`DraftLine`/`cart.ts`/0089 mutex UNTOUCHED; non-build orders byte-identical. Independent adversarial review APPROVE (8/8 contract invariants; 2 minors fixed). **Next = author real compartment data (principal Maintenance UI) → the engine wakes; then live-verify the explode + decide flat-sofa (628 SKUs) coexistence at cutover.** <br><br>**Prior — POS 2990s alignment, all 4 phases shipped 2026-06-20** (Phases 1-3 = PR #25 merge `be151c7`; Phase 4 = combo / set pricing = PR #27 merge `7bb9618`): the dealer/showroom POS (shared `DealerApp`) re-skinned to match Loo's separate 2990s POS, plus a cost/sell + fabric-tier + combo pricing foundation. **Phase 1** = visual re-skin (Carres flame `#C44D2B` + email login KEPT; Archivo price-hero, flame selected-ring, soft-ink shadows, page-enter/hover motion, 2990s-style cards/FAB/pay-card grid/drawers; web-only, `DraftLine`/`create_order` untouched). **Phase 2** = cost/sell split — `product_skus.cost` (existed since 0074) surfaced + plan/base margin in Product Maintenance; **principal = "Master Admin" owns pricing** (migration 0175 trigger + API/UI gate locks `product_skus.price`+`.cost` writes to principal); fake 55% cost backfill cleared to null. **Phase 3** = fabric-tier P1/P2/P3 (migration 0176) — sofa fabrics gain a tier; P2/P3 add a configurable selling delta (global singleton + per-model override); sofa-fabric maintenance UI built from scratch (per-model panel + global delta card); all pricing knobs principal-gated (DB RLS + API 403 + UI read-only). **Phase 4** = combo / set pricing (migration 0177, PR #27) — a combo = a principal-defined named SKU set at one combo price; the POS **explodes** it into real component `order_lines`, splitting the price proportional to catalog price×qty (residue-on-last); combo info rides in `order_lines.attrs.combo_key`/`combo_label`; **client-priced, no server recompute**; principal-only P&M "Combos" editor tab + searchable SKU picker. All 4 phases contract-safe (orders submit pipeline untouched — `DraftLine`/`create_order`/`order_lines` UNTOUCHED; sofa P1 path byte-identical; combo_key→attrs verified end-to-end). 2990s codebase = `C:\Users\wenwe\Projects\2990s`. Prior: Dealer POS catalog flow (PR #22); SO Maintenance (PR #21); Catalog P&M (PR #19); Phase 11 (PR #15). Phase 10 post-launch fixes still ongoing. |
| Project started | 2026-05-02 |
| Web URL | https://carres-portal.pages.dev |
| API URL | https://carres-portal-v2-api.wwch.workers.dev |
| DB | staging Supabase = prod, project_id `kfprgpjpaffedghytstl` |
| Latest migration | **Tail = 0183** (verified on prod via `list_migrations` 2026-06-26). **0183** `combo_cost` (2990s Products parity Phase 5 — combo cost/sell split: ADD `combos.cost numeric(14,2)` nullable + `sofa_combo_pricing.cost_by_height jsonb` nullable, principal-only cost benchmark companions to the existing selling (`combo_price` / `prices_by_height`). NO RLS/trigger — both tables are already entirely principal-only write so cost inherits the lock; cost is benchmark-only (no order/finance/PO consumer); additive + zero behaviour change; applied + on prod 2026-06-26, branch `feat/2990s-products-p5-combo-cost-sell`). Prior — **0182** `catalog_option_pools` (2990s Products parity Phase 4 — ONE generic principal-owned table for the Maintenance pools: `id` / `pool` text CHECK(`supplier_category`/`bedframe_size`/`mattress_size`) / `value` / `label` text-nullable / `dimensions` text-nullable / `active` / `sort_order` / timestamps / `updated_by`; UNIQUE(`pool`,`value`) + (pool,active,sort_order) index; RLS read-all + `is_principal()` write (InitPlan-wrapped, mirrors 0178/0181); additive + zero behaviour change (empty table → existing fallbacks); applied + on prod 2026-06-26, branch `feat/2990s-products-p4-maintenance-pools`). Prior — **0181** `special_addons` (2990s Products parity Phase 3, PR #40: per-model SELLING surcharges — negative allowed — with nested follow-up option groups; principal-gated; applied + on prod 2026-06-24). Prior — **0180** `storage_orders_attachments_internal_write` (principal portal, PR #37: orders-attachments `is_internal` write branch; applied + on prod 2026-06-24). Sofa engine P3/P4/P5 added NO migration (P4/P5 ride config in `order_lines.attrs` free jsonb + mint `product_skus` rows; explode/recompute is Hono-side). **0179** `sofa_combo_pricing` (Sofa engine Phase 2: principal-owned sofa-combo model priced **per seat-height** — `id` / `model_id`→`product_models` ON DELETE CASCADE / `slots` jsonb (string[][] ordered OR-sets of compartment codes) / `tier` text-nullable CHECK(`PRICE_1/2/3`) / `prices_by_height` jsonb ({height→numeric MYR \| null}) / `label` / `effective_from` / `active` / `discontinued_at`; lookup + GIN(`slots`) indexes; RLS principal-only write mirroring 0177/0178 (`is_principal()`); PLUS a 0175-style trigger `enforce_sofa_fabric_tier_principal_only` locking `sofa_fabrics.tier` changes to principal (closes the `fabric-tier-db-lock-sofa-fabrics-tier` CF); additive + zero behaviour change (empty table); applied + on prod 2026-06-21, PR #31; MCP version stamp `20260620184008`, **name authoritative** not the skewed timestamp). Prior — **0178** `sofa_compartments` (Sofa engine Phase 1: `sofa_compartments` pool — `code` UNIQUE / `description` / `seat_count` / `arm_config` / `icon_url` / `default_price` / `sort_order` / `active` — + `model_sofa_compartments` (`model_id` → `product_models` ON DELETE CASCADE, `compartment_id` → `sofa_compartments` ON DELETE RESTRICT, `price_override`, PK(`model_id`,`compartment_id`)) + nullable `product_skus.compartment_id`; RLS principal-only write mirroring `floor_config`/0176/0177 (`is_principal()`); additive + zero behaviour change; applied + on prod 2026-06-21, PR #29). Prior — **0177** `combo_pricing` (Phase 4: `combos` + `combo_components` tables — a principal-owned named SKU set sold at one combo price; `combo_components.sku` FKs `product_skus(sku)` ON DELETE RESTRICT (sku is UNIQUE), `combo_id` ON DELETE CASCADE; RLS principal-only write mirroring `floor_config`/0176 / `is_principal()`; additive + zero behaviour change (empty tables); applied + on prod 2026-06-20, PR #27). Prior — **0176** `fabric_tier_addon` (Phase 3: `sofa_fabrics.tier` PRICE_1/2/3 default PRICE_1 + `fabric_tier_addon_config` singleton + `model_fabric_tier_overrides`; RLS principal-only write mirroring `floor_config`/`is_principal()`; additive + zero-price-change-on-apply; applied + on prod 2026-06-20, PR #25). Prior — **0175** `lock_sku_price_cost_to_principal` (Phase 2: trigger `enforce_sku_price_cost_principal_only` — only principal may set/change `product_skus.price`/`.cost`; NULL-role service/migration bypass; ERRCODE 42501; applied + on prod 2026-06-20, PR #25). Prior — **0174** `sales_order_grid_config` (SO Maintenance shared column-config table + `set_sales_order_grid_config` RPC; RLS internal-only read, RPC-gated write; applied + on prod 2026-06-16, PR #21). Prior — **0173** `storage_product_model_photos_bucket` (Catalog rebuild, applied + on prod 2026-06-14). Catalog migrations 0169-0173: 0169 enum +accessory/+service · 0170 `product_skus.pos_active`+`description` · 0171 `product_models.photo_url`+`allowed_options` + `product_skus.supplier_id` nullable · 0172 `addons.service_sku` + 4 `SVC-` Service SKUs under the `service-addons` model · 0173 public `product-model-photos` bucket. Prior — **0168** `drop_set_order_date_2arg_shim`. Phase 11: 0165 = `orders.proceed_date` + 3-arg `set_order_date` · 0166 = temp 2-arg shim (dropped by 0168) · **0167** = `operation_stage` enum 7→6 (`placed`/`proceed_request`→`confirmed`, `awaiting_operation_action`→`in_production`, `waiting` kept; `orders.status` UNTOUCHED as anchor; 30 fns + 3 triggers self-adaptively recreated) · 0168 = drop shim. The 6/12 ops-cockpit migrations 0159-0166 (`ops_order_control`, `ops_notes_tasks`, `ops_order_control_payments`, `ops_bulk_complete_orders`, etc.) are main's authentic files. **NOTE**: 0165 + 0166 each have TWO distinct files (an ops_* migration + an 11.1 migration sharing the number) — cosmetic only, this project applies migrations manually via MCP (tracker keys on timestamp, not filename). The 5 branch backfill duplicates were deleted in cleanup. |
| Catalog state | 11 suppliers · 171 product_models (170 + the 0172 `service-addons` parent) · **1017 product_skus** (1013 AutoCount + 4 `SVC-` Service SKUs). Categories widened 3→5 (+accessory, +service). product_skus carry `pos_active` (sell-side ON/OFF, distinct from `discontinued_at`) + editable `description`; product_models carry `photo_url` + `allowed_options` jsonb. (Original target 1091, 78 source dupes in carres-sku-master.xlsx — see CFs.) Phase 4 added 2 combo tables (`combos` + `combo_components`), **0 rows** (no combos authored yet). Sofa engine Phase 1 added 2 compartment tables (`sofa_compartments` + `model_sofa_compartments`), **0 rows** (no compartments authored yet); Phase 2 added `sofa_combo_pricing`, **0 rows** (no sofa combos authored yet). |
| Orders state | **158 orders** (verified 2026-06-08): 153 AutoCount-imported (`source_system='autocount'`, all status `place`, SO-1001..1158, ~575 units feeding supplier forecast) + 5 native test orders (SO-1116..1120, cancelled/proceed_order). 0 have `delivery_stops` set — multi-leg chain never live-exercised (see §17.3 Pending). next `orders_so_seq` ≈ SO-1159. |
| Test count | api **808/811** (3 pre-existing fails) · web **728/733** (5 pre-existing fails) · shared **372/372** — measured 2026-06-23 after Sofa engine Phase 5 (PR #36); all 8 fails pre-existing per §17.7 (OhanaSofaTab ×4 + NiceFutureMattressTab ×1 web; supplier/pos ×2 + pickups ×1 api), zero new regressions. P5 added: shared `explodeSofaBuildToOrderLines` + `sku-code` · api compartment-sku sync (catalog.test) + the explode in orders.test · web `sofa-build-display`. |
| Web bundle | built + deployed 2026-06-23 from `claude/angry-ptolemy-6b974e` (Sofa engine Phase 5, Pages deploy `23404cee`); `SERVICE_ROLE` scan on dist = 0. bundle-size regression CF still open, see §17.5. |
| API bundle | **Deployed 2026-06-23 (Worker `4166588c`, PR #36 — the server-recompute now EXPLODES a sofa build into per-compartment `order_lines`; compartment-sku auto-sync on offer; non-build orders byte-identical).** Prior P4 `b3fd023a` (trust gate). |

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
| Sales Order Maintenance | ✅ | 2026-06-16 | PR #21 · Operation **SO Maintenance** — AutoCount-style configurable SO grid (1 row/line, read-only; resize + per-column filter + `Columns N/M` picker + shared column/option config). migration 0174 + shared + API + frontend. Plan: `docs/superpowers/plans/2026-06-16-sales-order-maintenance.md`. Deployed + live-smoked. |
| Dealer POS catalog flow | ✅ | 2026-06-16 | PR #22 · **catalog-first full-screen POS** at the `/dealer` landing (01 CATALOG → 02 CUSTOMER → 03 CONFIRM): category rail + product grid + configure/cart drawers + floating cart. Web-only — reuses `draft.ts`/configurators/payment step/submit verbatim (`DraftLine` unchanged → API/schema untouched); `DealerChrome` layout route; old 4-step wizard + `DealerDashboard` deleted; online payment forwards the approval/reference code. Plan: `~/.claude/plans/fizzy-cooking-frost.md` (not committed). Deployed (Pages `0aa6883b`); Loo to manual-smoke. |
| POS re-skin (2990s) | ✅ | 2026-06-20 | PR #25 (merge `be151c7`) · dealer/showroom POS re-skinned to the 2990s look (flame `#C44D2B` + email login KEPT): Archivo price-hero, flame selected-ring, soft-ink shadows, motion, 2990s cards/FAB/pay-card grid/drawers. Web-only; `DraftLine`/`create_order` untouched. subagent-driven (6 tasks + final review). Plan: `docs/superpowers/plans/2026-06-20-pos-2990s-alignment.md`. |
| Cost/Sell split | ✅ | 2026-06-20 | PR #25 · migration **0175** — principal ("Master Admin") owns `product_skus.price`+`.cost` (trigger + API/UI gate); cost + plan/base margin surfaced in Product Maintenance; fake 55% cost backfill cleared to null. Plan: `docs/superpowers/plans/2026-06-20-phase2-costsell.md`. |
| Fabric-tier P1/P2/P3 | ✅ | 2026-06-20 | PR #25 · migration **0176** — sofa fabric tiers + configurable selling delta (global singleton + per-model override) + sofa-fabric maintenance UI built from scratch (per-model panel + global delta card); all pricing knobs principal-gated; sofa P1 path byte-identical. Plan: `docs/superpowers/plans/2026-06-20-phase3-fabrictier.md`. |
| Combo / set pricing | ✅ | 2026-06-20 | PR #27 (merge `7bb9618`) · migration **0177** — `combos` + `combo_components` (principal-owned, RLS mirrors 0176); POS explodes a combo into component `order_lines` with price split proportional to catalog price×qty (residue-on-last); combo info in `order_lines.attrs.combo_key`/`combo_label`; client-priced (no server recompute); P&M 4th "Combos" tab + searchable SKU picker; contract-safe (`DraftLine`/`create_order`/`order_lines` untouched). Plan: `docs/superpowers/plans/2026-06-20-phase4-combo.md`. |
| Sofa engine P1 (compartments) | ✅ | 2026-06-21 | PR #29 (merge `1b4d6cc`) · migration **0178** — `sofa_compartments` pool + `model_sofa_compartments` per-model offered set + nullable `product_skus.compartment_id`; principal-only RLS (mirrors 0176/0177); Maintenance UI (pool list + per-model panel). Phase 1 of the ~5-phase **sofa custom-cell / compartment engine** roadmap. Additive, zero behaviour change. Plan: `docs/superpowers/plans/2026-06-21-sofa-phase1-compartments.md` · roadmap `...-sofa-engine-roadmap.md`. |
| Sofa engine P2 (pricing engine) | ✅ | 2026-06-21 | PR #31 (merge `a90a743`) · migration **0179** `sofa_combo_pricing` (per-seat-height `prices_by_height`, OR-set `slots`, principal RLS; + a 0175-style trigger locking `sofa_fabrics.tier`). The pure **`computeSofaPrice`** + `matchSofaCombo` (Kuhn max-matching) + `pickSofaCombo` + `explodeSofaBuild` + `resolveCompartmentPrice` in `packages/shared` (strict TDD, 53 tests, faithful 2990s port — matched-combo>à-la-carte even if pricier, mirror-C1, residue-on-last); API GET `sofaCombos` + principal CRUD; web Sofa Combos panel in `ProductModelDrawer` (OR-set slots editor + per-height price grid). 5 tasks each adversarially reviewed + APPROVED; contract-safe (no order consumer until P4). Deploy api `1b3f8bd7`/web `5bfbaa9b`. Plan: `docs/superpowers/plans/2026-06-21-sofa-phase2-pricing.md`. |
| Sofa engine P3 (drag builder) | ✅ | 2026-06-21 | PR #33 (merge `74e21d1`) · **web-only, NO migration**. `packages/shared/src/sofa-geometry.ts` (2990s geometry ported pure — footprint/`findSnap`(20cm)/`groupSofas`/`analyzeSofa` arm-cap, strict TDD 57 tests) + `CompartmentSilhouette` SVG (derived from geometry, v17) + `SofaBuildCanvas` (full-screen 3-pane drag builder: native pointer + snap + rotate + connected-outline + arm-cap gate + live `computeSofaPrice`; thin — geometry→shared, price→P2) + integration (offered-compartment sofa model → "Build your sofa" overlay → `buildToDraftLine` emits ONE contract-safe `DraftLine`). 5 tasks each adversarially reviewed + APPROVED; contract-safe (`create_order`/`order_lines`/`DraftLine`/`cart.ts`/mutex untouched). Dormant in prod (0 offered compartments). Deploy web `a267c6a1` (api unchanged). Deferred: group-drag/rotate (polish), recliner. Plan: `docs/superpowers/plans/2026-06-21-sofa-phase3-builder.md`. |
| Sofa engine P4 (trust gate) | ✅ | 2026-06-23 | PR #35 (merge `ced72e5`) · **NO migration**. Hono server-recompute + 0.5% drift-reject on the SofaBuildCanvas single line — re-runs the pure `computeSofaPrice` with fresh DB prices; `>0.5%` drift → 422 `sofa_price_drift` (no order), else overwrites the line's unitPrice with the server number. Scope = trust gate ONLY (explode deferred to P5); userClient/RLS, never service_role; fail-closed on DB error (500). Contract-safe (`create_order`/`order_lines`/`DraftLine`/`cart.ts`/0089 mutex untouched). Independent adversarial review APPROVE. Deploy api `b3fd023a`. Plan `docs/superpowers/plans/2026-06-23-sofa-phase4-server-recompute.md`. |
| Sofa engine P5 (explode cutover) | ✅ | 2026-06-23 | PR #36 · **NO migration**. **5A** compartment→real `product_skus` auto-sync on offer (`{MODEL_KEY}-{code}`, `pos_active=false`, supplier inherited, principal-priced, collision-guarded; un-offer soft-discontinues). **5B** the server-recompute explodes the build into per-compartment `order_lines` (real skus, Σ-exact split, `attrs.sofa_build_key`/`module_code`/geometry/fabric) before the unchanged `create_order`, fail-closed on an unsynced compartment. web: customer order detail regroups exploded lines into one "Sofa" (ops/PO/stock stay itemized); Maintenance shows the synced sku. shared `explodeSofaBuildToOrderLines` + de-triplicated `deriveSkuCode`. Contract-safe (create_order/order_lines/DraftLine/cart.ts/0089 untouched; userClient/RLS only); non-build orders byte-identical; **dormant** (0 compartments authored). Independent adversarial review APPROVE (8/8 invariants; 2 minors fixed). Deploy api `4166588c` / web `23404cee`. Plan `docs/superpowers/plans/2026-06-23-sofa-phase5-explode-cutover.md`. |
| Principal portal orders | ✅ | 2026-06-25 | PR #37 (merge `07b9ec1`) · migration **0180** — principal places + traces orders on behalf of a picked dealer (reuses dealer POS via `DealerPos` `actingDealerId`, dealer flow byte-identical) + Orders trace tab; 0180 = orders-attachments `is_internal` write branch. Deploy api `037e6e7d` / web `a6f54b2c`. |
| 2990s Products parity P1 (SKU Import/Export) | ✅ | 2026-06-25 | PR #38 (merge `918c066`) · **no migration**. `POST /api/catalog/import-skus` (internal-gated, upsert by sku, resolve/create model) + web `ImportSkusDialog` (CSV/xlsx staged preview) + `exportSkusCsv` round-trip — unblocks the white-papered empty catalog. First phase of the 8-phase 2990s Products 9-tab parity initiative. |
| 2990s Products parity P2 (SKU-Master + Modular polish) | ✅ | 2026-06-25 | PR #39 (merge `1a3baa4`) · **no migration**. Staged bulk price-edit, bulk activate/deactivate, generate-skus format-templates. |
| 2990s Products parity P3 (Special Add-ons) | ✅ | 2026-06-25 | PR #40 (merge `7544e22`) · migration **0181** `special_addons` — per-model SELLING surcharges (negative allowed) + nested follow-up option groups; principal-gated. |
| 2990s Products parity P4 (Maintenance pools) | 🟡 code-complete (pending merge+deploy) | 2026-06-26 | branch `feat/2990s-products-p4-maintenance-pools` · migration **0182** `catalog_option_pools` (ONE generic table; supplier_category + bedframe/mattress sizes; branding DROPPED — all Carres = one brand; sizes carry label+dimensions; versioning DEFERRED) + shared contract + API bundle/CRUD + Maintenance `OptionPoolEditor` + drawer size-suggestion wiring. Read-only reference lists (order pipeline untouched). 3-lens adversarial review APPROVE. Plan `docs/superpowers/plans/2026-06-25-2990s-products-9tab-parity-roadmap.md` (P4 section). |
| 2990s Products parity P5 (Combo cost/sell split) | 🟡 code-complete (pending merge+deploy) | 2026-06-26 | branch `feat/2990s-products-p5-combo-cost-sell` (STACKED on P4) · migration **0183** `combo_cost` — ADD `combos.cost` + `sofa_combo_pricing.cost_by_height` (principal-only cost benchmark companions to the existing selling; NO RLS/trigger — tables already principal-only write). Cost is benchmark-only (no order/finance/PO consumer; pricing engine untouched). Web: CombosTab cost+margin + SofaCombosPanel per-height cost+margin, all via the canonical `skuMargin` helper. 3-lens adversarial review APPROVE_WITH_MINORS (skuMargin-dedup fixed). CF `combo-cost-pos-bundle-exposure`. Plan roadmap P5 section. |

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
- **2026-06-16** · Sales Order Maintenance — AutoCount-style configurable SO grid (1 row/line, read-only; resize / per-column filter / `Columns N/M` picker / global search + shared column+option config) · migration 0174 + reusable `DataGrid` component · PR #21 · deployed + live-smoked
- **2026-06-16** · Dealer catalog-first full-screen POS — `/dealer` now opens straight into a POS (01 CATALOG → 02 CUSTOMER → 03 CONFIRM); category rail + product grid + configure/cart drawers + floating cart. Web-only, **0 migration / 0 API** (DraftLine shape held → submit pipeline reused verbatim). `DealerChrome` layout route for back-office; KPIs → Orders top; old 4-step wizard + `DealerDashboard` removed; online payment forwards the approval/reference code · PR #22 · deployed (Pages `0aa6883b`), Loo to manual-smoke
- **2026-06-20** · POS 2990s alignment — 3 phases in one stacked PR **#25** (merge `be151c7`): **P1** POS re-skin to Loo's 2990s POS look (flame `#C44D2B` + email login KEPT; Archivo price-hero, flame ring, motion, 2990s cards/FAB/pay-cards; web-only, `DraftLine`/`create_order` untouched) · **P2** cost/sell split — `product_skus.cost` (existed since 0074) surfaced + margin in Product Maintenance, principal "Master Admin" owns pricing (migration **0175** trigger + API/UI gate), fake 55% cost backfill cleared to null · **P3** fabric-tier P1/P2/P3 (migration **0176**) + sofa-fabric maintenance UI from scratch, principal-gated, sofa P1 path byte-identical. subagent-driven (per-task implement+review+fix, final whole-branch review per phase); contract-safe across all 3. 2990s codebase = `C:\Users\wenwe\Projects\2990s`. Merged + redeployed from main (web Pages `f5d86db9`, api Worker `f6005526`); 0175+0176 on prod; Loo to live-smoke. Plans: `docs/superpowers/plans/2026-06-20-{pos-2990s-alignment,phase2-costsell,phase3-fabrictier}.md`
- **2026-06-20** · Phase 4 — combo / set pricing · migration **0177** (`combos` + `combo_components`, principal-owned) · PR **#27** (merge `7bb9618`) — a combo = a named SKU set at one combo price; the POS explodes it into real component `order_lines` (price split proportional to catalog price×qty, residue-on-last); combo info rides in `order_lines.attrs.combo_key`/`combo_label`; client-priced, contract-safe (`DraftLine`/`create_order`/`order_lines` untouched). 6 subagent tasks + a searchable SKU picker; P&M 4th "Combos" tab (principal-only). Deployed web Pages `5cf619ef` + api Worker `9412d21b`. 4 new CFs in §17.5. Plan: `docs/superpowers/plans/2026-06-20-phase4-combo.md`
- **2026-06-21** · Sofa engine **Phase 1** (compartment foundation) — first phase of the NEW ~5-phase **2990s sofa custom-cell engine** initiative (chosen 2026-06-21 after Phase 4 combo; promo/bedframe deferred) · migration **0178** (`sofa_compartments` pool + `model_sofa_compartments` per-model offered + nullable `product_skus.compartment_id`, principal-only RLS) + shared + API + Maintenance UI (pool list + per-model panel) · PR **#29** (merge `1b4d6cc`) — additive, zero behaviour change. T3 (API) + T4 (web) authored INLINE during a sustained Anthropic API-529 outage that blocked the SDD review subagents; an independent adversarial review ran + APPROVED after the platform recovered (no fixes needed). Deployed web Pages `5ce9a835` + api Worker `6053e1a0`; 0178 on prod. Roadmap `docs/superpowers/plans/2026-06-21-sofa-engine-roadmap.md` · plan `...-sofa-phase1-compartments.md` · research `docs/superpowers/2026-06-21-sofa-engine-understand.md`
- **2026-06-21** · Sofa engine **Phase 2** (pricing engine + sofa-combo model) · migration **0179** (`sofa_combo_pricing` — per-seat-height `prices_by_height` + OR-set `slots` + principal RLS; + a 0175-style trigger locking `sofa_fabrics.tier`, closing that CF) · PR **#31** (merge `a90a743`) — the pure `computeSofaPrice` + `matchSofaCombo` (Kuhn max-matching) + `pickSofaCombo` + `explodeSofaBuild` + `resolveCompartmentPrice` in `packages/shared` (strict TDD, 53 tests, faithful 2990s port: matched-combo>à-la-carte even if pricier, mirror-C1, residue-on-last) + API GET `sofaCombos` + principal CRUD + web Sofa Combos panel in ProductModelDrawer (OR-set slots editor + per-height price grid). 5 tasks each adversarially reviewed + APPROVED (1 fidelity fix `3285e9b` to match 2990s's 0-priced-combo post-rank gate); contract-safe (no order consumer until P4). Deployed api Worker `1b3f8bd7` + web Pages `5bfbaa9b`; 0179 on prod. Plan `docs/superpowers/plans/2026-06-21-sofa-phase2-pricing.md`. Next = Phase 3 (visual drag builder UI).
- **2026-06-21** · Sofa engine **Phase 3** (visual drag plan-view builder) · **web-only, NO migration** · PR **#33** (merge `74e21d1`) — `packages/shared/src/sofa-geometry.ts` (the 2990s plan-view geometry ported PURE: footprint table + `findSnap` 20cm + `groupSofas` union-find + `analyzeSofa` arm-cap closure, strict TDD 57 tests) + `CompartmentSilhouette` SVG (derived from geometry, v17/Lucide/no-emoji) + `SofaBuildCanvas` (full-screen 3-pane drag builder — native pointer-capture + edge-snap + rotate + connected-sofa outline + dimension callouts + arm-cap gate + live `computeSofaPrice` + matched-combo badge; THIN — all geometry→shared, all price→P2) + integration (offered-compartment sofa model → "Build your sofa" full-screen overlay → `buildToDraftLine` emits ONE contract-safe `DraftLine`: representative sofa sku [mutex-correct] + build in `attrs.sofa_build`/`sofa_build_key`). 5 tasks each independently adversarially reviewed + APPROVED (T3's 2 actionable minors fixed: rotate-test + 0-combo gate). Contract-safe (`create_order`/`order_lines`/`DraftLine`/`cart.ts`/0089 mutex UNTOUCHED). **Dormant in prod** (builder shows only for offered-compartment sofa models; 0 authored — safe to ship). Deployed web Pages `a267c6a1` (api unchanged). Deferred: group-drag/rotate (polish), recliner per-seat (needs a migration). Plan `docs/superpowers/plans/2026-06-21-sofa-phase3-builder.md`. Next = Phase 4 (Hono server-recompute + drift-reject + explode).
- **2026-06-23** · Sofa engine **Phase 4** (trust gate ONLY) · PR **#35** (merge `ced72e5`) · NO migration · Hono server-recompute + 0.5% drift-reject on the sofa-build line (explode deferred to P5). Deploy api `b3fd023a`. Detail → `docs/phase-10-worklog.md`.
- **2026-06-23** · Sofa engine **Phase 5** (the explode cutover) · PR **#36** · NO migration · compartment→real-`product_skus` auto-sync on offer + server-side explode into per-compartment `order_lines` + customer-detail regroup; contract-safe, dormant, adversarial-review APPROVE. Deploy api `4166588c` / web `23404cee`. Detail → `docs/phase-10-worklog.md`.

### 17.4 Business model (locked 2026-05-03)

- Dealer just sells. Customer pays HQ direct. No HQ→dealer credit/debt.
- Outstanding column = customer-owe-HQ (dealer chases for 50% top-up gate).
- Phase 4 (Operation) + Phase 6 (Supplier) are HQ INTERNAL roles, NOT dealer-side.

### 17.5 Open carry-forwards

**HIGH**:
- `phase-10-rotate-alpha-test-passwords` — 9 alpha users at password='111' (sales / operation / hookka / nicefuture / nets / finance / bd / mattress / sales-mk). PrincipalAccounts UI built 2026-05-18 (commit `941c665`) gives Loo Reset password per row — rotate via UI before sharing portal externally.
- `phase-9-rotate-principal-password` — principal@carres.com still at password='111' (Phase 9 known-risk; rotate Week 2). If brute-force detected: `update auth.users set encrypted_password = crypt('<new>', gen_salt('bf')) where email='principal@carres.com'`. PDPA fine up to RM 300k if principal-level breach.

**MEDIUM**:
- `combo-cost-pos-bundle-exposure` — Phase 5 (2026-06-26): the new `combos.cost` + `sofa_combo_pricing.cost_by_height` are mapped unconditionally by `comboFromRow`/`sofaComboFromRow` into the GET `/api/catalog` bundle, which the dealer/showroom POS also fetches — so the principal-only cost benchmark + per-seat-height cost land in the POS network payload (devtools-readable), even though no POS UI renders them. **This exactly mirrors the pre-existing `product_skus.cost` read-exposure (accepted since 0175), not a new pattern**, and the feature is dormant (0 combos/sofa-combos in prod). No contract impact (cost never reaches an order_line/invoice/PO; the pure pricing engine ignores it). Defense-in-depth (one consistent fix): strip `cost` from each sku + `cost`/`cost_by_height` from each combo/sofaCombo in the bundle for non-internal JWT roles (dealer/showroom/partner/supplier) before `catalogResponseSchema.parse`, and make those schema fields `.optional()`.
- `combo-component-price-availability` — Phase 4 (2026-06-20): the POS `skuPrice` lookup is built from the **pos_active** catalog bundle, so a combo component SKU that's `pos_active=false`/discontinued isn't in the bundle → it's priced 0 and the other components absorb the full combo price. The `explodeCombo` guard prevents NaN, and the combo **TOTAL still equals `comboPrice`** — only the per-line split skews. Defence: include combo-component SKU prices in the catalog GET, or have the Combos tab require pos_active components.
- `fabric-tier-db-lock-sofa-fabrics-tier` **[CLOSED 2026-06-21** — migration 0179 added the 0175-style `enforce_sofa_fabric_tier_principal_only` trigger on `sofa_fabrics`; `tier` changes are now DB-locked to the principal (NULL-role service/migration bypass). The original gap below is resolved.]** — Phase 3 (2026-06-20): a sofa fabric's `tier` (its price band) is gated to principal in the UI + (no API field gate) only; `sofa_fabrics` RLS stays `fabrics_write_internal`, so an internal non-principal hitting `PATCH /api/catalog/sofa-fabrics/:id` directly could re-tier a fabric. The tier-DELTA config + per-model overrides ARE 3-layer principal-locked (0176 RLS `is_principal()` + API 403 + UI); only the tier LABEL on the fabric row isn't DB-locked. Signed-off v1 (0 fabrics in prod today). Defense-in-depth: add a 0175-style trigger on `sofa_fabrics` rejecting non-principal `tier` changes.
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
- `sofa-compartment-armconfig-add-form` — Sofa engine Phase 1 (2026-06-21): the compartment-pool "Add" form in the Maintenance UI doesn't author `arm_config` (rows can carry it via a direct insert / later edit, but the create form omits the field). Wire `arm_config` into the Add form when the field starts being authored from the UI (e.g. once Phase 3's drag-builder needs arm-cap validation per compartment).
- `sofa-engine-roadmap-remaining-phases` (watch) — **Phases 1-5 ALL SHIPPED + LIVE (P5 = the explode cutover, PR #36, 2026-06-23).** The ~5-phase **2990s sofa custom-cell engine** roadmap is code-complete; the engine is **DORMANT in prod (0 compartments authored)**. **Next = the principal authors real compartment data via Maintenance → the engine wakes → live-verify the explode + decide flat-sofa (628 SKUs) coexistence at cutover.** Deferred follow-ons: **recliner** per-seat toggle+pricing (needs a migration `product_models.recliner_upgrade_price`) · **group-drag/rotate** (P3 polish; per-cell drag+snap reconnects fine) · **regroup polish** for SO-grid / SO-PDF / returns (the exploded lines render correctly itemized today; customer-facing `DealerOrderDetail` already regroups) · promo (PWP/GWP) + bedframe.
- `sofa-p4-fabric-tier-trusted` (LOW, open) — P4/P5 trust `attrs.fabric_tier` rather than re-deriving it from `attrs.fabric_id` against `sofa_fabrics.tier`. Exposure bounded to the tier DELTA (à-la-carte + combo base fully reverified). Re-derive server-side from `fabric_id` if it ever bites. Dormant (0 tiered fabrics).
- `sofa-p4-asof-not-pinned` (LOW, open) — `recomputeAndExplodeSofaBuildLines` runs without an `asOf`, so a combo's `effective_from` anchors to server-today; a combo flipping effective between client preview + submit can cause a rare false `sofa_price_drift` reject (self-healing on rebuild; never under-prices). Pin `asOf` to the preview timestamp if needed.
- `sofa-p5-resync-clobber` (LOW) — re-offering a compartment re-asserts the synced sku's `description`/`pos_active=false`/`supplier_id` from the model+pool (canonical by design); a principal hand-edit to those on the compartment sku is lost on the next re-sync. `cost` is correctly preserved (omitted from the upsert). Intended; documented.
- `combo-crud-non-atomic` — Phase 4 (2026-06-20): combo + components insert/replace isn't a DB transaction (no RPC): POST uses a compensating-delete on a failed components insert; PATCH does delete-then-insert with a small no-components window. v1-acceptable (principal-only, low frequency). Defence: a `create_combo`/`update_combo` SECURITY DEFINER RPC if combo churn grows.
- `combo-skupicker-clear-x-a11y` — Phase 4 (2026-06-20): the combo editor's searchable SKU picker clear (X) is a `<span role=button>` without keyboard reachability (cosmetic; the collapsed trigger itself is a real button).
- `combo-submit-payload-test` — Phase 4 (2026-06-20): no test proves `combo_key` reaches the create_order payload through `DealerPos.handleSubmit` (verified by code inspection only); fold a combo-payload assertion into the existing `pos-web-shell-tests` carry-forward.
- `catalog-web-component-tests` — the new Product & Maintenance pages (`apps/web/src/pages/catalog/**`) have no web component/E2E tests yet (API side is covered in `catalog.test.ts`). Add a SkuMaster render + price-readback test, a Modular sizes-cascade test, and an E2E smoke (load page → filter Service → toggle a SKU off → persists after reload).
- `catalog-addon-reenable-by-key` — disabling an add-on removes it from the active-only GET bundle; restore is via re-adding the same key (the form PATCHes `active=true` on the duplicate-key 500). Fine for v1; a dedicated "show disabled add-ons" read would be cleaner if add-on churn grows.
- `pos-live-smoke` — the dealer POS (PR #22) was NOT live-smoked by Claude (POS sits behind a real dealer login on staging; build/typecheck/tests green instead). **Loo to manual-smoke**: login dealer → lands on POS → pick Mattress card → configure → cart → Proceed → customer + date + floor → confirm payment + signature → submit → ThankYou → "View orders" → "New order" returns to POS with draft cleared. Also verify sofa↔mattress mutex + disposal-size gate + ASAP auto-proceed.
- `pos-topbar-outlet-picker` — outlet/salesperson selection stays in the CUSTOMER step (`Step1Customer`); the POS top bar only mirrors the chosen outlet name read-only once set. Reference shows the outlet locked in the header — a top-bar picker (esp. for multi-outlet dealers) is deferred.
- `pos-web-shell-tests` — `CatalogStep` + the pure helpers (`cart`, `catalog-index`, configurators+`ConfigureDrawer`) are unit-covered, but `DealerPos` (3-step state machine + ported `handleSubmit`) and the `DealerApp` layout-route routing have no integration/E2E test. Logic is reused-verbatim, but add a `DealerPos` submit/state-machine test + a routing test (`/dealer`=POS no sidebar, `/dealer/orders`=sidebar) + a Playwright happy-path.
- `pos-folder-rename` — reused building blocks (`draft.ts`, `Step1Customer`, `Step3Delivery`, `Step3SignaturePayment`, `SignaturePad`, `PaymentSlipPicker`, `ThankYou`, `configurators.tsx`) still live under `dealer/new-order/`; new POS components under `dealer/pos/`. `new-order/` is now a misnomer — rename to `order/` once the external imports (`storage.ts`, `PODUploadDialog`, `DOAttachModal` import `draft.ts`/`SignaturePad`) are repointed. Tidy-up only.
- `pos-product-photos` — most `product_models` have no `photo_url`, so POS cards show a branded `▦` placeholder. Wire real photo display when catalog photos are uploaded (the `product-model-photos` bucket + `photoUrl` field already exist from 0171/0173).
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

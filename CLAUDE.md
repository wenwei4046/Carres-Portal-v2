# CLAUDE.md — Carres Portal v2

> **⭐⭐ FOR ANY OPERATION-PORTAL / OPS-PANEL WORK, READ [`docs/OPS-BUILD-BRIEF.md`](docs/OPS-BUILD-BRIEF.md) FIRST.**
> It is the single un-skippable entry point: the 3-track business model (货→送→钱), the
> state vocabulary (5 words — never leak DB stage words), the Manage/pill + date law, and
> pointers to `docs/UI-KIT.md §A0` (the golden reference + new-panel checklist). The Orders
> page is the finished reference; new panels (Payments) copy its shape — do not reinvent.
>
> **You are working on Carres Portal v2.** Read this file fully before any task.
> Master plan lives in `CARRES_PORTAL_V2_PLAN.md` at repo root — read it for any planning, schema, or phase question.
>
> **Before changing ANY page/component in `apps/web`, read and follow
> [`docs/UI-KIT.md`](docs/UI-KIT.md) — the SINGLE design source; do not deviate** (values in
> `apps/web/src/lib/design-standard.ts`). List pages use `<ListPageShell>`; colours come from token
> classes (no hard-coded hex); icons 14/16/17; drawer rows 36px; run
> `pnpm --filter @carres/web lint` before committing UI work.

---

## §0 Panel-work protocol (READ BEFORE ANY DESIGN / PROPOSAL / REDESIGN WORK)

Any new chat asked to design, propose, redesign, critique, or execute on ANY
panel (Orders / Purchase / Payments / Catalog / POS / Stock / any other) MUST
follow these six steps IN ORDER, before writing a single line of code:

1. **READ the relevant section of [`docs/PANEL-PROPOSALS-FOR-REVIEW.md`](docs/PANEL-PROPOSALS-FOR-REVIEW.md)**
   using the `Read` tool. Also open the "Full spec file to attach" that section
   names if a deeper read is warranted. This is the canonical starting point —
   don't re-derive from memory, don't ask Loo to re-explain, read the doc.

2. **PROVE you read it.** Quote **2–3 EXACT lines** (verbatim, in a blockquote)
   from the section back to Loo. No paraphrase. No summary. No quote = no work.
   The `Read` tool call must be visible in the transcript — Loo can check.

3. **RATE the proposal against international benchmarks.** How would a
   world-class equivalent handle this problem? Reference points:
   - UX / product design: Linear, Notion, Stripe Dashboard, Figma, Superhuman.
   - Ops / ERP / procurement: SAP, Odoo, NetSuite, Katana, Cin7.
   - Commerce / retail: Shopify, Square, Lightspeed.
   Grade the current proposal **A–F on each of**:
   (a) clarity of business intent,
   (b) UX for a non-technical, low-English operator,
   (c) data-model soundness,
   (d) international best-practice alignment.
   Show the grades in a small table.

4. **FLAG every weakness explicitly.** Do NOT soften. If a "locked decision"
   in the doc looks wrong to you, say so with reasoning + a concrete better
   alternative. Loo wants a peer reviewer, not a yes-man. Blindly following
   a mediocre spec is a failure mode; call it out.

5. **PROPOSE a superior redesign if you have one.** The proposals in that doc
   are a STARTING point, not scripture — overwriting is welcome and encouraged.
   When you have a better idea, present old vs. new side-by-side (a short table
   or two-column ASCII sketch) and let Loo pick. Never propose more than one
   alternative at a time (see the "no-menus, decide" feedback rule): pick your
   single best redesign, name it decided, invite redirect only if it's wrong.

6. **ONLY THEN execute** — using whichever version Loo greenlights (original,
   your redesign, or a blend). Never skip to code before steps 1–5 land.

**Failure modes that count as breaking this protocol:**
- Claiming "I read the doc" without a `Read` tool call in the transcript.
- Skipping the quote-back (step 2) or the rating table (step 3).
- Softening a real weakness to sound polite (step 4).
- Executing before Loo greenlights (step 6).

Loo's verification: he can look at the transcript for the `Read` call on the
file and the verbatim quote block. Either both are present or you didn't do it,
regardless of what you claim. Same rule applies when the "doc" is any other
locked spec (`ORDERS_LIST_SPEC.md`, `docs/OPS-BUILD-BRIEF.md`, `docs/UI-KIT.md`,
`CARRES_PORTAL_V2_PLAN.md`, `docs/superpowers/plans/*.md`).

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

> ## ⭐ SUPERSEDED (2026-07-16): UI-KIT v4 is the single visual baseline
>
> **Before ANY UI work, read [`docs/UI-KIT.md`](docs/UI-KIT.md)**
> (white base · colour = action/selection/status/alert only · Inter weight-layered
> 24/20/16/15/14/12 · slashed-zero mono for numbers/codes ONLY, never words ·
> 44px fixed rows · §11 decision table closes every ambiguity: cool-neutral canvas
> `#F3F4F6`, DARK 12/600 headers, `#6B7280` icons, ONE 11px pill spec).
> The Orders list table is THE template — copy its row anatomy for every listing.
> **Before committing UI changes run `pnpm --filter @carres/web run check:v4`**
> (it also gates the build). Machine mirror = `apps/web/src/lib/design-standard.ts`.
> Everything below (v17) is the historical record — v4 wins on any conflict.

**~~Visual design source of truth = v17 (locked 2026-06-09), NOT the warm-linen prototype.~~** The `reference/proto/*.jsx` files remain the source of truth for **layout + behaviour** (what goes where, which buttons / modals / columns exist), but the **visual tokens are v17**: clean modern SaaS + Carres warmth. Token NAMES are unchanged (`base-*`, `primary`, `accent`…) so components re-theme with zero churn — only the values flipped.

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

### 17.1 Current state (as of 2026-07-25)

> **Detail policy**: this table holds POINTERS + the latest live IDs only. Full narrative for
> every ship → [`docs/phase-10-worklog.md`](docs/phase-10-worklog.md); the pre-slim §17 full
> text (migration chain 0165-0241 histories, every prior deploy) → `docs/claude-md-archive-2026-07-25.md`.
> Keep it this way: when updating a row, REPLACE its content — do not prepend "Prior — …" chains.

| | |
|---|---|
| Active work | Phase 10 post-launch + parallel initiatives. Latest ships (2026-07-25): **HR Team hierarchy P1** (PR #276, 0254 — Team tab = org registry + THE account door; Phase 2 = 权限接 hierarchy, email 名单退役) · **Rental + Service Plan BASE** (PR #268, migrations 0247-0249+0253, all DORMANT) → **segment ① POS Rent-to-Own sell lane + Stripe subscription wiring SHIPPED + LIVE** (PR #275, migration **0255 applied**; next = author a pilot plan in P&M → Rental + one RM59 end-to-end signup, then ② billing engine + ①b order-side entitlement attach) · **HR role + Commission portal** (0244-0246) · **BD commission** (0250-0252). 2990s Products 9-tab parity COMPLETE (P1-P8, PRs #38-#45, 0181-0188, dormant until authored). Sofa compartment engine LIVE (P1-P5; 10 sofa models live 2026-07-24). |
| Project started | 2026-05-02 |
| Web URLs | https://carres-portal.pages.dev · POS/ERP domain split (2026-07-18): `pos.carresofficial.com` (dealer/showroom/bd) + `erp.carresofficial.com` (internal); TWO Pages projects (`carres-portal` + `carres-pos`), ONE build |
| API URL | https://carres-portal-v2-api.wwch.workers.dev (+ api.carresofficial.com) |
| DB | staging Supabase = prod, project_id `kfprgpjpaffedghytstl` |
| Latest migration | **Applied tail = 0256** (verified at apply 2026-07-25): 0254_hr_team_hierarchy (hr line) · **0255_replace_order_lines** (line EDIT RPC, renumbered from 0254 — hr took it first) · 0255_rental_sell_lane (rental line; dual-numbered FILE vs ours — cosmetic, tracker keys on timestamp) · **0256_replace_order_lines_promo_parity** (gift/pwp marker admits, same-signature REPLACE). **Rules that survive**: (1) before numbering ANY migration, `list_migrations` the remote tracker tail first — guardrail #8; collisions renumber at apply (0239/0241/0254/0255 lessons). (2) Migrations apply manually via MCP; tracker keys on timestamp, so dual-numbered FILES (0165/0166/0233/0241/0255…) are cosmetic — never renumber applied files. (3) Full per-migration history → archive doc + worklog. |
| Catalog state | 11 suppliers · 171 product_models · ~1150 product_skus (1013 AutoCount + SVC + minted compartment skus; 123 compartment skus flipped ON 2026-07-24, mostly RM0 pending pricing). Bundles: 1 active (King Bedroom Set RM2500). PWP/free-gift/delivery-fee/rental config tables exist, dormant until authored. |
| Orders state | ~190 orders (153 AutoCount archive + natives). `dealers.channel` is THE showroom-vs-dealer authority (PR #226). |
| Test count | Baselines + pre-existing fails → §17.7. Run full suites before merge; ZERO new failures is the bar. |
| Web bundle | **LIVE = `index-DD_5TYgd.js` from main tip `7787593`** (PR #283/#285/#288 arc — POS order-detail full description, final form = ONE muted config line `variant · gap · Divan 8" · …`, no SKU row, no per-item RM; SO PDF keeps multi-line subs; carres-portal `f5bb61fd` + carres-pos `2beecda7`; all 4 canonicals verified — pos.pages.dev edge lagged ~1 min; dist `SERVICE_ROLE` grep 0). **Deploy rules (Loo, permanent)**: NEVER deploy prod from a feature branch — merge to origin/main, deploy from the main tip; before ANY Pages deploy `git fetch` + `git log HEAD..origin/main` must be empty (union tip), deploy to BOTH Pages projects `--branch=main`, RE-curl all 4 canonicals after (~15s edge lag); a piped `curl \| grep` on the ~4 MB bundle truncates and reports a FALSE 0 — download to a file before grepping markers. bundle-size CF still open (§17.5). |
| API bundle | **LIVE = Worker `5a0659a1` from main tip `3f4fc05`** (PR #277 `POST /api/orders/:id/lines/replace` + promo-parity guard; unauth 401 live-verified; union carries #275 rental api; untouched by web-only #283). Same union-tip rule as web. |

### 17.2 Phase timeline

> One line per phase/initiative. Full narratives → `docs/phase-10-worklog.md` + `docs/claude-md-archive-2026-07-25.md` + the plan docs in `docs/superpowers/plans/`.

| Phase / initiative | Status | Closed | PR / migrations |
|---|---|---|---|
| 0 Setup · 1 Schema+RLS perf · 2 Dealer · 3 Principal · 4/4.5 Operation · 5 Finance · 6 Supplier · 7 Partner · 8 Showroom+BD · 9 Production cutover | ✅ | 2026-05-02 → 05-10 | tags `phase-N-complete` |
| 10 Post-launch | 🔵 in progress | from 2026-05-11 | §17.3 work-log |
| 11 Proceed Date + state collapse (operation_stage 7→6) | ✅ | 2026-06-14 | PR #15 · 0165-0168 |
| Catalog "Product & Maintenance" rebuild | ✅ | 2026-06-15 | PR #19 · 0169-0173 |
| SO Maintenance grid (later DELETED 2026-07-12, PR #146) | ✅ | 2026-06-16 | PR #21 · 0174 |
| Dealer catalog-first POS | ✅ | 2026-06-16 | PR #22 |
| POS 2990s alignment: re-skin + cost/sell split + fabric-tier + combo | ✅ | 2026-06-20 | PR #25/#27 · 0175-0177 |
| Sofa compartment engine P1-P5 (pool → pricing → drag builder → trust gate → explode cutover) | ✅ LIVE | 2026-06-21 → 06-23; data live 07-24 | PR #29/#31/#33/#35/#36 · 0178-0179 |
| Principal portal orders (on-behalf POS + trace) | ✅ | 2026-06-25 | PR #37 · 0180 |
| 2990s Products 9-tab parity P1-P8 (SKU import · polish · special add-ons · pools · combo cost · RuleTarget+delivery fee · free gifts · PWP+Promo) | ✅ COMPLETE | 2026-06-24 → 06-28 | PR #38-#45 · 0181-0188 |
| July order-entry window (order_payments ledger · voucher binding · staff PIN · proceed lane · operation costing …) | ✅ | 2026-07 | 0189-0229 · worklog |
| POS entry fixes (structured address + config-driven payment) | ✅ | 2026-07-18 | PR #173 · 0230 |
| Add-product initiative P1-P3 (first post-create order_lines write path; place-lane add + engine pipeline + change-request approval) | ✅ | 2026-07-18 | PR #174/#179/#183 · 0231-0233 |
| Bundle pricing (N SKUs @ one price, Σ-exact explode) | ✅ | 2026-07-19 | PR #208 · 0239 |
| Showrooms split from Dealers (`dealers.channel` = authority) | ✅ | 2026-07-19 | PR #226 |
| BD portal = the POS | ✅ | 2026-07-19 | PR #225 |
| HR role + Commission portal (staff + BD commission calc) | ✅ base | 2026-07-25 | 0244-0246 · 0250-0252 |
| Rental + Service Plan (rent-to-own; BASE shipped, dormant; next = POS sell lane + Stripe) | 🔵 BASE live | 2026-07-25 | PR #268 · 0247-0249+0253 |
| HR Team hierarchy P1 (org registry + CRnnn staff codes + Team = THE account door; P2 = 权限接 hierarchy) | ✅ P1 live | 2026-07-25 | PR #276 · 0254 |

### 17.3 Phase 10 work-log

> **INDEX ONLY — one line per session.** Full chronological detail → [`docs/phase-10-worklog.md`](docs/phase-10-worklog.md);
> entries shipped before 2026-07-25 whose full text never made it into the worklog are preserved verbatim in
> `docs/claude-md-archive-2026-07-25.md`. **New sessions: append the full entry to the worklog doc + ONE index line here.**

- **2026-05-11** · Day 1 bug sweep (0083-0086) + supplier DO photo (0094). **Durable heuristic: customer-leg (`order_supplier_threads.delivery_partner_id`) vs procurement-leg (`purchase_orders.procurement_partner_id`) confusion is THE partner-bug source — ASK WHICH LEG.**
- **2026-05-15** · Delivered-tab bug (0106) · per-thread + multi-DO partial pickup (0107-0111) · pre-alpha DB cleanup (Loo, manual)
- **2026-05-17/18** · role rename logistics→operation (0121, ~250 files) · dl→so rename (0123-0126) · per-line threads (0124) · warehouse_id propagation (0127) · cascade audits (0128-0131) · principal sidebar 5 pages
- **2026-05-20 → 06-05** · AutoCount import + per-unit stock (0132-0137) · Incoming forecast fix + Ohana rename (0148-0150) · e-sign/auto-dispatch/per-unit ID (0151-0154) · multi-leg delivery chain + 4 LPs (0155-0158, PR #9-12)
- **2026-06-08 → 06-12** · Master-Sheet arc: Orders control grid + ops cockpit + Payments panel (0159-0166, spec [[project-orders-control-spec]]). **Ops notes/tasks tables hold Jess's REAL data — never bulk-delete as test data.** Storage rule locked: MS/BF RM150/month · SOF RM200/2-weeks (`computeStorageFee`).
- **2026-06-12 late** · Pending jobs P1-P3+P8 (Items qty tags · compact columns · delivery_date sort · bulk-complete tests)
- **2026-06-14/15/16** · Catalog P&M rebuild (PR #19) · SO Maintenance (PR #21) · dealer catalog-first POS (PR #22)
- **2026-06-20/21/23** · POS 2990s alignment P1-P4 (PR #25/#27, 0175-0177) · Sofa engine P1-P5 (PR #29-#36, 0178-0179)
- **2026-07-16** · Operation Catalog — costing view (0226)
- **2026-07-18** · POS/ERP domain split (CORS allowlist) · Staff PIN login (PR #182, 0233) · New Order raw single-page form (PR #175-#181/#185/#187) · POS entry fixes (PR #173, 0230) · Add-product P1-P3 (PR #174/#179/#183, 0231-0233)
- **2026-07-19** · Showroom minimal account creation (PR #206) · Bundle pricing (PR #208, 0239) · POS owner self-service + email-change approval (PR #204, 0240) · Staff profile + one-step PIN + **English-only UI rule** (PR #209, 0241) · Showrooms split + stores born active (PR #226 — **LESSON: run the BUILD, not just `tsc`; default tsconfig ≠ tsconfig.app.json**) · BD portal = the POS (PR #225) · Staff Edit (PR #216) · HQ Accounts parity + manual passwords (PR #219) · birthday drum picker (PR #221) · staff roster hierarchy sort (PR #222). **RULE (Loo): NEVER deploy prod from a feature branch.**
- **2026-07-24** · Offer = on sale — compartment first-insert `pos_active=true`, 123 rows flipped, 10 sofa models live (PR #253) · Catalog tabs in sidebar (PR #251, superseded next day)
- **2026-07-25** · Catalog two-doors split (PR #254) · PIN sign-in outlet switch (PR #256) · **HR role + Commission portal** (0244-0246) · **BD commission** (0250-0252) · Carres outlet-name prefix (PR #258) · My-orders board Store→Outlet→Salesperson cascade (PR #259) · BD sees dealers only (PR #262) · **Rental + Service Plan BASE** (PR #268, 0247-0249+0253; also `docs/rental-service-plan-proposal.md`)
- **2026-07-25 late** · **HR Team hierarchy P1** (PR #276, 0254, worktree `hr-hierarchy`) — Team tab = org registry (3 bands) + CRnnn staff codes (CR001-CR009 backfilled) + reports_to + 职位更替 history + **Team = THE account door** (principal Accounts 门收窄到 dealer/showroom 店户口); 顺手修 meResponseSchema 漏 'hr' 的 live bug; STAFF_TIER_RANK 移入 shared
- **2026-07-25 (late)** · My-orders board speaks SO numbers (`#1256`→`SO-1256` on drawer/card/overlay/Stripe modal + WhatsApp copy) + View sales order button in every drawer-footer lane (PR #273, web-only, deployed same session)
- **2026-07-25 (later)** · **Rental segment ① — POS Rent-to-Own sell lane + Stripe subscription wiring** (PR #275; 0255 DRAFT unapplied [renumbered from 0254 — the hr line took 0254_hr_team_hierarchy]; sell RPC + stripped POS view + plan→Stripe sync + subscription checkout/schedule/webhook + POS lane UI)
- **2026-07-25 (latest)** · **Order line EDIT, up-sell only + POS promo parity** (PR #277, 0255_replace_order_lines + 0256 promo parity, worktree `fix-myorders-so-number`) — pencil per place-lane item reopens the configure surface seeded (bed via PosConfigurePage, sofa group reconstructed onto SofaConfigurePage); replace pipeline = add pipeline; RPC-enforced `downsell_blocked`; GWP re-deal wizard-style; code-less PWP under one-promo policy; NEW `promo_entitlement_broken` guard (edit may never un-back rewards/vouchers); before-image in order_history (guardrail #4)
- **2026-07-25 (night)** · **Full product description on order detail + SO PDF — cart parity** (PR #283, web-only, worktree `order-detail-line-description`) — PosOrderDetail items now render variant·gap/color/fabric + mono SKU row + the cart's own `SpecialsSummary` (Divan/Leg/specials/remark); SO PDF prints the same option/special/remark sub-lines via new `optionSpecialSubs()`
- **2026-07-25 (night ②)** · **Proceed-lane item CHANGE submissions + service add-ons on the add doors** (PR #287, 0257, worktree `order-change-edit`) — proceed lane gets the 0255 pencil, Save files `order_change_requests` kind='replace_lines', approval applies via `replace_order_lines p_source='change_request'` (up-sell law kept; NEW `line_in_production` gate — threads are ON DELETE CASCADE, so thread-virgin targets only); Services chip in AddProductOverlay adds the wizard's order add-ons post-create in both lanes (`p_addons_append`, server-priced from `addons` config). **Apply 0257 BEFORE deploying the Worker.**

### 17.4 Business model (locked 2026-05-03)

- Dealer just sells. Customer pays HQ direct. No HQ→dealer credit/debt.
- Outstanding column = customer-owe-HQ (dealer chases for 50% top-up gate).
- Phase 4 (Operation) + Phase 6 (Supplier) are HQ INTERNAL roles, NOT dealer-side.


### 17.5 Open carry-forwards

> **INDEX ONLY.** Full text of every CF (context, repro, firm fix) → [`docs/carry-forwards.md`](docs/carry-forwards.md) — that
> file is the living doc: new CFs get their full entry THERE + one index line here; closures are marked there and removed here.

**HIGH**:
- `phase-10-rotate-alpha-test-passwords` — 9 alpha users at password='111'; rotate via PrincipalAccounts UI before external sharing.
- `phase-9-rotate-principal-password` — principal@carres.com still at '111'; PDPA exposure up to RM 300k.

**MEDIUM** (touch the area → read the full entry first):
- `rental-billing-writes-need-rpc` — billing engine phase MUST gate rental money writes behind a DEFINER RPC + history (blanket `is_internal()` today; fine while dormant).
- `rental-first-month-vs-billing-row` — Stripe collects month 1 at checkout but `rental_billings` seq 1 stays `due` until ②'s invoice.paid engine (catch up by stripe_invoice_id).
- `rental-billing-anchor-drift` — our schedule anchors on start_date, Stripe on checkout completion; ② reconciles by stripe_invoice_id.
- `rental-agreement-store-read` — store JWTs can't read agreements yet (sell lane holds the RPC payload; checkout = service client + explicit Hono ownership); "My rentals" list needs a dealer-scoped RLS read later.
- `rental-plan-reprice-policy` — re-price archives the old Stripe Price; unlinked old-fee agreements block checkout (422 plan_repriced); live-agreement re-pricing is a ②+ policy call.
- `bd-network-board-page-cap` — BD board month cards read ONE orders page; under-counts once the network outgrows it.
- `orders-channel-filter-outlet-id-proxy` — ops orders `channel=` param is a dead, inverted `outlet_id` proxy; filter on `orders.channel` when wiring it.
- `principal-dealers-join-unbounded` — outlet roll-up reads unbounded; silently truncates past PostgREST max-rows (1000).
- `bundle-pwp-gwp-stacking` — bundle component lines still trigger PWP/GWP on top of the bundle discount; policy call for Loo.
- `staff-order-mutation-scope` — order MUTATION routes not staff-tier-narrowed (PIN = workflow, not security, by design).
- `staff-wizard-claim-preprovisioned` — setup wizard always CREATES a staff row; pre-provisioned managers duplicate.
- `staff-salesperson-user-id-provisioning` — future salesperson email logins start unlinked (unscoped until linked by hand).
- `combo-cost-pos-bundle-exposure` — principal-only cost fields ride the catalog bundle to POS clients (devtools-readable).
- `delivery-followup-integrity` — cross-order follow-up single-use backstop is a soft attrs read, not a unique constraint; phone-less source bypasses identity check.
- `delivery-fee-semantics-notes` — 3 intentional semantics (special fee = max-wins; charged-filtered cross; variant text match) — document for principal at go-live.
- `free-item-sofa-build-disallowed` — "Make free" rejected on sofa-BUILD lines (drift gate would 422).
- `free-gift-route-configured-test` / `delivery-route-configured-test` — configured-path POST integration untested (orders-mock limitation; unit-covered).
- `combo-component-price-availability` — non-pos_active combo component priced 0 in the split (total stays exact).
- `catalog-server-null-supplier-po-guard` — null-supplier Create-PO guard is FE-only; add server-side reject.
- `add-lines-pwp-one-promo-policy` — ONE promo application per order via add; voucher-coded claims wizard-only.
- `add-lines-delivery-rederive` — an add re-derives delivery fee from CURRENT config; a raw order can gain a fee on first add once rates go live.
- `change-request-midproduction-approve` — approving a change request mid-production is allowed by design; lines enter ops as new shortages.
- `topup-method-ledger-check-mismatch` — align the 0193 ledger method CHECK before any config-keyed method reaches it.
- `phase-10-supplier-pos-list-urgency-blank` · `phase-10-abandon-cascade-to-po` · `phase-10-cogs-real-source` · `phase-10-opex-real-source` · `phase-10-csv-bulk-import` · `phase-10-partner-pickup-rpc-regression-guard` · `phase-10-operation-to-thread-cascade-audit` · `phase-10-incoming-server-side` · `phase-10-customer-pod-upload` · `phase-10-test-lp-confirm-flow` · `phase-9-pdf-storage-persistence` · `phase-10-historical-doc-vocab-mismatch` · `phase-10-bundle-size-regression` · `phase-10-issuance-groups-test-coverage` · `phase-10-shortage-by-so-test-coverage` · `phase-10-multi-leg-pod-upload` · `phase-10-smart-partner-suggest` — pre-2026-06 backlog; full text in the doc.

**LOW**: ~30 entries (rental/bundle/sofa/POS polish, test coverage, doc vocab, deferred renames) — slugs + full text in [`docs/carry-forwards.md`](docs/carry-forwards.md). Notable: `sofa-engine-roadmap-remaining-phases` (engine LIVE; deferred: recliner, group-drag, promo, bedframe) · `phase-11-deploy-verify-branch-has-latest` (pre-deploy `git log HEAD..origin/main` check) · `pos-live-smoke` (Loo manual smoke list).

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
- **web**: `OperationOrders.test.tsx` (7 fails) — drawer action-bar tests; arrived with the July window (pre-existing on main BEFORE 2026-07-18's work; reproduced on clean origin/main)
- **web**: `OrderCustomerCard.test.tsx` (4 fails) — arrived with the July window (pre-existing on main BEFORE 2026-07-18's work; reproduced on clean origin/main)

**Baseline as of 2026-07-18** (verified repeatedly on clean origin/main): api **3** (supplier/pos ×2 + partner/pickups ×1, unchanged) + web **16** (OperationOrders ×7 + OrderCustomerCard ×4 + OhanaSofaTab ×4 + NiceFutureMattressTab ×1). Full-suite counts: shared **775/775** · api **1226/1229** · web **1245+/1261+** (16 pre-existing).

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

## PRE-GOLIVE GUARDRAILS (until NETS live ~Jul 30)

1. RLS VERIFY: NETS role permissions must be enforced in Supabase
   RLS policies, not only hidden in UI. Any change touching orders/
   payments tables: confirm RLS policy exists and state which one.
2. KNOWN BUG: delivered/completed orders must NOT show red overdue
   countdown. If touching countdown/deadline code, fix or flag this.
3. PAGINATION: orders list currently caps ~200 rows. Do not build
   new features assuming full list is loaded.
4. NO SILENT MONEY EDITS: line prices/totals must not be editable
   without an activity log entry. Flag any code path that allows it.
5. CONCURRENCY: multiple users edit same order from Jul 20. When
   writing update logic, prefer explicit updated_at checks; warn me
   if a code path is last-write-wins on critical fields.
6. WORKTREE RULE: Activity workstream must not touch
   OrderDetailDrawer.tsx while Batch 3 is active.
7. After any bug fix: explain root cause + what else it touches,
   in plain language, before I accept.
8. MIGRATION DRAFTS: never write draft SQL into
   supabase/migrations/ before Jess approves — drafts go in chat or
   docs/. Before numbering any migration, check the remote tracker
   tail first (shared prod, parallel sessions).
9. ONE WORKTREE PER WORKSTREAM: parallel sessions must not share a
   checkout. Before starting work, confirm which worktree/branch
   this session owns. RLS/security work, orders-list (C2),
   order-detail (Batch 3), and activity each get their own.

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

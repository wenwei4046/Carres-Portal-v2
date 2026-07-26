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
| Latest migration | **Applied tail = 0281_rental_collection_ledger** (2026-07-26, 收钱引擎 ②a): the rental money loop CLOSES. `rental_due_dates()` = Loo's calendar (seq 1 = signup day, seq 2..N = the 7th of each month, first anchor strictly after signing and never within 7 days) mirrored by `rentalDueDates()` in shared; `rental_approve_agreement` switched onto it and now REFUSES a schedule whose rows do not sum to the contract value; `rental_record_payment` is the ONLY writer of `rental_billings` (split computed server-side, idempotent by `stripe_invoice_id`, history every write, finance/principal or service_role) — closes CF `rental-billing-writes-need-rpc`; a BEFORE DELETE trigger makes a collected month undeletable by any path incl. cascade; ONE `rental_billing_events` table written from the first ringgit that ②b's dunning steps land in later. Prior: 0280 delivery photos · 0279 rental signature · 0278 HR staff comp · 0277 delivery two-stage booking. **Rules that survive**: (1) `list_migrations` the tracker tail immediately before numbering AND again before applying. (2) Migrations apply manually via MCP; never renumber APPLIED files, but DO renumber an unapplied draft. (3) Reconcile the FILE back to live after apply by comparing `md5(prosrc)` + length per function — do not eyeball it. (4) **An assertion that RAISEs inside its own `EXCEPTION WHEN sqlstate` handler catches itself and proves nothing** — set a flag, check it outside the handler. (5) **The dry-run payload must contain EVERY object the migration changes** — omitting one silently tests the OLD body (this cost a round on both 0279 and 0281; diff the CREATE/ALTER list against the payload before sending). (6) `revoke execute … from anon` alone does NOTHING and `from public` alone does nothing either — the pair PLUS an explicit grant back, asserted both directions in the migration's own sanity block. (7) Inside a transaction, read `audit_log` rows back by `ref`, never by time. |
| Catalog state | 11 suppliers · 171 product_models · ~1150 product_skus (1013 AutoCount + SVC + minted compartment skus; 123 compartment skus flipped ON 2026-07-24, mostly RM0 pending pricing). Bundles: 1 active (King Bedroom Set RM2500). PWP/free-gift/delivery-fee/rental config tables exist, dormant until authored. |
| Orders state | **55 orders** (counted live 2026-07-26 — the old "~190 / 153 AutoCount" figure predated the 2026-06-24 catalog/data reset and was stale): **18 native POS orders, ALL 18 attributed**, + **37 `source_system='autocount'` archive rows** imported 2026-07-23, all unattributed and all carrying RM 0 of line value. That split is why HR-P3 was cut and why 0265 excludes archive from the attribution worklist. `dealers.channel` is THE showroom-vs-dealer authority (PR #226). |
| Test count | Baselines + pre-existing fails → §17.7. Run full suites before merge; ZERO new failures is the bar. |
| Web bundle | **LIVE = `index-C-BnjmmM.js` from main tip `0aa75a88`** (PR #387 rental collection engine; carres-portal + carres-pos both `--branch=main`; all 4 canonicals converged, `pos.carresofficial.com` lagged one poll as usual; downloaded 4,234,736 bytes, `SERVICE_ROLE` grep 0, four markers from MOUNTED components present). **Deploy rules (Loo, permanent)**: NEVER deploy prod from a feature branch — merge to origin/main, deploy from the main tip; before ANY Pages deploy `git fetch` + `git log HEAD..origin/main` must be empty, deploy to BOTH Pages projects `--branch=main`, RE-curl all 4 canonicals and POLL until they converge. **A canonical serving a DIFFERENT hash is usually the OLDER bundle still cached** — `wrangler pages deployment list` names the true last writer, then `git merge-base --is-ancestor <theirs> <yours>` proves containment. A piped `curl \| grep` on the ~4 MB bundle truncates and reports a FALSE 0 — download to a file first. **Pick proof markers from MOUNTED components**: a string from a retired page is correctly tree-shaken and greps 0. bundle-size CF open (§17.5). |
| API bundle | **LIVE = Worker `63fca88d` from main tip `0aa75a88`** (PR #387 — `invoice.paid` → the collection ledger, the signup month recorded at checkout completion, the Stripe one-time-line + trial-anchor composition, and the two `/collections` routes; deployed AFTER 0281 was applied. Unauth 401 verified on both new routes via the custom domain). **The api deploy is `wrangler deploy --env production`, NEVER bare `wrangler deploy`** — both stanzas share `name = "carres-portal-v2-api"`, so a bare deploy overwrites production with the default env: `PUBLIC_WEB_URL=http://localhost:5173` (where Stripe Checkout would return customers) and NO `api.carresofficial.com` route. Done by accident once and corrected within a minute; **wrangler echoes the bindings it deployed — read them, they are the receipt.** Same union-tip rule as web. |

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
| HR Team hierarchy P1 (org registry + CRnnn staff codes + Team = THE account door) | ✅ P1 live | 2026-07-25 | PR #276 · 0254 |
| **HR-P2 权限跟着职位走** (duty keys retire the 3 email hardcodes; Permissions matrix in Team tab; legacy fallback for ONE release) | ✅ LIVE | 2026-07-26 | PR #312 · 0260 |
| **HR-O1 Overview** (HR lands on "what needs me today"; imported archive stops counting as a worklist item) | ✅ LIVE | 2026-07-26 | PR #319 · 0265 |
| HR full-system roadmap: **P2 → O1 → P4 → P5 → P6 → P7 ALL SHIPPED 2026-07-26**. P3 cut; **P8 (roster/presence/leave) DROPPED by Loo 2026-07-26 at the design stage — never started, nothing to remove**; O4 remains open but SHRINKS without leave (profile + statement only). Statutory payroll excluded forever. | ✅ P2-P7 live | 2026-07-26 | `docs/hr-system-full-spec.md` · PR #309-#311 |
| **HR-P5 commission runs** (close → freeze → CSV; the close is a 4-check pre-flight, adjustments land on the open month, the lock guards attribution + back-dated rates) | ✅ LIVE 2026-07-26 | 2026-07-26 | PR #351 · 0272-0273 · mock artifact `8ae26a6b` |
| **HR-P4 employee master** (People = one record per CR-coded human; identity read through the join, never copied; Employment vs Access as two columns; PDPA reveal-with-audit; HR may disable a login) | ✅ LIVE 2026-07-26 | 2026-07-26 | PR #341 · 0269 · mock artifact `394c5157` |
| **HR-P7 people cost** (salary register + cost view; commission structurally separate; the ratio refuses to print on a partial month) | ✅ LIVE 2026-07-26 | 2026-07-26 | PR #368 · 0278 · mock artifact `567cd7ec` |
| **HR-P6 targets + scoreboard** (2 tables not the spec's 4; scope ladder cut from 5 rungs to person\|store; manager view ships OFF with the gap named) | ✅ LIVE 2026-07-26 | 2026-07-26 | PR #359 · 0276 · mock artifact `e9d96403` |
| **Guarantee packages** (6th SKU category — RM150 Mattress Guarantee, 15y, one-for-one swap; entitlement ledger + POS covered-item picker + invoice block + claim desk) | ✅ LIVE 2026-07-26 | 2026-07-26 | PR #314 · 0261-0263 · `docs/guarantee-package-spec.md` |
| **Rental Approver gate** (the T&C credit-assessment clause: agreement born `pending_approval`, nothing materialised until finance approves, Finance → Rental Approver tab) | ✅ LIVE | 2026-07-26 | PR #337 · 0268 · worklog ⑭ |
| **Delivery Module D1 — two-stage booking** (Provisional = carrier's date, Confirmed = CUSTOMER's date+slot with evidence; gates server-side; frozen spec D2-D6 pending) | ✅ LIVE | 2026-07-26 | PR #360 · 0277 · `Carres_Delivery_Module_Build_Prompt.md` |
| **Rental signature capture** (the POS asked for a signature and threw it away; an agreement is now BORN signed, and approve refuses an unsigned one) | ✅ LIVE | 2026-07-26 | PR #378 · 0279 · worklog ㉓ |
| **Rental collection engine ②a** (the schedule speaks the 7th and asserts its own sum; `rental_billings` finally has ONE writer; a collected month is undeletable) | ✅ LIVE | 2026-07-26 | PR #387 · 0281 · worklog ㉔ |

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
- **2026-07-25 (night ②)** · **Proceed-lane item CHANGE submissions + service add-ons on the add doors** (PR #287, 0257, worktree `order-change-edit`) — proceed lane gets the 0255 pencil, Save files `order_change_requests` kind='replace_lines', approval applies via `replace_order_lines p_source='change_request'` (up-sell law kept; NEW `line_in_production` gate — threads are ON DELETE CASCADE, so thread-virgin targets only); Services chip in AddProductOverlay adds the wizard's order add-ons post-create in both lanes (`p_addons_append`, server-priced from `addons` config). Applied 0257 → then Worker `f0683137` + web `index-B7Mkk_RD.js` (merge `48de6a3b`).
- **2026-07-25 (night ③)** · **Service add-on rows editable** (PR #291, 0258 applied + deployed same session, worktree `order-change-edit`) — pencil on dispose/service order_addons rows in BOTH lanes (place = direct `edit_order_addon`; proceed = kind='edit_addon' change request); qty ≥ current (up-sell law), 0242 per-unit size law re-validated vs live config, DELIVERY* locked. Worker `4404af26` + web `index-CC9gQUto.js` (merge `ec3cafd1`).
- **2026-07-25 (night ④)** · **SO PDF description = drawer's one-line formula** (PR #293, web-only) — `lineConfigBits` shared via special-addons-picker; PDF prints ONE muted config line (no point form / per-item RM), sofa rows keep `sofa_spec`, addon size loses the `Size:` prefix. Bundle `index-BYxwMJyA.js` (merge `c3ac251e`).
- **2026-07-26** · **Clickable Customer sub-step pills** (PR #297, web-only) — pills are buttons; backward free, forward walks the same gates as Next (`canAdvanceAt`); bundle `index-Cuu6viJe.js` (merge `2be6da75`).
- **2026-07-26 ②** · **CARRES wordmark = home button** (PR #299, web-only) — logo click returns to the catalog (draft kept mid-wizard; full New-order reset on the Thank-you screen). Bundle `index-_N6HZi_7.js` (merge `688c9ddf`).
- **2026-07-26 ③** · **Configure pages carry the POS topbar strip** (PR #301, web-only) — wizard-opened PosConfigurePage/SofaConfigurePage swap the ← arrow for the CARRES logo + crumb strip (logo = back); non-wizard contexts keep the arrow. Bundle `index-BEoh8CxQ.js` (merge `d9f96641`). **Follow-up PR #303**: the strip moves to its OWN 48px row (`cfg-wizardbar`) — inlining it overlapped the dense sofa header (Quick pick unclickable); bundle `index-C5MTuAHF.js` (merge `a318fb46`). **Follow-up PR #305 (Loo, 2990s ref)**: SOFA page reverts to ONE row — compact brand (logo+store, no step pills) + restored ← arrow; bed page keeps the own-row strip. Bundle `index-DEPvhmWd.js` (merge `b1c32303`). **Final PR #307**: sofa page reverts to the ORIGINAL arrow-only header (zero slack in that row — two overlap rounds); brand strip = bed/mattress page only. Bundle `index--fYb_hd5.js` (merge `4bb9dc64`).
- **2026-07-26 ㉓** · **HR-P7 people cost** (PR #374 merge `c1f8b0d9`, 0278 applied, Worker `dc730db8` + web `index-B3tXaG7G.js` — DEPLOYED; worktree `hr-hierarchy`) — what the team costs, per month. **Loo's ruling "separate, don't merge" is STRUCTURAL**: `PeopleCost` carries `fixedCost` and `commissionCost` and has no field summing them, guarded by a test (commission is a VARIABLE cost — folding it into fixed salary makes "average cost per person" meaningless and makes a good sales month look like cost inflation). **The finding that shaped the screen**: every order in the database sits in **2026-07-21..26 — six days of a 31-day month**, so a full month of salary over that revenue would print a ratio saying a profitable store is collapsing. The ratio is therefore withheld while a month is in progress, with the coverage stated on screen; it appears by itself, nothing to switch on. HQ cost is **never allocated across stores** (same law as P6 refusing to split a store target across heads) — there is no allocation function. The design-standard check also caught a real design error, not just a hex literal: the composition bar used decorative hues, which UI-KIT rule 2 reserves for action/selection/status/alert — it is greyscale now. Also corrected a figure I had reported: "52 native July orders" was a `count(*)` across a join to `order_lines`; the real count is **19**. Full entry → worklog.
- **2026-07-26 ㉒** · **HR-P6 targets + the scoreboard** (PR #359 merge `2ad24013`, 0276 applied, Worker `abff79eb` + web `index-DtlbnO4w.js` — DEPLOYED; worktree `hr-hierarchy`) — a scoreboard built on the rungs that actually exist. **Cut the ratified spec from 4 tables to 2 after measuring live**: the 5-rung scope ladder (person>store>position>department>band) has 2 sellers in 1 store, so 3 rungs can never resolve and a department-scoped SALES target is meaningless for the 3 HQ departments that have no revenue; `kpi_definitions` as a config table contradicts the spec's own risk #4, so the metric list is a shared constant mirrored by a CHECK; `kpi_bonus_tiers` not built (a second money path before the first has a single rate). **The rollup was unbuildable as specced** — it routes floor staff via "the seat holding the Sales-Manager duty over that store", but there is no `sales_manager` duty key and `org_position_duties` has NO store dimension; live there is exactly ONE `reports_to` edge in the company and it connects two people with zero sales, so shipping it would have told the COO her team sold RM 0 while her store sold RM 52,081. Manager view therefore ships **Off** with the reason and the one-column fix (`dealers.manager_user_id`) on screen. **Corrected my own review finding**: I told Loo a closed month would read the frozen `basis`; `commission.ts` only accumulates `basis` in the PERCENTAGE branch, so a per-model store freezes 0 — the O1 `totalBasis` trap. Sold is now ONE shared computation for open and closed alike, and P6 shows no commission so it cannot contradict a statement. Full entry → worklog.
- **2026-07-26 ⑪** · **HR-P5 commission runs** (PR #351 merge `e657f282`, 0272+0273 applied, Worker `2cf891df` + web `index-A7uOnzQ8.js` — DEPLOYED) — close a month, freeze the statement, one CSV to payroll. **The live finding that reshaped it**: July has RM 52,081 sold by 2 people and **zero commission rates configured**, so the spec's plain Close button would have frozen "you earned RM 0" permanently and then locked the month against fixing it. The close became a 4-check pre-flight (`commissionReadiness`, a PURE function the UI, the API and SQL all enforce). **No second engine, made structural**: `/api/hr/report` and close now share `lib/commission-month.ts`, so reviewed figures and frozen figures come from the same call. Adjustments key to the OPEN month with an origin pointer, not to a run. Lock guards attribution (programmatic function rewrite) + back-dated rates (trigger). 12-step prod verification in one rolled-back transaction; froze RM 1,454.43, matching the approved mock exactly. BD not enabled — nobody is enrolled. Full entry → worklog.
- **2026-07-26 ⑩** · **HR-P4 employee master** (PR #341 merge `b25fa2bc`, 0269 applied, Worker `aa03fe76` + web `index-CgJfvG3c.js` — DEPLOYED; worktree `hr-hierarchy`) — 9 CR-coded humans on file. **Rejected the ratified spec's data model and Loo took the redesign**: it wanted `staff_code (sync w/ CRnnn)` + copies of name/phone/dob/gender/**status**, and `status` is load-bearing for auth since 0266/0267 — a second cosmetic copy rebuilds the samantha hole. So `hr_employees` stores only what has no home elsewhere, and the screen asks TWO questions in two columns (Employment = HR's record, derived; Access = the real switch). Backfill filter came from live data — the spec's wording would have filed Nets · Dispatch and a store login as employees. Checklists = a shared constant, not a config table. **NEW: HR may disable a login** (Loo's call — the only disable route was principal-only, so offboarding could not offboard); own route, account resolved from the employee row, PIN-only refused, sequence shared with the principal door via `lib/account-status.ts`. Offboarding is TWO shapes — `staff_verify_pin` already refuses an inactive salesperson (verified, not assumed). Caught 3 bugs in my own migration pre-apply (IMMUTABLE-reading-current_date, a UNION that double-listed a merged identity, 4 NULL-unguarded validators). Full entry → worklog.
- **2026-07-26 ⑥** · **`disabled` starts meaning disabled** (0266 applied, DB-only — no Worker/Pages deploy needed) — **found live**: samantha@carres.com sat `status='disabled'` with 1 live session + 8 refresh tokens (last touched 2026-05-29) and could still have used the system. Nothing read `status`: the Hono auth middleware never touches `app_users`, and `app_role`/`is_internal`/`is_operation`/`is_principal` all read `role` with no status predicate, so RLS kept granting; the sole revocation was a `signOut` in an empty catch. Loo authorised clearing her sessions (0 sessions / 0 tokens now; a sweep confirmed no other disabled account held one). 0266 = the four helpers require `status='active'` **plus** all 8 `hr_*` gates rewritten fail-closed — **the halves are inseparable**: tightening the helpers alone turns `app_role()` NULL for a disabled user, and `NULL not in (…)` is NULL, so the IF never fires and the HR functions would have OPENED to exactly the person being locked out. Verified live per-user: disabled → NULL/false/false/false + 42501 on hr_team_source and hr_commission_source; principal → completely unchanged (14 accounts). Also stopped `accounts.ts` swallowing signOut failures. Closes CF `hr-rpc-null-role-gate-shape`. **Then 0267 closed the last gap the same session**: service_role routes bypass RLS and gate on the JWT, and the live hook was measured minting `{"role":"operation"}` for the disabled account — so a fresh login would still have worked. Fix = `and status='active'` in `custom_access_token_hook`; the hook already had a no-row→untouched path and the middleware already rejected roleless tokens, so one predicate joined them (no new claim, no middleware edit, ZERO code change). Verified: samantha now mints `{}`, all 14 active accounts mint exactly what they did before (row-by-row OK) with every entity id intact. Closes CF `disabled-user-service-role-routes`. Residual accepted + documented: a token issued BEFORE the disable lives out its ~1h.
- **2026-07-26 ⑤** · **HR-O1 Overview + the attribution worklist stops crying wolf** (0265 applied, worktree `hr-hierarchy`, branch `feat/hr-o1-overview`) — HR now lands on an Overview digest (SOLD / COMMISSION / PEOPLE tiles + a "Needs a human" card whose empty state is a real answer); `?tab=` deep links unchanged, only the no-tab default moved. **The bug it fixes**: `hr_commission_source` slices on `placed_at` and did not filter `source_system`, so the 37 AutoCount archive rows (imported 2026-07-23, placed_at stamped into July, RM 0 line value each) sat in the unattributed worklist permanently — an archive row has no salesperson to assign, so the count could never reach zero and the badge stopped meaning anything. 0265 excludes them at the source and returns `legacyUnattributed` so both screens say so out loud instead of silently filtering. **Rejected the spec's own design**: it proposed a flag column + a one-click "mark 37 as legacy" button; `source_system` already encodes the fact, so deriving it means zero migration state, zero clicks, and future imports handled automatically. Also added `monthSold` to the report (NOT `report.totalBasis` — that is percentage-method only and would read RM 0 for a per-model store). New types are OPTIONAL so a browser on this build against a pre-0265 Worker degrades instead of crashing (covered by a test). Suites at baseline (api 3 · web 16); typecheck 0, build + lint clean. Also corrected §17.1 Orders state (was "~190 / 153 AutoCount" — stale since the 06-24 reset; live = 55) and repaired a merge-mangled Web bundle row. New CF `hr-rpc-null-role-gate-shape`.
- **2026-07-26 ④** · **HR-P2 — permissions follow the position** (PR #312 merge `c7b6e6ca`, 0260 applied, worktree `hr-hierarchy`; **api Worker `afc7ca62` + web `index-BrY1QC_g.js`** [carres-portal `6ec872d8` + carres-pos `fa80adb7`, 4 canonicals ✓, live bundle 4,028,313 bytes downloaded-then-grepped, SERVICE_ROLE=0] — **DEPLOYED, and the legacy email fallback is now the thing to watch: one clean week of zero `duty_legacy_fallback` log lines and the block comes out**) — `org_duties` (5 keys) + `org_position_duties`; self-only `my_org_duties()` + list-read `org_duty_holders()` (the per-row "which of these are managers?" question self-only structurally cannot answer) + audited `hr_set_position_duty()`. All 5 email hardcodes retired (`po-duty` PUT · `order-control` assigned_staff · `staff` PUT + autoEnroll · `pos` poDutyGate) behind a ONE-RELEASE legacy fallback that logs `duty_legacy_fallback` on every hit. Permissions matrix card in the Team tab. **3 spec corrections found by reading live data**: (1) the spec's "surface via `/me`" was dead — `/api/auth/me` has ONE consumer, a debug page; the real app decodes the JWT client-side, so duties ride the ops-staff payload instead; (2) seeding "PO-duty editor = the Operation Manager seat" would have STRIPPED Jess — she holds COO and that seat is empty, so 0260 seeds from live holders; (3) the "ROLE_LABEL duplicated in 3 files" debt was really 2 — the third is a different taxonomy (app role vs staff tier, colliding on `principal`/`salesperson`) and merging it would have mislabelled both; deduped the real pair into `STAFF_TIER_LABEL`. Also folded: the missing `hr_set_reports_to` audit; `resolveCurrentPoDuty` + the hr-team duty read now honour their own fail-soft contracts against THROWS, not just error results. Suites at baseline (shared 1021/1021 · api 3 pre-existing · web 16 pre-existing); build + v4 guard + lint clean; `SERVICE_ROLE` grep 0.
- **2026-07-26 ⑨** · **The agreement wording** (PR #329 merge `5cf6c092`, migration **0267_rental_agreement_templates**, api `8ed1f1b6` + web `index-K-sQWa48.js` — DEPLOYED) — Loo's own T&C printed VERBATIM (he read the five gaps and accepted them; the free service package is deliberately not in the document), stored as ordered blocks with immutable versions; agreements learn how they were signed; a private no-delete bucket holds the signature + archived PDF. NOTE: three `0267_*` files exist (parallel lines) — cosmetic, tracker keys on timestamp.
- **2026-07-26 ㉑** · **A rental produces a Sales Order** (PR #358 merge `fe60f204`, migration **0275 applied**, api Worker `b8c0159d` + web `index-DGMmYLHd.js` [carres-portal `31c22186` + carres-pos `f98a22fa`] — **DEPLOYED**) — a rental made an `RA-` and nothing else, so **operations never saw it**: the unit was `allocated` while nothing told a warehouse to deliver. Signup now mints an order + one line, approve proceeds it, reject cancels it (closes CF `rental-reject-does-not-cancel-the-order`). **The line is priced ZERO on purpose** — a rental order is a FULFILMENT document; retail price would overstate AR, contract value would double-count `rental_billings`. `proceed_order` gains a rental branch where credit approval replaces the 50% deposit; **because it requires `active`, tightening 0268's signature guard later tightens this gate for free — one place to fix.** 27 assertions in rolled-back txns, **5 of them purely to prove ordinary orders are untouched**. Also fixed a defect in my own PR #347: **a rental cart could never be submitted** (`step4Valid` wanted a payment a rental never has → Complete permanently disabled, no reason shown). 3 new CFs. **Two lessons: when a new flow reuses a gate, check what that gate guarded (money, here) — and never apply a signature-changing migration while holding the deploy, which broke rentals between apply and ship.**
- **2026-07-26 ⑳** · **One door for care plans** (PR #356 merge `e26fd1ae`, web `index-Boz1uDzu.js` [carres-portal `b13303d0` + carres-pos `2fbecd1a`, 4,170,195 bytes, SERVICE_ROLE=0, retired-button string grep **0** in the shipped bundle] — **DEPLOYED**) — Loo: "why this sku didnt show up, and why the service package stilll right here". Both from ONE cause, and it was my scoping call: 0274 moved the sellable authoring to SKU Master but left the Rental door open as a CF, so Loo's own care plan was created in the OLD registry with category `service` and never appeared under the "Guarantee & Service" filter he was using. The SKU was never missing — it was under the Service chip. **Fix**: "+ New service package" retired (plus its dead `pkgOpen` state and unreachable modal); the section still LISTS the legacy package (a rental offer references it) under a notice naming the replacement in full. **Durable lesson: when a merge is meant to give something ONE home, closing the old door is not the optional half — leaving it open while filing a CF looks disciplined and behaves like a trap.** Still open: the DATA half (1 package + 1 offer link still in `service_packages`; `rental_approve_agreement` still mints `service_entitlements`) — small, but it re-points a credit-gated path deployed the same day, so it gets its own pass.
- **2026-07-26 ⑲** · **Guarantee & Service Package — one category, two kinds of cover** (PR #352 merge `dd867214`, migration **0274 applied**, api Worker `ce089f7b` + web `index-BuTmS3FM.js` [carres-portal `f550ec7a` + carres-pos `ce25d0d8`, 4,169,655 bytes, SERVICE_ROLE=0] — **DEPLOYED**) — Loo spotted a real unification: a guarantee and a care plan are the same object (attach to an item · have a clock · get used up); only the visit COUNT differs, so a guarantee is a care plan with one visit. `guarantee_terms` gained `kind`+`visits_per_year`, the ledger gained `visits_total`/`visits_used`. **The five-door mint trigger was NOT touched** — a small BEFORE INSERT trigger on the entitlement table snapshots kind/visits instead, covering every door incl. future ones (verified: `guarantee_mint_from_line` still exactly 1 copy). ID retirement moves to the LAST visit, so one-time stays byte-identical (asserted). Two crossings impossible at three layers — a recurring plan may not promise a `replace` (unbounded free mattresses). **The DB caught a real gap mid-dry-run**: `remedy` only allowed replace|repair, both things you do to a BROKEN item; a care plan's remedy is neither, so `service` was added and paired to `kind`. Label reads "Guarantee & Service Package" (short form on chips); DB value stays `guarantee`. 20 assertions passed on live prod in a rolled-back txn before apply. 2 CFs recorded (two registries for a care plan; visits counted but not scheduled).
- **2026-07-26 ⑱** · **Rent-to-Own becomes a POS category + the app's first ErrorBoundary** (PR #347 merge `9dee5f29`, web `index-CYqtv_4v.js` [carres-portal `5d632cf9` + carres-pos `5bfc034d`, 4 canonicals ✓ first poll, 4,153,052 bytes, SERVICE_ROLE=0] + Worker `f56e7391` (union carried parallel lines' undeployed api) — **DEPLOYED**) — Loo could not find his own rental offer: renting sat behind a SECOND entrance (a top-bar pill) while every other family lived in the left rail. It is a CATEGORY now — same `ProductCard`, same tap, same configure surface; the only difference is the right rail asks SIZE then **RENTAL TERM**, showing the monthly fee AND the contract total together ("RM59" without "× 84 = RM4,956" is how people mis-buy credit). Qty fixed at 1: one rented item = one agreement + one subscription + one tracked asset. **Loo's locked law — "rent and outright 不能在同一张单"** — lives in ONE module (`rental-cart.ts`) that the rail locks, the add guard, the totals and the submit branch all ask, so they cannot drift; the guard sits in `addLine`, the single funnel all four add-doors already pass through; rails reuse the existing sofa-mutex lock rather than a second refusal vocabulary; a both-kinds cart reports RENTAL (the safe answer). Checkout branches to agreements, and a mid-way failure NAMES the ones already created. **Also: the app had NO ErrorBoundary at all** — which is why Loo's successful signup (RA-1003, correctly `pending_approval` with 0 billings) showed him a blank white page; root + route boundaries now make "it worked" and "it broke" distinguishable. Tests +27; suites at baseline. **NOT done: the Guarantee & Service merge** — it needs a migration on the LIVE entitlement engine (1 live entitlement) and, premise correction, there is no Guarantee *tab* in P&M: it is a SKU *category* whose "pick Guarantee → scope + years" flow already exists in `NewSkuModal`.
- **2026-07-26 ⑭** · **The Approver gate — the credit-assessment clause, implemented** (PR #337 merge `15e82946`, migration **0268 applied**, **api Worker `facd766f` + web `index-gvaodBF9.js` [carres-portal `bd4a3696` + carres-pos `acefd9b3`, 4 canonicals ✓, 4,116,180 bytes downloaded-then-grepped, SERVICE_ROLE=0] — DEPLOYED**, worktree `rental-modular-sku`) — Loo picked §4 over the §5 offer-tab polish after I argued §5 is ~85% built while §4 had **no room in the database at all** (`rental_agreements_status_check` had no approval state; the sell RPC stamped `'active'` as a literal, so a store signature was the only thing between a stranger and RM 4,956 of credit). **The finding that shaped it**: the old sell RPC also wrote the full 84-row billing schedule, allocated the RU asset and minted the service entitlement + visits in the same breath — gating only the status word would have left a REJECTED application holding phantom receivables, a reserved asset and unearned visits, so **all of it moved into `rental_approve_agreement`**. Free win: the Stripe checkout route already required `active`, so **no card can be charged before approval with zero API changes**. Gate is finance+principal, **narrower than `is_internal()` on purpose — that admits `bd`, and a BD sells these**. Two deliberate omissions, both filed as CFs not hidden: no `signed_at` guard (**signing is not built** — 0267 landed the columns and nothing writes them, so a guard would jam the queue shut; the approver sees a "Not signed yet" pill instead) and reject does not cancel an order (moot — the lane never mints one). **Verified BEFORE applying**: 21 assertions against live prod in a rolled-back transaction (born-pending writes nothing · showroom refused 42501 · approve → 84 rows + 1 unit + 21 visits · double-approve refused · blank reason refused · rejected leaves 0 rows); post-apply `anon` EXECUTE false and `create_rental_agreement` still exactly 1 copy (no ghost overload). Measured + corrected: `REVOKE … FROM public` does NOT drop `anon` on Supabase. Tests +39 (api 28 · web 10 · shared 1); suites at baseline (shared 1081/1081 · api 3 · web 16), build + v4 + lint clean, `SERVICE_ROLE` 0.
- **2026-07-26 ⑧** · **Rental gets its own Admin tab** (PR #324 merge `93a64a7a`, web `index-B4SBrkkQ.js` — DEPLOYED) — offers file by product family (`?tab=rental-setting&section=mattress|bedframe|sofa` + a service-package tab); P&M drops its Rental tab. Same session Loo locked: the agreement prints his T&C verbatim and is signed at the sales order (no draft state, free service package NOT in the document), the buyout/settlement lane with a signed supporting document, Stripe penalty-as-invoice-item + MANUAL termination, and a finance **Approver page** (CBM hook later) gating orders into operations. Full text → `docs/rental-service-plan-proposal.md`.
- **2026-07-26 ⑦** · **Rental SETTING closed loop — offers off a Modular model** (PR #315 merge `0ff8f1bc`, migration **0264 applied**, api Worker `7fb8505c` + web `index-CAb0V6zA.js` — **DEPLOYED**) — the "type a SKU code" box is gone: an OFFER is authored per `product_models` row with a rent lane (price matrix: live SKUs / sofa compartments / combos × terms), a BUY lane, an option+fabric price overlay (each value one-time and/or monthly, fabric drills series→colour), manual surcharge slots, GWP gifts as real SKUs, and attached service plans whose SKU is minted as `SVC-{MAT|BF|SOFA|ACC}-{CLEAN|REPAIR|SVCX}-{n}Y{visits}`. `rental_plans` stays the rent money atom (now offer-parented, `line_kind` unit/compartment/combo). 3 new CFs incl. `rental-combo-agreement-sku-null`.
- **2026-07-27** · **Delivery T7 — queue split + auto-overdue** (PR #386 merge `984d9d0b`, Worker `f96b3e19` + web `index-ChJLxdiq.js` — DEPLOYED, no migration) — the delivery lifecycle becomes FOUR queues in their own DELIVERY facet group, each with its OWN deadline so an item turns late by itself (assign = date−3 working days · chase = −1 · deliver = the confirmed date · photo = delivered+1). **L3 was already built** — the card wanted working days and said the engine ships in T9/T10, but `working-days.ts` + `my-holidays.ts` shipped with procurement 2026-07-21, so T7 needed a consumer not an engine; the math went to a new pure `packages/shared/delivery-queue.ts` (18 tests) so T10/T11 read ONE rule. Two ladder rungs make the queues real NEXT verbs: a confirmed booking splits by its date (today → `Deliver today`; **passed with no delivery → `Chase logistic` red** — the auto-overdue, a hole D1 created because the frozen past-deadline escalation only ever fired on UNCONFIRMED rows), and **a delivered order with an empty photo ledger is not `Done`** (amber never red per guardrail #2; its queue spans CLOSED orders, the second after Owing). **Two of the card's own words deliberately NOT built**: `Confirm booking` (a second word for the live locked `Chase logistic` — rule 8) and L1's `Issue DO` (`do_number` is 0098-trigger-stamped, so nobody issues one). Degrades instead of lying: absent `delivery_photos` = UNKNOWN not "no photo"; TBD date = no anchor = never late. Also de-fused a test fixture hardcoding `2026-08-01` that would have silently tested a different rung after that day. Full entry → worklog.
- **2026-07-27** · **Stock K0 — one Stock door** (PR #376 merge `9ad44686`, web `index-BDR0dVav.js` — DEPLOYED, web-only) — the two sidebar stock items merge into ONE `Stock` entry + shared `StockTabs` (On hand · In & out; Ready stock joins at K2); COPY-STANDARD gains the Stock word law (`Inventory`/`Movements` banned UI words). Card K0 of `docs/ready-stock-execution-queue.md`; the five execution-queue lines + index live in `docs/execution-queues-index.md` (31 cards). Full entry → worklog.
- **2026-07-26 ㉑** · **Delivery Module D1 — two-stage booking** (PR #360 merge `099a6577`, migration **0277 applied**, Worker `daf36839` + web `index-B9ZL9k9A.js` [carres-portal `a8946931` + carres-pos `387cc0f4`, 4 canonicals ✓, 4,175,048 bytes downloaded-then-grepped, SERVICE_ROLE=0] — **DEPLOYED**, worktree `carres-delivery-d1-analysis`) — a carrier's date and the customer's confirmation stop being the same thing: `logistic_eta` upgraded in place to Stage-1 provisional, Confirmed requires the CUSTOMER's date+slot (invariant #1 at DB CHECK + endpoint + UI), gates (goods reserved + balance collected + no Sunday) enforced in `POST /:id/booking/confirm` through the shared `bookingConfirmGate` — `line-category`/`line-readiness` moved to packages/shared so the API gate and the drawer badge read ONE rule. Chip states facts (Loo verbatim): amber `not confirmed · carrier said 23 Aug` / green `confirmed 23 Aug · 12pm–3pm`. D2-D6 untouched by design. Full entry → worklog.
- **2026-07-26 ㉓** · **The customer's signature stops being thrown away** (PR #378 merge `dc3bbfba` + renumber PR #380 `f809562d`, migration **0279 applied**, Worker `91e70584` + web `index-CmQv7X-2.js` — **DEPLOYED**, worktree `rental-modular-sku`) — the POS already refused to enable Complete without a real `data:image/…` on the pad, then the rental submit branch **returned before the upload the ordinary path runs**, so the drawing died in the browser and credit was approved against a record that only claimed a signature. 0267's five columns had **zero writers**. Now: `rental_current_agreement_template()` = ONE definition of the wording (POS read + sell RPC share it) · `create_rental_agreement` DROP+CREATE stamps signature + `template_version` · **0268's commented-out guard is live**, and since 0275's proceed gate needs `active`, one line closes pad→warehouse (closes CF `rental-approve-without-signature`) · a CHECK backstops the blanket-`is_internal()` PostgREST door. Bytes go through Hono because the evidence bucket's INSERT policy is `is_internal()` — a store upload is structurally impossible; server-generated key, `upsert:false`, blob deleted if the RPC refuses. **The first dry run FAILED and caught two defects in my own harness** (the approve rewrite omitted; every assertion `RAISE`d inside its own `EXCEPTION` handler and caught itself) — 13 assertions passed after the fix. **Guardrail #8 fired**: a parallel line applied `0278_hr_staff_comp` mid-build → renumbered to 0279. **Also my own error, corrected in ~1 min**: deployed the Worker with bare `wrangler deploy`, which overwrote production with `PUBLIC_WEB_URL=localhost` and no custom-domain route. Full entry → worklog.
- **2026-07-26 ㉔** · **The collection engine — money in Stripe lands in our books** (PR #387 merge `0aa75a88`, migration **0281 applied**, Worker `63fca88d` + web `index-C-BnjmmM.js` — **DEPLOYED**, worktree `rental-modular-sku`) — Loo: "we do 收钱引擎 first". **Read Jess's locked spec and found half of it dead**: `subscriptions`/`subscription_billings`/`subscription_services`/`service_partners`/`collections_events`/`orders.subscription_id` are ALL 0 tables and its reserved 0256-0261 were taken months ago, while 0249 already built the same concepts — so the business locks were honoured and the data model was not (two ledgers for one debt is the failure it avoids). **Three conflicts nobody had noticed**: the dunning ladder has no send channel anywhere in the API; the T&C (7th + 8%/month, no ladder) and the spec (ladder, no interest) contradict; and our due dates anchored on the signing day, contradicting Loo's own contract. **Loo's calendar** — signup payment + the 7th of every month, N payments for an N-month term, "as long as the sum is correct" — is now a DB function mirrored in shared, and approve REFUSES a schedule that does not sum to the contract value. The 7-day guard is load-bearing: it stops a double charge AND clears Stripe's ~48h trial minimum. **Stripe cannot express the rule directly** (checked: `proration_behavior:none` waives the first invoice, the default bills a part-month) — so the signup month is a one-time line item, a trial carries the gap, trial end BECOMES the anchor, and the schedule runs term-1. `rental_record_payment` is the only writer (server-side split, idempotent by invoice id, history every write) closing CF `rental-billing-writes-need-rpc`; the webhook records the signup month (closes `rental-first-month-vs-billing-row`) and every `invoice.paid`. **The dry run failed first — I omitted the changed approve function from the payload, the SAME blind spot as 0279.** Full entry → worklog.
- **2026-07-25 (night ⑤)** · **HR departments + Department chart** (PR #295, 0259 applied + deployed same session, worktree `hr-hierarchy`) — `org_departments` registry (5 seeded) + position→department link (C-level stays department-less, tops the chart); Team tab gains a Department chart card (Management strip → dept columns → Showrooms → Unassigned), Positions rows with department picker, Departments card. Worker `19a3a6e1` + web `index-D7Ejw5bd.js` (merge `3db49b9f`). Hierarchy-P2 permissions proposal presented, awaiting Loo.

- **2026-07-26 ⑦** · **Guarantee packages — the 6th SKU category** (0261-0263, worktree `feat-guarantee-sku`) — RM150 Mattress Guarantee, 15 years, one-for-one swap. Loo's 3 rulings: clock starts on **delivery**, cover is **1:1** (qty-2 line = 2 entitlements), claim is **one-shot**. Minted by an `order_lines` AFTER INSERT trigger so ALL FIVE line-write doors are covered by construction; expiry is **derived, never stored**. Surfaces: SKU Master chip · POS Guarantees rail whose card can't direct-add (covered-item picker stamps `attrs.guarantee.covers_sku`) · invoice Guarantee-cover block · `GuaranteeCoverStrip` in the Customer block of both order-detail surfaces · **Operation → Guarantees** claim desk (one box = SO / name / customer id / phone). Prod-verified in rolled-back transactions before shipping. Closed 2 silent 5-category drift copies (`purchase-report.ts`, api `catalog.ts`). Spec `docs/guarantee-package-spec.md`.
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
- `rental-dunning-has-no-send-channel` — segment 2b is BLOCKED: no message-sending integration exists anywhere in apps/api, so the Day 3/7/21 rungs cannot be built. Loo: skip for now.
- `rental-payment-failed-not-recorded` — 0281 handles invoice.paid only; a bounced card writes nothing and the events table has no payment_failed kind. One CHECK change + a webhook branch when 2b lands.
- `rental-two-calendar-implementations` — the due-date rule lives twice (shared TS + SQL) because the DB cannot import TS; both assert the same worked example, change one and the other fails.
- `rental-interest-daily-vs-whole-month` — 8%/month accrues pro-rata by day; the harsher "per month or part thereof" reading is a one-line change. Confirm with Loo before real interest is charged.
- `rental-ra1003-old-calendar` — RA-1003 keeps its pre-0281 dates (the 26th) and has no Stripe subscription; Loo confirmed it is testimony data and deliberately not re-anchored.
- `rental-first-month-vs-billing-row` — Stripe collects month 1 at checkout but `rental_billings` seq 1 stays `due` until ②'s invoice.paid engine (catch up by stripe_invoice_id).
- `rental-billing-anchor-drift` — our schedule anchors on start_date, Stripe on checkout completion; ② reconciles by stripe_invoice_id.
- `rental-agreement-store-read` — store JWTs can't read agreements yet (sell lane holds the RPC payload; checkout = service client + explicit Hono ownership); "My rentals" list needs a dealer-scoped RLS read later.
- `guarantee-service-two-registries` — a sellable care plan is a `guarantee_terms` row (0274) but the RENTAL-included package still lives in `service_packages`; two registries for one concept. Firm fix + interim rule in the doc.
- `guarantee-recurring-no-visit-schedule` — 0274 counts visits REMAINING but not when they are DUE; nothing can say "this customer is owed a clean this month". Fine for authoring/pilot; needs a due date before volume.
- `rental-hq-direct-no-longer-allowed` — 0275 refuses a dealer-less rental (it mints an order, and `orders.dealer_id` is NOT NULL). Deliberate narrowing; if wanted back, add a real "Carres HQ" dealer row rather than making the column nullable.
- `rental-order-total-is-zero` — a rental SO's total is 0 by design (money lives in `rental_billings`), so it contributes nothing to sales/AR/margin reports and prints RM0 unless the template reads `attrs.rental`.
- `rental-agreement-wording-unpublished` — **blocks every rental signup today**: `rental_agreement_templates` holds 0 rows, so 0279 refuses with `no_agreement_template`. Not a bug — a rental cannot be signed against a document that does not exist. Fix = press Save version 1 in Admin → Rental → Agreements (the wording is already loaded behind that button).
- `rental-signer-name-not-editable` — the API and DB accept a signer different from the customer (spouse/guardian) but the POS always sends the customer's name; no field asks. Add one input on the rental confirm step when a real case appears.
- `rental-signed-doc-pdf-not-archived` — 0279 captures the SIGNATURE; `signed_doc_path` (the filled, rendered agreement PDF) still has no writer, so the archive holds the drawing and the version number, not the printed contract.
- `rental-signed-nric-no-reveal-audit` — `signed_nric` is PDPA-sensitive and the approver reads it in clear; HR-P4 already built reveal-with-audit for exactly this shape. Reuse it before real NRICs land.
- `rental-retired-page-still-on-disk` — `RentToOwnPage.tsx` is unimported and its submit now refuses by design, but the file (a second rental signup UI) still exists. Deleting it is Loo's call — red line #5.
- `rental-reject-does-not-cancel-the-order` — 0268 reject fails the AGREEMENT only. Moot today (the rental lane mints no order); when it does, add the blocker inside `proceed_order`.
- `rental-plan-reprice-policy` — re-price archives the old Stripe Price; unlinked old-fee agreements block checkout (422 plan_repriced); live-agreement re-pricing is a ②+ policy call.
- `guarantee-claim-no-stock-movement` — a guarantee claim records the swap but moves no stock and raises no replacement line; ops does it by hand.
- `commission-config-not-effective-dated` — only `staff_commission_rates` carries an `effective_from`; model rates, tiers, milestones and the scheme method do not, so editing them rewrites every month's live figures. HARMLESS for CLOSED months (the run freezes computed lines — that IS the protection) but a closed month must therefore always be READ from `commission_run_lines`, never recomputed. Fix if it ever bites: add effective dating to the other four config tables.
- `hr-comp-bd-revenue-unattributed` — P7 shows BD cost but its revenue reads "not enrolled" (0 dealers have a bd_owner, 0 bd_profiles, 0 rates). Wiring it needs a dealer-channel revenue read, NOT a widening of the showroom-only `hr_commission_source`.
- `hr-comp-trend-single-month` — the spec's 6-month trend has one month of data; the strip fills in by itself. The cost/revenue ratio is withheld entirely while a month is in progress (a full month of salary over part of a month of sales is directionally wrong).
- `hr-comp-no-prorate-by-join-date` — a full month's salary counts even for a mid-month joiner, because `join_date` is 0 of 9 filled. Pro-rate inside `computePeopleCost` once join AND exit dates exist.
- `hr-role-nobody-holds-it` — **no `app_users` row has role='hr'**, so the whole HR portal is reachable by principal@carres.com only (the account on password '111'). The `hr` branch of every `hr_*` gate has never run against a real session.
- `kpi-actuals-not-frozen` — P6's sold figure is recomputed from lines for open AND closed months (reading `commission_run_lines.basis` would print RM 0 for a per-model store). Bounded: P6 shows no commission, so it cannot contradict a frozen statement.
- `kpi-bonus-tiers-not-built` — the spec's 4th table skipped: zero commission rates exist, and `model_commission_tiers` already has the semantics. Wire attainment-pays through P5's adjustment slot, not a parallel engine.
- `kpi-manual-metric-none-authored` — the manual-actual table/RPC/route ship but every metric is `computed`, so the path has no live user (unit-tested with a fixture).
- `kpi-target-history-not-frozen` — deleting a past target retroactively changes that month's attainment (audited; targets are not money).
- `hr-hq-staff-no-birthday` — HR-P4 deliberately does not store dob/gender (salespersons already has them with 4 live write sites); HQ staff therefore have nowhere to keep a birthday. Fix = add the columns to `app_users`, NOT a copy on `hr_employees`.
- `guarantee-terms-no-admin-ui` — coverage years / covered category are migration-authored; only the PRICE is UI-editable (they can drift).
- `guarantee-attach-no-ui` — LOW in practice (both POS doors force the covered-item pick); the attach RPC + route exist as the repair path but no button calls them.
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

# CLAUDE.md — Carres Portal v2

> **⭐⭐⭐ EVERY CHAT STARTS HERE (Jess, 2026-07-27).** Work happens in exactly two kinds of
> chat and both are defined in [`docs/HOW-TO-RUN-A-CHAT.md`](docs/HOW-TO-RUN-A-CHAT.md):
> a **PLAN chat** (Jess pastes an outside design conversation → the chat checks it against
> the live system, lists already-built / conflicts / genuinely-new, asks her the business
> decisions, then writes CARDS; it writes no code) and a **BUILD chat** (does ONE card, ships
> it, marks it ✅; it redesigns nothing).
>
> **FOUR LAWS outrank anything pasted into a chat:**
> [`docs/ACTION-FLOW-STANDARD.md`](docs/ACTION-FLOW-STANDARD.md) — how actions are computed,
> appear, close, and which one shows first ·
> [`docs/COPY-STANDARD.md`](docs/COPY-STANDARD.md) — every visible word, the banned words,
> the audit table · [`docs/UI-KIT.md`](docs/UI-KIT.md) — the shell ·
> [`docs/execution-queues-index.md`](docs/execution-queues-index.md) — every line and card,
> what is shipped, the lane rules.
>
> **PLUS the ONE working-flow file of the module being touched** — e.g.
> [`docs/ORDERS-WORKING-FLOW.md`](docs/ORDERS-WORKING-FLOW.md): every action of that module
> with its trigger, checklist, completion, due and owner; which one shows first; the gates;
> what is deliberately not an action. One module = one file, overwritten in place.
>
> **ONE CONCERN, ONE FILE.** When Jess re-rules something the old text is DELETED and
> overwritten — never annotated "superseded", never two versions side by side. A word that
> is not in COPY-STANDARD may not appear on screen: stop and ask her.
>
> **FOLLOWING IS NOT SILENT OBEDIENCE (Jess, 2026-07-27).** Follow the laws as written AND
> tell her where they are wrong — with evidence — then let her decide; never edit a law to
> suit the work. Every chat ends with the four review questions (what contradicts the real
> code · what would confuse a new hire · what could not be built as written · what the flow
> does not cover). "Nothing found" is a valid answer; **silence is a failure.** If building
> as written would ship something wrong, stop before building and ask.

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
| Latest migration | **Applied tail = 0300_rental_interest_and_settlement** (2026-07-27, rental): the two promises 0249 and 0281 left as empty columns finally have writers. **ACCRUED vs CHARGED** is the whole design — interest owed grows daily, so it is DERIVED on the read and never stored, while `late_interest`/`interest_charged_at` hold only what a human actually charged. **0281's one-writer law survives with a named seam**: `rental_charge_late_interest` touches exactly two columns (asserted it can never write status/paid_amount/the split) and `rental_settle_agreement` writes rental_billings NOT AT ALL — it calls `rental_record_payment` once per remaining month, so there is one split implementation and each month genuinely was paid. The migration now counts writers of `rental_billings` and fails on a fourth. **The split is on RENT, not the penalty** (49% of a customer's punishment is a policy nobody decided), and **a discounted settlement is refused with the real figure** rather than allocated by guess. Prior: 0299 problem stock · 0298 service case deadline · 0295 rental payment failed · 0281 rental collection ledger. **Rules that survive**: (1) `list_migrations` the tracker tail immediately before numbering AND again before applying. (2) Migrations apply manually via MCP; never renumber APPLIED files, but DO renumber an unapplied draft. (3) Reconcile the FILE back to live after apply by comparing `md5(prosrc)` + length per function — **0295 proved it again** (a hand-trimmed apply payload had dropped the body comments); apply the FILE, not a retype. (4) **An assertion that RAISEs inside its own `EXCEPTION WHEN sqlstate` handler catches itself and proves nothing** — set a flag, check it outside. (5) **The dry-run payload must contain EVERY object the migration changes.** (6) `revoke execute … from anon` alone does NOTHING and `from public` alone does nothing either — the pair PLUS an explicit grant back, asserted both directions. (7) Inside a transaction, read `audit_log` rows back by `ref`, never by time. (8) Adding DEFAULTED parameters to a live RPC creates a SECOND signature — drop the old one and assert exactly one survives. (9) **Never loop a plpgsql cursor over rows the loop body mutates out of its own predicate** — materialise to an array first. |
| Catalog state | 11 suppliers · 171 product_models · ~1150 product_skus (1013 AutoCount + SVC + minted compartment skus; 123 compartment skus flipped ON 2026-07-24, mostly RM0 pending pricing). Bundles: 1 active (King Bedroom Set RM2500). PWP/free-gift/delivery-fee/rental config tables exist, dormant until authored. |
| Orders state | **55 orders** (counted live 2026-07-26 — the old "~190 / 153 AutoCount" figure predated the 2026-06-24 catalog/data reset and was stale): **18 native POS orders, ALL 18 attributed**, + **37 `source_system='autocount'` archive rows** imported 2026-07-23, all unattributed and all carrying RM 0 of line value. That split is why HR-P3 was cut and why 0265 excludes archive from the attribution worklist. `dealers.channel` is THE showroom-vs-dealer authority (PR #226). |
| Test count | Baselines + pre-existing fails → §17.7. Run full suites before merge; ZERO new failures is the bar. |
| Web bundle | **LIVE = `index-CToiHJof.js` from main tip `98dfd9c3`** (PR #471 Portal-Core C10 — the three dots become real; carres-portal `e67004d8` + carres-pos `83d2c2b8`, both `--branch=main`; **all 4 canonicals converged on the first poll**; downloaded to a file then grepped — 4,428,600 bytes, `SERVICE_ROLE` 0. **Proved BOTH directions against the PREVIOUS live bundle**: the dot tooltips (`Money — settled` · `Stock — all in` · `Delivery — customer confirmed`) and the `row-dot-` testid grep **0 in `index-BYggEOBr.js`** and **1** here — which is what makes "dead code is now on screen" a measurement rather than a claim. **A composed testid greps 0 as a whole**: `row-dot-${kind}` means the marker is the fragment `row-dot-`, never `row-dot-goods`. **C9 (#472) merged minutes after this deploy and had not yet shipped its own bundle** — when it does, that hash supersedes this one and still carries C10: `git merge-base --is-ancestor 98dfd9c3 a12e8ff6` passes, which is the containment proof the deploy rules ask for.) Prior receipt for reference — `index-BYggEOBr.js` from `bc92e4cc` (PR #466 C2; carres-portal `19d0fbbf` + carres-pos `a8c77e64`; downloaded to a file then grepped — 4,426,596 bytes, `SERVICE_ROLE` 0. **Proved BOTH directions**: the new strings are present (`Nothing to do on this order` · `A new action appears here by itself` · `order-action-list` · both rewritten tab tooltips) and the retired ones grep **0** (`Stock in AND the customer confirmed`, the old `To book` tooltip, and C1's `Chase logistic` / `Unscheduled` / `need booking` still at 0).) Carries every line merged up to #471. **Deploy rules (Loo, permanent)**: NEVER deploy prod from a feature branch — merge to origin/main, deploy from the main tip; before ANY Pages deploy `git fetch` + `git log HEAD..origin/main` must be empty, deploy to BOTH Pages projects `--branch=main`, RE-curl all 4 canonicals and POLL until they converge. **A canonical serving a DIFFERENT hash is usually the OLDER bundle still cached** — `wrangler pages deployment list` names the true last writer, then `git merge-base --is-ancestor <theirs> <yours>` proves containment. A piped `curl \| grep` on the ~4 MB bundle truncates and reports a FALSE 0 — download to a file first. **Pick proof markers from MOUNTED components**: a string a page computes SERVER-side, or one from a retired page, is correctly tree-shaken and greps 0. **On a RENAME card, grep both directions** — the banned word at 0 proves only that nothing says it, not that anything says the new one. bundle-size CF open (§17.5). |
| API bundle | **LIVE = Worker version `739d4be8` from main tip `bc92e4cc`** (deployed with PR #466; C2 itself changed NO api file — this ships the union tip's parallel-line api unchanged, which was safe because **every migration file on the tip was confirmed applied first — the tracker tail is 0300**. Wrangler's receipt read back: `PUBLIC_WEB_URL: https://pos.carresofficial.com` + the `api.carresofficial.com` custom domain + the 09:00-MYT cron; `GET /health` through the custom domain returns 200.) **The api deploy is `wrangler deploy --env production`, NEVER bare `wrangler deploy`** — both stanzas share `name = "carres-portal-v2-api"`, so a bare deploy overwrites production with the default env: `PUBLIC_WEB_URL=http://localhost:5173` and NO `api.carresofficial.com` route. Done by accident once and corrected within a minute; **wrangler echoes the bindings it deployed — read them, they are the receipt.** Same union-tip rule as web. |

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
| **Delivery module T11 — the 3-pane page + the ONE new sidebar item** (assembly only; runs the Orders list's OWN ladder, writes nothing — `Open order` hands back to the drawer where the gates live). **Line ① COMPLETE: T1-T11** | ✅ LIVE | 2026-07-27 | PR #425 · no migration · `docs/delivery-execution-queue.md` |
| **Portal Core C1 — Orders + Delivery speak the new words** (every action label reads verb + named party + measurable object; `Chase` is gone; the words live in ONE shared module and each action carries TWO strings — a party-free QUEUE word and a party-named ROW line) | ✅ LIVE | 2026-07-27 | PR #461 · no migration · `docs/portal-core-execution-queue.md` |
| **Portal Core C2 — the ladder splits into TWO LAYERS** (every track computed independently so nothing hides; a separate pure function picks which one leads; the drawer lists every open action, built from the same call as the row's pill) | ✅ LIVE | 2026-07-27 | PR #466 · no migration · `docs/portal-core-execution-queue.md` |
| **Portal Core C10 — the three dots become real** (goods · delivery · money render BESIDE the stage pill, each as its own icon; `rowDotsOf` had a renderer and, it turned out, no tests either) | ✅ LIVE | 2026-07-27 | PR #471 · no migration · `docs/portal-core-execution-queue.md` |
| **Service Case S4 — the deadline** (14 WORKING days from the report, DERIVED and never stored; the call the portal asks for four days out carries a picked reason, and every event names the deadline it was made about; extend once, bounded) | ✅ LIVE | 2026-07-27 | PR #449 · 0298 · `docs/service-case-execution-queue.md` |
| **Service Case S5 — the monthly numbers** (the review layer; NO migration — the day a case ended is the `customer_confirmed` entry S3's own close gate already demands, so `closed_at` was refused, not deferred; every figure withholds itself with a reason rather than printing one the records cannot back) | ✅ LIVE | 2026-07-27 | PR #474 · **no migration** · `docs/service-case-execution-queue.md` — **line ③ COMPLETE: S1-S5** |
| **Ready Stock K5 — stock health + proposal accuracy** (the review layer; reads the two numbers K1 and K4 already collect and adds no third; every alert stays silent until the records can back it) | ✅ LIVE | 2026-07-27 | PR #451 · **no migration** · `docs/ready-stock-execution-queue.md` — **line ⑤ COMPLETE: K0-K5** |
| **Ready Stock K4 — pool usage reasons + reserve levels** (a DATED ledger, not 0213's undated column; the draw and the reason are one transaction across all THREE doors out of the pool; the level warns and never blocks) | ✅ LIVE | 2026-07-27 | PR #434 · 0292 + 0294 · `docs/ready-stock-execution-queue.md` |
| **Receiving R4 — problem stock is quarantined** (three statuses on the existing machine; the guard asks WHERE a unit is going, never who is writing, so it holds against PostgREST too; the receive mints the shortfall a held unit leaves behind) | ✅ LIVE | 2026-07-27 | PR #454 · 0299 · `docs/receiving-claim-execution-queue.md` |
| **Rental signature capture** (the POS asked for a signature and threw it away; an agreement is now BORN signed, and approve refuses an unsigned one) | ✅ LIVE | 2026-07-26 | PR #378 · 0279 · worklog ㉓ |
| **Rental collection engine ②a** (the schedule speaks the 7th and asserts its own sum; `rental_billings` finally has ONE writer; a collected month is undeletable) | ✅ LIVE | 2026-07-26 | PR #387 · 0281 · worklog ㉔ |
| **Rental — a bounced card stops being invisible** (`invoice.payment_failed` recorded as an EVENT, never as a second writer of `rental_billings`; idempotent on Stripe's event id so retries are rows and re-deliveries are not; badged on the LIST, not just in the drawer). Also deletes the retired `RentToOwnPage`. | ✅ LIVE | 2026-07-27 | PR #439 · 0295 |
| **Rental — late interest + settling early** (0249's `buyout_*` and 0281's `late_interest` finally have writers; ACCRUED derived vs CHARGED stored; settlement goes THROUGH `rental_record_payment` so the split and the one-writer law both hold; a discounted settlement is refused, not guessed) | ✅ LIVE | 2026-07-27 | PR #463 · 0300 |

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
- **2026-07-27** · **Portal Core C10 — the three dots become real** (PR #471 merge `98dfd9c3`, no migration, web `index-CToiHJof.js` [carres-portal `e67004d8` + carres-pos `83d2c2b8`, 4 canonicals ✓ first poll] — DEPLOYED; **no Worker deploy: `git diff bc92e4cc..origin/main -- apps/api packages/shared supabase/migrations` is empty, so live `739d4be8` already carries the tip**) — `rowDotsOf()` computed goods · delivery · money and NOTHING rendered it, so Law 6 described a screen that did not exist. **Jess's ruling built as ruled — side by side**: the stage pill says WHERE the order is, the dots say WHICH PART has trouble, and the pill's markup is untouched. **Each dot IS its own icon** (§A4 mapping: goods `package` · delivery `truck` · money `wallet`, 14px) — the icon is what labels it, which is why the dots need no header of their own; never emoji, and never a bare circle, because a colour nobody can name without looking elsewhere is not a signal. **The proof is measured, both directions on downloaded files**: the dot tooltips and the `row-dot-` testid grep **0 in the previous live bundle** (`index-BYggEOBr.js` — they were tree-shaken, which is what "rendered nowhere" really meant) and **1** in this one; the testid is a composed template, so the marker had to be the literal fragment (`row-dot-goods` as a whole correctly greps 0 — the S4 trap again). **`rowDotsOf` now returns the STATE, not a hex**, so the tests pin the meaning and the paint stays in the one `DOT_HEX` map (RULE A ratchet holds at 43); the dot ORDER flipped to the law's goods · delivery · money (the §14 note had money first — re-ruled 2026-07-27, and nothing had ever rendered it, so no screen changed). **Widths were measured against the app's own stylesheet in a real 1448px `table-fixed`, not estimated**: widest pill 137px + three icons 50px → Status 11 → **14**, both intact with 15px spare, and **the row stays exactly 40px**; the 3 points came from the two neighbours with real slack (deadline 13 → 12, needs 142 of 174 · stock 11 → 9, needs 119 of 130), **never from Actions**, which C3 is about to grow. **The card and the C5 note both said `rowDotsOf` was unit tested — it never was**; C10 wrote the first cover its §7 truth table has ever had (11 tests + a negative control: reverse the dot order → 8 fail). **"Computed and tested but not rendered" reads as two thirds done, and it was one third.** **Four findings reported**: Law 6 still says "the column carries no header word" — written when the dots were to OWN that column, and a chat reading only that sentence would strip the header and leave the pill unlabelled (the card's own "no header **of their own**" is what shipped) · the card's stated width was stale (9 units; C1 had made it 11) · §7 gives the money dot no amber while the other two have three tones · the Stock/Delivery cells have said "the 货 dot carries the colour" since §14 and were changed by neither. Closes CF `row-dots-of-is-dead-code` — revived, not deleted. Suites at baseline (web 16; this file 109 → 120). Full entry → worklog.
- **2026-07-27** · **Portal Core C2 — the ladder splits into two layers, and nothing hides any more** (PR #466 merge `bc92e4cc`, no migration, web `index-BYggEOBr.js` [carres-portal `19d0fbbf` + carres-pos `a8c77e64`, 4 canonicals ✓ first poll] + Worker `739d4be8` — DEPLOYED) — `nextActionOf` returned on its FIRST match, so an order with no PO, RM 2,000 owing and no logistics company printed one pill and the other two facts existed nowhere on screen. **Layer 1** computes three tracks — goods · delivery · money — independently, one action each at most (the rungs inside a track are states of the same question, not parallel work). **Layer 2** picks which leads, giving every key its own rank inside its Law 4 rung so the sort is TOTAL — two actions can never tie and flip between renders — and **a broken commitment jumps every rung**, modelled as a FLAG rather than a rank because broken is a fact about the order, not about the kind of action; that choice is what let the past-deadline escalation keep its exact behaviour. **The row's headline is unchanged and it is PROVED, not asserted**: `nextActionOf` kept its signature and became Layer 2 over Layer 1, which makes its whole existing suite the parity oracle — Loo's freeze gate, the T3 radar, T7's date split, C5's money hold, every tone, 103 assertions, all green across the split and none rewritten. **What it unhides**, measured live rather than predicted (56 orders · 0 delivered · **0 confirmed bookings** · 51 with logistics): the delivery call now sits BESIDE the supplier call instead of behind it, and `Assign logistics` stopped waiting for stock its own trigger never mentioned — a queue you cannot enter until the goods arrive is a queue that is always late. **The one row headline that changes**: money is its own track and SURVIVES delivery (§3), so a delivered order that still owes reads `Collect RM … from {customer}` where it read `Done`; live there are 0 delivered orders, so no row moved on the day — but the row's line builder had to start passing the amount, or the new headline would have named no figure. **The drawer's checklist carries no control, and that is the feature** — no button, no checkbox, asserted by a test: an action leaves when the SYSTEM measures its completion, and it is built from the same call as the row's pill, so its first row IS that pill structurally rather than by careful agreement. **Also fixed, handed over mid-build by PR #464**: the `To book` predicate demanded stock be IN as well as the customer confirmed, so an order whose customer had already confirmed sat in a queue with nothing left to book. **Five findings reported not fixed** (4 are law contradictions): COPY-STANDARD's queue table states a TRIGGER that contradicts the working flow and Law 1 · `Confirm delivery with {customer}` is ranked by Law 4 nowhere, listed by §3 nowhere, is not one of the five verbs, and is the one row in the drawer's list **no button in the portal closes** · Law 4 rung 2 and §4 rung 2 name different parties for the same rung · Law 4 rung 1 names a failed-delivery follow-up that does not exist · **no action has a Task Owner**, which Law 2 requires and C6 will need. Suites at baseline (shared 1763/1763 · api 3 · web 16). Full entry → worklog.
- **2026-07-27** · **Portal Core C1 — the words name the party, and Chase is gone** (PR #461 merge `d1d640f2`, no migration, web `index-84fbCu41.js` [carres-portal `2fc26610` + carres-pos `71626c49`, 4 canonicals ✓ first poll] + Worker `8ac7c764` — DEPLOYED) — every visible action label on Orders, its queues, its drawer and the Delivery module now reads verb + named party + measurable object. **The structural part is that an action carries TWO strings**: a party-free **queue word** (`Confirm delivery date`) for the facet row, the filter chip and the count, and a party-named **row line** (`Call NETS — confirm delivery date`) for one order — a queue holds many suppliers so it cannot name one, a row shows a single order so it must. Both come from ONE module (`packages/shared/order-action-words.ts`), so a queue and a row **structurally cannot spell one action two ways**; `nextActionOf` gained a stable `key` so the counts, the filter state and `data-next-action` keep keying on a word that never moves. **A FACT slot gets the action WITHOUT its verb** (`NETS — confirm delivery date`) because its neighbours in that cell are facts too — which is how T1's leftover closed: the drawer still rendered `Unscheduled` in TWO places, and the replacement is NOT T1's `need booking` (Jess struck it — "need" is a to-do hiding inside a fact). **The drawer had NO test file at all**, which is exactly why the badge survived a week: `OrderDocuments`, `BookingSpine` and `OrderJourneyHeader` each guard THEMSELVES and it sat outside all three — so its new guard is a SOURCE scan, not a render test (a render test only sees the branches its fixture reaches, and the file is 7,000 lines of branches); it found the last two live `Chase` strings on its first run. **Three things deliberately NOT built and reported in the card instead**: the three-dot column (`rowDotsOf` is computed and rendered by nothing — there was no header to remove, and building the dots is a feature for Jess); the `To book` predicate (wider than the word — an order whose customer HAS confirmed but whose goods are not in also lands there; live it cannot happen, **0 of 55 control rows carry a confirmed booking**); and the drawer's own `Scheduled`, which means `operation_stage = dispatched|ready_to_dispatch` — a different state from the list's tab, and one word for two states is the worse error. Also fixed on lines the card was already rewriting: a **Chinese string** in the bulk bar (`before收货日` — the UI is English only) and a **column header that existed twice**, which is how `Manage` survived in the `<th>` while the Columns popover already read from the def. The `Waiting` contradiction C1 was about to report had already been ruled by a parallel line mid-build, so the finding was deleted rather than shipped stale. Suites at baseline (shared 1726/1726 · api 3 · web 16). Full entry → worklog.
- **2026-07-27** · **Service Case S3 — the case drives the follow-ups** (PR #431, migration **0293 applied**, Worker `ccc9616a` + web `index-DEsBDZHt.js` — DEPLOYED) — the card says the system "creates" the next steps; what shipped is stronger: they are **DERIVED** from question 5 of the intake (`packages/shared/service-case-plan.ts`), so there is no task row to forget, delete, or leave pointing at an edited answer. Only the OUTCOMES are stored (`service_cases.progress` — the business date, stamped server-side with who recorded it), so **nothing here is a tick-box**: a step closes because a date exists. **The live finding that made the labels real**: prod holds 0 purchase orders, so `source_po` names nobody — but 200 of 205 `product_skus` carry a supplier, so the factory is resolved from the SKU at intake and snapshotted, and the action reads `Call Ohana — confirm the repair date`. Close is gated twice: the API refuses with 422 `case_steps_open` naming every open step, and 0293's trigger holds the half SQL can hold alone (no `customer_confirmed` entry → the TRANSITION into a closed status is refused; already-closed cases stay editable, which is why the one live case survives). **Two of Law 2's six things are deliberately absent and reported, not hidden**: no deadline (S4 owns the SLA — nothing in S3 turns red) and no per-step owner (nothing assigns a PIC). No supplier-claim row is minted: R2/R3's claim is keyed to a PO LINE and a complaint has no PO. **Guardrail #8 fired**: drafted 0291, renumbered to 0293 when the pre-apply check found parallel lines had taken 0291/0292; the md5(prosrc) reconcile then caught that the applied payload had dropped a function's inline comments, re-applied to match. Full entry → worklog.
- **2026-07-27** · **Portal Core C5 — the money gate reads the number that exists** (PR #447, no migration) — three surfaces asked what an order still owes and each pointed at a column nobody writes: the ladder's 🔒 read `ops_order_control.balance` (**NULL on all 55 control rows**, so the hold had never fired while 18 orders owed RM 56,859), `bookingConfirmGate` summed `order_payments` (**0 rows**, so "collected" was RM 0 and every priced order's booking was refused — SO-1209, RM 7,248 paid of RM 7,248, blocked for money), and the Payments desk netted that empty ledger against that NULL balance and computed RM 0 owing for everybody. One root cause, two opposite symptoms. `packages/shared/order-money.ts` is now the ONE rule with **FOUR** readers — the card named three and missed the DRAWER, the surface an operator actually reads, which showed `HOLD DELIVERY` on a paid-in-full order. **Three premises corrected by measuring prod, not assuming**: (1) `order_payments` is not writer-less but EMPTY — the drawer's Record-payment form and the raw-create door both write it, and the raw-create door writes the same deposit into `orders.paid` too, **which is exactly why the two stores may never be summed** (it would report a half-paid order as settled); (2) `ops_order_control.balance` means what the customer STILL OWES (0165), not the total — the booking gate was reading it as a total and subtracting collected from it; (3) the queue index predicted 18 orders would leave the Delivery board, and none do — all 55 rows are `booking_stage='none'`, so the ladder returns `Chase logistic` and never reaches the money rung. **What actually changes**: the **Owing facet row appears at all** (`Owing · 18 · RM 56,859` — it renders only above zero and the count was always zero), the `Collect $` pill, the Payments queue (real figures, was empty), the drawer's Outstanding, and the gate's money answer. **A claim I had to correct on myself**: I first reported the money DOT turning red — grepping the shipped bundle for its strings returned 0, because `rowDotsOf` is exported and unit-tested but nothing renders it (the Status column shows a stage-word pill). Dead code, left in place and filed as a CF; deleting an exported function is Jess's call. SO-1209's money gate passes; **its booking is still refused for GOODS** (0 units reserved) — the goods half doing its job. Suites at baseline (shared 1623/1623 incl. +14 · api 3 · web 16); 2 new CFs, both about the ledger seam C5 deliberately left open.
- **2026-07-27** · **Delivery T11 — the module page, and line ① ENDS** (PR #425 merge `61d93c20`, Worker `e98f507f` + web `index-DiH5MOAK.js` — DEPLOYED, no migration) — the 3-pane Delivery page and **the ONE new sidebar item the whole plan gets**. Assembly, so the only real invention is the RANKING: the Orders list sorts by the order's overall slack, which puts an unordered mattress above a confirmed delivery going out tomorrow, so `packages/shared/delivery-board.ts` (11 tests) sorts by DELIVERY risk — late · nearest deadline · nearest truck day — and **a row with no anchor sorts LAST** (T7's "a step that cannot be late is not urgent", as an ordering). **The module writes NOTHING**: a second confirm button would mean a second set of gates to keep in step with the server's, so the detail pane states facts and `Open order` mounts the same drawer. **Scope is the ladder, not a status column** — one imported `nextActionOf`, so the two pages structurally cannot name an order differently and C1/C2's rewrites reach this page for free; a money-held order is absent without any rule saying so. Queue-less orders are still built, because the calendar shows every booked truck and clicking a held one must not open a blank. Words: none added — the queue labels come from the shared constant (inventing `Assign logistics` here would be rule 8's failure with its own menu item), and T10's three banned strings were fixed AT SOURCE instead. Full entry → worklog.
- **2026-07-27** · **HR Commission = one door · attribution deleted whole** (PR #430 merge `9f0f33c4` web `index-Q8NddHf3.js` + Worker `7ac6ca26`; PR #435 merge `2fe10f17` web `index-CLIOk_2y.js` + Worker `9c4de3ce`; migration **0296 applied** — all DEPLOYED) — the HR rail drops from 8 items to 6. Commission Setup folds into Commission as a sub-tab (Earnings · Setup), the Stock-K0 merge shape; both `?tab=` values unchanged so every deep link still lands. Then Loo ruled attribution out entirely — **19 native orders carry a salesperson, 0 do not; the 37 without one are autocount archive due for deletion** — so the worklist, banner, todo, client hook, zod input, `POST /api/hr/assign` and the **blocking** readiness check all went. **The API had to ship with the web and nearly did not**: readiness `detail` strings are computed server-side (`commissionReadiness` greps **0** in the web bundle), so a web-only deploy would have left the live pre-flight pointing at a tab that no longer exists. 0296 then moved the rule into the database. **Its dry run caught a real defect in my own constraint** — `source_system = 'autocount'` against NULL yields NULL, `false OR NULL` is NULL, and **a CHECK accepts NULL**, so it would have guarded nothing; `coalesce` fixed it. **A second trap avoided by reading the code, not assuming**: the exemption could not be `IS NOT NULL` because `create_rental_agreement` writes `source_system = 'rental'` — the loose form would have exempted exactly the path whose parameter DEFAULTs to NULL. **And the sanity block caught itself**: its first form matched the new function’s own comment about the removed gate and aborted a correct migration (verified total rollback before re-applying). Both live write paths now map `23514` to a plain 422 so a store never meets a raw constraint string. Full entry → worklog.
- **2026-07-27** · **Late interest, and paying the whole thing off early** (PR #463 merge `48262309`, migration **0300 applied**, Worker `ea4889b3` + web `index-DNmwKQrc.js` — DEPLOYED, 4 canonicals first poll) — Loo: "先做罚息 + 买断结清，一个 PR", taken against my advice to wait for a real signup first. Both were **empty shells**: `buyout_at`/`buyout_amount`/`buyout_pending` since 0249, `late_interest`/`interest_charged_at` since 0281, **0 rows, 0 RPCs, and `rentalLateInterest()` with zero callers outside its own test**. **ACCRUED vs CHARGED is the whole design** — interest grows daily, so a stored figure is wrong tomorrow (the trap `late` and `Card declined` already avoid); accrued is derived on the read, and only what a human CHARGED is written. **0281's one-writer law survives with a named seam**: the interest RPC touches exactly two columns (asserted it can never write status/paid_amount/the split) and the settlement writes `rental_billings` NOT AT ALL — it calls `rental_record_payment` per month, which is the point, not a workaround: one split, one history, and each month genuinely was paid. **The split is on RENT** (49% of a customer's punishment is undecided policy) and **a discounted settlement is REFUSED with the real figure** rather than allocated by guess. **No document, no settlement** — 0279's discipline. **Two defects caught in my own migration pre-apply**: the writer-count assertion forgot the interest RPC is itself a writer, and the settlement looped a cursor over rows its body mutates (now an array). 21 assertions on live prod rolled back; md5 reconcile **byte-identical on all four functions** this time, because the apply payload was the file. NOT built: pushing the penalty onto a Stripe invoice — 0 of 1 agreements has a subscription, so it is unverifiable (CF). Full entry → worklog.
- **2026-07-27** · **The webhook was reading the wrong invoice shape** (PR #457 merge `9b73fb17`, no migration, Worker `2a0b5707` — DEPLOYED, api only) — found in the Stripe dashboard minutes after 0295 shipped: the endpoint is pinned to **`2025-02-24.acacia`** while our SDK is v22 (Basil-era), and **Stripe shapes the payload to the ENDPOINT's version, not the SDK's**. Basil is where `invoice.subscription` became `parent.subscription_details.subscription` — so 0281's `invoice.paid` branch AND 0295's new one, both reading only `invoice.parent`, resolved every real invoice to `not_a_subscription_invoice`, returned a cheerful 200 and dropped it. 0281's own comment (“SDK v22 moved this: `invoice.subscription` is gone”) was true of the TYPES and false of the WIRE. Fix reads **both** shapes rather than deciding which release moved it — correct either way and survives an endpoint upgrade. **It reached production because 0281 shipped that branch with NO test**; coverage added for both events × both shapes, with a **negative control** (remove the fallback → exactly the 3 legacy tests fail). Also learned: the CARRESS Stripe account still runs the **old carressglobal system's live subscriptions** (RM29/RM129 a month, contracts to 2030/2032) — safely ignored by construction. Still open and not code: the endpoint lists **3 events**, we handle **5**. Full entry → worklog.
- **2026-07-27** · **A bounced card stops being invisible** (PR #439 merge `afcaf12e`, migration **0295 applied**, Worker `571ee2e3` + web `index-BUVL2ge4.js` — DEPLOYED, 4 canonicals first poll) — 0281 built the ledger for money IN and handled `invoice.paid` only, so a refused card wrote **nothing**: the month read `Due`, then `Past due` — the same two words as a month we had not billed yet, when the two need opposite actions. **A decline does not touch `rental_billings`**: 0281 gave that table one writer, and `overdue` would be a second source of truth for lateness the read already derives (a card can also decline ON the due date). **Idempotency keys on Stripe's EVENT id, not the invoice** — Smart Retries fire a genuinely new event per attempt, so three refusals are three rows while one event delivered thrice is one. A refusal matching no instalment still lands, against the agreement with a null billing. **The list badge is the feature, not polish** — a drawer nobody suspects is not "finance can see it"; a `security_invoker` view answers the list's one grouped question, and `undefined` prints nothing rather than a reassuring zero. **Found live: the agreement-wording CF was already fixed** (template v1 is published, so rental signup was never still blocked) and the reject-cancels-order CF was closed by 0275 and never de-indexed. **The first dry run failed correctly** — it pinned `seq 1` and a human had collected seq 1 by hand that morning. **The md5 reconcile caught the apply having stripped the body comments** (second time it has earned its keep). **A test lied for one run**: `declineMessageOf` sat in the wholly-mocked `lib/stripe`, so it was `undefined`, threw, and the route's own guard swallowed it — moved into the route. Also deletes `RentToOwnPage` (+test) on Loo's word. **Inert until the Stripe endpoint is subscribed to `invoice.payment_failed`** (new CF). Full entry → worklog.
- **2026-07-27** · **the attribution leftovers go too** (migration **0297 applied**) — three remnants still carried a concept the portal no longer has. `commission_run_state` was computing an `unattributed` count on every pre-flight that nothing had read since #435 (and that 0296 makes provably 0); rewritten without it, **STABLE marker kept** (§8 fix 3). `hr-runs.ts` was mapping `unattributed_orders` to a 422 — **verified live: zero functions in the database mention it** since 0296, so it was dead code pointing at a dead gate. And three comments had started lying ("surfaced separately", "its own worklist"). `GET /api/hr/report` stops forwarding the array; `HrUnattributedOrder` deleted. **Deliberately left**: `hr_commission_source` still builds the array — its `legacyUnattributed` sibling is still read, the array is `[]` by construction, and rewriting a 6.6k-char function feeding every HR screen to delete a free key is the worse trade. Full entry → worklog.
- **2026-07-27** · **Delivery T10 — the calendar reads the booking, not the promise** (PR #413 merge `7f7c676b`, web `index-CD_Zji_Q.js` — DEPLOYED, no migration, no API change) — **there was no calendar to build: the calendar WAS the second store the card warns about.** The right-rail Calendar's Deliveries lens had bucketed orders by `orders.delivery_date` (the date we PROMISED) since 2026-07-23, and that is not when a truck moves — since D1 (0277) the truck's day is the booking, and the two diverge the moment anything is rescheduled. Fixed structurally: `bookingDayOf` (`packages/shared/delivery-calendar.ts`, 34 tests) is the ONE rule, and `logisticStateOf` (the Orders list Delivery column) delegates to it — two surfaces, one rule, so they cannot put an order on two different days. **The live finding that shaped the screen: the DB holds ZERO bookings** (0 confirmed, 0 provisional across 55 control rows) **and 52 promised dates** — reading only the booking would have emptied the calendar and read as broken, so the promise stays as a separate `Promised this day, needs a date` block carrying `Call {customer} — book delivery date`, never counted as a delivery. `This week` = the REST of the week (ends Saturday; Sunday is refused for every carrier). T9 lands on the day: **only CONFIRMED bookings fill a carrier's limit** (a provisional date is not a promise), and **Sunday is deliberately silent as a carrier rule** — all 8 carriers hold the default `off_days [0]`, so voicing it would blame them for a rule none set. **Deploy note: web only, on purpose** — the union tip carried a parallel line's API whose migration (`0289_service_case_evidence`, then numbered 0288) is NOT applied in prod. Full entry → worklog.
- **2026-07-27** · **Delivery T7 — queue split + auto-overdue** (PR #386 merge `984d9d0b`, Worker `f96b3e19` + web `index-ChJLxdiq.js` — DEPLOYED, no migration) — the delivery lifecycle becomes FOUR queues in their own DELIVERY facet group, each with its OWN deadline so an item turns late by itself (assign = date−3 working days · chase = −1 · deliver = the confirmed date · photo = delivered+1). **L3 was already built** — the card wanted working days and said the engine ships in T9/T10, but `working-days.ts` + `my-holidays.ts` shipped with procurement 2026-07-21, so T7 needed a consumer not an engine; the math went to a new pure `packages/shared/delivery-queue.ts` (18 tests) so T10/T11 read ONE rule. Two ladder rungs make the queues real NEXT verbs: a confirmed booking splits by its date (today → `Deliver today`; **passed with no delivery → `Chase logistic` red** — the auto-overdue, a hole D1 created because the frozen past-deadline escalation only ever fired on UNCONFIRMED rows), and **a delivered order with an empty photo ledger is not `Done`** (amber never red per guardrail #2; its queue spans CLOSED orders, the second after Owing). **Two of the card's own words deliberately NOT built**: `Confirm booking` (a second word for the live locked `Chase logistic` — rule 8) and L1's `Issue DO` (`do_number` is 0098-trigger-stamped, so nobody issues one). Degrades instead of lying: absent `delivery_photos` = UNKNOWN not "no photo"; TBD date = no anchor = never late. Also de-fused a test fixture hardcoding `2026-08-01` that would have silently tested a different rung after that day. Full entry → worklog.
- **2026-07-27** · **Service Case S5 — the numbers, and the column that was refused rather than deferred** (PR #474, **NO migration**, Worker `<pending>` + web `<pending>`) — **line ③ ENDS (S1-S5)**. The Numbers tab: one sentence, Jess's own per-category-per-month hand count, and the two rankings the card's Done-when asks for. **The carry-forward `case-sla-no-closed-at` was closed WITHOUT the column it demanded** — its premise held for the STATUS FLIP and not for the case: S3 (0293) made closing impossible without a `customer_confirmed` entry, and that entry already carries `on`, the BUSINESS date the customer said it was solved, stamped server-side. `closed_at` would have recorded the afternoon somebody changed a dropdown; the confirm date records the day the problem stopped, which is the module's own law ("a case is finished when the customer is"). **The backfill the CF proposed is exactly what was refused** — filling it from `updated_at` puts a row-touch into a business figure and calls it "approximate". **Every figure carries its own coverage and withholds itself with a stated reason**, because live there is ONE case: closed, opened 2026-06-16, filed before S1 — so an average would be invented and an on-time rate a coin toss. **`unclassified` is a first-class rung, not `other`** (`other` is an answer a human picks; "nobody was asked" is a different fact, and folding them would tell Jess her staff keep choosing Other). **The card's `SLA hit rate` is the one line not built as written** — the same ruling S4 made, since COPY-STANDARD bans `At Risk` and lists `SLA` as do-not-use; the behaviour is the card's and the words are the laws' (`Finished on time` · `Average working days to finish`), asserted against the banned list. Days are WORKING days so the average reads against the 14-working-day promise directly. **S4's hidden `responsibility` per delay reason is finally READ** — "why they ran long" needed no second tagging pass, exactly as S4 predicted. Two real defects caught by the tests rather than shipped: narrowing to a month blanked the panel including the strip used to narrow (`keepPreviousData`), and a `beforeEach` returning `mockReset()`'s value handed vitest a TEARDOWN — it called `apiFetch()` after the test and left the rejection unhandled. **Prod was NOT re-measured this session**: the Supabase MCP in the build environment is authorised to a different account and has no access to `kfprgpjpaffedghytstl`; S5 writes nothing, so the exposure is a stale sentence in a doc, not a wrong row. Suites at baseline (shared 1788/1788 incl. +25 · api 3 · web 16).
- **2026-07-27** · **Service Case S4 — the deadline, and nobody passes it silently** (PR #449 merge `b981558a`, migration **0298 applied**, Worker `ce4f4c9e` + web `index-Ds-5K6Ke.js` — DEPLOYED) — every case is finished within 14 WORKING days of the day it was reported; four working days before that, the portal asks for one thing: `Call {customer} — say why it is taking longer`, with a reason picked from a locked list of seven. **The deadline is DERIVED, never stored** (the S3 law applied to the clock) — `opened_at + 14 working days` off the same working-day engine procurement and delivery T7 share, so there is no column to disagree with the rule and a holiday-calendar correction fixes every case at once. **The card's own `⚠ SLA at risk` is the one line not built as written**: COPY-STANDARD bans `At Risk` outright and lists `SLA` as a do-not-use, and the four laws outrank a card — so the behaviour is the card's and the words are the laws' (FACT = the date + `4 working days left` / `2 working days late`; ACTION = the Call), asserted by a test against the banned list. **Every event carries the deadline it was made against** (`due`; an extension's `until`) — "the customer has been told" is only true about ONE deadline, and without that field moving the deadline would mark the new one as already explained, leaving the extended case as the only case that never gets the second call. The extension's LENGTH was a decision the card did not make: bounded at one more period measured against the BASE deadline so it cannot be walked forward, and a Sunday/holiday date moves to the next working day BEFORE the bound is checked. The reason list is deliberately NOT narrowed to special-order parts (refusing every other true reason only gets the deadline moved under a false one). **The md5 reconcile earned its keep a third time** — the applied payload had dropped two comment lines from inside a function body; re-applied to match the file. Full entry → worklog.
- **2026-07-27** · **Service Case S2 — no evidence, no case** (PR #410 + renumber #419, migration **0289 applied**, Worker `0cd3106b` + web `index-CD_Zji_Q.js` — DEPLOYED) — the answer to "what's wrong" now decides which photos the case cannot be filed without. Checklist = ONE shared constant (`service-case-evidence.ts`), **deliberately not mirrored in SQL** (unlike 0285's flat key lists it is a function of two answers plus per-slot counts — a copy would drift, not mirror). **The card's Colour-uneven example is implemented verbatim except one line**: a customer WhatsApp screenshot cannot exist when the WAREHOUSE found the fault, and a required item nobody can produce teaches staff to upload a junk photo — so a rule may name its `reporters`, asserted satisfiable for all 7 × 5 combinations. Carton photo optional everywhere for the same reason. **The gate is the server's**, recomputed from the same function the disabled button asks (422 `evidence_missing`, naming what is short); the client is not trusted with the stamp, the file kind or the object key. DB holds the two parts it can hold alone — the stamp (CHECK refuses an entry missing who/when) and a floor strictly WEAKER than the API checklist. **The dry run caught a defect in my own migration**: CHECKs evaluate in unspecified order and `jsonb_array_length()` on a non-array raises 22023, not a check violation, so the floor crashed before the well-formed check could refuse — one `jsonb_typeof` guard. Full entry → worklog.
- **2026-07-27** · **Ready Stock K5 — the review layer says what it does not know** (PR #451 merge `d61a3867`, **NO migration**, Worker `6a4a9b5c` + web `index-CKQhEuFh.js` — DEPLOYED, 4 canonicals first poll) — **line ⑤ ENDS (K0-K5)**. The digest sits FIRST on the Ready stock tab: one sentence, five counts, every SKU row behind a click — the card's own "without reading SKU rows", made literal. **K5 mints nothing**: the ladder reads K1's reorder points (when to BUY) and K4's reserve levels (how low it may GO), the accuracy reads K2's cycles, and the route calls **no RPC** (asserted). `low` is not a second buy signal — it IS K1's alert, read. **Built the obvious way this card lies TWICE**, and the live data is why: 49 warehouse SKUs, **zero with a single real sale**, seven days of real records, zero configured numbers — so "no sales in 90 days" is true of ALL 49 (a list that names everything names nothing), and a run-rate `over-stocked` rung reads 0 units/month for every SKU, putting the whole floor on 🟠. Four gates follow and **all four heal by themselves**: the ladder reads HUMAN numbers · the 90/180-day alerts wait until the records SPAN them, and a never-sold SKU is reported quiet for exactly `coverage.days`, never longer than we can see · `unrated` is a first-class rung ("Set a number" — today's honest headline is *49 items still need a number*, not 49 green ticks) · a month still RUNNING gets no percentage (HR-P7's law), though the ask and the order still print. **A WINDOW is not a HISTORY**: the route fetches 200 days of lines and tells the engine where that window ENDS, because unattended the coverage is wrong in BOTH directions — a SKU that really sold 200 days ago looks never-sold, and the window's own oldest row becomes "when our records start", switching the 90-day alert on the day the window does. **The live trap**: every native order carries a **NULL** `source_system` and only the AutoCount import fills it, so the archive probe had to be `is.null OR neq.autocount` — the obvious `not.eq.autocount` drops NULLs and returns NOTHING, reporting a company with no sales history at all. Also deduped the month formatter into `fmtMonth` rather than shipping a second private copy beside K2's. Tests +53 (shared 30 · api 10 · web 13); suites at baseline (shared 1639/1639 · api 3 · web 16). Full entry → worklog.
- **2026-07-27** · **Receiving R4 — problem stock is quarantined** (PR #454 merge `b059e2a5`, migration **0299** applied, Worker `19a94f44` + web `index-CyW_vWlS.js` — DEPLOYED) — damaged and wrong units now flip `incoming → on_hold` under the claim that is chasing them, and the card's "provably" is a property of the TABLE. **The guard asks WHERE a unit is going, never WHO is writing**: `ops_stock_items` has a blanket internal write policy and three live PostgREST paths write `status`, so a rule inside one RPC is a rule one call walks around — and revoking column-level UPDATE would have broken the sofa-loan lane. `on_hold` may reach free/returned/written_off and can never reach `reserved`, `sold` or `transferred`. **The read side needed no change at all** — every pick already filters `status='free'` and the rollup counts only free+reserved. **R1's leftover was worse than invisible**: a broken unit stayed `incoming` forever, and both the reorder engine and the ready-stock plan read `incoming` as "on the way", so a unit that will never come was inflating future supply. **Holding the units also broke the replacement DO** — nothing `incoming` left to flip, so the register would have drifted below `stock_balances` and the next rollup would take the goods back off; the receive now mints the shortfall (own warehouses only). Reported not hidden: a PO made good by a RELEASE stays `open` (pre-existing R1 shape — only the receive RPC closes a PO), so **R5 must read the claim's `closed_at`, never `purchase_orders.status`**. 18 assertions on live in a rolled-back txn before apply; md5 reconcile matched all three functions byte-for-byte. Guardrail #8 fired (0298 → 0299). Full entry → worklog.
- **2026-07-27** · **Ready Stock K4 — the pool says why it drained** (PR #434 merge `dc20c864`, migrations **0292** + **0294** applied, Worker `f5066b58` + web `index-DrTHyYvy.js` — **DEPLOYED**) — every draw off the shared ready pool now names a reason from Jess's locked five, each SKU carries a COO-set floor that REMINDS and never refuses, and the month's split sits under the plan on the Ready stock tab. **The reason is a dated LEDGER, not the column that already existed**: `ops_stock_items.reserve_reason` (0213) is overwritten on re-draw, carries no date and leaves with the unit — measured at **0 non-null values across 87 records**, so nothing was lost and the column was left untouched (CF, not a drop). **Not `stock_movements` either, checked not assumed**: 0 rows, no reserve has ever written it, and its blanket INSERT policy would let any client write or skip the reason. **The draw and the reason are ONE transaction** — 0213 stamped it best-effort AFTER the reserve, so a failed stamp left an unexplained unit; `ops_stock_pool_draw` serves BOTH reserve doors so there is one ledger writer, and the routes' 404/409 contracts survive byte-for-byte. **THREE doors, not two**: `Takeout` is offered on a FREE row, so 0294 requires a reason there and records none from RESERVED (already in the ledger) — leaving that open behind a CF would have looked disciplined and behaved like a trap. **Reserve levels are their own table** because `ops_reorder_points.reorder_point` is NOT NULL and 0 means "alert OFF", so a placeholder row would silently flip K1's "Set a number" to "watched and fine". **Warns, never blocks — enforced by absence**: nothing disables anything on a reserve level; only a missing reason dims a button. ZERO new duty keys (asserted). **Guardrail #8 fired TWICE** (0291 → supplier claims, 0293 → service-case follow-ups), hence 0292 + 0294. Full entry → worklog.
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

- `order-payments-ledger-has-no-reader` — C5 took every money gate off the empty `order_payments` ledger, but that ledger DOES have two writers, so the drawer's Record-payment button now moves nothing. Never used in production (0 rows); fix = the Payments card makes that route write `orders.paid` too, in one audited RPC. Do NOT fix it by summing the ledger — the raw-create door double-writes.
- `order-money-keyed-balance-unreachable` — `orderMoney`'s imported-row fallback has 0 live rows to exercise it (`balance` NULL ×55). Unit-tested, never run for real; check its two judgement calls against the first imported order that carries a keyed balance.
- `rental-dunning-has-no-send-channel` — segment 2b is BLOCKED: no message-sending integration exists anywhere in apps/api, so the Day 3/7/21 rungs cannot be built. Loo: skip for now.
- `rental-payment-failed-event-not-subscribed` — **the collection engine has almost certainly never fired**: the live endpoint says “Listening to 3 events” and the code handles 5, so `invoice.paid` (0281) looks unsubscribed too — which is exactly what a `rental_billing_events` holding one hand-entered row means. Tick both `invoice.paid` and `invoice.payment_failed` in the Stripe dashboard; no code. Not checkable from a session (MCP key refused on `GetWebhookEndpoints`). Expect old-system traffic once `invoice.paid` is on — the CARRESS account still runs carressglobal's live subscriptions, correctly answered `ignored: unknown_subscription`.
- `api-typecheck-hr-assign-salesperson-dead-import` — api `tsc` baseline moved 4 → 6 on 2026-07-27: #440 left `hr.ts` importing `hrAssignSalespersonInput`, no longer exported by shared. Runtime-harmless (unused, esbuild drops it; wrangler dry-run clean) but it buries the next real type error.
- `rental-two-calendar-implementations` — the due-date rule lives twice (shared TS + SQL) because the DB cannot import TS; both assert the same worked example, change one and the other fails.
- `rental-interest-daily-vs-whole-month` — **now load-bearing** (0300 gave the arithmetic a caller): 8%/month accrues pro-rata by day; the harsher "per month or part thereof" reading is a one-line change in BOTH `rentalLateInterest` and the SQL mirror. Worth Loo's word now a button exists.
- `rental-interest-not-pushed-to-stripe` — 0300 records the penalty, does not bill it: no live agreement has a Stripe subscription (0 of 1), so the invoice-item path is unverifiable. Ledger half shipped; wire the push when a real subscription exists, keyed to the event so a retry cannot double-bill.
- `rental-settlement-discount-undecided` — a settlement must be the FULL remaining amount or it is refused with the real figure. How a discount spreads across N months and two payees is undecided, and a guess would short the supplier's 49%.
- `rental-buyout-pending-status-unused` — 0300 does not use 0249's `buyout_pending`: signing first makes settlement one act with a precondition, not a dwell state. The value stays in the CHECK.
- `rental-ra1003-old-calendar` — RA-1003 keeps its pre-0281 dates (the 26th) and has no Stripe subscription; Loo confirmed it is testimony data and deliberately not re-anchored.
- `rental-first-month-vs-billing-row` — Stripe collects month 1 at checkout but `rental_billings` seq 1 stays `due` until ②'s invoice.paid engine (catch up by stripe_invoice_id).
- `rental-billing-anchor-drift` — our schedule anchors on start_date, Stripe on checkout completion; ② reconciles by stripe_invoice_id.
- `rental-agreement-store-read` — store JWTs can't read agreements yet (sell lane holds the RPC payload; checkout = service client + explicit Hono ownership); "My rentals" list needs a dealer-scoped RLS read later.
- `guarantee-service-two-registries` — a sellable care plan is a `guarantee_terms` row (0274) but the RENTAL-included package still lives in `service_packages`; two registries for one concept. Firm fix + interim rule in the doc.
- `guarantee-recurring-no-visit-schedule` — 0274 counts visits REMAINING but not when they are DUE; nothing can say "this customer is owed a clean this month". Fine for authoring/pilot; needs a due date before volume.
- `rental-hq-direct-no-longer-allowed` — 0275 refuses a dealer-less rental (it mints an order, and `orders.dealer_id` is NOT NULL). Deliberate narrowing; if wanted back, add a real "Carres HQ" dealer row rather than making the column nullable.
- `rental-order-total-is-zero` — a rental SO's total is 0 by design (money lives in `rental_billings`), so it contributes nothing to sales/AR/margin reports and prints RM0 unless the template reads `attrs.rental`.
- `rental-signer-name-not-editable` — the API and DB accept a signer different from the customer (spouse/guardian) but the POS always sends the customer's name; no field asks. Add one input on the rental confirm step when a real case appears.
- `rental-signed-doc-pdf-not-archived` — 0279 captures the SIGNATURE; `signed_doc_path` (the filled, rendered agreement PDF) still has no writer, so the archive holds the drawing and the version number, not the printed contract.
- `rental-signed-nric-no-reveal-audit` — `signed_nric` is PDPA-sensitive and the approver reads it in clear; HR-P4 already built reveal-with-audit for exactly this shape. Reuse it before real NRICs land.
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

- `case-sla-deadline-only-for-open-cases` — the S4 deadline derives from `opened_at`, which the edit modal lets anyone change: moving Opened moves the deadline silently, with no record, unlike the one audited extension. Bounded today (1 case on file); fix = make it read-only after day one, or log the change as an sla event.
- `case-evidence-abandoned-draft-orphans` — an abandoned S2 wizard leaves its uploads under `draft/{id}/` in the private evidence bucket with nothing referencing them. Bounded (private, 25 MB cap, one complaint at a time) but monotonic; fix = a `draft/` sweep, NOT a move-on-create (a mover adds a failure mode between "bytes uploaded" and "case filed").
- `case-evidence-prose-path-ungated` — the S2 gate binds to `issue_type`, not to the endpoint, so a create with no issue type demands no evidence (deliberate — the edit modal's prose-only path). Also: PATCHing an issue type onto a legacy evidence-less case now violates 0289's floor CHECK; no live path does it.
- `hold-release-does-not-close-the-po` — **R5 must know this**: R4's `back_to_stock` frees the quarantined unit but never raises `received_qty`, so a PO made good by a RELEASE (rather than by a replacement delivery) stays `open` forever. Pre-existing R1 shape — only the receive RPC has ever closed a PO. R5's on-time % must read the claim's `closed_at`, never `purchase_orders.status`.
- `hold-resolution-is-per-claim-not-per-unit` — `ops_stock_resolve_hold` moves EVERY unit of a claim to ONE outcome; "supplier took 2 back, we scrapped 1" cannot be recorded as it happened. Fix = an optional `p_item_ids` narrowing the same predicate + checkboxes; no schema change.

**LOW**: ~30 entries (rental/bundle/sofa/POS polish, test coverage, doc vocab, deferred renames) — slugs + full text in [`docs/carry-forwards.md`](docs/carry-forwards.md). Notable: `hold-entry-only-from-incoming` (a fault found AFTER receiving has no supplier-claim route — it is a service case; settle the entry rule and the refurbish door together if that changes) · `sofa-engine-roadmap-remaining-phases` (engine LIVE; deferred: recliner, group-drag, promo, bedframe) · `phase-11-deploy-verify-branch-has-latest` (pre-deploy `git log HEAD..origin/main` check) · `pos-live-smoke` (Loo manual smoke list) · `hr-source-builds-a-dead-unattributed-array` (an `unattributed` array nothing reads and 0296 makes empty by construction; delete the key next time that 6.6k-char RPC is opened for a real reason).

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

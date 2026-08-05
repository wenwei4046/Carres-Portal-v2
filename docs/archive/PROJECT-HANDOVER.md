# Carres Portal v2 — Project Handover

> **Purpose of this document:** a complete, self-contained briefing so another AI (or engineer) can understand this project without reading any prior conversation. Assumes zero prior knowledge.
>
> Last compiled: 2026-07-22. Source of truth for anything not covered here: `CLAUDE.md` (repo root, project rules) and `CARRES_PORTAL_V2_PLAN.md` (master plan).

---

## 1. Project Overview

### What it is
**Carres Portal v2** is a full rewrite of an internal multi-role ERP / operations web portal for **Carres** (furniture retail — mattresses, bed frames, sofas), operated by **HOUZS Venture Sdn Bhd** in Malaysia. v1 is in production but holds only test data, so there is no legacy data to preserve — v2 is a clean rebuild.

It is a single web application that presents **different portals to different roles**, all backed by one database.

### Business purpose
Carres runs a furniture business across three parallel "tracks" (the mental model everyone uses):

```
货 (Goods)  →  送 (Delivery)  →  钱 (Money)
procurement /    logistics /       payment collection /
production       partner delivery   finance
```

The portal digitises the whole order lifecycle: a dealer or showroom places an order → operations sources/produces the goods → a logistics partner delivers → finance collects payment. It replaces a sprawl of Excel sheets (a "Master Sheet", "NETS sheet", "Stock sheet", etc.).

A guiding design principle from the business owner: **the portal must lead an inexperienced new hire step by step** — tell them *what to do today, how many, who, when, at what price* — pre-computed, so the person just clicks. It is a "what to do today" worklist, not a passive dashboard.

### Target users (roles)
The system has **9 roles**, each with its own portal view:

| Role | Who | What they do |
|---|---|---|
| **Dealer** | External resellers | Place orders via a POS (point-of-sale) screen |
| **Showroom** | Carres' *own* stores | Same POS; distinguished from dealers by `dealers.channel = 'showroom'` |
| **Principal** | HQ admin / "Master Admin" | Owns pricing, accounts, catalog, can place orders on behalf of any store |
| **Operation** | HQ internal ops team (COO = **Jess**, the primary stakeholder for ops work) | The daily driver: orders control grid, procurement, stock, payments/collections |
| **Finance** | HQ finance | Invoices, payments, P&L, credit notes |
| **Supplier** | External factories | Acknowledge POs, mark ready, ship |
| **Partner** | Logistics companies (NETS, TEOW, etc.) | Pick up from factory, deliver to customer, upload proof of delivery |
| **BD** | Business development | Now simply = the POS (their old CRM-style portal was deleted) |

**Key people:**
- **Loo** — Chairman of HOUZS Venture. No coding background; relies entirely on the AI for technical execution. Communicates in Chinese with English tech terms preserved.
- **Jess** — COO, owner of the Operation portal. Directs ops work, makes her own product calls. Prefers plain business language (no jargon like "MRP"), step-by-step guidance, colour/pill-based UI, WhatsApp-driven chasing.

**Important audience constraint:** end users (ops staff AND suppliers) read English poorly and are **not computer-literate**. UI must lean on colour, names of parties ("Chase NETS"), WhatsApp links, and one obvious button per screen.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| **Web (frontend)** | Vite + React 18 + TypeScript + React Router 7 + Tailwind CSS 3 + shadcn/ui + TanStack Query 5 + Zustand 5 |
| **API** | Hono v4 running on Cloudflare Workers (Wrangler) |
| **Shared package** | zod schemas + db-types + domain types + adapters (`packages/shared`) |
| **Database** | Supabase (Postgres + Row-Level Security + RPCs + Auth + Storage) |
| **Payments** | Stripe (QR / payment link collection) |
| **Deploy** | Cloudflare Pages (web) + Cloudflare Workers (api) |
| **Package manager** | pnpm v9 + workspaces, orchestrated by Turborepo |
| **Testing** | vitest (unit + integration with msw), Playwright (E2E) |

### Hard stack rules (do not introduce without asking)
**Banned:** Next.js, Vercel, Express, Prisma, Drizzle, NextAuth, MUI, Chakra, Bootstrap, styled-components, redux, or any ORM other than supabase-js.

### Hosting / domains
- **Web (Cloudflare Pages):** TWO Pages projects, ONE build:
  - `carres-portal` → **erp.carresofficial.com** (internal roles)
  - `carres-pos` → **pos.carresofficial.com** (dealer / showroom / BD retail door)
  - Also `carres-portal.pages.dev` (staging URL)
  - Hostname gating decides which portal shows; `pages.dev` / `localhost` stay ungated.
- **API (Cloudflare Workers):** `carres-portal-v2-api.wwch.workers.dev`
- **DB:** Supabase project `kfprgpjpaffedghytstl` (staging **is** production — shared, real).

> ⚠️ **Pages has NO git auto-deploy connection.** Deploy is manual via `wrangler pages deploy`. Merging a PR does NOT deploy. Deploy from `main` only — never from a feature branch (a feature-branch deploy once wiped live work).

---

## 3. Current Architecture

### 3.1 Three-tier flow
```
Browser (Vite SPA)
  │  Authorization: Bearer <Supabase JWT>
  ▼
Hono on Cloudflare Workers   (verify JWT with jose + validate with zod + business rules)
  │  user JWT (RLS enforced)      │  service_role (admin/cron ONLY)
  ▼                               ▼
Supabase (Postgres + RLS + RPCs)
```

**Auth exception:** login (`signInWithPassword`, `signUp`, `resetPassword`) goes **directly** browser → Supabase Auth. Everything else goes through Hono with the JWT.

**Trust boundaries:**
- Browser → Hono: Hono trusts nothing. Always JWT-verify + zod-validate.
- Hono → Supabase (user op): forward the user JWT; **RLS is the security boundary**.
- Hono → Supabase (admin/cron): `service_role`, restricted to specific routes (account creation, file signing, cron).

**RED LINE:** `SUPABASE_SERVICE_ROLE_KEY` lives only in Cloudflare Workers secrets. Never in source, never in committed `.env`, never referenced from `apps/web` (would bundle into the browser), never logged, never returned in a response. Before deploy, grep `apps/web/dist` for `SERVICE_ROLE` to confirm it never appears (verified = 0).

### 3.2 Repo layout (pnpm monorepo)
```
apps/web/         ← Vite SPA → Cloudflare Pages
apps/api/         ← Hono → Cloudflare Workers
packages/shared/  ← db-types, domain types, adapters, zod schemas, PURE business logic
supabase/         ← migrations (0001 … 0242+) + seed
docs/             ← plans, specs, work-logs, UI-KIT, this handover
e2e/              ← Playwright specs
reference/        ← (gitignored) the v1 prototype — behaviour source of truth
```

### 3.3 `packages/shared/src` — the shared brain
This is where **all pure, testable business logic** lives (strict TDD). Both web and api import it, so there is one implementation of every rule. Notable modules:
- `adapters.ts` — snake_case DB rows ↔ camelCase domain types (the ONLY place conversion happens)
- `db-types.ts` (snake_case) / `domain.ts` (camelCase)
- `schemas/` — zod schemas shared by API validation AND web forms (one schema, two consumers)
- Pricing/engine modules: `sofa-build.ts`, `pwp.ts`, `delivery-fee.ts`, `fabric-tier.ts`, `free-gift.ts`, `free-item-campaign.ts`, `product-bundle.ts`, `rule-target.ts`, `net-requirements.ts` (procurement MRP), `doc-number.ts` (printable doc numbering), `order-activity.ts`, `master-append.ts`, `ops-stock-import.ts`, `mattress-sizes.ts`, `phone.ts`
- `constants.ts`, `tables.ts`, `rpcs.ts` — no magic strings anywhere

### 3.4 `apps/api/src` — Hono API
```
index.ts            ← app + CORS allowlist + route mounting
middleware/         ← JWT verify, zod validation
routes/
  auth.ts, account.ts, catalog.ts, orders.ts, dealers.ts, staff.ts,
  salespersons.ts, outlets.ts, analytics.ts, pwp-codes.ts,
  stripe-checkout.ts, stripe-webhook.ts
  bd/  finance/  operation/  partner/  principal/  supplier/  ops/  storage/  cron/
```
Every route validates input with zod. Routes are grouped by role. `orders.ts` is the biggest (create/list/detail + line mutations + proceed/cancel/top-up/address/date + staff scoping).

### 3.5 `apps/web/src` — React SPA
```
App.tsx             ← router + role-based portal mounting
main.tsx
pages/
  Login.tsx, Me.tsx
  dealer/  (the POS — shared by dealer/showroom/BD/principal-on-behalf)
  principal/  operation/  finance/  supplier/  partner/  bd/
  catalog/  (Product & Maintenance admin, 9-tab)
  pay/  print/  portal/
lib/                ← queries.ts (centralised TanStack Query keys `qk`), design-standard.ts, password.ts, store-kind.ts, etc.
components/          ← shadcn primitives + shared UI (ListPageShell, DataGrid, MYAddressFields, RuleTargetPicker, etc.)
data/
```

### 3.6 Data flow (a typical order)
1. Dealer opens the POS (`/dealer` or pos.carresofficial.com), picks products from the catalog grid, configures options (mattress size, sofa build, fabric), adds to cart.
2. POS builds a `DraftLine[]` client-side (prices come from the catalog bundle fetched at load).
3. Submit → `POST /api/orders` → Hono validates, **re-runs server-authoritative recompute** for sofa builds / delivery fees / PWP / free gifts (rejects >0.5% price drift), then calls the `create_order` Postgres RPC.
4. The order flows through stages (see §7 workflow). Operation, supplier, partner, finance each act on it through their portal, all reading/writing the same `orders` + related tables under RLS.

### 3.7 API structure conventions
- Typed via Hono's RPC client where possible; **no string-concatenated routes** in `apps/web`.
- All table names → `packages/shared/src/tables.ts`; all RPC names → `rpcs.ts`.
- Response shapes validated with zod before returning.

---

## 4. Current Implementation Status

The project ran **Phases 0–9** (setup → schema/RLS → the 9 roles → production cutover), all ✅ complete. It is now in **Phase 10 (post-launch)**: a long stream of feature additions and fixes, plus several multi-phase initiatives. **Latest migration tail = 0242.**

### 4.1 Completed & live (highlights)
- **All 9 role portals** built and deployed.
- **Dealer/Showroom POS** — catalog-first full-screen point-of-sale, re-skinned to match Loo's separate "2990s" POS look (flame `#C44D2B`).
- **Product & Maintenance** — a 9-tab catalog admin reproducing the "2990s Products" page: SKU Master, Modular, Special Add-ons, Fabrics, Maintenance pools, Combo Pricing, Delivery Fee, PWP, Promo. All 8 build phases (P1–P8) complete.
- **Sofa custom-cell engine** (5 phases, all shipped) — a visual drag "build your sofa" plan-view builder + a pure pricing engine (`computeSofaPrice`, Kuhn bipartite combo matching) + server recompute + explode into per-compartment order lines. **Dormant in prod** (0 compartments authored) until the principal enters data.
- **PWP voucher + Promo** state machine (same-cart + cross-order carry-forward bound to customer phone). Dormant until rules authored.
- **Bundle pricing** — N SKUs sold at one price, exploded Σ-exact into component lines (live; "King Bedroom Set @ RM2500" seeded).
- **Operation "Master Sheet live"** suite — Orders control grid (the ops daily driver), ops cockpit (notes/tasks/calendar), Payments/Collections desk, Sales Order Maintenance grid, Purchase/Procurement MRP cockpit.
- **Staff PIN login** — 3-tier staff identity (principal / manager / salesperson) with 6-digit PIN per store.
- **POS/ERP domain split** — pos vs erp hostnames, CORS allowlist.
- **Structured delivery address**, config-driven payment methods, add-product-to-existing-order flow, Stripe QR/link collection, showrooms split from dealers, store self-service account management.

### 4.2 In progress
- **Purchase / Procurement MRP** (`feat/purchase-mrp`) — building a pure net-requirements engine (TDD in `packages/shared/net-requirements.ts`). Cadence & grouping rules locked; cockpit UI + lead-time table (migration ~0243) pending. See memory note *project_purchase_mrp*.
- **Orders LIST rebuild** and **Order-detail drawer** redesigns for the ops portal (Jess's newbie-guide direction) — several PRs shipped; consolidated-PO decision awaiting Jess.
- The **current git branch is `feat/orders-drawer`.**

### 4.3 Pending / not yet started
- Author real sofa compartment data so the sofa engine "wakes."
- Data hygiene: bulk "Mark completed" sweep of ~105 legacy overdue rows; Master sheet re-import.
- Numerous carry-forwards (see §8 and `CLAUDE.md §17.5`).

---

## 5. Coding Conventions

### 5.1 Naming
- **Database:** `snake_case` (Postgres convention).
- **TS types in `db-types.ts`:** `snake_case`, mirror DB rows.
- **TS types in `domain.ts`:** `camelCase` for UI consumption.
- Conversion **only** via `packages/shared/src/adapters.ts`.

### 5.2 Files
- Components: `PascalCase.tsx` (e.g. `DealerOrders.tsx`), one default export each.
- Utilities: `kebab-case.ts` (e.g. `format-currency.ts`).
- Never barrel-export from `index.ts` in `apps/*` (only in `packages/shared`).

### 5.3 Imports order
1. Node/external (react, hono, zod…)
2. `@carres/shared/*`
3. Local `@/*` (alias to `apps/{web,api}/src`)
4. Relative `./…`

### 5.4 No magic strings
Table names → `tables.ts`; RPC names → `rpcs.ts`; API routes → typed Hono RPC client.

### 5.5 zod everywhere
One schema in `packages/shared`, consumed by both the Hono route and the web form. Never duplicate validation.

### 5.6 TanStack Query keys
Centralised in `apps/web/src/lib/queries.ts` as `qk`. No inline `queryKey: ['orders']` elsewhere.

### 5.7 Design patterns
- **Frontend-wins:** if the schema makes a UI flow awkward, the schema is wrong. The v1 `reference/proto/*.jsx` files are the behaviour source of truth.
- **Pure-logic-in-shared, TDD:** engines (pricing, MRP, doc numbering) are pure functions in `packages/shared` with exhaustive tests, so both tiers share one truth.
- **Server-authoritative money:** the client can *suggest* prices, but Hono re-derives them from live DB prices and rejects drift. Prices/totals must not change without an activity-log entry.
- **Additive, dormant migrations:** new features ship as additive schema + config tables seeded empty/inactive, so production behaviour is byte-identical until the principal turns them on.

### 5.8 Style / tooling gates
- Run `pnpm --filter @carres/web lint` before committing UI work.
- Run `pnpm --filter @carres/web run check:v4` (design-standard gate) before committing UI.
- **Build, don't just `tsc`:** `pnpm exec tsc --noEmit` uses the default tsconfig; the build uses `tsconfig.app.json` and catches errors the plain run misses. Always run the build.

---

## 6. UI / UX Principles

### 6.1 Design system — the single source of truth
**`docs/UI-KIT.md` (v4) is the ONLY design doc. Read it before ANY UI work.** Machine mirror = `apps/web/src/lib/design-standard.ts`. There is also an in-repo skill `.claude/skills/carres-design/` — use it, never freely design.

Core law (v4):
- **White base**; colour is reserved for **action / selection / status / alert only** — never decorative.
- **Cool-neutral canvas** `#F3F4F6`; cards white; hierarchy from borders + subtle shadow.
- **Brand colour (flame):** `#C44D2B`.
- **Typography:** Inter, weight-layered scale (24 / 20 / 16 / 15 / 14 / 12). Slashed-zero mono (JetBrains Mono) for **numbers/codes only**, never words.
- **Rows:** 44px fixed height (list rows). Drawer rows 36px.
- **Icons:** sizes 14 / 16 / 17 (or {14,16,18}@2); icon colour `#6B7280`.
- **ONE pill spec** (11px) for status. Button hierarchy: `.btn-hero` (the single flame CTA per page) · `.btn-primary` (black workhorse) · `.btn-secondary` / `.btn-ghost` · `.btn-danger` (red text, never filled).
- List pages use `<ListPageShell>`; colours come from token classes (`base-*`, `primary`, `accent`) — **no hard-coded hex**.

### 6.2 Components
shadcn/ui primitives + Tailwind tokens + the v4 utility classes. Reusable Carres components: `ListPageShell`, `DataGrid` (AutoCount-style resizable/filterable grid), `MYAddressFields` (Malaysia cascading address picker), `RuleTargetPicker`, `StatusPill`, `SectionCard`, `BirthdayWheelField`, etc.

### 6.3 UI/UX principles specific to this business (from Jess/Loo)
- **Guide the inexperienced:** pre-compute what/how-many/who/when/price; "what to do today" worklist, not a dashboard.
- **Plain language, no jargon** (she rejected "MRP"). Tech terms stay in code only.
- **Specific dates, never vague words.** Date format everywhere: `31 Jul 26`. Never leak internal DB stage words to the UI.
- **Colour + pills + WhatsApp + party names carry meaning** (low English, low computer literacy).
- **One-column flow, one obvious button.**
- **English-only UI copy** portal-wide (rule saved to memory `ui-english-only`) — but code comments, test fixtures, CJK customer-name rendering, and DB data stay as-is.
- **Auto over manual** wherever possible.
- Communicate with Jess/Loo: **ASCII layout sketch first** (preview clips tall HTML), 3-option step-by-step proposals before writing code, `git fetch` first.

### 6.4 Theme & responsiveness
Design tokens in `apps/web/src/index.css` (`:root`) + `tailwind.config.ts`. The portal is primarily a desktop operations tool; POS is used on store terminals. Layouts use Tailwind responsive utilities but the priority is a clean, dense desktop grid.

---

## 7. Business Rules

### 7.1 The three tracks & state vocabulary
Everything maps to **货 (goods) → 送 (delivery) → 钱 (money)**. There is a fixed 5-word customer-facing state vocabulary; **DB stage words must never leak to the UI**. The Orders page is the finished reference — new panels copy its shape (read `docs/OPS-BUILD-BRIEF.md` first for any ops work).

### 7.2 Order lifecycle (happy path)
```
Dealer places order
  → Operation dispatches / sources
  → Supplier acknowledges PO → marks ready → ships
  → Partner picks up from factory → delivers to customer → uploads POD
  → Finance receives payment
```
Supporting flows: top-up approval (50% deposit gate), supplier PO ack/ship/receive, refund (request → approve → pay), multi-leg delivery chains.

### 7.3 Money model (locked)
- **The dealer just sells. The customer pays HQ directly.** There is no HQ→dealer credit/debt.
- The "Outstanding" column = **customer-owes-HQ** (the dealer chases the customer for the 50% top-up gate).
- Operation (procurement/production) and Supplier are **HQ-internal** roles, not dealer-side.
- **No silent money edits:** any change to a line price/total must produce an activity-log entry. Flag any code path that allows silent edits.

### 7.4 Pricing authority
The **principal ("Master Admin") owns pricing.** `product_skus.price` and `.cost` are locked to the principal by a DB trigger (`enforce_sku_price_cost_principal_only`, migration 0175) — enforced in three layers (DB RLS + API 403 + UI read-only). All catalog pricing knobs (fabric tier deltas, combos, delivery fees, PWP prices) inherit this lock.

### 7.5 Storage-fee rule (ops payments)
From ETA: mattress/bed-frame RM150/month; sofa RM200 per 2 weeks — per commenced period, overridable. Implemented in `computeStorageFee()` in `@carres/shared`. Rule for collections: **催钱前先看货** ("check goods before chasing money") — the Payments desk is stock-aware.

### 7.6 Permissions (RLS is the boundary)
- Custom JWT claims (`role`, `dealer_id`, `supplier_id`, `partner_id`) injected at login via a Supabase Auth Hook. RLS reads from `auth.jwt()`, never a per-row function.
- Every function-calling policy wraps the call as `(select auth.fn())` (InitPlan — runs once per query, not per row).
- All `auth`-schema helpers are `stable security definer`.
- **Staff PIN = workflow scoping, not a security boundary** — RLS bounds everything to the dealer regardless.

### 7.7 Validation
zod at every boundary (API + form). Category mutex (migration 0089): a single order cannot mix sofa × mattress/bedframe. Malaysian phone/address normalisation in shared. Delivery/floor surcharges, sofa price drift gate (0.5%), bundle Σ-exact splits.

### 7.8 Pre-go-live guardrails (until NETS logistics goes live ~Jul 30, 2026)
1. **RLS verify** — permission changes must be enforced in RLS, not just hidden in UI; state which policy.
2. **Delivered/completed orders must NOT show the red overdue countdown** (known bug to fix/flag).
3. **Pagination** — the orders list caps ~200 rows (PostgREST page cap). Don't build features assuming the full list is loaded.
4. **No silent money edits** (see 7.3).
5. **Concurrency** — multiple users edit the same order; prefer explicit `updated_at` checks, warn on last-write-wins of critical fields.
6. **One worktree per workstream** — parallel sessions must not share a checkout; RLS/security, orders-list, order-detail, and activity each get their own branch/worktree.

---

## 8. Known Issues, Tech Debt & Limitations

Full living list = `CLAUDE.md §17.5` (dozens of "carry-forwards"). The important ones:

### 8.1 Security / go-live risks (signed off, need rotation)
- `principal@carres.com` and 9 alpha users still at password `111` — rotate before external sharing (PrincipalAccounts UI has per-row reset).
- **CORS** was `origin:"*"`; now an allowlist for the custom domains.
- Two logistics go-live blockers: `delivery_partner_id` is all-NULL in prod (multi-leg never live-exercised); the `ops_order_control` RPC workstream.

### 8.2 Correctness / silent-wrong
- `orders-channel-filter-outlet-id-proxy` — an ops orders filter still uses `outlet_id IS NULL` as a proxy for "is showroom", now inverted in practice. Dead query arg today (no UI passes it), but fix to filter on `dealers.channel` when wired.
- `bd-network-board-page-cap` / `principal-dealers-join-unbounded` — client-side aggregates over one PostgREST page under-count once volume exceeds the page cap.
- `bundle-pwp-gwp-stacking` — bundle component lines still act as PWP/GWP triggers, so promos stack on top of the bundle discount (a policy decision for Loo).

### 8.3 Test debt (baseline pre-existing failures — do NOT chase as new regressions)
Documented in `CLAUDE.md §17.7`. Baseline: **api 3 fails** (supplier/pos ×2 + partner/pickups ×1, stale mocks) + **web ~16 fails** (OperationOrders ×7, OrderCustomerCard ×4, OhanaSofaTab ×4, NiceFutureMattressTab ×1). `shared` is green. Verify against clean `origin/main` before attributing any failure to your change.

### 8.4 Placeholders
- `finance_monthly_pl` uses a 55% COGS placeholder and a constant RM42k/month opex placeholder — real sources deferred.
- Most `product_models` have no `photo_url` → POS cards show a `▦` placeholder.

### 8.5 Limitations
- Orders list ~200-row cap (pagination not built).
- Sofa engine, PWP/promo, delivery fees are all **dormant** in prod (0 authored rows) — untested against live data.
- Multi-leg delivery POD upload is deferred to V2.

---

## 9. Future Roadmap & Priorities

Ordered roughly by current priority:

1. **Purchase / Procurement MRP** (in progress) — net-requirements engine + cockpit UI + lead-time table migration. Cadence: fixed review windows (mattress+bedframe Mon/Wed/Fri) + urgent override, always auto-*suggest* never auto-place; bed-set (mattress+frame) = one delivery bundle; sofa one-PO-per-order. 5-colour urgency.
2. **Orders LIST + Order-detail** ops redesign — finish the "newbie guide" direction (Today front-door, Customer-360, step-on-board), consolidated-PO decision (awaiting Jess).
3. **NETS logistics go-live (~Jul 30)** — close the two blockers; verify RLS for the partner role.
4. **Payments / Collections desk** enhancements — storage-waiver lever, velocity KPI, bulk-remind.
5. **Data hygiene** — bulk mark-completed sweep, Master sheet re-import.
6. **Wake the dormant engines** — author sofa compartments, PWP rules, delivery fees, decide flat-sofa (628 SKUs) coexistence.
7. **Rotate all placeholder passwords; tighten CORS; secret rotation cadence.**
8. Order **activity-history** (tamper-proof per-order log → operation/management/customer views via DB triggers).

---

## 10. Recommendations for Another AI

### 10.1 Things to NEVER change without explicit, in-conversation approval from Loo/Jess
1. **Never `DROP` / `TRUNCATE` / `DELETE`** without a single-instance explicit confirmation in the current conversation. (The ops `notes`/`tasks`/`calendar` tables hold **Jess's real data** — never bulk-delete as "test data.")
2. **Never modify Supabase RLS** without explaining which policy and why.
3. **Never write secrets in code.** `service_role` key only in Workers secrets. Never reference it from `apps/web`.
4. **Never `git push --force`, `git reset --hard`, or `rm -rf`** on tracked work.
5. **Never edit a committed migration** — write a new one (`00NN_*.sql`).
6. **Never delete files that weren't requested.**
7. **"User said OK before" is NOT permission** — it must be explicit in the current conversation.
8. **Never write draft SQL into `supabase/migrations/` before Jess approves** — drafts go in chat or `docs/`. Before numbering a migration, **check the remote tracker tail first** (shared prod DB, parallel sessions frequently take the next number — 0239/0240/0241 all had collisions).
9. **Never deploy to prod from a feature branch** — merge to `origin/main`, deploy from the main tip. Pages has no auto-deploy; deploy is manual `wrangler`. Merge ≠ deploy.
10. **Do not deviate from the stack** (no Next.js/Prisma/MUI/etc.) or the design system (`docs/UI-KIT.md`).
11. **Do not touch the frozen migrations 0001–0003** (the copied v1 schema) without Loo's approval.

### 10.2 Common mistakes to avoid
- **Attributing pre-existing test failures to your change** — check the §8.3 baseline first.
- **Running only `tsc --noEmit`** and thinking it's clean — run the actual build (`tsconfig.app.json` catches more).
- **Piped `curl | grep` on the 3.8 MB web bundle** truncates and reports a false "0" for a marker — download to a file first.
- **Assuming the orders list is fully loaded** — it caps ~200 rows.
- **Leaking DB stage words to the UI** — use the 5-word customer vocabulary.
- **Building manual steps where auto is expected**, or dashboards where a "what to do today" worklist is expected.
- **Using jargon** (Jess flagged "MRP"), or **non-English UI copy**.
- **Skipping `git fetch`** at the start — this is a shared prod DB with parallel sessions; migration numbers and main move under you.
- **Hard-coding hex colours** or inventing UI — go through UI-KIT tokens / the carres-design skill.
- **Confusing the two delivery legs** — customer-leg (`order_supplier_threads.delivery_partner_id`) vs procurement-leg (`purchase_orders.procurement_partner_id`). Ask which leg before touching partner bugs.
- **Confusing "combo" (0179 sofa system) with "bundle" (0239 fixed-set pricing)** — they are different features.

### 10.3 Important assumptions
- **Staging === production.** There is no separate prod DB. Every migration and MCP write hits real, shared data.
- **The DB schema is intentionally frozen except for additive migrations.** Features ship dormant (empty config tables) so prod stays byte-identical until turned on.
- **Server is the price authority.** The client suggests; Hono re-derives and rejects drift.
- **Money must never move silently** — always an audit/activity entry.
- **`create_order` and the core order-write pipeline are contract-sacred** — most features are built to leave `create_order` / `order_lines` / `DraftLine` / `cart.ts` / the 0089 mutex UNTOUCHED. Preserve this.
- **`reference/` is the behaviour source of truth** (gitignored v1 prototype), but its architecture (direct-to-Supabase, no Hono) must NOT be copied.

### 10.4 Development philosophy
- **Conclusion-first** communication; Chinese-primary with English tech terms preserved (for Loo/Jess).
- **Frontend-wins over schema convenience.**
- **Pure logic in `packages/shared` with strict TDD**; engines are faithful ports with exhaustive tests.
- **Additive + dormant + adversarially reviewed** — big features go: design doc → build → multi-lens adversarial review (correctness / security / RLS-PII lenses) → fix findings → ship dormant.
- **Guide the inexperienced user**; auto over manual; one obvious action per screen.
- **Data-backed, minimal, don't over-engineer** — thin inputs, ask before building templates/permissions, don't insert extra approval gates into Jess's flows.

### 10.5 Where to look first (reading order for a new AI)
1. `CLAUDE.md` — project rules + full status (§17 is the living state).
2. **`docs/PANEL-PROPOSALS-FOR-REVIEW.md` — per-panel design briefs to review BEFORE code (Orders, Purchasing, Payments, etc.).**
3. `docs/OPS-BUILD-BRIEF.md` — mandatory before any ops/panel work.
4. `docs/UI-KIT.md` — before any UI.
5. `CARRES_PORTAL_V2_PLAN.md` — phases, acceptance criteria, schema.
6. `docs/phase-10-worklog.md` — chronological detail of every recent ship.
7. `packages/shared/src/` — the business logic + zod contracts.

> **For design review before code:** hand ChatGPT `docs/PANEL-PROPOSALS-FOR-REVIEW.md` (self-contained per-panel briefs + open questions). Attach the individual full spec files it names only if a deeper read is wanted.

---

## Quick Reference Card

| Item | Value |
|---|---|
| Web (internal) | erp.carresofficial.com · Pages project `carres-portal` |
| Web (retail) | pos.carresofficial.com · Pages project `carres-pos` |
| Staging web | carres-portal.pages.dev |
| API | carres-portal-v2-api.wwch.workers.dev (Cloudflare Workers) |
| DB | Supabase `kfprgpjpaffedghytstl` (staging = prod) |
| Latest migration | 0242 (tail — always re-check remote before numbering) |
| Current branch | `feat/orders-drawer` |
| Package manager | pnpm v9 workspaces + Turborepo |
| Roles | dealer · showroom · principal · operation · finance · supplier · partner · BD |
| Brand colour | `#C44D2B` (flame) |
| Deploy | manual `wrangler pages deploy` from `main` (no git auto-deploy) |
| Test baseline fails | api 3 · web ~16 (pre-existing; don't chase) · shared green |

---

*End of handover. For anything ambiguous, `CLAUDE.md §17` is the authoritative live state; this document summarises it as of 2026-07-22.*

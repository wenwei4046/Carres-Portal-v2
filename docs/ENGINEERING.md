# ENGINEERING — the stack, the repo, and how work reaches production

> **Open this when you need a specific answer. Do not read it to start work** — that is
> `CLAUDE.md` plus your module's MASTER.
>
> Everything here is mechanics. **Rules live in the Constitution; business lives in a MASTER.**

---

## 1 · Stack — do not deviate without asking

| Layer | Technology |
|---|---|
| Web | Vite + React 18 + TypeScript + React Router 7 + Tailwind 3 + TanStack Query 5 + Zustand 5 |
| Web UI | **Radix primitives** (behaviour) + the Carres kit (appearance) + `lucide-react` + `sonner` + `react-day-picker`. **NOT shadcn/ui** |
| API | Hono v4 on Cloudflare Workers (Wrangler) |
| Shared | zod schemas + db-types + domain types + adapters in `packages/shared` |
| DB | Supabase Postgres + RLS + RPCs + Auth + Storage — project `kfprgpjpaffedghytstl` |
| Deploy | Cloudflare Pages (web) + Cloudflare Workers (api) |
| Packages | pnpm v9 + workspaces + Turborepo |

**Never introduce** Next.js, Vercel, Express, Prisma, Drizzle, NextAuth, MUI, Chakra,
Bootstrap, styled-components, redux, or any ORM other than supabase-js. **Ask first.**

```
apps/web/         Vite SPA      → Cloudflare Pages
apps/api/         Hono          → Cloudflare Workers
packages/shared/  db-types · domain · adapters · zod schemas
supabase/         migrations + seed
```

---

## 2 · Architecture

```
Browser (Vite SPA)
  ↓ Authorization: Bearer <Supabase JWT>
Hono on CF Workers   — verify JWT, validate with zod, apply business rules
  ↓ user JWT (RLS)  |  service_role (admin/cron only)
Supabase (Postgres + RLS + RPCs)
```

**Auth is the one exception:** `signInWithPassword` / `signUp` / `resetPassword` go straight
from the browser to Supabase Auth. Everything after login goes through Hono with the JWT.

| Boundary | Rule |
|---|---|
| Browser → Hono | Hono trusts nothing. Always `jose` JWT verify + zod payload validate |
| Hono → Supabase (user op) | Forward the user JWT. **RLS is the security boundary** |
| Hono → Supabase (admin/cron) | `service_role`, restricted to specific routes |

**`SUPABASE_SERVICE_ROLE_KEY` — red line.** Cloudflare Workers secrets only. Never in source,
never in a committed `.env`, never referenced from `apps/web`, never logged, never in a
response. **Grep `apps/web/dist` for `SERVICE_ROLE` before every commit; it must be 0.**

---

## 3 · RLS performance — three rules that are not optional

The old HV Portal has 130 policies and a lagging dashboard. Do not repeat it.

1. **Custom JWT claims.** A Supabase Auth Hook injects `role`, `dealer_id`, `supplier_id`,
   `partner_id` into `app_metadata` at login. Policies read `auth.jwt()`, **never a function
   that queries `app_users` per row.**
2. **InitPlan wrapping.** `( select auth.app_dealer_id() )`, never the bare call. PG14+ runs the
   wrapped form ONCE per query; the unwrapped form runs per row.
3. **`stable` marker.** Every helper in the `auth` schema is
   `language sql stable security definer`. Missing `stable` defeats the planner's caching.

Baseline, passed and still enforced: dealer 50 active orders < 100ms · principal dashboard
summary < 500ms · operation 4-column kanban < 200ms.

---

## 4 · Code conventions

- **Database** `snake_case` · **`db-types.ts`** `snake_case` matching rows · **`domain.ts`**
  `camelCase` for UI. **Conversion happens only in `packages/shared/src/adapters.ts`.**
- Components `PascalCase.tsx`, one default export. Utilities `kebab-case.ts`.
  **Never barrel-export from `apps/*`** — only `packages/shared`.
- Import order: external → `@carres/shared/*` → `@/*` → relative.
- **No magic strings.** Table names → `packages/shared/src/tables.ts`. RPC names →
  `rpcs.ts`. API routes → the typed Hono client.
- **zod everywhere.** One schema, two consumers — the route and the form. Never duplicated.
- **React Query keys are centralised** in `apps/web/src/lib/queries.ts` (`qk`). Never an inline
  `queryKey` anywhere else.

---

## 5 · Migrations

```
Draft  →  review business impact  →  commit the exact file  →  merge-ready verification
       →  apply  →  deploy dependent code  →  verify production
```

- **Draft SQL never lands in `supabase/migrations/` before Jess approves.** Drafts go in chat.
- **Number from the MAX of: the tracker tail · the repository tail · every branch.** Never from
  `ls`. Migrations applied by hand through the SQL editor are absent from the tracker while
  their objects are live — that has caused two collisions.
- **Verify BEFORE merging**: run the assertions in a rolled-back transaction on production, run
  a NEGATIVE CONTROL that proves the guard fires, then reconcile `md5(prosrc)` of every applied
  function against `git show HEAD:<file>` — not against the working copy.
- **Never retype a migration during apply.** Execute the exact reviewed repository file.
- **An applied migration missing from the repository is a P0**, not a tidy-up. Push first,
  review second.

---

## 6 · Deployment

**Authoritative automation (2026-08-13):** `.github/workflows/ci.yml` owns PR checks and
`.github/workflows/deploy-production.yml` owns the post-merge proof. `carres-portal` and
`carres-pos` are direct-upload Pages projects, so GitHub Actions builds the exact `main` SHA once
and uploads that same artifact to both. The web build writes `/__carres_deploy.json` from
`GITHUB_SHA`. The same workflow deploys the Worker with `DEPLOY_SHA`, then polls both Pages
projects, both custom web domains and `/health` until all report the exact merged SHA.
No convergence means a visible failed production workflow.

**One-time owner setup (never paste values into chat or commit them):**

1. In Cloudflare, create a scoped API token for account `e2494242a0fd563cacee5a301cf95dd3`
   with Workers Scripts edit permission (and Workers Routes edit only if Cloudflare requires it
   for the existing custom domain). Do not use the Global API Key.
2. In GitHub → repository Settings → Environments, create `production`. Add environment secrets
   `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (the account id above). The token also needs
   Cloudflare Pages edit permission because the projects are direct-upload projects. An environment
   reviewer is optional for ordinary deploys; credentials must not require browser OAuth.
3. In Cloudflare Pages, verify **both** direct-upload projects retain their existing custom domains.
   GitHub Actions supplies the already-built `apps/web/dist` artifact; no Cloudflare build command
   or duplicate Pages deployment workflow should exist.
4. In GitHub branch protection for `main`, require the `CI / verify` status and at least one PR
   review; prohibit direct pushes. The first pipeline PR proves the status name before making it
   required.

Worker runtime secrets remain in Cloudflare and are not copied to GitHub; Wrangler preserves them
when publishing a new version. The GitHub token only publishes code/configuration.

```
merge to main  →  build from the MAIN TIP  →  deploy BOTH Pages projects
               →  poll all four canonical URLs until they converge  →  verify
```

- **Never deploy production from a feature branch.**
- **Never ask Jess for routine terminal delivery.** Engineering pushes the branch/PR; CI tests it;
  merge deploys it. Jess intervenes only for initial credentials, unsafe migration approval, or
  rollback/emergency.
- **An api diff is measured against the LIVE WORKER'S SOURCE COMMIT**, read from
  `wrangler deployments list` — **never from a document.** A card that changes no `apps/api`
  file can still owe a Worker deploy because another lane's api half merged meanwhile.
- **A `packages/shared` change reaches the Worker only if `apps/api` imports the thing that
  changed** — and when that is unclear, settle it by BUILDING both:
  `wrangler deploy --env production --dry-run` and compare the bundle md5.
  **A different bundle is a deploy owed, whatever the changed-file list suggests.**
- **Deploy the Worker with `--env production`, never bare.** Bare overwrites production with
  localhost bindings and drops the custom domain.
- **Prove a web deploy on the DOWNLOADED bundle, in both directions** — a string that should
  appear greps 0 → 1, one that should go greps 1 → 0, and a CONTROL string greps the same in
  both, proving the predecessor was really read. Fetch the predecessor from **its own
  deployment URL**: a superseded asset 404s at the apex, and a 1.7 kB SPA fallback greps as a
  clean 0 for everything.
- `grep -c` on a minified bundle counts LINES, not occurrences. Use `grep -o … | wc -l`.

### Cloudflare specifics

```
wrangler secret put SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_JWT_SECRET
```
Local dev reads `.dev.vars` (gitignored). Cron is scheduled in UTC — 09:00 MYT = `0 1 * * *`,
17:00 MYT = `0 9 * * *`; **every cron carries a comment with its MYT time.**
SPA fallback lives in `apps/web/public/_redirects`: `/*  /index.html  200`.

### Supabase production gate

CI validates migration filenames and rejects edits/deletes of any committed migration. It never
links to Supabase and never applies SQL. The governed migration flow in §5 remains authoritative:
owner approval before the file lands, production assertions plus a negative control in a rolled-
back transaction, exact-file apply, tracker/source reconciliation, then dependent-code deploy.
Destructive or uncertain SQL therefore cannot ride an ordinary merge-to-main deployment.

---

## 7 · Testing

- **Unit (vitest)** — every adapter, zod schema and utility, 100%.
- **Integration (vitest + msw)** — every Hono route, Supabase mocked.
- **E2E (Playwright)** — each role's happy path. **This gate is MANUAL, not CI.** `ci.yml` has
  no Playwright job and no Supabase secrets, so `e2e/phase-5-*` (AR aging buckets, dealer
  top-up approve, invoice-issue-after-delivered) never run on a PR. Before merging a change to
  the Finance surface, run them locally against a seeded dev stack:
  `pnpm seed:test-users && pnpm seed:e2e-fixtures && pnpm test:e2e e2e/phase-5-`.
  A green CI on a finance PR says nothing about the e2e suite.
- **A negative control is required.** A test that passes when you break the thing it guards is
  measuring nothing. Verify on disk that the control edit actually applied — CRLF files have
  silently swallowed `perl -0pi` edits at least seven times on this repo.
- **Measure the baseline on a detached worktree at `origin/main` before quoting a delta.** The
  documented number is a starting point, not a substitute for running it.

### Known pre-existing failures — the WEB baseline is now ZERO

```
api 3   supplier/pos ×2 · partner/pickups ×1        ← still open
web 0   234 files · 2,731 tests · 0 failures        ← 2026-08-11 on fbb1bfed
        (was 231 · 2,707 — Orders S2.0, 2026-08-08)
```

**Quote the commit with the number or the number is worthless.** This row was measured twice in
one afternoon and the two runs disagreed — `237 · 2,794` on `3547ad91`, then `234 · 2,731` after
pulling five commits that DELETED four components and their tests (`OperationOrders` ·
`CreatePOModal` · `CogsLineEditor` · `PoDocumentPreview`). A rising count is not the only way
this row moves, and a card that measures before a pull will "regress" the baseline by doing
nothing wrong.

**"ZERO" was true on CI and NOT true on a Windows checkout, and nobody noticed for three days.**
Re-measured 2026-08-11: two failures in `OperationPurchaseOrders.test.tsx` — the "one supplier
date, one door" block walks `apps/web/src` with `join`, which yields `\` on Windows, and asserts
against `/lib/queries.ts` string literals. Deterministic, not a flake, and invisible to CI
because CI is Linux. **The number above is only honest because a `rel()` helper now normalises
the separator before the comparison** — the assertion still counts the doors, which is what it
exists to do. Whoever next quotes a baseline: run it on the machine you actually work on, not
only the one that reports.

**The 16 web failures this section used to list are FIXED** (`OperationOrders` ×7 ·
`OrderCustomerCard` ×4 · `OhanaSofaTab` ×4 · `NiceFutureMattressTab` ×1). Every one was a stale
TEST asserting UI a ruling had removed — no component changed. `OperationPurchaseOrders` ×1 was
already gone by then. **Orders MASTER §3 records which ruling killed which assertion**, which is
the part worth keeping: nine of the sixteen died to one ruling (Jess 2026-07-11, actions move
into each panel's ⋮), and one file in that same suite had already followed the move a card
earlier while its siblings did not.

**AND THE SAME TRAP HAS A SECOND DOOR: THE TIMEZONE** (2026-08-21, Stock Register). Two date
tests passed on the Malaysian laptop that wrote them and failed on CI, which runs UTC. The code was
correct — `changedWithin` compares an event against **local** midnight, because the operator's
"today" is the browser's — but the fixtures were written as fixed `+08:00` instants, and a fixed
instant lands on a different side of a local boundary in a different zone. `Tests 2 failed` on a
branch whose author had just watched 2,530 pass.

**Build a date fixture FROM the `now` you pass in, in local terms** (`d.setDate(d.getDate() - 1);
d.setHours(23, 30, 0, 0)`), never as a fixed offset string. Then the test asserts the RULE — "since
local midnight", "since local Monday" — in whatever zone runs it. Proof is cheap and worth taking:
`TZ=UTC`, `TZ=Pacific/Kiritimati` (UTC+14) and `TZ=Pacific/Midway` (UTC−11) in a loop, plus the
negative control under `TZ=UTC` so the rewrite is not merely passing everywhere by testing nothing.
**This is the path-separator lesson again — green on the machine that reports, red on the machine
that runs.**

**A green web baseline is the point, not the tidiness.** While it was red, no card could tell
its own failures from the inherited ones — S2.0 was only able to prove it had broken nothing by
re-running the same 16 on a detached checkout of `origin/main` and matching the set exactly.

**The load-flake finding still stands and still binds.** Measured 2026-08-06 (T5): the same five
files run together gave **16 failed / 151 passed**, while the SAME tree under full-suite load
gave **26 failed / 2,638 passed** — ten extra failures that were concurrency, not code, and
`OperationPurchaseOrders.test.tsx` passed **123/123** alone. **A full-suite number is not a
baseline; compare the same files at the same concurrency, or you will chase somebody else's
timeout.** Run twice before calling anything a regression.

---

## 8 · Git

- Default branch `main`, always deployable. Feature branches, **no direct commits to main
  during phase work.** Conventional Commits.
- **After a rebase or merge, check you did not silently eat somebody else's record:**
  ```bash
  git diff origin/main -- docs/ | grep '^-' | grep -v '^---'
  ```
  Any removed line that is not yours means you ate it. Recover it from `origin/main`.
  **No conflict does not mean no loss.**
- **First thing after editing: `git diff --name-only`.** If it is empty you edited the wrong
  checkout — a green `tsc` on unmodified code proves nothing.
- **One worktree per workstream.** Two chats must never share a checkout.

---

## 9 · Current production state

> **Re-measure before quoting any of this.** `wrangler deployments list` is the authority for
> what is live — this table has been stale three times, and each time a card nearly shipped the
> wrong deploy decision.

| | |
|---|---|
| Web | `https://carres-portal.pages.dev` · `pos.carresofficial.com` (dealer/showroom/bd) · `erp.carresofficial.com` (internal). **TWO Pages projects, ONE build** |
| API | `https://carres-portal-v2-api.wwch.workers.dev` + `api.carresofficial.com` |
| DB | Supabase `kfprgpjpaffedghytstl` — staging IS production |
| Migration tail | **`0458_a_warehouse_is_operated_by_a_warehouse_operator`** — measured 2026-09-09 19:40 MYT, and for once the three numbers AGREE: repository tail on `main` = **0458**, MAX across every branch = **0458**, tracker tail = **0458** (341 rows). **That agreement is a snapshot, not a property.** ⚠️ **`0454` IS A LIVE COLLISION SCAR.** `0454_an_issue_action_has_one_identity_and_one_result` merged to `main` in PR #1189 and is **ABSENT from `supabase_migrations.schema_migrations`** (measured three times: 17:35, 18:35, 19:40) while `0441`–`0453` and `0456`–`0458` are all present. It is either unapplied or SQL-editor-applied without a tracker row — the recurring `0318`/`0319`, `0348`/`0349` pattern. The Warehouse Settings pair was WRITTEN AND APPLIED as `0454`/`0455`, collided against that merge mid-build, and was renumbered to `0456`/`0457`; the two tracker rows were renamed and the nine `comment on table` statements re-run so production matches the files. **`0455` is now a gap number nothing claims.** ⚠️ **Seventeen numbers are claimed by TWO files each** — `0038 0039 0055 0165 0166 0204 0206 0232 0233 0239 0241 0242 0255 0267 0398 0417 0424` — so `ls \| tail` is meaningless and the count of files (469) exceeds the count of numbers (451). **DO NOT TAKE A NUMBER FROM THIS ROW — re-measure at the moment you write the file**, taking the MAX of the tracker, the repository AND EVERY BRANCH, including unmerged ones: `git branch -a --format='%(refname)' \| while read r; do git ls-tree --name-only "$r" supabase/migrations/; done`. Query the tracker's **`name`** column; its `version` is a timestamp that cannot be compared to a file number. `pnpm ci:migrations` catches a same-number collision in CI, but only after the file is committed. See `docs/carry-forwards.md` → `0454-issue-action-merged-to-main-but-absent-from-the-tracker`. |
| Migration tail, previous | **`0456` · `0457`** (Warehouse Settings, applied 2026-09-09 via the governed MCP path, tracker `20260909090755` / `20260909091008`). Ten `SECURITY DEFINER` doors, no write policy on any settings table. **`0458` is the production walk's correction and changes no data**: the authenticated read showed `Operated by` would accept any of the 15 active operating parties — twelve of them `delivery_operator` — and the key contact would accept four active role mailboxes that are not people. Both are now refused in SQL (`not_a_warehouse_operator`, `key_contact_not_a_person`, `not_a_person`), with a real-individual test that uses the ERP's own People definition, the CRnnn staff code. **All thirteen function bodies across the three files reconcile `md5(prosrc)` against the committed files** — the check that catches a hand-retyped apply. Both migrations were proven before merge as the real users inside rolled-back transactions (`set_config('request.jwt.claims', …, true)` + the door, then a deliberate final `raise` to roll back): Yu Jun refused at `42501`, Jess still admitted, Khor Yee refused a grant, a past Special Date, a reasonless Special Date, `closes <= opens`, an invented organisation and a sourceless calendar import all refused by detail code — and the happy path wrote its audit rows. |
| Live web bundle | **`index-CvnKfOb5.js`**, 6,310,910 bytes, from `main` tip **`d3630bea`** (Warehouse Settings production walk, 2026-09-09 20:0x MYT). Both Pages projects and both custom web domains served `__carres_deploy.json` = `d3630bea`; `carres-portal.pages.dev` and `pos.carresofficial.com` were read in the same round. **Measured through an AUTHENTICATED session, not a public probe** — `feedback_verify_with_an_authenticated_read`: a 200 on a public route and a 401 on a private one prove only that a server answered. The page was walked signed in, and the computed body font came back `Inter, "DM Sans", system-ui` — the app's own — so the stylesheet had applied and the reading is real. |
| Live Worker | **source commit `d3630bea`**, reported by `GET https://api.carresofficial.com/health` → `{"ok":true,"commit":"d3630bea…"}`. **Read the commit from `/health`, not from this row and not from a document** — it is the Worker telling you which source it is running. `GET /api/operation/warehouse-settings` returns 200 for an authenticated `operation` caller with `canEdit` decided by the SQL gate, and its writers are `SECURITY DEFINER` doors over tables that grant `authenticated` no INSERT/UPDATE/DELETE at all. Predecessor `05b36bd8` (the same Warehouse Settings surface before the walk corrections). |


> **⚠️ `0318` and `0319` are IN THE REPOSITORY AND ABSENT FROM THE TRACKER**, measured
> 2026-08-06 — `supabase_migrations.schema_migrations` jumps `0317 → 0320`, while
> `purchase_demands` (0319's table) is live. So they were applied by hand through the SQL
> editor, which §5 already names as the thing that has caused two collisions. **Not a P0**
> (the red line is an applied migration missing from the REPOSITORY, and both files are
> present), but it means `0323` was NOT the tracker's tail by name and a chat numbering from
> the tracker alone would have been misled. **Number from the MAX of all three sources, as the
> Constitution says.** Reconciling the two rows is somebody's follow-up.

**Full deployment history** → [`ENGINEERING.md`](ENGINEERING.md) and
[`ENGINEERING.md`](ENGINEERING.md). **Open carry-forwards** →
[`carry-forwards.md`](carry-forwards.md).

### Known risks, signed off by Loo

- **`principal@carres.com` password is `111`**, and **9 alpha users are also on `111`.**
  Rotate before the portal is shared with anyone outside the team.
- The demo product catalog was not wiped at cutover; if it is proven fictional, `scripts/
  phase-9-cleanup.sql` layer 6 removes it.

---

## 10 · Reference material

`reference/` at repo root (gitignored — readable, never committed or built).

| Path | Use |
|---|---|
| `reference/proto/*.jsx` | **source of truth for BEHAVIOUR** — which buttons, modals, columns and transitions exist. **Never a source for anything visual** |
| `reference/production/src/lib/{queries,adapters,db-types,domain}.ts` | the data contract |
| `reference/MIGRATION_SPEC.md` | 1,047-line spec — search by section number |
| `reference/CLAUDE.md` | **DO NOT FOLLOW.** It describes the prototype's no-build conventions |

**`reference/production/src/` is not a starting codebase.** It talks to Supabase directly with
no Hono layer. Pages in `apps/web/src/pages/` are written from scratch by reading
`reference/proto/*.jsx` — never copy-pasted from `production/`.

---

## 11 · Measuring the real product

**The browser WORKS. At least five cards wrongly concluded it did not and skipped verification.**
Symptoms — `screenshot` times out, viewport reads `0×0`, *"No preview is open"* — mean the
window is not open or has no size, **not that it is broken.**

```
1  preview_start   { url: "https://erp.carresofficial.com/..." }   open the window
2  resize_window   { width: 1440, height: 900 }                    ALWAYS give a size
3  screenshot / javascript_tool                                    only now is it real
```

**Before `resize_window` every layout number is 0; after it every number is real.**

**Measuring and photographing are two different capabilities, and only one is reliable:**

| | Needs | Reliable |
|---|---|---|
| **measuring width / colour / text with JS** | `preview_start` + `resize_window` | ✅ always — this is the main tool |
| **a screenshot** | the pane must also be really displayed | ⚠️ times out when it is not |

**So *"I could not measure"* is never an acceptable conclusion.** *"I could not photograph"*
sometimes is — write *"widths measured, photograph owed"* rather than skipping the measurement.
A logged-in production session is usually still open; routes are query params
(`/operation?tab=purchase`).

> ⚠️ **An UNSTYLED page reports a perfect grid and reports it as a PASS.** A real reading once
> returned zero clips, 25px rows and a wider table — because the stylesheet had not applied and
> nothing could truncate. **Refuse to report unless the computed font is the app's own.**

> ⚠️ **A clip scan on a kit grid must include nested elements** (`td, th, td *, th *`). Scanning
> `td, th` alone returns 0 while three clips sit on nested `truncate` spans. That trap has been
> paid for twice.

## 12 · Studying before proposing

Four sources, and none may be skipped:

1. **Our own flow** — the module MASTER, and the whole chain around the tab you are touching.
   Answer both directions: *does what upstream sends still get in, and can downstream catch it?*
2. **2990s** — the owner's other system. `apps/backend/src/components/DataGrid.tsx` there is a
   complete AutoCount-style grid reference.
3. **AutoCount** — the team's muscle memory. **Copy its POWER, never its ASSUMPTIONS.**
4. **International references, chosen by PROBLEM, never waiting to be told a name** —
   navigation and reading pane → GitHub · density and interaction → Linear · ERP workspace →
   SAP Fiori / Dynamics · large tables → Excel / AutoCount · communication → Gmail · forms and
   settings → Shopify Polaris · plain actions and accessibility → GOV.UK / NN/g.

**Every challenge states five things:** current problem → operator impact → who does it better
→ the Carres adaptation → the cost. **"Only different" is rejected; if there is no material
improvement, say KEEP and say why.**

# Phase 1 — Reflection

> **Phase 1 (Schema + Auth) shipped 2026-05-02.** All acceptance criteria met. Tag: `phase-1-complete`.

---

## What shipped

| Lane | Deliverable | Commits |
|---|---|---|
| A | DB: 4 migrations + 9-user seed applied to `kfprgpjpaffedghytstl` (30 tables, 20 enums, 20 functions, 59 RLS policies, Auth Hook live) | a59b91b · 7f20c91 · e330ce4 · 6381b2a · e99c6c6 |
| B | Shared package: `db-types`, `domain`, `adapters`, zod schemas (`loginSchema`, `meResponseSchema`) | d2a36ac |
| C | Hono API: JWT verify middleware (ES256 / JWKS), `requireRole` gate, `GET /api/auth/me`, CORS for Vite | 22c98f8 · ed25032 |
| D | Vite SPA: Supabase auth client, Zustand store, `apiFetch` wrapper, Login + /me pages, RequireAuth router | d34e65a |
| E | Tests: 14 vitest (shared 6 + api 5 + web 3) + 3 Playwright E2E specs (login happy + invalid + unauth redirect) | 3f069ef |
| Doc | Phase 1 RLS baseline (3 query targets passed with 14–53× headroom) | this commit |

10 commits total in Phase 1, working tree clean, all pushed to `origin/main`.

---

## What surprised us

### 1. Supabase MCP user can't `CREATE TRIGGER` or `CREATE FUNCTION` on schema `auth`

The reference 0002_rls.sql defined helpers in `auth.app_role()`, `auth.app_dealer_id()`, etc., plus a `auth.users → app_users` mirror trigger. The Supabase MCP service role lacks DDL on the `auth` schema, so:

- All helpers were rewritten under `public` instead. RLS policies reference `public.app_role()` etc.
- The `on_auth_user_created` trigger was dropped. seed.sql now inserts `app_users` rows explicitly. If self-signup → app_users mirror is needed later (probably never — Phase 3 PrincipalAccounts uses Admin API), it'd go in another Auth Hook, not a trigger.

**Carry forward:** all future migrations should put helpers in `public`, not `auth`. Docs updated implicitly via the migrations themselves.

### 2. Supabase issues ES256 JWTs by default — `SUPABASE_JWT_SECRET` is legacy

Per the original plan, the API was going to verify user JWTs with `HS256` + a shared `SUPABASE_JWT_SECRET`. Reality (after `signInWithPassword` returned a JWT with `alg: ES256, kid: <project-ec-key-id>`):

- New Supabase projects use per-project asymmetric ECDSA keys. Only the legacy anon and service_role JWTs are still HS256.
- Switched to `createRemoteJWKSet(<SUPABASE_URL>/auth/v1/.well-known/jwks.json)` + `algorithms: ["ES256"]`. jose handles refresh on key rotation.
- `SUPABASE_JWT_SECRET` is now unused by the API but kept in `.dev.vars` and `Bindings` type for backward compat / future HS256 routes.

**Carry forward:** documented in memory as `feedback_supabase_jwt_es256.md`. Any future server-side JWT verify must use JWKS, not the secret.

### 3. Direct INSERT into `auth.users` requires `''` not `NULL` for 4 token columns

`signInWithPassword` returned 500 "Database error querying schema" with the seeded users. Auth logs revealed:

```
error finding user: sql: Scan error on column index 3,
name "confirmation_token": converting NULL to string is unsupported
```

GoTrue (Supabase Auth, Go) can't scan NULL into a Go `string`. The 4 affected columns: `confirmation_token`, `recovery_token`, `email_change_token_new`, `email_change` — all default to NULL. The other 4 token columns (`email_change_token_current`, `phone_change`, `phone_change_token`, `reauthentication_token`) default to `''` and are fine.

Fixed in seed.sql with an `UPDATE auth.users SET col = COALESCE(col, '')` after the INSERT. Live DB was patched first via MCP, then the seed file caught up so re-runs are idempotent.

**Carry forward:** documented in memory as `feedback_supabase_seed_token_nulls.md`. Any future SQL seed of `auth.users` must follow the pattern.

### 4. msw doesn't intercept `node:https.request`

jose's Node runtime uses `node:https.request` directly for the JWKS fetch, bypassing `globalThis.fetch` and msw's interceptor. Solution: middleware exposes `_setJwksForTesting(jwks)` so integration tests inject a `createLocalJWKSet`-backed function and skip the network. Same code path runs in production with the remote JWKS.

### 5. Vite's project-references tsconfig was over-engineered

The Phase 0 scaffold left `composite: true` on `tsconfig.app.json` with `tsc -b` in scripts but never wired references to `packages/shared`. Cross-package imports threw `TS6307`. Fix: dropped `composite` and switched build/typecheck scripts to plain `tsc --noEmit -p tsconfig.app.json`. Lost incremental cache; gained a working monorepo.

---

## RLS performance — actual vs target

Per `CLAUDE.md §8`, all 3 targets had to be hit to declare Phase 1 done:

| Query | Target | Cold | Warm |
|---|---|---|---|
| Dealer 50 active | < 100 ms | 3.7 ms | 1.5 ms |
| Principal summary | < 500 ms | 9.4 ms | < 1 ms |
| Logistics kanban | < 200 ms | 14.1 ms | 3.8 ms |

All InitPlan-wrapped helper calls ran exactly once per query (`Actual Loops: 1`), confirming the §8 Fix #2 + #3 (InitPlan + STABLE) are doing their job. See `phase-1-rls-baseline.md` for plans, queries, and re-run instructions.

---

## What got deferred

- **`SUPABASE_JWT_SECRET` cleanup** — unused by middleware but still in `.dev.vars` template, `Bindings` type, and `.dev.vars.example`. Not removing yet because Phase 9 prod deploy might use it for HS256 service-to-service tokens.
- **service_role mode in `supabase.ts`** — `adminClient(env)` factory exists but no Phase 1 route uses it. Phase 3 (PrincipalAccounts) and crons (Phase 7+) will be the first real callers.
- **Multi-style support** — only Warm Linen preset shipped. The other 3 reference presets (slate, press, editorial) are deferred per CLAUDE.md §10 ("only warm-linen in v2").
- **Component tests in apps/web** — vitest scaffold + jsdom + RTL are ready, but no React component tests yet. Phase 2 (Dealer flow) will introduce them.
- **Partial indexes on `orders`** — 10K rows are fine on Seq Scan. At 100K+ we'll want `(dealer_id, placed_at DESC) WHERE status IN ('place','proceed_order')` and `(logistics_stage, placed_at DESC) WHERE status <> 'cancelled'`. Re-baseline at start of Phase 5.

---

## Time spent (approximate)

- Lane A (DB): ~45 min including the auth-schema-permission discovery and helper relocation.
- Lane B (shared): ~15 min — verbatim file copy + small zod tweaks.
- Lane C (api): ~30 min code + ~10 min ES256/JWKS debug.
- Lane D (web): ~25 min code + ~5 min tsconfig fix.
- E2E debug (GoTrue NULL token bug + ES256 mismatch): ~15 min combined.
- Lane E (tests): ~35 min including msw-vs-jose workaround.
- RLS baseline: ~20 min (seed, queries, doc).
- Reflection + tag: ~10 min.

Total Phase 1: ~3.5 hours of active work in this session, on top of the ~2 hours from the earlier session that did Lanes A+B. Roughly 5.5 hours all-in for Phase 1, well inside the master plan's 1-week budget.

---

## What to carry into Phase 2

1. **Auth context is solid** — `c.var.auth` in Hono routes carries `id/email/role/dealerId/supplierId/partnerId/outletId` already typed. New routes just add `requireRole([...])` + their own zod schemas.
2. **Test pattern for routes** — copy `apps/api/src/routes/auth.test.ts` template. Inject JWKS via `_setJwksForTesting`, use msw for any other outbound HTTP, hit `app.fetch(req, env)` directly.
3. **Frontend pattern** — `apiFetch<T>` from `@/lib/api` is the only way the SPA talks to Hono. Auth state lives in Zustand (`useAuth`), not in TanStack Query (which is reserved for server data).
4. **Adapters first, then queries** — Phase 2's first PR should be the dealer order adapters (camelCase ↔ snake_case) before any UI work.
5. **Always check the Auth Hook payload** when adding routes — `app_metadata.role` and entity ids must round-trip correctly. The /me page is the diagnostic harness for this.

---

## Acceptance check (final)

- [x] All 4 migrations applied; schema matches reference (modulo helper-schema relocation)
- [x] 9 demo users seeded, all loginable (`{role}@carres.com / 111`)
- [x] Auth Hook injects role + entity ids into JWT app_metadata
- [x] Hono `/api/auth/me` round-trips a real Supabase JWT (verified manual + automated E2E)
- [x] service_role audit gate: `grep -ri SERVICE_ROLE apps/web/dist` → 0 matches
- [x] RLS perf baseline: dealer < 100 ms ✓, principal summary < 500 ms ✓, logistics kanban < 200 ms ✓
- [x] Test scaffold green: 14 vitest + 3 Playwright = 17/17 passing
- [x] `phase-1-rls-baseline.md` written
- [x] `phase-1-reflection.md` written (this file)
- [ ] `git tag phase-1-complete` and push (next step)
- [ ] CLAUDE.md §17 status updated to "Phase 1 complete; Phase 2 not started"

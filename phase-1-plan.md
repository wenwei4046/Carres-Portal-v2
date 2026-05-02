# Phase 1 Plan — Schema + Auth (Refined post eng-review)

> Supersedes the high-level Phase 1 in `CARRES_PORTAL_V2_PLAN.md` §8.
> All decisions captured here are locked in via `/gstack-plan-eng-review` on 2026-05-02.

## Goal
- 3 SQL migrations (+ 1 new auth hook migration) applied to Supabase project `kfprgpjpaffedghytstl`
- Hono auth middleware verifies Supabase JWT via `jose` (HS256)
- Login page works end-to-end: email/password → JWT → `/me` page shows current user + role
- RLS performance baseline measured and committed
- Test framework scaffolded so Phase 2 can write tests on day 1

## Decisions locked in (eng review 2026-05-02)

| # | Decision | Choice | Why |
|---|---|---|---|
| 1 | Email confirmation for seed demo users | **Auto-confirm via SQL** (`update auth.users set email_confirmed_at = now()` for seeded users only) | Real users created in Phase 3 still go through email flow. Demo flow not blocked. |
| 2 | Test framework scaffolding | **Scaffold all 3 in Phase 1** (vitest + msw + Playwright) | Phase 2 starts writing tests immediately. No retrofit cost. |
| 3 | Migration apply approach | **Push directly to main Supabase project** with safety wrapper | Fastest. Mitigated by dry-run + one-at-a-time apply (see §Runbook below). |

## Architecture (post fixes)

```
[Browser/Login]                                                    
       │ supabase.auth.signInWithPassword()                         
       ▼                                                            
┌──────────────────────────────────────┐                           
│ Supabase Auth                         │                           
│ ┌────────────────────────────────┐   │                           
│ │ custom_access_token_hook       │   │ ← NEW IN 0004_auth_hook.sql
│ │ Reads app_users by user_id     │   │   (Fix A1)                
│ │ Injects {role, dealer_id,      │   │                           
│ │  supplier_id, partner_id,      │   │                           
│ │  outlet_id} into app_metadata  │   │                           
│ └────────────────────────────────┘   │                           
└────────────────┬─────────────────────┘                           
                 │ JWT (HS256, signed with SUPABASE_JWT_SECRET)    
                 ▼                                                  
       [Browser stores JWT in Zustand auth store]                  
                 │                                                  
                 │ Authorization: Bearer <JWT>                      
                 ▼                                                  
┌────────────────────────────────────────┐                         
│ Hono on CF Workers                      │                         
│ middleware/auth.ts:                     │                         
│   await jose.jwtVerify(jwt, secret)     │                         
│   c.set('user',  payload.sub)           │                         
│   c.set('role',  payload.app_metadata)  │ ← read from JWT,        
│   c.set('dealerId', ...)                │   never query app_users  
└────────────────┬───────────────────────┘                         
                 │ forward user JWT                                 
                 ▼                                                  
       [Supabase: RLS policies read auth.jwt() -> app_metadata]    
```

## File deltas

### Supabase
| File | Source | Action |
|---|---|---|
| `supabase/migrations/0001_init.sql` | `reference/production/supabase/migrations/0001_init.sql` | Copy verbatim (527 lines) |
| `supabase/migrations/0002_rls.sql` | `reference/production/supabase/migrations/0002_rls.sql` | Copy + audit InitPlan wrap (every `auth.app_xxx()` becomes `(select auth.app_xxx())`) per CLAUDE.md §8 Fix 2 |
| `supabase/migrations/0003_rpcs.sql` | `reference/production/supabase/migrations/0003_rpcs.sql` | Copy verbatim (462 lines) |
| `supabase/migrations/0004_auth_hook.sql` | **NEW (write from CLAUDE.md §8 spec)** | Defines `auth.custom_access_token_hook(jsonb)` injecting role + entity ids |
| `supabase/seed.sql` | zip's seed.sql + auto-confirm patch | Copy + append `update auth.users set email_confirmed_at = now() where email like '%@carres.com'` |

### packages/shared (4 files)
| File | Source |
|---|---|
| `db-types.ts` | Copy verbatim from `reference/production/src/lib/db-types.ts` |
| `domain.ts` | Copy verbatim from `reference/production/src/lib/domain.ts` |
| `adapters.ts` | Copy verbatim from `reference/production/src/lib/adapters.ts` |
| `schemas/auth.ts` | NEW — zod schemas for login form (email/password) and `/api/auth/me` response |

### apps/api (5 files)
| File | Purpose |
|---|---|
| `lib/supabase.ts` | createClient factory: 2 modes — user JWT (RLS) and service_role (admin) |
| `middleware/auth.ts` | jose JWT verify + attach user/role/entity ids to `c.var` |
| `middleware/role-gate.ts` | `requireRole(allowed[])` checks `c.var.role` |
| `routes/auth.ts` | `GET /api/auth/me` returns `{ id, email, role, dealerId?, supplierId?, partnerId?, outletId? }` |
| `index.ts` | Wire middleware + routes (replaces Phase 0 `/health` only) |

### apps/web (5 files)
| File | Purpose |
|---|---|
| `lib/supabase.ts` | **Auth ops only** (signInWithPassword, signOut, resetPassword, onAuthStateChange) — NEVER for queries |
| `lib/auth.ts` | Zustand store: `{ session, user, role, loading }` + actions |
| `lib/api.ts` | `fetch` wrapper: prepend `VITE_API_BASE_URL`, attach `Authorization: Bearer <JWT>` from store |
| `pages/Login.tsx` | Build from scratch reading `reference/proto/*.jsx` for visual fidelity. Terracotta + Big Shoulders Stencil for brand mark. |
| `App.tsx` | Routes: `/login`, `/me`, `/` redirect. `RequireAuth` wrapper component. |

### Test scaffolding (NEW per decision 2)
| File | Purpose |
|---|---|
| `apps/web/vitest.config.ts` | jsdom env + setup |
| `apps/web/src/test/setup.ts` | RTL imports, MSW server bootstrap |
| `apps/api/vitest.config.ts` | node env + msw |
| `apps/api/src/test/server.ts` | MSW handlers for Supabase responses |
| `packages/shared/vitest.config.ts` | node env (adapters/schemas tests) |
| `playwright.config.ts` (root) | Chromium-only, baseURL `http://localhost:5173` |
| `e2e/login.spec.ts` | First test: demo dealer logs in → /me page renders role |
| `package.json` (root) | Add scripts: `test`, `test:e2e` |

## Apply runbook (decision 3 — direct to main, with safety wrapper)

```bash
# Pre-flight: make sure migrations are syntactically valid via dry-run
psql "$SUPABASE_DIRECT_URL" <<'SQL'
BEGIN;
\i supabase/migrations/0001_init.sql
\i supabase/migrations/0002_rls.sql
\i supabase/migrations/0003_rpcs.sql
\i supabase/migrations/0004_auth_hook.sql
ROLLBACK;
SQL
# If ROLLBACK above completes with no errors, syntax is OK.

# Apply one at a time (so a mid-way failure has a clear recovery point)
psql "$SUPABASE_DIRECT_URL" -f supabase/migrations/0001_init.sql
psql "$SUPABASE_DIRECT_URL" -f supabase/migrations/0002_rls.sql
psql "$SUPABASE_DIRECT_URL" -f supabase/migrations/0003_rpcs.sql
psql "$SUPABASE_DIRECT_URL" -f supabase/migrations/0004_auth_hook.sql

# Verify
psql "$SUPABASE_DIRECT_URL" -c "select count(*) from pg_tables where schemaname='public';"  # expect ~25
psql "$SUPABASE_DIRECT_URL" -c "select count(*) from pg_proc where pronamespace = 'public'::regnamespace;"  # expect ~22 RPCs

# Register Auth Hook in Supabase Dashboard (cannot be done via SQL):
#   Dashboard → Authentication → Hooks → Custom Access Token Hook
#   Function: auth.custom_access_token_hook
#   Enable.

# Run seed
psql "$SUPABASE_DIRECT_URL" -f supabase/seed.sql
```

## Failure modes — mitigations

| Failure | Mitigation |
|---|---|
| Auth Hook function errors mid-login | Hook returns the original event on any error (graceful degradation). RLS policies have `(select auth.app_role()) is not null` as a safety check. |
| `psql -f 0002_rls.sql` fails mid-way | Each migration starts with `BEGIN;` and ends with `COMMIT;` (Postgres convention) — partial state should be impossible per file. Cross-file partial state: dashboard SQL editor can clean up. |
| JWT secret mismatch (web vs api) | API returns 401 with body `{error: 'JWT verification failed', hint: 'Check SUPABASE_JWT_SECRET matches Supabase project'}` |
| `service_role` accidentally in `apps/web/dist` | **Phase 1 acceptance gate**: `grep -ri SERVICE_ROLE apps/web/dist && exit 1` runs before merge |
| Demo seed user has no `app_users` row | `seed.sql` creates `app_users` row in same transaction as `auth.users.id` insert. Trigger guards against orphan auth users. |

## Acceptance (refined)

Mark each ✅ before declaring Phase 1 done:

- [ ] All 4 migrations applied (verify: 25 tables, 19 enums, 22 RPCs in dashboard)
- [ ] `seed.sql` ran: 1 demo user per role exists with `email_confirmed_at` set
- [ ] Auth Hook registered in Supabase dashboard, verified via login (decode JWT, see `app_metadata.role` populated)
- [ ] `pnpm test` passes (vitest unit tests for adapters + zod schemas + auth middleware)
- [ ] `pnpm test:e2e` passes (Playwright `e2e/login.spec.ts` — demo dealer logs in, sees `/me` page with role displayed)
- [ ] `/api/auth/me` returns 401 without JWT
- [ ] `/api/auth/me` returns user info with valid JWT
- [ ] JWT edge cases tested (6 cases: missing header, malformed, expired, wrong signature, wrong issuer, valid but no `app_users` row)
- [ ] **service_role audit**: `grep -ri SERVICE_ROLE apps/web/dist` returns no matches
- [ ] **RLS perf baseline** (run `phase-1-rls-baseline.md` script): dealer 50 active orders < 100ms, principal dashboard < 500ms, logistics 4-col kanban < 200ms
- [ ] `/review` skill run, no P0/P1 unresolved
- [ ] Phase reflection written: `phase-1-reflection.md`

## Test plan summary

See `~/.gstack/projects/wenwei4046-Carres-Portal-v2/wenwei4046-main-eng-review-test-plan-2026-05-02.md` for the QA-consumable test plan.

## Worktree parallelization

| Lane | Tasks | Depends on |
|---|---|---|
| **A** DB | 0001/0002/0003/0004 migrations + seed | — |
| **B** Shared | db-types, domain, adapters, zod schemas | — |
| **C** API | middleware/auth, role-gate, lib/supabase, routes/auth | A + B |
| **D** Web | lib/supabase, lib/auth, lib/api, Login.tsx, App.tsx | B |
| **E** Tests | vitest configs, msw, Playwright, login.spec.ts | C + D |

Execution: Launch A and B in parallel. Then C waits for A+B; D waits for B (independent of A — D can run with C). E waits for C+D.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 11 issues, all addressed; 0 critical gaps remain |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**UNRESOLVED:** 0 (3 decisions made, 8 issues fixed in-plan)
**VERDICT:** ENG CLEARED — ready to implement Phase 1.

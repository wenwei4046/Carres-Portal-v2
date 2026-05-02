# Phase 0 Reflection — Foundation

**Started:** 2026-05-02 12:18 GMT+8
**Completed:** 2026-05-02
**Branch:** `main` (committed directly per Loo's chunk-by-chunk approval style)

## What was built

| Chunk | Output | Commit |
|---|---|---|
| Bootstrap | `.gitignore`, `CLAUDE.md`, `CARRES_PORTAL_V2_PLAN.md` | `88e847a` |
| C1 Workspace | `package.json` (root), `pnpm-workspace.yaml` | `3d390c9` |
| C2 apps/web | Vite + React 18 + TS + RR7 + Tailwind 3 + shadcn config + warm-linen HSL tokens | `6162840` |
| C3 apps/api | Hono + Wrangler + `/health` route | `593375a` |
| C4 packages/shared | Empty workspace package with placeholder export | `8ec6c05` |
| C5 env template | Top-level `.env.example` documentation aggregator | `5515b9f` |

## Acceptance status

| Criterion | Status | Evidence |
|---|---|---|
| `pnpm install` succeeds | ✅ | 218 packages, 7.4s |
| `pnpm dev` starts both services in parallel | ✅ | Both `vite` and `wrangler dev` log "Ready" |
| `localhost:8787/health` returns `{ok:true}` | ✅ | `GET /health 200 OK (4ms)` confirmed |
| `localhost:5173` returns blank page | ✅ | 200 OK, 921 bytes (empty React mount) |
| GitHub Actions → CF staging deploy | ⏭️ Deferred | Per Loo's "build locally first" directive — fold into Phase 9 |

## Surprises

1. **pnpm v10 strict mode skipped 4 build scripts** (esbuild, sharp, workerd) — the workerd one is critical for `wrangler dev`. Fixed via `pnpm.onlyBuiltDependencies` in root `package.json` + `pnpm rebuild`.

2. **Vite and Wrangler bind different IP families on Windows**:
   - Wrangler 3.x → IPv4 `127.0.0.1` only
   - Vite 5.x → IPv6 `::1` only
   Browsers hit `localhost` → both work via Happy Eyeballs. Automation that hardcodes `127.0.0.1` will miss Vite. Worth knowing for any CI smoke test we add later.

3. **Wrangler suggests upgrade to v4** (we use v3.114.17). Defer until Phase 1 when we wire Supabase/auth — not blocking now.

4. **Reference's `package.json` uses RR6**, but we use RR7 per project CLAUDE.md §2 stack mandate. Both packages still publish — `react-router-dom@^7.0.0` resolves cleanly.

## Schema tweaks
None. Schema work begins Phase 1.

## Decisions worth remembering for future phases

| Decision | Why |
|---|---|
| `@carres/shared` consumed as raw `.ts`, no build step | Vite + Wrangler both transpile via esbuild — extra build is dead weight |
| Cloudflare deploy deferred to end | Loo wants to validate locally before paying CF infra setup cost |
| `onlyBuiltDependencies` allowlist in root `package.json` | pnpm v10 default is paranoid; we explicitly trust esbuild/sharp/workerd |
| HSL conversion via Node script, not eyeballed | Match `reference/shared/styles.css` precisely (CLAUDE.md §10 pixel-fidelity rule) |
| `compatibility_flags = ["nodejs_compat"]` pre-enabled | Avoids config churn when `jose` lands in Phase 1 |
| `App.tsx` returns `null` literally | Phase 0 acceptance reads "blank page" — taken at face value, no fake placeholder UI |

## Lessons for Phase 1

1. **Wrangler-side env handling**: Phase 1 will create `apps/api/.dev.vars` with the 4 Supabase keys Loo provided. Make sure that file is in `.gitignore` (already is via the broader `.dev.vars` pattern in our `.gitignore`).

2. **service_role rotation reminder**: After Phase 1 first deploys + uses the service_role key from chat, recommend Loo rotate it at Supabase Dashboard. Same for JWT secret. The anon key + URL are public-by-design.

3. **JWT custom claims hook (CLAUDE.md §8)**: First Phase 1 task should be the Supabase Auth Hook injecting `role` + `dealer_id` etc into JWT app_metadata. RLS policies must read from `auth.jwt() -> 'app_metadata'`, never from helper functions that query `app_users` per-row.

4. **RLS performance baseline at end of Phase 1**: Don't skip. Seed 10K orders, run the 3 baseline queries (dealer self-orders < 100ms, principal dashboard < 500ms, logistics kanban < 200ms). If anything fails → fix in Phase 1, not later.

## Open question for Loo

- **GitHub push cadence**: Push after each phase tag, or only at major milestones? Currently 5 commits sit local-only on `main`. Defaulting to "push after each phase" makes the GitHub mirror useful as a backup; flag if you prefer otherwise.

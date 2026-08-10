/**
 * WHERE THE BROWSER SENDS ITS WRITES — decided here, once, and guarded.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS
 *
 * `VITE_API_BASE_URL` lives in `.env.local`, which is gitignored — so it is set
 * per machine, per clone and per WORKTREE, and nothing in the repository could
 * see what it was set to. Measured on this machine, 2026-08-10:
 *
 *     18 of 19 worktrees pointed `vite dev` at
 *     https://carres-portal-v2-api.wwch.workers.dev
 *
 * That is the production Worker. A dev server started in any of them was
 * writing to the live business through the real API, with the developer
 * believing they were local. Nothing said so: `api.ts` read the variable and
 * used it.
 *
 * A note in a README could not have caught that, and neither could fixing the
 * files — the next `git worktree add` recreates the problem. The guard has to
 * live in the code the browser actually runs.
 *
 * ── THE RULE ──
 *
 *   DEV build  +  a base that is not this machine   →  REFUSE TO START.
 *
 * Refusing to boot is the correct severity. A dev session that will not start
 * costs a minute; a dev session quietly writing to production costs whatever it
 * wrote. The message names the file to change, so the fix is one line away.
 *
 * PRODUCTION BUILDS ARE UNTOUCHED. `.env.production` points at the Worker
 * because that is its job, and `import.meta.env.DEV` is false there.
 *
 * ── THE ESCAPE HATCH, AND WHY IT IS EXPLICIT ──
 *
 * Debugging a production-only problem against the real API is legitimate. It
 * is also the exact act this guard exists to stop happening BY ACCIDENT, so it
 * needs a deliberate signal rather than a silent default:
 *
 *     VITE_ALLOW_REMOTE_API=1 pnpm --filter @carres/web dev
 *
 * Typed per session, on purpose, by someone who means it.
 */

/** Hosts that are unambiguously this machine. Anything else is somebody's server. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"]);

export function isLocalApiBase(base: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(base).hostname);
  } catch {
    /* A relative or malformed base is not a remote server, so it is not this
     * guard's business — the "unset" branch below reports it instead. */
    return true;
  }
}

/** The subset of `import.meta.env` this decision reads. */
export interface ApiBaseEnv {
  VITE_API_BASE_URL?: string;
  VITE_ALLOW_REMOTE_API?: string;
  DEV?: boolean;
  MODE?: string;
}

export class ApiBaseMisconfigured extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiBaseMisconfigured";
  }
}

export function resolveApiBase(env: ApiBaseEnv): string {
  const base = (env.VITE_API_BASE_URL ?? "").trim();

  /* Unit tests never reach the network — every suite mocks `fetch` or the
   * query layer — and they run with no .env at all. Guarding them would fail
   * 2700 tests over a variable none of them use. */
  if (env.MODE === "test") return base;

  if (!env.DEV) return base; // a production build is meant to be remote

  if (!base) {
    throw new ApiBaseMisconfigured(
      "VITE_API_BASE_URL is not set, so every API call would go to the Vite " +
        "dev server and 404. Copy apps/web/.env.example to apps/web/.env.local " +
        "and set VITE_API_BASE_URL=http://127.0.0.1:8888 (the port in apps/api " +
        "package.json's `dev` script).",
    );
  }

  if (!isLocalApiBase(base) && env.VITE_ALLOW_REMOTE_API !== "1") {
    throw new ApiBaseMisconfigured(
      `This dev build is pointed at ${base}, which is not this machine — every ` +
        "save, approve and apply would be written to the LIVE business. Set " +
        "VITE_API_BASE_URL=http://127.0.0.1:8888 in apps/web/.env.local and run " +
        "the API with `pnpm --filter @carres/api dev`. If you genuinely mean to " +
        "work against the remote API, say so on purpose: " +
        "VITE_ALLOW_REMOTE_API=1 pnpm --filter @carres/web dev",
    );
  }

  return base;
}

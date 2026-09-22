import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ZodTypeAny, infer as ZodInfer } from "zod";

/**
 * Postgres SQLSTATE → HTTP status + error body. Spec §17.5 CQ2 contract:
 *   42501 → 403 forbidden
 *   42P01 → 404 not_found
 *   22023 → 422 invalid_param
 *   P0001 → 422 with detail code
 *   40001 → 409 conflict (serialization_failure — concurrent_claim guard)
 *   23505 → 409 conflict (unique_violation — a value another row already has)
 *   else  → 500 rpc_failed
 *
 * 40001 is raised by v3 RPCs that take a SELECT ... FOR UPDATE lock and find
 * the protected invariant already broken (e.g. _v3_claim_threads_for_po in
 * migration 0037 — two operation users issued POs for the same threads).
 * Surfaces as 409 Conflict so the FE can show "Refresh and try again"
 * distinctly from generic 422 validation failures.
 *
 * TODO (Pipeline v2 follow-up): v2 detail-passthrough is currently scoped to
 * `mapPipelineV2Error` in routes/operation/orders.ts (it forwards the RPC's
 * `detail` as `code` for 22023 too, plus a `hint` field). Hoist that 22023
 * detail handling here when other routes need it (attach_do, warehouse routes
 * flagged in C3.1 review). Out of scope for C3.1 — wider blast radius.
 */
export type PgErrorish = { code?: string; message?: string; details?: string };

export function mapPgError(error: PgErrorish) {
  switch (error.code) {
    case "42501":
      return { status: 403 as const, body: { error: "forbidden", code: "forbidden", message: error.message ?? "forbidden" } };
    case "42P01":
      return { status: 404 as const, body: { error: "not_found", code: "not_found", message: error.message ?? "not found" } };
    /* P0002 is Postgres's `no_data_found`, and it is what THIS CODEBASE's RPCs
     * raise for "that row is not there" — measured 2026-08-10, more than twenty
     * live functions across finance, guarantees, orders, purchasing and the
     * catalog. Every one of them reached the browser as a 500 `rpc_failed`,
     * because the switch fell through to `default`.
     *
     * Found by running WITHDRAW against PRODUCTION with a uuid that does not
     * exist: HTTP 500, "Attribution request not found". The sentence was right
     * and the status was a lie — a missing row is the caller's mistake, not the
     * system breaking. A 500 sends an operator hunting for an outage that is not
     * there, and buries the real 500s in the noise. */
    case "P0002":
      return { status: 404 as const, body: { error: "not_found", code: "not_found", message: error.message ?? "not found" } };
    /* 23505 is Postgres's `unique_violation`, and it is the same complaint as
     * P0002 above with the sign flipped: a value some other row already holds
     * is the KEYER's mistake, not the system breaking. Measured 2026-09-22 —
     * only seven route files special-case it (account, catalog, hr-team,
     * order-payments, ops/issues, pwp-codes, rental); every other unique
     * constraint in the schema reached the browser as a 500 `rpc_failed`.
     * Found on the 0543 dealer master: type a `code` another dealer has and
     * Finance gets HTTP 500 with the raw constraint text in the toast.
     *
     * 409 because that is what this codebase already answers for a taken
     * value (ops/issues.ts:70, rental.ts, catalog.ts's optionPoolDuplicate);
     * hr-team's 422 is the outlier and is left alone.
     *
     * This is the ONE case that does not forward `error.message`. The driver's
     * text is `duplicate key value violates unique constraint
     * "dealers_code_unique"` — a constraint name is not a sentence, and the
     * operator this portal is built for cannot read it. Postgres does carry
     * the constraint name (and `Key (code)=(JB1) already exists.` in
     * `details`), but nothing in this repo maps a constraint name to a
     * sentence, so this is the floor: a route that knows which field the
     * keyer typed still names it first and only falls through to here. */
    case "23505":
      return { status: 409 as const, body: { error: "conflict", code: "already_exists", message: "That value is already used. Change it and save again." } };
    case "22023":
      return { status: 422 as const, body: { error: "invalid_param", code: "invalid_param", message: error.message ?? "invalid param" } };
    case "P0001":
      return { status: 422 as const, body: { error: "rule_violation", code: error.details ?? "invalid_param", message: error.message ?? "rule violation" } };
    case "40001":
      return { status: 409 as const, body: { error: "conflict", code: error.details ?? "concurrent_claim", message: error.message ?? "conflict" } };
    default:
      return { status: 500 as const, body: { error: "rpc_failed", code: "rpc_failed", message: error.message ?? "rpc failed" } };
  }
}

/** Answer a database error with the status and body mapPgError picks for it. */
export function fail(c: Context, error: { code?: string; message?: string; details?: string }) {
  const m = mapPgError(error);
  return c.json(m.body, m.status);
}

/**
 * Parse + zod-validate a JSON body. Returns the discriminated union so
 * the route can early-return on err without nested if-blocks.
 */
export async function parseJsonBody<S extends ZodTypeAny>(c: Context, schema: S):
  Promise<{ ok: true; data: ZodInfer<S> } | { ok: false; status: 422; body: { error: string; code: string; message: string } }> {
  let raw: unknown;
  try { raw = await c.req.json(); } catch { raw = {}; }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      status: 422,
      body: { error: "invalid_input", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid input" },
    };
  }
  return { ok: true, data: parsed.data };
}

/** PostgREST caps a single read at 1000 rows in this project. */
export const PAGE = 1000;

/**
 * Read every row of a set-returning read, 1000 at a time, in a fixed order.
 * Fail closed: an error on any page is an error for the whole read, and a
 * read longer than `maxPages` is refused rather than cut short.
 *
 * `page` MUST order by something unique, or a row can be missed or repeated
 * between two pages.
 *
 * This lived in `routes/finance/ledger.ts` until 2026-09-22. It moved here
 * because the same unbounded read shipped twice OUTSIDE that file — the
 * Department filter in `lib/line-departments.ts` (PR #1456) and the Journal's
 * own department read (PR #1495) — and a second copy of this loop is the
 * thing that must not happen next.
 */
export async function readAllPages<T = Record<string, unknown>>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: PgErrorish | null }>,
  maxPages = 20,
): Promise<{ rows: T[] } | { error: PgErrorish } | { tooMany: true }> {
  const rows: T[] = [];
  for (let i = 0; i < maxPages; i += 1) {
    const { data, error } = await page(i * PAGE, (i + 1) * PAGE - 1);
    if (error) return { error };
    if (!Array.isArray(data)) return { error: { message: "no rows array" } };
    rows.push(...(data as T[]));
    if (data.length < PAGE) return { rows };
  }
  return { tooMany: true };
}

/**
 * The most ids one read may spell into an `in (…)` URL.
 *
 * ponytail: 200 uuids is ~7 kB of query string — the same order of magnitude
 * as the LINK_SLICE of 100 that `routes/finance/ledger.ts` already calls
 * "well inside a URL". A filter needing more ids than this cannot name them
 * all; push it into an RPC that filters inside the database instead.
 */
export const IN_URL_MAX = 200;

/**
 * A read that overran its ceiling. The same answer the account ledger
 * already gives ("Choose a shorter period for this account."): 422, code
 * `too_many_rows`, one plain sentence — never a silently shorter list.
 */
export function tooManyRows(c: Context, message: string) {
  return c.json({ error: "invalid_param", code: "too_many_rows", message }, 422);
}

/** The throwing form, for the ops routes: a bad body is a 400 HTTPException. */
export async function parseBody<S extends ZodTypeAny>(c: Context, schema: S): Promise<ZodInfer<S>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Body must be valid JSON" });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: "Invalid input: " + parsed.error.issues[0]?.message });
  }
  return parsed.data;
}

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0532 ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN: a cover never
 * overlaps another active cover of its duty, it needs ONE normal holder for
 * every day it runs, and a departed (disabled) person is never resolved as a
 * holder or an acting person (workspace/MASTER.md §§4, 4.4).
 *
 * Everything runs inside ONE transaction that is rolled back at the end.
 * PREREQUISITE — a throwaway local cluster with the chain:
 *
 *   PG_BIN=<postgres bin> node scripts/dry-run-migrations.mjs --baseline scripts/migration-replay-baseline.json --keep
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- duty-cover-integrity
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `eeeeeeee-0000-4000-8000-${HEX}${tail.padStart(7, "0")}`;

const U = {
  principal: uid("1"),
  shasha: uid("2"),
  yujun: uid("3"),
  khorYee: uid("4"), // departed: disabled
};
const DUTY = `it_cover_${HEX}`;
const SPAN = `it_span_${HEX}`;
const GONE = `it_gone_${HEX}`;

describe.skipIf(!URL)("a cover never overlaps and needs one holder every day (real PostgreSQL, 0532)", () => {
  let db: pg.Client;
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
  async function attempt(sql: string, params: unknown[] = []): Promise<string> {
    await q("savepoint s");
    try {
      await q(sql, params);
      await q("release savepoint s");
      return "ok";
    } catch (e) {
      await q("rollback to savepoint s");
      return (e as { detail?: string }).detail || (e as Error).message;
    }
  }
  const assign = (duty: string, holder: string, from: string, until: string | null) =>
    attempt("select public.workspace_assign_duty($1, $2::uuid, $3::date, $4::date)", [duty, holder, from, until]);
  const cover = (duty: string, acting: string, from: string, until: string) =>
    attempt("select public.workspace_cover_duty($1, $2::uuid, $3::date, $4::date, 'Annual leave')", [
      duty, acting, from, until,
    ]);
  const resolve = async (duty: string, on: string) =>
    (await q("select public.workspace_resolve_duty($1, $2::date) as r", [duty, on])).rows[0].r as Record<
      string,
      unknown
    >;

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    const people: Array<[string, string, string, string]> = [
      [U.principal, "principal", "active", "principal"],
      [U.shasha, "operation", "active", "Shasha"],
      [U.yujun, "operation", "active", "Yu Jun"],
      [U.khorYee, "operation", "active", "Khor Yee"],
    ];
    for (const [id, role, status, name] of people) {
      const email = `it-cover-${id.slice(-4)}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status, is_person) values ($1, $2, $3, $4, $5, true)", [
        id, email, name, role, status,
      ]);
    }
    await q("select set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({ sub: U.principal, role: "authenticated" }),
    ]);
  });

  afterAll(async () => {
    if (!db) return;
    await q("rollback");
    await db.end();
  });

  it("refuses an overlapping cover for the same duty", async () => {
    expect(await assign(DUTY, U.yujun, "2030-09-01", "2030-09-30")).toBe("ok");
    expect(await cover(DUTY, U.shasha, "2030-09-10", "2030-09-12")).toBe("ok");
    expect(await cover(DUTY, U.shasha, "2030-09-12", "2030-09-14")).toBe("cover_overlap");
    expect(await cover(DUTY, U.shasha, "2030-09-05", "2030-09-20")).toBe("cover_overlap");
    // Touching but not overlapping is a different period.
    expect(await cover(DUTY, U.shasha, "2030-09-13", "2030-09-14")).toBe("ok");
  });

  it("refuses a cover that runs over a day with no holder, or a day another person holds", async () => {
    expect(await assign(SPAN, U.yujun, "2030-10-01", "2030-10-10")).toBe("ok");
    // 11 Oct has no holder.
    expect(await cover(SPAN, U.shasha, "2030-10-09", "2030-10-12")).toBe("no_duty_holder");
    // From 11 Oct Shasha holds it — Yu Jun is not the normal holder every day.
    expect(await assign(SPAN, U.shasha, "2030-10-11", null)).toBe("ok");
    expect(await cover(SPAN, U.khorYee, "2030-10-09", "2030-10-12")).toBe("no_duty_holder");
    expect(await cover(SPAN, U.khorYee, "2030-10-01", "2030-10-10")).toBe("ok");
  });

  it("names the normal holder as their own cover with its own refusal", async () => {
    expect(await cover(DUTY, U.yujun, "2030-09-20", "2030-09-21")).toBe("cover_is_holder");
  });

  it("never resolves a departed holder or a departed acting person", async () => {
    expect(await assign(GONE, U.khorYee, "2030-11-01", null)).toBe("ok");
    expect(await assign(`${GONE}_c`, U.shasha, "2030-11-01", null)).toBe("ok");
    expect(await cover(`${GONE}_c`, U.khorYee, "2030-11-05", "2030-11-06")).toBe("ok");
    expect((await resolve(GONE, "2030-11-02")).normal_user_id).toBe(U.khorYee);
    expect((await resolve(`${GONE}_c`, "2030-11-05")).acting_user_id).toBe(U.khorYee);

    await q("update app_users set status = 'disabled' where id = $1", [U.khorYee]);

    const held = await resolve(GONE, "2030-11-02");
    expect(held.source).toBe("not_assigned");
    expect(held.normal_user_id).toBeNull();
    const covered = await resolve(`${GONE}_c`, "2030-11-05");
    expect(covered.normal_user_id).toBe(U.shasha);
    expect(covered.acting_user_id).toBeNull();
    expect(covered.is_cover).toBe(false);
    expect(await cover(`${GONE}_c`, U.khorYee, "2030-11-10", "2030-11-11")).toBe("invalid_cover");
    // A departed person's cover is not an active cover: its dates are free.
    expect(await cover(`${GONE}_c`, U.yujun, "2030-11-05", "2030-11-06")).toBe("ok");
    expect((await resolve(`${GONE}_c`, "2030-11-05")).acting_user_id).toBe(U.yujun);
  });

  it("the holder arithmetic is not callable by a signed-in user", async () => {
    await q("savepoint s");
    await q("set local role authenticated");
    await expect(
      q("select public.workspace_duty_normal_on($1, current_date)", [DUTY]),
    ).rejects.toThrow(/permission denied|does not exist/);
    await q("rollback to savepoint s");
  });
});

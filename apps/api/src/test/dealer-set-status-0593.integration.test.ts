import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0593 ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN: the principal
 * and Finance may suspend and reactivate a dealer; operation and a caller with
 * no active account are refused. The audit row names the caller's role. One
 * transaction, rolled back; identities through the request-claims GUC, as
 * money-moves.integration.test.ts.
 *
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- dealer-set-status-0593
 *
 * Without the URL every case is SKIPPED.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `ffffffff-0593-4000-8000-${HEX}${tail.padStart(7, "0")}`;
const U = { principal: uid("1"), finance: uid("2"), operation: uid("3"), disabled: uid("4") };
const DEALER = uid("d1");

describe.skipIf(!URL)("Finance may suspend and reactivate a dealer (real PostgreSQL, 0593)", () => {
  let db: pg.Client;
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
  const actAs = (id: string) =>
    q("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: id, role: "authenticated" })]);
  async function setStatus(as: string, status: string): Promise<{ ok: true; status: string } | { ok: false; code: string }> {
    await actAs(as);
    await q("savepoint s");
    try {
      const r = await q("select (public.dealer_set_status($1, $2::dealer_status, null)).status::text as s", [DEALER, status]);
      await q("release savepoint s");
      return { ok: true, status: r.rows[0].s };
    } catch (e) {
      await q("rollback to savepoint s");
      return { ok: false, code: (e as { code?: string }).code ?? "" };
    }
  }
  // One transaction: every audit row has the same occurred_at, so count by role.
  const auditRows = async (role: string) =>
    Number((await q("select count(*) as n from audit_log where dealer_id = $1 and role::text = $2", [DEALER, role])).rows[0].n);

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    for (const [id, role, status] of [
      [U.principal, "principal", "active"],
      [U.finance, "finance", "active"],
      [U.operation, "operation", "active"],
      [U.disabled, "finance", "disabled"],
    ] as const) {
      const email = `it-0593-${role}-${id.slice(-3)}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status) values ($1, $2, $3, $4, $5)", [id, email, `IT ${role}`, role, status]);
    }
    await q("insert into dealers (id, name, status) values ($1, 'IT Dealer 0593', 'active')", [DEALER]);
  });

  afterAll(async () => {
    if (!db) return;
    await q("rollback");
    await db.end();
  });

  it("Finance suspends and reactivates, and the audit row says finance", async () => {
    expect(await setStatus(U.finance, "suspended")).toEqual({ ok: true, status: "suspended" });
    expect(await setStatus(U.finance, "active")).toEqual({ ok: true, status: "active" });
    expect(await auditRows("finance")).toBe(2);
    expect(await auditRows("principal")).toBe(0);
  });

  it("the principal still may", async () => {
    expect(await setStatus(U.principal, "suspended")).toEqual({ ok: true, status: "suspended" });
    expect(await setStatus(U.principal, "active")).toEqual({ ok: true, status: "active" });
    expect(await auditRows("principal")).toBe(2);
  });

  it("operation, and a disabled Finance account, are refused (NULL-safe)", async () => {
    expect(await setStatus(U.operation, "suspended")).toEqual({ ok: false, code: "42501" });
    expect(await setStatus(U.disabled, "suspended")).toEqual({ ok: false, code: "42501" });
    const now = (await q("select status::text as s from dealers where id = $1", [DEALER])).rows[0].s;
    expect(now).toBe("active");
  });
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0511 ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN: only an active
 * principal, operation, finance or bd account can hold or cover a duty.
 *
 * Before 0511 workspace_assign_duty and workspace_cover_duty refused only a
 * dealer, so a manager calling /rpc directly could make a supplier, showroom
 * or hr login a duty holder. The cases prove who is now refused and who
 * still passes, through the real doors, as the principal.
 *
 * 0514 adds one duty-specific rule on top: the Finance Approver's holder or
 * cover must be an active Finance user (workspace_duty_holder_roles). Every
 * other duty keeps the 0511 rule, which the first three cases still prove.
 *
 * Everything runs inside ONE transaction that is rolled back at the end.
 * PREREQUISITE — a throwaway local cluster with the chain:
 *
 *   PG_BIN=<postgres bin> node scripts/dry-run-migrations.mjs --baseline scripts/migration-replay-baseline.json --keep
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- duty-holder-internal-staff
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `dddddddd-0000-4000-8000-${HEX}${tail.padStart(7, "0")}`;

const U = {
  principal: uid("1"),
  principal2: uid("b"), // a second principal PERSON — nobody assigns themself (0533)
  operation: uid("2"),
  finance: uid("3"),
  finance2: uid("a"),
  bd: uid("4"),
  supplier: uid("5"),
  showroom: uid("6"),
  hr: uid("7"),
  dealer: uid("8"),
  disabledOperation: uid("9"),
};
const NOBODY = uid("f1");
const DUTY = `it_duty_${HEX}`;
const COVERED = `it_covered_${HEX}`; // held by operation alone, so the cover cases know the holder

describe.skipIf(!URL)("a duty holder or cover is active internal staff (real PostgreSQL, 0511)", () => {
  let db: pg.Client;
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
  /** One call in a savepoint: a refusal comes back as its detail code. */
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
  const assign = (holder: string | null, duty = DUTY) =>
    attempt("select public.workspace_assign_duty($1, $2::uuid, current_date)", [duty, holder]);
  const cover = (acting: string, duty = COVERED) =>
    attempt("select public.workspace_cover_duty($1, $2::uuid, current_date, current_date + 3)", [duty, acting]);

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    const people: Array<[string, string, string]> = [
      [U.principal, "principal", "active"],
      [U.principal2, "principal", "active"],
      [U.operation, "operation", "active"],
      [U.finance, "finance", "active"],
      [U.finance2, "finance", "active"],
      [U.bd, "bd", "active"],
      [U.supplier, "supplier", "active"],
      [U.showroom, "showroom", "active"],
      [U.hr, "hr", "active"],
      [U.dealer, "dealer", "active"],
      [U.disabledOperation, "operation", "disabled"],
    ];
    for (const [id, role, status] of people) {
      const email = `it-duty-${role}-${id.slice(-4)}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status, is_person) values ($1, $2, $3, $4, $5, true)", [
        id, email, `IT ${role} ${id.slice(-4)}`, role, status,
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

  it("refuses a holder who is not internal staff, disabled, or nobody", async () => {
    for (const holder of [U.supplier, U.showroom, U.hr, U.dealer, U.disabledOperation, NOBODY, null]) {
      expect(await assign(holder)).toBe("invalid_holder");
    }
  });

  it("takes an active principal, operation, finance or bd holder", async () => {
    for (const holder of [U.principal2, U.finance, U.bd, U.operation]) {
      expect(await assign(holder)).toBe("ok");
    }
    // 0533 (owner ruling 2026-09-18): nobody assigns a duty to themself — the
    // principal exception is gone.
    expect(await assign(U.principal)).toBe("self_assignment_refused");
  });

  it("refuses a cover who is not internal staff or disabled, and takes one who is", async () => {
    expect(await assign(U.operation, COVERED)).toBe("ok");
    for (const acting of [U.supplier, U.hr, U.disabledOperation, NOBODY]) {
      expect(await cover(acting)).toBe("invalid_cover");
    }
    expect(await cover(U.bd)).toBe("ok");
  });

  it("Finance Approver: only an active Finance user holds or covers it (0514)", async () => {
    for (const holder of [U.operation, U.principal, U.bd, U.hr, null]) {
      expect(await assign(holder, "finance_approver")).toBe("invalid_holder");
    }
    expect(await assign(U.finance, "finance_approver")).toBe("ok");
    for (const acting of [U.operation, U.bd]) {
      expect(await cover(acting, "finance_approver")).toBe("invalid_cover");
    }
    expect(await cover(U.finance2, "finance_approver")).toBe("ok");
  });

  it("the staff test is not callable by a signed-in user", async () => {
    await q("savepoint s");
    await q("set local role authenticated");
    await expect(q("select public.workspace_is_internal_staff($1::uuid)", [U.operation])).rejects.toThrow(
      /permission denied/,
    );
    await q("rollback to savepoint s");
    await q("savepoint s");
    await q("set local role authenticated");
    await expect(q("select public.workspace_duty_holder_roles('finance_approver')")).rejects.toThrow(
      /permission denied/,
    );
    await q("rollback to savepoint s");
  });
});

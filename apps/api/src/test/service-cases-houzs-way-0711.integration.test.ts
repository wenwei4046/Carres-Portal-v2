import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0711 ON A REAL POSTGRESQL — Weisiang's decision (Mr Lim, WhatsApp
 * 2026-10-22): Service Cases run the Houzs way.
 *
 *   My Cases       a person and everyone under them (reports_to) see the cases
 *                  they own, raised, or are the Sales Order PIC of
 *   priority       staff edit it; only low / normal / high are kept
 *   Close Case     a case closes without the customer's confirmation on file
 *   settings       the default owner is edited by the principal or a named
 *                  Service editor, never by any operation login
 *
 * One transaction, rolled back. Run against a local copy of the chain:
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/<db> pnpm --filter @carres/api test -- service-cases-houzs-way
 * Without the URL every case is SKIPPED.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `abcdabcd-0000-4000-8000-${HEX}${tail.padStart(7, "0")}`;

// lead ← sales (reports to lead); other stands apart; boss is the principal.
const U = { lead: uid("1"), sales: uid("2"), other: uid("3"), boss: uid("4"), admin: uid("5") };
const DEALER = uid("d1");
const ORDER = uid("e1");
const SALES = uid("f1");
const C = { owned: uid("c1"), raised: uid("c2"), picOrder: uid("c3"), stranger: uid("c4") };

describe.skipIf(!URL)("Service Cases the Houzs way (real PostgreSQL, 0711)", () => {
  let db: pg.Client;
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
  async function attempt(sql: string, params: unknown[] = []): Promise<string> {
    await q("savepoint s");
    try {
      const r = await q(sql, params);
      await q("release savepoint s");
      return r.rowCount === 0 ? "no rows" : "ok";
    } catch (e) {
      await q("rollback to savepoint s");
      return (e as { code?: string; message: string }).code ?? (e as Error).message;
    }
  }
  const as = async (who: string, role: string) => {
    await q("reset role");
    await q("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: who, role: "authenticated", app_metadata: { role } }),
    ]);
    await q("set local role authenticated");
  };
  const mine = async (who: string, role = "operation") => {
    await as(who, role);
    const ids = (await q("select public.my_service_case_ids() as id")).rows.map((r) => r.id as string);
    await q("reset role");
    return Object.entries(C).filter(([, id]) => ids.includes(id)).map(([k]) => k).sort();
  };

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    const people: Array<[string, string, string | null]> = [
      [U.lead, "operation", null],
      [U.sales, "operation", U.lead],
      [U.other, "operation", null],
      [U.boss, "principal", null],
      [U.admin, "operation", null],
    ];
    for (const [id, role] of people) {
      const email = `it-svc-${id.slice(-7)}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status, is_person) values ($1, $2, $3, $4, 'active', true)", [
        id, email, `IT ${id.slice(-1)}`, role,
      ]);
    }
    for (const [id, , boss] of people) {
      if (boss) await q("update app_users set reports_to_user_id = $2 where id = $1", [id, boss]);
    }
    await q("insert into dealers (id, name) values ($1, 'IT Dealer')", [DEALER]);
    await q("insert into salespersons (id, dealer_id, name) values ($1, $2, 'IT Salesperson')", [SALES, DEALER]);
    await q("insert into orders (id, dealer_id, salesperson_id, customer_name, customer_phone) values ($1, $2, $3, 'IT customer', '0100000000')", [ORDER, DEALER, SALES]);
    await q("insert into ops_order_control (order_id, assigned_staff) values ($1, $2)", [ORDER, U.sales]);
    const st = (await q("select id from service_case_statuses where code = 'pending'")).rows[0].id as string;
    const cases: Array<[string, string | null, string | null, string | null]> = [
      [C.owned, U.sales, null, null],
      [C.raised, null, U.sales, null],
      [C.picOrder, null, null, ORDER],
      [C.stranger, U.other, U.other, null],
    ];
    for (const [id, owner, by, order] of cases) {
      await q(
        "insert into service_cases (id, case_no, customer_name, status_id, owner_user_id, created_by, order_id, usable) values ($1, $2, 'IT', $3, $4, $5, $6, 'no')",
        [id, `IT-${id.slice(-8)}`, st, owner, by, order],
      );
    }
  });

  afterAll(async () => {
    if (!db) return;
    await q("rollback");
    await db.end();
  });

  it("My Cases: a person sees what they own, raised, or are the Sales Order PIC of", async () => {
    expect(await mine(U.sales)).toEqual(["owned", "picOrder", "raised"]);
  });

  it("My Cases: the person above sees their downline's cases too", async () => {
    expect(await mine(U.lead)).toEqual(["owned", "picOrder", "raised"]);
  });

  it("My Cases: nobody else's cases leak in, and a non-office login gets nothing", async () => {
    expect(await mine(U.other)).toEqual(["stranger"]);
    await q("update app_users set role = 'finance' where id = $1", [U.other]);
    expect(await mine(U.other)).toEqual([]);
    await q("update app_users set role = 'operation' where id = $1", [U.other]);
  });

  it("priority is kept as staff set it, and only the three known values", async () => {
    await as(U.admin, "operation");
    expect(await attempt("update service_cases set priority = 'low' where id = $1", [C.owned])).toBe("ok");
    expect((await q("select priority from service_cases where id = $1", [C.owned])).rows[0].priority).toBe("low");
    expect(await attempt("update service_cases set priority = 'urgent' where id = $1", [C.owned])).toBe("23514");
  });

  it("Close Case closes without the customer's confirmation on file", async () => {
    await as(U.admin, "operation");
    const closed = (await q("select id from service_case_statuses where is_closed limit 1")).rows[0].id as string;
    expect(await attempt("update service_cases set status_id = $2 where id = $1", [C.owned, closed])).toBe("ok");
  });

  it("only the Sales Order PIC (or the principal) picks the owner of a case on their order", async () => {
    const pick = (who: string) => attempt("update service_cases set owner_user_id = $2 where id = $1", [C.picOrder, who]);
    await as(U.admin, "operation");
    expect(await pick(U.admin)).toBe("42501");
    await as(U.sales, "operation");
    expect(await pick(U.admin)).toBe("ok");
    await as(U.boss, "principal");
    expect(await pick(U.other)).toBe("ok");
    await as(U.admin, "operation");
    expect(await attempt("update service_cases set owner_user_id = $2 where id = $1", [C.raised, U.admin])).toBe("ok");
  });

  it("the default owner is set by the principal, never by any operation login", async () => {
    await as(U.admin, "operation");
    expect(await attempt("update service_settings set default_owner_user_id = $1", [U.admin])).toBe("no rows");
    await as(U.boss, "principal");
    expect(await attempt("update service_settings set default_owner_user_id = $1", [U.admin])).toBe("ok");
    await as(U.admin, "operation");
    expect((await q("select default_owner_user_id from service_settings")).rows[0].default_owner_user_id).toBe(U.admin);
  });
});

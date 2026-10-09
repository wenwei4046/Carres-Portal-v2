import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0678 ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN.
 *
 *   §1  the SQL doors count the STORED Office calendar (weekdays + recorded
 *       holidays) through `_office_is_working_day` — 0584's reply due door
 *       no longer refuses only Saturday/Sunday by itself
 *   §2  a person's working week is People/HR's: HR/principal write it through
 *       `hr_upsert_employee`; internal readers get only user id + days
 *   §3  DEL-10 `Courier dispatch within` is stored behind the Settings editor
 *       gate with its change record
 *
 * Everything runs inside ONE transaction that is rolled back at the end.
 *
 *   LC_ALL=en_US.UTF-8 node scripts/dry-run-migrations.mjs --keep
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- calendars-0678
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `eeeeeeee-0678-4000-8000-${HEX}${tail.padStart(7, "0")}`;

const U = { principal: uid("1"), operation: uid("2"), hrPerson: uid("3") };
const EMPLOYEE = uid("e1");
/* Far-future fixed days, so "from today" always holds:
   Sat 5 Jan 2030 · Mon 7 Jan 2030 · Tue 8 Jan 2030. */
const SAT = "2030-01-05";
const MON = "2030-01-07";
const TUE = "2030-01-08";

describe.skipIf(!URL)("0678 — the stored calendars in SQL (real PostgreSQL)", () => {
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
      const err = e as { detail?: string; code?: string; message: string };
      if (err.detail && !err.detail.includes(" ")) return err.detail;
      // A bare `raise exception 'invalid_patch'` (P0001) is known by its message.
      return err.code === "P0001" ? err.message : err.code ?? err.message;
    }
  }
  const as = async (who: string | null) => {
    await q("reset role");
    if (who === null) {
      await q("select set_config('request.jwt.claims', '{}', true)");
      await q("set local role anon");
      return;
    }
    await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: who, role: "authenticated" })]);
    await q("set local role authenticated");
  };
  const send = (due: string) =>
    attempt("select public.work_record_request_sent($1, 'whatsapp', null, null, $2::date, 'v1', gen_random_uuid()::text)", [
      `orders:it-${HEX}:${due}:${Math.random()}`, due,
    ]);

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    for (const [id, role] of [[U.principal, "principal"], [U.operation, "operation"], [U.hrPerson, "operation"]] as const) {
      const email = `it-0678-${role}-${id.slice(-7)}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status) values ($1, $2, $3, $4, 'active')", [id, email, `IT ${role}`, role]);
    }
    await q("insert into hr_employees (id, app_user_id) values ($1, $2)", [EMPLOYEE, U.hrPerson]);
    await q("update office_calendar set work_days = '{1,2,3,4,5}' where id = 1");
    await q("insert into office_holidays (holiday_date, name, added_by) values ($1, 'Test Office holiday', $2) on conflict do nothing", [TUE, U.principal]);
  });

  afterAll(async () => {
    if (!db) return;
    await q("rollback");
    await db.end();
  });

  it("§1 a recorded Office holiday and a non-working weekday are not Office working days", async () => {
    const { rows } = await q(
      "select public._office_is_working_day($1::date) as mon, public._office_is_working_day($2::date) as sat, public._office_is_working_day($3::date) as tue",
      [MON, SAT, TUE],
    );
    expect(rows[0]).toEqual({ mon: true, sat: false, tue: false });
    const between = await q("select public._office_weekdays_between('2030-01-04'::date, '2030-01-11'::date) as n");
    expect(between.rows[0].n).toBe(4); // Mon 7 · (Tue 8 holiday) · Wed 9 · Thu 10 · Fri 11
  });

  it("§1 the reply due door refuses a stored non-working Office day and follows a Saturday Office", async () => {
    await as(U.operation);
    expect(await send(TUE)).toBe("reply_due_not_a_working_day");
    expect(await send(SAT)).toBe("reply_due_not_a_working_day");
    expect(await send(MON)).toBe("ok");
    await q("reset role");
    await q("update office_calendar set work_days = '{1,2,3,4,5,6}' where id = 1");
    await as(U.operation);
    expect(await send(SAT)).toBe("ok");
    await q("reset role");
    await q("update office_calendar set work_days = '{1,2,3,4,5}' where id = 1");
  });

  it("§2 People/HR writes the working week; internal readers get only the days; nobody else writes", async () => {
    await as(U.principal);
    expect(await attempt("select public.hr_upsert_employee($1, '{\"work_days\":[6,1,2,3,4,5]}'::jsonb)", [EMPLOYEE])).toBe("ok");
    const detail = await q("select public.hr_employee_detail($1) -> 'workDays' as d", [EMPLOYEE]);
    expect(detail.rows[0].d).toEqual([1, 2, 3, 4, 5, 6]);
    expect(await attempt("select public.hr_upsert_employee($1, '{\"work_days\":[7]}'::jsonb)", [EMPLOYEE])).toBe("invalid_patch");

    await as(U.operation);
    const read = await q("select * from public.workspace_person_work_days($1::uuid[])", [[U.hrPerson, U.operation]]);
    expect(read.rows).toEqual([{ user_id: U.hrPerson, work_days: [1, 2, 3, 4, 5, 6] }]);
    expect(Object.keys(read.rows[0])).toEqual(["user_id", "work_days"]);
    expect(await attempt("select public.hr_upsert_employee($1, '{\"work_days\":[1]}'::jsonb)", [EMPLOYEE])).toBe("42501");

    await as(null);
    expect(await attempt("select * from public.workspace_person_work_days($1::uuid[])", [[U.hrPerson]])).toBe("42501");
  });

  it("§3 Courier dispatch within: the Settings editor saves it with history; Operation is refused", async () => {
    // The column's default, whatever an earlier run on this cluster saved.
    await q("reset role");
    await q("update delivery_rules set courier_dispatch_working_days = 3 where id = 1");
    await as(U.principal);
    const before = await q("select courier_dispatch_working_days as d, revision as r from delivery_rules where id = 1");
    expect(before.rows[0].d).toBe(3);
    const rev = Number(before.rows[0].r);
    expect(await attempt("select public.delivery_set_courier_dispatch_lead(5, $1, 'it')", [rev])).toBe("ok");
    expect(await attempt("select public.delivery_set_courier_dispatch_lead(6, $1, null)", [rev])).toBe("settings_changed");
    expect(await attempt("select public.delivery_set_courier_dispatch_lead(31, $1, null)", [rev + 1])).toBe("days_out_of_range");
    const change = await q("select old_value, new_value, reason from delivery_setting_changes where what = 'courier_dispatch_lead' order by changed_at desc limit 1");
    expect(change.rows[0]).toEqual({
      old_value: { courier_dispatch_working_days: 3 },
      new_value: { courier_dispatch_working_days: 5 },
      reason: "it",
    });
    await as(U.operation);
    expect(await attempt("select public.delivery_set_courier_dispatch_lead(4, $1, null)", [rev + 1])).toBe("not_settings_editor");
  });
});

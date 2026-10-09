import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0676 ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN.
 *
 *   The activity check reads the stored Office hours and each person's own
 *   lunch (owner order, 9 Oct 2026): nobody's work moves while they are at
 *   lunch, work is never handed to a colleague at lunch, the windows and the
 *   check-time bounds follow Settings → Office, and the commit door's working
 *   day is the stored Office calendar.
 *
 * Every case runs inside ONE transaction that is rolled back at the end, each
 * in its own savepoint. The private clock `_workspace_activity_clock()` (0617)
 * is redefined inside that transaction to probe exact minutes. PREREQUISITE —
 * a throwaway local cluster:
 *
 *   LC_ALL=en_US.UTF-8 node scripts/dry-run-migrations.mjs --baseline scripts/migration-replay-baseline.json --keep
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> npx vitest run src/test/activity-lunch-window-0676.integration.test.ts
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `eeeeeeee-0676-4000-8000-${HEX}${tail.padStart(7, "0")}`;

// Staff codes fix the duty candidate order: A holds GRN Duty, then B, then C.
const U = { jess: uid("1"), a: uid("2"), b: uid("3"), c: uid("4"), hr: uid("5") };
/** A Wednesday, an Office weekday on the default calendar. */
const D = "2026-10-14";
/** A Saturday. */
const SAT = "2026-10-17";

type J = Record<string, unknown>;

describe.skipIf(!URL)("the activity check follows the Office hours and each person's lunch (real PostgreSQL, 0676)", () => {
  let db: pg.Client;
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
  const as = (sub: string | null, role = "authenticated") =>
    q("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(sub ? { sub, role } : { role })]);
  const one = async (sql: string, params: unknown[] = []) => (await q(sql, params)).rows[0] as J;
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
  const scoped = async (body: () => Promise<void>) => {
    await q("savepoint scoped_case");
    try {
      await body();
    } finally {
      await q("rollback to savepoint scoped_case");
      await as(U.jess);
    }
  };
  /** Fix the private server clock at a Kuala Lumpur local time. */
  const clock = (day: string, hhmm: string) =>
    q(`create or replace function public._workspace_activity_clock() returns timestamptz
         language sql volatile security definer set search_path = public, pg_temp
         as $f$ select timestamptz '${day} ${hhmm}:00+08' $f$`);
  const local = (v: unknown) => new Date(v as string).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const windowOf = async (user: string | null, day: string, period: "morning" | "afternoon") => {
    const w = await one("select * from public._workspace_activity_window($1::uuid, $2::date, $3)", [user, day, period]);
    return { start: local(w.window_start), cutoff: local(w.window_cutoff), lunchStart: local(w.lunch_from), lunchEnd: local(w.lunch_until) };
  };
  const setLunch = async (who: string, hhmm: string | null, target: string | null = null) => {
    await as(who);
    return (await one("select public.workspace_set_staff_lunch($1::uuid, $2::time) as r", [target, hhmm])).r as J;
  };
  const event = (user: string, day: string, hhmm: string) =>
    q("insert into workspace_activity_events (user_id, minute_at, observed_at) values ($1, $2::timestamptz, $2::timestamptz) on conflict do nothing",
      [user, `${day} ${hhmm}+08`]);
  const recordAt = async (user: string, day: string, hhmm: string) => {
    await as(user);
    await q("select public._workspace_record_activity_at($1::timestamptz)", [`${day} ${hhmm}+08`]);
    return Number((await one("select count(*) n from workspace_activity_events where user_id = $1 and observed_at = $2::timestamptz",
      [user, `${day} ${hhmm}+08`])).n);
  };
  const revision = async () => Number((await one("select revision from workspace_activity_settings where id = 1")).revision);
  /** The commit door, as the scheduler (service role). */
  const commit = async (day: string, period: "morning" | "afternoon", from: string | null, to: string | null,
                        outcome: string, reason: string, holidays: string[] = []) => {
    await as(null, "service_role");
    const r = await attempt(
      `select public.workspace_commit_activity_checkpoint('duty', 'grn_duty', $1::date, $2, $3, null, $4::uuid, $5::uuid, $6, $7, $8::date[])`,
      [day, period, await revision(), from, to, outcome, reason, holidays],
    );
    await as(U.jess);
    return r;
  };
  const receipt = async (day: string, period: string) =>
    (await q("select to_user_id, outcome, cutoff_at from workspace_assignment_checkpoints where scope_type = 'duty' and scope_key = 'grn_duty' and office_day = $1::date and period = $2",
      [day, period])).rows[0] as J | undefined;

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    // Only this run's people may be chosen; the chain's own duty rows move aside.
    await q("update app_users set status = 'disabled' where role = 'operation'");
    await q("update workspace_duty_assignments set duty_key = duty_key || '_chain' where duty_key in ('po_duty', 'grn_duty', 'delivery_duty')");
    const people: Array<[string, string, string, string]> = [
      [U.jess, "principal", "Lunch Jess", `LT${HEX}0`],
      [U.a, "operation", "Lunch A", `LT${HEX}A`],
      [U.b, "operation", "Lunch B", `LT${HEX}B`],
      [U.c, "operation", "Lunch C", `LT${HEX}C`],
      [U.hr, "hr", "Lunch HR", `LT${HEX}H`],
    ];
    for (const [id, role, name, code] of people) {
      const email = `it-lunch-${id.slice(-4)}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status, is_person, staff_code) values ($1, $2, $3, $4, 'active', true, $5)",
        [id, email, name, role, code]);
    }
    await q(
      `insert into workspace_duty_assignments (duty_key, holder_id, effective_from, effective_until, assigned_by, note)
       values ('grn_duty', $1, date '2026-01-01', null, $2, 'it 0676')`,
      [U.a, U.jess],
    );
    // The owner-confirmed Office calendar and check times (OFF-02 · OFF-04 · WS-02 · WS-03).
    await q(`update office_calendar set work_days = '{1,2,3,4,5}', start_time = '09:00', end_time = '18:00',
               flexi_minutes = 60, lunch_start = '13:00', lunch_end = '14:00', lunch_shift_minutes = 60 where id = 1`);
    await q("update workspace_activity_settings set morning = '10:00', afternoon = '14:01' where id = 1");
    await as(U.jess);
  });

  afterAll(async () => {
    if (!db) return;
    await q("rollback");
    await db.end();
  });

  it("control: A holds GRN Duty on the test day and the Office lunch gives the owner defaults", async () => {
    const scope = (await one("select public._workspace_activity_scope('duty', 'grn_duty', $1::date) as s", [D])).s as J;
    expect(scope.assignedUserId).toBe(U.a);
    expect(scope.candidateUserIds).toEqual([U.b, U.c, U.a]);
    // Nothing is recorded for the probe days before the cases run.
    expect(Number((await one("select count(*) n from workspace_assignment_checkpoints where office_day in ($1::date, $2::date)", [D, SAT])).n)).toBe(0);
    expect(Number((await one("select count(*) n from office_holidays where holiday_date in ($1::date, $2::date)", [D, SAT])).n)).toBe(0);
    expect(await windowOf(U.a, D, "morning")).toEqual({ start: "09:00", cutoff: "10:00", lunchStart: "13:00", lunchEnd: "14:00" });
    expect(await windowOf(U.a, D, "afternoon")).toEqual({ start: "14:00", cutoff: "14:01", lunchStart: "13:00", lunchEnd: "14:00" });
  });

  it("a 12:00 lunch is checked at 1:01 PM; the person's own lunch changes only their window", async () => {
    await scoped(async () => {
      const view = await setLunch(U.a, "12:00");
      expect(view).toMatchObject({ saved: "12:00", lunchStart: "12:00", lunchEnd: "13:00", earliest: "12:00",
        latest: "14:00", afternoonCheck: "13:01", morningCheck: "10:00", canEdit: true });
      expect(await windowOf(U.a, D, "afternoon")).toEqual({ start: "13:00", cutoff: "13:01", lunchStart: "12:00", lunchEnd: "13:00" });
      expect(await windowOf(U.b, D, "afternoon")).toMatchObject({ start: "14:00", cutoff: "14:01" });
    });
  });

  it("a 2:00 PM lunch: no transfer at 2:01 PM, the check comes at 3:01 PM", async () => {
    await scoped(async () => {
      await setLunch(U.a, "14:00");
      await event(U.b, D, "14:00:30");
      await clock(D, "14:01");
      // The scheduler's snapshot says the scope is not due before A's own cutoff.
      await as(null, "service_role");
      const snap = (await one("select public.workspace_activity_checkpoint_snapshot('afternoon') as s")).s as J;
      const grn = (snap.scopes as J[]).find((s) => s.key === "grn_duty")!;
      expect(local((grn.window as J).cutoff)).toBe("15:01");
      expect(local(((snap.windows as Record<string, J>)[U.b]).cutoff)).toBe("14:01");
      await as(U.jess);
      expect(await commit(D, "afternoon", U.a, U.b, "reassigned", "missing_period_activity")).toBe("checkpoint not due");
      expect(await receipt(D, "afternoon")).toBeUndefined();
      await clock(D, "15:01");
      expect(await commit(D, "afternoon", U.a, U.b, "reassigned", "missing_period_activity")).toBe("ok");
      const r = (await receipt(D, "afternoon"))!;
      expect(r).toMatchObject({ to_user_id: U.b, outcome: "reassigned" });
      expect(local(r.cutoff_at)).toBe("15:01");
    });
  });

  it("activity after a 2:00 PM lunch keeps the work; activity during it does not count", async () => {
    await scoped(async () => {
      await setLunch(U.a, "14:00");
      await clock(D, "15:01");
      expect(await recordAt(U.a, D, "14:30")).toBe(0);
      expect(await recordAt(U.a, D, "15:00")).toBe(1);
      expect(await commit(D, "afternoon", U.a, U.b, "reassigned", "missing_period_activity")).toBe("period evidence changed");
      expect(await commit(D, "afternoon", U.a, U.a, "active", "active")).toBe("ok");
    });
  });

  it("activity recorded during a person's own lunch is ignored; Office hours bound the rest", async () => {
    await scoped(async () => {
      await setLunch(U.a, "12:00");
      expect(await recordAt(U.a, D, "12:30")).toBe(0);
      expect(await recordAt(U.a, D, "13:00")).toBe(1);
      // B keeps the Office lunch: 12:30 is work, 1:30 PM is lunch.
      expect(await recordAt(U.b, D, "12:30")).toBe(1);
      expect(await recordAt(U.b, D, "13:30")).toBe(0);
      // Office start, and Office end plus the one-hour flexi allowance.
      expect(await recordAt(U.b, D, "08:59")).toBe(0);
      expect(await recordAt(U.b, D, "09:00")).toBe(1);
      expect(await recordAt(U.b, D, "19:00")).toBe(1);
      expect(await recordAt(U.b, D, "19:01")).toBe(0);
    });
  });

  it("Office start 10:00: morning evidence starts at 10:00, not 9:00", async () => {
    await scoped(async () => {
      await q("update office_calendar set start_time = '10:00' where id = 1");
      await q("update workspace_activity_settings set morning = '10:30' where id = 1");
      expect(await windowOf(U.a, D, "morning")).toMatchObject({ start: "10:00", cutoff: "10:30" });
      expect(await recordAt(U.b, D, "09:30")).toBe(0);
      await event(U.c, D, "09:30");
      await event(U.b, D, "10:05");
      await clock(D, "10:30");
      await as(null, "service_role");
      const snap = (await one("select public.workspace_activity_checkpoint_snapshot('morning') as s")).s as J;
      const seen = (snap.evidence as { events: Array<{ userId: string }> }).events.map((e) => e.userId);
      expect(seen).toContain(U.b);
      expect(seen).not.toContain(U.c);
      await as(U.jess);
      // C's 9:30 activity is before Office start: B is the active colleague.
      expect(await commit(D, "morning", U.a, U.c, "reassigned", "missing_period_activity")).toBe("period evidence changed");
      expect(await commit(D, "morning", U.a, U.b, "reassigned", "missing_period_activity")).toBe("ok");
    });
  });

  it("a moved Office lunch moves the check-time bounds and the lunch range with it", async () => {
    await scoped(async () => {
      const saved = await setLunch(U.a, "14:00");
      expect(saved.lunchStart).toBe("14:00");
      await q("update office_calendar set lunch_start = '12:00', lunch_end = '13:00' where id = 1");
      // A's saved 2:00 PM no longer fits 11:00 AM to 1:00 PM: the Office lunch applies.
      // The stored 2:01 PM check is now 61 minutes after the Office lunch, and
      // stays that far after A's lunch.
      await as(U.a);
      const view = (await one("select public.workspace_staff_lunch_view(null) as r")).r as J;
      expect(view).toMatchObject({ saved: "14:00", savedFits: false, lunchStart: "12:00", lunchEnd: "13:00",
        earliest: "11:00", latest: "13:00", afternoonCheck: "14:01" });
      expect(await attempt("select public.workspace_set_staff_lunch(null, '14:00')")).toBe("lunch_outside_range");
      expect(await attempt("select public.workspace_set_staff_lunch(null, '11:00')")).toBe("ok");
      // The editor's check times follow the Office lunch.
      await as(U.jess);
      const rev = await revision();
      expect(await attempt("select public.workspace_set_activity_times('12:30', '15:00', $1)", [rev])).toBe("invalid_check_times");
      expect(await attempt("select public.workspace_set_activity_times('11:00', '13:01', $1)", [rev])).toBe("ok");
      expect(await attempt("select public.workspace_set_activity_times('09:00', '13:01', $1)", [rev + 1])).toBe("ok");
      expect(await attempt("select public.workspace_set_activity_times('08:59', '13:01', $1)", [rev + 2])).toBe("invalid_check_times");
      expect(await attempt("select public.workspace_set_activity_times('11:00', '18:00', $1)", [rev + 2])).toBe("invalid_check_times");
    });
  });

  it("a morning check that would fall in a person's lunch waits for nobody: it ends at their lunch start", async () => {
    await scoped(async () => {
      await q("update workspace_activity_settings set morning = '12:30' where id = 1");
      await setLunch(U.a, "12:00");
      expect(await windowOf(U.a, D, "morning")).toMatchObject({ start: "09:00", cutoff: "12:00" });
      expect(await windowOf(U.b, D, "morning")).toMatchObject({ start: "09:00", cutoff: "12:30" });
    });
  });

  it("work is never handed to a colleague who is at lunch now", async () => {
    await scoped(async () => {
      await q("update workspace_activity_settings set morning = '12:30' where id = 1");
      await setLunch(U.b, "12:00");
      await event(U.b, D, "11:00");
      await event(U.c, D, "11:00");
      await clock(D, "12:30");
      // B is first in the order but at lunch at 12:30: C is the colleague.
      expect(await commit(D, "morning", U.a, U.b, "reassigned", "missing_period_activity")).toBe("period evidence changed");
      expect(await commit(D, "morning", U.a, U.c, "reassigned", "missing_period_activity")).toBe("ok");
    });
  });

  it("the commit door's working day is the stored Office calendar", async () => {
    await scoped(async () => {
      await clock(D, "15:01");
      await q("update office_calendar set work_days = '{1,2,4,5}' where id = 1");
      expect(await commit(D, "afternoon", U.a, U.a, "no_candidate", "no_candidate")).toBe("not an Office working day");
      await q("update office_calendar set work_days = '{1,2,3,4,5}' where id = 1");
      await q("insert into office_holidays (holiday_date, name, added_by) values ($1::date, 'Office closed', $2)", [D, U.jess]);
      expect(await commit(D, "afternoon", U.a, U.a, "no_candidate", "no_candidate")).toBe("not an Office working day");
    });
    await scoped(async () => {
      // A Saturday the Office calendar works is checked; the old fixed refusal is gone.
      await q("update office_calendar set work_days = '{1,2,3,4,5,6}' where id = 1");
      await clock(SAT, "15:01");
      expect(await commit(SAT, "afternoon", U.a, U.a, "no_candidate", "no_candidate")).toBe("ok");
      await q("update office_calendar set work_days = '{1,2,3,4,5}' where id = 1");
      expect(await commit(SAT, "morning", U.a, U.a, "no_candidate", "no_candidate")).toBe("not an Office working day");
    });
  });

  it("only the person, or a Staff & Duties editor, sets a lunch; every change is recorded", async () => {
    await scoped(async () => {
      await as(U.a);
      expect(await attempt("select public.workspace_set_staff_lunch($1::uuid, '12:00')", [U.b])).toBe("not_allowed");
      // Jess (the owner) edits every Settings section.
      const set = await setLunch(U.jess, "12:30", U.b);
      expect(set).toMatchObject({ userId: U.b, saved: "12:30", lunchStart: "12:30", lunchEnd: "13:30" });
      const back = await setLunch(U.b, null);
      expect(back).toMatchObject({ saved: null, lunchStart: "13:00", savedFits: true });
      const changes = (await q("select old_start::text, new_start::text, changed_by from workspace_staff_lunch_changes where user_id = $1 order by id",
        [U.b])).rows;
      expect(changes).toEqual([
        { old_start: null, new_start: "12:30:00", changed_by: U.jess },
        { old_start: "12:30:00", new_start: null, changed_by: U.b },
      ]);
      await as(U.b);
      expect(await attempt("select public.workspace_set_staff_lunch(null, '11:59')")).toBe("lunch_outside_range");
      expect(await attempt("select public.workspace_set_staff_lunch(null, '12:00:30')")).toBe("lunch_outside_range");
    });
  });

  it("colleagues read lunch times; a non internal role reads none; nobody writes the table directly", async () => {
    await scoped(async () => {
      await setLunch(U.a, "12:00");
      await as(U.b);
      await q("set local role authenticated");
      const seen = Number((await one("select count(*) n from workspace_staff_lunch where user_id = $1", [U.a])).n);
      expect(seen).toBe(1);
      expect(await attempt("insert into workspace_staff_lunch (user_id, lunch_start, changed_by) values ($1, '12:00', $1)", [U.b]))
        .toMatch(/permission denied/);
      await q("reset role");
      await as(U.hr);
      await q("set local role authenticated");
      expect(Number((await one("select count(*) n from workspace_staff_lunch")).n)).toBe(0);
      await q("reset role");
    });
  });
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0680 ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN.
 *
 * Owner ruling 9 Oct 2026: the owner or a named Staff & Duties editor may
 * record leave for a colleague who cannot log in; the record keeps who it is
 * for AND who recorded it. Same rules: no approval, MC proof optional, today's
 * leave starts the existing cover on an Office working day.
 *
 * One transaction, rolled back at the end. PREREQUISITE — a throwaway cluster:
 *   LC_ALL=en_US.UTF-8 node scripts/dry-run-migrations.mjs --keep
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> npx vitest run src/test/leave-recorded-for-0680.integration.test.ts
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `eeeeeeee-0680-4000-8000-${HEX}${tail.padStart(7, "0")}`;
const U = { jess: uid("1"), editor: uid("2"), sick: uid("3"), plain: uid("4") };
type J = Record<string, unknown>;

describe.skipIf(!URL)("leave recorded for a colleague keeps who recorded it (real PostgreSQL, 0680)", () => {
  let db: pg.Client;
  let today = "";
  let tomorrow = "";
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
  const as = (sub: string) => q("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub, role: "authenticated" })]);
  const one = async (sql: string, params: unknown[] = []) => (await q(sql, params)).rows[0] as J;
  async function attempt(sql: string, params: unknown[] = []): Promise<string> {
    await q("savepoint s");
    try { await q(sql, params); await q("release savepoint s"); return "ok"; }
    catch (e) { await q("rollback to savepoint s"); return (e as { detail?: string }).detail || (e as Error).message; }
  }

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    const kl = await one(`select timezone('Asia/Kuala_Lumpur', now())::date::text as today,
                                 (timezone('Asia/Kuala_Lumpur', now())::date + 1)::text as tomorrow`);
    today = kl.today as string; tomorrow = kl.tomorrow as string;
    const people: Array<[string, string, string]> = [
      [U.jess, "principal", "Rec Jess"], [U.editor, "operation", "Rec Editor"],
      [U.sick, "operation", "Rec Sick"], [U.plain, "operation", "Rec Plain"],
    ];
    for (const [id, role, name] of people) {
      const email = `it-rec-${id.slice(-4)}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status, is_person) values ($1, $2, $3, $4, 'active', true)", [id, email, name, role]);
    }
    // The owner names Rec Editor for Staff & Duties (0668).
    await as(U.jess);
    await q("select public.settings_grant_section_editor('staff_duties', $1)", [U.editor]);
  });
  afterAll(async () => { if (db) { await q("rollback"); await db.end(); } });

  it("the owner records a colleague's MC without proof; it is the colleague's leave, recorded by the owner", async () => {
    await as(U.jess);
    const r = (await one("select public.staff_leave_record_for($1, 'mc', $2::date, $2::date) as r", [U.sick, tomorrow])).r as J;
    expect(r.user_id).toBe(U.sick);
    expect(r.recorded_by).toBe(U.jess);
    expect(r.approval_required).toBe(false);
  });

  it("a named Staff & Duties editor may record too; a colleague not named may not", async () => {
    await as(U.editor);
    expect(await attempt("select public.staff_leave_record_for($1, 'planned', $2::date + 3, $2::date + 3)", [U.sick, tomorrow])).toBe("ok");
    await as(U.plain);
    expect(await attempt("select public.staff_leave_record_for($1, 'planned', $2::date + 5, $2::date + 5)", [U.sick, tomorrow])).toBe("not_leave_recorder");
  });

  it("my own leave through the self door records me as the recorder", async () => {
    await as(U.plain);
    const r = (await one("select public.staff_leave_submit('planned', $1::date + 7, $1::date + 7) as r", [tomorrow])).r as J;
    expect(r.recorded_by).toBe(U.plain);
  });

  it("overlap is refused for the colleague; the recorder or the person may cancel future days, nobody else", async () => {
    await as(U.jess);
    expect(await attempt("select public.staff_leave_record_for($1, 'planned', $2::date, $2::date)", [U.sick, tomorrow])).toBe("leave_overlap");
    const id = ((await one("select id from staff_leave where user_id = $1 and starts_on = $2::date", [U.sick, tomorrow])) as { id: string }).id;
    await as(U.plain);
    expect(await attempt("select public.staff_leave_cancel($1)", [id])).toBe("not_your_leave");
    await as(U.jess);
    const c = (await one("select public.staff_leave_cancel($1) as r", [id])).r as J;
    expect(c.cancelled_by).toBe(U.jess);
  });

  it("the recorder view lists colleagues (never me) and what I recorded; others see nothing", async () => {
    await as(U.jess);
    const v = (await one("select public.staff_leave_recorder_view() as v")).v as {
      canRecordForOthers: boolean; people: { id: string }[]; recorded: { userId: string }[];
    };
    expect(v.canRecordForOthers).toBe(true);
    expect(v.people.some((p) => p.id === U.jess)).toBe(false);
    expect(v.people.some((p) => p.id === U.sick)).toBe(true);
    expect(v.recorded.every((r) => r.userId !== U.jess)).toBe(true);
    await as(U.plain);
    const none = (await one("select public.staff_leave_recorder_view() as v")).v as { canRecordForOthers: boolean };
    expect(none.canRecordForOthers).toBe(false);
  });

  it("today's leave recorded for a colleague is effective now (the cover rule runs on an Office working day)", async () => {
    await as(U.jess);
    const r = (await one("select public.staff_leave_record_for($1, 'emergency', $2::date, $2::date, 'Fever') as r", [U.sick, today])).r as J;
    expect(r.recorded_by).toBe(U.jess);
    expect((await one("select public._workspace_on_leave($1, $2::date) as v", [U.sick, today])).v).toBe(true);
  });
});

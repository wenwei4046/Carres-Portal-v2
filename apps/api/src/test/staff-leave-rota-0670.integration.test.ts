import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0670 + 0671 ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN.
 *
 *   0670 · a person records their own leave (Workspace → Leave); leave covering
 *          TODAY starts cover at once — the Shared Duty Resolver names the next
 *          eligible person in the cycle at read time, any hour; future leave
 *          changes nothing until its own day; the colleague who receives the
 *          work is never someone on leave; the owner default 10:00 AM check
 *          time is storable.
 *   0671 · PO / GRN Duty rotate monthly (PO A / GRN B → PO B / GRN C → PO C /
 *          GRN A), the newcomer waits a month for PO only, a manager's month is
 *          never overwritten, planning is idempotent; Saturday on-call keeps its
 *          own window and dated rota, edited only by a Staff & Duties editor.
 *
 * Everything runs inside ONE transaction that is rolled back at the end; each
 * case runs in its own savepoint. PREREQUISITE — a throwaway local cluster:
 *
 *   LC_ALL=en_US.UTF-8 node scripts/dry-run-migrations.mjs --baseline scripts/migration-replay-baseline.json --keep
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> npx vitest run src/test/staff-leave-rota-0670.integration.test.ts
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `eeeeeeee-0670-4000-8000-${HEX}${tail.padStart(7, "0")}`;

// Staff codes fix the cycle: A → B → C → back to A. The principal is never in it.
const U = {
  jess: uid("1"),
  a: uid("2"),
  b: uid("3"),
  c: uid("4"),
  hr: uid("5"),
};

type J = Record<string, unknown>;

describe.skipIf(!URL)("leave feeds cover, PO/GRN rotate monthly, Saturday on-call (real PostgreSQL, 0670/0671)", () => {
  let db: pg.Client;
  let today = "";
  let tomorrow = "";
  let isWeekday = false;
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
  const as = (sub: string, role = "authenticated") =>
    q("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub, role })]);
  const one = async (sql: string, params: unknown[] = []) => (await q(sql, params)).rows[0] as J;
  const resolve = async (duty: string, on: string | null = null) =>
    (await one("select public.workspace_resolve_duty($1, $2::date) as r", [duty, on])).r as J;
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
  /** A first-of-month ISO date `n` months after this month. */
  const monthAhead = async (n: number) =>
    (await one(
      "select (date_trunc('month', timezone('Asia/Kuala_Lumpur', now())) + make_interval(months => $1))::date::text as d",
      [n],
    )).d as string;
  const plan = async (month: string) =>
    (await one("select public.workspace_plan_duty_rota($1::date) as r", [month])).r as {
      month: string; from: string; duties: Array<{ duty_key: string; outcome: string; holder_id: string | null }>;
    };
  const rotaRow = async (duty: string, month: string) =>
    (await q(
      `select holder_id from workspace_duty_assignments
        where duty_key = $1 and origin = 'monthly_rotation'
          and effective_from >= $2::date and effective_from < ($2::date + interval '1 month')
        order by effective_from desc, created_at desc limit 1`,
      [duty, month],
    )).rows[0]?.holder_id as string | undefined;

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    const kl = await one(
      `select timezone('Asia/Kuala_Lumpur', now())::date::text as today,
              (timezone('Asia/Kuala_Lumpur', now())::date + 1)::text as tomorrow,
              extract(isodow from timezone('Asia/Kuala_Lumpur', now())::date) between 1 and 5 as weekday`,
    );
    today = kl.today as string;
    tomorrow = kl.tomorrow as string;
    isWeekday = kl.weekday as boolean;

    // Only this run's people may be chosen: every other Operation account is
    // disabled for the (rolled back) run, and the chain's own PO/GRN rows
    // (0437's alternation) are moved out of the way so this run's months and
    // anchors are its own.
    await q("update app_users set status = 'disabled' where role = 'operation'");
    await q(
      "update workspace_duty_assignments set duty_key = duty_key || '_chain' where duty_key in ('po_duty', 'grn_duty', 'delivery_duty')",
    );
    const people: Array<[string, string, string, string]> = [
      [U.jess, "principal", "Rota Jess", `IT${HEX}0`],
      [U.a, "operation", "Rota A", `IT${HEX}A`],
      [U.b, "operation", "Rota B", `IT${HEX}B`],
      [U.c, "operation", "Rota C", `IT${HEX}C`],
      [U.hr, "hr", "Rota HR", `IT${HEX}H`],
    ];
    for (const [id, role, name, code] of people) {
      const email = `it-rota-${id.slice(-4)}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q(
        "insert into app_users (id, email, name, role, status, is_person, staff_code) values ($1, $2, $3, $4, 'active', true, $5)",
        [id, email, name, role, code],
      );
    }
    // A, B and C joined long ago: all three are in the PO cycle.
    await q(
      "insert into hr_employees (app_user_id, join_date) values ($1, date '2025-01-06'), ($2, date '2025-01-06'), ($3, date '2025-01-06')",
      [U.a, U.b, U.c],
    );
    // Today's normal owners: A holds PO, B holds GRN and Delivery Duty.
    await q(
      `insert into workspace_duty_assignments (duty_key, holder_id, effective_from, effective_until, assigned_by, note)
       values ('po_duty', $1, $3::date, null, $4, 'it 0670'),
              ('grn_duty', $2, $3::date, null, $4, 'it 0670'),
              ('delivery_duty', $2, $3::date, null, $4, 'it 0670')`,
      [U.a, U.b, today, U.jess],
    );
    await as(U.jess);
  });

  afterAll(async () => {
    if (!db) return;
    await q("rollback");
    await db.end();
  });

  // ── 0670 · leave ────────────────────────────────────────────────────────
  it("control: with no leave the normal holder answers", async () => {
    const po = await resolve("po_duty");
    expect(po.normal_user_id).toBe(U.a);
    expect(po.actor_user_id).toBe(U.a);
    expect(po.is_cover).toBe(false);
  });

  it("today's MC moves PO Duty to the next person at once; the normal owner is unchanged", async () => {
    await scoped(async () => {
      await as(U.a);
      await q("insert into storage.objects (bucket_id, name) values ('staff-leave-proof', $1)", [
        `${U.a}/${uid("99")}.pdf`,
      ]);
      const res = (await one("select public.staff_leave_submit('mc', $1::date, $1::date, null, null, array[$2]) as r", [
        today, `${U.a}/${uid("99")}.pdf`,
      ])).r as J;
      expect(res.user_id).toBe(U.a);
      expect(res.proof_paths).toEqual([`${U.a}/${uid("99")}.pdf`]);
      expect(res.approval_required).toBe(false);
      const po = await resolve("po_duty");
      expect(po.normal_user_id).toBe(U.a);
      expect(po.actor_user_id).toBe(U.b);
      expect(po.is_cover).toBe(true);
      expect(po.source).toBe("system_assignment");
      // On an Office weekday the durable movement is written by the submission.
      const moved = Number(res.cover_moved);
      if (isWeekday) {
        expect(moved).toBeGreaterThan(0);
        const m = await one(
          "select from_user_id, to_user_id, reason from workspace_assignment_movements where scope_key = 'po_duty' and office_day = $1::date order by id desc limit 1",
          [today],
        );
        expect(m).toMatchObject({ from_user_id: U.a, to_user_id: U.b, reason: "recorded_unavailability" });
      } else {
        expect(moved).toBe(0);
      }
      // The Team list shows A as off today.
      await as(U.b);
      const team = (await q("select user_id, available from public.workspace_team_today() where user_id = $1", [U.a])).rows[0];
      expect(team.available).toBe(false);
    });
  });

  it("future leave changes nothing today; on its own day it makes the person unavailable", async () => {
    await scoped(async () => {
      await as(U.a);
      expect(await attempt("select public.staff_leave_submit('planned', $1::date, $1::date + 3)", [tomorrow])).toBe("ok");
      const po = await resolve("po_duty");
      expect(po.actor_user_id).toBe(U.a);
      expect(po.is_cover).toBe(false);
      expect((await one("select public._workspace_on_leave($1, $2::date) as v", [U.a, today])).v).toBe(false);
      expect((await one("select public._workspace_on_leave($1, $2::date) as v", [U.a, tomorrow])).v).toBe(true);
      const scope = (await one("select public._workspace_activity_scope('duty', 'po_duty', $1::date) as s", [tomorrow])).s as J;
      expect(scope.assignedUserId).toBe(U.a);
      expect(scope.assignedPersonEligible).toBe(false);
      expect(scope.candidateUserIds).toEqual([U.b, U.c]);
    });
  });

  it("the receiving colleague is never someone on leave", async () => {
    await scoped(async () => {
      await as(U.b);
      expect(await attempt("select public.staff_leave_submit('emergency', $1::date, $1::date, 'Family emergency')", [today])).toBe("ok");
      await as(U.a);
      expect(await attempt("select public.staff_leave_submit('emergency', $1::date, $1::date, 'Fever')", [today])).toBe("ok");
      const po = await resolve("po_duty");
      expect(po.normal_user_id).toBe(U.a);
      expect(po.actor_user_id).toBe(U.c);
      // GRN: B is away, the next in the cycle after B is C.
      expect((await resolve("grn_duty")).actor_user_id).toBe(U.c);
    });
  });

  it("nobody eligible: the holder stays and the exception is visible, never an invented person", async () => {
    await scoped(async () => {
      for (const who of [U.a, U.b, U.c]) {
        await as(who);
        expect(await attempt("select public.staff_leave_submit('emergency', $1::date, $1::date, 'Out')", [today])).toBe("ok");
      }
      // On an Office weekday each submission already moved the work along the
      // cycle (A → B → C), so the last person it reached stays; at a weekend
      // the read-time answer keeps the holder. Either way: no candidate.
      const po = await resolve("po_duty");
      expect(po.actor_user_id).toBe(isWeekday ? U.c : U.a);
      expect(po.assignment_outcome).toBe("no_candidate");
    });
  });

  it("each type keeps its own evidence rule, overlap is refused, and only future days can be cancelled", async () => {
    await scoped(async () => {
      await as(U.c);
      // MC proof is optional (owner rule 9 Oct 2026): an MC without a file is recorded.
      expect(await attempt("select public.staff_leave_submit('mc', $1::date + 20, $1::date + 20)", [tomorrow])).toBe("ok");
      // Somebody else's file, or a file never uploaded, is not proof.
      await q("insert into storage.objects (bucket_id, name) values ('staff-leave-proof', $1)", [`${U.a}/${uid("98")}.pdf`]);
      expect(await attempt("select public.staff_leave_submit('mc', $1::date, $1::date, null, null, array[$2])", [
        tomorrow, `${U.a}/${uid("98")}.pdf`,
      ])).toBe("invalid_proof");
      expect(await attempt("select public.staff_leave_submit('mc', $1::date, $1::date, null, null, array[$2])", [
        tomorrow, `${U.c}/${uid("95")}.pdf`,
      ])).toBe("invalid_proof");
      expect(await attempt("select public.staff_leave_submit('emergency', $1::date, $1::date, E' \\t')", [tomorrow])).toBe("reason_required");
      expect(await attempt("select public.staff_leave_submit('holiday', $1::date, $1::date)", [tomorrow])).toBe("invalid_type");
      expect(await attempt("select public.staff_leave_submit('planned', $1::date, $2::date)", [tomorrow, today])).toBe("invalid_dates");
      const planned = (await one("select public.staff_leave_submit('planned', $1::date, $1::date + 2, null, 'Trip') as r", [tomorrow])).r as J;
      expect(await attempt("select public.staff_leave_submit('planned', $1::date + 1, $1::date + 5)", [tomorrow])).toBe("leave_overlap");
      // Cancel before it starts: the whole leave, kept and stamped.
      const cancelled = (await one("select public.staff_leave_cancel($1) as r", [planned.id])).r as J;
      expect(cancelled.cancelled_from).toBe(tomorrow);
      expect(cancelled.cancelled_by).toBe(U.c);
      expect(await attempt("select public.staff_leave_cancel($1)", [planned.id])).toBe("already_cancelled");
      expect((await one("select public._workspace_on_leave($1, $2::date) as v", [U.c, tomorrow])).v).toBe(false);
      // Its days are free again.
      expect(await attempt("select public.staff_leave_submit('planned', $1::date, $1::date)", [tomorrow])).toBe("ok");
      // Today's leave cannot be cancelled: its cover already moved.
      const todays = (await one("select public.staff_leave_submit('emergency', $1::date, $1::date, 'Clinic') as r", [today])).r as J;
      expect(await attempt("select public.staff_leave_cancel($1)", [todays.id])).toBe("leave_finished");
      // Somebody else's leave is not yours to cancel.
      await as(U.a);
      expect(await attempt("select public.staff_leave_cancel($1)", [todays.id])).toBe("not_your_leave");
    });
  });

  it("a shared login cannot record leave; HR can, without moving any routine work", async () => {
    await scoped(async () => {
      // A migration-level change (no signed-in caller): only People/HR marks a person.
      await q("select set_config('request.jwt.claims', '', false)");
      await q("update app_users set is_person = false where id = $1", [U.c]);
      await as(U.c);
      expect(await attempt("select public.staff_leave_submit('planned', $1::date, $1::date)", [tomorrow])).toBe("not_staff");
      await as(U.hr);
      const r = (await one("select public.staff_leave_submit('emergency', $1::date, $1::date, 'Flu') as r", [today])).r as J;
      expect(Number(r.cover_moved)).toBe(0);
    });
  });

  it("colleagues see who is away and when, never the type or reason; rows are private to their owner", async () => {
    await scoped(async () => {
      await as(U.a);
      await q("select public.staff_leave_submit('emergency', $1::date, $1::date + 1, 'Private reason')", [today]);
      await as(U.b);
      const rows = (await q("select * from public.workspace_leave_upcoming(7) where user_id = $1", [U.a])).rows;
      expect(rows).toHaveLength(1);
      expect(Object.keys(rows[0]).sort()).toEqual(["ends_on", "name", "starts_on", "user_id"]);
      await q("savepoint rls");
      await q("set local role authenticated");
      expect((await q("select count(*)::int as n from staff_leave where user_id = $1", [U.a])).rows[0].n).toBe(0);
      await as(U.a);
      expect((await q("select count(*)::int as n from staff_leave where user_id = $1", [U.a])).rows[0].n).toBe(1);
      // The proof bucket: your own folder only.
      expect(await attempt("insert into storage.objects (bucket_id, name) values ('staff-leave-proof', $1)", [
        `${U.a}/${uid("97")}.jpg`,
      ])).toBe("ok");
      const other = await attempt("insert into storage.objects (bucket_id, name) values ('staff-leave-proof', $1)", [
        `${U.b}/${uid("96")}.jpg`,
      ]);
      expect(other).toMatch(/row-level security/);
      await q("rollback to savepoint rls");
    });
  });

  // 0676: the floor is the stored Office start (9:00 AM by default), no longer
  // a fixed 10:00 AM, so the refused probe is a minute before Office start.
  it("the owner default 10:00 AM morning check is storable; before Office start is not", async () => {
    await scoped(async () => {
      const rev = (await one("select revision from workspace_activity_settings where id = 1")).revision;
      expect(await attempt("select public.workspace_set_activity_times('08:59', '14:01', $1)", [rev])).toBe("invalid_check_times");
      const saved = (await one("select public.workspace_set_activity_times('10:00', '14:01', $1) as r", [rev])).r as J;
      expect(saved.morning).toBe("10:00:00");
      expect(saved.afternoon).toBe("14:01:00");
    });
  });

  // ── 0671 · monthly PO / GRN rota ────────────────────────────────────────
  it("rotates PO A/GRN B → PO B/GRN C → PO C/GRN A and is idempotent", async () => {
    await scoped(async () => {
      const m1 = await monthAhead(2);
      const m2 = await monthAhead(3);
      const m3 = await monthAhead(4);
      // Last month before m1: A held PO.
      await q(
        `insert into workspace_duty_assignments (duty_key, holder_id, effective_from, effective_until, assigned_by)
         values ('po_duty', $1, ($2::date - interval '1 month')::date, ($2::date - 1), $3)`,
        [U.a, m1, U.jess],
      );
      const p1 = await plan(m1);
      expect(p1.duties).toEqual([
        { duty_key: "po_duty", outcome: "planned", holder_id: U.b },
        { duty_key: "grn_duty", outcome: "planned", holder_id: U.c },
      ]);
      const p2 = await plan(m2);
      expect(p2.duties.map((d) => d.holder_id)).toEqual([U.c, U.a]);
      const p3 = await plan(m3);
      expect(p3.duties.map((d) => d.holder_id)).toEqual([U.a, U.b]);
      // The month's row runs first day to last day, from the system.
      const row = await one(
        `select effective_from::text, effective_until::text, assigned_by, note from workspace_duty_assignments
          where duty_key = 'po_duty' and origin = 'monthly_rotation' and effective_from = $1::date`,
        [m1],
      );
      expect(row.effective_from).toBe(m1);
      expect(row.assigned_by).toBeNull();
      expect(row.note).toBe("Monthly rotation");
      // Resolution on the month's first day names the planned holder.
      expect((await resolve("po_duty", m1)).normal_user_id).toBe(U.b);
      // Idempotent: a second run keeps every month and writes nothing.
      const before = (await one("select count(*)::int as n from workspace_duty_assignments where origin = 'monthly_rotation'")).n;
      const again = await plan(m1);
      expect(again.duties.map((d) => d.outcome)).toEqual(["kept", "kept"]);
      expect((await one("select count(*)::int as n from workspace_duty_assignments where origin = 'monthly_rotation'")).n).toBe(before);
    });
  });

  it("a planned month that has not begun follows the cycle when someone joins it (0437's pre-written months included)", async () => {
    await scoped(async () => {
      // 0437's alternation is labelled as the rotation, never as a manager's month.
      expect((await one(
        "select count(*)::int as n from workspace_duty_assignments where note = 'Two-person Operation duty rotation' and origin <> 'monthly_rotation'",
      )).n).toBe(0);
      const m1 = await monthAhead(2);
      const m2 = await monthAhead(3);
      await q(
        `insert into workspace_duty_assignments (duty_key, holder_id, effective_from, effective_until, assigned_by)
         values ('po_duty', $1, ($2::date - interval '1 month')::date, ($2::date - 1), $3)`,
        [U.a, m1, U.jess],
      );
      // A two-person cycle, both months written ahead (as 0437 did).
      await q("update app_users set status = 'disabled' where id = $1", [U.c]);
      expect((await plan(m1)).duties.map((d) => d.holder_id)).toEqual([U.b, U.a]);
      expect((await plan(m2)).duties.map((d) => d.holder_id)).toEqual([U.a, U.b]);
      // C joins the cycle before either month begins: each month follows it,
      // keeping what still agrees (m1's PO) and appending what does not.
      await q("update app_users set status = 'active' where id = $1", [U.c]);
      expect((await plan(m2)).duties).toEqual([
        { duty_key: "po_duty", outcome: "replanned", holder_id: U.c },
        { duty_key: "grn_duty", outcome: "replanned", holder_id: U.a },
      ]);
      expect((await resolve("po_duty", m2)).normal_user_id).toBe(U.c);
      expect((await plan(m1)).duties).toEqual([
        { duty_key: "po_duty", outcome: "kept", holder_id: U.b },
        { duty_key: "grn_duty", outcome: "replanned", holder_id: U.c },
      ]);
    });
  });

  it("one eligible person holds both; nobody eligible leaves the month unassigned", async () => {
    await scoped(async () => {
      const m = await monthAhead(2);
      await q("update app_users set status = 'disabled' where id = any($1::uuid[])", [[U.b, U.c]]);
      const solo = await plan(m);
      expect(solo.duties).toEqual([
        { duty_key: "po_duty", outcome: "planned", holder_id: U.a },
        { duty_key: "grn_duty", outcome: "planned", holder_id: U.a },
      ]);
      const next = await monthAhead(3);
      await q("update app_users set status = 'disabled' where id = $1", [U.a]);
      const none = await plan(next);
      expect(none.duties.map((d) => d.outcome)).toEqual(["no_eligible", "no_eligible"]);
      expect(await rotaRow("po_duty", next)).toBeUndefined();
    });
  });

  it("a newcomer waits one calendar month for PO only, and joins the end of the order", async () => {
    await scoped(async () => {
      const m1 = await monthAhead(2);
      const m2 = await monthAhead(3);
      // C joins on m1's 20th: no PO in m1, GRN allowed at once.
      await q("update hr_employees set join_date = ($2::date + 19) where app_user_id = $1", [U.c, m1]);
      await q(
        `insert into workspace_duty_assignments (duty_key, holder_id, effective_from, effective_until, assigned_by)
         values ('po_duty', $1, ($2::date - interval '1 month')::date, ($2::date - 1), $3)`,
        [U.a, m1, U.jess],
      );
      const p1 = await plan(m1);
      expect(p1.duties.map((d) => d.holder_id)).toEqual([U.b, U.c]);
      const p2 = await plan(m2);
      // From m2 C is in the PO cycle: PO advances B → C.
      expect(p2.duties.map((d) => d.holder_id)).toEqual([U.c, U.a]);
    });
  });

  it("never overwrites a month a manager set, and re-plans a future month whose holder left", async () => {
    await scoped(async () => {
      const m1 = await monthAhead(2);
      await q(
        `insert into workspace_duty_assignments (duty_key, holder_id, effective_from, effective_until, assigned_by)
         values ('po_duty', $1, ($2::date - interval '1 month')::date, ($2::date - 1), $3),
                ('grn_duty', $4, $2::date, null, $3)`,
        [U.a, m1, U.jess, U.a],
      );
      const p1 = await plan(m1);
      expect(p1.duties[0]).toEqual({ duty_key: "po_duty", outcome: "planned", holder_id: U.b });
      expect(p1.duties[1]).toMatchObject({ duty_key: "grn_duty", outcome: "manager_set" });
      expect(await rotaRow("grn_duty", m1)).toBeUndefined();
      // B leaves before the month starts: the month is planned again without B.
      await q("update app_users set status = 'disabled' where id = $1", [U.b]);
      const again = await plan(m1);
      expect(again.duties[0]).toEqual({ duty_key: "po_duty", outcome: "replanned", holder_id: U.c });
      expect((await resolve("po_duty", m1)).normal_user_id).toBe(U.c);
    });
  });

  it("this month is planned only when the rotation already runs, and only from today", async () => {
    await scoped(async () => {
      const thisMonth = await monthAhead(0);
      const lastMonth = await monthAhead(-1);
      // Today's manual baseline began before this month (a manager's row that
      // starts INSIDE the month would make it the manager's month).
      await q("update workspace_duty_assignments set effective_from = ($1::date - interval '2 months')::date where note = 'it 0670'", [thisMonth]);
      const notYet = await plan(thisMonth);
      expect(notYet.duties.map((d) => d.outcome)).toEqual(["not_rotating", "not_rotating"]);
      await q(
        `insert into workspace_duty_assignments (duty_key, holder_id, effective_from, effective_until, assigned_by, note, origin)
         values ('po_duty', $1, $2::date, ($3::date - 1), null, 'Monthly rotation', 'monthly_rotation'),
                ('grn_duty', $4, $2::date, ($3::date - 1), null, 'Monthly rotation', 'monthly_rotation')`,
        [U.a, lastMonth, thisMonth, U.b],
      );
      const caught = await plan(thisMonth);
      expect(caught.from).toBe(today);
      expect(caught.duties.map((d) => d.holder_id)).toEqual([U.b, U.c]);
    });
  });

  it("only a Staff & Duties editor or the scheduler may plan", async () => {
    await scoped(async () => {
      const m = await monthAhead(2);
      await as(U.a);
      expect(await attempt("select public.workspace_plan_duty_rota($1::date)", [m])).toBe("not_settings_editor");
      await as(uid("0"), "service_role");
      expect(await attempt("select public.workspace_plan_duty_rota($1::date)", [m])).toBe("ok");
      await as(U.jess);
      expect(await attempt("select public.workspace_plan_duty_rota($1::date)", [await monthAhead(-1)])).toBe("past_month");
    });
  });

  // ── 0671 · Saturday on-call ─────────────────────────────────────────────
  it("Saturday on-call: 9:00 AM to 6:00 PM by default, editable by an editor with history", async () => {
    await scoped(async () => {
      await as(U.b);
      const read = (await one("select public.workspace_saturday_on_call_read(4) as r")).r as J;
      expect(read.window).toMatchObject({ starts_at: "09:00", ends_at: "18:00" });
      expect(read.can_edit).toBe(false);
      expect(read.people).toEqual([]);
      const rev = (read.window as J).revision;
      expect(await attempt("select public.workspace_saturday_on_call_save_window('09:00', '17:00', $1)", [rev])).toBe("not_settings_editor");
      await as(U.jess);
      expect(await attempt("select public.workspace_saturday_on_call_save_window('18:00', '09:00', $1)", [rev])).toBe("invalid_window");
      const saved = (await one("select public.workspace_saturday_on_call_save_window('10:00', '17:00', $1) as r", [rev])).r as J;
      expect(saved.starts_at).toBe("10:00:00");
      expect(await attempt("select public.workspace_saturday_on_call_save_window('09:00', '18:00', $1)", [rev])).toBe("settings_changed");
      expect((await one("select count(*)::int as n from workspace_saturday_on_call_window_changes where changed_by = $1", [U.jess])).n).toBe(1);
    });
  });

  it("Saturday on-call: a dated person and cover, a leave flag, never a Duty or a moved Task", async () => {
    await scoped(async () => {
      await as(U.jess);
      const read = (await one("select public.workspace_saturday_on_call_read(4) as r")).r as J;
      const sat = ((read.saturdays as J[])[1]).saturday as string;
      expect(await attempt("select public.workspace_saturday_on_call_set(($1::date - 1), $2)", [sat, U.a])).toBe("not_saturday");
      expect(await attempt("select public.workspace_saturday_on_call_set($1::date, $2, $2)", [sat, U.a])).toBe("cover_is_person");
      expect(await attempt("select public.workspace_saturday_on_call_set($1::date, $2)", [sat, U.hr])).toBe("invalid_person");
      expect(await attempt("select public.workspace_saturday_on_call_set($1::date, $2, $3)", [sat, U.a, U.b])).toBe("ok");
      await as(U.a);
      await q("select public.staff_leave_submit('planned', $1::date, $1::date)", [sat]);
      expect(await attempt("select public.workspace_saturday_on_call_set($1::date, $2)", [sat, U.b])).toBe("not_settings_editor");
      await as(U.jess);
      const after = (await one("select public.workspace_saturday_on_call_read(4) as r")).r as J;
      const day = (after.saturdays as J[]).find((d) => d.saturday === sat)!;
      expect(day).toMatchObject({ person_id: U.a, person_on_leave: true, cover_person_id: U.b, cover_on_leave: false });
      expect((after.people as J[]).map((p) => p.id)).toEqual(expect.arrayContaining([U.a, U.b, U.c, U.jess]));
      // Not a Duty: nothing in the Duty records, and the PO answer is unchanged.
      expect((await one("select count(*)::int as n from workspace_duty_assignments where holder_id = $1 and effective_from = $2::date", [U.a, sat])).n).toBe(0);
      expect((await resolve("po_duty")).actor_user_id).toBe(U.a);
    });
  });
});

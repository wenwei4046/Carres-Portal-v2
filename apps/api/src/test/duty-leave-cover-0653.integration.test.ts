import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0653 ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN: recorded leave
 * hands today's PO Duty / GRN Duty to the next available eligible person in the
 * Duty's cycle, without changing the normal owner; with no eligible cover the
 * holder stays and the exception stays visible; with no eligible primary or
 * cover the answer is Not assigned — never a PIC/manager/principal fallback
 * (ERP-ARCHITECTURE "Owner-approved automatic PO/GRN cover"; Workspace §4.4).
 *
 * Everything runs inside ONE transaction that is rolled back at the end; each
 * case runs in its own savepoint so one case's leave does not leak into the next.
 * PREREQUISITE — a throwaway local cluster with the chain:
 *
 *   LC_ALL=C node scripts/dry-run-migrations.mjs --baseline scripts/migration-replay-baseline.json --keep
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- duty-leave-cover
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `eeeeeeee-0653-4000-8000-${HEX}${tail.padStart(7, "0")}`;

// Staff codes fix the cycle order: A → B → C → back to A.
const U = {
  principal: uid("1"), // active, available, never in the PO/GRN cycle
  shasha: uid("2"), // code A — PO Duty holder
  yujun: uid("3"), // code B — GRN Duty holder
  newbie: uid("4"), // code C — joined this calendar month
  gone: uid("5"), // departed holder for the Not assigned case
};

type Resolution = Record<string, unknown>;

describe.skipIf(!URL)("recorded leave hands PO/GRN Duty to the next person in the cycle (real PostgreSQL, 0653)", () => {
  let db: pg.Client;
  let today = "";
  let tomorrow = "";
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
  const resolve = async (duty: string, on: string | null = null) =>
    (await q("select public.workspace_resolve_duty($1, $2::date) as r", [duty, on])).rows[0].r as Resolution;
  const away = async (who: string[], available = false) => {
    for (const id of who) {
      await q(
        `insert into ops_staff_settings (user_id, available) values ($1, $2)
         on conflict (user_id) do update set available = excluded.available`,
        [id, available],
      );
    }
  };
  /** One case = one savepoint, rolled back afterwards. */
  const scoped = async (body: () => Promise<void>) => {
    await q("savepoint leave_case");
    try {
      await body();
    } finally {
      await q("rollback to savepoint leave_case");
    }
  };

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    const kl = await q(
      `select timezone('Asia/Kuala_Lumpur', now())::date::text as today,
              (timezone('Asia/Kuala_Lumpur', now())::date + 1)::text as tomorrow,
              date_trunc('month', timezone('Asia/Kuala_Lumpur', now()))::date::text as month_start`,
    );
    today = kl.rows[0].today;
    tomorrow = kl.rows[0].tomorrow;
    const monthStart = kl.rows[0].month_start as string;

    const people: Array<[string, string, string, string, string]> = [
      [U.principal, "principal", "active", "Leave Principal", `IT${HEX}P`],
      [U.shasha, "operation", "active", "Leave Shasha", `IT${HEX}A`],
      [U.yujun, "operation", "active", "Leave Yu Jun", `IT${HEX}B`],
      [U.newbie, "operation", "active", "Leave Newbie", `IT${HEX}C`],
      [U.gone, "operation", "disabled", "Leave Gone", `IT${HEX}D`],
    ];
    for (const [id, role, status, name, code] of people) {
      const email = `it-leave-${id.slice(-4)}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q(
        "insert into app_users (id, email, name, role, status, is_person, staff_code) values ($1, $2, $3, $4, $5, true, $6)",
        [id, email, name, role, status, code],
      );
    }
    // People facts: Yu Jun joined long ago; the newcomer joined this month, so
    // the PO cycle does not admit them yet (GRN does). Shasha's PO admission
    // comes from her recorded PO assignment (no joining date, §4.4 boundary).
    await q("insert into hr_employees (app_user_id, join_date) values ($1, date '2025-01-06'), ($2, $3::date)", [
      U.yujun, U.newbie, monthStart,
    ]);
    // Nobody else in this database may take the cover: every other Operation
    // account is recorded away for the duration of the (rolled back) run.
    await q(
      `insert into ops_staff_settings (user_id, available)
       select id, false from app_users where role = 'operation' and not (id = any($1::uuid[]))
       on conflict (user_id) do update set available = false`,
      [[U.shasha, U.yujun, U.newbie, U.gone]],
    );
    await away([U.shasha, U.yujun, U.newbie], true);
    // Today's normal owners. Newest effective row wins in the shared resolver.
    await q(
      `insert into workspace_duty_assignments (duty_key, holder_id, effective_from, effective_until, assigned_by, note)
       values ('po_duty', $1, $3::date, null, $4, 'it 0653'), ('grn_duty', $2, $3::date, null, $4, 'it 0653')`,
      [U.shasha, U.yujun, today, U.principal],
    );
  });

  afterAll(async () => {
    if (!db) return;
    await q("rollback");
    await db.end();
  });

  it("control: with no recorded leave the normal holder answers", async () => {
    const po = await resolve("po_duty");
    expect(po.normal_user_id).toBe(U.shasha);
    expect(po.actor_user_id).toBe(U.shasha);
    expect(po.is_cover).toBe(false);
    expect(po.source).toBe("assignment");
    expect(po.assignment_outcome).toBeUndefined();
    const grn = await resolve("grn_duty");
    expect(grn.normal_user_id).toBe(U.yujun);
    expect(grn.actor_user_id).toBe(U.yujun);
    expect(grn.is_cover).toBe(false);
  });

  it("PO holder on leave: the next eligible person covers today and the normal owner is unchanged", async () => {
    await scoped(async () => {
      await away([U.shasha]);
      const po = await resolve("po_duty");
      expect(po.normal_user_id).toBe(U.shasha);
      expect(po.actor_user_id).toBe(U.yujun);
      expect(po.acting_user_id).toBe(U.yujun);
      expect(po.acting_user_name).toBe("Leave Yu Jun");
      expect(po.is_cover).toBe(true);
      expect(po.source).toBe("system_assignment");
      expect(po.assignment_reason).toBe("recorded_unavailability");
      expect(po.assignment_outcome).toBe("reassigned");
      expect(po.assignment_movement_id).toBeNull();
      // GRN Duty's own holder is not on leave: untouched.
      const grn = await resolve("grn_duty");
      expect(grn.actor_user_id).toBe(U.yujun);
      expect(grn.is_cover).toBe(false);
      // The away switch carries no dates: tomorrow is never guessed.
      const later = await resolve("po_duty", tomorrow);
      expect(later.normal_user_id).toBe(U.shasha);
      expect(later.is_cover).toBe(false);
      expect(later.actor_user_id).toBe(U.shasha);
    });
  });

  it("GRN holder on leave: the cycle skips anyone else on leave and wraps round", async () => {
    await scoped(async () => {
      await away([U.yujun, U.newbie]);
      const grn = await resolve("grn_duty");
      expect(grn.normal_user_id).toBe(U.yujun);
      expect(grn.actor_user_id).toBe(U.shasha);
      expect(grn.is_cover).toBe(true);
    });
  });

  it("negative control: no eligible cover keeps the holder visible and invents nobody", async () => {
    await scoped(async () => {
      // Shasha and Yu Jun away; only the joining-month newcomer is in.
      await away([U.shasha, U.yujun]);
      const po = await resolve("po_duty");
      expect(po.normal_user_id).toBe(U.shasha);
      expect(po.actor_user_id).toBe(U.shasha);
      expect(po.acting_user_id).toBeNull();
      expect(po.is_cover).toBe(false);
      expect(po.source).toBe("assignment");
      expect(po.assignment_outcome).toBe("no_candidate");
      expect(po.actor_user_id).not.toBe(U.newbie);
      expect(po.actor_user_id).not.toBe(U.principal);
      // The newcomer may take GRN in the joining month (the exclusion is PO only).
      const grn = await resolve("grn_duty");
      expect(grn.normal_user_id).toBe(U.yujun);
      expect(grn.actor_user_id).toBe(U.newbie);
      expect(grn.is_cover).toBe(true);
    });
  });

  it("negative control: no eligible primary or cover is Not assigned, never a principal fallback", async () => {
    await scoped(async () => {
      // One transaction shares one now(): stamp the newer row explicitly so the
      // resolver's "newest effective row" is this one, not a tie.
      await q(
        `insert into workspace_duty_assignments (duty_key, holder_id, effective_from, effective_until, assigned_by, note, created_at)
         values ('po_duty', $1, $2::date, null, $3, 'it 0653 departed', now() + interval '1 second')`,
        [U.gone, today, U.principal],
      );
      await away([U.shasha, U.yujun, U.newbie]);
      const po = await resolve("po_duty");
      expect(po.source).toBe("not_assigned");
      expect(po.normal_user_id).toBeNull();
      expect(po.actor_user_id).toBeNull();
      expect(po.acting_user_id).toBeNull();
      expect(po.is_cover).toBe(false);
    });
  });

  it("the recorded movement names the same person the resolver already answered", async () => {
    await scoped(async () => {
      await away([U.shasha]);
      const before = await resolve("po_duty");
      expect(before.actor_user_id).toBe(U.yujun);
      expect(before.assignment_movement_id).toBeNull();

      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role" })]);
      await q("select public.workspace_process_recorded_unavailability()");
      await q("select set_config('request.jwt.claims', '', true)");

      const moved = await q(
        `select from_user_id, to_user_id, reason from workspace_assignment_movements
          where scope_type = 'duty' and scope_key = 'po_duty' and office_day = $1::date
          order by id desc limit 1`,
        [today],
      );
      expect(moved.rows[0]).toEqual({ from_user_id: U.shasha, to_user_id: U.yujun, reason: "recorded_unavailability" });
      const after = await resolve("po_duty");
      expect(after.normal_user_id).toBe(U.shasha);
      expect(after.actor_user_id).toBe(U.yujun);
      expect(after.is_cover).toBe(true);
      expect(after.assignment_movement_id).not.toBeNull();
    });
  });

  it("a signed-in caller reads the cover through the resolver but cannot call the helper", async () => {
    await scoped(async () => {
      await away([U.shasha]);
      await q("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: U.yujun, role: "authenticated" }),
      ]);
      await q("set local role authenticated");
      const po = (await q("select public.workspace_resolve_duty('po_duty', null) as r")).rows[0].r as Resolution;
      expect(po.actor_user_id).toBe(U.yujun);
      await q("savepoint helper");
      await expect(
        q("select public._workspace_recorded_leave_cover('po_duty', current_date, '{}'::jsonb)"),
      ).rejects.toThrow(/permission denied/);
      await q("rollback to savepoint helper");
    });
  });
});

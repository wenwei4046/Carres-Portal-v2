import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0723 ON A REAL POSTGRESQL — Weisiang's decision (Mr Lim, WhatsApp
 * 2026-10-22): office staff plan delivery dates, DP Orders and Trips with a
 * time slot per stop, the Houzs way. Jess was not part of this decision.
 *
 *   date     own lorry (the own-fleet company Carres Lorries, YH 2026-10-23):
 *            the planned day is the scheduled day; no company = not assigned
 *            yet, never an own lorry; a Logistics
 *            company: only the planned day, the company's agreed day wins and
 *            is never overwritten here; a changed company stays on Monitor
 *   stop     every stop needs a time slot; joining a trip goes last
 *   cancel   takes the job off its trip with a reason, history kept
 *
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- delivery-planning-0723
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `fffffff7-0000-4000-8000-${HEX}${tail.padStart(7, "0")}`;

const OP = uid("2");
const DEALER_USER = uid("3");
const DEALER = uid("4");
const NETS = uid("51");
const TT = uid("52");
const OWN_A = uid("a1");
const OWN_B = uid("a2");
const CO = uid("a3");
const DONE = uid("a4");
const NONE = uid("a5");
// 2030-01-07 is a Monday, 2030-01-06 a Sunday.
const MON = "2030-01-07";
const TUE = "2030-01-08";

let OWN = ""; // Carres Lorries, seeded by 0723 (same row 0724 seeds)

type Result = { ok: true; r: Record<string, unknown> } | { ok: false; why: string; detail: string };

describe.skipIf(!URL)("Delivery planning, DP Orders and Trips (real PostgreSQL, 0723)", () => {
  let db: pg.Client;
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
  async function attempt(sql: string, params: unknown[] = []): Promise<Result> {
    await q("savepoint s");
    try {
      const res = await q(sql, params);
      await q("release savepoint s");
      return { ok: true, r: (res.rows[0]?.r ?? {}) as Record<string, unknown> };
    } catch (e) {
      await q("rollback to savepoint s");
      const err = e as { message: string; detail?: string };
      return { ok: false, why: err.message, detail: err.detail ?? "" };
    }
  }
  const as = async (who: string) => {
    await q("reset role");
    await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: who, role: "authenticated" })]);
    await q("set local role authenticated");
  };
  const arr = async (order: string) => {
    await q("reset role");
    return (await q(
      "select partner_id, planned_date::text, confirmed_date::text, stop_seq, time_slot, vehicle from ops_delivery_arrangements where order_id = $1 and leg = 0",
      [order],
    )).rows[0];
  };
  const plan = "select public.delivery_plan_date($1, 0::smallint, $2::date, $3, $4, $5) as r";

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    await q("set local session_replication_role = replica");
    for (const [id, role] of [[OP, "operation"], [DEALER_USER, "dealer"]] as const) {
      const email = `it-0723-${id.slice(-7)}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status, is_person) values ($1, $2, $3, $4, 'active', true)", [id, email, `IT ${role}`, role]);
    }
    await q("insert into dealers (id, name) values ($1, $2)", [DEALER, `IT dealer ${HEX}`]);
    await q("insert into delivery_partners (id, name) values ($1, $2), ($3, $4)", [NETS, `IT NETS ${HEX}`, TT, `IT TT ${HEX}`]);
    for (const [id, status] of [[OWN_A, "proceed_order"], [OWN_B, "proceed_order"], [CO, "proceed_order"], [NONE, "proceed_order"], [DONE, "delivered"]] as const) {
      await q(
        "insert into orders (id, status, dealer_id, customer_name, customer_phone, source_system) values ($1, $2, $3, 'IT customer', '0100000000', 'autocount')",
        [id, status, DEALER],
      );
    }
    // CO is with NETS and NETS has already agreed Tuesday.
    await q("insert into ops_delivery_arrangements (order_id, leg, partner_id, confirmed_date) values ($1, 0, $2, $3)", [CO, NETS, TUE]);
    await q("set local session_replication_role = origin");
    OWN = (await q("select id from delivery_partners where own_fleet")).rows[0].id;
  });

  afterAll(async () => {
    if (!db) return;
    await q("rollback");
    await db.end();
  });

  it("refuses anyone but office staff, and an order already delivered", async () => {
    await as(DEALER_USER);
    expect(await attempt(plan, [OWN_A, MON, OWN, "Lorry 1", null])).toMatchObject({ ok: false, detail: "forbidden" });
    await as(OP);
    expect(await attempt(plan, [DONE, MON, null, "Lorry 1", null])).toMatchObject({ ok: false, detail: "order_not_open" });
    expect(await attempt(plan, [OWN_A, "2030-01-06", null, "Lorry 1", null])).toMatchObject({ ok: false, detail: "not_a_delivery_day" });
  });

  it("own lorry: the planned day is the scheduled day, and a second stop goes last on the trip", async () => {
    await as(OP);
    expect(await attempt(plan, [OWN_A, MON, OWN, "Lorry 1", null])).toMatchObject({ ok: true, r: { ownLorry: true, stop: 1 } });
    expect(await attempt(plan, [OWN_B, MON, OWN, "lorry 1", "13:00-15:00"])).toMatchObject({ ok: true, r: { stop: 2 } });
    expect(await arr(OWN_A)).toMatchObject({ partner_id: OWN, planned_date: MON, confirmed_date: MON, stop_seq: 1, vehicle: "Lorry 1" });
    expect(await arr(OWN_B)).toMatchObject({ stop_seq: 2, time_slot: "13:00-15:00" });
  });

  it("own lorry lands on the own-fleet company and writes the scheduled day; no company is not an own lorry", async () => {
    await q("reset role");
    expect((await q("select count(*)::int as n from delivery_partners where own_fleet and name = 'Carres Lorries'")).rows[0].n).toBe(1);
    await as(OP);
    // Carres Lorries' own day may be moved here; it is not a company's agreed day.
    expect(await attempt(plan, [OWN_A, TUE, null, null, null])).toMatchObject({ ok: true, r: { ownLorry: true } });
    expect(await arr(OWN_A)).toMatchObject({ partner_id: OWN, planned_date: TUE, confirmed_date: TUE });
    expect(await attempt(plan, [OWN_A, MON, null, null, null])).toMatchObject({ ok: true });
    // Not assigned yet (0386's null): only the planned day, nothing scheduled.
    expect(await attempt(plan, [NONE, MON, null, "Lorry 1", null])).toMatchObject({ ok: true, r: { ownLorry: false } });
    expect(await arr(NONE)).toMatchObject({ partner_id: null, planned_date: MON, confirmed_date: null });
  });

  it("a Logistics company: its agreed day is never overwritten, and a changed company stays on Monitor", async () => {
    await as(OP);
    expect(await attempt(plan, [CO, MON, null, null, null])).toMatchObject({ ok: false, detail: "company_date_agreed" });
    expect(await attempt(plan, [CO, TUE, TT, null, null])).toMatchObject({ ok: false, detail: "change_logistics_on_monitor" });
    expect(await attempt(plan, [CO, TUE, NETS, null, null])).toMatchObject({ ok: true, r: { ownLorry: false } });
    expect(await arr(CO)).toMatchObject({ partner_id: NETS, planned_date: TUE, confirmed_date: TUE });
  });

  it("a company's agreed day is not cancelled here: it is changed on Monitor (YH 2026-10-26)", async () => {
    await as(OP);
    const cancel = "select public.delivery_plan_cancel($1, 0::smallint, 'NETS asked to move it') as r";
    expect(await attempt(cancel, [CO])).toMatchObject({ ok: false, detail: "company_date_agreed" });
    expect(await arr(CO)).toMatchObject({ partner_id: NETS, planned_date: TUE, confirmed_date: TUE });
  });

  it("a company job with no agreed day keeps only the planned day, and may be cancelled", async () => {
    // Monitor clears the agreed day (its own door, outside 0723).
    await q("update ops_delivery_arrangements set confirmed_date = null where order_id = $1 and leg = 0", [CO]);
    await as(OP);
    expect(await attempt("select public.delivery_plan_cancel($1, 0::smallint, 'NETS asked to move it') as r", [CO])).toMatchObject({ ok: true });
    expect(await attempt(plan, [CO, MON, null, null, null])).toMatchObject({ ok: true });
    expect(await arr(CO)).toMatchObject({ partner_id: NETS, planned_date: MON, confirmed_date: null });
  });

  it("every stop needs a time slot", async () => {
    await as(OP);
    const stop = "select public.delivery_plan_stop($1, 0::smallint, $2::smallint, $3) as r";
    expect(await attempt(stop, [OWN_A, 2, " "])).toMatchObject({ ok: false, detail: "time_slot_required" });
    expect(await attempt(stop, [OWN_A, 2, "09:00-11:00"])).toMatchObject({ ok: true, r: { stop: 2, timeSlot: "09:00-11:00" } });
    expect(await arr(OWN_A)).toMatchObject({ stop_seq: 2, time_slot: "09:00-11:00" });
  });

  it("cancel takes the job off its trip with a reason, and the history keeps it", async () => {
    await as(OP);
    const cancel = "select public.delivery_plan_cancel($1, 0::smallint, $2) as r";
    expect(await attempt(cancel, [OWN_B, ""])).toMatchObject({ ok: false, detail: "reason_required" });
    expect(await attempt(cancel, [OWN_B, "Customer not home"])).toMatchObject({ ok: true, r: { cancelledDay: MON } });
    expect(await arr(OWN_B)).toMatchObject({ planned_date: null, confirmed_date: null, stop_seq: null, time_slot: null });
    expect(await attempt(cancel, [OWN_B, "again"])).toMatchObject({ ok: false, detail: "no_job" });
    await q("reset role");
    const notes = (await q("select note from ops_delivery_arrangement_events where order_id = $1 and event = 'job_cancelled'", [OWN_B])).rows;
    expect(notes).toEqual([{ note: `${MON} · 13:00-15:00 · Customer not home` }]);
  });

  it("regions and residence rules: office edits, a dealer cannot", async () => {
    await as(OP);
    expect(await attempt("update delivery_regions set per_day = 12 where state = 'Johor' returning per_day as r")).toMatchObject({ ok: true });
    await as(DEALER_USER);
    const r = await attempt("update delivery_residence_rules set note = 'x' where building_type = 'Condo' returning 1 as r");
    expect(r).toMatchObject({ ok: true, r: {} });
    await q("reset role");
    expect((await q("select note from delivery_residence_rules where building_type = 'Condo'")).rows[0].note).not.toBe("x");
  });
});

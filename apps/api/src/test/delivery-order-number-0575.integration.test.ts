import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0575 ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN — the Delivery
 * Order number belongs to ONE order, forever (Delivery MASTER §3.1, owner
 * ruling 2026-09-23).
 *
 * THE P0 THIS GUARDS (measured on origin/main 855c305c4): two different orders
 * issued the same day could produce the same `DO-DDMMYY-NNNN` (the tail was a
 * hash of the order id), and the materialiser (0356) silently SKIPPED a number
 * it had already seen — the second order wore the first order's number and had
 * no document row of its own.
 *
 * The first case FAILS on the unfixed chain (the second order's write is
 * accepted silently) and passes with 0575 — proven by running this file
 * against a replay stopped before 0575, then again after it.
 *
 * Everything runs inside ONE transaction that is rolled back; the URL must be
 * local or every case is SKIPPED — reported as skipped, never as passed.
 *
 *   LC_ALL=C node scripts/dry-run-migrations.mjs --baseline scripts/migration-replay-baseline.json --keep
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> \
 *     pnpm --filter @carres/api test -- delivery-order-number-0575
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = (Date.now() % 100000).toString(16).padStart(5, "0");
const uid = (tail: string) => `dddddddd-0575-4000-8000-${RUN}${tail.padStart(7, "0")}`;
const OPERATION = uid("1");

describe.skipIf(!URL || !LOCAL)("0575 · a Delivery Order number belongs to one order, forever", () => {
  let db: pg.Client;
  let orderA = "";
  let orderB = "";
  let rental = "";
  let orderC = "";
  let orderD = "";
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
  const one = async (sql: string, params: unknown[] = []) => (await q(sql, params)).rows[0];

  async function attempt(sql: string, params: unknown[] = []): Promise<{ ok: true; value: unknown } | { ok: false; detail: string }> {
    await q("savepoint s");
    try {
      const r = await q(sql, params);
      await q("release savepoint s");
      return { ok: true, value: r.rows[0] ? Object.values(r.rows[0])[0] : null };
    } catch (e) {
      await q("rollback to savepoint s");
      return { ok: false, detail: (e as { detail?: string }).detail ?? (e as Error).message };
    }
  }

  /** YYMM of today in Kuala Lumpur — the number's period. */
  const periodMYT = () => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "2-digit", month: "2-digit" }).formatToParts(new Date());
    return `${parts.find((p) => p.type === "year")!.value}${parts.find((p) => p.type === "month")!.value}`;
  };

  beforeAll(async () => {
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    await q("insert into auth.users (id, email) values ($1, 'op0575@test.local')", [OPERATION]);
    await q("insert into app_users (id, email, name, role, status) values ($1,'op0575@test.local','Op','operation','active')", [OPERATION]);
    const dealer = await one("select id from dealers limit 1");
    const sp = await one("insert into salespersons(dealer_id, name) values ($1,'Test Seller 0575') returning id", [dealer.id]);
    /* No priced lines and no keyed balance: nothing is owed, so the money gate
       (unchanged by 0575) lets the document row exist. */
    const mk = async (source: string | null) =>
      (await one(
        `insert into orders(dealer_id, salesperson_id, customer_name, customer_phone, status, source_system)
         values ($1,$2,'TEST 0575','0100000000','proceed_order',$3) returning id`,
        [dealer.id, sp.id, source],
      )).id as string;
    orderA = await mk(null);
    orderB = await mk(null);
    rental = await mk("rental");
    orderC = await mk(null);
    orderD = await mk(null);
    await q("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: OPERATION, role: "authenticated" })]);
  });

  afterAll(async () => {
    if (db) {
      await q("rollback").catch(() => undefined);
      await db.end();
    }
  });

  it("a second order can never wear a number another order owns — it is REFUSED, not skipped", async () => {
    // The exact P0: the old hash gave both orders `DO-230926-4242` on one day.
    const shared = "DO-230926-4242";
    await q("update orders set do_number = $1 where id = $2", [shared, orderA]);
    const second = await attempt("update orders set do_number = $1 where id = $2 returning do_number", [shared, orderB]);
    expect(second).toEqual({ ok: false, detail: "delivery_order_number_taken" });
    const b = await one("select do_number from orders where id = $1", [orderB]);
    expect(b.do_number).toBeNull();
    const rows = await one("select array_agg(order_id::text) owners from ops_delivery_orders where do_number = $1", [shared]);
    expect(rows.owners).toEqual([orderA]);
  });

  it("the same order re-stating its own number stays the quiet no-op the leg and trip doors rely on", async () => {
    const again = await attempt("update orders set do_number = do_number where id = $1 returning do_number", [orderA]);
    expect(again.ok).toBe(true);
    const n = await one("select count(*)::int n from ops_delivery_orders where order_id = $1", [orderA]);
    expect(n.n).toBe(1);
  });

  it("Outright draws DO+YYMM-4 digits and Subscription draws SDO+YYMM-5 digits", async () => {
    const period = periodMYT();
    const outright = await one("select public.delivery_document_number_draw($1) n", [orderB]);
    expect(outright.n).toMatch(new RegExp(`^DO${period}-\\d{4}$`));
    const sub = await one("select public.delivery_document_number_draw($1) n", [rental]);
    expect(sub.n).toMatch(new RegExp(`^SDO${period}-\\d{5}$`));
  });

  it("two orders issued the same day each own a different number and their own document row", async () => {
    const a = (await one("select public.delivery_document_number_draw($1) n", [orderC])).n as string;
    const b = (await one("select public.delivery_document_number_draw($1) n", [orderD])).n as string;
    expect(a).not.toBe(b);
    await q("update orders set do_number = $1 where id = $2", [a, orderC]);
    await q("update orders set do_number = $1 where id = $2", [b, orderD]);
    const owners = await q("select do_number, order_id::text from ops_delivery_orders where do_number = any($1) order by do_number", [[a, b]]);
    expect(Object.fromEntries(owners.rows.map((r) => [r.do_number, r.order_id]))).toEqual({ [a]: orderC, [b]: orderD });
  });

  it("a drawn number is never drawn again — 500 draws, 500 different numbers, all kept", async () => {
    const drawn = await q("select public.delivery_document_number_draw($1) n from generate_series(1, 500)", [orderA]);
    const numbers = drawn.rows.map((r) => r.n as string);
    expect(new Set(numbers).size).toBe(500);
    const kept = await one("select count(*)::int n from delivery_document_numbers where do_number = any($1)", [numbers]);
    expect(kept.n).toBe(500);
  });

  it("a full month REFUSES — the width is fixed and never widens", async () => {
    const period = periodMYT();
    await q("savepoint month_full");
    await q(
      `insert into delivery_document_numbers (do_number, series, period, order_id)
       select 'DO' || $1 || '-' || lpad(g::text, 4, '0'), 'DO', $1, $2 from generate_series(0, 9999) g
       on conflict do nothing`,
      [period, orderA],
    );
    const refused = await attempt("select public.delivery_document_number_draw($1)", [orderB]);
    await q("rollback to savepoint month_full");
    expect(refused).toEqual({ ok: false, detail: "delivery_order_numbers_used_up" });
    // The Subscription pool is its own: a full DO month does not touch SDO.
    const sub = await attempt("select public.delivery_document_number_draw($1)", [rental]);
    expect(sub.ok).toBe(true);
  });

  it("the legacy dispatch backstop draws from the same pool instead of inventing DO-<SO>", async () => {
    const dealer = await one("select id from dealers limit 1");
    const sp = await one("select id from salespersons where dealer_id = $1 and name = 'Test Seller 0575'", [dealer.id]);
    const order = await one(
      `insert into orders(dealer_id, salesperson_id, customer_name, customer_phone, status)
       values ($1,$2,'TEST 0575 dispatch','0100000000','proceed_order') returning id`,
      [dealer.id, sp.id],
    );
    const r = await attempt("update orders set operation_stage = 'dispatched' where id = $1 returning do_number", [order.id]);
    expect(r.ok).toBe(true);
    expect(String((r as { value: unknown }).value)).toMatch(/^DO\d{4}-\d{4}$/);
    // The number is the pool's, and the pool names this order as its owner.
    // (A BEFORE-trigger write is not in the UPDATE's column list, so the 0356
    // materialiser does not fire for this legacy backstop — unchanged by 0575.)
    const kept = await one("select order_id::text o from delivery_document_numbers where do_number = $1", [(r as { value: unknown }).value]);
    expect(kept.o).toBe(order.id);
  });

  it("a caller with no role cannot draw", async () => {
    await q("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: uid("9"), role: "authenticated" })]);
    const refused = await attempt("select public.delivery_document_number_draw($1)", [orderA]);
    await q("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: OPERATION, role: "authenticated" })]);
    expect(refused).toEqual({ ok: false, detail: "forbidden" });
  });

  it("the split-trip door refuses a number another order owns instead of handing back that order's paper", async () => {
    await q(
      `insert into ops_order_control (order_id, booking_stage, confirmed_date, confirmed_time_slot, booking_groups, confirmed_partner_id)
       values ($1, 'confirmed', current_date + 3, 'Anytime', array['bed'], (select id from delivery_partners limit 1))
       on conflict (order_id) do update set booking_stage = 'confirmed', confirmed_date = excluded.confirmed_date,
         confirmed_time_slot = excluded.confirmed_time_slot, booking_groups = excluded.booking_groups,
         confirmed_partner_id = excluded.confirmed_partner_id`,
      [rental],
    );
    const taken = (await one("select do_number from ops_delivery_orders where order_id = $1 limit 1", [orderA])).do_number;
    const refused = await attempt("select public.delivery_trip_document_mint($1, $2)", [rental, taken]);
    expect(refused.ok).toBe(false);
    const own = await attempt("select public.delivery_trip_document_mint($1, public.delivery_document_number_draw($1)) ->> 'do_number'", [rental]);
    expect(own.ok).toBe(true);
    expect(String((own as { value: unknown }).value)).toMatch(/^SDO\d{4}-\d{5}$/);
    const mine = await one("select order_id::text o from ops_delivery_orders where do_number = $1", [(own as { value: unknown }).value]);
    expect(mine.o).toBe(rental);
  });
});

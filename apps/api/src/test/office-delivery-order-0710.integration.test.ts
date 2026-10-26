import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";

/**
 * 0710 ON A REAL POSTGRESQL — New Delivery Order, opened by the office
 * (Weisiang's decision, Mr Lim, WhatsApp 2026-10-22; overturns Jess's
 * system-only DO rule). Jess was not part of the decision.
 *
 * Pins: the office door mints through the one number allocator (0575); goods
 * already on a live DO are refused (never ship twice); the money trigger
 * (0362) still binds; a caller with no role is refused; and the system's own
 * issue (orders.do_number + 0356 materialiser) is unchanged.
 *
 * Runs inside ONE transaction that is rolled back, and applies 0710 inside it
 * so a database replayed before 0710 still tests this branch. The URL must be
 * local or every case is SKIPPED.
 *
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> \
 *     pnpm --filter @carres/api test -- office-delivery-order-0710
 */
const DB_URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(DB_URL);
const RUN = (Date.now() % 100000).toString(16).padStart(5, "0");
const uid = (tail: string) => `dddddddd-0710-4000-8000-${RUN}${tail.padStart(7, "0")}`;
const OPERATION = uid("1");
const MIGRATION = fileURLToPath(
  new URL("../../../../supabase/migrations/0710_office_staff_open_a_delivery_order_from_so_lines.sql", import.meta.url),
);

describe.skipIf(!DB_URL || !LOCAL)("0710 · office staff open a Delivery Order from SO lines", () => {
  let db: pg.Client;
  let dealerId = "";
  let spId = "";
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

  const mkOrder = async (paid = 0) =>
    (await one(
      `insert into orders(dealer_id, salesperson_id, customer_name, customer_phone, status, paid)
       values ($1,$2,'TEST 0710','0100000000','proceed_order',$3) returning id`,
      [dealerId, spId, paid],
    )).id as string;
  const office = (orderId: string, groups: string[] | null) =>
    attempt(
      "select public.delivery_office_document_mint($1, $2::text[], public.delivery_document_number_draw($1)) ->> 'do_number'",
      [orderId, groups],
    );
  const docs = async (orderId: string) =>
    (await q("select trip, trip_groups, voided_at from ops_delivery_orders where order_id = $1 order by trip", [orderId])).rows;

  beforeAll(async () => {
    db = new pg.Client({ connectionString: DB_URL });
    await db.connect();
    await q("begin");
    await q(readFileSync(MIGRATION, "utf8"));
    await q("insert into auth.users (id, email) values ($1, 'op0710@test.local')", [OPERATION]);
    await q("insert into app_users (id, email, name, role, status) values ($1,'op0710@test.local','Op','operation','active')", [OPERATION]);
    dealerId = (await one("select id from dealers limit 1")).id;
    spId = (await one("insert into salespersons(dealer_id, name) values ($1,'Test Seller 0710') returning id", [dealerId])).id;
    await q("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: OPERATION, role: "authenticated" })]);
  });

  afterAll(async () => {
    if (db) {
      await q("rollback").catch(() => undefined);
      await db.end();
    }
  });

  it("opens one trip per picked group, numbered by the one allocator, and the order shows the newest", async () => {
    const order = await mkOrder();
    const bed = await office(order, ["bed"]);
    expect(bed.ok).toBe(true);
    expect(String((bed as { value: unknown }).value)).toMatch(/^DO\d{4}-\d{4}$/);
    const sofa = await office(order, ["sofa"]);
    expect(sofa.ok).toBe(true);
    expect(await docs(order)).toEqual([
      { trip: 1, trip_groups: ["bed"], voided_at: null },
      { trip: 2, trip_groups: ["sofa"], voided_at: null },
    ]);
    const o = await one("select do_number from orders where id = $1", [order]);
    expect(o.do_number).toBe((sofa as { value: unknown }).value);
  });

  it("never ships twice: a group on a live DO, or the whole order beside one, is refused", async () => {
    const order = await mkOrder();
    expect((await office(order, ["bed"])).ok).toBe(true);
    expect(await office(order, ["bed"])).toEqual({ ok: false, detail: "already_on_a_delivery_order" });
    expect(await office(order, ["bed", "sofa"])).toEqual({ ok: false, detail: "already_on_a_delivery_order" });
    expect(await office(order, null)).toEqual({ ok: false, detail: "already_on_a_delivery_order" });
    expect((await docs(order)).length).toBe(1);
  });

  it("a whole-order DO the SYSTEM issued still issues unchanged, and the office cannot add to it", async () => {
    const order = await mkOrder();
    const n = (await one("select public.delivery_document_number_draw($1) n", [order])).n as string;
    await q("update orders set do_number = $1 where id = $2", [n, order]);
    expect(await docs(order)).toEqual([{ trip: 0, trip_groups: null, voided_at: null }]);
    expect(await office(order, ["sofa"])).toEqual({ ok: false, detail: "already_on_a_delivery_order" });
  });

  it("the money gate still binds: money owed with no approval opens no DO", async () => {
    const order = await mkOrder(0);
    await q(
      "insert into order_lines(order_id, sku, qty, unit_price) values ($1, 'MS12 Firmcare 10inch Queen', 1, 2500)",
      [order],
    );
    expect(await office(order, null)).toEqual({ ok: false, detail: "delivery_money_gate" });
    expect(await docs(order)).toEqual([]);
  });

  it("refuses an unknown or empty pick and a caller with no role", async () => {
    const order = await mkOrder();
    expect(await office(order, [])).toEqual({ ok: false, detail: "invalid_groups" });
    expect(await office(order, ["table"])).toEqual({ ok: false, detail: "invalid_groups" });
    const n = (await one("select public.delivery_document_number_draw($1) n", [order])).n as string;
    await q("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: uid("9"), role: "authenticated" })]);
    const refused = await attempt("select public.delivery_office_document_mint($1, null, $2)", [order, n]);
    await q("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: OPERATION, role: "authenticated" })]);
    expect(refused).toEqual({ ok: false, detail: "forbidden" });
  });

  it("a voided DO gives its goods back to the office", async () => {
    const order = await mkOrder();
    expect((await office(order, ["bed"])).ok).toBe(true);
    await q("update ops_delivery_orders set voided_at = now(), void_reason = 'rescheduled' where order_id = $1", [order]);
    expect((await office(order, ["bed"])).ok).toBe(true);
  });
});

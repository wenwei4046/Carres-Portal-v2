import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import { collectionReport, type CollectionAnswer } from "@carres/shared/collection";

/**
 * 0644 ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN: the Collection
 * report's orders (Chew 2026-10-03, docs/finance/MASTER.md §3.6). Orders,
 * payments, allocations and invoices are written plainly — the report only
 * reads them, so the Sales and Payment doors' own triggers are not the subject
 * — and the database's answer is read back through the shared arithmetic.
 *
 * One transaction, rolled back at the end. Names are invented.
 *
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- finance-collection
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `cccccccc-0000-4000-8000-${HEX}${tail.padStart(7, "0")}`;
const U = { finance: uid("1"), operation: uid("2") };
const SO = (n: number) => 900000 + (RUN % 1000) * 10 + n;

describe.skipIf(!URL)("Collection report (real PostgreSQL, 0644)", () => {
  let db: pg.Client;
  const orderIds: Record<number, string> = {};
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
  const actAs = (id: string | null) =>
    q("select set_config('request.jwt.claims', $1, false)", [id ? JSON.stringify({ sub: id, role: "authenticated" }) : ""]);
  const report = async (from: string, to: string) => {
    await actAs(U.finance);
    return (await q("select public.fin_collection($1::date, $2::date) as r", [from, to])).rows[0].r as CollectionAnswer;
  };
  const mine = (a: CollectionAnswer) => a.orders.filter((o) => Object.values(orderIds).includes(o.id));

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    for (const [id, role] of [[U.finance, "finance"], [U.operation, "operation"]] as const) {
      const email = `it-coll-${role}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status, is_person) values ($1, $2, $3, $4, 'active', true)", [id, email, `IT ${role}`, role]);
    }
    await q("set local session_replication_role = replica");
    const dealer = (await q("insert into dealers (name, channel) values ($1, 'showroom') returning id", [`IT Showroom ${RUN}`])).rows[0].id;
    const aina = (await q("insert into salespersons (dealer_id, name) values ($1, $2) returning id", [dealer, `IT Aina ${RUN}`])).rows[0].id;
    const boon = (await q("insert into salespersons (dealer_id, name) values ($1, $2) returning id", [dealer, `IT Boon ${RUN}`])).rows[0].id;

    const order = async (n: number, sp: string, placedMyt: string, status: string, value: number, extra: Record<string, unknown> = {}) => {
      const r = await q(`insert into orders (so, dealer_id, salesperson_id, customer_name, customer_phone, status, placed_at, source_system)
                         values ($1, $2, $3, $4, '0123456789', $5::order_status, ($6::timestamp at time zone 'Asia/Kuala_Lumpur'), $7) returning id`,
        [SO(n), dealer, sp, `IT CUSTOMER ${n}`, status, placedMyt, extra.source ?? null]);
      orderIds[n] = r.rows[0].id;
      await q("insert into order_lines (order_id, sku, qty, unit_price) values ($1, 'IT-SKU', 1, $2)", [orderIds[n], value]);
      return orderIds[n]!;
    };
    const pay = async (orderId: string, kind: string, amount: number, allocateTo: string | null, voided = false) => {
      const p = (await q(`insert into order_payments (order_id, amount, paid_on, kind, method, voided_at)
                          values ($1, $2, date '2026-09-10', $3, 'cash', $4) returning id`,
        [orderId, amount, kind, voided ? new Date().toISOString() : null])).rows[0].id;
      if (allocateTo) {
        await q("insert into payment_allocations (payment_id, order_id, amount, voided_at) values ($1, $2, $3, $4)",
          [p, allocateTo, amount, voided ? new Date().toISOString() : null]);
      }
    };

    const o1 = await order(1, aina, "2026-09-05 10:00", "delivered", 2000);
    await q("insert into order_addons (order_id, addon_key, qty, unit_price) values ($1, 'DELIVERY', 1, 100)", [o1]);
    await pay(o1, "deposit", 1000, o1);
    await pay(o1, "payment", 600, o1);
    await pay(o1, "payment", 300, o1, true);   // voided: not money
    await pay(o1, "storage", 50, null);        // storage is never allocated to an order
    await q("insert into invoices (order_id, amount, tax_amount, kind, status, issued_at, invoice_no) values ($1, 2100, 0, 'sales', 'issued', date '2026-09-25', $2)",
      [o1, `IT-INV-${RUN}`]);
    const o2 = await order(2, aina, "2026-09-20 15:00", "proceed_order", 3000);
    await pay(o2, "deposit", 500, o2);
    await pay(o2, "payment", 100, o1);         // corrected allocation: the money is order 1's
    const o3 = await order(3, boon, "2026-09-30 23:30", "place", 800);
    await pay(o3, "deposit", 800, o3);
    await order(4, boon, "2026-10-01 00:30", "place", 900);                    // the next day in Kuala Lumpur
    await order(5, aina, "2026-09-12 09:00", "cancelled", 1500);              // cancelled
    await order(6, aina, "2026-09-12 09:00", "proceed_order", 1500, { source: "rental" }); // a rental order
    await q("set local session_replication_role = origin");
  }, 30000);

  afterAll(async () => {
    if (!db) return;
    await q("rollback").catch(() => undefined);
    await db.end();
  });

  it("is Finance's only", async () => {
    await actAs(U.operation);
    await q("savepoint s");
    await expect(q("select public.fin_collection(current_date, current_date)")).rejects.toMatchObject({ code: "42501" });
    await q("rollback to savepoint s");
  });

  it("reads each order placed in the period: value, deposit, balance paid from live allocations, and its invoice", async () => {
    const a = await report("2026-09-01", "2026-09-30");
    const by = Object.fromEntries(mine(a).map((o) => [o.so, [Number(o.order_value), Number(o.deposit), Number(o.balance_paid),
      o.billed === null ? null : Number(o.billed), o.delivered]]));
    expect(by).toEqual({
      [SO(1)]: [2100, 1000, 700, 2100, true],   // 600 paid + 100 moved here by a corrected allocation; 300 voided left out
      [SO(2)]: [3000, 500, 0, null, false],
      [SO(3)]: [800, 800, 0, null, false],      // 23:30 on the last day in Kuala Lumpur is still in the period
    });
  });

  it("adds up per salesperson through the shared arithmetic", async () => {
    const r = collectionReport({ ...(await report("2026-09-01", "2026-09-30")), orders: mine(await report("2026-09-01", "2026-09-30")) }, 50);
    expect(r.rows.map((x) => [x.name, x.orders, x.value, x.deposit, x.below])).toEqual([
      [`IT Aina ${RUN}`, 2, 510000, 150000, 2],
      [`IT Boon ${RUN}`, 1, 80000, 80000, 0],
    ]);
    expect(r.total.delivered).toMatchObject({ orders: 1, billed: 210000, balanceDue: 110000, balancePaid: 70000, outstanding: 40000 });
  });

  it("refuses a period that runs backwards", async () => {
    await actAs(U.finance);
    await q("savepoint s");
    await expect(q("select public.fin_collection(date '2026-09-30', date '2026-09-01')")).rejects.toMatchObject({ code: "22023" });
    await q("rollback to savepoint s");
  });
});

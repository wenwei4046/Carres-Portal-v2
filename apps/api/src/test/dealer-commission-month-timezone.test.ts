import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { migration } from "./stock-register-database";

/**
 * THE COMMISSION MONTH IS A MALAYSIAN MONTH (0553).
 *
 * 0553 bounds the order set by the day an order was placed. `orders.placed_at`
 * is a timestamptz and the bound is a date, so the comparison is only as
 * stable as the session's TimeZone — and the function sets search_path, not
 * TimeZone. Production's database clock runs on UTC while the business runs on
 * Asia/Kuala_Lumpur, so an order placed at 1am on 1 October in Kuala Lumpur is
 * stored as 5pm on 30 September UTC and, without `at time zone`, lands in the
 * September report carrying a whole order's commission into the wrong month.
 *
 * Which month an order falls in is a database behaviour, so this runs real
 * PostgreSQL (PGlite) over the COMMITTED 0553 file. Only the upstream tables
 * that file reads are fixtures. RLS is not exercised (PGlite runs as its
 * superuser) and 0553 changes no policy.
 */

const DEALER = "d0000000-0000-0000-0000-0000000000d1";
const SEPTEMBER_ORDER = "a0000000-0000-0000-0000-00000000000s";
const OCTOBER_ORDER = "a0000000-0000-0000-0000-00000000000o";

async function commissionDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role authenticated; create role anon;
    create function public.gl_may_read() returns boolean language sql stable as $$ select true $$;
    create table public.dealer_commission_settings (default_rate numeric);
    create table public.dealer_commission_rates (model_id text, rate numeric);
    create table public.dealer_rebate_quotas (dealer_id text, quota numeric, rebate_rate numeric, starts_on date);
    create table public.product_models (id text primary key, name text, category text, discontinued_at timestamptz);
    create table public.product_skus (sku text, model_id text);
    create table public.dealers (id text primary key, name text, channel text);
    create table public.outlets (id text primary key, name text, dealer_id text);
    create table public.orders (id text primary key, so integer, dealer_id text, outlet_id text,
                                placed_at timestamptz, status text);
    create table public.order_lines (order_id text, sku text, qty integer, unit_price numeric);
    create table public.order_addons (order_id text, qty integer, unit_price numeric);
    create table public.order_payments (order_id text, kind text, voided_at timestamptz, paid_on date, amount numeric);

    insert into public.dealer_commission_settings values (25);
    insert into public.product_models values ('model-1', 'Fixture sofa', 'sofa', null);
    insert into public.product_skus values ('fixture-sku', 'model-1');
    insert into public.dealers values ('${DEALER}', 'Fixture dealer', 'dealer');
    -- 15 September in Kuala Lumpur, and 15 September in UTC too.
    insert into public.orders values ('${SEPTEMBER_ORDER}', 1, '${DEALER}', null,
      timestamptz '2026-09-15 10:00+08', 'place');
    -- 1am on 1 October in Kuala Lumpur = 5pm on 30 September UTC. October.
    insert into public.orders values ('${OCTOBER_ORDER}', 2, '${DEALER}', null,
      timestamptz '2026-10-01 01:00+08', 'place');
    insert into public.order_lines values ('${SEPTEMBER_ORDER}', 'fixture-sku', 1, 1000),
                                          ('${OCTOBER_ORDER}', 'fixture-sku', 1, 1000);
  `);
  await db.exec(migration("0553_still_to_collect_counts_an_order_the_customer_has_not_paid_yet"));
  return db;
}

async function septemberOrderIds(db: PGlite, timeZone: string) {
  await db.exec(`set timezone = '${timeZone}'`);
  const { rows } = await db.query<{ src: { orders: { orderId: string }[] } }>(
    "select public.dealer_commission_source(date '2026-09-01') as src",
  );
  return rows[0].src.orders.map((o) => o.orderId).sort();
}

describe("the commission month is a Malaysian month (0553)", () => {
  it("reads the same September orders whatever TimeZone the session carries", async () => {
    const db = await commissionDatabase();
    const kualaLumpur = await septemberOrderIds(db, "Asia/Kuala_Lumpur");
    const utc = await septemberOrderIds(db, "UTC");

    // The order placed at 1am on 1 October in Malaysia belongs to October, and
    // a UTC session must not drag it back into September.
    expect(kualaLumpur).toEqual([SEPTEMBER_ORDER]);
    expect(utc).toEqual(kualaLumpur);
    await db.close();
  });
});

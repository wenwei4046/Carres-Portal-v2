import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { migration } from "./stock-register-database";

/**
 * COMMISSION IS EARNED ON MONEY KEPT, NOT MONEY REFUNDED (0597).
 *
 * dealer_commission_source now sends each order's PAID refunds with the day
 * they were paid in Malaysia; packages/shared/src/dealer-commission.ts takes
 * them off collected money. This runs real PostgreSQL (PGlite) over the
 * committed 0597 file. Only the upstream tables it reads are fixtures.
 */

const DEALER = "d0000000-0000-0000-0000-0000000000d1";
const ORDER = "a0000000-0000-0000-0000-000000000001";

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
    create table public.order_refunds (order_id text, amount numeric, status text, paid_at timestamptz);

    insert into public.dealer_commission_settings values (25);
    insert into public.dealers values ('${DEALER}', 'Fixture dealer', 'dealer');
    insert into public.orders values ('${ORDER}', 1, '${DEALER}', null, timestamptz '2026-09-01 10:00+08', 'place');
    insert into public.order_lines values ('${ORDER}', 'fixture-sku', 1, 1000);
    insert into public.order_payments values ('${ORDER}', 'deposit', null, date '2026-09-03', 1000);
    -- Paid at 1am on 1 October in Kuala Lumpur = 5pm on 30 September UTC. October.
    insert into public.order_refunds values ('${ORDER}', 400, 'paid', timestamptz '2026-10-01 01:00+08');
    -- Approved but not paid out: no money has left HQ.
    insert into public.order_refunds values ('${ORDER}', 50, 'approved', null);
  `);
  await db.exec(migration("0597_commission_is_earned_on_money_kept_after_paid_refunds"));
  return db;
}

async function refunds(db: PGlite, month: string, timeZone: string) {
  await db.exec(`set timezone = '${timeZone}'`);
  const { rows } = await db.query<{ src: { orders: { refunds: unknown }[] } }>(
    `select public.dealer_commission_source(date '${month}') as src`,
  );
  return rows[0].src.orders[0].refunds;
}

describe("commission source sends paid refunds by their Malaysian day (0597)", () => {
  it("a refund paid on 1 October in Malaysia is October's, in any session TimeZone", async () => {
    const db = await commissionDatabase();
    expect(await refunds(db, "2026-09-01", "UTC")).toBeNull();
    expect(await refunds(db, "2026-09-01", "Asia/Kuala_Lumpur")).toBeNull();
    expect(await refunds(db, "2026-10-01", "UTC")).toEqual([{ paidOn: "2026-10-01", amount: 400 }]);
    await db.close();
  });
});

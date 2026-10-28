import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { migration } from "./stock-register-database";

/**
 * AN ACCESSORY IS NOT OFFERED A COMMISSION RATE (0626).
 *
 * An accessory line earns no dealer commission, so the "Add a product rate"
 * list must not offer one. dealer_commission_source now leaves accessory out
 * of 'models', next to service and guarantee. This runs real PostgreSQL
 * (PGlite) over the committed 0626 file. Only the upstream tables it reads
 * are fixtures.
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
    insert into public.product_models values ('m-sofa', 'Live sofa', 'sofa', null);
    insert into public.product_models values ('m-accessory', 'Cushion', 'accessory', null);
    insert into public.product_models values ('m-service', 'Assembly', 'service', null);
    insert into public.product_models values ('m-guarantee', 'Extended guarantee', 'guarantee', null);
    -- A sofa Carres no longer sells: never offered, before or after 0626.
    insert into public.product_models values ('m-old-sofa', 'Old sofa', 'sofa', timestamptz '2026-01-01 00:00+08');
    insert into public.product_skus values ('cushion-sku', 'm-accessory');
    insert into public.dealers values ('${DEALER}', 'Fixture dealer', 'dealer');
    insert into public.orders values ('${ORDER}', 1, '${DEALER}', null, timestamptz '2026-09-01 10:00+08', 'place');
    -- The customer bought a cushion. The line is still part of the bill.
    insert into public.order_lines values ('${ORDER}', 'cushion-sku', 2, 50);
  `);
  await db.exec(migration("0626_an_accessory_is_not_offered_a_commission_rate"));
  return db;
}

type Source = {
  models: { id: string; name: string }[];
  orders: { lines: { modelId: string; category: string; value: number }[] }[];
};

async function source(db: PGlite) {
  const { rows } = await db.query<{ src: Source }>(
    `select public.dealer_commission_source(date '2026-09-01') as src`,
  );
  return rows[0].src;
}

describe("commission source offers a rate only on products that earn one (0626)", () => {
  it("offers the live sofa and leaves out accessory, service, guarantee and a discontinued sofa", async () => {
    const db = await commissionDatabase();
    expect((await source(db)).models).toEqual([{ id: "m-sofa", name: "Live sofa" }]);
    await db.close();
  });

  it("still sends an accessory order line, so the bill is whole", async () => {
    const db = await commissionDatabase();
    expect((await source(db)).orders[0].lines).toEqual([
      { modelId: "m-accessory", category: "accessory", value: 100 },
    ]);
    await db.close();
  });
});

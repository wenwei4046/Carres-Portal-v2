import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

export function statementOf(sql: string, start: string, end: string) {
  return statement(sql, start, end);
}

export function migration(name: string) {
  return readFileSync(new URL(`../../../../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
}

export const verifyInventorySql = readFileSync(
  new URL("../../../../scripts/verify-inventory-read-surface.sql", import.meta.url), "utf8",
);

// Use the committed SQL, not a mock response that invents view columns. Only
// upstream base tables/rows are fixtures; the functions and views are real SQL.
function statement(sql: string, start: string, end: string) {
  const from = sql.indexOf(start);
  const to = sql.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`Missing migration statement: ${start}`);
  return sql.slice(from, to + end.length);
}

export async function stockRegisterDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role authenticated; create role anon;
    create table public.product_models (id text primary key, category text, name text);
    create table public.product_skus (sku text, model_id text, variant text);
    create table public.purchase_orders (id text primary key, placed_at timestamptz, eta_date date, purpose text);
    create table public.orders (id text primary key, placed_at timestamptz);
    create table public.warehouses (id text primary key, name text);
    create table public.stock_operating_parties (id text primary key, name text);
    create table public.ops_stock_items (
      id text primary key, unit_code text, sku text, warehouse_id text,
      holder_party_id text, ownership text, supplier text, po_no text,
      status text, condition text, needs_repair boolean, hold_reason text,
      reserved_ref text, sold_order_id text, qty integer, date_in date,
      sold_at timestamptz, last_verified_at timestamptz,
      identity_scope text not null default 'unit'
    );
    create table public.stock_unit_events (unit_id text, event text, event_at timestamptz, seq bigint, id text, from_value text, to_value text, note text);
    insert into warehouses values ('site-1', 'Fixture site');
    insert into stock_operating_parties values ('party-1', 'Fixture holder');
    insert into ops_stock_items (id,unit_code,sku,warehouse_id,holder_party_id,ownership,status,condition,needs_repair,qty)
      values ('unit-1','id-contract1','fixture-sku','site-1','party-1','carres_owned','free','damaged',false,1),
             ('unit-2','id-contract2','fixture-sku',null,null,'carres_owned','sold','new',false,1);
    insert into stock_unit_events (unit_id,event,event_at,seq) values ('unit-1','older','2026-09-01',1), ('unit-1','latest','2026-09-01',2);
    insert into product_models values ('model-1','sofa','Fixture sofa');
    insert into product_skus values ('fixture-sku','model-1','Three seater');
    insert into purchase_orders values ('PO-fixture','2026-08-01T00:00:00Z','2026-09-09','service_case');
    insert into orders values ('order-1','2026-08-02T00:00:00Z');
    update ops_stock_items set po_no='PO-fixture', sold_order_id='order-1' where id='unit-1';
  `);
  const authority = migration("0366_the_unit_register_is_the_one_inventory_authority");
  await db.exec(statement(authority, "create or replace function public.stock_sku_category", "$$;"));
  await db.exec(statement(authority, "create or replace function public.unit_lifecycle_outcome", "$$;"));
  const condition = migration("0371_a_damaged_unit_is_not_available");
  await db.exec(statement(condition, "create or replace function public.unit_availability", "$$;"));
  await db.exec(statement(condition, "create or replace view public.stock_unit_availability_v", "from public.ops_stock_items i;"));
  await db.exec(migration("0373_the_register_can_say_when_a_unit_last_moved"));
  return db;
}

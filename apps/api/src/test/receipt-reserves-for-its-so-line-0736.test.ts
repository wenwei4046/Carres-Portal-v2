import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { migration } from "./stock-register-database";

/**
 * 0736 · A RECEIPT RESERVES GOODS BOUGHT FOR A SALES ORDER LINE — run as SQL.
 *
 * Stock MASTER §4 (Jess, 2026-10-05): goods bought for an explicit SO line
 * (`po_line_sources`) are reserved to that line when Receiving posts them.
 * Measured on production 2026-10-30: SO-1375's REGAL-Q (PO261030-7839,
 * GRN-20261030-9277) arrived as Unit U1-000-335 `free`, so every delivery
 * screen read it as not allocated and `Reserve stock` refused the line as
 * already covered by its PO.
 */

const ORDER = "11111111-1111-1111-1111-111111111111";
const OTHER = "11111111-1111-1111-1111-111111111112";
const GONE = "11111111-1111-1111-1111-111111111113";
const LINE = "22222222-2222-2222-2222-222222222221";
const LINE_OTHER = "22222222-2222-2222-2222-222222222222";
const LINE_GONE = "22222222-2222-2222-2222-222222222223";
const PO_LINE = "44444444-4444-4444-4444-444444444441";
const PO_LINE_SHARED = "44444444-4444-4444-4444-444444444442";
const PO_LINE_STOCK = "44444444-4444-4444-4444-444444444443";

let db: PGlite;

async function unit(code: string, fields: Record<string, unknown>) {
  const cols = ["unit_code", ...Object.keys(fields)];
  const vals = [code, ...Object.values(fields)];
  const r = await db.query<{ id: string }>(
    `insert into ops_stock_items (${cols.join(",")}) values (${vals.map((_, i) => `$${i + 1}`).join(",")}) returning id`,
    vals,
  );
  return r.rows[0].id;
}
async function receive(id: string, to = "free") {
  await db.query("update ops_stock_items set status = $2 where id = $1", [id, to]);
}
async function state(id: string) {
  return (await db.query<{ status: string; reserved_ref: string | null; reserved_order_line_id: string | null }>(
    "select status, reserved_ref, reserved_order_line_id from ops_stock_items where id = $1", [id])).rows[0];
}

beforeEach(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated; create role anon;
    create table orders (id uuid primary key, so int, status text);
    create table order_lines (id uuid primary key, order_id uuid, sku text, qty int);
    create table purchase_orders (id text primary key, status text);
    create table po_line_sources (id uuid primary key default gen_random_uuid(), po_id text, po_line_id uuid,
      sku text, order_id uuid, so int, order_line_id uuid, qty int, created_at timestamptz default now());
    create table ops_stock_items (id uuid primary key default gen_random_uuid(), unit_code text, sku text,
      status text, qty int default 1, po_line_id uuid, reserved_ref text, reserved_order_line_id uuid,
      reserved_purchase_demand_id uuid, ref_history text[] default '{}', identity_scope text default 'unit',
      needs_repair boolean default false, updated_at timestamptz);

    insert into orders (id, so, status) values
      ('${ORDER}', 1375, 'proceed_order'), ('${OTHER}', 1376, 'place'), ('${GONE}', 1377, 'cancelled');
    insert into order_lines (id, order_id, sku, qty) values
      ('${LINE}', '${ORDER}', 'REGAL-Q', 1), ('${LINE_OTHER}', '${OTHER}', 'REGAL-Q', 1),
      ('${LINE_GONE}', '${GONE}', 'REGAL-Q', 1);
    insert into purchase_orders (id, status) values ('PO-A', 'open'), ('PO-B', 'open'), ('PO-C', 'open');
    insert into po_line_sources (po_id, po_line_id, sku, order_id, so, order_line_id, qty, created_at) values
      ('PO-A', '${PO_LINE}', 'REGAL-Q', '${ORDER}', 1375, '${LINE}', 1, now()),
      ('PO-B', '${PO_LINE_SHARED}', 'REGAL-Q', '${ORDER}', 1375, '${LINE}', 1, now() - interval '1 hour'),
      ('PO-B', '${PO_LINE_SHARED}', 'REGAL-Q', '${OTHER}', 1376, '${LINE_OTHER}', 1, now());
  `);
  // The arrival trigger as 0600 created it; 0736 replaces its function.
  await db.exec(`
    create function public.ops_stock_bound_incoming_arrives() returns trigger language plpgsql as $$ begin return new; end $$;
    create trigger ops_stock_bound_incoming_arrives before update of status on public.ops_stock_items
      for each row execute function public.ops_stock_bound_incoming_arrives();
  `);
  await db.exec(migration("0736_a_receipt_reserves_goods_for_the_so_line_they_were_bought_for"));
});

describe("0736 · receipt reserves goods bought for an SO line", () => {
  it("SO-1375: the received REGAL Unit is reserved to its source line", async () => {
    const u = await unit("U1-000-335", { sku: "REGAL-Q", status: "incoming", po_line_id: PO_LINE });
    await receive(u);
    expect(await state(u)).toEqual({ status: "reserved", reserved_ref: "SO-1375", reserved_order_line_id: LINE });
  });

  it("a shared PO line follows its source rows: one Unit per source, oldest first", async () => {
    const a = await unit("U-A", { sku: "REGAL-Q", status: "incoming", po_line_id: PO_LINE_SHARED });
    const b = await unit("U-B", { sku: "REGAL-Q", status: "incoming", po_line_id: PO_LINE_SHARED });
    const c = await unit("U-C", { sku: "REGAL-Q", status: "incoming", po_line_id: PO_LINE_SHARED });
    await receive(a);
    await receive(b);
    await receive(c);
    expect((await state(a)).reserved_ref).toBe("SO-1375");
    expect((await state(b)).reserved_ref).toBe("SO-1376");
    // Over-received: no source left, so it stays free stock.
    expect(await state(c)).toEqual({ status: "free", reserved_ref: null, reserved_order_line_id: null });
  });

  it("a GRN posting several Units in one statement splits them the same way", async () => {
    const ids = [];
    for (const code of ["U-A", "U-B", "U-C"]) {
      ids.push(await unit(code, { sku: "REGAL-Q", status: "incoming", po_line_id: PO_LINE_SHARED }));
    }
    await db.query("update ops_stock_items set status = 'free' where po_line_id = $1", [PO_LINE_SHARED]);
    const refs = (await db.query<{ reserved_ref: string | null }>(
      "select reserved_ref from ops_stock_items where po_line_id = $1", [PO_LINE_SHARED])).rows.map((r) => r.reserved_ref);
    expect(refs.sort()).toEqual(["SO-1375", "SO-1376", null].sort());
  });

  it("a line already holding its goods takes nothing more", async () => {
    await unit("SHELF", { sku: "REGAL-Q", status: "reserved", reserved_ref: "SO-1375", reserved_order_line_id: LINE });
    const u = await unit("U1", { sku: "REGAL-Q", status: "incoming", po_line_id: PO_LINE });
    await receive(u);
    expect((await state(u)).status).toBe("free");
  });

  it("a cancelled order, a damaged Unit, stock with no source and a Use-this-PO binding are left alone", async () => {
    await db.exec(`insert into po_line_sources (po_id, po_line_id, sku, order_id, so, order_line_id, qty)
      values ('PO-C', '${PO_LINE_STOCK}', 'REGAL-Q', '${GONE}', 1377, '${LINE_GONE}', 1)`);
    const cancelled = await unit("U-X", { sku: "REGAL-Q", status: "incoming", po_line_id: PO_LINE_STOCK });
    const damaged = await unit("U-D", { sku: "REGAL-Q", status: "incoming", po_line_id: PO_LINE, needs_repair: true });
    const plain = await unit("U-P", { sku: "REGAL-Q", status: "incoming" });
    const bound = await unit("U-U", { sku: "REGAL-Q", status: "incoming", po_line_id: PO_LINE,
      reserved_ref: "SO-1376", reserved_order_line_id: LINE_OTHER });
    for (const id of [cancelled, damaged, plain]) await receive(id);
    for (const id of [cancelled, damaged, plain]) expect((await state(id)).status).toBe("free");
    // The 0600 binding still wins: a Use-this-PO Unit arrives for its own line.
    await receive(bound);
    expect(await state(bound)).toEqual({ status: "reserved", reserved_ref: "SO-1376", reserved_order_line_id: LINE_OTHER });
  });

  it("an arrival that is not a check-in keeps 0600's release of a bound Unit", async () => {
    const bound = await unit("U-V", { sku: "REGAL-Q", status: "incoming", po_line_id: PO_LINE,
      reserved_ref: "SO-1375", reserved_order_line_id: LINE });
    await receive(bound, "voided");
    expect(await state(bound)).toEqual({ status: "voided", reserved_ref: null, reserved_order_line_id: null });
  });

  it("the backfill reserves a Unit already received free, once", async () => {
    const u = await unit("U1-000-335", { sku: "REGAL-Q", status: "free", po_line_id: PO_LINE });
    await db.query("select public._stock_reserve_received_for_source_lines()");
    expect((await state(u)).reserved_ref).toBe("SO-1375");
    const again = await db.query<{ n: number }>("select public._stock_reserve_received_for_source_lines() n");
    expect(again.rows[0].n).toBe(0);
  });
});

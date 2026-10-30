import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { migration, statementOf } from "./stock-register-database";

/**
 * 0737 · A DELIVERY OF ACCESSORIES ONLY HANDS OVER WITHOUT UNIT IDS — run as SQL.
 *
 * The handover door is created as 0560 left it and the deliver body as 0716
 * left it with 0733's rewrite on top; then 0737 runs exactly as committed, so
 * its text rewrites are proved to find their needles. Only base tables and the
 * auth / role readers are fixtures.
 */

const PILLOW_SO = "11111111-1111-1111-1111-111111111111";
const MIXED_SO = "11111111-1111-1111-1111-111111111112";
const JOURNEY_SO = "11111111-1111-1111-1111-111111111113";
const SITE = "33333333-3333-3333-3333-333333333331";
const NETS = "44444444-4444-4444-4444-444444444441";
const AL = "44444444-4444-4444-4444-444444444442";

function lastFunction(sql: string, name: string) {
  const text = sql.replace(/\r\n/g, "\n");
  const head = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\(`, "gi");
  let start = -1;
  for (let m = head.exec(text); m; m = head.exec(text)) start = m.index;
  if (start < 0) throw new Error(`no ${name}`);
  const tag = /\bas\s+(\$[A-Za-z_]*\$)/i.exec(text.slice(start))!;
  const bodyAt = start + tag.index + tag[0].length;
  const end = text.indexOf(tag[1], bodyAt);
  return text.slice(start, end + tag[1].length) + ";";
}

async function build(with0737: boolean) {
  const db = new PGlite();
  await db.exec(`
    create role authenticated; create role anon;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create type app_role as enum ('operation', 'principal', 'warehouse', 'sales');
    create function public.app_role() returns app_role language sql as $$ select 'operation'::app_role $$;
    create function public.app_warehouse_id() returns uuid language sql as $$ select null::uuid $$;
    create function public.is_operation() returns boolean language sql as $$ select true $$;

    create table warehouses (id uuid primary key, name text);
    create table orders (id uuid primary key, so int, status text, operation_stage text, do_number text,
      do_note text, do_file_path text, do_uploaded_at timestamptz, do_uploaded_by uuid,
      pod_signature_url text, pod_signed_by text, pod_signed_at timestamptz,
      dispatched_at timestamptz, delivered_at timestamptz, updated_at timestamptz,
      dealer_id uuid, delivery_partner_id uuid, ops_assigned_logistic uuid, warehouse_id uuid,
      delivery_stops jsonb);
    create table order_lines (id uuid primary key default gen_random_uuid(), order_id uuid, sku text, qty int);
    create table product_skus (sku text unique, stock_identity_mode text);
    create table ops_stock_items (id uuid primary key default gen_random_uuid(), unit_code text, sku text,
      warehouse_id uuid, status text, qty int default 1, reserved_ref text, holder_party_id uuid,
      sold_order_id uuid, sold_at timestamptz, ref_history text[] default '{}', updated_at timestamptz,
      identity_scope text default 'unit', date_in date default current_date, created_at timestamptz default now());
    create table ops_delivery_orders (id uuid primary key default gen_random_uuid(), order_id uuid, do_number text,
      leg int default 0, trip int default 0, trip_groups text[], logistics_partner text,
      issued_at timestamptz default now(), voided_at timestamptz);
    create table delivery_order_units (delivery_order_id uuid, item_id uuid, unique (delivery_order_id, item_id));
    create table stock_operating_parties (id uuid primary key, kind text);
    create table delivery_partners (id uuid primary key, name text, operating_party_id uuid);
    create table ops_delivery_arrangements (order_id uuid, leg int, partner_id uuid, confirmed_date date);
    create table delivery_handover_events (id uuid primary key default gen_random_uuid(), delivery_order_id uuid,
      kind text, duty text, company text, counterparty text, receiver_name text, vehicle text, goods jsonb,
      note text, proof_path text, recorded_by uuid, recorded_at timestamptz default now());
    create table delivery_handover_evidence (event_id uuid, delivery_order_id uuid, path text, kind text, recorded_by uuid);
    create table delivery_handover_event_units (event_id uuid, delivery_order_id uuid, item_id uuid, recorded_side text,
      unique (delivery_order_id, item_id, recorded_side));
    create table delivery_unit_prep (delivery_order_id uuid, item_id uuid, fact text);
    create table delivery_attempts (id uuid primary key default gen_random_uuid(), order_id uuid, attempt_no int,
      result text, do_number text, logistics_name text, scheduled_date date, recorded_by uuid, leg int);
    create table delivery_attempt_units (attempt_id uuid, item_id uuid, outcome text);
    create table order_supplier_threads (order_id uuid, operation_stage text, delivered_at timestamptz, updated_at timestamptz);
    create table ops_order_control (order_id uuid, confirmed_date date);
    create table order_history (order_id uuid, text text not null, by_role text);
    create table audit_log (role text, actor_text text, action text, dealer_id uuid, ref text);
    create table app_users (id uuid, name text);

    insert into warehouses values ('${SITE}', 'Klang');
    insert into stock_operating_parties values ('${NETS}', 'delivery_operator'), ('${AL}', 'delivery_operator');
    insert into delivery_partners values ('${NETS}', 'NETS', '${NETS}'), ('${AL}', 'AL', '${AL}');
    insert into product_skus values ('pillow:Soft', 'quantity'), ('mattress:Queen', 'exact_unit');
    insert into orders (id, so, status, operation_stage, warehouse_id) values
      ('${PILLOW_SO}', 1372, 'proceed_order', 'ready_to_dispatch', '${SITE}'),
      ('${MIXED_SO}', 1373, 'proceed_order', 'ready_to_dispatch', '${SITE}'),
      ('${JOURNEY_SO}', 1374, 'proceed_order', 'ready_to_dispatch', '${SITE}');
    insert into order_lines (order_id, sku, qty) values
      ('${PILLOW_SO}', 'pillow:Soft', 1),
      ('${MIXED_SO}', 'pillow:Soft', 1), ('${MIXED_SO}', 'mattress:Queen', 1),
      ('${JOURNEY_SO}', 'pillow:Soft', 2);
    insert into ops_delivery_arrangements (order_id, leg, partner_id) values
      ('${PILLOW_SO}', 0, '${NETS}'), ('${MIXED_SO}', 0, '${NETS}'),
      ('${JOURNEY_SO}', 1, '${NETS}'), ('${JOURNEY_SO}', 2, '${AL}');
    insert into ops_delivery_orders (order_id, do_number, leg, logistics_partner) values
      ('${PILLOW_SO}', 'DO-1372', 0, 'NETS'), ('${MIXED_SO}', 'DO-1373', 0, 'NETS'),
      ('${JOURNEY_SO}', 'DO-1374-2', 2, 'AL');
    -- One counted bulk row: 40 pillows on the shelf (0453).
    insert into ops_stock_items (unit_code, sku, warehouse_id, status, qty, identity_scope)
      values ('Q-PILLOW', 'pillow:Soft', '${SITE}', 'free', 40, 'quantity');
  `);
  const m0716 = migration("0716_office_staff_record_delivery_returns_and_mark_delivered_by_load_scan");
  const m0733 = migration("0733_stock_units_follow_their_order");
  await db.exec("set check_function_bodies = off");
  await db.exec(lastFunction(migration("0560_a_blank_answer_is_not_an_answer"), "delivery_handover_record"));
  await db.exec(lastFunction(m0716, "_delivery_mark_delivered"));
  await db.exec(lastFunction(m0716, "operation_attach_do_and_deliver"));
  await db.exec(lastFunction(m0733, "_delivery_sell_do_units"));
  await db.exec(statementOf(m0733, "create or replace function pg_temp.mig0733_rewrite", "$rw$;"));
  await db.exec(statementOf(m0733, "select pg_temp.mig0733_rewrite('public._delivery_mark_delivered", "$new$);"));
  if (with0737) await db.exec(migration("0737_a_delivery_of_accessories_only_hands_over_without_unit_ids"));
  await db.exec("set check_function_bodies = on");
  return db;
}

async function refusal(db: PGlite, sql: string, params: unknown[] = []): Promise<string | null> {
  try {
    await db.query(sql, params);
    return null;
  } catch (e) {
    return (e as { message?: string }).message ?? "unknown";
  }
}
async function doId(db: PGlite, doNumber: string) {
  return (await db.query<{ id: string }>("select id from ops_delivery_orders where do_number = $1", [doNumber])).rows[0].id;
}
const HANDOVER = "select public.delivery_handover_record($1, 'handed_over', $2, null, null, null, $3)";
const RECEIPT = "select public.delivery_handover_record($1, 'received_by_logistics')";
const DELIVER = "select public.operation_attach_do_and_deliver($1, $2, null, true, 'pod/x.pdf')";

describe("before 0737", () => {
  it("an accessories-only DO cannot be handed over", async () => {
    const db = await build(false);
    expect(await refusal(db, HANDOVER, [await doId(db, "DO-1372"), "Ali", "handover/p.jpg"]))
      .toMatch(/no recorded exact-Unit scope/);
  });

  it("the no-Unit-list pick sells a whole bulk row of 40 pillows for one", async () => {
    const db = await build(false);
    await db.query("update orders set operation_stage = 'dispatched' where id = $1", [PILLOW_SO]);
    await db.query(DELIVER, [PILLOW_SO, "DO-1372"]);
    expect((await db.query<{ status: string }>("select status from ops_stock_items where unit_code = 'Q-PILLOW'")).rows[0].status)
      .toBe("sold");
  });
});

describe("after 0737", () => {
  it("an accessories-only DO hands over without Unit IDs, is received and delivers", async () => {
    const db = await build(true);
    const id = await doId(db, "DO-1372");
    await db.query(HANDOVER, [id, "Ali", "handover/p.jpg"]);
    await db.query(RECEIPT, [id]);
    const r = await db.query<{ j: { status: string; units_sold: number } }>(
      "select public.operation_attach_do_and_deliver($1, 'DO-1372', null, true, 'pod/x.pdf') j", [PILLOW_SO]);
    expect(r.rows[0].j.status).toBe("delivered");
    expect(r.rows[0].j.units_sold).toBe(0);
    const bulk = (await db.query<{ status: string; qty: number }>(
      "select status, qty from ops_stock_items where unit_code = 'Q-PILLOW'")).rows[0];
    expect(bulk).toEqual({ status: "free", qty: 40 });
    const history = (await db.query<{ text: string }>(
      "select text from order_history where order_id = $1", [PILLOW_SO])).rows.map((h) => h.text);
    expect(history).toContain("Handed over the accessories to NETS — received by Ali (DO-1372)");
  });

  it("still needs the receiver and the proof", async () => {
    const db = await build(true);
    const id = await doId(db, "DO-1372");
    expect(await refusal(db, HANDOVER, [id, " ", "handover/p.jpg"])).toMatch(/names the person/);
    expect(await refusal(db, HANDOVER, [id, "Ali", null])).toMatch(/carries its proof/);
  });

  it("a DO with a Unit-tracked line and no Units recorded is still refused", async () => {
    const db = await build(true);
    expect(await refusal(db, HANDOVER, [await doId(db, "DO-1373"), "Ali", "handover/p.jpg"]))
      .toMatch(/no recorded exact-Unit scope/);
  });

  it("a SKU Catalog does not know is treated as Unit-tracked", async () => {
    const db = await build(true);
    await db.query("insert into order_lines (order_id, sku, qty) values ($1, 'mystery:Thing', 1)", [PILLOW_SO]);
    expect(await refusal(db, HANDOVER, [await doId(db, "DO-1372"), "Ali", "handover/p.jpg"]))
      .toMatch(/no recorded exact-Unit scope/);
  });

  it("a later Journey leg of accessories hands over once the previous leg's partner is recorded", async () => {
    const db = await build(true);
    const id = await doId(db, "DO-1374-2");
    await db.query("delete from ops_delivery_arrangements where order_id = $1 and leg = 1", [JOURNEY_SO]);
    expect(await refusal(db, HANDOVER, [id, "Ali", "handover/p.jpg"])).toMatch(/previous leg has no Logistics Partner/);
    await db.query("insert into ops_delivery_arrangements (order_id, leg, partner_id) values ($1, 1, $2)", [JOURNEY_SO, NETS]);
    await db.query(HANDOVER, [id, "Ali", "handover/p.jpg"]);
    expect((await db.query<{ company: string }>(
      "select company from delivery_handover_events where delivery_order_id = $1", [id])).rows[0].company).toBe("NETS");
  });
});

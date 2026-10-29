import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { migration } from "./stock-register-database";

/**
 * 0733 · STOCK UNITS FOLLOW THEIR ORDER — run as SQL.
 *
 * The functions 0733 rewrites are created from the migrations that last
 * defined them, then 0733 runs on top exactly as committed, so its text
 * rewrites are proved to find their needles. Only base tables and the auth /
 * role readers are fixtures.
 */

const ORDER = "11111111-1111-1111-1111-111111111111";
const OTHER = "11111111-1111-1111-1111-111111111112";
const LINE_Q = "22222222-2222-2222-2222-222222222221";
const LINE_P = "22222222-2222-2222-2222-222222222222";
const SITE = "33333333-3333-3333-3333-333333333331";

/** The last `create or replace function public.<name>(` statement in a migration. */
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

const REWRITTEN: Array<[string, string]> = [
  ["0496_the_first_legs_arrival_names_its_stop", "delivery_attempt_record"],
  ["0716_office_staff_record_delivery_returns_and_mark_delivered_by_load_scan", "_delivery_mark_delivered"],
  ["0716_office_staff_record_delivery_returns_and_mark_delivered_by_load_scan", "delivery_load_scan"],
  ["0564_the_amendment_carries_the_whole_change_and_the_customers_agreement", "sales_order_decide_amendment"],
  ["0560_a_blank_answer_is_not_an_answer", "operation_abandon_order"],
  ["0710_office_staff_open_a_delivery_order_from_so_lines", "delivery_office_document_mint"],
  ["0714_office_staff_adjust_transfer_and_count_stock", "stock_count_record"],
  ["0698_purchase_requests_keep_their_approved_scope_through_execution", "operation_receive_po_with_do"],
  ["0698_purchase_requests_keep_their_approved_scope_through_execution", "_operation_create_po_inner_admitted"],
  ["0698_purchase_requests_keep_their_approved_scope_through_execution", "purchasing_revise_po"],
  ["0601_a_grn_names_who_received_it_and_when", "receiving_amend"],
];

let db: PGlite;

async function as(role: string | null) {
  await db.query(`select set_config('test.role', $1, false)`, [role ?? ""]);
}
async function refusal(sql: string, params: unknown[] = []): Promise<string | null> {
  try {
    await db.query(sql, params);
    return null;
  } catch (e) {
    return (e as { message?: string }).message ?? "unknown";
  }
}
async function unit(code: string, fields: Record<string, unknown>) {
  const cols = ["unit_code", ...Object.keys(fields)];
  const vals = [code, ...Object.values(fields)];
  const r = await db.query<{ id: string }>(
    `insert into ops_stock_items (${cols.join(",")}) values (${vals.map((_, i) => `$${i + 1}`).join(",")}) returning id`,
    vals,
  );
  return r.rows[0].id;
}
async function status(id: string) {
  return (await db.query<{ status: string; reserved_ref: string | null }>(
    "select status, reserved_ref from ops_stock_items where id = $1", [id])).rows[0];
}
async function liveDo(order: string, doNumber: string, units: string[]) {
  const d = (await db.query<{ id: string }>(
    "insert into ops_delivery_orders (order_id, do_number) values ($1, $2) returning id", [order, doNumber])).rows[0].id;
  for (const u of units) await db.query("insert into delivery_order_units (delivery_order_id, item_id) values ($1, $2)", [d, u]);
  return d;
}

beforeEach(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated; create role anon;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create type app_role as enum ('operation', 'principal', 'sales', 'finance');
    create function public.app_role() returns app_role language sql as
      $$ select nullif(current_setting('test.role', true), '')::app_role $$;
    create function public.is_operation() returns boolean language sql as
      $$ select coalesce(public.app_role() in ('operation', 'principal'), false) $$;
    create function public._activity_log_order_id_from_ref(text) returns uuid language sql as $$ select null::uuid $$;
    create function public._operation_release_order_reserve(uuid) returns void language sql as $$ select $$;

    create table orders (id uuid primary key, so int, status text, operation_stage text, do_number text,
      dealer_id uuid, delivery_partner_id uuid, ops_assigned_logistic uuid, warehouse_id uuid,
      delivery_stops jsonb, updated_at timestamptz);
    create table order_lines (id uuid primary key default gen_random_uuid(), order_id uuid, sku text, qty int,
      unit_price numeric, attrs jsonb);
    create table ops_stock_items (id uuid primary key default gen_random_uuid(), unit_code text, sku text,
      warehouse_id uuid, status text, qty int default 1, reserved_ref text,
      reserved_order_line_id uuid references order_lines(id), reserved_purchase_demand_id uuid,
      sold_order_id uuid, sold_at timestamptz, ref_history text[] default '{}', updated_at timestamptz,
      identity_scope text default 'unit', date_in date default current_date, needs_repair boolean default false,
      created_at timestamptz default now());
    create table ops_delivery_orders (id uuid primary key default gen_random_uuid(), order_id uuid, do_number text,
      leg int default 0, trip int default 0, trip_groups text[], delivery_date date, time_slot text,
      logistics_partner text, issued_by uuid, issued_at timestamptz default now(),
      voided_at timestamptz, void_reason text, voided_by uuid);
    create table delivery_order_units (delivery_order_id uuid, item_id uuid, unique (delivery_order_id, item_id));
    create table delivery_attempts (id uuid default gen_random_uuid(), order_id uuid, do_number text, result text);
    create table delivery_returns (id uuid primary key, delivery_order_id uuid);
    create table delivery_return_units (return_id uuid, unit_id uuid);
    create table audit_log (role text, actor_text text, action text, dealer_id uuid, ref text);
    create table ops_activity_log (order_id uuid, action text, actor_id uuid, detail jsonb);
    create table order_history (order_id uuid, text text, by_role text, by_user_id uuid, metadata jsonb);
    create table app_users (id uuid, name text);
    create table ops_order_control (order_id uuid, confirmed_date date, confirmed_time_slot text, confirmed_partner_id uuid);
    create table delivery_partners (id uuid, name text);
    create table sales_order_amendments (id uuid);
    create table stock_counts (id uuid primary key, count_no text, warehouse_id uuid, status text default 'open', extras jsonb);
    create table stock_count_units (count_id uuid, unit_id uuid, found boolean, primary key (count_id, unit_id));

    insert into orders (id, so, status, operation_stage) values
      ('${ORDER}', 101, 'proceed_order', 'ready_to_dispatch'), ('${OTHER}', 102, 'proceed_order', null);
    insert into order_lines (id, order_id, sku, qty, unit_price) values
      ('${LINE_Q}', '${ORDER}', 'mattress:Queen', 2, 1000), ('${LINE_P}', '${ORDER}', 'pillow:Soft', 1, 50);
  `);
  await db.exec(lastFunction(migration("0600_a_unit_on_a_purchase_order_can_be_reserved_for_a_sales_order"), "ops_stock_release"));
  // The functions 0733 edits by text are created as their last migration left
  // them; their bodies reach tables this fixture does not hold, so only 0733's
  // own functions are compiled on creation.
  await db.exec("set check_function_bodies = off");
  for (const [file, fn] of REWRITTEN) await db.exec(lastFunction(migration(file), fn));
  await db.exec(migration("0733_stock_units_follow_their_order"));
  await db.exec("set check_function_bodies = on");
  await as("principal");
});

describe("0733 · the rewrites land on the live bodies", () => {
  it("every rewritten function now carries its 0733 change", async () => {
    const def = async (sig: string) =>
      (await db.query<{ d: string }>(`select pg_get_functiondef('${sig}'::regprocedure) d`)).rows[0].d;
    expect(await def("public._delivery_mark_delivered(uuid,text,text,text,text,text,text)")).toContain("_delivery_sell_do_units");
    expect(await def("public.delivery_load_scan(text)")).toContain("_delivery_sell_do_units");
    expect(await def("public.sales_order_decide_amendment(uuid,text,text)")).toContain("_so_release_units_left_by_lines");
    expect(await def("public.operation_abandon_order(uuid,text)")).toContain("_order_void_dos_and_release_units");
    expect(await def("public.delivery_attempt_record(uuid,text,text,text,text,uuid[],jsonb,int)")).toContain("carres.unit_leaves_its_do");
    expect(await def("public.stock_count_record(uuid,text[],jsonb,boolean)")).toContain("0733");
    for (const sig of [
      "public.operation_receive_po_with_do(text,text,text,jsonb,uuid)",
      "public.receiving_amend(uuid,text,jsonb,uuid)",
      "public._operation_create_po_inner_admitted(uuid,uuid,jsonb,date,integer[],text,uuid,uuid,jsonb)",
      "public.purchasing_revise_po(text,text,jsonb)",
    ]) {
      expect(await def(sig)).not.toMatch(/current_date/i);
    }
    const dflt = (await db.query<{ d: string }>(
      "select column_default d from information_schema.columns where table_name = 'ops_stock_items' and column_name = 'date_in'")).rows[0].d;
    expect(dflt).toContain("Asia/Kuala_Lumpur");
  });
});

describe("1 · an approved amendment releases the Units its lines no longer hold", () => {
  it("Queen → King releases the Queen, a lower qty releases the extra, a removed line releases its Unit", async () => {
    const q1 = await unit("Q1", { sku: "mattress:Queen", status: "reserved", reserved_ref: "SO-101", reserved_order_line_id: LINE_Q });
    const q2 = await unit("Q2", { sku: "mattress:Queen", status: "reserved", reserved_ref: "SO-101", reserved_order_line_id: LINE_Q });
    const p1 = await unit("P1", { sku: "pillow:Soft", status: "reserved", reserved_ref: "SO-101", reserved_order_line_id: LINE_P });

    // qty 2 → 1: one Queen goes back, one stays.
    await db.query("select public._so_release_units_left_by_lines($1, $2)", [ORDER,
      JSON.stringify([{ id: LINE_Q, sku: "mattress:Queen", qty: 1 }, { id: LINE_P, sku: "pillow:Soft", qty: 1 }])]);
    expect([(await status(q1)).status, (await status(q2)).status].sort()).toEqual(["free", "reserved"]);
    expect((await status(p1)).status).toBe("reserved");

    // Queen → King and the pillow removed: everything goes back, and the
    // line can now be deleted without the raw foreign-key error.
    await db.query("select public._so_release_units_left_by_lines($1, $2)", [ORDER,
      JSON.stringify([{ id: LINE_Q, sku: "mattress:King", qty: 1 }])]);
    for (const id of [q1, q2, p1]) expect(await status(id)).toEqual({ status: "free", reserved_ref: null });
    await db.query("delete from order_lines where id = $1", [LINE_P]);
  });

  it("a line with a delivered Unit cannot be removed or changed", async () => {
    await unit("Q1", { sku: "mattress:Queen", status: "sold", sold_order_id: ORDER, reserved_ref: "SO-101", reserved_order_line_id: LINE_Q });
    expect(await refusal("select public._so_release_units_left_by_lines($1, $2)", [ORDER,
      JSON.stringify([{ id: LINE_P, sku: "pillow:Soft", qty: 1 }])])).toMatch(/Already delivered: Q1/);
  });

  it("a Unit on a live DO is refused by name, not released", async () => {
    const q1 = await unit("Q1", { sku: "mattress:Queen", status: "reserved", reserved_ref: "SO-101", reserved_order_line_id: LINE_Q });
    await liveDo(ORDER, "DO-1", [q1]);
    expect(await refusal("select public._so_release_units_left_by_lines($1, $2)", [ORDER,
      JSON.stringify([{ id: LINE_Q, sku: "mattress:King", qty: 1 }])])).toMatch(/Unit Q1 is on Delivery Order DO-1/);
  });
});

describe("2 · abandoning an order voids its DOs and releases its Units", () => {
  it("voids the DO that has not run, keeps the delivered one, releases shelf and PO-bound Units", async () => {
    const shelf = await unit("S1", { sku: "mattress:Queen", status: "reserved", reserved_ref: "SO-101", reserved_order_line_id: LINE_Q });
    const onPo = await unit("I1", { sku: "mattress:Queen", status: "incoming", reserved_order_line_id: LINE_Q });
    const others = await unit("X1", { sku: "mattress:Queen", status: "reserved", reserved_ref: "SO-102" });
    await liveDo(ORDER, "DO-OPEN", [shelf]);
    await liveDo(ORDER, "DO-RAN", []);
    await db.exec(`insert into delivery_attempts (order_id, do_number, result) values ('${ORDER}', 'DO-RAN', 'delivered')`);
    await as("operation");

    await db.query("select public.operation_abandon_order($1, 'customer withdrew')", [ORDER]);

    const dos = (await db.query<{ do_number: string; void_reason: string | null }>(
      "select do_number, void_reason from ops_delivery_orders order by do_number")).rows;
    expect(dos).toEqual([{ do_number: "DO-OPEN", void_reason: "order_cancelled" }, { do_number: "DO-RAN", void_reason: null }]);
    expect(await status(shelf)).toEqual({ status: "free", reserved_ref: null });
    expect((await status(onPo)).status).toBe("incoming");
    expect((await db.query("select 1 from ops_stock_items where id = $1 and reserved_order_line_id is null", [onPo])).rows).toHaveLength(1);
    expect(await status(others)).toEqual({ status: "reserved", reserved_ref: "SO-102" });
  });
});

describe("3 · delivered sells only the order's own Units, and a Unit on a live DO stays", () => {
  it("a Unit on a live DO cannot be released or moved to another order", async () => {
    const u = await unit("U1", { sku: "mattress:Queen", status: "reserved", reserved_ref: "SO-101" });
    const d = await liveDo(ORDER, "DO-1", [u]);
    expect(await refusal("select public.ops_stock_release($1)", [u])).toMatch(/Unit U1 is on Delivery Order DO-1/);
    expect(await refusal("update ops_stock_items set reserved_ref = 'SO-102' where id = $1", [u])).toMatch(/DO-1/);

    // The failed-trip door says it is bringing the Unit back.
    await db.exec("begin");
    await db.exec("select set_config('carres.unit_leaves_its_do', 'on', true)");
    expect((await db.query("select public.ops_stock_release($1) id", [u])).rows).toHaveLength(1);
    await db.exec("rollback");

    // Void the DO and the Unit is free to go.
    await db.query("update ops_delivery_orders set voided_at = now(), void_reason = 'rescheduled' where id = $1", [d]);
    expect((await db.query<{ id: string }>("select public.ops_stock_release($1) id", [u])).rows[0].id).toBe(u);
  });

  it("refuses a DO that holds another order's Unit, and sells only its own", async () => {
    const mine = await unit("M1", { sku: "mattress:Queen", status: "reserved", reserved_ref: "SO-101" });
    const theirs = await unit("T1", { sku: "mattress:Queen", status: "reserved", reserved_ref: "SO-102" });
    const d = await liveDo(ORDER, "DO-1", [mine, theirs]);
    expect(await refusal("select public._delivery_sell_do_units($1, $2)", [d, ORDER]))
      .toMatch(/Reserved to another order: T1 \(SO-102\)/);

    await db.query("delete from delivery_order_units where item_id = $1", [theirs]);
    const sold = (await db.query<{ s: string[] }>("select public._delivery_sell_do_units($1, $2) s", [d, ORDER])).rows[0].s;
    expect(sold).toEqual([mine]);
    expect(await status(mine)).toEqual({ status: "sold", reserved_ref: "SO-101" });
    expect(await status(theirs)).toEqual({ status: "reserved", reserved_ref: "SO-102" });
  });
});

describe("4 · an office DO for one group records its Units", () => {
  it("records the picked Units, and refuses no Unit or another order's Unit", async () => {
    await as("operation");
    const bed = await unit("B1", { sku: "mattress:Queen", status: "reserved", reserved_ref: "SO-101" });
    const foreign = await unit("F1", { sku: "mattress:Queen", status: "reserved", reserved_ref: "SO-102" });

    expect(await refusal("select public.delivery_office_document_mint($1, array['bed'], 'DO-A', '{}')", [ORDER]))
      .toMatch(/no reserved Unit for the picked goods/);
    expect(await refusal("select public.delivery_office_document_mint($1, array['bed'], 'DO-A', array[$2::uuid])", [ORDER, foreign]))
      .toMatch(/not reserved to this order/);

    await db.query("select public.delivery_office_document_mint($1, array['bed'], 'DO-A', array[$2::uuid])", [ORDER, bed]);
    const units = (await db.query<{ item_id: string }>(
      "select u.item_id from delivery_order_units u join ops_delivery_orders d on d.id = u.delivery_order_id where d.do_number = 'DO-A'")).rows;
    expect(units).toEqual([{ item_id: bed }]);
  });
});

describe("5 · Stock Take counts a labelled Unit that arrived after it opened", () => {
  it("a scanned Unit at the Site and in stock is found, not refused into extras", async () => {
    await as("operation");
    const count = "44444444-4444-4444-4444-444444444441";
    await db.query("insert into stock_counts (id, count_no, warehouse_id) values ($1, 'STK-1', $2)", [count, SITE]);
    const late = await unit("LATE1", { sku: "mattress:Queen", status: "free", warehouse_id: SITE });
    await unit("ELSEWHERE", { sku: "mattress:Queen", status: "free", warehouse_id: OTHER });

    await db.query("select public.stock_count_record($1, array['LATE1'], '[]', false)", [count]);
    expect((await db.query("select found from stock_count_units where count_id = $1 and unit_id = $2", [count, late])).rows)
      .toEqual([{ found: true }]);
    expect(await refusal("select public.stock_count_record($1, array['ELSEWHERE'], '[]', false)", [count]))
      .toMatch(/Not in this count: ELSEWHERE/);
  });
});

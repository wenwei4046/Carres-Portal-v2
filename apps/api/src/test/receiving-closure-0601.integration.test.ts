import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0601 ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN (Purchasing
 * MASTER §7.3 + §9.4 — RECEIVING CLOSURE, owner rulings 2026-09-17,
 * 2026-09-25, 2026-09-28):
 *
 *   post      any active Operation staff member posts (no GRN Duty needed);
 *             the Warehouse role is refused
 *   time      Goods Received Date is a time point, captured at the Office
 *             receipt and at the Warehouse count; never in the future
 *   receiver  a partner-run Site names its operating company; a Carres-run
 *             Site names the Carres staff member who saved
 *   amend     exact Units named both ways; the system never picks one;
 *             locked Units refuse by name; first save wins
 *
 * Fixtures are written with triggers off inside ONE transaction that is
 * rolled back; the doors are then called with triggers ON, signed in.
 *
 *   LC_ALL=en_US.UTF-8 node scripts/dry-run-migrations.mjs --baseline scripts/migration-replay-baseline.json --keep
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- receiving-closure
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `fffffff7-0000-4000-8000-${HEX}${tail.padStart(7, "0")}`;

const OP = uid("2");
const OP2 = uid("3");
const WAREHOUSE_USER = uid("4");
const SUPPLIER = uid("51");
const WH = uid("61");
const SHOWROOM = uid("62");
const NETS = uid("71");
const PO = `PO-IT1-${HEX}`;
const PO2 = `PO-IT2-${HEX}`;
const PO3 = `PO-IT3-${HEX}`;
const LINE = uid("a1");
const LINE2 = uid("a2");
const LINE3 = uid("a3");
const U = [uid("b1"), uid("b2"), uid("b3")];
const U2 = uid("c1");
const U3 = uid("d1");
const CODE_NO: Record<string, string> = { [U[0]!]: "101", [U[1]!]: "102", [U[2]!]: "103", [U2]: "201", [U3]: "301" };
const code = (id: string) => `U9${RUN}-${CODE_NO[id]}-001`;
const SKU = `IT-GRN-${HEX}`;
const NETS_NAME = `IT NETS ${HEX}`;
const OP_NAME = `IT op ${HEX}`;
const rowOf = <T,>(r: unknown) => (r as { row: { r: T } }).row.r;

describe.skipIf(!URL)("a GRN names who received it and when (real PostgreSQL, 0601)", () => {
  let db: pg.Client;
  let grn1 = "";
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
  async function attempt(sql: string, params: unknown[] = []): Promise<{ ok: true; row: Record<string, unknown> } | { ok: false; why: string; detail: string }> {
    await q("savepoint s");
    try {
      const r = await q(sql, params);
      await q("release savepoint s");
      return { ok: true, row: (r.rows[0] ?? {}) as Record<string, unknown> };
    } catch (e) {
      await q("rollback to savepoint s");
      const err = e as { message: string; detail?: string };
      return { ok: false, why: err.message, detail: err.detail ?? "" };
    }
  }
  const as = async (who: string) => {
    await q("reset role");
    await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: who, role: "authenticated" })]);
    await q("set local role authenticated");
  };
  const owner = () => q("reset role");
  const unitRow = async (id: string) =>
    (await q("select status, warehouse_id from public.ops_stock_items where id = $1", [id])).rows[0] as { status: string; warehouse_id: string };
  const receipt = async (id: string) =>
    (await q("select * from public.warehouse_receipts where id = $1", [id])).rows[0] as Record<string, unknown>;
  const lineRow = (item: string, outcome: string) => ({ unit_code: code(item), outcome, issue_kind: null, note: null });
  const officeReceive = (po: string, line: string, units: unknown[], site: string, time: string | null, key: string) =>
    attempt(
      `select public.office_receive_post($1, $2, $3, null, $4::jsonb, null, $5::uuid, '[]'::jsonb, '[]'::jsonb, $6::uuid, $7::timestamptz) as r`,
      [po, `DO-${po}`, `${po}/do.jpg`, JSON.stringify([{ id: line, received_now: 0, units }]), site, key, time],
    );
  const amend = (id: string, changes: Record<string, unknown>) =>
    attempt("select public.receiving_amend($1::uuid, 'Recount at the dock', $2::jsonb, null) as r", [id, JSON.stringify(changes)]);

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    await q("set local session_replication_role = replica");
    for (const [id, name, role, wh] of [
      [OP, OP_NAME, "operation", null],
      [OP2, `IT op two ${HEX}`, "operation", null],
      [WAREHOUSE_USER, `IT nets login ${HEX}`, "warehouse", WH],
    ] as const) {
      const email = `it-0601-${id}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q(
        "insert into app_users (id, email, name, role, status, is_person, warehouse_id) values ($1, $2, $3, $4, 'active', true, $5)",
        [id, email, name, role, wh],
      );
    }
    await q("insert into suppliers (id, name, kind, slug) values ($1, $2, (select enum_range(null::supplier_kind))[1], $3)", [SUPPLIER, `IT supplier ${HEX}`, `it-sup1-${HEX}`]);
    await q("insert into warehouses (id, name) values ($1, $2), ($3, $4)", [WH, `IT Klang ${HEX}`, SHOWROOM, `IT Showroom ${HEX}`]);
    await q("insert into stock_operating_parties (id, code, name, kind) values ($1, $2, $3, 'warehouse_operator')", [NETS, `it_nets_${HEX}`, NETS_NAME]);
    await q("insert into warehouse_site_profiles (site_id, operating_party_id) values ($1, $2)", [WH, NETS]);
    for (const [po, line, wh] of [[PO, LINE, WH], [PO2, LINE2, SHOWROOM], [PO3, LINE3, WH]] as const) {
      await q("insert into purchase_orders (id, supplier_id, warehouse_id, status, placed_at) values ($1, $2, $3, 'open', now() - interval '3 days')", [po, SUPPLIER, wh]);
      await q("insert into purchase_order_lines (id, po_id, sku, qty, received_qty, identity_mode) values ($1, $2, $3, $4, 0, 'exact_unit')", [line, po, SKU, po === PO ? 3 : 1]);
    }
    for (const [id, po, line, wh] of [
      ...U.map((id) => [id, PO, LINE, WH] as const),
      [U2, PO2, LINE2, SHOWROOM] as const,
      [U3, PO3, LINE3, WH] as const,
    ]) {
      await q(
        "insert into ops_stock_items (id, unit_code, sku, warehouse_id, status, po_no, po_line_id, identity_scope, source_ref) values ($1, $2, $3, $4, 'incoming', $5, $6, 'unit', 'po_mint')",
        [id, code(id), SKU, wh, po, line],
      );
    }
    await q("set local session_replication_role = origin");
  });
  afterAll(async () => {
    await q("reset role").catch(() => {});
    await q("rollback").catch(() => {});
    await db.end();
  });

  it("any active Operation staff member posts an Office receipt; its arrival time and the partner company are recorded", async () => {
    await as(OP);
    const arrived = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const r = await officeReceive(
      PO, LINE,
      [lineRow(U[0]!, "received"), lineRow(U[1]!, "received"), lineRow(U[2]!, "not_received")],
      WH, arrived, uid("e1"),
    );
    expect(r.ok, r.ok ? "" : r.why).toBe(true);
    const out = rowOf<{ receipt_id: string; grn_no: string }>(r);
    grn1 = out.receipt_id;
    await owner();
    const rec = await receipt(grn1);
    expect(rec.status).toBe("posted");
    expect(rec.posted_authority).toBe("operation_staff");
    expect(new Date(rec.goods_received_time as string).toISOString()).toBe(arrived);
    expect(rec.received_by_kind).toBe("company");
    expect(rec.received_by_party_id).toBe(NETS);
    expect(rec.received_by_name).toBe(NETS_NAME);
    expect(rec.revision).toBe(0);
    expect((await unitRow(U[0]!)).status).toBe("free");
    expect((await unitRow(U[2]!)).status).toBe("incoming");
  });

  it("the Warehouse role may not post, and a future arrival is refused", async () => {
    await as(WAREHOUSE_USER);
    const refused = await officeReceive(PO2, LINE2, [lineRow(U2, "received")], SHOWROOM, null, uid("e2"));
    expect(refused.ok).toBe(false);
    await as(OP);
    const future = await officeReceive(
      PO2, LINE2, [lineRow(U2, "received")], SHOWROOM,
      new Date(Date.now() + 60 * 60 * 1000).toISOString(), uid("e3"),
    );
    expect(future.ok).toBe(false);
    expect((future as { detail: string }).detail).toBe("received_date_future");
  });

  it("at a Carres-run Site the receiver is the Carres staff member who saved", async () => {
    await as(OP);
    const r = await officeReceive(PO2, LINE2, [lineRow(U2, "received")], SHOWROOM, null, uid("e4"));
    expect(r.ok, r.ok ? "" : r.why).toBe(true);
    const id = rowOf<{ receipt_id: string }>(r).receipt_id;
    await owner();
    const rec = await receipt(id);
    expect(rec.received_by_kind).toBe("staff");
    expect(rec.received_by_user_id).toBe(OP);
    expect(rec.received_by_name).toBe(OP_NAME);
    // Nothing stated → the arrival time is now, never left blank.
    expect(rec.goods_received_time).not.toBeNull();
  });

  it("the form shows the receiver before saving — the same rule, for the signed-in saver", async () => {
    await as(OP);
    const partner = await attempt("select public.receiving_receiver_preview($1::uuid) as r", [WH]);
    expect(partner.ok, partner.ok ? "" : partner.why).toBe(true);
    expect(rowOf<{ kind: string; name: string }>(partner)).toMatchObject({ kind: "company", name: NETS_NAME });
    const own = await attempt("select public.receiving_receiver_preview($1::uuid) as r", [SHOWROOM]);
    expect(rowOf<{ kind: string; name: string }>(own)).toMatchObject({ kind: "staff", name: OP_NAME });
    await as(WAREHOUSE_USER);
    const refused = await attempt("select public.receiving_receiver_preview($1::uuid) as r", [WH]);
    expect(refused.ok).toBe(false);
  });

  it("the Warehouse count carries its arrival time; any Operation staff member checks it in", async () => {
    await as(WAREHOUSE_USER);
    const arrived = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const sub = await attempt(
      `select public.warehouse_submit_receipt($1, $2, $3, null, $4::jsonb, null, '[]'::jsonb, '[]'::jsonb, $5::timestamptz) as r`,
      [PO3, `DO-${PO3}`, `${PO3}/do.jpg`, JSON.stringify([{ id: LINE3, received_now: 0, units: [lineRow(U3, "received")] }]), arrived],
    );
    expect(sub.ok, sub.ok ? "" : sub.why).toBe(true);
    const id = rowOf<{ id: string }>(sub).id;
    await as(OP2);
    const posted = await attempt("select public.warehouse_receipt_check_in($1::uuid, null) as r", [id]);
    expect(posted.ok, posted.ok ? "" : posted.why).toBe(true);
    await owner();
    const rec = await receipt(id);
    expect(new Date(rec.goods_received_time as string).toISOString()).toBe(arrived);
    expect(rec.posted_authority).toBe("operation_staff");
    expect(rec.received_by_name).toBe(NETS_NAME);
  });

  it("an amendment must state the version it starts from", async () => {
    await as(OP);
    const r = await amend(grn1, { do_number: `DO-FIX-${HEX}` });
    expect(r.ok).toBe(false);
    expect((r as { detail: string }).detail).toBe("revision_required");
  });

  it("the person names each Unit both ways; Received Qty is counted from the named outcomes", async () => {
    await as(OP);
    const r = await amend(grn1, {
      based_on_revision: 0,
      units: [
        { stock_item_id: U[2], outcome: "received" },
        { stock_item_id: U[1], outcome: "not_received" },
      ],
    });
    expect(r.ok, r.ok ? "" : r.why).toBe(true);
    await owner();
    expect((await unitRow(U[2]!)).status).toBe("free");
    expect((await unitRow(U[2]!)).warehouse_id).toBe(WH);
    expect((await unitRow(U[1]!)).status).toBe("incoming");
    expect((await unitRow(U[0]!)).status).toBe("free");
    const rec = await receipt(grn1);
    expect(rec.revision).toBe(1);
    const lines = rec.lines as Array<{ received_now: number; units: Array<{ stock_item_id: string; outcome: string }> }>;
    expect(lines[0]!.received_now).toBe(2);
    expect(lines[0]!.units.find((u) => u.stock_item_id === U[1])!.outcome).toBe("not_received");
    expect(lines[0]!.units.find((u) => u.stock_item_id === U[2])!.outcome).toBe("received");
    const results = (await q("select stock_item_id, outcome from receiving_unit_results where receipt_id = $1 order by stock_item_id", [grn1])).rows;
    expect(results).toEqual([
      { stock_item_id: U[0], outcome: "received" },
      { stock_item_id: U[1], outcome: "not_received" },
      { stock_item_id: U[2], outcome: "received" },
    ]);
    expect(Number((await q("select received_qty from purchase_order_lines where id = $1", [LINE])).rows[0]!.received_qty)).toBe(2);
    const ev = (await q("select payload from receiving_events where receipt_id = $1 and event = 'amended'", [grn1])).rows[0]!.payload as { before: { units: unknown[] }; after: { units: unknown[] } };
    expect(ev.before.units).toHaveLength(2);
    expect(ev.after.units).toHaveLength(2);
  });

  it("a save based on an older version is refused whole: first save wins", async () => {
    await as(OP2);
    const r = await amend(grn1, { based_on_revision: 0, do_number: `DO-LATE-${HEX}` });
    expect(r.ok).toBe(false);
    expect((r as { why: string }).why).toBe("Someone changed this GRN. Check it again.");
    await owner();
    expect((await receipt(grn1)).do_number).toBe(`DO-${PO}`);
  });

  it("an exact-unit line refuses a bare quantity edit — the system never picks a Unit", async () => {
    await as(OP);
    const r = await amend(grn1, { based_on_revision: 1, lines: [{ id: LINE, received_now: 3 }] });
    expect(r.ok).toBe(false);
    expect((r as { detail: string }).detail).toBe("exact_unit_line_needs_units");
  });

  it("each locked Unit refuses by name and nothing is saved; a DO No correction still passes", async () => {
    await owner();
    await q("update ops_stock_items set status = 'reserved', reserved_ref = 'SO2609-0001' where id = $1", [U[0]]);
    const claim = (await q(
      "insert into supplier_claims (po_id, po_line_id, supplier_id, sku, product_category, claim_type, qty, photos) values ($1, $2, $3, $4, 'other', 'other', 1, '[\"x.jpg\"]'::jsonb) returning id, claim_no",
      [PO, LINE, SUPPLIER, SKU],
    )).rows[0] as { id: string; claim_no: string };
    await q("update ops_stock_items set hold_claim_id = $2 where id = $1", [U[2], claim.id]);
    await as(OP);
    const r = await amend(grn1, {
      based_on_revision: 1,
      do_number: `DO-FIX-${HEX}`,
      units: [
        { stock_item_id: U[0], outcome: "not_received" },
        { stock_item_id: U[2], outcome: "not_received" },
      ],
    });
    expect(r.ok).toBe(false);
    expect((r as { detail: string }).detail).toBe("units_locked");
    expect((r as { why: string }).why).toContain(`${code(U[0]!)} cannot change. Reserved for SO2609-0001`);
    expect((r as { why: string }).why).toContain(`${code(U[2]!)} cannot change. On ${claim.claim_no}`);
    await owner();
    expect((await receipt(grn1)).do_number).toBe(`DO-${PO}`);
    expect((await unitRow(U[0]!)).status).toBe("reserved");

    await as(OP);
    const doOnly = await amend(grn1, { based_on_revision: 1, do_number: `DO-FIX-${HEX}` });
    expect(doOnly.ok, doOnly.ok ? "" : doOnly.why).toBe(true);
    await owner();
    expect((await receipt(grn1)).do_number).toBe(`DO-FIX-${HEX}`);
    expect((await receipt(grn1)).revision).toBe(2);
  });

  it("moving Goods arrived at refuses on a locked Unit; the arrival time is corrected as a time point", async () => {
    await as(OP);
    const moved = await amend(grn1, { based_on_revision: 2, actual_site_id: SHOWROOM });
    expect(moved.ok).toBe(false);
    expect((moved as { detail: string }).detail).toBe("units_locked");
    await owner();
    expect((await unitRow(U[0]!)).warehouse_id).toBe(WH);

    await as(OP);
    const at = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    const timed = await amend(grn1, { based_on_revision: 2, goods_received_time: at });
    expect(timed.ok, timed.ok ? "" : timed.why).toBe(true);
    await owner();
    expect(new Date((await receipt(grn1)).goods_received_time as string).toISOString()).toBe(at);
  });
});

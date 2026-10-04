import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";

/**
 * Approved target, Purchasing MASTER §7.3 (2026-10-04).
 * This is deliberately a separate acceptance run: the current production SQL
 * still implements Warehouse submit → Operation check-in and fails this target.
 * No production connection, real account, upload or migration is used here.
 * Set CARRES_RECEIVING_TARGET_DATABASE_URL to an isolated local migration replay.
 * Without it, these cases are SKIPPED, not proof of automatic confirmation.
 * Stable-key retries, concurrency, report correction and issue-goods coverage
 * must be added with the reviewed confirmation contract before release.
 */
const databaseUrl = process.env.CARRES_RECEIVING_TARGET_DATABASE_URL ?? "";
const local = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(databaseUrl);
const run = Date.now() % 100000;
const hex = run.toString(16).padStart(5, "0");
const uid = (tail: string) => `ffffffe6-0000-4000-8000-${hex}${tail.padStart(7, "0")}`;
const person = uid("1");
const group = uid("2");
const disabled = uid("3");
const supplier = uid("10");
const site = uid("20");
const otherSite = uid("21");
const company = uid("30");
const line = uid("40");
const po = `PO-WCT-${hex}`;
const sku = `WCT-${hex}`;
const unitIds = [uid("51"), uid("52")];
const codes = [`U8${run}-101-001`, `U8${run}-102-001`];
const doPath = `${po}/signed-do.jpg`;
const arrived = new Date(Date.now() - 60 * 60 * 1000).toISOString();
const lines = [{ id: line, received_now: 0, units: [
  { unit_code: codes[0], outcome: "received", issue_kind: null, note: null },
  { unit_code: codes[1], outcome: "not_received", issue_kind: null, note: null },
] }];

describe.skipIf(!databaseUrl)("authorised Warehouse final receipt (approved target, real PostgreSQL)", () => {
  let db: pg.Client | undefined;
  const q = (sql: string, params: unknown[] = []) => db!.query(sql, params);
  const as = async (actor: string) => {
    await q("reset role");
    await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: actor, role: "authenticated" })]);
    await q("set local role authenticated");
  };
  const submit = async (source = po, path: string | null = doPath, counts: unknown = lines) => {
    await q("savepoint request");
    try {
      const result = await q(
        "select public.warehouse_submit_receipt($1, $2, $3, 'Physical report', $4::jsonb, null, '[]'::jsonb, '[]'::jsonb, $5::timestamptz) as result",
        [source, `DO-${hex}`, path, JSON.stringify(counts), arrived],
      );
      await q("release savepoint request");
      return { ok: true as const, result: result.rows[0]!.result as { id: string; status: string } };
    } catch (error) {
      await q("rollback to savepoint request");
      return { ok: false as const, reason: (error as Error).message };
    }
  };
  const receipt = async (id: string) => {
    await q("reset role");
    return (await q("select * from warehouse_receipts where id = $1", [id])).rows[0]!;
  };
  const expectVisibleReport = async (id: string) => {
    await as(person);
    const reports = (await q("select public.warehouse_my_receipts() as reports")).rows[0]!.reports as { id: string }[];
    expect(reports.some((report) => report.id === id)).toBe(true);
  };

  beforeAll(async () => {
    if (!local) throw new Error("CARRES_RECEIVING_TARGET_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: databaseUrl });
    await db.connect();
    await q("begin");
    await q("set local session_replication_role = replica");
    for (const [id, isPerson, status] of [[person, true, "active"], [group, false, "active"], [disabled, true, "disabled"]] as const) {
      const email = `warehouse-target-${id}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status, is_person, warehouse_id) values ($1, $2, 'Warehouse test actor', 'warehouse', $3, $4, $5)", [id, email, status, isPerson, site]);
    }
    await q("insert into suppliers (id, name, kind, slug) values ($1, 'Warehouse target supplier', (select enum_range(null::supplier_kind))[1], $2)", [supplier, `wct-${hex}`]);
    await q("insert into warehouses (id, name) values ($1, 'Warehouse target Site'), ($2, 'Other target Site')", [site, otherSite]);
    await q("insert into stock_operating_parties (id, code, name, kind) values ($1, $2, 'Warehouse target company', 'warehouse_operator')", [company, `wct_${hex}`]);
    await q("insert into warehouse_site_profiles (site_id, operating_party_id) values ($1, $2)", [site, company]);
    await q("insert into purchase_orders (id, supplier_id, warehouse_id, status, placed_at) values ($1, $2, $3, 'open', now() - interval '3 days')", [po, supplier, site]);
    await q("insert into purchase_order_lines (id, po_id, sku, qty, received_qty, identity_mode) values ($1, $2, $3, 2, 0, 'exact_unit')", [line, po, sku]);
    for (let i = 0; i < unitIds.length; i++) {
      await q("insert into ops_stock_items (id, unit_code, sku, warehouse_id, status, po_no, po_line_id, identity_scope, source_ref) values ($1, $2, $3, $4, 'incoming', $5, $6, 'unit', 'po_mint')", [unitIds[i], codes[i], sku, site, po, line]);
    }
    await q("insert into storage.objects (id, bucket_id, name, owner) values ($1, 'delivery-orders', $2, $3)", [uid("60"), doPath, person]);
    await q("set local session_replication_role = origin");
  });
  beforeEach(async () => { await q("savepoint test_case"); await as(person); });
  afterEach(async () => { await q("reset role"); await q("rollback to savepoint test_case"); });
  afterAll(async () => {
    if (!db) return;
    await q("reset role").catch(() => {});
    await q("rollback").catch(() => {});
    await db.end();
  });

  it("final confirmation posts a numbered GRN, accepts only the received Unit and keeps missing goods outstanding", async () => {
    const answer = await submit();
    expect(answer.ok, !answer.ok ? answer.reason : "").toBe(true);
    if (!answer.ok) return;
    const row = await receipt(answer.result.id);
    expect(row.status).toBe("posted");
    expect(row.grn_no).toMatch(/^GRN-/);
    expect(row.posted_by).toBe(person);
    expect(row.received_by_party_id).toBe(company);
    expect(new Date(row.goods_received_time).toISOString()).toBe(arrived);
    const units = (await q("select id, status, warehouse_id from ops_stock_items where id = any($1::uuid[]) order by id", [unitIds])).rows;
    expect(units).toEqual([
      { id: unitIds[0], status: "free", warehouse_id: site },
      { id: unitIds[1], status: "incoming", warehouse_id: site },
    ]);
    expect((await q("select received_qty from purchase_order_lines where id = $1", [line])).rows[0]!.received_qty).toBe(1);
  });

  it.each([["shared company login", group], ["disabled individual", disabled]])("refuses confirmation by a %s", async (_label, actor) => {
    await as(actor);
    expect((await submit()).ok).toBe(false);
    await q("reset role");
    expect((await q("select count(*)::int as n from warehouse_receipts where submitted_by = $1", [actor])).rows[0]!.n).toBe(0);
  });

  it.each([
    ["missing delivery-note evidence", po, null, lines],
    ["unknown source", `PO-NOT-FOUND-${hex}`, doPath, lines],
    ["unidentified Unit", po, doPath, [{ ...lines[0], units: [{ unit_code: "UNKNOWN-UNIT", outcome: "received" }] }]],
    ["all expected goods missing", po, doPath, [{ ...lines[0], units: codes.map((unit_code) => ({ unit_code, outcome: "not_received", issue_kind: null, note: null })) }]],
  ])("preserves the physical report without a GRN when blocked by %s", async (_label, source, path, counts) => {
    const answer = await submit(source as string, path as string | null, counts);
    expect(answer.ok, !answer.ok ? answer.reason : "").toBe(true);
    if (!answer.ok) return;
    const row = await receipt(answer.result.id);
    expect(row).toBeDefined();
    expect(row.status).not.toBe("posted");
    expect(row.grn_no).toBeNull();
    expect((await q("select count(*)::int as n from ops_stock_items where id = any($1::uuid[]) and status <> 'incoming'", [unitIds])).rows[0]!.n).toBe(0);
    await expectVisibleReport(answer.result.id);
  });

  it("preserves an out-of-scope source report without receiving that other Site's stock", async () => {
    await q("reset role");
    await q("update purchase_orders set warehouse_id = $1 where id = $2", [otherSite, po]);
    await as(person);
    const answer = await submit();
    expect(answer.ok, !answer.ok ? answer.reason : "").toBe(true);
    if (!answer.ok) return;
    const row = await receipt(answer.result.id);
    expect(row.warehouse_id).toBe(site);
    expect(row.status).not.toBe("posted");
    expect(row.grn_no).toBeNull();
    expect((await q("select count(*)::int as n from ops_stock_items where id = any($1::uuid[]) and status <> 'incoming'", [unitIds])).rows[0]!.n).toBe(0);
    await expectVisibleReport(answer.result.id);
  });
});

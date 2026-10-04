import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";

/**
 * Approved target, Purchasing MASTER §7.3 (2026-10-04).
 * This is deliberately a separate acceptance run: production still implements
 * Warehouse submit → Operation check-in. A chat-only SQL draft is tested locally.
 * No production connection, real account, upload or migration is used here.
 * Set CARRES_RECEIVING_TARGET_DATABASE_URL to an isolated local migration replay.
 * Without it, these cases are SKIPPED, not proof of automatic confirmation.
 * Concurrent sessions and non-PO source coverage remain required before release.
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
const destination = uid("31");
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
  const request = async (sql: string, params: unknown[]) => {
    await q("savepoint request");
    try {
      const result = await q(sql, params);
      await q("release savepoint request");
      return { ok: true as const, result: result.rows[0]!.result as { id: string; status: string; grn_no: string | null; revision: number; blockers: { code: string }[] } };
    } catch (error) {
      await q("rollback to savepoint request");
      return { ok: false as const, reason: (error as Error).message };
    }
  };
  const submit = (source = po, path: string | null = doPath, counts: unknown = lines) => request(
    "select public.warehouse_submit_receipt($1, $2, $3, 'Physical report', $4::jsonb, null, '[]'::jsonb, '[]'::jsonb, $5::timestamptz) as result",
    [source, `DO-${hex}`, path, JSON.stringify(counts), arrived],
  );
  const report = (over: Record<string, unknown> = {}) => ({
    po_id: po, actual_site_id: site, do_number: `DO-${hex}`, do_file_path: doPath,
    note: "Physical report", lines, goods_received_time: arrived,
    arrival_evidence: [], extra_lines: [], ...over,
  });
  const confirm = (body = report(), key = uid("90"), receiptId: string | null = null, revision: number | null = null) => request(
    "select public.warehouse_confirm_receipt($1::jsonb,$2::uuid,$3::uuid,$4::integer) as result",
    [JSON.stringify(body), key, receiptId, revision],
  );
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
    // No unrelated default destination: this source explicitly uses its own Site.
    await q("insert into purchasing_destinations (id, name, warehouse_id, active) values ($1, 'Warehouse target destination', $2, true)", [destination, site]);
    await q("insert into purchase_orders (id, supplier_id, warehouse_id, destination_id, status, placed_at) values ($1, $2, $3, $4, 'open', now() - interval '3 days')", [po, supplier, site, destination]);
    await q("insert into purchase_order_lines (id, po_id, sku, qty, received_qty, identity_mode, destination_id) values ($1, $2, $3, 2, 0, 'exact_unit', null)", [line, po, sku]);
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
    expect(row.status, JSON.stringify(row.validation_blockers ?? [])).toBe("posted");
    expect(row.grn_no).toMatch(/^GRN-/);
    expect(row.posted_by).toBe(person);
    expect(row.posted_authority).toBe("warehouse_confirmation");
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
    await q("update purchasing_destinations set warehouse_id = $1 where id = $2", [otherSite, destination]);
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

  it("retries the caller-held save key without a second GRN, Unit result or stock receipt", async () => {
    const first = await confirm();
    const retry = await confirm();
    expect(first.ok && retry.ok).toBe(true);
    if (!first.ok || !retry.ok) return;
    expect(first.result.status, JSON.stringify(first.result.blockers)).toBe("posted");
    expect(retry.result.id).toBe(first.result.id);
    expect(retry.result.grn_no).toBe(first.result.grn_no);
    await q("reset role");
    expect((await q("select count(*)::int n from warehouse_receipts where po_id=$1", [po])).rows[0]!.n).toBe(1);
    expect((await q("select count(*)::int n from receiving_unit_results where receipt_id=$1", [first.result.id])).rows[0]!.n).toBe(2);
    expect((await q("select received_qty from purchase_order_lines where id=$1", [line])).rows[0]!.received_qty).toBe(1);
  });

  it("retains a duplicate delivery-note report with an exact blocker and no second posting", async () => {
    const first = await confirm();
    const duplicate = await confirm(report(), uid("91"));
    expect(first.ok && duplicate.ok).toBe(true);
    if (!first.ok || !duplicate.ok) return;
    expect(first.result.status).toBe("posted");
    expect(duplicate.result.status).toBe("draft");
    expect(duplicate.result.blockers).toEqual([expect.objectContaining({ code: "duplicate_receipt" })]);
    const row = await receipt(duplicate.result.id);
    expect(row.grn_no).toBeNull();
    expect((await q("select received_qty from purchase_order_lines where id=$1", [line])).rows[0]!.received_qty).toBe(1);
    await expectVisibleReport(duplicate.result.id);
  });

  it("corrects the same blocked session, preserves its original evidence in history, then posts once", async () => {
    const first = await confirm(report({ do_file_path: null }));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.result.blockers).toEqual([expect.objectContaining({ code: "do_file_required" })]);
    const corrected = await confirm(report(), uid("90"), first.result.id, 0);
    expect(corrected.ok).toBe(true);
    if (!corrected.ok) return;
    expect(corrected.result.status, JSON.stringify(corrected.result.blockers)).toBe("posted");
    expect(corrected.result.id).toBe(first.result.id);
    expect(corrected.result.revision).toBe(1);
    await q("reset role");
    const history = (await q("select event,payload from receiving_events where receipt_id=$1", [first.result.id])).rows;
    expect(history.find((r) => r.event === "submitted")!.payload.report.do_file_path).toBeNull();
    expect(history.find((r) => r.event === "resubmitted")!.payload.report.do_file_path).toBe(doPath);
    expect(history.filter((r) => r.event === "posted")).toHaveLength(1);
  });

  it("refuses a stale report correction without overwriting the newer physical report", async () => {
    const first = await confirm(report({ do_file_path: null }));
    if (!first.ok) throw new Error(first.reason);
    const newer = await confirm(report({ do_file_path: null, note: "New dock evidence" }), uid("90"), first.result.id, 0);
    expect(newer.ok).toBe(true);
    const stale = await confirm(report(), uid("90"), first.result.id, 0);
    expect(stale.ok).toBe(false);
    const row = await receipt(first.result.id);
    expect(row.raw_report.note).toBe("New dock evidence");
    expect(row.revision).toBe(1);
    expect(row.grn_no).toBeNull();
  });

  it("cannot rewrite a posted receipt through the confirmation door", async () => {
    const first = await confirm();
    if (!first.ok) throw new Error(first.reason);
    expect(first.result.status).toBe("posted");
    expect((await confirm(report({ note: "Changed after posting" }), uid("90"), first.result.id, 0)).ok).toBe(false);
    expect((await receipt(first.result.id)).raw_report.note).toBe("Physical report");
  });

  it.each([
    ["foreign evidence path", { do_file_path: "OTHER-PO/secret.jpg" }, "receipt_evidence_not_available"],
    ["unknown physical date", { goods_received_time: null, goods_received_at: null }, "received_date_required"],
    ["other actual Site", { actual_site_id: otherSite }, "actual_site_not_authorised"],
  ] as const)("retains %s without promoting raw evidence to signed receipt fields", async (_label, over, code) => {
    const answer = await confirm(report(over));
    if (!answer.ok) throw new Error(answer.reason);
    expect(answer.result.blockers).toEqual([expect.objectContaining({ code })]);
    const row = await receipt(answer.result.id);
    expect(row.status).toBe("draft");
    expect(row.do_file_path).toBeNull();
    expect(row.goods_received_at).toBeNull();
    expect(row.raw_report).toMatchObject(over);
  });

  it("puts physically damaged goods on hold and links their exact receipt Claim", async () => {
    const damaged = [{ ...lines[0], damaged_photos: [doPath], units: [
      { unit_code: codes[0], outcome: "received_with_issue", issue_kind: "damaged", note: "Dock damage" },
      { unit_code: codes[1], outcome: "not_received", issue_kind: null, note: null },
    ] }];
    const answer = await confirm(report({ lines: damaged }));
    if (!answer.ok) throw new Error(answer.reason);
    expect(answer.result.status, JSON.stringify(answer.result.blockers)).toBe("posted");
    await q("reset role");
    const stock = (await q("select status,hold_claim_id from ops_stock_items where id=$1", [unitIds[0]])).rows[0]!;
    expect(stock.status).toBe("on_hold");
    const claim = (await q("select warehouse_receipt_id,po_id,qty from supplier_claims where id=$1", [stock.hold_claim_id])).rows[0]!;
    expect(claim).toMatchObject({ warehouse_receipt_id: answer.result.id, po_id: po, qty: 1 });
    expect((await q("select received_qty from purchase_order_lines where id=$1", [line])).rows[0]!.received_qty).toBe(0);
  });

  it("does not grant direct stock posting, Operation check-in or amendment authority to Warehouse", async () => {
    for (const sql of [
      "select public._receiving_post_stock($1, 'x', 'DO-123', '[]'::jsonb, null) as result",
      "select public.operation_receive_po_with_do($1, 'x', 'DO-123', '[]'::jsonb, null) as result",
    ]) expect((await request(sql, [po])).ok).toBe(false);
    expect((await request("select public._receiving_post_session($1::uuid,null) as result", [uid("99")])).ok).toBe(false);
    expect((await request("select public.warehouse_receipt_check_in($1::uuid,null) as result", [uid("99")])).ok).toBe(false);
    const context = (await q("select public.receiving_actor_context() as context")).rows[0]!.context;
    expect(context.allowed).toBe(false);
    expect(context.may_amend).toBe(false);
  });
});

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";

/**
 * Approved target, Purchasing MASTER §7.3 (2026-10-04).
 * This is deliberately a separate acceptance run: production still implements
 * Warehouse submit → Operation check-in. A chat-only SQL draft is tested locally.
 * No production connection, real account, upload or migration is used here.
 * Set CARRES_RECEIVING_TARGET_DATABASE_URL to an isolated local migration replay.
 * Without it, these cases are SKIPPED, not proof of automatic confirmation.
 * Concurrent sessions have a separate local-only suite; non-PO coverage remains required.
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
  const confirm = (body: Record<string, unknown> = report(), key = uid("90"), receiptId: string | null = null, revision: number | null = null) => request(
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

  const setupArrival = async (targetSite = site) => {
    await q("reset role");
    const sourceId = uid("110");
    const path = `${sourceId}/signed-handover.jpg`;
    await q("insert into arrival_sources(id,source_no,kind,from_site_id,to_site_id,party_id,expected_date,reason,created_by) values($1,$2,'transfer',$3,$4,$5,current_date,'Local receipt test',$6)",
      [sourceId, `TRF-WCT-${hex}`, targetSite === otherSite ? site : otherSite, targetSite, company, person]);
    await q("update ops_stock_items set warehouse_id=$1,status='free',holder_party_id=$2 where id=any($3::uuid[])", [otherSite,company,unitIds]);
    await q("insert into arrival_source_units(source_id,stock_item_id,status_before,holder_before) values($1,$2,'free',$3),($1,$4,'free',$3)", [sourceId,unitIds[0],company,unitIds[1]]);
    await q("insert into storage.objects(id,bucket_id,name,owner) values($1,'arrival-proofs',$2,$3)", [uid("111"),path,person]);
    await as(person);
    return { arrival_source_id: sourceId, actual_site_id: site,
      goods_received_time: arrived, do_number: `HANDOVER-${hex}`, do_file_path: path,
      handover_person: "Local delivery person", arrival_units: [
        { stock_item_id: unitIds[0], outcome: "received" },
        { stock_item_id: unitIds[1], outcome: "not_received" },
      ] };
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
  afterEach(async () => { await q("rollback to savepoint test_case"); await q("reset role"); });
  afterAll(async () => {
    if (!db) return;
    await q("reset role").catch(() => {});
    await q("rollback").catch(() => {});
    await db.end();
  });

  it("pages more than 200 reports at a tied timestamp without hiding old blockers or another Site", async () => {
    await q("reset role");
    await q("insert into warehouse_receipts(warehouse_id,submitted_from,status,submitted_by,lines,goods_received_at,save_key,raw_report,submitted_at,validation_blockers) select $1,'warehouse','draft',$2,'[]'::jsonb,null,gen_random_uuid(),'{}'::jsonb,'2026-10-01T00:00:00Z'::timestamptz,'[{\"code\":\"receipt_evidence_not_available\"}]'::jsonb from generate_series(1,205)", [site,person]);
    await q("insert into warehouse_receipts(warehouse_id,submitted_from,status,submitted_by,lines,goods_received_at,save_key,raw_report) values($1,'warehouse','draft',$2,'[]'::jsonb,null,gen_random_uuid(),'{}'::jsonb)", [otherSite,person]);
    await as(person);
    const first = (await q("select warehouse_receipts_page(null,null,200) as result")).rows[0]!.result as {id:string;submitted_at:string;blockers:unknown[]}[];
    expect(first).toHaveLength(200);
    const last = first[first.length-1]!;
    const second = (await q("select warehouse_receipts_page($1,$2,200) as result", [last.submitted_at,last.id])).rows[0]!.result as typeof first;
    expect(second).toHaveLength(5);
    expect(new Set([...first,...second].map(row=>row.id)).size).toBe(205);
    expect(second.every(row=>row.blockers.length===1)).toBe(true);
    const end = second[second.length-1]!;
    expect((await q("select warehouse_receipts_page($1,$2,200) as result", [end.submitted_at,end.id])).rows[0]!.result).toEqual([]);
    expect((await request("select warehouse_receipts_page(null,$1,200) as result", [end.id])).ok).toBe(false);
    expect((await request("select warehouse_receipts_page(null,null,201) as result", [])).ok).toBe(false);
  });

  it.each([group,disabled])("refuses saved-report history to a shared or inactive actor %s", async (actor) => {
    await as(actor);
    expect((await request("select warehouse_receipts_page(null,null,200) as result", [])).ok).toBe(false);
    expect((await request("select warehouse_my_receipts() as result", [])).ok).toBe(false);
  });

  it("lists only this Site's open arrival Units and removes only physically posted Units", async () => {
    const body = await setupArrival();
    const arrivals = async () => (await q("select warehouse_incoming_arrivals() as result")).rows[0]!.result;
    const before = await arrivals();
    expect(before).toContainEqual(expect.objectContaining({ id: body.arrival_source_id, source_no: `TRF-WCT-${hex}`,
      units: expect.arrayContaining(unitIds.map((id) => expect.objectContaining({ id }))) }));
    expect(JSON.stringify(before)).not.toContain("supplier_id");
    const posted = await confirm(body);
    expect(posted.ok && posted.result.status).toBe("posted");
    const after = await arrivals();
    expect(after.find((row: { id: string }) => row.id === body.arrival_source_id).units.map((u: { id: string }) => u.id)).toEqual([unitIds[1]]);
    await q("reset role");
    await q("update arrival_sources set cancelled_at=now(),cancel_reason='Local cancelled source' where id=$1", [body.arrival_source_id]);
    await as(person);
    expect((await arrivals()).some((row: { id: string }) => row.id === body.arrival_source_id)).toBe(false);
  });

  it("does not list another Site's arrival source", async () => {
    const body = await setupArrival(otherSite);
    const rows = (await q("select warehouse_incoming_arrivals() as result")).rows[0]!.result;
    expect(rows.some((row: { id: string }) => row.id === body.arrival_source_id)).toBe(false);
  });

  it.each([group, disabled])("refuses arrival reads from a shared or inactive Warehouse account %s", async (actor) => {
    const body = await setupArrival();
    await as(actor);
    const result = await request("select warehouse_incoming_arrivals() as result", []);
    expect(result.ok).toBe(false);
    expect((await q("select warehouse_arrival_proof_allowed($1,true) allowed", [body.arrival_source_id])).rows[0]!.allowed).toBe(false);
    const upload = await request("insert into storage.objects(id,bucket_id,name,owner) values($1,'arrival-proofs',$2,$3) returning name as result", [uid("125"), `${body.arrival_source_id}/${actor}/blocked.jpg`, actor]);
    expect(upload.ok).toBe(false);
  });

  it("admits proof upload only for the individual's own Site and own path", async () => {
    const body = await setupArrival();
    const source = body.arrival_source_id;
    expect((await q("select warehouse_arrival_proof_allowed($1,true) allowed", [source])).rows[0]!.allowed).toBe(true);
    const ownPath = `${source}/${person}/physical.jpg`;
    const own = await request("insert into storage.objects(id,bucket_id,name,owner) values($1,'arrival-proofs',$2,$3) returning name as result", [uid("121"), ownPath, person]);
    expect(own.ok).toBe(true);
    const forged = await request("insert into storage.objects(id,bucket_id,name,owner) values($1,'arrival-proofs',$2,$3) returning name as result", [uid("122"), `${source}/${group}/forged.jpg`, person]);
    expect(forged.ok).toBe(false);
    const malformed = await request("insert into storage.objects(id,bucket_id,name,owner) values($1,'arrival-proofs',$2,$3) returning name as result", [uid("123"), `not-a-source/${person}/bad.jpg`, person]);
    expect(malformed.ok).toBe(false);
    await q("reset role");
    await q("update arrival_sources set cancelled_at=now(),cancel_reason='Local cancelled source' where id=$1", [source]);
    await as(person);
    expect((await q("select warehouse_arrival_proof_allowed($1,true) allowed", [source])).rows[0]!.allowed).toBe(false);
    expect((await q("select name from storage.objects where bucket_id='arrival-proofs' and name=$1", [ownPath])).rows).toHaveLength(1);
    const afterCancel = await request("insert into storage.objects(id,bucket_id,name,owner) values($1,'arrival-proofs',$2,$3) returning name as result", [uid("124"), `${source}/${person}/late.jpg`, person]);
    expect(afterCancel.ok).toBe(false);
  });

  it("refuses another Site's proof even when its source and storage path are known", async () => {
    const body = await setupArrival(otherSite);
    const source = body.arrival_source_id;
    expect((await q("select warehouse_arrival_proof_allowed($1,true) allowed", [source])).rows[0]!.allowed).toBe(false);
    expect((await q("select name from storage.objects where bucket_id='arrival-proofs' and name=$1", [body.do_file_path])).rows).toHaveLength(0);
    const upload = await request("insert into storage.objects(id,bucket_id,name,owner) values($1,'arrival-proofs',$2,$3) returning name as result", [uid("121"), `${source}/${person}/foreign.jpg`, person]);
    expect(upload.ok).toBe(false);
  });

  it("posts a transfer into the same preserved session without changing PO quantities and retries once", async () => {
    const body = await setupArrival();
    const first = await confirm(body);
    if (!first.ok) throw new Error(first.reason);
    expect(first.result.status, JSON.stringify(first.result.blockers)).toBe("posted");
    const again = await confirm(body);
    if (!again.ok) throw new Error(again.reason);
    expect(again.result.id).toBe(first.result.id);
    expect(again.result.grn_no).toBe(first.result.grn_no);
    const row = await receipt(first.result.id);
    expect(row.arrival_source_id).toBe(body.arrival_source_id);
    expect(row.po_id).toBeNull();
    expect(row.posted_authority).toBe("warehouse_confirmation");
    expect(new Date(row.goods_received_time).toISOString()).toBe(arrived);
    const units = (await q("select status,warehouse_id from ops_stock_items where id=any($1::uuid[]) order by id", [unitIds])).rows;
    expect(units).toEqual([{ status: "free", warehouse_id: site }, { status: "free", warehouse_id: otherSite }]);
    expect((await q("select received_qty from purchase_order_lines where id=$1", [line])).rows[0]!.received_qty).toBe(0);
    expect((await q("select count(*)::int n from warehouse_receipts where arrival_source_id=$1", [body.arrival_source_id])).rows[0]!.n).toBe(1);
  });

  it("retains a second arrival report with the same handover note without posting again", async () => {
    const body = await setupArrival();
    const first = await confirm(body);
    if (!first.ok) throw new Error(first.reason);
    expect(first.result.status).toBe("posted");
    const duplicate = await confirm(body, uid("91"));
    if (!duplicate.ok) throw new Error(duplicate.reason);
    expect(duplicate.result.status).toBe("draft");
    expect(duplicate.result.blockers).toEqual([expect.objectContaining({ code: "duplicate_receipt" })]);
    await receipt(first.result.id);
    expect((await q("select count(*)::int n from warehouse_receipts where arrival_source_id=$1 and status='posted'", [body.arrival_source_id])).rows[0]!.n).toBe(1);
    await as(person);
    const own = (await q("select warehouse_my_receipts() reports")).rows[0]!.reports;
    expect(own).toContainEqual(expect.objectContaining({ id: first.result.id, arrival_source_id: body.arrival_source_id, source_no: `TRF-WCT-${hex}` }));
  });

  it.each([
    ["customer-return", "on_hold", "customer_return"],
    ["failed-delivery-return", "on_hold", "customer_return"],
    ["repair-return", "on_hold", "inspection"],
    ["supplier-replacement", "free", null],
  ])("receives %s with its own lineage and physical controls", async (kind, status, holdReason) => {
    const body = await setupArrival();
    await q("reset role");
    const caseId = uid("131");
    const claimId = uid("132");
    const repairId = uid("133");
    const oldUnitId = uid("134");
    if (kind === "customer-return" || kind === "failed-delivery-return") {
      await q("insert into service_cases(id,case_no,customer_name) values($1,$2,'Local return customer')", [caseId, `CASE-WCT-${hex}`]);
      await q("update arrival_sources set kind=$2,case_id=$3 where id=$1", [body.arrival_source_id,kind,caseId]);
    } else if (kind === "repair-return") {
      await q("insert into repair_orders(id,request_id,ro_no,ro_doc_date,supplier_id,pickup_site_id,return_site_id,created_by) values($1,$2,$3,current_date,$4,$5,$6,$7)",
        [repairId,uid("135"),`RO-WCT-${hex}`,supplier,otherSite,site,person]);
      await q("update arrival_sources set kind=$2,repair_order_id=$3 where id=$1", [body.arrival_source_id,kind,repairId]);
    } else {
      await q("insert into supplier_claims(id,po_id,supplier_id,sku,product_category,claim_type,qty,photos) values($1,$2,$3,$4,'other','other',1,$5::jsonb)", [claimId,po,supplier,sku,JSON.stringify([{ path: body.do_file_path }])]);
      await q("insert into ops_stock_items(id,unit_code,sku,warehouse_id,status,hold_reason,held_at,identity_scope,source_ref) values($1,$2,$3,$4,'on_hold','inspection',now(),'unit','po_mint')",
        [oldUnitId,`U8${run}-103-001`,sku,otherSite]);
      await q("update arrival_sources set kind=$2,claim_id=$3 where id=$1", [body.arrival_source_id,kind,claimId]);
      await q("update arrival_source_units set replaces_item_id=$3 where source_id=$1 and stock_item_id=$2", [body.arrival_source_id,unitIds[0],oldUnitId]);
    }
    await as(person);
    const answer = await confirm(body);
    if (!answer.ok) throw new Error(answer.reason);
    expect(answer.result.status,JSON.stringify(answer.result.blockers)).toBe("posted");
    const row = await receipt(answer.result.id);
    expect(row.arrival_source_id).toBe(body.arrival_source_id);
    expect(row.po_id).toBeNull();
    const units = (await q("select id,unit_code,status,hold_reason,warehouse_id,holder_party_id from ops_stock_items where id=any($1::uuid[]) order by id", [unitIds])).rows;
    expect(units[0]).toMatchObject({ id:unitIds[0],unit_code:codes[0],status,hold_reason:holdReason,warehouse_id:site,holder_party_id:company });
    expect(units[1]).toMatchObject({ id:unitIds[1],unit_code:codes[1],status:"free",warehouse_id:otherSite });
    expect((await q("select received_qty from purchase_order_lines where id=$1", [line])).rows[0]!.received_qty).toBe(0);
    const source = (await q("select * from arrival_sources where id=$1", [body.arrival_source_id])).rows[0]!;
    expect(source.kind).toBe(kind);
    if (kind === "repair-return") expect(source.repair_order_id).toBe(repairId);
    if (kind === "customer-return" || kind === "failed-delivery-return") expect(source.case_id).toBe(caseId);
    if (kind === "supplier-replacement") {
      expect(source.claim_id).toBe(claimId);
      expect((await q("select replaces_item_id from arrival_source_units where source_id=$1 and stock_item_id=$2", [source.id,unitIds[0]])).rows[0]!.replaces_item_id).toBe(oldUnitId);
      expect((await q("select status,warehouse_id from ops_stock_items where id=$1", [oldUnitId])).rows[0]).toEqual({status:"on_hold",warehouse_id:otherSite});
      expect((await q("select status from supplier_claims where id=$1", [claimId])).rows[0]!.status).toBe("open");
    }
    await as(person);
    const retry = await confirm(body);
    if (!retry.ok) throw new Error(retry.reason);
    expect(retry.result.id).toBe(row.id);
    expect(retry.result.grn_no).toBe(row.grn_no);
  });

  it("preserves an arrival with a foreign proof path without promoting that path", async () => {
    const body = await setupArrival();
    const answer = await confirm({ ...body, do_file_path: doPath });
    if (!answer.ok) throw new Error(answer.reason);
    expect(answer.result.status).toBe("draft");
    expect(answer.result.blockers).toEqual([expect.objectContaining({ code: "receipt_evidence_not_available" })]);
    const row = await receipt(answer.result.id);
    expect(row.do_file_path).toBeNull();
    expect(row.raw_report.do_file_path).toBe(doPath);
  });

  it("preserves an arrival report with missing proof and corrects that same session", async () => {
    const body = await setupArrival();
    const first = await confirm({ ...body, do_file_path: null });
    if (!first.ok) throw new Error(first.reason);
    expect(first.result.status).toBe("draft");
    expect(first.result.grn_no).toBeNull();
    const corrected = await confirm(body,uid("90"),first.result.id,first.result.revision);
    if (!corrected.ok) throw new Error(corrected.reason);
    expect(corrected.result.status,JSON.stringify(corrected.result.blockers)).toBe("posted");
    expect(corrected.result.id).toBe(first.result.id);
  });

  it("does not receive an arrival source destined for another Site", async () => {
    const body = await setupArrival(otherSite);
    const answer = await confirm(body);
    if (!answer.ok) throw new Error(answer.reason);
    expect(answer.result.status).toBe("draft");
    expect(answer.result.blockers).toEqual([expect.objectContaining({ code: "source_not_available" })]);
    await receipt(answer.result.id);
    expect((await q("select warehouse_id from ops_stock_items where id=$1", [unitIds[0]])).rows[0]!.warehouse_id).toBe(otherSite);
  });

  it("keeps issue goods on hold when Warehouse confirms a transfer", async () => {
    const body = await setupArrival();
    body.arrival_units[0] = { ...body.arrival_units[0]!, outcome: "received_with_issue", issue_kind: "damaged" } as typeof body.arrival_units[number];
    const answer = await confirm(body);
    if (!answer.ok) throw new Error(answer.reason);
    expect(answer.result.status,JSON.stringify(answer.result.blockers)).toBe("posted");
    await receipt(answer.result.id);
    expect((await q("select status from ops_stock_items where id=$1", [unitIds[0]])).rows[0]!.status).toBe("on_hold");
  });

  it("refuses the public Operation arrival posting door to Warehouse", async () => {
    const body = await setupArrival();
    const answer = await request("select receiving_arrival_post($1,'{}'::jsonb) as result", [body.arrival_source_id]);
    expect(answer.ok).toBe(false);
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

  it.each(["received_now", "damaged_qty", "wrong_item_qty"])("preserves an unknown %s without silently converting it to zero", async (missing) => {
    await q("reset role");
    await q("update purchase_order_lines set identity_mode='quantity' where id=$1", [line]);
    await as(person);
    const counts: Record<string, unknown> = { id: line, received_now: 1, damaged_qty: 0, wrong_item_qty: 0 };
    delete counts[missing];
    const answer = await confirm(report({ lines: [counts] }));
    if (!answer.ok) throw new Error(answer.reason);
    expect(answer.result.blockers).toEqual([expect.objectContaining({ code: "receipt_quantity_unknown" })]);
    const row = await receipt(answer.result.id);
    expect(row.status).toBe("draft");
    expect(row.grn_no).toBeNull();
    expect(row.raw_report.lines[0]).not.toHaveProperty(missing);
    expect((await q("select received_qty from purchase_order_lines where id=$1", [line])).rows[0]!.received_qty).toBe(0);
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

  it("identifies the duplicate delivery note even after its first receipt fulfils the PO", async () => {
    const complete = report({ lines: [{ id: line, units: codes.map((unit_code) => ({ unit_code, outcome: "received" })) }] });
    const first = await confirm(complete);
    if (!first.ok) throw new Error(first.reason);
    expect(first.result.status).toBe("posted");
    const duplicate = await confirm(complete, uid("91"));
    if (!duplicate.ok) throw new Error(duplicate.reason);
    expect(duplicate.result.blockers).toEqual([expect.objectContaining({ code: "duplicate_receipt" })]);
    expect(duplicate.result.grn_no).toBeNull();
  });

  it("keeps received consignment goods supplier-owned", async () => {
    await q("reset role");
    await q("update purchase_orders set is_consignment=true where id=$1", [po]);
    await as(person);
    const answer = await confirm();
    if (!answer.ok) throw new Error(answer.reason);
    expect(answer.result.status, JSON.stringify(answer.result.blockers)).toBe("posted");
    await q("reset role");
    const stock = (await q("select status,ownership,warehouse_id from ops_stock_items where id=$1", [unitIds[0]])).rows[0]!;
    expect(stock).toEqual({ status: "free", ownership: "supplier_consignment", warehouse_id: site });
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

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import { repairOrderReturnTarget, klDate, REPAIR_ORDER_TARGET_CALENDAR } from "@carres/shared";

/**
 * 0602 ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN — Repair Orders
 * slice A (Purchasing MASTER §9.7, owner rulings 2026-09-18 / 19 / 20 / 28):
 *
 *   create    exact existing Units only; refused BY NAME when reserved, on a
 *             DO, held, incoming or already on an active RO; the RO mints its
 *             own RO No and its RO Doc Date is the KL business date
 *   issue     a confirmed send in the document-agnostic ledger; moves no stock
 *   receipt   evidenced Supplier receipt starts the 14 Office working day target
 *   reply     the Supplier's own date; never moves the Carres target
 *   consent   only for non-Carres-owned Units; never an Issue gate
 *   cancel    before pickup only; releases the Units
 *   return    Stock's repair-return source REFERENCES the RO's number, with no
 *             Claim and no Case, and its GRN comes back through Receiving
 *
 * Fixtures are written with triggers off inside ONE transaction that is
 * rolled back; every door is then called with triggers ON, signed in.
 *
 *   LC_ALL=en_US.UTF-8 node scripts/dry-run-migrations.mjs --baseline scripts/migration-replay-baseline.json --keep
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- repair-orders-0602
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `fffffff6-0000-4000-8000-${HEX}${tail.padStart(7, "0")}`;

const OP = uid("2");
const OP2 = uid("3");
const DEALER = uid("4");
const SUPPLIER = uid("51");
const OTHER_SUPPLIER = uid("52");
const KLANG = uid("61");
const PARTNER_WH = uid("62");
const CARRIER = uid("71");
const HOLDER = uid("72");
const CLAIM = uid("81");
const U = {
  free: uid("b1"),
  free2: uid("b2"),
  reserved: uid("b3"),
  incoming: uid("b4"),
  held: uid("b5"),
  onClaim: uid("b6"),
  consign: uid("b7"),
  partner: uid("b8"),
  cancelMe: uid("b9"),
  inRepair: uid("ba"),
  rm1: uid("bb"),
  rm2: uid("bc"),
};
const code = (key: keyof typeof U) => `U8${RUN}-${String(Object.keys(U).indexOf(key) + 100)}-001`;
const SKU = `IT-RO-${HEX}`;
const PHOTO = `unit/${U.free}/it-${HEX}.jpg`;
const QUOTE = `repair_quotation/${uid("99")}/it-${HEX}.pdf`;

type Result = { ok: true; row: Record<string, unknown> } | { ok: false; why: string; detail: string };

describe.skipIf(!URL)("Repair Orders slice A (real PostgreSQL, 0602)", () => {
  let db: pg.Client;
  let roId = "";
  let roNo = "";
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
  async function attempt(sql: string, params: unknown[] = []): Promise<Result> {
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
  const unitInput = (id: string, over: Record<string, unknown> = {}) => ({
    stock_item_id: id,
    problem: "damaged",
    problem_note: "Left arm fabric torn at the seam",
    repair_requirement: "Replace the left arm fabric",
    evidence: [],
    ...over,
  });
  const create = (units: unknown[], over: Record<string, unknown> = {}) =>
    attempt("select public.repair_order_create($1::jsonb) as r", [JSON.stringify({
      request_id: crypto.randomUUID(),
      supplier_id: SUPPLIER,
      cost_responsibility: "not_decided",
      pickup_site_id: KLANG,
      return_site_id: KLANG,
      units,
      ...over,
    })]);
  const availability = async (id: string) =>
    (await q("select needs_repair, public.unit_availability(status, needs_repair, hold_reason, condition) a from ops_stock_items where id = $1", [id])).rows[0] as { needs_repair: boolean; a: string };
  const released = async (ro: string, id: string) =>
    (await q("select released_at is not null r from repair_order_units where repair_order_id = $1 and stock_item_id = $2", [ro, id])).rows[0]?.r as boolean;
  const stockRow = async (id: string) =>
    (await q("select status, warehouse_id, holder_party_id from ops_stock_items where id = $1", [id])).rows[0];

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    await q("set local session_replication_role = replica");
    for (const [id, role] of [[OP, "operation"], [OP2, "operation"], [DEALER, "dealer"]] as const) {
      const email = `it-0602-${id.slice(-7)}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status, is_person) values ($1, $2, $3, $4, 'active', true)", [id, email, `IT ${role} ${id.slice(-3)}`, role]);
    }
    for (const [id, name] of [[SUPPLIER, "Hooka"], [OTHER_SUPPLIER, "Nice Future"]] as const) {
      await q("insert into suppliers (id, name, kind, slug) select $1, $2, kind, $3 from suppliers limit 1", [id, `IT ${name} ${HEX}`, `it-ro-${id.slice(-3)}-${HEX}`]).catch(async () => {
        await q("insert into suppliers (id, name, kind, slug) values ($1, $2, (select enum_range(null::supplier_kind))[1], $3)", [id, `IT ${name} ${HEX}`, `it-ro-${id.slice(-3)}-${HEX}`]);
      });
    }
    // FKs are off under replica; the partner row only has to satisfy the kind CHECK.
    await q("insert into warehouses (id, name, kind, owning_partner_id) values ($1, $2, 'own', null), ($3, $4, 'operation_partner', $5)", [KLANG, `IT Klang ${HEX}`, PARTNER_WH, `IT Partner ${HEX}`, uid("63")]);
    await q("insert into stock_operating_parties (id, code, name, kind, active) values ($1, $2, $3, 'delivery_operator', true), ($4, $5, $6, 'warehouse_operator', true)", [CARRIER, `it_carrier_${HEX}`, `IT Carrier ${HEX}`, HOLDER, `it_holder_${HEX}`, `IT Holder ${HEX}`]);
    await q("insert into supplier_claims (id, claim_no, po_id, supplier_id, sku, product_category, claim_type, qty, photos, customer_resolution, customer_resolution_at) values ($1, $2, 'PO-IT', $3, $4, 'other', 'other', 1, $5::jsonb, 'repair', now())", [CLAIM, `CLM-IT-${HEX}`, SUPPLIER, SKU, JSON.stringify([{ path: `claims/${HEX}/a.jpg` }])]);
    const units: [keyof typeof U, Record<string, unknown>][] = [
      ["free", {}], ["free2", {}], ["cancelMe", {}],
      ["reserved", { status: "reserved", reserved_ref: "SO2609-4827" }],
      ["incoming", { status: "incoming" }],
      ["held", { status: "on_hold", hold_reason: "inspection", held_at: new Date().toISOString() }],
      ["onClaim", { status: "on_hold", hold_claim_id: CLAIM, hold_reason: "damaged", held_at: new Date().toISOString() }],
      ["consign", { ownership: "supplier_consignment", supplier: "Hooka" }],
      ["partner", { warehouse_id: PARTNER_WH }],
      ["inRepair", { needs_repair: true }],
      ["rm1", {}],
      ["rm2", {}],
    ];
    for (const [key, over] of units) {
      const row = { id: U[key], unit_code: code(key), sku: SKU, warehouse_id: KLANG, status: "free", ownership: "carres_owned", qty: 1, po_no: "PO260920-1111", ...over };
      const cols = Object.keys(row);
      await q(`insert into ops_stock_items (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")})`, Object.values(row));
    }
    await q("insert into storage.objects (bucket_id, name) values ('issue-evidence', $1), ('issue-evidence', $2)", [PHOTO, QUOTE]);
    await q("insert into purchasing_settings (id) values (1) on conflict (id) do nothing");
    await q("set local session_replication_role = origin");
  });

  afterAll(async () => {
    if (!db) return;
    await q("rollback");
    await db.end();
  });

  it("the governed period is 14 Office working days by default", async () => {
    await owner();
    const row = (await q("select repair_return_working_days d from purchasing_settings where id = 1")).rows[0];
    expect(row.d).toBe(14);
  });

  it("refuses anyone but Operation or Principal", async () => {
    await as(DEALER);
    const r = await create([unitInput(U.free)]);
    expect(r.ok).toBe(false);
    expect((r as { detail: string }).detail).toBe("not_purchasing");
  });

  it("refuses by name a Unit that is reserved, incoming or held, and a partner warehouse", async () => {
    await as(OP);
    const reserved = await create([unitInput(U.reserved)]);
    expect(reserved).toMatchObject({ ok: false, detail: "unit_not_eligible" });
    expect((reserved as { why: string }).why).toContain("Reserved for SO2609-4827");
    const incoming = await create([unitInput(U.incoming)]);
    expect((incoming as { why: string }).why).toContain("Not received");
    const held = await create([unitInput(U.held)]);
    expect((held as { why: string }).why).toContain("Waiting inspection");
    const partner = await create([unitInput(U.partner)], { pickup_site_id: PARTNER_WH });
    expect(partner).toMatchObject({ ok: false, detail: "pickup_site_not_carres" });
    const noUnits = await create([]);
    expect(noUnits).toMatchObject({ ok: false, detail: "no_units" });
  });

  it("creates the RO: it mints RO No at creation, dates it in KL, snapshots the Units and moves no custody", async () => {
    await as(OP);
    const before = await stockRow(U.free);
    const r = await create([
      unitInput(U.free, { evidence: [{ path: PHOTO, kind: "photo", source: "unit" }] }),
      unitInput(U.consign, { problem: "missing_component" }),
    ], { supplier_id: OTHER_SUPPLIER, price: null });
    expect(r.ok).toBe(true);
    const out = (r as unknown as { row: { r: { id: string; ro_no: string } } }).row.r;
    roId = out.id;
    roNo = out.ro_no;
    expect(roNo).toMatch(/^RO-\d{8}-\d{4}$/);
    await owner();
    const ro = (await q("select ro_doc_date::text d, price, cost_responsibility c, supplier_id s from repair_orders where id = $1", [roId])).rows[0];
    expect(ro.d).toBe(klDate(new Date().toISOString()));
    // Missing price stays unknown — never RM0.
    expect(ro.price).toBeNull();
    expect(ro.c).toBe("not_decided");
    // The repair Supplier may differ from the original seller.
    expect(ro.s).toBe(OTHER_SUPPLIER);
    const units = (await q("select unit_code, ownership, problem from repair_order_units where repair_order_id = $1 order by unit_code", [roId])).rows;
    expect(units.map((u) => u.unit_code)).toEqual([code("free"), code("consign")].sort());
    // Custody (status, Site, holder) does not move — the goods are still here.
    expect(await stockRow(U.free)).toEqual(before);
  });

  it("goods sent for repair cannot be promised to a customer: create puts the Unit In repair through the Stock flag door", async () => {
    await owner();
    expect(await availability(U.free)).toEqual({ needs_repair: true, a: "not_available" });
    expect(await availability(U.consign)).toEqual({ needs_repair: true, a: "not_available" });
    const audit = (await q("select count(*)::int n from audit_log where action = 'ops_stock.flag_repair' and ref = $1", [U.free])).rows[0].n;
    expect(audit).toBe(1);
  });

  it("a Unit already In repair outside any RO is refused by name", async () => {
    await as(OP);
    const r = await create([unitInput(U.inRepair)]);
    expect((r as { why: string }).why).toContain("This Unit is in repair");
  });

  it("removing a Unit before Issue releases it; after Issue the door refuses", async () => {
    await as(OP);
    const made = await create([unitInput(U.rm1), unitInput(U.rm2)]);
    const id = (made as unknown as { row: { r: { id: string } } }).row.r.id;
    expect(await attempt("select public.repair_order_remove_unit($1, $2) as r", [id, U.rm1])).toMatchObject({ ok: true });
    await owner();
    expect(await released(id, U.rm1)).toBe(true);
    // Removed before Issue: no longer part of the commission.
    expect((await q("select removed_at is not null r from repair_order_units where repair_order_id = $1 and stock_item_id = $2", [id, U.rm1])).rows[0].r).toBe(true);
    expect(await availability(U.rm1)).toEqual({ needs_repair: false, a: "available" });
    await as(OP);
    // The last Unit cannot be removed — cancel the Repair Order instead.
    expect(await attempt("select public.repair_order_remove_unit($1, $2) as r", [id, U.rm2])).toMatchObject({ ok: false, detail: "last_unit" });
    await attempt("select public.repair_order_issue($1, 'whatsapp', 'x', null) as r", [id]);
    expect(await attempt("select public.repair_order_remove_unit($1, $2) as r", [id, U.rm2])).toMatchObject({ ok: false, detail: "already_issued" });
  });

  it("a Unit already on an active RO is refused by name: Already on {RO No}", async () => {
    await as(OP2);
    const r = await create([unitInput(U.free)]);
    expect(r).toMatchObject({ ok: false, detail: "unit_not_eligible" });
    expect((r as { why: string }).why).toContain(`Already on ${roNo}`);
  });

  it("the Add Units list prints the same refusal words the door refuses with", async () => {
    await as(OP);
    const rows = (await q("select unit_code, refusal from public.repair_order_eligible_units($1, null, $2)", [KLANG, `U8${RUN}`])).rows;
    const by = Object.fromEntries(rows.map((r) => [r.unit_code, r.refusal]));
    expect(by[code("free")]).toBe(`Already on ${roNo}`);
    expect(by[code("reserved")]).toBe("Reserved for SO2609-4827");
    expect(by[code("held")]).toBe("Waiting inspection");
    expect(by[code("free2")]).toBeNull();
    // A partner warehouse's Unit is not offered from this Site at all.
    expect(by[code("partner")]).toBeUndefined();
  });

  it("the same Save twice answers with the first RO, not a second", async () => {
    await as(OP);
    const request_id = crypto.randomUUID();
    const body = { request_id, supplier_id: SUPPLIER, cost_responsibility: "carres_pays", pickup_site_id: KLANG, return_site_id: KLANG, units: [unitInput(U.free2)] };
    const a = await attempt("select public.repair_order_create($1::jsonb) as r", [JSON.stringify(body)]);
    const b = await attempt("select public.repair_order_create($1::jsonb) as r", [JSON.stringify(body)]);
    const first = (a as unknown as { row: { r: { id: string } } }).row.r;
    const second = (b as unknown as { row: { r: { id: string; replayed: boolean } } }).row.r;
    expect(second.id).toBe(first.id);
    expect(second.replayed).toBe(true);
  });

  it("a Claim-origin RO takes the Claim's held Unit and its evidence by reference", async () => {
    await as(OP);
    const r = await create([unitInput(U.onClaim, { evidence: [{ path: `claims/${HEX}/a.jpg`, kind: "photo", source: "claim" }] })], { supplier_claim_id: CLAIM });
    expect(r.ok).toBe(true);
    const foreign = await create([unitInput(U.cancelMe, { evidence: [{ path: "claims/other.jpg", kind: "photo", source: "claim" }] })], { supplier_claim_id: CLAIM });
    expect(foreign.ok).toBe(false);
  });

  it("Supplier receipt before Issue is refused", async () => {
    await as(OP);
    const target = repairOrderReturnTarget(new Date().toISOString());
    const r = await attempt("select public.repair_order_record_supplier_receipt($1, now(), 'whatsapp', 'Hooka group 10:02', $2::date, $3) as r", [roId, target, REPAIR_ORDER_TARGET_CALENDAR]);
    expect(r).toMatchObject({ ok: false, detail: "not_issued" });
  });

  it("Issue records a confirmed send of the current version in document_sends and moves no stock", async () => {
    await as(OP);
    const before = await stockRow(U.free);
    const blank = await attempt("select public.repair_order_issue($1, 'whatsapp', '   ') as r", [roId]);
    expect(blank).toMatchObject({ ok: false, detail: "recipient_required" });
    const r = await attempt("select public.repair_order_issue($1, 'whatsapp', 'Nice Future group', null) as r", [roId]);
    expect(r.ok).toBe(true);
    await owner();
    const sends = (await q("select document_kind, version, recipient, channel, confirmed from document_sends where document_id = $1", [roId])).rows;
    expect(sends).toEqual([{ document_kind: "repair_order", version: 1, recipient: "Nice Future group", channel: "whatsapp", confirmed: true }]);
    // po_sends is untouched: the PO ledger stays the PO's.
    expect((await q("select count(*)::int n from po_sends where po_id = $1", [roNo])).rows[0].n).toBe(0);
    expect(await stockRow(U.free)).toEqual(before);
  });

  it("Issue is not gated by owner consent, price or approval", async () => {
    await owner();
    const consent = (await q("select count(*)::int n from repair_order_owner_consents where repair_order_id = $1", [roId])).rows[0].n;
    expect(consent).toBe(0);
    expect((await q("select price from repair_orders where id = $1", [roId])).rows[0].price).toBeNull();
    expect((await q("select count(*)::int n from document_sends where document_id = $1", [roId])).rows[0].n).toBe(1);
  });

  it("Supplier receipt starts the 14 Office working day target and snapshots the setting and calendar", async () => {
    await as(OP);
    // The whole suite is ONE transaction, so the RO's created_at is the
    // transaction start; the Supplier confirms after that, as in real life.
    const receivedAt = new Date().toISOString();
    const wrong = await attempt("select public.repair_order_record_supplier_receipt($1, $2::timestamptz, 'whatsapp', 'ok', ($2::timestamptz at time zone 'Asia/Kuala_Lumpur')::date + 3, $3) as r", [roId, receivedAt, REPAIR_ORDER_TARGET_CALENDAR]);
    expect(wrong.ok).toBe(false);
    const target = repairOrderReturnTarget(receivedAt);
    const r = await attempt("select public.repair_order_record_supplier_receipt($1, $2::timestamptz, 'whatsapp', 'Nice Future group 10:02', $3::date, $4) as r", [roId, receivedAt, target, REPAIR_ORDER_TARGET_CALENDAR]);
    expect(r.ok).toBe(true);
    await owner();
    const ro = (await q("select return_target_date::text t, return_target_working_days d, return_target_calendar c, supplier_received_version v from repair_orders where id = $1", [roId])).rows[0];
    expect(ro).toEqual({ t: target, d: 14, c: REPAIR_ORDER_TARGET_CALENDAR, v: 1 });
    await as(OP);
    const again = await attempt("select public.repair_order_record_supplier_receipt($1, now(), 'whatsapp', 'again', $2::date, $3) as r", [roId, target, REPAIR_ORDER_TARGET_CALENDAR]);
    expect(again).toMatchObject({ ok: false, detail: "receipt_already_recorded" });
  });

  it("a Supplier reply keeps its own date and never moves the Carres target", async () => {
    await owner();
    const before = (await q("select return_target_date::text t from repair_orders where id = $1", [roId])).rows[0].t;
    await as(OP);
    const noReason = await attempt("select public.repair_order_record_supplier_reply($1, $2::jsonb) as r", [roId, JSON.stringify({ reason: "Because", reference: "x" })]);
    expect(noReason).toMatchObject({ ok: false, detail: "reason_required" });
    const r = await attempt("select public.repair_order_record_supplier_reply($1, $2::jsonb) as r", [roId, JSON.stringify({ expected_return_date: "2026-12-31", reason: "Material unavailable", reference: "Hooka WhatsApp 28 Sep" })]);
    expect(r.ok).toBe(true);
    const noDate = await attempt("select public.repair_order_record_supplier_reply($1, $2::jsonb) as r", [roId, JSON.stringify({ reason: "Production delay", reference: "call" })]);
    expect(noDate.ok).toBe(true);
    await owner();
    expect((await q("select return_target_date::text t from repair_orders where id = $1", [roId])).rows[0].t).toBe(before);
    const replies = (await q("select expected_return_date::text d from repair_order_supplier_replies where repair_order_id = $1 order by recorded_at, id", [roId])).rows;
    expect(replies.map((x) => x.d).sort()).toEqual(["2026-12-31", null].sort());
    const tamper = await attempt("update repair_order_supplier_replies set reason = 'Other' where repair_order_id = $1", [roId]);
    expect(tamper).toMatchObject({ ok: false, detail: "supplier_evidence_append_only" });
  });

  it("the Repair Quotation may be a PDF, recorded once, and only an uploaded one", async () => {
    await owner();
    const mimes = (await q("select allowed_mime_types m from storage.buckets where id = 'issue-evidence'")).rows[0]?.m as string[] | undefined;
    if (mimes) expect(mimes).toContain("application/pdf");
    await as(OP);
    expect(await attempt("select public.repair_order_record_quotation($1, $2) as r", [roId, "unit/x/q.pdf"])).toMatchObject({ ok: false, detail: "quotation_not_uploaded" });
    expect(await attempt("select public.repair_order_record_quotation($1, $2) as r", [roId, QUOTE])).toMatchObject({ ok: true });
    expect(await attempt("select public.repair_order_record_quotation($1, $2) as r", [roId, QUOTE])).toMatchObject({ ok: false, detail: "quotation_already_recorded" });
  });

  it("owner consent is recorded only for non-Carres-owned Units", async () => {
    await as(OP);
    const carres = await attempt("select public.repair_order_record_owner_consent($1, $2::jsonb) as r", [roId, JSON.stringify({ stock_item_ids: [U.free], outcome: "given", evidence: "x" })]);
    expect(carres).toMatchObject({ ok: false, detail: "unit_not_consent_scope" });
    const refused = await attempt("select public.repair_order_record_owner_consent($1, $2::jsonb) as r", [roId, JSON.stringify({ stock_item_ids: [U.consign], outcome: "refused", evidence: "Supplier said no" })]);
    expect(refused.ok).toBe(true);
    const given = await attempt("select public.repair_order_record_owner_consent($1, $2::jsonb) as r", [roId, JSON.stringify({ stock_item_ids: [U.consign], outcome: "given", evidence: "Supplier WhatsApp OK" })]);
    expect(given.ok).toBe(true);
  });

  it("cancel works before pickup and releases the Units", async () => {
    await as(OP);
    const made = await create([unitInput(U.cancelMe)]);
    const id = (made as unknown as { row: { r: { id: string } } }).row.r.id;
    const blank = await attempt("select public.repair_order_cancel($1, ' ') as r", [id]);
    expect(blank).toMatchObject({ ok: false, detail: "reason_required" });
    const r = await attempt("select public.repair_order_cancel($1, 'Supplier cannot repair') as r", [id]);
    expect(r.ok).toBe(true);
    const issue = await attempt("select public.repair_order_issue($1, 'whatsapp', 'x', null) as r", [id]);
    expect(issue).toMatchObject({ ok: false, detail: "ro_cancelled" });
    await owner();
    expect(await released(id, U.cancelMe)).toBe(true);
    expect(await availability(U.cancelMe)).toEqual({ needs_repair: false, a: "available" });
    await as(OP);
    // The Unit is free for a new repair again.
    const again = await create([unitInput(U.cancelMe)]);
    expect(again.ok).toBe(true);
  });

  it("the return leg REFERENCES the RO number with no Claim and no Case, keeps 0490's physical checks, and cancel refuses after pickup", async () => {
    await as(OP);
    const sourceId = crypto.randomUUID();
    const plan = {
      id: sourceId, kind: "repair-return", repair_order_id: roId, claim_id: null, case_id: null,
      from_site_id: KLANG, to_site_id: KLANG, party_id: CARRIER, expected_date: "2026-12-31", collection_date: null,
      unit_ids: [U.free], reason: "Repair pickup",
    };
    const foreign = await attempt("select public.arrival_source_create($1::jsonb) as r", [JSON.stringify({ ...plan, id: crypto.randomUUID(), unit_ids: [U.free2] })]);
    expect(foreign.ok).toBe(false);
    expect((foreign as { why: string }).why).toContain("not on this Repair Order");
    const wrongSite = await attempt("select public.arrival_source_create($1::jsonb) as r", [JSON.stringify({ ...plan, id: crypto.randomUUID(), from_site_id: PARTNER_WH })]);
    expect((wrongSite as { why: string }).why).toContain("recorded origin Site");
    const r = await attempt("select public.arrival_source_create($1::jsonb) as r", [JSON.stringify(plan)]);
    expect(r.ok).toBe(true);
    await owner();
    const source = (await q("select source_no, claim_id, case_id, repair_order_id from arrival_sources where id = $1", [sourceId])).rows[0];
    expect(source).toEqual({ source_no: roNo, claim_id: null, case_id: null, repair_order_id: roId });
    // No second RO number was drawn for the leg.
    expect((await q("select count(*)::int n from formal_document_codes where prefix = 'RO' and document_id = $1", [sourceId])).rows[0].n).toBe(0);

    // A planned pickup blocks cancel: Stock's record goes first.
    await as(OP);
    expect(await attempt("select public.repair_order_cancel($1, 'no') as r", [roId])).toMatchObject({ ok: false, detail: "pickup_planned" });

    // Stock's ONE custody writer records the pickup.
    const handover = await attempt("select public.arrival_source_handover($1, $2::jsonb) as r", [sourceId, JSON.stringify({
      key: crypto.randomUUID(), kind: "collected", unit_ids: [U.free], party_id: CARRIER, person: "Ah Hock",
      evidence: "photo of the loaded lorry", occurred_at: new Date(Date.now() - 30_000).toISOString(),
    })]);
    expect(handover.ok).toBe(true);
    expect((await stockRow(U.free)).status).toBe("transferred");
    expect(await attempt("select public.repair_order_cancel($1, 'no') as r", [roId])).toMatchObject({ ok: false, detail: "already_picked_up" });

    // The return comes back through the one Receiving engine with a GRN.
    await owner();
    const proof = `${sourceId}/${OP}/return.pdf`;
    await q("insert into storage.objects (bucket_id, name) values ('arrival-proofs', $1)", [proof]);
    await as(OP);
    const post = await attempt("select public.receiving_arrival_post($1, $2::jsonb) as r", [sourceId, JSON.stringify({
      key: crypto.randomUUID(), actual_site_id: KLANG, holder_party_id: HOLDER, handover_person: "Hooka driver",
      do_number: `RDO-${HEX}`, do_file_path: proof, goods_received_at: klDate(new Date().toISOString()),
      units: [{ stock_item_id: U.free, outcome: "received" }],
    })]);
    expect(post.ok, (post as { why?: string }).why).toBe(true);
    await owner();
    const grn = (await q("select grn_no from warehouse_receipts where arrival_source_id = $1 and status = 'posted'", [sourceId])).rows[0];
    expect(grn.grn_no).toMatch(/^GRN-/);
    // Repaired goods wait for inspection before they are sold again.
    expect((await stockRow(U.free)).status).toBe("on_hold");
    await owner();
    expect(await released(roId, U.free)).toBe(false);

    // The inspection result is recorded through Stock's own hold door: that
    // ends the repair for this Unit and it is available again.
    await as(OP);
    expect(await attempt("select public.ops_stock_resolve_unit_hold($1, 'back_to_stock', 'Repaired, checked') as r", [U.free])).toMatchObject({ ok: true });
    await owner();
    expect(await released(roId, U.free)).toBe(true);
    expect(await availability(U.free)).toEqual({ needs_repair: false, a: "available" });
    // The Unit on the same RO that has not come back stays In repair.
    expect(await released(roId, U.consign)).toBe(false);
  });

  it("the legacy Claim-only repair-return still mints its own number (existing identities are permanent)", async () => {
    await owner();
    const body = (await q("select pg_get_functiondef('public.arrival_source_create(jsonb)'::regprocedure) d")).rows[0].d as string;
    expect(body).toContain("when v_ro_id is not null then ro.ro_no");
    expect(body).toContain("when v_kind='repair-return' then allocate_formal_document_code('RO',v_id::text)");
  });
});

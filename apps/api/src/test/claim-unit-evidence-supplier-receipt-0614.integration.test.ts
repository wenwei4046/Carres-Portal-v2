import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0614 ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN:
 *
 *   photo     the ONE claim photo writer keeps a Unit on `{path, unit_code}`;
 *             a plain string still files a claim-level photo, unchanged
 *   receipt   `Record supplier receipt` (§9.6): date not future and not before
 *             the Unit's actual pickup, exact Units (partial allowed, each once),
 *             supplier evidence (file or who confirmed and when), recorder.
 *             A Unit Stock has not picked up is refused by name. The door
 *             writes no pickup fact, no custody and not the 0548 column.
 *
 *   LC_ALL=en_US.UTF-8 node scripts/dry-run-migrations.mjs --baseline scripts/migration-replay-baseline.json --keep
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- 0614
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `fffffffd-0000-4000-8000-${HEX}${tail.padStart(7, "0")}`;

const OP = uid("2");
const DEALER = uid("4");
const SUPPLIER = uid("51");
const WH = uid("61");
const PO = `PO-IT13-${HEX}`;
const CLAIM = uid("81");
const PR = uid("91");
const UNIT_A = uid("b1");
const UNIT_B = uid("b2");
const UNIT_C = uid("b3");
const UNIT_ELSEWHERE = uid("b4");
const code = (n: number) => `U13${RUN}-${String(n).padStart(3, "0")}-001`;
const FILE = { path: `purchase_return_receipt/${PR}/it-${HEX}.jpg`, kind: "photo" };

type Result = { ok: true; row: Record<string, unknown> } | { ok: false; why: string; detail: string };

describe.skipIf(!URL)("Claim Unit evidence and Purchase Return supplier receipt (real PostgreSQL, 0614)", () => {
  let db: pg.Client;
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
  const receive = (over: Record<string, unknown> = {}) => {
    const a = { date: "2026-09-10", units: [UNIT_A] as string[], evidence: [FILE] as unknown[], by: null as string | null, at: null as string | null, note: null as string | null, ...over };
    return attempt(
      "select public.purchase_return_record_supplier_receipt($1, $2::date, $3::uuid[], $4::jsonb, $5, $6::timestamptz, $7) as id",
      [PR, a.date, a.units, JSON.stringify(a.evidence), a.by, a.at, a.note],
    );
  };

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    await q("set local session_replication_role = replica");
    for (const [id, role] of [[OP, "operation"], [DEALER, "dealer"]] as const) {
      const email = `it-0614-${id.slice(-7)}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status, is_person) values ($1, $2, $3, $4, 'active', true)", [id, email, `IT ${role}`, role]);
    }
    await q("insert into suppliers (id, name, kind, slug, return_address) values ($1, $2, (select enum_range(null::supplier_kind))[1], $3, 'Lot 9, Muar')", [SUPPLIER, `IT Hooka ${HEX}`, `it-0614-${HEX}`]);
    await q("insert into warehouses (id, name, kind) values ($1, $2, 'own')", [WH, `IT Klang ${HEX}`]);
    await q("insert into purchase_orders (id, supplier_id, warehouse_id) values ($1, $2, $3)", [PO, SUPPLIER, WH]);
    await q(
      `insert into supplier_claims (id, claim_no, po_id, supplier_id, sku, product_category, claim_type, qty, photos)
       values ($1, $2, $3, $4, 'IT-SKU', 'other', 'damaged', 3, '[{"path":"claims/it.jpg"}]'::jsonb)`,
      [CLAIM, `SC-IT13-${HEX}`, PO, SUPPLIER],
    );
    for (const [id, n] of [[UNIT_A, 1], [UNIT_B, 2], [UNIT_C, 3], [UNIT_ELSEWHERE, 4]] as const) {
      await q(
        "insert into ops_stock_items (id, sku, warehouse_id, status, unit_code, hold_claim_id, hold_reason, held_at, identity_scope, qty, po_no) values ($1, 'IT-SKU', $2, 'on_hold', $3, $4, 'damaged', now(), 'unit', 1, $5)",
        [id, WH, code(n), CLAIM, PO],
      );
    }
    await q("insert into purchase_returns (id, pr_no, supplier_claim_id, supplier_id, pr_doc_date) values ($1, $2, $3, $4, '2026-09-01')", [PR, `PR-IT13-${HEX}`, CLAIM, SUPPLIER]);
    // Stock's fact, as its Outbound handover records it: A and B picked up on
    // 5 Sep (Malaysia time), C not picked up. The fixture writes it directly —
    // this door only READS it.
    for (const [id, n, picked] of [[UNIT_A, 1, "2026-09-05T02:00:00Z"], [UNIT_B, 2, "2026-09-05T02:00:00Z"], [UNIT_C, 3, null]] as const) {
      await q(
        "insert into purchase_return_units (purchase_return_id, stock_item_id, unit_code, po_id, return_to, actual_pickup_date, collected_by_name) values ($1, $2, $3, $4, 'Lot 9, Muar', $5, $6)",
        [PR, id, code(n), PO, picked, picked ? "Ah Seng" : null],
      );
    }
    await q("set local session_replication_role = origin");
  });

  afterAll(async () => {
    if (!db) return;
    await q("rollback").catch(() => undefined);
    await db.end();
  });

  it("files a string as a claim-level photo and keeps the Unit on an object", async () => {
    await q("reset role");
    const out = (await q(
      "select public.supplier_claim_photo_entries($1::jsonb, $2) as e",
      [JSON.stringify(["claims/a.jpg", { path: "claims/b.jpg", unit_code: code(1) }, { path: "claims/a.jpg", unit_code: code(2) }, { unit_code: code(3) }, 7]), OP],
    )).rows[0].e as Array<Record<string, unknown>>;
    expect(out.map((e) => [e.path, e.unit_code ?? null])).toEqual([["claims/a.jpg", null], ["claims/b.jpg", code(1)]]);
    expect(out.every((e) => e.by === OP && typeof e.at === "string")).toBe(true);
  });

  it("refuses a caller outside Operation", async () => {
    await as(DEALER);
    const r = await receive();
    expect(r.ok ? "" : r.detail).toBe("forbidden");
  });

  it("refuses a future date, no Units, and missing or foreign evidence", async () => {
    await as(OP);
    expect((await receive({ date: "2099-01-01" })) as Result).toMatchObject({ ok: false, detail: "date_in_future" });
    expect(await receive({ units: [] })).toMatchObject({ ok: false, detail: "units_required", why: "Tick the Units the supplier received" });
    expect(await receive({ evidence: [] })).toMatchObject({ ok: false, detail: "evidence_required", why: "Add the evidence: a file, or who confirmed and when" });
    expect(await receive({ evidence: [{ path: "supplier_claim_reply/x.jpg", kind: "photo" }] })).toMatchObject({ ok: false, detail: "evidence_invalid" });
    expect(await receive({ evidence: [], by: "Mr Tan" })).toMatchObject({ ok: false, detail: "confirmation_incomplete" });
  });

  it("refuses a Unit Stock has not picked up, by name, in the governed words", async () => {
    await as(OP);
    const r = await receive({ units: [UNIT_A, UNIT_C] });
    expect(r).toMatchObject({ ok: false, detail: "not_picked_up", why: `${code(3)}: Not picked up` });
  });

  it("refuses a Unit that is not on this return, and a date before the pickup", async () => {
    await as(OP);
    expect(await receive({ units: [UNIT_ELSEWHERE] })).toMatchObject({ ok: false, detail: "unit_not_on_return", why: `${code(4)}: Not on this return` });
    expect(await receive({ date: "2026-09-04" })).toMatchObject({ ok: false, detail: "before_pickup", why: `${code(1)}: Picked up on 5 Sep 2026` });
  });

  it("records a partial receipt with its evidence and recorder, and moves nothing else", async () => {
    await q("reset role");
    const before = (await q("select stock_item_id, actual_pickup_date, collected_by, collected_by_name, supplier_received_date, evidence from purchase_return_units where purchase_return_id = $1 order by unit_code", [PR])).rows;
    const stock = (await q("select id, status, warehouse_id, updated_at from ops_stock_items where id = any($1) order by id", [[UNIT_A, UNIT_B, UNIT_C]])).rows;
    await as(OP);
    const r = await receive({ date: "2026-09-05" });
    expect(r.ok).toBe(true);
    await q("reset role");
    const receipt = (await q("select received_on::text as d, evidence, confirmed_by, recorded_by from purchase_return_supplier_receipts where id = $1", [r.ok ? r.row.id : null])).rows[0];
    expect(receipt).toEqual({ d: "2026-09-05", evidence: [{ ...FILE, purpose: "supplier_receipt" }], confirmed_by: null, recorded_by: OP });
    const covered = (await q("select u.stock_item_id from purchase_return_supplier_receipt_units ru join purchase_return_units u on u.id = ru.purchase_return_unit_id where ru.receipt_id = $1", [r.ok ? r.row.id : null])).rows;
    expect(covered.map((c) => c.stock_item_id)).toEqual([UNIT_A]);
    expect((await q("select stock_item_id, actual_pickup_date, collected_by, collected_by_name, supplier_received_date, evidence from purchase_return_units where purchase_return_id = $1 order by unit_code", [PR])).rows).toEqual(before);
    expect((await q("select id, status, warehouse_id, updated_at from ops_stock_items where id = any($1) order by id", [[UNIT_A, UNIT_B, UNIT_C]])).rows).toEqual(stock);
  });

  it("receives a Unit once; a later receipt may cover the rest on who confirmed and when", async () => {
    await as(OP);
    expect(await receive({ units: [UNIT_A] })).toMatchObject({ ok: false, detail: "already_received", why: `${code(1)}: Already received 5 Sep 2026` });
    const r = await receive({ units: [UNIT_B], evidence: [], by: "Mr Tan (Hooka store)", at: "2026-09-12T03:00:00+08:00", date: "2026-09-12" });
    expect(r.ok).toBe(true);
  });

  it("is append-only: signed-in callers cannot write either table, and anon cannot reach the door", async () => {
    await as(OP);
    const write = await attempt("insert into purchase_return_supplier_receipts (purchase_return_id, received_on, confirmed_by, confirmed_at, recorded_by) values ($1, '2026-09-10', 'x', now(), $2)", [PR, OP]);
    expect(write.ok).toBe(false);
    const erase = await attempt("delete from purchase_return_supplier_receipt_units");
    expect(erase.ok).toBe(false);
    await q("reset role");
    expect((await q("select has_function_privilege('anon', 'public.purchase_return_record_supplier_receipt(uuid, date, uuid[], jsonb, text, timestamptz, text)', 'execute') as a")).rows[0].a).toBe(false);
  });
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0609 ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN — Purchase
 * Returns creation door (Purchasing MASTER §9.6 "CREATION DOOR — OWNER-APPROVED
 * (Jess, 2026-09-25)"):
 *
 *   decide    `Record what Carres does next` is PO Duty, dated cover or
 *             Operations Superuser only; it cannot leave `Return to supplier`
 *             once a Purchase Return is issued
 *   units     only this claim's held tracked Units are offered; a refused Unit
 *             says why in the same words the door refuses with
 *   issue     the door reads `Return To` from Supplier Master; absent →
 *             `Add the return address of {Supplier}`; a Unit that changed under
 *             the form is refused BY NAME and nothing is issued; issuing moves
 *             no stock
 *   send      `Return document sent to supplier` lands in document_sends as
 *             `purchase_return`
 *   pickup    `Confirmed Pickup` appends an evidenced confirmation and moves the
 *             planned date; a passed date is refused
 *
 *   LC_ALL=en_US.UTF-8 node scripts/dry-run-migrations.mjs --baseline scripts/migration-replay-baseline.json --keep
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- purchase-return-issue-0609
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `fffffff9-0000-4000-8000-${HEX}${tail.padStart(7, "0")}`;

const OP = uid("2");
const DUTY = uid("3");
const SUPER = uid("5");
const DEALER = uid("4");
const SUPPLIER = uid("51");
const BARE_SUPPLIER = uid("52");
const WH = uid("61");
const PO = `PO-IT9-${HEX}`;
const CLAIM = uid("81");
const BARE_CLAIM = uid("82");
const OTHER_CLAIM = uid("83");
const UNIT_A = uid("b1");
const UNIT_B = uid("b2");
const UNIT_FREE = uid("b3");
const UNIT_OTHER = uid("b4");
const UNIT_BARE = uid("b5");
const COUNTED = uid("b6");
const code = (n: number) => `U9${RUN}-${n}-001`;

type Result = { ok: true; row: Record<string, unknown> } | { ok: false; why: string; detail: string };

describe.skipIf(!URL)("Purchase Return creation door (real PostgreSQL, 0609)", () => {
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
  const decide = (claim: string, execution: string) =>
    attempt("select public.supplier_claim_record_carres_execution($1, $2, null) as r", [claim, execution]);
  const seen = async (id: string) => {
    await q("reset role");
    return String((await q("select updated_at::text as t from ops_stock_items where id = $1", [id])).rows[0]?.t);
  };
  const issue = (claim: string, units: Array<Record<string, unknown>>, date: string | null = null) =>
    attempt("select public.purchasing_issue_purchase_return($1, $2::jsonb, $3::date) as id", [claim, JSON.stringify(units), date]);

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    await q("set local session_replication_role = replica");
    for (const [id, role, superuser] of [[OP, "operation", false], [DUTY, "operation", false], [SUPER, "operation", true], [DEALER, "dealer", false]] as const) {
      const email = `it-0609-${id.slice(-7)}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status, is_person, operations_superuser) values ($1, $2, $3, $4, 'active', true, $5)", [id, email, `IT ${role} ${id.slice(-2)}`, role, superuser]);
    }
    const month = (await q("select to_char(timezone('Asia/Kuala_Lumpur', now()), 'YYYY-MM') as m")).rows[0].m as string;
    await q("delete from ops_po_duty_cover where month = $1", [month]);
    await q("insert into ops_po_duty (month, user_id) values ($1, $2) on conflict (month) do update set user_id = excluded.user_id", [month, DUTY]);
    await q("insert into suppliers (id, name, kind, slug, return_address) values ($1, $2, (select enum_range(null::supplier_kind))[1], $3, $4)", [SUPPLIER, `IT Hooka ${HEX}`, `it-pr-${HEX}`, `Lot 9, Jalan IT ${HEX}, Muar`]);
    await q("insert into suppliers (id, name, kind, slug) values ($1, $2, (select enum_range(null::supplier_kind))[1], $3)", [BARE_SUPPLIER, `IT Bare ${HEX}`, `it-pr-bare-${HEX}`]);
    await q("insert into warehouses (id, name, kind) values ($1, $2, 'own')", [WH, `IT Klang ${HEX}`]);
    await q("insert into purchase_orders (id, supplier_id, warehouse_id) values ($1, $2, $3)", [PO, SUPPLIER, WH]);
    for (const [id, no, supplier] of [[CLAIM, `SC-IT9-${HEX}`, SUPPLIER], [BARE_CLAIM, `SC-IT9B-${HEX}`, BARE_SUPPLIER], [OTHER_CLAIM, `SC-IT9C-${HEX}`, SUPPLIER]] as const) {
      await q(
        `insert into supplier_claims (id, claim_no, po_id, supplier_id, sku, product_category, claim_type, qty, photos)
         values ($1, $2, $4, $3, 'IT-SKU', 'other', 'damaged', 2, '[{"path":"claims/it.jpg"}]'::jsonb)`,
        [id, no, supplier, PO],
      );
    }
    const units: Array<[string, string, string, number]> = [
      [UNIT_A, CLAIM, "on_hold", 101], [UNIT_B, CLAIM, "on_hold", 102], [UNIT_FREE, CLAIM, "free", 103],
      [UNIT_OTHER, OTHER_CLAIM, "on_hold", 104], [UNIT_BARE, BARE_CLAIM, "on_hold", 105],
    ];
    for (const [id, claim, status, n] of units) {
      await q(
        "insert into ops_stock_items (id, sku, warehouse_id, status, unit_code, hold_claim_id, hold_reason, held_at, identity_scope, qty, po_no) values ($1, 'IT-SKU', $2, $3, $4, $5, 'damaged', now(), 'unit', 1, $6)",
        [id, WH, status, code(n), claim, PO],
      );
    }
    await q(
      "insert into ops_stock_items (id, sku, warehouse_id, status, hold_claim_id, hold_reason, held_at, identity_scope, qty) values ($1, 'IT-SKU', $2, 'on_hold', $3, 'damaged', now(), 'quantity', 3)",
      [COUNTED, WH, CLAIM],
    );
    await q("set local session_replication_role = origin");
  });

  afterAll(async () => {
    if (!db) return;
    await q("rollback").catch(() => undefined);
    await db.end();
  });

  it("the ledger admits a purchase return and Supplier Master carries a return address", async () => {
    await q("reset role");
    const kinds = (await q("select pg_get_constraintdef(oid) as d from pg_constraint where conname = 'document_sends_document_kind_check'")).rows[0].d as string;
    expect(kinds).toContain("purchase_return");
    expect(kinds).toContain("supplier_claim");
    const col = await q("select 1 from information_schema.columns where table_name = 'suppliers' and column_name = 'return_address'");
    expect(col.rowCount).toBe(1);
  });

  it("`Record what Carres does next` refuses an Operation person who is not PO Duty", async () => {
    await as(OP);
    const r = await decide(CLAIM, "return_to_supplier");
    expect(r.ok ? "" : r.detail).toBe("not_po_duty");
  });

  it("PO Duty and an Operations Superuser may record it", async () => {
    await as(SUPER);
    expect((await decide(BARE_CLAIM, "return_to_supplier")).ok).toBe(true);
    await as(DUTY);
    const r = await decide(CLAIM, "return_to_supplier");
    expect(r.ok).toBe(true);
  });

  it("offers only this claim's held tracked Units and names each refusal", async () => {
    await as(DUTY);
    const rows = (await q("select stock_item_id, unit_code, refusal, pickup_location from public.purchase_return_eligible_units($1)", [CLAIM])).rows as Array<Record<string, string | null>>;
    const byId = new Map(rows.map((r) => [r.stock_item_id, r]));
    expect(byId.get(UNIT_A)?.refusal).toBeNull();
    expect(byId.get(UNIT_A)?.pickup_location).toBe(`IT Klang ${HEX}`);
    expect(byId.get(UNIT_FREE)?.refusal).toBe("Hold released");
    expect(byId.has(UNIT_OTHER)).toBe(false);
    expect(byId.has(COUNTED)).toBe(false);
  });

  it("refuses a claim with no `Return to supplier` decision", async () => {
    await as(DUTY);
    const r = await issue(OTHER_CLAIM, [{ stock_item_id: UNIT_OTHER, seen: await seen(UNIT_OTHER) }]);
    expect(r.ok ? "" : r.detail).toBe("outcome_not_return_to_supplier");
  });

  it("refuses when the supplier has no recorded return address, in the approved words", async () => {
    const token = await seen(UNIT_BARE);
    await as(DUTY);
    const r = await issue(BARE_CLAIM, [{ stock_item_id: UNIT_BARE, seen: token }]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.detail).toBe("return_address_missing");
      expect(r.why).toBe(`Add the return address of IT Bare ${HEX}`);
    }
  });

  it("refuses a Unit that is not this claim's, by name, and issues nothing", async () => {
    const token = await seen(UNIT_OTHER);
    await as(DUTY);
    const r = await issue(CLAIM, [{ stock_item_id: UNIT_A, seen: await seen(UNIT_A) }, { stock_item_id: UNIT_OTHER, seen: token }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.why).toBe(`${code(104)}: Not on this claim`);
    await q("reset role");
    expect((await q("select count(*)::int as n from purchase_returns where supplier_claim_id = $1", [CLAIM])).rows[0].n).toBe(0);
  });

  it("refuses a Unit that changed after the form opened, by name", async () => {
    const stale = "2001-01-01 00:00:00+00";
    await as(DUTY);
    const r = await issue(CLAIM, [{ stock_item_id: UNIT_A, seen: stale }]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.why).toBe(`${code(101)}: Changed since the form opened`);
      expect(r.detail).toBe("unit_changed");
    }
  });

  it("issues the return with Return To from Supplier Master and moves no stock", async () => {
    await q("reset role");
    const before = (await q("select id, status, warehouse_id, updated_at::text as u, hold_claim_id from ops_stock_items where id = any($1) order by id", [[UNIT_A, UNIT_B]])).rows;
    const tokenA = await seen(UNIT_A);
    const tokenB = await seen(UNIT_B);
    await as(DUTY);
    const r = await issue(CLAIM, [
      { stock_item_id: UNIT_A, seen: tokenA, pickup_location: "Bay 3", return_to: "IGNORED BY THE DOOR", category: "Sofa", item: "Kaya", item_spec: "3 seater" },
      { stock_item_id: UNIT_B, seen: tokenB },
    ], "2099-01-05");
    expect(r.ok).toBe(true);
    const id = r.ok ? String(r.row.id) : "";
    await q("reset role");
    const doc = (await q("select pr_no, confirmed_pickup_date::text as d, document_sent_at from purchase_returns where id = $1", [id])).rows[0];
    expect(String(doc.pr_no)).toMatch(/^PR-\d{8}-\d+$/);
    expect(doc.d).toBe("2099-01-05");
    expect(doc.document_sent_at).toBeNull();
    const units = (await q("select unit_code, pickup_location, return_to, category, item, item_spec from purchase_return_units where purchase_return_id = $1 order by unit_code", [id])).rows;
    expect(units.map((u) => u.unit_code)).toEqual([code(101), code(102)]);
    expect(units[0]).toMatchObject({ pickup_location: "Bay 3", return_to: `Lot 9, Jalan IT ${HEX}, Muar`, category: "Sofa", item: "Kaya", item_spec: "3 seater" });
    expect(units[1]).toMatchObject({ pickup_location: `IT Klang ${HEX}`, return_to: `Lot 9, Jalan IT ${HEX}, Muar` });
    const after = (await q("select id, status, warehouse_id, updated_at::text as u, hold_claim_id from ops_stock_items where id = any($1) order by id", [[UNIT_A, UNIT_B]])).rows;
    expect(after).toEqual(before);
  });

  it("refuses the same Unit on a second return, naming the first", async () => {
    await q("reset role");
    const pr = String((await q("select pr_no from purchase_returns where supplier_claim_id = $1", [CLAIM])).rows[0].pr_no);
    const token = await seen(UNIT_A);
    await as(DUTY);
    const r = await issue(CLAIM, [{ stock_item_id: UNIT_A, seen: token }]);
    expect(r.ok ? "" : r.why).toBe(`${code(101)}: Already on ${pr}`);
  });

  it("will not change what Carres does once a return is issued", async () => {
    await as(DUTY);
    const r = await decide(CLAIM, "collect_first");
    expect(r.ok ? "" : r.detail).toBe("purchase_return_issued");
  });

  it("records `Return document sent to supplier` in the shared ledger", async () => {
    await q("reset role");
    const id = String((await q("select id from purchase_returns where supplier_claim_id = $1", [CLAIM])).rows[0].id);
    await as(DEALER);
    expect((await attempt("select public.purchase_return_record_send($1, 'whatsapp', 'Ah Seng', null) as id", [id])).ok).toBe(false);
    await as(OP);
    expect((await attempt("select public.purchase_return_record_send($1, 'pigeon', 'Ah Seng', null) as id", [id])).ok).toBe(false);
    const r = await attempt("select public.purchase_return_record_send($1, 'whatsapp', 'Ah Seng', null) as id", [id]);
    expect(r.ok).toBe(true);
    await q("reset role");
    const send = (await q("select document_kind, version, channel, recipient, sent_by from document_sends where document_id = $1", [id])).rows;
    expect(send).toEqual([{ document_kind: "purchase_return", version: 1, channel: "whatsapp", recipient: "Ah Seng", sent_by: OP }]);
    // The ledger is the fact; the 0548 column is not written.
    expect((await q("select document_sent_at from purchase_returns where id = $1", [id])).rows[0].document_sent_at).toBeNull();
  });

  it("records an evidenced pickup confirmation and moves the planned date; a passed date is refused", async () => {
    await q("reset role");
    const id = String((await q("select id from purchase_returns where supplier_claim_id = $1", [CLAIM])).rows[0].id);
    await as(OP);
    const past = await attempt("select public.purchase_return_record_pickup_confirmation($1, '2001-01-01', 'Ah Seng on WhatsApp') as id", [id]);
    expect(past.ok ? "" : past.detail).toBe("pickup_date_passed");
    const none = await attempt("select public.purchase_return_record_pickup_confirmation($1, '2099-02-01', '  ') as id", [id]);
    expect(none.ok ? "" : none.detail).toBe("evidence_required");
    const r = await attempt("select public.purchase_return_record_pickup_confirmation($1, '2099-02-01', 'Ah Seng on WhatsApp') as id", [id]);
    expect(r.ok).toBe(true);
    await q("reset role");
    expect((await q("select confirmed_pickup_date::text as d from purchase_returns where id = $1", [id])).rows[0].d).toBe("2099-02-01");
    const rows = (await q("select confirmed_pickup_date::text as d, evidence, recorded_by from purchase_return_pickup_confirmations where purchase_return_id = $1", [id])).rows;
    expect(rows).toEqual([{ d: "2099-02-01", evidence: "Ah Seng on WhatsApp", recorded_by: OP }]);
  });

  it("keeps one door, closed to anon, and the new tables read-only", async () => {
    await q("reset role");
    const n = (await q("select count(*)::int as n from pg_proc where proname = 'purchasing_issue_purchase_return'")).rows[0].n;
    expect(n).toBe(1);
    for (const fn of [
      "public.purchasing_issue_purchase_return(uuid, jsonb, date)",
      "public.purchase_return_record_send(uuid, text, text, text)",
      "public.purchase_return_record_pickup_confirmation(uuid, date, text)",
      "public.purchase_return_eligible_units(uuid)",
    ]) {
      expect((await q("select has_function_privilege('anon', $1, 'execute') as a", [fn])).rows[0].a).toBe(false);
    }
    const policies = (await q("select cmd from pg_policies where tablename = 'purchase_return_pickup_confirmations'")).rows.map((r) => r.cmd);
    expect(policies).toEqual(["SELECT"]);
  });
});

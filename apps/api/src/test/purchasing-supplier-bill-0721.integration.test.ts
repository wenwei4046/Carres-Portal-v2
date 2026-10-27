import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0721 §3 ON A REAL POSTGRESQL: Purchasing enters a supplier bill through
 * Finance's own door (Chew, Finance, WhatsApp 2026-10-23, relayed by YH).
 *
 *   - operation saves a bill from a posted GRN and it posts on save (Q8,
 *     Chew 2026-10-26; Houzs), through
 *     supplier_bill_save_draft, the same function Finance uses;
 *   - it may add a freight/service line, not one for a GRN's own goods (Q9);
 *   - operation cannot choose the payables or a goods line's account, enter a
 *     bill with no GRN, confirm Finance's bill, cancel or pay;
 *   - operation changes its own posted bill until a payment is against it: the
 *     posting is reversed and re-posted (Q9; Houzs piLocked + resyncPiAccounting);
 *   - a purchasing bill posts exactly what a Finance bill for the same goods posts.
 *
 * One transaction, rolled back at the end.
 *
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- purchasing-supplier-bill-0721
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `eeeeeeee-0000-4000-8000-${HEX}${tail.padStart(7, "0")}`;
const U = { finance: uid("1"), operation: uid("2"), principal: uid("3") };
const POS = uid("a1");
const POL = uid("b1");
const GRN = uid("c1");
const PO = `IT-PO-0721-${RUN}`;

type Outcome = { ok: true; value: unknown } | { ok: false; code: string; detail: string | null; message: string };

describe.skipIf(!URL)("Purchasing enters a supplier bill (real PostgreSQL, 0721)", { timeout: 60000 }, () => {
  let db: pg.Client;
  let supplierId = "";
  let billDate = "";
  let expense = "";
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
  const actAs = (id: string) =>
    q("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: id, role: "authenticated" })]);
  async function attempt(sql: string, params: unknown[] = []): Promise<Outcome> {
    await q("savepoint s");
    try {
      const r = await q(sql, params);
      await q("release savepoint s");
      return { ok: true, value: r.rows[0] ? Object.values(r.rows[0])[0] : null };
    } catch (e) {
      await q("rollback to savepoint s");
      const err = e as { code?: string; detail?: string; message: string };
      return { ok: false, code: err.code ?? err.message, detail: err.detail ?? null, message: err.message };
    }
  }
  const grnLine = (qty: number, price: number, extra: Record<string, unknown> = {}) =>
    // A chain before 0683 needs the department sent; from 0683 a goods line's
    // department is worked out and the one sent is not read.
    JSON.stringify([{ warehouse_receipt_id: GRN, po_line_id: POL, qty, unit_price: price, department_type: "OFFICE", ...extra }]);
  const saveDraft = (billId: string | null, invoice: string, lines: string, apAccount: string | null = null) =>
    attempt("select public.supplier_bill_save_draft($1, $2, $3, $4::date, $5::jsonb, null, $6) as id",
      [billId, supplierId, invoice, billDate, lines, apAccount]);
  const posting = async (billId: string) =>
    (await q(`select l.account_code, l.debit::text, l.credit::text, l.party_type, l.party_id,
                     l.department_type, l.department_id
                from supplier_bills b join gl_entry_lines l on l.entry_id = b.gl_entry_id
               where b.id = $1 order by l.line_no`, [billId])).rows;

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    await q("update gl_config set go_live_on = coalesce(go_live_on, date '2026-01-01') where id");
    billDate = (await q("select greatest(timezone('Asia/Kuala_Lumpur', now())::date, (select go_live_on from gl_config where id) + 1)::text as d")).rows[0].d;

    await q("insert into org_positions (id, name, band) values ($1, $2, 'executive')", [POS, `IT pb ${RUN}`]);
    const people: Array<[string, string, string | null]> = [
      [U.finance, "finance", POS], [U.operation, "operation", POS], [U.principal, "principal", null],
    ];
    for (const [id, role, position] of people) {
      const email = `it-pb-${role}-${id.slice(-4)}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status, position_id, is_person) values ($1, $2, $3, $4, 'active', $5, true)", [
        id, email, `IT ${role} ${id.slice(-4)}`, role, position,
      ]);
    }
    supplierId = (await q("insert into suppliers (name, kind, slug) values ($1, 'factory_pickup', $2) returning id",
      [`IT bill supplier ${RUN}`, `it-pb-supplier-${RUN}`])).rows[0].id as string;
    const wh = (await q("insert into warehouses (name, kind) values ($1, 'own') returning id", [`IT pb Klang ${RUN}`])).rows[0].id as string;
    expense = (await q(`select a.code from gl_accounts a where a.is_active and not a.is_control and a.kind = 'EXPENSE'
                          and not public.ap_account_is_money(a.code)
                          and not exists (select 1 from gl_accounts c where c.parent_code = a.code)
                        order by a.code limit 1`)).rows[0].code as string;

    // A PO line of 2 at RM 100, received in full on a posted GRN.
    await q("set local session_replication_role = replica");
    await q("insert into purchase_orders (id, supplier_id, warehouse_id, purpose) values ($1, $2, $3, 'ready_stock')", [PO, supplierId, wh]);
    await q("insert into purchase_order_lines (id, po_id, sku, qty, cost, received_qty) values ($1, $2, $3, 2, 100.00, 2)",
      [POL, PO, `IT-SKU-0721-${RUN}`]);
    await q(`insert into warehouse_receipts (id, po_id, warehouse_id, lines, status, posted_at, do_number, do_file_path)
             values ($1, $2, $3, $4::jsonb, 'posted', now(), 'DO-IT-0721', 'it/do.pdf')`,
      [GRN, PO, wh, JSON.stringify([{ id: POL, received_now: 2 }])]);
    await q("set local session_replication_role = origin");
  }, 60000);

  afterAll(async () => {
    if (!db) return;
    await q("rollback").catch(() => undefined);
    await db.end();
  });

  let purchasingBill = "";
  const undo = async (sql: string, params: unknown[]) => {
    await q("savepoint u");
    try { return await attempt(sql, params); } finally { await q("rollback to savepoint u"); }
  };

  // Q8 (Chew, WhatsApp to YH 2026-10-26 12:34; Houzs posts on save).
  it("Purchasing saves a bill from a posted GRN and it posts at once, through Finance's own confirm", async () => {
    await actAs(U.operation);
    const candidates = await attempt("select count(*)::int as n from public.supplier_bill_grn_candidates($1) where receipt_id = $2", [supplierId, GRN]);
    expect(candidates).toEqual({ ok: true, value: 1 });
    const open = await attempt("select open_qty::numeric::text as q from public.supplier_bill_grn_lines($1) where po_line_id = $2", [GRN, POL]);
    expect(open).toEqual({ ok: true, value: "2.00" });

    const saved = await saveDraft(null, `IT-PB-OP-${RUN}`, grnLine(1, 100));
    expect(saved).toEqual({ ok: true, value: expect.any(String) });
    purchasingBill = (saved as { value: string }).value;
    const row = (await q("select status, created_by, total_amount::text as total, gl_entry_id is not null as posted from supplier_bills where id = $1", [purchasingBill])).rows[0];
    expect(row).toEqual({ status: "confirmed", created_by: U.operation, total: "100.00", posted: true });
  });

  it("Purchasing adds a freight line with an account, but not a no-GRN line for the GRN's own goods (Q9, Houzs)", async () => {
    await actAs(U.operation);
    const freight = { account_code: expense, description: "Freight", amount: 30, department_type: "OFFICE" };
    const both = JSON.stringify([...JSON.parse(grnLine(1, 100)), freight]);
    expect(await undo("select public.supplier_bill_save_draft(null, $1, $2, $3::date, $4::jsonb) as id",
      [supplierId, `IT-PB-FR-${RUN}`, billDate, both])).toMatchObject({ ok: true });
    const dup = JSON.stringify([...JSON.parse(grnLine(1, 100)),
      { ...freight, description: "same goods", sku: `it-sku-0721-${RUN}` }]);
    expect(await saveDraft(null, `IT-PB-DUP-${RUN}`, dup))
      .toMatchObject({ ok: false, code: "42501", detail: "unlinked_line_bills_grn_material" });
  });

  it("Purchasing cannot choose the payables or a goods line's account, or enter a bill with no GRN", async () => {
    await actAs(U.operation);
    expect(await saveDraft(null, `IT-PB-AP-${RUN}`, grnLine(1, 100), "2100"))
      .toMatchObject({ ok: false, code: "42501", detail: "not_finance" });
    expect(await saveDraft(null, `IT-PB-AC-${RUN}`, grnLine(1, 100, { account_code: expense })))
      .toMatchObject({ ok: false, code: "42501", detail: "not_finance" });
    expect(await saveDraft(null, `IT-PB-FREE-${RUN}`,
      JSON.stringify([{ account_code: expense, description: "Rent", amount: 50, department_type: "OFFICE" }])))
      .toMatchObject({ ok: false, code: "42501", detail: "purchasing_bills_goods_received" });
  });

  it("Purchasing cannot confirm, change or read Finance's draft, cancel a bill, or pay", async () => {
    await actAs(U.finance);
    const fin = await saveDraft(null, `IT-PB-FINFREE-${RUN}`,
      JSON.stringify([{ account_code: expense, description: "Rent", amount: 10, department_type: "OFFICE" }]));
    expect(fin).toMatchObject({ ok: true });
    const finBill = (fin as { value: string }).value;

    await actAs(U.operation);
    expect(await attempt("select public.supplier_bill_confirm($1)", [finBill])).toMatchObject({ ok: false, code: "42501" });
    expect(await saveDraft(finBill, `IT-PB-FINFREE-${RUN}`, grnLine(1, 100))).toMatchObject({ ok: false, code: "42501", detail: "not_finance" });
    expect(await attempt("select public.purchasing_supplier_bill_draft($1) as d", [finBill])).toEqual({ ok: true, value: null });
    expect(await attempt("select public.supplier_bill_cancel($1, 'IT')", [purchasingBill])).toMatchObject({ ok: false, code: "42501" });
    expect(await attempt(
      `select public.payment_voucher_save_draft(null, 'SUPPLIER_BILLS', $1, 'IT payee', $2::date, $3, '[]'::jsonb,
               jsonb_build_array(jsonb_build_object('bill_id', $4::text, 'amount', 100)), 'BANK_TRANSFER', null, null)`,
      [supplierId, billDate, expense, purchasingBill]))
      .toMatchObject({ ok: false, code: "42501" });
    expect((await q("select status from supplier_bills where id = $1", [finBill])).rows[0].status).toBe("draft");
  });

  it("a purchasing bill posts exactly what a Finance bill for the same goods posts", async () => {
    await actAs(U.finance);
    const financeSaved = await saveDraft(null, `IT-PB-FIN-${RUN}`, grnLine(1, 100));
    expect(financeSaved).toMatchObject({ ok: true });
    const financeBill = (financeSaved as { value: string }).value;
    expect(await attempt("select public.supplier_bill_confirm($1)", [financeBill])).toMatchObject({ ok: true });

    const a = await posting(purchasingBill);
    const b = await posting(financeBill);
    expect(a.length).toBe(2);
    expect(a).toEqual(b);
    expect(a.map((l) => [l.debit, l.credit])).toEqual([["100.00", "0.00"], ["0.00", "100.00"]]);
    expect(a[1]).toMatchObject({ party_type: "SUPPLIER", party_id: supplierId });
  });

  // Q9 (YH 2026-10-26, Houzs): piLocked purchase-invoices.ts:270-284 locks on a
  // payment; resyncPiAccounting accounting.ts:855+ voids and re-posts on an edit.
  it("Purchasing edits its own posted bill: the old posting is reversed, the new one posted, the number kept", async () => {
    await actAs(U.operation);
    const before = (await q("select bill_no, gl_entry_id from supplier_bills where id = $1", [purchasingBill])).rows[0];
    expect(await attempt("select public.purchasing_supplier_bill_draft($1) ->> 'id' as id", [purchasingBill]))
      .toEqual({ ok: true, value: purchasingBill });
    expect(await saveDraft(purchasingBill, `IT-PB-OP-${RUN}`, grnLine(1, 90))).toEqual({ ok: true, value: purchasingBill });
    const after = (await q("select status, bill_no, gl_entry_id, total_amount::text as total from supplier_bills where id = $1", [purchasingBill])).rows[0];
    expect(after).toMatchObject({ status: "confirmed", bill_no: before.bill_no, total: "90.00" });
    expect(after.gl_entry_id).not.toBe(before.gl_entry_id);
    const old = (await q(`select o.reversed, (select sum(debit)::text from gl_entry_lines where entry_id = o.reversed_by) as contra
                            from gl_entries o where o.id = $1`, [before.gl_entry_id])).rows[0];
    expect(old).toEqual({ reversed: true, contra: "100.00" });
    expect((await posting(purchasingBill)).map((l) => [l.debit, l.credit])).toEqual([["90.00", "0.00"], ["0.00", "90.00"]]);
  });

  it("once a payment is against it, Purchasing's bill is locked", async () => {
    await actAs(U.finance);
    await q("set local session_replication_role = replica");
    // A credit note applied (Finance's act; replica: no note row needed for the test).
    await q("insert into supplier_credit_note_applications (note_id, bill_id, amount) values (gen_random_uuid(), $1, 10)",
      [purchasingBill]);
    await q("set local session_replication_role = origin");
    await actAs(U.operation);
    expect(await saveDraft(purchasingBill, `IT-PB-OP-${RUN}`, grnLine(1, 80)))
      .toMatchObject({ ok: false, code: "42501", detail: "bill_locked_paid" });
    expect(await attempt("select public.purchasing_supplier_bill_draft($1) as d", [purchasingBill])).toEqual({ ok: true, value: null });
    expect((await q("select total_amount::text as t from supplier_bills where id = $1", [purchasingBill])).rows[0].t).toBe("90.00");
  });
});

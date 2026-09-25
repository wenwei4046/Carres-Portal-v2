import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0585 ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN (owner rulings
 * 2026-09-24, Purchasing MASTER §§5.6.1, 5.7):
 *
 *   PO windows        11:30 / optional 16:00, editable; a supplier cut-off must
 *                     be EARLIER than the last window
 *   supplier delay    one of eight governed reasons, `Other` needs a note, a new
 *                     date and AT LEAST ONE screenshot; append-only
 *   effective arrival latest evidenced current-version answer → original PO
 *                     Delivery Date → live planning date
 *   day-before check  Supplier DO or evidenced confirmation for the EXACT
 *                     effective arrival and the PO's own Warehouse; append-only
 *
 * Fixtures are written with triggers off (session_replication_role = replica)
 * inside ONE transaction that is rolled back; every door is then called with
 * triggers ON, as a signed-in person.
 *
 *   LC_ALL=en_US.UTF-8 node scripts/dry-run-migrations.mjs --baseline scripts/migration-replay-baseline.json --keep
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- po-windows-delay-evidence
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `ffffffff-0000-4000-8000-${HEX}${tail.padStart(7, "0")}`;

const U = { boss: uid("1"), op: uid("2") };
const SUPPLIER = uid("51");
const WAREHOUSE = uid("61");
const DEST = uid("71");
const OTHER_DEST = uid("72");
const PO = `PO-IT-${HEX}`;
const ORIGINAL = "2026-10-12";

describe.skipIf(!URL)("PO windows, supplier delay evidence and the day-before check (real PostgreSQL, 0585)", () => {
  let db: pg.Client;
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
  async function attempt(sql: string, params: unknown[] = []): Promise<string> {
    await q("savepoint s");
    try {
      await q(sql, params);
      await q("release savepoint s");
      return "ok";
    } catch (e) {
      await q("rollback to savepoint s");
      const err = e as { detail?: string; code?: string; message: string };
      return err.detail && !err.detail.includes(" ") ? err.detail : err.code ?? err.message;
    }
  }
  const as = async (who: string) => {
    await q("reset role");
    await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: who, role: "authenticated" })]);
    await q("set local role authenticated");
  };
  const upload = async (name: string) => {
    await q("reset role");
    await q("insert into storage.objects (bucket_id, name) values ('delivery-orders', $1)", [name]);
  };
  const reply = (body: Record<string, unknown>) =>
    attempt("select public.purchasing_record_supplier_reply($1, $2::jsonb)", [PO, JSON.stringify({
      poVersion: 1, channel: "whatsapp", recipient: "Nice Future group", reportedBy: "Ah Hock",
      reportedAt: new Date(Date.now() - 60_000).toISOString(), ...body,
    })]);
  const confirm = (body: Record<string, unknown>) =>
    attempt("select public.purchasing_record_arrival_confirmation($1, $2::jsonb)", [PO, JSON.stringify({
      poVersion: 1, destinationId: DEST, kind: "supplier_confirmation", channel: "whatsapp",
      recipient: "Nice Future group", reportedBy: "Ah Hock", reportedAt: new Date(Date.now() - 60_000).toISOString(),
      evidence: [`${PO}/confirm.png`], ...body,
    })]);
  const effective = async () =>
    (await q("select to_char(public.purchasing_po_effective_arrival($1), 'YYYY-MM-DD') as d", [PO])).rows[0].d as string;

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    await q("set local session_replication_role = replica");
    for (const [id, role] of [[U.boss, "principal"], [U.op, "operation"]] as const) {
      const email = `it-0585-${role}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status, is_person) values ($1, $2, $3, $4, 'active', true)", [id, email, `IT ${role}`, role]);
    }
    await q("insert into suppliers (id, name, kind, slug) values ($1, $2, (select enum_range(null::supplier_kind))[1], $3)", [SUPPLIER, `IT supplier ${HEX}`, `it-sup-${HEX}`]).catch(async () => {
      await q("insert into suppliers (id, name, kind, slug) select $1, $2, kind, $3 from suppliers limit 1", [SUPPLIER, `IT supplier ${HEX}`, `it-sup-${HEX}`]);
    });
    await q("insert into warehouses (id, name) values ($1, $2)", [WAREHOUSE, `IT wh ${HEX}`]);
    await q("insert into purchasing_destinations (id, name) values ($1, $2), ($3, $4)", [DEST, `IT Klang ${HEX}`, OTHER_DEST, `IT Other ${HEX}`]);
    await q("insert into purchase_orders (id, supplier_id, warehouse_id, destination_id, version, official_delivery_date, eta_date) values ($1, $2, $3, $4, 1, $5, $5)", [PO, SUPPLIER, WAREHOUSE, DEST, ORIGINAL]);
    await q("insert into purchase_order_lines (po_id, sku, qty) values ($1, 'IT-SKU', 4)", [PO]);
    await q("insert into po_sends (po_id, channel, kind, sent_at, po_version, recipient) values ($1, 'whatsapp', 'confirmed_sent', now() - interval '1 day', 1, 'Nice Future group')", [PO]);
    await q("insert into purchasing_settings (id) values (1) on conflict (id) do nothing");
    await q("set local session_replication_role = origin");
  });

  afterAll(async () => {
    if (!db) return;
    await q("rollback");
    await db.end();
  });

  it("PO windows start at 11:30 and 16:00, and refuse an out-of-order second window", async () => {
    const row = (await q("select po_window_first::text f, po_window_second::text s, po_window_second_enabled e from purchasing_settings where id = 1")).rows[0];
    expect(row).toEqual({ f: "11:30:00", s: "16:00:00", e: true });
    await as(U.boss);
    expect(await attempt("select public.purchasing_set_po_windows('11:00', '10:00', true)")).toBe("po_windows_out_of_order");
    expect(await attempt("select public.purchasing_set_po_windows('11:00', null, true)")).toBe("po_window_second_required");
    expect(await attempt("select public.purchasing_set_po_windows('11:00', '15:30', false)")).toBe("ok");
    await q("reset role");
    expect((await q("select po_window_first::text f, po_window_second_enabled e from purchasing_settings where id = 1")).rows[0]).toEqual({ f: "11:00:00", e: false });
  });

  it("a supplier cut-off must be earlier than the last enabled window", async () => {
    await as(U.boss);
    // Second window is off (previous case): the last window is 11:00.
    expect(await attempt("select public.purchasing_set_supplier_po_cutoff($1, '12:00')", [SUPPLIER])).toBe("supplier_cutoff_not_earlier");
    expect(await attempt("select public.purchasing_set_supplier_po_cutoff($1, '10:00')", [SUPPLIER])).toBe("ok");
    await q("reset role");
    expect((await q("select po_cutoff::text c from purchasing_supplier_settings where supplier_id = $1", [SUPPLIER])).rows[0].c).toBe("10:00:00");
  });

  it("the effective arrival starts as the original PO Delivery Date", async () => {
    expect(await effective()).toBe(ORIGINAL);
  });

  it("a delay needs a governed reason, a note for Other, and at least one screenshot", async () => {
    await upload(`${PO}/delay-1.png`);
    await upload(`${PO}/delay-2.png`);
    await as(U.boss);
    expect(await reply({ supplierDate: "2026-10-20", reason: "Production Delay", screenshots: [`${PO}/delay-1.png`] })).toBe("reason_required");
    expect(await reply({ supplierDate: "2026-10-20", reason: "Other", screenshots: [`${PO}/delay-1.png`] })).toBe("other_note_required");
    // 0560's law: whitespace is not an answer — a tab or a newline is blank.
    expect(await reply({ supplierDate: "2026-10-20", reason: "Other", remarks: " \t\n", screenshots: [`${PO}/delay-1.png`] })).toBe("other_note_required");
    expect(await reply({ supplierDate: "2026-10-20", reason: "Transport delay", recipient: "\t", screenshots: [`${PO}/delay-1.png`] })).toBe("reply_evidence_required");
    expect(await reply({ supplierDate: "2026-10-20", reason: "Transport delay", screenshots: [] })).toBe("screenshot_required");
    // The existing form's single evidence file is a screenshot too — but it must be uploaded for THIS PO.
    expect(await reply({ supplierDate: "2026-10-20", reason: "Transport delay", evidence: `${PO}/missing.png` })).toBe("screenshot_not_found");
    expect(await reply({ supplierDate: "2026-10-20", reason: "Transport delay", screenshots: [`${PO}/missing.png`] })).toBe("screenshot_not_found");
    expect(await reply({ supplierDate: "2026-10-20", reason: "Transport delay", poVersion: 2, screenshots: [`${PO}/delay-1.png`] })).toBe("stale_po_version");
    expect(await reply({ supplierDate: "2026-10-20", reason: "Transport delay", evidence: `${PO}/delay-1.png`, screenshots: [`${PO}/delay-2.png`, `${PO}/delay-1.png`] })).toBe("ok");
    await q("reset role");
    const answer = (await q("select id, answer, reason, to_char(new_date,'YYYY-MM-DD') d, evidence from po_supplier_promises where po_id = $1", [PO])).rows;
    expect(answer).toEqual([expect.objectContaining({ answer: "delayed", reason: "Transport delay", d: "2026-10-20", evidence: `${PO}/delay-1.png` })]);
    const shots = (await q("select path from po_supplier_answer_screenshots where answer_id = $1 order by path", [answer[0].id])).rows.map((r) => r.path);
    expect(shots).toEqual([`${PO}/delay-1.png`, `${PO}/delay-2.png`]);
  });

  it("the delay becomes the effective arrival; the original PO Delivery Date never moves", async () => {
    expect(await effective()).toBe("2026-10-20");
    expect((await q("select to_char(official_delivery_date,'YYYY-MM-DD') d from purchase_orders where id = $1", [PO])).rows[0].d).toBe(ORIGINAL);
  });

  it("answers and screenshots are append-only for every role", async () => {
    await q("reset role");
    expect(await attempt("update po_supplier_promises set reason = 'Other' where po_id = $1", [PO])).toBe("supplier_evidence_append_only");
    expect(await attempt("delete from po_supplier_promises where po_id = $1", [PO])).toBe("supplier_evidence_append_only");
    expect(await attempt("delete from po_supplier_answer_screenshots where path like $1", [`${PO}/%`])).toBe("supplier_evidence_append_only");
  });

  it("any active Operation person records supplier evidence (owner ruling 2026-09-25, 0587) — the gate opens; the evidence rules still hold", async () => {
    await as(U.op);
    /* Past the actor gate, refused on the evidence — so nothing is written here. */
    expect(await reply({ supplierDate: "2026-10-21", reason: "Transport delay", screenshots: [`${PO}/nobody-uploaded-this.png`] })).toBe("screenshot_not_found");
    expect(await confirm({ forDate: "2026-10-20", destinationId: OTHER_DEST })).toBe("wrong_warehouse");
  });

  it("the day-before confirmation must name the exact effective arrival and the PO's own Warehouse", async () => {
    await upload(`${PO}/confirm.png`);
    await as(U.boss);
    expect(await confirm({ forDate: ORIGINAL })).toBe("arrival_date_mismatch");
    expect(await confirm({ forDate: "2026-10-20", destinationId: OTHER_DEST })).toBe("wrong_warehouse");
    expect(await confirm({ forDate: "2026-10-20", poVersion: 2 })).toBe("stale_po_version");
    expect(await confirm({ forDate: "2026-10-20", evidence: [] })).toBe("evidence_required");
    expect(await confirm({ forDate: "2026-10-20", kind: "supplier_do" })).toBe("23514");
    expect(await confirm({ forDate: "2026-10-20", channel: null })).toBe("23514");
    expect(await confirm({ forDate: "2026-10-20", recipient: " \t " })).toBe("23514");
    expect(await confirm({ forDate: "2026-10-20", kind: "supplier_do", supplierDoNo: "\n" })).toBe("23514");
    expect(await confirm({ forDate: "2026-10-20" })).toBe("ok");
    expect(await confirm({ forDate: "2026-10-20", kind: "supplier_do", supplierDoNo: "NF-DO-8812", evidence: [`${PO}/confirm.png`] })).toBe("ok");
    await q("reset role");
    const rows = (await q("select kind, supplier_do_no, to_char(for_date,'YYYY-MM-DD') d, destination_id from po_arrival_confirmations where po_id = $1 order by recorded_at", [PO])).rows;
    expect(rows).toEqual([
      { kind: "supplier_confirmation", supplier_do_no: null, d: "2026-10-20", destination_id: DEST },
      { kind: "supplier_do", supplier_do_no: "NF-DO-8812", d: "2026-10-20", destination_id: DEST },
    ]);
  });

  it("a confirmation is evidence, not a receipt: it never moves the effective arrival or received quantity", async () => {
    expect(await effective()).toBe("2026-10-20");
    expect((await q("select received_qty from purchase_order_lines where po_id = $1", [PO])).rows[0].received_qty).toBe(0);
    expect(await attempt("delete from po_arrival_confirmations where po_id = $1", [PO])).toBe("supplier_evidence_append_only");
  });
});

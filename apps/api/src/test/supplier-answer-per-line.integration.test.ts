import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0587 ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN (Purchasing
 * MASTER §5.7, owner rulings 2026-09-25):
 *
 *   per line          `confirmed` · `new_date` · `split` batches; the server
 *                     classifies every date against the original PO Delivery Date
 *   split             batches must total the line's still-to-deliver quantity
 *   delay             one of the eight reasons; `Other` needs a note; ≥1 file
 *   Supplier DO       number + file written ONCE onto the PO; the day-before
 *                     evidence recorded for every expected arrival
 *   who               any active Operation person may record; the recorder is
 *                     the caller, PO Duty / cover are stored beside it
 *   arrivals          one expected arrival per line/batch; the PO-level
 *                     effective arrival is the LAST of them
 *
 * Fixtures are written with triggers off inside ONE transaction that is
 * rolled back; every door is then called with triggers ON, as a signed-in
 * person.
 *
 *   LC_ALL=en_US.UTF-8 node scripts/dry-run-migrations.mjs --baseline scripts/migration-replay-baseline.json --keep
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- supplier-answer-per-line
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `ffffffff-0000-4000-8000-${HEX}${tail.padStart(7, "0")}`;

const U = { boss: uid("1"), op: uid("2"), op2: uid("3"), finance: uid("4") };
const SUPPLIER = uid("51");
const WAREHOUSE = uid("61");
const DEST = uid("71");
const L1 = uid("81");
const L2 = uid("82");
const PO = `PO-LN-${HEX}`;
const ORIGINAL = "2026-10-12";

describe.skipIf(!URL)("the supplier's answer per goods line (real PostgreSQL, 0587)", () => {
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
    await q("insert into storage.objects (bucket_id, name) values ('delivery-orders', $1) on conflict do nothing", [name]);
  };
  const answer = (body: Record<string, unknown>) =>
    attempt("select public.purchasing_record_supplier_answers($1, $2::jsonb)", [PO, JSON.stringify({
      poVersion: 1, channel: "whatsapp", recipient: "Nice Future group", reportedBy: "Ah Hock",
      reportedAt: new Date(Date.now() - 60_000).toISOString(), evidence: [`${PO}/answer.png`], lines: [], ...body,
    })]);
  const arrivals = async () =>
    (await q("select po_line_id, qty, to_char(arrival, 'YYYY-MM-DD') as arrival, answer, reason from public.purchasing_po_expected_arrivals($1) order by po_line_id, arrival", [PO])).rows;
  const effective = async () =>
    (await q("select to_char(public.purchasing_po_effective_arrival($1), 'YYYY-MM-DD') as d", [PO])).rows[0].d as string;

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    await q("set local session_replication_role = replica");
    for (const [id, role] of [[U.boss, "principal"], [U.op, "operation"], [U.op2, "operation"], [U.finance, "finance"]] as const) {
      const email = `it-0587-${role}-${id.slice(-3)}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status, is_person) values ($1, $2, $3, $4, 'active', true)", [id, email, `IT ${role} ${id.slice(-1)}`, role]);
    }
    await q("insert into suppliers (id, name, kind, slug) values ($1, $2, (select enum_range(null::supplier_kind))[1], $3)", [SUPPLIER, `IT supplier ${HEX}`, `it-sup-${HEX}`]).catch(async () => {
      await q("insert into suppliers (id, name, kind, slug) select $1, $2, kind, $3 from suppliers limit 1", [SUPPLIER, `IT supplier ${HEX}`, `it-sup-${HEX}`]);
    });
    await q("insert into warehouses (id, name) values ($1, $2)", [WAREHOUSE, `IT wh ${HEX}`]);
    await q("insert into purchasing_destinations (id, name) values ($1, $2)", [DEST, `IT Klang ${HEX}`]);
    await q("insert into purchase_orders (id, supplier_id, warehouse_id, destination_id, version, official_delivery_date, eta_date) values ($1, $2, $3, $4, 1, $5, $5)", [PO, SUPPLIER, WAREHOUSE, DEST, ORIGINAL]);
    await q("insert into purchase_order_lines (id, po_id, sku, qty) values ($1, $2, 'IT-SKU-A', 4), ($3, $2, 'IT-SKU-B', 2)", [L1, PO, L2]);
    await q("insert into po_sends (po_id, channel, kind, sent_at, po_version, recipient) values ($1, 'whatsapp', 'confirmed_sent', now() - interval '1 day', 1, 'Nice Future group')", [PO]);
    await q("set local session_replication_role = origin");
    await upload(`${PO}/answer.png`);
    await upload(`${PO}/do.pdf`);
  });

  afterAll(async () => {
    if (!db) return;
    await q("rollback");
    await db.end();
  });

  it("every open line starts as one expected arrival on the original PO Delivery Date", async () => {
    expect(await arrivals()).toEqual([
      { po_line_id: L1, qty: 4, arrival: ORIGINAL, answer: null, reason: null },
      { po_line_id: L2, qty: 2, arrival: ORIGINAL, answer: null, reason: null },
    ]);
    expect(await effective()).toBe(ORIGINAL);
  });

  it("an answer needs evidence, a line of THIS PO, and something to record", async () => {
    await as(U.op);
    expect(await answer({ evidence: [], lines: [{ poLineId: L1, answer: "confirmed" }] })).toBe("screenshot_required");
    expect(await answer({ evidence: [`${PO}/missing.png`], lines: [{ poLineId: L1, answer: "confirmed" }] })).toBe("screenshot_not_found");
    expect(await answer({ lines: [{ poLineId: uid("99"), answer: "confirmed" }] })).toBe("po_line_not_found");
    expect(await answer({ lines: [{ poLineId: L1, answer: "no_change" }] })).toBe("nothing_to_record");
    expect(await answer({ lines: [{ poLineId: L1, answer: "new_date" }] })).toBe("new_date_required");
    expect(await answer({ poVersion: 2, lines: [{ poLineId: L1, answer: "confirmed" }] })).toBe("stale_po_version");
  });

  it("a later date needs a governed reason, `Other` needs a note; an earlier date needs neither", async () => {
    await as(U.op);
    expect(await answer({ lines: [{ poLineId: L2, answer: "new_date", date: "2026-10-19" }] })).toBe("reason_required");
    expect(await answer({ lines: [{ poLineId: L2, answer: "new_date", date: "2026-10-19", reason: "Other" }] })).toBe("other_note_required");
    expect(await answer({ lines: [{ poLineId: L2, answer: "new_date", date: "2026-10-09" }] })).toBe("ok");
    const rows = (await q("select po_line_id, about_qty, answer, reason, to_char(new_date,'YYYY-MM-DD') d, recorded_by from po_supplier_promises where po_id = $1 and po_line_id = $2", [PO, L2])).rows;
    expect(rows).toEqual([{ po_line_id: L2, about_qty: 2, answer: "earlier", reason: null, d: "2026-10-09", recorded_by: U.op }]);
  });

  it("a split must total the line's still-to-deliver quantity; each batch is its own expected arrival", async () => {
    await as(U.op2);
    expect(await answer({ lines: [{ poLineId: L1, answer: "split", batches: [{ qty: 3, date: ORIGINAL }] }] })).toBe("batch_total_mismatch");
    expect(await answer({ lines: [{ poLineId: L1, answer: "split", batches: [{ qty: 3, date: ORIGINAL }, { qty: 1, date: "2026-10-19" }] }] })).toBe("reason_required");
    expect(await answer({ lines: [{ poLineId: L1, answer: "split", batches: [{ qty: 3, date: ORIGINAL }, { qty: 1, date: "2026-10-19", reason: "Partial quantity ready" }] }] })).toBe("ok");
    const rows = (await q("select about_qty, answer, reason, to_char(new_date,'YYYY-MM-DD') d, answer_group from po_supplier_promises where po_id = $1 and po_line_id = $2 order by new_date", [PO, L1])).rows;
    expect(rows.map((r) => [r.about_qty, r.answer, r.reason, r.d])).toEqual([[3, "confirmed", null, ORIGINAL], [1, "delayed", "Partial quantity ready", "2026-10-19"]]);
    expect(rows[0].answer_group).toBe(rows[1].answer_group);
    expect(await arrivals()).toEqual([
      { po_line_id: L1, qty: 3, arrival: ORIGINAL, answer: "confirmed", reason: null },
      { po_line_id: L1, qty: 1, arrival: "2026-10-19", answer: "delayed", reason: "Partial quantity ready" },
      { po_line_id: L2, qty: 2, arrival: "2026-10-09", answer: "earlier", reason: null },
    ]);
    /* The PO is fully in when its LAST batch is; the original never moves. */
    expect(await effective()).toBe("2026-10-19");
    expect((await q("select to_char(official_delivery_date,'YYYY-MM-DD') d from purchase_orders where id = $1", [PO])).rows[0].d).toBe(ORIGINAL);
  });

  it("a `confirmed` line is the day-before confirmation for ITS date; a re-confirmed delay keeps its reason", async () => {
    await as(U.op);
    /* L2's current expected date is the earlier 2026-10-09 — confirming it records that date. */
    expect(await answer({ lines: [{ poLineId: L2, answer: "confirmed" }] })).toBe("ok");
    const c = (await q("select kind, to_char(for_date,'YYYY-MM-DD') d, destination_id from po_arrival_confirmations where po_id = $1 order by recorded_at", [PO])).rows;
    expect(c).toEqual([{ kind: "supplier_confirmation", d: "2026-10-09", destination_id: DEST }]);
    /* L1's newest batch is delayed with a reason; confirming L1 keeps 2026-10-19 · Partial quantity ready on that batch. */
    expect(await answer({ lines: [{ poLineId: L1, answer: "confirmed" }] })).toBe("ok");
    const l1 = await arrivals();
    expect(l1.filter((r) => r.po_line_id === L1)).toEqual([
      { po_line_id: L1, qty: 4, arrival: "2026-10-19", answer: "delayed", reason: "Partial quantity ready" },
    ]);
  });

  it("the day-before confirmation may name ANY expected arrival, never another date", async () => {
    await as(U.op);
    const confirm = (forDate: string) => attempt("select public.purchasing_record_arrival_confirmation($1, $2::jsonb)", [PO, JSON.stringify({
      poVersion: 1, destinationId: DEST, kind: "supplier_confirmation", channel: "whatsapp", recipient: "Nice Future group",
      reportedBy: "Ah Hock", reportedAt: new Date(Date.now() - 60_000).toISOString(), evidence: [`${PO}/answer.png`], forDate,
    })]);
    expect(await confirm("2026-10-20")).toBe("arrival_date_mismatch");
    expect(await confirm("2026-10-09")).toBe("ok");
    expect(await confirm("2026-10-19")).toBe("ok");
  });

  it("`Supplier DO received` is written once onto the PO and closes the day-before check for every expected arrival", async () => {
    await as(U.op2);
    expect(await answer({ evidence: [], supplierDo: { number: "DO-2251" } })).toBe("supplier_do_incomplete");
    expect(await answer({ evidence: [], supplierDo: { number: "DO-2251", file: `${PO}/do.pdf` }, lines: [{ poLineId: L1, answer: "no_change" }] })).toBe("ok");
    await q("reset role");
    const po = (await q("select do_number, do_file_path, do_uploaded_by from purchase_orders where id = $1", [PO])).rows[0];
    expect(po).toEqual({ do_number: "DO-2251", do_file_path: `${PO}/do.pdf`, do_uploaded_by: U.op2 });
    const dos = (await q("select to_char(for_date,'YYYY-MM-DD') d, supplier_do_no from po_arrival_confirmations where po_id = $1 and kind = 'supplier_do' order by for_date", [PO])).rows;
    expect(dos).toEqual([{ d: "2026-10-09", supplier_do_no: "DO-2251" }, { d: "2026-10-19", supplier_do_no: "DO-2251" }]);
  });

  it("any active Operation or Principal person may record; finance may not; a disabled account may not; the ledger is append-only", async () => {
    await as(U.finance);
    expect(await answer({ lines: [{ poLineId: L2, answer: "confirmed" }] })).toBe("forbidden");
    await as(U.boss);
    expect(await answer({ lines: [{ poLineId: L2, answer: "confirmed" }] })).toBe("ok");
    await q("reset role");
    await q("update app_users set status = 'disabled' where id = $1", [U.op2]);
    await as(U.op2);
    expect(await answer({ lines: [{ poLineId: L2, answer: "confirmed" }] })).toBe("forbidden");
    await q("reset role");
    await q("update app_users set status = 'active' where id = $1", [U.op2]);
    /* Append-only by STRUCTURE: even the database owner, past every policy, is refused by the trigger. */
    await q("reset role");
    expect(await attempt("delete from po_supplier_promises where po_id = $1", [PO])).toBe("supplier_evidence_append_only");
    /* The recorder is the caller; normal PO Duty is a separate stored fact. */
    const who = (await q("select distinct recorded_by from po_supplier_promises where po_id = $1", [PO])).rows.map((r) => r.recorded_by).sort();
    expect(who).toEqual([U.boss, U.op, U.op2].sort());
  });

  it("a line with nothing left to deliver takes no answer", async () => {
    await q("reset role");
    await q("set local session_replication_role = replica");
    await q("update purchase_order_lines set received_qty = qty where id = $1", [L2]);
    await q("set local session_replication_role = origin");
    await as(U.op);
    expect(await answer({ lines: [{ poLineId: L2, answer: "confirmed" }] })).toBe("line_all_received");
    expect((await arrivals()).some((r) => r.po_line_id === L2)).toBe(false);
  });
});

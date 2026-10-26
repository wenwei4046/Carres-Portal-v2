import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0717 ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN.
 *
 * Weisiang's decision (Mr Lim, WhatsApp 2026-10-22, relayed by YH 2026-10-23;
 * Jess was not part of this decision): PO amendments and PO cancellations go
 * through approval queues, the Houzs way. Overturns Purchasing MASTER "no new
 * amendment register" and "§5.8.1 is the sole cancellation journey".
 *
 *   engines   signed-in staff can no longer run the revise / cancel engines
 *   amend     request → Purchasing Approver approves → the existing revise runs
 *   own       nobody decides their own request
 *   cover     another Principal decides the Approver's own request (YH 2026-10-26)
 *   cancel    request → PO Duty level 1 → Purchasing Approver level 2 → cancel runs
 *   refusal   an engine refusal rolls the approval back
 *   record    supplier facts stay direct; `complete` is refused there
 *
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- 0717
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `fffffff7-0717-4000-8000-${HEX}${tail.padStart(7, "0")}`;

const OP = uid("1");
const DUTY = uid("2");
const JESS = uid("3");
const PRINCIPAL2 = uid("4");
const SUPPLIER = uid("51");
const WH = uid("61");
const PO_A = `PO-IT717A-${HEX}`;
const PO_C = `PO-IT717C-${HEX}`;
const LINE_A = uid("a1");
const LINE_C = uid("c1");

type Result = { ok: true; row: Record<string, unknown> } | { ok: false; why: string; detail: string };

describe.skipIf(!URL)("PO amendment and cancellation queues (real PostgreSQL, 0717, Weisiang 2026-10-22)", () => {
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
  const request = (kind: string, po: string, payload: unknown) =>
    attempt("select public.purchasing_request_po_change($1, $2, 'TEST supplier asked', $3::jsonb) as r", [kind, po, JSON.stringify(payload)]);
  const decide = (id: string, approve: boolean, note: string | null = null) =>
    attempt("select public.purchasing_decide_po_change($1::uuid, $2, $3) as r", [id, approve, note]);
  const idOf = (r: Result) => ((r as unknown as { row: { r: { id: string } } }).row.r.id);
  const statusOf = async (id: string) => {
    await q("reset role");
    return (await q("select status from po_change_requests where id = $1", [id])).rows[0].status as string;
  };

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    await q("set local session_replication_role = replica");
    for (const [id, role, name] of [[OP, "operation", "IT office"], [DUTY, "operation", "IT duty"], [JESS, "principal", "IT approver"], [PRINCIPAL2, "principal", "IT principal"]] as const) {
      const email = `it-0717-${name.replace(" ", "")}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status, is_person) values ($1, $2, $3, $4, 'active', true)", [id, email, name, role]);
    }
    await q("update workspace_duty_assignments set duty_key = duty_key || '_chain' where duty_key in ('po_duty', 'purchasing_approver')");
    await q("delete from workspace_duty_covers where duty_key in ('po_duty', 'purchasing_approver')");
    await q("insert into workspace_duty_assignments (duty_key, holder_id, effective_from) values ('po_duty', $1, '2020-01-01'), ('purchasing_approver', $2, '2020-01-01')", [DUTY, JESS]);
    await q("insert into suppliers (id, name, kind, slug) values ($1, $2, (select enum_range(null::supplier_kind))[1], $3)", [SUPPLIER, `IT 0717 ${HEX}`, `it-0717-${HEX}`]);
    await q("insert into warehouses (id, name, kind) values ($1, $2, 'own')", [WH, `IT Klang ${HEX}`]);
    await q("insert into purchase_orders (id, supplier_id, warehouse_id) values ($1, $2, $3), ($4, $2, $3)", [PO_A, SUPPLIER, WH, PO_C]);
    await q("insert into purchase_order_lines (id, po_id, sku, qty) values ($1, $2, 'IT-SKU', 5), ($3, $4, 'IT-SKU', 4)", [LINE_A, PO_A, LINE_C, PO_C]);
    await q("set local session_replication_role = origin");
  });

  afterAll(async () => {
    if (!db) return;
    await q("reset role").catch(() => undefined);
    await q("rollback").catch(() => undefined);
    await db.end();
  });

  it("signed-in staff can no longer run the revise or cancel engines directly", async () => {
    await as(OP);
    const revise = await attempt("select public.purchasing_revise_po($1, 'TEST', $2::jsonb)", [PO_A, JSON.stringify([{ line_id: LINE_A, qty: 3 }])]);
    expect(revise.ok).toBe(false);
    expect((revise as { why: string }).why).toMatch(/permission denied/);
    await as(OP);
    const cancel = await attempt("select public.operation_cancel_po($1, 'TEST')", [PO_C]);
    expect(cancel.ok).toBe(false);
    expect((cancel as { why: string }).why).toMatch(/permission denied/);
  });

  it("an amendment waits for the Purchasing Approver, then the existing revise applies it", async () => {
    await as(OP);
    const filed = await request("amendment", PO_A, [{ line_id: LINE_A, qty: 3, destination_id: null }]);
    expect(filed.ok, filed.ok ? "" : filed.why).toBe(true);
    const id = idOf(filed);
    await q("reset role");
    expect((await q("select qty from purchase_order_lines where id = $1", [LINE_A])).rows[0].qty).toBe(5);
    expect((await q("select summary from po_change_requests where id = $1", [id])).rows[0].summary).toBe("IT-SKU: Qty 5 to 3");

    await as(OP);
    const own = await decide(id, true);
    expect(own.ok).toBe(false);
    expect((own as { detail: string }).detail).toBe("own_request");

    await as(DUTY);
    const notApprover = await decide(id, true);
    expect(notApprover.ok).toBe(false);
    expect((notApprover as { detail: string }).detail).toBe("not_purchase_approver");

    await as(JESS);
    const approved = await decide(id, true);
    expect(approved.ok, approved.ok ? "" : approved.why).toBe(true);
    expect(await statusOf(id)).toBe("approved");
    const po = (await q("select version from purchase_orders where id = $1", [PO_A])).rows[0];
    expect(po.version).toBe(2);
    expect((await q("select qty from purchase_order_lines where id = $1", [LINE_A])).rows[0].qty).toBe(3);
  });

  it("a cancellation needs PO Duty first, then the Purchasing Approver; then the existing cancel runs", async () => {
    await as(OP);
    const filed = await request("cancellation", PO_C, {});
    expect(filed.ok, filed.ok ? "" : filed.why).toBe(true);
    const id = idOf(filed);

    await as(OP);
    const again = await request("cancellation", PO_C, {});
    expect((again as { detail: string }).detail).toBe("request_already_open");

    await as(JESS);
    const jessFirst = await decide(id, true);
    expect((jessFirst as { detail: string }).detail).toBe("not_po_duty");

    await as(DUTY);
    const first = await decide(id, true);
    expect(first.ok, first.ok ? "" : first.why).toBe(true);
    expect(await statusOf(id)).toBe("first_approved");
    expect((await q("select status from purchase_orders where id = $1", [PO_C])).rows[0].status).toBe("open");

    await as(DUTY);
    const dutyAgain = await decide(id, true);
    expect((dutyAgain as { detail: string }).detail).toBe("not_purchase_approver");

    await as(JESS);
    const second = await decide(id, true);
    expect(second.ok, second.ok ? "" : second.why).toBe(true);
    expect(await statusOf(id)).toBe("approved");
    expect((await q("select status from purchase_orders where id = $1", [PO_C])).rows[0].status).toBe("cancelled");
  });

  it("an engine refusal leaves the request where it was", async () => {
    await as(OP);
    // PO_C is cancelled now: file straight into the table as the chain would have before it closed.
    await q("reset role");
    const id = (await q(
      "insert into po_change_requests (kind, po_id, reason, summary, payload, requested_by) values ('amendment', $1, 'TEST', 'TEST', $2::jsonb, $3) returning id",
      [PO_C, JSON.stringify([{ line_id: LINE_C, qty: 2, destination_id: null }]), OP],
    )).rows[0].id as string;
    await as(JESS);
    const refused = await decide(id, true);
    expect(refused.ok).toBe(false);
    expect(await statusOf(id)).toBe("requested");
  });

  it("a rejection needs a reason and changes nothing", async () => {
    await as(DUTY);
    const filed = await request("amendment", PO_A, [{ line_id: LINE_A, qty: 4, destination_id: null }]);
    const id = idOf(filed);
    await as(JESS);
    expect(((await decide(id, false)) as { detail: string }).detail).toBe("reason_required");
    await as(JESS);
    expect((await decide(id, false, "Supplier did not ask")).ok).toBe(true);
    expect(await statusOf(id)).toBe("rejected");
    expect((await q("select qty from purchase_order_lines where id = $1", [LINE_A])).rows[0].qty).toBe(3);
  });

  it("the Approver's own request is decided by another Principal, never by the Approver (YH 2026-10-26)", async () => {
    await as(JESS);
    const filed = await request("amendment", PO_A, [{ line_id: LINE_A, qty: 2, destination_id: null }]);
    expect(filed.ok, filed.ok ? "" : filed.why).toBe(true);
    const id = idOf(filed);
    await as(JESS);
    expect(((await decide(id, true)) as { detail: string }).detail).toBe("own_request");
    await as(OP);
    expect(((await decide(id, true)) as { detail: string }).detail).toBe("not_purchase_approver");
    await as(PRINCIPAL2);
    const approved = await decide(id, true);
    expect(approved.ok, approved.ok ? "" : approved.why).toBe(true);
    expect(await statusOf(id)).toBe("approved");
    expect((await q("select qty from purchase_order_lines where id = $1", [LINE_A])).rows[0].qty).toBe(2);
  });

  it("supplier facts stay direct; `complete` must go through the queue", async () => {
    await as(OP);
    const r = await attempt("select public.purchasing_record_po_cancellation($1, 'TEST', $2::jsonb)", [PO_A, JSON.stringify({ action: "complete" })]);
    expect(r.ok).toBe(false);
    expect((r as { detail: string }).detail).toBe("approval_required");
  });
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0713 ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN.
 *
 * Weisiang's decision (Mr Lim, WhatsApp 2026-10-22, relayed by YH 2026-10-23):
 * office staff open a Purchase Return with no claim, the Houzs way — pick the
 * supplier, tick Units in stock. It overturns Jess's "return only after an
 * approved claim / no blank New" (docs/purchasing/MASTER.md §9.6); Jess was
 * not part of the decision.
 *
 *   list      the supplier's free, Carres-owned Units, with refusal words
 *   issue     the SAME door, given a supplier instead of a claim
 *   refuse    a Unit bought from another supplier, by name
 *   pickup    Stock's pickup takes the claimless Unit out of free stock
 *   claim     a claim return still refuses a supplier-only Unit list
 *   cancel    (YH 2026-10-26) a Unit sold before pickup: the return is cancelled
 *             with a reason, frees the Unit, and a collected return cannot be
 *
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- 0713
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `fffffff7-0000-4000-8000-${HEX}${tail.padStart(7, "0")}`;

const OP = uid("2");
const SUPPLIER = uid("51");
const OTHER = uid("52");
const WH = uid("61");
const PO = `PO-IT713-${HEX}`;
const PO_OTHER = `PO-IT713B-${HEX}`;
const FREE = uid("b1");
const RESERVED = uid("b2");
const FOREIGN = uid("b3");
const SOLD_LATER = uid("b4");
const code = (n: number) => `U17${RUN}-${String(n).padStart(3, "0")}-001`;

type Result = { ok: true; row: Record<string, unknown> } | { ok: false; why: string; detail: string };

describe.skipIf(!URL)("a Purchase Return with no claim (real PostgreSQL, 0713, Weisiang 2026-10-22)", () => {
  let db: pg.Client;
  let prId = "";
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
  const seen = async (id: string) =>
    (await q("select updated_at::text as t from ops_stock_items where id = $1", [id])).rows[0].t as string;
  const issue = async (units: string[], claim: string | null = null, supplier: string | null = SUPPLIER) => {
    const body = [];
    for (const id of units) body.push({ stock_item_id: id, seen: await seen(id) });
    await as(OP);
    return attempt(
      "select public.purchasing_issue_purchase_return($1::uuid, $2::jsonb, null, $3::uuid) as id",
      [claim, JSON.stringify(body), supplier],
    );
  };

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    await q("set local session_replication_role = replica");
    const email = `it-0713-${RUN}@carres.test`;
    await q("insert into auth.users (id, email) values ($1, $2)", [OP, email]);
    await q("insert into app_users (id, email, name, role, status, is_person) values ($1, $2, 'IT office', 'operation', 'active', true)", [OP, email]);
    for (const [id, slug] of [[SUPPLIER, "a"], [OTHER, "b"]] as const) {
      await q("insert into suppliers (id, name, kind, slug, return_address) values ($1, $2, (select enum_range(null::supplier_kind))[1], $3, 'Lot 9, Muar')", [id, `IT 0713 ${slug} ${HEX}`, `it-0713${slug}-${HEX}`]);
    }
    await q("insert into warehouses (id, name, kind) values ($1, $2, 'own')", [WH, `IT Klang ${HEX}`]);
    await q("insert into purchase_orders (id, supplier_id, warehouse_id) values ($1, $2, $3), ($4, $5, $3)", [PO, SUPPLIER, WH, PO_OTHER, OTHER]);
    for (const [id, n, status, po] of [[FREE, 1, "free", PO], [RESERVED, 2, "reserved", PO], [FOREIGN, 3, "free", PO_OTHER], [SOLD_LATER, 4, "free", PO]] as const) {
      await q(
        "insert into ops_stock_items (id, sku, warehouse_id, status, unit_code, identity_scope, qty, po_no) values ($1, 'IT-SKU', $2, $3, $4, 'unit', 1, $5)",
        [id, WH, status, code(n), po],
      );
    }
    await q("set local session_replication_role = origin");
  });

  afterAll(async () => {
    if (!db) return;
    await q("reset role").catch(() => undefined);
    await q("rollback").catch(() => undefined);
    await db.end();
  });

  it("lists the supplier's free Units only — not another supplier's, not a reserved one", async () => {
    await as(OP);
    const r = await attempt("select coalesce(json_agg(unit_code order by unit_code), '[]') as codes from public.purchase_return_supplier_units($1)", [SUPPLIER]);
    expect(r.ok, r.ok ? "" : r.why).toBe(true);
    expect((r as unknown as { row: { codes: string[] } }).row.codes).toEqual([code(1), code(4)]);
  });

  it("refuses a Unit bought from another supplier, by name, and issues nothing", async () => {
    const r = await issue([FOREIGN]);
    expect(r.ok).toBe(false);
    expect((r as { why: string }).why).toContain("Not bought from this supplier");
    await q("reset role");
    expect(Number((await q("select count(*) from purchase_returns where supplier_id = $1", [SUPPLIER])).rows[0].count)).toBe(0);
  });

  it("refuses a reserved Unit by name", async () => {
    const r = await issue([RESERVED]);
    expect(r.ok).toBe(false);
    expect((r as { why: string }).why).toContain("Reserved for an order");
  });

  it("asks for the supplier when there is neither a claim nor a supplier", async () => {
    const r = await issue([FREE], null, null);
    expect(r.ok).toBe(false);
    expect((r as { detail: string }).detail).toBe("supplier_required");
  });

  it("issues through the same door with no claim; moves no stock", async () => {
    const r = await issue([FREE]);
    expect(r.ok, r.ok ? "" : r.why).toBe(true);
    prId = (r as unknown as { row: { id: string } }).row.id;
    await q("reset role");
    const pr = (await q("select supplier_claim_id, supplier_id, pr_no from purchase_returns where id = $1", [prId])).rows[0];
    expect(pr).toMatchObject({ supplier_claim_id: null, supplier_id: SUPPLIER });
    expect(pr.pr_no).toMatch(/^PR-/);
    const units = (await q("select unit_code, return_to, po_id from purchase_return_units where purchase_return_id = $1", [prId])).rows;
    expect(units).toEqual([{ unit_code: code(1), return_to: "Lot 9, Muar", po_id: PO }]);
    expect((await q("select status from ops_stock_items where id = $1", [FREE])).rows[0].status).toBe("free");
  });

  it("Stock's pickup takes the claimless Unit out of free stock", async () => {
    await as(OP);
    const r = await attempt(
      "select public.stock_record_supplier_return_pickup($1::uuid, $2::uuid, $3::uuid[], 'Ah Seng', now() - interval '1 minute', $4::jsonb) as r",
      [uid("e1"), prId, [FREE], JSON.stringify([{ path: `pickup/${prId}/it.jpg`, kind: "photo" }])],
    );
    expect(r.ok, r.ok ? "" : r.why).toBe(true);
    await q("reset role");
    const unit = (await q("select status, hold_released_at from ops_stock_items where id = $1", [FREE])).rows[0];
    expect(unit).toMatchObject({ status: "returned_to_supplier", hold_released_at: null });
    expect((await q("select collected_by_name from purchase_return_units where purchase_return_id = $1", [prId])).rows[0].collected_by_name).toBe("Ah Seng");
  });

  const cancel = async (id: string, reason: string | null) => {
    await as(OP);
    return attempt("select public.purchasing_cancel_purchase_return($1::uuid, $2) as id", [id, reason]);
  };

  it("cannot cancel a return the supplier has collected", async () => {
    const r = await cancel(prId, "Supplier changed mind");
    expect(r.ok).toBe(false);
    expect((r as { detail: string }).detail).toBe("already_collected");
  });

  it("a Unit sold before pickup: the return is cancelled with who and why, and the Unit is free for another return", async () => {
    const issued = await issue([SOLD_LATER]);
    expect(issued.ok, issued.ok ? "" : issued.why).toBe(true);
    const id = (issued as unknown as { row: { id: string } }).row.id;
    await q("reset role");
    await q("update ops_stock_items set status = 'sold' where id = $1", [SOLD_LATER]);

    const noReason = await cancel(id, "  ");
    expect(noReason.ok).toBe(false);
    expect((noReason as { detail: string }).detail).toBe("reason_missing");

    const r = await cancel(id, "Unit sold to a customer");
    expect(r.ok, r.ok ? "" : r.why).toBe(true);
    await q("reset role");
    const pr = (await q("select cancelled_at is not null as cancelled, cancelled_by, cancel_reason from purchase_returns where id = $1", [id])).rows[0];
    expect(pr).toEqual({ cancelled: true, cancelled_by: OP, cancel_reason: "Unit sold to a customer" });

    // Twice answers as cancelled (Houzs), and keeps the first reason.
    expect((await cancel(id, "again")).ok).toBe(true);
    await q("reset role");
    expect((await q("select cancel_reason from purchase_returns where id = $1", [id])).rows[0].cancel_reason).toBe("Unit sold to a customer");

    // Stock's pickup refuses a cancelled return.
    await as(OP);
    const pickup = await attempt(
      "select public.stock_record_supplier_return_pickup($1::uuid, $2::uuid, $3::uuid[], 'Ah Seng', now() - interval '1 minute', $4::jsonb) as r",
      [uid("e2"), id, [SOLD_LATER], JSON.stringify([{ path: `pickup/${id}/it.jpg`, kind: "photo" }])],
    );
    expect(pickup.ok).toBe(false);
    expect((pickup as { detail: string }).detail).toBe("return_cancelled");

    // The Unit is no longer "Already on" the cancelled return.
    await q("reset role");
    await q("update ops_stock_items set status = 'free' where id = $1", [SOLD_LATER]);
    const again = await issue([SOLD_LATER]);
    expect(again.ok, again.ok ? "" : again.why).toBe(true);
  });
});

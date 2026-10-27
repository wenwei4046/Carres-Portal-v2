import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import { Adapters, createOrderInputSchema } from "@carres/shared";

/**
 * OFFICE STAFF OPEN A SALES ORDER THROUGH THE SALES PORTAL ENGINE (real
 * PostgreSQL). OVERTURNED 2026-10-22 by Weisiang (Mr Lim): office staff may
 * create Sales Orders (Houzs way). The office page posts the Sales Portal body
 * to `POST /api/orders`, which calls `create_order_from_sales_portal` under the
 * caller's own JWT. This proves the DATABASE half for an Operation person:
 *
 *   create     an Operation person places the order under the picked dealer;
 *              it is stamped as a final Sales submit like any portal order
 *   boundary   a signed-in caller with no role is still refused (NULL-safe)
 *
 * Fixtures are written with triggers off inside ONE transaction that is rolled
 * back, so a shared local database is left as it was.
 *
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- office-new-sales-order
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `fffffff2-0000-4000-8000-${HEX}${tail.padStart(7, "0")}`;

const OP = uid("1");
const NOBODY = uid("2");
const DEALER = uid("31");
const OUTLET = uid("41");
const SALES = uid("51");
const MODEL = uid("61");
const SKU = `IT-NSO-${HEX}`;

function body() {
  const input = createOrderInputSchema.parse({
    dealerId: DEALER,
    outletId: OUTLET,
    salespersonId: SALES,
    customer: {
      name: `IT customer ${HEX}`, phone: "012-3456789", address: "1 Jalan IT, Petaling Jaya 47400, Selangor",
      addressUnknown: false, billing: null, billingSame: true, emergency: "IT Kin · 019-8765432",
      addressLine1: "1 Jalan IT", addressCity: "Petaling Jaya", addressPostcode: "47400", addressState: "Selangor",
    },
    delivery: { date: "2099-11-20", proceedDate: "2099-11-01", dateTbd: false, floor: 1, hasLift: true },
    lines: [{ sku: SKU, qty: 1, attrs: null, unitPrice: 1500 }],
    addons: [],
    paid: 0,
    signaturePath: `orders-attachments/${DEALER}/it/signature.png`,
    paymentSlipPath: null,
    termsAccepted: true,
    depositPct: 0,
    paymentMethod: "cash",
    approvalCode: null,
    installmentMonths: null,
    entryData: { fields: { building_type: "Condo" } },
  });
  return Adapters.orderInputToRpcPayload(input, DEALER);
}

describe.skipIf(!URL)("an Operation person opens a Sales Order through the Sales Portal engine (real PostgreSQL)", () => {
  let db: pg.Client;
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
  const as = async (who: string) => {
    await q("reset role");
    await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: who, role: "authenticated" })]);
    await q("set local role authenticated");
  };
  async function attempt(): Promise<{ ok: true; row: Record<string, unknown> } | { ok: false; why: string }> {
    await q("savepoint s");
    try {
      const r = await q("select public.create_order_from_sales_portal($1::jsonb) as r", [JSON.stringify(body())]);
      await q("release savepoint s");
      return { ok: true, row: r.rows[0].r as Record<string, unknown> };
    } catch (e) {
      await q("rollback to savepoint s");
      const err = e as { detail?: string; code?: string; message: string };
      return { ok: false, why: `${err.code ?? ""} ${err.message}` };
    }
  }

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    await q("set local session_replication_role = replica");
    for (const [id, role] of [[OP, "operation"], [NOBODY, null]] as const) {
      const email = `it-nso-${id.slice(-7)}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      if (role) await q("insert into app_users (id, email, name, role, status, is_person) values ($1, $2, $3, $4, 'active', true)", [id, email, `IT ${role} ${HEX}`, role]);
    }
    await q("insert into dealers (id, name) values ($1, $2)", [DEALER, `IT Dealer ${HEX}`]);
    await q("insert into outlets (id, dealer_id, name, address) values ($1, $2, $3, 'IT')", [OUTLET, DEALER, `IT Outlet ${HEX}`]);
    await q("insert into salespersons (id, dealer_id, outlet_id, name) values ($1, $2, $3, $4)", [SALES, DEALER, OUTLET, `IT Sales ${HEX}`]);
    await q("insert into product_models (id, category, model_key, name) values ($1, 'mattress', $2, $3)", [MODEL, `it-nso-${HEX}`, `IT Mattress ${HEX}`]);
    await q("insert into product_skus (model_id, sku, variant, variant_kind, price) values ($1, $2, 'Queen', 'size', 1500)", [MODEL, SKU]);
    await q("set local session_replication_role = origin");
  });
  afterAll(async () => {
    await q("reset role").catch(() => {});
    await q("rollback").catch(() => {});
    await db.end();
  });

  it("creates the order under the picked dealer, stamped as a final Sales submit", async () => {
    await as(OP);
    const r = await attempt();
    expect(r.ok, r.ok ? "" : r.why).toBe(true);
    if (!r.ok) return;
    await q("reset role");
    const row = (await q("select dealer_id, outlet_id, salesperson_id, customer_name, sales_final_submitted_at from orders where id = $1", [r.row.id])).rows[0];
    expect(row).toMatchObject({ dealer_id: DEALER, outlet_id: OUTLET, salesperson_id: SALES, customer_name: `IT customer ${HEX}` });
    expect(row.sales_final_submitted_at).not.toBeNull();
    const lines = (await q("select sku, qty, unit_price::float as unit_price from order_lines where order_id = $1", [r.row.id])).rows;
    expect(lines).toEqual([{ sku: SKU, qty: 1, unit_price: 1500 }]);
  });

  it("still refuses a signed-in caller with no role", async () => {
    await as(NOBODY);
    const r = await attempt();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.why).toMatch(/42501|forbidden/);
  });
});

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWK,
  type KeyLike,
} from "jose";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
import { addWorkingDays } from "@carres/shared";
import { userClient } from "../../lib/supabase";

/**
 * `Issue Purchase Order` is the ONE act that creates a formal purchase order,
 * so these tests are about the WRITE: how many documents come out, what goes on
 * them, and that the operator's chosen destination lands on every one.
 *
 * The route never trusts the client's rows — it recomputes the projection and
 * issues from its own reading — so the fixture below is the live shape: PETER's
 * one customer order holding two sofa builds, plus ella's.
 */

const env = {
  SUPABASE_URL: "https://t.x",
  SUPABASE_ANON_KEY: "a",
  SUPABASE_SERVICE_ROLE_KEY: "s",
  SUPABASE_JWT_SECRET: "",
};
const KID = "k1";
let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string) {
  return new SignJWT({ email: `${role}@x`, app_metadata: { role } })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("u1")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

const OHANA = "11111111-1111-1111-1111-111111111111";
const KLANG = "2f181917-f4e1-42b2-9e25-d7ee6785424a";
const AL = "818b420c-27f9-4707-a516-b91a6e03f343";
const WAREHOUSE = "00000000-0000-0000-0000-000000000c03";

function sofaLine(id: string, sku: string, orderId: string, buildKey: string | null) {
  return {
    id,
    order_id: orderId,
    sku,
    qty: 1,
    attrs: buildKey ? { sofa_build_key: buildKey, leg_height: '6"', sofa_height: "24" } : null,
    excluded_from_plan: false,
    exclude_from_plan_until: null,
  };
}

type Tbl = Record<string, { data: unknown; error: unknown }>;

const TABLES = (): Tbl => ({
  purchasing_settings: {
    data: {
      order_by_buffer_days: 7,
      earliest_sell_days: 21,
      logistics_call_working_days: 1,
      po_days: [1, 3, 5],
    },
    error: null,
  },
  purchasing_production_days: {
    data: [{ supplier_id: OHANA, category: "sofa", working_days: 14 }],
    error: null,
  },
  purchasing_supplier_settings: {
    data: [{ supplier_id: OHANA, off_days: [0], transit_days: 1 }],
    error: null,
  },
  purchasing_setting_changes: { data: [], error: null },
  suppliers: { data: [{ id: OHANA, name: "Ohana" }], error: null },
  orders: {
    data: [
      {
        id: "o1", so: 1207, customer_name: "PETER", status: "proceed_order",
        delivery_date: "2026-08-22", delivery_date_tbd: false,
        placed_at: "2026-07-01", created_at: "2026-07-01",
      },
      {
        id: "o2", so: 1204, customer_name: "ella", status: "place",
        delivery_date: "2026-08-11", delivery_date_tbd: false,
        placed_at: "2026-07-01", created_at: "2026-07-01",
      },
    ],
    error: null,
  },
  order_lines: {
    data: [
      sofaLine("p1", "5539-1B(LHF)", "o1", "bk-a"),
      sofaLine("p2", "5539-CNR", "o1", "bk-a"),
      sofaLine("p3", "5539-2A(RHF)", "o1", "bk-a"),
      sofaLine("p4", "5539-1A(LHF)", "o1", "bk-b"),
      sofaLine("e1", "5539-1A(LHF)", "o2", "bk-e"),
      // An accessory on a live order — it must never reach To Order.
      {
        id: "x1", order_id: "o2", sku: "MEMORY-FOAM-PILLOW", qty: 4, attrs: null,
        excluded_from_plan: false, exclude_from_plan_until: null,
      },
    ],
    error: null,
  },
  product_skus: {
    data: [
      { sku: "5539-1B(LHF)", supplier_id: OHANA, cost: null, variant: "1B(LHF)",
        product_models: { category: "sofa", name: "Booqit" } },
      { sku: "5539-CNR", supplier_id: OHANA, cost: null, variant: "CNR",
        product_models: { category: "sofa", name: "Booqit" } },
      { sku: "5539-2A(RHF)", supplier_id: OHANA, cost: null, variant: "2A(RHF)",
        product_models: { category: "sofa", name: "Booqit" } },
      { sku: "5539-1A(LHF)", supplier_id: OHANA, cost: 120, variant: "1A(LHF)",
        product_models: { category: "sofa", name: "Booqit" } },
      { sku: "MEMORY-FOAM-PILLOW", supplier_id: OHANA, cost: 9, variant: null,
        product_models: { category: "accessory", name: "Memory Foam Pillow" } },
    ],
    error: null,
  },
  purchase_order_lines: { data: [], error: null },
  purchasing_destinations: {
    data: [
      { id: KLANG, name: "Carres Klang", is_default: true },
      { id: AL, name: "AL Sungai Buloh", is_default: false },
    ],
    error: null,
  },
  warehouses: { data: [{ id: WAREHOUSE, name: "Carres Klang", kind: "own" }], error: null },
  purchase_orders: { data: null, error: null },
});

/** Records what every table saw, plus every rpc + update call. */
function makeSb(tables: Record<string, { data: unknown; error: unknown }>) {
  const CHAIN = [
    "select", "in", "or", "eq", "neq", "gt", "gte", "ilike", "not", "is", "order", "limit",
  ];
  const updates: { table: string; patch: unknown; id: unknown }[] = [];
  /**
   * Every filter every read applied. The mock does NOT evaluate them — the
   * fixture is whatever it is — so a test that cares WHICH question was asked
   * has to read the question rather than the answer. That is exactly the case
   * for "still to buy": the fixture cannot tell `po_id is null` apart from
   * `remaining_qty > 0`, and the whole of 0320 is that they are different.
   */
  const filters: { table: string; method: string; col: unknown; val: unknown }[] = [];
  const inserts: { table: string; rows: unknown }[] = [];
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  let poSeq = 2030;

  function builder(table: string, result: { data: unknown; error: unknown }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {};
    for (const m of CHAIN) {
      b[m] = vi.fn((col?: unknown, val?: unknown) => {
        filters.push({ table, method: m, col, val });
        return b;
      });
    }
    b.maybeSingle = vi.fn().mockResolvedValue({
      data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data,
      error: result.error,
    });
    b.single = b.maybeSingle;
    b.insert = vi.fn((rows: unknown) => {
      inserts.push({ table, rows });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ib: any = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ib.then = (res: any, rej: any) => Promise.resolve({ data: null, error: null }).then(res, rej);
      ib.select = vi.fn(() => ib);
      return ib;
    });
    b.update = vi.fn((patch: unknown) => {
      const u: Record<string, unknown> = { table, patch, id: null };
      updates.push(u as { table: string; patch: unknown; id: unknown });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ub: any = {};
      ub.eq = vi.fn((_col: string, val: unknown) => {
        u.id = val;
        return ub;
      });
      ub.in = vi.fn((_col: string, vals: unknown) => {
        u.id = vals;
        return ub;
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ub.then = (res: any, rej: any) => Promise.resolve({ data: null, error: null }).then(res, rej);
      return ub;
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    b.then = (res: any, rej: any) => Promise.resolve(result).then(res, rej);
    return b;
  }

  // `maybeSingle` on purchasing_destinations must return the ROW being asked
  // for, so the eq() filter is honoured for that one table.
  function destBuilder(rows: { id: string; name: string }[]) {
    let wanted: string | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {};
    for (const m of CHAIN) {
      b[m] = vi.fn((col?: string, val?: unknown) => {
        if (col === "id" && typeof val === "string") wanted = val;
        return b;
      });
    }
    b.maybeSingle = vi.fn(async () => ({
      data: rows.find((r) => r.id === wanted) ?? null,
      error: null,
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    b.then = (res: any, rej: any) => Promise.resolve({ data: rows, error: null }).then(res, rej);
    return b;
  }

  const tableCalls: Record<string, number> = {};
  /**
   * `product_skus` is read TWICE and the two reads mean different things.
   *
   * The first pulls catalog facts; a fixture with a row removed simulates a
   * SHORT read. The second asks only "does this SKU exist?" — and in the real
   * database it still does, which is exactly what makes a short read alarming.
   * So the existence read always answers from the FULL catalog.
   */
  const fullCatalog = (tables.__fullCatalog?.data ??
    tables.product_skus?.data ??
    []) as { sku: string }[];

  const from = vi.fn((table: string) => {
    tableCalls[table] = (tableCalls[table] ?? 0) + 1;
    if (table === "product_skus") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {};
      let existenceRead = false;
      b.select = vi.fn((cols: string) => {
        existenceRead = cols.trim() === "sku";
        return b;
      });
      for (const m of CHAIN.filter((x) => x !== "select")) b[m] = vi.fn(() => b);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      b.then = (res: any, rej: any) =>
        Promise.resolve(
          existenceRead
            ? { data: fullCatalog.map((r) => ({ sku: r.sku })), error: null }
            : (tables.product_skus ?? { data: [], error: null }),
        ).then(res, rej);
      return b;
    }
    if (table === "purchasing_destinations") {
      return destBuilder(
        (tables.purchasing_destinations.data as { id: string; name: string }[]) ?? [],
      );
    }
    return builder(table, tables[table] ?? { data: [], error: null });
  });

  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    rpcCalls.push({ fn, args });
    if (fn === "operation_create_pos_batch") {
      const pos = (args.p_pos as unknown[]) ?? [];
      const ids = pos.map(() => `PO-${(poSeq += 1)}`);
      return { data: { po_ids: ids }, error: null };
    }
    poSeq += 1;
    return { data: { id: `PO-${poSeq}`, line_count: 1 }, error: null };
  });

  return { from, rpc, updates, inserts, rpcCalls, tableCalls, filters };
}

beforeAll(async () => {
  const kp = await generateKeyPair("ES256", { extractable: true });
  signKey = kp.privateKey;
  publicJwk = await exportJWK(kp.publicKey);
  publicJwk.kid = KID;
  publicJwk.alg = "ES256";
  publicJwk.use = "sig";
});

beforeEach(() => {
  _setJwksForTesting(createLocalJWKSet({ keys: [publicJwk] }));
  vi.mocked(userClient).mockReset();
});

afterAll(() => _setJwksForTesting(null));

const READ = "http://t/api/operation/purchase/to-order";
const ISSUE = "http://t/api/operation/purchase/to-order/issue";

async function get() {
  const jwt = await makeJwt("operation");
  return app.fetch(new Request(READ, { headers: { Authorization: `Bearer ${jwt}` } }), env);
}

/** The arrangement the browser would post untouched: one doc per sofa order. */
async function defaultPlan(sb: ReturnType<typeof makeSb>) {
  vi.mocked(userClient).mockReturnValue(sb as never);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = (await (await get()).json()) as any;
  const p = body.proposals[0];
  const perOrder = new Map<string, string[]>();
  for (const r of p.rows) {
    perOrder.set(
      r.orderId,
      r.builds.map((b: { key: string }) => b.key),
    );
  }
  return [...perOrder.values()].map((buildKeys, i) => ({
    key: `d${i + 1}`,
    include: true,
    buildKeys,
  }));
}

async function post(body: unknown) {
  const jwt = await makeJwt("operation");
  return app.fetch(
    new Request(ISSUE, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    env,
  );
}

describe("GET /api/operation/purchase/to-order", () => {
  it("401 without Authorization", async () => {
    const res = await app.fetch(new Request(READ), env);
    expect(res.status).toBe(401);
  });

  it("projects the live demand into one Ohana · Sofa proposal", async () => {
    const sb = makeSb(TABLES());
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await get();
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;

    expect(body.proposals).toHaveLength(1);
    expect(body.proposals[0].label).toBe("Ohana · Sofa");
    // PETER's one order = one row, holding TWO builds; ella's is the other.
    expect(body.proposals[0].rows).toHaveLength(2);
    expect(body.proposals[0].poCount).toBe(2);
    expect(body.destinations.map((d: { name: string }) => d.name)).toEqual([
      "Carres Klang",
      "AL Sungai Buloh",
    ]);
  });

  it("never lets an accessory reach the page, supplier or not", async () => {
    const sb = makeSb(TABLES());
    vi.mocked(userClient).mockReturnValue(sb as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await get()).json()) as any;
    const skus = body.proposals
      .flatMap((p: { rows: { builds: { lines: { sku: string }[] }[] }[] }) => p.rows)
      .flatMap((r: { builds: { lines: { sku: string }[] }[] }) => r.builds)
      .flatMap((b: { lines: { sku: string }[] }) => b.lines)
      .map((l: { sku: string }) => l.sku);
    expect(skus).not.toContain("MEMORY-FOAM-PILLOW");
  });

  it("reads back what was already ordered — recent POs, one row per customer order", async () => {
    const t = TABLES();
    const todayIsoStr = new Date().toISOString().slice(0, 10);
    t.purchase_orders = {
      data: [
        { id: "PO-2001", supplier_id: OHANA, placed_at: `${todayIsoStr}T09:00:00Z`, so_refs: [1207] },
      ],
      error: null,
    };
    // received in full so the SUPPLY read subtracts nothing and the demand
    // half of the fixture stays byte-identical.
    t.purchase_order_lines = {
      data: [{ po_id: "PO-2001", sku: "5539-1B(LHF)", qty: 1, received_qty: 1 }],
      error: null,
    };
    const sb = makeSb(t);
    vi.mocked(userClient).mockReturnValue(sb as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await get()).json()) as any;

    expect(body.ordered).toHaveLength(1);
    expect(body.ordered[0]).toMatchObject({
      poId: "PO-2001",
      placedAt: todayIsoStr,
      category: "sofa",
      so: 1207,
      orderId: "o1",
      delivery: "2026-08-22",
      model: "Booqit",
      qty: 1,
    });
  });

  it("a manual PO with no SO still gets a row — ordered work must be answerable", async () => {
    const t = TABLES();
    const todayIsoStr = new Date().toISOString().slice(0, 10);
    t.purchase_orders = {
      data: [
        { id: "PO-2002", supplier_id: OHANA, placed_at: `${todayIsoStr}T09:00:00Z`, so_refs: [] },
      ],
      error: null,
    };
    t.purchase_order_lines = {
      data: [{ po_id: "PO-2002", sku: "5539-1A(LHF)", qty: 2, received_qty: 2 }],
      error: null,
    };
    const sb = makeSb(t);
    vi.mocked(userClient).mockReturnValue(sb as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await get()).json()) as any;
    expect(body.ordered).toHaveLength(1);
    expect(body.ordered[0]).toMatchObject({ poId: "PO-2002", so: null, orderId: null, qty: 2 });
  });

  it("each demand row carries its ORDER's own orderBy for the Work Queue — never rendered", async () => {
    const sb = makeSb(TABLES());
    vi.mocked(userClient).mockReturnValue(sb as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await get()).json()) as any;
    for (const r of body.proposals[0].rows) {
      expect(r.orderBy === null || /^\d{4}-\d{2}-\d{2}$/.test(r.orderBy)).toBe(true);
    }
  });
});

describe("POST …/to-order/issue", () => {
  it("creates one purchase order per customer order and returns the real numbers", async () => {
    const sb = makeSb(TABLES());
    vi.mocked(userClient).mockReturnValue(sb as never);

    const plan = await defaultPlan(sb);
    const res = await post({ supplierId: OHANA, category: "sofa", destinationId: KLANG, purchaseOrders: plan });
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;

    expect(sb.rpcCalls.filter((c) => c.fn === "operation_create_pos_batch")).toHaveLength(1);
    expect(body.pos).toHaveLength(2);
    expect(body.pos.map((p: { id: string }) => p.id)).toEqual(["PO-2031", "PO-2032"]);
    expect(body.pos.map((p: { customer: string }) => p.customer).sort()).toEqual([
      "PETER",
      "ella",
    ]);
    expect(body.supplier).toBe("Ohana");
  });

  it("puts every module of a customer's sofas on that customer's document", async () => {
    const sb = makeSb(TABLES());
    vi.mocked(userClient).mockReturnValue(sb as never);
    await post({ supplierId: OHANA, category: "sofa", destinationId: KLANG, purchaseOrders: await defaultPlan(sb) });

    const batch = sb.rpcCalls.find((c) => c.fn === "operation_create_pos_batch")!;
    const pos = batch.args.p_pos as { so_refs: number[]; lines: { sku: string; qty: number }[] }[];
    const peter = pos.find((po) => po.so_refs.includes(1207))!;
    const lines = peter.lines;
    expect(lines.map((l) => l.sku).sort()).toEqual([
      "5539-1A(LHF)",
      "5539-1B(LHF)",
      "5539-2A(RHF)",
      "5539-CNR",
    ]);
    expect(peter.so_refs).toEqual([1207]);
  });

  it("writes the chosen destination onto EVERY purchase order it created", async () => {
    const sb = makeSb(TABLES());
    vi.mocked(userClient).mockReturnValue(sb as never);
    await post({ supplierId: OHANA, category: "sofa", destinationId: AL, purchaseOrders: await defaultPlan(sb) });

    // ONE statement over every document the batch made.
    const destWrites = sb.updates.filter((u) => u.table === "purchase_orders");
    expect(destWrites).toHaveLength(1);
    // Destination AND the expected arrival ride the SAME statement (2026-08-03):
    // a fresh PO has received nothing so the destination guard permits both,
    // and one statement means the two can never land out of step.
    expect(destWrites[0].patch).toMatchObject({ destination_id: AL });
    expect((destWrites[0].patch as { eta_date?: string }).eta_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(destWrites[0].id).toEqual(["PO-2031", "PO-2032"]);
  });

  it("carries a price without ever asking for one — an unpriced SKU writes 0", async () => {
    const sb = makeSb(TABLES());
    vi.mocked(userClient).mockReturnValue(sb as never);
    await post({ supplierId: OHANA, category: "sofa", destinationId: KLANG, purchaseOrders: await defaultPlan(sb) });

    const lines = (
      sb.rpcCalls.find((c) => c.fn === "operation_create_pos_batch")!.args.p_pos as {
        lines: { sku: string; cost: number; cost_source: string }[];
      }[]
    ).flatMap((po) => po.lines);
    expect(lines.every((l) => typeof l.cost === "number")).toBe(true);
    expect(lines.every((l) => l.cost_source === "catalog")).toBe(true);
    expect(lines.find((l) => l.sku === "5539-CNR")!.cost).toBe(0);
    expect(lines.find((l) => l.sku === "5539-1A(LHF)")!.cost).toBe(120);
  });

  it("refuses a pair with no production days, and writes nothing", async () => {
    const t = TABLES();
    t.purchasing_production_days = { data: [], error: null };
    const sb = makeSb(t);
    vi.mocked(userClient).mockReturnValue(sb as never);

    const res = await post({ supplierId: OHANA, category: "sofa", destinationId: KLANG, purchaseOrders: [{ key: "d1", include: true, buildKeys: ["x"] }] });
    // With no number the pair cannot be planned at all, so there is nothing to
    // issue — the block is upstream of the button, not a softer refusal.
    expect(res.status).toBe(409);
    expect(sb.rpcCalls).toHaveLength(0);
    expect(sb.updates).toHaveLength(0);
  });

  it("refuses an unknown destination and writes nothing", async () => {
    const sb = makeSb(TABLES());
    vi.mocked(userClient).mockReturnValue(sb as never);
    const plan = await defaultPlan(sb);
    const res = await post({
      supplierId: OHANA,
      category: "sofa",
      destinationId: "99999999-9999-9999-9999-999999999999",
      purchaseOrders: plan,
    });
    expect(res.status).toBe(422);
    expect(sb.rpcCalls).toHaveLength(0);
  });

  it("refuses a supplier that has nothing to issue", async () => {
    const sb = makeSb(TABLES());
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await post({
      supplierId: "33333333-3333-3333-3333-333333333333",
      category: "sofa",
      destinationId: KLANG,
      purchaseOrders: [{ key: "d1", include: true, buildKeys: ["x"] }],
    });
    expect(res.status).toBe(409);
    expect(sb.rpcCalls).toHaveLength(0);
  });

  it("400s on a malformed body", async () => {
    const sb = makeSb(TABLES());
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await post({ supplierId: "not-a-uuid", category: "sofa", destinationId: KLANG, purchaseOrders: [] });
    expect(res.status).toBe(400);
  });

  it("401 without Authorization", async () => {
    const res = await app.fetch(
      new Request(ISSUE, { method: "POST", body: "{}" }),
      env,
    );
    expect(res.status).toBe(401);
  });
});

/**
 * 2026-07-30 — the regression that must never be possible again.
 *
 * Seven customer requirements across five customer orders reached no purchase
 * order, and the documents that WERE issued looked complete. The cause was a
 * catalog read coming back short and the loop skipping what it could not
 * resolve, in silence.
 *
 * These pin the two halves of the fix: a requirement the catalog cannot answer
 * for is NAMED, and it stops every issue rather than quietly shrinking one.
 */
describe("a requirement the catalog cannot answer for", () => {
  it("says NOTHING about a line that was never a catalog product", async () => {
    // `Transport Fees`, `Leg 4"`, an AutoCount free-text description — an
    // order_line.sku is plain text with no foreign key, so plenty of them were
    // never products. 95 live in prod. Treating those as an alarm blocked every
    // issue on the page on 2026-07-31.
    const t = TABLES();
    t.order_lines = {
      data: [
        ...(t.order_lines.data as Record<string, unknown>[]),
        {
          id: "fee1", order_id: "o1", sku: "Transport Fees", qty: 1, attrs: null,
          excluded_from_plan: false, exclude_from_plan_until: null,
        },
        {
          id: "fee2", order_id: "o2", sku: 'Leg 4"', qty: 1, attrs: null,
          excluded_from_plan: false, exclude_from_plan_until: null,
        },
      ],
      error: null,
    };
    const sb = makeSb(t);
    vi.mocked(userClient).mockReturnValue(sb as never);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await get()).json()) as any;
    expect(body.unresolved).toEqual([]);
  });

  it("still lets those lines be issued rather than blocking the page", async () => {
    const t = TABLES();
    t.order_lines = {
      data: [
        ...(t.order_lines.data as Record<string, unknown>[]),
        {
          id: "fee1", order_id: "o1", sku: "Transport Fees", qty: 1, attrs: null,
          excluded_from_plan: false, exclude_from_plan_until: null,
        },
      ],
      error: null,
    };
    const sb = makeSb(t);
    const plan = await defaultPlan(sb);
    const res = await post({
      supplierId: OHANA, category: "sofa", destinationId: KLANG, purchaseOrders: plan,
    });
    expect(res.status).toBe(200);
  });

  it("never puts a SKU into a PostgREST `.in()` list", () => {
    // THE root cause, turned into a rule the next hand cannot break.
    //
    // `order_lines.sku` is free text and 16 live demand lines carry a DOUBLE
    // QUOTE — `Leg 4"`, `HK5531/28"(2 Seater + Lshape)/…`. PostgREST wraps a
    // reserved-character value in double quotes, so a value containing one
    // breaks the filter and the server answers with whatever it could parse.
    // That is what put seven customer requirements on no purchase order on
    // 2026-07-30 and what made the guard block every issue a day later.
    //
    // The catalog is 205 rows and every open PO line is a small slice, so both
    // are read WHOLE. A render test cannot see this; only the source can.
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "to-order.ts"),
      "utf8",
    );
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/\.in\(\s*["']sku["']/);
    // order_id is a uuid — safe, and the one list that still earns its place.
    expect(code).toMatch(/\.in\(\s*["']order_id["']/);
  });

  it("names a procurable SKU nobody has mapped to a supplier", async () => {
    const t = TABLES();
    t.product_skus = {
      data: (t.product_skus.data as { sku: string; supplier_id: string | null }[]).map((r) =>
        r.sku === "5539-CNR" ? { ...r, supplier_id: null } : r,
      ),
      error: null,
    };
    const sb = makeSb(t);
    vi.mocked(userClient).mockReturnValue(sb as never);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await get()).json()) as any;
    expect(body.unresolved.map((u: { sku: string }) => u.sku)).toEqual(["5539-CNR"]);
  });

  it("says nothing when every requirement resolves", async () => {
    const sb = makeSb(TABLES());
    vi.mocked(userClient).mockReturnValue(sb as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await get()).json()) as any;
    expect(body.unresolved).toEqual([]);
  });

  it("still keeps an accessory out — that is a judgement, not a failure to read", async () => {
    const sb = makeSb(TABLES());
    vi.mocked(userClient).mockReturnValue(sb as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await get()).json()) as any;
    expect(body.unresolved).toEqual([]);
    const skus = body.proposals
      .flatMap((p: { rows: { builds: { lines: { sku: string }[] }[] }[] }) => p.rows)
      .flatMap((r: { builds: { lines: { sku: string }[] }[] }) => r.builds)
      .flatMap((b: { lines: { sku: string }[] }) => b.lines)
      .map((l: { sku: string }) => l.sku);
    expect(skus).not.toContain("MEMORY-FOAM-PILLOW");
  });

  it("reads back what was already ordered — recent POs, one row per customer order", async () => {
    const t = TABLES();
    const todayIsoStr = new Date().toISOString().slice(0, 10);
    t.purchase_orders = {
      data: [
        { id: "PO-2001", supplier_id: OHANA, placed_at: `${todayIsoStr}T09:00:00Z`, so_refs: [1207] },
      ],
      error: null,
    };
    // received in full so the SUPPLY read subtracts nothing and the demand
    // half of the fixture stays byte-identical.
    t.purchase_order_lines = {
      data: [{ po_id: "PO-2001", sku: "5539-1B(LHF)", qty: 1, received_qty: 1 }],
      error: null,
    };
    const sb = makeSb(t);
    vi.mocked(userClient).mockReturnValue(sb as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await get()).json()) as any;

    expect(body.ordered).toHaveLength(1);
    expect(body.ordered[0]).toMatchObject({
      poId: "PO-2001",
      placedAt: todayIsoStr,
      category: "sofa",
      so: 1207,
      orderId: "o1",
      delivery: "2026-08-22",
      model: "Booqit",
      qty: 1,
    });
  });

  it("a manual PO with no SO still gets a row — ordered work must be answerable", async () => {
    const t = TABLES();
    const todayIsoStr = new Date().toISOString().slice(0, 10);
    t.purchase_orders = {
      data: [
        { id: "PO-2002", supplier_id: OHANA, placed_at: `${todayIsoStr}T09:00:00Z`, so_refs: [] },
      ],
      error: null,
    };
    t.purchase_order_lines = {
      data: [{ po_id: "PO-2002", sku: "5539-1A(LHF)", qty: 2, received_qty: 2 }],
      error: null,
    };
    const sb = makeSb(t);
    vi.mocked(userClient).mockReturnValue(sb as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await get()).json()) as any;
    expect(body.ordered).toHaveLength(1);
    expect(body.ordered[0]).toMatchObject({ poId: "PO-2002", so: null, orderId: null, qty: 2 });
  });

  it("each demand row carries its ORDER's own orderBy for the Work Queue — never rendered", async () => {
    const sb = makeSb(TABLES());
    vi.mocked(userClient).mockReturnValue(sb as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await get()).json()) as any;
    for (const r of body.proposals[0].rows) {
      expect(r.orderBy === null || /^\d{4}-\d{2}-\d{2}$/.test(r.orderBy)).toBe(true);
    }
  });
});

describe("the reads are chunked", () => {
  it("asks the catalog in batches so one long URL cannot swallow a customer's goods", async () => {
    const t = TABLES();
    // 95 SKUs on one order line each — past the 40-per-batch chunk.
    const many = Array.from({ length: 95 }, (_, i) => `BULK-${i}`);
    t.order_lines = {
      data: [
        ...(t.order_lines.data as Record<string, unknown>[]),
        ...many.map((sku, i) => ({
          id: `b${i}`, order_id: "o2", sku, qty: 1, attrs: null,
          excluded_from_plan: false, exclude_from_plan_until: null,
        })),
      ],
      error: null,
    };
    t.product_skus = {
      data: [
        ...(t.product_skus.data as Record<string, unknown>[]),
        ...many.map((sku) => ({
          sku, supplier_id: OHANA, cost: 1, variant: null,
          product_models: { category: "sofa", name: "Bulk" },
        })),
      ],
      error: null,
    };
    const sb = makeSb(t);
    vi.mocked(userClient).mockReturnValue(sb as never);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await get()).json()) as any;
    // 78 + 95 distinct SKUs cannot ride one `.in()`; the catalog is asked more
    // than once, and nothing is lost.
    expect(sb.tableCalls.product_skus).toBeGreaterThan(1);
    expect(body.unresolved).toEqual([]);
  });
});

/**
 * The gate on the write.
 *
 * The client posts an ARRANGEMENT and nothing else — no SKUs, no quantities, no
 * prices. Every rule below is asked against the proposal the SERVER just built,
 * so a browser left open since this morning cannot order goods that have since
 * been bought, and a hand-written request cannot invent a line.
 */
describe("POST …/issue — server validation", () => {
  async function planFor(sb: ReturnType<typeof makeSb>) {
    return defaultPlan(sb);
  }
  const issue = (over: Record<string, unknown>) =>
    post({ supplierId: OHANA, category: "sofa", destinationId: KLANG, ...over });

  it("refuses a build that is not waiting to be ordered, and writes nothing", async () => {
    const sb = makeSb(TABLES());
    await planFor(sb);
    const res = await issue({
      purchaseOrders: [{ key: "d1", include: true, buildKeys: ["not-a-real-build"] }],
    });
    expect(res.status).toBe(422);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(((await res.json()) as any).code).toBe("unknown_build");
    expect(sb.rpcCalls.filter((c) => c.fn === "operation_create_pos_batch")).toHaveLength(0);
    expect(sb.updates).toHaveLength(0);
  });

  it("refuses the same item on two purchase orders", async () => {
    const sb = makeSb(TABLES());
    const plan = await planFor(sb);
    const k = plan[0].buildKeys[0];
    const res = await issue({
      purchaseOrders: [
        { key: "d1", include: true, buildKeys: [k] },
        { key: "d2", include: true, buildKeys: [k] },
      ],
    });
    expect(res.status).toBe(422);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(((await res.json()) as any).code).toBe("duplicate_build");
    expect(sb.rpcCalls.filter((c) => c.fn === "operation_create_pos_batch")).toHaveLength(0);
  });

  it("refuses an empty purchase order", async () => {
    const sb = makeSb(TABLES());
    await planFor(sb);
    const res = await issue({ purchaseOrders: [{ key: "d1", include: true, buildKeys: [] }] });
    expect(res.status).toBe(422);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(((await res.json()) as any).code).toBe("empty_document");
  });

  it("refuses a merged SOFA purchase order", async () => {
    const sb = makeSb(TABLES());
    const plan = await planFor(sb);
    // PETER's and ella's builds on ONE document — fabric, size and
    // configuration make that dangerous, so it never reaches the database.
    const res = await issue({
      purchaseOrders: [
        { key: "d1", include: true, buildKeys: [...plan[0].buildKeys, ...plan[1].buildKeys] },
      ],
    });
    expect(res.status).toBe(422);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(((await res.json()) as any).code).toBe("sofa_merge");
    expect(sb.rpcCalls.filter((c) => c.fn === "operation_create_pos_batch")).toHaveLength(0);
  });

  it("refuses when nothing is selected to issue", async () => {
    const sb = makeSb(TABLES());
    const plan = await planFor(sb);
    const res = await issue({
      purchaseOrders: plan.map((d) => ({ ...d, include: false })),
    });
    expect(res.status).toBe(422);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(((await res.json()) as any).code).toBe("no_documents");
  });

  it("issues ONLY what is included", async () => {
    const sb = makeSb(TABLES());
    const plan = await planFor(sb);
    const res = await issue({
      purchaseOrders: [plan[0], { ...plan[1], include: false }],
    });
    expect(res.status).toBe(200);
    const batch = sb.rpcCalls.find((c) => c.fn === "operation_create_pos_batch")!;
    expect((batch.args.p_pos as unknown[]).length).toBe(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(((await res.json()) as any).pos).toHaveLength(1);
  });

  it("creates every document in ONE transaction, not one call each", async () => {
    const sb = makeSb(TABLES());
    const plan = await planFor(sb);
    await issue({ purchaseOrders: plan });
    expect(sb.rpcCalls.filter((c) => c.fn === "operation_create_pos_batch")).toHaveLength(1);
    expect(sb.rpcCalls.filter((c) => c.fn === "operation_create_po")).toHaveLength(0);
  });

  it("never lets the client send a quantity, a SKU or a price", async () => {
    const sb = makeSb(TABLES());
    const plan = await planFor(sb);
    await issue({
      purchaseOrders: plan.map((d) => ({
        ...d,
        // A hand-written request trying to smuggle its own lines in.
        lines: [{ sku: "MADE-UP", qty: 999, cost: 1 }],
      })),
    });
    const batch = sb.rpcCalls.find((c) => c.fn === "operation_create_pos_batch")!;
    const skus = (batch.args.p_pos as { lines: { sku: string }[] }[]).flatMap((po) =>
      po.lines.map((l) => l.sku),
    );
    expect(skus).not.toContain("MADE-UP");
    expect(skus.every((s) => s.startsWith("5539-"))).toBe(true);
  });
});


/**
 * THE PO'S BIRTH CERTIFICATE (Loo, 2026-08-03).
 *
 * A purchase order must be born carrying what the rest of the module reads.
 * Measured the same day: `purchasing_record_tomorrow_delivery` (0306, shipped)
 * refuses to open when `eta_date` is NULL, and nothing had ever written one on
 * a PO raised here — a built, deployed supplier call that could never fire.
 */
describe("a purchase order is born with its expected arrival", () => {
  it("stamps eta_date = today + production (factory week) + transit (office week)", async () => {
    const sb = makeSb(TABLES());
    vi.mocked(userClient).mockReturnValue(sb as never);
    await post({
      supplierId: OHANA,
      category: "sofa",
      destinationId: KLANG,
      purchaseOrders: await defaultPlan(sb),
    });

    const write = sb.updates.filter((u) => u.table === "purchase_orders");
    expect(write).toHaveLength(1); // ONE statement over every document
    const patch = write[0].patch as { destination_id: string; eta_date?: string };
    expect(patch.destination_id).toBe(KLANG);
    expect(patch.eta_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // 14 production days on Ohana's week (Sunday off) + 1 transit day on the
    // OFFICE week — arranging the movement is our work, not the factory's.
    const expected = addWorkingDays(
      addWorkingDays(new Date().toISOString().slice(0, 10), 14, { offDays: [0] }),
      1,
      { offDays: [0, 6] },
    );
    expect(patch.eta_date).toBe(expected);
  });

  it("NEVER writes expected_ready_date — that column is the factory's promise", async () => {
    const sb = makeSb(TABLES());
    vi.mocked(userClient).mockReturnValue(sb as never);
    await post({
      supplierId: OHANA,
      category: "sofa",
      destinationId: KLANG,
      purchaseOrders: await defaultPlan(sb),
    });
    // R5 grades a factory by `expected_ready_date`. Seeding it with OUR
    // estimate would score a supplier on a number it never gave, and nothing
    // on screen would say so. Empty is the trigger of `Confirm ready date`.
    for (const u of sb.updates) {
      expect(JSON.stringify(u.patch)).not.toContain("expected_ready_date");
    }
  });

  it("raises the purchase order ANYWAY when transit days are not set, with no invented date", async () => {
    const t = TABLES();
    t.purchasing_supplier_settings = {
      data: [{ supplier_id: OHANA, off_days: [0] }], // no transit_days
      error: null,
    };
    const sb = makeSb(t);
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await post({
      supplierId: OHANA,
      category: "sofa",
      destinationId: KLANG,
      purchaseOrders: await defaultPlan(sb),
    });

    // The goods matter more than the estimate: the PO is still raised.
    expect(res.status).toBe(200);
    const patch = sb.updates.find((u) => u.table === "purchase_orders")!.patch as {
      eta_date?: string;
    };
    // A guessed arrival would be read downstream as a measurement (P1's law).
    expect(patch.eta_date).toBeUndefined();
  });

  it("records who raised it — po_history, the table that has existed since 0001", async () => {
    const sb = makeSb(TABLES());
    vi.mocked(userClient).mockReturnValue(sb as never);
    await post({
      supplierId: OHANA,
      category: "sofa",
      destinationId: KLANG,
      purchaseOrders: await defaultPlan(sb),
    });

    // Measured 2026-08-01: `operation_create_pos_batch` writes no audit row of
    // any kind, so a purchase order could not say who raised it or when.
    const hist = sb.inserts.filter((i) => i.table === "po_history");
    expect(hist).toHaveLength(1);
    const rows = hist[0].rows as { po_id: string; text: string }[];
    expect(rows).toHaveLength(2); // one per document the batch made
    expect(rows[0].po_id).toBe("PO-2031");
    expect(rows[0].text).toContain("expected arrival");
  });
});

/**
 * THE FEATURE MAY BE UNAVAILABLE; THE PAGE MAY NOT BE (Jess, 2026-08-03).
 *
 * Typed Ready Stock demand arrives with migration 0318. Between deploying this
 * code and applying it — and in any rebuilt environment — the table is absent.
 * To Order's job is turning CUSTOMER orders into purchase orders and it did
 * that for months before typed demand existed, so an optional read must never
 * 500 the whole workspace.
 */
describe("purchase_demands absent — fail closed, not down", () => {
  it("still answers 200 with the customer-order plan when the table is missing", async () => {
    const t = TABLES();
    // What PostgREST answers for a table that is not there.
    t.purchase_demands = {
      data: null,
      error: { code: "42P01", message: 'relation "purchase_demands" does not exist' },
    };
    const sb = makeSb(t);
    vi.mocked(userClient).mockReturnValue(sb as never);

    const res = await get();
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    // The customer work is all there — the day's purchasing is unaffected.
    expect(body.proposals.length).toBeGreaterThan(0);
    expect(body.proposals[0].rows.length).toBeGreaterThan(0);
  });

  it("issues purchase orders normally while the table is missing", async () => {
    const t = TABLES();
    t.purchase_demands = {
      data: null,
      error: { code: "42P01", message: 'relation "purchase_demands" does not exist' },
    };
    const sb = makeSb(t);
    vi.mocked(userClient).mockReturnValue(sb as never);

    const res = await post({
      supplierId: OHANA,
      category: "sofa",
      destinationId: KLANG,
      purchaseOrders: await defaultPlan(sb),
    });
    expect(res.status).toBe(200);
  });
});

/**
 * A DEMAND SURVIVES BEING PART SATISFIED (Loo, 2026-08-04 · migration 0320).
 *
 * 0319 froze "one row = one issue" and Loo ruled the business needs the other
 * thing: a demand's quantity FALLS when ready stock is taken (card P10), so the
 * row has to keep its remainder instead of disappearing or re-appearing whole.
 */
const DEMAND_ID = "9ce4bbb1-0000-4000-8000-00000000d001";

/**
 * A MATTRESS, deliberately — the live demand is `SONIC-S`, and mattress is the
 * grain where a quantity is a quantity. Sofa counted BUILDS whatever the row
 * was, so a sofa fixture here would have measured that rule rather than the
 * remainder. It measured it and REPORTED it, which is card P11; the sofa case
 * has its own fixture below now that a lone line carries its own quantity.
 */
function withDemand(issued: number, qty = 5) {
  const t = TABLES();
  t.purchasing_production_days = {
    data: [
      { supplier_id: OHANA, category: "sofa", working_days: 14 },
      { supplier_id: OHANA, category: "mattress", working_days: 10 },
    ],
    error: null,
  };
  t.product_skus = {
    data: [
      ...(t.product_skus.data as unknown[]),
      {
        sku: "SONIC-S",
        supplier_id: OHANA,
        cost: 300,
        variant: "Single",
        variant_kind: "size",
        product_models: { category: "mattress", name: "Sonic" },
      },
    ],
    error: null,
  };
  t.purchase_demands = {
    data: [
      {
        id: DEMAND_ID,
        purpose: "ready_stock",
        sku: "SONIC-S",
        supplier_id: OHANA,
        destination_id: KLANG,
        qty,
        issued_qty: issued,
        // GENERATED in the database. The fixture states it the way the wire
        // carries it rather than recomputing it, because a test that does the
        // subtraction itself would still pass if the column were dropped.
        remaining_qty: qty - issued,
        required_by: null,
        remark: null,
      },
    ],
    error: null,
  };
  return t;
}

/** The one demand row, wherever it landed among the proposals. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function demandRow(body: any) {
  for (const p of body.proposals ?? []) {
    for (const r of p.rows ?? []) if (r.orderId === `demand:${DEMAND_ID}`) return r;
  }
  return null;
}

describe("a partly satisfied demand keeps its remainder", () => {
  it("shows what is LEFT to buy, not what was originally asked for", async () => {
    const sb = makeSb(withDemand(2)); // 5 asked for, 2 already dealt with
    vi.mocked(userClient).mockReturnValue(sb as never);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await get()).json()) as any;
    const row = demandRow(body);
    expect(row).not.toBeNull();

    // 3, never 5. Buying 5 again is the double order this column exists to stop.
    const units = row.builds.reduce((n: number, b: { qty: number }) => n + b.qty, 0);
    expect(units).toBe(3);
  });

  it("an untouched demand is unchanged — the whole quantity is still to buy", async () => {
    const sb = makeSb(withDemand(0));
    vi.mocked(userClient).mockReturnValue(sb as never);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await get()).json()) as any;
    const units = demandRow(body).builds.reduce(
      (n: number, b: { qty: number }) => n + b.qty,
      0,
    );
    expect(units).toBe(5);
  });

  it("asks what is LEFT, never whether a purchase order exists", async () => {
    const sb = makeSb(withDemand(2));
    vi.mocked(userClient).mockReturnValue(sb as never);
    await get();

    const onDemands = sb.filters.filter((f) => f.table === "purchase_demands");
    // The question that keeps a partly satisfied row alive.
    expect(onDemands).toContainEqual({
      table: "purchase_demands",
      method: "gt",
      col: "remaining_qty",
      val: 0,
    });
    // The question that would have buried it. `po_id is null` reads a demand
    // that was partly ordered as finished.
    expect(
      onDemands.some((f) => f.method === "is" && f.col === "po_id"),
    ).toBe(false);
  });

  it("issuing records the quantity it took, through the door — never a PATCH", async () => {
    const sb = makeSb(withDemand(2));
    vi.mocked(userClient).mockReturnValue(sb as never);

    // The demand's OWN proposal — it is a mattress, and the sofa work is a
    // separate document with a separate supplier×category key.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await get()).json()) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prop = body.proposals.find((p: any) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (p.rows ?? []).some((r: any) => r.orderId === `demand:${DEMAND_ID}`),
    );
    expect(prop).toBeTruthy();

    const res = await post({
      supplierId: prop.supplierId,
      category: prop.category,
      destinationId: KLANG,
      purchaseOrders: [
        {
          key: "d1",
          include: true,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          buildKeys: prop.rows.flatMap((r: any) => r.builds.map((b: any) => b.key)),
        },
      ],
    });
    expect(res.status).toBe(200);

    const calls = sb.rpcCalls.filter((r) => r.fn === "purchasing_demand_record_issue");
    expect(calls).toHaveLength(1);
    // The REMAINDER it actually ordered, and the purchase order that took it.
    expect(calls[0].args.p_id).toBe(DEMAND_ID);
    expect(calls[0].args.p_qty).toBe(3);
    expect(String(calls[0].args.p_po_id)).toMatch(/^PO-/);

    // 0316's rule on this table: the quantity may not move by a client write.
    expect(sb.updates.some((u) => u.table === "purchase_demands")).toBe(false);
  });

  /**
   * The same demand, on the SOFA grain (card P11). A typed demand is one sku
   * and one number and has no modules at all, so the build-collapse must not
   * reach it: the proposal, the purchase order and the number credited back to
   * the demand all have to be the quantity that was typed.
   */
  function withSofaDemand(qty = 5) {
    const t = withDemand(0, qty);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (t.purchase_demands.data as any[])[0].sku = "5539-1A(LHF)"; // a real sofa sku
    return t;
  }

  it("a typed SOFA demand of 5 is proposed, ordered and recorded as 5", async () => {
    const sb = makeSb(withSofaDemand(5));
    vi.mocked(userClient).mockReturnValue(sb as never);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await get()).json()) as any;
    const row = demandRow(body);
    expect(row).not.toBeNull();
    expect(row.qty).toBe(5);
    expect(row.builds).toHaveLength(1);
    expect(row.builds[0].qty).toBe(5);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prop = body.proposals.find((p: any) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (p.rows ?? []).some((r: any) => r.orderId === `demand:${DEMAND_ID}`),
    );
    const res = await post({
      supplierId: prop.supplierId,
      category: prop.category,
      destinationId: KLANG,
      purchaseOrders: [
        {
          key: "d1",
          include: true,
          buildKeys: row.builds.map((b: { key: string }) => b.key),
        },
      ],
    });
    expect(res.status).toBe(200);

    // The purchase order and the credit are the SAME number. They are computed
    // from two different places — the line, and the build — so a disagreement
    // orders 5 and records 1, and the other 4 come back to be bought again.
    const batch = sb.rpcCalls.find((c) => c.fn === "operation_create_pos_batch")!;
    const pos = batch.args.p_pos as { lines: { sku: string; qty: number }[] }[];
    expect(pos).toHaveLength(1);
    expect(pos[0].lines.map((l) => l.qty)).toEqual([5]);

    const calls = sb.rpcCalls.filter((r) => r.fn === "purchasing_demand_record_issue");
    expect(calls).toHaveLength(1);
    expect(calls[0].args.p_qty).toBe(5);
  });

  it("a customer order is not a demand — it records nothing on this table", async () => {
    const sb = makeSb(TABLES()); // no typed demand at all
    vi.mocked(userClient).mockReturnValue(sb as never);
    await post({
      supplierId: OHANA,
      category: "sofa",
      destinationId: KLANG,
      purchaseOrders: await defaultPlan(sb),
    });
    expect(sb.rpcCalls.some((r) => r.fn === "purchasing_demand_record_issue")).toBe(false);
  });
});

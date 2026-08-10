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

  /**
   * ── T3 · what an open purchase order already covers, and WHICH one ────────
   *
   * The supply read has always aggregated the open lines into one number per
   * SKU. T3 carries the DOCUMENT alongside it — `po_id` IS the PO number — so
   * the grid can say `2 on PO-2051` instead of leaving a fallen quantity
   * unexplained. No second query, no migration.
   */
  it("carries the cover AND the purchase order behind it onto the row", async () => {
    const t = TABLES();
    // ella's build is one line of one unit; make it two so a cover of one
    // leaves something still to buy — a FULLY covered line is dropped, which
    // is the case the next test pins.
    (t.order_lines.data as { id: string; qty: number }[]).find((l) => l.id === "e1")!.qty = 2;
    t.purchase_order_lines = {
      data: [{ po_id: "PO-2051", sku: "5539-1A(LHF)", qty: 1, received_qty: 0 }],
      error: null,
    };
    const sb = makeSb(t);
    vi.mocked(userClient).mockReturnValue(sb as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await get()).json()) as any;
    const ella = body.proposals[0].rows.find((r: { orderId: string }) => r.orderId === "o2");
    expect(ella.qty).toBe(1); // 2 asked for, 1 already bought
    expect(ella.coveredByOpenPo).toBe(1); // …and this is why
    expect(ella.coveredByOpenPoPos).toEqual(["PO-2051"]);
  });

  it("a RECEIVED purchase-order line covers nothing — the goods are here already", async () => {
    const t = TABLES();
    (t.order_lines.data as { id: string; qty: number }[]).find((l) => l.id === "e1")!.qty = 2;
    t.purchase_order_lines = {
      data: [{ po_id: "PO-2051", sku: "5539-1A(LHF)", qty: 1, received_qty: 1 }],
      error: null,
    };
    const sb = makeSb(t);
    vi.mocked(userClient).mockReturnValue(sb as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await get()).json()) as any;
    const ella = body.proposals[0].rows.find((r: { orderId: string }) => r.orderId === "o2");
    expect(ella.qty).toBe(2);
    expect(ella.coveredByOpenPo).toBe(0);
    expect(ella.coveredByOpenPoPos).toEqual([]);
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

// ── P10 · ready stock is SUGGESTED; the human decides whether to take it ─────
//
// Jess's 2026-07-21 ruling stands untouched: `consumeFreeStock` is OFF and
// nothing auto-eats labelled stock. The defect is that the number was computed
// and shown to nobody.

const TAKE = "http://t/api/operation/purchase/to-order/take-stock";

async function take(body: unknown) {
  const jwt = await makeJwt("operation");
  return app.fetch(
    new Request(TAKE, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    env,
  );
}

/**
 * Free register records + the pool-usage ledger, on top of whatever base the
 * caller passes. The stock SKUs are written the warehouse's way (`Sonic
 * Single`, not `SONIC-S`) on purpose — that drift is the whole reason
 * `stockMatchKey` exists, and a fixture using the catalog spelling would test
 * a join that does not happen in production.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withStock(base: any, items: unknown[], usage: unknown[] = []) {
  base.ops_stock_items = { data: items, error: null };
  base.ops_stock_pool_usage = { data: usage, error: null };
  return base;
}

const READY_REF = "Ready Stock · Carres Klang";

const unit = (id: string, sku: string, qty = 1, dateIn = "2026-01-01") => ({
  id,
  sku,
  qty,
  date_in: dateIn,
  created_at: `${dateIn}T00:00:00Z`,
});

describe("P10 · the offer", () => {
  it("makes no offer at all when the warehouse holds nothing — the page is untouched", async () => {
    const sb = makeSb(withStock(withDemand(0), []));
    vi.mocked(userClient).mockReturnValue(sb as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await get()).json()) as any;
    const row = demandRow(body);
    expect(row.freeStock).toBe(0);
    expect(row.builds[0].freeStockItemIds).toEqual([]);
    expect(row.qty).toBe(5);
  });

  it("offers what is free, matched across the two SKU vocabularies, and SUBTRACTS NOTHING", async () => {
    const sb = makeSb(
      withStock(withDemand(0), [unit("i1", "Sonic Single"), unit("i2", "Sonic Single")]),
    );
    vi.mocked(userClient).mockReturnValue(sb as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await get()).json()) as any;
    const row = demandRow(body);
    expect(row.freeStock).toBe(2);
    expect(row.builds[0].freeStockItemIds).toEqual(["i1", "i2"]);
    // THE RULING (Jess, 2026-07-21): the row still asks for all 5.
    expect(row.qty).toBe(5);
    expect(body.stockWarehouse).toBe("Carres Klang");
  });

  it("names the warehouse from the record, never a word typed into the page", async () => {
    const t = withStock(withDemand(0), [unit("i1", "Sonic Single")]);
    t.warehouses = { data: [{ id: WAREHOUSE, name: "Carres Semenyih", kind: "own" }], error: null };
    const sb = makeSb(t);
    vi.mocked(userClient).mockReturnValue(sb as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await get()).json()) as any;
    expect(body.stockWarehouse).toBe("Carres Semenyih");
  });

  it("counts the REGISTER, not stock_balances — the two are different tables", async () => {
    // `ops_stock_pool_draw` moves the register. A count read from the rollup
    // would not fall when a unit is taken, so the same units would be offered
    // again tomorrow.
    const sb = makeSb(withStock(withDemand(0), [unit("i1", "Sonic Single")]));
    vi.mocked(userClient).mockReturnValue(sb as never);
    await get();
    expect(sb.tableCalls.ops_stock_items ?? 0).toBeGreaterThan(0);
    expect(sb.tableCalls.stock_balances ?? 0).toBe(0);
  });

  it("asks only for FREE, sound units at the one warehouse", async () => {
    const sb = makeSb(withStock(withDemand(0), [unit("i1", "Sonic Single")]));
    vi.mocked(userClient).mockReturnValue(sb as never);
    await get();
    const f = sb.filters.filter((x) => x.table === "ops_stock_items");
    expect(f).toContainEqual({ table: "ops_stock_items", method: "eq", col: "status", val: "free" });
    expect(f).toContainEqual({
      table: "ops_stock_items", method: "eq", col: "needs_repair", val: false,
    });
    expect(f).toContainEqual({
      table: "ops_stock_items", method: "eq", col: "warehouse_id", val: WAREHOUSE,
    });
    // Ready Stock's OWN definition of ready, mirrored not re-decided. R4
    // releases a quarantined unit back to `free`, so without this the page
    // would offer a DAMAGED unit to a customer's order the day one is
    // released. (`/api/ops/stock/ready`'s header comment says `new` +
    // `exhibition`; its CODE is this list, and the code is the rule.)
    expect(f).toContainEqual({
      table: "ops_stock_items",
      method: "in",
      col: "condition",
      val: ["new", "exhibition", "old", "refurbished"],
    });
  });

  it("stays up when the register is unreachable — the feature goes, the workspace does not", async () => {
    const t = withDemand(0);
    t.ops_stock_items = {
      data: null,
      error: { code: "42P01", message: "relation ops_stock_items does not exist" },
    };
    const sb = makeSb(t);
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await get();
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(demandRow(body).freeStock).toBe(0);
    expect(demandRow(body).qty).toBe(5);
  });
});

describe("P10 · what was already taken", () => {
  it("reads the LEDGER, so a delivered unit does not make the requirement come back", async () => {
    // A reservation-based reading would lose the fact the day the goods go out
    // (`reserved` becomes `sold`) and put a satisfied requirement back on the
    // page.
    const sb = makeSb(
      withStock(withDemand(2), [], [{ ref: READY_REF, sku: "Sonic Single", qty: 2 }]),
    );
    vi.mocked(userClient).mockReturnValue(sb as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await get()).json()) as any;
    const row = demandRow(body);
    // The remainder comes from the database's own generated column, and the
    // ledger only says WHY it is smaller.
    expect(row.qty).toBe(3);
    expect(row.takenFromStock).toBe(2);
  });

  it("nets a customer requirement whichever door committed the unit", async () => {
    // A unit reserved to SO-1204 through the order drawer is a unit we do not
    // have to buy. This page's own button and that one are the same act.
    const sb = makeSb(
      withStock(TABLES(), [], [{ ref: "SO-1204", sku: "5539-1A(LHF)", qty: 1 }]),
    );
    vi.mocked(userClient).mockReturnValue(sb as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await get()).json()) as any;
    // ella's order was ONE module line of 1. Taken from stock, it has nothing
    // left to buy and leaves the workspace entirely.
    const rows = body.proposals.flatMap((p: { rows: unknown[] }) => p.rows);
    expect(rows.some((r: { so: number }) => r.so === 1204)).toBe(false);
    expect(rows.some((r: { so: number }) => r.so === 1207)).toBe(true);
  });

  it("a draw under someone else's reference never touches this row", async () => {
    const sb = makeSb(
      withStock(TABLES(), [], [{ ref: "SO-9999", sku: "5539-1A(LHF)", qty: 1 }]),
    );
    vi.mocked(userClient).mockReturnValue(sb as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await get()).json()) as any;
    const rows = body.proposals.flatMap((p: { rows: unknown[] }) => p.rows);
    expect(rows.some((r: { so: number }) => r.so === 1204)).toBe(true);
  });

  it("a demand is never read as having taken more than it ISSUED", async () => {
    // A second demand to the same destination shares the reference. The
    // ceiling is the row's own counter, so a stranger's draw cannot make a
    // requirement disappear.
    const sb = makeSb(
      withStock(withDemand(0), [], [{ ref: READY_REF, sku: "Sonic Single", qty: 4 }]),
    );
    vi.mocked(userClient).mockReturnValue(sb as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await get()).json()) as any;
    expect(demandRow(body).takenFromStock).toBe(0);
    expect(demandRow(body).qty).toBe(5);
  });
});

describe("P10 · the take", () => {
  /** The demand row's build key, read off the server's own projection. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function demandBuild(sb: any) {
    vi.mocked(userClient).mockReturnValue(sb as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await get()).json()) as any;
    const row = demandRow(body);
    return { orderId: row.orderId, buildKey: row.builds[0].key };
  }

  it("goes through K4's door, one call per record, with the reason and the reference", async () => {
    const sb = makeSb(
      withStock(withDemand(0), [unit("i1", "Sonic Single"), unit("i2", "Sonic Single")]),
    );
    const target = await demandBuild(sb);
    const res = await take(target);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ taken: 2, reference: READY_REF });

    const draws = sb.rpcCalls.filter((r) => r.fn === "ops_stock_pool_draw");
    expect(draws.map((d) => d.args.p_item_id)).toEqual(["i1", "i2"]);
    for (const d of draws) {
      expect(d.args.p_ref).toBe(READY_REF);
      /**
       * P13② (0322) — K4's SIXTH reason, ruled by Loo on 2026-08-04.
       *
       * P10 wrote `other` + a note, because the locked five had no row for
       * *"we had it on the shelf, so we did not raise a purchase order"* and
       * inventing one would have been a ruling on a locked vocabulary. The
       * ruling was made, so the ledger now says it in its own word — and a
       * monthly split whose biggest slice reads `Other` stops being the only
       * answer K5 can give to 为什么一直缺货.
       */
      expect(d.args.p_reason).toBe("used_instead_of_ordering");
      expect(d.args.p_reason).not.toBe("other");
      // The note keeps only what the reason cannot say: WHICH build.
      expect(String(d.args.p_note)).toContain("To Order");
      expect(String(d.args.p_note)).not.toContain("purchase order");
    }
  });

  it("never writes ops_stock_items itself — a fourth door is a second truth", async () => {
    const sb = makeSb(withStock(withDemand(0), [unit("i1", "Sonic Single")]));
    const target = await demandBuild(sb);
    await take(target);
    expect(sb.updates.some((u) => u.table === "ops_stock_items")).toBe(false);
  });

  it("reduces a typed demand through its own door, by what was actually drawn", async () => {
    const sb = makeSb(
      withStock(withDemand(0), [unit("i1", "Sonic Single"), unit("i2", "Sonic Single")]),
    );
    const target = await demandBuild(sb);
    await take(target);
    const calls = sb.rpcCalls.filter((r) => r.fn === "purchasing_demand_record_issue");
    expect(calls).toHaveLength(1);
    expect(calls[0].args.p_qty).toBe(2);
    // Nothing was ordered, so nothing may claim a purchase order.
    expect(calls[0].args.p_po_id).toBeNull();
    expect(sb.updates.some((u) => u.table === "purchase_demands")).toBe(false);
  });

  it("a CUSTOMER row records no demand — the ledger row IS the record", async () => {
    // TWO units, because ella's earlier deadline is served first — the engine's
    // own allocation order, and the reason one unit could never reach PETER.
    const sb = makeSb(
      withStock(TABLES(), [unit("i1", "5539-1A(LHF)"), unit("i2", "5539-1A(LHF)")]),
    );
    vi.mocked(userClient).mockReturnValue(sb as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await get()).json()) as any;
    // `bk-b` is PETER's lone module line — one line, so it IS offerable.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = body.proposals[0].rows.find((r: any) => r.so === 1207);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const build = row.builds.find((b: any) => b.freeStock > 0);
    expect(build).toBeTruthy();

    const res = await take({ orderId: row.orderId, buildKey: build.key });
    expect(res.status).toBe(200);
    const draws = sb.rpcCalls.filter((r) => r.fn === "ops_stock_pool_draw");
    expect(draws).toHaveLength(1);
    expect(draws[0].args.p_ref).toBe("SO-1207");
    // The SECOND record — ella's row was offered the first, and the take draws
    // exactly what the row was shown.
    expect(draws[0].args.p_item_id).toBe("i2");
    expect(sb.rpcCalls.some((r) => r.fn === "purchasing_demand_record_issue")).toBe(false);
  });

  it("taking twice cannot over-draw", async () => {
    const sb = makeSb(withStock(withDemand(0), [unit("i1", "Sonic Single")]));
    const target = await demandBuild(sb);
    await take(target);

    // The unit is no longer free. The door answers null — the whole point of
    // its `where status = free` guard — so the second press takes nothing and,
    // critically, records nothing against the demand.
    const before = sb.rpcCalls.filter((r) => r.fn === "purchasing_demand_record_issue").length;
    sb.rpc.mockImplementation(
      // The real RPC returns a union; this stand-in only ever answers the
      // draw's "nothing was free" null, so the shape is widened at the seam.
      (async (fn: string, args: Record<string, unknown>) => {
        sb.rpcCalls.push({ fn, args });
        return { data: null, error: null };
      }) as never,
    );
    const res = await take(target);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "no_free_stock" });
    expect(sb.rpcCalls.filter((r) => r.fn === "purchasing_demand_record_issue")).toHaveLength(
      before,
    );
  });

  it("refuses a build the recomputation does not know about", async () => {
    const sb = makeSb(withStock(withDemand(0), [unit("i1", "Sonic Single")]));
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await take({ orderId: `demand:${DEMAND_ID}`, buildKey: "not-a-build" });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "unknown_build" });
  });

  it("refuses a row the warehouse holds nothing for", async () => {
    const sb = makeSb(withStock(withDemand(0), []));
    const target = await demandBuild(sb);
    const res = await take(target);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "no_free_stock" });
    expect(sb.rpcCalls.some((r) => r.fn === "ops_stock_pool_draw")).toBe(false);
  });

  it("carries no quantity on the wire — the system suggests, the human accepts", async () => {
    const sb = makeSb(withStock(withDemand(0), [unit("i1", "Sonic Single")]));
    const target = await demandBuild(sb);
    // A browser naming its own number is ignored by the CONTRACT, not by a
    // check somewhere in the body.
    const res = await take({ ...target, qty: 99 });
    expect(res.status).toBe(200);
    const calls = sb.rpcCalls.filter((r) => r.fn === "purchasing_demand_record_issue");
    expect(calls[0].args.p_qty).toBe(1);
  });

  it("is refused to anyone who is not operation", async () => {
    const sb = makeSb(withStock(withDemand(0), [unit("i1", "Sonic Single")]));
    vi.mocked(userClient).mockReturnValue(sb as never);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(TAKE, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: "x", buildKey: "y" }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

/**
 * ── P12 · the cancel door (Loo, 2026-08-04) ─────────────────────────────────
 *
 * `POST /demand/:id/cancel`. It ships in the same card as its button, because
 * C1 deleted a live route whose only caller had gone — *a route with no caller
 * is a bypass one curl away* — and a button with no door is the same fault
 * pointing the other way.
 *
 * These tests are about the DOOR, not the rule: the rule (a part-ordered demand
 * may cancel its remainder, a fully issued one may not, a reason is mandatory)
 * lives in 0321 and was proved against production in a rolled-back transaction.
 * What the route owes is that it reaches that rule with exactly what it was
 * given, sends no quantity, and hands the server's own refusal back by name.
 */
describe("POST /api/operation/purchase/to-order/demand/:id/cancel", () => {
  const CANCEL_ID = "6299ed4e-3c91-43c5-b41b-1e8fe9677c7d";

  async function cancel(
    id: string,
    body: unknown,
    role = "operation",
    rpcResult: { data: unknown; error: unknown } = {
      data: { id: CANCEL_ID, cancelled: 2, issued: 3 },
      error: null,
    },
  ) {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    vi.mocked(userClient).mockReturnValue({
      from: vi.fn(),
      rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        return rpcResult;
      }),
    } as never);
    const jwt = await makeJwt(role);
    const res = await app.fetch(
      new Request(`http://t/api/operation/purchase/to-order/demand/${id}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
    );
    return { res, calls };
  }

  it("reaches purchasing_cancel_demand with the id and the reason — and NO quantity", async () => {
    const { res, calls } = await cancel(CANCEL_ID, { reason: "do not want the other 2" });
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].fn).toBe("purchasing_cancel_demand");
    expect(calls[0].args.p_id).toBe(CANCEL_ID);
    expect(calls[0].args.p_reason).toBe("do not want the other 2");
    /**
     * THE CARD'S OWN "nobody types a quantity", as a test rather than a
     * sentence. A cancel takes the whole remainder, and `remaining_qty` is
     * GENERATED — a quantity on this wire would be a number that can disagree
     * with the one the database computed.
     */
    expect(Object.keys(calls[0].args).sort()).toEqual(["p_id", "p_reason"]);
  });

  it("answers with what was cancelled and what stays ordered", async () => {
    const { res } = await cancel(CANCEL_ID, { reason: "changed our mind" });
    expect(await res.json()).toEqual({ id: CANCEL_ID, cancelled: 2, issued: 3 });
  });

  it("refuses a blank reason before it reaches the database", async () => {
    const { res, calls } = await cancel(CANCEL_ID, { reason: "   " });
    expect(res.status).toBe(400);
    // The RPC would refuse it too (`reason_required`), and the table's CHECK
    // behind that. Three refusals, and the cheapest one runs first.
    expect(calls).toHaveLength(0);
  });

  it("refuses a missing reason", async () => {
    const { res, calls } = await cancel(CANCEL_ID, {});
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("refuses an id that is not a demand id", async () => {
    const { res, calls } = await cancel("PO-2040", { reason: "x" });
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("hands back `already_cancelled` by name", async () => {
    const { res } = await cancel(CANCEL_ID, { reason: "x" }, "operation", {
      data: null,
      error: { code: "P0001", details: "already_cancelled", message: "already cancelled" },
    });
    expect(res.status).toBe(422);
    expect(((await res.json()) as any).code).toBe("already_cancelled");
  });

  it("hands back `nothing_to_cancel` by name", async () => {
    const { res } = await cancel(CANCEL_ID, { reason: "x" }, "operation", {
      data: null,
      error: {
        code: "P0001",
        details: "nothing_to_cancel",
        message: "demand has nothing left to cancel",
      },
    });
    expect(res.status).toBe(422);
    // The two refusals must not read alike: one means it already happened, the
    // other that there is nothing left to do it to.
    expect(((await res.json()) as any).code).toBe("nothing_to_cancel");
  });

  it("is not open to a supplier login", async () => {
    const { res, calls } = await cancel(CANCEL_ID, { reason: "x" }, "supplier");
    expect(res.status).toBe(403);
    expect(calls).toHaveLength(0);
  });
});

/**
 * P12 — CANCEL IS NOT DELETE, asserted rather than promised (Loo, 2026-08-04,
 * naming AutoCount's own weakness: *"backend dont know how can delete due to
 * when testing"*).
 *
 * A SOURCE SCAN, not a request test: a request test only proves the door it
 * knocks on, and what is being claimed here is that NO door exists anywhere.
 * Comments are stripped first — the file is full of prose about why there is no
 * delete, and a scan that reads its own tombstone is a scan that fails on the
 * text explaining it (D0.5b's lesson, twice).
 */
describe("no delete path exists for a purchase demand", () => {
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "to-order.ts"),
    "utf8",
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("the route file registers no DELETE handler at all", () => {
    expect(src).not.toMatch(/\.delete\s*\(/);
  });

  it("the route file never deletes from purchase_demands", () => {
    expect(src).not.toMatch(/purchase_demands[\s\S]{0,200}?\.delete\s*\(/);
    expect(src).not.toMatch(/\.delete\s*\(\s*\)[\s\S]{0,200}?purchase_demands/);
  });

  it("no route path in the file spells a delete or a purge", () => {
    expect(src).not.toMatch(/["'`][^"'`]*\/(delete|purge|remove)\b/i);
  });

  it("the only demand doors are create, cancel and the issue record", () => {
    const rpcs = [...src.matchAll(/rpc\(\s*"(purchasing_[a-z_]*demand[a-z_]*)"/g)].map(
      (m) => m[1],
    );
    expect([...new Set(rpcs)].sort()).toEqual([
      "purchasing_cancel_demand",
      "purchasing_create_demand",
      "purchasing_demand_record_issue",
    ]);
  });
});

/**
 * P15 — THE SOURCE, AND THE PICKER'S OWN READ (Loo, 2026-08-04).
 *
 * `purpose` was a hardcoded `"ready_stock"` on this route because the RPC
 * refused everything else by name (Jess, 2026-08-03 — *"V1 buys READY STOCK
 * only"*). 0319 wrote that refusal so that *"the day one is approved this gate
 * is the only thing that changes"*; Loo approved the four the CHECK holds and
 * 0323 changed that one gate. The route now forwards what the operator chose.
 */
describe("POST …/to-order/demand — the Source rides the wire (P15)", () => {
  const DEST = "2f181917-f4e1-42b2-9e25-d7ee6785424a";

  async function create(body: unknown, role = "operation") {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    vi.mocked(userClient).mockReturnValue({
      from: vi.fn(),
      rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        return { data: { id: "d1", supplier_id: "s1" }, error: null };
      }),
    } as never);
    const jwt = await makeJwt(role);
    const res = await app.fetch(
      new Request("http://t/api/operation/purchase/to-order/demand", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
    );
    return { res, calls };
  }

  const base = { sku: "SONIC-S", qty: 2, destinationId: DEST };

  it("forwards each of the four purposes the store can record", async () => {
    for (const p of ["ready_stock", "display", "warranty", "office"]) {
      const { res, calls } = await create({ ...base, purpose: p });
      expect(res.status).toBe(200);
      expect(calls[0].fn).toBe("purchasing_create_demand");
      expect(calls[0].args.p_purpose).toBe(p);
    }
  });

  it("refuses a purpose the database has no value for, before it reaches the RPC", async () => {
    // `Spare Parts` and `Other…` are ruled WORDS with no CHECK value. The
    // dialog does not offer them; this proves the wire does not either, so the
    // three lists (CHECK · function gate · shared constant) cannot drift into
    // a fourth that only the api believes.
    for (const p of ["spare_parts", "other", "", "READY_STOCK"]) {
      const { res, calls } = await create({ ...base, purpose: p });
      expect(res.status).toBe(400);
      expect(calls).toHaveLength(0);
    }
  });

  it("a browser on the pre-P15 bundle still works, and means ready stock", async () => {
    // No `purpose` key at all — the only thing that browser could have meant,
    // and the RPC's own default.
    const { res, calls } = await create(base);
    expect(res.status).toBe(200);
    expect(calls[0].args.p_purpose).toBe("ready_stock");
  });

  it("NO SUPPLIER may be smuggled through the body", async () => {
    /**
     * Jess's 2026-08-03 ruling as a test: a product has ONE factory and the
     * server derives it from the SKU. P15 shows the supplier in the dialog —
     * that is the derivation read back, never a second answer. The RPC has no
     * supplier parameter, so a body carrying one must reach nothing.
     */
    const { res, calls } = await create({
      ...base,
      purpose: "display",
      supplierId: "11111111-1111-1111-1111-111111111111",
      supplier: "Somebody Else",
    });
    expect(res.status).toBe(200);
    expect(Object.keys(calls[0].args).sort()).toEqual([
      "p_destination_id",
      "p_purpose",
      "p_qty",
      "p_remark",
      "p_required_by",
      "p_sku",
    ]);
  });
});

describe("GET …/to-order/demand/pick-items — the picker's own read (P15)", () => {
  const WH = "2f181917-f4e1-42b2-9e25-d7ee6785424a";

  function client(opts?: { stockRows?: Record<string, unknown>[] }) {
    const stock = opts?.stockRows ?? [
      // free · sound · at the warehouse → On Hand AND Free
      { id: "u1", sku: "SONIC-S", qty: 1, status: "free", condition: "new", needs_repair: false },
      { id: "u2", sku: "SONIC-S", qty: 1, status: "free", condition: "new", needs_repair: false },
      // reserved → On Hand, never Free
      { id: "u3", sku: "SONIC-S", qty: 1, status: "reserved", condition: "new", needs_repair: false },
      // quarantined → physically here, so On Hand; never Free (R4)
      { id: "u4", sku: "SONIC-S", qty: 1, status: "on_hold", condition: "new", needs_repair: false },
      // on its way → neither
      { id: "u5", sku: "SONIC-S", qty: 9, status: "incoming", condition: "new", needs_repair: false },
    ];
    return {
      from: vi.fn((table: string) => {
        const rows =
          table === "product_skus"
            ? [
                { sku: "5539-CNR", variant: "Corner", variant_kind: "part", supplier_id: "sup1", model_id: "m1" },
                { sku: "SONIC-S", variant: "Single", variant_kind: "size", supplier_id: "sup2", model_id: "m2" },
              ]
            : table === "product_models"
              ? [
                  { id: "m1", name: "Booqit" },
                  { id: "m2", name: "Sonic" },
                ]
              : table === "suppliers"
                ? [
                    { id: "sup1", name: "Ohana" },
                    { id: "sup2", name: "Nice Future" },
                  ]
                : table === "warehouses"
                  ? [{ id: WH, name: "Carres Klang", kind: "own" }]
                  : table === "ops_stock_items"
                    ? stock
                    : [];
        const q: Record<string, unknown> = {};
        const chain = () => q;
        // Every narrowing the route applies, honoured so the shaped rows are
        // what the route would really have seen.
        q.select = vi.fn(chain);
        q.eq = vi.fn((col: string, val: unknown) => {
          if (table === "ops_stock_items" && col === "status") {
            (q as { _rows: unknown[] })._rows = stock.filter((r) => r.status === val);
          }
          if (table === "ops_stock_items" && col === "needs_repair") {
            const cur = ((q as { _rows?: Record<string, unknown>[] })._rows ?? stock);
            (q as { _rows: unknown[] })._rows = cur.filter((r) => r.needs_repair === val);
          }
          return q;
        });
        q.in = vi.fn((col: string, vals: unknown[]) => {
          if (table === "ops_stock_items") {
            const cur = ((q as { _rows?: Record<string, unknown>[] })._rows ?? stock);
            (q as { _rows: unknown[] })._rows = cur.filter((r) =>
              vals.includes(r[col] as never),
            );
          }
          return q;
        });
        q.not = vi.fn(chain);
        q.order = vi.fn(chain);
        q.then = (resolve: (v: unknown) => unknown) =>
          resolve({
            data: table === "ops_stock_items"
              ? ((q as { _rows?: unknown[] })._rows ?? stock)
              : rows,
            error: null,
          });
        return q;
      }),
      rpc: vi.fn(),
    };
  }

  async function pick(c = client()) {
    vi.mocked(userClient).mockReturnValue(c as never);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/purchase/to-order/demand/pick-items", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    return { res, body: (await res.json()) as { items: unknown[]; stockWarehouse: string | null } };
  }

  it("leads with the SKU, so two items that share a name are told apart", async () => {
    const { res, body } = await pick();
    expect(res.status).toBe(200);
    const items = body.items as { sku: string; label: string }[];
    // `5539-CNR` is a PART variant, so `railItemLabel` has no size letter to
    // add and the label is the bare model — P15's defect 1, at the source.
    const corner = items.find((i) => i.sku === "5539-CNR")!;
    expect(corner.label).toBe("Booqit");
    expect(corner.sku).toBe("5539-CNR");
  });

  it("the supplier is DERIVED and rides along as a fact", async () => {
    const { body } = await pick();
    const items = body.items as { sku: string; supplier: string | null }[];
    expect(items.find((i) => i.sku === "5539-CNR")!.supplier).toBe("Ohana");
    expect(items.find((i) => i.sku === "SONIC-S")!.supplier).toBe("Nice Future");
  });

  it("the three stock numbers each mean a different thing", async () => {
    const { body } = await pick();
    const s = (body.items as { sku: string; onHand: number; reserved: number; free: number }[])
      .find((i) => i.sku === "SONIC-S")!;
    // 2 free + 1 reserved + 1 on hold are all standing in the building.
    expect(s.onHand).toBe(4);
    expect(s.reserved).toBe(1);
    // FREE is P10's rule: free · sound · at that warehouse. A quarantined unit
    // is on hand and can never be free; an incoming one is neither.
    expect(s.free).toBe(2);
    expect(body.stockWarehouse).toBe("Carres Klang");
  });

  it("a SKU with no supplier is not offered — the RPC would refuse it by name", async () => {
    const { body } = await pick();
    // The route asks the database for `supplier_id is not null`; nothing here
    // may arrive with a null supplier, because offering it teaches the operator
    // that refusals are random rather than a configuration hole.
    for (const i of body.items as { supplier: string | null }[]) {
      expect(i.supplier).not.toBeNull();
    }
  });

  it("the register being unreachable costs the numbers, never the dialog", async () => {
    const c = client();
    const realFrom = c.from;
    c.from = vi.fn((table: string) => {
      if (table === "ops_stock_items") throw new Error("register down");
      return (realFrom as (t: string) => unknown)(table);
    }) as never;
    const { res, body } = await pick(c);
    // A demand can always be typed. The offer degrades to zero, and zero is
    // what the grid would offer too — never an invented number.
    expect(res.status).toBe(200);
    expect((body.items as { free: number }[]).every((i) => i.free === 0)).toBe(true);
  });
});

/**
 * P18 — THE ORDER'S PROCEED DATE ON THE WIRE (Loo, 2026-08-04 / 2026-08-05).
 *
 * TWO tests, and they cannot replace each other. The BEHAVIOUR test proves the
 * mapping from the order row to the wire; it CANNOT prove the column is asked
 * for, because `makeSb` returns its fixture whatever the `select` string says —
 * so a route that never named `proceed_date` would pass it. The SOURCE SCAN is
 * the half that holds PostgREST: an unnamed column comes back `undefined` in
 * production while every mock in this file stays green.
 */
describe("P18 · the proceed date rides the To Order wire", () => {
  it("carries the order's proceed date onto its row, sliced to a bare day", () => {
    const t = TABLES();
    // A real production shape, measured 2026-08-05: a timestamp-ish value must
    // reach the wire as `YYYY-MM-DD`, because the header compares it to `today`
    // as a STRING.
    (t.orders.data as Record<string, unknown>[])[0]!.proceed_date = "2026-07-21";
    (t.orders.data as Record<string, unknown>[])[1]!.proceed_date = null;
    return (async () => {
      const sb = makeSb(t);
      vi.mocked(userClient).mockReturnValue(sb as never);
      const res = await get();
      expect(res.status).toBe(200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = (await res.json()) as any;
      const rows = body.proposals[0].rows as { so: number; proceedDate: string | null }[];
      const bySo = new Map(rows.map((r) => [r.so, r.proceedDate]));
      expect(bySo.get(1207)).toBe("2026-07-21");
      // An order with no plan says nothing rather than borrowing its neighbour's.
      expect(bySo.get(1204)).toBeNull();
    })();
  });

  it("the order reads NAME the column — the mock cannot prove this, PostgREST needs it", () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "to-order.ts"),
      "utf8",
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

    // Every `.from("orders").select(...)` in this file must ask for it. There
    // are TWO: the demand read, and the ordered/receipt read-back — and the
    // second is not optional, because an order whose every line is bought has no
    // demand rows left, so its group is receipts alone.
    const selects = [
      ...src.matchAll(/\.from\(\s*"orders"\s*\)\s*\n?\s*\.select\(\s*([\s\S]*?)\)\s*\n?\s*\./g),
    ].map((m) => m[1]!);
    expect(selects).toHaveLength(2);
    for (const s of selects) expect(s).toContain("proceed_date");
  });
});

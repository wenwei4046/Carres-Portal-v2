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
import { addWorkingDays, myHolidaySet } from "@carres/shared";
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
  suppliers: { data: [{ id: OHANA, name: "Ohana", kind: "own_logistics" }], error: null },
  delivery_partners: {
    data: [{ id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", name: "NETS" }],
    error: null,
  },
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
      { sku: "5539-1B(LHF)", supplier_id: OHANA, cost: 100, variant: "1B(LHF)",
        product_models: { category: "sofa", name: "Booqit" } },
      { sku: "5539-CNR", supplier_id: OHANA, cost: 100, variant: "CNR",
        product_models: { category: "sofa", name: "Booqit" } },
      { sku: "5539-2A(RHF)", supplier_id: OHANA, cost: 100, variant: "2A(RHF)",
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
    if (fn === "purchasing_issue_pos_batch") {
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

async function get(query = "") {
  const jwt = await makeJwt("operation");
  return app.fetch(new Request(`${READ}${query}`, { headers: { Authorization: `Bearer ${jwt}` } }), env);
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

  it("scopes only after the full server recomputation and returns an explanatory summary", async () => {
    const t = TABLES();
    const todayIsoStr = new Date().toISOString().slice(0, 10);
    t.purchase_orders = {
      data: [
        {
          id: "PO-1900",
          supplier_id: OHANA,
          placed_at: "2025-01-01T09:00:00Z",
          so_refs: [1207],
        },
      ],
      error: null,
    };
    t.purchase_order_lines = {
      data: [{ po_id: "PO-1900", sku: "5539-1B(LHF)", qty: 1, received_qty: 1 }],
      error: null,
    };
    const sb = makeSb(t);
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await get("?so=1207");
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;

    expect(body.proposals.flatMap((p: any) => p.rows).every((r: any) => r.so === 1207)).toBe(true);
    expect(body.unresolved).toEqual([]);
    expect(body.ordered).toEqual([
      expect.objectContaining({ poId: "PO-1900", so: 1207 }),
    ]);
    expect(body.scope).toMatchObject({
      so: 1207,
      orderFound: true,
      alreadyIssued: 1,
    });
    expect(todayIsoStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns only the three demand-local blocker kinds; pickup remains document-level", async () => {
    const t = TABLES();
    (t.product_skus.data as { sku: string; supplier_id: string | null; cost: number | null }[])
      .find((row) => row.sku === "5539-CNR")!.supplier_id = null;
    (t.product_skus.data as { sku: string; cost: number | null }[])
      .find((row) => row.sku === "5539-1A(LHF)")!.cost = null;
    const undated = (t.orders.data as { id: string; delivery_date: string | null; delivery_date_tbd: boolean }[])
      .find((order) => order.id === "o2")!;
    undated.delivery_date = null;
    undated.delivery_date_tbd = true;
    (t.suppliers.data as { kind: string }[])[0].kind = "factory_pickup";
    const sb = makeSb(t);
    vi.mocked(userClient).mockReturnValue(sb as never);

    const body = (await (await get()).json()) as {
      blockedDemand: { code: string; sku: string; so: number | null }[];
    };
    expect(new Set(body.blockedDemand.map((blocker) => blocker.code))).toEqual(
      new Set(["blocked_delivery_date", "unresolved_supplier", "cost_required"]),
    );
    expect(body.blockedDemand).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unresolved_supplier", sku: "5539-CNR", so: 1207 }),
        expect.objectContaining({ code: "blocked_delivery_date", sku: "5539-1A(LHF)", so: 1204 }),
        expect.objectContaining({ code: "cost_required", sku: "5539-1A(LHF)", so: 1204 }),
      ]),
    );
    expect(body.blockedDemand.some((blocker) => blocker.code.includes("partner"))).toBe(false);
  });

  it("rejects an invalid Sales Order scope without running the engine", async () => {
    const res = await get("?so=not-a-number");
    expect(res.status).toBe(400);
    expect(userClient).not.toHaveBeenCalled();
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

    expect(sb.rpcCalls.filter((c) => c.fn === "purchasing_issue_pos_batch")).toHaveLength(1);
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

    const batch = sb.rpcCalls.find((c) => c.fn === "purchasing_issue_pos_batch")!;
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

    // Destination AND expected arrival ride every document into the same RPC
    // transaction that creates it. No post-create partial state exists.
    const pos = sb.rpcCalls.find((c) => c.fn === "purchasing_issue_pos_batch")!.args.p_pos as {
      destination_id: string;
      eta_date: string;
    }[];
    expect(pos).toHaveLength(2);
    expect(pos.every((po) => po.destination_id === AL)).toBe(true);
    expect(pos.every((po) => /^\d{4}-\d{2}-\d{2}$/.test(po.eta_date))).toBe(true);
    expect(sb.updates.filter((u) => u.table === "purchase_orders")).toHaveLength(0);
  });

  it("blocks only the affected document when catalog cost is unknown", async () => {
    const t = TABLES();
    (t.product_skus.data as { sku: string; cost: number | null }[]).find(
      (row) => row.sku === "5539-CNR",
    )!.cost = null;
    const sb = makeSb(t);
    vi.mocked(userClient).mockReturnValue(sb as never);
    const plan = await defaultPlan(sb);
    const res = await post({
      supplierId: OHANA,
      category: "sofa",
      destinationId: KLANG,
      purchaseOrders: plan,
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "cost_required", sku: "5539-CNR" });
    expect(sb.rpcCalls.filter((c) => c.fn === "purchasing_issue_pos_batch")).toHaveLength(0);
  });

  it("records an explicit Free of Charge decision; unknown cost never becomes RM0", async () => {
    const t = TABLES();
    (t.product_skus.data as { sku: string; cost: number | null }[]).find(
      (row) => row.sku === "5539-CNR",
    )!.cost = null;
    const sb = makeSb(t);
    vi.mocked(userClient).mockReturnValue(sb as never);
    const plan = await defaultPlan(sb);
    const res = await post({
      supplierId: OHANA,
      category: "sofa",
      destinationId: KLANG,
      purchaseOrders: plan.map((doc) =>
        doc.buildKeys.length > 1
          ? {
              ...doc,
              lineDecisions: [
                { sku: "5539-CNR", treatment: "free_of_charge", reason: "Warranty replacement" },
              ],
            }
          : doc,
      ),
    });
    expect(res.status).toBe(200);

    const lines = (
      sb.rpcCalls.find((c) => c.fn === "purchasing_issue_pos_batch")!.args.p_pos as {
        lines: {
          sku: string;
          cost: number;
          cost_source: string;
          commercial_treatment: string;
          commercial_reason: string | null;
        }[];
      }[]
    ).flatMap((po) => po.lines);
    expect(lines.find((l) => l.sku === "5539-CNR")).toMatchObject({
      cost: 0,
      cost_source: "hand_entered",
      commercial_treatment: "free_of_charge",
      commercial_reason: "Warranty replacement",
    });
    expect(lines.find((l) => l.sku === "5539-1A(LHF)")!.commercial_treatment).toBe("normal");
  });

  it("records a hand-entered transaction cost without changing Catalog", async () => {
    const t = TABLES();
    (t.product_skus.data as { sku: string; cost: number | null }[]).find(
      (row) => row.sku === "5539-CNR",
    )!.cost = null;
    const sb = makeSb(t);
    vi.mocked(userClient).mockReturnValue(sb as never);
    const plan = await defaultPlan(sb);
    const res = await post({
      supplierId: OHANA,
      category: "sofa",
      destinationId: KLANG,
      purchaseOrders: plan.map((doc) =>
        doc.buildKeys.length > 1
          ? {
              ...doc,
              lineDecisions: [
                {
                  sku: "5539-CNR",
                  treatment: "normal",
                  unitCost: 880,
                  costSource: "hand_entered",
                },
              ],
            }
          : doc,
      ),
    });
    expect(res.status).toBe(200);
    const lines = (
      sb.rpcCalls.find((c) => c.fn === "purchasing_issue_pos_batch")!.args.p_pos as {
        lines: { sku: string; cost: number; cost_source: string }[];
      }[]
    ).flatMap((po) => po.lines);
    expect(lines.find((line) => line.sku === "5539-CNR")).toMatchObject({
      cost: 880,
      cost_source: "hand_entered",
    });
    expect(sb.updates.filter((update) => update.table === "product_skus")).toHaveLength(0);
  });

  it("rejects a stale catalog-seeded cost before the creation RPC", async () => {
    const sb = makeSb(TABLES());
    vi.mocked(userClient).mockReturnValue(sb as never);
    const plan = await defaultPlan(sb);
    const target = plan.find((doc) => doc.buildKeys.length > 1)!;
    const res = await post({
      supplierId: OHANA,
      category: "sofa",
      destinationId: KLANG,
      purchaseOrders: [
        {
          ...target,
          lineDecisions: [
            {
              sku: "5539-CNR",
              treatment: "normal",
              unitCost: 999,
              costSource: "catalog",
            },
          ],
        },
      ],
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "stale_catalog_cost", sku: "5539-CNR" });
    expect(sb.rpcCalls.filter((c) => c.fn === "purchasing_issue_pos_batch")).toHaveLength(0);
  });

  it("rejects Free of Charge without an explicit reason at the request boundary", async () => {
    const sb = makeSb(TABLES());
    vi.mocked(userClient).mockReturnValue(sb as never);
    const plan = await defaultPlan(sb);
    const res = await post({
      supplierId: OHANA,
      category: "sofa",
      destinationId: KLANG,
      purchaseOrders: [
        {
          ...plan[0],
          lineDecisions: [
            { sku: "5539-CNR", treatment: "free_of_charge", reason: "" },
          ],
        },
      ],
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "invalid_param" });
    expect(sb.rpcCalls.filter((c) => c.fn === "purchasing_issue_pos_batch")).toHaveLength(0);
  });

  it("an unrelated valid document remains issuable when another document needs cost", async () => {
    const t = TABLES();
    (t.product_skus.data as { sku: string; cost: number | null }[]).find(
      (row) => row.sku === "5539-CNR",
    )!.cost = null;
    const sb = makeSb(t);
    vi.mocked(userClient).mockReturnValue(sb as never);
    const plan = await defaultPlan(sb);
    const unaffected = plan.find((doc) => doc.buildKeys.length === 1)!;
    const res = await post({
      supplierId: OHANA,
      category: "sofa",
      destinationId: KLANG,
      purchaseOrders: [unaffected],
    });
    expect(res.status).toBe(200);
    const pos = sb.rpcCalls.find((c) => c.fn === "purchasing_issue_pos_batch")!.args
      .p_pos as unknown[];
    expect(pos).toHaveLength(1);
  });

  it("factory pickup requires one valid procurement partner on every Issue document", async () => {
    const t = TABLES();
    (t.suppliers.data as { kind: string }[])[0].kind = "factory_pickup";
    const sb = makeSb(t);
    vi.mocked(userClient).mockReturnValue(sb as never);
    const plan = await defaultPlan(sb);
    const blocked = await post({
      supplierId: OHANA,
      category: "sofa",
      destinationId: KLANG,
      purchaseOrders: plan,
    });
    expect(blocked.status).toBe(422);
    expect(await blocked.json()).toMatchObject({ code: "pickup_partner_required" });
    expect(sb.rpcCalls.filter((c) => c.fn === "purchasing_issue_pos_batch")).toHaveLength(0);

    const partnerId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const issued = await post({
      supplierId: OHANA,
      category: "sofa",
      destinationId: KLANG,
      purchaseOrders: plan.map((doc) => ({ ...doc, procurementPartnerId: partnerId })),
    });
    expect(issued.status).toBe(200);
    const pos = sb.rpcCalls.find((c) => c.fn === "purchasing_issue_pos_batch")!.args
      .p_pos as { procurement_partner_id: string }[];
    expect(pos.every((po) => po.procurement_partner_id === partnerId)).toBe(true);
  });

  it("own-logistics documents cannot smuggle a procurement partner", async () => {
    const sb = makeSb(TABLES());
    vi.mocked(userClient).mockReturnValue(sb as never);
    const plan = await defaultPlan(sb);
    const res = await post({
      supplierId: OHANA,
      category: "sofa",
      destinationId: KLANG,
      purchaseOrders: plan.map((doc) => ({
        ...doc,
        procurementPartnerId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      })),
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "pickup_partner_not_allowed" });
  });

  it("an undated Customer Order is visible but crafted Issue is blocked server-side", async () => {
    const t = TABLES();
    const ella = (t.orders.data as { id: string; delivery_date_tbd: boolean; delivery_date: string | null }[])
      .find((order) => order.id === "o2")!;
    ella.delivery_date_tbd = true;
    ella.delivery_date = null;
    const sb = makeSb(t);
    vi.mocked(userClient).mockReturnValue(sb as never);
    const plan = await defaultPlan(sb);
    const undated = plan.find((doc) => doc.buildKeys.length === 1)!;
    const res = await post({
      supplierId: OHANA,
      category: "sofa",
      destinationId: KLANG,
      purchaseOrders: [undated],
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "blocked_delivery_date" });
    expect(sb.rpcCalls.filter((c) => c.fn === "purchasing_issue_pos_batch")).toHaveLength(0);
  });

  it("unresolved supplier demand does not globally block an unrelated valid document", async () => {
    const t = TABLES();
    (t.product_skus.data as { sku: string; supplier_id: string | null }[]).find(
      (row) => row.sku === "5539-CNR",
    )!.supplier_id = null;
    const sb = makeSb(t);
    vi.mocked(userClient).mockReturnValue(sb as never);
    const plan = await defaultPlan(sb);
    const unaffected = plan.find((doc) => doc.buildKeys.length === 1)!;
    const res = await post({
      supplierId: OHANA,
      category: "sofa",
      destinationId: KLANG,
      purchaseOrders: [unaffected],
    });
    expect(res.status).toBe(200);
    expect(sb.rpcCalls.filter((c) => c.fn === "purchasing_issue_pos_batch")).toHaveLength(1);
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
    expect(sb.rpcCalls.filter((c) => c.fn === "purchasing_issue_pos_batch")).toHaveLength(0);
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
    expect(sb.rpcCalls.filter((c) => c.fn === "purchasing_issue_pos_batch")).toHaveLength(0);
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
    expect(sb.rpcCalls.filter((c) => c.fn === "purchasing_issue_pos_batch")).toHaveLength(0);
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
    const batch = sb.rpcCalls.find((c) => c.fn === "purchasing_issue_pos_batch")!;
    expect((batch.args.p_pos as unknown[]).length).toBe(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(((await res.json()) as any).pos).toHaveLength(1);
  });

  it("creates every document in ONE transaction, not one call each", async () => {
    const sb = makeSb(TABLES());
    const plan = await planFor(sb);
    await issue({ purchaseOrders: plan });
    expect(sb.rpcCalls.filter((c) => c.fn === "purchasing_issue_pos_batch")).toHaveLength(1);
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
    const batch = sb.rpcCalls.find((c) => c.fn === "purchasing_issue_pos_batch")!;
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

    const pos = sb.rpcCalls.find((c) => c.fn === "purchasing_issue_pos_batch")!.args.p_pos as {
      destination_id: string;
      eta_date: string;
    }[];
    expect(pos).toHaveLength(2);
    expect(pos.every((po) => po.destination_id === KLANG)).toBe(true);
    expect(pos.every((po) => /^\d{4}-\d{2}-\d{2}$/.test(po.eta_date))).toBe(true);

    // 14 production days on Ohana's week (Sunday off) + 1 transit day on the
    // OFFICE week — arranging the movement is our work, not the factory's.
    //
    // THE HOLIDAY SET IS PART OF THE ARITHMETIC, not a detail. `expectedArrivalOf`
    // defaults to `myHolidaySet()`, so a naive recomputation here is only equal on
    // the days no Malaysian public holiday falls inside the window — which is why
    // this line passed for a week and then failed on 2026-08-10, when Maulidur
    // Rasul (2026-08-25, my-holidays.ts:41) landed in the 14-day production leg.
    // The route was right and the expectation was short by exactly that day.
    const holidays = myHolidaySet();
    const expected = addWorkingDays(
      addWorkingDays(new Date().toISOString().slice(0, 10), 14, { offDays: [0], holidays }),
      1,
      { offDays: [0, 6], holidays },
    );
    expect(pos.every((po) => po.eta_date === expected)).toBe(true);
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
    const pos = sb.rpcCalls.find((c) => c.fn === "purchasing_issue_pos_batch")!.args.p_pos as {
      eta_date: string | null;
    }[];
    // A guessed arrival would be read downstream as a measurement (P1's law).
    expect(pos.every((po) => po.eta_date === null)).toBe(true);
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

    // Measured 2026-08-01: `purchasing_issue_pos_batch` writes no audit row of
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

/* THE TYPED-DEMAND-IN-GRID CONTRACTS RETIRED WITH THE GRID SPLIT
 * (CARD-2026-08-18-manual-purchase §1, executed 2026-08-19):
 *   · the 0320 remainder contract now surfaces on the Manual Purchase
 *     register and detail (`OperationManualPurchase.test.tsx`), and the
 *     record-issue call moved INSIDE `purchasing_issue_pos_batch` (0361,
 *     `manual-purchase.test.ts`) — atomic, not after-the-fact.
 *   · P10's offer/take on TYPED rows lost its rendering surface with the
 *     rows themselves; the requester now sees WHAT WE ALREADY HAVE before
 *     submitting and the approver cuts to zero with a reason. The pool-
 *     draw doors (0322) are untouched; the customer-row free-stock
 *     subtraction in the grid is untouched and still covered above. */

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
    // `Other…` is a ruled WORD with no CHECK value (`spare_parts` joined the
    // CHECK in 0359, on the Manual Purchase ruling). This proves the wire
    // refuses what the store cannot hold, so the three lists (CHECK · function
    // gate · shared constant) cannot drift into a fourth that only the api
    // believes.
    for (const p of ["other", "", "READY_STOCK"]) {
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
    const here = dirname(fileURLToPath(import.meta.url));
    const strip = (path: string) =>
      readFileSync(path, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
    // CARD-2026-08-20 — the demand read moved to `lib/purchase-demand-read.ts`
    // (Purchase Demands reads the same recomputation), so the guard follows it
    // rather than shrinking: the whole point is that NO orders read anywhere in
    // this engine may drop the column.
    const src =
      strip(join(here, "to-order.ts")) +
      "\n" +
      strip(join(here, "..", "..", "lib", "purchase-demand-read.ts"));

    // Every `.from("orders").select(...)` in the engine must ask for it: the
    // demand read, the ordered/receipt read-back and the scoped SO lens — and
    // the second is not optional, because an order whose every line is bought
    // has no demand rows left, so its group is receipts alone.
    const selects = [
      ...src.matchAll(/\.from\(\s*"orders"\s*\)\s*\n?\s*\.select\(\s*([\s\S]*?)\)\s*\n?\s*\./g),
    ].map((m) => m[1]!);
    expect(selects).toHaveLength(3);
    for (const s of selects) expect(s).toContain("proceed_date");
  });
});

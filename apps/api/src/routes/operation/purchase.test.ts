import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWK,
  type KeyLike,
} from "jose";
import {
  buildPurchaseTodayReport,
  buildPurchaseChaseReceive,
  myHolidaySet,
  purchaseTodayResponseSchema,
  type DemandLine,
} from "@carres/shared";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
import { userClient } from "../../lib/supabase";

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

/**
 * Per-table supabase mock: `from(table)` returns a fresh thenable query builder
 * bound to `resultsByTable[table]`. Chain methods (select/in/or/eq/…) return the
 * builder; awaiting the builder resolves to `{ data, error }`. The builders map
 * exposes each table's last builder so tests can inspect the applied filters.
 */
function makeSb(resultsByTable: Record<string, { data: unknown; error: unknown }>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builders: Record<string, any> = {};
  const CHAIN = [
    "select",
    "in",
    "or",
    "eq",
    "neq",
    "ilike",
    "not",
    "is",
    "order",
    "limit",
    "gt",
    "gte",
    "lt",
    "lte",
  ];
  function tableBuilder(result: { data: unknown; error: unknown }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {};
    for (const m of CHAIN) builder[m] = vi.fn(() => builder);
    builder.maybeSingle = vi.fn().mockResolvedValue(result);
    builder.single = vi.fn().mockResolvedValue(result);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    builder.then = (resolve: any, reject: any) =>
      Promise.resolve(result).then(resolve, reject);
    return builder;
  }
  const from = vi.fn((table: string) => {
    const b = tableBuilder(resultsByTable[table] ?? { data: [], error: null });
    builders[table] = b;
    return b;
  });
  return { from, builders };
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

const URL = "http://t/api/operation/purchase/today";

// =====================================================================
// Auth
// =====================================================================
describe("GET /api/operation/purchase/today — auth", () => {
  it("401 without Authorization", async () => {
    const res = await app.fetch(new Request(URL), env);
    expect(res.status).toBe(401);
  });

  it("403 for a dealer role", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(URL, { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("403 for a supplier role", async () => {
    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request(URL, { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

// =====================================================================
// Shape / happy path (integration through the route)
// =====================================================================
describe("GET /api/operation/purchase/today — assembly", () => {
  it("200 with an empty list when there are no live orders", async () => {
    const sb = makeSb({ orders: { data: [], error: null } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(URL, { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const parsed = purchaseTodayResponseSchema.parse(body);
    expect(parsed.bundles).toEqual([]);
    expect(parsed.bySku).toEqual([]);
    expect(parsed.summary.toPlaceBundles).toBe(0);
  });

  it("nets an open PO, keeps free stock advisory, and bed-set bundles", async () => {
    const orders = [
      {
        id: "ord-A",
        so: 1201,
        customer_name: "陈先生",
        status: "place",
        source_system: null,
        delivery_date: "2026-09-30",
        delivery_date_tbd: false,
        placed_at: "2026-07-01T00:00:00Z",
        created_at: "2026-07-01T00:00:00Z",
      },
    ];
    const lines = [
      {
        id: "ln-m",
        order_id: "ord-A",
        sku: "MAT-K",
        qty: 1,
        product_skus: {
          supplier_id: "sup-1",
          cost: 800,
          product_models: { category: "mattress" },
        },
      },
      {
        id: "ln-b",
        order_id: "ord-A",
        sku: "BF-K",
        qty: 1,
        product_skus: {
          supplier_id: "sup-1",
          cost: 500,
          product_models: { category: "bedframe" },
        },
      },
    ];
    // MAT-K fully covered by an open PO → toOrder 0. BF-K has free stock but
    // (make-to-order) it is advisory only → BF-K still needs ordering.
    const poLines = [
      { sku: "MAT-K", qty: 1, received_qty: 0, purchase_orders: { status: "open" } },
    ];
    const warehouses = [{ id: "wh-klg", name: "Carres Klang" }];
    const stock = [{ sku: "BF-K", qty: 3, reserved: 0, warehouse_id: "wh-klg" }];

    const sb = makeSb({
      orders: { data: orders, error: null },
      order_lines: { data: lines, error: null },
      purchase_order_lines: { data: poLines, error: null },
      warehouses: { data: warehouses, error: null },
      stock_balances: { data: stock, error: null },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(URL, { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const parsed = purchaseTodayResponseSchema.parse(await res.json());

    // AutoCount exclusion filter is applied on the orders read.
    expect(sb.builders.orders.in).toHaveBeenCalledWith("status", [
      "place",
      "proceed_order",
    ]);
    expect(sb.builders.orders.or).toHaveBeenCalledWith(
      "source_system.is.null,source_system.neq.autocount",
    );

    // ONE bed-set bundle (mattress + bedframe co-bundle in the same order).
    expect(parsed.bundles).toHaveLength(1);
    const bundle = parsed.bundles[0];
    expect(bundle.group).toBe("bedset");
    expect(bundle.so).toBe(1201);
    // Customer name is carried through to the card's primary label.
    expect(bundle.customerName).toBe("陈先生");
    expect(bundle.lineIds.sort()).toEqual(["ln-b", "ln-m"]);
    // Only BF-K still needs a PO (MAT-K netted by the open PO).
    expect(bundle.toOrder).toBe(1);
    expect(bundle.items.map((i) => i.sku)).toEqual(["BF-K"]);
    expect(bundle.items[0].toOrder).toBe(1);
    // System cost (product_skus.cost) rides on the item — DISPLAY only.
    expect(bundle.items[0].cost).toBe(500);
    // raiseBy = deadline − max(lead) working days; deterministic (no `today`).
    expect(bundle.raiseBy).toBeTruthy();

    // Per-SKU buy list: only BF-K (MAT-K fully covered), free stock advisory (3).
    expect(parsed.bySku).toHaveLength(1);
    expect(parsed.bySku[0]).toMatchObject({
      sku: "BF-K",
      supplierId: "sup-1",
      toOrder: 1,
      freeStock: 3,
      coveredByOpenPo: 0,
    });
    expect(parsed.summary.toPlaceBundles).toBe(1);
    expect(parsed.summary.toOrderUnits).toBe(1);
  });

  it("shapes ② chase + ③ receive from the OPEN POs (independent of demand)", async () => {
    // One order row — served by both open POs below (mock ignores filters, so
    // it doubles as the demand read [no order_lines → no ① bundle] AND the
    // SO-join for the chase/receive linked customer).
    const orders = [
      {
        id: "ord-Z",
        so: 1201,
        customer_name: "陈先生",
        status: "place",
        source_system: null,
        delivery_date: "2026-09-30",
        delivery_date_tbd: false,
        placed_at: "2026-07-01T00:00:00Z",
        created_at: "2026-07-01T00:00:00Z",
      },
    ];
    const purchase_orders = [
      {
        id: "po-late",
        supplier_id: "sup-1",
        sup_status: "in_production",
        status: "open",
        // Far in the past so it is ALWAYS late regardless of the test clock.
        expected_ready_date: "2020-01-01",
        eta_date: null,
        so: 1201,
        so_refs: null,
        purchase_order_lines: [{ sku: "MAT-K", qty: 2, received_qty: 0 }],
      },
      {
        id: "po-ready",
        supplier_id: "sup-2",
        sup_status: "ready_for_pickup",
        status: "open",
        expected_ready_date: "2026-06-01",
        eta_date: "2026-08-05",
        so: 1201,
        so_refs: null,
        purchase_order_lines: [{ sku: "BF-K", qty: 3, received_qty: 1 }],
      },
    ];

    const sb = makeSb({
      orders: { data: orders, error: null },
      order_lines: { data: [], error: null },
      purchase_orders: { data: purchase_orders, error: null },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(URL, { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const parsed = purchaseTodayResponseSchema.parse(await res.json());

    // Open-PO read is scoped to status='open'.
    expect(sb.builders.purchase_orders.eq).toHaveBeenCalledWith("status", "open");

    // ② Chase — the still-making, past-due PO.
    expect(parsed.chase).toHaveLength(1);
    expect(parsed.chase[0].poId).toBe("po-late");
    expect(parsed.chase[0].items).toEqual([{ sku: "MAT-K", outstanding: 2 }]);
    expect(parsed.chase[0].daysLate).toBeGreaterThan(0);
    expect(parsed.chase[0].earliestDeliveryDate).toBe("2026-09-30");
    expect(parsed.chase[0].linkedOrders[0].customerName).toBe("陈先生");

    // ③ Receive — goods ready; only the outstanding units (3 − 1 = 2).
    expect(parsed.receive).toHaveLength(1);
    expect(parsed.receive[0].poId).toBe("po-ready");
    expect(parsed.receive[0].items).toEqual([{ sku: "BF-K", outstanding: 2 }]);
    expect(parsed.receive[0].etaDate).toBe("2026-08-05");

    expect(parsed.summary.toChase).toBe(1);
    expect(parsed.summary.chaseLate).toBe(1);
    expect(parsed.summary.toReceive).toBe(1);
  });
});

// =====================================================================
// Isolated netting/bundling logic (pure assembler + engine)
// =====================================================================
describe("buildPurchaseTodayReport — netting + urgency", () => {
  const demand: DemandLine[] = [
    // A bed-set: mattress + bedframe, one order, near deadline.
    {
      lineId: "l1",
      orderId: "o1",
      sku: "MAT-K",
      category: "mattress",
      supplierId: "sup-1",
      qty: 2,
      deadline: "2026-08-10",
      leadDays: 10,
      placedAt: "2026-07-01",
      committed: true,
    },
    {
      lineId: "l2",
      orderId: "o1",
      sku: "BF-K",
      category: "bedframe",
      supplierId: "sup-1",
      qty: 2,
      deadline: "2026-08-10",
      leadDays: 8,
      placedAt: "2026-07-01",
      committed: true,
    },
    // A standalone sofa, far deadline → own bundle.
    {
      lineId: "l3",
      orderId: "o2",
      sku: "SOF-3S",
      category: "sofa",
      supplierId: "sup-2",
      qty: 1,
      deadline: "2026-12-01",
      leadDays: 14,
      placedAt: "2026-07-01",
      committed: false,
    },
  ];

  it("nets open POs and bundles the bed-set into one trip", () => {
    const report = buildPurchaseTodayReport(
      demand,
      { openPoBySku: { "MAT-K": 1 }, freeStockBySku: { "SOF-3S": 5 } },
      {
        today: "2026-07-21",
        holidays: myHolidaySet(),
        reviewDaysBySupplier: { "sup-1": [1, 3, 5], "sup-2": [1, 3, 5] },
      },
      { o1: 1301, o2: 1302 },
      { o1: "李四", o2: "王五" },
      { "MAT-K": 800, "BF-K": 300, "SOF-3S": 1200 },
    );

    // Two bundles: the bed-set (o1) and the sofa (o2).
    expect(report.bundles).toHaveLength(2);
    const bedset = report.bundles.find((b) => b.orderId === "o1")!;
    expect(bedset.group).toBe("bedset");
    // MAT-K demand 2 − 1 on PO = 1; BF-K demand 2, none on PO = 2 → 3 total.
    expect(bedset.toOrder).toBe(3);
    const mat = bedset.items.find((i) => i.sku === "MAT-K")!;
    expect(mat.qty).toBe(2);
    expect(mat.coveredByOpenPo).toBe(1);
    expect(mat.toOrder).toBe(1);
    expect(mat.why).toContain("1 on PO");
    // Per-item system cost + per-bundle customer name are carried through.
    expect(mat.cost).toBe(800);
    expect(bedset.items.find((i) => i.sku === "BF-K")!.cost).toBe(300);
    expect(bedset.customerName).toBe("李四");
    // bedset raiseBy uses the LONGER lead (mattress 10) — the slower item gates.
    expect(bedset.maxLeadDays).toBe(10);
    expect(bedset.so).toBe(1301);

    // Sofa bundle: free stock stays ADVISORY (not consumed) → still needs 1.
    const sofa = report.bundles.find((b) => b.orderId === "o2")!;
    expect(sofa.group).toBe("sofa");
    expect(sofa.toOrder).toBe(1);
    expect(sofa.items[0].coveredByFreeStock).toBe(0);
    expect(sofa.items[0].cost).toBe(1200);
    expect(sofa.customerName).toBe("王五");
    expect(report.bySku.find((s) => s.sku === "SOF-3S")!.freeStock).toBe(5);

    // Summary counts the to-place bundles per urgency; totals add up.
    expect(report.summary.toPlaceBundles).toBe(2);
    expect(report.summary.toOrderUnits).toBe(4);
  });

  it("drops a fully-covered bundle from the to-place list", () => {
    const report = buildPurchaseTodayReport(
      [demand[0], demand[1]],
      { openPoBySku: { "MAT-K": 2, "BF-K": 2 } },
      { today: "2026-07-21", holidays: myHolidaySet() },
      { o1: 1301 },
    );
    // Everything on PO → nothing to place.
    expect(report.bundles).toHaveLength(0);
    expect(report.bySku).toHaveLength(0);
    expect(report.summary.toPlaceBundles).toBe(0);
  });

  it("consumes free stock only when consumeFreeStock is on", () => {
    const report = buildPurchaseTodayReport(
      [demand[2]],
      { freeStockBySku: { "SOF-3S": 1 } },
      { today: "2026-07-21", holidays: myHolidaySet(), consumeFreeStock: true },
      { o2: 1302 },
    );
    // 1 demand − 1 free stock consumed = 0 to order → bundle drops.
    expect(report.bundles).toHaveLength(0);
    expect(report.summary.toPlaceBundles).toBe(0);
  });

  it("merges the chase/receive lists into the response + summary", () => {
    const report = buildPurchaseTodayReport(
      [],
      {},
      { today: "2026-07-21", holidays: myHolidaySet() },
      {},
      {},
      {},
      {
        chase: [
          {
            poId: "po-1",
            supplierId: "sup-1",
            supStatus: "in_production",
            expectedReadyDate: "2026-07-01",
            items: [{ sku: "MAT-K", outstanding: 2 }],
            linkedOrders: [{ so: 1301, customerName: "李四", deliveryDate: "2026-09-01" }],
            daysLate: 14,
            earliestDeliveryDate: "2026-09-01",
          },
        ],
        receive: [],
      },
    );
    expect(report.chase).toHaveLength(1);
    expect(report.receive).toEqual([]);
    expect(report.summary.toChase).toBe(1);
    expect(report.summary.chaseLate).toBe(1);
    expect(report.summary.toReceive).toBe(0);
  });
});

// =====================================================================
// ②③ open-PO shaping (pure)
// =====================================================================
describe("buildPurchaseChaseReceive — chase + receive shaping", () => {
  const linked = [{ so: 1301, customerName: "李四", deliveryDate: "2026-09-01" }];

  it("chases late still-making POs and lists receive for ready goods", () => {
    const { chase, receive } = buildPurchaseChaseReceive(
      [
        // still-making + past-due → chase
        {
          poId: "po-1",
          supplierId: "sup-1",
          supStatus: "in_production",
          status: "open",
          expectedReadyDate: "2026-07-01",
          etaDate: null,
          lines: [{ sku: "MAT-K", qty: 2, receivedQty: 0 }],
          linkedOrders: linked,
        },
        // goods ready → receive
        {
          poId: "po-2",
          supplierId: "sup-2",
          supStatus: "ready_for_pickup",
          status: "open",
          expectedReadyDate: "2026-06-01",
          etaDate: "2026-08-05",
          lines: [{ sku: "BF-K", qty: 1, receivedQty: 0 }],
          linkedOrders: linked,
        },
        // fully received open PO → neither
        {
          poId: "po-3",
          supplierId: "sup-1",
          supStatus: "pending",
          status: "open",
          expectedReadyDate: "2026-07-01",
          etaDate: null,
          lines: [{ sku: "X", qty: 1, receivedQty: 1 }],
          linkedOrders: [],
        },
        // still-making but NOT yet late (erd in the future) → neither
        {
          poId: "po-4",
          supplierId: "sup-1",
          supStatus: "pending",
          status: "open",
          expectedReadyDate: "2026-12-01",
          etaDate: null,
          lines: [{ sku: "Y", qty: 1, receivedQty: 0 }],
          linkedOrders: [],
        },
        // cancelled → excluded even though it looks chaseable
        {
          poId: "po-5",
          supplierId: "sup-1",
          supStatus: "in_production",
          status: "cancelled",
          expectedReadyDate: "2026-07-01",
          etaDate: null,
          lines: [{ sku: "Z", qty: 1, receivedQty: 0 }],
          linkedOrders: [],
        },
      ],
      { today: "2026-07-21", holidays: myHolidaySet() },
    );

    expect(chase.map((r) => r.poId)).toEqual(["po-1"]);
    expect(chase[0].items).toEqual([{ sku: "MAT-K", outstanding: 2 }]);
    expect(chase[0].daysLate).toBeGreaterThan(0);
    expect(chase[0].earliestDeliveryDate).toBe("2026-09-01");
    expect(chase[0].linkedOrders[0].customerName).toBe("李四");

    expect(receive.map((r) => r.poId)).toEqual(["po-2"]);
    expect(receive[0].items).toEqual([{ sku: "BF-K", outstanding: 1 }]);
    expect(receive[0].etaDate).toBe("2026-08-05");
  });

  it("keeps only the outstanding units on a partially-received PO", () => {
    const { receive } = buildPurchaseChaseReceive(
      [
        {
          poId: "po-p",
          supplierId: "sup-1",
          supStatus: "delivered",
          status: "open",
          expectedReadyDate: null,
          etaDate: null,
          lines: [
            { sku: "A", qty: 5, receivedQty: 3 },
            { sku: "B", qty: 2, receivedQty: 2 },
          ],
          linkedOrders: [],
        },
      ],
      { today: "2026-07-21" },
    );
    expect(receive).toHaveLength(1);
    // A has 2 outstanding; B fully received → dropped.
    expect(receive[0].items).toEqual([{ sku: "A", outstanding: 2 }]);
  });

  it("sorts chase most-late-first and receive by soonest ETA", () => {
    const { chase, receive } = buildPurchaseChaseReceive(
      [
        {
          poId: "chase-a",
          supplierId: "s",
          supStatus: "pending",
          status: "open",
          expectedReadyDate: "2026-07-18",
          etaDate: null,
          lines: [{ sku: "A", qty: 1, receivedQty: 0 }],
          linkedOrders: [],
        },
        {
          poId: "chase-b",
          supplierId: "s",
          supStatus: "pending",
          status: "open",
          expectedReadyDate: "2026-07-01",
          etaDate: null,
          lines: [{ sku: "B", qty: 1, receivedQty: 0 }],
          linkedOrders: [],
        },
        {
          poId: "rec-a",
          supplierId: "s",
          supStatus: "shipped",
          status: "open",
          expectedReadyDate: null,
          etaDate: "2026-08-20",
          lines: [{ sku: "C", qty: 1, receivedQty: 0 }],
          linkedOrders: [],
        },
        {
          poId: "rec-b",
          supplierId: "s",
          supStatus: "shipped",
          status: "open",
          expectedReadyDate: null,
          etaDate: "2026-08-05",
          lines: [{ sku: "D", qty: 1, receivedQty: 0 }],
          linkedOrders: [],
        },
      ],
      { today: "2026-07-21", holidays: myHolidaySet() },
    );
    // chase-b is more days late (earlier promised date) → first.
    expect(chase.map((r) => r.poId)).toEqual(["chase-b", "chase-a"]);
    // rec-b has the sooner ETA → first.
    expect(receive.map((r) => r.poId)).toEqual(["rec-b", "rec-a"]);
  });
});

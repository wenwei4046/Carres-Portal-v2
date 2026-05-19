import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import { DB } from "@carres/shared";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";
import { assertRpcCallShape } from "../../test-utils/assert-rpc";

vi.mock("../../lib/supabase", () => ({
  userClient: vi.fn(),
}));

import { userClient } from "../../lib/supabase";

const SUPABASE_URL = "https://test.supabase.co";
const KID = "test-kid-1";

const env = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
};

let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string) {
  return new SignJWT({
    email: `${role}@carres.com`,
    app_metadata: { role },
  })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000999")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

// The route reads sku/warehouse_id/qty/reserved/low_threshold/high_threshold
// off stock_balances rows; updated_at (present on DB.StockBalanceRow) is
// irrelevant for these fixtures, so we use a column-Pick to keep test fixtures
// minimal while still typing against the shared schema. T42-pass3-C1 added the
// threshold fields to the route's select clause.
type StockBalanceFixture = Pick<
  DB.StockBalanceRow,
  "sku" | "warehouse_id" | "qty" | "reserved"
> & {
  low_threshold?: number | null;
  high_threshold?: number | null;
};
// Likewise for warehouses: the route's GET only reads id/name/address; v3-S3
// fields kind + owning_partner_id (added in migration 0027) aren't surfaced
// here, so we Pick to keep fixtures minimal while still typing against shared.
type WarehouseFixture = Pick<DB.WarehouseRow, "id" | "name" | "address">;

/**
 * Build a userClient mock whose `.from(table)` returns a chain that resolves to
 * the supplied data based on the table name. Supports the two tables this route
 * reads (warehouses, stock_balances). Errors can be injected per table.
 */
function mockWarehouseQueries(opts: {
  warehouses?: WarehouseFixture[];
  warehousesError?: { code?: string; message?: string };
  balances?: StockBalanceFixture[];
  balancesError?: { code?: string; message?: string };
}) {
  const fromImpl = vi.fn((table: string) => {
    if (table === "warehouses") {
      const order = vi.fn().mockResolvedValue({
        data: opts.warehousesError ? null : opts.warehouses ?? [],
        error: opts.warehousesError ?? null,
      });
      const select = vi.fn(() => ({ order }));
      return { select };
    }
    if (table === "stock_balances") {
      const select = vi.fn().mockResolvedValue({
        data: opts.balancesError ? null : opts.balances ?? [],
        error: opts.balancesError ?? null,
      });
      return { select };
    }
    throw new Error(`unexpected table: ${table}`);
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(userClient).mockReturnValue({ from: fromImpl } as any);
  return fromImpl;
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

describe("GET /api/operation/warehouse", () => {
  const WH1 = "00000000-0000-0000-0000-000000000w01";
  const WH2 = "00000000-0000-0000-0000-000000000w02";

  it("returns 200 with aggregated stock by warehouse + totals by sku", async () => {
    mockWarehouseQueries({
      warehouses: [
        { id: WH1, name: "JB Depot", address: "1 Tebrau Rd" },
        { id: WH2, name: "KL HQ", address: "10 Sentral" },
      ],
      balances: [
        // KL HQ: MAT-K-001 stocked, BED-K-002 stocked
        { sku: "MAT-K-001", warehouse_id: WH2, qty: 12, reserved: 2 },
        { sku: "BED-K-002", warehouse_id: WH2, qty: 5, reserved: 1 },
        // JB Depot: only MAT-K-001
        { sku: "MAT-K-001", warehouse_id: WH1, qty: 3, reserved: 0 },
      ],
    });

    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/warehouse", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      warehouses: DB.WarehouseRow[];
      byWarehouse: Record<string, Array<{ sku: string; qty: number; reserved: number; low_stock_status: string }>>;
      totalsBySku: Record<string, { total_qty: number; total_reserved: number; low_stock_status_aggregate: string }>;
    };
    // warehouses sorted by name (server-side .order("name"); we trust the chain).
    expect(body.warehouses).toHaveLength(2);
    expect(body.warehouses[0]?.name).toBe("JB Depot");
    // byWarehouse: each warehouse has its rows; row count matches balances.
    expect(body.byWarehouse[WH2]).toHaveLength(2);
    expect(body.byWarehouse[WH1]).toHaveLength(1);
    // totalsBySku: aggregated qty across warehouses.
    expect(body.totalsBySku["MAT-K-001"]).toEqual({
      total_qty: 15,
      total_reserved: 2,
      low_stock_status_aggregate: "ok",
    });
    expect(body.totalsBySku["BED-K-002"]).toEqual({
      total_qty: 5,
      total_reserved: 1,
      low_stock_status_aggregate: "ok",
    });
  });

  it("returns empty maps when there are zero warehouses", async () => {
    mockWarehouseQueries({ warehouses: [], balances: [] });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/warehouse", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      warehouses: unknown[];
      byWarehouse: Record<string, unknown[]>;
      totalsBySku: Record<string, unknown>;
    };
    expect(body.warehouses).toEqual([]);
    expect(body.byWarehouse).toEqual({});
    expect(body.totalsBySku).toEqual({});
  });

  it("warehouse with no stock_balances rows surfaces as empty array", async () => {
    mockWarehouseQueries({
      warehouses: [
        { id: WH1, name: "JB Depot", address: null },
        { id: WH2, name: "KL HQ", address: null },
      ],
      balances: [
        // Only KL HQ has stock; JB Depot must show as [].
        { sku: "MAT-K-001", warehouse_id: WH2, qty: 10, reserved: 0 },
      ],
    });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/warehouse", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      byWarehouse: Record<string, Array<{ sku: string }>>;
    };
    expect(body.byWarehouse[WH1]).toEqual([]);
    expect(body.byWarehouse[WH2]).toHaveLength(1);
  });

  it("tags out / low / ok at row + aggregate per spec §18.5 thresholds", async () => {
    mockWarehouseQueries({
      warehouses: [{ id: WH1, name: "Solo", address: null }],
      balances: [
        // qty=0 → out
        { sku: "OUT-001", warehouse_id: WH1, qty: 0, reserved: 0 },
        // qty=1 → low (spec §18.5: total ≤1 = low yellow)
        { sku: "LOW-001", warehouse_id: WH1, qty: 1, reserved: 1 },
        // qty=10 → ok
        { sku: "OK-001", warehouse_id: WH1, qty: 10, reserved: 1 },
      ],
    });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/warehouse", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      byWarehouse: Record<string, Array<{ sku: string; low_stock_status: string }>>;
      totalsBySku: Record<string, { low_stock_status_aggregate: string }>;
    };
    const rows = body.byWarehouse[WH1] ?? [];
    const bySku = Object.fromEntries(rows.map(r => [r.sku, r.low_stock_status]));
    expect(bySku["OUT-001"]).toBe("out");
    expect(bySku["LOW-001"]).toBe("low");
    expect(bySku["OK-001"]).toBe("ok");
    // Aggregate matches single-warehouse case.
    expect(body.totalsBySku["OUT-001"]?.low_stock_status_aggregate).toBe("out");
    expect(body.totalsBySku["LOW-001"]?.low_stock_status_aggregate).toBe("low");
    expect(body.totalsBySku["OK-001"]?.low_stock_status_aggregate).toBe("ok");
  });

  it("aggregate status uses summed qty across warehouses (not per-warehouse worst-case)", async () => {
    // SKU split across warehouses where each side individually looks low/out
    // but total is ok (sum > 1). This guards against accidentally keying the
    // aggregate badge off worst-warehouse instead of total qty per spec §18.5.
    mockWarehouseQueries({
      warehouses: [
        { id: WH1, name: "A", address: null },
        { id: WH2, name: "B", address: null },
      ],
      balances: [
        { sku: "SPLIT-001", warehouse_id: WH1, qty: 1, reserved: 0 }, // low alone
        { sku: "SPLIT-001", warehouse_id: WH2, qty: 5, reserved: 0 }, // ok alone
      ],
    });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/warehouse", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      byWarehouse: Record<string, Array<{ sku: string; low_stock_status: string }>>;
      totalsBySku: Record<string, { total_qty: number; low_stock_status_aggregate: string }>;
    };
    // Per-warehouse status reflects each warehouse's own qty.
    expect(body.byWarehouse[WH1]?.[0]?.low_stock_status).toBe("low");
    expect(body.byWarehouse[WH2]?.[0]?.low_stock_status).toBe("ok");
    // Aggregate uses summed qty (1 + 5 = 6 > 1 → ok).
    expect(body.totalsBySku["SPLIT-001"]).toEqual({
      total_qty: 6,
      total_reserved: 0,
      low_stock_status_aggregate: "ok",
    });
  });

  it("surfaces low_threshold + high_threshold per row (T42-pass3-C1 wiring)", async () => {
    // The warehouse page wires `+ Threshold` button → SetThresholdDialog
    // prefilled with these values. Without them the dialog opens blank and a
    // "Save" with empty inputs would clear existing thresholds (parseField
    // returns null for empty text). The route must surface the raw column
    // values; NULLs propagate as null (not 0/undefined).
    mockWarehouseQueries({
      warehouses: [{ id: WH1, name: "ThresholdsWH", address: null }],
      balances: [
        { sku: "WITH-LH", warehouse_id: WH1, qty: 10, reserved: 0, low_threshold: 5, high_threshold: 15 },
        { sku: "ONLY-LOW", warehouse_id: WH1, qty: 8, reserved: 0, low_threshold: 3, high_threshold: null },
        { sku: "NO-THRESH", warehouse_id: WH1, qty: 4, reserved: 0, low_threshold: null, high_threshold: null },
      ],
    });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/warehouse", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      byWarehouse: Record<
        string,
        Array<{ sku: string; low_threshold: number | null; high_threshold: number | null }>
      >;
    };
    const bySku = Object.fromEntries(
      (body.byWarehouse[WH1] ?? []).map((r) => [r.sku, r]),
    );
    expect(bySku["WITH-LH"]?.low_threshold).toBe(5);
    expect(bySku["WITH-LH"]?.high_threshold).toBe(15);
    expect(bySku["ONLY-LOW"]?.low_threshold).toBe(3);
    expect(bySku["ONLY-LOW"]?.high_threshold).toBeNull();
    expect(bySku["NO-THRESH"]?.low_threshold).toBeNull();
    expect(bySku["NO-THRESH"]?.high_threshold).toBeNull();
  });

  it("returns 403 for dealer role (no Supabase round-trip)", async () => {
    const from = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from } as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/operation/warehouse", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  it("returns 401 without Authorization header", async () => {
    const res = await app.fetch(new Request("http://t/api/operation/warehouse"), env);
    expect(res.status).toBe(401);
  });
});

describe("POST /api/operation/warehouse/adjust", () => {
  // Hex-only UUID — adjustStockInput.warehouseId is z.string().uuid(); the
  // 'w' shape used in this file's GET tests is fine for raw fixtures but
  // would fail zod parsing here.
  const SKU = "MAT-K-001";
  const WAREHOUSE_ID = "00000000-0000-0000-0000-000000000b01";
  const VALID_BODY = { sku: SKU, warehouseId: WAREHOUSE_ID, delta: 5, reason: "Found extra units in back room" };

  it("returns 200 on positive delta and calls RPC with snake_case args", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { sku: SKU, warehouse_id: WAREHOUSE_ID, delta: 5, qty_after: 17, reason: VALID_BODY.reason },
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/warehouse/adjust", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(VALID_BODY),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sku: string; qty_after: number };
    expect(body.sku).toBe(SKU);
    expect(body.qty_after).toBe(17);
    expect(rpc).toHaveBeenCalledWith("operation_adjust_stock", {
      p_sku: SKU,
      p_warehouse_id: WAREHOUSE_ID,
      p_delta: 5,
      p_reason: VALID_BODY.reason,
    });
    assertRpcCallShape(rpc, "operation_adjust_stock", [
      "p_sku",
      "p_warehouse_id",
      "p_delta",
      "p_reason",
    ]);
  });

  it("returns 200 on negative delta (shrinkage / damage)", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { sku: SKU, warehouse_id: WAREHOUSE_ID, delta: -3, qty_after: 9, reason: "Damaged in transit" },
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/warehouse/adjust", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sku: SKU, warehouseId: WAREHOUSE_ID, delta: -3, reason: "Damaged in transit" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("operation_adjust_stock", {
      p_sku: SKU,
      p_warehouse_id: WAREHOUSE_ID,
      p_delta: -3,
      p_reason: "Damaged in transit",
    });
    assertRpcCallShape(rpc, "operation_adjust_stock", [
      "p_sku",
      "p_warehouse_id",
      "p_delta",
      "p_reason",
    ]);
  });

  it("maps SQLSTATE P0001 negative_stock → 422 rule_violation", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "stock would go negative", details: "negative_stock" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/warehouse/adjust", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sku: SKU, warehouseId: WAREHOUSE_ID, delta: -999, reason: "Big shrinkage" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; code: string; message: string };
    expect(body.error).toBe("rule_violation");
    expect(body.code).toBe("negative_stock");
    expect(body.message).toBe("stock would go negative");
  });

  it("maps SQLSTATE P0001 below_reserved → 422 rule_violation", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "stock would fall below reserved units", details: "below_reserved" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/warehouse/adjust", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sku: SKU, warehouseId: WAREHOUSE_ID, delta: -2, reason: "Test" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.error).toBe("rule_violation");
    expect(body.code).toBe("below_reserved");
  });

  it("returns 422 invalid_input when required fields are missing (zod)", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/warehouse/adjust", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sku: SKU }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_input");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns 422 invalid_input when extra keys are passed (.strict)", async () => {
    // adjustStockInput is .strict() post-Prep-2 — extra keys must be rejected
    // before reaching Supabase, otherwise PostgREST PGRST202 leaks through.
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/warehouse/adjust", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...VALID_BODY, malicious: "drop tables" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_input");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns 403 for non-operation role (no rpc call)", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/operation/warehouse/adjust", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(VALID_BODY),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("GET /api/operation/warehouse/reserved-drilldown", () => {
  // Hex-only UUIDs — the route's reservedDrilldownQuery uses z.string().uuid()
  // so the 'w' shape would fail zod parsing. Match adjustStockInput conventions.
  const SKU = "mattress:carres-cloud:King";
  const WAREHOUSE_ID = "00000000-0000-0000-0000-000000000c01";
  const ORDER_A = "00000000-0000-0000-0000-00000000aaaa";
  const ORDER_B = "00000000-0000-0000-0000-00000000bbbb";

  /**
   * Build a userClient mock for the embedded join shape used by the route:
   *   .from('order_lines').select(...).eq().eq().in(...) → resolves with
   *   Array<{qty, sku, orders: {...} | [{...}]}>.
   *
   * The chain returns `{ select }` then a chainable `{ eq, in }` pyramid that
   * terminates in a Promise. The chainable pyramid is built fresh per call so
   * each test can inject a different terminal payload.
   */
  function mockReservedDrilldown(opts: {
    rows?: Array<{
      qty: number;
      sku: string;
      orders:
        | { id: string; so: number; customer_name: string; operation_stage: string; warehouse_id: string }
        | Array<{ id: string; so: number; customer_name: string; operation_stage: string; warehouse_id: string }>
        | null;
    }>;
    error?: { code?: string; message?: string };
  }) {
    const terminal = Promise.resolve({
      data: opts.error ? null : opts.rows ?? [],
      error: opts.error ?? null,
    });
    // PostgREST builder: each filter call returns the same builder; the builder
    // is itself thenable (so awaiting it resolves the terminal promise).
    const builder: {
      eq: ReturnType<typeof vi.fn>;
      in: ReturnType<typeof vi.fn>;
      then: typeof terminal.then;
    } = {
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      then: terminal.then.bind(terminal),
    };
    const select = vi.fn(() => builder);
    const fromImpl = vi.fn((table: string) => {
      if (table === "order_lines") {
        return { select };
      }
      throw new Error(`unexpected table: ${table}`);
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from: fromImpl } as any);
    return { fromImpl, select, builder };
  }

  it("returns 200 with grouped orders and total summed qty", async () => {
    mockReservedDrilldown({
      rows: [
        // Order A has 2 lines on this SKU (e.g. one per pillow); they should sum.
        {
          qty: 1,
          sku: SKU,
          orders: {
            id: ORDER_A,
            so: 4001,
            customer_name: "Ahmad",
            operation_stage: "ready_to_dispatch",
            warehouse_id: WAREHOUSE_ID,
          },
        },
        {
          qty: 2,
          sku: SKU,
          orders: {
            id: ORDER_A,
            so: 4001,
            customer_name: "Ahmad",
            operation_stage: "ready_to_dispatch",
            warehouse_id: WAREHOUSE_ID,
          },
        },
        // Order B has 1 line, dispatched stage.
        {
          qty: 1,
          sku: SKU,
          orders: {
            id: ORDER_B,
            so: 4002,
            customer_name: "Bee",
            operation_stage: "dispatched",
            warehouse_id: WAREHOUSE_ID,
          },
        },
      ],
    });
    const jwt = await makeJwt("operation");
    const url = `http://t/api/operation/warehouse/reserved-drilldown?warehouseId=${WAREHOUSE_ID}&sku=${encodeURIComponent(SKU)}`;
    const res = await app.fetch(new Request(url, { headers: { Authorization: `Bearer ${jwt}` } }), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      warehouseId: string;
      sku: string;
      total: number;
      orders: Array<{ id: string; so: number; customerName: string; operationStage: string; reservedQty: number }>;
    };
    expect(body.warehouseId).toBe(WAREHOUSE_ID);
    expect(body.sku).toBe(SKU);
    expect(body.total).toBe(4); // 1 + 2 + 1
    expect(body.orders).toHaveLength(2);
    // Sorted by so desc → B (4002) first, A (4001) second.
    expect(body.orders[0]?.id).toBe(ORDER_B);
    expect(body.orders[0]?.reservedQty).toBe(1);
    expect(body.orders[0]?.operationStage).toBe("dispatched");
    expect(body.orders[1]?.id).toBe(ORDER_A);
    expect(body.orders[1]?.reservedQty).toBe(3); // grouped from 1 + 2
    expect(body.orders[1]?.customerName).toBe("Ahmad");
  });

  it("returns 200 with empty orders + total=0 when no orders hold reserve", async () => {
    mockReservedDrilldown({ rows: [] });
    const jwt = await makeJwt("operation");
    const url = `http://t/api/operation/warehouse/reserved-drilldown?warehouseId=${WAREHOUSE_ID}&sku=${encodeURIComponent(SKU)}`;
    const res = await app.fetch(new Request(url, { headers: { Authorization: `Bearer ${jwt}` } }), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      warehouseId: string;
      sku: string;
      total: number;
      orders: unknown[];
    };
    expect(body.total).toBe(0);
    expect(body.orders).toEqual([]);
    expect(body.warehouseId).toBe(WAREHOUSE_ID);
    expect(body.sku).toBe(SKU);
  });

  it("returns 422 invalid_query when warehouseId is missing", async () => {
    const fromImpl = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from: fromImpl } as any);
    const jwt = await makeJwt("operation");
    const url = `http://t/api/operation/warehouse/reserved-drilldown?sku=${encodeURIComponent(SKU)}`;
    const res = await app.fetch(new Request(url, { headers: { Authorization: `Bearer ${jwt}` } }), env);
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_query");
    expect(fromImpl).not.toHaveBeenCalled();
  });

  it("returns 422 invalid_query when warehouseId is not a uuid", async () => {
    const fromImpl = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from: fromImpl } as any);
    const jwt = await makeJwt("operation");
    const url = `http://t/api/operation/warehouse/reserved-drilldown?warehouseId=not-a-uuid&sku=${encodeURIComponent(SKU)}`;
    const res = await app.fetch(new Request(url, { headers: { Authorization: `Bearer ${jwt}` } }), env);
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_query");
    expect(fromImpl).not.toHaveBeenCalled();
  });

  it("returns 422 invalid_query when sku is empty", async () => {
    const fromImpl = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from: fromImpl } as any);
    const jwt = await makeJwt("operation");
    const url = `http://t/api/operation/warehouse/reserved-drilldown?warehouseId=${WAREHOUSE_ID}&sku=`;
    const res = await app.fetch(new Request(url, { headers: { Authorization: `Bearer ${jwt}` } }), env);
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_query");
    expect(fromImpl).not.toHaveBeenCalled();
  });

  it("returns 403 for non-operation caller (no Supabase round-trip)", async () => {
    const fromImpl = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from: fromImpl } as any);
    const jwt = await makeJwt("dealer");
    const url = `http://t/api/operation/warehouse/reserved-drilldown?warehouseId=${WAREHOUSE_ID}&sku=${encodeURIComponent(SKU)}`;
    const res = await app.fetch(new Request(url, { headers: { Authorization: `Bearer ${jwt}` } }), env);
    expect(res.status).toBe(403);
    expect(fromImpl).not.toHaveBeenCalled();
  });
});

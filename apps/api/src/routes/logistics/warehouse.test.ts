import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import { DB } from "@carres/shared";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

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

// The route only reads sku/warehouse_id/qty/reserved off stock_balances rows;
// updated_at (present on DB.StockBalanceRow) is irrelevant for these fixtures,
// so we use a column-Pick to keep test fixtures minimal while still typing
// against the shared schema.
type StockBalanceFixture = Pick<DB.StockBalanceRow, "sku" | "warehouse_id" | "qty" | "reserved">;

/**
 * Build a userClient mock whose `.from(table)` returns a chain that resolves to
 * the supplied data based on the table name. Supports the two tables this route
 * reads (warehouses, stock_balances). Errors can be injected per table.
 */
function mockWarehouseQueries(opts: {
  warehouses?: DB.WarehouseRow[];
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

describe("GET /api/logistics/warehouse", () => {
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

    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/warehouse", {
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
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/warehouse", {
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
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/warehouse", {
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
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/warehouse", {
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
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/warehouse", {
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

  it("returns 403 for dealer role (no Supabase round-trip)", async () => {
    const from = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from } as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/logistics/warehouse", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  it("returns 401 without Authorization header", async () => {
    const res = await app.fetch(new Request("http://t/api/logistics/warehouse"), env);
    expect(res.status).toBe(401);
  });
});

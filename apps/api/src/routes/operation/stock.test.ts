import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import { Hono } from "hono";
import { authMiddleware, _setJwksForTesting } from "../../middleware/auth";
import operationStockRouter from "./stock";
import type { AppEnv } from "../../types";

/**
 * GET /api/operation/stock must see the whole catalog, not the first 1000 rows.
 * The fake client below answers like PostgREST here: a read with no `.range()`
 * stops at 1000 rows.
 */

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn(), adminClient: vi.fn() }));
import { userClient } from "../../lib/supabase";

const env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
};

const CAP = 1000;

function fakeClient(tables: Record<string, unknown[]>) {
  return {
    from(table: string) {
      const rows = tables[table] ?? [];
      let slice = rows.slice(0, CAP);
      const b: Record<string, unknown> = {};
      for (const m of ["select", "is", "eq", "order"]) b[m] = () => b;
      b.range = (from: number, to: number) => {
        slice = rows.slice(from, Math.min(to + 1, from + CAP));
        return b;
      };
      b.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) =>
        Promise.resolve({ data: slice, error: null }).then(ok, bad);
      return b;
    },
  };
}

function buildApp() {
  const api = new Hono<AppEnv>();
  api.use("*", authMiddleware);
  api.route("/operation/stock", operationStockRouter);
  const app = new Hono<AppEnv>();
  app.route("/api", api);
  return app;
}

beforeEach(() => {
  useTestJwks();
  vi.mocked(userClient).mockReset();
});
afterAll(() => _setJwksForTesting(null));

describe("GET /api/operation/stock", () => {
  it("keeps every SKU when the catalog passes 1000 rows", async () => {
    const skus = Array.from({ length: 1001 }, (_, i) => ({
      sku: `SKU-${String(i + 1).padStart(4, "0")}`,
      price: 10,
      product_models: { name: "Model", category: "mattress" },
    }));
    const last = "SKU-1001";
    vi.mocked(userClient).mockReturnValue(
      fakeClient({
        warehouses: [{ id: "wh-1", name: "HQ" }],
        product_skus: skus,
        stock_sku_availability: [{ sku: last, warehouse_id: "wh-1", on_hand: 3, sellable: 3, reserved: 0 }],
        stock_balances: [],
        purchase_order_lines: [],
      }) as never,
    );
    const jwt = await signTestJwt("11111111-1111-1111-1111-000000000999", {
      email: "ops@carres.com",
      app_metadata: { role: "operation" },
    });
    const res = await buildApp().request(
      "/api/operation/stock",
      { headers: { Authorization: `Bearer ${jwt}` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { skus: Array<{ sku: string; available: number }>; summary: { totalSkus: number } };
    expect(body.summary.totalSkus).toBe(1001);
    expect(body.skus.find((s) => s.sku === last)?.available).toBe(3);
  });
});

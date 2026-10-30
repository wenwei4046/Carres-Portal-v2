import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { stockMatchKey } from "@carres/shared";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn(() => ({})) }));
vi.mock("../../lib/purchase-demand-read", async () => {
  const actual = await vi.importActual<typeof import("../../lib/purchase-demand-read")>(
    "../../lib/purchase-demand-read",
  );
  return { ...actual, loadToOrder: vi.fn(), readFreeStock: vi.fn() };
});

import { loadToOrder, readFreeStock } from "../../lib/purchase-demand-read";

const env = {
  SUPABASE_URL: "https://t.x",
  SUPABASE_ANON_KEY: "a",
  SUPABASE_SERVICE_ROLE_KEY: "s",
  SUPABASE_JWT_SECRET: "",
};

const get = async (role: string) => {
  const token = await signTestJwt("u1", { email: `${role}@x`, app_metadata: { role } });
  return app.fetch(
    new Request("http://t/api/operation/purchase/mrp", {
      headers: { Authorization: `Bearer ${token}` },
    }),
    env,
  );
};

const loaded = () => ({
  ok: true,
  data: {
    today: "2026-10-30",
    supplierNames: new Map([["S1", "Test Supplier"]]),
    openPoBySku: { "SKU-A": 3 },
    registerFacts: {
      ordersById: new Map([["O1", { so: 101, customer: "TEST", delivery: "2026-11-20" }]]),
      soLines: [{
        lineId: "L1", orderId: "O1", sku: "SKU-A", qty: 10, category: "mattress", supplierId: "S1",
        modelName: "Haven", variant: "King", placedAt: "2026-10-01", heldInStock: 2, heldOnPo: 1,
      }],
    },
  },
});

beforeEach(() => {
  useTestJwks();
  vi.mocked(loadToOrder).mockReset();
  vi.mocked(readFreeStock).mockReset();
  vi.mocked(loadToOrder).mockResolvedValue(loaded() as never);
  vi.mocked(readFreeStock).mockResolvedValue({ freeStock: { [stockMatchKey("SKU-A")]: [{ qty: 5 }] } } as never);
});

afterAll(() => _setJwksForTesting(null));

describe("GET /api/operation/purchase/mrp", () => {
  it("returns Needed, In Stock, On PO and Shortage for the line", async () => {
    const res = await get("operation");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { lines: unknown[] };
    expect(body.lines[0]).toMatchObject({
      lineId: "L1", so: 101, supplierName: "Test Supplier",
      needed: 10, inStock: 2, onPo: 4, shortage: 4,
    });
  });

  it("refuses a role outside Operation", async () => {
    expect((await get("dealer")).status).toBe(403);
    expect(loadToOrder).not.toHaveBeenCalled();
  });

  it("refuses the page when stock cannot be read, rather than print Free Stock 0", async () => {
    vi.mocked(readFreeStock).mockRejectedValue(new Error("down"));
    const res = await get("operation");
    expect(res.status).toBe(503);
  });
});

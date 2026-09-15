/**
 * 【DELIVERY】 CARD 19 — `GET /api/operation/orders/by-number/:so`.
 *
 * The operator's document word resolves to the order's id through ONE read
 * door. The negative controls matter more than the happy path: a number that
 * matches nothing is a 404 that names the number, a non-number is a 400, and
 * the door never hands a raw param to the database as a uuid (the measured
 * production defect: `invalid input syntax for type uuid: "SO-1362"`).
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({
  userClient: vi.fn(),
}));

import { userClient } from "../../lib/supabase";

const env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
};

async function makeJwt(role: string) {
  return signTestJwt("11111111-1111-1111-1111-000000000999", { email: `${role}@carres.com`, app_metadata: { role } });
}

beforeEach(() => {
  useTestJwks();
  vi.mocked(userClient).mockReset();
});

afterAll(() => _setJwksForTesting(null));

const ORDER_ID = "db9c939a-ebb7-4836-a2b8-866770728822";

function mockOrdersByNumber(row: { id: string; so: number } | null) {
  const eq = vi.fn();
  const maybeSingle = vi.fn(() => Promise.resolve({ data: row, error: null }));
  const select = vi.fn(() => ({ eq }));
  eq.mockReturnValue({ maybeSingle });
  const from = vi.fn((table: string) => {
    if (table !== "orders") throw new Error(`unexpected table ${table}`);
    return { select };
  });
  vi.mocked(userClient).mockReturnValue({ from } as never);
  return { eq, select };
}

describe("GET /api/operation/orders/by-number/:so", () => {
  it("resolves the document word to the id, reading `orders.so` and nothing else", async () => {
    const { eq, select } = mockOrdersByNumber({ id: ORDER_ID, so: 1362 });
    const token = await makeJwt("operation");
    const res = await app.fetch(new Request("http://t" + "/api/operation/orders/by-number/SO-1362", {
      headers: { Authorization: `Bearer ${token}` },
    }), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: ORDER_ID, so: 1362 });
    expect(select).toHaveBeenCalledWith("id, so");
    expect(eq).toHaveBeenCalledWith("so", 1362);
  });

  it("accepts the bare digits and the lower-case prefix as the same number", async () => {
    for (const spelling of ["1362", "so-1362"]) {
      const { eq } = mockOrdersByNumber({ id: ORDER_ID, so: 1362 });
      const token = await makeJwt("operation");
      const res = await app.fetch(new Request("http://t" + `/api/operation/orders/by-number/${spelling}`, {
        headers: { Authorization: `Bearer ${token}` },
      }), env);
      expect(res.status).toBe(200);
      expect(eq).toHaveBeenCalledWith("so", 1362);
    }
  });

  it("a number that matches nothing is a 404 that names the number", async () => {
    mockOrdersByNumber(null);
    const token = await makeJwt("operation");
    const res = await app.fetch(new Request("http://t" + "/api/operation/orders/by-number/SO-999999", {
      headers: { Authorization: `Bearer ${token}` },
    }), env);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string; message: string; so: string };
    expect(body.code).toBe("not_found");
    expect(body.message).toBe("Sales Order not found.");
    expect(body.so).toBe("SO-999999");
  });

  it("a non-number never reaches the database — 400, not a uuid cast error", async () => {
    const { eq } = mockOrdersByNumber(null);
    const token = await makeJwt("operation");
    const res = await app.fetch(new Request("http://t" + "/api/operation/orders/by-number/PO-2051", {
      headers: { Authorization: `Bearer ${token}` },
    }), env);
    expect(res.status).toBe(400);
    expect(eq).not.toHaveBeenCalled();
  });

  it("is Operation-gated like the detail door", async () => {
    mockOrdersByNumber({ id: ORDER_ID, so: 1362 });
    const token = await makeJwt("dealer");
    const res = await app.fetch(new Request("http://t" + "/api/operation/orders/by-number/SO-1362", {
      headers: { Authorization: `Bearer ${token}` },
    }), env);
    expect(res.status).toBe(403);
  });
});

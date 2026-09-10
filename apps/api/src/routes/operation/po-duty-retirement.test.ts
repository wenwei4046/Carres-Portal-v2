import type { Context, Next } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../../types";

vi.mock("../../middleware/auth", () => ({
  authMiddleware: async (c: Context<AppEnv>, next: Next) => {
    c.set("auth", {
      id: "operation-user",
      email: "operation@carres.test",
      role: "operation",
      dealerId: null,
      supplierId: null,
      partnerId: null,
      outletId: null,
      warehouseId: null,
      jwt: "test-jwt",
    });
    await next();
  },
}));

import app from "../../index";

describe("retired PO Duty compatibility API", () => {
  it.each(["GET", "PUT"])("returns 404 for %s /api/operation/po-duty", async (method) => {
    const response = await app.fetch(
      new Request("http://test/api/operation/po-duty", { method }),
      {} as never,
    );

    expect(response.status).toBe(404);
  });
});

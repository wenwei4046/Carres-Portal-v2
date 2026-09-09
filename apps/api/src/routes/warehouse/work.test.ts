import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { createWarehouseWorkRouter } from "./work";
import type { AppEnv } from "../../types";

describe("Warehouse Site Work", () => {
  it("serves the Site queue through the warehouse-only door", async () => {
    const app = new Hono<AppEnv>();
    app.use("*", async (c, next) => {
      c.set("auth", {
        id: "operator-1", email: "nadia@nets.test", role: "warehouse",
        dealerId: null, supplierId: null, partnerId: null, outletId: null,
        warehouseId: "site-1", jwt: "jwt",
      });
      await next();
    });
    app.route("/api/warehouse/work", createWarehouseWorkRouter(async () => ({
      items: [], staff: [], generatedOn: "2026-09-09",
    })));

    const response = await app.request("/api/warehouse/work");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [], staff: [], generatedOn: "2026-09-09" });
  });

  it("refuses an internal account because a Site queue is not Team Work", async () => {
    const app = new Hono<AppEnv>();
    app.use("*", async (c, next) => {
      c.set("auth", {
        id: "ops-1", email: "ops@carres.test", role: "operation",
        dealerId: null, supplierId: null, partnerId: null, outletId: null,
        warehouseId: null, jwt: "jwt",
      });
      await next();
    });
    app.route("/api/warehouse/work", createWarehouseWorkRouter(async () => ({
      items: [], staff: [], generatedOn: "2026-09-09",
    })));
    expect((await app.request("/api/warehouse/work")).status).toBe(403);
  });
});

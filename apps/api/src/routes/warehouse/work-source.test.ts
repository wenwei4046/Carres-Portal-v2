import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

const source = vi.hoisted(() => ({ rpc: vi.fn(), events: [] as unknown, status: 200 }));
vi.mock("../../lib/supabase", () => ({ userClient: () => ({ rpc: source.rpc }) }));
vi.mock("../operation/delivery-arrangements", () => {
  const router = new Hono<AppEnv>();
  router.get("/warehouse-schedule", (c) => {
    if (!c.env?.SUPABASE_URL) return c.json({ error: "missing bindings" }, 500);
    if (source.status !== 200) return c.json({ error: "unavailable" }, 503);
    return c.json({ events: source.events });
  });
  return { default: router };
});
import { createWarehouseWorkRouter } from "./work";

const siteId = "11111111-1111-4111-8111-111111111111";
function app() {
  const router = new Hono<AppEnv>();
  router.use("*", async (c, next) => {
    c.set("auth", {
      id: "operator", email: "person@example.test", role: "warehouse", warehouseId: siteId,
      dealerId: null, supplierId: null, partnerId: null, outletId: null, jwt: "test",
    });
    await next();
  });
  router.onError((_, c) => c.json({ error: "source unavailable" }, 500));
  router.route("/work", createWarehouseWorkRouter());
  return router;
}
beforeEach(() => {
  source.events = [];
  source.status = 200;
  source.rpc.mockResolvedValue({ data: { site: { id: siteId, label: "Site" }, assignments: [] }, error: null });
});
describe("Warehouse Work source integration", () => {
  it("passes Worker bindings to the nested schedule route", async () => {
    const response = await app().request("/work", {}, { SUPABASE_URL: "https://example.test" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ items: [] });
    expect(source.rpc).toHaveBeenCalledWith("warehouse_my_outbound_assignments");
  });

  it("accepts only through the personal Warehouse RPC door", async () => {
    source.rpc.mockResolvedValueOnce({ data: { site: { id: siteId, label: "Site" }, assignments: [] }, error: null });
    source.rpc.mockResolvedValueOnce({ data: { accepted: true }, error: null });
    const doId = "22222222-2222-4222-8222-222222222222";
    const response = await app().request(`/work/${doId}/accept`, { method: "POST", body: "{}" }, { SUPABASE_URL: "https://example.test" });
    expect(response.status).toBe(200);
    expect(source.rpc).toHaveBeenLastCalledWith("warehouse_accept_outbound_work", { p_do_id: doId });
  });
  it.each(["schedule", "malformed", "owner"])("refuses %s failure instead of reporting zero Work", async (failure) => {
    if (failure === "schedule") source.status = 503;
    if (failure === "malformed") source.events = null;
    if (failure === "owner") source.rpc.mockResolvedValue({ data: null, error: { message: "unavailable" } });
    const response = await app().request("/work", {}, { SUPABASE_URL: "https://example.test" });
    expect(response.status).toBe(500);
    expect(await response.json()).not.toHaveProperty("items");
  });
});

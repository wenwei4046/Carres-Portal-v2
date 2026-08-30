import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { PurchasingSettingsResponse } from "@carres/shared";
import type { AppEnv } from "../../types";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
vi.mock("../../lib/duties", () => ({ myDuties: vi.fn().mockResolvedValue([]) }));
vi.mock("../../lib/purchasing-settings", () => ({ loadPurchasingSettings: vi.fn() }));

import { userClient } from "../../lib/supabase";
import { loadPurchasingSettings } from "../../lib/purchasing-settings";
import purchasingSettingsRouter from "./purchasing-settings";

const DESTINATION_ID = "33333333-0000-0000-0000-000000000003";
const SUPPLIER_ID = "11111111-0000-0000-0000-000000000001";
const PARTNER_ID = "66666666-0000-0000-0000-000000000006";

const response: Omit<PurchasingSettingsResponse, "canEdit"> = {
  orderByBufferDays: 7,
  earliestSellDays: 21,
  logisticsCallWorkingDays: 1,
  poDays: [1, 3, 5],
  suppliers: [],
  productionDays: [],
  destinations: [
    {
      id: DESTINATION_ID,
      name: "Ohana",
      address: null,
      isDefault: false,
      active: true,
      warehouseLinked: false,
    },
  ],
  lastChanges: [],
};

function testApp() {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("auth", {
      id: "11111111-0000-0000-0000-000000000001",
      role: "principal",
      email: "jess@carres.com",
      dealerId: null,
      supplierId: null,
      partnerId: null,
      outletId: null,
      warehouseId: null,
      jwt: "test-jwt",
    });
    await next();
  });
  app.route("/settings", purchasingSettingsRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadPurchasingSettings).mockResolvedValue(response);
});

describe("Purchasing Settings — Deliver To", () => {
  it("creates a future destination through the governed SQL door", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: DESTINATION_ID, error: null });
    vi.mocked(userClient).mockReturnValue({ rpc } as never);

    const res = await testApp().request("/settings/destinations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: " Ohana ", address: null }),
    });

    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("purchasing_create_destination", {
      p_name: "Ohana",
      p_address: null,
    });
    expect(((await res.json()) as PurchasingSettingsResponse).destinations).toEqual(
      response.destinations,
    );
  });

  it("updates availability and default through one audited SQL door", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(userClient).mockReturnValue({ rpc } as never);

    const res = await testApp().request(`/settings/destinations/${DESTINATION_ID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Ohana",
        address: "Sungai Buloh",
        active: true,
        isDefault: false,
      }),
    });

    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("purchasing_update_destination", {
      p_destination_id: DESTINATION_ID,
      p_name: "Ohana",
      p_address: "Sungai Buloh",
      p_active: true,
      p_is_default: false,
    });
  });

  it("refuses a blank name before any database call", async () => {
    const rpc = vi.fn();
    vi.mocked(userClient).mockReturnValue({ rpc } as never);

    const res = await testApp().request("/settings/destinations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "   ", address: null }),
    });

    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("Purchasing Settings — supplier collection", () => {
  it("saves the governed collector and fixed destination through the existing audited SQL door", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(userClient).mockReturnValue({ rpc } as never);

    const res = await testApp().request(`/settings/supplier-collection/${SUPPLIER_ID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        destinationId: DESTINATION_ID,
        partnerId: PARTNER_ID,
      }),
    });

    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("purchasing_set_supplier_collection", {
      p_supplier_id: SUPPLIER_ID,
      p_destination_id: DESTINATION_ID,
      p_partner_id: PARTNER_ID,
    });
  });

  it("refuses an incomplete collection rule before any database call", async () => {
    const rpc = vi.fn();
    vi.mocked(userClient).mockReturnValue({ rpc } as never);

    const res = await testApp().request(`/settings/supplier-collection/${SUPPLIER_ID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destinationId: DESTINATION_ID, partnerId: null }),
    });

    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { PurchasingSettingsResponse } from "@carres/shared";
import type { AppEnv } from "../../types";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
vi.mock("../../lib/duties", () => ({ myDuties: vi.fn().mockResolvedValue([]) }));
vi.mock("../../lib/purchasing-settings", () => ({ loadPurchasingSettings: vi.fn(), loadPoWindows: vi.fn() }));

import { userClient } from "../../lib/supabase";
import { loadPoWindows, loadPurchasingSettings } from "../../lib/purchasing-settings";
import purchasingSettingsRouter from "./purchasing-settings";

const DESTINATION_ID = "33333333-0000-0000-0000-000000000003";
const SUPPLIER_ID = "11111111-0000-0000-0000-000000000001";
const PARTNER_ID = "66666666-0000-0000-0000-000000000006";

const response: Omit<PurchasingSettingsResponse, "canEdit"> = {
  orderByBufferDays: 7,
  earliestSellDays: 21,
  logisticsCallWorkingDays: 1,
  poDays: [1, 3, 5],
  manualPurchaseMinDeliveryDays: 0,
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

function testApp(who: { role: string; email: string } = { role: "principal", email: "jess@carres.com" }) {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("auth", {
      id: "11111111-0000-0000-0000-000000000001",
      role: who.role as never,
      email: who.email,
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
  vi.mocked(loadPoWindows).mockResolvedValue({
    settings: { first: "11:30", second: "16:00", secondEnabled: true },
    poDays: [1, 3, 5],
    cutoffBySupplier: new Map(),
  });
});

describe("Purchasing Settings — PO windows (0585, MASTER §5.6.1)", () => {
  it("reads the windows through the ONE window reader", async () => {
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as never);
    const res = await testApp().request("/settings");
    expect(res.status).toBe(200);
    const body = (await res.json()) as PurchasingSettingsResponse;
    expect(body.poWindows).toEqual({ first: "11:30", second: "16:00", secondEnabled: true });
  });

  it("saves both windows through the audited SQL door", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(userClient).mockReturnValue({ rpc } as never);
    const res = await testApp().request("/settings/po-windows", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ first: "11:00", second: null, secondEnabled: false }),
    });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("purchasing_set_po_windows", {
      p_first: "11:00",
      p_second: null,
      p_second_enabled: false,
    });
  });

  it("refuses a second window that is not later than the first before any database call", async () => {
    const rpc = vi.fn();
    vi.mocked(userClient).mockReturnValue({ rpc } as never);
    const res = await testApp().request("/settings/po-windows", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ first: "16:00", second: "11:30", secondEnabled: true }),
    });
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });
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

describe("Purchasing Settings — the earliest Delivery Date a Manual Purchase may ask for (0422)", () => {
  it("is one of the single numbers: PUT /number by key reaches purchasing_set_number", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(userClient).mockReturnValue({ rpc } as never);
    vi.mocked(loadPurchasingSettings).mockResolvedValue({
      ...response,
      manualPurchaseMinDeliveryDays: 3,
    });

    const res = await testApp().request("/settings/number", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "manual_purchase_min_delivery_days", value: 3 }),
    });

    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("purchasing_set_number", {
      p_key: "manual_purchase_min_delivery_days",
      p_value: 3,
    });
    expect(
      ((await res.json()) as PurchasingSettingsResponse).manualPurchaseMinDeliveryDays,
    ).toBe(3);
  });

  it("refuses a number outside 0..365 before any database call", async () => {
    const rpc = vi.fn();
    vi.mocked(userClient).mockReturnValue({ rpc } as never);

    const res = await testApp().request("/settings/number", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "manual_purchase_min_delivery_days", value: 366 }),
    });

    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("the GET carries the number so the screen renders it from the server's answer", async () => {
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as never);
    const res = await testApp().request("/settings");
    expect(res.status).toBe(200);
    expect(
      ((await res.json()) as PurchasingSettingsResponse).manualPurchaseMinDeliveryDays,
    ).toBe(0);
  });
});

describe("Purchasing Settings — Transit days (0318's write door, finally on a screen)", () => {
  it("PUT /transit-days reaches purchasing_set_supplier_transit_days", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(userClient).mockReturnValue({ rpc } as never);

    const res = await testApp().request("/settings/transit-days", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ supplierId: SUPPLIER_ID, days: 2 }),
    });

    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("purchasing_set_supplier_transit_days", {
      p_supplier_id: SUPPLIER_ID,
      p_days: 2,
    });
    // The answer is the whole settings object, so the screen can never drift
    // from the stored truth after a save.
    expect(await res.json()).toMatchObject({ poDays: [1, 3, 5] });
  });

  it("refuses a number outside 0..60 before any database call", async () => {
    const rpc = vi.fn();
    vi.mocked(userClient).mockReturnValue({ rpc } as never);

    const res = await testApp().request("/settings/transit-days", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ supplierId: SUPPLIER_ID, days: 61 }),
    });

    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a null day count — an unknown lorry leg stays unknown, never 0", async () => {
    const rpc = vi.fn();
    vi.mocked(userClient).mockReturnValue({ rpc } as never);

    const res = await testApp().request("/settings/transit-days", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ supplierId: SUPPLIER_ID, days: null }),
    });

    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("Purchasing Settings — who may save (owner report 2026-09-29)", () => {
  it("the shared operation@ login reads Settings but is never offered Save, because the SQL gate refuses it", async () => {
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as never);
    const res = await testApp({ role: "operation", email: "operation@carres.com" }).request("/settings");
    expect(res.status).toBe(200);
    expect(((await res.json()) as PurchasingSettingsResponse).canEdit).toBe(false);
  });

  it("the principal is offered Save", async () => {
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as never);
    const res = await testApp().request("/settings");
    expect(((await res.json()) as PurchasingSettingsResponse).canEdit).toBe(true);
  });
});

describe("Purchasing Settings — a supplier's Last PO time (0585)", () => {
  it("carries each supplier's own time from the one window reader", async () => {
    vi.mocked(loadPurchasingSettings).mockResolvedValue({
      ...response,
      suppliers: [{ id: SUPPLIER_ID, name: "Ohana", categories: [], offDays: null, transitDays: null }],
    });
    vi.mocked(loadPoWindows).mockResolvedValue({
      settings: { first: "11:30", second: "16:00", secondEnabled: true },
      poDays: [1, 3, 5],
      cutoffBySupplier: new Map([[SUPPLIER_ID, "10:00"]]),
    });
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as never);
    const body = (await (await testApp().request("/settings")).json()) as PurchasingSettingsResponse;
    expect(body.suppliers[0]!.poCutoff).toBe("10:00");
  });

  it("saves and clears through the audited door", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(userClient).mockReturnValue({ rpc } as never);
    for (const cutoff of ["10:00", null]) {
      const res = await testApp().request("/settings/po-cutoff", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierId: SUPPLIER_ID, cutoff }),
      });
      expect(res.status).toBe(200);
      expect(rpc).toHaveBeenLastCalledWith("purchasing_set_supplier_po_cutoff", {
        p_supplier_id: SUPPLIER_ID,
        p_cutoff: cutoff,
      });
    }
  });
});

describe("Purchasing Settings — Repair return target (0602 · 0603)", () => {
  it("reads the target days, and a failed read never stops the page", async () => {
    const from = vi.fn(() => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { repair_return_working_days: 14 }, error: null }) }) }),
    }));
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn(), from } as never);
    const ok = (await (await testApp().request("/settings")).json()) as PurchasingSettingsResponse;
    expect(ok.repairReturnWorkingDays).toBe(14);

    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as never);
    const res = await testApp().request("/settings");
    expect(res.status).toBe(200);
    expect(((await res.json()) as PurchasingSettingsResponse).repairReturnWorkingDays).toBeUndefined();
  });

  it("saves through the one numbers door by its key (the 1 to 90 range is the SQL CHECK and the field's own min and max)", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(userClient).mockReturnValue({ rpc } as never);
    const res = await testApp().request("/settings/number", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "repair_return_working_days", value: 10 }),
    });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("purchasing_set_number", { p_key: "repair_return_working_days", p_value: 10 });
  });
});

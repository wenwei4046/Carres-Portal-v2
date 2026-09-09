import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));

import { userClient } from "../../lib/supabase";
import warehouseSettingsRouter from "./warehouse-settings";

const SITE = "00000000-0000-0000-0000-000000000c03";
const YU_JUN = "aac9edf9-63ad-4d0a-ba91-e495a25f9896";
const KHOR_YEE = "e73e8a5d-c2e3-445e-b765-489a096d702e";
const NETS_WAREHOUSE = "47cda689-c5b2-4999-af47-e40daa901ec3";

/* The measured production shape, 2026-09-09: one Site, NETS Warehouse
   operating it, and NOTHING else configured. */
const TABLES: Record<string, unknown[]> = {
  warehouses: [{ id: SITE, name: "Carres Klang Warehouse", address: null }],
  warehouse_site_profiles: [
    {
      status: "active",
      operating_party_id: NETS_WAREHOUSE,
      time_zone: "Asia/Kuala_Lumpur",
      key_contact_id: null,
      contact_number: null,
      updated_at: "2026-09-09T00:00:00Z",
    },
  ],
  /* The route asks the database for warehouse operators only (0458), so the
     stub answers with what that filtered query would return. The refusal
     itself is proved in SQL — see the 0458 probe. */
  stock_operating_parties: [
    { id: NETS_WAREHOUSE, name: "NETS Warehouse", kind: "warehouse_operator", active: true },
    { id: "64fcc437-91c8-4658-ab16-e7b338c31248", name: "Carres Warehouse", kind: "warehouse_operator", active: true },
  ],
  app_users: [
    { id: YU_JUN, name: "Yu Jun", email: "yujun@carres.com", status: "active", role: "operation", staff_code: "CR004", operations_superuser: false },
    { id: KHOR_YEE, name: "Khor Yee", email: "khoryee@carres.com", status: "disabled", role: "operation", staff_code: "CR003", operations_superuser: false },
    /* A shared service account is not a person — `stock/MASTER.md` §11:
       shared company credentials are invalid. */
    { id: "22222222-2222-2222-2222-000000000002", name: "Operations", email: "operation@carres.com", status: "active", role: "operation", staff_code: null, operations_superuser: true },
    /* 0458 — measured live: role mailboxes in a Carres role, active, and NOT
       people. They carry no CRnnn staff code, which is how this ERP decides. */
    { id: "66666666-6666-6666-6666-000000000006", name: "Business Development · Carres HQ", email: "BD@carres.com", status: "active", role: "bd", staff_code: null, operations_superuser: false },
    { id: "77777777-7777-7777-7777-000000000007", name: "Finance · Carres HQ", email: "finance@carres.com", status: "active", role: "finance", staff_code: null, operations_superuser: false },
    { id: "88888888-8888-8888-8888-000000000008", name: "E2E Test · operation", email: "operation-test@x.com", status: "active", role: "operation", staff_code: null, operations_superuser: false },
    /* Counterparty logins are not Carres People and must never be offered
       here — least of all labelled `Carres`. */
    { id: "33333333-3333-3333-3333-000000000003", name: "Ohana Supplier", email: "ohana@supplier.com", status: "active", role: "supplier", staff_code: null, operations_superuser: false },
    { id: "44444444-4444-4444-4444-000000000004", name: "HOUZS Partner", email: "houzs@partner.com", status: "active", role: "partner", staff_code: null, operations_superuser: false },
    { id: "55555555-5555-5555-5555-000000000005", name: "PJ Showroom", email: "pj@carres.com", status: "active", role: "showroom", staff_code: null, operations_superuser: false },
  ],
  warehouse_working_hours: [],
  warehouse_special_dates: [],
  warehouse_holiday_policies: [],
  warehouse_holiday_calendars: [],
  warehouse_holiday_dates: [],
  warehouse_capabilities: [
    {
      key: "manage_warehouse_settings",
      label: "Manage Warehouse Settings",
      helper: "Change Warehouse configuration.",
      sort: 1,
    },
  ],
  warehouse_capability_grants: [],
  warehouse_setting_changes: [],
};

/** A supabase-js chain thin enough to answer this router and nothing else. */
function stubClient(rpc = vi.fn().mockResolvedValue({ data: true, error: null })) {
  const from = (table: string) => {
    const rows = TABLES[table] ?? [];
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    for (const m of ["select", "eq", "is", "order", "limit"]) chain[m] = vi.fn(self);
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: rows[0] ?? null, error: null });
    chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null });
    return chain;
  };
  return { from: vi.fn(from), rpc } as never;
}

function testApp(role: "operation" | "principal" | "dealer" = "operation") {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("auth", {
      id: YU_JUN,
      role,
      email: "yujun@carres.com",
      dealerId: null,
      supplierId: null,
      partnerId: null,
      outletId: null,
      warehouseId: null,
      jwt: "test-jwt",
    });
    await next();
  });
  app.route("/warehouse-settings", warehouseSettingsRouter);
  return app;
}

beforeEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// 2 · the verified site and organisation · 3 · the unconfigured states
// ---------------------------------------------------------------------------

describe("GET /warehouse-settings", () => {
  it("loads the verified Site and its operating ORGANISATION", async () => {
    vi.mocked(userClient).mockReturnValue(stubClient());
    const res = await testApp().request("/warehouse-settings");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, never>;
    const details = body.details as unknown as Record<string, unknown>;
    expect(details.name).toBe("Carres Klang Warehouse");
    expect(details.operatingPartyName).toBe("NETS Warehouse");
    expect(details.status).toBe("active");
    expect(details.timeZone).toBe("Asia/Kuala_Lumpur");
  });

  it("reports the unconfigured facts as ABSENT — never as a value", async () => {
    vi.mocked(userClient).mockReturnValue(stubClient());
    const body = (await (await testApp().request("/warehouse-settings")).json()) as Record<
      string,
      never
    >;
    const details = body.details as unknown as Record<string, unknown>;
    expect(details.address).toBeNull();
    expect(details.keyContactId).toBeNull();
    expect(details.keyContactName).toBeNull();
    expect(details.contactNumber).toBeNull();
    expect(body.workingHours as unknown as unknown[]).toEqual([]);
    expect(body.holidayPolicy).toBeNull();
    expect(body.holidayCalendars as unknown as unknown[]).toEqual([]);
    expect(body.holidayDates as unknown as unknown[]).toEqual([]);
  });

  // 15 · 16 — the picker offers ACTIVE People only, and nobody is pre-assigned
  it("offers active People only, and grants nobody anything", async () => {
    vi.mocked(userClient).mockReturnValue(stubClient());
    const body = (await (await testApp().request("/warehouse-settings")).json()) as Record<
      string,
      never
    >;
    const people = body.people as unknown as Array<{ id: string; name: string }>;
    expect(people.map((p) => p.name)).toEqual(["Yu Jun"]);
    expect(people.some((p) => p.id === KHOR_YEE)).toBe(false);
    /* Not the shared account, not a counterparty login dressed as Carres, and
       not a role mailbox — 0458, from the production walk. */
    for (const name of [
      "Operations",
      "Business Development · Carres HQ",
      "Finance · Carres HQ",
      "E2E Test · operation",
      "Ohana Supplier",
      "HOUZS Partner",
      "PJ Showroom",
    ]) {
      expect(people.some((p) => p.name === name)).toBe(false);
    }
    const caps = body.capabilities as unknown as Array<{ holders: unknown[] }>;
    for (const cap of caps) expect(cap.holders).toEqual([]);
  });

  // 0458 — a warehouse is operated by a warehouse operator
  it("asks the database for warehouse operators only, never every party", async () => {
    const client = stubClient();
    vi.mocked(userClient).mockReturnValue(client);
    await testApp().request("/warehouse-settings");
    /* Each `from()` builds its own chain, and `Promise.all` does not preserve
       call order — so the assertion scans every chain rather than guessing an
       index that a reordered read would silently break. */
    const results = (client as unknown as {
      from: { mock: { results: Array<{ value: Record<string, { mock: { calls: unknown[][] } }> }> } };
    }).from.mock.results;
    const everyEq = results.flatMap((r) => r.value.eq?.mock.calls ?? []);
    expect(everyEq).toContainEqual(["kind", "warehouse_operator"]);
  });

  it("carries `canEdit` from the SERVER's own gate, never from the role alone", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    vi.mocked(userClient).mockReturnValue(stubClient(rpc));
    const body = (await (await testApp().request("/warehouse-settings")).json()) as Record<
      string,
      never
    >;
    expect(body.canEdit).toBe(false);
    expect(rpc).toHaveBeenCalledWith("warehouse_can_manage_settings");
  });
});

// ---------------------------------------------------------------------------
// 17 · permission enforcement
// ---------------------------------------------------------------------------

describe("permission enforcement", () => {
  it("refuses a dealer outright", async () => {
    vi.mocked(userClient).mockReturnValue(stubClient());
    const res = await testApp("dealer").request("/warehouse-settings");
    expect(res.status).toBe(403);
  });

  it("passes the SQL gate's refusal through as a 403, not a silent success", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "42501", message: "forbidden", details: "warehouse settings are set by the manager" },
    });
    vi.mocked(userClient).mockReturnValue(stubClient(rpc));
    const res = await testApp().request("/warehouse-settings/details", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteId: SITE,
        name: "Carres Klang Warehouse",
        status: "active",
        timeZone: "Asia/Kuala_Lumpur",
      }),
    });
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// 4 · 9 · 18 — every write goes through the ONE gated, auditing SQL door
// ---------------------------------------------------------------------------

describe("every write goes through a gated SQL door", () => {
  it("saves Warehouse Details through `warehouse_set_site_details`", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {}, error: null });
    vi.mocked(userClient).mockReturnValue(stubClient(rpc));
    await testApp().request("/warehouse-settings/details", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteId: SITE,
        name: "Carres Klang Warehouse",
        address: "Lot 1, Klang",
        status: "active",
        operatingPartyId: NETS_WAREHOUSE,
        timeZone: "Asia/Kuala_Lumpur",
        keyContactId: YU_JUN,
        contactNumber: "03-1234 5678",
      }),
    });
    expect(rpc).toHaveBeenCalledWith("warehouse_set_site_details", {
      p_site_id: SITE,
      p_name: "Carres Klang Warehouse",
      p_address: "Lot 1, Klang",
      p_status: "active",
      p_operating_party_id: NETS_WAREHOUSE,
      p_time_zone: "Asia/Kuala_Lumpur",
      p_key_contact_id: YU_JUN,
      p_contact_number: "03-1234 5678",
    });
  });

  it("saves the whole week through `warehouse_set_working_hours`", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    vi.mocked(userClient).mockReturnValue(stubClient(rpc));
    const rows = [
      { weekday: 1, activity: "receiving", closed: false, opensAt: "09:00", closesAt: "17:00" },
      { weekday: 0, activity: "collection", closed: true },
    ];
    await testApp().request("/warehouse-settings/working-hours", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId: SITE, rows }),
    });
    expect(rpc).toHaveBeenCalledWith("warehouse_set_working_hours", {
      p_site_id: SITE,
      p_rows: rows,
    });
  });

  it("refuses a Special Date with no reason BEFORE it reaches the database", async () => {
    const rpc = vi.fn();
    vi.mocked(userClient).mockReturnValue(stubClient(rpc));
    const res = await testApp().request("/warehouse-settings/special-dates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteId: SITE,
        onDate: "2026-12-25",
        kind: "closed_all_day",
        reason: "   ",
      }),
    });
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("saves the public-holiday policy through `warehouse_set_holiday_policy`", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {}, error: null });
    vi.mocked(userClient).mockReturnValue(stubClient(rpc));
    await testApp().request("/warehouse-settings/holiday-policy", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteId: SITE,
        followPublicHolidays: true,
        country: "Malaysia",
        state: "Selangor",
        observeReplacement: true,
        defaultAvailability: "receiving_only",
      }),
    });
    expect(rpc).toHaveBeenCalledWith("warehouse_set_holiday_policy", {
      p_site_id: SITE,
      p_follow: true,
      p_country: "Malaysia",
      p_state: "Selangor",
      p_observe_replacement: true,
      p_default_availability: "receiving_only",
      p_opens_at: null,
      p_closes_at: null,
    });
  });

  it("refuses a holiday import that names no verified source", async () => {
    const rpc = vi.fn();
    vi.mocked(userClient).mockReturnValue(stubClient(rpc));
    const res = await testApp().request("/warehouse-settings/holiday-calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        country: "Malaysia",
        state: "Selangor",
        sourceName: "",
        sourceReference: "",
        verifiedAt: "2026-09-09T00:00:00Z",
        dates: [{ date: "2027-01-01", name: "New Year's Day" }],
      }),
    });
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("grants and revokes access through the governed doors", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {}, error: null });
    vi.mocked(userClient).mockReturnValue(stubClient(rpc));
    const body = JSON.stringify({ capability: "perform_stock_count", userId: YU_JUN });
    await testApp().request("/warehouse-settings/access/grant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    expect(rpc).toHaveBeenCalledWith("warehouse_grant_capability", {
      p_capability: "perform_stock_count",
      p_user_id: YU_JUN,
    });
    await testApp().request("/warehouse-settings/access/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    expect(rpc).toHaveBeenCalledWith("warehouse_revoke_capability", {
      p_capability: "perform_stock_count",
      p_user_id: YU_JUN,
    });
  });

  it("refuses a capability key that is not one of the four", async () => {
    const rpc = vi.fn();
    vi.mocked(userClient).mockReturnValue(stubClient(rpc));
    const res = await testApp().request("/warehouse-settings/access/grant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ capability: "edit_delivery_route", userId: YU_JUN }),
    });
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 19 · configuration never rewrites recorded Warehouse work
// ---------------------------------------------------------------------------

describe("Warehouse Settings cannot reach recorded Warehouse work", () => {
  const FORBIDDEN = [
    "ops_stock_items",
    "stock_unit_ids",
    "warehouse_receipts",
    "receiving_receipts",
    "delivery_handover_events",
    "delivery_orders",
    "ops_order_control",
    "stock_month_end",
  ];

  it("reads and writes NOTHING outside the settings tables", async () => {
    const client = stubClient();
    vi.mocked(userClient).mockReturnValue(client);
    await testApp().request("/warehouse-settings");
    const touched = (client as unknown as { from: { mock: { calls: string[][] } } }).from.mock.calls
      .map((c) => c[0]);
    for (const table of FORBIDDEN) expect(touched).not.toContain(table);
  });

  it("names no writer for a Unit, a Count, a Delivery date, an ETA or a route", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {}, error: null });
    vi.mocked(userClient).mockReturnValue(stubClient(rpc));
    for (const path of [
      "/warehouse-settings/details",
      "/warehouse-settings/working-hours",
      "/warehouse-settings/holiday-policy",
    ]) {
      await testApp().request(path, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId: SITE,
          name: "Carres Klang Warehouse",
          status: "active",
          timeZone: "Asia/Kuala_Lumpur",
          rows: [],
          followPublicHolidays: false,
          country: "Malaysia",
          observeReplacement: false,
          defaultAvailability: "closed",
        }),
      });
    }
    /* The allow-list IS the boundary: a writer that is not one of these six
       cannot be reached from Warehouse Settings, whatever it is called. */
    const SETTINGS_DOORS = new Set([
      "warehouse_can_manage_settings",
      "warehouse_set_site_details",
      "warehouse_set_working_hours",
      "warehouse_save_special_date",
      "warehouse_set_holiday_policy",
      "warehouse_import_holiday_calendar",
      "warehouse_grant_capability",
      "warehouse_revoke_capability",
    ]);
    const called = rpc.mock.calls.map((c) => c[0] as string);
    expect(called.length).toBeGreaterThan(0);
    for (const fn of called) expect(SETTINGS_DOORS.has(fn)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 13 · the resolved schedule, served by the ONE arithmetic
// ---------------------------------------------------------------------------

describe("GET /warehouse-settings/schedule", () => {
  it("says `Not configured` while no week has been set", async () => {
    vi.mocked(userClient).mockReturnValue(stubClient());
    const res = await testApp().request("/warehouse-settings/schedule?date=2026-09-16");
    expect(res.status).toBe(200);
    expect((await res.json()) as Record<string, never>).toMatchObject({
      date: "2026-09-16",
      reason: "Not configured",
    });
  });

  it("refuses a date it cannot read", async () => {
    vi.mocked(userClient).mockReturnValue(stubClient());
    const res = await testApp().request("/warehouse-settings/schedule?date=next%20tuesday");
    expect(res.status).toBe(400);
  });
});

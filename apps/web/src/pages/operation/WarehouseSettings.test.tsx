import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { WarehouseSettingsResponse } from "@carres/shared";

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import WarehouseSettings, { WAREHOUSE_SETTINGS_SECTIONS } from "./WarehouseSettings";

/**
 * Settings → Warehouse.
 *
 * The fixture is the MEASURED production shape on 2026-09-09 — one Site,
 * NETS Warehouse operating it, and nothing else recorded. Every "not
 * configured" assertion below is therefore about a real absence, not a
 * convenient blank invented for a test.
 *
 * Yu Jun and Shasha are the two active Operations people. Khor Yee is
 * disabled (0437) and must never be selectable.
 */
const SITE = "00000000-0000-0000-0000-000000000c03";
const NETS_WAREHOUSE = "47cda689-c5b2-4999-af47-e40daa901ec3";
const YU_JUN = "aac9edf9-63ad-4d0a-ba91-e495a25f9896";
const SHASHA = "0cab8bcf-6ebb-454e-ba21-b916e18cc419";
const KHOR_YEE = "e73e8a5d-c2e3-445e-b765-489a096d702e";

function baseline(over: Partial<WarehouseSettingsResponse> = {}): WarehouseSettingsResponse {
  return {
    canEdit: true,
    details: {
      siteId: SITE,
      name: "Carres Klang Warehouse",
      address: null,
      status: "active",
      operatingPartyId: NETS_WAREHOUSE,
      operatingPartyName: "NETS Warehouse",
      timeZone: "Asia/Kuala_Lumpur",
      keyContactId: null,
      keyContactName: null,
      keyContactOrganisation: null,
      keyContactActive: false,
      contactNumber: null,
    },
    operatingParties: [
      { id: NETS_WAREHOUSE, name: "NETS Warehouse" },
      { id: "64fcc437-91c8-4658-ab16-e7b338c31248", name: "Carres Warehouse" },
    ],
    people: [
      { id: SHASHA, name: "Shasha", organisation: "Carres" },
      { id: YU_JUN, name: "Yu Jun", organisation: "Carres" },
    ],
    workingHours: [],
    specialDates: [],
    holidayPolicy: null,
    holidayCalendars: [],
    holidayDates: [],
    capabilities: [
      {
        key: "manage_warehouse_settings",
        label: "Manage Warehouse Settings",
        helper: "Change Warehouse configuration.",
        appliesTo: "Saving anything on this page.",
        holders: [],
      },
      {
        key: "confirm_inbound_receipt",
        label: "Confirm inbound receipt",
        helper: "Confirm that the Warehouse physically received the listed goods.",
        appliesTo: "Recorded here.",
        holders: [],
      },
      {
        key: "confirm_collection_from_warehouse",
        label: "Confirm collection from Warehouse",
        helper:
          "Confirm that the listed goods physically left the Warehouse with the collector.",
        appliesTo: "Recorded here.",
        holders: [],
      },
      {
        key: "perform_stock_count",
        label: "Perform stock count",
        helper: "Enter and submit a physical stock-count result.",
        appliesTo: "Recorded here.",
        holders: [],
      },
    ],
    changes: [],
    ...over,
  };
}

let payload: WarehouseSettingsResponse;

function wrap(section: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[`/operation/settings/warehouse/${section}`]}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route path="/operation/settings/warehouse/:section" element={<WarehouseSettings />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  payload = baseline();
  apiFetch.mockImplementation((_url: string, init?: { method?: string }) => {
    if (!init || init.method === undefined) return Promise.resolve(payload);
    return Promise.resolve({});
  });
});

const save = () => screen.getByTestId("warehouse-settings-save");

// ---------------------------------------------------------------------------
// 1 · the route · 2 · the verified Site and organisation
// ---------------------------------------------------------------------------

describe("the Warehouse Settings route", () => {
  it("names the five sections the card names, in its order", () => {
    expect(WAREHOUSE_SETTINGS_SECTIONS.map((s) => s.label)).toEqual([
      "Warehouse Details",
      "Working Hours",
      "Public Holidays",
      "Special Dates",
      "Access",
    ]);
  });

  it("opens a working page — never `Coming soon` and never an empty placeholder", async () => {
    wrap("details");
    expect(await screen.findByTestId("warehouse-details")).toBeInTheDocument();
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });

  it("draws the identity block from the verified Site and its ORGANISATION", async () => {
    wrap("details");
    const identity = await screen.findByTestId("warehouse-settings-identity");
    expect(within(identity).getByText("Carres Klang Warehouse")).toBeInTheDocument();
    expect(identity.textContent).toContain("Operated by NETS Warehouse");
    expect(identity.textContent).toContain("Active");
  });
});

// ---------------------------------------------------------------------------
// 3 · the unconfigured states · 20 · nothing fictional
// ---------------------------------------------------------------------------

describe("what has not been recorded says so", () => {
  it("prints `Not configured` for the address and contact number, never a made-up value", async () => {
    payload = baseline({ canEdit: false });
    wrap("details");
    await screen.findByTestId("warehouse-details");
    const section = screen.getByTestId("warehouse-details");
    expect(within(section).getAllByText("Not configured").length).toBeGreaterThanOrEqual(2);
    expect(section.textContent).not.toContain("NETS-managed facility");
    expect(section.textContent).not.toMatch(/Ahmad/i);
    expect(section.textContent).not.toMatch(/\+?60\s?\d/);
  });

  it("prints `Not assigned` and `No individual recorded` for the key contact", async () => {
    wrap("details");
    await screen.findByTestId("warehouse-details");
    expect(screen.getByTestId("key-contact-none").textContent).toContain(
      "No individual recorded",
    );
  });

  it("shows every day of the week as `Not configured` — Sunday included", async () => {
    payload = baseline({ canEdit: false });
    wrap("working-hours");
    await screen.findByTestId("warehouse-working-hours");
    for (const weekday of [0, 1, 2, 3, 4, 5, 6]) {
      for (const activity of ["receiving", "collection"]) {
        expect(screen.getByTestId(`hours-${weekday}-${activity}`).textContent).toBe(
          "Not configured",
        );
      }
    }
  });

  it("says the public-holiday policy is `Not configured` and no calendar is imported", async () => {
    wrap("public-holidays");
    await screen.findByTestId("warehouse-public-holidays");
    expect(screen.getByTestId("holiday-policy-state").textContent).toBe(
      "Public-holiday policy Not configured",
    );
    expect(screen.getByTestId("holiday-calendar-empty").textContent).toContain(
      "No holiday calendar has been imported",
    );
  });

  it("never claims automatic official-calendar syncing", async () => {
    wrap("public-holidays");
    const section = await screen.findByTestId("warehouse-public-holidays");
    expect(section.textContent).toContain("There is no automatic sync.");
    expect(section.textContent).not.toMatch(/syncs? (automatically|daily|nightly)/i);
  });
});

// ---------------------------------------------------------------------------
// 4 · the Save button
// ---------------------------------------------------------------------------

describe("Save changes", () => {
  it("is disabled until something changes", async () => {
    wrap("details");
    await screen.findByTestId("warehouse-details");
    expect(save()).toBeDisabled();
    expect(save().textContent).toBe("Save changes");
  });

  it("wakes up when a value really moves, and persists through the governed door", async () => {
    wrap("details");
    await screen.findByTestId("warehouse-details");
    fireEvent.change(screen.getByLabelText("Full address"), {
      target: { value: "Lot 1, Jalan Kapar, Klang" },
    });
    await waitFor(() => expect(save()).toBeEnabled());
    fireEvent.click(save());
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/operation/warehouse-settings/details",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
    const body = JSON.parse(
      (apiFetch.mock.calls.find((c) => String(c[0]).endsWith("/details"))?.[1] as { body: string })
        .body,
    );
    expect(body.address).toBe("Lot 1, Jalan Kapar, Klang");
    expect(body.siteId).toBe(SITE);
  });

  it("shows the SAVED value after the page reloads its own data", async () => {
    wrap("details");
    await screen.findByTestId("warehouse-details");
    payload = baseline({
      details: { ...baseline().details, address: "Lot 1, Jalan Kapar, Klang" },
    });
    fireEvent.change(screen.getByLabelText("Full address"), {
      target: { value: "Lot 1, Jalan Kapar, Klang" },
    });
    fireEvent.click(save());
    await waitFor(() =>
      expect(screen.getByLabelText("Full address")).toHaveValue("Lot 1, Jalan Kapar, Klang"),
    );
    await waitFor(() => expect(save()).toBeDisabled());
  });

  it("REFUSES to save, and NAMES the gap, when a value is invalid", async () => {
    payload = baseline({
      workingHours: [
        { weekday: 1, activity: "receiving", closed: false, opensAt: "09:00", closesAt: "17:00" },
      ],
    });
    wrap("working-hours");
    await screen.findByTestId("warehouse-working-hours");
    fireEvent.change(screen.getByLabelText("Monday Receiving hours closes at"), {
      target: { value: "08:00" },
    });
    await waitFor(() => expect(save()).toBeDisabled());
    expect(save().textContent).toContain("Save changes — Monday receiving hours must close");
    expect(screen.getByRole("alert").textContent).toContain(
      "The closing time must be later than the opening time",
    );
  });
});

// ---------------------------------------------------------------------------
// 6 · separate Receiving and Collection · clearing hours
// ---------------------------------------------------------------------------

describe("Working Hours", () => {
  it("keeps Receiving and Collection as separate columns for the same day", async () => {
    payload = baseline({
      canEdit: false,
      workingHours: [
        { weekday: 1, activity: "receiving", closed: false, opensAt: "09:00", closesAt: "17:00" },
        { weekday: 1, activity: "collection", closed: true, opensAt: null, closesAt: null },
      ],
    });
    wrap("working-hours");
    await screen.findByTestId("warehouse-working-hours");
    expect(screen.getByTestId("hours-1-receiving").textContent).toBe("09:00–17:00");
    expect(screen.getByTestId("hours-1-collection").textContent).toBe("Closed");
  });

  it("clears a configured window back to `Not configured`", async () => {
    payload = baseline({
      workingHours: [
        { weekday: 1, activity: "receiving", closed: false, opensAt: "09:00", closesAt: "17:00" },
      ],
    });
    wrap("working-hours");
    await screen.findByTestId("warehouse-working-hours");
    fireEvent.click(screen.getByRole("button", { name: "Clear Monday Receiving hours" }));
    await waitFor(() =>
      expect(screen.getByTestId("hours-1-receiving").textContent).toContain("Not configured"),
    );
    fireEvent.click(save());
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/operation/warehouse-settings/working-hours",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
    const body = JSON.parse(
      (apiFetch.mock.calls.find((c) => String(c[0]).endsWith("/working-hours"))?.[1] as {
        body: string;
      }).body,
    );
    expect(body.rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 7 · 8 · Special Dates
// ---------------------------------------------------------------------------

describe("Special Dates", () => {
  it("will not save a Special Date without a reason", async () => {
    wrap("special-dates");
    await screen.findByTestId("warehouse-special-dates");
    fireEvent.change(screen.getByLabelText(/^Date/), { target: { value: "2099-01-02" } });
    await waitFor(() => expect(save()).toBeDisabled());
    expect(save().textContent).toContain("say why this date is different");

    fireEvent.change(screen.getByLabelText(/^Reason/), {
      target: { value: "Annual stock take" },
    });
    await waitFor(() => expect(save()).toBeEnabled());
    fireEvent.click(save());
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/operation/warehouse-settings/special-dates",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const body = JSON.parse(
      (apiFetch.mock.calls.find((c) => String(c[0]).endsWith("/special-dates"))?.[1] as {
        body: string;
      }).body,
    );
    expect(body.reason).toBe("Annual stock take");
  });

  it("separates upcoming from past, and past carries only history — no control", async () => {
    payload = baseline({
      specialDates: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          onDate: "2099-01-02",
          kind: "closed_all_day",
          opensAt: null,
          closesAt: null,
          reason: "Annual stock take",
          createdByName: "Yu Jun",
          createdAt: "2026-09-09T02:00:00Z",
          updatedByName: "Yu Jun",
          updatedAt: "2026-09-09T02:00:00Z",
        },
        {
          id: "22222222-2222-2222-2222-222222222222",
          onDate: "2020-05-01",
          kind: "receiving_unavailable",
          opensAt: null,
          closesAt: null,
          reason: "Lorry access blocked",
          createdByName: "Shasha",
          createdAt: "2020-04-20T02:00:00Z",
          updatedByName: "Shasha",
          updatedAt: "2020-04-20T02:00:00Z",
        },
      ],
    });
    wrap("special-dates");
    await screen.findByTestId("warehouse-special-dates");

    const upcoming = screen.getByTestId("special-upcoming");
    expect(upcoming.textContent).toContain("2099-01-02");
    expect(upcoming.textContent).toContain("Closed all day");
    expect(upcoming.textContent).toContain("Annual stock take");
    expect(upcoming.textContent).toContain("Yu Jun");

    const past = screen.getByTestId("special-past");
    expect(past.textContent).toContain("2020-05-01");
    expect(past.textContent).toContain("read-only");
    expect(within(past).queryByRole("button")).toBeNull();
    expect(within(past).queryByRole("textbox")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 9 · 10 · Public Holidays
// ---------------------------------------------------------------------------

describe("Public Holidays", () => {
  it("offers Malaysia and Selangor without switching the policy on for you", async () => {
    wrap("public-holidays");
    await screen.findByTestId("warehouse-public-holidays");
    expect(screen.getByTestId("holiday-policy-state")).toBeInTheDocument();
    expect(save()).toBeDisabled();
  });

  it("persists the policy through the governed door once a value moves", async () => {
    wrap("public-holidays");
    await screen.findByTestId("warehouse-public-holidays");
    fireEvent.click(screen.getByLabelText("Follow public holidays"));
    await waitFor(() => expect(save()).toBeEnabled());
    fireEvent.click(save());
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/operation/warehouse-settings/holiday-policy",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
    const body = JSON.parse(
      (apiFetch.mock.calls.find((c) => String(c[0]).endsWith("/holiday-policy"))?.[1] as {
        body: string;
      }).body,
    );
    expect(body).toMatchObject({
      followPublicHolidays: true,
      country: "Malaysia",
      state: "Selangor",
    });
  });

  it("names the source, reference and verification of an imported calendar", async () => {
    payload = baseline({
      holidayCalendars: [
        {
          id: "33333333-3333-3333-3333-333333333333",
          country: "Malaysia",
          state: "Selangor",
          version: 1,
          sourceName: "Jabatan Perpaduan Negara dan Integrasi Nasional",
          sourceReference: "Warta Kerajaan Selangor 2027",
          verifiedAt: "2026-09-09T00:00:00Z",
          importedByName: "Jess",
          importedAt: "2026-09-09T01:00:00Z",
          active: true,
          dateCount: 18,
        },
      ],
    });
    wrap("public-holidays");
    const cal = await screen.findByTestId("holiday-calendar");
    expect(cal.textContent).toContain("Jabatan Perpaduan Negara dan Integrasi Nasional");
    expect(cal.textContent).toContain("Warta Kerajaan Selangor 2027");
    expect(cal.textContent).toContain("18 dates");
  });
});

// ---------------------------------------------------------------------------
// 14 · 15 · 16 · Access and the key contact
// ---------------------------------------------------------------------------

describe("people", () => {
  it("offers only ACTIVE People as key contact — Khor Yee is not selectable", async () => {
    wrap("details");
    await screen.findByTestId("warehouse-details");
    fireEvent.click(screen.getByLabelText("Key contact"));
    await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(1));
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toContain("Yu Jun · Carres");
    expect(options).toContain("Shasha · Carres");
    expect(options.join(" ")).not.toContain("Khor Yee");
    expect(options.join(" ")).not.toContain("Samantha");
  });

  it("keeps a departed key contact's identity on the record and asks for a live one", async () => {
    payload = baseline({
      details: {
        ...baseline().details,
        keyContactId: KHOR_YEE,
        keyContactName: "Khor Yee",
        keyContactActive: false,
      },
    });
    wrap("details");
    await screen.findByTestId("warehouse-details");
    const note = screen.getByTestId("key-contact-departed");
    expect(note.textContent).toContain("Khor Yee");
    expect(note.textContent).toContain("has left");
  });

  it("assigns NOBODY by default — not Yu Jun, not Shasha", async () => {
    wrap("access");
    await screen.findByTestId("warehouse-access");
    for (const key of [
      "manage_warehouse_settings",
      "confirm_inbound_receipt",
      "confirm_collection_from_warehouse",
      "perform_stock_count",
    ]) {
      const card = screen.getByTestId(`capability-${key}`);
      expect(within(card).getByText("Not assigned")).toBeInTheDocument();
      for (const box of within(card).getAllByRole("checkbox")) {
        expect(box).not.toBeChecked();
      }
    }
  });

  it("offers the four Warehouse capabilities and nothing about Delivery", async () => {
    wrap("access");
    const section = await screen.findByTestId("warehouse-access");
    expect(within(section).getByText("Manage Warehouse Settings")).toBeInTheDocument();
    expect(within(section).getByText("Confirm inbound receipt")).toBeInTheDocument();
    expect(within(section).getByText("Confirm collection from Warehouse")).toBeInTheDocument();
    expect(within(section).getByText("Perform stock count")).toBeInTheDocument();
    expect(section.textContent).not.toMatch(/edit (the )?(delivery date|ETA|route)/i);
  });

  it("grants a capability through the governed door", async () => {
    wrap("access");
    await screen.findByTestId("warehouse-access");
    fireEvent.click(screen.getByLabelText("Yu Jun · Carres", { selector: "#perform_stock_count-" + YU_JUN }));
    await waitFor(() => expect(save()).toBeEnabled());
    fireEvent.click(save());
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/operation/warehouse-settings/access/grant",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const body = JSON.parse(
      (apiFetch.mock.calls.find((c) => String(c[0]).endsWith("/access/grant"))?.[1] as {
        body: string;
      }).body,
    );
    expect(body).toEqual({ capability: "perform_stock_count", userId: YU_JUN });
  });

  it("keeps a departed holder's name on the record", async () => {
    const base = baseline();
    payload = baseline({
      capabilities: base.capabilities.map((c) =>
        c.key === "perform_stock_count"
          ? {
              ...c,
              holders: [
                { userId: KHOR_YEE, name: "Khor Yee", grantedAt: "2026-01-01T00:00:00Z" },
              ],
            }
          : c,
      ),
    });
    wrap("access");
    await screen.findByTestId("warehouse-access");
    expect(screen.getByTestId("capability-departed-perform_stock_count").textContent).toContain(
      "Khor Yee",
    );
  });
});

// ---------------------------------------------------------------------------
// 17 · permission enforcement, on screen
// ---------------------------------------------------------------------------

describe("permission", () => {
  it("hides every control and says who may change it when the server says no", async () => {
    payload = baseline({ canEdit: false });
    wrap("details");
    await screen.findByTestId("warehouse-details");
    expect(save()).toBeDisabled();
    expect(screen.getByTestId("warehouse-settings-read-only").textContent).toContain(
      "Manage Warehouse Settings",
    );
    expect(within(screen.getByTestId("warehouse-details")).queryByRole("textbox")).toBeNull();
  });

  it("leaves the Access checkboxes unusable for a reader", async () => {
    payload = baseline({ canEdit: false });
    wrap("access");
    await screen.findByTestId("warehouse-access");
    for (const box of screen.getAllByRole("checkbox")) expect(box).toBeDisabled();
  });
});

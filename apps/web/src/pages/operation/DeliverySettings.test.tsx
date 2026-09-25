import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DeliverySettingsResponse } from "@/lib/queries";

/**
 * 【DELIVERY】 CARD 12 · Delivery Settings (Delivery MASTER §11).
 *
 * The Warehouse Settings grammar on the Delivery group: readable rows, ONE
 * `Save changes` per page naming its gap, `Not configured` for a value nobody
 * has recorded, and the change list. No roster and no owner list.
 */
const NETS = "00000000-0000-0000-0000-0000000b0001";
const AL = "00000000-0000-0000-0000-0000000b0002";
let state: { data: DeliverySettingsResponse | undefined; isError: boolean; refetch: () => void };
const apiFetch = vi.fn();

vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  ApiError: class ApiError extends Error {},
}));
vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return { ...actual, useDeliverySettings: () => state };
});
vi.mock("./PaymentTemplateLibrary", () => ({
  TemplateLibrary: ({ config }: { config: { purposes: readonly string[] } }) => (
    <div data-testid="template-library-stub">{config.purposes.length} purposes</div>
  ),
}));

import DeliverySettings from "./DeliverySettings";

function response(over: Partial<DeliverySettingsResponse> = {}): DeliverySettingsResponse {
  return {
    partners: [
      { id: NETS, name: "NETS", contact: null, zones: null, active: true, customer_phone: null, kv_default: true, customer_contact_by: "partner", record_on_behalf_allowed: true },
      { id: AL, name: "AL", contact: "03-1234", zones: null, active: false, customer_phone: "012-999", kv_default: false, customer_contact_by: "operation", record_on_behalf_allowed: false },
    ],
    drivers: [{ id: "d1", partner_id: NETS, name: "Ali", phone: "017-111", active: true }],
    vehicles: [],
    templates: [],
    changes: [
      { id: "c1", what: "partner_details", partner_id: NETS, old_value: { name: "Nets" }, new_value: { name: "NETS" }, actor_id: "u1", actor_name: "Jess", changed_at: "2026-09-13T04:00:00Z" },
    ],
    partnerAccounts: [{ id: "a1", name: "NETS office", email: "ops@nets.test", partner_id: NETS, status: "active" }],
    canEdit: true,
    contactLeadWorkingDays: 3,
    ...over,
  };
}

function renderAt(path: string) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/operation/settings/delivery/partners/:partnerId/:partnerSection?" element={<DeliverySettings />} />
          <Route path="/operation/settings/delivery/:section" element={<DeliverySettings />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockResolvedValue({ ok: true });
  state = { data: response(), isError: false, refetch: vi.fn() };
});

describe("Logistics Partners — one row per partner, each a door to its object", () => {
  it("lists every partner with its state, the customer-facing number or `Not configured`, and the KV default", () => {
    renderAt("/operation/settings/delivery/partners");
    const nets = screen.getByTestId(`delivery-settings-partner-${NETS}`);
    expect(nets).toHaveAttribute("href", `/operation/settings/delivery/partners/${NETS}`);
    expect(nets).toHaveTextContent("Not configured");
    expect(nets).toHaveTextContent("Klang Valley default");
    expect(nets).toHaveTextContent("Active");
    const al = screen.getByTestId(`delivery-settings-partner-${AL}`);
    expect(al).toHaveTextContent("012-999");
    expect(al).toHaveTextContent("Inactive");
    /* The change list names the actor and the time. */
    expect(screen.getByTestId("delivery-settings-history")).toHaveTextContent("Jess");
  });

  it("a reader sees the page and the read-only sentence; the Save button never appears for them", () => {
    state.data = response({ canEdit: false });
    renderAt(`/operation/settings/delivery/partners/${NETS}`);
    expect(screen.getByTestId("delivery-settings-read-only")).toBeInTheDocument();
    expect(screen.getByTestId("delivery-settings-save")).toBeDisabled();
  });
});

describe("the partner object — seven sections, ONE Save changes naming its gap", () => {
  it("opens on Partner details, lists the seven section links, and saves through the details door", async () => {
    renderAt(`/operation/settings/delivery/partners/${NETS}`);
    const nav = screen.getByTestId("delivery-settings-partner-nav");
    for (const label of ["Partner details", "Coverage", "Schedule", "Warehouses & handover points", "Drivers and Vehicles", "Services & charges", "Portal access"]) {
      expect(within(nav).getByRole("link", { name: label })).toBeInTheDocument();
    }
    const save = screen.getByTestId("delivery-settings-save");
    expect(save).toHaveTextContent("Save changes");
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Customer-facing number"), { target: { value: "012-3456789" } });
    expect(save).not.toBeDisabled();
    fireEvent.click(save);
    await screen.findByText("Save changes");
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/operation/delivery-settings/partner/details",
      expect.objectContaining({ method: "PUT", body: expect.stringContaining('"customerPhone":"012-3456789"') }),
    );
  });

  it("a blank partner name is a gap the Save button names", () => {
    renderAt(`/operation/settings/delivery/partners/${NETS}`);
    fireEvent.change(screen.getByLabelText("Partner name"), { target: { value: " " } });
    const save = screen.getByTestId("delivery-settings-save");
    expect(save).toHaveTextContent("Save changes — name the partner");
    expect(save).toBeDisabled();
  });

  it("Drivers and Vehicles shows the saved templates and adds a driver through its own door on Save", async () => {
    renderAt(`/operation/settings/delivery/partners/${NETS}/fleet`);
    expect(screen.getByTestId("delivery-settings-driver-0")).toBeInTheDocument();
    expect(screen.getByLabelText("Driver name")).toHaveValue("Ali");
    fireEvent.click(screen.getByTestId("delivery-settings-add-driver"));
    const names = screen.getAllByLabelText("Driver name");
    fireEvent.change(names[1]!, { target: { value: "Bala" } });
    fireEvent.click(screen.getByTestId("delivery-settings-save"));
    await screen.findByText("Save changes");
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/operation/delivery-settings/partner/driver",
      expect.objectContaining({ method: "POST", body: expect.stringContaining('"name":"Bala"') }),
    );
    /* Ali was unchanged — no second write. */
    expect(apiFetch.mock.calls.filter((c) => String(c[1]?.body ?? "").includes('"name":"Ali"'))).toHaveLength(0);
  });
});

describe("Delivery Rules — per partner, with the shared facts read-only", () => {
  it("prints who contacts the customer per partner, the shared contact lead, and the two mirrors", () => {
    renderAt("/operation/settings/delivery/rules");
    expect(screen.getByTestId("delivery-settings-rule-mirrors")).toHaveTextContent("3 working days before the requested delivery date");
    expect(screen.getByTestId("delivery-settings-rule-mirrors")).toHaveTextContent("Amount needed = RM 0");
    expect(screen.getByTestId(`delivery-settings-rules-${NETS}`)).toBeInTheDocument();
    expect(screen.getByTestId(`delivery-settings-rules-${AL}`)).toBeInTheDocument();
  });
});

describe("Message Templates and Access", () => {
  it("Message Templates is the shared template library with Delivery's purposes", () => {
    renderAt("/operation/settings/delivery/templates");
    expect(screen.getByTestId("template-library-stub")).toHaveTextContent("11 purposes");
  });

  it("Access names the two duty keys and links to Staff & Duties — it copies nobody", () => {
    renderAt("/operation/settings/delivery/access");
    expect(screen.getByTestId("delivery-settings-duty-delivery_duty")).toHaveAttribute("href", "/operation?tab=staff-duties");
    expect(screen.getByTestId("delivery-settings-duty-delivery_charge_approver")).toBeInTheDocument();
    expect(screen.queryByText(/Shasha|Yu Jun/)).toBeNull();
  });
});

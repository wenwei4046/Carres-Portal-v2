/**
 * Create Repair Order (Purchasing MASTER §9.7, owner approved 2026-09-28):
 * choose where the goods are now → Add Units → tick Unit IDs (a refused Unit
 * cannot be ticked and says why) → per Unit problem + sentence + Repair
 * Requirement → Supplier · Cost Responsibility → `Save repair order` sends
 * ONE create and opens the object.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { RepairOrderEligibleUnit } from "@carres/shared";
import RepairOrderCreate from "./RepairOrderCreate";

vi.mock("./PurchasingTabs", () => ({ default: () => <header>Repair Orders</header> }));
vi.mock("@/components/EvidenceUploadField", () => ({ default: () => <div data-testid="upload" /> }));

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  ApiError: class ApiError extends Error { status = 0; },
}));

const eligible: RepairOrderEligibleUnit[] = [
  { id: "11111111-2222-4333-8444-000000000011", unit_id: "U1-000-011", sku: "SKU-1", item: "Sofa Lyra", po_no: "PO260920-1111", site_id: "w1", site_name: null, display: false, ownership: "carres_owned", refusal: null },
  { id: "11111111-2222-4333-8444-000000000012", unit_id: "U1-000-012", sku: "SKU-1", item: "Sofa Lyra", po_no: "PO260920-1111", site_id: "w1", site_name: null, display: false, ownership: "carres_owned", refusal: "Reserved for SO2609-4827" },
];
vi.mock("@/lib/queries", () => ({
  useRepairOrderOptions: () => ({
    data: {
      sites: [
        { id: "11111111-2222-4333-8444-0000000000a1", name: "Carres Klang", carres: true },
        { id: "11111111-2222-4333-8444-0000000000a2", name: "PJ Showroom", carres: true },
        { id: "11111111-2222-4333-8444-0000000000a3", name: "AL Sungai Buloh", carres: false },
      ],
      suppliers: [{ id: "11111111-2222-4333-8444-0000000000b1", name: "Hooka" }],
    },
  }),
  useRepairOrderEligibleUnits: (site: string | null) => ({ data: site ? { units: eligible } : undefined, isLoading: false, isError: false }),
  useOperationSupplierClaims: () => ({ data: undefined }),
  useOperationSupplierClaimPhotos: () => ({ data: undefined }),
}));

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.search}</p>;
}

beforeEach(() => apiFetch.mockReset());

function show() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/operation?tab=repair-orders&create=1"]}>
        <Routes>
          <Route path="/operation" element={<><RepairOrderCreate claimId={null} /><Where /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Create Repair Order", () => {
  it("offers the Carres Sites and a disabled Dealer that is Not available yet", () => {
    show();
    const group = screen.getByRole("group", { name: "Choose where the goods are now" });
    expect(within(group).getByRole("button", { name: "Carres Klang" })).toBeEnabled();
    expect(within(group).getByRole("button", { name: "PJ Showroom" })).toBeEnabled();
    expect(within(group).queryByRole("button", { name: "AL Sungai Buloh" })).not.toBeInTheDocument();
    expect(within(group).getByRole("button", { name: "Dealer" })).toBeDisabled();
    expect(within(group).getByText("Not available yet")).toBeInTheDocument();
    // Add Units waits for the Site.
    expect(screen.getByTestId("repair-order-add-units")).toBeDisabled();
  });

  it("a refused Unit cannot be ticked and says why on its row", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Carres Klang" }));
    fireEvent.click(screen.getByTestId("repair-order-add-units"));
    expect(screen.getByTestId("repair-order-refusal-U1-000-012")).toHaveTextContent("Reserved for SO2609-4827");
    expect(screen.getByRole("checkbox", { name: "U1-000-012" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "U1-000-011" })).toBeEnabled();
  });

  it("the system-filled values wear the grey automatic box", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Carres Klang" }));
    expect(screen.getByTestId("ro-create-ro-doc-date")).toHaveAttribute("data-kit", "automatic-field");
    expect(screen.getByTestId("ro-create-supplier-pickup-location")).toHaveTextContent("Carres Klang");
  });

  it("Save repair order sends ONE create with the Unit's answers, then opens the RO", async () => {
    apiFetch.mockResolvedValue({ id: "ro-1", ro_no: "RO-20260928-4827" });
    show();
    fireEvent.click(screen.getByRole("button", { name: "Carres Klang" }));
    fireEvent.click(screen.getByTestId("repair-order-add-units"));
    fireEvent.click(screen.getByRole("checkbox", { name: "U1-000-011" }));
    fireEvent.click(screen.getByTestId("repair-order-add-picked"));

    const card = screen.getByTestId("repair-order-unit-U1-000-011");
    expect(screen.getByTestId("repair-order-save")).toBeDisabled();
    fireEvent.click(within(card).getByRole("button", { name: "Damaged" }));
    fireEvent.change(within(card).getByLabelText("What happened, in one sentence"), { target: { value: "Left arm fabric torn" } });
    fireEvent.change(within(card).getByLabelText("Repair Requirement"), { target: { value: "Replace the left arm fabric" } });
    // Supplier is the one remaining required answer (Radix Select is driven by keyboard in jsdom).
    const supplier = screen.getByRole("combobox", { name: "Supplier" });
    fireEvent.keyDown(supplier, { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "Hooka" }));

    const save = screen.getByTestId("repair-order-save");
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    const [url, init] = apiFetch.mock.calls[0] as [string, { body: string }];
    expect(url).toBe("/api/operation/repair-orders");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      supplier_id: "11111111-2222-4333-8444-0000000000b1",
      cost_responsibility: "not_decided",
      price: null,
      pickup_site_id: "11111111-2222-4333-8444-0000000000a1",
      return_site_id: "11111111-2222-4333-8444-0000000000a1",
      units: [{ stock_item_id: eligible[0]!.id, problem: "damaged", problem_note: "Left arm fabric torn", repair_requirement: "Replace the left arm fabric", evidence: [] }],
    });
    expect(body.request_id).toMatch(/^[0-9a-f-]{36}$/);
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("ro=RO-20260928-4827"));
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import WarehouseWork from "./WarehouseWork";

const apiFetchMock = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<MemoryRouter><QueryClientProvider client={qc}><WarehouseWork /></QueryClientProvider></MemoryRouter>);
}

const item = {
  id: "stock:do-1:warehouse.outbound_handover",
  module: "stock", ruleKey: "warehouse.outbound_handover",
  object: { kind: "delivery_order", id: "11111111-1111-1111-1111-111111111111", label: "DO-1001" },
  problem: "2 Units have not been handed over",
  action: "Check, pack and hand over the exact Units",
  recipient: "Driver",
  requiredResult: "Every required Unit handed over with receiver and proof",
  completionFact: "Every required Unit has an accepted Warehouse handover event",
  owner: { rule: "warehouse_site_queue_then_operator", dutyKey: null, normal: null, activeCover: null, acting: null, state: "site_queue", queue: { kind: "warehouse_site", id: "22222222-2222-2222-2222-222222222222", label: "Klang" } },
  timing: { dueOn: "2026-09-14", workingDaysLate: 0, bucket: "today" },
  destination: "/warehouse/outbound?do=DO-1001", tone: "warning", locked: false, broken: false,
};

beforeEach(() => apiFetchMock.mockReset());

describe("WarehouseWork", () => {
  it("shows Site queue work and accepts the delivery order", async () => {
    apiFetchMock.mockResolvedValue({ items: [item], staff: [], generatedOn: "2026-09-14" });
    renderPage();
    expect(await screen.findByTestId("warehouse-work-11111111-1111-1111-1111-111111111111")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Accept work" }));
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/warehouse/work/11111111-1111-1111-1111-111111111111/accept",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("keeps an empty Site queue explicit", async () => {
    apiFetchMock.mockResolvedValue({ items: [], staff: [], generatedOn: "2026-09-14" });
    renderPage();
    expect(await screen.findByTestId("warehouse-work-empty")).toHaveTextContent("No open work");
  });
});

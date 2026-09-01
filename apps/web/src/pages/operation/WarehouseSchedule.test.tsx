import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WarehouseSchedule from "./WarehouseSchedule";

const apiFetchMock = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

function renderSchedule() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <WarehouseSchedule todayIso="2026-09-03" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  apiFetchMock.mockReset();
  apiFetchMock.mockResolvedValue({
    rows: [{
      id: "delivery-pickup:do-1",
      date: "2026-09-05",
      event: "Customer delivery pickup",
      unitCodes: ["id-yjk864506"],
      units: 1,
      from: "Carres Klang Warehouse",
      to: "To customer",
      company: "Carres Transport",
      source: "DO-2609-001",
      sourcePath: "/operation/delivery-orders/DO-2609-001",
      timing: "Expected · 09:00–11:00",
      operationsReadyBy: "2026-09-04",
      evidence: "No collection evidence yet",
    }],
  });
});

describe("Warehouse Schedule", () => {
  it("is the Monday–Saturday landing Register with the exact governed columns", async () => {
    renderSchedule();
    const header = await screen.findByTestId("warehouse-schedule-destination-header");
    expect(within(header).getByText("Schedule")).toBeInTheDocument();

    for (const label of [
      "Date", "Event", "Units", "From", "To", "Company", "Source",
      "Expected/actual", "Operations ready by", "Evidence",
    ]) {
      expect(screen.getByRole("columnheader", { name: new RegExp(label, "i") })).toBeInTheDocument();
    }

    expect(await screen.findByText("Customer delivery pickup")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "DO-2609-001" })).toHaveAttribute(
      "href",
      "/operation/delivery-orders/DO-2609-001",
    );
    expect(screen.getAllByText("Fri, 4 Sep").length).toBeGreaterThan(0);
    expect(screen.getAllByText("No warehouse event planned")).toHaveLength(5);
    expect(screen.getByText(/Date: Sat, 5 Sep/)).toBeInTheDocument();
    expect(screen.queryByText("On the way")).not.toBeInTheDocument();
  });

  it("asks only for the visible Warehouse week", async () => {
    renderSchedule();
    await screen.findByText("Customer delivery pickup");
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/ops/stock/schedule?from=2026-08-31&to=2026-09-05",
    );
  });
});

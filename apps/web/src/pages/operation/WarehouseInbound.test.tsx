import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, useSearchParams, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";
import WarehouseInbound from "./WarehouseInbound";
import { inboundArrivals } from "@carres/shared";
const h = vi.hoisted(() => ({
  loading: false,
  error: null as Error | null,
  refetch: vi.fn(),
}));
vi.mock("./components/ModuleHeader", () => ({
  default: () => <h1>Inbound</h1>,
}));
vi.mock("./useWarehouseInbound", () => ({
  useWarehouseInbound: () => ({
    data: { arrivals: rows, sites: [{ id: "w", name: "Klang" }] },
    isLoading: h.loading,
    error: h.error,
    refetch: h.refetch,
  }),
}));
const rows = inboundArrivals({
  pos: [
    {
      id: "PO-1",
      supplier_id: "s",
      warehouse_id: "w",
      destination_id: null,
      status: "open",
      official_delivery_date: "2026-09-01",
      eta_date: null,
      placed_at: "2026-08-01",
      so: 1,
    },
  ],
  sites: [{ id: "w", name: "Klang" }],
  suppliers: [{ id: "s", name: "Factory" }],
  destinations: [],
  units: [{ id: "u", unit_code: "U1-000-001", po_no: "PO-1", qty: 1 }],
  receipts: [],
  results: [],
});
function Scene() {
  const [p] = useSearchParams();
  const nav = useNavigate();
  return p.get("tab") === "receiving" ? (
    <button onClick={() => nav(-1)}>Back to Inbound</button>
  ) : (
    <WarehouseInbound />
  );
}
function mount(query = "") {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter
        initialEntries={["/operation?tab=warehouse-inbound" + query]}
      >
        <Scene />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe("Inbound Register", () => {
  it("opens the real rail and Register without Calendar and routes into Receiving", () => {
    mount();
    expect(screen.getByTestId("inbound-rail")).toHaveClass("w-[240px]");
    expect(screen.queryByText("Calendar")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Open Receiving Session" }),
    ).toHaveAttribute("href", "/operation?tab=receiving&po=PO-1");
  });
  it("honours exact Monitor selection and date context", () => {
    mount("&date=2026-09-02&site=w&sourceType=supplier-delivery&source=PO-1");
    expect(screen.getByText(/No arrivals match/)).toBeInTheDocument();
  });
  it("filters status and restores search from URL", async () => {
    mount("&q=absent");
    expect(screen.getByDisplayValue("absent")).toBeInTheDocument();
    expect(screen.getByText(/No arrivals match/)).toBeInTheDocument();
  });
  it("opens exact Unit outcomes and keeps the unreceived Unit unreceived", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Expand row" }));
    expect(screen.getByRole("link", { name: "U1-000-001" })).toHaveAttribute(
      "href",
      "/operation/stock/unit/U1-000-001",
    );
    expect(
      screen.getByText("Not yet received", { exact: true }),
    ).toBeInTheDocument();
  });
  it("keeps the Register headers while loading and hides production rows", () => {
    h.loading = true;
    mount();
    expect(
      screen.getByRole("button", { name: "Expected arrival" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "PO-1" })).toBeNull();
    h.loading = false;
  });
  it("applies rail and date filters to the Register", () => {
    mount();
    fireEvent.click(screen.getByTestId("inbound-status-received"));
    expect(screen.getByText(/No arrivals match/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("inbound-status-all"));
    expect(screen.getByRole("link", { name: "PO-1" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Arrival from"), {
      target: { value: "2026-09-03" },
    });
    expect(screen.getByText(/No arrivals match/)).toBeInTheDocument();
  });
  it("restores search, filters and Register scroll after Receiving navigation", async () => {
    mount(
      "&q=PO-1&date=2026-09-01&site=w&sourceType=supplier-delivery&status=expected",
    );
    const scroll = screen.getByTestId("grid-scroll");
    Object.defineProperties(scroll, {
      scrollHeight: { value: 1000, configurable: true },
      clientHeight: { value: 200, configurable: true },
    });
    scroll.scrollTop = 150;
    fireEvent.scroll(scroll);
    const rail = screen.getByTestId("inbound-rail");
    Object.defineProperties(rail, {scrollHeight: {value: 900}, clientHeight: {value: 200}});
    rail.scrollTop = 80;
    fireEvent.scroll(rail);
    fireEvent.click(
      screen.getByRole("link", { name: "Open Receiving Session" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Back to Inbound" }));
    expect(screen.getByDisplayValue("PO-1")).toBeInTheDocument();
    expect(screen.getByLabelText("Arrival from")).toHaveValue("2026-09-01");
    expect(screen.getByTestId("inbound-status-expected")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await waitFor(() =>
      expect(screen.getByTestId("grid-scroll").scrollTop).toBe(150),
    );
  });
  it("shows failure and retries without fake rows", () => {
    h.error = new Error("Access denied");
    mount();
    expect(screen.getByText("Access denied")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(h.refetch).toHaveBeenCalled();
    h.error = null;
  });
});

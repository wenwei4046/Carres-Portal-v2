import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { LogisticsDetailsEdit } from "./DeliveryBrief";
import type { DeliveryMonitorCard } from "../delivery-monitor";

const save = vi.fn();
let fleetError = false;
vi.mock("@/lib/queries", async () => ({
  ...await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries"),
  useDeliveryPartners: () => ({ data: { partners: [{ id: "nets", name: "NETS" }, { id: "al", name: "AL" }] } }),
  useDeliverySettings: () => ({
    isError: fleetError,
    data: fleetError ? undefined : {
      drivers: [
        { id: "d1", partner_id: "nets", name: "Alex", active: true },
        { id: "d2", partner_id: "nets", name: "Retired driver", active: false },
        { id: "d3", partner_id: "al", name: "Ben", active: true },
      ],
      vehicles: [
        { id: "v1", partner_id: "nets", plate: "ABC 123", active: true },
        { id: "v2", partner_id: "al", plate: "XYZ 456", active: true },
      ],
    },
  }),
  useSaveDeliveryArrangement: () => ({ mutateAsync: save, isPending: false }),
  useRecordCannotDeliver: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function mount(driver = "", vehicle = "") {
  const card = {
    orderId: "order-1", scopeId: "order-1#0", leg: 0,
    logisticsPartnerId: "nets", logisticsPartnerName: "NETS",
    confirmedDate: "2026-10-02", confirmedTime: "Afternoon",
    scope: {
      customerDeliveryIso: "2026-10-02",
      o: { source_ref: [], customer_name: "Customer", building_type: "Landed", order_lines: [] },
      arrangement: { driver_name: driver, vehicle, expected_arrival: "14:30:00" },
    },
  } as unknown as DeliveryMonitorCard;
  return render(<LogisticsDetailsEdit card={card} onDone={vi.fn()} />);
}
function pick(label: string, option: string) {
  fireEvent.click(screen.getByRole("combobox", { name: new RegExp(`^${label}`) }));
  fireEvent.click(screen.getByRole("option", { name: option, exact: true }));
}
beforeEach(() => { save.mockReset().mockResolvedValue({}); fleetError = false; });

describe("Logistics Details fleet templates", () => {
  it("offers only active drivers for this company and saves their recorded facts alongside ETA", async () => {
    mount();
    fireEvent.click(screen.getByRole("combobox", { name: "Driver name" }));
    expect(screen.getByRole("option", { name: "Alex" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Ben" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Retired driver" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "Alex" }));
    pick("Vehicle plate", "ABC 123");
    fireEvent.change(screen.getByLabelText("ETA"), { target: { value: "15:10" } });
    await act(async () => { fireEvent.click(screen.getByTestId("delivery-brief-save-logistics")); });
    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      driverName: "Alex", vehicle: "ABC 123", expectedArrival: "15:10", confirmedTime: "Afternoon",
    }));
  });

  it("keeps a historical driver and vehicle readable, and permits clearing an optional fact", async () => {
    mount("Old driver", "OLD 001");
    expect(screen.getByRole("combobox", { name: "Driver name" })).toHaveTextContent("Old driver");
    expect(screen.getByRole("combobox", { name: "Vehicle plate" })).toHaveTextContent("OLD 001");
    pick("Driver name", "Not recorded");
    await act(async () => { fireEvent.click(screen.getByTestId("delivery-brief-save-logistics")); });
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ driverName: null, vehicle: "OLD 001" }));
  });

  it("clears the previous company's crew when Logistics changes", () => {
    mount("Alex", "ABC 123");
    pick("Logistics", "AL");
    expect(screen.getByRole("combobox", { name: "Driver name" })).toHaveTextContent("Not recorded");
    expect(screen.getByRole("combobox", { name: "Vehicle plate" })).toHaveTextContent("Not recorded");
    fireEvent.click(screen.getByRole("combobox", { name: "Driver name" }));
    expect(screen.getByRole("option", { name: "Ben" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Alex" })).not.toBeInTheDocument();
  });

  it("does not erase recorded crew when the fleet cannot be read", async () => {
    fleetError = true;
    mount("Alex", "ABC 123");
    expect(screen.getByRole("combobox", { name: "Driver name" })).toBeDisabled();
    await act(async () => { fireEvent.click(screen.getByTestId("delivery-brief-save-logistics")); });
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ driverName: "Alex", vehicle: "ABC 123" }));
  });
});

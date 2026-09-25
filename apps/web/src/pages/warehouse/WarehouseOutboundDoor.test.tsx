import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import WarehouseOutboundDoor from "./WarehouseOutboundDoor";

const query = vi.hoisted(() => ({ data: undefined as unknown, isLoading: false, error: null as Error | null }));
vi.mock("@/lib/queries", () => ({ useDeliveryWarehouseSchedule: () => query }));
vi.mock("@/pages/operation/WarehouseOutboundWork", () => ({ OutboundUnitWork: () => <div>Exact Unit door</div> }));

describe("Warehouse Outbound exact destination", () => {
  it("honours both the DO and Site from Work", () => {
    query.error = null;
    query.data = { events: ["site-1", "site-2"].map((warehouseSiteId) => ({
      kind: "customer_delivery_pickup", warehouseSiteId, deliveryOrderId: "do-1",
      doNumber: "DO-1", unitId: warehouseSiteId, eventDate: "2026-09-09",
      fromLocation: warehouseSiteId, toCustomer: "Customer", source: "SO-1",
      logisticsPartner: "Carrier", sku: "sku", productName: "Product",
    })) };
    render(<MemoryRouter initialEntries={["/warehouse/outbound?site=site-2&do=DO-1"]}><WarehouseOutboundDoor /></MemoryRouter>);
    expect(screen.getAllByText("Exact Unit door")).toHaveLength(1);
    expect(screen.getByText("site-2 → Customer")).toBeInTheDocument();
    expect(screen.queryByText("site-1 → Customer")).toBeNull();
    expect(screen.getByTestId("wod-tally")).toHaveTextContent("Required 1");
  });
  it("does not report an empty warehouse before the source is available", () => {
    query.data = undefined;
    query.error = null;
    render(<MemoryRouter><WarehouseOutboundDoor /></MemoryRouter>);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(screen.queryByTestId("wod-empty")).toBeNull();
  });
});

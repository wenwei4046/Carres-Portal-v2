import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import {
  deliveryWarehouseScheduleEvents,
  type DeliveryWarehouseScheduleInput,
} from "@carres/shared";
import WarehouseWorkspace from "./WarehouseWorkspace";
import WarehouseOutboundWork from "./WarehouseOutboundWork";

/**
 * WAREHOUSE — the 2026-09-06 replacement Card's completion standard:
 * Monitor alone renders the six-working-day Calendar, full width with NO
 * 240px rail; both directions show with governed time sentences; an
 * ARRIVAL card opens filtered Inbound, a PICKUP card filtered Outbound;
 * Outbound is rail + work rows with the carrier and the driver as separate
 * fields and the loading act named exactly.
 */

const apiFetchMock = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

/* The pages derive "today" from the app clock — pin it to the fixture week
   (Thu, 3 Sep 2026). */
vi.mock("@/lib/fmt-date", async () => {
  const actual = await vi.importActual<typeof import("@/lib/fmt-date")>("@/lib/fmt-date");
  return { ...actual, appTodayIso: () => "2026-09-03" };
});

let mediaMatches = false;
beforeEach(() => {
  mediaMatches = false;
  apiFetchMock.mockReset();
  window.matchMedia = ((query: string) => ({
    matches: mediaMatches,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

/** DO-2609-019, Klang → PJ, NETS Delivery, two Units, pickup Fri 4 Sep. */
function unitInput(
  overrides: Partial<DeliveryWarehouseScheduleInput> & { unitId: string },
): DeliveryWarehouseScheduleInput {
  return {
    orderId: "order-19",
    deliveryOrderId: "do-19",
    leg: 0,
    so: 260919,
    fromLocation: "Carres Klang Warehouse",
    toCustomer: "Petaling Jaya",
    logisticsPartner: "NETS Delivery",
    driverName: null,
    vehicle: null,
    doNumber: "DO-2609-019",
    collectionDate: "2026-09-04",
    collectionWindow: null,
    customerHandoverDate: null,
    actualCollectionAt: null,
    actualArrivalAt: null,
    hasCollectionEvidence: false,
    hasDeliveryEvidence: false,
    soDate: "2026-09-01",
    sku: "SOFA-1",
    productName: "Jager Sofa (Grey)",
    ...overrides,
  };
}

const TWO_UNIT_EVENTS = [
  ...deliveryWarehouseScheduleEvents(unitInput({ unitId: "U1-260-019" })),
  ...deliveryWarehouseScheduleEvents(unitInput({ unitId: "U1-260-020" })),
];

/** One open PO owing 3 units, expected Fri 4 Sep at the Klang warehouse. */
const OPEN_PO = {
  id: "PO-2646-0107",
  supplier_id: "sup-1",
  warehouse_id: "wh-1",
  status: "open",
  sup_status: "confirmed",
  so: null,
  so_refs: null,
  eta_date: "2026-09-04",
  placed_at: "2026-08-20",
  purchase_order_lines: [
    { id: "l1", sku: "MAT-1", qty: 3, received_qty: 0 },
  ],
};

function stubApi({
  events = TWO_UNIT_EVENTS,
  pos = [OPEN_PO],
  receipts = [] as unknown[],
} = {}) {
  apiFetchMock.mockImplementation((url: string) => {
    if (String(url).includes("warehouse-schedule"))
      return Promise.resolve({ events });
    if (String(url).includes("/api/operation/pos"))
      return Promise.resolve({ pos });
    if (String(url).includes("/api/operation/suppliers"))
      return Promise.resolve({ suppliers: [{ id: "sup-1", name: "Nice Future" }] });
    if (String(url).includes("/api/operation/warehouse-receipts"))
      return Promise.resolve({ receipts });
    if (String(url).includes("/api/operation/warehouse"))
      return Promise.resolve({ warehouses: [{ id: "wh-1", name: "Carres Klang Warehouse" }] });
    return Promise.resolve({});
  });
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function mountMonitor(initialUrl = "/operation?tab=warehouse-monitor") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <Routes>
          <Route
            path="/operation"
            element={
              <>
                <WarehouseWorkspace />
                <LocationProbe />
              </>
            }
          />
          <Route path="/operation/delivery-orders/:doId" element={<div data-testid="do-object" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function mountOutbound(initialUrl = "/operation?tab=warehouse-outbound") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <Routes>
          <Route
            path="/operation"
            element={
              <>
                <WarehouseOutboundWork />
                <LocationProbe />
              </>
            }
          />
          <Route path="/operation/delivery-orders/:doId" element={<div data-testid="do-object" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Warehouse Monitor — the only Calendar", () => {
  it("shows six operating dates full-width, with NO 240px filter rail", async () => {
    stubApi();
    mountMonitor();
    await waitFor(() => expect(screen.getByTestId("wm-board")).toBeInTheDocument());
    for (const d of ["2026-09-03", "2026-09-04", "2026-09-05", "2026-09-07", "2026-09-08", "2026-09-09"]) {
      expect(screen.getByTestId(`wm-col-${d}`)).toBeInTheDocument();
    }
    expect(screen.queryByTestId("wm-col-2026-09-06")).toBeNull();
    // The replacement Card: Monitor renders no page filter rail and no
    // Filters toggle — filtering lives on Inbound/Outbound.
    expect(screen.queryByTestId("wd-rail")).toBeNull();
    expect(screen.queryByTestId("wm-rail")).toBeNull();
    expect(screen.queryByText("Filters")).toBeNull();
    // The page title is Monitor, not Dashboard.
    expect(screen.getByTestId("warehouse-monitor-header")).toHaveTextContent("Monitor");
  });

  it("shows BOTH directions with governed time sentences — never a bare clock", async () => {
    stubApi();
    mountMonitor();
    const pickup = await screen.findByTestId("wm-card-DO-2609-019");
    expect(within(pickup).getByTestId("wm-card-time")).toHaveTextContent("Time not provided");
    expect(within(pickup).getByTestId("wm-card-kind")).toHaveTextContent(
      "Pickup · Customer-delivery pickup",
    );
    expect(within(pickup).getByText(/2 Units to Petaling Jaya/)).toBeInTheDocument();

    const arrival = screen.getByTestId("wm-card-PO-2646-0107");
    expect(within(arrival).getByTestId("wm-card-time")).toHaveTextContent("Time not provided");
    expect(within(arrival).getByTestId("wm-card-kind")).toHaveTextContent(
      "Arrival · Supplier arrival",
    );
    expect(within(arrival).getByText(/Nice Future · Pending Delivery Qty 3/)).toBeInTheDocument();
  });

  it("a recorded pickup window reads `Driver pickup {time}`", async () => {
    stubApi({
      events: [
        ...deliveryWarehouseScheduleEvents(
          unitInput({ unitId: "U1-260-019", collectionWindow: "14:30" }),
        ),
      ],
      pos: [],
    });
    mountMonitor();
    const pickup = await screen.findByTestId("wm-card-DO-2609-019");
    expect(within(pickup).getByTestId("wm-card-time")).toHaveTextContent("Driver pickup 14:30");
  });

  it("an empty date says the governed both-directions sentence", async () => {
    stubApi();
    mountMonitor();
    const empty = await screen.findByTestId("wm-empty-2026-09-05");
    expect(empty).toHaveTextContent("No arrivals or pickups on Sat, 5 Sep. Choose another date.");
  });

  it("a PICKUP card opens Outbound filtered to date, Site and DO", async () => {
    stubApi();
    mountMonitor();
    const card = await screen.findByTestId("wm-card-DO-2609-019");
    fireEvent.click(card);
    const loc = screen.getByTestId("location");
    expect(loc).toHaveTextContent("tab=warehouse-outbound");
    expect(loc).toHaveTextContent("date=2026-09-04");
    expect(loc).toHaveTextContent("do=DO-2609-019");
  });

  it("an ARRIVAL card opens Inbound filtered to date, Site and PO", async () => {
    stubApi();
    mountMonitor();
    const card = await screen.findByTestId("wm-card-PO-2646-0107");
    fireEvent.click(card);
    const loc = screen.getByTestId("location");
    expect(loc).toHaveTextContent("tab=warehouse-inbound");
    expect(loc).toHaveTextContent("date=2026-09-04");
    expect(loc).toHaveTextContent("po=PO-2646-0107");
  });

  it("`DO No` is a separate read-only document door — never Edit Delivery", async () => {
    stubApi();
    mountMonitor();
    const card = await screen.findByTestId("wm-card-DO-2609-019");
    fireEvent.click(within(card).getByTestId("wm-card-source-link"));
    expect(screen.getByTestId("do-object")).toBeInTheDocument();
    expect(screen.queryByText("Edit Delivery")).toBeNull();
  });

  it("narrow width renders one selected day; previous/next move one operating date", async () => {
    mediaMatches = true;
    stubApi();
    mountMonitor();
    await waitFor(() => expect(screen.getByTestId("wm-agenda")).toBeInTheDocument());
    expect(screen.queryByTestId("wm-board")).toBeNull();
    fireEvent.click(screen.getByTestId("wm-next"));
    expect(screen.getByTestId("location")).toHaveTextContent("date=2026-09-04");
  });
});

describe("Warehouse Outbound — rail + dated work rows", () => {
  it("has the pickup-status rail, and the carrier and driver as separate fields", async () => {
    stubApi();
    mountOutbound("/operation?tab=warehouse-outbound&date=2026-09-04");
    await waitFor(() =>
      expect(screen.getByTestId("wo-row-DO-2609-019")).toBeInTheDocument(),
    );
    const rail = screen.getByTestId("wo-rail");
    expect(within(rail).getByText("PICKUP STATUS")).toBeInTheDocument();
    expect(within(rail).getByTestId("wo-view-not-loaded")).toBeInTheDocument();
    expect(within(rail).getByTestId("wo-view-loaded")).toBeInTheDocument();
    // One Site today — the group never renders as a dead one-option control.
    expect(within(rail).queryByText("SITE")).toBeNull();
    // The identities are separate, and no driver is invented.
    const row = screen.getByTestId("wo-row-DO-2609-019");
    expect(within(row).getByText("Logistics Partner")).toBeInTheDocument();
    expect(within(row).getByText("Assigned Driver")).toBeInTheDocument();
    expect(within(row).getByTestId("wo-driver-DO-2609-019")).toHaveTextContent(
      "Waiting for NETS Delivery to assign a driver",
    );
    // The two evidence records stay separate lines.
    expect(within(row).getByTestId("wo-loaded-DO-2609-019")).toHaveTextContent(
      "Warehouse loaded — nothing yet",
    );
    expect(within(row).getByTestId("wo-collected-DO-2609-019")).toHaveTextContent(
      "NETS Delivery has not confirmed collection yet",
    );
  });

  it("an assigned driver renders by name, and the vehicle is its own field", async () => {
    stubApi({
      events: [
        ...deliveryWarehouseScheduleEvents(
          unitInput({
            unitId: "U1-260-019",
            driverName: "Ahmad Rahman",
            vehicle: "VBM 1234",
          }),
        ),
      ],
    });
    mountOutbound("/operation?tab=warehouse-outbound&date=2026-09-04");
    const row = await screen.findByTestId("wo-row-DO-2609-019");
    expect(within(row).getByTestId("wo-driver-DO-2609-019")).toHaveTextContent("Ahmad Rahman");
    expect(within(row).getByText("VBM 1234")).toBeInTheDocument();
  });

  it("opens scoped to the deep-linked DO with `Goods scheduled for pickup` and derived reasons", async () => {
    stubApi();
    mountOutbound("/operation?tab=warehouse-outbound&do=DO-2609-019");
    await waitFor(() =>
      expect(screen.getByTestId("wo-units-DO-2609-019")).toBeInTheDocument(),
    );
    // The work date is the card's own date even without a date param.
    expect(screen.getByTestId("wo-date")).toHaveTextContent("Fri, 4 Sep");
    const units = screen.getByTestId("wo-units-DO-2609-019");
    expect(within(units).getByText("Goods scheduled for pickup")).toBeInTheDocument();
    expect(within(units).getByTestId("wo-unit-reason-U1-260-019")).toHaveTextContent(
      "Not scanned yet",
    );
    // No loading act before scan/check/pack; no generic Mark done ever.
    expect(screen.queryByTestId("wo-record-loaded")).toBeNull();
    expect(screen.queryByText("Mark done")).toBeNull();
  });

  it("an empty Outbound date says the governed pickup sentence", async () => {
    stubApi();
    mountOutbound("/operation?tab=warehouse-outbound&date=2026-09-05");
    const empty = await screen.findByTestId("wo-empty-2026-09-05");
    expect(empty).toHaveTextContent("No pickups on Sat, 5 Sep. Choose another date.");
  });

  it("scanning a Unit outside this DO's scope is refused in words; a valid scan calls the governed door", async () => {
    stubApi();
    mountOutbound("/operation?tab=warehouse-outbound&do=DO-2609-019");
    await screen.findByTestId("wo-units-DO-2609-019");
    const input = screen.getByTestId("wo-scan-input");
    const prepCalls = () =>
      apiFetchMock.mock.calls.filter(([url]) => String(url).includes("outbound-prep"));
    fireEvent.change(input, { target: { value: "U9-999-999" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(prepCalls()).toHaveLength(0);
    fireEvent.change(input, { target: { value: "U1-260-019" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/api/operation/delivery-orders/do-19/outbound-prep",
        expect.objectContaining({
          body: JSON.stringify({ fact: "scanned", unitCodes: ["U1-260-019"] }),
        }),
      ),
    );
  });

  it("the loading act names the exact count and receiver, and requires receiver + proof", async () => {
    stubApi({
      events: [
        ...deliveryWarehouseScheduleEvents(
          unitInput({
            unitId: "U1-260-019",
            driverName: "Ahmad Rahman",
            unitScannedAt: "t",
            unitCheckedAt: "t",
            unitPackedAt: "t",
          }),
        ),
        ...deliveryWarehouseScheduleEvents(unitInput({ unitId: "U1-260-020" })),
      ],
    });
    mountOutbound("/operation?tab=warehouse-outbound&do=DO-2609-019");
    const open = await screen.findByTestId("wo-record-loaded");
    expect(open).toHaveTextContent("Record 1 Unit loaded to Ahmad Rahman");
    expect(screen.getByTestId("wo-receiver-consequence")).toHaveTextContent("NETS Delivery");
    fireEvent.click(open);
    // Only the prepared Unit is offered; the un-prepared one cannot ride.
    expect(screen.getByTestId("wo-pick-U1-260-019")).toBeInTheDocument();
    expect(screen.queryByTestId("wo-pick-U1-260-020")).toBeNull();
    const submit = screen
      .getAllByRole("button", { name: /loaded to/ })
      .at(-1) as HTMLButtonElement;
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByTestId("wo-receiver"), { target: { value: "Ahmad Rahman" } });
    // Still disabled — proof is required, not optional.
    expect(submit).toBeDisabled();
  });

  it("a confirmed collection with an unloaded Unit names that exact Unit — never `Needs checking`", async () => {
    stubApi({
      events: [
        ...deliveryWarehouseScheduleEvents(
          unitInput({
            unitId: "U1-260-019",
            driverName: "Ahmad Rahman",
            unitScannedAt: "t",
            unitCheckedAt: "t",
            unitPackedAt: "t",
            unitHandedOverAt: "2026-09-04T11:18:00+08:00",
            unitHasEvidence: true,
            actualCollectionAt: "2026-09-04T15:02:00+08:00",
            hasCollectionEvidence: true,
          }),
        ),
        ...deliveryWarehouseScheduleEvents(
          unitInput({
            unitId: "U1-260-020",
            driverName: "Ahmad Rahman",
            actualCollectionAt: "2026-09-04T15:02:00+08:00",
            hasCollectionEvidence: true,
          }),
        ),
      ],
    });
    mountOutbound("/operation?tab=warehouse-outbound&do=DO-2609-019");
    const block = await screen.findByTestId("wo-not-collected");
    expect(block).toHaveTextContent(
      "U1-260-020 was not confirmed by Ahmad Rahman. It remains with Carres Klang Warehouse.",
    );
    expect(screen.queryByText("Needs checking")).toBeNull();
  });

  it("Back goes to Monitor and keeps the URL context", async () => {
    stubApi();
    mountOutbound("/operation?tab=warehouse-outbound&date=2026-09-04&do=DO-2609-019&site=X");
    await screen.findByTestId("warehouse-outbound");
    const back = screen.getByTestId("wo-back-monitor");
    expect(back).toHaveAttribute("href", expect.stringContaining("tab=warehouse-monitor"));
    expect(back).toHaveAttribute("href", expect.stringContaining("site=X"));
  });
});

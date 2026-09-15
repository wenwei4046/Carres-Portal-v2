import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import {
  deliveryWarehouseScheduleEvents,
  type DeliveryWarehouseScheduleInput,
} from "@carres/shared";
import WarehouseOutboundWork from "./WarehouseOutboundWork";

/**
 * WAREHOUSE — OUTBOUND, the unified pickup work Register.
 *
 * Rail + work rows, the carrier and the driver kept as separate fields, the
 * loading act named exactly, and the two evidence records (`Warehouse loaded`
 * and `Driver collected`) never merged into one confirmation.
 *
 * The Schedule board that opens these rows is tested next door in
 * `WarehouseWorkspace.test.tsx`; this file owns the destination.
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

describe("Warehouse Outbound — the unified Register", () => {
  it("product expansion is read-only; Loading opens the owning work and Back preserves filters and scroll", async () => {
    stubApi();
    mountOutbound("/operation?tab=warehouse-outbound&view=all&q=Jager");
    await screen.findByTestId("wo-row-DO-2609-019");
    fireEvent.click(screen.getByTestId("wo-row-toggle-DO-2609-019"));
    expect(screen.getByTestId("wo-product-detail-DO-2609-019")).toHaveTextContent("U1-260-019");
    expect(screen.queryByTestId("wo-scan-input")).toBeNull();
    const scroll = screen.getByTestId("grid-scroll");
    scroll.scrollTop = 120;
    fireEvent.scroll(scroll);
    fireEvent.click(screen.getByTestId("wo-open-loading-DO-2609-019"));
    expect(screen.getByTestId("outbound-loading-workspace")).toBeInTheDocument();
    expect(screen.getByTestId("wo-scan-input")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "← Back to Outbound" }));
    expect(screen.queryByTestId("outbound-loading-workspace")).toBeNull();
    expect(screen.getByTestId("location")).toHaveTextContent("view=all&q=Jager");
    expect(screen.getByTestId("grid-scroll").scrollTop).toBe(120);
  });

  it("preserves a failed scan for retry through the same owning action", async () => {
    stubApi();
    const original = apiFetchMock.getMockImplementation()!;
    let attempts = 0;
    apiFetchMock.mockImplementation((url, ...args) => {
      if (String(url).includes("outbound-prep")) {
        attempts++;
        return attempts === 1 ? Promise.reject(new Error("Connection failed")) : Promise.resolve({});
      }
      return original(url, ...args);
    });
    mountOutbound("/operation?tab=warehouse-outbound&loading=do-19:Carres%20Klang%20Warehouse");
    const input = await screen.findByTestId("wo-scan-input");
    fireEvent.change(input, { target: { value: "U1-260-019" } });
    fireEvent.click(screen.getByTestId("wo-scan-btn"));
    await waitFor(() => expect(screen.getByTestId("wo-scan-btn")).not.toBeDisabled());
    expect(input).toHaveValue("U1-260-019");
    fireEvent.click(screen.getByTestId("wo-scan-btn"));
    await waitFor(() => expect(input).toHaveValue(""));
    expect(attempts).toBe(2);
  });

  it("keeps a fully loaded but unconfirmed pickup visible without calling it Done", async () => {
    stubApi({ events: deliveryWarehouseScheduleEvents(unitInput({unitId: "U1-260-019", unitHandedOverAt: "2026-09-04T10:00:00Z", unitHasEvidence: true})) });
    mountOutbound();
    const row = await screen.findByTestId("wo-row-DO-2609-019");
    expect(row).toHaveTextContent("Driver confirmed 0");
    expect(row).toHaveTextContent("Loaded, not confirmed by NETS Delivery");
    fireEvent.click(screen.getByTestId("wo-open-loading-DO-2609-019"));
    expect(screen.getByTestId("wo-unit-reason-U1-260-019")).toHaveTextContent("Loaded · Awaiting driver confirmation");
    expect(screen.queryByRole("button", { name: /confirm.*driver/i })).toBeNull();
  });
  it("has the pickup-status rail and separate carrier/driver facts, and keeps the two evidence records apart", async () => {
    stubApi();
    mountOutbound("/operation?tab=warehouse-outbound&date=2026-09-04");
    await waitFor(() =>
      expect(screen.getByTestId("wo-row-DO-2609-019")).toBeInTheDocument(),
    );
    const rail = screen.getByTestId("wo-rail");
    expect(within(rail).getByText("PICKUP STATUS")).toBeInTheDocument();
    expect(within(rail).getByTestId("wo-view-open")).toBeInTheDocument();
    expect(within(rail).getByTestId("wo-view-loaded")).toBeInTheDocument();
    // One Site today — the group never renders as a dead one-option control.
    expect(within(rail).queryByText("SITE")).toBeNull();
    // The column headers speak the shared row grammar.
    expect(screen.getByText(/Scheduled handover Fri/)).toBeInTheDocument();
    expect(screen.getByText("Document")).toBeInTheDocument();
    expect(screen.getByTestId("wo-open-loading-DO-2609-019")).toBeInTheDocument();
    const row = screen.getByTestId("wo-row-DO-2609-019");
    expect(within(row).getByTestId("wo-driver-DO-2609-019")).toHaveTextContent(
      "Waiting for NETS Delivery to assign a driver",
    );
    // Required / Loaded / Driver confirmed stay three numbers.
    expect(within(row).getByTestId("outbound-tally-DO-2609-019")).toHaveTextContent(
      "Required 2 · Loaded 0",
    );
    expect(within(row).getByTestId("outbound-tally-DO-2609-019")).toHaveTextContent(
      "Driver confirmed 0",
    );
    // The two evidence records live in the arrangement's own detail.
    fireEvent.click(screen.getByTestId("wo-open-loading-DO-2609-019"));
    expect(screen.getByTestId("wo-loaded-DO-2609-019")).toHaveTextContent(
      "Warehouse loaded — nothing yet",
    );
    expect(screen.getByTestId("wo-collected-DO-2609-019")).toHaveTextContent(
      "NETS Delivery has not confirmed collection yet",
    );
  });

  it("an assigned driver renders by name, and the vehicle stays its own fact", async () => {
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
    mountOutbound("/operation?tab=warehouse-outbound&do=DO-2609-019&loading=do-19:Carres%20Klang%20Warehouse");
    const row = await screen.findByTestId("wo-row-DO-2609-019");
    expect(within(row).getByTestId("wo-driver-DO-2609-019")).toHaveTextContent("Ahmad Rahman");
    expect(screen.getByText("Vehicle VBM 1234")).toBeInTheDocument();
  });

  it("a Schedule deep link opens its exact arrangement already unfolded, with derived per-Unit reasons", async () => {
    stubApi();
    mountOutbound("/operation?tab=warehouse-outbound&do=DO-2609-019&loading=do-19:Carres%20Klang%20Warehouse");
    await waitFor(() =>
      expect(screen.getByTestId("wo-units-DO-2609-019")).toBeInTheDocument(),
    );
    const units = screen.getByTestId("wo-units-DO-2609-019");
    expect(within(units).getByText("Goods scheduled for pickup")).toBeInTheDocument();
    expect(within(units).getByTestId("wo-unit-reason-U1-260-019")).toHaveTextContent(
      "Not scanned yet",
    );
    // No loading act before scan/check/pack; no generic Mark done ever.
    expect(screen.queryByTestId("wo-record-loaded")).toBeNull();
    expect(screen.queryByText("Mark done")).toBeNull();
    // The whole row navigates nowhere; the DO No is the document door.
    expect(screen.getByTestId("outbound-document-DO-2609-019")).toHaveAttribute(
      "href",
      "/operation/delivery-orders/DO-2609-019",
    );
  });

  it("the menu default lists every unfinished arrangement; a done arrangement stays queryable", async () => {
    stubApi({
      events: [
        ...TWO_UNIT_EVENTS,
        ...deliveryWarehouseScheduleEvents(
          unitInput({
            unitId: "U1-260-030",
            doNumber: "DO-2609-030",
            deliveryOrderId: "do-30",
            orderId: "order-30",
            collectionDate: "2026-09-05",
            unitHandedOverAt: "2026-09-05T09:00:00+08:00",
            unitHasEvidence: true,
          }),
        ),
      ],
    });
    mountOutbound();
    await waitFor(() =>
      expect(screen.getByTestId("wo-row-DO-2609-019")).toBeInTheDocument(),
    );
    // Finished work is not in the default scope…
    expect(screen.getByTestId("wo-row-DO-2609-030")).toBeInTheDocument();
    // …but its count is honest in the SAME scope, and one click shows it.
    expect(screen.getByTestId("wo-view-loaded")).toHaveTextContent("Loaded1");
    fireEvent.click(screen.getByTestId("wo-view-loaded"));
    await waitFor(() =>
      expect(screen.getByTestId("wo-row-DO-2609-030")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("wo-row-DO-2609-019")).toBeNull();
  });

  it("an empty exact date says the governed pickup sentence and the summary matches the range", async () => {
    stubApi();
    mountOutbound("/operation?tab=warehouse-outbound&date=2026-09-05");
    await waitFor(() =>
      expect(
        screen.getByText("No pickups on Sat, 5 Sep. Choose another date."),
      ).toBeInTheDocument(),
    );
    expect(screen.getByTestId("wo-range-summary")).toHaveTextContent(
      "0 pickup arrangements · Units: Required 0 · Loaded 0 · Driver confirmed 0",
    );
  });

  it("scanning a Unit outside this DO's scope is refused in words; a valid scan calls the governed door", async () => {
    stubApi();
    mountOutbound("/operation?tab=warehouse-outbound&do=DO-2609-019&loading=do-19:Carres%20Klang%20Warehouse");
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
    mountOutbound("/operation?tab=warehouse-outbound&do=DO-2609-019&loading=do-19:Carres%20Klang%20Warehouse");
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
    mountOutbound("/operation?tab=warehouse-outbound&do=DO-2609-019&loading=do-19:Carres%20Klang%20Warehouse");
    const block = await screen.findByTestId("wo-not-collected");
    expect(block).toHaveTextContent(
      "U1-260-020 was not confirmed by Ahmad Rahman. It remains with Carres Klang Warehouse.",
    );
    expect(screen.queryByText("Needs checking")).toBeNull();
  });

  it("Back goes to Pickup Schedule and keeps the URL context", async () => {
    stubApi();
    mountOutbound("/operation?tab=warehouse-outbound&date=2026-09-04&do=DO-2609-019&site=X");
    await screen.findByTestId("warehouse-outbound");
    const back = screen.getByTestId("wo-back-monitor");
    expect(back).toHaveAttribute("href", expect.stringContaining("tab=warehouse-pickup-schedule"));
    expect(back).toHaveAttribute("href", expect.stringContaining("site=X"));
  });
});

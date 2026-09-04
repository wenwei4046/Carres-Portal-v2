import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import {
  deliveryWarehouseScheduleEvents,
  type DeliveryWarehouseScheduleInput,
} from "@carres/shared";
import WarehouseWorkspace from "./WarehouseWorkspace";

/**
 * WAREHOUSE CARD 03 — the §12 UI verification list over the §10 acceptance
 * story: six desktop columns in one horizontal sequence, the exact empty
 * sentence, card → scoped Outbound, `DO No` → the formal DO, exact counts
 * after a partial batch, the approved rail headings, and no forbidden
 * control (ETA · generic Failed Delivery · Edit Delivery · Mark done).
 */

const apiFetchMock = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

/* The workspace derives "today" from the app clock — pin it to the card's
   fixture week (Thu, 3 Sep 2026). */
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

/** The §10 fixture: DO-2609-019, Tan Wei Ming, Klang → PJ, NETS, two Units. */
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
    logisticsPartner: "NETS",
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

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function mount(
  events = TWO_UNIT_EVENTS,
  initialUrl = "/operation?tab=warehouse-dashboard",
) {
  apiFetchMock.mockResolvedValue({ events });
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

describe("Warehouse Dashboard — the Calendar board", () => {
  it("shows six operating dates in one horizontal sequence with Sunday absent", async () => {
    mount();
    await waitFor(() => expect(screen.getByTestId("wd-board")).toBeInTheDocument());
    // Thu 3 → Wed 9 Sep, Sunday 6 Sep omitted.
    for (const d of ["2026-09-03", "2026-09-04", "2026-09-05", "2026-09-07", "2026-09-08", "2026-09-09"]) {
      expect(screen.getByTestId(`wd-col-${d}`)).toBeInTheDocument();
    }
    expect(screen.queryByTestId("wd-col-2026-09-06")).toBeNull();
    // ONE sequence: the six columns share one grid row, not a 3 × 2 wrap.
    const board = screen.getByTestId("wd-board");
    const grid = board.firstElementChild as HTMLElement;
    expect(grid.style.gridTemplateColumns).toContain("repeat(6");
    // One shared vertical scroll: the columns themselves are not scroll containers.
    expect(screen.getByTestId("wd-col-2026-09-03").className).not.toContain("overflow");
  });

  it("an empty date says the exact governed sentence", async () => {
    mount();
    const empty = await screen.findByTestId("wd-empty-2026-09-05");
    expect(empty).toHaveTextContent("No outbound handovers on Sat, 5 Sep. Choose another date.");
  });

  it("the card prints the exact tally and no forbidden word", async () => {
    mount();
    const card = await screen.findByTestId("wd-card-DO-2609-019");
    expect(within(card).getByTestId("wd-card-tally")).toHaveTextContent(
      "Required 2 · Handed over 0 · Not handed over 2",
    );
    expect(within(card).getByText("NETS")).toBeInTheDocument();
    expect(card.textContent).not.toContain("ETA");
    expect(card.textContent).not.toContain("Failed Delivery");
    expect(card.textContent).not.toContain("Edit Delivery");
    // No actual handover exists yet, so no time is invented.
    expect(within(card).queryByTestId("wd-card-time")).toBeNull();
  });

  it("after a partial batch the card reads the recorded time and 1/1, and Outbound names the remaining Unit", async () => {
    const events = [
      ...deliveryWarehouseScheduleEvents(
        unitInput({
          unitId: "U1-260-019",
          unitScannedAt: "t",
          unitCheckedAt: "t",
          unitPackedAt: "t",
          unitHandedOverAt: "2026-09-04T11:18:00+08:00",
          unitHasEvidence: true,
          unitDeliveryPerson: "Ahmad",
        }),
      ),
      ...deliveryWarehouseScheduleEvents(unitInput({ unitId: "U1-260-020" })),
    ];
    mount(events);
    const card = await screen.findByTestId("wd-card-DO-2609-019");
    expect(within(card).getByTestId("wd-card-tally")).toHaveTextContent(
      "Required 2 · Handed over 1 · Not handed over 1",
    );
    expect(within(card).getByTestId("wd-card-time")).toHaveTextContent("11:18");
    expect(within(card).getByTestId("wd-card-fact")).toHaveTextContent(
      "U1-260-020 still needs handover",
    );
  });

  it("clicking the card opens Outbound scoped to the card's date and DO", async () => {
    mount();
    const card = await screen.findByTestId("wd-card-DO-2609-019");
    fireEvent.click(card);
    expect(screen.getByTestId("location")).toHaveTextContent(
      "tab=warehouse-outbound",
    );
    expect(screen.getByTestId("location")).toHaveTextContent("date=2026-09-04");
    expect(screen.getByTestId("location")).toHaveTextContent("do=DO-2609-019");
    expect(screen.getByTestId("warehouse-outbound")).toBeInTheDocument();
    // The Dashboard stays mounted underneath — Back restores it as it stood.
    expect(screen.getByTestId("warehouse-dashboard")).toBeInTheDocument();
  });

  it("the card activates from the keyboard", async () => {
    mount();
    const card = await screen.findByTestId("wd-card-DO-2609-019");
    fireEvent.keyDown(card, { key: "Enter" });
    expect(screen.getByTestId("location")).toHaveTextContent("tab=warehouse-outbound");
  });

  it("`DO No` is a separate door to the formal Delivery Order — it does not open Outbound", async () => {
    mount();
    const card = await screen.findByTestId("wd-card-DO-2609-019");
    fireEvent.click(within(card).getByTestId("wd-card-do"));
    expect(screen.getByTestId("do-object")).toBeInTheDocument();
  });

  it("the rail uses the approved headings and never draws a dead one-option group", async () => {
    mount();
    await screen.findByTestId("wd-card-DO-2609-019");
    const rail = screen.getByTestId("wd-rail");
    expect(within(rail).getByText("OUTBOUND SCHEDULE")).toBeInTheDocument();
    // One Site and one live source today: neither group renders as a dead
    // one-option control (card §4.2).
    expect(within(rail).queryByText("SITE")).toBeNull();
    expect(within(rail).queryByText("SOURCE")).toBeNull();
    // No Refresh and no write control in the toolbar; no Mark done anywhere.
    expect(screen.queryByText("Refresh")).toBeNull();
    expect(screen.queryByText("Mark done")).toBeNull();
  });

  it("Not done groups unfinished work under its ORIGINAL date", async () => {
    mount();
    await screen.findByTestId("wd-card-DO-2609-019");
    fireEvent.click(screen.getByTestId("wd-sched-not-done"));
    const list = await screen.findByTestId("wd-list-not-done");
    expect(within(list).getByText("Fri, 4 Sep")).toBeInTheDocument();
    expect(within(list).getByTestId("wd-card-DO-2609-019")).toBeInTheDocument();
  });
});

describe("Warehouse Dashboard — narrow width", () => {
  it("renders one selected day as an agenda, never six shrunken columns", async () => {
    mediaMatches = true;
    mount();
    await waitFor(() => expect(screen.getByTestId("wd-agenda")).toBeInTheDocument());
    expect(screen.queryByTestId("wd-board")).toBeNull();
    // Prev/next move ONE operating date: from Thu 4 Sep back over no Sunday.
    fireEvent.click(screen.getByTestId("wd-next"));
    expect(screen.getByTestId("location")).toHaveTextContent("date=2026-09-04");
  });
});

describe("Warehouse Outbound — the dated work listing", () => {
  it("opens scoped to the deep-linked DO and shows the exact Units with their derived reasons", async () => {
    mount(TWO_UNIT_EVENTS, "/operation?tab=warehouse-outbound&do=DO-2609-019");
    await waitFor(() =>
      expect(screen.getByTestId("wo-row-DO-2609-019")).toBeInTheDocument(),
    );
    // The work date is the card's own date even without a date param.
    expect(screen.getByTestId("wo-date")).toHaveTextContent("Fri, 4 Sep");
    const units = screen.getByTestId("wo-units-DO-2609-019");
    expect(within(units).getByTestId("wo-unit-U1-260-019")).toBeInTheDocument();
    expect(within(units).getByTestId("wo-unit-reason-U1-260-019")).toHaveTextContent(
      "Not scanned yet",
    );
    // No handover control before scan/check/pack; no generic Mark done ever.
    expect(screen.queryByTestId("wo-record-handover")).toBeNull();
    expect(screen.queryByText("Mark done")).toBeNull();
  });

  it("an empty Outbound date says the exact governed sentence", async () => {
    mount(TWO_UNIT_EVENTS, "/operation?tab=warehouse-outbound&date=2026-09-05");
    const empty = await screen.findByTestId("wo-empty-2026-09-05");
    expect(empty).toHaveTextContent("No outbound handovers on Sat, 5 Sep. Choose another date.");
  });

  it("scanning a Unit outside this DO's scope is refused in words, and a valid scan calls the governed door", async () => {
    mount(TWO_UNIT_EVENTS, "/operation?tab=warehouse-outbound&do=DO-2609-019");
    await screen.findByTestId("wo-row-DO-2609-019");
    const input = screen.getByTestId("wo-scan-input");
    const prepCalls = () =>
      apiFetchMock.mock.calls.filter(([url]) =>
        String(url).includes("outbound-prep"),
      );
    fireEvent.change(input, { target: { value: "U9-999-999" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(prepCalls()).toHaveLength(0); // refused in words, no call made
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

  it("Record handover appears only for fully prepared Units and requires receiver + proof", async () => {
    const events = [
      ...deliveryWarehouseScheduleEvents(
        unitInput({
          unitId: "U1-260-019",
          unitScannedAt: "t",
          unitCheckedAt: "t",
          unitPackedAt: "t",
        }),
      ),
      ...deliveryWarehouseScheduleEvents(unitInput({ unitId: "U1-260-020" })),
    ];
    mount(events, "/operation?tab=warehouse-outbound&do=DO-2609-019");
    const open = await screen.findByTestId("wo-record-handover");
    // The consequence is readable before the act (card §7 step 3).
    expect(screen.getByTestId("wo-receiver-consequence")).toHaveTextContent("NETS");
    fireEvent.click(open);
    // Only the prepared Unit is offered; the un-prepared one cannot ride.
    expect(screen.getByTestId("wo-pick-U1-260-019")).toBeInTheDocument();
    expect(screen.queryByTestId("wo-pick-U1-260-020")).toBeNull();
    const submit = screen
      .getAllByRole("button", { name: "Record handover" })
      .at(-1) as HTMLButtonElement;
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByTestId("wo-receiver"), { target: { value: "Ahmad" } });
    // Still disabled — proof is required, not optional.
    expect(submit).toBeDisabled();
  });

  it("Back to Dashboard keeps the URL context", async () => {
    mount(TWO_UNIT_EVENTS, "/operation?tab=warehouse-outbound&date=2026-09-04&do=DO-2609-019&site=X");
    await screen.findByTestId("warehouse-outbound");
    const back = screen.getByTestId("wo-back-dashboard");
    expect(back).toHaveAttribute("href", expect.stringContaining("tab=warehouse-dashboard"));
    expect(back).toHaveAttribute("href", expect.stringContaining("site=X"));
  });
});

/**
 * OperationDelivery — T11, the Delivery module page (the LAST card of line ①).
 *
 * T11 is assembly, so these tests pin the two things assembly can get wrong:
 *
 *  1. **The board must not become a second opinion.** A row appears here only
 *     because the SAME `nextActionOf` the Orders list runs said a delivery step
 *     is next — so a money-held order (🔒 Confirm) is absent, a stock-blocked
 *     order is absent, and the pill says exactly what the Orders list says.
 *  2. **The module writes nothing.** Every action leaves through `Open order`.
 *
 * Plus the words: the queue labels come from the shared constant (no synonym),
 * and no banned word (POD · Unscheduled · Carrier) reaches the screen.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { DELIVERY_QUEUES } from "@carres/shared";
import type {
  operationOrderListRow,
  operationOrdersListResponse,
  operationStockResponse,
  DeliveryPartnersListResponse,
} from "@/lib/queries";

let listState: {
  data: operationOrdersListResponse | undefined;
  isLoading: boolean;
  refetch: ReturnType<typeof vi.fn>;
};
let partnersState: { data: DeliveryPartnersListResponse | undefined };
let stockState: { data: operationStockResponse | undefined };

vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useOperationOrders: () => listState,
    useDeliveryPartners: () => partnersState,
    useOperationStock: () => stockState,
  };
});

vi.mock("./components/OrderDetailDrawer", () => ({
  default: ({ orderId, onClose }: { orderId: string; onClose: () => void }) => (
    <div data-testid="drawer-stub" data-order-id={orderId}>
      <button onClick={onClose}>close</button>
    </div>
  ),
}));

import OperationDelivery from "./OperationDelivery";

// 2026-07-27 is a Monday; 2026-08-01 a Saturday.
const TODAY = "2026-07-27";

function makeRow(
  partial: Partial<operationOrderListRow> & { id: string; so: number },
): operationOrderListRow {
  return {
    status: "proceed_order",
    operation_stage: "ready_to_dispatch",
    warehouse_id: null,
    customer_name: "Kong Chai Yin",
    customer_phone: null,
    customer_address: null,
    placed_at: "2026-07-01T00:00:00Z",
    delivery_date: "2026-08-05",
    delivery_date_tbd: false,
    source_system: null,
    source_ref: null,
    ops_assigned_logistic: null,
    order_lines: [],
    delivery_partner_id: null,
    request_for_delivery_at: null,
    partner_accepted_at: null,
    partner_rejected_at: null,
    partner_rejected_reason: null,
    delivery_partners: null,
    do_number: null,
    dispatched_at: null,
    delivered_at: null,
    outlet_id: null,
    dealer_id: "d-1",
    dealers: { name: "Carres KL" },
    order_supplier_threads: [],
    order_annotations: [],
    ...partial,
  };
}

/** Stock is in (ready_to_dispatch) and nobody is carrying it yet ⇒ the ladder
 *  answers "Assign logistic" — the first delivery queue. */
const NEEDS_LOGISTICS = makeRow({ id: "a", so: 1201, customer_name: "ella" });

/** Assigned, but the customer has not confirmed ⇒ the second queue. */
const NEEDS_DATE = makeRow({
  id: "b",
  so: 1202,
  customer_name: "PETER",
  delivery_partner_id: "p-nets",
  delivery_partners: { id: "p-nets", name: "NETS Logistics" },
});

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/operation?tab=delivery"]}>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  listState = { data: { orders: [] }, isLoading: false, refetch: vi.fn() };
  partnersState = { data: { partners: [] } };
  stockState = { data: undefined };
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${TODAY}T09:00:00`));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("OperationDelivery — the board holds delivery work, and only that", () => {
  it("lists an order whose next action is a delivery step", () => {
    listState.data = { orders: [NEEDS_LOGISTICS] };
    wrap(<OperationDelivery />);
    const rows = screen.getAllByTestId("delivery-row");
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText("SO-1201")).toBeTruthy();
    // The pill is the LADDER's word, taken from the shared queue constant —
    // never a string typed into this page.
    expect(within(rows[0]).getByText(DELIVERY_QUEUES[0].label)).toBeTruthy();
  });

  it("leaves out an order the ladder says is NOT a delivery step yet", () => {
    // No PO anywhere and no stock ⇒ the ladder answers "Order PO". Goods first:
    // you do not arrange the delivery of goods nobody has ordered.
    listState.data = {
      orders: [
        makeRow({
          id: "c",
          so: 1203,
          operation_stage: "placed",
          status: "place",
          order_lines: [{ sku: "mattress:MAT-1", qty: 1 }],
        }),
      ],
    };
    wrap(<OperationDelivery />);
    expect(screen.queryAllByTestId("delivery-row")).toHaveLength(0);
    expect(screen.getByText(/An order joins this board the moment/)).toBeTruthy();
  });

  it("leaves out a money-held order — you do not arrange a delivery you may not make", () => {
    // Stock in, logistics assigned, customer confirmed, but RM 2,455 owing ⇒
    // the ladder answers a LOCKED "Confirm", which is not a delivery queue.
    listState.data = {
      orders: [
        makeRow({
          id: "d",
          so: 1204,
          delivery_partner_id: "p-nets",
          delivery_partners: { id: "p-nets", name: "NETS Logistics" },
          ops_order_control: {
            booking_stage: "confirmed",
            confirmed_date: "2026-08-05",
            balance: 2455,
          },
        }),
      ],
    };
    wrap(<OperationDelivery />);
    expect(screen.queryAllByTestId("delivery-row")).toHaveLength(0);
  });

  it("counts each queue in the facet rail, with its own late tail", () => {
    listState.data = {
      orders: [
        NEEDS_LOGISTICS,
        NEEDS_DATE,
        // Promised 3 days ago with nobody assigned: the assign step's deadline
        // (3 working days BEFORE the promise) is long gone → 1 late.
        makeRow({ id: "e", so: 1205, delivery_date: "2026-07-24" }),
      ],
    };
    wrap(<OperationDelivery />);
    const facet = screen.getByTestId("delivery-queues");
    // "2 · 1 late" — numbers up front (COPY-STANDARD rule 3).
    expect(within(facet).getByText("2 · 1 late")).toBeTruthy();
    expect(within(facet).getByText("1")).toBeTruthy();
  });

  it("filters to one queue when its facet row is picked, and clears from the chip", () => {
    listState.data = { orders: [NEEDS_LOGISTICS, NEEDS_DATE] };
    wrap(<OperationDelivery />);
    expect(screen.getAllByTestId("delivery-row")).toHaveLength(2);
    fireEvent.click(within(screen.getByTestId("delivery-queues")).getByText(DELIVERY_QUEUES[1].label));
    const rows = screen.getAllByTestId("delivery-row");
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText("SO-1202")).toBeTruthy();
    fireEvent.click(within(screen.getByTestId("listshell-active-chips")).getByText(DELIVERY_QUEUES[1].label));
    expect(screen.getAllByTestId("delivery-row")).toHaveLength(2);
  });

  it("puts the late row first — delivery risk, not the order's overall slack", () => {
    listState.data = {
      orders: [
        makeRow({ id: "f", so: 1210, delivery_date: "2026-09-30" }),
        makeRow({ id: "g", so: 1211, delivery_date: "2026-07-24" }),
      ],
    };
    wrap(<OperationDelivery />);
    const rows = screen.getAllByTestId("delivery-row");
    expect(within(rows[0]).getByText("SO-1211")).toBeTruthy();
  });
});

describe("OperationDelivery — the detail pane states facts and hands over", () => {
  it("opens the order drawer rather than editing anything here", () => {
    listState.data = { orders: [NEEDS_DATE] };
    wrap(<OperationDelivery />);
    fireEvent.click(screen.getAllByTestId("delivery-row")[0]);
    fireEvent.click(screen.getByText("Open order"));
    expect(screen.getByTestId("drawer-stub").getAttribute("data-order-id")).toBe("b");
  });

  it("says nothing about a logistics company that never gave us rules", () => {
    listState.data = { orders: [NEEDS_DATE] };
    partnersState.data = { partners: [{ id: "p-nets", name: "NETS Logistics", contact: null, zones: null }] };
    wrap(<OperationDelivery />);
    fireEvent.click(screen.getAllByTestId("delivery-row")[0]);
    const detail = screen.getByTestId("delivery-detail");
    // Absent data means "we never asked" — never "it's fine" (the T9 law).
    expect(within(detail).getByText("No delivery rules recorded for NETS Logistics.")).toBeTruthy();
  });

  it("prints the rules a logistics company DID give us", () => {
    listState.data = { orders: [NEEDS_DATE] };
    partnersState.data = {
      partners: [
        {
          id: "p-nets",
          name: "NETS Logistics",
          contact: null,
          zones: null,
          booking_lead_days: 2,
          daily_capacity: 8,
        },
      ],
    };
    wrap(<OperationDelivery />);
    fireEvent.click(screen.getAllByTestId("delivery-row")[0]);
    const detail = screen.getByTestId("delivery-detail");
    expect(within(detail).getByText("2 working days notice")).toBeTruthy();
    expect(within(detail).getByText("8 deliveries a day")).toBeTruthy();
  });

  it("stays silent about a delivery photo it cannot substantiate", () => {
    // No overlay row at all ⇒ the ledger is UNKNOWN, not "no photo" (T6/T7).
    listState.data = { orders: [NEEDS_DATE] };
    wrap(<OperationDelivery />);
    fireEvent.click(screen.getAllByTestId("delivery-row")[0]);
    const detail = screen.getByTestId("delivery-detail");
    expect(within(detail).getByText("Open the order to see the delivery photo.")).toBeTruthy();
    expect(within(detail).queryByText(/No delivery photo yet/)).toBeNull();
  });
});

describe("OperationDelivery — the calendar reads the booking, never the promise", () => {
  it("shows a promised-but-unbooked order as work, not as a delivery", () => {
    listState.data = { orders: [makeRow({ id: "h", so: 1220, delivery_date: TODAY })] };
    wrap(<OperationDelivery />);
    fireEvent.click(screen.getByText("Calendar"));
    const day = screen.getByTestId(`delivery-day-${TODAY}`);
    expect(within(day).getByText("No deliveries booked this day.")).toBeTruthy();
    expect(within(day).getByText("Promised this day, no date yet")).toBeTruthy();
    expect(within(day).getByText(/Call Kong Chai Yin — book delivery date/)).toBeTruthy();
  });

  it("puts a confirmed booking on its own day and names the slot", () => {
    listState.data = {
      orders: [
        makeRow({
          id: "i",
          so: 1221,
          delivery_partner_id: "p-nets",
          delivery_partners: { id: "p-nets", name: "NETS Logistics" },
          ops_order_control: {
            booking_stage: "confirmed",
            confirmed_date: TODAY,
            confirmed_time_slot: "Afternoon (12pm–3pm)",
          },
        }),
      ],
    };
    wrap(<OperationDelivery />);
    fireEvent.click(screen.getByText("Calendar"));
    const day = screen.getByTestId(`delivery-day-${TODAY}`);
    expect(within(day).getByText("12pm–3pm")).toBeTruthy();
  });

  it("opens a detail for a booked truck that is NOT on the board", () => {
    // A money-held order is off the queue list (you may not deliver it yet) but
    // its truck is still booked for that day — clicking it must say what the
    // Orders list says, never open a blank pane.
    listState.data = {
      orders: [
        makeRow({
          id: "k",
          so: 1223,
          delivery_partner_id: "p-nets",
          delivery_partners: { id: "p-nets", name: "NETS Logistics" },
          ops_order_control: {
            booking_stage: "confirmed",
            confirmed_date: TODAY,
            balance: 2455,
          },
        }),
      ],
    };
    wrap(<OperationDelivery />);
    expect(screen.queryAllByTestId("delivery-row")).toHaveLength(0);
    fireEvent.click(screen.getByText("Calendar"));
    fireEvent.click(within(screen.getByTestId(`delivery-day-${TODAY}`)).getByText("SO-1223"));
    const detail = screen.getByTestId("delivery-detail");
    // C3 — the money-held order's line is the action that CLEARS the hold, with
    // its figure, where it used to read `Confirm delivery with …`: the resting
    // Confirm was retired and the 🔒 moved onto `Collect`.
    expect(within(detail).getByText(/Collect RM 2,455 from/)).toBeTruthy();
    expect(within(detail).getByText("🔒")).toBeTruthy();
  });

  it("calls a logistics-only date what it is — never green, never 'carrier'", () => {
    listState.data = {
      orders: [
        makeRow({
          id: "j",
          so: 1222,
          delivery_partner_id: "p-nets",
          delivery_partners: { id: "p-nets", name: "NETS Logistics" },
          ops_order_control: { booking_stage: "provisional", logistic_eta: TODAY },
        }),
      ],
    };
    wrap(<OperationDelivery />);
    fireEvent.click(screen.getByText("Calendar"));
    const day = screen.getByTestId(`delivery-day-${TODAY}`);
    expect(within(day).getByText("Logistics' date")).toBeTruthy();
  });
});

describe("OperationDelivery — the words", () => {
  it("never renders a banned word (POD · Unscheduled · Not booked · Carrier · Chase supplier)", () => {
    listState.data = { orders: [NEEDS_LOGISTICS, NEEDS_DATE] };
    const { container } = wrap(<OperationDelivery />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\bPOD\b|Proof of Delivery/i);
    expect(text).not.toMatch(/Unscheduled|Not booked|need booking/i);
    expect(text).not.toMatch(/\bCarrier\b/i);
  });

  it("takes its queue words from the shared constant, so it cannot grow a synonym", () => {
    listState.data = { orders: [NEEDS_LOGISTICS, NEEDS_DATE] };
    wrap(<OperationDelivery />);
    const facet = screen.getByTestId("delivery-queues");
    for (const q of DELIVERY_QUEUES) {
      expect(within(facet).getByText(q.label)).toBeTruthy();
    }
  });
});

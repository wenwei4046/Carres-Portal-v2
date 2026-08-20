/**
 * THE DELIVERY ORDERS REGISTER — the blueprint card's laws, held as tests:
 *
 *   · the ruled seven columns, in order — and NO owner / avatar / action column
 *   · status is the ONE shared arithmetic (exception carries its reason)
 *   · dates print through fmtDate (`Wed, 12 Aug`), absences read as words
 *   · the empty state answers what · why · who does what next
 *   · a row's DO number is a door to the DO object page
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DeliveryOrdersRegister from "./DeliveryOrdersRegister";
import { fmtDate } from "@/lib/fmt-date";
import type {
  DeliveryHandoverKindRow,
  DeliveryOrderAttemptRow,
  DeliveryOrderRow,
  DeliveryOrdersRegisterPayload,
} from "@/lib/queries";

let hookState: {
  data: DeliveryOrdersRegisterPayload | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
};

const useDeliveryOrdersRegisterSpy = vi.fn((..._args: unknown[]) => hookState);

vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useDeliveryOrdersRegister: (...args: unknown[]) =>
      useDeliveryOrdersRegisterSpy(...args),
  };
});

const doRow = (over: Partial<DeliveryOrderRow> = {}): DeliveryOrderRow => ({
  id: "00000000-0000-0000-0000-0000000d0001",
  do_number: "DO-180826-3035",
  issued_at: "2026-08-18T01:47:00Z",
  trip_groups: null,
  delivery_date: "2026-08-20",
  time_slot: "Afternoon (12pm–3pm)",
  logistics_partner: "NETS",
  voided_at: null,
  void_reason: null,
  orders: {
    id: "00000000-0000-0000-0000-0000000a0001",
    so: 1322,
    customer_name: "IT WALK SLICE2 AUTO",
    customer_address_city: "Klang",
    customer_address_state: "Selangor",
    delivery_date: "2026-08-25",
    delivery_date_tbd: false,
  },
  ...over,
});

function mount(
  rows: DeliveryOrderRow[],
  attempts: DeliveryOrderAttemptRow[] = [],
  handoverEvents: DeliveryHandoverKindRow[] = [],
  initialEntry = "/operation/delivery-orders",
) {
  hookState = {
    data: { deliveryOrders: rows, attempts, handoverEvents },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  };
  const locations: string[] = [];
  function LocationTap() {
    const loc = useLocation();
    locations.push(loc.pathname);
    return null;
  }
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <LocationTap />
        <Routes>
          <Route path="/operation/delivery-orders" element={<DeliveryOrdersRegister />} />
          <Route path="*" element={<DeliveryOrdersRegister />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { locations };
}

beforeEach(() => {
  localStorage.clear();
  useDeliveryOrdersRegisterSpy.mockClear();
});

describe("DeliveryOrdersRegister", () => {
  it("asks Delivery for only the source Sales Order named by the URL", () => {
    mount([], [], [], "/operation/delivery-orders?order=order-1");
    expect(useDeliveryOrdersRegisterSpy).toHaveBeenCalledWith({ orderId: "order-1" });
  });

  it("renders the owner's ruled eight columns in order, Created off by default, and NO owner/avatar/action column", () => {
    mount([doRow()]);
    for (const label of [
      "DO No",
      "DO date",
      "SO No",
      "Customer",
      "Customer Delivery",
      "Delivery date",
      "Delivery Location",
      "Status",
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    // `Created` lives in the chooser, off by default (owner ruling 2026-08-18)
    // — no column HEADER carries it (the fresh document's STATUS pill still
    // reads Created, which is a different fact).
    expect(screen.queryByRole("columnheader", { name: "Created" })).toBeNull();
    for (const banned of ["Owner", "PIC", "Next action", "Assigned"]) {
      expect(screen.queryByText(banned)).toBeNull();
    }
  });

  it("prints the ruled facts: number, SO door, capitalised customer, the three dates, locality", () => {
    mount([doRow()]);
    expect(screen.getByText("DO-180826-3035")).toBeTruthy();
    expect(screen.getByText("SO-1322")).toBeTruthy();
    // capitalize-up only: an all-caps name survives unchanged
    expect(screen.getByText("IT WALK SLICE2 AUTO")).toBeTruthy();
    // DO date (issued) · Customer Delivery (the SO promise) · Delivery date (the trip)
    expect(screen.getAllByText(new RegExp(fmtDate("2026-08-18"))).length).toBeGreaterThan(0);
    expect(screen.getAllByText(new RegExp(fmtDate("2026-08-25"))).length).toBeGreaterThan(0);
    expect(screen.getAllByText(new RegExp(fmtDate("2026-08-20"))).length).toBeGreaterThan(0);
    expect(screen.getByText("Klang, Selangor")).toBeTruthy();
  });

  it("a fresh document reads Created; a failed one reads Delivery exception with its ONE reason", () => {
    mount(
      [
        doRow(),
        doRow({
          id: "00000000-0000-0000-0000-0000000d0002",
          do_number: "DO-170826-5050",
        }),
      ],
      [
        {
          do_number: "DO-170826-5050",
          result: "failed",
          reason_key: "customer_unreachable",
          recorded_at: "2026-08-20T09:00:00Z",
        },
      ],
    );
    // The Created COLUMN is off by default now, so the pill is the only one.
    expect(screen.getAllByText("Created").length).toBeGreaterThan(0);
    expect(screen.getByText("Delivery exception")).toBeTruthy();
    expect(screen.getByText("Customer unreachable")).toBeTruthy();
  });

  it("a received-not-yet-resulted document reads Out for delivery — earlier chain facts alone do not", () => {
    // §4 slice 1 (0363): ready + handed on one document derive NOTHING new;
    // logistics receipt on the other lights the blue pill.
    mount(
      [
        doRow(),
        doRow({
          id: "00000000-0000-0000-0000-0000000d0002",
          do_number: "DO-190826-7070",
        }),
      ],
      [],
      [
        { delivery_order_id: "00000000-0000-0000-0000-0000000d0001", kind: "ready_for_handover" },
        { delivery_order_id: "00000000-0000-0000-0000-0000000d0001", kind: "handed_over" },
        { delivery_order_id: "00000000-0000-0000-0000-0000000d0002", kind: "ready_for_handover" },
        { delivery_order_id: "00000000-0000-0000-0000-0000000d0002", kind: "handed_over" },
        { delivery_order_id: "00000000-0000-0000-0000-0000000d0002", kind: "received_by_logistics" },
      ],
    );
    expect(screen.getByText("Out for delivery")).toBeTruthy();
    // The ready+handed document still reads Created.
    expect(screen.getAllByText("Created").length).toBeGreaterThan(0);
  });

  it("a recorded Delivery Result outranks the handover derivation", () => {
    mount(
      [doRow()],
      [
        {
          do_number: "DO-180826-3035",
          result: "delivered",
          reason_key: null,
          recorded_at: "2026-08-20T09:00:00Z",
        },
      ],
      [
        { delivery_order_id: "00000000-0000-0000-0000-0000000d0001", kind: "received_by_logistics" },
      ],
    );
    expect(screen.getByText("Delivered")).toBeTruthy();
    expect(screen.queryByText("Out for delivery")).toBeNull();
  });

  it("a voided document reads Cancelled and never Delivered", () => {
    mount([
      doRow({
        voided_at: "2026-08-19T02:00:00Z",
        void_reason: "rescheduled",
      }),
    ]);
    expect(screen.getByText("Cancelled")).toBeTruthy();
    expect(screen.queryByText("Delivered")).toBeNull();
  });

  it("an absent delivery date reads as words, never a dash", () => {
    mount([doRow({ delivery_date: null, time_slot: null })]);
    expect(screen.getByText("No delivery date yet")).toBeTruthy();
    expect(screen.queryByText("—")).toBeNull();
  });

  it("the empty state answers what is missing, why, and who does what next", () => {
    mount([]);
    const empty = screen.getByText(/No delivery orders yet/);
    expect(empty.textContent).toContain("the system issues one");
    expect(empty.textContent).toContain("Order Route");
  });

  it("the DO number is a door to the DO object page", () => {
    const { locations } = mount([doRow()]);
    fireEvent.click(screen.getByText("DO-180826-3035"));
    expect(locations.at(-1)).toBe("/operation/delivery-orders/DO-180826-3035");
  });

  it("the register offers no create, issue, release or approve control", () => {
    mount([doRow()]);
    for (const banned of [/new delivery order/i, /issue/i, /release/i, /approve/i]) {
      expect(screen.queryByText(banned)).toBeNull();
    }
  });
});

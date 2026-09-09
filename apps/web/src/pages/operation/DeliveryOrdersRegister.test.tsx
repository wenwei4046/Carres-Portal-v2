/**
 * THE DELIVERY ORDERS REGISTER — the 2026-09-06 owner correction, held as tests:
 *
 *   · the Sales Orders Register grammar: row checkboxes, header select-all,
 *     the in-place selection toolbar, ▸ expansion, sticky identity
 *   · the ruled default columns in order — Requested Delivery Date, Confirmed
 *     Time, Goods and Created live in the chooser, off by default
 *   · the 240px page-owned FilterRail: WORK TO DO (canonical queues only) +
 *     DOCUMENT STATUS, riding the URL
 *   · status is the ONE shared arithmetic (exception carries its reason)
 *   · the SO identity cell carries NO inline `Order Route` action
 *   · selection actions are document OUTPUTS — never `Assign logistics`
 *   · absences read as words, never a dash; the empty state answers
 *     what · why · who does what next
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
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
    /* The ▸ expansion's Unit facts are their own query — quiet here. */
    useSalesOrderExpansion: () => ({ data: undefined, isLoading: false }),
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
    do_file_path: null,
    order_lines: [{ id: "l-1", sku: "mattress:M1401F-K", qty: 1 }],
    ops_order_control: null,
    ...(over.orders ?? {}),
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
    locations.push(`${loc.pathname}${loc.search}`);
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

  /** The visible header labels, in the order the sheet prints them — the
   *  selection and ▸ headers included, so a header index and a row's cell
   *  index address the SAME column. */
  function headerOrder(): string[] {
    return screen.getAllByRole("columnheader").map((h) => (h.textContent ?? "").trim());
  }

  it("renders the corrected default columns in the ruled order, `Requested Delivery Date` visible", () => {
    mount([doRow()]);
    /* ⭐ THE OWNER'S ORDER (correction 2026-09-09): the customer's request and
       the confirmed answer stand together near the front; `DO date` — the day
       the paper was issued, and neither delivery date — falls to the end. */
    const ruled = [
      "DO No",
      "SO No",
      "Customer",
      "Requested Delivery Date",
      "Confirmed Delivery",
      "Confirmed Time",
      "Logistics Partner",
      "Delivery Location",
      "Delivery Result",
      "Proof Status",
      "Status",
      "DO date",
    ];
    const headers = headerOrder();
    expect(ruled.every((label) => headers.some((h) => h.includes(label)))).toBe(true);
    const at = (label: string) => headers.findIndex((h) => h.includes(label));
    expect(ruled.map(at)).toEqual([...ruled.map(at)].sort((a, b) => a - b));
    /* ADJACENT — nothing may be inserted between the request and the answer. */
    expect(at("Confirmed Delivery") - at("Requested Delivery Date")).toBe(1);
    /* `DO date` is LAST of the twelve: it answers when the document issued. */
    expect(at("DO date")).toBe(Math.max(...ruled.map(at)));
    /* Still in the chooser, off by default. */
    for (const hidden of ["Goods", "Created"]) {
      expect(screen.queryByRole("columnheader", { name: hidden })).toBeNull();
    }
    /* The retired ambiguous label never returns. */
    expect(screen.queryByRole("columnheader", { name: "Delivery date" })).toBeNull();
    for (const banned of ["Owner", "PIC", "Next action", "Assigned"]) {
      expect(screen.queryByText(banned)).toBeNull();
    }
  });

  it("`DO date` is never printed as the requested or the confirmed delivery date", () => {
    /* Three different days, so nothing can pass by coincidence. */
    mount([
      doRow({
        issued_at: "2026-08-17T00:00:00Z",
        delivery_date: "2026-08-24",
        orders: {
          ...doRow().orders,
          delivery_date: "2026-08-20",
          delivery_date_tbd: false,
        },
      }),
    ]);
    const row = screen.getAllByRole("row").at(-1)!;
    const cells = within(row)
      .getAllByRole("cell")
      .map((c) => (c.textContent ?? "").trim());
    const headers = headerOrder();
    const cellUnder = (label: string) =>
      cells[headers.findIndex((h) => h.includes(label))] ?? "";
    expect(cellUnder("Requested Delivery Date")).toContain("20 Aug");
    expect(cellUnder("Confirmed Delivery")).toContain("24 Aug");
    expect(cellUnder("DO date")).toContain("17 Aug");
  });

  it("a customer date still being settled reads `To be confirmed`, never `No delivery date`", () => {
    mount([
      doRow({
        orders: {
          ...doRow().orders,
          delivery_date: "2026-08-25",
          delivery_date_tbd: true,
        },
      }),
    ]);
    const row = screen.getAllByRole("row").at(-1)!;
    const cells = within(row)
      .getAllByRole("cell")
      .map((c) => (c.textContent ?? "").trim());
    const headers = headerOrder();
    const cell = cells[headers.findIndex((h) => h.includes("Requested Delivery Date"))] ?? "";
    expect(cell).toBe("To be confirmed");
    /* The stored day is deliberately NOT printed — nobody has agreed it. */
    expect(cell).not.toContain("25 Aug");
  });

  it("wears the Sales Orders grammar: checkboxes, header select-all, chevrons, and the in-place selection toolbar", () => {
    mount([
      doRow(),
      doRow({ id: "00000000-0000-0000-0000-0000000d0002", do_number: "DO-170826-5050" }),
    ]);
    /* Header select-all + one checkbox per row. */
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBe(3);
    /* Selecting all visible rows swaps the toolbar in place. */
    fireEvent.click(checkboxes[0]!);
    expect(screen.getByText("2 delivery orders selected")).toBeTruthy();
    expect(screen.getByText("Clear")).toBeTruthy();
    /* Selection actions are document OUTPUTS with the truthful count — and
       never the Monitor-owned `Assign logistics`. */
    expect(screen.getByText("Print 2 delivery orders")).toBeTruthy();
    expect(screen.queryByText("Assign logistics")).toBeNull();
    /* Clear returns the normal toolbar. */
    fireEvent.click(screen.getByText("Clear"));
    expect(screen.queryByText("2 delivery orders selected")).toBeNull();
  });

  it("▸ expands to the document's goods lines, read-only", () => {
    mount([doRow()]);
    const chevron = screen.getAllByTitle("Show delivery order goods")[0]!;
    fireEvent.click(chevron);
    const expansion = screen.getByTestId("do-register-expansion");
    /* The SKU prints in the mini table (item name and SKU cell may both
       carry it — the line has no display label). */
    expect(within(expansion).getAllByText("mattress:M1401F-K").length).toBeGreaterThan(0);
    /* Read-only: no editable control inside the expansion. */
    expect(within(expansion).queryByRole("textbox")).toBeNull();
  });

  it("carries the page-owned FilterRail with WORK TO DO and DOCUMENT STATUS", () => {
    mount([
      doRow(),
      doRow({
        id: "00000000-0000-0000-0000-0000000d0002",
        do_number: "DO-170826-5050",
        voided_at: "2026-08-19T02:00:00Z",
        void_reason: "rescheduled",
      }),
    ]);
    const rail = screen.getByTestId("delivery-orders-rail");
    expect(within(rail).getByText("WORK TO DO")).toBeTruthy();
    expect(within(rail).getByText("DOCUMENT STATUS")).toBeTruthy();
    for (const queue of [
      "Record delivery result",
      "Upload delivery photo",
      "Upload signed Delivery Order",
    ]) {
      expect(within(rail).getByText(queue)).toBeTruthy();
    }
    /* The canonical document ladder, plus All. */
    for (const status of ["All", "Created", "Out for delivery", "Delivered", "Delivery exception", "Cancelled"]) {
      expect(within(rail).getByText(status)).toBeTruthy();
    }
  });

  it("a DOCUMENT STATUS pick narrows the listing and rides the URL", () => {
    const { locations } = mount([
      doRow(),
      doRow({
        id: "00000000-0000-0000-0000-0000000d0002",
        do_number: "DO-170826-5050",
        voided_at: "2026-08-19T02:00:00Z",
        void_reason: "rescheduled",
      }),
    ]);
    fireEvent.click(screen.getByTestId("delivery-orders-status-cancelled"));
    expect(locations.at(-1)).toContain("status=cancelled");
    expect(screen.getByText("DO-170826-5050")).toBeTruthy();
    expect(screen.queryByText("DO-180826-3035")).toBeNull();
    expect(screen.getByText("1 of 2 delivery orders")).toBeTruthy();
  });

  it("Record delivery result queues exactly the out-for-delivery documents", () => {
    mount(
      [
        doRow(),
        doRow({ id: "00000000-0000-0000-0000-0000000d0002", do_number: "DO-190826-7070" }),
      ],
      [],
      [
        { delivery_order_id: "00000000-0000-0000-0000-0000000d0002", kind: "ready_for_handover" },
        { delivery_order_id: "00000000-0000-0000-0000-0000000d0002", kind: "handed_over" },
        { delivery_order_id: "00000000-0000-0000-0000-0000000d0002", kind: "received_by_logistics" },
      ],
    );
    fireEvent.click(screen.getByTestId("delivery-orders-work-record_result"));
    expect(screen.getByText("DO-190826-7070")).toBeTruthy();
    expect(screen.queryByText("DO-180826-3035")).toBeNull();
  });

  it("a delivered document with a KNOWN-empty photo ledger queues under Upload delivery photo — an unknown ledger claims nothing", () => {
    mount(
      [
        doRow({ orders: { ...doRow().orders, ops_order_control: { delivery_photos: [] } } }),
        doRow({
          id: "00000000-0000-0000-0000-0000000d0002",
          do_number: "DO-190826-7070",
          orders: { ...doRow().orders, ops_order_control: null },
        }),
      ],
      [
        {
          do_number: "DO-180826-3035",
          result: "delivered",
          reason_key: null,
          recorded_at: "2026-08-20T09:00:00Z",
        },
        {
          do_number: "DO-190826-7070",
          result: "delivered",
          reason_key: null,
          recorded_at: "2026-08-20T09:00:00Z",
        },
      ],
    );
    fireEvent.click(screen.getByTestId("delivery-orders-work-upload_photo"));
    expect(screen.getByText("DO-180826-3035")).toBeTruthy();
    /* The unknown-ledger document is NOT invented into the photo queue; its
       recorded result with no signed document queues it under the signed-DO
       upload instead. */
    expect(screen.queryByText("DO-190826-7070")).toBeNull();
  });

  it("a delivered document with its photo saved but no signed DO queues under Upload signed Delivery Order", () => {
    mount(
      [
        doRow({
          orders: {
            ...doRow().orders,
            do_file_path: null,
            ops_order_control: {
              delivery_photos: [{ path: "p.jpg", at: "2026-08-20T10:00:00Z", by: null }],
            },
          },
        }),
      ],
      [
        {
          do_number: "DO-180826-3035",
          result: "delivered",
          reason_key: null,
          recorded_at: "2026-08-20T09:00:00Z",
        },
      ],
    );
    fireEvent.click(screen.getByTestId("delivery-orders-work-upload_signed_do"));
    expect(screen.getByText("DO-180826-3035")).toBeTruthy();
    /* And the Proof Status cell states both facts. */
    expect(screen.getByText("Delivery photo saved")).toBeTruthy();
    expect(screen.getByText("No signed document yet")).toBeTruthy();
  });

  it("prints the ruled facts: number, SO door, capitalised customer, the document dates, locality, partner", () => {
    mount([doRow()]);
    expect(screen.getByText("DO-180826-3035")).toBeTruthy();
    expect(screen.getByText("SO-1322")).toBeTruthy();
    // capitalize-up only: an all-caps name survives unchanged
    expect(screen.getByText("IT WALK SLICE2 AUTO")).toBeTruthy();
    // DO date (issued) · Confirmed Delivery (the trip)
    expect(screen.getAllByText(new RegExp(fmtDate("2026-08-18"))).length).toBeGreaterThan(0);
    expect(screen.getAllByText(new RegExp(fmtDate("2026-08-20"))).length).toBeGreaterThan(0);
    expect(screen.getByText("Klang, Selangor")).toBeTruthy();
    expect(screen.getByText("NETS")).toBeTruthy();
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
    expect(screen.getAllByText("Created").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Delivery exception").length).toBeGreaterThan(0);
    expect(screen.getByText("Customer unreachable")).toBeTruthy();
    /* The Delivery Result column speaks the governed result word. */
    expect(screen.getAllByText("Failed Delivery").length).toBeGreaterThan(0);
  });

  it("a received-not-yet-resulted document reads Out for delivery — earlier chain facts alone do not", () => {
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
    expect(screen.getAllByText("Out for delivery").length).toBeGreaterThan(0);
    // The ready+handed document still reads Created.
    expect(screen.getAllByText("Created").length).toBeGreaterThan(0);
  });

  it("a voided document reads Cancelled and never Delivered", () => {
    mount([
      doRow({
        voided_at: "2026-08-19T02:00:00Z",
        void_reason: "rescheduled",
      }),
    ]);
    expect(screen.getAllByText("Cancelled").length).toBeGreaterThan(0);
    /* The rail's DOCUMENT STATUS group legitimately lists `Delivered`; the
       LISTING itself must not claim it. */
    const listing = screen.getByTestId("register-column");
    expect(within(listing).queryByText("Delivered")).toBeNull();
  });

  it("absences read as words, never a dash", () => {
    mount([doRow({ delivery_date: null, time_slot: null, logistics_partner: null })]);
    expect(screen.getAllByText("No confirmed date").length).toBeGreaterThan(0);
    expect(screen.getAllByText("No logistics picked").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Not delivered yet").length).toBeGreaterThan(0);
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

  it("the SO cell is identity only — the inline Order Route action is retired", () => {
    const { locations } = mount([doRow()]);
    expect(
      screen.queryByRole("button", { name: "Open Order Route for SO-1322" }),
    ).toBeNull();
    expect(screen.queryByText("Order Route")).toBeNull();
    fireEvent.click(screen.getByText("SO-1322"));
    expect(locations.at(-1)).toBe(
      "/operation/orders/so/00000000-0000-0000-0000-0000000a0001",
    );
  });

  it("the register offers no create, issue, release or approve control", () => {
    mount([doRow()]);
    for (const banned of [/new delivery order/i, /issue/i, /release/i, /approve/i]) {
      expect(screen.queryByText(banned)).toBeNull();
    }
  });
});

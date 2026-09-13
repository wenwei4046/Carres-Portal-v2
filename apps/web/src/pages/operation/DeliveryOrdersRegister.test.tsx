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

/**
 * ⭐ THE RAIL'S WIDTH DEFAULT IS ITSELF A TESTED BEHAVIOUR (owner ruling
 * 2026-09-11): below 1100px it starts collapsed. jsdom reports 1024px, so
 * every test that wants to click a rail row states the operator's REMEMBERED
 * choice first - exactly the path a real operator takes once they open it.
 * The narrow-default and its `Show filters` entry get their own test below.
 */
function mount(
  rows: DeliveryOrderRow[],
  attempts: DeliveryOrderAttemptRow[] = [],
  handoverEvents: DeliveryHandoverKindRow[] = [],
  initialEntry = "/operation/delivery-orders",
  { rail = true }: { rail?: boolean } = {},
) {
  if (rail) localStorage.setItem("carres.deliveryOrders.filterRail", "1");
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

  it("renders the approved default columns in the ruled order (owner ruling 2026-09-11)", () => {
    mount([doRow()]);
    /* ⭐ THE OWNER'S ORDER (ruling 2026-09-11, overwriting 2026-09-09):
       identity and the day the paper issued stand together; the document's
       state answers next; the customer's request and the confirmed answer
       stay ADJACENT; the trip's own facts close the row. */
    const ruled = [
      "DO No",
      "DO date",
      "SO No",
      "Customer",
      "Status",
      "Requested Delivery Date",
      "Confirmed Delivery",
      "Confirmed Time",
      "Logistics",
      "Delivery Location",
      "Driver submission",
    ];
    const headers = headerOrder();
    expect(ruled.every((label) => headers.some((h) => h.includes(label)))).toBe(true);
    const at = (label: string) => headers.findIndex((h) => h.includes(label));
    expect(ruled.map(at)).toEqual([...ruled.map(at)].sort((a, b) => a - b));
    /* ADJACENT — nothing may be inserted between the request and the answer. */
    expect(at("Confirmed Delivery") - at("Requested Delivery Date")).toBe(1);
    /* `DO date` follows the number it dates, not the far end of the sheet. */
    expect(at("DO date") - at("DO No")).toBe(1);
    /* ONE status column: the separate default `Delivery Result` is retired,
       and so is `Proof Status`. */
    expect(headers.filter((h) => h.includes("Status")).length).toBe(1);
    for (const retired of ["Delivery Result", "Proof Status", "Logistics Partner"]) {
      expect(screen.queryByRole("columnheader", { name: retired })).toBeNull();
    }
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
    /* ⭐ DOCUMENT STATUS is the kit's own dropdown (owner ruling
       2026-09-11), offering `All` plus the ladder's five words - each with
       its live count, because the number is why a row is picked. */
    const status = within(rail).getByRole("combobox");
    expect(status.textContent).toContain("All");
    fireEvent.click(status);
    for (const word of ["Created", "Out for delivery", "Delivered", "Delivery exception", "Cancelled"]) {
      expect(screen.getAllByText(new RegExp(word)).length).toBeGreaterThan(0);
    }
  });

  it("a DOCUMENT STATUS pick narrows the listing and rides the URL", async () => {
    const { locations } = mount([
      doRow(),
      doRow({
        id: "00000000-0000-0000-0000-0000000d0002",
        do_number: "DO-170826-5050",
        voided_at: "2026-08-19T02:00:00Z",
        void_reason: "rescheduled",
      }),
    ]);
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: /Cancelled/ }));
    expect(locations.at(-1)).toContain("status=cancelled");
    expect(screen.getByText("DO-170826-5050")).toBeTruthy();
    expect(screen.queryByText("DO-180826-3035")).toBeNull();
    expect(screen.getByText("1 of 2 delivery orders")).toBeTruthy();
  });

  it("a DOCUMENT STATUS already on the URL narrows the listing", () => {
    mount(
      [
        doRow(),
        doRow({
          id: "00000000-0000-0000-0000-0000000d0002",
          do_number: "DO-170826-5050",
          voided_at: "2026-08-19T02:00:00Z",
          void_reason: "rescheduled",
        }),
      ],
      [],
      [],
      "/operation/delivery-orders?status=cancelled",
    );
    expect(screen.getByText("DO-170826-5050")).toBeTruthy();
    expect(screen.queryByText("DO-180826-3035")).toBeNull();
    expect(screen.getByText("1 of 2 delivery orders")).toBeTruthy();
    /* ⭐ The narrowing SAYS ITSELF above the table, with one way out. */
    const conditions = screen.getByTestId("active-conditions");
    expect(within(conditions).getByText("Cancelled")).toBeTruthy();
    expect(within(conditions).getByTestId("clear-filters")).toBeTruthy();
  });

  it("Clear filters removes the rail's picks as well as the column funnels", () => {
    const { locations } = mount(
      [doRow()],
      [],
      [],
      "/operation/delivery-orders?status=created",
    );
    fireEvent.click(screen.getByTestId("clear-filters"));
    expect(locations.at(-1)).not.toContain("status=");
    expect(screen.queryByTestId("active-conditions")).toBeNull();
  });

  it("an unnarrowed register shows no condition strip at all", () => {
    mount([doRow()]);
    expect(screen.queryByTestId("active-conditions")).toBeNull();
  });

  /**
   * ⭐ COLLAPSED IS NOT GONE (owner ruling 2026-09-11). At the observed
   * narrow viewport the 240px rail starts hidden so the dates the register
   * exists to answer stay on screen - and its door stays in the toolbar.
   */
  it("at a narrow viewport the rail starts collapsed, its entry still visible", () => {
    mount([doRow()], [], [], "/operation/delivery-orders", { rail: false });
    expect(screen.queryByTestId("delivery-orders-rail")).toBeNull();
    const open = screen.getByTestId("delivery-orders-show-filters");
    expect(open).toBeTruthy();
    fireEvent.click(open);
    expect(screen.getByTestId("delivery-orders-rail")).toBeTruthy();
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
              delivery_photos: [
                {
                  path: "p.jpg",
                  at: "2026-08-20T10:00:00Z",
                  by: null,
                  doNumber: "DO-180826-3035",
                  kind: "photo",
                },
              ],
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
    /* ⭐ Driver submission opens the file it counted, and still says the
       signed paper is missing - the work stays visible. */
    const photos = screen.getByTestId("do-submission-photos");
    expect(photos.textContent).toContain("Photos");
    expect(photos.textContent).toContain("1");
    expect(screen.queryByTestId("do-submission-videos")).toBeNull();
    expect(screen.getByText("No signed document yet")).toBeTruthy();
  });

  /**
   * ⭐ THE DEFECT THIS TEST EXISTS TO KEEP DEAD (owner ruling 2026-09-11):
   * one Sales Order, TWO Delivery Orders, ONE photo ledger. Before the stamp,
   * both rows counted every file.
   */
  it("counts each document's own files - never the whole Sales Order's ledger", () => {
    const ledger = {
      delivery_photos: [
        { path: "a.jpg", at: "t", by: null, doNumber: "DO-180826-3035", kind: "photo" as const },
        { path: "b.jpg", at: "t", by: null, doNumber: "DO-180826-3035", kind: "photo" as const },
        { path: "c.mp4", at: "t", by: null, doNumber: "DO-180826-3035", kind: "video" as const },
        { path: "d.jpg", at: "t", by: null, doNumber: "DO-190826-7070", kind: "photo" as const },
      ],
    };
    mount(
      [
        doRow({ orders: { ...doRow().orders, ops_order_control: ledger } }),
        doRow({
          id: "00000000-0000-0000-0000-0000000d0002",
          do_number: "DO-190826-7070",
          orders: { ...doRow().orders, ops_order_control: ledger },
        }),
      ],
      [
        { do_number: "DO-180826-3035", result: "delivered", reason_key: null, recorded_at: "t1" },
        { do_number: "DO-190826-7070", result: "delivered", reason_key: null, recorded_at: "t1" },
      ],
    );
    const counts = screen.getAllByTestId("do-submission-photos").map((b) => b.textContent ?? "");
    expect(counts.some((t) => t.includes("2"))).toBe(true);
    expect(counts.some((t) => t.includes("1"))).toBe(true);
    /* Only the trip that actually carries a video offers a player. */
    expect(screen.getAllByTestId("do-submission-videos")).toHaveLength(1);
  });

  it("a video is never automatically a shortage - no video, no button, no absence word", () => {
    mount(
      [
        doRow({
          orders: {
            ...doRow().orders,
            ops_order_control: {
              delivery_photos: [
                { path: "a.jpg", at: "t", by: null, doNumber: "DO-180826-3035", kind: "photo" as const },
              ],
            },
          },
        }),
      ],
      [{ do_number: "DO-180826-3035", result: "delivered", reason_key: null, recorded_at: "t" }],
    );
    expect(screen.getByTestId("do-submission-photos")).toBeTruthy();
    expect(screen.queryByTestId("do-submission-videos")).toBeNull();
    expect(screen.queryByText("No delivery video")).toBeNull();
  });

  /**
   * ⭐ A VOIDED DOCUMENT IS OWED NOTHING (walk finding, 2026-09-11). The
   * retired `Proof Status` column printed two absences against a cancelled
   * row, which reads as two outstanding jobs on a trip that will never happen.
   */
  it("a cancelled document with nothing submitted says nothing at all", () => {
    mount([
      doRow({
        voided_at: "2026-08-19T02:00:00Z",
        void_reason: "rescheduled",
        orders: { ...doRow().orders, ops_order_control: { delivery_photos: [] } },
      }),
    ]);
    expect(screen.getAllByText("Cancelled").length).toBeGreaterThan(0);
    expect(screen.queryByText("Not delivered yet")).toBeNull();
    expect(screen.queryByText("No signed document yet")).toBeNull();
  });

  it("...but a void never erases what a driver already sent", () => {
    mount([
      doRow({
        voided_at: "2026-08-19T02:00:00Z",
        void_reason: "rescheduled",
        orders: {
          ...doRow().orders,
          ops_order_control: {
            delivery_photos: [
              { path: "a.jpg", at: "t", by: null, doNumber: "DO-180826-3035", kind: "photo" as const },
            ],
          },
        },
      }),
    ]);
    expect(screen.getByTestId("do-submission-photos").textContent).toContain("1");
  });

  it("an UNKNOWN ledger prints an unknown - never a fabricated zero", () => {
    mount(
      [doRow({ orders: { ...doRow().orders, ops_order_control: null } })],
      [{ do_number: "DO-180826-3035", result: "delivered", reason_key: null, recorded_at: "t" }],
    );
    expect(screen.getAllByText("Not recorded").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("do-submission-photos")).toBeNull();
  });

  it("picking a work queue opens a row-level door onto the existing operation", () => {
    mount(
      [doRow({ id: "00000000-0000-0000-0000-0000000d0002", do_number: "DO-190826-7070" })],
      [],
      [
        { delivery_order_id: "00000000-0000-0000-0000-0000000d0002", kind: "ready_for_handover" },
        { delivery_order_id: "00000000-0000-0000-0000-0000000d0002", kind: "handed_over" },
        { delivery_order_id: "00000000-0000-0000-0000-0000000d0002", kind: "received_by_logistics" },
      ],
    );
    /* Before a queue is picked the register carries no action column. */
    expect(screen.queryByTestId("do-result-primary-action")).toBeNull();
    fireEvent.click(screen.getByTestId("delivery-orders-work-record_result"));
    /* The DO object page's OWN component, rendered on the row - not a copy. */
    expect(screen.getByTestId("do-result-primary-action")).toBeTruthy();
  });

  it("§6.1 (0489) — `Check delivery proof` queues a delivered document whose files nobody has judged, and its door opens the DO object", () => {
    const { locations } = mount(
      [
        doRow({
          orders: {
            ...doRow().orders,
            do_number: "DO-180826-3035",
            do_file_path: "order-x/do.pdf",
            do_uploaded_at: "2026-08-20T11:00:00Z",
            ops_order_control: {
              delivery_photos: [
                { path: "p.jpg", at: "2026-08-20T10:00:00Z", by: null, doNumber: "DO-180826-3035", kind: "photo" },
              ],
            },
          },
        }),
      ],
      [{ do_number: "DO-180826-3035", result: "delivered", reason_key: null, recorded_at: "2026-08-20T09:00:00Z" }],
    );
    const rail = screen.getByTestId("delivery-orders-work-check_proof");
    expect(rail).toHaveTextContent("Check delivery proof");
    expect(rail).toHaveTextContent("1");
    fireEvent.click(rail);
    fireEvent.click(screen.getByTestId("do-queue-check-proof"));
    expect(locations.at(-1)).toBe("/operation/delivery-orders/DO-180826-3035");
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
    /* ⭐ ONE status column (owner ruling 2026-09-11): line 2 carries the
       RESULT that was actually recorded AND its reason, which is what the
       retired `Delivery Result` column used to print three columns away. */
    const detail = screen.getByTestId("do-status-detail");
    expect(detail.textContent).toContain("Failed Delivery");
    expect(detail.textContent).toContain("Customer unreachable");
  });

  it("a partial trip says Partially Delivered on the status line, not just an exception", () => {
    mount(
      [doRow()],
      [
        {
          do_number: "DO-180826-3035",
          result: "partial",
          reason_key: "customer_unreachable",
          recorded_at: "2026-08-20T09:00:00Z",
        },
      ],
    );
    expect(screen.getAllByText("Delivery exception").length).toBeGreaterThan(0);
    expect(screen.getByTestId("do-status-detail").textContent).toContain(
      "Partially Delivered",
    );
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
    mount([
      doRow({
        delivery_date: null,
        time_slot: null,
        logistics_partner: null,
        orders: { ...doRow().orders, ops_order_control: { delivery_photos: [] } },
      }),
    ]);
    expect(screen.getAllByText("No confirmed date").length).toBeGreaterThan(0);
    expect(screen.getAllByText("No logistics picked").length).toBeGreaterThan(0);
    /* Nothing recorded yet: nothing is due, and the cell says so. */
    expect(screen.getAllByText("Not delivered yet").length).toBeGreaterThan(0);
    expect(screen.getAllByText("No signed document yet").length).toBeGreaterThan(0);
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

/**
 * THE DO OBJECT PAGE — the blueprint card §5's laws, held as tests:
 *
 *   · every ruled block renders (customer · goods · delivery details · source
 *     SO door · status · photo · proof · history), read-only — no input, no
 *     save, no void control anywhere
 *   · a failed document keeps its Delivery exception + reason
 *   · the source SO door navigates both ways
 *   · a split trip shows ONLY its groups' lines, with the scope sentence
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DeliveryOrderPage from "./DeliveryOrderPage";
import type { DeliveryOrderDetailPayload } from "@/lib/queries";

let detailState: {
  data: DeliveryOrderDetailPayload | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
};

const useDeliveryOrderSpy = vi.fn((..._args: unknown[]) => detailState);
const useDeliveryPhotosSpy = vi.fn(() => ({ data: { photos: [] }, isLoading: false }));
const recordHandoverMutate = vi.fn();

vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useDeliveryOrder: (...args: unknown[]) => useDeliveryOrderSpy(...args),
    useDeliveryPhotos: () => useDeliveryPhotosSpy(),
    useRecordHandoverEvent: () => ({ mutate: recordHandoverMutate, isPending: false }),
  };
});

const payload = (
  over: Partial<DeliveryOrderDetailPayload["deliveryOrder"]> = {},
  extra: Partial<DeliveryOrderDetailPayload> = {},
): DeliveryOrderDetailPayload => ({
  deliveryOrder: {
    id: "00000000-0000-0000-0000-0000000d0001",
    order_id: "00000000-0000-0000-0000-0000000a0001",
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
      customer_phone: "0123456789",
      customer_emergency: null,
      customer_address: "12 Jalan Test, Klang",
      customer_address_city: "Klang",
      customer_address_state: "Selangor",
      do_file_path: null,
      do_uploaded_at: null,
      pod_signature_url: null,
      pod_signed_by: null,
      pod_signed_at: null,
      do_number: "DO-180826-3035",
      order_lines: [
        { sku: "mattress:JAGER-SS", qty: 1 },
        { sku: "sofa:HK55-3S", qty: 1 },
      ],
    },
    ...over,
  },
  attempts: [],
  lineDescriptions: { "mattress:JAGER-SS": "Jager Super Single" },
  loans: [],
  handoverEvents: [],
  ...extra,
});

/** One §4 handover fact for the fixtures (0363). */
const handoverEvent = (
  kind: "ready_for_handover" | "handed_over" | "received_by_logistics",
  over: Partial<DeliveryOrderDetailPayload["handoverEvents"][number]> = {},
): DeliveryOrderDetailPayload["handoverEvents"][number] => ({
  id: `ev-${kind}`,
  kind,
  duty: kind === "received_by_logistics" ? "logistics" : "warehouse",
  company: kind === "received_by_logistics" ? "NETS" : "Carres Klang",
  counterparty: kind === "handed_over" ? "NETS" : null,
  receiver_name: kind === "handed_over" ? "Ahmad" : null,
  vehicle: null,
  goods: null,
  note: null,
  proof_path: kind === "handed_over" ? "handover/x/proof.jpg" : null,
  recorded_by: "00000000-0000-0000-0000-0000000e0001",
  recorded_by_name: "Shasha",
  recorded_at: "2026-08-19T03:00:00Z",
  proofUrl: null,
  ...over,
});

function mount(data: DeliveryOrderDetailPayload) {
  detailState = { data, isLoading: false, isError: false, error: null };
  const locations: string[] = [];
  function LocationTap() {
    const loc = useLocation();
    locations.push(`${loc.pathname}${loc.search}`);
    return null;
  }
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/operation/delivery-orders/DO-180826-3035"]}>
        <LocationTap />
        <Routes>
          <Route
            path="/operation/delivery-orders/:doId"
            element={<DeliveryOrderPage />}
          />
          <Route path="*" element={<DeliveryOrderPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { locations };
}

beforeEach(() => {
  useDeliveryOrderSpy.mockClear();
  recordHandoverMutate.mockClear();
});

describe("DeliveryOrderPage", () => {
  it("returns to the one Delivery workspace", () => {
    mount(payload());
    expect(screen.getByRole("link", { name: /Delivery$/ })).toHaveAttribute(
      "href",
      "/operation?tab=delivery",
    );
  });

  it("renders every ruled block, read-only — no input, no save, no void", () => {
    const { container } = { container: undefined } as { container?: unknown };
    void container;
    mount(payload());
    for (const block of [
      "Customer",
      "Goods on this trip",
      "Delivery details",
      "Source Sales Order",
      "Delivery status",
      "Delivery photo",
      "Signature / proof",
      "History",
    ]) {
      expect(screen.getByText(block)).toBeTruthy();
    }
    expect(document.querySelectorAll("input, textarea, select").length).toBe(0);
    for (const banned of [/void/i, /delete/i, /save/i, /issue delivery order/i, /release/i, /approve/i]) {
      expect(screen.queryByRole("button", { name: banned })).toBeNull();
    }
  });

  it("prints the identity, the trip facts and human-words-first goods with mono SKU", () => {
    mount(payload());
    expect(screen.getAllByText(/DO-180826-3035/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/SO-1322/).length).toBeGreaterThan(0);
    expect(screen.getByText("Jager Super Single")).toBeTruthy();
    expect(screen.getByText("mattress:JAGER-SS")).toBeTruthy();
    expect(screen.getByText("NETS")).toBeTruthy();
  });

  it("driver and vehicle absences read as governed words, never a dash", () => {
    mount(payload());
    expect(screen.getByText(/Driver not recorded/)).toBeTruthy();
    expect(screen.getByText(/Vehicle not recorded/)).toBeTruthy();
  });

  it("a failed document keeps its Delivery exception and its ONE reason", () => {
    mount(
      payload(
        {},
        {
          attempts: [
            {
              do_number: "DO-180826-3035",
              result: "failed",
              reason_key: "customer_unreachable",
              recorded_at: "2026-08-20T09:00:00Z",
            },
          ],
        },
      ),
    );
    expect(screen.getByText("Delivery exception")).toBeTruthy();
    expect(screen.getAllByText(/Customer unreachable/).length).toBeGreaterThan(0);
  });

  it("a cancelled document says its cause in words", () => {
    mount(payload({ voided_at: "2026-08-19T02:00:00Z", void_reason: "rescheduled" }));
    expect(screen.getByText("Cancelled")).toBeTruthy();
    expect(screen.getAllByText(/rescheduled/i).length).toBeGreaterThan(0);
  });

  it("the Source Sales Order door opens the SO object page", () => {
    const { locations } = mount(payload());
    fireEvent.click(screen.getByTestId("do-open-so"));
    expect(locations.at(-1)).toBe(
      "/operation/orders/so/00000000-0000-0000-0000-0000000a0001",
    );
  });

  it("the Source Sales Order block opens the exact Order Route", () => {
    const { locations } = mount(payload());
    fireEvent.click(screen.getByTestId("do-open-order-route"));
    expect(locations.at(-1)).toBe(
      "/operation/orders/so/00000000-0000-0000-0000-0000000a0001?route=1",
    );
  });

  it("a split trip shows only its groups' lines, with the scope sentence", () => {
    mount(payload({ trip_groups: ["bed"] }));
    expect(screen.getByText("Jager Super Single")).toBeTruthy();
    expect(screen.queryByText("sofa:HK55-3S")).toBeNull();
    expect(screen.getByText(/follows on a second trip/)).toBeTruthy();
  });

  it("the Warehouse handover block renders the §4 facts read-only, with recorder, duty and company", () => {
    mount(
      payload(
        {},
        {
          handoverEvents: [
            handoverEvent("ready_for_handover"),
            handoverEvent("handed_over", {
              vehicle: "WXY 1234",
              goods: [{ sku: "mattress:JAGER-SS", qty: 1 }],
            }),
          ],
        },
      ),
    );
    expect(screen.getByText("Warehouse handover")).toBeTruthy();
    // Each fact renders in the Warehouse block AND in History (append-only).
    expect(screen.getAllByText(/Ready for handover/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Handed over — to NETS · received by Ahmad/)).toBeTruthy();
    expect(screen.getAllByText(/Shasha/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Warehouse · Carres Klang/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Vehicle: WXY 1234/).length).toBeGreaterThan(0);
    // Still read-only: the facts add no input and no button.
    expect(document.querySelectorAll("input, textarea, select").length).toBe(0);
  });

  it("the DO object header offers the DOOR to Outbound while goods are not handed over", () => {
    // Warehouse Card 03: the Warehouse acts moved to the Outbound page — the
    // object header links there instead of recording the act itself.
    mount(payload());
    const door = screen.getByTestId("do-object-primary-action");
    expect(door).toHaveTextContent("Open Outbound");
    expect(door).toHaveAttribute(
      "href",
      expect.stringContaining("tab=warehouse-outbound"),
    );
  });

  it("offers no handover writer after all three facts are recorded", () => {
    mount(
      payload(
        {},
        {
          handoverEvents: [
            handoverEvent("ready_for_handover"),
            handoverEvent("handed_over"),
            handoverEvent("received_by_logistics"),
          ],
        },
      ),
    );
    expect(screen.queryByTestId("do-object-primary-action")).toBeNull();
  });

  it("offers Record Delivery Result after logistics receipt", () => {
    mount(
      payload(
        {},
        {
          handoverEvents: [
            handoverEvent("ready_for_handover"),
            handoverEvent("handed_over"),
            handoverEvent("received_by_logistics"),
          ],
        },
      ),
    );
    const action = screen.getByTestId("do-result-primary-action");
    expect(action).toHaveTextContent("Record Delivery Result");
    fireEvent.click(action);
    expect(screen.getByRole("button", { name: "Delivered" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Partially Delivered" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Failed" })).toBeInTheDocument();
  });

  it("offers no result writer after an attempt is recorded", () => {
    mount(
      payload(
        {},
        {
          handoverEvents: [
            handoverEvent("ready_for_handover"),
            handoverEvent("handed_over"),
            handoverEvent("received_by_logistics"),
          ],
          attempts: [
            {
              do_number: "DO-180826-3035",
              result: "failed",
              reason_key: "customer_unreachable",
              recorded_at: "2026-08-20T09:00:00Z",
            },
          ],
        },
      ),
    );
    expect(screen.queryByTestId("do-result-primary-action")).toBeNull();
  });

  it("offers no order-wide result writer on a split Delivery Order", () => {
    mount(
      payload(
        { trip_groups: ["bed"] },
        {
          handoverEvents: [
            handoverEvent("ready_for_handover"),
            handoverEvent("handed_over"),
            handoverEvent("received_by_logistics"),
          ],
        },
      ),
    );
    expect(screen.queryByTestId("do-result-primary-action")).toBeNull();
  });

  it("offers no handover writer on a cancelled document", () => {
    mount(payload({ voided_at: "2026-08-19T02:00:00Z", void_reason: "rescheduled" }));
    expect(screen.queryByTestId("do-object-primary-action")).toBeNull();
  });

  it("a received-not-yet-resulted document reads Out for delivery; handed over alone does not", () => {
    mount(
      payload(
        {},
        {
          handoverEvents: [
            handoverEvent("ready_for_handover"),
            handoverEvent("handed_over"),
          ],
        },
      ),
    );
    expect(screen.queryByText("Out for delivery")).toBeNull();

    mount(
      payload(
        {},
        {
          handoverEvents: [
            handoverEvent("ready_for_handover"),
            handoverEvent("handed_over"),
            handoverEvent("received_by_logistics"),
          ],
        },
      ),
    );
    expect(screen.getByText("Out for delivery")).toBeTruthy();
  });

  it("a receipt with a different quantity keeps BOTH counts visible — neither fact is overwritten", () => {
    mount(
      payload(
        {},
        {
          handoverEvents: [
            handoverEvent("ready_for_handover"),
            handoverEvent("handed_over", {
              goods: [{ sku: "mattress:JAGER-SS", qty: 2 }],
            }),
            handoverEvent("received_by_logistics", {
              goods: [{ sku: "mattress:JAGER-SS", qty: 1 }],
              note: "One unit left behind — no space on the truck",
            }),
          ],
        },
      ),
    );
    expect(screen.getByText(/mattress:JAGER-SS × 2/)).toBeTruthy();
    expect(screen.getByText(/mattress:JAGER-SS × 1/)).toBeTruthy();
    expect(screen.getByText(/One unit left behind/)).toBeTruthy();
  });

  it("History lists each handover event append-only with its recorder", () => {
    mount(
      payload(
        {},
        {
          handoverEvents: [
            handoverEvent("ready_for_handover"),
            handoverEvent("handed_over"),
            handoverEvent("received_by_logistics"),
          ],
        },
      ),
    );
    // The facts appear twice — the Warehouse block and History — so at least 2.
    expect(screen.getAllByText(/Ready for handover/).length).toBeGreaterThan(1);
    expect(screen.getAllByText(/Received by logistics/).length).toBeGreaterThan(1);
  });

  it("the loan block renders only when a loan exists", () => {
    mount(payload());
    expect(screen.queryByText("Loan collection")).toBeNull();
    mount(
      payload(
        {},
        {
          loans: [
            {
              id: "l1",
              item_id: "i1",
              do_number: "DO-180826-3035",
              status: "on_loan",
              loaned_at: "2026-08-18T02:00:00Z",
              returned_at: null,
              loan_note_no: "LN-180826-3035",
            },
          ],
        },
      ),
    );
    expect(screen.getByText("Loan collection")).toBeTruthy();
    expect(screen.getByText(/Collect back on delivery day/)).toBeTruthy();
  });
});

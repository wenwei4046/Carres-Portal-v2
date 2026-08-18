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

vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useDeliveryOrder: (...args: unknown[]) => useDeliveryOrderSpy(...args),
    useDeliveryPhotos: () => useDeliveryPhotosSpy(),
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
      pod_url: null,
      pod_uploaded_at: null,
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
  ...extra,
});

function mount(data: DeliveryOrderDetailPayload) {
  detailState = { data, isLoading: false, isError: false, error: null };
  const locations: string[] = [];
  function LocationTap() {
    const loc = useLocation();
    locations.push(loc.pathname);
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
});

describe("DeliveryOrderPage", () => {
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

  it("a split trip shows only its groups' lines, with the scope sentence", () => {
    mount(payload({ trip_groups: ["bed"] }));
    expect(screen.getByText("Jager Super Single")).toBeTruthy();
    expect(screen.queryByText("sofa:HK55-3S")).toBeNull();
    expect(screen.getByText(/follows on a second trip/)).toBeTruthy();
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

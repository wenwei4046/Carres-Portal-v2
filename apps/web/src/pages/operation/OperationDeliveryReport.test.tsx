import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DeliveryOrderRow, operationOrderListRow } from "@/lib/queries";
import { DR } from "./delivery-report";

/**
 * Reports → Delivery (Delivery MASTER §12, CARD 17) — the page: ten
 * listings on the shared reads, every row a door, the exclusions and the
 * unavailable reads stated on screen, one Excel sheet per listing.
 */

const state = {
  orders: { data: { orders: [] as operationOrderListRow[] }, isLoading: false, isError: false },
  partners: { data: { partners: [{ id: "p-nets", name: "NETS", contact: null, zones: null }] }, isLoading: false, isError: false },
  docs: { data: undefined as unknown, isLoading: false, isError: false },
  arrangements: { data: undefined as unknown, isLoading: false, isError: false },
  inbound: { data: { arrivals: [] as unknown[] } as unknown, isLoading: false, isError: false },
};

vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useOperationOrders: () => state.orders,
    useDeliveryPartners: () => state.partners,
    useDeliveryOrdersRegister: () => state.docs,
    useDeliveryArrangements: () => state.arrangements,
    usePurchasingSettings: () => ({ data: undefined }),
    useCatalog: () => ({ data: undefined }),
  };
});
vi.mock("./useWarehouseInbound", () => ({ useWarehouseInbound: () => state.inbound }));
vi.mock("./components/ModuleHeader", () => ({
  default: ({ word, testId }: { word: string; testId: string }) => <div data-testid={testId}>{word}</div>,
}));
const sheets: string[] = [];
vi.mock("xlsx", () => ({
  utils: {
    book_new: () => ({}),
    json_to_sheet: (r: unknown) => r,
    book_append_sheet: (_wb: unknown, _ws: unknown, name: string) => sheets.push(name),
  },
  writeFile: vi.fn(),
}));
vi.mock("@/components/kit/Select", () => ({
  default: ({ id, label, value, onValueChange, options }: {
    id: string; label?: string; value?: string; onValueChange: (v: string) => void;
    options: readonly { value: string; label: string }[];
  }) => (
    <label>
      {label}
      <select data-testid={id} value={value ?? ""} onChange={(e) => onValueChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  ),
}));

import OperationDeliveryReport from "./OperationDeliveryReport";

function doc(over: Partial<DeliveryOrderRow> & { id: string; do_number: string }): DeliveryOrderRow {
  return {
    issued_at: "2026-09-01T00:00:00Z",
    trip_groups: null,
    delivery_date: "2026-09-10",
    time_slot: "2 PM to 5 PM",
    logistics_partner: "NETS",
    voided_at: null,
    void_reason: null,
    orders: { id: `o-${over.id}`, so: 1301, customer_name: "kong chai yin", delivery_date: "2026-09-10", delivery_date_tbd: false },
    ...over,
  };
}

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/operation?tab=delivery-report"]}>
        <OperationDeliveryReport />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  sheets.length = 0;
  state.docs = {
    data: {
      deliveryOrders: [doc({ id: "d1", do_number: "DO-1" }), doc({ id: "d2", do_number: "DO-2", orders: { id: "o-d2", so: 1302, customer_name: "lim", delivery_date: "2026-09-05", delivery_date_tbd: false } })],
      attempts: [
        { do_number: "DO-1", result: "delivered", reason_key: null, recorded_at: "2026-09-09T08:00:00Z" },
        { do_number: "DO-2", result: "failed", reason_key: "customer_unreachable", where_goods: "returned_to_warehouse", recorded_at: "2026-09-08T08:00:00Z" },
        { do_number: "DO-2", result: "delivered", reason_key: null, recorded_at: "2026-09-11T08:00:00Z" },
        { do_number: "DO-1", result: "failed", reason_key: "vehicle_breakdown", recorded_at: "2026-08-20T08:00:00Z" },
      ],
      handoverEvents: [
        { delivery_order_id: "d1", kind: "ready_for_handover", recorded_at: "2026-09-08T01:00:00Z" },
        { delivery_order_id: "d1", kind: "handed_over", recorded_at: "2026-09-09T01:00:00Z" },
      ],
      proofReviews: [],
      attemptEvidence: [],
    },
    isLoading: false,
    isError: false,
  };
  state.arrangements = {
    data: {
      arrangements: [
        { id: "a1", order_id: "o-d1", leg: 0, partner_id: "p-nets", partner_name: "NETS", confirmed_date: "2026-09-09", confirmed_time: "2 PM to 5 PM", expected_arrival: null, logistics_note: null, reply_proof_path: null, driver_name: null, vehicle: null, updated_at: "", updated_by: null },
      ],
      contacts: [
        { id: "c1", order_id: "o-d1", leg: 0, purpose_key: "confirm_delivery_date", channel: "whatsapp", contacted_person: "customer", contact_owner_user_id: null, contacted_at: "2026-09-02T03:00:00Z", result_key: "confirmed", reply_evidence_path: null, next_action: null, note: null, on_behalf_of_partner_id: "p-nets", recorded_by: null, recorded_at: "2026-09-02T03:00:00Z" },
      ],
      cannotDeliver: [
        { id: "cd1", order_id: "o-d2", leg: 0, partner_id: "p-nets", reason_key: "no_capacity", note: null, recorded_at: "2026-09-04T00:00:00Z" },
      ],
    },
    isLoading: false,
    isError: false,
  };
  state.inbound = { data: { arrivals: [] }, isLoading: false, isError: false };
});

describe("Reports → Delivery", () => {
  it("draws the Delivery destination header and the ten listings, opening on the newest month", () => {
    mount();
    expect(screen.getByTestId("delivery-report-destination-header")).toHaveTextContent(DR.page);
    for (const id of [
      "report-commitment", "report-first-delivery", "report-failed", "report-partners", "report-warehouse",
      "report-proof", "report-schedule", "report-contacts", "report-returns", "report-ageing",
    ]) expect(screen.getByTestId(id)).toBeInTheDocument();
    expect(screen.getByTestId("delivery-report-month")).toHaveValue("2026-09");
    expect(screen.getByText(DR.commitment)).toBeInTheDocument();
    expect(screen.getByText(DR.ageing)).toBeInTheDocument();
  });

  it("every row is a door — the Delivery Order, the Monitor day, the Monitor row", () => {
    mount();
    const commitment = within(screen.getByTestId("report-commitment"));
    expect(commitment.getByRole("link", { name: /DO-1/ })).toHaveAttribute("href", "/operation/delivery-orders/d1");
    expect(commitment.getByText(`2 deliveries · ${DR.keptRequestedDate} ${DR.rateWithheld}`)).toBeInTheDocument();
    const schedule = within(screen.getByTestId("report-schedule"));
    expect(schedule.getByRole("link")).toHaveAttribute("href", "/operation?tab=delivery&date=2026-09-09");
    const contacts = within(screen.getByTestId("report-contacts"));
    expect(contacts.getByRole("link", { name: /SO-1301/ })).toHaveAttribute("href", "/operation?tab=delivery&view=all&open=o-d1");
    expect(contacts.getByText(/Recorded on behalf of NETS/)).toBeInTheDocument();
    const partnersSection = within(screen.getByTestId("report-partners"));
    expect(partnersSection.getByRole("link", { name: /NETS/ })).toHaveAttribute("href", "/operation?tab=delivery&view=all&logistics=p-nets");
    expect(partnersSection.getByText("3 trips · 2 delivered · 1 failed · Cannot Deliver 1")).toBeInTheDocument();
    expect(partnersSection.getByText(/No capacity on that date/)).toBeInTheDocument();
  });

  it("states the exclusions and the unavailable reads on screen — never 0", () => {
    state.inbound = { data: undefined, isLoading: false, isError: true };
    state.arrangements.data = { ...(state.arrangements.data as object), cannotDeliver: undefined };
    mount();
    expect(within(screen.getByTestId("report-returns")).getAllByText(new RegExp(DR.inboundNotAvailable)).length).toBeGreaterThanOrEqual(2);
    expect(within(screen.getByTestId("report-partners")).getByText(new RegExp(`Cannot Deliver ${DR.notAvailable}`))).toBeInTheDocument();
    expect(within(screen.getByTestId("report-failed")).getByText(/reviewed root cause is a Service Case matter/)).toBeInTheDocument();
    expect(within(screen.getByTestId("report-ageing")).getByText(/an exception has no month/)).toBeInTheDocument();
  });

  it("the month filter moves every dated listing together", () => {
    mount();
    fireEvent.change(screen.getByTestId("delivery-report-month"), { target: { value: "2026-08" } });
    expect(within(screen.getByTestId("report-commitment")).getByText(DR.emptyCommitment)).toBeInTheDocument();
    expect(within(screen.getByTestId("report-failed")).getAllByText(/Vehicle breakdown/).length).toBe(2);
  });

  it("exports one sheet per listing from the same reads", () => {
    mount();
    fireEvent.click(screen.getByTestId("report-export"));
    expect(sheets).toEqual(["Commitment", "First delivery", "Failed delivery", "Partners", "Warehouse", "Proof", "Schedule", "Contacts", "Returns", "Exceptions"]);
  });

  it("says what broke when a read fails", () => {
    state.docs = { data: undefined, isLoading: false, isError: true };
    mount();
    expect(screen.getByTestId("delivery-report-error")).toHaveTextContent(DR.failed);
  });
});

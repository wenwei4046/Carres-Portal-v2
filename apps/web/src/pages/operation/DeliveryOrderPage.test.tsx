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
const reviewMutate = vi.fn();
const attachSignedMutate = vi.fn();

vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useDeliveryOrder: (...args: unknown[]) => useDeliveryOrderSpy(...args),
    useDeliveryPhotos: () => useDeliveryPhotosSpy(),
    useRecordHandoverEvent: () => ({ mutate: recordHandoverMutate, isPending: false }),
    useReviewDeliveryProof: () => ({ mutate: reviewMutate, isPending: false }),
    useAttachSignedDeliveryOrder: () => ({ mutate: attachSignedMutate, isPending: false }),
    useUploadDeliveryPhoto: () => ({ mutate: vi.fn(), isPending: false }),
  };
});
vi.mock("@/lib/supabase", () => ({
  supabase: { storage: { from: () => ({ uploadToSignedUrl: vi.fn(async () => ({ error: null })) }) } },
}));

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
  reviewMutate.mockClear();
  attachSignedMutate.mockClear();
});

/** One recorded attempt (0344) with its row id — the Delivery Visit evidence binds to. */
const attempt = (
  result: "delivered" | "partial" | "failed",
  over: Partial<DeliveryOrderDetailPayload["attempts"][number]> = {},
): DeliveryOrderDetailPayload["attempts"][number] => ({
  id: "00000000-0000-0000-0000-0000000f0001",
  do_number: "DO-180826-3035",
  result,
  reason_key: result === "failed" ? "customer_unreachable" : null,
  recorded_at: "2026-08-20T09:00:00Z",
  ...over,
});

describe("DeliveryOrderPage", () => {
  it("returns to the Delivery Orders register — the Object Header's `← Delivery Orders` (§9)", () => {
    mount(payload());
    expect(screen.getByRole("link", { name: /Delivery Orders$/ })).toHaveAttribute(
      "href",
      "/operation/delivery-orders",
    );
  });

  it("renders every ruled block, read-only — no input, no save, no void", () => {
    const { container } = { container: undefined } as { container?: unknown };
    void container;
    mount(payload());
    /* The seven governed sections, in the MASTER's order (§9, Card 16) — one
       scroll of kit Panels, no tab strip. */
    const titles = [...document.querySelectorAll('[data-kit="panel"] h2')].map((h) => h.textContent);
    expect(titles).toEqual([
      "Delivery Order",
      "Delivery history",
      "Warehouse handover",
      "Evidence",
      "Exceptions",
      "History",
      "Related records",
    ]);
    expect(screen.queryByRole("tablist")).toBeNull();
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

  describe("Evidence — §6.1 proof review and per-attempt evidence (Card 13, 0489)", () => {
    const received = [handoverEvent("ready_for_handover"), handoverEvent("handed_over"), handoverEvent("received_by_logistics")];
    const evidence = (over: Partial<NonNullable<DeliveryOrderDetailPayload["attemptEvidence"]>[number]> = {}) => ({
      id: "e1",
      attempt_id: "00000000-0000-0000-0000-0000000f0001",
      order_id: "00000000-0000-0000-0000-0000000a0001",
      do_number: "DO-180826-3035",
      path: "order/x/p.jpg",
      kind: "photo" as const,
      recorded_by: null,
      recorded_at: "2026-08-20T10:00:00Z",
      url: "https://signed/p.jpg",
      ...over,
    });

    it("no result yet: the section says evidence binds to a delivery, and offers no review act", () => {
      mount(payload());
      expect(screen.getByText("Evidence")).toBeTruthy();
      expect(screen.getByText(/evidence binds to the delivery it proves/)).toBeTruthy();
      expect(screen.queryByTestId("do-proof-review")).toBeNull();
      expect(screen.queryByTestId("do-evidence-upload-signed-do")).toBeNull();
    });

    it("a delivered result lists its bound files under `Delivery on {day}` and offers the three governed review acts", () => {
      mount(payload({}, { attempts: [attempt("delivered")], handoverEvents: received, attemptEvidence: [evidence()] }));
      /* Delivery history and Evidence both name the visit — one entry each. */
      expect(screen.getAllByText(/^Delivery on .* · Delivered$/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByTestId("do-evidence-photo")).toHaveAttribute("href", "https://signed/p.jpg");
      /* The file is there, nobody has judged it: the pill is AMBER, the state says so. */
      expect(screen.getByTestId("do-proof-review-state")).toHaveTextContent("Check delivery proof");
      for (const word of ["Proof Accepted", "More Proof Required", "Proof Rejected"]) {
        expect(screen.getByRole("button", { name: word })).toBeTruthy();
      }
      /* The same uploader every other surface renders — never a second picker. */
      expect(screen.getByTestId("do-evidence-upload-photo")).toBeTruthy();
    });

    it("`Proof Accepted` saves at once against the latest attempt; a refusal must say why", () => {
      mount(payload({}, { attempts: [attempt("delivered")], handoverEvents: received, attemptEvidence: [evidence()] }));
      fireEvent.click(screen.getByTestId("do-proof-accepted"));
      expect(reviewMutate).toHaveBeenCalledWith({ decision: "accepted", attemptId: "00000000-0000-0000-0000-0000000f0001" });
      fireEvent.click(screen.getByTestId("do-proof-rejected"));
      const save = screen.getByTestId("do-proof-save");
      expect(save).toBeDisabled();
      fireEvent.change(screen.getByLabelText(/Proof Rejected · Reason/), { target: { value: "The photo shows the lobby" } });
      expect(save).not.toBeDisabled();
      fireEvent.submit(screen.getByTestId("do-proof-reason-form"));
      expect(reviewMutate).toHaveBeenLastCalledWith({
        decision: "rejected",
        attemptId: "00000000-0000-0000-0000-0000000f0001",
        reason: "The photo shows the lobby",
      });
    });

    it("the review state and its history print the governed words with the reason and reviewer", () => {
      mount(
        payload({}, {
          attempts: [attempt("delivered")],
          handoverEvents: received,
          attemptEvidence: [evidence()],
          proofReviews: [
            {
              id: "r1",
              order_id: "00000000-0000-0000-0000-0000000a0001",
              do_number: "DO-180826-3035",
              attempt_id: null,
              decision: "rejected",
              reason: "The photo shows the lobby",
              reviewed_by: "u1",
              reviewed_by_name: "Shasha",
              reviewed_at: "2026-08-21T01:00:00Z",
            },
          ],
        }),
      );
      expect(screen.getByTestId("do-proof-review-state")).toHaveTextContent("Proof Rejected · The photo shows the lobby");
      expect(screen.getByTestId("do-proof-review-history")).toHaveTextContent("Shasha");
    });

    it("`Proof Accepted` turns the Delivered pill green — nothing else does", () => {
      mount(payload({}, { attempts: [attempt("delivered")], handoverEvents: received, attemptEvidence: [evidence()] }));
      expect(document.querySelector("[data-tone]")?.getAttribute("data-tone")).toBe("warning");
      mount(
        payload({}, {
          attempts: [attempt("delivered")],
          handoverEvents: received,
          attemptEvidence: [evidence()],
          proofReviews: [
            {
              id: "r1",
              order_id: "00000000-0000-0000-0000-0000000a0001",
              do_number: "DO-180826-3035",
              attempt_id: null,
              decision: "accepted",
              reason: null,
              reviewed_by: null,
              reviewed_by_name: null,
              reviewed_at: "2026-08-21T01:00:00Z",
            },
          ],
        }),
      );
      expect(screen.getAllByTestId("do-proof-review-state").at(-1)).toHaveTextContent("Proof Accepted");
      const tones = [...document.querySelectorAll("[data-tone]")].map((el) => el.getAttribute("data-tone"));
      expect(tones.at(-1)).toBe("success");
    });

    it("a PARTIALLY delivered document with no signed paper offers `Upload signed Delivery Order` through the §6.1 door — never the deliver-and-deduct one", () => {
      mount(payload({}, { attempts: [attempt("partial")], handoverEvents: received }));
      fireEvent.click(screen.getByTestId("do-evidence-upload-signed-do"));
      expect(screen.getByTestId("do-signed-do-form")).toBeTruthy();
      expect(screen.getByTestId("do-signed-do-save")).toBeDisabled();
      expect(screen.queryByRole("button", { name: /Mark delivered/ })).toBeNull();
    });

    it("a signed paper on file is stated with its day and its viewing link, and the door is withdrawn", () => {
      mount(
        payload(
          { orders: { ...payload().deliveryOrder.orders, do_file_path: "order-x/do.pdf", do_uploaded_at: "2026-08-21T03:00:00Z" } },
          { attempts: [attempt("delivered")], handoverEvents: received },
        ),
      );
      expect(screen.getByText(/Signed document on file/)).toBeTruthy();
      expect(screen.getByTestId("signed-do-link")).toBeTruthy();
      expect(screen.queryByTestId("do-evidence-upload-signed-do")).toBeNull();
    });
  });

  it("does not show the final DO’s signature as this document’s paper", () => {
    mount(payload({ orders: { ...payload().deliveryOrder.orders, do_number: "DO-FINAL", do_file_path: "order/final.pdf", do_uploaded_at: "2026-09-13T12:00:00Z" } }));
    expect(screen.queryByText(/Signed document on file/)).toBeNull();
    expect(screen.queryByTestId("signed-do-link")).toBeNull();
  });

  it("0491 — a Journey leg's document prints its route and records an ARRIVAL, never a delivery", () => {
    const received = [handoverEvent("ready_for_handover"), handoverEvent("handed_over"), handoverEvent("received_by_logistics")];
    mount(
      payload(
        {
          leg: 1,
          orders: {
            ...payload().deliveryOrder.orders,
            delivery_stops: [
              { leg: 1, partner_id: "p-teow", partner_name: "TEOW", from_loc: "Klang WH", to_loc: "JB transit", status: "pending" },
              { leg: 2, partner_id: "p-ssy", partner_name: "SSY", from_loc: "JB transit", to_loc: "Singapore customer", status: "pending" },
            ],
          },
        },
        { handoverEvents: received },
      ),
    );
    expect(screen.getByText("Route")).toBeTruthy();
    expect(screen.getByText("Klang WH → JB transit")).toBeTruthy();
    fireEvent.click(screen.getByTestId("do-result-primary-action"));
    expect(screen.getByTestId("do-result-delivered")).toHaveTextContent("Arrived");
    expect(screen.queryByRole("button", { name: "Delivered" })).toBeNull();
  });

  it("section one prints the site facts and the arrangement, and renders the live document (Card 16)", () => {
    mount(
      payload(
        {
          orders: {
            ...payload().deliveryOrder.orders,
            warehouses: { name: "Carres Klang" },
            delivery_floor: 12,
            delivery_has_lift: true,
            delivery_stair_items: null,
            building_type: "Condo",
            ops_order_control: { customer_request: "Call before arriving", action_for_logistic: null },
          },
        },
        {
          arrangement: {
            id: "arr-1", leg: 0, partner_id: "p-nets", confirmed_date: "2026-08-20", confirmed_time: "Morning (9am–12pm)",
            expected_arrival: "10:30", logistics_note: null, driver_name: "Ahmad", vehicle: "WXY 1234", condo_registration: "Registered at guardhouse",
            delivery_partners: { id: "p-nets", name: "NETS" },
          },
        },
      ),
    );
    const one = screen.getByTestId("do-section-order");
    expect(one).toHaveTextContent("Carres Klang");
    expect(one).toHaveTextContent("Ahmad");
    expect(one).toHaveTextContent("WXY 1234");
    expect(one).toHaveTextContent("Condo");
    expect(one).toHaveTextContent("Lift");
    expect(one).toHaveTextContent("Registered at guardhouse");
    expect(one).toHaveTextContent("Call before arriving");
    expect(screen.getByTestId("do-document")).toHaveTextContent(/Rendering the document…|could not be rendered/);
  });

  it("Exceptions says `No open problems` on a clean document, and names the money holds when they exist", () => {
    mount(payload());
    expect(screen.getByTestId("do-no-problems")).toHaveTextContent("No open problems");
    mount(
      payload({}, {
        financeExceptions: [{ id: "fe1", status: "open", reason: "Cheque bounced", opened_at: "2026-08-19T01:00:00Z", cleared_at: null }],
        paymentApprovals: [{ id: "pa1", status: "pending", request_reason: "COD by transfer", requested_at: "2026-08-19T02:00:00Z", decided_at: null, decision_reason: null }],
      }),
    );
    const exceptions = screen.getAllByTestId("do-exceptions").at(-1)!;
    expect(exceptions).toHaveTextContent("Finance is holding this delivery — Cheque bounced");
    expect(exceptions).toHaveTextContent("Payment approval requested — COD by transfer");
  });

  it("Related records doors to the Sales Order, the Order Route, Payments, each Unit, each Case and each sibling document; an unreadable Case read is stated", () => {
    mount(
      payload({}, {
        scopeUnits: [{ item_id: "i1", unit_code: "U1-000-082", sku: "mattress:JAGER-SS" }],
        serviceCases: null,
        siblingDocuments: [
          { id: "d0001", do_number: "DO-180826-3035", issued_at: "2026-08-18T01:47:00Z", voided_at: null, void_reason: null },
          { id: "d0002", do_number: "DO-170826-5050", issued_at: "2026-08-17T01:47:00Z", voided_at: "2026-08-18T00:00:00Z", void_reason: "rescheduled" },
        ],
      }),
    );
    const related = screen.getByTestId("do-related-records");
    expect(related).toHaveTextContent("Open SO-1322 →");
    expect(related).toHaveTextContent("Open Order Route →");
    expect(screen.getByTestId("do-open-payments")).toHaveAttribute("href", "/finance/payments?order=1322");
    expect(screen.getByRole("link", { name: "Open Unit U1-000-082 →" })).toHaveAttribute("href", "/operation/stock/unit/U1-000-082");
    expect(related).toHaveTextContent("Service Cases could not be read");
    expect(screen.getByRole("link", { name: /Open DO-170826-5050 →/ })).toHaveTextContent("cancelled");
    expect(screen.queryByRole("link", { name: /Open DO-180826-3035/ })).toBeNull();
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
              ops_stock_items: { unit_code: "U1-000-082", identity_scope: "unit" },
            },
          ],
        },
      ),
    );
    expect(screen.getByText("Loan collection")).toBeTruthy();
    expect(screen.getByText(/Collect back on delivery day/)).toBeTruthy();
    /* 0492 (Card 15) — the EXACT Unit the crew brings back. */
    expect(screen.getByTestId("do-loan-lines")).toHaveTextContent("Loan U1-000-082 · collect back on delivery day");
  });
});

/* ── 【DELIVERY】 CARD 20 — an intermediate leg ARRIVES; each leg names its
   own source. `Delivered` is the customer's word; a leg before the last whose
   goods reached the partner warehouse reads `Arrived`, leaves from its own
   `from_loc`, and owes no delivery proof on its document. */
describe("a Journey leg's document — Arrived, its own Warehouse, no proof owed (Card 20)", () => {
  const stops = [
    { leg: 1, partner_id: "p-nets", partner_name: "NETS", from_loc: "Carres Klang Warehouse", to_loc: "JB transit warehouse", status: "handed_off" as const },
    { leg: 2, partner_id: "p-al", partner_name: "AL", from_loc: "JB transit warehouse", to_loc: "Customer (Singapore)", status: "pending" as const },
  ];
  const received = [handoverEvent("ready_for_handover"), handoverEvent("handed_over"), handoverEvent("received_by_logistics")];
  const legDoc = (leg: number) =>
    payload(
      { leg, orders: { ...payload().deliveryOrder.orders, warehouse_id: null, delivery_stops: stops } },
      { attempts: [attempt("delivered")], handoverEvents: received },
    );

  it("leg 1 of 2: the pill reads Arrived, the Warehouse is the leg's own source, history says Arrived, no proof is owed", () => {
    mount(legDoc(1));
    expect(screen.getAllByText("Arrived").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Delivered")).toBeNull();
    expect(screen.getByText("Carres Klang Warehouse")).toBeTruthy();
    expect(screen.queryByText("No warehouse recorded")).toBeNull();
    expect(screen.getAllByText(/^Delivery on .* · Arrived$/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("do-evidence-arrival-only")).toBeTruthy();
    expect(screen.queryByTestId("do-evidence-upload-signed-do")).toBeNull();
    expect(screen.queryByTestId("do-evidence-upload-photo")).toBeNull();
  });

  it("leg 2 of 2: the customer leg keeps Delivered and leaves from the previous partner's warehouse", () => {
    mount(legDoc(2));
    expect(screen.getAllByText("Delivered").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Arrived")).toBeNull();
    expect(screen.getByText("JB transit warehouse")).toBeTruthy();
    expect(screen.queryByTestId("do-evidence-arrival-only")).toBeNull();
  });

  it("a whole-order document still reads the order's own warehouse", () => {
    mount(payload({ orders: { ...payload().deliveryOrder.orders, warehouses: { name: "Carres Klang" } } }));
    expect(screen.getByText("Carres Klang")).toBeTruthy();
  });
});

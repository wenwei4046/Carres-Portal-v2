/**
 * EDIT DELIVERY — Delivery's own surface, held as tests.
 * Owner correction 2026-08-24.
 *
 * What this file pins is the OWNERSHIP BOUNDARY, because that is the thing a
 * screenshot cannot show and a future edit can quietly break:
 *
 *  1. Sales facts are PRINTED, never bound to an input.
 *  2. The save payload carries no Sales-owned field.
 *  3. The one route out for a wrong Sales fact is a door, not a second editor.
 *  4. Changing a partner asks for its governed reason before it will save.
 *  5. Nothing here issues a Delivery Order.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const navigateSpy = vi.fn();
let saveMutate: ReturnType<typeof vi.fn>;
let detailState: { data: unknown; isError: boolean; isLoading: boolean };

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateSpy,
    useParams: () => ({ orderId: "order-a" }),
  };
});

vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useDeliveryArrangement: () => detailState,
    useDeliveryPartners: () => ({
      data: {
        partners: [
          { id: "p-nets", name: "NETS", whatsapp_group_url: "https://chat.whatsapp.com/nets" },
          { id: "p-al", name: "AL" },
        ],
      },
    }),
    useSaveDeliveryArrangement: () => ({ mutate: saveMutate, isPending: false }),
  };
});

/* The PDF renderer is real code with real fonts; this suite is about the FORM.
   A preview that cannot render must never block the arrangement, which is a
   property the page owns and this mock lets us assert. */
vi.mock("@/lib/pdf/render", () => ({
  renderDoPdf: vi.fn().mockResolvedValue(new Blob(["%PDF"], { type: "application/pdf" })),
}));

import EditDelivery, { returnPathOf } from "./EditDelivery";

const ORDER = {
  id: "order-a",
  so: 1322,
  source_ref: ["CR0854"],
  customer_name: "kong chai yin",
  customer_phone: "0162389000",
  customer_address: "12 Jalan Damai, Klang",
  customer_address_city: "Klang",
  customer_address_state: "Selangor",
  building_type: "Condominium",
  delivery_floor: 12,
  delivery_has_lift: true,
  delivery_date: "2026-08-30",
  delivery_date_tbd: false,
  do_number: null,
  order_lines: [{ id: "l-1", sku: "mattress:M1401F-K", qty: 1 }],
};

function wrap(entry = "/operation/delivery/edit/order-a") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[entry]}>
        <EditDelivery />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  navigateSpy.mockClear();
  saveMutate = vi.fn();
  detailState = {
    data: { order: ORDER, arrangement: null, history: [] },
    isError: false,
    isLoading: false,
  };
});

describe("the ownership boundary", () => {
  it("⭐ prints the Sales facts and binds NONE of them to an input", () => {
    wrap();
    const form = screen.getByTestId("edit-delivery-form");
    // The facts are on screen…
    expect(within(form).getByText("Kong Chai Yin")).toBeInTheDocument();
    expect(within(form).getByText("0162389000")).toBeInTheDocument();
    expect(within(form).getByText("12 Jalan Damai, Klang")).toBeInTheDocument();
    expect(within(form).getByText("Condominium")).toBeInTheDocument();
    // …and not one of them is editable from here.
    const values = within(form)
      .getAllByRole("textbox")
      .map((i) => (i as HTMLInputElement).value);
    expect(values).not.toContain("kong chai yin");
    expect(values).not.toContain("12 Jalan Damai, Klang");
  });

  it("⭐ sends NO Sales-owned field when it saves", () => {
    wrap();
    fireEvent.change(screen.getByTestId("edit-delivery-confirmed-date"), {
      target: { value: "2026-08-28" },
    });
    fireEvent.click(screen.getByTestId("edit-delivery-save"));
    const payload = saveMutate.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.confirmedDate).toBe("2026-08-28");
    for (const forbidden of [
      "customer_name",
      "customerName",
      "delivery_date",
      "deliveryDate",
      "customer_address",
      "building_type",
    ]) {
      expect(payload).not.toHaveProperty(forbidden);
    }
  });

  it("offers a DOOR for a wrong Sales fact, never a second editor", () => {
    wrap();
    fireEvent.click(screen.getByTestId("edit-delivery-open-sales-order"));
    expect(navigateSpy).toHaveBeenCalledWith("/operation/orders/so/order-a");
  });

  it("opens the exact Sales Order Route without copying its facts or writers", () => {
    wrap();
    fireEvent.click(screen.getByTestId("edit-delivery-open-order-route"));
    expect(navigateSpy).toHaveBeenCalledWith("/operation/orders/so/order-a?route=1");
  });

  it("never offers Issue, Release or Approve", () => {
    wrap();
    for (const word of [/^Issue$/i, /Release/i, /Approve/i, /New DO/i]) {
      expect(screen.queryByRole("button", { name: word })).toBeNull();
    }
  });
});

describe("the Delivery-owned fields", () => {
  it("carries every field the owner listed", () => {
    wrap();
    for (const id of [
      "edit-delivery-partner",
      "edit-delivery-confirmed-date",
      "edit-delivery-confirmed-time",
      "edit-delivery-expected-arrival",
      "edit-delivery-note",
      "edit-delivery-proof",
    ]) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
  });

  it("asks for a driver and vehicle on a CONDO delivery", () => {
    wrap();
    expect(screen.getByTestId("edit-delivery-condo")).toBeInTheDocument();
  });

  it("does not ask for one on a landed house — that is a field nobody can fill", () => {
    detailState.data = {
      order: { ...ORDER, building_type: "Landed" },
      arrangement: null,
      history: [],
    };
    wrap();
    expect(screen.queryByTestId("edit-delivery-condo")).toBeNull();
  });
});

describe("changing a partner is not the same act as picking one", () => {
  it("saves a FIRST assignment with no reason", () => {
    wrap();
    fireEvent.change(screen.getByTestId("edit-delivery-partner"), {
      target: { value: "p-nets" },
    });
    expect(screen.queryByTestId("edit-delivery-reason")).toBeNull();
    fireEvent.click(screen.getByTestId("edit-delivery-save"));
    expect(saveMutate).toHaveBeenCalled();
  });

  it("⭐ asks for a governed reason before REPLACING one, and blocks Save until it has one", () => {
    detailState.data = {
      order: ORDER,
      arrangement: {
        id: "arr-1",
        order_id: "order-a",
        leg: 0,
        partner_id: "p-nets",
        partner_name: "NETS",
        confirmed_date: null,
        confirmed_time: null,
        expected_arrival: null,
        logistics_note: null,
        reply_proof_path: null,
        driver_name: null,
        vehicle: null,
        updated_at: "2026-08-24T00:00:00Z",
        updated_by: null,
      },
      history: [],
    };
    wrap();
    fireEvent.change(screen.getByTestId("edit-delivery-partner"), { target: { value: "p-al" } });
    const reason = screen.getByTestId("edit-delivery-reason");
    expect(reason).toBeInTheDocument();
    expect(screen.getByTestId("edit-delivery-save")).toBeDisabled();

    fireEvent.change(reason, { target: { value: "partner_capacity_full" } });
    expect(screen.getByTestId("edit-delivery-save")).toBeEnabled();
    fireEvent.click(screen.getByTestId("edit-delivery-save"));
    expect((saveMutate.mock.calls[0]![0] as { reason: string }).reason).toBe(
      "partner_capacity_full",
    );
  });
});

describe("the preview is the real document", () => {
  it("says there is no document yet rather than inventing a number", () => {
    wrap();
    expect(screen.getByTestId("edit-delivery-preview-number").textContent).toBe(
      "Preview · No delivery order yet",
    );
  });

  it("carries the real number once one exists", () => {
    detailState.data = {
      order: { ...ORDER, do_number: "DO-180826-3035" },
      arrangement: null,
      history: [],
    };
    wrap();
    expect(screen.getByTestId("edit-delivery-preview-number").textContent).toBe(
      "DO-180826-3035",
    );
  });
});

describe("the way back", () => {
  it("returns to Delivery Work", () => {
    wrap();
    fireEvent.click(screen.getByTestId("edit-delivery-back"));
    expect(navigateSpy).toHaveBeenCalledWith("/operation?tab=delivery");
  });
});

describe("the chase door (Delivery Card 05)", () => {
  it("shows the prepared message once a partner is chosen, and says sending is not confirmation", () => {
    wrap();
    fireEvent.change(screen.getByTestId("edit-delivery-partner"), {
      target: { value: "p-nets" },
    });
    const block = screen.getByTestId("edit-delivery-chase");
    expect(within(block).getByText("Ask NETS for the delivery date")).toBeTruthy();
    const msg = screen.getByTestId("edit-delivery-chase-message").textContent ?? "";
    expect(msg).toContain("SO-1322");
    expect(msg).toContain("Customer asked:");
    expect(msg).toContain("Please confirm the delivery date and time.");
    // The law, on screen: prepared/copied/opened/sent never means confirmed.
    expect(within(block).getByText(/Sending is not confirmation/)).toBeTruthy();
    // The group door goes straight to the partner's own WhatsApp group.
    expect(
      screen.getByTestId("edit-delivery-open-whatsapp").getAttribute("href"),
    ).toBe("https://chat.whatsapp.com/nets");
  });

  it("says so when the partner has no WhatsApp group saved, instead of a dead door", () => {
    wrap();
    fireEvent.change(screen.getByTestId("edit-delivery-partner"), {
      target: { value: "p-al" },
    });
    expect(screen.queryByTestId("edit-delivery-open-whatsapp")).toBeNull();
    expect(screen.getByText("No WhatsApp group saved for this partner")).toBeTruthy();
  });

  it("shows no chase block while no partner is chosen", () => {
    wrap();
    expect(screen.queryByTestId("edit-delivery-chase")).toBeNull();
  });
});

describe("the reply proof is an UPLOAD, not a typed path (Delivery Card 05)", () => {
  it("offers a file picker and no free-text path input", () => {
    wrap();
    const upload = screen.getByTestId("edit-delivery-proof-upload");
    expect(upload.getAttribute("type")).toBe("file");
    expect(upload.getAttribute("accept")).toContain("image/jpeg");
    // The old text input bound to the path is gone.
    expect(screen.getByTestId("edit-delivery-proof").querySelector("input[type='text']")).toBeNull();
  });
});

describe("condominium registration (Delivery Card 06, 0412)", () => {
  it("offers the registration field on a CONDO delivery and sends it on save", () => {
    wrap();
    const field = screen.getByTestId("edit-delivery-condo-registration");
    fireEvent.change(field, { target: { value: "Guard house permit GH-88, register before 10am" } });
    fireEvent.click(screen.getByTestId("edit-delivery-save"));
    const payload = saveMutate.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.condoRegistration).toBe("Guard house permit GH-88, register before 10am");
  });

  it("offers no registration field on a landed house", () => {
    detailState.data = {
      order: { ...ORDER, building_type: "Landed" },
      arrangement: null,
      history: [],
    };
    wrap();
    expect(screen.queryByTestId("edit-delivery-condo-registration")).toBeNull();
  });
});

describe("the chase returns to the queue it came from", () => {
  const QUEUE = "/operation?tab=delivery&view=no_confirmed_date&region=Selangor";

  it("saving the confirmed date lands back on the SAME work list", () => {
    wrap(`/operation/delivery/edit/order-a?from=${encodeURIComponent(QUEUE)}`);
    fireEvent.click(screen.getByRole("button", { name: "Save Delivery" }));
    const onSuccess = saveMutate.mock.calls[0]![1]!.onSuccess as () => void;
    onSuccess();
    expect(navigateSpy).toHaveBeenCalledWith(QUEUE);
  });

  it("with no queue behind it, the editor still lands on Monitor", () => {
    wrap();
    fireEvent.click(screen.getByRole("button", { name: "Save Delivery" }));
    const onSuccess = saveMutate.mock.calls[0]![1]!.onSuccess as () => void;
    onSuccess();
    expect(navigateSpy).toHaveBeenCalledWith("/operation?tab=delivery");
  });

  it("only a portal path is honoured — a pasted external URL never is", () => {
    expect(returnPathOf(QUEUE)).toBe(QUEUE);
    expect(returnPathOf(null)).toBe("/operation?tab=delivery");
    for (const hostile of [
      "https://example.com",
      "//example.com",
      "/dealer/orders",
      "javascript:alert(1)",
    ]) {
      expect(returnPathOf(hostile)).toBe("/operation?tab=delivery");
    }
  });
});

/**
 * PosOrderDetail — the POS-native My-orders drawer (design:
 * docs/superpowers/plans/2026-07-14-pos-order-detail.md §4/§5). Pins the lane
 * gating (place / proceed / delivered), the 5-chip Move-to-Proceed gate, the
 * un-proceed visibility rules and the diff-only save payload.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import type { CatalogResponse, Order } from "@carres/shared";
import PosOrderDetail from "./PosOrderDetail";

const h = vi.hoisted(() => ({
  order: null as unknown as Order,
  updateMutateAsync: vi.fn(async () => ({})),
  topUpMutateAsync: vi.fn(async () => ({})),
  proceedMutateAsync: vi.fn(async () => ({})),
  unproceedMutateAsync: vi.fn(async () => ({})),
  addLinesMutateAsync: vi.fn(async () => ({})),
}));

vi.mock("@/lib/queries", () => ({
  useOrder: () => ({ data: h.order, isLoading: false }),
  useCatalog: () => ({ data: CATALOG }),
  useUpdateOrder: () => ({ mutateAsync: h.updateMutateAsync, isPending: false }),
  useTopUpOrder: () => ({ mutateAsync: h.topUpMutateAsync, isPending: false }),
  useProceedOrder: () => ({ mutateAsync: h.proceedMutateAsync, isPending: false }),
  useUnproceedOrder: () => ({ mutateAsync: h.unproceedMutateAsync, isPending: false }),
  // 0231 — add-product P1.
  useAddOrderLines: () => ({ mutateAsync: h.addLinesMutateAsync, isPending: false }),
  // 0233 — add-product P3 (submission flow).
  useOrderChangeRequests: () => ({ data: { requests: [] }, isLoading: false }),
  useSubmitOrderChangeRequest: () => ({ mutateAsync: vi.fn(async () => ({})), isPending: false }),
  useCancelOrderChangeRequest: () => ({ mutateAsync: vi.fn(async () => ({})), isPending: false }),
}));
vi.mock("@/lib/storage", () => ({
  newWizardSessionId: () => "sess-1",
  uploadAttachment: vi.fn(async () => "orders-attachments/d-1/topup-sess-1/receipt-1.jpg"),
}));

const CATALOG = {
  models: [
    {
      id: "00000000-0000-0000-0000-00000000m001",
      category: "mattress",
      modelKey: "CLOUD",
      name: "Cloud Mattress",
      blurb: null,
      colors: null,
      gaps: null,
      sofaMode: null,
      photoUrl: null,
    },
  ],
  skus: [
    {
      id: "00000000-0000-0000-0000-00000000s001",
      modelId: "00000000-0000-0000-0000-00000000m001",
      sku: "SKU-1",
      variant: "King",
      variantKind: "size",
      price: 1500,
      cost: null,
      supplierId: null,
    },
  ],
  sofaFabrics: [],
  addons: [],
  floorConfig: { id: 1, freeUpToFloor: 3, perFloorPerItem: 20 },
} as unknown as CatalogResponse;

const FUTURE = "2099-01-01";
const PAST = "2020-01-01";

function order(over: Partial<Order> = {}): Order {
  return {
    id: "00000000-0000-0000-0000-000000001201",
    so: 1201,
    status: "place",
    channel: "dealer",
    dealerId: "d-1",
    outletId: null,
    salespersonId: null,
    customer: {
      name: "Tan Mei",
      phone: "0123456789",
      address: "12 Jalan Test, KL",
      addressUnknown: false,
      billing: null,
      billingSame: true,
      emergency: null,
      email: "tan@example.com",
      race: null,
      gender: null,
      birthday: null,
    },
    delivery: {
      date: FUTURE,
      proceedDate: FUTURE,
      dateTbd: false,
      floor: 1,
      hasLift: true,
      stairItems: null,
    },
    paid: 1500,
    signatureUrl: "sig.png",
    paymentSlipUrl: null,
    termsAccepted: true,
    paymentMethod: "online",
    approvalCode: null,
    installmentMonths: null,
    operationStage: null,
    sourceSystem: null,
    warehouseId: null,
    deliveryPartnerId: null,
    partnerStage: null,
    partnerPickedAt: null,
    partnerEta: null,
    doNumber: null,
    doNote: null,
    invoiceNo: null,
    invoicedAt: null,
    placedAt: new Date().toISOString(),
    lines: [
      {
        id: "00000000-0000-0000-0000-00000000l001",
        orderId: "00000000-0000-0000-0000-000000001201",
        sku: "SKU-1",
        qty: 2,
        attrs: null,
        unitPrice: 1500,
      },
    ],
    addons: [],
    ...over,
  } as Order;
}

function renderDrawer(o: Order, onClose = vi.fn()) {
  h.order = o;
  render(<PosOrderDetail id={o.id} staffName="Aisyah" onClose={onClose} />);
  return onClose;
}

beforeEach(() => {
  h.updateMutateAsync.mockClear();
  h.topUpMutateAsync.mockClear();
  h.proceedMutateAsync.mockClear();
  h.unproceedMutateAsync.mockClear();
});

describe("place lane", () => {
  it("renders the 5-chip checklist and an enabled Move to Proceed when all checks pass", async () => {
    // total 3000, paid 1500 = 50%; email + address + both dates set.
    const onClose = renderDrawer(order());
    const checklist = screen.getByTestId("pos-od-checklist");
    for (const label of [
      "Customer info",
      "Delivery address",
      "Delivery date",
      "≥ 50% paid",
      "Proceed date",
    ]) {
      expect(within(checklist).getByText(label)).toBeTruthy();
    }
    const proceed = screen.getByTestId("pos-od-proceed") as HTMLButtonElement;
    expect(proceed.disabled).toBe(false);

    fireEvent.click(proceed);
    await waitFor(() => expect(h.proceedMutateAsync).toHaveBeenCalledWith(h.order.id));
    // Not dirty → no PATCH before the proceed; drawer closes on success.
    expect(h.updateMutateAsync).not.toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("Move to Proceed stays disabled while a check fails (email missing)", () => {
    renderDrawer(order({ customer: { ...order().customer, email: null } }));
    const proceed = screen.getByTestId("pos-od-proceed") as HTMLButtonElement;
    expect(proceed.disabled).toBe(true);
  });

  it("Move to Proceed stays disabled below 50% paid", () => {
    renderDrawer(order({ paid: 100 }));
    expect((screen.getByTestId("pos-od-proceed") as HTMLButtonElement).disabled).toBe(true);
    // The proceed-date input is payment-gated in the place lane.
    expect((screen.getByTestId("pos-od-pdate") as HTMLInputElement).disabled).toBe(true);
  });

  it("date inputs are editable and Save sends a DIFF-ONLY payload", async () => {
    renderDrawer(order());
    expect((screen.getByTestId("pos-od-ddate") as HTMLInputElement).disabled).toBe(false);

    const save = screen.getByTestId("pos-od-save") as HTMLButtonElement;
    expect(save.disabled).toBe(true); // pristine

    fireEvent.change(screen.getByTestId("pos-od-name"), { target: { value: "New Name" } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() =>
      expect(h.updateMutateAsync).toHaveBeenCalledWith({ customer: { name: "New Name" } }),
    );
  });
});

describe("proceed lane", () => {
  const proceedOrder = () =>
    order({ status: "proceed_order", operationStage: "confirmed", paid: 1500 });

  it("customer fields stay editable, dates lock, record-payment stays available", () => {
    renderDrawer(proceedOrder());
    expect((screen.getByTestId("pos-od-name") as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByTestId("pos-od-email") as HTMLInputElement).disabled).toBe(false);
    // 0230 — the address fieldset (cascading picker) stays editable in proceed.
    expect((screen.getByTestId("pos-od-address-fields") as HTMLFieldSetElement).disabled).toBe(false);
    expect((screen.getByTestId("pos-od-ddate") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByTestId("pos-od-pdate") as HTMLInputElement).disabled).toBe(true);
    // outstanding 1500 > 0 → the record-payment form shows in the proceed lane.
    expect(screen.getByTestId("pos-od-payform")).toBeTruthy();
    // No place-lane checklist / proceed CTA.
    expect(screen.queryByTestId("pos-od-checklist")).toBeNull();
    expect(screen.queryByTestId("pos-od-proceed")).toBeNull();
  });

  it("customer-only Save from the proceed lane sends no delivery keys", async () => {
    renderDrawer(proceedOrder());
    fireEvent.change(screen.getByTestId("pos-od-email"), {
      target: { value: "new@example.com" },
    });
    fireEvent.click(screen.getByTestId("pos-od-save"));
    await waitFor(() =>
      expect(h.updateMutateAsync).toHaveBeenCalledWith({
        customer: { email: "new@example.com" },
      }),
    );
  });

  it("Move to Order placed shows while canUnproceed; success does NOT close the drawer", async () => {
    const onClose = renderDrawer(proceedOrder());
    const btn = screen.getByTestId("pos-od-unproceed");
    expect(screen.getByText("Move back to edit · only before the proceed date")).toBeTruthy();
    fireEvent.click(btn);
    await waitFor(() => expect(h.unproceedMutateAsync).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("no unproceed once the proceed date has passed — locked info strip instead", () => {
    renderDrawer(
      order({
        status: "proceed_order",
        operationStage: "confirmed",
        delivery: { ...order().delivery, proceedDate: PAST },
      }),
    );
    expect(screen.queryByTestId("pos-od-unproceed")).toBeNull();
    expect(screen.getByTestId("pos-od-foot-locked")).toBeTruthy();
  });

  it("no unproceed once ops moved past 'confirmed'", () => {
    renderDrawer(order({ status: "proceed_order", operationStage: "in_production" }));
    expect(screen.queryByTestId("pos-od-unproceed")).toBeNull();
    expect(screen.getByTestId("pos-od-foot-locked")).toBeTruthy();
  });
});

describe("delivered lane", () => {
  it("is fully read-only with the delivered info strip", () => {
    renderDrawer(order({ status: "delivered", paid: 3000 }));
    expect((screen.getByTestId("pos-od-name") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByTestId("pos-od-address-fields") as HTMLFieldSetElement).disabled).toBe(true);
    expect((screen.getByTestId("pos-od-ddate") as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByTestId("pos-od-payform")).toBeNull();
    expect(screen.queryByTestId("pos-od-checklist")).toBeNull();
    expect(screen.getByTestId("pos-od-foot-delivered")).toBeTruthy();
  });
});

describe("record payment", () => {
  it("cash needs no slip; submits the top-up input and resets the code", async () => {
    renderDrawer(order()); // outstanding 1500
    fireEvent.change(screen.getByTestId("pos-od-pay-code"), { target: { value: "AC-1" } });
    const record = screen.getByTestId("pos-od-record") as HTMLButtonElement;
    expect(record.disabled).toBe(false); // default method = cash, amount prefilled 1500
    fireEvent.click(record);
    await waitFor(() =>
      expect(h.topUpMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 1500,
          method: "cash",
          methodLabel: "Cash",
          reference: "AC-1",
          photoPaths: [],
        }),
      ),
    );
    await waitFor(() =>
      expect((screen.getByTestId("pos-od-pay-code") as HTMLInputElement).value).toBe(""),
    );
  });

  it("an approval-code method (config-driven) requires a slip before Record enables", () => {
    renderDrawer(order());
    // 0230 — chips come from order_entry_config (code defaults here):
    // online / credit / installment / cash. Credit demands approval code+slip.
    fireEvent.click(screen.getByTestId("pos-od-method-credit"));
    expect((screen.getByTestId("pos-od-record") as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders the configured default method chips (no legacy hardcoded list)", () => {
    renderDrawer(order());
    for (const key of ["online", "credit", "installment", "cash"]) {
      expect(screen.getByTestId(`pos-od-method-${key}`)).toBeTruthy();
    }
    expect(screen.queryByTestId("pos-od-method-bank")).toBeNull();
  });
});

describe("add product (0231)", () => {
  it("place lane shows + Add product and opens the catalog overlay", () => {
    renderDrawer(order());
    fireEvent.click(screen.getByTestId("pos-od-add-product"));
    expect(screen.getByTestId("pos-add-product-overlay")).toBeTruthy();
    // The CLOUD mattress card renders from the catalog mock.
    expect(screen.getByTestId("pos-card-CLOUD")).toBeTruthy();
  });

  it("proceed and delivered lanes hide the Add product button", () => {
    renderDrawer(order({ status: "proceed_order", operationStage: "confirmed" }));
    expect(screen.queryByTestId("pos-od-add-product")).toBeNull();
    // 0233 — the proceed lane offers the SUBMISSION flow instead.
    expect(screen.getByTestId("pos-od-submit-change")).toBeTruthy();
  });

  it("delivered lane offers neither add nor submit", () => {
    renderDrawer(order({ status: "delivered", paid: 3000 }));
    expect(screen.queryByTestId("pos-od-add-product")).toBeNull();
    expect(screen.queryByTestId("pos-od-submit-change")).toBeNull();
  });
});

describe("structured address (0230)", () => {
  it("seeds the cascading picker from the stored parts", () => {
    renderDrawer(
      order({
        customer: {
          ...order().customer,
          address: "8 Jalan PP50A, Seri Kembangan 43300, Selangor",
          addressLine1: "8 Jalan PP50A",
          addressLine2: null,
          addressState: "Selangor",
          addressCity: "Seri Kembangan",
          addressPostcode: "43300",
        },
      }),
    );
    expect((screen.getByLabelText("Address Line 1 *") as HTMLInputElement).value).toBe(
      "8 Jalan PP50A",
    );
    expect((screen.getByLabelText("State *") as HTMLSelectElement).value).toBe("Selangor");
    expect((screen.getByLabelText("City / Town *") as HTMLSelectElement).value).toBe(
      "Seri Kembangan",
    );
    expect((screen.getByLabelText("Postcode *") as HTMLSelectElement).value).toBe("43300");
  });

  it("legacy composed-only order seeds Line 1, stays 'Set' untouched; completing the cascade saves composed + parts", async () => {
    renderDrawer(order()); // address "12 Jalan Test, KL", no parts
    const line1 = screen.getByLabelText("Address Line 1 *") as HTMLInputElement;
    expect(line1.value).toBe("12 Jalan Test, KL");
    // Untouched legacy address still counts as Set → proceed stays enabled.
    expect((screen.getByTestId("pos-od-proceed") as HTMLButtonElement).disabled).toBe(false);

    fireEvent.change(line1, { target: { value: "8 Jalan PP50A" } });
    fireEvent.change(screen.getByLabelText("State *"), { target: { value: "Selangor" } });
    fireEvent.change(screen.getByLabelText("City / Town *"), {
      target: { value: "Seri Kembangan" },
    });
    fireEvent.change(screen.getByLabelText("Postcode *"), { target: { value: "43300" } });
    fireEvent.click(screen.getByTestId("pos-od-save"));
    await waitFor(() =>
      expect(h.updateMutateAsync).toHaveBeenCalledWith({
        customer: {
          address: "8 Jalan PP50A, Seri Kembangan 43300, Selangor",
          addressLine1: "8 Jalan PP50A",
          addressLine2: null,
          addressState: "Selangor",
          addressCity: "Seri Kembangan",
          addressPostcode: "43300",
        },
      }),
    );
  });

  it("a PARTIAL cascade blocks both Save and Move to Proceed", () => {
    renderDrawer(order());
    fireEvent.change(screen.getByLabelText("State *"), { target: { value: "Selangor" } });
    // Dirty but incomplete → the address never enters the payload (Save has
    // nothing to send) and the checklist address chip fails.
    expect((screen.getByTestId("pos-od-save") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("pos-od-proceed") as HTMLButtonElement).disabled).toBe(true);
  });
});

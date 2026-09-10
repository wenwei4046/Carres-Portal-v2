/**
 * PosOrderDetail — the POS-native My-orders drawer (design:
 * docs/superpowers/plans/2026-07-14-pos-order-detail.md §4/§5). Pins the lane
 * gating (place / proceed / delivered), the 5-chip Move-to-Proceed gate, the
 * un-proceed visibility rules and the diff-only save payload.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";
import type { CatalogResponse, Order } from "@carres/shared";
import PosOrderDetail from "./PosOrderDetail";

const h = vi.hoisted(() => ({
  order: null as unknown as Order,
  updateMutateAsync: vi.fn(async () => ({})),
  topUpMutateAsync: vi.fn(async () => ({})),
  proceedMutateAsync: vi.fn(async () => ({})),
  unproceedMutateAsync: vi.fn(async () => ({})),
  addLinesMutateAsync: vi.fn(async () => ({})),
  replaceMutateAsync: vi.fn(async () => ({})),
  // 0257 — proceed-lane pencil files a replace_lines change request.
  submitChangeMutateAsync: vi.fn(async () => ({})),
  changeRequests: [] as unknown[],
  // 0258 — service add-on edit.
  editAddonMutateAsync: vi.fn(async () => ({})),
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
  // 0255 — line EDIT.
  useReplaceOrderLines: () => ({ mutateAsync: h.replaceMutateAsync, isPending: false }),
  // 0233 — add-product P3 (submission flow).
  useOrderChangeRequests: () => ({ data: { requests: h.changeRequests }, isLoading: false }),
  useSubmitOrderChangeRequest: () => ({
    mutateAsync: h.submitChangeMutateAsync,
    isPending: false,
  }),
  useCancelOrderChangeRequest: () => ({ mutateAsync: vi.fn(async () => ({})), isPending: false }),
  useUpdateOrderChangeRequest: () => ({ mutateAsync: vi.fn(async () => ({})), isPending: false }),
  // 0258 — service add-on edit.
  useEditOrderAddon: () => ({ mutateAsync: h.editAddonMutateAsync, isPending: false }),
  // 0262 — the Customer block renders <GuaranteeCoverStrip/>, which reads this
  // hook. A full mock of this module must stub it, or the strip mounts a query
  // with no QueryClientProvider and takes the whole surface down.
  useOrderGuarantees: () => ({ data: undefined }),
}));
// 0255 — the edit surface mounts the real configure pages; stub them so the
// drawer tests stay light. The bed stub can emit an UP-priced or DOWN-priced
// replacement to exercise the up-sell precheck.
vi.mock("./PosConfigurePage", () => ({
  default: (p: { onAdd: (l: unknown) => void; onClose: () => void }) => (
    <div data-testid="stub-configure-page">
      <button
        data-testid="stub-emit-up"
        onClick={() =>
          p.onAdd({ localId: "x", sku: "SKU-1", qty: 1, attrs: { gap: "None" }, unitPrice: 5000, label: "up" })
        }
      />
      <button
        data-testid="stub-emit-down"
        onClick={() =>
          p.onAdd({ localId: "x", sku: "SKU-1", qty: 1, attrs: null, unitPrice: 1, label: "down" })
        }
      />
    </div>
  ),
}));
vi.mock("./SofaConfigurePage", () => ({
  default: () => <div data-testid="stub-sofa-page" />,
}));
vi.mock("@/lib/storage", () => ({
  newWizardSessionId: () => "sess-1",
  uploadAttachment: vi.fn(async () => "orders-attachments/d-1/topup-sess-1/receipt-1.jpg"),
}));
// Keep @react-pdf/renderer (ridden in by DownloadSalesOrderButton) out of the
// jsdom graph — the fetch-render-open flow is unit-covered in the button's
// own test file; here we only pin presence per lane.
vi.mock("@/lib/pdf/render", () => ({
  renderSalesOrderPdf: vi.fn(),
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
  // 0258 — the service add-on edit modal reads sizeOptions from this config.
  addons: [
    { key: "dispose-mattress", name: "Dispose old mattress", price: 80, active: true, sizeOptions: ["King", "Queen"] },
    { key: "dispose-sofa", name: "Dispose old sofa", price: 50, active: true, sizeOptions: null },
  ],
  /* ⚠️ `freeUpToFloor: 3` with the order's `floor: 5` below is deliberate: it
     makes the LIVE surcharge non-zero, so a screen that adds it on top of the
     stamped row is visible in the total. The previous pair — a floor inside the
     free band AND `hasLift: true` — zeroed the live half three ways over and is
     what hid a doubled charge on the collection screen. */
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
      /* A REAL stair-carry order: above the free band, no lift, one item
         needing the carry. The stamped `STAIR_CARRY` row below is the fee. */
      floor: 5,
      hasLift: false,
      stairItems: 1,
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
  h.replaceMutateAsync.mockClear();
  h.submitChangeMutateAsync.mockClear();
  h.editAddonMutateAsync.mockClear();
  h.changeRequests = [];
});

/** 0258 — an order carrying one editable service row + one DELIVERY row. */
function orderWithAddons(over: Partial<Order> = {}): Order {
  return order({
    addons: [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-0000000000a1",
        orderId: "00000000-0000-0000-0000-000000001201",
        addonKey: "dispose-sofa",
        qty: 1,
        unitPrice: 50,
        attrs: null,
      },
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-0000000000a2",
        orderId: "00000000-0000-0000-0000-000000001201",
        addonKey: "DELIVERY",
        qty: 1,
        unitPrice: 250,
        attrs: null,
      },
      // 0406 — the FOURTH server-computed fee. It sits in the shared fixture on
      // purpose: every pencil count in this file then guards the gate, and a
      // regression shows up as an off-by-one rather than as a missing test.
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-0000000000a4",
        orderId: "00000000-0000-0000-0000-000000001201",
        addonKey: "STAIR_CARRY",
        qty: 1,
        unitPrice: 150,
        attrs: null,
      },
    ],
    ...over,
  } as Partial<Order>);
}

/**
 * ⭐ THE STAIR FEE IS CHARGED ONCE (YH, 2026-09-02 — live money on the
 * collection screen).
 *
 * `addonSubtotal` sums EVERY `order.addons` row, and `0393` stamps the
 * `STAIR_CARRY` row at birth. This screen ALSO added `floorSurcharge(order,
 * catalog.floorConfig)` — a live recomputation — on top, so the fee landed in
 * the total twice and printed twice: once as its own addon row, once as a
 * `Stair carry` line beneath. `total` drives `outstanding`, and `outstanding`
 * prefills the record-payment amount, so the POS asked the customer for it
 * twice.
 *
 * ⚠️ THE FIXTURE IS WHAT HID IT, which is why it was un-rigged in the same
 * commit. It used `floor: 1, hasLift: true, stairItems: null` — three separate
 * ways of zeroing the live half — while a `unitPrice: 150` STAIR_CARRY row sat
 * in its addons. Every assertion passed with the bug present.
 */
describe("the stair carry is counted once", () => {
  it("totals the stamped row and does not add a live recomputation on top", () => {
    renderDrawer(orderWithAddons());
    const items = screen.getByTestId("pos-od-overlay");
    /* Lines 3,000 + addons 450 (dispose-sofa 50 · DELIVERY 250 · the stamped
       STAIR_CARRY 150) = 3,450.
       The LIVE surcharge on this fixture is floor 5, no lift, 1 item, free to
       3, RM 20 per floor per item = RM 40 — a DIFFERENT number from the stamped
       150, chosen so a reintroduced double count cannot hide behind a
       coincidence. Adding it back gives 3,490. */
    expect(items.textContent).toContain("3,450");
    expect(items.textContent).not.toContain("3,490");
  });

  it("prints the fee once — as its addon row, not as a second Stair carry line", () => {
    renderDrawer(orderWithAddons());
    const items = screen.getByTestId("pos-od-overlay");
    /* The addon row's label resolves through the catalog, which this fixture
       does not stock — so it prints the raw key here and `Stair carry` in
       production (0393 seeds that name). Count BOTH spellings: what is being
       pinned is that the fee appears ONCE, not which word it wears. */
    const hits = (items.textContent ?? "").match(/Stair carry|STAIR_CARRY/g) ?? [];
    expect(hits).toHaveLength(1);
  });
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

describe("SO identity + Sales Order doc (2026-07-25, Loo)", () => {
  it("titles the drawer with the official SO number, not the # code", () => {
    renderDrawer(order());
    expect(screen.getByText("SO-1201")).toBeTruthy();
  });

  it("place-lane footer ends with View sales order", () => {
    renderDrawer(order());
    const btn = within(screen.getByTestId("pos-od-foot-place")).getByTestId(
      "download-sales-order-1201",
    );
    expect(btn.textContent).toContain("View sales order");
  });

  it("proceed-lane footer carries the button next to Move to Order placed", () => {
    renderDrawer(order({ status: "proceed_order", operationStage: "confirmed" }));
    expect(
      within(screen.getByTestId("pos-od-foot-proceed")).getByTestId(
        "download-sales-order-1201",
      ),
    ).toBeTruthy();
  });

  it("locked strip keeps its copy AND gains the button", () => {
    renderDrawer(order({ status: "proceed_order", operationStage: "in_production" }));
    const foot = screen.getByTestId("pos-od-foot-locked");
    expect(within(foot).getByText("Locked · HQ operation handling")).toBeTruthy();
    expect(within(foot).getByTestId("download-sales-order-1201")).toBeTruthy();
  });

  it("delivered strip keeps its copy AND gains the button", () => {
    renderDrawer(order({ status: "delivered", paid: 3000 }));
    const foot = screen.getByTestId("pos-od-foot-delivered");
    expect(within(foot).getByText("Delivered · managed in backend portal.")).toBeTruthy();
    expect(within(foot).getByTestId("download-sales-order-1201")).toBeTruthy();
  });
});

describe("line edit (0255)", () => {
  it("place lane shows the pencil; clicking opens the seeded configure surface", () => {
    renderDrawer(order());
    const pencil = screen.getByTestId("pos-od-edit-line");
    fireEvent.click(pencil);
    expect(screen.getByTestId("pos-od-edit-surface")).toBeTruthy();
    expect(screen.getByTestId("stub-configure-page")).toBeTruthy();
  });

  // 0257 — the proceed lane KEEPS the pencil: Save files a replace_lines
  // change request (HQ approval) instead of writing directly.
  it("proceed pencil files a replace_lines change request (no direct write)", async () => {
    renderDrawer(order({ status: "proceed_order", operationStage: "confirmed" }));
    fireEvent.click(screen.getByTestId("pos-od-edit-line"));
    fireEvent.click(screen.getByTestId("stub-emit-up"));
    await waitFor(() =>
      expect(h.submitChangeMutateAsync).toHaveBeenCalledWith({
        kind: "replace_lines",
        targetLineIds: ["00000000-0000-0000-0000-00000000l001"],
        targetLines: [
          {
            id: "00000000-0000-0000-0000-00000000l001",
            sku: "SKU-1",
            qty: 2,
            unitPrice: 1500,
            label: "Cloud Mattress · King",
          },
        ],
        line: { sku: "SKU-1", qty: 1, attrs: { gap: "None" }, unitPrice: 5000, label: "up" },
      }),
    );
    expect(h.replaceMutateAsync).not.toHaveBeenCalled();
  });

  // 0258 — service add-on rows get the pencil too; a server-computed fee stays
  // locked. 0406 — that is all FOUR computed keys, not only the delivery trio.
  it("addon pencil edits qty directly in the place lane (computed rows locked)", async () => {
    renderDrawer(orderWithAddons());
    const pencils = screen.getAllByTestId("pos-od-edit-addon");
    // dispose-sofa only — DELIVERY and STAIR_CARRY are both server-computed.
    expect(pencils).toHaveLength(1);
    fireEvent.click(pencils[0]);
    expect(screen.getByTestId("pos-od-addon-modal")).toBeTruthy();
    // qty 1 → 2 (minus disabled at the original qty — up-sell law).
    expect((screen.getByTestId("pos-od-addon-minus") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("pos-od-addon-plus"));
    fireEvent.click(screen.getByTestId("pos-od-addon-save"));
    await waitFor(() =>
      expect(h.editAddonMutateAsync).toHaveBeenCalledWith({
        addonId: "aaaaaaaa-aaaa-4aaa-8aaa-0000000000a1",
        input: { qty: 2, attrs: null },
      }),
    );
    expect(h.submitChangeMutateAsync).not.toHaveBeenCalled();
  });

  it("a sized addon gates Save until every unit has a size; composes attrs.sizes", async () => {
    renderDrawer(
      orderWithAddons({
        addons: [
          {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-0000000000a3",
            orderId: "00000000-0000-0000-0000-000000001201",
            addonKey: "dispose-mattress",
            qty: 1,
            unitPrice: 80,
            attrs: { sizes: ["King"], size: "King" },
          },
        ],
      } as Partial<Order>),
    );
    fireEvent.click(screen.getByTestId("pos-od-edit-addon"));
    fireEvent.click(screen.getByTestId("pos-od-addon-plus"));
    const save = screen.getByTestId("pos-od-addon-save") as HTMLButtonElement;
    expect(save.disabled).toBe(true); // unit 2 has no size yet
    fireEvent.change(screen.getByLabelText("Dispose old mattress size (item 2)"), {
      target: { value: "Queen" },
    });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() =>
      expect(h.editAddonMutateAsync).toHaveBeenCalledWith({
        addonId: "aaaaaaaa-aaaa-4aaa-8aaa-0000000000a3",
        input: { qty: 2, attrs: { sizes: ["King", "Queen"], size: "King + Queen" } },
      }),
    );
  });

  it("proceed-lane addon pencil files an edit_addon change request", async () => {
    renderDrawer(orderWithAddons({ status: "proceed_order", operationStage: "confirmed" }));
    fireEvent.click(screen.getByTestId("pos-od-edit-addon"));
    fireEvent.click(screen.getByTestId("pos-od-addon-plus"));
    fireEvent.click(screen.getByTestId("pos-od-addon-save"));
    await waitFor(() =>
      expect(h.submitChangeMutateAsync).toHaveBeenCalledWith({
        kind: "edit_addon",
        targetAddonId: "aaaaaaaa-aaaa-4aaa-8aaa-0000000000a1",
        qty: 2,
        attrs: null,
        label: "Dispose old sofa",
        oldQty: 1,
        oldSize: null,
      }),
    );
    expect(h.editAddonMutateAsync).not.toHaveBeenCalled();
  });

  // 0406 — a computed fee is not a pickable service, on EVERY surface. The
  // office screen closed this door on 2026-08-29; this one stayed open because
  // its gate read a local label map instead of the exported list. The bug was
  // a double charge: one click sent qty 2 and the customer owed RM 300 for a
  // carry nobody quoted.
  it("never offers the pencil on a stair carry — in either editable lane", () => {
    for (const over of [
      {} as Partial<Order>, // place lane — the fixture's own status
      { status: "proceed_order", operationStage: "confirmed" } as Partial<Order>,
    ]) {
      const onClose = renderDrawer(orderWithAddons(over));
      // The row is still SHOWN and still carries its money — it is locked, not
      // hidden. A fee the customer owes must remain readable.
      expect(screen.getByText("150")).toBeTruthy();
      // ...and exactly one pencil exists, on the one service a human picked.
      expect(screen.getAllByTestId("pos-od-edit-addon")).toHaveLength(1);
      onClose();
      cleanup();
    }
  });

  it("proceed pencil hides while a change request is pending; delivered hides it too", () => {
    h.changeRequests = [
      {
        id: "cr-1",
        orderId: "00000000-0000-0000-0000-000000001201",
        kind: "replace_lines",
        payload: { targetLineIds: [], targetLines: [], line: {} },
        status: "pending",
        requestedAt: "2026-07-25T00:00:00Z",
        decisionNote: null,
      },
    ];
    renderDrawer(order({ status: "proceed_order", operationStage: "confirmed" }));
    expect(screen.queryByTestId("pos-od-edit-line")).toBeNull();
    expect(screen.getByTestId("pos-od-change-pending")).toBeTruthy();
    h.changeRequests = [];
    renderDrawer(order({ status: "delivered", paid: 3000 }));
    expect(screen.queryByTestId("pos-od-edit-line")).toBeNull();
  });

  it("free / bundle rows carry no pencil even in the place lane", () => {
    const base = order();
    renderDrawer(
      order({
        lines: [
          { ...base.lines![0]!, attrs: { free_gift: true } },
        ],
      }),
    );
    expect(screen.queryByTestId("pos-od-edit-line")).toBeNull();
  });

  // 0275 — a rental line is a mattress MODEL priced at zero, so it reached the
  // outright configurator and its Save would have replaced a signed
  // agreement's fulfilment line with a retail mattress. No pencil until a
  // rental-amendment route exists.
  it("a persisted RENTAL row carries no pencil", () => {
    const base = order();
    renderDrawer(
      order({
        lines: [
          {
            ...base.lines![0]!,
            unitPrice: 0,
            attrs: {
              rental: {
                agreementId: "aaaaaaaa-aaaa-4aaa-8aaa-0000000000r1",
                planId: "bbbbbbbb-bbbb-4bbb-8bbb-0000000000p1",
                termMonths: 84,
                monthlyFee: 69,
              },
            },
          },
        ],
      }),
    );
    expect(screen.queryByTestId("pos-od-edit-line")).toBeNull();
  });

  it("an UP-priced re-configure calls the replace mutation with the target id", async () => {
    renderDrawer(order());
    fireEvent.click(screen.getByTestId("pos-od-edit-line"));
    fireEvent.click(screen.getByTestId("stub-emit-up"));
    await waitFor(() =>
      expect(h.replaceMutateAsync).toHaveBeenCalledWith({
        targetLineIds: ["00000000-0000-0000-0000-00000000l001"],
        line: { sku: "SKU-1", qty: 1, attrs: { gap: "None" } },
      }),
    );
    // Surface closes on success.
    expect(screen.queryByTestId("pos-od-edit-surface")).toBeNull();
  });

  it("a DOWN-priced re-configure is blocked client-side (up-sell only) — no request", async () => {
    renderDrawer(order());
    fireEvent.click(screen.getByTestId("pos-od-edit-line"));
    fireEvent.click(screen.getByTestId("stub-emit-down"));
    await waitFor(() => expect(screen.getByTestId("pos-od-items-err")).toBeTruthy());
    expect(screen.getByTestId("pos-od-items-err").textContent).toContain(
      "edits can only upgrade the order",
    );
    expect(h.replaceMutateAsync).not.toHaveBeenCalled();
  });
});

// The drawer's Escape listener sits on `document`; the configure surfaces put
// theirs on `window`, which is the LAST node in the propagation path — so the
// drawer's fires FIRST and used to take the whole order down mid-configure.
// The parent stands down instead.
describe("Escape gating", () => {
  it("closes the drawer when nothing is layered over it", () => {
    const onClose = renderDrawer(order());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT close the drawer while the configure surface is up", () => {
    const onClose = renderDrawer(order());
    fireEvent.click(screen.getByTestId("pos-od-edit-line"));
    expect(screen.getByTestId("stub-configure-page")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId("pos-od-edit-surface")).toBeTruthy();
  });

  it("re-arms once the surface closes", async () => {
    const onClose = renderDrawer(order());
    fireEvent.click(screen.getByTestId("pos-od-edit-line"));
    fireEvent.click(screen.getByTestId("stub-emit-up"));
    await waitFor(() => expect(screen.queryByTestId("pos-od-edit-surface")).toBeNull());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
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

describe("item description (Loo 2026-07-25 — one line, no point form)", () => {
  it("renders variant + gap + option picks + specials as ONE muted line", () => {
    renderDrawer(
      order({
        lines: [
          {
            id: "00000000-0000-0000-0000-00000000l001",
            orderId: "00000000-0000-0000-0000-000000001201",
            sku: "SKU-1",
            qty: 1,
            attrs: {
              gap: '12"',
              options: [
                { kind: "divan_height", value: '8"', surcharge: 0 },
                { kind: "bedframe_leg_height", value: '2"', surcharge: 0 },
              ],
              specials: [{ code: "USB", soDescription: "USB port", surcharge: 50 }],
            },
            unitPrice: 1500,
          },
        ],
      }),
    );
    // ONE line: variant · gap · options · specials — no per-item RM, no SKU
    // code row, no "+"-prefixed sub-rows.
    expect(screen.getByText('King · gap 12" · Divan 8" · Leg 2" · USB port')).toBeTruthy();
    expect(screen.queryByTestId("specials-summary")).toBeNull();
    expect(screen.queryByText("SKU-1")).toBeNull();
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

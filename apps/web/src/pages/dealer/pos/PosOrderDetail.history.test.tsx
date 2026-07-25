/**
 * PosOrderDetail — the internal-role History timeline (2026-07-19, BD portal):
 * order_history renders for principal/operation/finance/bd viewers only;
 * store logins keep the drawer exactly as before.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { CatalogResponse, Order } from "@carres/shared";
import PosOrderDetail from "./PosOrderDetail";

const h = vi.hoisted(() => ({
  order: null as unknown as Order,
  role: null as string | null,
}));

vi.mock("@/lib/queries", () => ({
  useOrder: () => ({ data: h.order, isLoading: false }),
  useCatalog: () => ({ data: CATALOG }),
  useUpdateOrder: () => ({ mutateAsync: vi.fn(async () => ({})), isPending: false }),
  useTopUpOrder: () => ({ mutateAsync: vi.fn(async () => ({})), isPending: false }),
  useProceedOrder: () => ({ mutateAsync: vi.fn(async () => ({})), isPending: false }),
  useUnproceedOrder: () => ({ mutateAsync: vi.fn(async () => ({})), isPending: false }),
  useAddOrderLines: () => ({ mutateAsync: vi.fn(async () => ({})), isPending: false }),
  useReplaceOrderLines: () => ({ mutateAsync: vi.fn(async () => ({})), isPending: false }),
  useOrderChangeRequests: () => ({ data: { requests: [] }, isLoading: false }),
  useSubmitOrderChangeRequest: () => ({ mutateAsync: vi.fn(async () => ({})), isPending: false }),
  useCancelOrderChangeRequest: () => ({ mutateAsync: vi.fn(async () => ({})), isPending: false }),
  useUpdateOrderChangeRequest: () => ({ mutateAsync: vi.fn(async () => ({})), isPending: false }),
}));
vi.mock("@/lib/storage", () => ({
  newWizardSessionId: () => "sess-1",
  uploadAttachment: vi.fn(async () => "x.jpg"),
}));
vi.mock("@/lib/auth", () => ({
  useAuth: (sel: (s: { role: string | null }) => unknown) => sel({ role: h.role }),
}));
// DownloadSalesOrderButton (footer) rides in @/lib/pdf/render — keep
// @react-pdf/renderer out of the jsdom graph (covered in its own test file).
vi.mock("@/lib/pdf/render", () => ({
  renderSalesOrderPdf: vi.fn(),
}));

const CATALOG = {
  models: [],
  skus: [],
  sofaFabrics: [],
  addons: [],
  floorConfig: { id: 1, freeUpToFloor: 3, perFloorPerItem: 20 },
} as unknown as CatalogResponse;

function order(over: Partial<Order> = {}): Order {
  return {
    id: "00000000-0000-0000-0000-000000001401",
    so: 1401,
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
      date: "2099-01-01",
      proceedDate: "2099-01-01",
      dateTbd: false,
      floor: 1,
      hasLift: true,
      stairItems: null,
    },
    paid: 1500,
    signatureUrl: null,
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
    lines: [],
    addons: [],
    history: [
      {
        id: "h-1",
        orderId: "00000000-0000-0000-0000-000000001401",
        text: "Order placed",
        byRole: "dealer",
        occurredAt: "2026-07-18T02:00:00Z",
      },
      {
        id: "h-2",
        orderId: "00000000-0000-0000-0000-000000001401",
        text: "Top-up recorded · RM 500",
        byRole: "bd",
        occurredAt: "2026-07-19T05:00:00Z",
      },
    ],
    ...over,
  } as Order;
}

function renderAs(role: string | null, o: Order = order()) {
  h.role = role;
  h.order = o;
  render(<PosOrderDetail id={o.id} staffName="Aisyah" onClose={vi.fn()} />);
}

describe("PosOrderDetail history timeline", () => {
  it("renders for a BD viewer, newest event first", () => {
    renderAs("bd");
    const section = screen.getByTestId("pos-od-history");
    expect(within(section).getByText("Top-up recorded · RM 500")).toBeTruthy();
    const texts = section.textContent ?? "";
    expect(texts.indexOf("Top-up recorded")).toBeLessThan(texts.indexOf("Order placed"));
  });

  it("renders for principal / operation / finance viewers too", () => {
    for (const role of ["principal", "operation", "finance"]) {
      h.role = role;
      h.order = order();
      const { unmount } = render(
        <PosOrderDetail id={h.order.id} staffName={null} onClose={vi.fn()} />,
      );
      expect(screen.getByTestId("pos-od-history")).toBeTruthy();
      unmount();
    }
  });

  it("hidden for store logins (dealer role)", () => {
    renderAs("dealer");
    expect(screen.queryByTestId("pos-od-history")).toBeNull();
  });

  it("hidden when the order carries no history rows", () => {
    renderAs("bd", order({ history: [] }));
    expect(screen.queryByTestId("pos-od-history")).toBeNull();
  });
});

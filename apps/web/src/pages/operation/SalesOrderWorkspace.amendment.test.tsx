import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const query = { data: undefined, isLoading: false, isError: false, dataUpdatedAt: 1, refetch: vi.fn() };
  const order = {
    id: "o1", so: 1297, status: "confirmed", customer_name: "Kimi",
    customer_phone: "01923847324", customer_email: "kimi@gmail.com",
    customer_race: "Chinese", customer_gender: "Female", customer_birthday: "1990-01-15",
    customer_address_unknown: true, customer_billing_same: true,
    proceed_date: "2026-08-06", delivery_date: null, delivery_stair_items: 0,
    placed_at: "2026-08-06", entry_data: { fields: {} }, paid: 0,
  };
  return { query, order, detail: { ...query, data: { order, lines: [], addons: [], pos: [] } },
    mutate: vi.fn(), info: vi.fn() };
});

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...await importOriginal<typeof import("@tanstack/react-query")>(), useQuery: () => mocks.query,
}));
vi.mock("@/lib/queries", () => ({
  useOperationOrder: () => mocks.detail,
  useCatalog: () => mocks.query,
  useCreateSalesOrder: () => ({ mutate: mocks.mutate }),
  useCustomerTypeProbe: () => mocks.query,
  useOperationDealersRef: () => mocks.query,
  useWorkspaceDuties: () => mocks.query,
  useOrderEntryConfig: () => ({ ...mocks.query, data: { entryConfig: { formFields: {
    emergency: { builtins: { emergency: { required: false } } },
    customer: { builtins: { race: { required: false } } },
  } } } }),
  useOrderCorrectionWork: () => mocks.query,
  useOrderServiceCases: () => mocks.query,
  useOutlets: () => mocks.query,
  useSalesOrderAmendment: () => mocks.query,
  useSalesOrderRevisions: () => mocks.query,
  useSalesOrderExpansion: () => mocks.query,
  useSalesOrderRouteFacts: () => mocks.query,
  useSalespersons: () => mocks.query,
}));
vi.mock("sonner", () => ({ toast: { info: mocks.info } }));
vi.mock("./components/SalesOrderPaymentLedger", () => ({ default: () => null }));
vi.mock("./SalesOrderAddons", () => ({ default: () => null, ServiceRowActions: () => null }));
vi.mock("./SalesOrderAttribution", () => ({ default: () => null, useCanChangeSalesOwnership: () => false }));
vi.mock("./SalesOrderAmendment", () => ({ default: () => null }));
vi.mock("./SalesOrderAmendDeliveryDate", () => ({ default: () => null }));
vi.mock("./CancelSalesOrderDialog", () => ({ default: () => null }));
vi.mock("./SalesOrderLedger", () => ({ default: () => null }));
vi.mock("./CorrectionWorkList", () => ({ default: () => null }));
vi.mock("./SalesOrderTabs", () => ({ default: ({ right, navigation }: { right: ReactNode; navigation: ReactNode }) => <header>{right}{navigation}</header> }));

import SalesOrderWorkspace from "./SalesOrderWorkspace";

function openOrder() {
  return render(<MemoryRouter initialEntries={["/operation/orders/so/o1"]}>
    <Routes><Route path="/operation/orders/so/:orderId" element={<SalesOrderWorkspace />} /></Routes>
  </MemoryRouter>);
}

beforeEach(() => vi.clearAllMocks());

describe("amendment validation on the Sales Order page", () => {
  it("shows existing required markers in Edit, blocks blank input inline, and clears errors and changes on Cancel", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const original = structuredClone(mocks.order);
    const { container } = openOrder();
    expect(container.querySelector('label .text-kit-red-11')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(container.querySelector('label[for="so-name"] .text-kit-red-11')).not.toBeNull();
    expect(container.querySelector('label[for="so-phone"] .text-kit-red-11')).not.toBeNull();
    expect(container.querySelector('label[for="so-race"] .text-kit-red-11')).toBeNull();
    expect(container.querySelector('label[for="so-line2"] .text-kit-red-11')).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: /Full name/ }), { target: { value: "  " } });
    fireEvent.click(screen.getByRole("button", { name: "Submit Amendment" }));
    expect(screen.getByRole("alert").textContent).toBe("Customer name is required");
    expect(mocks.info).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalledWith("Amendment Submitted");
    expect(mocks.mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("textbox", { name: "Full name" }).textContent).toBe("Kimi");
    expect(container.querySelector('label .text-kit-red-11')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(mocks.order).toEqual(original);
    log.mockRestore();
  });

  it("keeps valid submission UI-only and leaves the approved order unchanged", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const original = structuredClone(mocks.order);
    openOrder();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox", { name: /Full name/ }), { target: { value: "Kimi Tan" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit Amendment" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(log).toHaveBeenCalledWith("Amendment Submitted");
    expect(mocks.info).toHaveBeenCalledWith("Amendment approval workflow is not configured yet.");
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(mocks.order).toEqual(original);
    log.mockRestore();
  });
});

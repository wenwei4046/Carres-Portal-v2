import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { PurchaseRequestContext } from "@carres/shared";
vi.mock("@/lib/api", async original => ({ ...(await original<typeof import("@/lib/api")>()), apiFetch: vi.fn() }));
vi.mock("../SalesOrderTabs", () => ({ default: () => <div>TEST object header</div> }));
import { apiFetch } from "@/lib/api";
import { ManualPurchaseObject } from "../OperationManualPurchase";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const context = (): PurchaseRequestContext => ({ version: 1, origin: "manual", purpose: "general_purchase", proceedDate: "2026-10-18", stockDeliveryDate: null, serviceCaseId: null,
  reason: "company_use", companyPersonName: "", projectReference: "", explanation: "", forecastChangeReason: "",
  recipients: [1,2].map(n => ({ id: uuid(n), name: `TEST recipient ${n}`, company: "TEST", phone: "TEST", method: "self_pickup", deliveryDate: "2026-12-01",
    addressLine1: "", addressLine2: "", city: "", state: "", postcode: "", buildingType: "", floor: "", lift: null, pickupLocationId: uuid(3), collectedBy: "TEST" })),
  lines: [{ id: uuid(4), sku: "TEST-SKU", qty: 5, attrs: null, recipientNeeds: [{ recipientId: uuid(1), qty: 3 }, { recipientId: uuid(2), qty: 2 }], stockProposals: [],
    allocations: [{ id: uuid(5), destinationId: uuid(3), supplierDeliveryDate: "2026-11-20", qty: 5, recipients: [{ recipientId: uuid(1), qty: 3 }, { recipientId: uuid(2), qty: 2 }] }] }] });
let accepted: { contextReview: { approvedDistribution: Array<{ qty: number }>; context: PurchaseRequestContext; reviewScope: unknown } } | null;
let offerStock = false;
const scope = () => ({ request_version: 1, state: { context: context(), TEST_source: "exact" }, stock_source: [], stock_offers: offerStock ? [{ lineId: uuid(4), locationId: uuid(20), destinationId: uuid(3), name: "TEST stock", available: 2, units: [21,22].map(n => ({ id: uuid(n), qty: 1 as const, warehouse_id: uuid(20), condition: "new" })) }] : [] });
beforeEach(() => {
  offerStock = false; accepted = null; vi.mocked(apiFetch).mockClear();
  vi.mocked(apiFetch).mockImplementation((async (path: string, init?: RequestInit) => {
    if (path.includes("/demand/pick-items")) return { items: [{ sku: "TEST-SKU", label: "TEST goods", supplier: "TEST supplier", free: 0 }] };
    if (path.includes("/already-have")) return { sku: "TEST-SKU", alreadyOnPo: 0, firstPo: null };
    if (path.endsWith("/context-review")) return { available: true, review: scope(), events: [], coverage: accepted ? [] : null,
      approval: accepted ? { request_version: 1, approval_version: 1, token: "a".repeat(32) } : null };
    if (path.endsWith("/decide")) { accepted = JSON.parse(String(init?.body)); return { id: uuid(10), decision: "approve" }; }
    if (path.includes("/requests/detail/")) return {
      request: { id: uuid(10), req_no: "TEST-GP", purpose: "general_purchase", destination_id: uuid(3), required_by: "2026-12-01", why: "", approval_required: true,
        approved_at: accepted ? "2026-10-18T00:00:00Z" : null, approved_by: accepted ? uuid(99) : null, refused_at: null, refused_by: null, refuse_reason: null,
        created_by: uuid(98), created_at: "2026-10-17T00:00:00Z", for_service_case_id: null, for_staff_user_id: null, for_subsidiary_name: null,
        fulfilment_intent: "concrete_need", request_context: context(), request_version: 1, proceed_date: "2026-10-18" },
      serviceCaseNo: null, requested_by_name: "TEST requester", requested_by_user_id: uuid(98), canWithdraw: false, canEditAndSendAgain: false,
      lines: [{ id: uuid(6), request_id: uuid(10), sku: "TEST-SKU", supplier_id: uuid(7), destination_id: uuid(3), qty: 5,
        approved_qty: accepted ? 4 : null, issued_qty: 0, remaining_qty: accepted ? 4 : 5, required_by: "2026-11-20", remark: null, attrs: null, po_id: null, cancelled_at: null, cancel_reason: null, received: false }],
      pos: [], history: accepted ? [{ kind: "approved", occurred_at: "2026-10-18T00:00:00Z", actor: "TEST approver", actor_role: "Principal", requested_units: 5, approved_units: 4 }] : [],
      destinations: [{ id: uuid(3), name: "TEST destination" }], suppliers: [{ id: uuid(7), name: "TEST supplier" }], users: [], approvers: [{ id: uuid(99), name: "TEST approver" }],
      canApprove: false, context_can_approve: true, todayIso: "2026-10-18",
    };
    throw new Error(`Unexpected TEST read ${path}`);
  }) as never);
});
function mount(enabled: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><ManualPurchaseObject key={uuid(10)} id={uuid(10)} contextFlow={enabled}
    registerHeading={null} position={null} onStep={vi.fn()} onBack={vi.fn()} onEditAndSendAgain={vi.fn()} /></MemoryRouter></QueryClientProvider>);
}
describe("same object guarded context approval", () => {
  it("requires an explicit recipient cut and sends the exact current scope while retaining full need5", async () => {
    mount(true);
    const approved = await screen.findByLabelText("Approved Qty");
    const approve = screen.getByTestId("mp-approve");
    expect(screen.getByTestId("mp-detail-proceed-date")).toHaveTextContent("18 Oct");
    expect(screen.getByTestId("mp-full-requested-need")).toHaveTextContent("5");
    await waitFor(() => expect(approve).not.toBeDisabled());
    fireEvent.change(approved, { target: { value: "4" } });
    expect(approve).toBeDisabled();
    expect(screen.getByLabelText("TEST recipient 2")).toHaveValue(2);
    fireEvent.change(screen.getByLabelText("TEST recipient 2"), { target: { value: "1" } });
    expect(approve).not.toBeDisabled(); fireEvent.click(approve);
    await waitFor(() => expect(accepted).not.toBeNull());
    expect(accepted!.contextReview.context).toEqual(context());
    expect(accepted!.contextReview.reviewScope).toEqual(scope());
    expect(accepted!.contextReview.approvedDistribution).toEqual([{ lineId: uuid(4), allocationId: uuid(5), kind: "purchase", qty: 4,
      recipients: [{ recipientId: uuid(1), qty: 3 }, { recipientId: uuid(2), qty: 1 }] }]);
    await screen.findByTestId("mp-approval-record");
    expect(screen.getByTestId("mp-full-requested-need")).toHaveTextContent("5");
  });
  it("stages Jess Stock2/buy3 with a reason while locking original need and retaining exact Review", async () => {
    offerStock = true; mount(true);
    await screen.findByLabelText("Approved Qty");
    fireEvent.click(screen.getByRole("button", { name: "Change selection" }));
    const stock = screen.getByRole("region", { name: "Stock at TEST stock" });
    fireEvent.change(within(stock).getByLabelText("TEST stock · 2 available"), { target: { value: "2" } });
    fireEvent.change(within(stock).getByLabelText("TEST recipient 1"), { target: { value: "2" } });
    const supplier = screen.getByRole("region", { name: "Supplier delivery 1" });
    expect(within(supplier).getByRole("combobox", { name: /Supplier Deliver To/ })).toBeDisabled();
    fireEvent.change(within(supplier).getByLabelText("Qty"), { target: { value: "3" } });
    fireEvent.change(within(supplier).getByLabelText("TEST recipient 1"), { target: { value: "1" } });
    const approve = screen.getByTestId("mp-approve"); expect(approve).toBeDisabled();
    expect(screen.getAllByLabelText("TEST recipient 1").some(input => (input as HTMLInputElement).disabled && (input as HTMLInputElement).value === "3")).toBe(true);
    fireEvent.change(screen.getByLabelText(/Reason for change/), { target: { value: "TEST available stock choice" } });
    expect(approve).not.toBeDisabled(); fireEvent.click(approve);
    await waitFor(() => expect(accepted).not.toBeNull());
    expect(accepted!.contextReview.context.lines[0]).toMatchObject({ qty: 5, recipientNeeds: context().lines[0].recipientNeeds,
      stockProposals: [{ locationId: uuid(20), destinationId: uuid(3), qty: 2, recipients: [{ recipientId: uuid(1), qty: 2 }] }],
      allocations: [{ id: uuid(5), qty: 3, recipients: [{ recipientId: uuid(2), qty: 2 }, { recipientId: uuid(1), qty: 1 }] }] });
    expect(accepted!.contextReview.reviewScope).toEqual(scope());
  });
  it("leaves the normal object entry unactivated and never reads a modern review", async () => {
    mount(false); await screen.findByTestId("mp-object-items");
    expect(screen.queryByTestId("mp-approve")).toBeNull();
    expect(vi.mocked(apiFetch).mock.calls.some(([path]) => path.endsWith("/context-review"))).toBe(false);
  });
});

import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { PurchaseRequestContext } from "@carres/shared";
vi.mock("@/lib/api", async original => ({ ...(await original<typeof import("@/lib/api")>()), apiFetch: vi.fn() }));
vi.mock("../PurchasingTabs", () => ({ default: ({ right }: { right: React.ReactNode }) => <div>{right}</div> }));
vi.mock("../SalesOrderWorkspace", () => ({ Fact: ({ label, value }: { label: string; value: string }) => <div>{label}: {value}</div> }));
vi.mock("../ManualPurchasePdfPreview", () => ({ default: ({ drafts }: { drafts: unknown }) => <pre data-testid="paper-facts">{JSON.stringify(drafts)}</pre> }));
import { ApiError, apiFetch } from "@/lib/api";
import { CreateRequestWorkspace } from "../OperationManualPurchase";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const context = (): PurchaseRequestContext => ({ version: 1, origin: "stock_request", purpose: "ready_stock", proceedDate: "2026-10-18", stockDeliveryDate: "2026-12-01", serviceCaseId: null,
  reason: null, companyPersonName: "", projectReference: "", explanation: "", forecastChangeReason: "", recipients: [],
  lines: [{ id: uuid(1), sku: "TEST-SKU", qty: 500, attrs: null, recipientNeeds: [], stockProposals: [], allocations: [{ id: uuid(2), destinationId: uuid(3), supplierDeliveryDate: "2026-11-20", qty: 500, recipients: [] }] }] });
const submitted: unknown[] = [];
const done = vi.fn();
let refuse = false;
beforeEach(() => {
  submitted.length = 0; done.mockReset(); refuse = false;
  vi.mocked(apiFetch).mockImplementation((async (path: string, init?: RequestInit) => {
    if (path.includes("/demand/pick-items")) return { items: [{ sku: "TEST-SKU", label: "TEST goods", supplier: "TEST supplier", free: 0 }] };
    if (path.startsWith("/api/ops/service-cases")) return { items: [{ id: uuid(9), caseNo: "TEST-CASE" }] };
    if (path.startsWith("/api/catalog")) return { skus: [], models: [], sofaFabrics: [] };
    if (path.endsWith("/requests/plan")) return { proceedDate: "2026-10-18", recipientEarliest: "2026-11-17", recipientPlanUnavailable: false, planUnavailable: false,
      deliveryDateDefault: "2026-11-01", lines: [{ sku: "TEST-SKU", supplierId: uuid(4), supplierName: "TEST supplier", category: "sofa", productionDays: 7, arrival: "2026-11-01" }] };
    if (path.includes("/requests/detail/")) return { request: { created_at: "2026-10-17T00:00:00Z" } };
    if (path.endsWith("/resubmit") && init?.method === "POST") { submitted.push(JSON.parse(String(init.body))); return { id: uuid(5), req_no: "TEST-RS", request_version: 2, approval_required: true }; }
    if (path.endsWith("/purchasing/requests") && init?.method === "POST") {
      const body = JSON.parse(String(init.body)); submitted.push(body);
      if (refuse) throw new ApiError(409, "TEST conflict", { code: "request_source_busy" });
      return { id: uuid(5), req_no: "TEST-RS", approval_required: true };
    }
    throw new Error(`Unexpected TEST read ${path}`);
  }) as never);
});
function mount(initial = context(), editing = false) {
  function TestWorkspace() {
    const [value, onChange] = useState(initial);
    return <CreateRequestWorkspace editId={editing ? uuid(5) : null} destinations={[{ id: uuid(3), name: "TEST destination", address: "TEST address" }]} defaultDestinationId={null}
      supplierCollections={[]} suppliers={[{ name: "TEST supplier", address: "TEST supplier address" }]} staff={[]} minDeliveryDays={30} todayIso="2026-10-18" onDone={done}
      contextDraft={{ value, onChange, pickupLocations: [], stockByLine: new Map(), ...(editing ? { revision: { expectedVersion: 1, reason: "TEST revised same request" } } : {}) }} />;
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><TestWorkspace /></MemoryRouter></QueryClientProvider>);
}
describe("existing Workspace isolated context composition", () => {
  it("sends exact RS500 through the canonical context door without legacy flattening", async () => {
    mount();
    const send = screen.getByTestId("mp-send");
    await waitFor(() => expect(send).not.toBeDisabled());
    expect(screen.queryByLabelText("Use stock we already have?")).toBeNull();
    expect(screen.queryByText("Goods recipient")).toBeNull();
    expect(screen.getByTestId("paper-facts")).toHaveTextContent('"qty":500');
    fireEvent.click(send);
    await waitFor(() => expect(done).toHaveBeenCalledWith(uuid(5)));
    expect(submitted).toHaveLength(1);
    expect(submitted[0]).toEqual({ submissionKey: expect.any(String), context: context() });
  });
  it.each(["general_purchase", "service_case"] as const)("keeps %s recipients and source distinct from supplier papers", async purpose => {
    const initial = context(); initial.purpose = purpose; initial.origin = "manual"; initial.stockDeliveryDate = null;
    initial.reason = purpose === "general_purchase" ? "company_use" : null;
    initial.serviceCaseId = purpose === "service_case" ? uuid(9) : null;
    initial.recipients = [{ id: uuid(6), name: "PRIVATE TEST NAME", company: "TEST", phone: "PRIVATE TEST PHONE", method: "self_pickup", deliveryDate: "2026-12-01",
      addressLine1: "", addressLine2: "", city: "", state: "", postcode: "", buildingType: "", floor: "", lift: null, pickupLocationId: uuid(3), collectedBy: "TEST" }];
    initial.lines[0].recipientNeeds = [{ recipientId: uuid(6), qty: 500 }];
    initial.lines[0].allocations[0].recipients = [{ recipientId: uuid(6), qty: 500 }];
    mount(initial); const send = screen.getByTestId("mp-send");
    await waitFor(() => expect(send).not.toBeDisabled());
    expect(screen.getByRole("heading", { name: "Goods recipient" })).toBeInTheDocument();
    expect(screen.getByTestId("paper-facts")).not.toHaveTextContent("PRIVATE TEST");
    fireEvent.click(send); await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
    expect(submitted[0]).toEqual({ submissionKey: expect.any(String), context: initial });
  });
  it("revises the same request with exact expected version and no legacy payload", async () => {
    mount(context(), true); const send = screen.getByTestId("mp-send");
    await waitFor(() => expect(send).not.toBeDisabled()); fireEvent.click(send);
    await waitFor(() => expect(done).toHaveBeenCalledWith(uuid(5)));
    expect(submitted[0]).toEqual({ revisionKey: expect.any(String), expectedVersion: 1, reason: "TEST revised same request", context: context() });
  });
  it("does not silently resize allocations and asks before abandoning changed input", async () => {
    mount(); await waitFor(() => expect(screen.getByTestId("mp-send")).not.toBeDisabled());
    fireEvent.change(document.getElementById("mp-qty-0")!, { target: { value: "501" } });
    await waitFor(() => expect(screen.getByTestId("mp-send")).toBeDisabled());
    expect(screen.getByTestId("paper-facts")).toHaveTextContent('"qty":500');
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel" })[0]);
    const dialog = await screen.findByRole("dialog", { name: "Discard" });
    expect(done).not.toHaveBeenCalled(); expect(submitted).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(document.getElementById("mp-qty-0")).toHaveValue("501");
  });
  it("retains the whole scope and retry identity after a refused submit", async () => {
    refuse = true; mount();
    const send = screen.getByTestId("mp-send");
    await waitFor(() => expect(send).not.toBeDisabled()); fireEvent.click(send);
    await screen.findByRole("alert");
    expect(done).not.toHaveBeenCalled();
    expect(screen.getByTestId("paper-facts")).toHaveTextContent('"qty":500');
    refuse = false; fireEvent.click(send);
    await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
    expect(submitted).toHaveLength(2); expect(submitted[1]).toEqual(submitted[0]);
  });
});

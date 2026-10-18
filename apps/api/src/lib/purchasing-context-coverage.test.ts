import { describe, expect, it, vi } from "vitest";
import { stampRequestContextCoverage } from "./purchasing-context-coverage";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const context = { version: 1, origin: "stock_request", purpose: "ready_stock", proceedDate: "2026-10-18", stockDeliveryDate: "2026-12-01", serviceCaseId: null, reason: null, companyPersonName: "", projectReference: "", explanation: "", forecastChangeReason: "", recipients: [],
  lines: [{ id: id(1), sku: "TEST", qty: 500, attrs: null, recipientNeeds: [], stockProposals: [], allocations: [{ id: id(2), destinationId: id(3), supplierDeliveryDate: "2026-11-20", qty: 500, recipients: [] }] }] };
const request = { id: id(10), request_version: 2, approval_version: 2, approved_at: "TEST", request_context: context };
const line = { id: id(20), request_id: id(10), fulfilment_kind: "purchase", qty: 500, approved_qty: 500, issued_qty: 2, cancelled_at: null };
const source = () => ({ available: true, review: { request_version: 2, state: { context }, stock_source: [] }, events: [], approval: { request_version: 2, approval_version: 2, token: "a".repeat(32) }, coverage: [{ demand_id: id(20), kind: "purchase", approved_qty: 500, issued_qty: 2, stock_qty: 0, to_buy: 498 }] });
describe("owning request coverage projection", () => {
  it("carries exact SQL residual instead of reconstructing a new approval", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: source(), error: null });
    const rows = await stampRequestContextCoverage({ rpc } as never,[request],[line]);
    expect(rows).toEqual([{ ...line, context_read_available: true, context_admission_current: true, context_to_buy: 498, context_stock_qty: 0 }]);
    expect(rpc).toHaveBeenCalledWith("purchasing_request_context_review", { p_id: request.id });
  });
  it.each(["version","missing","kind","counter","error"])("keeps %s source drift unknown without a false zero", async drift => {
    const data = source();
    if (drift === "version") data.approval.approval_version = 1;
    if (drift === "missing") data.coverage = [];
    if (drift === "kind") data.coverage[0]!.kind = "stock_proposal";
    if (drift === "counter") data.coverage[0]!.issued_qty = 1;
    const rpc = vi.fn().mockResolvedValue({ data, error: drift === "error" ? { message: "TEST unavailable" } : null });
    expect(await stampRequestContextCoverage({ rpc } as never,[request],[line])).toEqual([{ ...line, context_read_available: false }]);
  });
  it("retains factual committed RS coverage while new MPR admission is explicitly stale", async () => {
    const data = source();
    const rpc = vi.fn().mockResolvedValue({ data: { available: false, reason: "forecast_source_changed", request_version: 2, request_context: context, events: [], committed_coverage: data.coverage }, error: null });
    expect(await stampRequestContextCoverage({ rpc } as never,[request],[line])).toEqual([{ ...line, context_read_available: true, context_admission_current: false, context_to_buy: 498, context_stock_qty: 0 }]);
  });
  it("preserves legacy without a new RPC and does not require approval proof for a pending request", async () => {
    const rpc = vi.fn();
    expect(await stampRequestContextCoverage({ rpc } as never,[{ id: id(10) }],[line])).toEqual([line]);
    expect(await stampRequestContextCoverage({ rpc } as never,[{ ...request, approved_at: null }],[line])).toEqual([{ ...line, context_read_available: false }]);
    expect(rpc).not.toHaveBeenCalled();
  });
});

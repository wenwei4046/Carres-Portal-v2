import { describe, expect, it } from "vitest";
import type { ManualPurchaseRegisterPayload } from "@/lib/queries";
import { buildRows } from "../OperationManualPurchase";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
function facts() {
  const recipients = [{ id: id(1), name: "TEST recipient", company: "", phone: "TEST", method: "self_pickup", deliveryDate: "2026-12-01", addressLine1: "", addressLine2: "", city: "", state: "", postcode: "", buildingType: "", floor: "", lift: null, pickupLocationId: id(3), collectedBy: "TEST" }];
  const context = { version: 1, origin: "manual", purpose: "general_purchase", proceedDate: "2026-10-18", stockDeliveryDate: null, serviceCaseId: null, reason: "company_use", companyPersonName: "", projectReference: "", explanation: "", forecastChangeReason: "", recipients,
    lines: [{ id: id(4), sku: "TEST", qty: 5, attrs: null, recipientNeeds: [{ recipientId: id(1), qty: 5 }],
      stockProposals: [{ id: id(5), locationId: id(20), destinationId: id(3), qty: 2, recipients: [{ recipientId: id(1), qty: 2 }] }],
      allocations: [{ id: id(6), destinationId: id(3), supplierDeliveryDate: "2026-11-20", qty: 3, recipients: [{ recipientId: id(1), qty: 3 }] }] }] };
  const common = { request_id: id(10), sku: "TEST", supplier_id: id(7), destination_id: id(3), cancelled_at: null, issued_qty: 0, po_id: null, po_ids: [], allocations: [], context_read_available: true, required_by: "2026-11-20", item_label: "TEST goods", category: "mattress" };
  return { requests: [{ id: id(10), req_no: "GP261018-9001", purpose: "general_purchase", request_context: context, request_version: 2, approval_version: 2, proceed_date: "2026-10-18", created_at: "2026-10-17T00:00:00Z", approved_at: "2026-10-18T00:00:00Z", refused_at: null, destination_id: id(3), required_by: "2026-12-01" }],
    lines: [{ ...common, id: id(21), fulfilment_kind: "stock_proposal", qty: 2, approved_qty: 2, context_to_buy: 0 }, { ...common, id: id(22), fulfilment_kind: "purchase", qty: 3, approved_qty: 3, context_to_buy: 3 }],
    destinations: [{ id: id(3), name: "TEST Klang" }], suppliers: [{ id: id(7), name: "TEST supplier" }], users: [], serviceCases: [], pos: [], linesUnavailable: false };
}
const rows = (data: ReturnType<typeof facts>) => buildRows(data as unknown as ManualPurchaseRegisterPayload);
describe("new request register uses owning coverage", () => {
  it("prints actual GP identity/selected Proceed Date and buys3 without treating Stock2 as PO demand", () => {
    const data = facts(); const row = rows(data)[0]!;
    expect(row).toMatchObject({ mprNo: "GP261018-9001", purposeLabel: "General Purchase", proceedDate: "2026-10-18", forText: "Company use", remainderKnown: true, remainingQty: 3, group: "to-buy" });
    expect(row.issueWalls).toHaveLength(1); expect(row.issueWalls[0]).toMatchObject({ demandId: id(22), remainingQty: 3 });
    expect(row.goods.find(good => good.demandId === id(21))?.qty).toBe(2);
    expect(data.requests[0].request_context.lines[0].qty).toBe(5);
  });
  it("cannot turn an unread contextual source into No PO needed", () => {
    const data = facts(); data.lines[0].context_read_available = false;
    expect(rows(data)[0]).toMatchObject({ remainderKnown: false, group: "to-buy" });
  });
});

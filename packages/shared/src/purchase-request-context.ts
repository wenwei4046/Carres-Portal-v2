import { z } from "zod";
import { expectedArrivalOf, type PurchasingSettings } from "./purchasing-settings";

/** Purchasing MASTER §5.2, owner15–17Oct. Selection is a proposal, not a stock reservation. */
export const PURCHASE_REQUEST_REASONS = [
  { value: "company_use", label: "Company use" },
  { value: "staff_purchase", label: "Staff purchase" },
  { value: "purchase_for_others", label: "Purchase for others" },
  { value: "other", label: "Other" },
] as const;
const text = z.string().trim().min(1);
const quantity = z.number().int().positive();
const date = z.string().date();
const recipientSchema = z.object({
  id: z.string().uuid(),
  company: z.string().trim(),
  name: text,
  phone: text,
  method: z.enum(["delivery", "self_pickup"]),
  deliveryDate: date,
  addressLine1: z.string().trim(),
  addressLine2: z.string().trim(),
  city: z.string().trim(),
  state: z.string().trim(),
  postcode: z.string().trim(),
  buildingType: z.string().trim(),
  // Actual floor text: G, LG, UG, M, 12A and higher floors are all valid.
  floor: z.string().trim(),
  lift: z.enum(["has_lift", "no_lift"]).nullable(),
  pickupLocationId: z.string().uuid().nullable(),
  collectedBy: z.string().trim(),
}).strict().superRefine((recipient, ctx) => {
  if (recipient.method === "delivery") {
    for (const field of ["addressLine1", "addressLine2", "city", "state", "postcode", "buildingType", "floor"] as const) {
      if (!recipient[field]) ctx.addIssue({ code: "custom", path: [field], message: "Required" });
    }
    if (!recipient.lift) ctx.addIssue({ code: "custom", path: ["lift"], message: "Required" });
  } else {
    if (!recipient.pickupLocationId) ctx.addIssue({ code: "custom", path: ["pickupLocationId"], message: "Required" });
    if (!recipient.collectedBy) ctx.addIssue({ code: "custom", path: ["collectedBy"], message: "Required" });
  }
});
const recipientAllocationSchema = z.object({ recipientId: z.string().uuid(), qty: quantity }).strict();
const allocationSchema = z.object({
  id: z.string().uuid(),
  destinationId: z.string().uuid(),
  supplierDeliveryDate: date,
  qty: quantity,
  recipients: z.array(recipientAllocationSchema),
}).strict();
const lineSchema = z.object({
  id: z.string().uuid(),
  sku: text,
  qty: quantity,
  attrs: z.record(z.unknown()).nullable(),
  recipientNeeds: z.array(recipientAllocationSchema),
  stockProposals: z.array(z.object({ id: z.string().uuid(), locationId: z.string().uuid(), destinationId: z.string().uuid(), qty: quantity, recipients: z.array(recipientAllocationSchema) }).strict()),
  allocations: z.array(allocationSchema),
}).strict();

/** Same payload for SC/GP, a forecast suggestion and a manual RS ask. */
export const purchaseRequestContextSchema = z.object({
  version: z.literal(1),
  origin: z.enum(["manual", "forecast_suggestion", "stock_request"]),
  purpose: z.enum(["service_case", "general_purchase", "ready_stock"]),
  proceedDate: date,
  // RS need date is distinct from each supplier allocation's production date.
  stockDeliveryDate: date.nullable(),
  serviceCaseId: z.string().uuid().nullable(),
  reason: z.enum(["company_use", "staff_purchase", "purchase_for_others", "other"]).nullable(),
  companyPersonName: z.string().trim(),
  projectReference: z.string().trim(),
  explanation: z.string().trim(),
  forecastChangeReason: z.string().trim(),
  recipients: z.array(recipientSchema),
  lines: z.array(lineSchema).min(1),
}).strict().superRefine((request, ctx) => {
  const issue = (path: Array<string | number>, message: string) => ctx.addIssue({ code: "custom", path, message });
  const rs = request.purpose === "ready_stock";
  if (rs && !request.stockDeliveryDate) issue(["stockDeliveryDate"], "Choose the Delivery Date");
  if (!rs && request.stockDeliveryDate !== null) issue(["stockDeliveryDate"], "Recipient dates belong to their recipients");
  if (rs && request.origin === "manual") issue(["origin"], "Stock requests start in Forecast Purchase");
  if (!rs && request.origin !== "manual") issue(["origin"], "This entry creates stock requests");
  if (rs && request.recipients.length) issue(["recipients"], "Stock requests have no final recipient");
  if (!rs && !request.recipients.length) issue(["recipients"], "Add a recipient");
  if (request.purpose === "service_case") {
    if (!request.serviceCaseId) issue(["serviceCaseId"], "Choose the Service Case");
  } else if (request.serviceCaseId) issue(["serviceCaseId"], "This request has no Service Case");
  if (request.purpose === "general_purchase") {
    if (!request.reason) issue(["reason"], "Choose the reason for purchase");
    if (request.reason === "purchase_for_others" && !request.companyPersonName) issue(["companyPersonName"], "Name the company or person");
    if (request.reason === "other" && !request.explanation) issue(["explanation"], "Explain the purchase");
  } else if (request.reason || request.companyPersonName || request.projectReference || request.explanation) issue(["reason"], "This purpose has no purchase reason");
  const recipientIds = new Set<string>();
  request.recipients.forEach((recipient, i) => {
    if (recipientIds.has(recipient.id)) issue(["recipients", i, "id"], "Duplicate recipient");
    recipientIds.add(recipient.id);
  });
  const lineIds = new Set<string>();
  const allocationIds = new Set<string>();
  request.lines.forEach((line, i) => {
    if (lineIds.has(line.id)) issue(["lines", i, "id"], "Duplicate item line");
    lineIds.add(line.id);
    const fromStock = line.stockProposals.reduce((sum, stock) => sum + stock.qty, 0);
    if (rs && fromStock) issue(["lines", i, "stockProposals"], "Stock requests buy additional stock");
    if (fromStock > line.qty) issue(["lines", i, "stockProposals"], "Stock exceeds the requested quantity");
    const need = new Map<string, number>();
    line.recipientNeeds.forEach((recipient, j) => {
      if (!recipientIds.has(recipient.recipientId)) issue(["lines", i, "recipientNeeds", j], "Unknown recipient");
      if (need.has(recipient.recipientId)) issue(["lines", i, "recipientNeeds", j], "Duplicate recipient need");
      need.set(recipient.recipientId, recipient.qty);
    });
    if (rs && need.size) issue(["lines", i, "recipientNeeds"], "Stock requests have no final recipient");
    if (!rs && [...need.values()].reduce((sum, qty) => sum + qty, 0) !== line.qty) issue(["lines", i, "recipientNeeds"], "Allocate the entire requested quantity");
    const fulfilled = new Map<string, number>();
    const sites = new Set<string>();
    line.stockProposals.forEach((stock, j) => {
      if (allocationIds.has(stock.id)) issue(["lines", i, "stockProposals", j, "id"], "Duplicate allocation");
      allocationIds.add(stock.id);
      const siteKey = `${stock.locationId}|${stock.destinationId}`;
      if (sites.has(siteKey)) issue(["lines", i, "stockProposals", j], "Combine stock at the same location");
      sites.add(siteKey);
      if (stock.recipients.reduce((sum, recipient) => sum + recipient.qty, 0) !== stock.qty) issue(["lines", i, "stockProposals", j, "recipients"], "Allocate the stock quantity");
      const seen = new Set<string>();
      stock.recipients.forEach((recipient) => {
        if (!recipientIds.has(recipient.recipientId)) issue(["lines", i, "stockProposals", j, "recipients"], "Unknown recipient");
        if (seen.has(recipient.recipientId)) issue(["lines", i, "stockProposals", j, "recipients"], "Duplicate recipient allocation");
        seen.add(recipient.recipientId);
        fulfilled.set(recipient.recipientId, (fulfilled.get(recipient.recipientId) ?? 0) + recipient.qty);
      });
    });
    const toBuy = line.qty - fromStock;
    if (line.allocations.reduce((sum, allocation) => sum + allocation.qty, 0) !== toBuy) issue(["lines", i, "allocations"], "Allocate exactly the quantity to buy");
    line.allocations.forEach((allocation, j) => {
      if (allocationIds.has(allocation.id)) issue(["lines", i, "allocations", j, "id"], "Duplicate allocation");
      allocationIds.add(allocation.id);
      const path = ["lines", i, "allocations", j, "recipients"];
      if (rs && allocation.recipients.length) issue(path, "Stock requests have no final recipient");
      if (!rs && allocation.recipients.reduce((sum, recipient) => sum + recipient.qty, 0) !== allocation.qty) issue(path, "Allocate each purchased item to its recipient");
      const seen = new Set<string>();
      allocation.recipients.forEach((recipient, k) => {
        if (!recipientIds.has(recipient.recipientId)) issue([...path, k], "Unknown recipient");
        if (seen.has(recipient.recipientId)) issue([...path, k], "Duplicate recipient allocation");
        seen.add(recipient.recipientId);
        fulfilled.set(recipient.recipientId, (fulfilled.get(recipient.recipientId) ?? 0) + recipient.qty);
      });
    });
    need.forEach((qty, recipientId) => {
      if (fulfilled.get(recipientId) !== qty) issue(["lines", i, "recipientNeeds"], "Stock and purchase allocations must preserve each recipient quantity");
    });
    fulfilled.forEach((_qty, recipientId) => {
      if (!need.has(recipientId)) issue(["lines", i, "recipientNeeds"], "Allocation has no matching recipient need");
    });
  });
});
const forecastSourceSchema = z.array(z.record(z.unknown())).min(1).optional();
function requireContextOriginSource(value: { context: z.infer<typeof purchaseRequestContextSchema>; forecastSource?: Array<Record<string, unknown>> }, ctx: z.RefinementCtx) {
  if (value.context.origin === "forecast_suggestion" && !value.forecastSource?.length) ctx.addIssue({ code: "custom", path: ["forecastSource"], message: "Current forecast source required" });
  if (value.context.origin !== "forecast_suggestion" && value.forecastSource !== undefined) ctx.addIssue({ code: "custom", path: ["forecastSource"], message: "This request has no forecast suggestion source" });
}
export const purchaseRequestSubmitSchema = z.object({
  submissionKey: z.string().uuid(), context: purchaseRequestContextSchema, forecastSource: forecastSourceSchema,
}).strict().superRefine(requireContextOriginSource);
/** Same request identity; the SQL owner serialises revision/version and saves history. */
export const purchaseRequestRevisionSchema = z.object({
  revisionKey: z.string().uuid(), expectedVersion: z.number().int().min(1).max(2147483646),
  reason: z.string().trim().min(1), context: purchaseRequestContextSchema, forecastSource: forecastSourceSchema,
}).strict().superRefine(requireContextOriginSource);
export type PurchaseRequestSubmission = z.infer<typeof purchaseRequestSubmitSchema>;
export type PurchaseRequestRevision = z.infer<typeof purchaseRequestRevisionSchema>;
export type PurchaseRequestContext = z.infer<typeof purchaseRequestContextSchema>;

/** Read-time/API defence using the SAME supplier production planner as /plan.
 * The draft SQL also verifies sufficient working days against the same settings
 * and generated holiday source. This projection remains an API defence, not SQL proof.
 */
export function purchaseRequestSupplierDateIssues(
  context: PurchaseRequestContext,
  settings: Pick<PurchasingSettings, "productionDays" | "suppliers">,
  catalog: ReadonlyMap<string, { supplierId: string | null; category: string | null }>,
): Array<{ lineId: string; allocationId: string; code: "supplier_plan_unavailable" | "supplier_date_before_earliest"; earliest: string | null }> {
  const issues: ReturnType<typeof purchaseRequestSupplierDateIssues> = [];
  for (const line of context.lines) {
    if (!line.allocations.length) continue; // Stock proposal is not a new supplier buy.
    const source = catalog.get(line.sku);
    const earliest = expectedArrivalOf(settings, {
      supplierId: source?.supplierId, category: source?.category, fromIso: context.proceedDate,
    });
    for (const allocation of line.allocations) {
      if (earliest === null || allocation.supplierDeliveryDate < earliest) issues.push({
        lineId: line.id, allocationId: allocation.id,
        code: earliest === null ? "supplier_plan_unavailable" : "supplier_date_before_earliest", earliest,
      });
    }
  }
  return issues;
}

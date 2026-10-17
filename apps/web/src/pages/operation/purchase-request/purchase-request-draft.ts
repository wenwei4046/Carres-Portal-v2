import type { PurchaseRequestContext } from "@carres/shared";

export type RequestLine = PurchaseRequestContext["lines"][number];
export type RecipientQuantity = RequestLine["recipientNeeds"][number];

/** Controlled form state only. No stock reservation or automatic recipient reassignment. */
export function setRecipientQuantity(values: RecipientQuantity[], recipientId: string, qty: number): RecipientQuantity[] {
  const rest = values.filter((value) => value.recipientId !== recipientId);
  return qty > 0 ? [...rest, { recipientId, qty }] : rest;
}

export function recipientBalance(line: RequestLine, recipientId: string): number {
  const need = line.recipientNeeds.find((value) => value.recipientId === recipientId)?.qty ?? 0;
  const allocated = [...line.stockProposals, ...line.allocations]
    .flatMap((allocation) => allocation.recipients)
    .filter((recipient) => recipient.recipientId === recipientId)
    .reduce((sum, recipient) => sum + recipient.qty, 0);
  return need - allocated;
}

export function requestLineBalance(line: RequestLine) {
  const stock = line.stockProposals.reduce((sum, allocation) => sum + allocation.qty, 0);
  const buy = line.allocations.reduce((sum, allocation) => sum + allocation.qty, 0);
  return { stock, buy, left: line.qty - stock - buy };
}

/** Removing a recipient removes only their assignments. Other needs and item totals stay visible. */
export function removeRequestRecipient(context: PurchaseRequestContext, recipientId: string): PurchaseRequestContext {
  const without = (values: RecipientQuantity[]) => values.filter((value) => value.recipientId !== recipientId);
  return {
    ...context,
    recipients: context.recipients.filter((recipient) => recipient.id !== recipientId),
    lines: context.lines.map((line) => ({
      ...line,
      recipientNeeds: without(line.recipientNeeds),
      stockProposals: line.stockProposals.map((stock) => ({ ...stock, recipients: without(stock.recipients) })),
      allocations: line.allocations.map((allocation) => ({ ...allocation, recipients: without(allocation.recipients) })),
    })),
  };
}

/** Explicit transition: old purpose-specific facts cannot leak into the new submission. */
export function changeRequestPurpose(context: PurchaseRequestContext, purpose: PurchaseRequestContext["purpose"]): PurchaseRequestContext {
  if (purpose === context.purpose) return context;
  const stock = purpose === "ready_stock";
  return {
    ...context,
    purpose,
    origin: stock ? "stock_request" : "manual",
    serviceCaseId: null,
    stockDeliveryDate: null,
    reason: null,
    companyPersonName: "",
    projectReference: "",
    explanation: "",
    forecastChangeReason: "",
    recipients: stock ? [] : context.recipients,
    lines: context.lines.map((line) => ({
      ...line,
      recipientNeeds: stock ? [] : line.recipientNeeds,
      stockProposals: stock ? [] : line.stockProposals,
      allocations: line.allocations.map((allocation) => ({ ...allocation, recipients: stock ? [] : allocation.recipients })),
    })),
  };
}

/** Configuration equality matches physical PO-line identity, including empty attrs. */
export function requestAttrsKey(attrs: Record<string, unknown> | null): string {
  return JSON.stringify(attrs && Object.keys(attrs).length ? attrs : null,
    (_key, entry: unknown) => entry && typeof entry === "object" && !Array.isArray(entry)
      ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))) : entry);
}

/** The existing Catalog picker owns item identity/quantity. Preserve arrangements
 * for the same configured item; a different SKU/configuration must be allocated
 * again, never inherit the old item's Stock or supplier proposals. */
export function syncRequestDraftItems(context: PurchaseRequestContext, items: ReadonlyArray<{
  id: string; sku: string | null; qty: string; attrs: Record<string, unknown> | null;
}>): PurchaseRequestContext {
  return { ...context, lines: items.filter((item): item is typeof item & { sku: string } => item.sku != null).map(item => {
    const old = context.lines.find(line => line.id === item.id);
    const unchanged = old?.sku === item.sku && requestAttrsKey(old.attrs) === requestAttrsKey(item.attrs);
    return { id: item.id, sku: item.sku, qty: Number(item.qty), attrs: item.attrs,
      recipientNeeds: unchanged ? old.recipientNeeds : [], stockProposals: unchanged ? old.stockProposals : [],
      allocations: unchanged ? old.allocations : [] };
  }) };
}

export type ApprovalDistribution = NonNullable<NonNullable<import("@carres/shared").PurchaseRequestDecision["contextReview"]>["approvedDistribution"]>;
/** Seed editable review proposals from their exact allocation identities. This
 * is not a saved approval and never draws quantities from historical headers. */
export function proposalApprovalDistribution(context: PurchaseRequestContext): ApprovalDistribution {
  return context.lines.flatMap(line => [
    ...line.stockProposals.map(allocation => ({ lineId: line.id, allocationId: allocation.id, kind: "stock_proposal" as const, qty: allocation.qty, recipients: structuredClone(allocation.recipients) })),
    ...line.allocations.map(allocation => ({ lineId: line.id, allocationId: allocation.id, kind: "purchase" as const, qty: allocation.qty, recipients: structuredClone(allocation.recipients) })),
  ]);
}

export function approvalDistributionValid(context: PurchaseRequestContext, values: ApprovalDistribution): boolean {
  const proposed = proposalApprovalDistribution(context);
  if (!values.length || values.length !== proposed.length) return false;
  const keys = new Set<string>();
  for (const value of values) {
    const key = `${value.lineId}/${value.kind}/${value.allocationId}`;
    if (keys.has(key)) return false; keys.add(key);
    const source = proposed.find(p => p.lineId === value.lineId && p.kind === value.kind && p.allocationId === value.allocationId);
    if (!source || !Number.isInteger(value.qty) || value.qty < 0 || value.qty > source.qty) return false;
    if (context.purpose === "ready_stock") { if (value.recipients.length) return false; }
    else {
      const seen = new Set<string>(); let total = 0;
      for (const recipient of value.recipients) {
        const cap = source.recipients.find(r => r.recipientId === recipient.recipientId)?.qty;
        if (seen.has(recipient.recipientId) || cap == null || !Number.isInteger(recipient.qty) || recipient.qty <= 0 || recipient.qty > cap) return false;
        seen.add(recipient.recipientId); total += recipient.qty;
      }
      if (total !== value.qty) return false;
    }
  }
  return values.some(value => value.qty > 0);
}

import { purchaseRequestContextReviewReadSchema, purchaseRequestContextSchema, type PurchaseRequestContext, type PurchaseRequestContextReviewRead } from "@carres/shared";

export type ReadRequestContext =
  | { kind: "legacy" }
  | { kind: "unavailable" }
  | { kind: "context"; value: PurchaseRequestContext; requestVersion: number };

/** The existing detail read returns the saved request. Never turn an unread or
 * incompatible new scope into an empty legacy form, and never invent approval
 * coverage for a historical row. This adapter grants no editing/issue capability. */
export function readRequestContext(request: {
  purpose: string;
  request_context?: unknown;
  request_version?: number | null;
  proceed_date?: string | null;
}): ReadRequestContext {
  if (request.request_context == null) return request.request_version ? { kind: "unavailable" } : { kind: "legacy" };
  const parsed = purchaseRequestContextSchema.safeParse(request.request_context);
  if (!parsed.success || parsed.data.purpose !== request.purpose || parsed.data.proceedDate !== request.proceed_date
    || !Number.isInteger(request.request_version) || (request.request_version ?? 0) < 1) return { kind: "unavailable" };
  return { kind: "context", value: parsed.data, requestVersion: request.request_version! };
}

/** Separate saved need from fresh approval evidence. Legacy quantities and header
 * timestamps never become a modern allocation or approval token. No write grant. */
type AvailableReview = Extract<PurchaseRequestContextReviewRead, { available: true }>;

function orderedJson(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) => entry && typeof entry === "object" && !Array.isArray(entry)
    ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))) : entry);
}

export function readRequestApproval(
  saved: ReadRequestContext,
  input: unknown,
): { kind: "legacy" } | { kind: "unavailable" } | { kind: "pending"; review: AvailableReview }
  | { kind: "approved"; review: AvailableReview } {
  if (saved.kind !== "context") return { kind: saved.kind };
  const parsed = purchaseRequestContextReviewReadSchema.safeParse(input);
  if (!parsed.success || !parsed.data.available || parsed.data.review.request_version !== saved.requestVersion
    || orderedJson(parsed.data.review.state.context) !== orderedJson(saved.value)) return { kind: "unavailable" };
  return { kind: parsed.data.approval === null ? "pending" : "approved", review: parsed.data };
}

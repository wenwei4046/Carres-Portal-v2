import { purchaseRequestContextSchema, type PurchaseRequestContext } from "@carres/shared";

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

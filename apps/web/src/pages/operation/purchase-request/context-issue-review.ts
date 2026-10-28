import type { PurchaseRequestContext, PurchaseRequestIssue } from "@carres/shared";
import type { PurchaseRequestRow } from "@/lib/queries";
import type { ManualPurchaseIssueWall } from "../manual-purchase-review";
import { readRequestApproval, readRequestContext } from "./read-request-context";
export type ContextIssueLimit = { max: number; recipients: Array<{ recipientId: string; qty: number }>; context: PurchaseRequestContext };
/** Fresh owner proof and the exact selected source quantities. No browser
 * subtraction of historical recipient events and no synthetic approval token. */
export function prepareContextIssueReview(headers: PurchaseRequestRow[], reads: ReadonlyMap<string, unknown>, walls: ManualPurchaseIssueWall[], key: string): {
  payload: PurchaseRequestIssue; limits: Map<string, ContextIssueLimit>;
} {
  const proofs: NonNullable<PurchaseRequestIssue["contextIssue"]>["requests"] = [];
  const allocations: NonNullable<NonNullable<PurchaseRequestIssue["contextIssue"]>["allocations"]> = [];
  const limits = new Map<string, ContextIssueLimit>();
  for (const header of headers) {
    const saved = readRequestContext(header);
    if (saved.kind === "legacy") continue;
    const approval = readRequestApproval(saved, reads.get(header.id));
    if (saved.kind !== "context" || approval.kind !== "approved" || !approval.review.approval || !approval.review.coverage || header.approved_at == null || header.approval_version !== approval.review.approval.approval_version) throw new Error("Could not be loaded");
    if (approval.review.coverage.some(source => source.kind === "stock_proposal" && source.stock_qty !== source.approved_qty)) throw new Error("Save or cancel your stock selection before issuing a PO.");
    proofs.push({ id: header.id, requestVersion: approval.review.approval.request_version, approvalVersion: approval.review.approval.approval_version, approvalToken: approval.review.approval.token });
    const demandIds = new Set(approval.review.coverage.map(source => source.demand_id));
    for (const wall of walls.filter(wall => demandIds.has(wall.demandId))) {
      const source = approval.review.coverage.find(source => source.demand_id === wall.demandId)!;
      if (source.kind !== "purchase" || source.to_buy !== wall.remainingQty || source.to_buy < 1 || source.recipients == null) throw new Error("Could not be loaded");
      const recipients = structuredClone(source.recipients);
      limits.set(wall.demandId, { max: source.to_buy, recipients, context: saved.value });
      allocations.push({ demandId: wall.demandId, qty: source.to_buy, recipients });
    }
  }
  return { limits, payload: { requestIds: headers.map(header => header.id), together: true, demandIds: walls.map(wall => wall.demandId),
    ...(proofs.length ? { contextIssue: { key, requests: proofs, allocations } } : {}) } };
}
/** UI admission only; SQL repeats actual source/recipient conservation. */
export function contextIssueDistributionValid(payload: PurchaseRequestIssue, limits: ReadonlyMap<string, ContextIssueLimit>): boolean {
  if (!payload.contextIssue) return limits.size === 0;
  const allocations = payload.contextIssue.allocations;
  if (!allocations || allocations.length !== limits.size || new Set(allocations.map(source => source.demandId)).size !== limits.size) return false;
  return allocations.every(source => {
    const limit = limits.get(source.demandId);
    if (!limit || !Number.isInteger(source.qty) || source.qty < 1 || source.qty > limit.max || source.recipients == null) return false;
    if (limit.context.purpose === "ready_stock") return source.recipients.length === 0;
    return new Set(source.recipients.map(recipient => recipient.recipientId)).size === source.recipients.length
      && source.recipients.every(recipient => Number.isInteger(recipient.qty) && recipient.qty > 0 && recipient.qty <= (limit.recipients.find(value => value.recipientId === recipient.recipientId)?.qty ?? 0))
      && source.recipients.reduce((total,recipient) => total + recipient.qty,0) === source.qty;
  });
}

import { purchaseRequestContextReviewReadSchema, purchaseRequestContextSchema } from "@carres/shared";
import type { userClient } from "./supabase";
/** Project the owning SQL coverage; never treat a Stock proposal as PO demand
 * or reconstruct a modern approval from legacy totals. Legacy rows unchanged.
 * Ten concurrent reads at most; unavailable/version-torn scope remains unknown. */
export async function stampRequestContextCoverage(
  sb: Pick<ReturnType<typeof userClient>, "rpc">,
  requests: Array<Record<string, unknown>>,
  lines: Array<Record<string, unknown>>,
): Promise<Array<Record<string, unknown>>> {
  const modern = requests.filter(request => Number(request.request_version ?? 0) > 0 || request.request_context != null);
  const byDemand = new Map<string, Record<string, unknown>>();
  for (let index = 0; index < modern.length; index += 10) await Promise.all(modern.slice(index,index+10).map(async request => {
    const live = lines.filter(line => line.request_id === request.id && line.cancelled_at == null);
    for (const line of live) byDemand.set(String(line.id), { context_read_available: false });
    if (request.approved_at == null) return;
    const context = purchaseRequestContextSchema.safeParse(request.request_context);
    if (!context.success) return;
    try {
      const source = await sb.rpc("purchasing_request_context_review", { p_id: request.id });
      if (source.error) return;
      const parsed = purchaseRequestContextReviewReadSchema.safeParse(source.data);
      if (!parsed.success) return;
      const read=parsed.data;
      const observed=read.available ? read.coverage : read.committed_coverage;
      if (observed == null || (read.available && read.approval == null)
        || (read.available ? read.review.request_version : read.request_version) !== request.request_version
        || (read.available && read.approval!.approval_version !== request.approval_version)
        || JSON.stringify(read.available ? read.review.state.context : read.request_context) !== JSON.stringify(context.data)) return;
      const coverage = new Map(observed.map(row => [row.demand_id,row]));
      if (coverage.size !== live.length || live.some(line => {
        const proof = coverage.get(String(line.id));
        return !proof || proof.kind !== line.fulfilment_kind || proof.approved_qty !== line.approved_qty || proof.issued_qty !== line.issued_qty;
      })) return;
      for (const line of live) {
        const proof = coverage.get(String(line.id))!;
        byDemand.set(String(line.id), { context_read_available: true, context_admission_current: read.available, context_to_buy: proof.to_buy, context_stock_qty: proof.stock_qty });
      }
    } catch { /* unknown source never becomes coverage0 */ }
  }));
  return lines.map(line => ({ ...line, ...byDemand.get(String(line.id)) }));
}

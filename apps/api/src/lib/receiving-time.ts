/**
 * 0601 — Goods Received Date is a time point (Purchasing §9.4, owner ruling
 * 2026-09-17). The two receiving write doors pass it to their RPC as
 * `p_goods_received_time`.
 *
 * The Worker deploys on merge; the migration is applied through its governed
 * path. Until 0601 is on the database, PostgREST does not know the new
 * parameter (`PGRST202`). The door then posts exactly as before 0601 — with
 * the Kuala Lumpur DATE of the stated time and no clock — rather than refusing
 * the day's receiving. It never invents a time.
 */
type RpcResult = { data: unknown; error: { code?: string; message?: string; details?: string } | null };

/** The business date an instant falls on, in Asia/Kuala_Lumpur. */
export function klDateOf(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date(iso));
}

export async function rpcWithArrivalTime(
  call: (args: Record<string, unknown>) => PromiseLike<RpcResult>,
  args: Record<string, unknown>,
  goodsReceivedTime: string | undefined,
): Promise<RpcResult> {
  if (!goodsReceivedTime) return call(args);
  const first = await call({ ...args, p_goods_received_time: goodsReceivedTime });
  if (first.error?.code !== "PGRST202") return first;
  return call({ ...args, p_goods_received_at: klDateOf(goodsReceivedTime) });
}

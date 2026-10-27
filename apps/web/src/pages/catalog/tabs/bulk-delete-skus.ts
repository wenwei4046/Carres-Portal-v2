import { toast } from "sonner";

/**
 * Delete the ticked SKUs, one request each, and say BY NAME which ones stayed.
 *
 * Weisiang's decision (Mr Lim, WhatsApp 2026-10-22): purchasing bulk-deletes
 * products on its own catalog door, Houzs way; Jess was not part of this
 * decision. The database refuses a SKU that orders, purchase orders, stock or
 * bills name (0721), so a refusal is normal, not a failure of the batch: the
 * rest are deleted and the refused codes are listed with the reason.
 *
 * Returns the codes that were not deleted.
 */
export async function bulkDeleteSkus(
  ids: readonly string[],
  codeOf: (id: string) => string,
  del: (id: string) => Promise<unknown>,
): Promise<string[]> {
  const results = await Promise.allSettled(ids.map((id) => del(id)));
  const refused: string[] = [];
  let reason = "";
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      refused.push(codeOf(ids[i]!));
      if (!reason && r.reason instanceof Error) reason = r.reason.message;
    }
  });
  const done = ids.length - refused.length;
  if (refused.length === 0) toast.success(`Deleted ${done} SKU${done === 1 ? "" : "s"}`);
  else toast.error(`Deleted ${done}. Not deleted: ${refused.join(", ")}. ${reason}`.trim());
  return refused;
}

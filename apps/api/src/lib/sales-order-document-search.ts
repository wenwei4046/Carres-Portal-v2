import type { userClient } from "./supabase";

/** Read linked identities through the caller's RLS; never infer a document number. */
export async function findSalesOrderDocuments(sb: ReturnType<typeof userClient>, term: string) {
  const word = term.toUpperCase().replace(/[^A-Z0-9/-]/g, "");
  const orderIds = new Set<string>();
  const soNumbers = new Set<number>();
  if (!word) return { orderIds: [], soNumbers: [] };
  const reads = [
    ["purchase_orders", "id,so,so_refs", "id"],
    ["ops_delivery_orders", "id,order_id", "do_number"],
    ["invoices", "id,order_id", "invoice_no"],
    ["order_payments", "id,order_id,payment_allocations(order_id)", "receipt_no"],
  ] as const;
  await Promise.all(reads.map(async ([table, fields, field]) => {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await sb.from(table).select(fields)
        .ilike(field, `%${word}%`).order("id").range(offset, offset + 999);
      if (error) throw error;
      if (!data) throw new Error("Related documents could not be read.");
      for (const row of data as unknown as Array<{ order_id?: string; so?: number; so_refs?: number[]; payment_allocations?: { order_id: string }[] }>) {
        if (row.order_id) orderIds.add(row.order_id);
        if (Number.isSafeInteger(row.so)) soNumbers.add(row.so!);
        for (const so of row.so_refs ?? []) if (Number.isSafeInteger(so)) soNumbers.add(so);
        for (const allocation of row.payment_allocations ?? []) orderIds.add(allocation.order_id);
      }
      if (data.length < 1000) break;
    }
  }));
  return { orderIds: [...orderIds], soNumbers: [...soNumbers] };
}

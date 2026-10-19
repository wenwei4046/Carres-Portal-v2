import type { QueryClient } from "@tanstack/react-query";

/** The saved receipt changes these existing readers, including the shared Tasks/Workspace feed. */
export async function invalidateReceivingReads(client: QueryClient): Promise<void> {
  await Promise.all([
    "work", "pos", "warehouse", "stock-alerts", "movements", "supplier-claims", "orders",
    "warehouse-receipts", "warehouse-inbound", "warehouse-schedule", "dashboard",
  ].map(key => client.invalidateQueries({ queryKey: ["operation", key] })));
}

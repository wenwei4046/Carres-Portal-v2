import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { warehouseConfirmationResult, warehouseConfirmationReadiness, type WarehouseConfirmReceiptInput, type WarehouseIncomingResponse } from "@carres/shared";
import { apiFetch } from "./api";
import { invalidateReceivingReads } from "./receiving-reads";
export function useWarehouseConfirmationReadiness() {
  return useQuery({ queryKey: ["warehouse-portal", "confirmation-readiness"], retry: false,
    queryFn: async () => warehouseConfirmationReadiness.parse(await apiFetch("/api/warehouse/confirmation/readiness")) });
}
export function useWarehouseConfirmationSources(enabled: boolean) {
  return useQuery({ queryKey: ["warehouse-portal", "confirmation-sources"], enabled, retry: false,
    queryFn: () => apiFetch<WarehouseIncomingResponse>("/api/warehouse/confirmation/incoming") });
}
export function useWarehouseConfirmReceiptMutation() {
  const client = useQueryClient();
  return useMutation({ mutationFn: async (body: WarehouseConfirmReceiptInput) => warehouseConfirmationResult.parse(
    await apiFetch("/api/warehouse/receipts/confirm", { method: "POST", body: JSON.stringify(body) })),
    onSuccess: async () => { await Promise.all([invalidateReceivingReads(client), client.invalidateQueries({queryKey:["warehouse-portal"]})]); } });
}

export interface WarehouseConfirmationReportRow {
  id: string; po_id: string | null; arrival_source_id: string | null; source_no: string | null;
  supplier_name: string | null; do_number: string | null; status: string; grn_no: string | null;
  submitted_at: string; raw_report: unknown; blockers: Array<{code:string;message:string}>;
  save_key: string | null; revision: number;
}
export interface WarehouseConfirmationHistoryRow {
  id: string; receipt_id: string; event: string; event_at: string; actor_name: string | null;
  line_labels?:Record<string,string>;unit_labels?:Record<string,string>;
  payload: {report?: unknown; revision?: number; reason?: string; grn_no?:string;source_reservations?:unknown};
}
export function useWarehouseConfirmationReports(enabled: boolean) {
  return useQuery({queryKey:["warehouse-portal","confirmation-reports"],enabled,retry:false,
    queryFn:()=>apiFetch<{receipts:WarehouseConfirmationReportRow[]}>("/api/warehouse/confirmation/receipts")});
}
export function useWarehouseConfirmationHistory(id:string|null) {
  return useQuery({queryKey:["warehouse-portal","confirmation-history",id],enabled:Boolean(id),retry:false,
    queryFn:()=>apiFetch<{events:WarehouseConfirmationHistoryRow[]}>(`/api/warehouse/confirmation/receipts/${id}/history`)});
}

export interface WarehouseArrivalSource {
  id:string;source_no:string;kind:string;expected_date:string|null;to_site_id:string;
  from_site_name:string|null;party_name:string|null;units:Array<{id:string;unit_code:string;sku:string}>;
}
export function useWarehouseConfirmationArrivals(enabled:boolean){
 return useQuery({queryKey:["warehouse-portal","confirmation-arrivals"],enabled,retry:false,
  queryFn:()=>apiFetch<{sources:WarehouseArrivalSource[]}>("/api/warehouse/confirmation/arrivals")});
}

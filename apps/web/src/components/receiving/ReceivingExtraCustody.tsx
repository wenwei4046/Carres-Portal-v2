import { receivingExtraCustodyEvidence } from "@carres/shared";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import DocumentTable from "@/components/kit/DocumentTable";
import Button from "@/components/kit/Button";
import { DocSection } from "@/pages/operation/components/workspace-doc";

/** Original physical observation; never an available-stock or purchasing decision. */
export default function ReceivingExtraCustody({ receiptId }: { receiptId: string }) {
  const query = useQuery({ queryKey: ["receiving-extra-custody", receiptId], retry: false,
    queryFn: async () => receivingExtraCustodyEvidence.parse(await apiFetch(`/api/operation/warehouse-receipts/${receiptId}/extra-custody`)) });
  if (query.isPending) return <DocSection title="Extra goods"><p>Loading…</p></DocSection>;
  if (query.isError) return <DocSection title="Extra goods"><p role="alert">Could not be loaded</p>
    <Button type="button" onClick={() => void query.refetch()}>Try again</Button></DocSection>;
  if (!query.data.custody.length) return null;
  return <DocSection title="Extra goods">
    <DocumentTable label="Extra goods" columns={[
      { key: "sku", label: "SKU" }, { key: "qty", label: "Extra Qty", numeric: true },
      { key: "site", label: "Goods arrived at" }, { key: "date", label: "Goods Received Date" },
      { key: "note", label: "Note" },
    ]} rows={query.data.custody.map(row => ({ key: row.id, cells: {
      sku: row.reported_sku, qty: row.reported_qty,
      site: query.data.siteNames[row.actual_site_id] || "Not recorded",
      date: fmtDate(row.goods_received_at) || "Not recorded", note: row.reported_note || "Not recorded",
    } }))} />
  </DocSection>;
}

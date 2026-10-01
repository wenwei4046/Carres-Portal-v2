/**
 * The owning module's OWN form, opened inside a Work route card (Workspace
 * MASTER §5.10 RULING 2026-09-27: "workspace is stay here to complete all
 * job"). Work draws no form of its own: each act mounts the component its
 * module page mounts, so a save writes the same one record (Laws A and C).
 *
 *   send_po           Purchasing · PoIssueEvidence (card layout)
 *   supplier_answer   Purchasing · SupplierReplySection
 *   delivery_date     Delivery · DeliveryDatesEdit (grid layout)
 *
 * Also here: the document sheet — a document number opens its official PDF
 * over the page (Print · Download · close; Esc closes).
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Button from "@/components/kit/Button";
import Drawer from "@/components/kit/Drawer";
import PdfPreview from "@/components/kit/PdfPreview";
import { apiFetch } from "@/lib/api";
import { renderPoPdf, renderSalesOrderPdf } from "@/lib/pdf/render";
import type { PoTemplateData, SalesOrderTemplateData } from "@/lib/pdf/types";
import { useOperationSuppliers } from "@/lib/queries";
import PoIssueEvidence, { type IssuedPo, type PoSendEvidence } from "../components/PoIssueEvidence";
import { DeliveryDatesEdit, LogisticsDetailsEdit } from "../components/DeliveryBrief";
import SupplierReplySection from "../purchase-orders/SupplierReplySection";
import { useDeliveryScopeCard } from "../delivery-scope-card";

/** After a save every Work read refreshes: the feed, the Route, the POs. */
export function useRefreshWork() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["operation"] });
    void qc.invalidateQueries({ queryKey: ["so-batch-purchase"] });
    void qc.invalidateQueries({ queryKey: ["orders"] });
  };
}

/** The PO's own register row: version, send history, lines, promises. */
interface PoRow {
  id: string;
  supplier_id: string;
  destination_id?: string | null;
  version?: number | null;
  sends?: PoSendEvidence[];
  official_delivery_date?: string | null;
  promises?: unknown[];
  do_number?: string | null;
  do_uploaded_at?: string | null;
  do_file_path?: string | null;
  purchase_order_lines?: Array<{ id: string; sku: string; model_name?: string | null; size?: string | null; qty?: number | string | null; received_qty?: number | string | null }>;
}

function usePoRow(poId: string) {
  return useQuery({
    queryKey: ["operation", "pos", "one", poId],
    queryFn: () =>
      apiFetch<{ pos: PoRow[]; destinations?: Array<{ id: string; name: string }>; referencedDestinations?: Array<{ id: string; name: string }> }>(
        `/api/operation/pos?status=all&poId=${encodeURIComponent(poId)}`,
      ),
    staleTime: 10_000,
  });
}

const LOADING = "Loading…";
const FAILED = "Some information could not be refreshed.";

export function SendPoForm({ poId, documentNo, supplierName, onDone, onCancel }: { poId: string; documentNo: string; supplierName: string; onDone: () => void; onCancel: () => void }) {
  const row = usePoRow(poId);
  const suppliers = useOperationSuppliers();
  const found = row.data?.pos.find((p) => p.id === poId) ?? null;
  if (row.isLoading || suppliers.isLoading) return <p className="text-body text-kit-slate-11" role="status">{LOADING}</p>;
  if (!found) return <p className="text-body text-kit-slate-11" role="status">{FAILED}</p>;
  const supplier = (suppliers.data?.suppliers ?? []).find((s) => s.id === found.supplier_id) as
    | { whatsapp_group_url?: string | null; contact_email?: string | null; po_send_channel?: string | null; contact?: string | null }
    | undefined;
  const destinations = [...(row.data?.destinations ?? []), ...(row.data?.referencedDestinations ?? [])];
  const issued: IssuedPo = {
    id: found.id,
    supplierId: found.supplier_id,
    supplierName,
    destinationId: found.destination_id ?? "not-recorded",
    destination: destinations.find((d) => d.id === found.destination_id)?.name ?? null,
    whatsappGroupUrl: supplier?.whatsapp_group_url ?? null,
    contactEmail: supplier?.contact_email ?? null,
    poSendChannel: supplier?.po_send_channel ?? null,
    contact: supplier?.contact ?? null,
  };
  return (
    <PoIssueEvidence
      layout="card"
      po={issued}
      documentNo={documentNo}
      version={found.version ?? 1}
      evidence={found.sends ?? []}
      onConfirmed={onDone}
      onCancel={onCancel}
    />
  );
}

export function SupplierAnswerForm({ poId, supplierName, onDone, onCancel }: { poId: string; supplierName: string; onDone: () => void; onCancel: () => void }) {
  const row = usePoRow(poId);
  const found = row.data?.pos.find((p) => p.id === poId) ?? null;
  if (row.isLoading) return <p className="text-body text-kit-slate-11" role="status">{LOADING}</p>;
  if (!found) return <p className="text-body text-kit-slate-11" role="status">{FAILED}</p>;
  const version = found.version ?? 1;
  const send = (found.sends ?? []).find((s) => s.kind === "confirmed_sent" && (s.po_version ?? 1) === version) ?? null;
  return (
    <SupplierReplySection
      startEditing
      onCancel={onCancel}
      poId={found.id}
      version={version}
      officialDeliveryDate={found.official_delivery_date ?? null}
      supplierName={supplierName}
      lines={(found.purchase_order_lines ?? []).map((line) => ({
        id: line.id,
        sku: line.sku,
        item: [line.model_name, line.size].filter(Boolean).join(" · ") || line.sku,
        qty: Number(line.qty ?? 0),
        receivedQty: Number(line.received_qty ?? 0),
        unitIds: [],
      }))}
      promises={(found.promises ?? []) as never}
      canRecord={Boolean(send)}
      defaultChannel={send?.channel === "email" ? "email" : "whatsapp"}
      defaultRecipient={send?.recipient ?? ""}
      supplierDo={found.do_number || found.do_uploaded_at ? { number: found.do_number ?? null, uploadedAt: found.do_uploaded_at ?? null, file: found.do_file_path ?? null } : null}
      onSaved={onDone}
    />
  );
}

export function DeliveryDateForm({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const scope = useDeliveryScopeCard(orderId, 0);
  if (!scope.card) return <p className="text-body text-kit-slate-11" role="status">{LOADING}</p>;
  return <DeliveryDatesEdit layout="grid" card={scope.card} onDone={onDone} />;
}

export function AssignLogisticsForm({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const scope = useDeliveryScopeCard(orderId, 0);
  if (!scope.card) return <p className="text-body text-kit-slate-11" role="status">{LOADING}</p>;
  return <LogisticsDetailsEdit card={scope.card} onDone={onDone} />;
}

/* ── the document sheet ──────────────────────────────────────────────── */

export type WorkDocument = { kind: "so"; orderId: string; number: string } | { kind: "po"; poId: string; number: string };

export function WorkDocumentSheet({ doc, onClose }: { doc: WorkDocument | null; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    let made: string | null = null;
    setUrl(null);
    setFailed(false);
    (async () => {
      try {
        const blob =
          doc.kind === "so"
            ? await renderSalesOrderPdf(await apiFetch<SalesOrderTemplateData>(`/api/orders/${encodeURIComponent(doc.orderId)}/sales-order-data`))
            : await renderPoPdf(await apiFetch<PoTemplateData>(`/api/operation/pos/${encodeURIComponent(doc.poId)}/print-data`));
        made = URL.createObjectURL(blob);
        if (!cancelled) setUrl(made);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [doc]);
  const print = () => {
    if (!url) return;
    const w = window.open(url, "_blank", "noopener");
    w?.addEventListener("load", () => w.print());
  };
  const download = () => {
    if (!url || !doc) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.number}.pdf`;
    a.click();
  };
  return (
    <Drawer
      open={doc !== null}
      onOpenChange={(open) => (open ? null : onClose())}
      title={doc?.number ?? ""}
      footer={
        <div className="flex items-center gap-2">
          <Button icon="print" disabled={!url} onClick={print}>Print</Button>
          <Button icon="download" disabled={!url} onClick={download}>Download</Button>
        </div>
      }
    >
      {url ? (
        <PdfPreview src={url} title={doc?.number ?? ""} data-testid="work-document-pdf" />
      ) : (
        <p className="text-body text-kit-slate-11" role="status">{failed ? FAILED : LOADING}</p>
      )}
    </Drawer>
  );
}

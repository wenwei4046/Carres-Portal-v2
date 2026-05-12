import { useMemo, useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { renderPoPdf } from "@/lib/pdf/render";
import type { PoTemplateData } from "@/lib/pdf/types";
import {
  useCatalog,
  type LogisticsPoListRow,
  type SupplierRow,
} from "@/lib/queries";
import type { ProductSkuDto } from "@carres/shared";
import { Modal } from "./Modal";

/**
 * PoDetailModal — read-only PO detail view (Task C5.1).
 *
 * Centered Modal (Loo Q1=C — popup, not side drawer). Mounts when a row in
 * `LogisticsProcurement` is clicked. Shows summary KV, friendly-named line
 * items + receipt status, and a "Print PO" button that fetches the server-
 * generated PDF blob from `GET /api/logistics/pos/:id/print` (M4 endpoint).
 *
 * Why prop-pass the row instead of fetching by id: the existing
 * `useLogisticsPo` hook is a stub (queries.ts:1221) — implementing it would
 * need a new GET /:id endpoint. The list query already embeds
 * `purchase_order_lines`, so plucking the row from cache is enough for read-
 * only display. New endpoint can follow when (and if) we need richer history.
 *
 * Print button mirrors `PrintDoButton` in OrderDetailDrawer.tsx ~line 696:
 * Authorization: Bearer JWT → blob → window.open → popup-blocked fallback to
 * download link → URL.revokeObjectURL after 30s.
 */
interface Props {
  po: LogisticsPoListRow;
  supplier: SupplierRow | undefined;
  warehouse: { id: string; name: string; address: string | null } | undefined;
  onClose: () => void;
  /**
   * v3-S2.3 — optional Receive entry. When provided AND the PO is Receive-
   * eligible (display status NOT in {received, cancelled} AND sup_status NOT
   * in the factory_pickup mid-flight carve-out: ready_for_pickup /
   * pickup_assigned / pickup_accepted / picked_up), a "Receive PO" button
   * appears in the footer. The parent (LogisticsProcurement) wires it to
   * close this modal + open ReceivePOModal for the same PO. The prop is
   * optional so the modal can be rendered without it (defensive — currently
   * only LogisticsProcurement uses it).
   */
  onReceive?: () => void;
}

function lineStatus(line: { qty: number; received_qty: number }): {
  label: string;
  color: string;
} {
  const qty = Number(line.qty || 0);
  const got = Number(line.received_qty || 0);
  if (got >= qty && qty > 0) return { label: "received", color: "var(--success)" };
  if (got > 0) return { label: "partial", color: "var(--info, #2563eb)" };
  return { label: "open", color: "var(--base-500)" };
}

function poDisplay(po: LogisticsPoListRow): {
  label: "open" | "partial" | "received" | "cancelled";
  color: string;
} {
  if (po.status === "cancelled")
    return { label: "cancelled", color: "var(--base-400)" };
  if (po.status === "received")
    return { label: "received", color: "var(--success)" };
  const lines = po.purchase_order_lines ?? [];
  const total = lines.reduce((s, l) => s + Number(l.qty || 0), 0);
  const got = lines.reduce((s, l) => s + Number(l.received_qty || 0), 0);
  if (got === 0) return { label: "open", color: "var(--warning)" };
  if (got >= total) return { label: "received", color: "var(--success)" };
  return { label: "partial", color: "var(--info, #2563eb)" };
}

// v3-S2.3 — sup_status values that gate out the Receive button. Mid-pickup
// flight states where Receive doesn't apply; mirrors the ActionCell carve-out
// in LogisticsProcurement.tsx (lines 463-489).
const PICKUP_FLIGHT_SUP_STATUSES = new Set([
  "ready_for_pickup",
  "pickup_assigned",
  "pickup_accepted",
  "picked_up",
]);

export default function PoDetailModal({
  po,
  supplier,
  warehouse,
  onClose,
  onReceive,
}: Props) {
  const catalogQ = useCatalog();
  const [printing, setPrinting] = useState(false);

  // Mirror the friendly-name pattern from LogisticsWarehouse.tsx:138 — model
  // name + variant joined as "Carres Cloud · King" instead of bare SKU code.
  const skuLabelMap = useMemo(() => {
    const m = new Map<string, ProductSkuDto>();
    for (const s of catalogQ.data?.skus ?? []) m.set(s.sku, s);
    return m;
  }, [catalogQ.data]);
  const modelNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const md of catalogQ.data?.models ?? []) m.set(md.id, md.name);
    return m;
  }, [catalogQ.data]);

  function friendlySku(rawSku: string): string {
    const sku = skuLabelMap.get(rawSku);
    if (!sku) return rawSku;
    const modelName = modelNameById.get(sku.modelId);
    return modelName ? `${modelName} · ${sku.variant}` : sku.variant;
  }

  const lines = po.purchase_order_lines ?? [];
  const totalQty = lines.reduce((s, l) => s + Number(l.qty || 0), 0);
  const totalGot = lines.reduce(
    (s, l) => s + Number(l.received_qty || 0),
    0,
  );
  const status = poDisplay(po);
  const dlRefs = po.dl_refs ?? (po.dl != null ? [po.dl] : []);
  const poShortId = po.id.slice(0, 8);

  // v3-S2.3 — Receive eligibility mirrors the ActionCell carve-out in
  // LogisticsProcurement.tsx exactly: hide for received/cancelled and for
  // any factory_pickup mid-flight state. The button only renders when the
  // parent has wired `onReceive`.
  const canReceive =
    onReceive !== undefined &&
    status.label !== "received" &&
    status.label !== "cancelled" &&
    !PICKUP_FLIGHT_SUP_STATUSES.has(po.sup_status);

  async function handlePrint() {
    if (printing) return;
    setPrinting(true);
    try {
      // 2026-05-12 (Loo): server returns JSON; @react-pdf renders client-side.
      const data = await apiFetch<PoTemplateData>(
        `/api/logistics/pos/${po.id}/print-data`,
      );
      const blob = await renderPoPdf(data);
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank", "noopener,noreferrer");
      if (!win) {
        // Popup blocked — fall back to a download link.
        const a = document.createElement("a");
        a.href = url;
        a.download = `PO-${poShortId}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      // Revoke after 30s — give the browser time to render the blob.
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Print PO failed");
    } finally {
      setPrinting(false);
    }
  }

  return (
    <Modal title={`Purchase Order · #${poShortId}`} onClose={onClose} size="lg">
      <div data-testid="po-detail-modal">
        {/* Header band: kicker + big PO# + supplier + status chip */}
        <div className="flex justify-between items-start mb-4 gap-4">
          <div className="min-w-0">
            <div className="kicker">Purchase Order</div>
            <div
              className="font-display text-[24px] leading-[1.05] mt-1.5 tracking-[-0.025em] font-bold text-base-900 font-mono"
              title={po.id}
            >
              #PO-{poShortId}
            </div>
            <div className="text-[13px] text-base-700 font-body mt-1">
              {supplier?.name ?? "—"}
            </div>
          </div>
          <span
            className="font-ui font-bold uppercase border rounded-[3px] flex-shrink-0"
            style={{
              fontSize: 9,
              letterSpacing: "0.12em",
              color: status.color,
              borderColor: status.color,
              padding: "3px 7px",
            }}
            data-testid="po-detail-status-chip"
          >
            {status.label}
          </span>
        </div>

        {/* Summary KV grid (2 cols) */}
        <div
          className="card mb-4 px-4 py-3 grid gap-x-6 gap-y-2.5"
          style={{
            background: "var(--base-50)",
            gridTemplateColumns: "1fr 1fr",
          }}
        >
          <KV label="Supplier" value={supplier?.name ?? "—"} />
          <KV label="Warehouse" value={warehouse?.name ?? "—"} />
          <KV label="ETA" value={po.eta_date ?? "—"} mono />
          <KV
            label="PO status"
            value={status.label}
            valueStyle={{ color: status.color, fontWeight: 600 }}
          />
          <KV
            label="Supplier status"
            value={po.sup_status?.replace(/_/g, " ") ?? "—"}
          />
          <KV
            label="Order refs"
            value={
              dlRefs.length === 0
                ? "—"
                : dlRefs.map((d) => `#${d}`).join(", ")
            }
            mono
          />
        </div>

        {/* Lines table */}
        <div className="label mb-2">Line items</div>
        <div className="card p-0 mb-4" data-testid="po-detail-lines">
          <div
            className="grid items-center gap-3 px-3.5 py-2.5 bg-base-50 border-b border-base-200"
            style={{ gridTemplateColumns: "2.4fr 80px 80px 90px" }}
          >
            <div className="label">SKU</div>
            <div className="label text-right">Qty</div>
            <div className="label text-right">Received</div>
            <div className="label text-right">Status</div>
          </div>
          {lines.length === 0 && (
            <div className="px-3.5 py-4 text-center text-base-500 text-[12px]">
              No lines on this PO.
            </div>
          )}
          {lines.map((line, i) => {
            const st = lineStatus(line);
            return (
              <div
                // 0076: line.id is the post-migration UUID PK and unique per
                // row even when multi-variant lines share the same sku.
                key={line.id ?? `${line.sku}-${i}`}
                data-testid={`po-detail-line-${i}`}
                className="grid items-center gap-3 px-3.5 py-2.5 border-t border-base-100"
                style={{ gridTemplateColumns: "2.4fr 80px 80px 90px" }}
              >
                <div className="min-w-0 text-[12px] font-body" title={line.sku}>
                  <div className="overflow-hidden text-ellipsis whitespace-nowrap">
                    {friendlySku(line.sku)}
                  </div>
                  <div className="font-mono text-[10px] text-base-500 mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap">
                    {line.sku}
                  </div>
                  {/* 0073 cascade picker (Loo 2026-05-09): render bedframe
                      color + gap and sofa fabric so logistics + supplier can
                      see the exact version being made. */}
                  {line.attrs && (() => {
                    const a = line.attrs as {
                      color?: string;
                      gap?: string;
                      fabric_name?: string;
                      fabric_surcharge?: number;
                    };
                    const parts: string[] = [];
                    if (a.color) parts.push(a.color);
                    if (a.gap) parts.push(`gap ${a.gap}`);
                    if (a.fabric_name) {
                      parts.push(
                        a.fabric_surcharge && a.fabric_surcharge > 0
                          ? `${a.fabric_name} (+RM ${a.fabric_surcharge})`
                          : a.fabric_name,
                      );
                    }
                    if (parts.length === 0) return null;
                    return (
                      <div
                        className="text-[10.5px] text-base-700 mt-0.5"
                        data-testid={`po-detail-line-attrs-${i}`}
                      >
                        {parts.join(" · ")}
                      </div>
                    );
                  })()}
                </div>
                <div className="text-right font-mono text-[12px]">
                  {line.qty}
                </div>
                <div className="text-right font-mono text-[12px]">
                  {line.received_qty || 0}
                </div>
                <div className="text-right">
                  <span
                    className="font-ui font-bold uppercase border rounded-[3px]"
                    style={{
                      fontSize: 9,
                      letterSpacing: "0.12em",
                      color: st.color,
                      borderColor: st.color,
                      padding: "2px 6px",
                    }}
                  >
                    {st.label}
                  </span>
                </div>
              </div>
            );
          })}
          {lines.length > 1 && (
            <div className="border-t border-base-100 px-3.5 py-2 text-right font-mono text-[11px] text-base-600">
              Σ {totalGot}/{totalQty} units
            </div>
          )}
        </div>

        {/* Footer: Print PO (left) + Receive PO (when eligible) + Close (right) */}
        <div className="flex justify-between items-center mt-4">
          <button
            type="button"
            onClick={handlePrint}
            disabled={printing}
            className="btn-secondary text-[12px] disabled:opacity-50"
            data-testid="po-detail-print-button"
          >
            {printing ? "Opening…" : "Print PO"}
          </button>
          <div className="flex gap-2 items-center">
            {canReceive && (
              <button
                type="button"
                onClick={onReceive}
                className="btn-primary text-[12px]"
                data-testid="po-detail-receive-button"
              >
                Receive PO
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="btn-ghost text-[12px]"
              data-testid="po-detail-close-button"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function KV({
  label,
  value,
  mono,
  valueStyle,
}: {
  label: string;
  value: string;
  mono?: boolean;
  valueStyle?: React.CSSProperties;
}) {
  return (
    <div>
      <div className="label mb-0.5">{label}</div>
      <div
        className={`text-[12px] ${mono ? "font-mono" : "font-body"} text-base-900`}
        style={valueStyle}
      >
        {value}
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { qk, usePartnerToDeliver, type PartnerToDeliverRow } from "@/lib/queries";
import { apiFetch, ApiError } from "@/lib/api";
import { renderDoPdf } from "@/lib/pdf/render";
import type { DoTemplateData } from "@/lib/pdf/types";
import PartnerRequestForDeliveryDialog from "./components/PartnerRequestForDeliveryDialog";
import PODUploadDialog from "./components/PODUploadDialog";

/**
 * Partner · Deliveries — customer-leg work queue.
 *
 * 2026-05-13 (Loo): re-bucketed to a 3-column lifecycle kanban:
 *
 *   1. **Awaiting accept** — operation raised an RFD, partner needs to
 *      accept or reject. Source: GET /api/partner/pickups/rfd-pending
 *      (wraps `operation_partner_rfd_pending` SECURITY DEFINER RPC, 0059).
 *
 *   2. **Scheduled** — accepted + dispatched. LP prints DO + delivers +
 *      uploads signed POD here. Print DO + Mark Delivered both surface.
 *
 *   3. **Delivered** — POD captured, thread.operation_stage='delivered'.
 *      Last 30 days only (RPC 0101 clamps the window). Print DO stays
 *      for re-print, Mark Delivered drops.
 *
 * Pre-0101 the third column was "Out for delivery" — a date-based
 * sub-bucket of dispatched (today/past delivery_date). Loo's feedback
 * 2026-05-13: that bucket doesn't match the mental model — drivers want
 * to see "what's done" not "what's actively in transit." Migration 0101
 * widens partner_threads_to_deliver to include delivered threads + adds
 * `operation_stage` + `delivered_at` so the UI buckets by stage instead
 * of by date.
 */
type RfdPendingRow = {
  thread_id: string;
  order_id: string;
  po_id: string;
  customer_name: string;
  request_for_delivery_at: string;
  confirm_delivery_date: string | null;
};

export default function PartnerPickupsPage() {
  const qc = useQueryClient();
  const [openRfd, setOpenRfd] = useState<{ threadId: string; poLabel: string } | null>(null);
  const [openPod, setOpenPod] = useState<PartnerToDeliverRow | null>(null);
  const { data: toDeliverRows = [], isLoading: toDeliverLoading } = usePartnerToDeliver();

  const { data: rfdRows = [], isLoading: rfdLoading } = useQuery({
    queryKey: qk.partner.rfdPending(),
    queryFn: () => apiFetch<RfdPendingRow[]>("/api/partner/pickups/rfd-pending"),
  });

  const buckets = useMemo(() => {
    // 2026-05-13 (Loo) — 3-column model: Awaiting / Scheduled / Delivered.
    // Drop the date-based today/past split (the old "Out for delivery"
    // bucket). Dispatched threads always sit in Scheduled until LP presses
    // Mark Delivered; delivered ones move to the Delivered column.
    // Migration 0101 widens the RPC to also return delivered (last 30d)
    // so the Delivered column has data to show.
    const out = {
      awaiting:  rfdRows,
      scheduled: [] as PartnerToDeliverRow[],
      delivered: [] as PartnerToDeliverRow[],
    };
    for (const r of toDeliverRows) {
      if (r.operation_stage === "delivered") {
        out.delivered.push(r);
      } else {
        out.scheduled.push(r);
      }
    }
    return out;
  }, [rfdRows, toDeliverRows]);

  const totalAll = rfdRows.length + toDeliverRows.length;

  if (rfdLoading || toDeliverLoading) {
    return <div className="px-9 py-8 pb-14 text-[13px] text-base-600">Loading…</div>;
  }

  const closeRfdDialog = () => {
    qc.invalidateQueries({ queryKey: qk.partner.rfdPending() });
    setOpenRfd(null);
  };

  return (
    <div className="px-9 py-7 pb-14 space-y-5">
      <div>
        <div className="kicker">LP · Deliveries</div>
        <h1 className="font-display text-[32px] mt-1.5 leading-[1.05] tracking-[-0.025em] font-bold text-base-900">
          Deliveries
        </h1>
        <div className="font-body text-[13px] text-base-600 mt-1">
          Warehouse → customer leg. For supplier pickups (factory →
          warehouse), see <strong>Factory pickups</strong>.
        </div>
        <div className="font-body text-[13px] text-base-600 mt-1">
          {totalAll} delivery{totalAll === 1 ? "" : "s"} ·{" "}
          {buckets.awaiting.length} awaiting accept
        </div>
      </div>

      {totalAll === 0 ? (
        <div
          className="bg-white border border-base-200 rounded-md p-15 text-center text-[13px] text-base-500"
          data-testid="partner-deliveries-empty"
        >
          No RFD requests waiting for your response. Accepted RFDs will surface
          here once operation dispatches.
        </div>
      ) : (
        <>
          <div className="kicker text-base-500">Active pipeline</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            <PipelineColumn
              label="Awaiting accept"
              hint="RFD raised by operation · accept to schedule"
              accent="warning"
              count={buckets.awaiting.length}
            >
              {buckets.awaiting.length === 0 ? (
                <EmptyDash />
              ) : (
                buckets.awaiting.map((r) => (
                  <Card
                    key={r.thread_id}
                    primary={r.po_id}
                    secondary={r.customer_name}
                    dateLabel={r.confirm_delivery_date ? "Customer wants" : null}
                    dateValue={r.confirm_delivery_date ?? "Date TBD"}
                    action={
                      <button
                        type="button"
                        onClick={() =>
                          setOpenRfd({ threadId: r.thread_id, poLabel: r.po_id })
                        }
                        className="w-full px-3 py-1.5 bg-warning text-white rounded text-[12px] font-semibold"
                      >
                        ✋ View RFD
                      </button>
                    }
                  />
                ))
              )}
            </PipelineColumn>

            <PipelineColumn
              label="Scheduled"
              hint="Accepted · waiting for delivery day"
              accent="info"
              count={buckets.scheduled.length}
            >
              {buckets.scheduled.length === 0 ? (
                <EmptyDash />
              ) : (
                buckets.scheduled.map((r) => (
                  <Card
                    key={r.thread_id}
                    primary={r.po_id ?? "—"}
                    doNumber={r.do_number}
                    secondary={r.customer_name}
                    dateLabel="Delivery on"
                    dateValue={r.confirm_delivery_date ?? "—"}
                    action={
                      <div className="flex flex-col gap-1.5">
                        <PrintDoButton orderId={r.order_id} threadId={r.thread_id} />
                        <button
                          type="button"
                          onClick={() => setOpenPod(r)}
                          className="w-full px-3 py-1.5 bg-primary text-primary-foreground rounded text-[12px] font-semibold"
                          data-testid={`mark-delivered-${r.thread_id}`}
                        >
                          🚚 Mark Delivered
                        </button>
                      </div>
                    }
                  />
                ))
              )}
            </PipelineColumn>

            <PipelineColumn
              label="Delivered"
              hint="Delivery photo captured · customer signed (last 30 days)"
              accent="success"
              count={buckets.delivered.length}
            >
              {buckets.delivered.length === 0 ? (
                <EmptyDash />
              ) : (
                buckets.delivered.map((r) => (
                  <Card
                    key={r.thread_id}
                    primary={r.po_id ?? "—"}
                    doNumber={r.do_number}
                    secondary={r.customer_name}
                    dateLabel="Delivered on"
                    dateValue={
                      r.delivered_at
                        ? r.delivered_at.slice(0, 10)
                        : (r.confirm_delivery_date ?? "—")
                    }
                    action={
                      <PrintDoButton orderId={r.order_id} threadId={r.thread_id} />
                    }
                  />
                ))
              )}
            </PipelineColumn>
          </div>
        </>
      )}

      {openPod && (
        <PODUploadDialog row={openPod} onClose={() => setOpenPod(null)} />
      )}

      {openRfd && (
        <PartnerRequestForDeliveryDialog
          threadId={openRfd.threadId}
          poLabel={openRfd.poLabel}
          onClose={closeRfdDialog}
        />
      )}
    </div>
  );
}

function PipelineColumn({
  label,
  hint,
  accent,
  count,
  children,
}: {
  label: string;
  hint: string;
  accent: "warning" | "info" | "success";
  count: number;
  children: React.ReactNode;
}) {
  const accentCls =
    accent === "warning"
      ? "text-warning"
      : accent === "success"
      ? "text-success"
      : "text-info";
  return (
    <div className="bg-white border border-base-200 rounded-md overflow-hidden flex flex-col">
      <div className="px-4 py-3.5 border-b border-base-100">
        <div className="flex justify-between items-baseline">
          <div
            className={`text-[11px] font-bold uppercase tracking-[0.14em] ${accentCls}`}
          >
            {label}
          </div>
          <span className="font-mono text-[13px] font-semibold">{count}</span>
        </div>
        <div className="font-body text-[11px] text-base-500 mt-0.5">{hint}</div>
      </div>
      <div className="p-2.5 min-h-[220px] flex flex-col gap-2">{children}</div>
    </div>
  );
}

function EmptyDash() {
  return <div className="text-center text-base-400 text-[11px] py-6">—</div>;
}

function Card({
  primary,
  doNumber,
  secondary,
  dateLabel,
  dateValue,
  action,
}: {
  primary: string;
  /** 2026-05-13 (Loo) — optional Carres DO# shown next to the PO# in the
   *  card header so the LP driver can match the doc they're about to print
   *  / hand to the customer against the same code on the order detail. Set
   *  on Scheduled + Out-for-delivery cards (where 0098 has issued it);
   *  omitted on Awaiting-accept cards (pre-dispatch, no DO# yet). */
  doNumber?: string | null;
  secondary: string;
  dateLabel: string | null;
  dateValue: string;
  action: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-base-100 rounded-md p-3 flex flex-col gap-2.5">
      <div className="space-y-0.5">
        <div className="font-mono text-[11px] font-semibold text-base-900 flex items-center gap-2 flex-wrap">
          <span>{primary}</span>
          {doNumber && (
            <span className="text-base-500 font-medium">· {doNumber}</span>
          )}
        </div>
        <div className="font-body text-[13px] font-medium text-base-800 truncate">
          {secondary}
        </div>
        <div className="font-mono text-[10.5px] text-base-500 flex gap-1">
          {dateLabel && <span>{dateLabel}</span>}
          <span>{dateValue}</span>
        </div>
      </div>
      <div>{action}</div>
    </div>
  );
}

/**
 * 2026-05-13 (Loo) — Carres customer-facing DO printable from the LP's
 * Delivery tab. Driver prints the blank-but-numbered DO at handover time,
 * customer signs it on arrival, then driver uploads the signed copy via
 * "Mark Delivered" → PODUploadDialog (a separate, existing flow).
 *
 * Calls GET /api/partner/pickups/deliveries/:orderId/print-do-data (added
 * alongside this UI), which returns JSON; @react-pdf renders client-side
 * because Cloudflare Workers blocks the yoga-layout WASM.
 */
function PrintDoButton({ orderId, threadId }: { orderId: string; threadId: string }) {
  const [pending, setPending] = useState(false);
  async function open() {
    if (pending) return;
    setPending(true);
    try {
      const data = await apiFetch<DoTemplateData>(
        `/api/partner/pickups/deliveries/${orderId}/print-do-data`,
      );
      const blob = await renderDoPdf(data);
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank", "noopener,noreferrer");
      if (!win) {
        const a = document.createElement("a");
        a.href = url;
        a.download = `${data.do_number}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      toast.error(`Print DO failed: ${msg}`);
    } finally {
      setPending(false);
    }
  }
  return (
    <button
      type="button"
      onClick={open}
      disabled={pending}
      className="w-full px-3 py-1.5 border border-base-200 bg-white text-base-900 rounded text-[12px] font-semibold disabled:opacity-50 hover:border-primary transition-colors"
      data-testid={`print-do-${threadId}`}
    >
      {pending ? "Opening…" : "🖨 Print DO"}
    </button>
  );
}

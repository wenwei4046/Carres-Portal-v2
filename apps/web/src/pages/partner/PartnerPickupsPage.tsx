import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk, usePartnerToDeliver, type PartnerToDeliverRow } from "@/lib/queries";
import { apiFetch } from "@/lib/api";
import PartnerRequestForDeliveryDialog from "./components/PartnerRequestForDeliveryDialog";
import PODUploadDialog from "./components/PODUploadDialog";

/**
 * Partner · Deliveries — customer-leg work queue.
 *
 * 2026-05-11 (Loo): redesigned as a 3-column kanban mirroring the Factory
 * pickups Active Pipeline so partner sees their delivery work as a planning
 * board, not two ad-hoc tables. Columns split by partner-side state:
 *
 *   1. **Awaiting accept** — Logistics raised an RFD, partner needs to
 *      accept or reject. Source: GET /api/partner/pickups/rfd-pending
 *      (wraps `logistics_partner_rfd_pending` SECURITY DEFINER RPC, 0059).
 *
 *   2. **Scheduled** — accepted, confirm_delivery_date is in the future.
 *      Partner has time before the run; useful for capacity planning.
 *
 *   3. **Out for delivery** — accepted + delivery_date is today/past, OR
 *      no date set (loose contract). This is the action lane: drop off
 *      the goods + upload POD + Mark delivered.
 *
 * Mark Delivered (POD upload) action available on both Scheduled and
 * Out-for-delivery cards — partner might deliver early.
 *
 * The old two-section table layout (RFD Pending + In Transit) was
 * functional but didn't match the visual richness of the Factory pickups
 * counterpart. Same data feeds, kanban presentation.
 */
type RfdPendingRow = {
  thread_id: string;
  order_id: string;
  po_id: string;
  customer_name: string;
  request_for_delivery_at: string;
  confirm_delivery_date: string | null;
};

function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function PartnerPickupsPage() {
  const qc = useQueryClient();
  const [openRfd, setOpenRfd] = useState<{ threadId: string; poLabel: string } | null>(null);
  const [openPod, setOpenPod] = useState<PartnerToDeliverRow | null>(null);
  const { data: toDeliverRows = [], isLoading: toDeliverLoading } = usePartnerToDeliver();

  const { data: rfdRows = [], isLoading: rfdLoading } = useQuery({
    queryKey: qk.partner.rfdPending(),
    queryFn: () => apiFetch<RfdPendingRow[]>("/api/partner/pickups/rfd-pending"),
  });

  const today = useMemo(() => todayISO(), []);

  const buckets = useMemo(() => {
    const out = {
      awaiting: rfdRows,
      scheduled: [] as PartnerToDeliverRow[],
      out_for_delivery: [] as PartnerToDeliverRow[],
    };
    for (const r of toDeliverRows) {
      // No date OR today/past → action lane. Future date → planning lane.
      if (!r.confirm_delivery_date || r.confirm_delivery_date <= today) {
        out.out_for_delivery.push(r);
      } else {
        out.scheduled.push(r);
      }
    }
    return out;
  }, [rfdRows, toDeliverRows, today]);

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
          here once Logistics dispatches.
        </div>
      ) : (
        <>
          <div className="kicker text-base-500">Active pipeline</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            <PipelineColumn
              label="Awaiting accept"
              hint="RFD raised by Logistics · accept to schedule"
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
                    secondary={r.customer_name}
                    dateLabel="Delivery on"
                    dateValue={r.confirm_delivery_date ?? "—"}
                    action={
                      <button
                        type="button"
                        onClick={() => setOpenPod(r)}
                        className="w-full px-3 py-1.5 bg-primary text-primary-foreground rounded text-[12px] font-semibold"
                        data-testid={`mark-delivered-${r.thread_id}`}
                      >
                        🚚 Mark Delivered
                      </button>
                    }
                  />
                ))
              )}
            </PipelineColumn>

            <PipelineColumn
              label="Out for delivery"
              hint="Delivery day · drop off + POD"
              accent="info"
              count={buckets.out_for_delivery.length}
            >
              {buckets.out_for_delivery.length === 0 ? (
                <EmptyDash />
              ) : (
                buckets.out_for_delivery.map((r) => (
                  <Card
                    key={r.thread_id}
                    primary={r.po_id ?? "—"}
                    secondary={r.customer_name}
                    dateLabel={r.confirm_delivery_date ? "Today · " : null}
                    dateValue={r.confirm_delivery_date ?? "Ready to deliver"}
                    action={
                      <button
                        type="button"
                        onClick={() => setOpenPod(r)}
                        className="w-full px-3 py-1.5 bg-primary text-primary-foreground rounded text-[12px] font-semibold"
                        data-testid={`mark-delivered-${r.thread_id}`}
                      >
                        🚚 Mark Delivered
                      </button>
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
  accent: "warning" | "info";
  count: number;
  children: React.ReactNode;
}) {
  const accentCls = accent === "warning" ? "text-warning" : "text-info";
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
  secondary,
  dateLabel,
  dateValue,
  action,
}: {
  primary: string;
  secondary: string;
  dateLabel: string | null;
  dateValue: string;
  action: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-base-100 rounded-md p-3 flex flex-col gap-2.5">
      <div className="space-y-0.5">
        <div className="font-mono text-[11px] font-semibold text-base-900">
          {primary}
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

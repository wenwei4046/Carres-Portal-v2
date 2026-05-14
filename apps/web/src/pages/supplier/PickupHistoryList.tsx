import { usePickupEventsForPo } from "@/lib/queries";

/**
 * Task 13 (2026-05-15) — pickup history list for the supplier PODrawer.
 *
 * Lists every `po_pickup_events` row for this PO (newest first). Each row
 * carries DO# + timestamp + which role acked (partner / logistics) + how
 * many threads were swept up in that pickup. Reprint button opens the
 * `/print/pickup-event/:eventId` route in a new tab — that page hits the
 * `/api/pickup-events/:id/print` endpoint (server JSON payload) and
 * browser-renders the PDF via `@react-pdf/renderer` (Workers WASM ban,
 * commit `fa47433`).
 *
 * Data source: `GET /api/supplier/pos/:poId/pickup-events` (this same task).
 * Reusable across supplier / partner / logistics roles — the print endpoint
 * already gates per-role via `pickup_event_render_payload` RPC (0107).
 */
export default function PickupHistoryList({ poId }: { poId: string }) {
  const q = usePickupEventsForPo(poId);

  if (q.isPending) {
    return (
      <div className="text-[12px] text-muted-foreground">Loading…</div>
    );
  }
  const events = q.data ?? [];
  if (events.length === 0) {
    return (
      <div className="text-[12px] text-muted-foreground">No pickups yet.</div>
    );
  }

  return (
    <div className="space-y-2" data-testid="pickup-history-list">
      {events.map((e) => (
        <div
          key={e.id}
          className="flex items-center justify-between p-2.5 border border-border rounded bg-card"
          data-testid={`pickup-event-row-${e.id}`}
        >
          <div className="min-w-0">
            <div className="text-sm font-mono font-semibold">{e.do_number}</div>
            <div className="text-[11px] text-muted-foreground">
              {new Date(e.picked_up_at).toLocaleString()} · {e.ack_role} ·{" "}
              {e.thread_count} thread{e.thread_count === 1 ? "" : "s"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => window.open(`/print/pickup-event/${e.id}`, "_blank")}
            className="text-[12.5px] px-3 py-1.5 border border-border rounded-md hover:border-primary transition-colors flex-shrink-0 ml-3"
            data-testid={`reprint-do-${e.id}`}
          >
            Reprint DO
          </button>
        </div>
      ))}
    </div>
  );
}

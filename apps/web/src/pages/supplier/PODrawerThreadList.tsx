import {
  useMarkThreadReady,
  useUnmarkThreadReady,
  useSupplierThreadsForPo,
} from "@/lib/queries";

/**
 * Task 10 (2026-05-15) — per-thread checklist component for the supplier
 * PODrawer. Renders one row per `order_supplier_threads` linked to this PO
 * with a single checkbox toggling "ready for pickup" state via the
 * mark-ready / unmark-ready RPCs (migrations 0107 / 0108).
 *
 * Each row's checkbox is locked once the thread has a `pickup_event_id`
 * (immutable from supplier's side post-pickup). Rows with no threads
 * (forecast / stockpile POs) render a "no linked sales orders" hint.
 *
 * Data source: `GET /api/supplier/pos/:poId/threads` (this same task).
 */
export default function PODrawerThreadList({ poId }: { poId: string }) {
  const threadsQ = useSupplierThreadsForPo(poId);
  const markReady = useMarkThreadReady();
  const unmarkReady = useUnmarkThreadReady();

  if (threadsQ.isPending) {
    return (
      <div className="text-[13px] text-muted-foreground">Loading threads…</div>
    );
  }
  const threads = threadsQ.data ?? [];
  if (threads.length === 0) {
    return (
      <div className="text-[13px] text-muted-foreground">
        No linked sales orders (stockpile PO).
      </div>
    );
  }

  return (
    <div className="space-y-2.5" data-testid="podrawer-thread-list">
      {threads.map((t) => {
        const isReady = t.supplier_ready_at !== null;
        const isPicked = t.pickup_event_id !== null;
        const busy = markReady.isPending || unmarkReady.isPending;
        return (
          <div
            key={t.id}
            className="border border-border rounded-md p-3 bg-card"
            data-testid={`thread-row-${t.id}`}
          >
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={isReady || isPicked}
                disabled={isPicked || busy}
                onChange={() => {
                  if (isPicked) return;
                  if (isReady) unmarkReady.mutate(t.id);
                  else markReady.mutate(t.id);
                }}
                className="mt-1"
                aria-label={`Mark thread for DL-${t.order_dl} ready for pickup`}
                data-testid={`thread-checkbox-${t.id}`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-semibold text-sm">
                    DL-{t.order_dl}
                  </span>
                  <span className="text-[12px] text-muted-foreground truncate">
                    {t.customer_name}
                  </span>
                  <StatePill picked={isPicked} ready={isReady} />
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Customer ETA: {t.customer_delivery_date ?? "—"}
                </div>
                {(t.sku_lines ?? []).length > 0 && (
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {(t.sku_lines ?? [])
                      .map((l) => `${l.sku} × ${l.qty}`)
                      .join(" · ")}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatePill({ picked, ready }: { picked: boolean; ready: boolean }) {
  if (picked) {
    return (
      <span className="text-[10px] uppercase tracking-[0.06em] font-semibold text-success">
        🚚 Picked
      </span>
    );
  }
  if (ready) {
    return (
      <span className="text-[10px] uppercase tracking-[0.06em] font-semibold text-primary">
        ✅ Ready
      </span>
    );
  }
  return (
    <span className="text-[10px] uppercase tracking-[0.06em] font-semibold text-muted-foreground">
      🛠 Producing
    </span>
  );
}

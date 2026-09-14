import { Link } from "react-router-dom";
import PageHeader from "@/components/PageHeader";
import { useAcceptWarehouseWorkMutation, useWarehouseWork } from "@/lib/queries";

/** External Site queue. It is a read of the shared Work projection; the only
 * write is accepting the exact delivery order for this operator. */
export default function WarehouseWork() {
  const { data, isLoading, isError, error, refetch } = useWarehouseWork();
  const accept = useAcceptWarehouseWorkMutation();
  const items = data?.items ?? [];

  if (isLoading) {
    return <div className="px-4 py-6 sm:px-9 sm:py-8" data-testid="warehouse-work-loading">Loading…</div>;
  }

  if (isError) {
    return (
      <div className="px-4 py-6 sm:px-9 sm:py-8" data-testid="warehouse-work-error">
        <PageHeader kicker="Warehouse" title="Work" className="mb-3" />
        <p className="text-body text-base-600 mb-3">Work could not be loaded. {error.message}</p>
        <button type="button" className="btn-secondary text-label py-1.5 px-3" onClick={() => void refetch()}>Retry</button>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-9 sm:py-8 pb-14" data-testid="warehouse-work">
      <PageHeader kicker="Warehouse" title="Work" className="mb-3" />
      <p className="text-body text-base-600 mb-[18px]">The Site queue for this warehouse. Accept one delivery order, then complete it at Outbound.</p>
      {items.length === 0 ? (
        <p className="text-body text-base-500" data-testid="warehouse-work-empty">No open work — every track is clear.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const accepted = item.owner.state === "primary";
            return (
              <article key={item.id} className="rounded border border-base-200 bg-white p-4" data-testid={`warehouse-work-${item.object.id}`}>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono font-semibold text-base-800">{item.object.label}</span>
                  {item.owner.queue?.label && (
                    <span className="text-meta text-base-600" data-testid="warehouse-work-site">
                      Site · {item.owner.queue.label}
                    </span>
                  )}
                  <span className="text-meta text-base-600">{item.timing.bucket === "overdue" ? `${item.timing.workingDaysLate} working days late` : item.timing.dueOn ?? "No date"}</span>
                </div>
                <p className="mt-2 text-body text-base-700">{item.problem}</p>
                <p className="mt-1 text-meta text-base-600">{item.action}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {accepted ? (
                    <Link className="btn-primary text-label py-1.5 px-3" to={item.destination}>Open Outbound</Link>
                  ) : (
                    <button
                      type="button"
                      className="btn-primary text-label py-1.5 px-3"
                      disabled={accept.isPending}
                      onClick={() => accept.mutate(item.object.id)}
                    >
                      {accept.isPending ? "Accepting…" : "Accept work"}
                    </button>
                  )}
                  <span className="text-label text-base-500">{accepted ? "Assigned to you" : "Site queue"}</span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

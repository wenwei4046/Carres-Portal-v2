import { useMemo, useState } from "react";
import { useApprovals, type ApprovalRow as ApprovalRowDto } from "@/lib/queries";
import ApprovalRow from "./components/ApprovalRow";
import ApprovalDrawer from "./components/ApprovalDrawer";

type Filter = "pending" | "approved" | "rejected" | "all";

/**
 * Approvals inbox — Phase 3 M4. Mirrors `reference/proto/principal-approvals.jsx`
 * lines 8-105.
 *
 * Two queries on purpose:
 *   - `useApprovals({ status: 'all' })` — drives the filter-tab counts so the
 *     numbers stay accurate even when the visible list is filtered down.
 *   - `useApprovals({ status: filter })` — drives the rendered list. Server
 *     filters by status so we don't re-filter on the client.
 *
 * Both share the React Query cache (different keys), so the second tab switch
 * is instant if the user has already viewed each bucket once.
 */
export default function PrincipalApprovals() {
  const [filter, setFilter] = useState<Filter>("pending");
  const [open, setOpen] = useState<ApprovalRowDto | null>(null);

  const all = useApprovals({ status: "all" });
  const list = useApprovals({ status: filter });

  const counts = useMemo(() => {
    const items = all.data?.approvals ?? [];
    return {
      pending: items.filter((a) => a.status === "pending").length,
      approved: items.filter((a) => a.status === "approved").length,
      rejected: items.filter((a) => a.status === "rejected").length,
    };
  }, [all.data]);

  if (list.isLoading || !list.data) {
    return <div className="px-9 py-8 text-body text-muted-foreground">Loading…</div>;
  }
  const items = list.data.approvals;

  return (
    <div className="px-9 py-8 pb-14">
      <div className="mb-5">
        <div className="kicker">HQ · Approvals</div>
        <h1 className="font-display text-page leading-[1.05] mt-1.5 tracking-tight font-semibold">
          Decisions in your court
        </h1>
        <div className="text-body text-base-600 mt-1.5">
          {counts.pending} pending · auto-routed from Finance, Sales and Catalog.
        </div>
      </div>

      <div className="flex gap-1 mb-[18px] p-1 bg-base-100 rounded w-fit">
        {(["pending", "approved", "rejected", "all"] as Filter[]).map((f) => {
          const isActive = filter === f;
          const cls = isActive
            ? "px-3.5 py-1.5 text-meta rounded-sm capitalize bg-white font-semibold text-base-900 cursor-pointer border-0"
            : "px-3.5 py-1.5 text-meta rounded-sm capitalize text-base-600 font-medium cursor-pointer bg-transparent border-0";
          return (
            <button key={f} type="button" onClick={() => setFilter(f)} className={cls}>
              {f}
              {f !== "all" ? ` · ${counts[f as keyof typeof counts]}` : ""}
            </button>
          );
        })}
      </div>

      {items.length === 0 ? (
        <div className="bg-white border border-base-200 rounded-md p-12 text-center text-base-500">
          <div className="text-page mb-2 text-base-300">—</div>
          <div className="font-display text-strong">Nothing here</div>
          <div className="text-meta mt-1">No approvals match this filter.</div>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {items.map((a) => (
            <ApprovalRow key={a.id} a={a} onOpen={() => setOpen(a)} />
          ))}
        </div>
      )}

      {open && <ApprovalDrawer approval={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import OrderDetailDrawer, { type ImportedOrder as DrawerOrder } from "./OrderDetailDrawer";

/**
 * Ops · Order Inbox — Jess 2026-05-14.
 *
 * Lists staged orders (status 'inbox' or 'assigned' by default). Each row
 * shows ref / customer / items / delivery date / current logistic. Click
 * "Assign" to pick the final logistic partner.
 */

type ImportedOrder = DrawerOrder;

const LOGISTIC_OPTIONS = ["NETS", "TSDD", "AL", "HOUZS", "GAI", "HOOKKA", "Self-pickup", "Other"];

export default function OrderInbox() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("inbox,assigned");
  const [search, setSearch] = useState("");
  const [assigning, setAssigning] = useState<string | null>(null); // ref of order being assigned (inline pill mode)
  const [assignLogistic, setAssignLogistic] = useState<string>("");
  const [assignRemark, setAssignRemark] = useState<string>("");
  // Drawer-open ref. Click anywhere on row (except the Assign button) to open.
  const [openRef, setOpenRef] = useState<string | null>(null);

  const inboxQ = useQuery({
    queryKey: ["ops", "inbox", { status: statusFilter, search }],
    queryFn: () =>
      apiFetch<{ orders: ImportedOrder[] }>(
        `/api/ops/orders/inbox?status=${encodeURIComponent(statusFilter)}${
          search ? `&q=${encodeURIComponent(search)}` : ""
        }`,
      ).then((r) => r.orders),
    refetchInterval: 30000,
  });

  const assignMut = useMutation({
    mutationFn: async ({ ref, logistic, remark }: { ref: string; logistic: string; remark?: string }) => {
      await apiFetch(`/api/ops/orders/${encodeURIComponent(ref)}/assign-logistic`, {
        method: "POST",
        body: JSON.stringify({ logistic, remark: remark || undefined }),
      });
    },
    onSuccess: () => {
      toast.success("Logistic assigned");
      setAssigning(null);
      setAssignLogistic("");
      setAssignRemark("");
      qc.invalidateQueries({ queryKey: ["ops"] });
    },
    onError: (err) => {
      toast.error(`Assign failed: ${err instanceof Error ? err.message : "unknown"}`);
    },
  });

  return (
    <div className="px-9 py-7">
      <div className="text-[11px] uppercase tracking-[0.18em] text-primary font-semibold mb-1.5">
        Ops Panel
      </div>
      <h1 className="text-[28px] font-display font-bold text-base-900 mb-2">Inbox</h1>
      <p className="text-[13px] text-base-600 mb-6 max-w-3xl">
        Staged orders from AutoCount imports. Assign final logistic partner here —
        decisions are preserved when you re-import the same Excel later.
      </p>

      <div className="flex gap-3 items-center mb-4">
        <input
          type="search"
          placeholder="Search ref or customer name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input flex-1 max-w-md text-[12.5px] px-3 py-1.5"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input text-[12.5px] px-3 py-1.5"
        >
          <option value="inbox,assigned">Inbox + Assigned (default)</option>
          <option value="inbox">Inbox only</option>
          <option value="assigned">Assigned only</option>
          <option value="awaiting_stock">Awaiting stock</option>
          <option value="ready">Ready</option>
          <option value="dispatched">Dispatched</option>
          <option value="delivered">Delivered</option>
          <option value="on_hold">On hold</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <div className="text-[12px] text-base-500 ml-auto">
          {inboxQ.data?.length ?? "—"} orders
        </div>
      </div>

      {inboxQ.isLoading && (
        <div className="card p-9 text-center text-[12px] text-base-500 italic">Loading…</div>
      )}
      {inboxQ.isError && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-[12px] text-destructive">
          Could not load inbox: {inboxQ.error instanceof Error ? inboxQ.error.message : "unknown"}
        </div>
      )}
      {inboxQ.data?.length === 0 && (
        <div className="card p-9 text-center text-[12px] text-base-500 italic">
          No orders match. Import an AutoCount Listing.xlsx from the Import page to start.
        </div>
      )}

      <OrderDetailDrawer
        order={openRef ? inboxQ.data?.find((o) => o.ref === openRef) ?? null : null}
        onClose={() => setOpenRef(null)}
      />

      {inboxQ.data && inboxQ.data.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div
            className="grid gap-3 px-4 py-2 bg-base-50 border-b border-base-200 text-[10px] uppercase tracking-wider text-base-500 font-semibold"
            style={{ gridTemplateColumns: "110px 1.4fr 70px 70px 130px 130px 1fr 160px" }}
          >
            <div>Ref</div>
            <div>Customer</div>
            <div className="text-right">Items</div>
            <div className="text-right">Qty</div>
            <div>Delivery date</div>
            <div>Status</div>
            <div>Assigned logistic</div>
            <div className="text-right">Action</div>
          </div>
          <div className="max-h-[640px] overflow-auto">
            {inboxQ.data.map((o) => {
              const isAssigning = assigning === o.ref;
              return (
                <div key={o.ref} className="border-t border-base-100">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setOpenRef(o.ref)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") setOpenRef(o.ref);
                    }}
                    className="grid gap-3 px-4 py-2 text-[12.5px] items-center hover:bg-base-50 cursor-pointer"
                    style={{ gridTemplateColumns: "110px 1.4fr 70px 70px 130px 130px 1fr 160px" }}
                  >
                    <div className="font-mono font-semibold text-base-900">{o.ref}</div>
                    <div className="min-w-0">
                      <div className="truncate text-base-800">{o.customer_name}</div>
                      {o.delivery_location && (
                        <div className="text-[10.5px] text-base-500 truncate">{o.delivery_location}</div>
                      )}
                    </div>
                    <div className="text-right font-mono text-base-700">{o.items?.length ?? 0}</div>
                    <div className="text-right font-mono text-base-700">{o.total_qty}</div>
                    <div className="text-base-600">{o.delivery_date_requested ?? "—"}</div>
                    <div>
                      <span
                        className="font-ui font-bold uppercase border rounded-[3px] inline-block"
                        style={{
                          fontSize: 9,
                          letterSpacing: "0.12em",
                          padding: "2px 6px",
                          color: o.ops_status === "inbox" ? "#C84F1D" : "#555",
                          borderColor: o.ops_status === "inbox" ? "#C84F1D" : "#999",
                        }}
                      >
                        {o.ops_status}
                      </span>
                    </div>
                    <div className="text-base-700">
                      {o.ops_assigned_logistic ? (
                        <span className="font-medium">{o.ops_assigned_logistic}</span>
                      ) : (
                        <span className="text-base-400 italic">
                          {o.import_source_logistic
                            ? `(AutoCount: ${o.import_source_logistic})`
                            : "—"}
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <button
                        type="button"
                        className="btn-secondary text-[11px] py-1 px-2.5"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAssigning(isAssigning ? null : o.ref);
                          setAssignLogistic(o.ops_assigned_logistic ?? "");
                          setAssignRemark(o.ops_remark ?? "");
                        }}
                      >
                        {isAssigning ? "Cancel" : o.ops_assigned_logistic ? "Reassign" : "Assign"}
                      </button>
                    </div>
                  </div>
                  {isAssigning && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="px-4 py-3 bg-base-50 border-t border-base-100 flex gap-3 items-center"
                    >
                      <select
                        className="input text-[12.5px] px-3 py-1.5"
                        value={assignLogistic}
                        onChange={(e) => setAssignLogistic(e.target.value)}
                      >
                        <option value="">Pick logistic…</option>
                        {LOGISTIC_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        placeholder="Remark (optional)"
                        className="input flex-1 text-[12.5px] px-3 py-1.5"
                        value={assignRemark}
                        onChange={(e) => setAssignRemark(e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn-primary text-[12px] py-1.5 px-3"
                        disabled={!assignLogistic || assignMut.isPending}
                        onClick={() =>
                          assignMut.mutate({ ref: o.ref, logistic: assignLogistic, remark: assignRemark })
                        }
                      >
                        {assignMut.isPending ? "Saving…" : "Save assignment"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

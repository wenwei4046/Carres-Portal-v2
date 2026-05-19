import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import OrderDetailDrawer, { type ImportedOrder as DrawerOrder } from "./OrderDetailDrawer";

type ImportedOrder = DrawerOrder;

const LOGISTIC_OPTIONS = ["NETS", "TSDD", "AL", "HOUZS", "GAI", "HOOKKA", "Self-pickup", "Other"];

/** Days from today to a date string. Negative = overdue. */
function daysDue(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function DaysBadge({ dateStr }: { dateStr: string | null }) {
  const diff = daysDue(dateStr);
  if (diff === null) return <span className="text-base-400">—</span>;
  let bg = "#E0F4E4", fg = "#1a7f37", label = `+${diff}d`;
  if (diff === 0) { bg = "#FFF4D6"; fg = "#9a6700"; label = "Today"; }
  else if (diff < 0) { bg = "#FEE2E2"; fg = "#b42318"; label = `${diff}d`; }
  else if (diff <= 3) { bg = "#FFF4D6"; fg = "#9a6700"; label = `+${diff}d`; }
  return (
    <span
      className="text-[9px] font-bold uppercase rounded-sm px-1.5 py-0.5 ml-1"
      style={{ background: bg, color: fg }}
    >
      {label}
    </span>
  );
}

export default function OrderInbox() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("inbox,assigned");
  const [search, setSearch] = useState("");
  const [assigning, setAssigning] = useState<string | null>(null);
  const [assignLogistic, setAssignLogistic] = useState<string>("");
  const [assignRemark, setAssignRemark] = useState<string>("");
  const [openRef, setOpenRef] = useState<string | null>(null);

  // Bulk select state
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLogistic, setBulkLogistic] = useState("NETS");

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

  const rows = inboxQ.data ?? [];

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

  const bulkMut = useMutation({
    mutationFn: async ({ refs, logistic }: { refs: string[]; logistic: string }) => {
      await Promise.all(
        refs.map((ref) =>
          apiFetch(`/api/ops/orders/${encodeURIComponent(ref)}/assign-logistic`, {
            method: "POST",
            body: JSON.stringify({ logistic }),
          }),
        ),
      );
    },
    onSuccess: (_, { refs, logistic }) => {
      toast.success(`${refs.length} orders assigned to ${logistic}`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["ops"] });
    },
    onError: (err) => toast.error(`Bulk assign failed: ${err instanceof Error ? err.message : "unknown"}`),
  });

  const allRefs = useMemo(() => rows.map((o) => o.ref), [rows]);
  const allSelected = allRefs.length > 0 && allRefs.every((r) => selected.has(r));
  const someSelected = selected.size > 0;

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(allRefs));
  }
  function toggleOne(ref: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ref)) next.delete(ref);
      else next.add(ref);
      return next;
    });
  }

  return (
    <div className="px-9 py-7">
      <div className="text-[11px] uppercase tracking-[0.18em] text-primary font-semibold mb-1.5">
        Ops Panel
      </div>
      <h1 className="text-[28px] font-display font-bold text-base-900 mb-2">Inbox</h1>
      <p className="text-[13px] text-base-600 mb-6 max-w-3xl">
        Staged orders from AutoCount imports. <strong>Deadline</strong> = customer's
        requested date from AutoCount (original). Logistic's confirmed date is set inside each
        order. Assign final logistic partner here — decisions are preserved when you
        re-import the same Excel later.
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

      {/* Bulk action bar */}
      {someSelected && (
        <div className="flex items-center gap-3 mb-3 px-4 py-2.5 bg-base-900 rounded-md text-white">
          <span className="text-[12px] font-semibold">{selected.size} selected</span>
          <div className="flex-1" />
          <span className="text-[11px] text-base-400">Assign all to:</span>
          <select
            value={bulkLogistic}
            onChange={(e) => setBulkLogistic(e.target.value)}
            className="input text-[12px] px-2.5 py-1 bg-base-800 border-base-700 text-white"
          >
            {LOGISTIC_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
          <button
            type="button"
            className="btn-primary text-[12px] py-1.5 px-4"
            disabled={bulkMut.isPending}
            onClick={() => bulkMut.mutate({ refs: [...selected], logistic: bulkLogistic })}
          >
            {bulkMut.isPending ? "Assigning…" : `Confirm (${selected.size})`}
          </button>
          <button
            type="button"
            className="text-[11px] text-base-400 hover:text-white px-2"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </button>
        </div>
      )}

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
        order={openRef ? rows.find((o) => o.ref === openRef) ?? null : null}
        onClose={() => setOpenRef(null)}
      />

      {rows.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div
            className="grid gap-2 px-3 py-2 bg-base-50 border-b border-base-200 text-[10px] uppercase tracking-wider text-base-500 font-semibold items-center"
            style={{ gridTemplateColumns: "32px 130px 1.5fr 85px 160px 115px 1fr 145px" }}
          >
            <div>
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                onChange={toggleAll}
                className="cursor-pointer"
              />
            </div>
            <div>Ref</div>
            <div>Customer</div>
            <div className="text-right">SKU · Pcs</div>
            <div>Deadline <span className="normal-case text-[9px]">(AutoCount)</span></div>
            <div>Status</div>
            <div>Assigned logistic</div>
            <div className="text-right">Action</div>
          </div>
          <div className="max-h-[640px] overflow-auto">
            {rows.map((o) => {
              const isAssigning = assigning === o.ref;
              const isChecked = selected.has(o.ref);
              return (
                <div key={o.ref} className={`border-t border-base-100 ${isChecked ? "bg-base-50" : ""}`}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setOpenRef(o.ref)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") setOpenRef(o.ref);
                    }}
                    className="grid gap-2 px-3 py-2 text-[12.5px] items-center hover:bg-base-50 cursor-pointer"
                    style={{ gridTemplateColumns: "32px 130px 1.5fr 85px 160px 115px 1fr 145px" }}
                  >
                    {/* Checkbox — stop row click propagation */}
                    <div onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleOne(o.ref)}
                        className="cursor-pointer"
                      />
                    </div>
                    {/* Ref — tooltip shows full text for combined refs */}
                    <div
                      className="font-mono font-semibold text-base-900 truncate"
                      title={o.ref}
                    >
                      {o.ref}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-base-800">{o.customer_name}</div>
                      {o.delivery_location && (
                        <div className="text-[10.5px] text-base-500 truncate">{o.delivery_location}</div>
                      )}
                    </div>
                    {/* SKU lines · total pcs — merged from Items + Qty */}
                    <div className="text-right text-[11.5px] text-base-700">
                      <span className="font-mono">{o.items?.length ?? 0}</span>
                      <span className="text-base-400"> SKU · </span>
                      <span className="font-mono">{o.total_qty}</span>
                      <span className="text-base-400"> pcs</span>
                    </div>
                    {/* Deadline + days due badge */}
                    <div className="flex items-center gap-0.5 flex-wrap">
                      <span className="text-base-600 text-[12px]">
                        {o.delivery_date_requested ?? "—"}
                      </span>
                      {o.delivery_date_requested && (
                        <DaysBadge dateStr={o.delivery_date_requested} />
                      )}
                      {o.ops_logistic_eta && o.ops_logistic_eta !== o.delivery_date_requested && (
                        <div className="text-[10px] text-base-500 w-full mt-0.5">
                          ETA: {o.ops_logistic_eta}
                        </div>
                      )}
                    </div>
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
                          <option key={opt} value={opt}>{opt}</option>
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

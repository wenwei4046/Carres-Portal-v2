import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";

const CATEGORY_LABELS: Record<string, string> = {
  "BED FRAM": "Bedframe", "BEDFRAME": "Bedframe", "BF": "Bedframe",
  "M.P": "M. Protector", "MP": "M. Protector", "MATTRESS PROTECTOR": "M. Protector",
  "MATTRESS": "Mattress", "MS": "Mattress",
  "PILLOW": "Pillow", "PIL": "Pillow",
  "SOFA": "Sofa",
  "ADDON": "Add-on", "ADD ON": "Add-on", "ADD-ON": "Add-on",
  "DIVAN": "Divan", "HEADBOARD": "Headboard", "HB": "Headboard",
};
function normCategory(raw: string | null): string {
  if (!raw) return "—";
  return CATEGORY_LABELS[raw.trim().toUpperCase()] ?? raw;
}

export type ImportedOrder = {
  ref: string;
  customer_name: string;
  customer_phone: string | null;
  delivery_address_1: string | null;
  delivery_address_2: string | null;
  delivery_address_3: string | null;
  delivery_address_4: string | null;
  delivery_location: string | null;
  delivery_date_requested: string | null;
  balance_raw: string | null;
  balance_amount: number | null;
  balance_status: string | null;
  items: { itemGroup: string | null; qty: number; description: string | null; poDocNo: string | null; remark?: string | null }[];
  total_qty: number;
  order_date: string | null;
  import_source_logistic: string | null;
  ops_assigned_logistic: string | null;
  ops_status: string;
  ops_remark: string | null;
  ops_customer_request?: string | null;
  ops_carres_remark?: string | null;
  ops_action_for_logistic?: string | null;
  ops_warehouse_note?: string | null;
  ops_logistic_remark?: string | null;
  ops_logistic_eta?: string | null;
  ops_delivery_time_slot?: string | null;
  items_edited?: boolean | null;
  last_imported_at: string;
  first_imported_at: string;
};

const LOGISTIC_OPTIONS = ["NETS", "TSDD", "AL", "HOUZS", "GAI", "HOOKKA", "Self-pickup", "Other"];
const STATUS_OPTIONS = [
  "inbox",
  "assigned",
  "awaiting_stock",
  "ready",
  "dispatched",
  "delivered",
  "on_hold",
  "cancelled",
];

interface Props {
  order: ImportedOrder | null;
  onClose: () => void;
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10.5px] uppercase tracking-[0.14em] text-base-900 font-bold border-b-2 border-base-200 pb-2 mb-3">
      {children}
    </div>
  );
}


type ItemDraft = { itemGroup: string; qty: number; description: string; poDocNo: string; remark: string };

export default function OrderDetailDrawer({ order, onClose }: Props) {
  const qc = useQueryClient();
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<ItemDraft>({ itemGroup: "", qty: 1, description: "", poDocNo: "", remark: "" });
  const [deletingIdx, setDeletingIdx] = useState<number | null>(null);
  const [remarkDrafts, setRemarkDrafts] = useState<Record<number, string>>({});
  const [remarkOpenIdx, setRemarkOpenIdx] = useState<number | null>(null);
  const [menuOpenIdx, setMenuOpenIdx] = useState<number | null>(null);
  const joinAddr = (o: ImportedOrder | null) =>
    [o?.delivery_address_1, o?.delivery_address_2, o?.delivery_address_3, o?.delivery_address_4]
      .filter(Boolean).join("\n");

  const [addressText, setAddressText] = useState(joinAddr(order));
  const [draft, setDraft] = useState({
    // Customer & delivery
    customer_phone: order?.customer_phone ?? "",
    delivery_location: order?.delivery_location ?? "",
    delivery_date_requested: order?.delivery_date_requested ?? "",
    // Logistic
    ops_assigned_logistic: order?.ops_assigned_logistic ?? "",
    ops_status: order?.ops_status ?? "inbox",
    ops_logistic_eta: order?.ops_logistic_eta ?? "",
    ops_delivery_time_slot: order?.ops_delivery_time_slot ?? "",
    ops_logistic_remark: order?.ops_logistic_remark ?? "",
    // Ops notes
    ops_customer_request: order?.ops_customer_request ?? "",
    ops_carres_remark: order?.ops_carres_remark ?? "",
    ops_action_for_logistic: order?.ops_action_for_logistic ?? "",
    ops_warehouse_note: order?.ops_warehouse_note ?? "",
  });

  useEffect(() => {
    setEditingIdx(null);
    setDeletingIdx(null);
    setRemarkOpenIdx(null);
    setMenuOpenIdx(null);
    if (!order) return;
    const rd: Record<number, string> = {};
    (order.items ?? []).forEach((it, i) => { rd[i] = it.remark ?? ""; });
    setRemarkDrafts(rd);
    setAddressText(joinAddr(order));
    setDraft({
      customer_phone: order.customer_phone ?? "",
      delivery_location: order.delivery_location ?? "",
      delivery_date_requested: order.delivery_date_requested ?? "",
      ops_assigned_logistic: order.ops_assigned_logistic ?? "",
      ops_status: order.ops_status ?? "inbox",
      ops_logistic_eta: order.ops_logistic_eta ?? "",
      ops_delivery_time_slot: order.ops_delivery_time_slot ?? "",
      ops_logistic_remark: order.ops_logistic_remark ?? "",
      ops_customer_request: order.ops_customer_request ?? "",
      ops_carres_remark: order.ops_carres_remark ?? "",
      ops_action_for_logistic: order.ops_action_for_logistic ?? "",
      ops_warehouse_note: order.ops_warehouse_note ?? "",
    });
  }, [order?.ref]); // eslint-disable-line react-hooks/exhaustive-deps

  const annotationMut = useMutation({
    mutationFn: async (input: Record<string, string | null>) => {
      if (!order) return;
      await apiFetch(`/api/ops/orders/${encodeURIComponent(order.ref)}/annotation`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ops"] });
    },
    onError: (err) => {
      toast.error(`Save failed: ${err instanceof Error ? err.message : "unknown"}`);
    },
  });

  const assignMut = useMutation({
    mutationFn: async ({ logistic }: { logistic: string }) => {
      if (!order) return;
      await apiFetch(`/api/ops/orders/${encodeURIComponent(order.ref)}/assign-logistic`, {
        method: "POST",
        body: JSON.stringify({ logistic }),
      });
    },
    onSuccess: () => {
      toast.success("Logistic updated");
      qc.invalidateQueries({ queryKey: ["ops"] });
    },
    onError: (err) => {
      toast.error(`Assign failed: ${err instanceof Error ? err.message : "unknown"}`);
    },
  });

  const statusMut = useMutation({
    mutationFn: async ({ status }: { status: string }) => {
      if (!order) return;
      await apiFetch(`/api/ops/orders/${encodeURIComponent(order.ref)}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
    },
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["ops"] });
    },
    onError: (err) => {
      toast.error(`Status update failed: ${err instanceof Error ? err.message : "unknown"}`);
    },
  });

  const itemsMut = useMutation({
    mutationFn: async (items: ImportedOrder["items"]) => {
      if (!order) return;
      await apiFetch(`/api/ops/orders/${encodeURIComponent(order.ref)}/items`, {
        method: "PUT",
        body: JSON.stringify({ items }),
      });
    },
    onSuccess: () => {
      toast.success("Items saved");
      setEditingIdx(null);
      setDeletingIdx(null);
      qc.invalidateQueries({ queryKey: ["ops"] });
    },
    onError: (err) => {
      toast.error(`Save failed: ${err instanceof Error ? err.message : "unknown"}`);
    },
  });

  if (!order) return null;

  function fmtDate(s: string | null): string {
    if (!s) return "—";
    return new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
  }

  function saveField(field: keyof typeof draft, apiField: string) {
    const current = (order as unknown as Record<string, string | null>)[field] ?? "";
    const next = draft[field];
    if (current === next) return;
    annotationMut.mutate({ [apiField]: next === "" ? null : next });
  }

  function saveAddress() {
    const parts = addressText.split("\n").map((s) => s.trimEnd());
    const [a1 = "", a2 = "", a3 = "", a4 = ""] = parts;
    const original = joinAddr(order);
    if (addressText.trim() === original.trim()) return;
    annotationMut.mutate({
      deliveryAddress1: a1 || null,
      deliveryAddress2: a2 || null,
      deliveryAddress3: a3 || null,
      deliveryAddress4: a4 || null,
    });
  }

  function saveItemRemark(i: number) {
    setRemarkOpenIdx(null);
    const current = order.items?.[i]?.remark ?? "";
    const next = remarkDrafts[i] ?? "";
    if (current === next) return;
    const updated = (order.items ?? []).map((item, idx) =>
      idx === i ? { ...item, remark: next || null } : item,
    );
    itemsMut.mutate(updated);
  }

  // Shared cell style for bordered table-form inputs
  const cellInput = "w-full bg-transparent border-0 outline-none text-[12.5px] text-base-900 placeholder:text-base-300 focus:bg-base-50 rounded px-0 py-0";

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} aria-label="Close detail" />
      <aside
        className="fixed top-0 right-0 h-screen bg-white shadow-2xl z-50 overflow-y-auto"
        style={{ width: "min(620px, 92vw)" }}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-base-200 px-5 py-3.5 z-10">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex items-baseline gap-2 flex-1">
              <span className="font-mono text-[17px] font-bold text-primary shrink-0">
                {order.ref}
              </span>
              <span className="text-base-300 text-[15px]">·</span>
              <span className="text-[17px] font-bold text-base-900 truncate">
                {order.customer_name}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span
                className="font-bold uppercase rounded-sm inline-block"
                style={{
                  fontSize: 9,
                  letterSpacing: "0.12em",
                  padding: "3px 7px",
                  color: "#FFFFFF",
                  background: order.ops_status === "inbox" ? "#C84F1D" : "#555",
                }}
              >
                {order.ops_status}
              </span>
              {order.balance_raw && (
                <span className="text-[11.5px] text-base-700">
                  Bal: <span className="font-bold text-base-900">{order.balance_raw}</span>
                </span>
              )}
              <button
                type="button"
                onClick={onClose}
                className="text-base-400 hover:text-base-700 text-[20px] leading-none pl-1"
                aria-label="Close"
              >
                ×
              </button>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* CUSTOMER & DELIVERY */}
          <section>
            <SectionHeader>Customer &amp; Delivery</SectionHeader>
            <div className="rounded border border-base-200 overflow-hidden text-[12.5px]">
              {/* Row 1: Phone | Area */}
              <div className="grid divide-x divide-base-100" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <div className="px-3 py-2">
                  <div className="text-[9px] uppercase tracking-wider text-base-400 font-bold mb-1">Phone</div>
                  <input
                    type="text"
                    className={cellInput}
                    value={draft.customer_phone}
                    placeholder="—"
                    onChange={(e) => setDraft({ ...draft, customer_phone: e.target.value })}
                    onBlur={() => saveField("customer_phone", "customerPhone")}
                  />
                </div>
                <div className="px-3 py-2">
                  <div className="text-[9px] uppercase tracking-wider text-base-400 font-bold mb-1">Area</div>
                  <input
                    type="text"
                    className={cellInput}
                    value={draft.delivery_location}
                    placeholder="—"
                    onChange={(e) => setDraft({ ...draft, delivery_location: e.target.value })}
                    onBlur={() => saveField("delivery_location", "deliveryLocation")}
                  />
                </div>
              </div>
              {/* Row 2: Date requested | (empty) */}
              <div className="grid divide-x divide-base-100 border-t border-base-100" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <div className="px-3 py-2">
                  <div className="text-[9px] uppercase tracking-wider text-base-400 font-bold mb-1">Date requested</div>
                  <input
                    type="date"
                    className={cellInput}
                    value={draft.delivery_date_requested}
                    onChange={(e) => setDraft({ ...draft, delivery_date_requested: e.target.value })}
                    onBlur={() => saveField("delivery_date_requested", "deliveryDateRequested")}
                  />
                </div>
                <div className="px-3 py-2 bg-base-50/50" />
              </div>
              {/* Row 3: Address full width */}
              <div className="px-3 py-2 border-t border-base-100">
                <div className="text-[9px] uppercase tracking-wider text-base-400 font-bold mb-1">Address</div>
                <textarea
                  rows={2}
                  className={`${cellInput} resize-none leading-snug`}
                  value={addressText}
                  placeholder="Full delivery address"
                  onChange={(e) => setAddressText(e.target.value)}
                  onBlur={saveAddress}
                />
              </div>
            </div>
          </section>

          {/* ITEMS */}
          <section>
            <SectionHeader>
              Items · {order.items?.length ?? 0} line(s) · {order.total_qty} pcs total
              {order.items_edited && (
                <span className="ml-2 text-[9px] font-bold normal-case tracking-normal text-primary border border-primary/30 rounded px-1.5 py-0.5">
                  ✎ edited
                </span>
              )}
            </SectionHeader>
            <div className="border border-base-200 rounded">
              {(order.items ?? []).map((it, i) => {
                const isEditing = editingIdx === i;
                const isDeleting = deletingIdx === i;
                return (
                  <div key={i} className="border-b border-base-100 last:border-b-0">
                    {isDeleting ? (
                      /* Delete confirm inline */
                      <div className="px-3 py-2.5 bg-red-50 flex items-center gap-3">
                        <span className="text-[12px] text-red-700 font-semibold flex-1">
                          Delete "{it.description ?? "this item"}"?
                        </span>
                        <button
                          type="button"
                          className="text-[11px] font-bold text-white bg-red-600 hover:bg-red-700 rounded px-3 py-1"
                          disabled={itemsMut.isPending}
                          onClick={() => {
                            const next = (order.items ?? []).filter((_, idx) => idx !== i);
                            itemsMut.mutate(next);
                          }}
                        >
                          {itemsMut.isPending ? "…" : "Yes, delete"}
                        </button>
                        <button
                          type="button"
                          className="text-[11px] text-base-600 hover:text-base-900 px-2"
                          onClick={() => setDeletingIdx(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : isEditing ? (
                      /* Edit form inline */
                      <div className="px-3 py-2.5 bg-base-50 space-y-2">
                        <div className="grid gap-2" style={{ gridTemplateColumns: "72px 90px 1fr 120px" }}>
                          <div>
                            <div className="text-[9px] uppercase tracking-wider text-base-500 font-bold mb-0.5">Qty</div>
                            <input
                              type="number"
                              min={1}
                              className="input w-full text-[12.5px] px-2 py-1"
                              value={editDraft.qty}
                              onChange={(e) => setEditDraft({ ...editDraft, qty: parseInt(e.target.value) || 1 })}
                            />
                          </div>
                          <div>
                            <div className="text-[9px] uppercase tracking-wider text-base-500 font-bold mb-0.5">Category</div>
                            <input
                              type="text"
                              className="input w-full text-[12.5px] px-2 py-1"
                              value={editDraft.itemGroup}
                              onChange={(e) => setEditDraft({ ...editDraft, itemGroup: e.target.value })}
                              placeholder="e.g. MS"
                            />
                          </div>
                          <div>
                            <div className="text-[9px] uppercase tracking-wider text-base-500 font-bold mb-0.5">Description</div>
                            <input
                              type="text"
                              className="input w-full text-[12.5px] px-2 py-1"
                              value={editDraft.description}
                              onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })}
                            />
                          </div>
                          <div>
                            <div className="text-[9px] uppercase tracking-wider text-base-500 font-bold mb-0.5">PO#</div>
                            <input
                              type="text"
                              className="input w-full text-[12.5px] px-2 py-1 font-mono"
                              value={editDraft.poDocNo}
                              onChange={(e) => setEditDraft({ ...editDraft, poDocNo: e.target.value })}
                              placeholder="PO/2604-101"
                            />
                          </div>
                        </div>
                        <div>
                          <div className="text-[9px] uppercase tracking-wider text-base-500 font-bold mb-0.5">Remark</div>
                          <input
                            type="text"
                            className="input w-full text-[12.5px] px-2 py-1"
                            value={editDraft.remark}
                            onChange={(e) => setEditDraft({ ...editDraft, remark: e.target.value })}
                            placeholder="e.g. check packaging / split delivery"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="btn-primary text-[11px] py-1 px-3"
                            disabled={itemsMut.isPending}
                            onClick={() => {
                              const next = (order.items ?? []).map((item, idx) =>
                                idx === i
                                  ? {
                                      itemGroup: editDraft.itemGroup || null,
                                      qty: editDraft.qty,
                                      description: editDraft.description || null,
                                      poDocNo: editDraft.poDocNo || null,
                                      remark: editDraft.remark || null,
                                    }
                                  : item,
                              );
                              itemsMut.mutate(next);
                            }}
                          >
                            {itemsMut.isPending ? "Saving…" : "Save"}
                          </button>
                          <button
                            type="button"
                            className="btn-secondary text-[11px] py-1 px-3"
                            onClick={() => setEditingIdx(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* View row — same table-form style as other sections */
                      <div className="grid divide-x divide-base-100 group" style={{ gridTemplateColumns: "68px 1fr" }}>
                        {/* Left cell: qty + category */}
                        <div className="flex flex-col items-center justify-center py-2.5 px-2 text-center">
                          <div className="text-[18px] font-bold font-mono text-base-900 leading-none">
                            {it.qty}
                          </div>
                          <div className="text-[8px] uppercase tracking-wider text-base-400 font-bold mt-0.5 leading-tight">
                            {normCategory(it.itemGroup)}
                          </div>
                        </div>
                        {/* Right cell: description · PO + hover actions */}
                        <div className="px-3 py-2.5 min-w-0 flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-[12.5px] font-semibold text-base-900 leading-snug truncate">
                              {it.description ?? "—"}
                            </div>
                            {it.poDocNo && (
                              <div className="text-[10.5px] font-mono text-base-500 mt-0.5">
                                {it.poDocNo}
                              </div>
                            )}
                            {/* Remark: show text if exists (click to edit), or inline input if open */}
                            {remarkOpenIdx === i ? (
                              <input
                                autoFocus
                                type="text"
                                className="w-full bg-base-50 border border-base-200 rounded text-[11px] text-base-700 px-1.5 py-0.5 mt-1 outline-none"
                                placeholder="Add note…"
                                value={remarkDrafts[i] ?? ""}
                                onChange={(e) => setRemarkDrafts((rd) => ({ ...rd, [i]: e.target.value }))}
                                onBlur={() => saveItemRemark(i)}
                                onKeyDown={(e) => { if (e.key === "Escape") setRemarkOpenIdx(null); }}
                              />
                            ) : it.remark ? (
                              <div
                                className="text-[11px] text-base-500 italic mt-0.5 cursor-text hover:text-base-700"
                                onClick={() => { setRemarkOpenIdx(i); setRemarkDrafts((rd) => ({ ...rd, [i]: it.remark ?? "" })); }}
                              >
                                {it.remark}
                              </div>
                            ) : null}
                          </div>
                          {/* ··· kebab menu */}
                          <div className={`relative shrink-0 transition-opacity ${menuOpenIdx === i ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                            <button
                              type="button"
                              className="text-[14px] leading-none text-base-400 hover:text-base-700 px-1.5 py-1 rounded hover:bg-base-100"
                              onClick={(e) => { e.stopPropagation(); setMenuOpenIdx(menuOpenIdx === i ? null : i); }}
                            >
                              ···
                            </button>
                            {menuOpenIdx === i && (
                              <>
                                {/* backdrop to close on outside click */}
                                <div className="fixed inset-0 z-10" onClick={() => setMenuOpenIdx(null)} />
                                <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-base-200 rounded shadow-lg py-1 min-w-[130px] text-[12px]">
                                  <button
                                    type="button"
                                    className="w-full text-left px-3 py-1.5 hover:bg-base-50 text-base-700"
                                    onClick={() => {
                                      setMenuOpenIdx(null);
                                      setRemarkOpenIdx(i);
                                      setRemarkDrafts((rd) => ({ ...rd, [i]: it.remark ?? "" }));
                                    }}
                                  >
                                    {it.remark ? "✎ Edit note" : "+ Add note"}
                                  </button>
                                  <button
                                    type="button"
                                    className="w-full text-left px-3 py-1.5 hover:bg-base-50 text-base-700"
                                    onClick={() => {
                                      setMenuOpenIdx(null);
                                      setDeletingIdx(null);
                                      setRemarkOpenIdx(null);
                                      setEditDraft({
                                        itemGroup: it.itemGroup ?? "",
                                        qty: it.qty,
                                        description: it.description ?? "",
                                        poDocNo: it.poDocNo ?? "",
                                        remark: it.remark ?? "",
                                      });
                                      setEditingIdx(i);
                                    }}
                                  >
                                    ✎ Edit item
                                  </button>
                                  <div className="border-t border-base-100 my-1" />
                                  <button
                                    type="button"
                                    className="w-full text-left px-3 py-1.5 hover:bg-red-50 text-red-600"
                                    onClick={() => {
                                      setMenuOpenIdx(null);
                                      setEditingIdx(null);
                                      setRemarkOpenIdx(null);
                                      setDeletingIdx(i);
                                    }}
                                  >
                                    × Delete
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                      </div>
                    </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* LOGISTIC */}
          <section>
            <SectionHeader>
              Logistic Assignment
              <span className="text-base-400 normal-case font-normal tracking-normal ml-2">· auto-saves on change</span>
            </SectionHeader>
            <div className="rounded border border-base-200 overflow-hidden text-[12.5px]">
              {/* Logistic | ETA | Time | Status — 4 equal cells, auto-save */}
              <div className="grid divide-x divide-base-100" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
                <div className="px-3 py-2">
                  <div className="text-[9px] uppercase tracking-wider text-base-400 font-bold mb-1">Logistic</div>
                  <select
                    className={`${cellInput} cursor-pointer`}
                    value={draft.ops_assigned_logistic}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDraft((d) => ({ ...d, ops_assigned_logistic: val }));
                      if (val && val !== order.ops_assigned_logistic)
                        assignMut.mutate({ logistic: val });
                    }}
                  >
                    <option value="">— pick —</option>
                    {LOGISTIC_OPTIONS.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>
                <div className="px-3 py-2">
                  <div className="text-[9px] uppercase tracking-wider text-base-400 font-bold mb-1">ETA date</div>
                  <input
                    type="date"
                    className={cellInput}
                    value={draft.ops_logistic_eta}
                    onChange={(e) => setDraft({ ...draft, ops_logistic_eta: e.target.value })}
                    onBlur={() => saveField("ops_logistic_eta", "logisticEta")}
                  />
                </div>
                <div className="px-3 py-2">
                  <div className="text-[9px] uppercase tracking-wider text-base-400 font-bold mb-1">Time</div>
                  <input
                    type="text"
                    placeholder="e.g. 2–4pm"
                    className={cellInput}
                    value={draft.ops_delivery_time_slot}
                    onChange={(e) => setDraft({ ...draft, ops_delivery_time_slot: e.target.value })}
                    onBlur={() => saveField("ops_delivery_time_slot", "deliveryTimeSlot")}
                  />
                </div>
                <div className="px-3 py-2">
                  <div className="text-[9px] uppercase tracking-wider text-base-400 font-bold mb-1">Status</div>
                  <select
                    className={`${cellInput} cursor-pointer`}
                    value={draft.ops_status}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDraft((d) => ({ ...d, ops_status: val }));
                      if (val !== order.ops_status)
                        statusMut.mutate({ status: val });
                    }}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
              {/* Remark */}
              <div className="px-3 py-2 border-t border-base-100">
                <div className="text-[9px] uppercase tracking-wider text-base-400 font-bold mb-1">Logistic remark</div>
                <textarea
                  rows={2}
                  placeholder="e.g. confirmed 27 May, driver will call"
                  className={`${cellInput} resize-none leading-snug`}
                  value={draft.ops_logistic_remark}
                  onChange={(e) => setDraft({ ...draft, ops_logistic_remark: e.target.value })}
                  onBlur={() => saveField("ops_logistic_remark", "logisticRemark")}
                />
              </div>
            </div>
          </section>

          {/* OPS NOTES */}
          <section>
            <SectionHeader>
              Ops Notes{" "}
              <span className="text-base-400 normal-case font-normal tracking-normal">
                · click away to save
              </span>
            </SectionHeader>
            <div className="space-y-2.5">
              {/* Customer request — blue */}
              <div className="rounded border border-base-200 border-l-[3px] overflow-hidden" style={{ borderLeftColor: "#3b82f6" }}>
                <div className="px-3 pt-2.5 pb-0.5 flex items-center gap-1.5">
                  <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "#3b82f6" }}>Customer request</span>
                  <span className="text-[9px] text-base-400">— what they asked for</span>
                </div>
                <textarea
                  rows={2}
                  placeholder="deliver weekday 2-4pm / call before arriving"
                  className="w-full text-[13px] px-3 py-2 leading-snug border-0 outline-none resize-none bg-transparent placeholder:text-base-300"
                  value={draft.ops_customer_request}
                  onChange={(e) => setDraft({ ...draft, ops_customer_request: e.target.value })}
                  onBlur={() => saveField("ops_customer_request", "customerRequest")}
                />
              </div>
              {/* Carres internal — amber */}
              <div className="rounded border border-base-200 border-l-[3px] overflow-hidden" style={{ borderLeftColor: "#f59e0b" }}>
                <div className="px-3 pt-2.5 pb-0.5 flex items-center gap-1.5">
                  <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "#d97706" }}>Carres internal</span>
                  <span className="text-[9px] text-base-400">— ops team only</span>
                </div>
                <textarea
                  rows={2}
                  placeholder="internal note for ops team"
                  className="w-full text-[13px] px-3 py-2 leading-snug border-0 outline-none resize-none bg-transparent placeholder:text-base-300"
                  value={draft.ops_carres_remark}
                  onChange={(e) => setDraft({ ...draft, ops_carres_remark: e.target.value })}
                  onBlur={() => saveField("ops_carres_remark", "carresRemark")}
                />
              </div>
              {/* Action for logistic — primary orange */}
              <div className="rounded border border-base-200 border-l-[3px] overflow-hidden" style={{ borderLeftColor: "#C84F1D" }}>
                <div className="px-3 pt-2.5 pb-0.5 flex items-center gap-1.5">
                  <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "#C84F1D" }}>Action for logistic</span>
                  <span className="text-[9px] text-base-400">— instruction to driver</span>
                </div>
                <textarea
                  rows={2}
                  placeholder="call before arriving / deliver with sofa together"
                  className="w-full text-[13px] px-3 py-2 leading-snug border-0 outline-none resize-none bg-transparent placeholder:text-base-300"
                  value={draft.ops_action_for_logistic}
                  onChange={(e) =>
                    setDraft({ ...draft, ops_action_for_logistic: e.target.value })
                  }
                  onBlur={() => saveField("ops_action_for_logistic", "actionForLogistic")}
                />
              </div>
              {/* Warehouse note — teal */}
              <div className="rounded border border-base-200 border-l-[3px] overflow-hidden" style={{ borderLeftColor: "#0d9488" }}>
                <div className="px-3 pt-2.5 pb-0.5 flex items-center gap-1.5">
                  <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "#0d9488" }}>Warehouse note</span>
                  <span className="text-[9px] text-base-400">— for packing team</span>
                </div>
                <textarea
                  rows={2}
                  placeholder="e.g. items split across 2 locations / check outer packaging"
                  className="w-full text-[13px] px-3 py-2 leading-snug border-0 outline-none resize-none bg-transparent placeholder:text-base-300"
                  value={draft.ops_warehouse_note}
                  onChange={(e) =>
                    setDraft({ ...draft, ops_warehouse_note: e.target.value })
                  }
                  onBlur={() => saveField("ops_warehouse_note", "warehouseNote")}
                />
              </div>
            </div>
          </section>

          {/* IMPORT LOG — small, at bottom */}
          <div className="text-[10.5px] text-base-400 border-t border-base-100 pt-3 space-y-0.5">
            <div>First imported: <span className="font-mono">{fmtDate(order.first_imported_at)}</span></div>
            {order.last_imported_at !== order.first_imported_at && (
              <div>Re-imported: <span className="font-mono">{fmtDate(order.last_imported_at)}</span></div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

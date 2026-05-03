import { useEffect } from "react";
import type { FloorConfigDto } from "@carres/shared";
import { useCatalog, useOrder } from "@/lib/queries";
import { orderTotal, lineSubtotal, addonSubtotal, floorSurcharge } from "@/lib/order-totals";

export default function DealerOrderDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: order, isPending, error } = useOrder(id);
  const { data: catalog } = useCatalog();

  // ESC closes the modal.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-base-900/55 grid place-items-center z-50 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[760px] max-h-[88vh] flex flex-col bg-card text-card-foreground rounded-md shadow-md border border-base-900/10"
      >
        <header className="px-7 py-5 border-b border-base-100 flex items-start justify-between">
          <div>
            <div className="font-mono text-xs text-base-500">{order ? `#${order.dl}` : "—"}</div>
            <div className="font-display text-2xl mt-0.5 tracking-[-0.02em]">{order?.customer.name ?? "Loading…"}</div>
            {order?.customer.phone && (
              <div className="font-mono text-xs text-base-500 mt-0.5">{order.customer.phone}</div>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="btn-ghost text-xl leading-none px-2 py-1"
          >
            ×
          </button>
        </header>

        <div className="px-7 py-6 overflow-auto flex-1">
          {isPending && <p className="text-sm text-muted-foreground">Loading order…</p>}
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {(error as Error).message}
            </p>
          )}
          {order && catalog && <OrderBody order={order} floorConfig={catalog.floorConfig} />}
          {order && !catalog && <p className="text-sm text-muted-foreground">Loading totals…</p>}
        </div>

        <footer className="px-7 py-4 border-t border-base-100 bg-base-50 text-[11px] text-base-500">
          Read-only view. Order actions (Proceed, Top-up, Edit) ship in Phase 2C.
        </footer>
      </div>
    </div>
  );
}

function OrderBody({
  order,
  floorConfig,
}: {
  order: ReturnType<typeof useOrder>["data"] & {};
  floorConfig: FloorConfigDto;
}) {
  const total = orderTotal(order, floorConfig);
  const sub = lineSubtotal(order);
  const ad = addonSubtotal(order);
  const stair = floorSurcharge(order, floorConfig);
  const paidPct = total > 0 ? Math.round((order.paid / total) * 100) : 0;

  const stages = [
    { key: "place", label: "Place", done: true, current: order.status === "place" },
    { key: "proceed_order", label: "Proceed", done: order.status !== "place" && order.status !== "cancelled", current: order.status === "proceed_order" },
    { key: "delivered", label: "Delivered", done: order.status === "delivered", current: order.status === "delivered" },
  ];

  return (
    <>
      {/* Stages */}
      <p className="label mb-3">Order journey</p>
      <div className="flex items-center mb-2">
        {stages.map((s, i) => (
          <div key={s.key} className="flex items-center flex-1 last:flex-none">
            <div
              className={`w-4 h-4 rounded-full border-[1.5px] ${
                s.done ? "bg-primary border-primary" : "bg-card border-base-300"
              } ${s.current ? "ring-[5px] ring-signature-100" : ""} flex-shrink-0`}
            />
            {i < stages.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 ${stages[i + 1]?.done ? "bg-primary" : "bg-base-200"}`} />
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-between mb-6 text-[11px] uppercase tracking-[0.1em]">
        {stages.map((s, i) => (
          <span
            key={s.key}
            className={`${s.current ? "text-primary font-bold" : s.done ? "text-base-700" : "text-base-400"}`}
            style={{ flex: 1, textAlign: i === 0 ? "left" : i === stages.length - 1 ? "right" : "center" }}
          >
            {s.label}
          </span>
        ))}
      </div>

      {/* Customer */}
      <p className="label mb-2">Customer details</p>
      <div className="rounded border border-base-900/10 p-3.5 mb-4 grid grid-cols-2 gap-3.5 text-sm">
        <KV label="Name" value={order.customer.name || "—"} />
        <KV label="Phone" value={order.customer.phone ?? "—"} />
        <KV label="Address" value={order.customer.addressUnknown ? "Pending" : (order.customer.address ?? "—")} />
        <KV label="Delivery" value={order.delivery.dateTbd ? "TBD" : (order.delivery.date ?? "—")} />
      </div>

      {/* Items */}
      <p className="label mb-2">Items</p>
      <div className="rounded border border-base-900/10 mb-4 overflow-hidden">
        {(order.lines ?? []).map((l, i) => (
          <div key={l.id} className={`flex justify-between px-3.5 py-2.5 text-sm ${i ? "border-t border-base-100" : ""}`}>
            <span className="font-mono">{l.sku} × {l.qty}</span>
            <span className="font-mono">RM {(l.unitPrice * l.qty).toLocaleString()}</span>
          </div>
        ))}
        {(order.addons ?? []).map((a, i) => (
          <div key={a.id} className={`flex justify-between px-3.5 py-2.5 text-sm text-base-600 ${(order.lines?.length ?? 0) + i > 0 ? "border-t border-base-100" : ""}`}>
            <span className="font-mono">+ {a.addonKey} × {a.qty}</span>
            <span className="font-mono">RM {(a.unitPrice * a.qty).toLocaleString()}</span>
          </div>
        ))}
        {(order.lines ?? []).length === 0 && (order.addons ?? []).length === 0 && (
          <div className="px-3.5 py-3 text-sm text-base-500">No items recorded.</div>
        )}
        <div className="px-3.5 py-3 border-t border-base-200 bg-base-50">
          <Row label="Subtotal" value={`RM ${sub.toLocaleString()}`} />
          {ad > 0 && <Row label="Add-ons" value={`RM ${ad.toLocaleString()}`} />}
          {stair > 0 && <Row label="Stair carry" value={`RM ${stair.toLocaleString()}`} />}
          <div className="flex justify-between mt-2 pt-2 border-t border-base-200">
            <span className="text-sm font-semibold">Total</span>
            <span className="font-mono text-sm font-bold">RM {total.toLocaleString()}</span>
          </div>
          <div className={`flex justify-between mt-1 text-[11px] ${paidPct >= 50 ? "text-success" : "text-warning"}`}>
            <span>Paid</span>
            <span className="font-mono">RM {order.paid.toLocaleString()} ({paidPct}%)</span>
          </div>
        </div>
      </div>

      {/* Activity */}
      <p className="label mb-2">Activity</p>
      <div className="rounded border border-base-900/10 overflow-hidden">
        {(order.history ?? []).map((h, i) => (
          <div key={h.id} className={`grid grid-cols-[1fr_auto] gap-3.5 px-3.5 py-2.5 text-xs ${i ? "border-t border-base-100" : ""}`}>
            <span>{h.text}</span>
            <span className="font-mono text-base-500">{new Date(h.occurredAt).toLocaleString()}</span>
          </div>
        ))}
        {(order.history ?? []).length === 0 && (
          <div className="px-3.5 py-3 text-sm text-base-500">No activity yet.</div>
        )}
      </div>
    </>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="label mb-1" style={{ letterSpacing: "0.16em", fontSize: "10px" }}>{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs text-base-600">
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

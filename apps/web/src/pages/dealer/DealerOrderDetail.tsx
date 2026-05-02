import { useEffect } from "react";
import { useOrder } from "@/lib/queries";
import { orderTotal, lineSubtotal, addonSubtotal } from "@/lib/order-totals";

export default function DealerOrderDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: order, isPending, error } = useOrder(id);

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
      className="fixed inset-0 bg-foreground/40 grid place-items-center z-50 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[760px] max-h-[88vh] flex flex-col bg-card text-card-foreground rounded-lg shadow-xl border border-border"
      >
        <header className="px-7 py-5 border-b border-border flex items-start justify-between">
          <div>
            <div className="font-mono text-xs text-muted-foreground">{order ? `#${order.dl}` : "—"}</div>
            <div className="font-display text-2xl mt-0.5 tracking-tight">{order?.customer.name ?? "Loading…"}</div>
            {order?.customer.phone && (
              <div className="font-mono text-xs text-muted-foreground mt-0.5">{order.customer.phone}</div>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-2xl leading-none px-2 text-muted-foreground hover:text-foreground"
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
          {order && <OrderBody order={order} />}
        </div>

        <footer className="px-7 py-4 border-t border-border bg-secondary/30 text-[11px] text-muted-foreground">
          Read-only view. Order actions (Proceed, Top-up, Edit) ship in Phase 2C.
        </footer>
      </div>
    </div>
  );
}

function OrderBody({ order }: { order: ReturnType<typeof useOrder>["data"] & {} }) {
  const total = orderTotal(order);
  const sub = lineSubtotal(order);
  const ad = addonSubtotal(order);
  const paidPct = total > 0 ? Math.round((order.paid / total) * 100) : 0;

  const stages = [
    { key: "place", label: "Place", done: true, current: order.status === "place" },
    { key: "proceed_order", label: "Proceed", done: order.status !== "place" && order.status !== "cancelled", current: order.status === "proceed_order" },
    { key: "delivered", label: "Delivered", done: order.status === "delivered", current: order.status === "delivered" },
  ];

  return (
    <>
      {/* Stages */}
      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground font-semibold mb-3">Order journey</p>
      <div className="flex items-center mb-2">
        {stages.map((s, i) => (
          <div key={s.key} className="flex items-center flex-1 last:flex-none">
            <div
              className={`w-4 h-4 rounded-full border-[1.5px] ${
                s.done ? "bg-primary border-primary" : "bg-card border-border"
              } ${s.current ? "ring-4 ring-primary/20" : ""} flex-shrink-0`}
            />
            {i < stages.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 ${stages[i + 1]?.done ? "bg-primary" : "bg-border"}`} />
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-between mb-6 text-[11px] uppercase tracking-wider">
        {stages.map((s, i) => (
          <span
            key={s.key}
            className={`${s.current ? "text-primary font-bold" : s.done ? "text-foreground" : "text-muted-foreground"}`}
            style={{ flex: 1, textAlign: i === 0 ? "left" : i === stages.length - 1 ? "right" : "center" }}
          >
            {s.label}
          </span>
        ))}
      </div>

      {/* Customer */}
      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground font-semibold mb-2">Customer details</p>
      <div className="rounded-md border border-border p-3.5 mb-4 grid grid-cols-2 gap-3.5 text-sm">
        <KV label="Name" value={order.customer.name || "—"} />
        <KV label="Phone" value={order.customer.phone ?? "—"} />
        <KV label="Address" value={order.customer.addressUnknown ? "Pending" : (order.customer.address ?? "—")} />
        <KV label="Delivery" value={order.delivery.dateTbd ? "TBD" : (order.delivery.date ?? "—")} />
      </div>

      {/* Items */}
      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground font-semibold mb-2">Items</p>
      <div className="rounded-md border border-border mb-4 overflow-hidden">
        {(order.lines ?? []).map((l, i) => (
          <div key={l.id} className={`flex justify-between px-3.5 py-2.5 text-sm ${i ? "border-t border-border" : ""}`}>
            <span className="font-mono">{l.sku} × {l.qty}</span>
            <span className="font-mono">RM {(l.unitPrice * l.qty).toLocaleString()}</span>
          </div>
        ))}
        {(order.addons ?? []).map((a, i) => (
          <div key={a.id} className={`flex justify-between px-3.5 py-2.5 text-sm text-muted-foreground ${(order.lines?.length ?? 0) + i > 0 ? "border-t border-border" : ""}`}>
            <span className="font-mono">+ {a.addonKey} × {a.qty}</span>
            <span className="font-mono">RM {(a.unitPrice * a.qty).toLocaleString()}</span>
          </div>
        ))}
        {(order.lines ?? []).length === 0 && (order.addons ?? []).length === 0 && (
          <div className="px-3.5 py-3 text-sm text-muted-foreground">No items recorded.</div>
        )}
        <div className="px-3.5 py-3 border-t border-border bg-secondary/30">
          <Row label="Subtotal" value={`RM ${sub.toLocaleString()}`} />
          {ad > 0 && <Row label="Add-ons" value={`RM ${ad.toLocaleString()}`} />}
          <div className="flex justify-between mt-2 pt-2 border-t border-border">
            <span className="text-sm font-semibold">Total</span>
            <span className="font-mono text-sm font-bold">RM {total.toLocaleString()}</span>
          </div>
          <div className={`flex justify-between mt-1 text-[11px] ${paidPct >= 100 ? "text-emerald-700" : paidPct >= 50 ? "text-emerald-700" : "text-amber-600"}`}>
            <span>Paid</span>
            <span className="font-mono">RM {order.paid.toLocaleString()} ({paidPct}%)</span>
          </div>
        </div>
      </div>

      {/* Activity */}
      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground font-semibold mb-2">Activity</p>
      <div className="rounded-md border border-border overflow-hidden">
        {(order.history ?? []).map((h, i) => (
          <div key={h.id} className={`grid grid-cols-[1fr_auto] gap-3.5 px-3.5 py-2.5 text-xs ${i ? "border-t border-border" : ""}`}>
            <span>{h.text}</span>
            <span className="font-mono text-muted-foreground">{new Date(h.occurredAt).toLocaleString()}</span>
          </div>
        ))}
        {(order.history ?? []).length === 0 && (
          <div className="px-3.5 py-3 text-sm text-muted-foreground">No activity yet.</div>
        )}
      </div>
    </>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs text-muted-foreground">
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

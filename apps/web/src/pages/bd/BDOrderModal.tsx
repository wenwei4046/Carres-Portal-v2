import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

/**
 * Phase 10 · BD · Order detail modal — pops on top of BDDealerDetail when
 * BD clicks a row. Mirrors proto's `BDOrderPage` content (line items,
 * addons, totals, customer, history) but rendered as an overlay rather
 * than a full route — simpler navigation, identical content. Read-only.
 */

type OrderDetail = {
  id: string;
  so: number;
  dealerName: string | null;
  status: string;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  paid: number;
  total: number;
  lineTotal: number;
  addonTotal: number;
  placedAt: string | null;
  deliveryDate: string | null;
  lines: { id: string; sku: string; attrs: unknown; qty: number; unit_price: number }[];
  addons: { id: string; kind: string; qty: number; unit_price: number }[];
  history: {
    id: string;
    kind: string | null;
    text: string;
    at: string | null;
    occurred_at: string | null;
    role: string | null;
    actor_text: string | null;
  }[];
};

export default function BDOrderModal({ so, onClose }: { so: number; onClose: () => void }) {
  const { data, isLoading } = useQuery<{ order: OrderDetail }>({
    queryKey: ["bd", "orders", so],
    queryFn: () => apiFetch(`/api/bd/dealers/orders/${so}`),
  });
  const order = data?.order;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] flex justify-end"
      style={{ background: "rgba(20,18,16,0.45)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-[560px] max-w-full bg-white h-screen overflow-auto"
      >
        <div className="px-7 pt-6 pb-4 border-b border-base-100 flex items-start justify-between">
          <div className="min-w-0">
            <div className="kicker">SO-{so}</div>
            <h2 className="font-display text-[22px] mt-1 font-semibold tracking-[-0.02em]">
              {isLoading ? "Loading…" : order?.dealerName ?? "Order"}
            </h2>
            <div className="text-[12px] text-base-600 mt-1">
              {order?.customerName ?? "—"}
              {order?.deliveryDate ? ` · delivery ${order.deliveryDate}` : ""}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[20px] text-base-500 hover:text-base-900 cursor-pointer"
          >
            ×
          </button>
        </div>

        {order && (
          <>
            <div className="px-7 py-4 border-b border-base-100 grid grid-cols-3 gap-3">
              <Stat label="Total" value={`RM ${order.total.toLocaleString()}`} />
              <Stat
                label="Paid"
                value={`RM ${order.paid.toLocaleString()}`}
                tone={order.paid >= order.total ? "success" : "warn"}
              />
              <Stat label="Status" value={order.status.replace("_", " ")} />
            </div>

            {(order.customerPhone || order.customerAddress) && (
              <div className="px-7 py-4 border-b border-base-100">
                <div className="kicker text-[9px] mb-1">Customer</div>
                <div className="text-[13px] font-medium">{order.customerName ?? "—"}</div>
                {order.customerPhone && (
                  <div className="text-[12px] text-base-600 mt-0.5">{order.customerPhone}</div>
                )}
                {order.customerAddress && (
                  <div className="text-[12px] text-base-600 mt-0.5 whitespace-pre-line">
                    {order.customerAddress}
                  </div>
                )}
              </div>
            )}

            <div className="px-7 py-4 border-b border-base-100">
              <div className="kicker text-[9px] mb-2">Line items ({order.lines.length})</div>
              <table className="w-full text-[12px]">
                <tbody>
                  {order.lines.map((l) => (
                    <tr key={l.id} className="border-t border-base-100 first:border-t-0">
                      <td className="py-1.5 font-mono text-base-700">{l.sku}</td>
                      <td className="py-1.5 text-right font-mono">{l.qty}×</td>
                      <td className="py-1.5 text-right font-mono">RM {Number(l.unit_price).toLocaleString()}</td>
                      <td className="py-1.5 text-right font-semibold font-mono">
                        RM {(Number(l.unit_price) * Number(l.qty)).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  {order.lines.length === 0 && (
                    <tr><td className="py-2 text-[11px] text-base-500">No line items.</td></tr>
                  )}
                </tbody>
              </table>
              {order.addons.length > 0 && (
                <>
                  <div className="kicker text-[9px] mt-3 mb-1">Add-ons</div>
                  <table className="w-full text-[12px]">
                    <tbody>
                      {order.addons.map((a) => (
                        <tr key={a.id} className="border-t border-base-100 first:border-t-0">
                          <td className="py-1.5 text-base-700">{a.kind}</td>
                          <td className="py-1.5 text-right font-mono">{a.qty}×</td>
                          <td className="py-1.5 text-right font-mono">RM {Number(a.unit_price).toLocaleString()}</td>
                          <td className="py-1.5 text-right font-semibold font-mono">
                            RM {(Number(a.unit_price) * Number(a.qty)).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>

            <div className="px-7 py-4">
              <div className="kicker text-[9px] mb-2">History ({order.history.length})</div>
              {order.history.length === 0 && (
                <div className="text-[11.5px] text-base-500">No events yet.</div>
              )}
              {order.history.map((h) => (
                <div key={h.id} className="text-[12px] py-1.5 border-t border-base-100 first:border-t-0">
                  <div className="text-base-900">{h.text}</div>
                  <div className="text-[10.5px] text-base-500 mt-0.5">
                    {h.role ?? "—"}
                    {h.actor_text ? ` · ${h.actor_text}` : ""}
                    {h.occurred_at ? ` · ${h.occurred_at.slice(0, 16).replace("T", " ")}` : ""}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "success" | "warn" }) {
  const colorClass =
    tone === "success" ? "text-success" :
    tone === "warn"    ? "text-primary" :
    "text-base-900";
  return (
    <div>
      <div className="kicker text-[9px]">{label}</div>
      <div className={`text-[16px] font-semibold mt-0.5 capitalize ${colorClass}`}>
        {value}
      </div>
    </div>
  );
}

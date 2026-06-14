import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { qk } from "@/lib/queries";
import { apiFetch } from "@/lib/api";

/**
 * Phase 10 · Operation · Stock — `reference/proto/principal-views.jsx`
 * L80-138 pixel parity. Cross-warehouse stock table with per-warehouse
 * columns + Available + Incoming + Price. 2 view tabs (Low stock / All SKUs).
 *
 * 2026-05-19 — moved from PrincipalStock. The proto's kicker reads
 * "HQ · Operations" because this is a warehouse-staff daily view, not a
 * boardroom report. Principal can still hit /api/operation/stock directly
 * for oversight deep links (role gate admits both).
 */

type WarehouseLite = { id: string; name: string };
type StockRow = {
  sku: string;
  name: string;
  category: string | null;
  price: number;
  available: number;
  lowThreshold: number;
  incoming: number;
  perWarehouse: Record<string, { qty: number; reserved: number }>;
};
type StockPayload = {
  warehouses: WarehouseLite[];
  skus: StockRow[];
  summary: { totalSkus: number; lowStockCount: number; openPos: number };
};

export default function OperationStock() {
  const [view, setView] = useState<"low" | "all">("low");
  const { data, isLoading } = useQuery<StockPayload>({
    queryKey: qk.operation.stock(),
    queryFn: () => apiFetch("/api/operation/stock"),
  });
  const payload = data;
  const warehouses = payload?.warehouses ?? [];
  const skus = payload?.skus ?? [];

  const list = useMemo(() => {
    if (view === "low") {
      return skus
        .filter((s) => s.available <= Math.max(s.lowThreshold, 1))
        .sort((a, b) => a.available - b.available);
    }
    return [...skus].sort((a, b) => a.name.localeCompare(b.name));
  }, [skus, view]);

  return (
    <div className="px-9 py-8 pb-14">
      <div className="mb-[22px]">
        <div className="kicker">HQ · Operations</div>
        <h1 className="t-h1 font-display mt-1.5">
          Stock across the network
        </h1>
        <div className="text-[13px] text-base-600 mt-1.5">
          {payload?.summary.lowStockCount ?? 0} SKUs low · {warehouses.length} warehouse{warehouses.length !== 1 ? "s" : ""} ·{" "}
          {payload?.summary.openPos ?? 0} POs in flight
        </div>
      </div>

      <div className="flex gap-1 mb-3.5 p-1 bg-base-100 rounded w-fit">
        {(
          [
            { k: "low", l: "Low stock" },
            { k: "all", l: "All SKUs" },
          ] as const
        ).map((o) => (
          <button
            key={o.k}
            onClick={() => setView(o.k)}
            className={`px-3.5 py-1.5 text-[12px] rounded cursor-pointer ${
              view === o.k
                ? "bg-white text-base-900 font-semibold"
                : "text-base-600 font-medium"
            }`}
          >
            {o.l}
          </button>
        ))}
      </div>

      <div className="bg-white border border-base-200 rounded overflow-auto">
        <table className="w-full border-collapse text-[13px]" style={{ minWidth: 720 }}>
          <thead>
            <tr className="bg-base-50 border-b border-base-200">
              <Th>SKU</Th>
              {warehouses.map((w) => (
                <Th key={w.id} right>{w.name.split(" ")[0]}</Th>
              ))}
              <Th right>Available</Th>
              <Th right>Incoming</Th>
              <Th right>Price</Th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={warehouses.length + 4} className="p-10 text-center text-[12px] text-base-500">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && list.length === 0 && (
              <tr>
                <td colSpan={warehouses.length + 4} className="p-10 text-center text-[12px] text-base-500">
                  {view === "low" ? "Everything is healthy — no low-stock SKUs." : "No SKUs."}
                </td>
              </tr>
            )}
            {list.map((s) => {
              const isLow = s.available <= Math.max(s.lowThreshold, 1);
              return (
                <tr key={s.sku} className="border-t border-base-100">
                  <td className="px-4 py-2.5">
                    <div className="font-semibold">{s.name}</div>
                    <div className="text-[10.5px] text-base-400 font-mono">{s.sku}</div>
                  </td>
                  {warehouses.map((w) => {
                    const b = s.perWarehouse[w.id] ?? { qty: 0, reserved: 0 };
                    return (
                      <td key={w.id} className="px-4 py-2.5 text-right font-mono">
                        {b.qty - b.reserved}
                      </td>
                    );
                  })}
                  <td className={`px-4 py-2.5 text-right font-semibold font-mono ${isLow ? "text-primary" : "text-base-900"}`}>
                    {s.available}
                  </td>
                  <td className="px-4 py-2.5 text-right text-base-600 font-mono">
                    {s.incoming || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">
                    {s.price > 0 ? `RM ${s.price.toLocaleString()}` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-base-500 ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

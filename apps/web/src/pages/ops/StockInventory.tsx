import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

type Row = {
  sku: string;
  category: string;
  model: string;
  variant: string;
  warehouse: string;
  condition: string;
  status: string;
  qty: number;
  refs?: string[];
};

const STATUS_C: Record<string, string> = {
  free: "#1a7f37",
  reserved: "#9a6700",
  sold: "#888",
  transferred: "#666",
};
const COND_C: Record<string, string> = {
  new: "#1a7f37",
  exhibition: "#9a6700",
  old: "#C84F1D",
  damaged: "#b42318",
};

export default function StockInventory() {
  const [cat, setCat] = useState("");
  const [status, setStatus] = useState("");
  const [cond, setCond] = useState("");
  const [search, setSearch] = useState("");

  const q = useQuery({
    queryKey: ["ops", "stock", "inventory"],
    queryFn: () => apiFetch<{ items: Row[] }>("/api/ops/stock/inventory").then((r) => r.items),
    refetchInterval: 30000,
  });

  const rows = useMemo(() => {
    let r = q.data ?? [];
    if (cat) r = r.filter((x) => x.category === cat);
    if (status) r = r.filter((x) => x.status === status);
    if (cond) r = r.filter((x) => x.condition === cond);
    if (search) {
      const s = search.toLowerCase();
      r = r.filter((x) => x.model.toLowerCase().includes(s) || x.sku.toLowerCase().includes(s));
    }
    return r;
  }, [q.data, cat, status, cond, search]);

  const total = rows.reduce((s, r) => s + r.qty, 0);
  const all = q.data ?? [];
  const tiles = [
    { l: "Total units", v: all.reduce((s, r) => s + r.qty, 0) },
    { l: "Free", v: all.filter((r) => r.status === "free").reduce((s, r) => s + r.qty, 0) },
    { l: "Reserved", v: all.filter((r) => r.status === "reserved").reduce((s, r) => s + r.qty, 0) },
    { l: "Old / Damaged", v: all.filter((r) => ["old", "damaged"].includes(r.condition)).reduce((s, r) => s + r.qty, 0) },
  ];

  return (
    <div className="px-9 py-7">
      <div className="text-[11px] uppercase tracking-[0.18em] text-primary font-semibold mb-1.5">
        Ops Panel
      </div>
      <h1 className="text-[28px] font-display font-bold text-base-900 mb-2">Inventory</h1>
      <p className="text-[13px] text-base-600 mb-6 max-w-3xl">
        The full per-item register — every unit, every status &amp; condition. This is
        the master view (Ready Stock = sellable subset). Rolls up to wenwei's
        warehouse totals automatically.
      </p>

      <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        {tiles.map((t) => (
          <div key={t.l} className="card p-4">
            <div className="text-[10px] uppercase tracking-wider text-base-500 font-semibold mb-1.5">
              {t.l}
            </div>
            <div className="text-[24px] font-display font-bold text-base-900">
              {q.isLoading ? "…" : t.v}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2.5 items-center mb-4 flex-wrap">
        <input
          type="search"
          placeholder="Search model / SKU…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input flex-1 min-w-[200px] max-w-md text-[12px] px-2.5 py-1"
        />
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="input text-[12px] px-2.5 py-1">
          <option value="">All categories</option>
          <option value="mattress">Mattress</option>
          <option value="bedframe">Bedframe</option>
          <option value="sofa">Sofa</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input text-[12px] px-2.5 py-1">
          <option value="">All status</option>
          <option value="free">Free</option>
          <option value="reserved">Reserved</option>
          <option value="sold">Sold</option>
          <option value="transferred">Transferred</option>
        </select>
        <select value={cond} onChange={(e) => setCond(e.target.value)} className="input text-[12px] px-2.5 py-1">
          <option value="">All condition</option>
          <option value="new">New</option>
          <option value="exhibition">Exhibition</option>
          <option value="old">Old</option>
          <option value="damaged">Damaged</option>
        </select>
        <div className="text-[12px] text-base-500 ml-auto">
          {q.isLoading ? "…" : `${total} units · ${rows.length} lines`}
        </div>
      </div>

      {q.isError && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-[12px] text-destructive">
          {q.error instanceof Error ? q.error.message : "Load failed"}
        </div>
      )}
      {q.data && rows.length === 0 && !q.isLoading && (
        <div className="card p-9 text-center text-[12px] text-base-500 italic">No stock matches filters.</div>
      )}

      {rows.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div
            className="grid gap-3 px-4 py-2 bg-base-50 border-b border-base-200 text-[10px] uppercase tracking-wider text-base-500 font-semibold"
            style={{ gridTemplateColumns: "1.7fr 85px 80px 95px 95px 60px 1fr" }}
          >
            <div>SKU / model</div>
            <div>Category</div>
            <div>Size</div>
            <div>Condition</div>
            <div>Status</div>
            <div className="text-right">Qty</div>
            <div>Reserved for</div>
          </div>
          <div className="max-h-[600px] overflow-auto">
            {rows.map((r, i) => (
              <div
                key={`${r.sku}-${r.condition}-${r.status}-${i}`}
                className="grid gap-3 px-4 py-2 border-t border-base-100 text-[12px] items-center"
                style={{ gridTemplateColumns: "1.7fr 85px 80px 95px 95px 60px 1fr" }}
              >
                <div className="min-w-0">
                  <div className="font-mono text-base-900 truncate">{r.sku}</div>
                  <div className="text-[10px] text-base-500 truncate">{r.model}</div>
                </div>
                <div className="text-[10px] uppercase tracking-wide text-base-600">{r.category}</div>
                <div className="text-base-700">{r.variant}</div>
                <div className="font-semibold" style={{ color: COND_C[r.condition] ?? "#555" }}>
                  {r.condition}
                </div>
                <div className="font-semibold" style={{ color: STATUS_C[r.status] ?? "#555" }}>
                  {r.status}
                </div>
                <div className="text-right font-mono font-semibold">{r.qty}</div>
                <div className="text-[11px] text-base-600 truncate">
                  {r.refs && r.refs.length ? r.refs.join(", ") : "—"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

type ReadyRow = {
  sku: string;
  available: number;
  warehouse: string;
  category: string;
  model: string;
  variant: string;
};

const CATS = [
  { v: "", l: "All" },
  { v: "mattress", l: "Mattress" },
  { v: "bedframe", l: "Bedframe" },
  { v: "sofa", l: "Sofa" },
];

export default function ReadyStock() {
  const [cat, setCat] = useState("");
  const [search, setSearch] = useState("");

  const q = useQuery({
    queryKey: ["ops", "ready-stock"],
    queryFn: () =>
      apiFetch<{ items: ReadyRow[] }>("/api/ops/ready-stock").then((r) => r.items),
    refetchInterval: 30000,
  });

  const rows = useMemo(() => {
    let r = q.data ?? [];
    if (cat) r = r.filter((x) => x.category === cat);
    if (search) {
      const s = search.toLowerCase();
      r = r.filter(
        (x) =>
          x.model.toLowerCase().includes(s) ||
          x.sku.toLowerCase().includes(s) ||
          x.variant.toLowerCase().includes(s),
      );
    }
    return r;
  }, [q.data, cat, search]);

  const totalUnits = rows.reduce((s, r) => s + r.available, 0);

  return (
    <div className="px-9 py-7">
      <div className="text-[11px] uppercase tracking-[0.18em] text-primary font-semibold mb-1.5">
        Ops Panel
      </div>
      <h1 className="text-[28px] font-display font-bold text-base-900 mb-2">
        Ready Stock
      </h1>
      <p className="text-[13px] text-base-600 mb-6 max-w-3xl">
        What's available to sell right now. Live — reflects warehouse changes
        within 30s. Use this to quote urgent customers (3-day delivery). Booking
        a unit into an order arrives once the shared order door is live.
      </p>

      <div className="flex gap-2.5 items-center mb-4">
        <input
          type="search"
          placeholder="Search model / SKU / size…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input flex-1 max-w-md text-[12px] px-2.5 py-1"
        />
        <select
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          className="input text-[12px] px-2.5 py-1"
        >
          {CATS.map((c) => (
            <option key={c.v} value={c.v}>
              {c.l}
            </option>
          ))}
        </select>
        <div className="text-[12px] text-base-500 ml-auto">
          {q.isLoading ? "…" : `${totalUnits} units · ${rows.length} SKUs`}
        </div>
      </div>

      {q.isLoading && (
        <div className="card p-9 text-center text-[12px] text-base-500 italic">Loading…</div>
      )}
      {q.isError && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-[12px] text-destructive">
          Could not load: {q.error instanceof Error ? q.error.message : "unknown"}
        </div>
      )}
      {q.data && rows.length === 0 && !q.isLoading && (
        <div className="card p-9 text-center text-[12px] text-base-500 italic">
          No ready stock matches.
        </div>
      )}

      {rows.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div
            className="grid gap-3 px-4 py-2 bg-base-50 border-b border-base-200 text-[10px] uppercase tracking-wider text-base-500 font-semibold"
            style={{ gridTemplateColumns: "1.8fr 100px 100px 90px 130px" }}
          >
            <div>Model</div>
            <div>Category</div>
            <div>Size</div>
            <div className="text-right">Available</div>
            <div>Warehouse</div>
          </div>
          <div className="max-h-[640px] overflow-auto">
            {rows.map((r, i) => (
              <div
                key={`${r.sku}-${r.warehouse}-${i}`}
                className="grid gap-3 px-4 py-2 border-t border-base-100 text-[12.5px] items-center"
                style={{ gridTemplateColumns: "1.8fr 100px 100px 90px 130px" }}
              >
                <div className="min-w-0">
                  <div className="text-base-900 truncate">{r.model}</div>
                  <div className="text-[10px] font-mono text-base-400 truncate">{r.sku}</div>
                </div>
                <div className="text-[10.5px] uppercase tracking-wider text-base-600">
                  {r.category}
                </div>
                <div className="text-base-700">{r.variant}</div>
                <div
                  className="text-right font-mono font-bold"
                  style={{ color: r.available <= 1 ? "#C84F1D" : "#1a7f37" }}
                >
                  {r.available}
                </div>
                <div className="text-base-700 truncate">{r.warehouse}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

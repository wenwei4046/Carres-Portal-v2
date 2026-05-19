import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";

type Row = {
  sku: string;
  category: string;
  model: string;
  variant: string;
  warehouse: string;
  condition: string;
  status: string;
  qty: number;
};

export default function RepairQueue() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const q = useQuery({
    queryKey: ["ops", "stock", "repair"],
    queryFn: () => apiFetch<{ items: Row[] }>("/api/ops/stock/repair").then((r) => r.items),
    refetchInterval: 30000,
  });

  const clearMut = useMutation({
    mutationFn: (sku: string) =>
      apiFetch("/api/ops/stock/flag-repair", {
        method: "POST",
        body: JSON.stringify({ sku, needsRepair: false }),
      }),
    onSuccess: () => {
      toast.success("Cleared — back to sellable");
      qc.invalidateQueries({ queryKey: ["ops", "stock"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const rows = useMemo(() => {
    let r = q.data ?? [];
    if (search) {
      const s = search.toLowerCase();
      r = r.filter((x) => x.model.toLowerCase().includes(s) || x.sku.toLowerCase().includes(s));
    }
    return r;
  }, [q.data, search]);
  const total = rows.reduce((s, r) => s + r.qty, 0);

  return (
    <div className="px-9 py-7">
      <div className="text-[11px] uppercase tracking-[0.18em] text-primary font-semibold mb-1.5">
        Ops Panel
      </div>
      <h1 className="text-[28px] font-display font-bold text-base-900 mb-2">Repair / Return</h1>
      <p className="text-[13px] text-base-600 mb-6 max-w-3xl">
        Units that should NOT be sold as-is — Old / Damaged, or Exhibition flagged
        worn. Decide per unit: return to supplier, repair, or (if fixed) clear
        back to sellable. These never appear in Ready Stock.
      </p>

      <div className="flex gap-2.5 items-center mb-4">
        <input
          type="search"
          placeholder="Search model / SKU…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input flex-1 max-w-md text-[12px] px-2.5 py-1"
        />
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
        <div className="card p-9 text-center text-[12px] text-base-500 italic">
          Nothing in the repair / return queue. 🎉
        </div>
      )}

      {rows.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div
            className="grid gap-3 px-4 py-2 bg-base-50 border-b border-base-200 text-[10px] uppercase tracking-wider text-base-500 font-semibold"
            style={{ gridTemplateColumns: "1.8fr 90px 90px 100px 70px 120px" }}
          >
            <div>Model</div>
            <div>Category</div>
            <div>Size</div>
            <div>Condition</div>
            <div className="text-right">Qty</div>
            <div className="text-right">Action</div>
          </div>
          <div className="max-h-[620px] overflow-auto">
            {rows.map((r, i) => (
              <div
                key={`${r.sku}-${i}`}
                className="grid gap-3 px-4 py-2 border-t border-base-100 text-[12.5px] items-center"
                style={{ gridTemplateColumns: "1.8fr 90px 90px 100px 70px 120px" }}
              >
                <div className="min-w-0">
                  <div className="text-base-900 truncate">{r.model}</div>
                  <div className="text-[10px] font-mono text-base-400 truncate">{r.sku}</div>
                </div>
                <div className="text-[10.5px] uppercase tracking-wider text-base-600">{r.category}</div>
                <div className="text-base-700">{r.variant}</div>
                <div
                  className="font-semibold"
                  style={{ color: r.condition === "old" || r.condition === "damaged" ? "#b42318" : "#9a6700" }}
                >
                  {r.condition}
                </div>
                <div className="text-right font-mono font-bold text-[#b42318]">{r.qty}</div>
                <div className="text-right">
                  <button
                    type="button"
                    className="btn-secondary text-[11px] py-1 px-2"
                    title="Mark fixed — return to sellable Ready Stock"
                    disabled={clearMut.isPending}
                    onClick={() => clearMut.mutate(r.sku)}
                  >
                    Clear → sellable
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

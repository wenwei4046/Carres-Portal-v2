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
  condition: "new" | "exhibition" | "old" | "damaged";
  status: string;
  qty: number;
};

const CONDCOLOR: Record<string, { bg: string; fg: string; label: string }> = {
  new: { bg: "#E0F4E4", fg: "#1a7f37", label: "NEW" },
  exhibition: { bg: "#FFF4D6", fg: "#9a6700", label: "EXHIBITION" },
};

export default function ReadyStock() {
  const qc = useQueryClient();
  const [cat, setCat] = useState("");
  const [search, setSearch] = useState("");
  const [booking, setBooking] = useState<Row | null>(null);
  const [ref, setRef] = useState("");

  const q = useQuery({
    queryKey: ["ops", "stock", "ready"],
    queryFn: () => apiFetch<{ items: Row[] }>("/api/ops/stock/ready").then((r) => r.items),
    refetchInterval: 30000,
  });

  const reserveMut = useMutation({
    mutationFn: (b: { sku: string; reservedRef: string; condition: string }) =>
      apiFetch("/api/ops/stock/reserve", {
        method: "POST",
        body: JSON.stringify({ sku: b.sku, reservedRef: b.reservedRef, condition: b.condition }),
      }),
    onSuccess: () => {
      toast.success(`Reserved for ${ref}`);
      setBooking(null);
      setRef("");
      qc.invalidateQueries({ queryKey: ["ops", "stock"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Reserve failed"),
  });

  const rows = useMemo(() => {
    let r = q.data ?? [];
    if (cat) r = r.filter((x) => x.category === cat);
    if (search) {
      const s = search.toLowerCase();
      r = r.filter(
        (x) => x.model.toLowerCase().includes(s) || x.sku.toLowerCase().includes(s),
      );
    }
    return r;
  }, [q.data, cat, search]);

  const total = rows.reduce((s, r) => s + r.qty, 0);

  return (
    <div className="px-9 py-7">
      <div className="text-[11px] uppercase tracking-[0.18em] text-primary font-semibold mb-1.5">
        Ops Panel · Sales
      </div>
      <h1 className="text-[28px] font-display font-bold text-base-900 mb-2">Ready Stock</h1>
      <p className="text-[13px] text-base-600 mb-6 max-w-3xl">
        Only <strong>free + good-condition</strong> units — what sales can actually quote
        today. Reserved and Old stock are excluded (see Reserved / Inventory).
        Reserving holds the unit against a customer ref; full order creation
        arrives with the shared order door.
      </p>

      <div className="flex gap-2.5 items-center mb-4">
        <input
          type="search"
          placeholder="Search model / SKU…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input flex-1 max-w-md text-[12px] px-2.5 py-1"
        />
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="input text-[12px] px-2.5 py-1">
          <option value="">All categories</option>
          <option value="mattress">Mattress</option>
          <option value="bedframe">Bedframe</option>
          <option value="sofa">Sofa</option>
        </select>
        <div className="text-[12px] text-base-500 ml-auto">
          {q.isLoading ? "…" : `${total} sellable units · ${rows.length} lines`}
        </div>
      </div>

      {q.isLoading && <div className="card p-9 text-center text-[12px] text-base-500 italic">Loading…</div>}
      {q.isError && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-[12px] text-destructive">
          {q.error instanceof Error ? q.error.message : "Load failed"}
        </div>
      )}
      {q.data && rows.length === 0 && !q.isLoading && (
        <div className="card p-9 text-center text-[12px] text-base-500 italic">No sellable stock matches.</div>
      )}

      {rows.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div
            className="grid gap-3 px-4 py-2 bg-base-50 border-b border-base-200 text-[10px] uppercase tracking-wider text-base-500 font-semibold"
            style={{ gridTemplateColumns: "1.8fr 90px 90px 110px 80px 110px" }}
          >
            <div>Model</div>
            <div>Category</div>
            <div>Size</div>
            <div>Condition</div>
            <div className="text-right">Avail</div>
            <div className="text-right">Action</div>
          </div>
          <div className="max-h-[620px] overflow-auto">
            {rows.map((r, i) => {
              const cc = CONDCOLOR[r.condition] ?? { bg: "#eee", fg: "#555", label: r.condition.toUpperCase() };
              return (
                <div
                  key={`${r.sku}-${r.condition}-${i}`}
                  className="grid gap-3 px-4 py-2 border-t border-base-100 text-[12.5px] items-center"
                  style={{ gridTemplateColumns: "1.8fr 90px 90px 110px 80px 110px" }}
                >
                  <div className="min-w-0">
                    <div className="text-base-900 truncate">{r.model}</div>
                    <div className="text-[10px] font-mono text-base-400 truncate">{r.sku}</div>
                  </div>
                  <div className="text-[10.5px] uppercase tracking-wider text-base-600">{r.category}</div>
                  <div className="text-base-700">{r.variant}</div>
                  <div>
                    <span
                      className="text-[9px] font-bold uppercase rounded-sm px-1.5 py-0.5"
                      style={{ background: cc.bg, color: cc.fg }}
                    >
                      {cc.label}
                    </span>
                  </div>
                  <div className="text-right font-mono font-bold text-[#1a7f37]">{r.qty}</div>
                  <div className="text-right">
                    <button
                      type="button"
                      className="btn-secondary text-[11px] py-1 px-2.5"
                      onClick={() => {
                        setBooking(r);
                        setRef("");
                      }}
                    >
                      Reserve
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {booking && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setBooking(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-2xl z-50 p-5 w-[420px]">
            <div className="text-[15px] font-semibold text-base-900 mb-1">Reserve a unit</div>
            <div className="text-[12px] text-base-600 mb-4">
              {booking.model} · {booking.variant} · {booking.condition} · {booking.qty} free
            </div>
            <label className="block text-[10px] uppercase tracking-wider text-base-500 font-semibold mb-1">
              Customer order ref
            </label>
            <input
              type="text"
              autoFocus
              placeholder="e.g. CR1234 / TCF0456"
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              className="input w-full text-[13px] px-3 py-2 mb-4"
            />
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary text-[12px] px-3 py-1.5" onClick={() => setBooking(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary text-[12px] px-4 py-1.5"
                disabled={!ref.trim() || reserveMut.isPending}
                onClick={() =>
                  reserveMut.mutate({ sku: booking.sku, reservedRef: ref.trim(), condition: booking.condition })
                }
              >
                {reserveMut.isPending ? "Reserving…" : "Confirm reserve"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

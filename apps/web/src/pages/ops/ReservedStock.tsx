import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";

type Row = {
  sku: string;
  category: string;
  model: string;
  size: string;
  warehouse: string;
  condition: string;
  status: string;
  qty: number;
  refs?: string[];
  oldRefs?: string[];
};

type ActionKind = "release" | "reassign" | "takeout";

export default function ReservedStock() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [act, setAct] = useState<{ row: Row; kind: ActionKind } | null>(null);
  const [refPick, setRefPick] = useState("");
  const [newRef, setNewRef] = useState("");

  const q = useQuery({
    queryKey: ["ops", "stock", "reserved"],
    queryFn: () => apiFetch<{ items: Row[] }>("/api/ops/stock/reserved").then((r) => r.items),
    refetchInterval: 30000,
  });

  const mut = useMutation({
    mutationFn: async () => {
      if (!act) return;
      const { row, kind } = act;
      if (kind === "release")
        return apiFetch("/api/ops/stock/release", {
          method: "POST",
          body: JSON.stringify({ sku: row.sku, ref: refPick }),
        });
      if (kind === "reassign")
        return apiFetch("/api/ops/stock/reassign", {
          method: "POST",
          body: JSON.stringify({ sku: row.sku, oldRef: refPick, newRef: newRef.trim() }),
        });
      return apiFetch("/api/ops/stock/takeout", {
        method: "POST",
        body: JSON.stringify({ sku: row.sku, ref: refPick, fromReserved: true }),
      });
    },
    onSuccess: () => {
      toast.success(
        act?.kind === "release"
          ? "Released → free"
          : act?.kind === "reassign"
            ? `Reassigned → ${newRef} (old ref kept)`
            : "Taken out — stock committed",
      );
      setAct(null);
      setRefPick("");
      setNewRef("");
      qc.invalidateQueries({ queryKey: ["ops", "stock"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Action failed"),
  });

  const rows = useMemo(() => {
    let r = q.data ?? [];
    if (search) {
      const s = search.toLowerCase();
      r = r.filter(
        (x) =>
          x.model.toLowerCase().includes(s) ||
          x.sku.toLowerCase().includes(s) ||
          (x.refs ?? []).some((rf) => rf.toLowerCase().includes(s)) ||
          (x.oldRefs ?? []).some((rf) => rf.toLowerCase().includes(s)), // old label still finds it
      );
    }
    return r;
  }, [q.data, search]);
  const total = rows.reduce((s, r) => s + r.qty, 0);

  return (
    <div className="px-9 py-7">
      <div className="text-[11px] uppercase tracking-[0.18em] text-primary font-semibold mb-1.5">
        Ops Panel
      </div>
      <h1 className="text-[28px] font-display font-bold text-base-900 mb-2">Reserved Stock</h1>
      <p className="text-[13px] text-base-600 mb-6 max-w-3xl">
        Units committed to a customer — <strong>not sellable</strong>. Search also
        matches <em>old</em> refs (sticker on the box may still show the previous
        ref). Actions: <strong>Release</strong> (back to free), <strong>Reassign</strong>{" "}
        (new ref, old kept for warehouse), <strong>Take out</strong> (committed
        stock-out).
      </p>

      <div className="flex gap-2.5 items-center mb-4">
        <input
          type="search"
          placeholder="Search model / SKU / customer ref (incl. old)…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input flex-1 max-w-md text-[12px] px-2.5 py-1"
        />
        <div className="text-[12px] text-base-500 ml-auto">
          {q.isLoading ? "…" : `${total} reserved units · ${rows.length} lines`}
        </div>
      </div>

      {q.isError && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-[12px] text-destructive">
          {q.error instanceof Error ? q.error.message : "Load failed"}
        </div>
      )}
      {q.data && rows.length === 0 && !q.isLoading && (
        <div className="card p-9 text-center text-[12px] text-base-500 italic">No reserved stock.</div>
      )}

      {rows.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div
            className="grid gap-3 px-4 py-2 bg-base-50 border-b border-base-200 text-[10px] uppercase tracking-wider text-base-500 font-semibold"
            style={{ gridTemplateColumns: "1.5fr 80px 70px 60px 1.3fr 190px" }}
          >
            <div>Model</div>
            <div>Category</div>
            <div>Size</div>
            <div className="text-right">Qty</div>
            <div>Reserved for (ref)</div>
            <div className="text-right">Actions</div>
          </div>
          <div className="max-h-[600px] overflow-auto">
            {rows.map((r, i) => (
              <div
                key={`${r.sku}-${i}`}
                className="grid gap-3 px-4 py-2 border-t border-base-100 text-[12px] items-center"
                style={{ gridTemplateColumns: "1.5fr 80px 70px 60px 1.3fr 190px" }}
              >
                <div className="min-w-0">
                  <div className="text-base-900 truncate">{r.model}</div>
                  <div className="text-[10px] font-mono text-base-400 truncate">{r.sku}</div>
                </div>
                <div className="text-[10px] uppercase tracking-wide text-base-600">{r.category}</div>
                <div className="text-base-700 truncate">{r.size}</div>
                <div className="text-right font-mono font-bold text-[#9a6700]">{r.qty}</div>
                <div className="min-w-0">
                  <div className="font-mono text-[11.5px] text-base-800 truncate">
                    {r.refs?.length ? r.refs.join(", ") : "—"}
                  </div>
                  {r.oldRefs && r.oldRefs.length > 0 && (
                    <div className="text-[10px] text-base-400 truncate">
                      was: {r.oldRefs.join(", ")}
                    </div>
                  )}
                </div>
                <div className="text-right flex gap-1 justify-end">
                  {(["release", "reassign", "takeout"] as ActionKind[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      className="btn-secondary text-[10.5px] py-1 px-1.5"
                      onClick={() => {
                        setAct({ row: r, kind: k });
                        setRefPick(r.refs?.[0] ?? "");
                        setNewRef("");
                      }}
                    >
                      {k === "release" ? "Release" : k === "reassign" ? "Reassign" : "Take out"}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {act && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setAct(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-2xl z-50 p-5 w-[440px]">
            <div className="text-[15px] font-semibold text-base-900 mb-1">
              {act.kind === "release"
                ? "Release unit → free"
                : act.kind === "reassign"
                  ? "Reassign to a new ref"
                  : "Take out (committed stock-out)"}
            </div>
            <div className="text-[12px] text-base-600 mb-4">
              {act.row.model} · {act.row.size} · {act.row.qty} reserved
            </div>

            <label className="block text-[10px] uppercase tracking-wider text-base-500 font-semibold mb-1">
              Which reserved ref?
            </label>
            <select
              value={refPick}
              onChange={(e) => setRefPick(e.target.value)}
              className="input w-full text-[13px] px-3 py-2 mb-3"
            >
              {(act.row.refs ?? []).map((rf) => (
                <option key={rf} value={rf}>
                  {rf}
                </option>
              ))}
            </select>

            {act.kind === "reassign" && (
              <>
                <label className="block text-[10px] uppercase tracking-wider text-base-500 font-semibold mb-1">
                  New ref (old one stays searchable for warehouse)
                </label>
                <input
                  type="text"
                  autoFocus
                  placeholder="e.g. CR9999"
                  value={newRef}
                  onChange={(e) => setNewRef(e.target.value)}
                  className="input w-full text-[13px] px-3 py-2 mb-3"
                />
              </>
            )}

            {act.kind === "takeout" && (
              <div className="text-[11.5px] text-base-600 bg-base-50 rounded p-2.5 mb-3">
                ⚠ This commits a physical stock-out: status → sold, writes a
                movement, decrements warehouse balance. Not reversible from here.
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary text-[12px] px-3 py-1.5"
                onClick={() => setAct(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary text-[12px] px-4 py-1.5"
                disabled={
                  !refPick ||
                  (act.kind === "reassign" && !newRef.trim()) ||
                  mut.isPending
                }
                onClick={() => mut.mutate()}
              >
                {mut.isPending
                  ? "Working…"
                  : act.kind === "release"
                    ? "Confirm release"
                    : act.kind === "reassign"
                      ? "Confirm reassign"
                      : "Confirm take-out"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

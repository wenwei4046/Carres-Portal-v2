import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "@/lib/api";

/**
 * Phase 10 · BD · Dealers list — `reference/proto/bd-dealers.jsx`
 * L7-89 pixel parity. Closes Phase 8 deferred work (proto's drill-down
 * chain Dashboard → Dealers → Dealer detail → Order detail). Read-only.
 */

type DealerRow = {
  id: string;
  name: string;
  region: string | null;
  contact: string | null;
  status: "active" | "pending" | "suspended" | "rejected";
  joinedDate: string | null;
  orderCount: number;
  gmv: number;
  outstanding: number;
};

const STATUS_TABS = ["all", "active", "pending", "suspended"] as const;
const SORT_OPTIONS = [
  { v: "gmv",         l: "GMV" },
  { v: "orders",      l: "Orders" },
  { v: "outstanding", l: "Outstanding" },
  { v: "name",        l: "Name" },
] as const;

export default function BDDealers() {
  const { data, isLoading } = useQuery<{ dealers: DealerRow[] }>({
    queryKey: ["bd", "dealers"],
    queryFn: () => apiFetch("/api/bd/dealers"),
  });
  const dealers = data?.dealers ?? [];

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<(typeof STATUS_TABS)[number]>("all");
  const [sort, setSort] = useState<(typeof SORT_OPTIONS)[number]["v"]>("gmv");

  const filtered = useMemo(() => {
    return dealers.filter((d) => {
      if (statusFilter !== "all" && d.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !d.name.toLowerCase().includes(q) &&
          !(d.region ?? "").toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [dealers, statusFilter, search]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    if (sort === "gmv") list.sort((a, b) => b.gmv - a.gmv);
    else if (sort === "orders") list.sort((a, b) => b.orderCount - a.orderCount);
    else if (sort === "outstanding") list.sort((a, b) => b.outstanding - a.outstanding);
    else if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [filtered, sort]);

  const counts = {
    active: dealers.filter((d) => d.status === "active").length,
    pending: dealers.filter((d) => d.status === "pending").length,
    suspended: dealers.filter((d) => d.status === "suspended").length,
  };

  return (
    <div className="px-9 py-8 pb-14">
      <div className="mb-[22px]">
        <div className="kicker">BD · Network</div>
        <h1 className="font-display text-[30px] leading-[1.05] mt-1.5 tracking-[-0.025em] font-semibold">
          Dealers
        </h1>
        <div className="text-[13px] text-base-600 mt-1.5">
          {counts.active} active · {counts.pending} pending · {counts.suspended} suspended
        </div>
      </div>

      <div className="flex gap-2 mb-3.5 flex-wrap items-center">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search dealers or regions…"
          className="flex-1 min-w-[260px] px-3 py-2 border border-base-200 rounded text-[13px] bg-white outline-none focus:border-base-700"
        />
        <div className="flex gap-1 p-1 bg-base-100 rounded">
          {STATUS_TABS.map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 text-[11.5px] rounded cursor-pointer capitalize ${
                statusFilter === f
                  ? "bg-white text-base-900 font-semibold"
                  : "text-base-600 font-medium"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="px-2.5 py-2 border border-base-200 rounded text-[12px] bg-white"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.v} value={o.v}>Sort · {o.l}</option>
          ))}
        </select>
      </div>

      <div className="bg-white border border-base-200 rounded overflow-auto">
        <table className="w-full border-collapse text-[13px]" style={{ minWidth: 880 }}>
          <thead>
            <tr className="bg-base-50 border-b border-base-200">
              <Th>Dealer</Th>
              <Th>Region</Th>
              <Th right>Orders</Th>
              <Th right>GMV</Th>
              <Th right>Outstanding</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7} className="p-10 text-center text-[12px] text-base-500">Loading…</td></tr>
            )}
            {!isLoading && sorted.length === 0 && (
              <tr><td colSpan={7} className="p-10 text-center text-[12px] text-base-500">No dealers match those filters.</td></tr>
            )}
            {sorted.map((d) => (
              <tr key={d.id} className="border-t border-base-100 hover:bg-base-50 transition-colors">
                <td className="px-4 py-3">
                  <Link to={`/bd/dealers/${d.id}`} className="block hover:no-underline">
                    <div className="font-semibold text-base-900">{d.name}</div>
                    <div className="text-[11px] text-base-500 mt-0.5">{d.contact ?? "—"}</div>
                  </Link>
                </td>
                <td className="px-4 py-3 text-base-700">{d.region ?? "—"}</td>
                <td className="px-4 py-3 text-right font-mono">{d.orderCount}</td>
                <td className="px-4 py-3 text-right font-semibold font-mono">
                  RM {(d.gmv / 1000).toFixed(1)}k
                </td>
                <td className={`px-4 py-3 text-right font-mono ${d.outstanding > 0 ? "text-primary" : "text-base-500"}`}>
                  {d.outstanding > 0 ? `RM ${d.outstanding.toLocaleString()}` : "—"}
                </td>
                <td className="px-4 py-3">
                  <StatusPill status={d.status} />
                </td>
                <td className="px-4 py-3 text-right text-base-400">
                  <Link to={`/bd/dealers/${d.id}`}>›</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-base-500 ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function StatusPill({ status }: { status: DealerRow["status"] }) {
  const map = {
    active:    { l: "Active",    bg: "bg-success-soft",  c: "text-success" },
    pending:   { l: "Pending",   bg: "bg-primary/10",    c: "text-primary" },
    suspended: { l: "Suspended", bg: "bg-base-200",      c: "text-base-700" },
    rejected:  { l: "Rejected",  bg: "bg-base-100",      c: "text-base-500" },
  } as const;
  const m = map[status] ?? map.active;
  return (
    <span className={`inline-block text-[10px] px-2 py-[2px] rounded uppercase font-semibold tracking-[0.06em] ${m.bg} ${m.c}`}>
      {m.l}
    </span>
  );
}

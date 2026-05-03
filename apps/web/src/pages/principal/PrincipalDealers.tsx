import { useMemo, useState } from "react";
import { usePrincipalDealers } from "@/lib/queries";
import DealerRow, { type DealerListItem } from "./components/DealerRow";
import DealerDrawer from "./components/DealerDrawer";
import InviteDealerModal from "./components/InviteDealerModal";

/**
 * Principal · Dealers admin — Phase 3 M5 (Tasks 22-26). Mirrors
 * `reference/proto/principal-dealers.jsx` lines 4-106.
 *
 * Layout (top → bottom):
 *   1. Header — "HQ · Network" kicker + title + counts + Invite button
 *   2. Search input + status filter (pill group: all/active/pending/suspended/rejected)
 *   3. Table of dealers OR empty placeholder
 *   4. Drawer (when openId set) + invite modal (when showInvite true)
 *
 * Filtering is client-side: the server returns the full roster (one RPC,
 * SECURITY DEFINER) and the user usually has < 100 dealers — no need for
 * a per-filter round-trip. Counts in the header are from the unfiltered
 * roster so they stay stable as the user toggles tabs.
 *
 * The proto's filter group only had four buttons (no rejected); we add
 * 'rejected' since the schema supports rejected new_dealer approvals
 * flipping a dealer row to status='rejected' (see DealerStatusPill).
 */
type StatusFilter = "all" | "active" | "pending" | "suspended" | "rejected";

export default function PrincipalDealers() {
  const { data, isLoading } = usePrincipalDealers();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);

  // The hook's PrincipalDealerRow type is a structural superset of the row's
  // local DealerListItem (camelCase fields match), so the cast is safe and
  // keeps the row component decoupled from the queries module.
  const dealers: DealerListItem[] = (data?.dealers ?? []) as DealerListItem[];

  const filtered = useMemo(() => {
    return dealers.filter((d) => {
      if (statusFilter !== "all" && d.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !d.name.toLowerCase().includes(q) &&
          !d.region.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [dealers, search, statusFilter]);

  if (isLoading || !data) {
    return (
      <div className="px-9 py-8 text-sm text-muted-foreground">Loading…</div>
    );
  }

  const counts = {
    active: dealers.filter((d) => d.status === "active").length,
    pending: dealers.filter((d) => d.status === "pending").length,
    suspended: dealers.filter((d) => d.status === "suspended").length,
  };

  return (
    <div className="px-9 py-8 pb-14">
      <div className="flex justify-between items-start mb-5">
        <div>
          <div className="kicker">HQ · Network</div>
          <h1 className="font-display text-[30px] leading-[1.05] mt-1.5 tracking-tight font-semibold">
            Dealers
          </h1>
          <div className="text-[13px] text-base-600 mt-1.5">
            {counts.active} active · {counts.pending} pending ·{" "}
            {counts.suspended} suspended
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowInvite(true)}
          className="btn-primary"
        >
          + Invite dealer
        </button>
      </div>

      <div className="flex gap-2 mb-3.5 items-center">
        <input
          type="search"
          placeholder="Search dealers or regions…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-3 py-2 border border-base-200 rounded text-[13px] outline-none"
        />
        <div className="flex gap-1 p-1 bg-base-100 rounded">
          {(
            ["all", "active", "pending", "suspended", "rejected"] as StatusFilter[]
          ).map((f) => {
            const isActive = statusFilter === f;
            const cls = isActive
              ? "px-2.5 py-1 text-[11.5px] rounded-sm capitalize bg-white font-semibold text-base-900 cursor-pointer border-0"
              : "px-2.5 py-1 text-[11.5px] rounded-sm capitalize text-base-600 font-medium cursor-pointer bg-transparent border-0";
            return (
              <button
                key={f}
                type="button"
                onClick={() => setStatusFilter(f)}
                className={cls}
              >
                {f}
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-base-200 rounded-md p-12 text-center text-base-500">
          <div className="text-[32px] mb-2 text-base-300">—</div>
          <div className="font-display text-[18px]">No dealers</div>
          <div className="text-[12px] mt-1">
            Try another filter or invite a new dealer.
          </div>
        </div>
      ) : (
        <div className="bg-white border border-base-200 rounded-md overflow-auto">
          <table
            className="w-full border-collapse text-[13px]"
            style={{ minWidth: 800 }}
          >
            <thead>
              <tr className="bg-base-50 border-b border-base-200">
                <Th>Dealer</Th>
                <Th>Region</Th>
                <Th>Joined</Th>
                <Th right>Orders</Th>
                <Th right>GMV</Th>
                <Th right>Outstanding</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <DealerRow key={d.id} d={d} onOpen={() => setOpenId(d.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openId && (
        <DealerDrawer dealerId={openId} onClose={() => setOpenId(null)} />
      )}
      {showInvite && (
        <InviteDealerModal onClose={() => setShowInvite(false)} />
      )}
    </div>
  );
}

function Th({
  children,
  right,
}: {
  children?: React.ReactNode;
  right?: boolean;
}) {
  return (
    <th
      className={`px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-base-500 ${
        right ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

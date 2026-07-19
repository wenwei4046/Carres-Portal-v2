import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isShowroom, type StoreChannel } from "@carres/shared";
import { usePrincipalDealers } from "@/lib/queries";
import DealerRow, { type DealerListItem } from "./components/DealerRow";
import DealerDrawer from "./components/DealerDrawer";
import InviteDealerModal from "./components/InviteDealerModal";

/**
 * Principal · store network admin — Phase 3 M5 (Tasks 22-26). Mirrors
 * `reference/proto/principal-dealers.jsx` lines 4-106.
 *
 * 2026-07-19 (Loo) — ONE component, TWO pages. Dealers (external resellers)
 * and Showrooms (Carres' own stores) are both `dealers` rows told apart by
 * `dealers.channel`, and they used to be listed together, which read as if
 * our own Kelana Jaya showroom were somebody else's dealership. The sidebar
 * now has a separate entry for each and this page filters to one `channel`;
 * every user-facing noun comes off that same prop.
 *
 * Layout (top → bottom):
 *   1. Header — kicker + title + counts + the create button for this channel
 *   2. Search input + status filter (pill group: all/active/pending/suspended/rejected)
 *   3. Table of stores OR empty placeholder
 *   4. Drawer (when openId set) + invite modal (dealers only)
 *
 * Filtering is client-side: the server returns the full roster (one RPC,
 * SECURITY DEFINER) and the user usually has < 100 stores — no need for
 * a per-filter round-trip. Counts in the header are from the unfiltered
 * roster of THIS channel so they stay stable as the user toggles tabs.
 *
 * The proto's filter group only had four buttons (no rejected); we add
 * 'rejected' since the schema supports rejected new_dealer approvals
 * flipping a dealer row to status='rejected' (see DealerStatusPill).
 */
type StatusFilter = "all" | "active" | "pending" | "suspended" | "rejected";

export default function PrincipalDealers({ channel }: { channel: StoreChannel }) {
  const { data, isLoading } = usePrincipalDealers();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);

  const showroomPage = isShowroom(channel);
  // Nouns + copy for this channel. A showroom IS a single store of ours, so
  // it has no "outlets" column — a dealer's branches are outlets, and our own
  // branches are the showrooms themselves.
  const t = showroomPage
    ? {
        kicker: "HQ · Our stores",
        title: "Showrooms",
        blurb: "Carres' own stores. Dealers are listed separately.",
        cta: "+ New showroom",
        searchPlaceholder: "Search showrooms…",
        nameCol: "Showroom",
        empty: "No showrooms",
        emptyHint: "Try another filter, or open a new showroom.",
      }
    : {
        kicker: "HQ · Network",
        title: "Dealers",
        blurb: "External resellers. Our own showrooms are listed separately.",
        cta: "+ Invite dealer",
        searchPlaceholder: "Search dealers or regions…",
        nameCol: "Dealer",
        empty: "No dealers",
        emptyHint: "Try another filter or invite a new dealer.",
      };

  // The hook's PrincipalDealerRow type is a structural superset of the row's
  // local DealerListItem (camelCase fields match), so the cast is safe and
  // keeps the row component decoupled from the queries module.
  const all: DealerListItem[] = (data?.dealers ?? []) as DealerListItem[];
  const dealers = useMemo(
    () => all.filter((d) => isShowroom(d.channel) === showroomPage),
    [all, showroomPage],
  );

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
          <div className="kicker">{t.kicker}</div>
          <h1 className="font-display text-[30px] leading-[1.05] mt-1.5 tracking-tight font-semibold">
            {t.title}
          </h1>
          <div className="text-[13px] text-base-600 mt-1.5">
            {counts.active} active · {counts.pending} pending ·{" "}
            {counts.suspended} suspended
          </div>
          <div className="text-[12px] text-base-500 mt-1">{t.blurb}</div>
        </div>
        {/* A dealer is invited (pending → approval); a showroom is ours, so it
            is born straight out of Accounts with its login + first staff PIN. */}
        <button
          type="button"
          onClick={() =>
            showroomPage
              ? navigate("/principal?tab=accounts&new=showroom")
              : setShowInvite(true)
          }
          className="btn-primary"
        >
          {t.cta}
        </button>
      </div>

      <div className="flex gap-2 mb-3.5 items-center">
        <input
          type="search"
          placeholder={t.searchPlaceholder}
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
          <div className="font-display text-[18px]">{t.empty}</div>
          <div className="text-[12px] mt-1">{t.emptyHint}</div>
        </div>
      ) : (
        <div className="bg-white border border-base-200 rounded-md overflow-auto">
          <table
            className="w-full border-collapse text-[13px]"
            style={{ minWidth: 800 }}
          >
            <thead>
              <tr className="bg-base-50 border-b border-base-200">
                <Th>{t.nameCol}</Th>
                <Th>Region</Th>
                {!showroomPage && <Th right>Outlets</Th>}
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
                <DealerRow
                  key={d.id}
                  d={d}
                  showOutlets={!showroomPage}
                  onOpen={() => setOpenId(d.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openId && (
        <DealerDrawer dealerId={openId} onClose={() => setOpenId(null)} />
      )}
      {/* Dealer page only — the showroom CTA navigates to Accounts instead. */}
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

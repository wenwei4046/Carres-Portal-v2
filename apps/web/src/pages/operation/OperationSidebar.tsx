import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import CarresLockup from "@/components/CarresLockup";
import NavBadge from "@/components/NavBadge";
import { useOperationBadges, useMarkOperationBadgeSeen } from "@/lib/queries";

/**
 * operation sidebar — 5 nav items per spec §18.7, all enabled in Phase 4 MVP
 * (no disabled stubs). Pixel sizes mirror the Phase 3 PrincipalSidebar so the
 * HQ shell stays visually consistent across roles. Active items show a 3px
 * terracotta accent bar on the left + base-100 fill + base-900 text.
 */
interface NavItem {
  k: string;
  t: string;
  icon: string;
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Pulse",
    items: [
      { k: "dashboard", t: "Dashboard", icon: "◆" },
    ],
  },
  {
    label: "Pipeline",
    items: [
      { k: "orders", t: "Orders", icon: "▣" },
      { k: "procurement", t: "Procurement", icon: "▦" },
    ],
  },
  {
    label: "Stock",
    items: [
      { k: "warehouse", t: "Warehouse", icon: "□" },
      { k: "movements", t: "Movements", icon: "≡" },
    ],
  },
  {
    // 0074 catalog admin (Loo 2026-05-09 Q1=b, Q2=c). Same page mounts under
    // /principal/catalog too — RLS write covers both roles via is_internal().
    label: "Catalog",
    items: [
      { k: "catalog", t: "SKU Catalog", icon: "▭" },
    ],
  },
];

interface Props {
  active: string;
  onChange: (k: string) => void;
}

export default function OperationSidebar({ active, onChange }: Props) {
  const session = useAuth((s) => s.session);
  const email = session?.user?.email ?? "";
  const initials = email.slice(0, 2).toUpperCase();
  // Loo 2026-05-10 — sidebar action-count badges. Failures/loading degrade
  // silently to 0 (no badge render) so a transient API hiccup doesn't break
  // the nav.
  const badgesQ = useOperationBadges();
  const badgeCount: Record<string, number> = {
    orders: badgesQ.data?.orders ?? 0,
    procurement: badgesQ.data?.procurement ?? 0,
  };
  // Mark-seen mutation (Loo 2026-05-11). Fires on click for keys that have
  // a badge counter — optimistically zeros the count so the orange dot
  // disappears instantly. Server reconciles on the next 30s poll if any
  // items advanced between click and ack.
  const markSeen = useMarkOperationBadgeSeen();
  const BADGE_KEYS = new Set(["orders", "procurement"]);

  return (
    <aside
      className="bg-white border-r border-base-200 py-5 flex flex-col h-screen sticky top-0"
      style={{ width: 232 }}
    >
      <div className="px-[22px] pb-[18px]">
        <button
          onClick={() => onChange("dashboard")}
          className="block text-left bg-transparent border-0 p-0 cursor-pointer"
          title="Back to dashboard"
        >
          <CarresLockup showPortal={false} />
        </button>
      </div>

      <nav className="flex-1 px-3 pt-5 pb-1 flex flex-col gap-3.5 overflow-auto">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="px-3.5 pb-1.5 text-[9px] uppercase tracking-[0.16em] text-base-500 font-semibold">
              {group.label}
            </div>
            <div className="flex flex-col gap-px">
              {group.items.map((n) => {
                const isActive = active === n.k;
                const baseCls =
                  "relative w-full text-left px-3.5 py-[9px] rounded text-[13px] flex items-center gap-[11px]";
                const cls = isActive
                  ? `${baseCls} bg-base-100 text-base-900 font-semibold cursor-pointer`
                  : `${baseCls} text-base-600 font-medium hover:bg-base-50 cursor-pointer`;
                return (
                  <button
                    key={n.k}
                    type="button"
                    onClick={() => {
                      onChange(n.k);
                      if (BADGE_KEYS.has(n.k) && (badgeCount[n.k] ?? 0) > 0) {
                        markSeen.mutate(n.k as "orders" | "procurement");
                      }
                    }}
                    className={cls}
                  >
                    {isActive && (
                      <span
                        className="absolute left-0 top-[7px] bottom-[7px] bg-primary rounded-r-sm"
                        style={{ width: 3 }}
                      />
                    )}
                    <span
                      className={`w-4 text-center text-[13px] ${
                        isActive ? "text-primary" : "text-base-400"
                      }`}
                    >
                      {n.icon}
                    </span>
                    <span className="flex-1">{n.t}</span>
                    {/* Loo 2026-05-11: badge now uses "unread since last view"
                        semantics — count = items where updated_at >
                        user_nav_seen.last_seen_at. Click fires mark-seen +
                        optimistic zero, so the dot clears immediately. */}
                    <NavBadge count={badgeCount[n.k] ?? 0} label={n.t} />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <Link
        to="/me"
        title="Profile · Sign out"
        className="px-[22px] py-4 border-t border-base-100 flex items-center gap-2.5 hover:bg-base-50 transition-colors"
      >
        <div className="w-[34px] h-[34px] rounded-full bg-base-900 text-white grid place-items-center text-[11px] font-semibold">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-base-900 truncate">{email}</div>
          <div className="text-[9.5px] text-base-500 uppercase tracking-[0.1em] mt-px">
            operation
          </div>
        </div>
      </Link>
    </aside>
  );
}

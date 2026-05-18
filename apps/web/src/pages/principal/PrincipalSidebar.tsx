import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import CarresLockup from "@/components/CarresLockup";

/**
 * Principal sidebar — 5 nav groups, 3 active tabs (dashboard / approvals /
 * dealers) and 6 disabled stubs gated by phase number. Pixel sizes mirror
 * `reference/proto/principal.jsx` exactly. Active items show a 3px terracotta
 * accent bar on the left + base-100 fill + base-900 text. Disabled items
 * dim to base-400 with a hover tooltip pointing at the planned phase.
 *
 * The Approvals item gets a pending-count pill (mono, terracotta fill) when
 * the dashboard summary reports any pending approvals.
 */
interface NavItem {
  k: string;
  t: string;
  icon: string;
  enabled: boolean;
  phase?: string;
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Pulse",
    items: [
      { k: "dashboard", t: "Dashboard", icon: "◆", enabled: true },
      { k: "approvals", t: "Approvals", icon: "◉", enabled: true },
    ],
  },
  {
    label: "Network",
    items: [
      { k: "dealers", t: "Dealers", icon: "▤", enabled: true },
      { k: "partners", t: "operation Partners", icon: "▦", enabled: true },
      { k: "suppliers", t: "Suppliers", icon: "▥", enabled: false, phase: "Phase 6" },
    ],
  },
  {
    label: "Catalog",
    items: [
      // 0074 catalog admin (Loo 2026-05-09 Q1=b, Q2=c) — promoted from
      // Phase-5 stub to live link; same page also mounts under
      // /operation/catalog. RLS write covers principal+operation via
      // is_internal().
      { k: "catalog", t: "Catalog & Pricing", icon: "▭", enabled: true },
    ],
  },
  {
    label: "Records",
    items: [
      { k: "orders", t: "All orders", icon: "▣", enabled: false, phase: "Phase 5" },
      { k: "stock", t: "Stock", icon: "□", enabled: false, phase: "Phase 4" },
      { k: "audit", t: "Audit log", icon: "≡", enabled: true },
    ],
  },
  {
    label: "Admin",
    items: [
      { k: "accounts", t: "Accounts", icon: "◐", enabled: true },
    ],
  },
];

interface Props {
  active: string;
  onChange: (k: string) => void;
  pendingCount: number;
}

export default function PrincipalSidebar({ active, onChange, pendingCount }: Props) {
  const session = useAuth((s) => s.session);
  const email = session?.user?.email ?? "";
  const initials = email.slice(0, 2).toUpperCase();

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
                const showBadge = n.k === "approvals" && pendingCount > 0;
                const baseCls =
                  "relative w-full text-left px-3.5 py-[9px] rounded text-[13px] flex items-center gap-[11px]";
                const cls = !n.enabled
                  ? `${baseCls} text-base-400 cursor-not-allowed`
                  : isActive
                    ? `${baseCls} bg-base-100 text-base-900 font-semibold cursor-pointer`
                    : `${baseCls} text-base-600 font-medium hover:bg-base-50 cursor-pointer`;
                return (
                  <button
                    key={n.k}
                    type="button"
                    disabled={!n.enabled}
                    onClick={() => n.enabled && onChange(n.k)}
                    title={!n.enabled ? `Coming in ${n.phase}` : undefined}
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
                    {showBadge && (
                      <span
                        className="font-mono bg-primary text-primary-foreground rounded-full px-[7px] py-px text-[10px] font-bold text-center"
                        style={{ minWidth: 16 }}
                      >
                        {pendingCount}
                      </span>
                    )}
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
            Principal
          </div>
        </div>
      </Link>
    </aside>
  );
}

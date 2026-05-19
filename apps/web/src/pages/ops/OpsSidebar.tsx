import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import CarresLockup from "@/components/CarresLockup";

interface NavItem {
  k: string;
  t: string;
  icon: string;
  disabled?: boolean;
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Pulse",
    items: [{ k: "dashboard", t: "Dashboard", icon: "◆" }],
  },
  {
    label: "Orders",
    items: [
      { k: "order-import", t: "Import (AutoCount)", icon: "↥" },
      { k: "order-inbox", t: "Inbox", icon: "▣" },
      { k: "order-pipeline", t: "Pipeline", icon: "≣" },
      { k: "order-annotation", t: "Annotation", icon: "✎", disabled: true },
    ],
  },
  {
    label: "Stock",
    items: [
      { k: "ready-stock", t: "Ready Stock", icon: "★" },
      { k: "stock-reserved", t: "Reserved", icon: "◐" },
      { k: "stock-repair", t: "Repair / Return", icon: "⚠" },
      { k: "stock-inventory", t: "Inventory", icon: "□" },
      { k: "stock-transfer", t: "Transfer", icon: "⇄" },
      { k: "stock-adjust", t: "Adjust (Excel)", icon: "✎", disabled: true },
    ],
  },
  {
    label: "Customer Care",
    items: [
      { k: "balance", t: "Balance", icon: "$", disabled: true },
      { k: "returns", t: "Returns", icon: "↩", disabled: true },
      { k: "service-notes", t: "Service Notes", icon: "🎟", disabled: true },
      { k: "issues", t: "Issue Tracker", icon: "🚨", disabled: true },
    ],
  },
  {
    label: "Suppliers",
    items: [
      { k: "supplier-meetings", t: "Meetings", icon: "🤝", disabled: true },
    ],
  },
  {
    label: "Team",
    items: [
      { k: "activity", t: "Activity Log", icon: "≡" },
      { k: "reports", t: "Reports", icon: "▦", disabled: true },
    ],
  },
];

interface Props {
  active: string;
  onChange: (k: string) => void;
}

export default function OpsSidebar({ active, onChange }: Props) {
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
        <div className="text-[10px] uppercase tracking-[0.18em] text-primary font-semibold mt-1.5">
          Ops Panel
        </div>
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
                const cls = n.disabled
                  ? `${baseCls} text-base-400 cursor-not-allowed`
                  : isActive
                    ? `${baseCls} bg-base-100 text-base-900 font-semibold cursor-pointer`
                    : `${baseCls} text-base-600 font-medium hover:bg-base-50 cursor-pointer`;
                return (
                  <button
                    key={n.k}
                    type="button"
                    disabled={n.disabled}
                    onClick={() => !n.disabled && onChange(n.k)}
                    className={cls}
                    title={n.disabled ? "Coming in later phase" : n.t}
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
                    {n.disabled && (
                      <span className="text-[8px] uppercase tracking-wider text-base-400">
                        soon
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
            Ops
          </div>
        </div>
      </Link>
    </aside>
  );
}

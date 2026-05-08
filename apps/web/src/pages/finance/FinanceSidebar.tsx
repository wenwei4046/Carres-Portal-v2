import { Link, NavLink } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import CarresLockup from "@/components/CarresLockup";

/**
 * Finance (HQ Internal) sidebar — matches `reference/proto/finance.jsx:51-145`
 * 4-group structure: Overview / Receivables & Payables / Documents / Books.
 *
 * 8 tabs — though Chunk A only ships 5 pages (Dashboard / AR / AP / Payments /
 * Invoices). Refunds + Recon + Reports are stubbed in Chunk B/C; their nav
 * items render but click navigates to a placeholder for now (TODO follow-up
 * once those pages land).
 */
const NAV_GROUPS = [
  {
    label: "Overview",
    items: [
      { to: "/finance/dashboard", label: "Dashboard", icon: "◇" },
    ],
  },
  {
    label: "Receivables & Payables",
    items: [
      { to: "/finance/ar",       label: "AR · Receivables", icon: "↘" },
      { to: "/finance/ap",       label: "AP · Payables",    icon: "↗" },
      { to: "/finance/payments", label: "Order Payments",   icon: "▤" },
    ],
  },
  {
    label: "Documents",
    items: [
      { to: "/finance/invoices", label: "Invoices",          icon: "▣" },
      { to: "/finance/refunds",  label: "Refunds & Credits", icon: "↩" },
    ],
  },
  {
    label: "Books",
    items: [
      { to: "/finance/recon",   label: "Reconciliation", icon: "≡" },
      { to: "/finance/reports", label: "Reports",        icon: "▥" },
    ],
  },
] as const;

export default function FinanceSidebar() {
  const session = useAuth((s) => s.session);
  const email = session?.user?.email ?? "";
  const initials = email.slice(0, 2).toUpperCase();

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[240px] bg-card border-r border-border flex flex-col py-[22px] z-10 overflow-auto">
      <div className="px-[22px] pb-[18px] border-b border-border">
        <Link to="/finance/dashboard" className="block">
          <CarresLockup />
        </Link>
      </div>

      <nav className="flex-1 px-3 pt-5 pb-1 flex flex-col gap-3.5">
        {NAV_GROUPS.map((g) => (
          <div key={g.label}>
            <div className="text-[9px] uppercase tracking-[0.06em] font-semibold text-muted-foreground px-2 pb-1">
              {g.label}
            </div>
            <div className="flex flex-col gap-px">
              {g.items.map((it) => (
                <NavItem key={it.to} item={it} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <Link
        to="/me"
        title="Profile · Sign out"
        className="px-[18px] pt-3 pb-1 border-t border-border flex items-center gap-2.5 hover:bg-accent/40 transition-colors"
      >
        <div className="w-[30px] h-[30px] rounded bg-primary text-primary-foreground grid place-items-center text-[11px] font-semibold flex-shrink-0">
          {initials || "FM"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold truncate">{email || "Finance Manager"}</div>
          <div className="text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground mt-px">
            HQ · Read &amp; Record
          </div>
        </div>
      </Link>
    </aside>
  );
}

function NavItem({ item }: { item: { to: string; label: string; icon: string } }) {
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        `relative flex items-center gap-2.5 px-3 py-2 rounded-md text-[12.5px] font-semibold ${
          isActive
            ? "text-foreground bg-secondary"
            : "text-muted-foreground hover:bg-accent/50"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-primary rounded-r" />
          )}
          <span className={`w-3.5 text-center text-[13px] ${isActive ? "text-primary" : ""}`}>
            {item.icon}
          </span>
          <span>{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

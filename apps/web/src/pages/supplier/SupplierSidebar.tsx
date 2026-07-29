import { Link, NavLink } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import CarresLockup from "@/components/CarresLockup";
import { useSupplierPos } from "@/lib/queries";

/**
 * Supplier portal sidebar — matches `reference/proto/supplier.jsx:27-108`
 * 4-tab structure with badge counts on Incoming + PO.
 *
 * Badges:
 *   PO       — pending sup_status count (POs awaiting acknowledgement)
 *   Incoming — defer to live data once SupplierIncoming wires the orders
 *              forecast endpoint; show 0 for now.
 */
const NAV_ITEMS = [
  { to: "/supplier/dashboard", label: "Dashboard", icon: "◇" },
  { to: "/supplier/incoming",  label: "Incoming",  icon: "↘" },
  { to: "/supplier/pos",       label: "Purchase Orders", icon: "▤", badgeKey: "pending" as const },
  { to: "/supplier/sku",       label: "Total SKU", icon: "▣" },
];

export default function SupplierSidebar() {
  const session = useAuth((s) => s.session);
  const email = session?.user?.email ?? "";
  const initials = email.slice(0, 2).toUpperCase();

  // Pull "po"-bucket count once for the PO tab badge. Filtered to pending
  // sup_status only (per proto:32 — "incoming POs awaiting acknowledgement").
  const { data: pendingPos } = useSupplierPos("po");
  const pendingCount = (pendingPos ?? []).filter(
    (p) => p.sup_status === "pending",
  ).length;

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[240px] bg-card border-r border-border flex flex-col py-[22px] z-10 overflow-auto">
      <div className="px-[22px] pb-[18px] border-b border-border">
        <Link to="/supplier/dashboard" className="block">
          <CarresLockup />
        </Link>
      </div>

      <nav className="flex-1 px-3 pt-5 pb-1 flex flex-col gap-px">
        {NAV_ITEMS.map((it) => (
          <NavItem
            key={it.to}
            item={it}
            badge={it.badgeKey === "pending" ? pendingCount : 0}
          />
        ))}
      </nav>

      <Link
        to="/me"
        title="Profile · Sign out"
        className="px-[18px] pt-3 pb-1 border-t border-border flex items-center gap-2.5 hover:bg-accent/40 transition-colors"
      >
        <div className="w-[30px] h-[30px] rounded bg-primary text-primary-foreground grid place-items-center text-label font-semibold flex-shrink-0">
          {initials || "SP"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-meta font-semibold truncate">{email || "Supplier"}</div>
          <div className="text-label uppercase tracking-[0.1em] text-muted-foreground mt-px">
            Supplier · Production
          </div>
        </div>
      </Link>
    </aside>
  );
}

function NavItem({
  item,
  badge,
}: {
  item: { to: string; label: string; icon: string };
  badge: number;
}) {
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        `relative flex items-center gap-2.5 px-3 py-2 rounded-md text-meta font-semibold ${
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
          <span className={`w-3.5 text-center text-body ${isActive ? "text-primary" : ""}`}>
            {item.icon}
          </span>
          <span className="flex-1">{item.label}</span>
          {badge > 0 && (
            <span className="font-mono text-label font-semibold px-1.5 py-px rounded-full bg-primary text-primary-foreground">
              {badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

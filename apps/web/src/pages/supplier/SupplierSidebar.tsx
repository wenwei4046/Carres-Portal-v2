import { Menu } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import Drawer from "@/components/kit/Drawer";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const { pathname } = useLocation();
  useEffect(() => setMenuOpen(false), [pathname]); // a chosen page closes the drawer
  // Growing to desktop width shows the sidebar, so a drawer left open must close.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const close = () => mq.matches && setMenuOpen(false);
    mq.addEventListener("change", close);
    return () => mq.removeEventListener("change", close);
  }, []);

  return (
    <>
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-[240px] bg-card border-r border-border flex-col py-[22px] z-10 overflow-auto">
        <div className="px-[22px] pb-[18px] border-b border-border">
          <Link to="/supplier/dashboard" className="block">
            <CarresLockup />
          </Link>
        </div>

        <nav aria-label="Main" className="flex-1 px-3 pt-5 pb-1 flex flex-col gap-px">
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
          <div className="w-[30px] h-[30px] rounded bg-primary text-primary-foreground grid place-items-center text-label font-bold flex-shrink-0">
            {initials || "SP"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-body font-medium truncate">{email || "Supplier"}</div>
            <div className="text-label uppercase tracking-[0.06em] text-muted-foreground mt-px">
              Supplier · Production
            </div>
          </div>
        </Link>
      </aside>
      {/* Below 768px the fixed sidebar would leave ~155px for content: a top bar
          with a menu button opens the same links in a Drawer instead. */}
      <header className="sticky top-0 z-10 flex h-[calc(3rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] pl-[max(0.75rem,env(safe-area-inset-left))] items-center gap-2 border-b border-border bg-card pr-3 md:hidden">
        <button
          type="button"
          ref={menuButton}
          aria-label="Open menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
          className="grid h-10 w-10 place-items-center rounded-md text-body hover:bg-accent/50"
        >
          <Menu aria-hidden="true" className="h-5 w-5" />
        </button>
        <Link to="/supplier/dashboard" className="block">
          <CarresLockup />
        </Link>
      </header>
      <Drawer open={menuOpen} onOpenChange={setMenuOpen} title="Menu" returnFocusRef={menuButton}>
        <nav aria-label="Menu" onClick={() => setMenuOpen(false)} className="flex-1 px-3 pt-5 pb-1 flex flex-col gap-px">
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
          onClick={() => setMenuOpen(false)}
          title="Profile · Sign out"
          className="px-[18px] pt-3 pb-1 border-t border-border flex items-center gap-2.5 hover:bg-accent/40 transition-colors"
        >
          <div className="w-[30px] h-[30px] rounded bg-primary text-primary-foreground grid place-items-center text-label font-bold flex-shrink-0">
            {initials || "SP"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-body font-medium truncate">{email || "Supplier"}</div>
            <div className="text-label uppercase tracking-[0.06em] text-muted-foreground mt-px">
              Supplier · Production
            </div>
          </div>
        </Link>
      </Drawer>
    </>
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
        `relative flex items-center gap-2.5 px-3 py-2 rounded-md text-body ${
          isActive
            ? "font-semibold text-foreground bg-secondary"
            : "font-medium text-muted-foreground hover:bg-accent/50"
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
            <span className="font-mono text-label font-bold px-1.5 py-px rounded-full bg-primary text-primary-foreground">
              {badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

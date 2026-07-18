import { Link, NavLink, Outlet } from "react-router-dom";
import CarresLockup from "@/components/CarresLockup";
import { useAuth } from "@/lib/auth";
import { useStaffSession } from "@/lib/staff";
import { useDealerSelf } from "@/lib/queries";
import StaffSwitchChip from "./staff/StaffSwitchChip";

/**
 * Back-office chrome for the dealer role — fixed left sidebar + scrollable
 * main, rendered as a React Router layout route around Orders / Products /
 * Settings. The POS order-entry flow (`/dealer` index) renders full-screen
 * WITHOUT this chrome; the sidebar's Carres lockup links back to it ("home =
 * sell"). The old "Dashboard" nav item is gone — its KPIs now live atop Orders.
 */
const NAV_ITEMS = [
  { to: "/dealer/orders", label: "Orders", icon: "▤", end: false },
  { to: "/dealer/products", label: "Products", icon: "▭", end: false },
  { to: "/dealer/settings", label: "Settings", icon: "✦", end: false },
] as const;

export default function DealerChrome() {
  const dealer = useDealerSelf();
  const userEmail = useAuth((s) => s.user?.email ?? "");
  const initials = (dealer.data?.name ?? userEmail).slice(0, 2).toUpperCase();
  const staffMember = useStaffSession((s) => s.staff);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <DealerSidebar dealerName={dealer.data?.name ?? "—"} initials={initials} />
      <main className="ml-[220px] flex-1 min-w-0">
        {/* 0233 — current-staff chip; clicking switches (→ PIN screen). Only
            shown when a PIN session is active (a linked salesperson's back-office
            or a dealer/showroom after PIN). */}
        {staffMember && (
          <div className="sticky top-0 z-20 flex justify-end px-6 py-2.5 bg-background/90 backdrop-blur border-b border-border">
            <StaffSwitchChip variant="kit" />
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}

function DealerSidebar({ dealerName, initials }: { dealerName: string; initials: string }) {
  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[220px] bg-card border-r border-border flex flex-col py-[22px] z-10">
      <div className="px-[22px] pb-6 border-b border-border mb-[14px]">
        <Link to="/dealer" className="block" title="New sale (POS)">
          <CarresLockup />
        </Link>
      </div>

      <nav className="flex-1 px-3 pt-5 pb-1 flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => (
          <NavItem key={item.to} item={item} />
        ))}
      </nav>

      <Link
        to="/me"
        title="Profile · Sign out"
        className="px-[18px] pt-[14px] pb-1 border-t border-border flex items-center gap-2.5 hover:bg-accent/40 transition-colors"
      >
        <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground grid place-items-center text-xs font-semibold flex-shrink-0">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold truncate">{dealerName}</div>
          <div className="text-[11px] text-muted-foreground">Dealer</div>
        </div>
      </Link>
    </aside>
  );
}

function NavItem({ item }: { item: (typeof NAV_ITEMS)[number] }) {
  const baseStyle = "relative flex items-center gap-3 px-3.5 py-2.5 rounded-md text-sm";
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        `${baseStyle} ${
          isActive
            ? "font-semibold text-foreground bg-secondary"
            : "font-medium text-muted-foreground hover:bg-accent/50"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute left-0 top-2 bottom-2 w-[3px] bg-primary rounded-r" />}
          <span className={`w-4 text-center text-[14px] ${isActive ? "text-primary" : ""}`}>
            {item.icon}
          </span>
          <span>{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

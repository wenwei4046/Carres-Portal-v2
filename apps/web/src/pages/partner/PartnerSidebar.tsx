import { Link, NavLink } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import CarresLockup from "@/components/CarresLockup";

/**
 * Partner (LP) sidebar — 3 nav items per Master Plan §6 (Phase 4.5 Chunk 1).
 * Matches the dealer-side NavLink pattern (React Router driven), with the same
 * sticky-left layout as DealerApp's sidebar so Partner deep-linking
 * (`/delivery-partner/pickups`) round-trips cleanly. Tabs live as URL paths so
 * a partner can paste a link to "today's pickups" into WhatsApp.
 */
const NAV_ITEMS = [
  { to: "/delivery-partner/dashboard", label: "Today", icon: "◆", end: false },
  { to: "/delivery-partner/pickups", label: "Pickups", icon: "▣", end: false },
  { to: "/delivery-partner/fleet",   label: "Fleet",   icon: "▥", end: false },
  { to: "/delivery-partner/profile", label: "Profile", icon: "◐", end: false },
] as const;

export default function PartnerSidebar() {
  const session = useAuth((s) => s.session);
  const email = session?.user?.email ?? "";
  const initials = email.slice(0, 2).toUpperCase();

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[220px] bg-card border-r border-border flex flex-col py-[22px] z-10">
      <div className="px-[22px] pb-6 border-b border-border mb-[14px]">
        <Link to="/delivery-partner/dashboard" className="block">
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
          <div className="text-xs font-semibold truncate">{email}</div>
          <div className="text-[11px] text-muted-foreground">Delivery Partner</div>
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
          <span className={`w-4 text-center text-[14px] ${isActive ? "text-primary" : ""}`}>{item.icon}</span>
          <span>{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import Drawer from "@/components/kit/Drawer";
import { useAuth } from "@/lib/auth";
import CarresLockup from "@/components/CarresLockup";

/**
 * Partner (LP) sidebar — 3 nav items per Master Plan §6 (Phase 4.5 Chunk 1).
 * Matches the dealer-side NavLink pattern (React Router driven), with the same
 * sticky-left layout as DealerApp's sidebar so Partner deep-linking
 * (`/delivery-partner/pickups`) round-trips cleanly. Tabs live as URL paths so
 * a partner can paste a link to "today's pickups" into WhatsApp.
 */
// 2026-05-10 (Loo) — split single "Pickups" tab into two clean legs:
//   Factory pickups = supplier → warehouse (the partner's pickup work)
//   Deliveries      = warehouse → customer (the partner's POD work)
// Different state machines, different RPCs, different mental models — no
// reason to entangle them on one page.
// 2026-05-23 (item h) — "Incoming" tab at the top: orders Operation has just
// picked this LP for at Accept Proceed. Reading them here lets the LP accept
// or reject the assignment before the goods are even ready to dispatch.
const NAV_ITEMS = [
  { to: "/delivery-partner/incoming",        label: "Incoming",        icon: "✦", end: false },
  { to: "/delivery-partner/dashboard",       label: "Today",           icon: "◆", end: false },
  { to: "/delivery-partner/arrange",         label: "Delivery dates",  icon: "▤", end: false },
  { to: "/delivery-partner/factory-pickups", label: "Factory pickups", icon: "▦", end: false },
  { to: "/delivery-partner/deliveries",      label: "Deliveries",      icon: "▣", end: false },
  { to: "/delivery-partner/fleet",           label: "Fleet",           icon: "▥", end: false },
  { to: "/delivery-partner/profile",         label: "Profile",         icon: "◐", end: false },
] as const;

export default function PartnerSidebar() {
  const session = useAuth((s) => s.session);
  const email = session?.user?.email ?? "";
  const initials = email.slice(0, 2).toUpperCase();
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setMenuOpen(false), [pathname]); // a chosen page closes the drawer

  return (
    <>
    <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-[220px] bg-card border-r border-border flex-col py-[22px] z-10">
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
        <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground grid place-items-center text-meta font-semibold flex-shrink-0">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-meta font-semibold truncate">{email}</div>
          <div className="text-label text-muted-foreground">Delivery Partner</div>
        </div>
      </Link>
    </aside>
      {/* Below 768px the fixed sidebar would leave ~155px for content: a top bar
          with a menu button opens the same links in a Drawer instead. */}
      <header className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b border-border bg-card px-3 md:hidden">
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
          className="grid h-9 w-9 place-items-center rounded-md text-body hover:bg-accent/50"
        >
          ☰
        </button>
        <Link to="/delivery-partner/dashboard" className="block">
          <CarresLockup />
        </Link>
      </header>
      <Drawer open={menuOpen} onOpenChange={setMenuOpen} title="Menu">
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
        <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground grid place-items-center text-meta font-semibold flex-shrink-0">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-meta font-semibold truncate">{email}</div>
          <div className="text-label text-muted-foreground">Delivery Partner</div>
        </div>
      </Link>
      </Drawer>
    </>
  );
}

function NavItem({ item }: { item: (typeof NAV_ITEMS)[number] }) {
  const baseStyle = "relative flex items-center gap-3 px-3.5 py-2.5 rounded-md text-body";
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
          <span className={`w-4 text-center text-body ${isActive ? "text-primary" : ""}`}>{item.icon}</span>
          <span>{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

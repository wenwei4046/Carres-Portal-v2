import { type ReactNode } from "react";
import { Link, Navigate, NavLink, Route, Routes, useSearchParams } from "react-router-dom";
import CarresLockup from "@/components/CarresLockup";
import { useAuth } from "@/lib/auth";
import { useDealerSelf } from "@/lib/queries";
import DealerDashboard from "./DealerDashboard";
import DealerOrders from "./DealerOrders";
import DealerProducts from "./DealerProducts";
import DealerSettings from "./DealerSettings";
import DealerNewOrder from "./new-order/DealerNewOrder";

const NAV_ITEMS = [
  { to: "/dealer", label: "Dashboard", icon: "▦", end: true, enabled: true },
  { to: "/dealer/orders", label: "Orders", icon: "▤", end: false, enabled: true },
  { to: "/dealer/products", label: "Products", icon: "▭", end: false, enabled: true },
  { to: "/dealer/settings", label: "Settings", icon: "✦", end: false, enabled: true },
] as const;

export default function DealerApp() {
  const dealer = useDealerSelf();
  const userEmail = useAuth((s) => s.user?.email ?? "");
  const initials = (dealer.data?.name ?? userEmail).slice(0, 2).toUpperCase();

  // Modal-over-pages: any /dealer/* path can append `?new=1` to pop the wizard
  // (D4: modal, not full route). Closing strips the param without changing path.
  const [searchParams, setSearchParams] = useSearchParams();
  const newOrderOpen = searchParams.get("new") === "1";
  function closeNewOrder() {
    setSearchParams((p) => {
      p.delete("new");
      return p;
    });
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <DealerSidebar dealerName={dealer.data?.name ?? "—"} initials={initials} />
      <main className="ml-[220px] flex-1 min-w-0">
        <Routes>
          <Route index element={<DealerDashboard />} />
          <Route path="orders" element={<DealerOrders />} />
          <Route path="orders/:id" element={<Navigate to=".." replace />} />
          <Route path="products" element={<DealerProducts />} />
          <Route path="settings" element={<DealerSettings />} />
          <Route path="*" element={<Navigate to="" replace />} />
        </Routes>
      </main>
      <DealerNewOrder open={newOrderOpen} onClose={closeNewOrder} />
    </div>
  );
}

function DealerSidebar({ dealerName, initials }: { dealerName: string; initials: string }) {
  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[220px] bg-card border-r border-border flex flex-col py-[22px] z-10">
      <div className="px-[22px] pb-6 border-b border-border mb-[14px]">
        <Link to="/dealer" className="block">
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
          <span className={`w-4 text-center text-[14px] ${isActive ? "text-primary" : ""}`}>{item.icon}</span>
          <span>{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

// Helper kept here for any future inline cards that need a wrapping section.
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="text-xs uppercase tracking-[0.16em] text-muted-foreground font-semibold mb-3">{title}</h2>
      {children}
    </section>
  );
}

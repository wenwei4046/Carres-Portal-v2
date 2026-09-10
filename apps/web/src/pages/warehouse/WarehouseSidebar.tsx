import { Link, NavLink } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import CarresLockup from "@/components/CarresLockup";
import { useWarehouseIncoming } from "@/lib/queries";

/**
 * Warehouse portal sidebar — the SupplierSidebar shape, two items instead of
 * four (R6).
 *
 * The badge counts POs with nothing filed against them yet: the work the
 * warehouse still has to do. A PO whose count is already waiting for Carres is
 * NOT work — the pallet has been counted and the ball is on our side — so
 * counting it would show a number that no action of theirs can clear.
 *
 * The warehouse's NAME comes from the incoming payload rather than the token:
 * the shell and the list then read one source, and a mis-provisioned login says
 * so instead of showing a confident wrong name.
 */
const NAV_ITEMS = [
  { to: "/warehouse/incoming", label: "Incoming", icon: "↘", badge: true },
  { to: "/warehouse/receipts", label: "My receiving", icon: "▤", badge: false },
  { to: "/warehouse/outbound", label: "Outbound", icon: "↗", badge: false },
];

export default function WarehouseSidebar() {
  const session = useAuth((s) => s.session);
  const email = session?.user?.email ?? "";
  const initials = email.slice(0, 2).toUpperCase();

  const { data } = useWarehouseIncoming();
  const toCount = (data?.pos ?? []).filter((p) => !p.open_receipt_id).length;
  const warehouseName = data?.warehouse?.name ?? "Warehouse";

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[240px] bg-card border-r border-border flex flex-col py-[22px] z-10 overflow-auto">
      <div className="px-[22px] pb-[18px] border-b border-border">
        <Link to="/warehouse/incoming" className="block">
          <CarresLockup />
        </Link>
      </div>

      <nav className="flex-1 px-3 pt-5 pb-1 flex flex-col gap-px">
        {NAV_ITEMS.map((it) => (
          <NavItem key={it.to} item={it} badge={it.badge ? toCount : 0} />
        ))}
      </nav>

      <Link
        to="/me"
        title="Profile · Sign out"
        className="px-[18px] pt-3 pb-1 border-t border-border flex items-center gap-2.5 hover:bg-accent/40 transition-colors"
      >
        <div className="w-[30px] h-[30px] rounded bg-primary text-primary-foreground grid place-items-center text-label font-semibold flex-shrink-0">
          {initials || "WH"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-meta font-semibold truncate">
            {email || "Warehouse"}
          </div>
          <div
            className="text-label uppercase tracking-[0.1em] text-muted-foreground mt-px truncate"
            data-testid="warehouse-sidebar-name"
          >
            {warehouseName} · Receiving
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
          <span
            className={`w-3.5 text-center text-body ${isActive ? "text-primary" : ""}`}
          >
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

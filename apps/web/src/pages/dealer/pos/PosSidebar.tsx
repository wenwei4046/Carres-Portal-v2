import { Link } from "react-router-dom";
import {
  BarChart3,
  Bed,
  BedDouble,
  Lock,
  Package,
  PackagePlus,
  Plus,
  RotateCcw,
  Settings,
  Sofa,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

export type RailKey = "all" | "mattress" | "bedframe" | "sofa" | "addons";

export interface RailEntry {
  key: RailKey;
  label: string;
  count: number;
  /** Locked by the sofa ↔ mattress/bedframe mutex (cart already has the
   *  opposing family). Greyed + non-clickable. */
  locked?: boolean;
}

const RAIL_ICON: Record<RailKey, LucideIcon> = {
  all: Package,
  mattress: Bed,
  bedframe: BedDouble,
  sofa: Sofa,
  addons: PackagePlus,
};

/**
 * POS catalog left sidebar — 2990s-parity sectioned rail:
 *   CATEGORIES (All open + per-category counts, sofa-mutex locks)
 *   QUICK      (Reset filters · Bestsellers)
 *   MAINTAIN   (principal only — New Order / Products / SO Maintenance /
 *              Sales analysis; the retail-seller tooling. Dealer / salesperson /
 *              showroom logins never see this section.)
 *   footer     (honest-pricing blurb)
 *
 * Replaces the flat CategoryRail. Counts + mutex bounce logic live in
 * CatalogStep (unchanged); this component is presentation + role gating only.
 */
export default function PosSidebar({
  entries,
  active,
  onSelect,
  onResetFilters,
}: {
  entries: RailEntry[];
  active: RailKey;
  onSelect: (key: RailKey) => void;
  onResetFilters: () => void;
}) {
  const role = useAuth((s) => s.role);
  const showMaintain = role === "principal";

  return (
    <div className="flex flex-col h-full min-h-0">
      <nav aria-label="Product categories" className="flex flex-col gap-0.5">
        <p className="label px-3 mb-2">Categories</p>
        {entries.map((e) => {
          const Icon = RAIL_ICON[e.key];
          const isActive = e.key === active;
          return (
            <button
              key={e.key}
              type="button"
              onClick={() => !e.locked && onSelect(e.key)}
              disabled={e.locked}
              aria-pressed={isActive}
              aria-disabled={e.locked}
              title={
                e.locked
                  ? "Locked — this order already has a conflicting product family"
                  : undefined
              }
              data-testid={`pos-rail-${e.key}`}
              className={[
                "relative flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-colors",
                e.locked
                  ? "text-base-300 cursor-not-allowed"
                  : isActive
                    ? "text-primary bg-primary/6 font-semibold"
                    : "text-base-600 hover:bg-base-100",
              ].join(" ")}
            >
              {/* Flame left-accent bar for active entry */}
              {isActive && !e.locked && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-primary"
                  aria-hidden="true"
                />
              )}
              <span className="w-4 flex items-center justify-center">
                {e.locked ? (
                  <Lock size={14} strokeWidth={1.75} />
                ) : (
                  <Icon size={16} strokeWidth={1.75} />
                )}
              </span>
              <span className="t-small flex-1 truncate">{e.label}</span>
              <span
                className={`font-mono text-[11px] tabular-nums ${
                  isActive ? "text-primary/70" : "text-base-400"
                }`}
              >
                {e.count}
              </span>
            </button>
          );
        })}
      </nav>

      <nav aria-label="Quick actions" className="flex flex-col gap-0.5 mt-5">
        <p className="label px-3 mb-2">Quick</p>
        <SideAction icon={RotateCcw} label="Reset filters" onClick={onResetFilters} />
        <SideAction icon={Sparkles} label="Bestsellers" onClick={() => onSelect("mattress")} />
      </nav>

      {showMaintain && (
        <nav aria-label="Maintain" className="flex flex-col gap-0.5 mt-5" data-testid="pos-maintain">
          <p className="label px-3 mb-2">Maintain</p>
          {/* Sales analysis ships in a later slice of the POS-parity program —
              rendered as "Soon" until its page lands, mirroring the 2990s TBC
              pattern, so this sidebar is deployable standalone. */}
          <SideLink icon={Plus} label="New Order" to="/principal?tab=new-order" />
          <SideLink icon={Package} label="Products" to="/principal?tab=catalog" />
          <SideLink
            icon={Settings}
            label="SO Maintenance"
            to="/operation?tab=sales-order-maintenance"
          />
          <SideSoon icon={BarChart3} label="Sales analysis" />
        </nav>
      )}

      <div className="mt-auto pt-6 px-3">
        <p className="label mb-1.5">Honest pricing</p>
        <p className="t-tiny text-base-400 leading-relaxed">
          Every model is priced on its own — no markups, no surprises. What you see is the floor
          price.
        </p>
      </div>
    </div>
  );
}

const ITEM_CLASS =
  "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left text-base-600 hover:bg-base-100 transition-colors";

function SideAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={ITEM_CLASS}>
      <span className="w-4 flex items-center justify-center">
        <Icon size={16} strokeWidth={1.75} />
      </span>
      <span className="t-small flex-1 truncate">{label}</span>
    </button>
  );
}

function SideLink({ icon: Icon, label, to }: { icon: LucideIcon; label: string; to: string }) {
  return (
    <Link to={to} className={ITEM_CLASS} data-testid={`pos-maintain-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <span className="w-4 flex items-center justify-center">
        <Icon size={16} strokeWidth={1.75} />
      </span>
      <span className="t-small flex-1 truncate">{label}</span>
    </Link>
  );
}

function SideSoon({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <button
      type="button"
      disabled
      title="Opening soon — this tool ships in the next update."
      className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left text-base-300 cursor-not-allowed"
      data-testid={`pos-maintain-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <span className="w-4 flex items-center justify-center">
        <Icon size={16} strokeWidth={1.75} />
      </span>
      <span className="t-small flex-1 truncate">{label}</span>
      <span className="pill pill-neutral text-[10px] px-1.5 py-0">Soon</span>
    </button>
  );
}

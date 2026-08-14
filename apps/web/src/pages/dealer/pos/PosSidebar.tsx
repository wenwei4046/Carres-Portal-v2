import { Link } from "react-router-dom";
import {
  Baby,
  BarChart3,
  Bath,
  Bed,
  BedDouble,
  CreditCard,
  Lamp,
  LayoutGrid,
  Lock,
  Package,
  Plus,
  Repeat,
  RotateCcw,
  ShieldCheck,
  Sofa,
  Sparkles,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

export type RailKey =
  | "all"
  | "mattress"
  | "bedframe"
  | "sofa"
  | "accessory"
  | "guarantee"
  // Loo 2026-07-26 — rent-to-own stops hiding behind a top-bar button and
  // becomes a category like any other. Same cards, same configure surface; the
  // only difference is that the right rail also asks HOW LONG.
  | "rental"
  | "bundles"
  | "addons";

export interface RailEntry {
  key: RailKey;
  label: string;
  count: number;
  /** Locked by the sofa ↔ mattress/bedframe mutex (cart already has the
   *  opposing family). Greyed + non-clickable. */
  locked?: boolean;
}

/** Icon map mirrors prototype/pos-data.jsx CATEGORIES. */
const RAIL_ICON: Record<RailKey, LucideIcon> = {
  all: LayoutGrid,
  mattress: BedDouble,
  sofa: Sofa,
  bedframe: Bed,
  accessory: Lamp,
  guarantee: ShieldCheck,
  rental: Repeat,
  bundles: Package,
  addons: Lamp,
};

/** Ranges still being finalised — visible but inert, exactly as designed. */
const TBC_ENTRIES: Array<{ label: string; icon: LucideIcon }> = [
  { label: "Dining", icon: Utensils },
  { label: "Bathroom", icon: Bath },
  { label: "Kids zone", icon: Baby },
];

/**
 * POS catalog sidebar — prototype skin (`.cat-side`, Loo's Claude Design
 * 2026-07-04). Sections: Categories (counts + sofa-mutex locks) · To be
 * confirmed (inert "Soon" rows) · Quick (Reset filters / Bestsellers) ·
 * Maintain (principal-only retail tooling) · honest-pricing footer.
 * Counts + mutex bounce logic live in CatalogStep (unchanged).
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
    <aside className="cat-side">
      <div className="cat-side__heading">Categories</div>
      {entries.map((e) => {
        const Icon = RAIL_ICON[e.key];
        return (
          <button
            key={e.key}
            type="button"
            onClick={() => !e.locked && onSelect(e.key)}
            disabled={e.locked}
            aria-pressed={e.key === active}
            aria-disabled={e.locked}
            title={
              e.locked
                ? "Locked — this order already has a conflicting product family"
                : undefined
            }
            data-testid={`pos-rail-${e.key}`}
            className={[
              "cat-side__item",
              e.key === active && !e.locked ? "is-active" : "",
              e.locked ? "cat-side__item--tbc" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {e.locked ? (
              <Lock size={16} strokeWidth={1.75} />
            ) : (
              <Icon size={16} strokeWidth={1.75} />
            )}
            <span>{e.label}</span>
            <span className="cat-side__count">{e.count}</span>
          </button>
        );
      })}

      <div className="cat-side__heading" style={{ marginTop: 16 }}>
        To be confirmed
      </div>
      {TBC_ENTRIES.map(({ label, icon: Icon }) => (
        <button
          key={label}
          type="button"
          className="cat-side__item cat-side__item--tbc"
          disabled
          aria-disabled="true"
          title="This range is being finalised — opening soon."
        >
          <Icon size={16} strokeWidth={1.75} />
          <span>{label}</span>
          <span className="cat-side__pill">Soon</span>
        </button>
      ))}

      <div className="cat-side__heading" style={{ marginTop: 16 }}>
        Quick
      </div>
      <button type="button" className="cat-side__item" onClick={onResetFilters}>
        <RotateCcw size={16} strokeWidth={1.75} />
        <span>Reset filters</span>
      </button>
      <button type="button" className="cat-side__item" onClick={() => onSelect("mattress")}>
        <Sparkles size={16} strokeWidth={1.75} />
        <span>Bestsellers</span>
      </button>

      {showMaintain && (
        <nav aria-label="Maintain" data-testid="pos-maintain" style={{ display: "contents" }}>
          <div className="cat-side__heading" style={{ marginTop: 16 }}>
            Maintain
          </div>
          <Link
            to="/principal?tab=new-order"
            className="cat-side__item"
            data-testid="pos-maintain-new-order"
          >
            <Plus size={16} strokeWidth={1.75} />
            <span>New Order</span>
          </Link>
          {/* Products = the selling Product & Maintenance, an ADMIN door since
              the catalog split (Loo 2026-07-25). Costing lives separately in
              Operations as the Operation Catalog. */}
          <Link
            to="/principal?tab=catalog"
            className="cat-side__item"
            data-testid="pos-maintain-products"
          >
            <Package size={16} strokeWidth={1.75} />
            <span>Products</span>
          </Link>
          {/* Order Entry moved INTO `Sales Order Settings` (orders/MASTER.md
              §11): the Sales Order module owns its Order Entry fields and
              payment methods, and the one Settings Workspace is where a
              business value is changed. This link follows it rather than
              keeping a second address for the same editor. */}
          <Link
            to="/operation/settings/sales-orders"
            className="cat-side__item"
            data-testid="pos-maintain-order-entry"
          >
            <CreditCard size={16} strokeWidth={1.75} />
            <span>Order Entry</span>
          </Link>
          <Link
            to="/principal?tab=sales-analysis"
            className="cat-side__item"
            data-testid="pos-maintain-sales-analysis"
          >
            <BarChart3 size={16} strokeWidth={1.75} />
            <span>Sales analysis</span>
          </Link>
        </nav>
      )}

      <div className="cat-side__footer">
        <div className="cat-side__footer-title">Honest pricing</div>
        Every model is priced on its own — no markups, no surprises. What you see is the floor
        price.
      </div>
    </aside>
  );
}

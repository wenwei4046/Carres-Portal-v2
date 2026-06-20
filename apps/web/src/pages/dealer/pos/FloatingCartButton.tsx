import { ShoppingBag } from "lucide-react";
import { rm } from "@/lib/format-currency";

/**
 * Floating bottom-right cart CTA — ink pill (.pos-fab) with a flame icon tile
 * (ShoppingBag), "CART" micro-label, running total, and a count badge.
 * The single flame-accented CTA on step 01 (via the icon tile, not a solid
 * flame pill — satisfying v17 "one flame accent per screen" by intent).
 *
 * Disabled when cart is empty. `pulse` triggers `.animate-cart-pulse` for one
 * shot after an add. Logic: UNCHANGED.
 */
export default function FloatingCartButton({
  itemCount,
  total,
  pulse,
  onClick,
}: {
  itemCount: number;
  total: number;
  pulse: boolean;
  onClick: () => void;
}) {
  const empty = itemCount === 0;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={empty}
      data-testid="pos-cart-fab"
      className={[
        "pos-fab",
        pulse ? "animate-cart-pulse" : "",
        empty ? "opacity-50 pointer-events-none" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Flame icon tile */}
      <span className="relative flex-shrink-0 w-10 h-10 rounded-[12px] bg-primary flex items-center justify-center text-white">
        <ShoppingBag size={20} strokeWidth={1.75} />
        {/* Count badge — flame-contrasted, top-right of the icon tile */}
        {!empty && (
          <span
            className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-white text-primary font-mono text-[10px] font-bold flex items-center justify-center"
            aria-label={`${itemCount} item${itemCount === 1 ? "" : "s"}`}
          >
            {itemCount}
          </span>
        )}
      </span>

      {/* Label + total */}
      <span className="flex flex-col items-start leading-tight">
        <span className="t-micro text-white/60 tracking-[0.14em]">CART</span>
        <span className="font-mono text-[15px] font-bold text-white">{rm(total)}</span>
      </span>
    </button>
  );
}

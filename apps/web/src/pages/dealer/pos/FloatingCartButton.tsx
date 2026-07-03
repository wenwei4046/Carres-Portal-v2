import { ShoppingBag } from "lucide-react";
import { rm } from "@/lib/format-currency";

/**
 * Floating bottom-right cart CTA — prototype skin (`.cart-fab`, Loo's Claude
 * Design 2026-07-04): ink card with a burnt icon tile (terracotta once the
 * cart has items), "CUSTOMER ORDER" micro-label, running total, and a count
 * badge. Always visible; opens the cart popup. Logic: UNCHANGED (still
 * disabled-inert when empty so the popup can't open on nothing).
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
      aria-label="Open customer order"
      data-testid="pos-cart-fab"
      className={[
        "cart-fab",
        empty ? "" : "has-items",
        pulse ? "is-pulsing" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={empty ? { opacity: 0.55, cursor: "default" } : undefined}
    >
      <span className="cart-fab__icon">
        <ShoppingBag size={18} strokeWidth={1.75} />
      </span>
      <span className="cart-fab__meta">
        <span className="cart-fab__label">Customer order</span>
        <span className="cart-fab__amount">{rm(total)}</span>
      </span>
      {!empty && <span className="cart-fab__badge">{itemCount}</span>}
    </button>
  );
}

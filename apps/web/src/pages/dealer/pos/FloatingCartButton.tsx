import { rm } from "@/lib/format-currency";

/**
 * Floating bottom-right cart CTA — the POS catalog page's ONE flame
 * (`.btn-hero`) action. Shows item count + running total; opens the cart
 * drawer. Greys when the cart is empty. `pulse` briefly scales the button
 * after an add to confirm the item landed.
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
      className={`btn-hero fixed bottom-6 right-6 z-40 shadow-lg px-6 py-3.5 rounded-md transition-transform duration-200 ${
        pulse ? "scale-105" : "scale-100"
      } ${empty ? "" : ""}`}
    >
      <span className="flex items-center gap-3">
        <span className="grid place-items-center w-6 h-6 rounded-full bg-white/20 font-mono text-[12px]">
          {itemCount}
        </span>
        <span className="flex flex-col items-start leading-tight">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-80">
            Customer order
          </span>
          <span className="font-mono text-[15px] font-bold">{rm(total)}</span>
        </span>
      </span>
    </button>
  );
}

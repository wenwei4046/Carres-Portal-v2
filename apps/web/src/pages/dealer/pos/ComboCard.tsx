import { Plus, Package } from "lucide-react";
import type { ComboDto } from "@carres/shared";

/**
 * One POS combo (套餐) card. Mirrors `ProductCard`'s 2990s re-skin: branded
 * placeholder top, "Combo" kicker, name, a one-line component summary, the
 * fixed `RM x,xxx` price hero, and the round flame add affordance. The whole
 * card is a button — clicking it EXPLODES the combo into its component
 * `DraftLine`s (split price) and folds them into the cart.
 *
 * Combos have no per-card configure step in v1 (components are concrete SKUs),
 * so this card commits directly on click rather than opening a drawer.
 */
export default function ComboCard({
  combo,
  onAdd,
}: {
  combo: ComboDto;
  onAdd: () => void;
}) {
  const itemCount = combo.components.reduce((n, c) => n + c.qty, 0);
  const skuLine = combo.components.map((c) => c.sku).join(" + ");

  return (
    <button
      type="button"
      onClick={onAdd}
      data-testid={`pos-combo-${combo.comboKey}`}
      className="pos-card group flex flex-col overflow-hidden text-left"
    >
      {/* Branded placeholder (combos have no photo) */}
      <div className="aspect-[4/3] bg-base-50 grid place-items-center overflow-hidden rounded-t-2xl">
        <Package size={40} strokeWidth={1.25} className="text-base-200" aria-hidden="true" />
      </div>

      <div className="flex flex-1 flex-col p-4">
        {/* Combo kicker badge top-left */}
        <span className="kicker">Combo</span>

        <h3 className="t-h4 mt-1.5 text-base-900 leading-snug">{combo.name}</h3>
        <p className="t-tiny text-base-400 mt-0.5 line-clamp-1" title={skuLine}>
          {skuLine}
        </p>

        {/* Price hero + round flame add affordance */}
        <div className="mt-auto pt-3 flex items-end justify-between gap-2">
          <div>
            <div className="leading-none">
              <span className="pos-price text-[22px]">
                <span className="pos-price-rm">RM</span>
                {combo.comboPrice.toLocaleString("en-MY", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                })}
              </span>
            </div>
            <div className="t-tiny text-base-400 mt-0.5">
              {itemCount} item{itemCount === 1 ? "" : "s"}
            </div>
          </div>

          <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white group-hover:bg-primary/90 transition-colors">
            <Plus size={16} strokeWidth={2} />
          </span>
        </div>
      </div>
    </button>
  );
}

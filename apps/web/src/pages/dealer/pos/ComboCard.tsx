import { Package, Plus } from "lucide-react";
import type { ComboDto } from "@carres/shared";

/**
 * One POS combo (套餐) card — prototype skin (`.prod-card`): placeholder
 * photo block with a COMBO badge + round terracotta add affordance, then
 * item count / name / component summary / key + Bodoni price row. Clicking
 * EXPLODES the combo into its component `DraftLine`s (split price) and folds
 * them into the cart — no configure step in v1.
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
      className="prod-card"
    >
      <div
        className="prod-card__photo"
        style={{ display: "grid", placeItems: "center", color: "var(--fg-soft)" }}
      >
        <Package size={40} strokeWidth={1.25} aria-hidden="true" />
        <span className="prod-card__badge">Combo</span>
        <span className="prod-card__add" aria-hidden="true">
          <Plus size={18} strokeWidth={2} />
        </span>
      </div>
      <div className="prod-card__body">
        <div className="prod-card__series">
          {itemCount} item{itemCount === 1 ? "" : "s"}
        </div>
        <div className="prod-card__name">{combo.name}</div>
        <div className="prod-card__detail" title={skuLine}>
          {skuLine}
        </div>
        <div className="prod-card__row">
          <span className="prod-card__sku">{combo.comboKey.toUpperCase()}</span>
          <span className="prod-card__price">
            <sup>RM</sup>
            {combo.comboPrice.toLocaleString("en-MY")}
          </span>
        </div>
      </div>
    </button>
  );
}

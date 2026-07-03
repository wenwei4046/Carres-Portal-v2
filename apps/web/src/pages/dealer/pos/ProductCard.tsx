import { Check, Plus, SlidersHorizontal } from "lucide-react";
import type { ProductModelDto } from "@carres/shared";
import { CATEGORY_LABEL } from "@/pages/catalog/components/atoms";
import type { ModelMeta } from "./catalog-index";

/**
 * One POS catalog product card — prototype skin (`.prod-card`, Loo's Claude
 * Design 2026-07-04): 4:3 photo with the category kicker badge + round
 * terracotta add affordance, then options line / name / detail / model key +
 * Bodoni price row. The whole card is a button that opens the configurator
 * (page or drawer); configurable categories show the sliders icon, flat ones
 * a plus, in-cart a check. Locked cards (sofa-mutex) dim and stop responding.
 * Logic + DraftLine construction: UNCHANGED.
 */
export default function ProductCard({
  model,
  meta,
  locked,
  onConfigure,
  inCart,
}: {
  model: ProductModelDto;
  meta: ModelMeta;
  locked: boolean;
  onConfigure: () => void;
  inCart?: boolean;
}) {
  const configurable =
    model.category === "sofa" || model.category === "bedframe" || model.category === "mattress";
  const AddIcon = configurable ? SlidersHorizontal : inCart ? Check : Plus;

  return (
    <button
      type="button"
      onClick={() => !locked && onConfigure()}
      disabled={locked}
      aria-disabled={locked}
      title={locked ? "Locked — this order already has a conflicting product family" : undefined}
      data-testid={`pos-card-${model.modelKey}`}
      className={["prod-card", inCart ? "is-in-cart" : ""].filter(Boolean).join(" ")}
      style={locked ? { opacity: 0.45, cursor: "not-allowed" } : undefined}
    >
      <div
        className="prod-card__photo"
        style={model.photoUrl ? { backgroundImage: `url(${model.photoUrl})` } : undefined}
      >
        <span className="prod-card__badge">{CATEGORY_LABEL[model.category]}</span>
        {!locked && (
          <span className="prod-card__add" aria-hidden="true">
            <AddIcon size={18} strokeWidth={2} />
          </span>
        )}
      </div>
      <div className="prod-card__body">
        <div className="prod-card__series">
          {meta.optionCount > 0
            ? `${meta.optionCount} ${meta.optionNoun}${meta.optionCount === 1 ? "" : "s"}`
            : CATEGORY_LABEL[model.category]}
        </div>
        <div className="prod-card__name">{model.name}</div>
        <div className="prod-card__detail">{model.blurb ?? ""}</div>
        <div className="prod-card__row">
          <span className="prod-card__sku">{model.modelKey.toUpperCase()}</span>
          <span className="prod-card__price">
            <sup>FROM RM</sup>
            {meta.fromPrice.toLocaleString("en-MY")}
          </span>
        </div>
      </div>
    </button>
  );
}

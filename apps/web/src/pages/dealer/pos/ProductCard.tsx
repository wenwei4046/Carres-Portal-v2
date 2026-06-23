import { Plus } from "lucide-react";
import type { ProductModelDto } from "@carres/shared";
import { CATEGORY_LABEL } from "@/pages/catalog/components/atoms";
import type { ModelMeta } from "./catalog-index";

/**
 * One POS catalog product card: 4:3 photo/placeholder top, category kicker
 * badge, model name, blurb, "From RM x,xxx" price hero, round flame add
 * affordance. The whole card is a button that opens the configure drawer.
 * Locked cards (sofa-mutex) dim and stop responding.
 *
 * Visual re-skin (2990s style): .pos-card shell, .pos-price / .pos-price-rm
 * price hero, .kicker badge, .pos-selected ring when model has lines in cart.
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
  return (
    <button
      type="button"
      onClick={() => !locked && onConfigure()}
      disabled={locked}
      aria-disabled={locked}
      data-testid={`pos-card-${model.modelKey}`}
      className={[
        "pos-card group flex flex-col overflow-hidden text-left",
        inCart ? "pos-selected" : "",
        locked ? "opacity-40 cursor-not-allowed" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* 4:3 photo or branded placeholder */}
      <div className="aspect-[4/3] bg-base-50 grid place-items-center overflow-hidden rounded-t-2xl">
        {model.photoUrl ? (
          <img
            src={model.photoUrl}
            alt={model.name}
            loading="lazy"
            className="h-full w-full object-cover"
            onError={(e) => {
              // Broken URL → fall back to placeholder glyph.
              e.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <span className="text-base-200 text-4xl select-none">▦</span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        {/* Category kicker badge top-left */}
        <span className="kicker">{CATEGORY_LABEL[model.category]}</span>

        <h3 className="t-h4 mt-1.5 text-base-900 leading-snug">{model.name}</h3>
        {model.blurb && (
          <p className="t-tiny text-base-400 mt-0.5 line-clamp-1">{model.blurb}</p>
        )}

        {/* Price hero + round flame add affordance */}
        <div className="mt-auto pt-3 flex items-end justify-between gap-2">
          <div>
            {/* pos-price-rm is a small superscript; pos-price is the Archivo Black number */}
            <div className="leading-none">
              <span className="pos-price text-[22px]">
                <span className="pos-price-rm">From&nbsp;RM</span>
                {meta.fromPrice.toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className="t-tiny text-base-400 mt-0.5">
              {meta.optionCount} {meta.optionNoun}{meta.optionCount === 1 ? "" : "s"}
            </div>
          </div>

          {locked ? (
            <span className="t-tiny text-base-300 font-semibold">Locked</span>
          ) : (
            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white group-hover:bg-primary/90 transition-colors">
              <Plus size={16} strokeWidth={2} />
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

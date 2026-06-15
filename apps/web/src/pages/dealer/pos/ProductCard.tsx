import type { ProductModelDto } from "@carres/shared";
import { rm } from "@/lib/format-currency";
import { CATEGORY_LABEL } from "@/pages/catalog/components/atoms";
import type { ModelMeta } from "./catalog-index";

/**
 * One POS catalog product card: photo (or branded placeholder), category
 * kicker, model name, blurb, "FROM RM x,xxx", and a "{n} sizes · Configure →"
 * affordance. The whole card is a button that opens the configure drawer.
 * Locked cards (sofa-mutex) dim and stop responding.
 */
export default function ProductCard({
  model,
  meta,
  locked,
  onConfigure,
}: {
  model: ProductModelDto;
  meta: ModelMeta;
  locked: boolean;
  onConfigure: () => void;
}) {
  return (
    <button
      type="button"
      onClick={() => !locked && onConfigure()}
      disabled={locked}
      aria-disabled={locked}
      data-testid={`pos-card-${model.modelKey}`}
      className={`card group flex flex-col overflow-hidden text-left transition-colors ${
        locked
          ? "opacity-50 cursor-not-allowed"
          : "hover:border-primary"
      }`}
    >
      {/* Photo / placeholder */}
      <div className="aspect-[16/10] bg-base-50 border-b border-base-100 grid place-items-center overflow-hidden">
        {model.photoUrl ? (
          <img
            src={model.photoUrl}
            alt={model.name}
            loading="lazy"
            className="h-full w-full object-cover"
            onError={(e) => {
              // Broken URL → fall back to the placeholder glyph.
              e.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <span className="text-base-300 text-2xl select-none">▦</span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3.5">
        <span className="kicker text-base-400">{CATEGORY_LABEL[model.category]}</span>
        <h3 className="t-h4 mt-1 text-base-900">{model.name}</h3>
        {model.blurb && (
          <p className="t-tiny text-base-500 mt-0.5 line-clamp-1">{model.blurb}</p>
        )}

        <div className="mt-auto pt-3 flex items-end justify-between gap-2">
          <div>
            <div className="label text-base-400">From</div>
            <div className="font-mono text-[15px] font-semibold text-base-900">
              {rm(meta.fromPrice)}
            </div>
          </div>
          <span
            className={`t-tiny font-semibold ${
              locked ? "text-base-400" : "text-primary"
            }`}
          >
            {locked
              ? "Locked"
              : `${meta.optionCount} ${meta.optionNoun}${meta.optionCount === 1 ? "" : "s"} · Configure →`}
          </span>
        </div>
      </div>
    </button>
  );
}

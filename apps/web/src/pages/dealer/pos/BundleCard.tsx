import { Plus } from "lucide-react";
import type { CatalogResponse, ProductBundleDto } from "@carres/shared";

/**
 * One POS bundle card (0239 bundle pricing) — same `.prod-card` anatomy as
 * ProductCard, with two deliberate differences: a BUNDLE kicker badge, and the
 * bundle PRICE on the card (unlike product cards, a bundle IS its price — the
 * offer is meaningless without it; the muted line shows the itemised worth).
 * Tapping adds every component line to the cart in one go (no configurator —
 * a bundle's items are fixed).
 */
export default function BundleCard({
  bundle,
  catalog,
  catalogTotal,
  locked,
  lockedReason,
  inCart,
  onAdd,
}: {
  bundle: ProductBundleDto;
  catalog: CatalogResponse;
  /** Σ catalog price × qty over the components (0 when unavailable). */
  catalogTotal: number;
  /** True when the bundle can't be added right now: the sofa-mutex locks one
   *  of its families, or a component isn't POS-sellable. */
  locked: boolean;
  lockedReason?: string;
  inCart?: boolean;
  onAdd: () => void;
}) {
  const modelById = new Map(catalog.models.map((m) => [m.id, m]));
  const summary = bundle.components
    .map((comp) => {
      const sku = catalog.skus.find((s) => s.sku === comp.sku);
      const model = sku ? modelById.get(sku.modelId) : undefined;
      const name = model?.name ?? comp.sku;
      const variant = sku?.variant?.trim();
      return `${comp.qty > 1 ? `${comp.qty}× ` : ""}${name}${variant ? ` (${variant})` : ""}`;
    })
    .join(" + ");
  const photo = (() => {
    for (const comp of bundle.components) {
      const sku = catalog.skus.find((s) => s.sku === comp.sku);
      const url = sku ? modelById.get(sku.modelId)?.photoUrl : null;
      if (url) return url;
    }
    return null;
  })();

  return (
    <button
      type="button"
      onClick={() => !locked && onAdd()}
      disabled={locked}
      aria-disabled={locked}
      title={locked ? lockedReason ?? "This bundle can't be added right now" : undefined}
      data-testid={`pos-bundle-card-${bundle.id}`}
      className={["prod-card", inCart ? "is-in-cart" : ""].filter(Boolean).join(" ")}
      style={locked ? { opacity: 0.45, cursor: "not-allowed" } : undefined}
    >
      <div
        className="prod-card__photo"
        style={photo ? { backgroundImage: `url(${photo})` } : undefined}
      >
        <span className="prod-card__badge">Bundle</span>
        {!locked && (
          <span className="prod-card__add" aria-hidden="true">
            <Plus size={18} strokeWidth={2} />
          </span>
        )}
      </div>
      <div className="prod-card__body">
        <div className="prod-card__series">
          {bundle.components.length} items · one price
        </div>
        <div className="prod-card__name">{bundle.name}</div>
        <div className="prod-card__detail">{summary}</div>
        <div className="prod-card__row">
          <span className="prod-card__price">
            <sup>RM</sup>
            {bundle.price.toLocaleString("en-MY")}
          </span>
          {catalogTotal > bundle.price && (
            <span className="prod-card__sku" style={{ textDecoration: "line-through" }}>
              RM{catalogTotal.toLocaleString("en-MY")}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

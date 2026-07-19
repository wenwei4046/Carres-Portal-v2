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
  // 0241 — a custom bundle summarizes its SLOTS ("your pick" markers); a fixed
  // bundle its pinned components.
  const summary =
    bundle.kind === "custom"
      ? bundle.slots
          .map((slot, i) => {
            const names = slot.modelIds
              .map((id) => modelById.get(id)?.name)
              .filter(Boolean)
              .join(" / ");
            return `${slot.label ?? (names || `Item ${i + 1}`)}${slot.variant === "any" ? " (your pick)" : ""}`;
          })
          .join(" + ")
      : bundle.components
          .map((comp) => {
            const sku = catalog.skus.find((s) => s.sku === comp.sku);
            const model = sku ? modelById.get(sku.modelId) : undefined;
            const name = model?.name ?? comp.sku;
            const variant = sku?.variant?.trim();
            return `${comp.qty > 1 ? `${comp.qty}× ` : ""}${name}${variant ? ` (${variant})` : ""}`;
          })
          .join(" + ");
  const itemCount = bundle.kind === "custom" ? bundle.slots.length : bundle.components.length;
  const photo = (() => {
    const modelIds =
      bundle.kind === "custom"
        ? bundle.slots.flatMap((s) => s.modelIds)
        : bundle.components.map(
            (comp) => catalog.skus.find((s) => s.sku === comp.sku)?.modelId ?? "",
          );
    for (const mid of modelIds) {
      const url = modelById.get(mid)?.photoUrl;
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
          {itemCount} items · one price{bundle.kind === "custom" ? " · you choose" : ""}
        </div>
        <div className="prod-card__name">{bundle.name}</div>
        <div className="prod-card__detail">{summary}</div>
        {/* Price story at a glance (Loo 2026-07-19): original struck through,
            the saving called out, the retail price the hero. Custom bundles
            strike the Σ of each slot's cheapest pick. */}
        <div className="prod-card__row" style={{ alignItems: "flex-end" }}>
          <span className="prod-card__price">
            <sup>RM</sup>
            {bundle.price.toLocaleString("en-MY")}
          </span>
          {catalogTotal > bundle.price && (
            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
              <s style={{ fontSize: 12, color: "var(--fg-muted)" }}>
                RM {catalogTotal.toLocaleString("en-MY")}
              </s>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--c-burnt)",
                  background: "rgba(196,77,43,0.08)",
                  borderRadius: 999,
                  padding: "2px 8px",
                }}
                data-testid={`bundle-save-${bundle.id}`}
              >
                Save RM {(catalogTotal - bundle.price).toLocaleString("en-MY")}
              </span>
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

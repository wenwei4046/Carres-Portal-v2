import type { ProductCategory } from "@carres/shared";

/**
 * Small shared UI atoms for the Product & Maintenance page. Named exports
 * (mirrors `operation/components/Modal.tsx`'s multi-export module). All built
 * on v17 tokens — no hand-rolled colours.
 */

/**
 * Display labels for the 6 product categories (sentence case).
 *
 * `guarantee` reads "Guarantee & Service Package" since 0274 (Loo 2026-07-26):
 * the category now authors BOTH a one-time guarantee and a recurring care plan,
 * because they are the same object with a different visit count. The DB value
 * stays `guarantee` — renaming a category enum would ripple through the POS, the
 * catalog, the invoice and five RPCs for no behavioural gain, so the rename Loo
 * asked for lives here, where labels belong.
 */
export const CATEGORY_LABEL: Record<ProductCategory, string> = {
  mattress: "Mattress",
  bedframe: "Bedframe",
  sofa: "Sofa",
  accessory: "Accessory",
  service: "Service",
  guarantee: "Guarantee & Service Package",
};

/** The short form, for places where the full label will not fit (filter chips,
 *  narrow table headers). */
export const CATEGORY_LABEL_SHORT: Record<ProductCategory, string> = {
  ...CATEGORY_LABEL,
  guarantee: "Guarantee & Service",
};

/**
 * Filter chip — rounded pill that fills ink-black when active (the SKU Master
 * + Modular category filter row). Generic over the value so callers get a
 * typed `onClick`.
 */
export function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`text-body font-semibold px-3.5 py-1 rounded-full border transition-colors ${
        active
          ? "bg-base-900 text-white border-base-900"
          : "bg-white text-base-700 border-base-300 hover:border-base-500"
      }`}
    >
      {children}
    </button>
  );
}

/** Monospaced product-code chip (e.g. `LUMI-K`, `MS01-B1201F-S`). */
export function CodeChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block font-mono text-label bg-base-100 text-base-700 px-1.5 py-0.5 rounded-[3px]">
      {children}
    </span>
  );
}

/**
 * Sell-side ON/OFF status pill. Reflects `product_skus.pos_active` (NOT
 * discontinued_at — that's the cost/PO side). ON = visible to dealers;
 * OFF = hidden from the sales portal.
 */
export function SkuStatusPill({ posActive }: { posActive: boolean }) {
  return posActive ? (
    <span className="pill pill-confirmed">ON</span>
  ) : (
    <span className="pill pill-neutral">OFF</span>
  );
}

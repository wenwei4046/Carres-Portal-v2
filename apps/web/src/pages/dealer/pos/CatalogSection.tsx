import type { ReactNode } from "react";
import type { RailKey } from "./PosSidebar";

/**
 * One labelled band of the POS card wall — a header chip + its own `.cat-grid`
 * (Loo 2026-08-01, 2990s parity): the catalog stops being one continuous river
 * of cards where the family changes mid-row, and reads one family at a time.
 *
 * Every band reuses the SAME `.cat-grid` class, so the columns line up
 * vertically across bands — grouping must not cost the wall its alignment.
 *
 * Two deliberate departures from the 2990s original:
 *  1. `label` is passed straight from the left rail's own entry, so the wall
 *     and the rail can never end up with two words for one family. 2990s reads
 *     its header off a `branding` data column that no rail knows about.
 *  2. `withHeader` is false when the wall holds ONE band — the rail and the
 *     toolbar count already name it, and a third copy of the same word above
 *     the same cards is noise. 2990s always draws the header, which is exactly
 *     why a single-brand catalog there collapses to a header saying nothing.
 */
export default function CatalogSection({
  label,
  count,
  noun = "piece",
  withHeader,
  children,
}: {
  label: string;
  count: number;
  /** The word the toolbar already prints for this count — never a new one. */
  noun?: "piece" | "bundle";
  withHeader: boolean;
  children: ReactNode;
}) {
  return (
    <section className="cat-section" data-testid={`cat-section-${label}`}>
      {withHeader && (
        <header className="cat-section__head">
          <span className="cat-section__chip">{label}</span>
          <span className="cat-section__count">
            {count} {noun}
            {count === 1 ? "" : "s"}
          </span>
        </header>
      )}
      <div className="cat-grid">{children}</div>
    </section>
  );
}

/**
 * The left rail's own word for a family. `fallback` covers the two rails that
 * exist only when something is on offer (bundles / rental) — a band cannot
 * render today without its rail entry, but a missing label is not worth a
 * crash on the sales floor.
 */
export function railLabelOf(
  entries: ReadonlyArray<{ key: RailKey; label: string }>,
  key: RailKey,
  fallback: string,
): string {
  return entries.find((e) => e.key === key)?.label ?? fallback;
}

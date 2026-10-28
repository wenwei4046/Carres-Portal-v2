/**
 * ⭐ EVERY LINKED PO, ON ONE LINE — the ONE `PO No` cell rule.
 *
 * Owner rulings: SO Batch 2026-10-05 (Purchasing MASTER §9.1) and Sales Orders
 * 2026-10-06 (orders MASTER, "Several PO numbers"). Every real PO linked to the
 * order prints once, by stored PO number ascending, in the shared display form
 * (`documentDisplayNumber`), separated by `, `. Each number is its own door to
 * that exact PO; the commas are plain text. One line at the registry width: a
 * longer list is clipped inside the cell and the operator drags the column
 * wider. No count, no `n more`, no popover.
 *
 * Pure on purpose — the Sales Orders field catalog (no React) reads the same
 * text the cell (`PoNumberLinks.tsx`) prints, so the screen, the column filter
 * and Export never disagree.
 */
import { documentDisplayNumber } from "@carres/shared";

export interface PoNumberLink {
  /** The stored PO number — the identity the PO page opens by. */
  poId: string;
  /** What the cell prints — the shared short form, with its version when known. */
  display: string;
}

/** Every linked PO once (the first version seen wins), stored number ascending. */
export function poNumberLinks(
  pos: Iterable<{ poId: string; version?: number | null }>,
): PoNumberLink[] {
  const versions = new Map<string, number | null | undefined>();
  for (const po of pos) if (!versions.has(po.poId)) versions.set(po.poId, po.version);
  return [...versions]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([poId, version]) => ({
      poId,
      display: documentDisplayNumber(version == null ? poId : `${poId}-V${version}`),
    }));
}

/** The same list as ONE string — the cell text, the column filter and Export. */
export function poNumberLinksText(links: readonly PoNumberLink[]): string {
  return links.map((po) => po.display).join(", ");
}

/** Both forms of every number, so a search for the stored or the printed one finds the row. */
export function poNumberLinksSearch(links: readonly PoNumberLink[]): string {
  return links.map((po) => `${po.poId} ${documentDisplayNumber(po.poId)} ${po.display}`).join(" ");
}

/** The exact PO's page. */
export function poObjectPath(poId: string): string {
  return `/operation/procurement?po=${encodeURIComponent(poId)}`;
}

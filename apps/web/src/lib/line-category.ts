/**
 * Order-line classification — the single client-side source of truth for what
 * an order line *is* (Mattress / Bedframe / Sofa core good vs accessory vs
 * service charge), its size, and its default stock location.
 *
 * The keyword classifier mirrors the server's `resolve_demand_category`
 * (migration 0148) VERBATIM so the MS/BF/SOF it yields speaks the exact
 * vocabulary the supplier forecast uses. Add new model families to BOTH places.
 *
 * Extracted here (2026-06-22) so the Orders control grid (OperationOrdersControl)
 * and the order drawer (OrderDetailDrawer) share ONE copy instead of drifting —
 * past category bugs came from exactly that drift. Importing from this lib also
 * breaks the would-be circular import (the grid renders the drawer).
 */
import { STOCK_LOCATIONS } from "@carres/shared";

export type CoreCat = "mattress" | "bedframe" | "sofa";

/** Core goods (Mattress / Bedframe / Sofa) need POs + stock; everything else is
 *  accessory ("acc"). Native SKUs carry a `mattress:` / `bedframe:` / `sofa:`
 *  prefix; AutoCount free-text SKUs use model keywords + `MS## / BF## / SF##`
 *  item codes. */
export function lineCategory(sku: string): CoreCat | "acc" {
  const s = sku.trim();
  // Native canonical SKUs carry a `mattress:` / `bedframe:` / `sofa:` prefix.
  // Match ONLY that exact head — an AutoCount SKU often embeds a `COL:` colour
  // code (".../COL:KN390-15"); the old `includes(":")` shoved every coloured
  // SKU into "acc", so sofas/bedframes leaked into the row as raw model names.
  const head = s.split(":")[0].trim().toLowerCase();
  if (head === "mattress" || head === "bedframe" || head === "sofa")
    return head as CoreCat;

  // Accessory / service keywords are tested FIRST so "Mattress Protector" stays
  // an accessory, not a mattress.
  const n = s.toLowerCase();
  if (/disposal|transport fee|no lift|per floor|memory pillow|protector|microfiber/.test(n))
    return "acc";
  if (/jager|cody|trion|hilton|fenrir|ricardo|regal|divan|\/fab[0-9]/.test(n)) return "bedframe";
  if (/hk55|dsl90|dsl80|am90|th50|th51|glano|muro|nuvio|lunor|modulo|seater|incliner|eleganz/.test(n))
    return "sofa";
  if (/firmcare|softcloud|breeze|lumi|forte|sonic|haven|solace|meridian|b120|l120|h140|m140|s160/.test(n))
    return "mattress";
  if (/^ms[0-9]/.test(n)) return "mattress";
  if (/^bf[0-9]/.test(n)) return "bedframe";
  if (/^sf[0-9]/.test(n)) return "sofa";
  return "acc";
}

/** King / Queen / Single from a SKU, or null. */
export function lineSize(sku: string): string | null {
  const s = sku.toLowerCase();
  // Bedframes/mattresses write the size as a WORD mid-SKU ("Fab3-King",
  // "Fab2-Queen") as well as the canonical `-K/-Q/-S` suffix. Queen is tested
  // before King so "super king" still reads K, not a false Q.
  if (/\bqueen\b/.test(s)) return "Q";
  if (/\bking\b/.test(s)) return "K";
  if (/\b(?:super\s*)?single\b/.test(s)) return "S";
  const m = sku.match(/-([kqs])(?=$|[/\s)])/i);
  return m ? m[1].toUpperCase() : null;
}

/** Short proper TYPE name for a non-core line — the list shows these instead of
 *  a generic "accessories" (Loo: show Pillow / M.P / Disposal by name). The
 *  drawer shows the full original name; this is the short form. */
export function accShort(sku: string): string {
  const s = sku.toLowerCase();
  if (/pillow/.test(s)) return "Pillow";
  if (/protector|protect|\bm\.?p\b/.test(s)) return "M.P";
  if (/disposal|dispose/.test(s)) return "Disposal";
  if (/floor|lift|stair|transport|delivery|charge|install/.test(s)) return "Service";
  if (/topper/.test(s)) return "Topper";
  // "Carress Footrest-K/-Q" is a sofa footrest add-on — the TYPE is Footrest;
  // the bare first-word fallback would grab the brand ("Carress") instead.
  if (/footrest|foot rest|ottoman/.test(s)) return "Footrest";
  const w = sku.trim().split(/[\s/]+/)[0] ?? sku;
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

export type ItemKind = "core" | "acc" | "service";

/** core furniture · accessory goods · service charge (Disposal / floor charge —
 *  not a physical unit, carries no stock location). */
export function lineKind(sku: string): ItemKind {
  if (lineCategory(sku) !== "acc") return "core";
  const name = accShort(sku);
  return name === "Disposal" || name === "Service" ? "service" : "acc";
}

/**
 * Suggested default stock location for a line (Jess 2026-06-22):
 *   • accessory goods (Pillow / M.P / Topper / Footrest) → "Carres Klang" — these
 *     are kept as ready warehouse stock.
 *   • core furniture (Mattress / Bedframe / Sofa) → "at-supplier" — made to order,
 *     it sits at the supplier until received. (Showing the SPECIFIC supplier name
 *     is pending Jess's model→supplier map — see CF.)
 *   • service charges (No Lift / Disposal / floor) → null — no physical location.
 * It's only a DEFAULT — the drawer dropdown lets the operator override per line.
 */
export function defaultLineLocation(sku: string): string | null {
  const kind = lineKind(sku);
  if (kind === "service") return null;
  if (kind === "acc") return "Carres Klang";
  return "at-supplier";
}

/** The location options the drawer offers (the shared known set). */
export { STOCK_LOCATIONS };

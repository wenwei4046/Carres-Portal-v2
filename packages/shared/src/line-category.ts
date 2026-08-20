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
 *
 * MOVED to packages/shared (D1, 2026-07-26) so the booking-confirm gate on the
 * API can ask the SAME goods-ready question the drawer badge shows — no second
 * engine (the HR-P5 lesson). apps/web/src/lib/line-category.ts re-exports from
 * here, so every existing web import path still works.
 */
import { normalizeSkuKey } from "./sku-code";

export type CoreCat = "mattress" | "bedframe" | "sofa";

/**
 * D9 (2026-08-08) — the fourth answer, and the reason it had to exist.
 *
 * This function used to end in `return "acc"`. Two different facts therefore
 * shared one word: *"this is an accessory"* and *"I do not recognise this"* —
 * and §7 rules that **an accessory never blocks a delivery**. So "I cannot see
 * what this is" silently became "this cannot stop a truck". Measured on
 * production 2026-08-08: 36 lines across 17 orders were core goods reading as
 * accessories, and 12 orders classified as accessories END TO END — they could
 * never fail a stock check, so the ladder answered *goods secured* on zero
 * units.
 *
 * The fix is NOT another keyword. Adding `5539` and `lyyar` would clear today's
 * twelve orders and rebuild the same trap for the next model Ohana names. The
 * defect is the SHAPE of the rule: a default that makes a safety claim.
 *
 * So `acc` is now EARNED — a line is an accessory because a known accessory
 * word recognised it, never because nothing else did — and the fallthrough is
 * `unknown`, which claims nothing. That is §2.5's discipline, already in this
 * product: `photoOnFile` and `deliveryOrderIssued` are true / false / null,
 * where null means *we cannot see* and neither raises nor reassures. Readiness
 * was the one signal still guessing.
 */
export type LineClass = CoreCat | "acc" | "unknown";

/**
 * The accessory vocabulary — the ONE list, read by both the classifier (what a
 * line IS) and `accShort` (what the operator is shown). Two copies of it would
 * be two answers to one question (ownership Law D).
 *
 * Everything here is POSITIVE recognition. Nothing reaches this list by
 * elimination, which is the whole of D9.
 */
const ACCESSORY_TYPES: readonly { name: string; test: RegExp }[] = [
  { name: "Pillow", test: /pillow/ },
  // The NAME is the governed word (`COPY-STANDARD.md`: "mattress protector"),
  // never the AutoCount import code. `M.P` is the supplier sheet's abbreviation
  // and it stays on the RIGHT of this line — the TEST reads it, the screen
  // never prints it.
  { name: "Mattress protector", test: /protector|protect|\bm\.?p\b/ },
  { name: "Disposal", test: /disposal|dispose/ },
  { name: "Service", test: /floor|lift|stair|transport|delivery|charge|install/ },
  { name: "Topper", test: /topper/ },
  // "Carress Footrest-K/-Q" is a sofa footrest add-on — the TYPE is Footrest;
  // the bare first-word fallback would grab the brand ("Carress") instead.
  { name: "Footrest", test: /footrest|foot rest|ottoman/ },
];

/** The accessory TYPE a SKU is recognised as, or `null` — nothing is an
 *  accessory by default. This is the positive half of D9. */
export function accessoryType(sku: string): string | null {
  const n = sku.toLowerCase();
  return ACCESSORY_TYPES.find((a) => a.test.test(n))?.name ?? null;
}

/** Core goods (Mattress / Bedframe / Sofa) need POs + stock; a RECOGNISED
 *  accessory is `acc`; anything nothing recognised is `unknown` — never `acc`
 *  (D9). Native SKUs carry a `mattress:` / `bedframe:` / `sofa:` prefix;
 *  AutoCount free-text SKUs use model keywords + `MS## / BF## / SF##` item
 *  codes.
 *
 *  **This is the classifier. `lineCategory` is a narrower view of it.** */
export function lineClass(sku: string): LineClass {
  const s = sku.trim();
  // Native canonical SKUs carry a `mattress:` / `bedframe:` / `sofa:` prefix.
  // Match ONLY that exact head — an AutoCount SKU often embeds a `COL:` colour
  // code (".../COL:KN390-15"); the old `includes(":")` shoved every coloured
  // SKU into "acc", so sofas/bedframes leaked into the row as raw model names.
  const head = s.split(":")[0].trim().toLowerCase();
  if (head === "mattress" || head === "bedframe" || head === "sofa")
    return head as CoreCat;

  // These accessory words are tested BEFORE the core lists so "Mattress
  // Protector" stays an accessory, not a mattress. They are the only words
  // allowed to outrank a core model name, which is why the list stays narrow.
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
  // The rest of the accessory vocabulary runs AFTER the core lists: a broad
  // word like "delivery" or "ottoman" must never outrank a model name.
  if (accessoryType(s)) return "acc";
  // D9 — the fallthrough admits it cannot see. It does not declare the line
  // safe, and it does not declare it a problem either.
  return "unknown";
}

/**
 * ⚠️ DISPLAY GROUPING ONLY — **never ask this whether goods are safe to send.**
 *
 * The three-answer view of `lineClass`, kept because two screens group their
 * rows by it and D9 was scoped to the shared rule, not to those screens
 * (`OperationOrdersControl.tsx:1542` builds the items chip · the drawer's
 * `groupCatOf`, `OrderDetailDrawer.tsx:3506`, builds the category headers).
 * Both want a bucket to put a row in, and neither decides anything.
 *
 * It folds `unknown` into `acc`, so **the two cosmetic halves of D9 survive
 * here on purpose**: an unrecognised sofa module still prints under the
 * `Accessory` header. What does NOT survive is the claim — `lineKind`,
 * `lineReadiness`, `deliveryGroupOf` and `bookingConfirmGate` all read
 * `lineClass`, so nothing reachable from this fold can call goods ready.
 *
 * FOLLOW-UP: when those two files are free to edit, move both to `lineClass`,
 * give `unknown` its own header and DELETE this function. It exists to keep one
 * lie in one place with its address written on it, not to be lived with.
 */
/**
 * ⭐ THE CATALOG'S ANSWER FIRST — the parser only where the catalog is silent.
 *
 * D9 (`ERP-ARCHITECTURE.md:28`): *"what kind of product is this?"* had three
 * answers and no owner, and the one that is right — the CATALOG — was never
 * asked. `56239a3c` (PR #859) closed Stock's half by making `/inventory` read
 * `sku -> product_skus -> product_models.category` through the one shared
 * reader. This is the Sales Order half: the drawer's loan flow was still
 * deducing the category from the SKU TEXT in the browser, and it was not doing
 * it cosmetically — it was FILTERING WAREHOUSE STOCK with the result.
 *
 * Two arguments, and the second one is deliberately three-valued:
 *
 *   category === undefined   ABSENT. Nobody asked. The payload came from an
 *                            endpoint that does not carry the field, or from a
 *                            Worker built before it did. Parse, exactly as
 *                            before — this is the version-skew branch and the
 *                            only one that is purely defensive.
 *   category === null        ASKED, and the catalog holds no row for this SKU.
 *   category === "sofa"      ASKED and ANSWERED. The catalog wins outright; no
 *                            keyword list is consulted, ever.
 *
 * **Why `null` still falls through to the parser, which looks like the defect
 * this function exists to remove.** It is a measured decision, not an
 * oversight. On 2026-08-19 the catalog held a row for 49 of 74 distinct live
 * SKUs; the other 87 records — 975 units — do not join
 * (`CARD-2026-08-19-onhand-category-filter`). Treating `null` as "not this
 * category" would drop nearly the whole warehouse out of the loan picker in one
 * commit, which is a far larger regression than the guess it removes. So the
 * parser keeps that bucket, and the bucket shrinks every time someone keys a
 * product into the catalog. **The day it is empty, this branch and
 * `lineCategory` die together** — that is the exit condition, and it is the
 * reason the two cases are written apart even though they return the same thing
 * today.
 *
 * A catalog value this codebase has no core word for (a future `accessory`,
 * `service`, anything Settings adds) reads as `acc`, never as a core good:
 * an unknown word must not be able to substitute for a sofa.
 */
export function resolvedCategory(sku: string, category?: string | null): CoreCat | "acc" {
  // ABSENT — version skew. Nobody asked; the parser is all there is.
  if (category === undefined) return lineCategory(sku);
  // ASKED, catalog silent. See the measured reason above; this is the branch
  // that deletes itself once the catalog is populated.
  if (category === null) return lineCategory(sku);
  const c = category.trim().toLowerCase();
  return c === "sofa" || c === "bedframe" || c === "mattress" ? (c as CoreCat) : "acc";
}

export function lineCategory(sku: string): CoreCat | "acc" {
  const c = lineClass(sku);
  return c === "unknown" ? "acc" : c;
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

/**
 * The stock MATCH key for a line/unit — the single rule that links an order line
 * to warehouse free stock (Jess 2026-07-01 locked spec: "same MODEL + same SIZE,
 * -Q = Queen count as the same size"). Built on `normalizeSkuKey` (case +
 * punctuation drift) but with the size token CANONICALIZED via `lineSize`, so a
 * line written "…-Q" and a unit written "…Queen" resolve to ONE key instead of
 * two — fixing the split that `normalizeSkuKey` alone leaves. Fabric / ref codes
 * stay in the key (a sofa in fabric A ≠ fabric B); cross-fabric fulfilment is the
 * "Loan any sofa" escape hatch, not a silent match.
 *
 * Used by BOTH the readiness badge (OrderDetailDrawer) and the Warehouse-stock
 * panel filter (StockPickerGrid) so the count they show can never disagree.
 */
export function stockMatchKey(sku: string): string {
  const s = sku.toLowerCase();
  // Detect the size in any written form (tolerant on purpose — the whole point
  // is to survive drift): the words Queen / King / (Super) Single, OR a
  // standalone K/Q/S delimited by a hyphen OR space ("-Q", "- Q", " Q").
  let size = "";
  if (/\bqueen\b/.test(s)) size = "Q";
  else if (/\bking\b/.test(s)) size = "K";
  else if (/\b(?:super\s*)?single\b/.test(s)) size = "S";
  else {
    const m = s.match(/[-\s]([kqs])(?=$|[/\s)])/);
    if (m) size = m[1].toUpperCase();
  }
  // Strip whichever size form appears so it can't fragment the model key.
  const withoutSize = s
    .replace(/\b(?:super\s*)?single\b/g, " ")
    .replace(/\bqueen\b/g, " ")
    .replace(/\bking\b/g, " ")
    .replace(/[-\s]([kqs])(?=$|[/\s)])/g, " ");
  return normalizeSkuKey(withoutSize) + (size ? `|${size}` : "");
}

/** Short proper TYPE name for a non-core line — the list shows these instead of
 *  a generic "accessories" (Loo: show Pillow / Mattress protector / Disposal by
 *  name). The drawer shows the full original name; this is the short form.
 *
 *  **What this returns is SCREEN COPY** (the Sales Orders register footer
 *  prints it verbatim), so every name in `ACCESSORY_TYPES` is a governed word.
 */
export function accShort(sku: string): string {
  const named = accessoryType(sku);
  if (named) return named;
  const w = sku.trim().split(/[\s/]+/)[0] ?? sku;
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

export type ItemKind = "core" | "acc" | "service" | "unknown";

/**
 * core furniture · accessory goods · service charge (Disposal / floor charge —
 * not a physical unit, carries no stock location) · **unknown** — nothing
 * recognised this SKU (D9).
 *
 * This is the SAFETY answer: `acc` and `service` both mean "cannot hold a
 * delivery", so nothing may reach them by elimination. `unknown` is the fourth
 * seat that used to be missing, and every reader must decide what to do with
 * it rather than inherit a claim nobody made.
 */
export function lineKind(sku: string): ItemKind {
  const cat = lineClass(sku);
  if (cat === "unknown") return "unknown";
  if (cat !== "acc") return "core";
  const name = accShort(sku);
  return name === "Disposal" || name === "Service" ? "service" : "acc";
}

/**
 * Display sequence rank for an order line (Jess 2026-06-22): always list in the
 * order mattress → bedframe → sofa → pillow → protector → service / others. Lower
 * sorts first; ties keep their original order (Array.sort is stable). Use as
 * `lines.sort((a, b) => lineSortRank(a.sku) - lineSortRank(b.sku))`.
 *
 * D9 — an UNKNOWN line sorts with the core goods, not with the accessories.
 * It is a physical thing that has to be on the truck, and burying it under the
 * pillows is how it stopped being looked at in the first place.
 */
export function lineSortRank(sku: string): number {
  const cat = lineClass(sku);
  if (cat === "mattress") return 0;
  if (cat === "bedframe") return 1;
  if (cat === "sofa") return 2;
  if (cat === "unknown") return 3;
  const name = accShort(sku);
  if (name === "Pillow") return 4;
  if (name === "Mattress protector") return 5;
  if (name === "Disposal" || name === "Service") return 7; // service last
  return 6; // other accessories (Topper / Footrest / …) before service
}

/**
 * Suggested default stock location for a line (Jess 2026-06-22):
 *   • core furniture (Mattress / Bedframe / Sofa) → its SUPPLIER name — it's made
 *     to order and sits at the supplier until received. Current core suppliers:
 *     mattress = Nice Future, bedframe + sofa = Ohana ([[supplier-core-mapping]]).
 *   • accessory goods (Pillow / Mattress protector / Topper / Footrest) → "Carres Klang" — kept
 *     as ready warehouse stock.
 *   • service charges (No Lift / Disposal / floor) → null — no physical location.
 * It's only a DEFAULT — the drawer dropdown lets the operator override per line.
 *
 * The default is the FINAL consolidation point (Jess 2026-07-07), driven by the
 * order's assigned LOGISTIC — NOT the supplier: HOUZS → Houzs Balakong · AL → AL ·
 * everything else (incl. NETS + not-yet-assigned) → the own Carres Klang
 * warehouse. Received stock is booked in at where it's consolidated for delivery,
 * so a mattress lands at the Klang warehouse by default, not at its supplier.
 */
export function defaultLineLocation(
  sku: string,
  logisticName?: string | null,
): string | null {
  if (lineKind(sku) === "service") return null; // no physical location
  const l = (logisticName ?? "").trim().toLowerCase();
  if (l.includes("houzs")) return "Houzs Balakong";
  if (l === "al") return "AL";
  return "Carres Klang"; // own warehouse — the default consolidation point
}

// NOTE: STOCK_LOCATIONS is NOT re-exported here — it already leaves the shared
// barrel via schemas/ops-order-control; a second export would collide.

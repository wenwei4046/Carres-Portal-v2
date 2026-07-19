/**
 * Product bundle pricing (migration 0239) — the PURE explode engine.
 *
 * A bundle = a named set of catalog SKUs sold together at ONE bundle price
 * (e.g. Cloud King + Lumi King + Kayu King = RM 2,500). The POS explodes the
 * bundle into ONE order_line per component (each physical item must stay its
 * own line — supplier forecast / POs / stock all count per SKU), splitting the
 * bundle price proportional to catalog price × qty. The split is Σ-EXACT: the
 * emitted lines always sum to the bundle price to the cent (integer cents math
 * + largest-remainder distribution — no float drift, no lost cent).
 *
 * A component whose per-unit cents can't come out equal (qty > 1 with a
 * residue cent) is emitted as TWO lines one cent apart; every emitted line
 * carries a `slot` index the POS stamps into attrs (`bundle_slot`) so
 * attrs-keyed cart merging can never collapse two different-priced lines of
 * the same SKU.
 *
 * PURE: no DB/IO — shared verbatim by the POS (cart add + preview) and the
 * ERP editor (live split preview), so the figures cannot drift (the
 * specials/sofa/delivery honest-pricing pattern).
 */

/** One component of a product bundle: a specific catalog SKU × qty. */
export interface BundleComponent {
  sku: string;
  qty: number;
}

/** One exploded bundle line: `qty` units of `sku` at `unitPrice` (2dp). */
export interface ExplodedBundleLine {
  /** Emit-order index — stamp into attrs (`bundle_slot`) so same-SKU lines
   *  one cent apart never merge into one cart line. */
  slot: number;
  sku: string;
  qty: number;
  unitPrice: number;
}

export interface ExplodeBundleResult {
  /** False when the bundle can't be priced honestly (no components, a
   *  component's catalog price is unknown) — the POS must refuse the add. */
  ok: boolean;
  /** Σ unitPrice × qty === bundle price (to the cent) whenever `ok`. */
  lines: ExplodedBundleLine[];
  /** Σ catalog price × qty over the components (the "worth" the bundle
   *  discounts from) — 0 when any price is missing. */
  catalogTotal: number;
  /** Components whose catalog price lookup failed (unknown / not for sale). */
  missingSkus: string[];
}

/**
 * Parse a `product_bundles.components` jsonb value, dropping malformed
 * entries (same lenient convention as `parseDefaultFreeGifts` /
 * `parseRuleTargets`): each entry needs a non-empty string `sku` and an
 * integer `qty` >= 1.
 */
export function parseBundleComponents(raw: unknown): BundleComponent[] {
  if (!Array.isArray(raw)) return [];
  const out: BundleComponent[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const sku = (entry as { sku?: unknown }).sku;
    const qty = Number((entry as { qty?: unknown }).qty);
    if (typeof sku !== "string" || sku.trim() === "") continue;
    if (!Number.isInteger(qty) || qty < 1) continue;
    out.push({ sku: sku.trim(), qty });
  }
  return out;
}

const toCents = (rm: number): number => Math.round(rm * 100);

/**
 * Explode a bundle into per-component lines whose prices sum EXACTLY to the
 * bundle price.
 *
 * Split rule: proportional to catalog price × qty (`priceOf` supplies the
 * catalog unit price; return null/undefined for an unknown SKU). All-zero
 * catalog prices fall back to an equal per-unit split. Rounding residue is
 * distributed one cent at a time by largest fractional remainder
 * (deterministic; ties broken by unit order), so Σ lines === bundle price
 * always — the customer sees exactly the promised figure.
 */
export function explodeBundle(
  components: BundleComponent[],
  bundlePrice: number,
  priceOf: (sku: string) => number | null | undefined,
): ExplodeBundleResult {
  const missingSkus: string[] = [];
  if (components.length === 0 || !Number.isFinite(bundlePrice) || bundlePrice < 0) {
    return { ok: false, lines: [], catalogTotal: 0, missingSkus };
  }

  // Resolve every component's catalog unit price first — an unknown SKU makes
  // the whole split unpriceable (never silently price a component 0; that was
  // the 0177-era `combo-component-price-availability` skew).
  const unitCents: number[] = [];
  for (const comp of components) {
    const p = priceOf(comp.sku);
    if (p == null || !Number.isFinite(p) || p < 0) {
      missingSkus.push(comp.sku);
      unitCents.push(0);
    } else {
      unitCents.push(toCents(p));
    }
  }
  if (missingSkus.length > 0) {
    return { ok: false, lines: [], catalogTotal: 0, missingSkus };
  }

  const bundleCents = toCents(bundlePrice);
  const catalogTotalCents = components.reduce((s, c, i) => s + unitCents[i]! * c.qty, 0);

  // Per-UNIT allocation (a qty-n component contributes n units), so a residue
  // cent can land on a single unit without breaking any line's 2dp unit price.
  interface Unit {
    comp: number;
    weight: number;
  }
  const units: Unit[] = [];
  for (let i = 0; i < components.length; i++) {
    for (let u = 0; u < components[i]!.qty; u++) units.push({ comp: i, weight: unitCents[i]! });
  }
  const totalWeight = units.reduce((s, u) => s + u.weight, 0);

  // Largest-remainder allocation in integer cents.
  const floors: number[] = [];
  const remainders: number[] = [];
  let allocated = 0;
  for (const u of units) {
    // All-zero catalog prices → equal split by unit count.
    const exact =
      totalWeight === 0
        ? bundleCents / units.length
        : (bundleCents * u.weight) / totalWeight;
    const fl = Math.floor(exact);
    floors.push(fl);
    remainders.push(exact - fl);
    allocated += fl;
  }
  let residue = bundleCents - allocated;
  // Hand the residue cents to the units with the largest fractional remainder
  // (stable: ties keep unit order).
  const order = units
    .map((_, i) => i)
    .sort((a, b) => remainders[b]! - remainders[a]! || a - b);
  for (let k = 0; k < order.length && residue > 0; k++) {
    const oi = order[k]!;
    floors[oi] = floors[oi]! + 1;
    residue -= 1;
  }

  // Regroup consecutive same-component units with the SAME cents into lines.
  const lines: ExplodedBundleLine[] = [];
  let unitIdx = 0;
  for (let i = 0; i < components.length; i++) {
    const comp = components[i]!;
    const byCents = new Map<number, number>();
    for (let u = 0; u < comp.qty; u++) {
      const cents = floors[unitIdx]!;
      byCents.set(cents, (byCents.get(cents) ?? 0) + 1);
      unitIdx++;
    }
    // Deterministic order: higher unit price first (the +1-cent units).
    for (const cents of [...byCents.keys()].sort((a, b) => b - a)) {
      lines.push({ slot: lines.length, sku: comp.sku, qty: byCents.get(cents)!, unitPrice: cents / 100 });
    }
  }

  return { ok: true, lines, catalogTotal: catalogTotalCents / 100, missingSkus };
}

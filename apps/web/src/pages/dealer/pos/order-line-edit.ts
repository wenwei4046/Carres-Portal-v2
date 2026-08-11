import type { CatalogResponse, OrderLine } from "@carres/shared";
import type { SofaBuildGroupRow } from "@/lib/sofa-build-display";
import type { DraftLine } from "../new-order/draft";
import { isRentalLine } from "./rental-cart";

/**
 * 0255 — Order line EDIT (Loo 2026-07-25): which PERSISTED rows the
 * place-lane pencil can re-open, and how they turn back into the DraftLine
 * the configure surfaces' `editLine` seed expects.
 *
 * ── ONE CORE, TWO WRAPPERS (2026-08-11, ERP-ARCHITECTURE Law C) ─────────────
 * `configureSurfaceFor` below is the ONLY answer to *"which configure surface
 * re-opens this row?"*. It used to be answered twice — here for persisted
 * `order_lines` and again in `cart.ts` `lineEditTarget` for draft cart rows —
 * over two row shapes that both carry nothing but `sku` + `attrs`. The two
 * copies drifted: the cart learnt about rental when 0275 shipped and this one
 * did not, which is how a persisted rental line came to open the OUTRIGHT-SALE
 * configurator over a signed agreement. A door, never a duplicate.
 *
 * `cart.ts` now imports the core and keeps only what genuinely differs. What
 * differs is real, and it is exactly two things:
 *
 *   BLOCKED ROWS   the cart rejects `bundle_group` only (that is the only
 *                  marker a draft line can carry). A persisted row rejects the
 *                  full `BLOCKED_MARKERS` set for parity with the server's own
 *                  `line_not_editable`.
 *   SOFA BUILDS    `attrs.sofa_build` means "open SofaConfigurePage" in the
 *                  cart, where the canvas geometry is still on the line. On a
 *                  persisted row it means the OPPOSITE — no pencil — because
 *                  the row is one exploded compartment that edits via its
 *                  GROUP (`draftFromSofaGroup`), and a RAW un-exploded build
 *                  (ops raw-create door) cannot round-trip the engine at all.
 *
 * The ONE business rule (server-enforced, `downsell_blocked`): a replacement
 * may never total below the replaced rows — edits only up-sell.
 */

const BLOCKED_MARKERS = ["free_gift", "free_item", "pwp", "bundle_group", "combo_key"] as const;

function hasBlockedMarker(attrs: Record<string, unknown> | null): boolean {
  if (!attrs) return false;
  return BLOCKED_MARKERS.some((k) => Boolean(attrs[k]));
}

/** The whole row a configure surface is chosen from. A draft cart line and a
 *  persisted `order_lines` row are different types that agree on these two. */
export interface ConfigurableRow {
  sku: string;
  attrs: Record<string, unknown> | null;
}

export type ConfigureSurface = "sofa_build" | "bed_mattress" | "rental";

/**
 * Which configure surface re-opens this row — the shared core. Says nothing
 * about whether the CALLER may open it: blocked markers and the persisted /
 * cart difference belong to the wrappers, not here.
 */
export function configureSurfaceFor(
  row: ConfigurableRow,
  catalog: CatalogResponse,
): ConfigureSurface | null {
  const sku = catalog.skus.find((s) => s.sku === row.sku);
  const model = sku ? catalog.models.find((m) => m.id === sku.modelId) : undefined;
  if (!model) return null;
  const attrs = row.attrs;
  // A build only reopens on the canvas that drew it — a preset sofa picked from
  // a dropdown carries no geometry and has nothing to reopen.
  if (attrs?.sofa_build || attrs?.sofa_build_key) {
    return model.category === "sofa" ? "sofa_build" : null;
  }
  // BEFORE the category test, because a rented mattress is still a mattress
  // MODEL and would otherwise open the OUTRIGHT-SALE configurator: RM0 (a
  // rental's money lives in `rental_plans`, never on the sku), plus a Remark
  // price adjustment and a PWP bar that mean nothing to a rental.
  if (isRentalLine(row)) return "rental";
  return model.category === "mattress" || model.category === "bedframe" ? "bed_mattress" : null;
}

/** Pencil gate for a STANDALONE persisted row → "bed_mattress"
 *  (PosConfigurePage) or null. */
export function orderLineEditKind(
  line: OrderLine,
  catalog: CatalogResponse,
): "bed_mattress" | null {
  if (hasBlockedMarker(line.attrs)) return null;
  // A saved row can only reopen the mattress/bedframe screen. The other two
  // answers are real — the row IS a sofa build, or IS a rental — but neither
  // may be reopened from here, so both fall through to "no pencil":
  //
  //   sofa build → one saved row is a fragment of the build; only the whole
  //                group can reopen it (see `draftFromSofaGroup`).
  //   rental     → saving would replace a signed agreement's line with an
  //                outright mattress. There is no screen that can amend a
  //                rental yet; when there is, it hooks in HERE.
  //                Why it is that bad: docs/carry-forwards.md, entry
  //                `pencil-on-a-persisted-rental-line-replaces-a-signed-agreement`.
  return configureSurfaceFor(line, catalog) === "bed_mattress" ? "bed_mattress" : null;
}

/** A persisted standalone row as the DraftLine PosConfigurePage seeds from.
 *  The server option/special recomputes wrote canonical attrs at create, so
 *  the row round-trips as-is. */
export function draftFromOrderLine(line: OrderLine): DraftLine {
  return {
    localId: line.id,
    sku: line.sku,
    qty: line.qty,
    attrs: line.attrs,
    unitPrice: line.unitPrice,
    label: line.sku,
  };
}

/**
 * Reconstruct the pre-explode sofa-build DraftLine from a persisted exploded
 * group so SofaConfigurePage's `editLine` seed puts the stored geometry back
 * on the canvas. Returns null (pencil hides) when:
 *   - any row carries a free/promo/bundle marker (reward builds), or
 *   - the group predates the geometry stamps (cell_index / module_code /
 *     sofa_height missing) and can't round-trip.
 *
 * Fabric: a series fabric survives explode as `fabric_id` (→ `sf:` key). A
 * master-catalog pick loses its code at explode — recover it by matching
 * `fabric_name` back against the master list (names are stamped from the
 * code + description); unmatched → the page reopens colour-KIV and the
 * operator re-picks.
 */
export function draftFromSofaGroup(
  group: SofaBuildGroupRow,
  catalog: CatalogResponse,
): DraftLine | null {
  if (group.lines.length === 0) return null;
  if (group.lines.some((l) => hasBlockedMarker(l.attrs as Record<string, unknown> | null)))
    return null;

  const parsed = group.lines.map((l) => {
    const a = (l.attrs ?? {}) as Record<string, unknown>;
    return {
      cellIndex: typeof a.cell_index === "number" ? a.cell_index : null,
      moduleCode: typeof a.module_code === "string" && a.module_code ? a.module_code : null,
      x: typeof a.x === "number" ? a.x : 0,
      y: typeof a.y === "number" ? a.y : 0,
      rot: typeof a.rot === "number" ? a.rot : 0,
    };
  });
  if (parsed.some((p) => p.cellIndex === null || p.moduleCode === null)) return null;

  const first = (group.lines[0]!.attrs ?? {}) as Record<string, unknown>;
  const height = typeof first.sofa_height === "string" && first.sofa_height ? first.sofa_height : null;
  if (!height) return null;

  const cells = [...parsed]
    .sort((a, b) => a.cellIndex! - b.cellIndex!)
    .map((p) => ({ moduleCode: p.moduleCode!, x: p.x, y: p.y, rot: p.rot }));

  const attrs: Record<string, unknown> = {
    mode: "build",
    sofa_build: { cells, height },
  };
  for (const k of [
    "fabric_id",
    "fabric_name",
    "fabric_surcharge",
    "fabric_tier",
    "fabric_code",
    "fabric_series",
    "leg_height",
    "leg_surcharge",
    "remark",
    "remark_surcharge",
  ]) {
    if (first[k] !== undefined && first[k] !== null) attrs[k] = first[k];
  }
  if (!attrs.fabric_id && !attrs.fabric_code && typeof first.fabric_name === "string") {
    const name = first.fabric_name;
    const mf = (catalog.fabrics ?? []).find(
      (f) => name === f.fabricCode || name.startsWith(f.fabricCode + " "),
    );
    if (mf) attrs.fabric_code = mf.fabricCode;
  }

  return {
    localId: group.buildKey,
    sku: group.lines[0]!.sku,
    qty: 1,
    attrs,
    unitPrice: group.totalPrice,
    label: "Sofa build",
  };
}

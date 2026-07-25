import type { CatalogResponse, OrderLine } from "@carres/shared";
import type { SofaBuildGroupRow } from "@/lib/sofa-build-display";
import type { DraftLine } from "../new-order/draft";

/**
 * 0255 — Order line EDIT (Loo 2026-07-25): which PERSISTED rows the
 * place-lane pencil can re-open, and how they turn back into the DraftLine
 * the configure surfaces' `editLine` seed expects.
 *
 * Mirrors the wizard-cart rule (`cart.ts` lineEditTarget) for persisted rows:
 *   - free / promo / bundle / combo rows are never editable — their prices
 *     are minted by promo/bundle law, not the configurator;
 *   - exploded sofa rows edit as a GROUP (SofaConfigurePage, geometry
 *     reconstructed below), never per-compartment;
 *   - mattress / bedframe rows re-open PosConfigurePage;
 *   - accessory / service rows stay pencil-less (no configurator, same as
 *     the wizard).
 *
 * The ONE business rule (server-enforced, `downsell_blocked`): a replacement
 * may never total below the replaced rows — edits only up-sell.
 */

const BLOCKED_MARKERS = ["free_gift", "free_item", "pwp", "bundle_group", "combo_key"] as const;

function hasBlockedMarker(attrs: Record<string, unknown> | null): boolean {
  if (!attrs) return false;
  return BLOCKED_MARKERS.some((k) => Boolean(attrs[k]));
}

/** Pencil gate for a STANDALONE row → "bed_mattress" (PosConfigurePage) or
 *  null. Exploded sofa rows return null here — they edit via their group. */
export function orderLineEditKind(
  line: OrderLine,
  catalog: CatalogResponse,
): "bed_mattress" | null {
  const attrs = line.attrs as Record<string, unknown> | null;
  if (hasBlockedMarker(attrs)) return null;
  // Exploded compartment rows edit as a group; a RAW un-exploded build (ops
  // raw-create door) can't round-trip the engine — no pencil either.
  if (attrs?.sofa_build_key || attrs?.sofa_build) return null;
  const sku = catalog.skus.find((s) => s.sku === line.sku);
  const model = sku ? catalog.models.find((m) => m.id === sku.modelId) : undefined;
  if (!model) return null;
  return model.category === "mattress" || model.category === "bedframe" ? "bed_mattress" : null;
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

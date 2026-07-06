import type { ProductModelDto, ProductSkuDto } from "@carres/shared";
import { newLocalId } from "../new-order/configurators";
import type { DraftLine } from "../new-order/draft";
import type { SofaBuildAddPayload } from "./SofaBuildCanvas";

/**
 * Turn a finished `<SofaBuildCanvas>` build into ONE contract-safe `DraftLine`
 * (Phase 3, sofa engine). PURE — no React, no IO — mirroring the style of
 * `comboToDraftLines` in `../new-order/draft.ts`.
 *
 * The interim P3 design (locked Loo 2026-06-21) emits a SINGLE line, not the
 * per-compartment explode (that is Phase 4 + a server recompute). The single
 * line carries:
 *   - `sku`   = the model's REPRESENTATIVE sofa `product_skus.sku` so the 0089
 *               sofa↔mattress/bedframe mutex + every downstream join (PO / stock
 *               / SO grid) still see a real sofa sku. Deterministic pick: the
 *               first `variantKind === 'preset'` sku, else the first sku of the
 *               model. If the model has NO sku at all → return null (the canvas
 *               disables "Add" with a note instead of emitting a broken line).
 *   - `qty`   = 1 (one configured sofa build).
 *   - `unitPrice` = the client-computed build total (`payload.total`).
 *   - `attrs` = the SAME fabric convention the operation `CreatePOModal` cascade
 *               keys off (`fabric_id` / `fabric_name` / `fabric_surcharge` /
 *               `fabric_tier`) PLUS the geometry descriptor `sofa_build`
 *               (`{ cells, height }`), a `sofa_build_key` (mirrors `combo_key`,
 *               for the Phase-4 regroup), and `mode: 'build'`.
 *   - `label` = a compact human summary (model · cells · height″ · fabric).
 *
 * Nothing downstream changes — cart `mergeLine`, `DealerPos.handleSubmit`, and
 * `create_order` all see a normal single sofa line.
 */
export function buildToDraftLine(
  payload: SofaBuildAddPayload,
  model: ProductModelDto,
  skus: ProductSkuDto[],
): DraftLine | null {
  const repSku = representativeSofaSku(skus);
  if (!repSku) return null;

  const attrs: Record<string, unknown> = {
    mode: "build",
    // Same fabric convention as SofaConfigurator so the operation CreatePOModal
    // fabric cascade still pre-selects the chip. fabric_id may be null when the
    // model has no fabrics; fabric_surcharge is the resolved tier delta.
    fabric_id: payload.fabricId,
    fabric_name: payload.fabricName,
    fabric_surcharge: payload.fabricSurcharge,
    fabric_tier: payload.fabricTier,
    // 0202-wiring — the master Fabrics-tab code when the pick came from the
    // master list (fabric_id stays null for those).
    ...(payload.fabricCode ? { fabric_code: payload.fabricCode } : {}),
    // 0202 series — recorded even when the colour is still KIV (series known,
    // colour pending), so the order/PO shows "EZ series · colour to confirm".
    ...(payload.fabricSeries ? { fabric_series: payload.fabricSeries } : {}),
    // KIV — fabric colour deferred to the customer; downstream shows a "to
    // confirm" chip instead of a fabric name. True whenever no concrete colour
    // is locked (series KIV, or series chosen + colour KIV).
    fabric_deferred: payload.fabricDeferred,
    // 0201-wiring — leg height; the server recompute re-prices it from the
    // sofa_leg_height pool inside the drift-gated computeSofaPrice total.
    ...(payload.legHeight
      ? { leg_height: payload.legHeight, leg_surcharge: payload.legSurcharge }
      : {}),
    // Full build geometry descriptor (cells + height) — Phase 4 reads this to
    // server-recompute + explode into per-compartment lines.
    sofa_build: { cells: payload.cells, height: payload.height },
    // Mirrors combo_key — a stable per-build id so a future explode can regroup.
    sofa_build_key: newLocalId(),
  };

  return {
    localId: newLocalId(),
    sku: repSku.sku,
    qty: 1,
    attrs,
    unitPrice: payload.total,
    label: buildLabel(payload, model),
  };
}

/**
 * Deterministic representative sofa SKU for a model: the first `preset` sku,
 * else the first sku. Returns null when the model has no skus.
 */
function representativeSofaSku(skus: ProductSkuDto[]): ProductSkuDto | null {
  if (skus.length === 0) return null;
  return skus.find((s) => s.variantKind === "preset") ?? skus[0] ?? null;
}

/** A compact cells summary like "2A+L+1A" from the build's module codes. */
function cellsSummary(payload: SofaBuildAddPayload): string {
  if (payload.cells.length === 0) return "—";
  return payload.cells.map((c) => c.moduleCode).join(" + ");
}

/** "Ohana · 2A + L + 1A · 28″ · Velvet Teal · leg 4″" style label. */
function buildLabel(payload: SofaBuildAddPayload, model: ProductModelDto): string {
  const parts = [model.name, cellsSummary(payload), `${payload.height}″`];
  if (payload.fabricName) parts.push(payload.fabricName);
  // KIV: series known but colour pending → "EZ · colour KIV"; nothing chosen →
  // "Fabric KIV".
  else if (payload.fabricSeries) parts.push(`${payload.fabricSeries} · colour KIV`);
  else if (payload.fabricDeferred) parts.push("Fabric KIV");
  if (payload.legHeight) parts.push(`leg ${payload.legHeight}`);
  return parts.join(" · ");
}

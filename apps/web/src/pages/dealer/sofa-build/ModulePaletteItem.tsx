import { Plus } from "lucide-react";
import type { SofaCompartmentDto, ModelSofaCompartmentDto } from "@carres/shared";
import { resolveCompartmentPrice } from "@carres/shared";
import CompartmentSilhouette from "./CompartmentSilhouette";

/**
 * <ModulePaletteItem> — one card in the sofa builder's left module palette.
 * Shows the compartment's silhouette + code + its resolved à-la-carte price
 * (`resolveCompartmentPrice(offered, pool)` — the synced compartment SKU's
 * price (SKU Master) is authoritative; the legacy `priceOverride` → pool
 * `defaultPrice` chain is the fallback) + a `+` button that spawns the cell on
 * the canvas (`onAdd(code)`).
 *
 * Purely presentational + a single callback — the canvas owns placement.
 * Skin = the pos-proto design contract (`.sof-cust__paletteItem`,
 * prototype/pos-sofa-config.jsx): a paper card sitting ON the white rail so the
 * card reads as a layer, orange hover ring, burnt price, orange `+` chip.
 * Lucide Plus, no emoji.
 */

function fmtRM(n: number): string {
  return n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ModulePaletteItem({
  compartment,
  offered,
  size,
  onAdd,
}: {
  /** The pool compartment (code / description / icon / default price). */
  compartment: SofaCompartmentDto;
  /** This model's offered row (drives the price override). Null = pool default. */
  offered: ModelSofaCompartmentDto | null;
  /** 0204 — the canvas's selected size; the per-size price map wins when it
   *  prices this size, else the flat SKU price (same chain as the engine). */
  size?: string | null;
  onAdd: (code: string) => void;
}) {
  const price = resolveCompartmentPrice(offered, compartment, size);
  // The prototype's sub line = the description minus its "CODE · " prefix.
  const sub = compartment.description?.replace(`${compartment.code} · `, "");

  return (
    <button
      type="button"
      onClick={() => onAdd(compartment.code)}
      title={compartment.description ?? compartment.code}
      className="sof-cust__paletteItem"
      data-testid={`module-palette-item-${compartment.code}`}
    >
      <span className="sof-cust__paletteArt">
        <CompartmentSilhouette
          code={compartment.code}
          iconUrl={compartment.iconUrl}
          className="max-h-full max-w-full"
        />
      </span>
      <span className="sof-cust__paletteInfo">
        <span className="sof-cust__paletteLabel">{compartment.code}</span>
        {sub && sub !== compartment.code && (
          <span className="sof-cust__paletteSub">{sub}</span>
        )}
        <span className="sof-cust__palettePrice">RM {fmtRM(price)}</span>
      </span>
      <span className="sof-cust__paletteAdd" aria-hidden="true">
        <Plus size={14} strokeWidth={2.4} />
      </span>
    </button>
  );
}

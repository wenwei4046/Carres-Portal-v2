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
 * v17 card/button styling, Lucide Plus, no emoji.
 */

function fmtRM(n: number): string {
  return n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ModulePaletteItem({
  compartment,
  offered,
  onAdd,
}: {
  /** The pool compartment (code / description / icon / default price). */
  compartment: SofaCompartmentDto;
  /** This model's offered row (drives the price override). Null = pool default. */
  offered: ModelSofaCompartmentDto | null;
  onAdd: (code: string) => void;
}) {
  const price = resolveCompartmentPrice(offered, compartment);

  return (
    <button
      type="button"
      onClick={() => onAdd(compartment.code)}
      title={compartment.description ?? compartment.code}
      className="group flex w-full items-center gap-3 rounded-[6px] border border-base-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-primary/60 hover:bg-base-50"
      data-testid={`module-palette-item-${compartment.code}`}
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center">
        <CompartmentSilhouette
          code={compartment.code}
          iconUrl={compartment.iconUrl}
          className="max-h-12 max-w-12"
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block t-small font-semibold font-mono text-base-900 truncate">
          {compartment.code}
        </span>
        <span className="block t-tiny font-mono text-base-500">RM {fmtRM(price)}</span>
      </span>
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-base-900 text-white transition-colors group-hover:bg-primary"
        aria-hidden="true"
      >
        <Plus size={15} strokeWidth={2.4} />
      </span>
    </button>
  );
}

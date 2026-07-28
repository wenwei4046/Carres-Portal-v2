/**
 * The shared skin for everything that floats above the page — card D0.5b.
 *
 * `Modal` · `Drawer` · `Popover` · `DropdownMenu` · `Select` · `Tooltip` all
 * draw the same surface, and §6.6 says the second occurrence of a UI element
 * is a full stop: extract it first, then use it six times.
 *
 * Today the codebase hand-rolls a modal or drawer in **63 files, in 12+ overlay
 * shapes with 5 different backdrop colours**. This is the one they replace.
 *
 * **Radix owns behaviour, Carres owns appearance** (§11). Nothing here sets a
 * position, a focus trap or an escape handler — the primitives do that. What
 * lives here is the surface: fill, hairline, radius, and the ONE scrim.
 */
import { Z } from "./tokens";

/** The scrim. ONE colour, everywhere — 63 files currently disagree on it. */
export const SCRIM = `fixed inset-0 ${Z.overlay} bg-kit-slate-12/40`;

/** A floating surface: modal, drawer, popover, menu, select list. */
export const SURFACE = "bg-white border border-kit-slate-5 rounded-card";

/** Popover-class layers — dropdown · popover · select · tooltip (§4.4 = 30). */
export const POPOVER_SURFACE = `${SURFACE} ${Z.popover} p-2 shadow-none`;

/** Modal · drawer live one layer up (§4.4 = 40) and above the scrim. */
export const OVERLAY_SURFACE = `${SURFACE} fixed ${Z.overlay}`;

/**
 * A row inside a menu or a select list. Hover is the single faint blue tint
 * (§3.5) — never grey, which the RULE I ratchet also watches.
 */
export const MENU_ITEM =
  "flex w-full cursor-pointer select-none items-center gap-2 rounded-control px-2 py-1.5 text-body text-kit-slate-12 " +
  "outline-none data-[highlighted]:bg-kit-blue-3 data-[state=checked]:bg-kit-blue-3 " +
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-40";

/** The tooltip is the one floating surface that is NOT white — it is ink. */
export const TOOLTIP_SURFACE = `${Z.popover} rounded-control bg-kit-slate-12 px-2 py-1 text-meta text-white max-w-xs`;

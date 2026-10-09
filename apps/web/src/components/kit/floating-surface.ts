/**
 * The ONE floating surface, shared by `Select` · `DropdownMenu` · `Popover` ·
 * `DatePicker` · `Tooltip` (UI-KIT §6.6, card D0.5b).
 *
 * §6.6: *"If a UI element appears a second time, it stops being inline and
 * becomes a Foundation Component. The second occurrence is a full stop."* Five
 * Radix primitives needed the same white surface, the same hairline, the same
 * radius and the same layer, so the string is written once and imported five
 * times rather than pasted — the D0.5a `field-recipe.ts` move, applied to the
 * overlays.
 *
 * v4 (owner instruction 9 Oct 2026, 01 §3 Popup): white, 8px corner, the
 * menu shadow and no hairline. The surface carries NO padding: the menu, the
 * list and the popover each add the popup's 6px themselves.
 */
import { Z_FLOATING } from "./overlay-layer";

/** White surface · 8px corner · `--shadow-menu` · §4.4 layer 3. */
export const FLOATING_SURFACE =
  `bg-c-card text-c-ink rounded-lg [box-shadow:var(--shadow-menu)] ${Z_FLOATING}`;

/**
 * A row inside a menu or a listbox: pad 7 × 10, 13 / 500. Hover is the warm
 * hover grey; the chosen row is the person's theme selection pair.
 */
export const FLOATING_ITEM =
  "flex w-full items-center gap-2 rounded-lg [padding:var(--menu-item-pad)] text-body font-medium text-c-ink " +
  "cursor-pointer select-none outline-none " +
  "data-[highlighted]:bg-c-hover data-[state=checked]:bg-c-select-bg data-[state=checked]:text-c-select-fg " +
  "data-[disabled]:opacity-40 data-[disabled]:cursor-not-allowed data-[disabled]:bg-transparent";

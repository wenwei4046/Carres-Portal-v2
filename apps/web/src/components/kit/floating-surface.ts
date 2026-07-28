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
 * **A note on the radius, reported rather than invented.** §4.2 names its four
 * radii by USE: `rounded-control` (6) covers *button · input · dropdown*, and
 * `rounded-card` (10) covers *card · panel · modal · drawer*. A **popover** and
 * a **tooltip** appear in neither list. They take the dropdown's 6 here because
 * that is what they are — a small surface hanging off a control — but the law
 * does not say so, and the finding goes back to the kit rather than being
 * quietly settled in a component.
 */
import { Z_FLOATING } from "./overlay-layer";

/** White surface · §3.2 hairline · §4.2 dropdown radius · §4.4 layer 3. */
export const FLOATING_SURFACE =
  `bg-white border border-kit-slate-5 rounded-control ${Z_FLOATING}`;

/**
 * A row inside a menu or a listbox. The hover is §3.5's single faint blue tint
 * — never grey, which reads as structure rather than as "you are on this one".
 */
export const FLOATING_ITEM =
  "flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-body text-kit-slate-12 " +
  "cursor-pointer select-none outline-none " +
  "data-[highlighted]:bg-kit-blue-3 data-[state=checked]:bg-kit-blue-3 " +
  "data-[disabled]:opacity-40 data-[disabled]:cursor-not-allowed data-[disabled]:bg-transparent";

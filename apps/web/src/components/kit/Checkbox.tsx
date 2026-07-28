/**
 * Checkbox — a box, a tick, and a word (UI-KIT §6, card D0.5b).
 *
 * §4.2 puts a checkbox on `rounded-pill` (4) by name, so this is the one control
 * that does not take the 6px control radius.
 *
 * **It has a third state and that state means something.** `indeterminate` is
 * what a table's select-all shows when some rows are picked — Radix models it as
 * a real value rather than as a class a page paints on, so "some" cannot be
 * mistaken for "none" the way a styled-empty box is. `DataTable` (D0.5c) is the
 * consumer this exists for.
 *
 * **The label is part of the control, not a sibling.** A bare box with a word
 * beside it is a word that does not toggle anything when clicked; here the whole
 * row is the label. Pass `label=""` only for a table cell, where the column
 * header is the name and `aria-label` carries it.
 */
import * as RadixCheckbox from "@radix-ui/react-checkbox";
import Icon from "./Icon";

export default function Checkbox({
  id,
  label,
  checked,
  onCheckedChange,
  disabled = false,
  ariaLabel,
}: {
  id: string;
  /** The word beside the box. Omit inside a table row. */
  label?: string;
  /** `"indeterminate"` = some, not none — a select-all over a partial pick. */
  checked: boolean | "indeterminate";
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Required when there is no visible label. */
  ariaLabel?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <RadixCheckbox.Root
        id={id}
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next === true)}
        disabled={disabled}
        aria-label={label ? undefined : ariaLabel}
        data-kit="checkbox"
        className={
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-pill border " +
          "border-kit-slate-5 bg-white " +
          "data-[state=checked]:border-kit-blue-9 data-[state=checked]:bg-kit-blue-9 " +
          "data-[state=indeterminate]:border-kit-blue-9 data-[state=indeterminate]:bg-kit-blue-9 " +
          "disabled:opacity-40 disabled:cursor-not-allowed " +
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9 focus-visible:ring-offset-1"
        }
      >
        <RadixCheckbox.Indicator className="text-white">
          {/* "some" is a dash, "all" is a tick — two shapes, so the difference
           *  survives a greyscale screenshot and a colour-blind reader. */}
          {checked === "indeterminate" ? (
            <span aria-hidden="true" className="block h-0.5 w-2 rounded-pill bg-white" />
          ) : (
            <Icon name="confirm" size={14} />
          )}
        </RadixCheckbox.Indicator>
      </RadixCheckbox.Root>
      {label && (
        <label htmlFor={id} className="text-body text-kit-slate-12 cursor-pointer">
          {label}
        </label>
      )}
    </div>
  );
}

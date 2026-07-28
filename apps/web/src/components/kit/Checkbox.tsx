/**
 * Checkbox — UI-KIT §6 Box Dictionary, card D0.5b.
 *
 * §4.2 gives it the 4px pill radius (it sits in the same family as a tag), and
 * §3.3 gives the checked state BLUE — the "action · clickable · selected" job.
 * Row multi-select is the main live use, and blue is what the portal already
 * means by "selected".
 *
 * **`indeterminate` exists because a header checkbox needs it.** "Some rows on
 * this page are picked" is a real third state, and the alternative — showing it
 * as unchecked — makes a Select-all click un-pick what the operator chose.
 *
 * **There is no `label` prop and no built-in text**, because a checkbox in a
 * table row has no label at all (the row is the label) while a checkbox in a
 * form has one that must sit in `FieldFrame`'s layout. Pass `aria-label` for
 * the first case; wrap it for the second.
 */
import * as RadixCheckbox from "@radix-ui/react-checkbox";
import Icon from "./Icon";

export default function Checkbox({
  checked,
  onCheckedChange,
  disabled = false,
  id,
  "aria-label": ariaLabel,
}: {
  /** `"indeterminate"` = some but not all — the header-row state. */
  checked: boolean | "indeterminate";
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
}) {
  return (
    <RadixCheckbox.Root
      id={id}
      data-kit="checkbox"
      aria-label={ariaLabel}
      checked={checked}
      disabled={disabled}
      onCheckedChange={(v) => onCheckedChange(v === true)}
      className={
        "grid h-4 w-4 shrink-0 place-items-center rounded-pill border border-kit-slate-5 bg-white " +
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9 focus-visible:ring-offset-1 " +
        "data-[state=checked]:border-kit-blue-9 data-[state=checked]:bg-kit-blue-9 " +
        "data-[state=indeterminate]:border-kit-blue-9 data-[state=indeterminate]:bg-kit-blue-9 " +
        "disabled:opacity-40 disabled:cursor-not-allowed"
      }
    >
      <RadixCheckbox.Indicator className="text-white">
        {checked === "indeterminate" ? (
          /* A dash, not a half-tick: "some" is not "partly done". */
          <span className="block h-0.5 w-2 rounded-pill bg-white" />
        ) : (
          <Icon name="confirm" size={14} />
        )}
      </RadixCheckbox.Indicator>
    </RadixCheckbox.Root>
  );
}

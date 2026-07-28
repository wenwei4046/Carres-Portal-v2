/**
 * Select — the one dropdown that picks a value (UI-KIT §6, card D0.5b).
 *
 * Radix Select, not `<select>`: a native select cannot be styled to the kit on
 * every browser, cannot show a tick beside the chosen row, and renders the OS's
 * own list on Windows — three different appearances for one control.
 *
 * **It wears the field skin, not a second one.** The trigger imports
 * `controlClass` from `field-recipe.ts`, so a Select and an Input sitting in one
 * form row are the same height, the same hairline, the same focus ring and the
 * same refusal red. That is §6.6 doing its job across two boxes.
 *
 * **Options are DATA, never children.** `<Select options={…} />` rather than
 * `<Select><Option/></Select>` — a children API lets a page put anything inside
 * a row (a pill, an icon, a second line), and the appearance stops being the
 * kit's within a week. A row is a word, and optionally a §5.3 meaning.
 *
 * **Its own words are none.** `placeholder` and every option label come from the
 * caller, which gets them from COPY-STANDARD. This file spells nothing.
 */
import * as RadixSelect from "@radix-ui/react-select";
import FieldFrame from "./FieldFrame";
import Icon, { type IconName } from "./Icon";
import { controlClass } from "./field-recipe";
import { FLOATING_ITEM, FLOATING_SURFACE } from "./floating-surface";

export interface SelectOption {
  value: string;
  label: string;
  icon?: IconName;
  disabled?: boolean;
}

export default function Select({
  id,
  label,
  hint,
  error,
  required = false,
  disabled = false,
  value,
  onValueChange,
  placeholder = "Select",
  options,
}: {
  id: string;
  label?: string;
  hint?: string;
  /** Present = the field is refused. The message replaces the hint. */
  error?: string;
  required?: boolean;
  disabled?: boolean;
  /** Controlled. `undefined` means nothing is picked and the placeholder shows. */
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  options: readonly SelectOption[];
}) {
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error} required={required}>
      <RadixSelect.Root value={value} onValueChange={onValueChange} disabled={disabled}>
        <RadixSelect.Trigger
          id={id}
          data-kit="select"
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${id}-msg` : undefined}
          className={`${controlClass(Boolean(error), "single")} inline-flex items-center justify-between gap-2 text-left data-[placeholder]:text-kit-slate-9`}
        >
          <RadixSelect.Value placeholder={placeholder} />
          <RadixSelect.Icon className="text-kit-slate-9">
            <Icon name="expand" size={16} />
          </RadixSelect.Icon>
        </RadixSelect.Trigger>

        <RadixSelect.Portal>
          {/* `--radix-select-trigger-width` is Radix's own measurement of the
           *  trigger. Binding the list to it is behaviour, not a token: the
           *  list is as wide as the control that opened it, whatever that is. */}
          <RadixSelect.Content
            position="popper"
            sideOffset={4}
            data-kit="select-list"
            className={`${FLOATING_SURFACE} min-w-[var(--radix-select-trigger-width)] p-1`}
          >
            <RadixSelect.Viewport className="flex flex-col gap-0.5">
              {options.map((o) => (
                <RadixSelect.Item
                  key={o.value}
                  value={o.value}
                  disabled={o.disabled}
                  className={FLOATING_ITEM}
                >
                  {o.icon && <Icon name={o.icon} size={14} />}
                  <RadixSelect.ItemText>{o.label}</RadixSelect.ItemText>
                  <RadixSelect.ItemIndicator className="ml-auto text-kit-blue-11">
                    <Icon name="confirm" size={14} />
                  </RadixSelect.ItemIndicator>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
    </FieldFrame>
  );
}

/**
 * Select — UI-KIT §6 Box Dictionary, card D0.5b.
 *
 * A native `<select>` cannot be styled to match `Input` on every browser, and
 * §13.3's Build Guard G bans a raw `<select>` in `pages/**` for exactly that
 * reason. Radix supplies the keyboard model (type-ahead, arrow keys, Home/End,
 * Escape) which is the half nobody hand-rolls correctly.
 *
 * **Options are DATA, not children.** `<Select options={…}>` rather than
 * `<Select><Option/></Select>`: a caller cannot then put a heading, a divider
 * or a button inside the list, which is how a select turns into a menu. If a
 * surface needs that, it is a `DropdownMenu`.
 *
 * It wears `Input`'s skin — same height, hairline, radius and focus ring — so
 * a form row lines up whatever the field happens to be.
 */
import * as RadixSelect from "@radix-ui/react-select";
import FieldFrame from "./FieldFrame";
import Icon from "./Icon";
import { controlClass } from "./field-recipe";
import { MENU_ITEM, POPOVER_SURFACE } from "./overlay-recipe";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export default function Select({
  id,
  label,
  hint,
  error,
  required = false,
  placeholder = "Select",
  options,
  value,
  onValueChange,
  disabled = false,
}: {
  id: string;
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  placeholder?: string;
  options: SelectOption[];
  value?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error} required={required}>
      <RadixSelect.Root value={value} onValueChange={onValueChange} disabled={disabled}>
        <RadixSelect.Trigger
          id={id}
          data-kit="select"
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${id}-msg` : undefined}
          className={`${controlClass(Boolean(error), "single")} flex items-center justify-between gap-2 text-left`}
        >
          {/* `placeholder` lives on Value, so an empty select reads like an
              empty Input rather than like a blank box. */}
          <RadixSelect.Value placeholder={<span className="text-kit-slate-9">{placeholder}</span>} />
          <RadixSelect.Icon className="text-kit-slate-9">
            <Icon name="expand" size={14} />
          </RadixSelect.Icon>
        </RadixSelect.Trigger>
        <RadixSelect.Portal>
          <RadixSelect.Content
            position="popper"
            sideOffset={4}
            className={`${POPOVER_SURFACE} min-w-[var(--radix-select-trigger-width)]`}
          >
            <RadixSelect.Viewport className="max-h-64">
              {options.map((o) => (
                <RadixSelect.Item key={o.value} value={o.value} disabled={o.disabled} className={MENU_ITEM}>
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

/**
 * Input — the one single-line control (UI-KIT §6, card D0.5a).
 *
 * Replaces 134 hand-rolled `<input>`s written in 121 distinct class strings.
 * No `className`, no `style`: §0.1 says a chat may not invent component styles,
 * and the only way that becomes true is for there to be nowhere to put one.
 *
 * `type` is deliberately narrowed. `checkbox` and `radio` are their own boxes
 * (D0.5b, from Radix), and `date` opens a browser calendar that is not the
 * portal's DatePicker — §11 pins that to `react-day-picker`, also D0.5b.
 */
import type { InputHTMLAttributes } from "react";
import FieldFrame from "./FieldFrame";
import { controlClass } from "./field-recipe";

export default function Input({
  id,
  label,
  hint,
  error,
  required = false,
  type = "text",
  ...rest
}: {
  id: string;
  label?: string;
  hint?: string;
  /** Present = the field is refused. The message replaces the hint. */
  error?: string;
  required?: boolean;
  type?: "text" | "email" | "tel" | "number" | "password" | "url";
} & Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "style" | "type" | "id">) {
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error} required={required}>
      <input
        id={id}
        type={type}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-msg` : undefined}
        data-kit="input"
        className={controlClass(Boolean(error), "single")}
        {...rest}
      />
    </FieldFrame>
  );
}

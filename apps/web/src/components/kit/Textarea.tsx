/**
 * Textarea — the one multi-line control (UI-KIT §6, card D0.5a).
 *
 * The same skin as `Input` (imported, never re-typed) with a natural height
 * instead of the 32px control height. `rows` is the only size knob: an
 * arbitrary `h-[Npx]` on a textarea is how a note box ends up a different
 * height on every page.
 */
import type { TextareaHTMLAttributes } from "react";
import FieldFrame from "./FieldFrame";
import { controlClass } from "./field-recipe";

export default function Textarea({
  id,
  label,
  hint,
  error,
  required = false,
  rows = 3,
  ...rest
}: {
  id: string;
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  rows?: number;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className" | "style" | "rows" | "id">) {
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error} required={required}>
      <textarea
        id={id}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-msg` : undefined}
        data-kit="textarea"
        className={`${controlClass(Boolean(error), "multi")} resize-y`}
        {...rest}
      />
    </FieldFrame>
  );
}

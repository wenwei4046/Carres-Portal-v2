/**
 * FieldFrame — label · control · message, in that order (UI-KIT §6, D0.5a).
 *
 * `Input`, `Textarea` and `SearchInput` all render through this, so a label
 * sits in the same place and an error reads in the same voice on all three.
 *
 * **What this does NOT decide:** how several fields sit next to each other —
 * one column or two, how much air between them, where a section heading goes.
 * That is form LAYOUT and §8 says it has no home yet; D0.5c writes it. This
 * component owns one field and stops.
 *
 * An error REPLACES the hint rather than stacking under it: two lines of
 * guidance under one control is how a form starts scrolling, and §1.3 is a
 * height budget.
 */
import type { ReactNode } from "react";

export default function FieldFrame({
  id,
  label,
  hint,
  error,
  required = false,
  children,
}: {
  id: string;
  /** Omit for a control that is labelled by its surroundings (a search box in
   *  a toolbar). Then pass `aria-label` on the control itself. */
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-label text-kit-slate-11">
          {label}
          {required && <span className="text-kit-red-11"> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-msg`} role="alert" className="text-meta text-kit-red-11">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-msg`} className="text-meta text-kit-slate-11">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

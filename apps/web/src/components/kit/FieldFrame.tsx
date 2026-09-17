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
import Icon from "./Icon";

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
        <FieldError id={`${id}-msg`}>{error}</FieldError>
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

/**
 * The ONE error voice for an input error or a save failure (UI MASTER §6.7,
 * Jess 2026-09-17): 13px, error colour, text AND icon — colour alone never
 * carries it. Block by default; `inline` for a message that sits in a row.
 */
export function FieldError({
  id,
  children,
  testId,
  inline = false,
  alert = true,
}: {
  id?: string;
  children: ReactNode;
  testId?: string;
  inline?: boolean;
  /** `false` for a standing validation fact that must not be announced. */
  alert?: boolean;
}) {
  const Tag = inline ? "span" : "p";
  return (
    <Tag
      id={id}
      role={alert ? "alert" : undefined}
      data-testid={testId}
      className={`${inline ? "inline-flex" : "flex"} items-start gap-1.5 text-body text-kit-red-11`}
    >
      <span className="mt-0.5 shrink-0">
        <Icon name="late" size={14} />
      </span>
      <span className="min-w-0 break-words">{children}</span>
    </Tag>
  );
}

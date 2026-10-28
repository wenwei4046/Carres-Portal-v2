/**
 * SearchInput — a search box, and only a search box (UI-KIT §6, card D0.5a).
 *
 * It is its own component rather than `<Input icon="search" />` because a
 * search box is not a form field: it carries no label above it (§8.1 puts it
 * in the title band, where a label would cost a row of the height budget), it
 * takes no error, and it never becomes required. Giving `Input` a `leadingIcon`
 * prop would have opened all three doors on every field in the portal.
 *
 * **It does not search.** No debounce, no query, no clearing behaviour — that
 * is the caller's, and D0.5a ships no behaviour. What it owns is the box.
 */
import type { InputHTMLAttributes } from "react";
import Icon from "./Icon";
import { controlClass } from "./field-recipe";

export default function SearchInput({
  id,
  placeholder = "Search",
  pill = false,
  toolbar = false,
  ...rest
}: {
  id: string;
  placeholder?: string;
  /** The global search shape (01 §3): 34px, round, search grey, no edge. */
  pill?: boolean;
  /** A workspace toolbar control — 36px, 40px below 768px. */
  toolbar?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "style" | "type" | "id">) {
  return (
    <div className="relative">
      {/* The glyph sits INSIDE the control's left padding — an icon in its own
       *  box beside the field would be a second border and a second radius. */}
      <span
        className={`pointer-events-none absolute inset-y-0 ${pill || toolbar ? "left-3" : "left-[10px]"} flex items-center text-c-secondary`}
      >
        <Icon name="search" size={16} />
      </span>
      <input
        id={id}
        type="search"
        placeholder={placeholder}
        aria-label={rest["aria-label"] ?? placeholder}
        data-kit="search-input"
        className={controlClass(false, toolbar ? "toolbar" : pill ? "pill" : "single", true)}
        {...rest}
      />
    </div>
  );
}

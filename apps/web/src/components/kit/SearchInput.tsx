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
  ...rest
}: {
  id: string;
  placeholder?: string;
  /** The top-strip shape — fully rounded, the Orders page's own search. */
  pill?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "style" | "type" | "id">) {
  return (
    <div className="relative">
      {/* The glyph sits INSIDE the control's left padding — an icon in its own
       *  box beside the field would be a second border and a second radius. */}
      <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-kit-slate-9">
        <Icon name="search" size={14} />
      </span>
      <input
        id={id}
        type="search"
        placeholder={placeholder}
        aria-label={rest["aria-label"] ?? placeholder}
        data-kit="search-input"
        className={`${controlClass(false, pill ? "pill" : "single")} pl-8`}
        {...rest}
      />
    </div>
  );
}

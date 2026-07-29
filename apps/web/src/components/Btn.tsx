import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Btn — THE one button recipe (UI-KIT v4 §2, locked 2026-07-16).
 *
 * International rule set (Jess): consistency comes from there being ONLY ONE
 * box to use — never hand-roll a button again. The action ladder:
 *
 *   hero  — flame filled. ONE PER PAGE (the page's single main action).
 *           A modal may carry its own single hero (it is its own surface).
 *   box   — GREY-BASE pill + BOLD icon + BOLD ink word (Jess 2026-07-17).
 *           The default for every other action. A panel shows at most TWO,
 *           rest go to ⋮.
 *   ghost — borderless text/icon. Tertiary (cancel, + add …).
 *
 * Black is NEVER a button colour (black marks active states: nav, tabs).
 * Two sizes only: md 32px (toolbars, forms) · sm 24px (dense bands, 44px rows).
 * A box means CLICKABLE — plain reading content never gets a box.
 *
 * `iconOnly` = the round icon button (POS ⊕ recipe, neutralised): a CIRCLE at
 * the same md 32 / sm 24 heights, icon (or children glyph) centred, no label.
 * Always pass `title` + `aria-label` on an iconOnly button.
 */
type Variant = "hero" | "box" | "ghost";
type Size = "md" | "sm";

/* PILL buttons (Jess 2026-07-16, ported from the POS .btn recipe): 999
 * radius, a CLEAR 1.5px ink-22% border and INK text — never pale. Flame
 * pill = the hero; white pill = everything else. */
const VARIANT: Record<Variant, string> = {
  hero: "bg-primary text-white border-[1.5px] border-primary hover:bg-signature-700",
  // Jess 2026-07-17: secondary = GREY BASE (borderless, "3rd column"), not a
  // white outline box — outline boxes read as inputs in dense tables.
  box: "bg-base-100 text-base-900 border-[1.5px] border-transparent hover:bg-base-200",
  ghost:
    "bg-transparent text-base-700 border-[1.5px] border-transparent hover:text-base-900 hover:bg-base-50",
};

const SIZE: Record<Size, string> = {
  md: "h-8 px-4 text-body gap-1.5 [&_svg]:w-4 [&_svg]:h-4",
  sm: "h-6 px-2.5 text-label gap-1 [&_svg]:w-3.5 [&_svg]:h-3.5",
};

/** iconOnly circles share the md/sm heights; the glyph centres, no label. */
const SIZE_CIRCLE: Record<Size, string> = {
  md: "w-8 h-8 [&_svg]:w-4 [&_svg]:h-4",
  sm: "w-6 h-6 [&_svg]:w-3.5 [&_svg]:h-3.5",
};

export default function Btn({
  variant = "box",
  size = "md",
  icon: Icon,
  iconOnly = false,
  className = "",
  children,
  type = "button",
  ...rest
}: {
  variant?: Variant;
  size?: Size;
  /** Lucide icon rendered BEFORE the label (bold stroke — reads at a glance). */
  icon?: LucideIcon;
  /** Round icon button — pass `icon` (or a glyph as children) + title/aria. */
  iconOnly?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center font-semibold whitespace-nowrap rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${VARIANT[variant]} ${
        iconOnly ? SIZE_CIRCLE[size] : SIZE[size]
      } ${className}`}
      {...rest}
    >
      {Icon && <Icon strokeWidth={2.25} aria-hidden="true" />}
      {children}
    </button>
  );
}

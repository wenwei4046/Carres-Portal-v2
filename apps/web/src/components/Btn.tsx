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
 *   box   — white box + hairline + BOLD icon + BOLD word. The default for
 *           every other action. A panel shows at most TWO, rest go to ⋮.
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

const VARIANT: Record<Variant, string> = {
  hero: "bg-primary text-white border border-primary hover:bg-signature-700",
  box: "bg-white text-base-800 border border-base-300 hover:bg-base-50",
  ghost:
    "bg-transparent text-base-600 border border-transparent hover:text-base-900 hover:bg-base-50",
};

const SIZE: Record<Size, string> = {
  md: "h-8 px-3 text-[13px] gap-1.5 [&_svg]:w-4 [&_svg]:h-4",
  sm: "h-6 px-2 text-[11px] gap-1 [&_svg]:w-3.5 [&_svg]:h-3.5",
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
      className={`inline-flex items-center justify-center font-semibold whitespace-nowrap transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${VARIANT[variant]} ${
        iconOnly ? `rounded-full ${SIZE_CIRCLE[size]}` : `rounded-md ${SIZE[size]}`
      } ${className}`}
      {...rest}
    >
      {Icon && <Icon strokeWidth={2.25} aria-hidden="true" />}
      {children}
    </button>
  );
}

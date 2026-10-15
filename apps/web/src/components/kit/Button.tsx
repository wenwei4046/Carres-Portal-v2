/** Shared Button. Appearance follows current 01 §3; callers retain action,
 * permission, busy state and accessible names. Icon-only controls use the same
 * semantic Icon adapter and forward their ref for menu/dialog focus return. */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import Icon, { type IconName } from "./Icon";
import Loading from "./Loading";

type Variant = "primary" | "neutral" | "ghost";
type Size = "md" | "sm" | "touch";

/* The main button is the `--c-main` token (01 §1, owner 11 Oct 2026): one per
 * area, white text. A normal button is white with the grey input edge. */
const VARIANT: Record<Variant, string> = {
  primary: "bg-c-main text-white border border-c-main enabled:hover:brightness-125",
  neutral: "bg-white text-c-ink border border-c-btn-border enabled:hover:bg-c-btn-hover",
  ghost: "bg-transparent text-kit-slate-11 border border-transparent enabled:hover:bg-c-btn-hover",
};

/** Keep the existing md32 toolbar contract during consumer migration; the
 *  small role is28 per current01 §3.
 *  `touch` is the Work party-card button (owner density ruling 2026-09-25):
 *  36px from 768px, 44px below, where a finger presses it. */
const SIZE: Record<Size, string> = {
  md: "h-11 px-3 gap-2 min-[768px]:h-8",
  sm: "h-11 px-2 gap-1 min-[768px]:h-7",
  touch: "h-11 px-3 gap-1.5 min-[768px]:h-9",
};

/* Icon legacy prop16 renders18; prop18 renders20. Preserve the adapter API. */

export type ButtonProps = {
  /** Page-tools trigger: 32px desktop, 44px touch, with an accessible name. */
  iconOnly?: boolean;
  variant?: Variant;
  size?: Size;
  /**
   * `pill` = fully rounded ends (Jess, 2026-08-01 — the 2990 toolbar
   * language). The default is the v4 8px corner (`rounded-lg`); a pill is a SHAPE, never
   * a fourth variant: colour and behaviour are untouched.
   */
  shape?: "control" | "pill";
  /** A §5.3 meaning, never a Lucide import — one meaning, one glyph. */
  icon?: IconName;
  /** Busy: the spinner replaces the icon and the button stops accepting input. */
  loading?: boolean;
  children?: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "style">;

/**
 * **It forwards its ref, and that is load-bearing rather than tidiness**
 * (added by D0.5b). `Modal`, `CMenu`, `Popover` and `Tooltip` take a
 * Button as their trigger and hand it Radix's behaviour through `asChild`,
 * which anchors the overlay on the trigger's own DOM node. A Button that eats
 * the ref makes every one of those open in the wrong place — silently, because
 * React only warns.
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    iconOnly = false,
    variant = "neutral",
    size = "md",
    shape = "control",
    icon,
    loading = false,
    disabled = false,
    type = "button",
    children,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-kit="button"
      className={
        `inline-flex items-center justify-center whitespace-nowrap ${iconOnly || shape === "pill" ? "rounded-full" : "rounded-lg"} text-body ${variant === "primary" ? "font-semibold" : "font-medium"} ` +
        "transition-[filter,background-color] " +
        "focus-visible:[outline:var(--c-focus)] focus-visible:[outline-offset:2px] " +
        "disabled:opacity-[0.45] disabled:cursor-not-allowed " +
        `${iconOnly ? "border-0 bg-transparent text-c-body enabled:hover:bg-[var(--c-icon-hover)] enabled:active:bg-[var(--c-icon-press)] data-[state=open]:bg-[var(--c-icon-press)] data-[state=open]:enabled:hover:bg-[var(--c-icon-press)] h-11 w-11 p-0 min-[768px]:h-8 min-[768px]:w-8" : `${VARIANT[variant]} ${SIZE[size]}`}`
      }
      {...rest}
      title={rest.title ?? (iconOnly ? rest["aria-label"] : undefined)}
    >
      {loading ? (
        <Loading size={16} />
      ) : (
        icon && <Icon name={icon} size={iconOnly ? 18 : 16} />
      )}
      {children}
    </button>
  );
});

export default Button;

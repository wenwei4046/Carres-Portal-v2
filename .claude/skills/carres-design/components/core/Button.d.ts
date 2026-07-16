import React from "react";

export type ButtonVariant = "hero" | "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * hero = the ONE flame CTA per page/block · primary = black workhorse ·
   * secondary = white outline · ghost = text-only · danger = red-outline destructive.
   */
  variant?: ButtonVariant;
  /** Optional leading icon node (e.g. a Lucide icon). */
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

/**
 * Carres primary button set. Use exactly one `hero` per page — everything else
 * is `primary`/`secondary`. Sentence case labels, never uppercase.
 * @startingPoint section="Core" subtitle="Flame / black / outline button set" viewport="700x120"
 */
export function Button(props: ButtonProps): JSX.Element;

import React from "react";

export interface SectionCardProps {
  /** Section title (t4-section, 16/600). */
  title: React.ReactNode;
  /** One-line summary shown on the right of the header (muted). Visible while collapsed. */
  summary?: React.ReactNode;
  /** Right-aligned actions (e.g. a ⋮ menu). */
  actions?: React.ReactNode;
  /** Start expanded. Default true. Collapses to the summary line when children exist. */
  defaultOpen?: boolean;
  children?: React.ReactNode;
}

/**
 * White collapsible panel — the building block of the order-detail column.
 * @startingPoint section="Core" subtitle="Collapsible white panel" viewport="420x220"
 */
export function SectionCard(props: SectionCardProps): JSX.Element;

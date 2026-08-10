import React from "react";
import { PillTone } from "../core/StatusPill";

export interface OrderRow {
  ref: string;
  /** How many additional refs are hidden behind "+N". */
  extraRefs?: number;
  so: string;
  customer: string;
  region: string;
  deadline: string;
  weekday: string;
  /** Renders the deadline red + "over" instead of the weekday. */
  late?: boolean;
  stock: { tone: PillTone; label: string };
  next: { tone: PillTone; label: string };
}

export interface ListRowProps {
  order: OrderRow;
  selected?: boolean;
  onToggle?: () => void;
}

/**
 * One 44px-fixed order row. Never let it grow to the content — collapse
 * multi-REF to "+N" and truncate long text.
 * @startingPoint section="Data" subtitle="Fixed-height order row" viewport="700x60"
 */
export function ListRow(props: ListRowProps): JSX.Element;

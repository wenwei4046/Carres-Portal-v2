import React from "react";

export type PillTone = "ready" | "waiting" | "overdue" | "neutral";

export interface StatusPillProps {
  /** ready=green (paid/on-time) · waiting=amber (chasing) · overdue=red (No PO/late) · neutral=grey. */
  tone?: PillTone;
  /** Show a leading same-colour dot (used in the Stock column). */
  dot?: boolean;
  children?: React.ReactNode;
}

/**
 * The one way to render a status in Carres. Never style status as bare text.
 * @startingPoint section="Core" subtitle="Green / amber / red status pills" viewport="700x100"
 */
export function StatusPill(props: StatusPillProps): JSX.Element;

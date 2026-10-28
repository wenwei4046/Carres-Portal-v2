/**
 * TwoLineCell — the listing's two-line cell (01 §5 "Five cell formats"): the
 * value in ink, then one grey line under it. `strong` is the identifier format
 * (13 / 600); `warn` turns both lines amber, for the one row whose date has
 * passed. Words are never cut: the second line wraps inside its own column.
 */
import type { ReactNode } from "react";

export default function TwoLineCell({ top, sub, warn = false, strong = false, testId }: {
  top: ReactNode;
  sub?: ReactNode;
  warn?: boolean;
  strong?: boolean;
  testId?: string;
}) {
  return (
    <span className="flex min-w-0 flex-col" data-testid={testId}>
      <span className={`text-body ${strong ? "font-semibold" : ""} ${warn ? "text-c-warn-fg" : "text-c-ink"}`}>{top}</span>
      {sub ? <span className={`break-words text-meta ${warn ? "text-c-warn-fg" : "text-c-secondary"}`}>{sub}</span> : null}
    </span>
  );
}

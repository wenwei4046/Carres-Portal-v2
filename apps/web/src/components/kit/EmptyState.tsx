/**
 * EmptyState — what a region says when it holds nothing (UI-KIT §9, D0.5a).
 *
 * An empty state is an ANSWER, not an apology. UI-KIT §1.4 rule 2 makes the
 * point for the detail record — a block that says "nothing is wrong" spends
 * height to say nothing — and the same logic applies to a list: the message
 * must tell the operator something they did not already know, or the region
 * should not draw at all.
 *
 * So `title` is required and `action` is optional. There is deliberately no
 * illustration slot: art is decoration, and §3.4 bans colour used as
 * decoration; the icon is a muted glyph at the 18px empty-state size. v4 text
 * colours (01 §1): ink title, secondary detail, muted glyph.
 */
import type { ReactNode } from "react";
import Icon, { type IconName } from "./Icon";

export default function EmptyState({
  icon,
  title,
  detail,
  action,
}: {
  icon?: IconName;
  /** The answer, in one line. */
  title: string;
  /** Why, or what to do next — one sentence. */
  detail?: string;
  /** A single Button. Two buttons in an empty state is a decision, not a state. */
  action?: ReactNode;
}) {
  return (
    <div
      data-kit="empty-state"
      className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center"
    >
      {icon && (
        <span className="text-c-muted">
          <Icon name={icon} size={18} />
        </span>
      )}
      <p className="text-strong text-c-ink">{title}</p>
      {detail && <p className="text-meta text-c-secondary">{detail}</p>}
      {action}
    </div>
  );
}

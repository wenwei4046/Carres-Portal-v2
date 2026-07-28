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
 * decoration; the icon is a `slate-9` glyph at §5.1's 18px empty-state size.
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
        <span className="text-kit-slate-9">
          <Icon name={icon} size={18} />
        </span>
      )}
      <p className="text-strong text-kit-slate-12">{title}</p>
      {detail && <p className="text-meta text-kit-slate-11">{detail}</p>}
      {action}
    </div>
  );
}

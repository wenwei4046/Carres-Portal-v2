/**
 * StatusPill — THE status renderer (UI-KIT §3.4 · §3.6, card D0.5a).
 *
 * §3.4 bans bare coloured text: a status is a pill or it is not a status. This
 * component is the only place the portal paints one, which is what makes that
 * ban enforceable rather than remembered.
 *
 * **`tone` is `OrderActionTone`** — the union the action engine already
 * computes in `packages/shared/src/order-actions.ts`. Two things follow, both
 * of them structural rather than remembered:
 *   · a surface cannot invent a sixth tone, because there is no sixth member;
 *   · §3.6's "tone comes from a CONDITION, never from which verb it is" holds
 *     by construction — the caller passes the tone the engine COMPUTED, and
 *     this file contains no verb, no status word and no mapping from one.
 *
 * **No word is spelt here.** Every visible string comes from
 * `docs/COPY-STANDARD.md` via `packages/shared/order-action-words.ts`; the pill
 * renders what it is given.
 *
 * The icon is narrowed to §5.3's four STATUS meanings — that group is labelled
 * "(inside a pill only)", so this is the box it was written for.
 */
import type { ReactNode } from "react";
import type { OrderActionTone } from "@carres/shared";
import Icon from "./Icon";
import { TONE_CLASS } from "./tokens";

/** §5.3's STATUS group, and only it. */
export type StatusIconName = "ready" | "waiting" | "late" | "on-hold";

export default function StatusPill({
  tone,
  icon,
  children,
}: {
  tone: OrderActionTone;
  icon?: StatusIconName;
  /** The status word — owned by COPY-STANDARD, never by this file. */
  children: ReactNode;
}) {
  return (
    <span
      data-kit="status-pill"
      data-tone={tone}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-label max-w-full ${TONE_CLASS[tone]}`}
    >
      {icon && <Icon name={icon} size={14} />}
      <span className="truncate">{children}</span>
    </span>
  );
}

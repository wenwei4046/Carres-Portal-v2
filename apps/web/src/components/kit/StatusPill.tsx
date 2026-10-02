/** Shared solid status presentation. Business labels and tones belong to callers. */
import type { ReactNode } from "react";
import type { OrderActionTone } from "@carres/shared";
import { STATUS_PILL_CLASS } from "./tokens";

export default function StatusPill({ tone, children }: {
  tone: OrderActionTone;
  children: ReactNode;
}) {
  return (
    <span data-kit="status-pill" data-tone={tone}
      className={`inline-flex items-center rounded-full px-2 py-1 text-label max-w-full ${STATUS_PILL_CLASS[tone]}`}>
      <span className="truncate">{children}</span>
    </span>
  );
}

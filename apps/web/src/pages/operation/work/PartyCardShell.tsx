/**
 * THE PARTY-CARD SHELL — Customer and Supplier (Workspace MASTER §5.10).
 *
 * Collapsed it is EXACTLY 72px at every width: the heading row
 * `{Party} · {name}` 15/20/600 with its progress (12/16) on the right, then
 * ONE status line 12/16 — nothing else. The whole row is one button
 * (`aria-expanded` / `aria-controls`) with a 40×40 chevron target. Open or
 * closed is decided by the right panel (one card at a time); Escape
 * collapses the open card and returns focus to its heading.
 *
 * Expanded sections: 11/14/600 uppercase titles, 10px section padding.
 * Colour always sits beside words and an icon, never alone.
 */
import { useId, useRef, type ReactNode } from "react";
import type { PartyTone } from "@carres/shared";
import Icon, { type IconName } from "@/components/kit/Icon";
import { WorkSection } from "./WorkCard";

/** The five tones, as text colour + a glyph — done is a neutral dark tick. */
export const TONE_TEXT: Record<PartyTone, string> = {
  done: "text-kit-slate-12",
  current: "text-kit-blue-11",
  attention: "text-kit-amber-11",
  missed: "text-kit-red-11",
  future: "text-kit-slate-11",
  neutral: "text-kit-slate-12",
};
export const TONE_ICON: Record<PartyTone, IconName | null> = {
  done: "ready",
  current: "waiting",
  attention: "late",
  missed: "late",
  future: null,
  neutral: null,
};

export function ToneLine({ tone, children, testId }: { tone: PartyTone; children: ReactNode; testId?: string }) {
  const icon = TONE_ICON[tone];
  return (
    <span className={`inline-flex min-w-0 items-center gap-1 text-[12px] font-normal leading-4 ${TONE_TEXT[tone]}`} data-testid={testId}>
      {icon ? <Icon name={icon} size={12} /> : null}
      <span className="min-w-0">{children}</span>
    </span>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h4 className="text-[11px] font-semibold uppercase leading-[14px] tracking-[0.04em] text-kit-slate-11">{children}</h4>;
}

export function Fact({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-0.5" data-testid={testId}>
      <span className="text-label text-kit-slate-11">{label}</span>
      <span className="min-w-0 text-right text-body text-kit-slate-12">{children}</span>
    </div>
  );
}

export function PartyCardShell({ testId, anchorId, party, heading, headingTone = "text-kit-slate-12", progress, status, open, onToggle, children }: {
  testId: string;
  /** DOM id the Order Route scrolls to when it opens this card. */
  anchorId?: string;
  party: string;
  heading: ReactNode;
  headingTone?: string;
  progress?: string | null;
  status: ReactNode;
  open: boolean;
  onToggle: (open: boolean) => void;
  children: ReactNode;
}) {
  const bodyId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  return (
    <WorkSection
      id={anchorId}
      className="shrink-0 scroll-mt-2"
      data-testid={testId}
      aria-label={party}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          onToggle(false);
          toggleRef.current?.focus();
        }
      }}
    >
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        aria-label={`${open ? "Hide" : "Show"} ${party} details`}
        onClick={() => onToggle(!open)}
        className="flex h-[72px] w-full items-center gap-2 overflow-hidden rounded-work px-3 text-left hover:bg-kit-slate-2 focus-visible:ring-2 focus-visible:ring-kit-blue-9 min-[960px]:px-4"
        data-testid={`${testId}-toggle`}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-baseline justify-between gap-x-3">
            <span className={`min-w-0 truncate text-[15px] font-semibold leading-5 ${headingTone}`} data-testid={`${testId}-heading`}>
              {heading}
            </span>
            {progress ? (
              <span className="shrink-0 text-[12px] font-normal leading-4 tabular-nums text-kit-slate-11" data-testid={`${testId}-progress`}>
                {progress}
              </span>
            ) : null}
          </span>
          <span className="flex min-w-0" data-testid={`${testId}-status`}>{status}</span>
        </span>
        <span className="grid h-10 w-10 shrink-0 place-items-center text-kit-slate-11" aria-hidden="true">
          <Icon name={open ? "collapse" : "expand"} size={16} />
        </span>
      </button>
      {open ? (
        <div id={bodyId} className="flex flex-col gap-3 border-t border-work-line p-2.5 min-[960px]:gap-4 min-[960px]:px-4 min-[960px]:py-3" data-testid={`${testId}-body`}>
          {children}
        </div>
      ) : null}
    </WorkSection>
  );
}

/**
 * THE PARTY-CARD SHELL — Customer and Supplier (Workspace MASTER §5.10).
 *
 * Collapsed it is EXACTLY 72px at every width (a 70px row inside the 1px edge): the heading row
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
import StatusPill from "@/components/kit/StatusPill";
import { WorkSection } from "./WorkCard";

/** The five tones, as text colour + a glyph — done is a neutral dark tick. */
export const TONE_TEXT: Record<PartyTone, string> = {
  done: "text-kit-slate-12",
  current: "text-kit-slate-12",
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
      {icon ? <Icon name={icon} size={14} /> : null}
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

/** Escape pressed inside a control that owns Escape (a Select, a date picker,
 *  a dialog, a text field) belongs to that control, never to the card. */
export function escapeBelongsToControl(event: { defaultPrevented: boolean; target: EventTarget | null }): boolean {
  if (event.defaultPrevented) return true;
  const el = event.target as Element | null;
  return Boolean(el?.closest?.('input, textarea, select, [role="listbox"], [role="option"], [role="combobox"], [role="dialog"], [role="menu"]'));
}

/** A card's status pill — the kit `StatusPill` with the party tone mapped to
 *  its five tones. `current` is never a blue pill: the page has ONE blue. */
export function partyPillTone(tone: PartyTone): "danger" | "warning" | "success" | "neutral" {
  return tone === "missed" ? "danger" : tone === "attention" ? "warning" : tone === "done" ? "success" : "neutral";
}

export interface CardFact { icon: IconName; text: ReactNode; tone?: "danger" | "muted" }

export function PartyCardShell({ testId, anchorId, party, heading, headingTone = "text-kit-slate-12", progress, pill, facts, status, trailing, active = false, open, onToggle, children }: {
  testId: string;
  /** DOM id the Order Route scrolls to when it opens this card. */
  anchorId?: string;
  party: string;
  heading: ReactNode;
  headingTone?: string;
  progress?: string | null;
  /** The step's status word as a pill beside the title (Jess, 2026-09-27). */
  pill?: { text: string; tone: PartyTone } | null;
  /** The fact line: icon · text, wrapping (who · where · when). */
  facts?: CardFact[];
  /** The bottom line under a rule: what is happening / what to do. */
  status: ReactNode;
  /** The header's right side: the doors (icons), outside the toggle. */
  trailing?: ReactNode;
  /** The step the chosen act belongs to: a darker edge, never a second blue. */
  active?: boolean;
  open: boolean;
  onToggle: (open: boolean) => void;
  children: ReactNode;
}) {
  const bodyId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  return (
    <WorkSection
      id={anchorId}
      className={`shrink-0 scroll-mt-2 ${active ? "!border-kit-slate-9" : ""}`}
      data-active={active || undefined}
      data-testid={testId}
      aria-label={party}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open && !escapeBelongsToControl(event)) {
          event.stopPropagation();
          onToggle(false);
          toggleRef.current?.focus();
        }
      }}
    >
      <div className="flex flex-col gap-2 px-3 pb-3 pt-2.5 min-[768px]:px-4">
        <div className="flex min-h-[36px] items-center gap-2">
          <button
            ref={toggleRef}
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => onToggle(!open)}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-control py-1 text-left focus-visible:ring-2 focus-visible:ring-kit-blue-9"
            data-testid={`${testId}-toggle`}
          >
            <span className={`min-w-0 truncate text-[14px] font-semibold leading-5 ${headingTone}`} data-testid={`${testId}-heading`}>{heading}</span>
            {pill ? <StatusPill tone={partyPillTone(pill.tone)}>{pill.text}</StatusPill> : null}
            {progress ? <span className="text-[12px] leading-4 tabular-nums text-kit-slate-11" data-testid={`${testId}-progress`}>{progress}</span> : null}
            <span className="sr-only">{`${open ? "Hide" : "Show"} ${party} details`}</span>
          </button>
          {trailing ? <div className="flex shrink-0 items-center gap-2" data-testid={`${testId}-trailing`}>{trailing}</div> : null}
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            aria-label={`${open ? "Hide" : "Show"} ${party} details`}
            onClick={() => onToggle(!open)}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-control text-kit-slate-11 hover:bg-kit-slate-2 focus-visible:ring-2 focus-visible:ring-kit-blue-9"
            data-testid={`${testId}-chevron`}
          >
            <Icon name={open ? "collapse" : "expand"} size={16} />
          </button>
        </div>
        {facts && facts.length > 0 ? (
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1" data-testid={`${testId}-facts`}>
            {facts.map((f, i) => (
              <li key={i} className={`inline-flex min-w-0 items-center gap-1.5 text-[12px] leading-4 ${f.tone === "danger" ? "font-semibold text-danger" : f.tone === "muted" ? "text-kit-slate-9" : "text-kit-slate-11"}`}>
                <Icon name={f.icon} size={14} />
                <span className="min-w-0 truncate">{f.text}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex min-w-0 items-center border-t border-kit-slate-4 pt-2" data-testid={`${testId}-status`}>{status}</div>
      </div>
      {open ? (
        <div id={bodyId} className="flex flex-col gap-2 border-t border-work-line px-3 py-2.5 min-[768px]:px-4" data-testid={`${testId}-body`}>
          {children}
        </div>
      ) : null}
    </WorkSection>
  );
}

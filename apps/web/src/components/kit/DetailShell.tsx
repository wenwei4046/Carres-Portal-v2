/**
 * DetailShell — the ordered blocks of a detail record (UI-KIT §1.4, card D0.5c).
 *
 * **EXTRACTED from the order drawer, not designed fresh.** T2 already put the
 * blocks in §1.4's order and C2/C6 built the action list; this is that
 * arrangement lifted into named slots. Nothing here decides position, spacing
 * or colour beyond what the drawer already renders — a slot's own content is
 * still the page's component.
 *
 * **Its whole input is `docs/ORDER-DETAIL-INFORMATION-MODEL.md` §10 (L4)**,
 * which exists because §1.4's rules were meant to be enforced by TYPES rather
 * than by memory. Seven of them now are; the table in L4 is the checklist and
 * `DetailShell.test.tsx` is the proof.
 *
 * **THERE IS NO `state` PROP, and that is the design.** Working · Blocked ·
 * Waiting · Completed are produced by what the slots RECEIVE (L4's table): an
 * action with items and no issues is Working; a holding issue is Blocked. A
 * component that cannot be told a state cannot print one, which is how L3's
 * *"states never reach the screen"* stops depending on anyone remembering it.
 */
import type { ReactNode } from "react";
import type { OrderActionTrack } from "@carres/shared";

/** ① Whose record is this. Values only — an identity block takes no action. */
export interface IdentitySlot {
  /** The name and the reference. */
  primary: ReactNode;
  /**
   * EXACTLY four. The set is full, so a fifth fact requires removing one —
   * which is the whole defence against Header Everything (model §7②). The
   * outstanding figure is one of these: money's Answer lives HERE, so it is
   * readable in the first second of a call without opening anything.
   */
  persistentFacts: [ReactNode, ReactNode, ReactNode, ReactNode];
}

/** ② What has to be done today. No way to hide it — see the class comment. */
export interface CurrentActionSlot {
  content: ReactNode;
}

/** ③ One thing that is stopping the record right now. */
export interface Issue {
  id: string;
  /** goods · delivery · money — §1.4 rule 4's shared categories. */
  track: OrderActionTrack;
  content: ReactNode;
}

/** ④ How far it has got. A VIEW of ②, never a second timeline. */
export interface ProgressSlot {
  content: ReactNode;
}

/** ⑤⑥ The detail, opened on demand. */
export interface DetailSection {
  id: string;
  label: string;
  /** `null` for a section that belongs to no track (Documents, Activity …). */
  track: OrderActionTrack | null;
  /** Detail is a ROUTE. A render prop here is how a page absorbs a system. */
  detailHref?: string;
  children: ReactNode;
}

/** ⑦ Who did what, when. */
export interface ActivitySlot {
  content: ReactNode;
}

export interface DetailShellProps {
  identity: IdentitySlot;
  currentAction: CurrentActionSlot;
  /** `[]` renders NOTHING — not an empty card, not a reassuring tick. */
  currentIssues: Issue[];
  progress: ProgressSlot;
  /** Ordered. A section that cannot exist is absent, never disabled. */
  sections: DetailSection[];
  activity?: ActivitySlot;
  /** The rail narrows; §1.4 rule 1 means nothing in it may disappear. */
  railCollapsed?: boolean;
  /** The record's own working surface — the open section's content. */
  children: ReactNode;
}

export default function DetailShell({
  identity,
  currentAction,
  currentIssues,
  progress,
  sections,
  activity,
  railCollapsed = false,
  children,
}: DetailShellProps) {
  return (
    <div data-kit="detail-shell" className="flex-1 min-h-0 overflow-hidden flex gap-3">
      {/* The rail, in §1.4's order. It NARROWS when collapsed; nothing in it
          disappears, because rule 1 is about the block existing, not about how
          wide it is. */}
      <div
        data-kit="detail-rail"
        className={`shrink-0 flex flex-col gap-2.5 min-h-0 ${railCollapsed ? "w-14" : "w-[280px]"}`}
      >
        <div data-kit="detail-identity">
          {identity.primary}
          {/* Exactly four, by type. The tuple is the rule. */}
          <div data-kit="detail-facts" className="contents">
            {identity.persistentFacts}
          </div>
        </div>
        <div data-kit="detail-current-action">{currentAction.content}</div>
        {/* ③ auto-hides. There is no branch for an empty label because there is
            no prop to write one into. */}
        {currentIssues.length > 0 && (
          <div data-kit="detail-current-issues">
            {currentIssues.map((i) => (
              <div key={i.id} data-track={i.track}>
                {i.content}
              </div>
            ))}
          </div>
        )}
        <div data-kit="detail-progress">{progress.content}</div>
        <nav
          data-kit="detail-sections"
          aria-label="Sections"
          className="flex-1 flex flex-col gap-1 min-h-0 overflow-y-auto no-scrollbar"
        >
          {sections.map((s) => (
            <div key={s.id} data-section={s.id} data-track={s.track ?? "none"}>
              {s.children}
            </div>
          ))}
        </nav>
        {activity && <div data-kit="detail-activity">{activity.content}</div>}
      </div>
      {/* The working surface — the open section owns the whole column. */}
      <div data-kit="detail-surface" className="flex-1 min-w-0 flex flex-col min-h-0">
        {children}
      </div>
    </div>
  );
}

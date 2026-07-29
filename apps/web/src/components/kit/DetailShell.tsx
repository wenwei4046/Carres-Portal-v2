/**
 * DetailShell — the ordered blocks every detail record renders through
 * (UI-KIT §1.4 + `ORDER-DETAIL-INFORMATION-MODEL.md` §10 "L4", card D0.5c).
 *
 * §1.4 states three rules and L4 says *"UI-KIT §1.4 intends its three rules to
 * be enforced by TYPES rather than by memory. L4 is what those types must
 * satisfy."* This file is those types.
 *
 * **THE SHELL NEVER RECEIVES A STATE.** There is no `state` prop and there never
 * may be. Working · Blocked · Waiting · Completed are produced entirely by what
 * the slots are given:
 *
 * | What arrives                                    | Which state it is |
 * |-------------------------------------------------|-------------------|
 * | `currentAction` has work · `currentIssues` empty | Working           |
 * | `currentIssues` carries a holding item           | Blocked           |
 * | `currentAction` says "nothing to do"             | Waiting           |
 * | `currentAction` says "completed"                 | Completed         |
 *
 * That is L3's *"states are never stored and never reach the screen"* turned
 * into a type: **a component that cannot be told a state cannot print one.**
 *
 * **What the types make impossible** (L4's own table, each one a live
 * constraint here rather than a sentence somewhere):
 *
 *   1. `currentAction` has no `collapsible` and no `hidden` — the reason the
 *      record was opened cannot be hidden. This is the bug T2 fixed once.
 *   2. `currentIssues` is `Issue[]`, renders **null** for `[]`, and has no
 *      `emptyLabel` — "✓ None", an empty card and a reassuring tick are not
 *      expressible (§1.4 rule 2).
 *   3. Slots are NAMED and ORDERED — never `children` — so blocks cannot be
 *      reordered per page.
 *   4. `progress` has no `events`, `actor`, `timestamp`, `kpi` or `actions`.
 *      **This closes UI-KIT §1.4's one Human-Review debt**: Progress cannot
 *      become a second timeline and cannot grow buttons or KPI tiles.
 *   5. `identity` takes values only and has no `onAction`; its persistent facts
 *      are a fixed 4-tuple, so a fifth requires removing one — Header
 *      Everything has nowhere to start.
 *   6. Every section declares `track: OrderActionTrack | null`. A fourth
 *      business category does not compile.
 *   7. Detail is a **route**, never a render prop, so the page cannot slowly
 *      absorb the rest of the system.
 *
 * **Section SELECTION is not in L4** and is added here as `activeSectionId` +
 * `onSectionChange`, because a shell that renders §1.4's ⑤⑥ has to know which
 * one is open and the frozen contract does not say. It is mechanics, not
 * information architecture — reported in the card rather than treated as
 * settled.
 */
import type { ReactNode } from "react";
import type { OrderActionTrack } from "@carres/shared";
import Icon from "./Icon";

/** L4: Evidence and Detail live inside a slot's own content, not as slots. */
export type Depth = "answer" | "context";

/**
 * A persistent fact — §7② of the information model: 客户名 · Ref · the promised
 * date · outstanding. **Values only.** No explanation and no door: *"Header
 * Everything is not caused by having many things; it is caused by things that
 * start carrying actions and explanations."*
 */
export interface Fact {
  label: string;
  value: ReactNode;
}

export interface IdentitySlot {
  /** Whose record this is. No action may be passed — constraint 5. */
  primary: ReactNode;
  /** EXACTLY four. The set is full; a fifth means removing one. */
  persistentFacts: [Fact, Fact, Fact, Fact];
}

export interface CurrentActionSlot {
  /** What has to be done today. "Nothing to do" is an ANSWER, never an absence. */
  answer: ReactNode;
  /** One level deeper — who, and by when. Optional. */
  context?: ReactNode;
}

export interface Issue {
  id: string;
  /** §1.4 rule 4 — a list and its detail use the SAME business categories. */
  track: OrderActionTrack;
  text: ReactNode;
  /** True = it is HOLDING the order. One of these makes the record Blocked. */
  holding?: boolean;
}

export interface ProgressStep {
  id: string;
  label: string;
  state: "done" | "current" | "todo";
}

/**
 * Progress is a VIEW of Current Action, never a second responsibility — so it
 * carries steps and nothing else. No `events`, no `actor`, no `timestamp`, no
 * `kpi`, no `actions`: those belong to Activity and to Current Action, and one
 * word for two blocks is how a reader stops trusting either.
 */
export interface ProgressSlot {
  steps: readonly ProgressStep[];
}

export interface DetailSection {
  id: string;
  /** The word. COPY-STANDARD owns it. */
  label: string;
  track: OrderActionTrack | null;
  /** Detail is a ROUTE. There is no render prop, by constraint 7. */
  detailHref?: string;
  children: ReactNode;
}

export interface ActivitySlot {
  children: ReactNode;
}

export interface DetailShellProps {
  identity: IdentitySlot;
  currentAction: CurrentActionSlot;
  /** `[]` renders NOTHING — not an empty container. There is no `emptyLabel`. */
  currentIssues: readonly Issue[];
  progress: ProgressSlot;
  /** Ordered. A section that cannot exist is absent, never a disabled tab. */
  sections: readonly DetailSection[];
  activity?: ActivitySlot;
  /** Which section is open. See the note above: added by D0.5c, not in L4. */
  activeSectionId?: string;
  onSectionChange?: (id: string) => void;
}

const TRACK_ICON = { goods: "goods", delivery: "delivery", money: "money" } as const;

export default function DetailShell({
  identity,
  currentAction,
  currentIssues,
  progress,
  sections,
  activity,
  activeSectionId,
  onSectionChange,
}: DetailShellProps) {
  const active =
    sections.find((s) => s.id === activeSectionId) ?? sections[0] ?? null;

  return (
    <div data-kit="detail-shell" className="flex h-full min-h-0 flex-col gap-4 bg-kit-slate-3 p-4">
      {/* ① IDENTITY — whose record is this. Values only. */}
      <section data-kit="detail-identity" className="flex shrink-0 flex-col gap-2">
        <div className="text-title text-kit-slate-12">{identity.primary}</div>
        <dl className="flex flex-wrap items-baseline gap-6">
          {identity.persistentFacts.map((f) => (
            <div key={f.label} data-kit="detail-fact" className="flex flex-col">
              <dt className="text-label text-kit-slate-11">{f.label}</dt>
              <dd className="text-body text-kit-slate-12">{f.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ② CURRENT ACTION — ALWAYS visible. No collapsible, no hidden. */}
      <section
        data-kit="detail-current-action"
        className="shrink-0 rounded-card border border-kit-slate-5 bg-white p-4"
      >
        <div className="text-strong text-kit-slate-12">{currentAction.answer}</div>
        {currentAction.context && (
          <div className="text-meta text-kit-slate-11">{currentAction.context}</div>
        )}
      </section>

      {/* ③ CURRENT ISSUES — the block does not exist when there is nothing
       *  wrong. No "✓ None", no empty card, no reassuring tick. */}
      {currentIssues.length > 0 && (
        <section
          data-kit="detail-current-issues"
          className="shrink-0 rounded-card border border-kit-slate-5 bg-white p-4"
        >
          <ul className="flex flex-col gap-2">
            {currentIssues.map((i) => (
              <li key={i.id} data-kit="detail-issue" data-track={i.track} className="flex items-center gap-2">
                <span className="text-kit-slate-9">
                  <Icon name={TRACK_ICON[i.track]} size={14} />
                </span>
                <span className="text-body text-kit-slate-12">{i.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ④ PROGRESS — a VIEW of ②. Steps and their state, and nothing else. */}
      <section data-kit="detail-progress" className="flex shrink-0 flex-wrap items-center gap-4">
        {progress.steps.map((s) => (
          <span
            key={s.id}
            data-kit="detail-step"
            data-state={s.state}
            className={`flex items-center gap-2 text-meta ${
              s.state === "todo" ? "text-kit-slate-9" : "text-kit-slate-12"
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-2 w-2 rounded-full ${
                s.state === "done"
                  ? "bg-kit-green-11"
                  : s.state === "current"
                    ? "bg-kit-blue-9"
                    : "bg-kit-slate-9"
              }`}
            />
            {s.label}
          </span>
        ))}
      </section>

      {/* ⑤⑥ BUSINESS SECTIONS — the detail, opened on demand. */}
      {sections.length > 0 && active && (
        <section data-kit="detail-sections" className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex shrink-0 items-center gap-4 border-b border-kit-slate-5">
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                data-kit="detail-section-tab"
                data-active={s.id === active.id || undefined}
                onClick={() => onSectionChange?.(s.id)}
                className={`flex items-center gap-2 px-1 py-2 text-body ${
                  s.id === active.id ? "text-kit-slate-12" : "text-kit-slate-11 hover:text-kit-slate-12"
                }`}
              >
                {s.track && <Icon name={TRACK_ICON[s.track]} size={14} />}
                {s.label}
              </button>
            ))}
            {active.detailHref && (
              <a
                href={active.detailHref}
                data-kit="detail-href"
                className="ml-auto flex items-center gap-1 text-meta text-kit-blue-11"
              >
                <Icon name="open" size={14} />
                {active.label}
              </a>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{active.children}</div>
        </section>
      )}

      {/* ⑦ ACTIVITY — who did what, when. Absent renders nothing. */}
      {activity && (
        <section data-kit="detail-activity" className="shrink-0">
          {activity.children}
        </section>
      )}
    </div>
  );
}

/**
 * TaskView — the ONE task view (03 §8 "An open task"; admitted with the owner's
 * round 3 brief of 13 Oct 2026, point 2). Every module's task opens in this
 * same shape, in the Tasks panel and wherever else a task is shown.
 *
 *   Ask Nice Future when the goods will arrive          the task, 13 / 500
 *   ─────────────────────────────────────────────────
 *   [icon] Purchasing / PO-2609-0042              (SA)  page / record · owner
 *   [icon] Deadline     Fri, 9 Oct · 4 days late        one row per fact
 *   [icon] Contact      Nice Future · WhatsApp
 *   [ Steps ][ Route ][ History ][ Files 4 ]
 *   …the chosen tab…
 *
 * The record is the door to its own page. Amber is on the one fact whose date
 * or window has gone by, and nowhere else. The first tab holds the module's
 * own work and stays mounted, so what was typed there survives a look at
 * another tab; the other tabs are drawn when they are opened.
 *
 * The view owns arrangement only. It reads nothing, writes nothing and closes
 * nothing: the owning module supplies every fact, step and file.
 */
import { useState, type ReactNode } from "react";
import MIcon from "@/components/carres/MIcon";
import Tabs from "./Tabs";

export interface TaskViewFact {
  key: string;
  /** A Material Symbols name. */
  icon: string;
  label: string;
  value: ReactNode;
  /** Amber: the one fact whose date or window has gone by. */
  warn?: boolean;
  /** What the fact opens, full width under its row (the Sales Orders behind
   *  `3 Sales Orders`). Drawn only while the owner of the fact passes it. */
  detail?: ReactNode;
}

export interface TaskViewTab {
  key: string;
  /** The word, with its count when it has one (`Files 4`). */
  label: string;
  content: ReactNode;
}

/** `SA` for `Staff A`: the first letters of the first two words that start
 *  with a letter or a number (a `·` between words is not a word). */
export function ownerInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter((word) => /^[\p{L}\p{N}]/u.test(word));
  return words.slice(0, 2).map((word) => word.charAt(0).toUpperCase()).join("");
}

export default function TaskView({ title, moduleIcon, page, record, openRecordLabel, onOpenRecord, owner, facts, afterFacts, tabs, initialTab, tabsLabel, "data-testid": testId }: {
  /** The task, in the words its list card uses. */
  title: string;
  /** The module's icon, a Material Symbols name. */
  moduleIcon: string;
  /** The page the record lives on (`Purchasing`). */
  page: string;
  /** The record the task is about (`PO-2609-0042`); `null` when it has none. */
  record: string | null;
  /** The record's door, spoken (`Open PO-2609-0042`). */
  openRecordLabel?: string;
  onOpenRecord?: () => void;
  /** Who does this task now; `null` when nobody is assigned. */
  owner: string | null;
  facts: readonly TaskViewFact[];
  /** One act about the task itself, between the facts and the tabs (the
   *  Tasks area's `Record as sent`). The owner of the act draws it. */
  afterFacts?: ReactNode;
  /** The first tab is the module's own work. */
  tabs: readonly TaskViewTab[];
  initialTab?: string;
  /** What the tabs switch between, for a screen reader. */
  tabsLabel: string;
  "data-testid"?: string;
}) {
  const first = tabs[0]?.key ?? "";
  const [chosen, setChosen] = useState(initialTab ?? first);
  const tab = tabs.some((t) => t.key === chosen) ? chosen : first;
  /* A tab is drawn from the moment it is first opened and then kept. */
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set([first, tab]));
  const choose = (key: string) => {
    setChosen(key);
    setOpened((previous) => (previous.has(key) ? previous : new Set(previous).add(key)));
  };
  return (
    <article className="flex flex-col rounded-lg border border-c-card-border bg-white" aria-label={title} data-kit="task-view" data-testid={testId}>
      <h3 className="break-words border-b border-c-row-line px-2.5 py-2 text-body font-medium text-c-ink" data-testid="task-view-title">{title}</h3>
      <div className="flex flex-col gap-2 px-2.5 pb-1 pt-2.5">
        <div className="flex min-h-5 items-center gap-1.5 text-meta" data-testid="task-view-head">
          <MIcon name={moduleIcon} size={16} className="shrink-0 text-c-secondary" />
          <span className="shrink-0 text-c-secondary">{page}</span>
          {record ? (
            <>
              <span className="shrink-0 text-c-muted" aria-hidden="true">/</span>
              {onOpenRecord ? (
                <button type="button" onClick={onOpenRecord} aria-label={openRecordLabel} title={openRecordLabel}
                  className="min-w-0 break-words text-left font-medium text-c-ink underline decoration-c-chip-border underline-offset-2 outline-none hover:decoration-c-ink focus-visible:[outline:var(--c-focus)]"
                  data-testid="task-view-record">
                  {record}
                </button>
              ) : <span className="min-w-0 break-words font-medium text-c-ink" data-testid="task-view-record">{record}</span>}
            </>
          ) : null}
          <span className="flex-1" />
          {owner ? (
            <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-c-track px-1 text-label font-medium text-c-ink" title={owner} aria-label={owner} data-testid="task-view-owner">
              {ownerInitials(owner)}
            </span>
          ) : null}
        </div>
        {facts.length > 0 ? (
          /* ONE grid for every fact, so the values start on one line: icon,
             then the label (as wide as the longest, at most 104), then the
             value. A longer label wraps; a value is never cut. */
          <dl className="m-0 grid grid-cols-[16px_fit-content(104px)_minmax(0,1fr)] gap-x-1.5 gap-y-1.5 text-body" data-testid="task-view-facts">
            {facts.map((fact) => (
              <div key={fact.key} className="contents" data-warn={fact.warn || undefined} data-testid={`task-view-fact-${fact.key}`}>
                <dt className={`col-span-2 grid grid-cols-subgrid items-start ${fact.warn ? "text-c-warn-fg" : "text-c-secondary"}`}>
                  <MIcon name={fact.icon} size={16} className="mt-[2px]" />
                  <span className="min-w-0 break-words">{fact.label}</span>
                </dt>
                <dd className={`m-0 min-w-0 break-words ${fact.warn ? "font-medium text-c-warn-fg" : "text-c-ink"}`}>{fact.value}</dd>
                {fact.detail ? <dd className="col-span-3 m-0 min-w-0" data-testid={`task-view-fact-detail-${fact.key}`}>{fact.detail}</dd> : null}
              </div>
            ))}
          </dl>
        ) : null}
      </div>
      {afterFacts}
      {tabs.length > 1 ? (
        <div className="px-2.5 pb-1 pt-1.5" data-testid="task-view-tabs">
          <Tabs variant="segmented" fill label={tabsLabel} value={tab} onValueChange={choose}
            tabs={tabs.map((t) => ({ value: t.key, label: t.label }))} />
        </div>
      ) : null}
      {tabs.map((t) => (opened.has(t.key) ? (
        <div key={t.key} role="tabpanel" aria-label={t.label} hidden={t.key !== tab} className={t.key === tab ? "min-w-0 px-2.5 pb-2.5 pt-2" : undefined} data-testid={`task-view-panel-${t.key}`}>
          {t.content}
        </div>
      ) : null))}
    </article>
  );
}

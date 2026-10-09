/**
 * TIMELINE — every recorded event on this Sales Order, newest first
 * (Layout Standard §3.2, owner-confirmed handoff 2026-10-08).
 *
 *   date + time (12-hour) · who (avatar · gear for System · dashed `?` when
 *   not recorded) · what happened · details · source line · document door.
 *
 * Records are READ-ONLY: nothing here edits or deletes an event. The words
 * come from the SAME read-boundary translators the History ledger uses
 * (`historyRecordWords`), so one event never has two spellings.
 *
 * Filters: All · Contacts · Amendments · one chip per module that has
 * events. `Contacts` counts logged calls / WhatsApp; this order has no
 * contact log to read yet, so it is an honest 0, never an invented row.
 */
import { useMemo, useState } from "react";
import MIcon from "@/components/carres/MIcon";
import { fmtDate, fmtDateShort } from "@/lib/fmt-date";
import type { SalesOrderAmendment, SalesOrderRevisionRow } from "@/lib/queries";
import { historyRecordWords, type HistoryEvent } from "../SalesOrderLedger";
import { Avatar, Card, CardTitle, twelveHour } from "./ui";

type Who =
  | { kind: "person"; userId: string; name: string }
  | { kind: "system" }
  | { kind: "missing" };

export interface TimelineEntry {
  key: string;
  at: string;
  group: string;
  title: string;
  details: string;
  source: string;
  who: Who;
  dot: "ok" | "warn" | "muted";
  door?: { label: string; onOpen: () => void };
}

const DOT: Record<TimelineEntry["dot"], string> = {
  ok: "bg-c-ok-fg",
  warn: "bg-c-warn-fg",
  muted: "bg-c-muted",
};

/** An edit / amendment event names the version it minted, or says amend. */
function isAmendmentEvent(event: HistoryEvent): boolean {
  const meta = (event.metadata ?? null) as Record<string, unknown> | null;
  if (meta && typeof meta === "object" && typeof meta.revision === "number") return true;
  return /amend|revision/i.test(event.text ?? "");
}

export function timelineEntriesOf(input: {
  history: HistoryEvent[];
  revisions: SalesOrderRevisionRow[];
  amendment: SalesOrderAmendment | null;
  onOpenRevisions: () => void;
}): TimelineEntry[] {
  const out: TimelineEntry[] = input.history.map((event, i) => {
    const words = historyRecordWords(event, input.revisions);
    const name = (event.actor ?? "").trim();
    const kind = event.actor_kind ?? (name ? "human" : "missing");
    const who: Who =
      kind === "human" && name
        ? { kind: "person", userId: event.by_user_id ?? name, name }
        : kind === "system"
          ? { kind: "system" }
          : { kind: "missing" };
    const amendment = isAmendmentEvent(event);
    return {
      key: `h-${i}`,
      at: event.occurred_at,
      group: amendment ? "Amendments" : "Sales Order",
      title: words.title,
      details: words.detail.join(" · "),
      source: who.kind === "person" ? `Recorded by ${who.name}` : who.kind === "system" ? "System · auto" : "Source not recorded",
      who,
      dot: who.kind === "missing" ? "warn" : "muted",
      ...(amendment ? { door: { label: "Revisions", onOpen: input.onOpenRevisions } } : {}),
    };
  });
  const a = input.amendment;
  if (a && (a.status === "submitted" || a.stale)) {
    const name = a.submitted_by_name?.trim() || "";
    out.push({
      key: `amd-${a.id}`,
      at: a.submitted_at,
      group: "Amendments",
      title: a.stale ? "Amendment out of date" : "Amendment submitted · waiting for approval",
      details: a.reason?.trim() || "",
      source: name ? `Submitted by ${name}` : "Source not recorded",
      who: name && a.submitted_by ? { kind: "person", userId: a.submitted_by, name } : { kind: "missing" },
      dot: "warn",
    });
  }
  return out.sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0));
}

function WhoMark({ who }: { who: Who }) {
  if (who.kind === "person") return <Avatar person={{ userId: who.userId, name: who.name }} size={26} ring={false} />;
  if (who.kind === "system")
    return (
      <span title="System" className="grid h-[26px] w-[26px] place-items-center rounded-full bg-c-info-bg text-c-secondary">
        <MIcon name="settings" size={16} />
      </span>
    );
  return (
    <span
      title="Not recorded"
      className="grid h-[26px] w-[26px] place-items-center rounded-full border border-dashed border-c-input-border text-[12px] text-c-muted"
    >
      ?
    </span>
  );
}

export default function SoTimeline({ entries }: { entries: TimelineEntry[] }) {
  const [filter, setFilter] = useState("All");
  const groups = useMemo(() => {
    const modules = [...new Set(entries.map((e) => e.group))].filter((g) => g !== "Contacts" && g !== "Amendments");
    return ["All", "Contacts", "Amendments", ...modules].map((g) => ({
      key: g,
      n: g === "All" ? entries.length : entries.filter((e) => e.group === g).length,
    }));
  }, [entries]);
  const shown = filter === "All" ? entries : entries.filter((e) => e.group === filter);
  return (
    <Card testId="so-timeline" label="Timeline">
      <div className="pb-2">
        <CardTitle>Timeline</CardTitle>
      </div>
      <div className="flex flex-wrap gap-1.5 pb-2" role="group" aria-label="Filter the timeline">
        {groups.map((g) => {
          const on = g.key === filter;
          return (
            <button
              key={g.key}
              type="button"
              aria-pressed={on}
              onClick={() => setFilter(g.key)}
              data-testid={`timeline-filter-${g.key}`}
              className={`rounded-lg border px-2.5 py-[3px] text-[12px] font-medium focus-visible:[outline:var(--c-focus)] focus-visible:[outline-offset:-2px] ${
                on ? "border-c-select-fg bg-c-select-bg text-c-select-fg" : "border-c-input-border bg-c-card text-c-body hover:bg-c-hover"
              }`}
            >
              {g.key} {g.n}
            </button>
          );
        })}
      </div>
      {shown.length === 0 ? (
        <p className="border-t border-c-row-line py-2 text-[13px] text-c-muted" data-testid="timeline-empty">
          {filter === "Contacts" ? "No calls or WhatsApp logged for this order yet. Use Log contact." : "Nothing here yet."}
        </p>
      ) : (
        <ol className="flex flex-col" data-testid="timeline-list">
          {shown.map((e) => (
            <li
              key={e.key}
              className="grid grid-cols-[84px_26px_minmax(0,1fr)] items-start gap-2.5 border-t border-c-row-line py-[9px]"
              data-testid="timeline-row"
            >
              <span title={fmtDate(e.at, { time: true, year: "always" })} className="flex flex-col pt-0.5 leading-[1.3]">
                <span className="text-[12px] font-medium text-c-body">{fmtDateShort(e.at)}</span>
                <span className="text-[12px] tabular-nums text-c-muted">{twelveHour(fmtDate(e.at, { timeOnly: true }))}</span>
              </span>
              <span className="relative h-[26px] w-[26px]">
                <WhoMark who={e.who} />
                <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-c-card ${DOT[e.dot]}`} />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5 leading-[1.35]">
                <span className="break-words text-[13px] font-medium text-c-ink">{e.title}</span>
                {e.details && <span className="break-words text-[12px] text-c-secondary">{e.details}</span>}
                <span className="flex flex-wrap items-center gap-2 text-[11px] text-c-muted">
                  <span>{e.source}</span>
                  {e.door && (
                    <button
                      type="button"
                      onClick={e.door.onOpen}
                      className="whitespace-nowrap text-[12px] font-semibold text-c-ink hover:underline"
                    >
                      {e.door.label} →
                    </button>
                  )}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

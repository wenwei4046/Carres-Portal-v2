import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import Button from "@/components/kit/Button";
import { usePageWorkSelection, type PageWorkSource } from "@/components/working-panel/page-work";

/**
 * THE PAGE'S WORK in the right area — the shared Working Panel host.
 *
 * LOCALHOST PROPOSAL (owner flow 2026-10-05). The page supplies the source;
 * this host orders it, opens the top item, lets the operator step to another
 * item by hand, and keeps every item it has shown MOUNTED (hidden) so an
 * open editor's draft survives stepping away and back.
 */
export const WORKING_PANEL_WORDS = {
  /* PROPOSAL / NOT IN COPY — the owner confirms both on the walk. */
  noWork: "No work for this page",
  backTo: (pageName: string) => `Back to ${pageName}`,
  previous: "Previous task",
  next: "Next task",
  /* Existing governed words. */
  position: (n: number, of: number) => `${n} of ${of}`,
  loading: "Loading…",
  failed: "Could not be loaded",
  retry: "Try again",
  close: "Close panel",
} as const;

export default function PageWorkPanel({ source, onClose }: { source: PageWorkSource; onClose: () => void }) {
  const { ordered, selected, choose } = usePageWorkSelection(source);
  const [opened, setOpened] = useState<string[]>([]);
  useEffect(() => {
    if (selected && !opened.includes(selected.key)) setOpened((keys) => [...keys, selected.key]);
  }, [selected, opened]);

  const index = selected ? ordered.findIndex((item) => item.key === selected.key) : -1;
  const step = (by: number) => {
    const next = ordered[index + by];
    if (next) choose(next.key);
  };
  const live = new Set(ordered.map((item) => item.key));
  const showCard = source.state === "ready" && selected !== null;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="page-work-panel" data-page={source.pageKey}>
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-base-100 px-3">
        <span className="min-w-0 flex-1 truncate text-strong text-base-900">{source.pageName}</span>
        {showCard && ordered.length > 1 ? (
          <div className="flex shrink-0 items-center gap-1" data-testid="page-work-stepper">
            <span className="text-meta tabular-nums text-kit-slate-11">
              {WORKING_PANEL_WORDS.position(index + 1, ordered.length)}
            </span>
            <button
              type="button"
              aria-label={WORKING_PANEL_WORDS.previous}
              title={WORKING_PANEL_WORDS.previous}
              disabled={index <= 0}
              onClick={() => step(-1)}
              className="grid h-8 w-8 place-items-center rounded-control text-kit-slate-11 hover:bg-hovertint disabled:opacity-40"
            >
              <ChevronLeft size={16} aria-hidden />
            </button>
            <button
              type="button"
              aria-label={WORKING_PANEL_WORDS.next}
              title={WORKING_PANEL_WORDS.next}
              disabled={index >= ordered.length - 1}
              onClick={() => step(1)}
              className="grid h-8 w-8 place-items-center rounded-control text-kit-slate-11 hover:bg-hovertint disabled:opacity-40"
            >
              <ChevronRight size={16} aria-hidden />
            </button>
          </div>
        ) : null}
        {!showCard ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-base-500 hover:bg-hovertint"
            aria-label={WORKING_PANEL_WORDS.close}
          >
            <X size={16} />
          </button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {source.state === "loading" ? (
          <p role="status" className="p-3.5 text-body text-kit-slate-11">{WORKING_PANEL_WORDS.loading}</p>
        ) : source.state === "failed" ? (
          <div role="alert" className="flex flex-wrap items-center gap-2 p-3.5 text-body text-kit-slate-11">
            <span>{WORKING_PANEL_WORDS.failed}</span>
            {source.retry ? <Button size="sm" onClick={source.retry}>{WORKING_PANEL_WORDS.retry}</Button> : null}
          </div>
        ) : ordered.length === 0 ? (
          /* No work: a plain state. The page's records stay fully usable. */
          <p className="p-3.5 text-body text-kit-slate-11" data-testid="page-work-empty">{WORKING_PANEL_WORDS.noWork}</p>
        ) : (
          ordered
            .filter((item) => opened.includes(item.key) && live.has(item.key))
            .map((item) => (
              <div key={item.key} hidden={item.key !== selected?.key} data-testid={`page-work-item-${item.key}`}>
                {item.render(onClose)}
              </div>
            ))
        )}
      </div>
    </div>
  );
}

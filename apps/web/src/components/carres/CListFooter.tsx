/**
 * The list's footer words and pager (v12 Carres Table, 01 §5 Footer): the
 * count and the totals as one line of words, two lines at most (short forms
 * with the full words on hover when a third would be needed), then rows per
 * page and the pager. Drawn inside the listing engine's status line.
 */
import { Fragment, useLayoutEffect, useRef, useState } from "react";
import MIcon from "./MIcon";
import CPopover, { CMenuItem } from "./CPopover";

const PAGE_SIZES = [20, 50, 100] as const;
/* The footer's line height (leading-4). */
const LINE = 16;

/** `Rows 20 ▾`. */
function RowsMenu({ size, onSize }: { size: number; onSize: (n: number) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <CPopover
      label="Rows per page"
      role="menu"
      width={120}
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button type="button" className="flex shrink-0 items-center gap-0.5 whitespace-nowrap text-c-secondary">
          Rows {size}
          <MIcon name="arrow_drop_down" size={18} />
        </button>
      }
    >
      {PAGE_SIZES.map((n) => (
        <CMenuItem key={n} checked={n === size} onSelect={() => { onSize(n); setOpen(false); }}>
          {n}
        </CMenuItem>
      ))}
    </CPopover>
  );
}

/** The footer's totals: `Qty:` then its parts; `short` is the same parts in short forms. */
export type CListTotals = { lead: string; parts: readonly string[]; short?: readonly string[] };

/** `72 orders · Qty: Mattress 72 · Pillow 91`: one flow, one space each side of `·`, each part kept whole. */
function TotalsLine({ count, totals }: { count: string; totals?: CListTotals | undefined; }) {
  const parts = (list: readonly string[]) =>
    list.map((p, i) => (
      <Fragment key={i}>
        {" · "}
        <span className="whitespace-nowrap">{p}</span>
      </Fragment>
    ));
  return (
    <>
      <span className="whitespace-nowrap">{count}</span>
      {totals && totals.parts.length > 0 ? (
        <>
          {" · "}
          <span className="whitespace-nowrap">{totals.lead}</span>{" "}
          <span className="whitespace-nowrap">{totals.parts[0]}</span>
          {parts(totals.parts.slice(1))}
        </>
      ) : null}
    </>
  );
}

/**
 * The footer (44 high): the count and the totals in one line of words, then rows
 * per page and the pager. The words take two lines at most (fix list 14 Oct):
 * when the full words need a third, the short forms show and the full words are
 * on hover; the footer never pushes the pager out of the card.
 */
export function CListFooter({
  count,
  totals,
  pageSize,
  onPageSize,
  page,
  pages,
  onPage,
  testId,
}: {
  count: string;
  totals?: CListTotals;
  pageSize: number;
  onPageSize: (n: number) => void;
  page: number;
  pages: number;
  onPage: (n: number) => void;
  testId?: string;
}) {
  const full = useRef<HTMLSpanElement>(null);
  const [short, setShort] = useState(false);
  useLayoutEffect(() => {
    const el = full.current;
    if (!el) return;
    /* The hidden copy holds the full words at the footer's own width. */
    const check = () => setShort(Boolean(totals?.short) && el.getBoundingClientRect().height > 2 * LINE + 1);
    check();
    const watch = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(check);
    watch?.observe(el);
    return () => watch?.disconnect();
  }, [count, totals]);
  const words = (list?: readonly string[]) => [count, ...(totals && list?.length ? [`${totals.lead} ${list.join(" · ")}`] : [])].join(" · ");
  return (
    <div className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 whitespace-normal py-1 text-[13px] text-c-secondary" data-testid={testId}>
      <span className="relative min-w-0 flex-1 leading-4">
        <span ref={full} aria-hidden="true" className="invisible absolute inset-x-0 top-0">
          <TotalsLine count={count} totals={totals} />
        </span>
        <span
          className="line-clamp-2"
          title={short ? words(totals?.parts) : undefined}
          data-testid={testId ? `${testId}-qty` : undefined}
        >
          <TotalsLine count={count} totals={totals && short ? { ...totals, parts: totals.short ?? totals.parts } : totals} />
        </span>
      </span>
      <RowsMenu size={pageSize} onSize={onPageSize} />
      <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-c-ink">
        <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(Math.max(1, page - 1))} className="grid place-items-center text-c-ink disabled:text-c-head-line">
          <MIcon name="chevron_left" size={18} />
        </button>
        {page} / {pages}
        <button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(Math.min(pages, page + 1))} className="grid place-items-center text-c-ink disabled:text-c-head-line">
          <MIcon name="chevron_right" size={18} />
        </button>
      </span>
    </div>
  );
}

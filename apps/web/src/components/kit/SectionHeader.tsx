/**
 * SectionHeader — what a region of a page is, and whether it is open.
 *
 * Design System: `docs/02-components.md`.
 *
 * A page is made of regions, and every region has to answer the same two
 * questions in the same place: *what is this* and *what does it hold right
 * now*. Before this component each page answered them in its own markup, which
 * is how one region ends up with a count and its neighbour with none.
 *
 * **Collapsing is a TYPE, not a prop you may leave off.** A region either
 * collapses or it does not, and the two shapes are a discriminated union: a
 * permanent region has no `open`, no `onToggle` and — the point — **no chevron
 * and no button at all**. A disabled control that can never do anything is
 * worse than no control, because a reader spends a moment finding out.
 *
 * **It renders the header, not the body.** The caller owns what is inside and
 * decides whether to mount it, so this component never becomes a layout box and
 * a collapsed region costs nothing to render. `open` is controlled for the same
 * reason a table's selection is: the page already knows which regions are open,
 * and a second copy of that state is a second answer.
 *
 * **It spells no word.** `title` is the caller's, from COPY-STANDARD, and
 * `meta` is a slot — a count, a channel strip, a status — never composed here.
 * Nothing about any one module reaches this file.
 */
import type { ReactNode } from "react";
import Icon from "./Icon";

interface Base {
  /** What this region IS. One word or two, ruled by COPY-STANDARD. */
  title: string;
  /**
   * What it holds right now, at the right edge — `13 lines · 14 units`, a
   * channel strip, a status. A slot, so this file never composes a sentence.
   */
  meta?: ReactNode;
  /** One control after the meta — an `Edit` button, a `⋯`. Never a menu built here. */
  action?: ReactNode;
  /** Stable identity for tests and for the page's own state. */
  testId?: string;
}

type Props =
  | (Base & {
      /** The region is permanently open. No chevron is drawn. */
      collapsible?: false;
      open?: never;
      onToggle?: never;
    })
  | (Base & {
      collapsible: true;
      open: boolean;
      onToggle: () => void;
    });

export default function SectionHeader(props: Props) {
  const { title, meta, action, testId } = props;

  const label = (
    <span className="text-label uppercase tracking-wide text-kit-slate-11 truncate">
      {title}
    </span>
  );

  return (
    <header
      data-kit="section-header"
      data-testid={testId}
      className="flex items-center gap-3 px-4 py-2"
    >
      {props.collapsible ? (
        <button
          type="button"
          onClick={props.onToggle}
          aria-expanded={props.open}
          data-testid={testId ? `${testId}-toggle` : undefined}
          className="flex items-center gap-1.5 min-w-0"
        >
          <Icon name={props.open ? "expand" : "forward"} size={14} />
          {label}
        </button>
      ) : (
        label
      )}
      {meta != null ? (
        <span className="ml-auto text-meta text-kit-slate-11 truncate">{meta}</span>
      ) : null}
      {action != null ? <span className={meta != null ? "" : "ml-auto"}>{action}</span> : null}
    </header>
  );
}

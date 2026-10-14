/**
 * CSidePanel — the side panel frame of the v12 kit (the list page's `Summary`;
 * the same frame as the shell's Tasks panel). A white card whose 36px title row
 * sits level with the page toolbar, and whose body starts level with the table
 * card (toolbar 36 + gap 10, Layout Standard §0 and carres-check rule 2).
 *
 * The card's line is drawn INSIDE its box (an inset ring, not a border), so the
 * title row's top is the card's top: a border would push it 1px below the toolbar.
 */
import type { ReactNode } from "react";
import MIcon from "./MIcon";

export default function CSidePanel({
  label,
  title,
  onHide,
  width = 240,
  testId,
  children,
}: {
  /** The landmark name, e.g. `Summary`. */
  label: string;
  title: string;
  /** Hides the panel; its button is named `Hide {label in lower case}`. */
  onHide: () => void;
  width?: number;
  testId?: string;
  children: ReactNode;
}) {
  const hide = `Hide ${label.toLowerCase()}`;
  return (
    <aside
      aria-label={label}
      data-testid={testId}
      className="flex min-h-0 shrink-0 flex-col overflow-hidden rounded-lg bg-c-card ring-1 ring-inset ring-c-card-border"
      style={{ width }}
    >
      <div className="flex h-9 shrink-0 items-center gap-1.5 pl-3.5 pr-2">
        <span className="flex-1 text-strong text-c-ink">{title}</span>
        <button
          type="button"
          onClick={onHide}
          aria-label={hide}
          title={hide}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-c-muted hover:bg-c-hover"
        >
          <MIcon name="chevron_left" size={20} />
        </button>
      </div>
      {/* 10 under the title, plus what a toolbar on two rows adds (`--c-toolbar-extra`,
          set by the page), so the body still starts level with the table. */}
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto px-3.5 pb-3 [scrollbar-width:thin]" style={{ marginTop: "calc(10px + var(--c-toolbar-extra, 0px))" }}>{children}</div>
    </aside>
  );
}

import type { DataGridContextMenuItem } from "./DataGrid";

/**
 * ONE ROW MENU — owner ruling 2026-10-05 (Jess, "Tasks, Working Panel and
 * document view flow").
 *
 * Every register's right-click menu (also the Menu key and Shift+F10, which
 * the shared DataGrid already routes to the same menu) starts with the same
 * two words in the same order:
 *
 *   View    opens the record's FULL document page — the read-first page. It
 *           never starts editing: Edit stays a button on that page and is
 *           pressed on purpose.
 *   Print   runs that record's EXISTING print flow — the same renderer and
 *           the same bytes its document page prints. It records nothing.
 *
 * A record with no full page or no paper simply omits that word; nothing is
 * invented to fill the slot. A module may append its own MASTER-approved
 * items, always after ONE divider (Sales Orders: `Cancel SO`).
 *
 * Right-click is a shortcut, not the sole door (UI MASTER §6.7 rule 5): both
 * acts stay reachable from the record itself. Single click, double-click and
 * the number link keep each register's own approved behaviour.
 */
export const ROW_MENU_WORDS = { view: "View", print: "Print" } as const;

export type DocumentRowMenu = {
  /** Open the record's full read-first document page. Omit when none exists. */
  view?: () => void;
  /** Run the record's existing print flow. Omit when the record has no paper. */
  print?: () => void;
  /** The module's own approved items, drawn after one divider. */
  more?: DataGridContextMenuItem[];
};

export function documentRowMenu({ view, print, more = [] }: DocumentRowMenu): DataGridContextMenuItem[] {
  const standard: DataGridContextMenuItem[] = [];
  if (view) standard.push({ label: ROW_MENU_WORDS.view, onClick: view });
  if (print) standard.push({ label: ROW_MENU_WORDS.print, onClick: print });
  /* A module list may arrive with its own leading/trailing dividers; the
     helper owns the only divider, so strip theirs at the edges. */
  const extra = trimDividers(more);
  if (standard.length === 0) return extra;
  if (extra.length === 0) return standard;
  return [...standard, { divider: true }, ...extra];
}

function trimDividers(items: DataGridContextMenuItem[]): DataGridContextMenuItem[] {
  let start = 0;
  let end = items.length;
  while (start < end && items[start]?.divider) start += 1;
  while (end > start && items[end - 1]?.divider) end -= 1;
  return items.slice(start, end);
}

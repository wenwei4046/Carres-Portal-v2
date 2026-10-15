/**
 * The list's cells (v12 Carres Table, 01 §5): the main words, then an optional
 * grey second line, each on one line; a pill when the cell is a status. Used
 * by every list that draws v12 cells inside the one listing engine
 * (`register/DataGrid`) and by `/ui`.
 */
import CPill, { type CPillTone } from "./CPill";

/** One cell: the main words, then an optional grey second line. */
export type CCell = {
  t: string;
  sub?: string;
  /** Sub-line colour: muted grey (default secondary), ok green, warn amber. */
  subTone?: "muted" | "ok" | "warn";
  /** 400 · 500 · 600. */
  fw?: 400 | 500 | 600;
  /** Text colour: ink (default: the unselected-tab grey, c-tab), muted, warn. */
  fg?: "ink" | "muted" | "warn";
  pill?: boolean;
  tone?: CPillTone | "none";
  align?: "start" | "end";
  /** The full sentence behind a short state word (hover). */
  title?: string;
  /** The full words behind a short second line, e.g. `MS, BF` (hover). */
  subTitle?: string;
  /** The second line ends with … when its column is short (a customer's name;
   *  owner 14 Oct 2026); `subTitle` carries the full words on hover. */
  subClip?: boolean;
};

export type CListColumn = {
  key: string;
  label: string;
  /** A long header printed on two lines; `label` stays its accessible name. */
  head?: readonly [string, string];
  /** The grid track, as v12 sets it (`120px`, `minmax(150px,1fr)`): the
   *  narrowest the column gets; a longer value widens it. */
  width: string;
  align?: "end";
};

/** The px floor of a track: `120px` → 120, `minmax(150px,1fr)` → 150. */
export const trackFloor = (width: string) => Number(/(\d+)px/.exec(width)?.[1]) || 0;

/** The header words: one line, or the two lines a long header is split into. */
export function CListHead({ column }: { column: CListColumn }) {
  return column.head ? (
    <span className="text-left leading-[1.25]" title={column.label}>
      <span className="block whitespace-nowrap">{column.head[0]}</span>
      <span className="block whitespace-nowrap font-normal">{column.head[1]}</span>
    </span>
  ) : (
    <span className="whitespace-nowrap text-left leading-[1.25]">{column.label}</span>
  );
}

/** One body cell: plain words or a pill, then the grey second line, each on one
 *  line. A value widens its column rather than be cut (fix list 14 Oct); only a
 *  `subClip` line (the customer's name) ends with …, its full words on hover. */
export function CListCell({ cell }: { cell: CCell }) {
  const fg =
    cell.fg === "ink" ? "text-c-ink" : cell.fg === "muted" ? "text-c-muted" : cell.fg === "warn" ? "text-c-warn-fg" : cell.fw === 600 ? "text-c-ink" : "text-c-tab";
  const fw = cell.fw === 600 ? "font-semibold" : cell.fw === 500 ? "font-medium" : "font-normal";
  const subFg = cell.subTone === "muted" ? "text-c-muted" : cell.subTone === "ok" ? "text-c-ok-fg" : cell.subTone === "warn" ? "text-c-warn-fg" : "text-c-secondary";
  return (
    <>
      {cell.pill ? (
        cell.tone === "none" ? (
          <span className="text-[13px] text-c-muted">{cell.t}</span>
        ) : (
          <CPill tone={cell.tone ?? "info"}>{cell.t}</CPill>
        )
      ) : (
        <span className={`whitespace-nowrap tabular-nums ${fw} ${fg}`} title={cell.title}>
          {cell.t}
        </span>
      )}
      {cell.sub && (
        <span className={`${cell.subClip ? "max-w-full truncate" : "whitespace-nowrap"} text-[12px] ${subFg}`} title={cell.subTitle}>
          {cell.sub}
        </span>
      )}
    </>
  );
}


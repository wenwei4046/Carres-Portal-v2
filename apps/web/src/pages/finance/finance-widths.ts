/**
 * Finance's column widths (Chew 2026-10-13, the Finance look). Each column is
 * the width of what it holds, and since 2026-10-14 one name column per table
 * takes whatever width is left (`fillColumn`, `fillSizing`): an amount fits RM 1,234,567.89 in the footer's bold, a code fits
 * `400-A001`, and a name or a party wraps rather than being cut. A width
 * belongs to the field, so every Finance page prints the same fact the same
 * width; a value that clips is fixed here, once.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { rm } from "@/lib/format-currency";
import { useRegisterLayouts, useSaveRegisterLayout, useSetDefaultRegisterLayout } from "@/lib/queries";
import type { FinanceLayoutListing } from "./finance-layouts";

export const FINANCE_WIDTH = {
  /** An amount, right aligned: `RM 1,234,567.89` in 13px tabular figures. */
  amount: 128,
  /** A document number, never cut: `PV-20260930-0012` (16 characters, the
   *  longest on production 2026-10-14) with room to spare. */
  documentNo: 190,
  /** A ledger entry number: `JE-202609-0001`. */
  entryNo: 150,
  /** An account or party code: `310-2000`, `400-A001`. */
  code: 96,
  /** An account's name; it wraps. */
  account: 220,
  /** A supplier, customer or other party; it wraps. */
  party: 260,
} as const;

/**
 * The Finance look's amount cell (Chew 2026-10-13): a zero, to the cent, is a
 * blank cell, so the figures that hold money stand out; any other figure
 * prints in RM. An absent figure is blank too. Only the screen: a sort, a
 * filter, a footer total or an export keeps the number.
 */
export function amountCell(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  return !Number.isFinite(n) || Math.round(n * 100) === 0 ? "" : rm(n);
}

/** The name of the one layout a Finance kit table keeps its widths in (0704). */
export const COLUMN_WIDTHS_LAYOUT = "Column widths";
/** A drag sends the widths once it has stopped this long, never per move. */
export const COLUMN_WIDTHS_SAVE_DELAY_MS = 600;

/**
 * The widths a person dragged a Finance kit table's columns to (Chew
 * 2026-10-14). Since 0704 (Chew 2026-10-21) they are kept on the server, as
 * the person's own layout named `Column widths` on the table's listing
 * (`finance_general_ledger` …), saved once a drag has stopped for 600ms and
 * made the person's Default once. On load the server's widths win.
 *
 * This browser keeps a copy under `storageKey`: while the server read is
 * pending or failed, or a save fails, the table draws that copy. Storage may
 * be missing or refuse (a private window, blocked site data): the table then
 * draws its own widths and a drag still works until the page reloads.
 */
export function useSavedWidths(storageKey: string, listing: FinanceLayoutListing): {
  widths: Readonly<Record<string, number>>;
  onResize: (key: string, width: number) => void;
} {
  const [widths, setWidths] = useState<Record<string, number>>(() => readSavedWidths(storageKey));
  const latest = useRef(widths);
  const layoutsQ = useRegisterLayouts(listing);
  const save = useSaveRegisterLayout(listing);
  const setDefault = useSetDefaultRegisterLayout(listing);

  /* The server's widths arrive: draw them once, unless the person has already
     dragged (their drag is newer). */
  const dragged = useRef(false);
  const applied = useRef(false);
  useEffect(() => {
    if (applied.current || dragged.current) return;
    const rows = layoutsQ.data?.layouts;
    if (!Array.isArray(rows)) return;
    applied.current = true;
    const mine = rows.find((r) => r.name === COLUMN_WIDTHS_LAYOUT);
    if (!mine) return;
    const server = cleanWidths(mine.layout?.widths);
    latest.current = server;
    setWidths(server);
    writeSavedWidths(storageKey, server);
  }, [layoutsQ.data, storageKey]);

  /* One save per finished drag. A failed save keeps the browser's copy. */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const defaultAsked = useRef(false);
  const flush = useRef<() => void>(() => {});
  flush.current = () => {
    timer.current = null;
    const layout = {
      order: [], hidden: [], sort: null,
      widths: Object.fromEntries(Object.entries(latest.current)
        .map(([key, w]) => [key, Math.min(2000, Math.max(24, Math.round(w)))])),
    };
    save.mutateAsync({ name: COLUMN_WIDTHS_LAYOUT, layout })
      .then(({ layout: row }) => {
        if (!row || row.is_default || defaultAsked.current) return;
        defaultAsked.current = true;
        return setDefault.mutateAsync(row.id).then(() => undefined);
      })
      .catch(() => { /* The browser's copy holds the widths. */ });
  };
  useEffect(() => () => {
    /* Leaving the page mid-wait still sends the last drag. */
    if (timer.current) {
      clearTimeout(timer.current);
      flush.current();
    }
  }, []);

  const onResize = useCallback((key: string, width: number) => {
    dragged.current = true;
    const next = { ...latest.current, [key]: Math.round(width) };
    latest.current = next;
    setWidths(next);
    writeSavedWidths(storageKey, next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flush.current(), COLUMN_WIDTHS_SAVE_DELAY_MS);
  }, [storageKey]);
  return { widths, onResize };
}

function writeSavedWidths(storageKey: string, widths: Record<string, number>): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(widths));
  } catch {
    /* No storage: the width holds until the page reloads. */
  }
}

/** Only finite, positive widths. */
function cleanWidths(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>)
    .filter((e): e is [string, number] => typeof e[1] === "number" && Number.isFinite(e[1]) && e[1] > 0));
}

/** What `useSavedWidths` stored under a key: only finite, positive widths. */
export function readSavedWidths(storageKey: string): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(storageKey);
    return cleanWidths(raw ? JSON.parse(raw) : null);
  } catch {
    return {};
  }
}

/**
 * A Finance kit table that fills its box with ONE column (Chew 2026-10-14).
 * `declared` is every shown column's own width in pixels; the `fill` column's
 * is its minimum. Each column draws its saved width first. The fill column
 * takes what the others leave (`width: auto`) unless the person dragged it,
 * when it keeps that width and the table is as wide as its columns again.
 * `style` and `data` go on the `look.statement` wrapper.
 */
export function fillSizing(declared: Readonly<Record<string, number>>, saved: Readonly<Record<string, number>>, fill: string): {
  filling: boolean;
  width: (key: string) => string;
  style: CSSProperties;
  data: { "data-fin-fill"?: "" };
} {
  const filling = saved[fill] == null;
  const px = (key: string) => saved[key] ?? declared[key] ?? 0;
  const total = Object.keys(declared).reduce((sum, key) => sum + px(key), 0);
  return {
    filling,
    width: (key) => (key === fill && filling ? "auto" : `${px(key)}px`),
    style: { "--fin-table-width": `${total}px` } as CSSProperties,
    data: filling ? { "data-fin-fill": "" } : {},
  };
}

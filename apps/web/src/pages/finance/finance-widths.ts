/**
 * Finance's column widths (Chew 2026-10-13, the Finance look). Each column is
 * the width of what it holds, and since 2026-10-14 one name column per table
 * takes whatever width is left (`fillColumn`, `fillSizing`): an amount fits RM 1,234,567.89 in the footer's bold, a code fits
 * `400-A001`, and a name or a party wraps rather than being cut. A width
 * belongs to the field, so every Finance page prints the same fact the same
 * width; a value that clips is fixed here, once.
 */
import { useCallback, useState, type CSSProperties } from "react";
import { rm } from "@/lib/format-currency";

export const FINANCE_WIDTH = {
  /** An amount, right aligned: `RM 1,234,567.89` in 13px tabular figures. */
  amount: 128,
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

/**
 * The widths a person dragged a Finance kit table's columns to (Chew
 * 2026-10-14), remembered in this browser under one key per table. Storage
 * may be missing or refuse (a private window, blocked site data): the table
 * then draws its own widths and a drag still works until the page reloads.
 */
export function useSavedWidths(storageKey: string): {
  widths: Readonly<Record<string, number>>;
  onResize: (key: string, width: number) => void;
} {
  const [widths, setWidths] = useState<Record<string, number>>(() => readSavedWidths(storageKey));
  const onResize = useCallback((key: string, width: number) => {
    setWidths((before) => {
      const next = { ...before, [key]: Math.round(width) };
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* No storage: the width holds until the page reloads. */
      }
      return next;
    });
  }, [storageKey]);
  return { widths, onResize };
}

/** What `useSavedWidths` stored under a key: only finite, positive widths. */
export function readSavedWidths(storageKey: string): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed as Record<string, unknown>)
      .filter((e): e is [string, number] => typeof e[1] === "number" && Number.isFinite(e[1]) && e[1] > 0));
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

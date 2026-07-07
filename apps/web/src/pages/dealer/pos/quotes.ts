import type { DraftAddon, DraftLine } from "../new-order/draft";

/**
 * POS-parity (topbar → Quotes) — saved quotes. A quote is a NAMED SNAPSHOT of
 * the cart (lines + addons + optional customer label/phone) parked on THIS
 * device (localStorage, same per-device semantics as the 2990s POS), loadable
 * back into the cart later.
 *
 * Marker lines are SANITIZED at save time — a quote must never resurrect
 * time-sensitive server state:
 *   - attrs.pwp (claimed voucher rewards) + attrs.free_gift (server-derived
 *     default gifts) lines are DROPPED — the customer re-claims on return;
 *   - attrs.free_item marks are STRIPPED and the parked `origUnitPrice`
 *     restored — the campaign may have ended by the time it's loaded.
 */

export interface SavedQuote {
  id: string;
  /** Display label — customer name or free reference text. */
  label: string;
  phone: string;
  savedAt: string; // ISO
  lines: DraftLine[];
  addons: DraftAddon[];
  total: number;
}

const KEY = "carres-pos-quotes";
const MAX_QUOTES = 50;

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type LineAttrs = Record<string, unknown> | null;

const hasKey = (attrs: LineAttrs, key: string) =>
  !!attrs && Object.prototype.hasOwnProperty.call(attrs, key);

/** Strip time-sensitive marker lines/marks — see module doc. */
export function sanitizeQuoteLines(lines: DraftLine[]): DraftLine[] {
  const out: DraftLine[] = [];
  for (const l of lines) {
    if (hasKey(l.attrs, "pwp") || hasKey(l.attrs, "free_gift")) continue; // dropped
    if (hasKey(l.attrs, "free_item")) {
      const { free_item: _dropped, ...rest } = l.attrs as Record<string, unknown>;
      const { origUnitPrice, ...line } = l;
      out.push({
        ...line,
        attrs: Object.keys(rest).length > 0 ? rest : null,
        unitPrice: origUnitPrice ?? l.unitPrice,
      });
      continue;
    }
    out.push(l);
  }
  return out;
}

export function listQuotes(): SavedQuote[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as SavedQuote[];
  } catch {
    return [];
  }
}

function persist(quotes: SavedQuote[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(quotes));
  } catch {
    // Quota/private mode — the quote just doesn't stick; caller toasts success
    // optimistically only after saveQuote returns a value, so return-path wins.
  }
}

export function saveQuote(input: {
  label: string;
  phone: string;
  lines: DraftLine[];
  addons: DraftAddon[];
}): SavedQuote {
  const lines = sanitizeQuoteLines(input.lines);
  const total =
    lines.reduce((s, l) => s + l.unitPrice * l.qty, 0) +
    input.addons.reduce((s, a) => s + a.unitPrice * a.qty, 0);
  const quote: SavedQuote = {
    id: newId(),
    label: input.label.trim() || "Unnamed quote",
    phone: input.phone.trim(),
    savedAt: new Date().toISOString(),
    lines,
    addons: input.addons,
    total,
  };
  const next = [quote, ...listQuotes()].slice(0, MAX_QUOTES);
  persist(next);
  return quote;
}

export function deleteQuote(id: string): void {
  persist(listQuotes().filter((q) => q.id !== id));
}

/** Fresh localIds so loading the same quote twice never collides React keys /
 *  Remove targeting with lines already in the cart. */
export function quoteToDraftLines(q: SavedQuote): DraftLine[] {
  return q.lines.map((l) => ({ ...l, localId: newId() }));
}

/** "just now" / "N h ago" / "N d ago" — the 2990s quote-card age chip. */
export function quoteAgeLabel(savedAtIso: string, now: Date): string {
  const saved = new Date(savedAtIso).getTime();
  if (Number.isNaN(saved)) return "";
  const mins = Math.max(0, Math.floor((now.getTime() - saved) / 60_000));
  if (mins < 60) return mins <= 1 ? "just now" : `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} d ago`;
}

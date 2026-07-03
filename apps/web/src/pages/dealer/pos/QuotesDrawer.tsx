import { useMemo, useState } from "react";
import { Bookmark, Trash2, X } from "lucide-react";
import { rm } from "@/lib/format-currency";
import { deleteQuote, listQuotes, quoteAgeLabel, type SavedQuote } from "./quotes";

/**
 * Right slide-in listing the device's saved quotes (2990s Quotes page, folded
 * into the POS overlay): customer label + phone + age chip, ≤3 line previews,
 * piece count + total, Delete / Load-to-cart. Loading is the caller's job
 * (`onLoad` — DealerPos merges into the draft and returns to the catalog).
 */
export default function QuotesDrawer({
  onLoad,
  onClose,
}: {
  onLoad: (quote: SavedQuote) => void;
  onClose: () => void;
}) {
  const [version, setVersion] = useState(0);
  const quotes = useMemo(() => listQuotes(), [version]);
  const now = useMemo(() => new Date(), []);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/25" onClick={onClose} aria-hidden="true" />
      <div
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white shadow-xl flex flex-col animate-page-enter"
        role="dialog"
        aria-label="Saved quotes"
        data-testid="pos-quotes-drawer"
      >
        <header className="flex items-center justify-between px-6 py-4 border-b border-base-200">
          <div className="flex items-center gap-2">
            <Bookmark size={16} strokeWidth={1.75} />
            <h2 className="t-h4">Saved quotes</h2>
            <span className="t-tiny text-base-400">{quotes.length}</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="btn-ghost p-1.5">
            <X size={16} strokeWidth={1.75} />
          </button>
        </header>

        <div className="flex-1 overflow-auto px-6 py-4">
          {quotes.length === 0 ? (
            <p className="t-small text-base-400 text-center py-12">
              No saved quotes on this device yet — save one from the cart.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {quotes.map((q) => (
                <li
                  key={q.id}
                  className="border border-base-200 rounded-lg p-4"
                  data-testid={`pos-quote-${q.id}`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="t-small font-semibold truncate">{q.label}</p>
                    <span className="t-tiny text-base-400 shrink-0">
                      {quoteAgeLabel(q.savedAt, now)}
                    </span>
                  </div>
                  {q.phone && <p className="t-tiny text-base-500">{q.phone}</p>}
                  <ul className="mt-2 flex flex-col gap-0.5">
                    {q.lines.slice(0, 3).map((l) => (
                      <li key={l.localId} className="t-tiny text-base-600 truncate">
                        {l.qty}× {l.label || l.sku}
                      </li>
                    ))}
                    {q.lines.length > 3 && (
                      <li className="t-tiny text-base-400">+{q.lines.length - 3} more…</li>
                    )}
                  </ul>
                  <div className="flex items-center justify-between mt-3">
                    <span className="t-tiny text-base-500">
                      {q.lines.reduce((s, l) => s + l.qty, 0)} pc ·{" "}
                      <span className="font-mono font-semibold text-base-900">{rm(q.total)}</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          deleteQuote(q.id);
                          setVersion((v) => v + 1);
                        }}
                        aria-label="Delete quote"
                        className="grid place-items-center w-8 h-8 rounded-md text-base-400 hover:text-destructive hover:bg-destructive/5"
                      >
                        <Trash2 size={14} strokeWidth={1.75} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onLoad(q)}
                        className="btn-secondary text-[12px]"
                        data-testid={`pos-quote-load-${q.id}`}
                      >
                        Load to cart
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

import { useMemo, useState } from "react";
import { ArrowRight, Bookmark, Trash2, X } from "lucide-react";
import type { CatalogResponse } from "@carres/shared";
import { deleteQuote, listQuotes, quoteAgeLabel, type SavedQuote } from "./quotes";

/**
 * Saved-quotes drawer — prototype skin (`.quotes-drawer`, Loo's Claude Design
 * 2026-07-04): right overlay with quote rows (≤3 stacked photo thumbs from the
 * catalog, label + age + piece meta, Bodoni total, Delete / Load). Loading is
 * the caller's job (`onLoad` — DealerPos replaces the cart and returns to the
 * catalog). Quote storage/sanitising: UNCHANGED (pos/quotes.ts).
 */
export default function QuotesDrawer({
  catalog,
  onLoad,
  onClose,
}: {
  catalog?: CatalogResponse;
  onLoad: (quote: SavedQuote) => void;
  onClose: () => void;
}) {
  const [version, setVersion] = useState(0);
  const quotes = useMemo(() => listQuotes(), [version]);
  const now = useMemo(() => new Date(), []);

  const photoBySku = useMemo(() => {
    if (!catalog) return new Map<string, string | null>();
    const modelById = new Map(catalog.models.map((m) => [m.id, m]));
    const map = new Map<string, string | null>();
    for (const s of catalog.skus) map.set(s.sku, modelById.get(s.modelId)?.photoUrl ?? null);
    return map;
  }, [catalog]);

  return (
    <div className="quotes-overlay" onClick={onClose}>
      <aside
        className="quotes-drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Saved quotes"
        data-testid="pos-quotes-drawer"
      >
        <div className="quotes-drawer__head">
          <div>
            <div className="quotes-drawer__eyebrow">Saved quotes</div>
            <div className="quotes-drawer__title">Pick up where you left off</div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>
        <div className="quotes-drawer__body">
          {quotes.length === 0 ? (
            <div className="quotes-empty">
              <Bookmark size={36} strokeWidth={1.5} />
              <h5>No saved quotes</h5>
              <p>
                Build a cart and tap <strong>Save Quote</strong> to keep it for the customer's
                next visit.
              </p>
            </div>
          ) : (
            quotes.map((q) => (
              <div key={q.id} className="quote-row" data-testid={`pos-quote-${q.id}`}>
                <div className="quote-row__photos">
                  {q.lines.slice(0, 3).map((l, i) => {
                    const photo = photoBySku.get(l.sku);
                    return (
                      <div
                        key={`${l.localId}-${i}`}
                        className="quote-row__photo"
                        style={photo ? { backgroundImage: `url(${photo})` } : undefined}
                      >
                        {!photo && (l.label || l.sku).slice(0, 2).toUpperCase()}
                      </div>
                    );
                  })}
                  {q.lines.length > 3 && (
                    <div className="quote-row__more">+{q.lines.length - 3}</div>
                  )}
                </div>
                <div>
                  <div className="quote-row__name">{q.label}</div>
                  <div className="quote-row__meta">
                    {q.lines.reduce((s, l) => s + l.qty, 0)} pieces
                    {q.phone ? ` · ${q.phone}` : ""} · saved {quoteAgeLabel(q.savedAt, now)}
                  </div>
                </div>
                <div className="quote-row__right">
                  <span className="quote-row__total">
                    <sup>RM</sup>
                    {q.total.toLocaleString("en-MY")}
                  </span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => {
                        deleteQuote(q.id);
                        setVersion((v) => v + 1);
                      }}
                      aria-label="Delete quote"
                    >
                      <Trash2 size={16} strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      onClick={() => onLoad(q)}
                      data-testid={`pos-quote-load-${q.id}`}
                    >
                      Load
                      <ArrowRight size={14} strokeWidth={1.75} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}

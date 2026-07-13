import { useMemo, useState } from "react";
import { ArrowRight, Bookmark, Eye, Trash2, X } from "lucide-react";
import type { CatalogResponse } from "@carres/shared";
import { deleteQuote, listQuotes, quoteAgeLabel, type SavedQuote } from "./quotes";

/**
 * Saved-quotes drawer — prototype skin (`.quotes-drawer`, Loo's Claude Design
 * 2026-07-04): right overlay with quote rows (≤3 stacked photo thumbs from the
 * catalog, label + age + piece meta, Bodoni total, Delete / Load). Loading is
 * the caller's job (`onLoad` — DealerPos replaces the cart and returns to the
 * catalog). Quote storage/sanitising: UNCHANGED (pos/quotes.ts).
 *
 * Detail preview (2026-07-14): the Eye button opens a floating card window
 * (`.quote-detail`) listing every line + addon in the quote, with its own Load
 * CTA — so the salesperson can verify what's inside before replacing the cart.
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
  const [detail, setDetail] = useState<SavedQuote | null>(null);
  const quotes = useMemo(() => listQuotes(), [version]);
  const now = useMemo(() => new Date(), []);

  const photoBySku = useMemo(() => {
    if (!catalog) return new Map<string, string | null>();
    const modelById = new Map(catalog.models.map((m) => [m.id, m]));
    const map = new Map<string, string | null>();
    for (const s of catalog.skus) map.set(s.sku, modelById.get(s.modelId)?.photoUrl ?? null);
    return map;
  }, [catalog]);

  const fmt = (n: number) => n.toLocaleString("en-MY");

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
                    {fmt(q.total)}
                  </span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => setDetail(q)}
                      aria-label="View quote details"
                      data-testid={`pos-quote-detail-${q.id}`}
                    >
                      <Eye size={16} strokeWidth={1.75} />
                    </button>
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

      {detail && (
        <div
          className="quote-detail"
          onClick={(e) => {
            e.stopPropagation();
            setDetail(null);
          }}
        >
          <div
            className="quote-detail__panel"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Quote details"
            data-testid="pos-quote-detail-modal"
          >
            <div className="quote-detail__head">
              <div>
                <div className="quotes-drawer__eyebrow">Quote detail</div>
                <div className="quote-detail__title">{detail.label}</div>
                <div className="quote-row__meta">
                  {detail.lines.reduce((s, l) => s + l.qty, 0)} pieces
                  {detail.phone ? ` · ${detail.phone}` : ""} · saved{" "}
                  {quoteAgeLabel(detail.savedAt, now)}
                </div>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setDetail(null)}
                aria-label="Close details"
              >
                <X size={18} strokeWidth={1.75} />
              </button>
            </div>
            <div className="quote-detail__body">
              {detail.lines.map((l) => {
                const photo = photoBySku.get(l.sku);
                return (
                  <div key={l.localId} className="quote-detail__card">
                    <div
                      className="quote-detail__photo"
                      style={photo ? { backgroundImage: `url(${photo})` } : undefined}
                    >
                      {!photo && (l.label || l.sku).slice(0, 2).toUpperCase()}
                    </div>
                    <div className="quote-detail__info">
                      <div className="quote-detail__name">{l.label || l.sku}</div>
                      <div className="quote-detail__meta">
                        {l.sku} · {l.qty} × RM {fmt(l.unitPrice)}
                      </div>
                    </div>
                    <span className="quote-detail__price">
                      <sup>RM</sup>
                      {fmt(l.unitPrice * l.qty)}
                    </span>
                  </div>
                );
              })}
              {detail.addons.map((a, i) => (
                <div key={`${a.key}-${i}`} className="quote-detail__card quote-detail__card--addon">
                  <div className="quote-detail__photo quote-detail__photo--addon">+</div>
                  <div className="quote-detail__info">
                    <div className="quote-detail__name">{a.name}</div>
                    <div className="quote-detail__meta">
                      Add-on · {a.qty} × RM {fmt(a.unitPrice)}
                    </div>
                  </div>
                  <span className="quote-detail__price">
                    <sup>RM</sup>
                    {fmt(a.unitPrice * a.qty)}
                  </span>
                </div>
              ))}
            </div>
            <div className="quote-detail__foot">
              <div>
                <div className="quote-detail__total-label">Total</div>
                <span className="quote-row__total">
                  <sup>RM</sup>
                  {fmt(detail.total)}
                </span>
              </div>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => onLoad(detail)}
                data-testid="pos-quote-detail-load"
              >
                Load
                <ArrowRight size={14} strokeWidth={1.75} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

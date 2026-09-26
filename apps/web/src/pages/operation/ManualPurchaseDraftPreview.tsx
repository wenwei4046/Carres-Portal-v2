// design-standard: not-a-list-page — this is the READ-BACK half of the create
// workspace (`docs/purchasing/MASTER.md` §9.2), not a Register. Its table is
// the items of ONE draft request sitting beside the form that types them; a
// ListPageShell would wrap page chrome around half of a page.
/**
 * THE LIVE INTERNAL MPR PREVIEW — the right half of the create / returned-edit
 * workspace (owner 2026-09-22; `docs/purchasing/MASTER.md` §9.2,
 * `docs/COPY-STANDARD.md` Manual Purchase create sections).
 *
 * ── WHAT IT IS, AND THE THING IT IS NOT ───────────────────────────────────
 *
 * It is the REQUEST, read back in the same three sections and the same order
 * the form asks them in: `Request Details → Delivery → Items`. It is NOT a
 * supplier Purchase Order. The supplier's paper is drawn at `Issue PO`, from
 * PO-PDF-STANDARD, one preview per actual grouped PO — and a request that
 * names three suppliers becomes three of them, which is exactly why this
 * pane must not look like one.
 *
 * ⛔ IT INVENTS NO IDENTITY. No MPR number, no PO number, no Unit ID, no
 * approval: those are born at `Send for approval` and at `Issue PO`, on the
 * server. Until then the pane says `Draft`, and a draft that showed a number
 * would be a promise the database never made.
 *
 * Every word here is already in the dictionary — the section names, the field
 * names and `Draft` — so the preview respells nothing the form says.
 */
import { MANUAL_PURCHASE_WORDS as MW } from "@carres/shared";

export interface ManualPurchaseDraftFact {
  label: string;
  /** A missing answer prints NOTHING. A draft has no absence words: the fact
   *  has not been filled in yet, which is not the same as "not recorded". */
  value: string | null;
}

export interface ManualPurchaseDraftLine {
  key: string;
  sku: string;
  item: string;
  supplier: string | null;
  qty: number;
  /** 0591 — the line's configuration words (colour · fabric · size · options). */
  configuration: string | null;
}

export default function ManualPurchaseDraftPreview({
  requestDetails,
  delivery,
  lines,
  itemWord,
  qtyWord,
  supplierWord,
}: {
  requestDetails: readonly ManualPurchaseDraftFact[];
  delivery: readonly ManualPurchaseDraftFact[];
  lines: readonly ManualPurchaseDraftLine[];
  itemWord: string;
  qtyWord: string;
  supplierWord: string;
}) {
  const total = lines.reduce((n, l) => n + (Number.isFinite(l.qty) ? l.qty : 0), 0);
  return (
    <div className="mp-preview" data-testid="mp-create-preview">
      <div className="mp-preview-head">
        <span className="text-label uppercase tracking-[0.08em] text-kit-slate-11">
          {MW.page}
        </span>
        <span className="mp-preview-draft" data-testid="mp-preview-draft">
          {MW.draft}
        </span>
      </div>

      <Section title={MW.secCreateRequestDetails} facts={requestDetails} />
      <Section title={MW.secCreateDelivery} facts={delivery} />

      <section className="mp-preview-section" data-preview-section={MW.secCreateItems}>
        <h3 className="mp-preview-title">{MW.secCreateItems}</h3>
        {lines.length === 0 ? null : (
          <table className="mp-preview-table">
            <thead>
              <tr>
                <th>{itemWord}</th>
                <th>{supplierWord}</th>
                <th className="mp-preview-num">{qtyWord}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.key} data-testid={`mp-preview-line-${l.sku}`}>
                  <td>
                    {/* SKU and model together — the same pair the form's own
                        picked line shows, never the model word alone. */}
                    <span className="mp-preview-sku">{l.sku}</span>
                    <span className="mp-preview-item"> · {l.item}</span>
                    {l.configuration ? <span className="mp-preview-note">{l.configuration}</span> : null}
                  </td>
                  <td>{l.supplier ?? null}</td>
                  <td className="mp-preview-num">{l.qty}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>{MW.previewTotal}</td>
                <td className="mp-preview-num" data-testid="mp-preview-total">
                  {total}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </section>
    </div>
  );
}

function Section({
  title,
  facts,
}: {
  title: string;
  facts: readonly ManualPurchaseDraftFact[];
}) {
  return (
    <section className="mp-preview-section" data-preview-section={title}>
      <h3 className="mp-preview-title">{title}</h3>
      <dl className="mp-preview-facts">
        {facts.map((f) => (
          <div key={f.label}>
            <dt>{f.label}</dt>
            <dd data-testid={`mp-preview-${f.label.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
              {f.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

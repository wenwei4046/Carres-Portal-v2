// design-standard: not-a-list-page — this is the 50/50 ISSUE surface
// (CARD-2026-08-22-purchasing-02 §5), not a Register. Its table is the lines of
// ONE purchase order being checked before it is sent, sitting beside that
// document's own preview; a ListPageShell would wrap a second page chrome
// around a surface whose whole point is document + work, side by side.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  SO_BATCH_PURCHASE_WORDS as W,
  type PurchasingDestination,
  type SoBatchDocument,
} from "@carres/shared";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import { renderPoPdf } from "@/lib/pdf/render";
import type { PoTemplateData } from "@/lib/pdf/types";
import PoIssueEvidence, { type IssuedPo } from "../components/PoIssueEvidence";

/**
 * REVIEW PURCHASE ORDERS — the guided issue journey
 * (CARD-2026-08-22-purchasing-02 §5; `docs/purchasing/MASTER.md` §8.2).
 *
 * 50% work, 50% the actual document. It is a SURFACE, not a modal: a supplier
 * order is an outside-readable document, and checking one behind a dialog that
 * dims the page it came from is how a wrong quantity gets sent.
 *
 * ── THE THREE STATES, AND WHY THE LAST ONE EXISTS ───────────────────────────
 *
 *   REVIEW    one supplier × destination at a time, `1 of N`, nothing created.
 *             The preview is visibly NOT SENDABLE and says why: the number is
 *             minted by Issue PO, so a preview that looked official would be a
 *             document with no identity.
 *   CREATING  one request for every document (§7.3). All or none.
 *   EVIDENCE  the numbers exist and the supplier still has nothing. Issue PO
 *             stays OPEN here — the act that closes it is somebody recording
 *             that the PDF actually arrived, not this screen deciding it did.
 *
 * ── LEAVING IS SAFE, AND DELIBERATELY SO ────────────────────────────────────
 *
 * A numbered purchase order is never deleted by walking away. It waits in
 * Purchase Orders as `Not sent to supplier`, and SO Batch does not offer the
 * same remainder again because the open PO now covers it (§5.2).
 */
export interface SoBatchIssueWorkspaceProps {
  documents: readonly SoBatchDocument[];
  destinations: readonly PurchasingDestination[];
  /** Who may collect from a factory, for the documents that need one. */
  procurementPartners: readonly { id: string; name: string }[];
  onBack: () => void;
  /** Every document confirmed — the Register refetches and the journey ends. */
  onDone: () => void;
}

type Mode = "review" | "evidence";

/**
 * THE COMMERCIAL DECISION AN OPERATOR MAKES PER SKU.
 *
 * `cost` is a STRING because it is what somebody typed. Parsing it early would
 * turn a half-typed `4` into a price of four ringgit; it becomes a number only
 * at the boundary, and only after it is valid.
 */
type LineDecision = { treatment: "normal"; cost: string } | {
  treatment: "free_of_charge";
  reason: string;
};

/** One priced line, exactly as `soBatchIssueInput` expects it on the wire. */
type WireLineDecision =
  | { sku: string; treatment: "normal"; unitCost: number; costSource: "hand_entered" }
  | { sku: string; treatment: "free_of_charge"; reason: string };

/** Every distinct SKU on a document, with the Catalog price behind it. */
function documentSkus(
  doc: SoBatchDocument,
): Array<{ sku: string; catalogCost: number | null }> {
  const out = new Map<string, number | null>();
  for (const line of doc.lines) {
    for (const c of line.costs) {
      if (!out.has(c.sku)) out.set(c.sku, c.unitCost);
    }
  }
  return [...out].map(([sku, catalogCost]) => ({ sku, catalogCost }));
}

const money = (n: number | null) => (n == null ? "" : String(n));

export default function SoBatchIssueWorkspace({
  documents,
  destinations,
  procurementPartners,
  onBack,
  onDone,
}: SoBatchIssueWorkspaceProps) {
  const [at, setAt] = useState(0);
  const [mode, setMode] = useState<Mode>("review");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pos, setPos] = useState<IssuedPo[]>([]);
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());

  /* ── THE COMMERCIAL DECISIONS ─────────────────────────────────────────────
   *
   * Seeded from the Catalog so the common case needs no typing at all, and
   * keyed `documentKey::sku` because the same SKU on two documents is two
   * decisions — one supplier may give it free while another charges.
   *
   * A line whose Catalog price is unknown starts EMPTY on purpose. There is no
   * safe default: `0` is a price nobody set, and guessing one is how a supplier
   * gets asked to deliver for nothing. */
  const [decisions, setDecisions] = useState<Record<string, LineDecision>>(() => {
    const seed: Record<string, LineDecision> = {};
    for (const doc of documents) {
      for (const { sku, catalogCost } of documentSkus(doc)) {
        seed[`${doc.key}::${sku}`] = { treatment: "normal", cost: money(catalogCost) };
      }
    }
    return seed;
  });
  const [partners, setPartners] = useState<Record<string, string>>({});

  /**
   * THE OFFICIAL PDF, RENDERED.
   *
   * Not the `/print-data` JSON in an iframe — that would show a payload and
   * call it a purchase order. The endpoint returns the money-free document
   * payload (`purchasing_po_document`, 0307) and `renderPoPdf` is the SAME
   * template Purchase Orders and the print path already use, so the operator
   * checks the exact bytes the supplier will receive: real number, real
   * version, real Unit IDs.
   *
   * The blob URL is revoked when it is replaced or the surface closes — an
   * un-revoked object URL holds the whole PDF in memory for the tab's life.
   */
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const setDecision = useCallback((key: string, next: LineDecision) => {
    setDecisions((prev) => ({ ...prev, [key]: next }));
  }, []);

  const destinationName = useCallback(
    (id: string) => destinations.find((d) => d.id === id)?.name ?? "",
    [destinations],
  );

  const current = documents[Math.min(at, Math.max(documents.length - 1, 0))];

  /**
   * WHAT IS STOPPING THE WHOLE BATCH, named.
   *
   * It is computed across EVERY document, not the one on screen: the request is
   * atomic, so a missing price on document 3 stops document 1 too, and an
   * operator staring at a dead button on page 1 needs to be told that. The
   * first blocker wins — a list of five would be read as five problems when
   * fixing them is one pass.
   */
  const blocker = useMemo<string | null>(() => {
    for (const doc of documents) {
      if (doc.supplierKind === "factory_pickup" && !partners[doc.key]) {
        return `${doc.supplierName ?? "Supplier"} → ${destinationName(
          doc.destinationId,
        )} needs a procurement partner`;
      }
      for (const { sku } of documentSkus(doc)) {
        const d = decisions[`${doc.key}::${sku}`];
        if (!d) return `${sku} needs a transaction cost`;
        if (d.treatment === "free_of_charge") {
          if (d.reason.trim() === "") return `${sku} needs a reason for Free of Charge`;
          continue;
        }
        const n = Number(d.cost);
        if (d.cost.trim() === "" || !Number.isFinite(n) || n <= 0) {
          return `${sku} needs a transaction cost`;
        }
      }
    }
    return null;
  }, [documents, decisions, partners, destinationName]);

  /**
   * The decisions, on the wire.
   *
   * An UNTOUCHED Catalog price is deliberately omitted: the server re-reads its
   * own catalog and stamps it. Sending it back as `costSource: "catalog"` would
   * only give the server a number to disagree with — which is exactly what
   * `stale_catalog_cost` is for, and there is no reason to invite it when
   * nobody edited anything.
   */
  const documentDecisions = useMemo(
    () =>
      documents.map((doc) => ({
        supplierId: doc.supplierId,
        destinationId: doc.destinationId,
        procurementPartnerId:
          doc.supplierKind === "factory_pickup" ? (partners[doc.key] ?? null) : null,
        lineDecisions: documentSkus(doc).flatMap<WireLineDecision>(({ sku, catalogCost }) => {
          const d = decisions[`${doc.key}::${sku}`];
          if (!d) return [];
          if (d.treatment === "free_of_charge") {
            return [{ sku, treatment: "free_of_charge" as const, reason: d.reason.trim() }];
          }
          const n = Number(d.cost);
          if (catalogCost != null && n === catalogCost) return [];
          return [
            {
              sku,
              treatment: "normal" as const,
              unitCost: n,
              /* Hand-entered even when it started as the catalog price: the
                 operator changed it, so it is theirs now. */
              costSource: "hand_entered" as const,
            },
          ];
        }),
      })),
    [documents, decisions, partners],
  );

  /**
   * ONE REQUEST FOR EVERY DOCUMENT (§7.3). The selections are rebuilt from the
   * documents rather than carried through the screen: the grouping the operator
   * saw and the allocation the server will check must come from the same place,
   * and the server regroups it all anyway.
   */
  const selections = useMemo(() => {
    const byDemand = new Map<string, { destinationId: string; qty: number }[]>();
    for (const d of documents) {
      for (const line of d.lines) {
        const list = byDemand.get(line.demandId) ?? [];
        list.push({ destinationId: d.destinationId, qty: line.qty });
        byDemand.set(line.demandId, list);
      }
    }
    return [...byDemand].map(([demandId, allocations]) => ({ demandId, allocations }));
  }, [documents]);

  async function issue() {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await apiFetch<{ pos: IssuedPo[] }>(
        "/api/operation/purchase/to-order/issue-batch",
        {
          method: "POST",
          body: JSON.stringify({ selections, documentDecisions }),
        },
      );
      setPos(res.pos ?? []);
      setMode("evidence");
      setAt(0);
    } catch (e) {
      /* The request is atomic, so a failure created NOTHING. The operator stays
         exactly where they were, with the selection intact, and can fix the
         line the server named. */
      setError(e instanceof Error ? e.message : "Issue PO failed");
    } finally {
      setCreating(false);
    }
  }

  const onConfirmed = useCallback(
    (poId: string) => {
      setConfirmed((prev) => {
        const next = new Set(prev).add(poId);
        if (next.size >= pos.length && pos.length > 0) onDone();
        else {
          /* Move to the next document the supplier has not received. */
          const nextIdx = pos.findIndex((p) => !next.has(p.id));
          if (nextIdx >= 0) setAt(nextIdx);
        }
        return next;
      });
    },
    [pos, onDone],
  );

  const total = mode === "evidence" ? pos.length : documents.length;
  const idx = Math.min(at, Math.max(total - 1, 0));
  const currentPo = mode === "evidence" ? pos[idx] : undefined;

  const currentPoId = currentPo?.id ?? null;
  useEffect(() => {
    if (!currentPoId) return;
    let dead = false;
    let url: string | null = null;
    setPdfError(null);
    void (async () => {
      try {
        const data = await apiFetch<PoTemplateData>(
          `/api/operation/pos/${encodeURIComponent(currentPoId)}/print-data`,
        );
        const blob = await renderPoPdf(data);
        if (dead) return;
        url = URL.createObjectURL(blob);
        setPdfUrl(url);
      } catch (e) {
        if (!dead) setPdfError(e instanceof Error ? e.message : "Could not render the PDF");
      }
    })();
    return () => {
      dead = true;
      if (url) URL.revokeObjectURL(url);
      setPdfUrl(null);
    };
  }, [currentPoId]);

  return (
    <div
      className="flex h-full min-h-0 w-full flex-1 flex-col bg-kit-canvas"
      data-testid="so-batch-issue-workspace"
    >
      <div className="flex h-[50px] shrink-0 items-center justify-between gap-3 border-b border-kit-slate-5 bg-white px-4">
        <span className="flex items-baseline gap-3">
          <span className="text-page font-semibold">{W.reviewTitle}</span>
          <span className="text-meta text-kit-slate-11" data-testid="so-batch-issue-count">
            {idx + 1} of {total}
          </span>
        </span>
        <span className="flex items-center gap-2">
          {total > 1 ? (
            <>
              <button
                type="button"
                data-testid="so-batch-issue-prev"
                className="h-7 rounded-control border border-kit-slate-6 px-2 text-meta disabled:opacity-40"
                disabled={idx === 0}
                onClick={() => setAt((i) => Math.max(0, i - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                data-testid="so-batch-issue-next"
                className="h-7 rounded-control border border-kit-slate-6 px-2 text-meta disabled:opacity-40"
                disabled={idx >= total - 1}
                onClick={() => setAt((i) => Math.min(total - 1, i + 1))}
              >
                Next
              </button>
            </>
          ) : null}
        </span>
      </div>

      <div
        className="grid min-h-0 flex-1 grid-cols-2 overflow-hidden"
        data-testid="so-batch-issue-split"
      >
        {/* ── 50% · the only editable side ──────────────────────────────── */}
        <div
          className="flex min-h-0 flex-col overflow-y-auto border-r border-kit-slate-5 bg-white p-4"
          data-testid="so-batch-issue-work"
        >
          {mode === "review" && current ? (
            <>
              <h2
                className="text-body font-semibold uppercase tracking-wide"
                data-testid="so-batch-issue-title"
              >
                {current.supplierName ?? "Supplier"} → {destinationName(current.destinationId)}
              </h2>
              <table className="mt-3 w-full text-body">
                <thead>
                  <tr className="border-b border-kit-slate-5 text-label uppercase text-kit-slate-11">
                    <th className="py-1 text-left">Item</th>
                    <th className="w-24 py-1 text-left">Source</th>
                    <th className="w-14 py-1 pr-3 text-right">Qty</th>
                    <th className="w-40 py-1 text-left">Goods must arrive</th>
                  </tr>
                </thead>
                <tbody>
                  {current.lines.map((l) => (
                    <tr key={l.demandId} className="border-b border-kit-slate-4">
                      <td className="py-1">
                        <span className="flex flex-col leading-tight">
                          <span>{l.item}</span>
                          <span className="text-meta text-kit-slate-11">
                            {[l.variant, l.skus.join(" · ")].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                      </td>
                      <td className="py-1 font-mono text-meta">
                        {l.so == null ? "" : `SO-${l.so}`}
                      </td>
                      <td className="py-1 pr-3 text-right tabular-nums">{l.qty}</td>
                      <td className="py-1 text-meta">
                        {l.goodsMustArrive ? fmtDate(l.goodsMustArrive) : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* ── THE COMMERCIAL DECISIONS ─────────────────────────────
                  The only editable issue surface (§5.2). Everything a purchase
                  order needs before it can exist is settled here, so an
                  operator never meets `cost_required` as an error message when
                  it could have been a field. */}
              <div className="mt-4 flex flex-col gap-2 border-t border-kit-slate-5 pt-3">
                <span className="text-label uppercase tracking-wide text-kit-slate-11">
                  Transaction cost
                </span>
                {documentSkus(current).map(({ sku, catalogCost }) => {
                  const key = `${current.key}::${sku}`;
                  const d = decisions[key] ?? { treatment: "normal" as const, cost: "" };
                  const foc = d.treatment === "free_of_charge";
                  return (
                    <div key={sku} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate font-mono text-meta">{sku}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          {foc ? null : (
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              className="h-7 w-28 rounded-control border border-kit-slate-6 px-1.5 text-right text-meta tabular-nums"
                              data-testid={`so-batch-cost-${sku}`}
                              placeholder={catalogCost == null ? "No catalog price" : ""}
                              value={d.treatment === "normal" ? d.cost : ""}
                              onChange={(e) =>
                                setDecision(key, { treatment: "normal", cost: e.target.value })
                              }
                            />
                          )}
                          <button
                            type="button"
                            data-testid={`so-batch-foc-${sku}`}
                            className={`h-7 rounded-control border px-2 text-meta ${
                              foc
                                ? "border-kit-blue-9 bg-kit-blue-3 text-kit-blue-11"
                                : "border-kit-slate-6"
                            }`}
                            onClick={() =>
                              setDecision(
                                key,
                                foc
                                  ? { treatment: "normal", cost: money(catalogCost) }
                                  : { treatment: "free_of_charge", reason: "" },
                              )
                            }
                          >
                            Free of Charge
                          </button>
                        </span>
                      </div>
                      {foc ? (
                        <input
                          className="h-7 w-full rounded-control border border-kit-slate-6 px-1.5 text-meta"
                          data-testid={`so-batch-foc-reason-${sku}`}
                          placeholder="Why is this free of charge?"
                          value={d.reason}
                          onChange={(e) =>
                            setDecision(key, { treatment: "free_of_charge", reason: e.target.value })
                          }
                        />
                      ) : null}
                    </div>
                  );
                })}

                {/* Only a factory-pickup document asks. An own-logistics one
                    that offered the control would invite a fact the server
                    refuses (`pickup_partner_not_allowed`). */}
                {current.supplierKind === "factory_pickup" ? (
                  <label className="mt-2 flex items-center justify-between gap-3">
                    <span className="text-label uppercase tracking-wide text-kit-slate-11">
                      Procurement partner
                    </span>
                    <select
                      className="h-7 min-w-[180px] rounded-control border border-kit-slate-6 px-1.5 text-meta"
                      data-testid="so-batch-partner"
                      value={partners[current.key] ?? ""}
                      onChange={(e) =>
                        setPartners((prev) => ({ ...prev, [current.key]: e.target.value }))
                      }
                    >
                      <option value="">Choose who collects</option>
                      {procurementPartners.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>

              {blocker ? (
                <p
                  className="mt-3 text-meta text-kit-slate-11"
                  data-testid="so-batch-issue-blocker"
                >
                  {blocker}
                </p>
              ) : null}
              {error ? (
                <p className="mt-3 text-meta text-kit-red-11" data-testid="so-batch-issue-error">
                  {error}
                </p>
              ) : null}
              <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                <button
                  type="button"
                  data-testid="so-batch-issue-back"
                  className="h-8 rounded-control border border-kit-slate-6 px-3 text-meta font-medium"
                  onClick={onBack}
                >
                  {W.backToBuying}
                </button>
                <button
                  type="button"
                  data-testid="so-batch-issue-create"
                  className="h-8 rounded-control bg-kit-blue-9 px-3 text-meta font-medium text-white disabled:bg-kit-slate-6"
                  disabled={creating || documents.length === 0 || blocker !== null}
                  onClick={() => void issue()}
                >
                  {W.issuePo}
                </button>
              </div>
            </>
          ) : currentPo ? (
            <PoIssueEvidence
              po={currentPo}
              confirmed={confirmed.has(currentPo.id)}
              onConfirmed={() => onConfirmed(currentPo.id)}
            />
          ) : null}
        </div>

        {/* ── 50% · the document itself ─────────────────────────────────── */}
        <div
          className="flex min-h-0 flex-col overflow-y-auto bg-kit-canvas p-4"
          data-testid="so-batch-issue-preview"
        >
          {mode === "review" ? (
            /* NOT SENDABLE, AND IT SAYS SO. A preview that looked official
               would be a purchase order with no number — the one thing a
               supplier cannot act on. */
            <div className="flex h-full flex-col items-center justify-center gap-2 rounded-control border border-dashed border-kit-slate-6 bg-white p-6 text-center">
              <p className="text-body font-medium">{W.previewNotSendable}</p>
              <p className="text-meta text-kit-slate-11">
                {current?.supplierName ?? ""} · {destinationName(current?.destinationId ?? "")} ·{" "}
                {current?.qty ?? 0} {current?.qty === 1 ? "unit" : "units"}
              </p>
            </div>
          ) : currentPo ? (
            pdfUrl ? (
              <iframe
                title={`${currentPo.id} purchase order`}
                data-testid={`so-batch-pdf-${currentPo.id}`}
                className="h-full w-full rounded-control border border-kit-slate-6 bg-white"
                src={pdfUrl}
              />
            ) : (
              <div
                className="flex h-full items-center justify-center rounded-control border border-kit-slate-6 bg-white text-meta text-kit-slate-11"
                data-testid={`so-batch-pdf-placeholder-${currentPo.id}`}
              >
                {pdfError ?? `Rendering ${currentPo.id}…`}
              </div>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}

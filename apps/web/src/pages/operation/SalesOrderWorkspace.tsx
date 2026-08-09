/**
 * SalesOrderWorkspace — STAGE 1 (BUILD-QUEUE): the row opens a DOCUMENT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ READ-ONLY, LEFT FACTS + RIGHT EMBEDDED PDF — and the PDF is not a preview
 * of some other renderer: the right pane holds the SAME `renderSalesOrderPdf`
 * output that Print opens (DONE-WHEN's own clause), pointed at the pane
 * instead of `window.open` (2990's `renderViaIframe`, `sales-order-pdf.ts:248`,
 * done with the renderer Carres already runs — Law D forbids a second one).
 *
 * **This file writes NOTHING.** No mutation hook, no form, no button that
 * changes a record. `?edit=1` is Stage 2's door; this stage reads it as
 * nothing. What is FORBIDDEN here, by the architecture, by name: `Issue PO` ·
 * `ETA` · `Stock` · any delivery action · `Calls` · the journey widget —
 * every one is EXECUTION and belongs to its owning module
 * (`ERP-ARCHITECTURE.md` Laws A + B).
 *
 * ONE ARITHMETIC, ONE SET OF NAMES: money is `@carres/shared`'s `orderMoney`
 * through `sales-order-facts.ts`, the same call the register's row makes;
 * product names are the API's own `label`, resolved by the one helper the
 * register's row also reads (Law D).
 */
// design-standard: not-a-list-page — this is a DOCUMENT workspace, not a
// register. Its `<table>` is the order's own line block: fixed rows, no sort,
// no selection, never longer than the order.
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ClipboardList, Printer } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import * as pdfjs from "pdfjs-dist";
import { orderMoney } from "@carres/shared";
import Button from "@/components/kit/Button";
import EmptyState from "@/components/kit/EmptyState";
import Loading from "@/components/kit/Loading";
import Money from "@/components/Money";
import { apiFetch, ApiError } from "@/lib/api";
import { cjkClassName } from "@/lib/cjk";
import { fmtDate } from "@/lib/fmt-date";
import { renderSalesOrderPdf } from "@/lib/pdf/render";
import type { SalesOrderTemplateData } from "@/lib/pdf/types";
import { useOperationOrder } from "@/lib/queries";
import ModuleHeader from "./components/ModuleHeader";
import { lineName, outstandingState, valueState, type MoneyState } from "./sales-order-facts";

/** A money state is a number or a sentence — never an empty cell. */
function MoneyStateCell({ state }: { state: MoneyState }) {
  if (state.kind === "amount") return <Money value={state.value} />;
  return <span>{state.kind === "settled" ? "Paid in full" : "No price yet"}</span>;
}

/** One labelled fact. The label is quiet, the fact is ink. */
function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-label text-base-500">{label}</div>
      <div className="text-body text-base-900 mt-0.5 break-words">{value}</div>
    </div>
  );
}

/* pdf.js paints the pane. Its worker ships inside the same package — the
 * bundler serves it; nothing is fetched from a CDN. */
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

/**
 * The embedded live PDF — one of the two approved Carres improvements over
 * 2990. ONE render pipeline, two doors (FIX 3):
 *
 *   /sales-order-data → renderSalesOrderPdf → ONE Blob
 *        ├── painted into the pane by pdf.js (a plain <canvas> per page —
 *        │   visible in ANY capture, unlike the browser's PDF plugin, which
 *        │   does not paint in headless screenshots)
 *        └── the SAME Blob's object URL is what Print PDF opens
 *
 * There is no second PDF implementation: pdf.js only DISPLAYS the bytes the
 * one renderer produced. The previous blob URL is revoked on every render
 * and on unmount.
 */
function usePdfPreview(orderId: string | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const paneRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setUrl(null);
    setPdfError(null);
    (async () => {
      try {
        const data = await apiFetch<SalesOrderTemplateData>(
          `/api/orders/${orderId}/sales-order-data`,
        );
        const blob = await renderSalesOrderPdf(data);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
        /* Paint the SAME bytes into the pane. */
        const doc = await pdfjs.getDocument({ data: await blob.arrayBuffer() }).promise;
        if (cancelled) return;
        const pane = paneRef.current;
        if (!pane) return;
        pane.replaceChildren();
        const paneWidth = Math.max(pane.clientWidth - 48, 320);
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const scale = paneWidth / base.width;
          const dpr = window.devicePixelRatio || 1;
          const viewport = page.getViewport({ scale: scale * dpr });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = `${Math.round(viewport.width / dpr)}px`;
          canvas.style.height = `${Math.round(viewport.height / dpr)}px`;
          canvas.style.display = "block";
          canvas.style.margin = "0 auto 16px";
          /* A PDF page is paper — white by definition, not a themed surface;
             the kit's token classes style React markup, and this canvas is
             imperative pdf.js output. */
          canvas.style.boxShadow = "0 1px 4px rgba(0,0,0,0.18)";
          canvas.style.background = "white";
          canvas.setAttribute("data-testid", `pdf-page-${n}`);
          pane.appendChild(canvas);
          await page.render({
            canvasContext: canvas.getContext("2d")!,
            viewport,
          }).promise;
        }
      } catch (e) {
        if (!cancelled) setPdfError(e instanceof ApiError ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [orderId]);
  return { url, pdfError, paneRef };
}

export default function SalesOrderWorkspace() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useOperationOrder(orderId ?? "");
  const { url: pdfUrl, pdfError, paneRef } = usePdfPreview(orderId);

  const order = data?.order;
  const lines = data?.lines ?? [];
  const addons = data?.addons ?? [];

  /* The SAME call the register's row makes. Two surfaces, one arithmetic. */
  const money = orderMoney({
    lineSum: lines.reduce((s, l) => s + Number(l.unit_price ?? 0) * Number(l.qty ?? 0), 0),
    addonSum: addons.reduce((s, a) => s + Number(a.unit_price ?? 0) * Number(a.qty ?? 0), 0),
    paid: order?.paid,
    controlBalance: null,
  });

  const promised = order
    ? order.delivery_date_tbd
      ? "No date yet"
      : fmtDate(order.delivery_date)
    : "";

  const backToRegister = () => navigate("/operation/orders");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ModuleHeader
        testId="sales-order-workspace-header"
        icon={ClipboardList}
        word="Sales Orders"
        docTitle={order ? `SO-${order.so} — Carres` : "Sales Orders — Carres"}
        right={
          <span className="flex items-center gap-2">
            {/* Print = the SAME blob the pane shows — one renderer, one output. */}
            <Button
              size="sm"
              variant="ghost"
              disabled={!pdfUrl}
              onClick={() => {
                if (pdfUrl) window.open(pdfUrl, "_blank");
              }}
              data-testid="workspace-print"
            >
              <Printer size={14} /> Print PDF
            </Button>
            <Button size="sm" variant="ghost" onClick={backToRegister} data-testid="doc-back">
              <ArrowLeft size={14} /> Back to register
            </Button>
          </span>
        }
      />

      <div className="flex min-h-0 flex-1">
        {/* ── LEFT — the facts, read-only ─────────────────────────────────── */}
        <div className="min-h-0 w-[440px] shrink-0 overflow-auto border-r border-kit-slate-5 bg-kit-slate-3 px-4 py-4 max-[1279px]:w-[400px]">
          {isLoading && <Loading label="Opening the sales order" />}

          {!isLoading && isError && (
            <div className="rounded-card border border-kit-slate-5 bg-white">
              <EmptyState
                title="This sales order could not be opened"
                detail={(error as Error | undefined)?.message}
                action={
                  <Button variant="neutral" onClick={() => void refetch()}>
                    Try again
                  </Button>
                }
              />
            </div>
          )}

          {!isLoading && !isError && order && (
            <div className="flex flex-col gap-3" data-testid="sales-order-workspace">
              {/* ── The document's name ───────────────────────────────────── */}
              <div className="rounded-card border border-kit-slate-5 bg-white px-4 py-3">
                <div className="text-page text-base-900" data-testid="doc-so">
                  SO-{order.so}
                </div>
                {(order.source_ref ?? []).length > 0 && (
                  <div className="text-meta text-base-500 mt-1">
                    Customer reference {(order.source_ref ?? []).join(" · ")}
                  </div>
                )}
              </div>

              {/* ── The commitment ────────────────────────────────────────── */}
              <div className="rounded-card border border-kit-slate-5 bg-white px-4 py-3">
                <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                  <Fact
                    label="Customer"
                    value={
                      <span className={cjkClassName(order.customer_name)}>
                        {order.customer_name}
                      </span>
                    }
                  />
                  <Fact label="Phone" value={order.customer_phone || "Not given"} />
                  <Fact
                    label="Salesperson"
                    value={order.salespersons?.name || "Not recorded"}
                  />
                  <Fact label="Showroom" value={order.outlets?.name || "Not recorded"} />
                  <Fact label="Dealer" value={order.dealers?.name || "Not recorded"} />
                  <Fact
                    label="Address"
                    value={
                      order.customer_address_unknown
                        ? "Not given"
                        : order.customer_address || "Not given"
                    }
                  />
                  <Fact label="Ordered" value={fmtDate(order.placed_at)} />
                  <Fact label="Promised" value={promised} />
                </div>
              </div>

              {/* ── What they bought ──────────────────────────────────────── */}
              <div className="rounded-card border border-kit-slate-5 bg-white">
                <table className="w-full text-body" data-testid="doc-items">
                  <thead>
                    <tr className="text-label text-base-500">
                      <th className="px-4 py-2 text-left font-medium">Item</th>
                      <th className="px-4 py-2 text-right font-medium">Qty</th>
                      <th className="px-4 py-2 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={`${l.sku}-${i}`} className="border-t border-kit-slate-5">
                        <td className={`px-4 py-2 ${cjkClassName(lineName(l))}`}>
                          {lineName(l)}
                          <span className="text-base-500"> ×{l.qty}</span>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{l.qty}</td>
                        <td className="px-4 py-2 text-right">
                          {Number(l.unit_price) > 0 ? (
                            <Money value={Number(l.unit_price) * Number(l.qty)} />
                          ) : (
                            "No price yet"
                          )}
                        </td>
                      </tr>
                    ))}
                    {addons.map((a, i) => (
                      <tr key={`addon-${i}`} className="border-t border-kit-slate-5">
                        <td className="px-4 py-2">{a.addon_key}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{a.qty}</td>
                        <td className="px-4 py-2 text-right">
                          <Money value={Number(a.unit_price) * Number(a.qty)} />
                        </td>
                      </tr>
                    ))}
                    {lines.length === 0 && addons.length === 0 && (
                      <tr className="border-t border-kit-slate-5">
                        <td className="px-4 py-3 text-base-500" colSpan={3}>
                          No items on this order
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* ── The money ─────────────────────────────────────────────── */}
              <div className="rounded-card border border-kit-slate-5 bg-white px-4 py-3">
                <div className="grid grid-cols-3 gap-x-5">
                  <Fact label="Total" value={<MoneyStateCell state={valueState(money)} />} />
                  <Fact label="Paid" value={<Money value={money.paid} />} />
                  <Fact
                    label="Balance"
                    value={<MoneyStateCell state={outstandingState(money)} />}
                  />
                </div>
              </div>

              {/* ── History, read-only ────────────────────────────────────── */}
              <div className="rounded-card border border-kit-slate-5 bg-white px-4 py-3">
                <div className="text-label text-base-500">History</div>
                {(data?.history ?? []).length === 0 ? (
                  <p className="text-body text-base-500 mt-2">
                    Nothing has been recorded on this order yet
                  </p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-2" data-testid="doc-history">
                    {(data?.history ?? []).map((h, i) => (
                      <li key={i} className="flex gap-3 text-body">
                        <span className="shrink-0 text-meta text-base-500 tabular-nums">
                          {fmtDate(h.occurred_at, { time: true })}
                        </span>
                        <span className="min-w-0 break-words">{h.text}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT — the embedded PDF, the same output Print opens (FIX 3:
            painted by pdf.js onto plain canvases, so the pane is visible in
            any capture; Print opens the SAME blob). ─────────────────────── */}
        <div
          className="relative min-h-0 min-w-0 flex-1 overflow-auto bg-base-100 py-6"
          data-testid="pdf-pane"
        >
          <div ref={paneRef} data-testid="pdf-canvas-pane" />
          {pdfError ? (
            <div className="flex h-full items-center justify-center px-6">
              <p className="text-body text-base-500">
                The Sales Order PDF could not be rendered: {pdfError}
              </p>
            </div>
          ) : !pdfUrl ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loading label="Rendering the sales order" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

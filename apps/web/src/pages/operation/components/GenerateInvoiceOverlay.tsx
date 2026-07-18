/**
 * GenerateInvoiceOverlay — SPEC §10 "Generate invoice" (Jess 2026-07-18).
 *
 * Full-screen overlay opened from the Balance panel ⋮: LEFT = the same
 * charges table the Balance tab shows (numbered goods lines / keyed goods
 * total + the storage-fee line + Total) · RIGHT = a LIVE PDF preview
 * (client-rendered via renderInvoicePdf — appears only because the user
 * clicked Generate, never always-on) · FOOTER = the outputs: PDF ·
 * WhatsApp · Email.
 *
 * Persistence (option C): the first output click ISSUES the invoice through
 * POST /api/orders/:id/issue-invoice (0229 RPC — idempotent, same
 * INV-YYYY-{so} formula as the dispatch auto-issue, amount = the Balance
 * tab's goods+storage total) and the issue lands in order_history +
 * audit_log. Real e-mail SENDING needs a mail provider (not configured) —
 * the Email output opens a prefilled mailto: draft; attach the saved PDF.
 */
import { useEffect, useMemo, useState } from "react";
import { FileText, Mail, MessageCircle, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api";
import { renderInvoicePdf } from "@/lib/pdf/render";
import type { InvoiceTemplateData } from "@/lib/pdf/types";
import { rmAmount, salutationOf } from "@/lib/wa-templates";
import { lineSize } from "@/lib/line-category";
import type { operationOrderDetailLine } from "@/lib/queries";
import Btn from "@/components/Btn";
import Money from "@/components/Money";

type IssueInvoiceResponse = {
  invoice_no: string;
  issued_at: string;
  amount: number;
  already_issued: boolean;
};

/** The deterministic on-demand number — MUST match the 0229 RPC (and 0098). */
function predictedInvoiceNo(so: number): string {
  return `INV-${new Date().getFullYear()}-${String(so).padStart(6, "0")}`;
}

export default function GenerateInvoiceOverlay({
  orderId,
  so,
  invoiceNo,
  customerName,
  customerPhone,
  customerAddress,
  lines,
  hasLineTotal,
  orderTotal,
  totalSet,
  storageCharge,
  storageIncurred,
  invoiceTotal,
  balanceDue,
  onClose,
}: {
  orderId: string;
  so: number;
  /** Already-issued number from the order row (null before first issue). */
  invoiceNo: string | null;
  customerName: string;
  customerPhone: string | null;
  customerAddress: string | null;
  lines: operationOrderDetailLine[];
  hasLineTotal: boolean;
  /** Goods total — line sum (native) or the keyed figure (AutoCount). */
  orderTotal: number;
  totalSet: boolean;
  storageCharge: number;
  storageIncurred: boolean;
  /** Goods + storage — the amount the issue records. */
  invoiceTotal: number;
  balanceDue: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  // An IMPORTED order (no per-line prices) keeps its TAX invoice in
  // AutoCount — here we only produce a PAYMENT REQUEST / statement for the
  // outstanding balance, and never mint an INV number for it (option A,
  // Jess 2026-07-18).
  const imported = !hasLineTotal;
  const [issued, setIssued] = useState<IssueInvoiceResponse | null>(null);
  const [issuing, setIssuing] = useState(false);
  const effectiveNo = issued?.invoice_no ?? invoiceNo ?? predictedInvoiceNo(so);
  const isIssued = !!(issued?.invoice_no ?? invoiceNo);

  // ── The same charge merge the Balance tab renders (same-SKU lines fold). ──
  const merged = useMemo(() => {
    const out: { sku: string; qty: number; amount: number }[] = [];
    for (const l of lines) {
      const e = out.find((m) => m.sku === l.sku);
      const amt = Number(l.unit_price || 0) * Number(l.qty || 0);
      if (e) {
        e.qty += Number(l.qty || 0);
        e.amount += amt;
      } else {
        out.push({ sku: l.sku, qty: Number(l.qty || 0), amount: amt });
      }
    }
    return out;
  }, [lines]);

  const sizeWord = (sku: string) => {
    const s = lineSize(sku);
    return s === "K" ? "King" : s === "Q" ? "Queen" : s === "S" ? "Single" : null;
  };

  // ── Live preview data — assembled locally so an UN-dispatched order still
  //    previews (the server invoice row may not exist yet). ──
  const pdfData: InvoiceTemplateData = useMemo(() => {
    const goodsLines = hasLineTotal
      ? merged.map((m) => ({
          sku: m.sku,
          description: sizeWord(m.sku) ? `${m.sku} · ${sizeWord(m.sku)}` : m.sku,
          qty: m.qty,
          unit: "pc",
          unit_price: m.qty > 0 ? +(m.amount / m.qty).toFixed(2) : m.amount,
          line_total: +m.amount.toFixed(2),
        }))
      : [
          {
            sku: `SO-${so}`,
            // International style: the item names ride the DESCRIPTION of the
            // one priced line (an invoice line always carries money); the
            // per-piece breakdown belongs to the DO.
            description: merged.length
              ? merged.map((m) => `${m.sku} ×${m.qty}`).join("; ")
              : "Goods total (as keyed)",
            qty: 1,
            unit: "lot",
            unit_price: +orderTotal.toFixed(2),
            line_total: +orderTotal.toFixed(2),
          },
        ];
    const storageLines =
      storageIncurred && storageCharge > 0
        ? [
            {
              sku: "STORAGE",
              description: "Storage fee",
              qty: 1,
              unit: "lot",
              unit_price: +storageCharge.toFixed(2),
              line_total: +storageCharge.toFixed(2),
            },
          ]
        : [];
    return {
      doc_title: imported ? "PAYMENT REQUEST" : undefined,
      invoice_no: imported ? `SO-${so}` : effectiveNo,
      issue_date: (issued?.issued_at ?? new Date().toISOString()).slice(0, 10),
      order_id: orderId,
      order_code: `SO-${so}`,
      customer: {
        name: customerName,
        address: customerAddress ?? "—",
        phone: customerPhone,
      },
      dealer: { name: "Carres", contact: null },
      lines: [...goodsLines, ...storageLines],
      subtotal: +invoiceTotal.toFixed(2),
      tax_amount: 0,
      total: +invoiceTotal.toFixed(2),
      currency: "MYR",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    merged,
    hasLineTotal,
    imported,
    orderTotal,
    storageCharge,
    storageIncurred,
    invoiceTotal,
    effectiveNo,
    issued,
    orderId,
    so,
    customerName,
    customerPhone,
    customerAddress,
  ]);

  // Render the preview whenever the data changes; revoke stale blob URLs.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let url: string | null = null;
    setPreviewErr(null);
    renderInvoicePdf(pdfData)
      .then((blob) => {
        if (!alive) return;
        url = URL.createObjectURL(blob);
        setPreviewUrl(url);
      })
      .catch((e) => {
        if (alive) setPreviewErr((e as Error).message);
      });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [pdfData]);

  /** Issue once (idempotent server-side); every output routes through this. */
  async function ensureIssued(): Promise<string | null> {
    if (!totalSet) {
      toast.error(
        imported
          ? "Key the outstanding first — a statement needs an amount"
          : "Set the goods total first — an invoice needs an amount",
      );
      return null;
    }
    // Imported order: statement only — no INV number is ever minted here.
    if (imported) return `SO-${so}`;
    if (isIssued) return effectiveNo;
    setIssuing(true);
    try {
      const res = await apiFetch<IssueInvoiceResponse>(
        `/api/orders/${orderId}/issue-invoice`,
        { method: "POST", body: JSON.stringify({ amount: invoiceTotal }) },
      );
      setIssued(res);
      // The order row now carries invoice_no — refresh every order surface.
      await qc.invalidateQueries({ queryKey: ["operation", "orders"] });
      toast.success(`Invoice ${res.invoice_no} issued`);
      return res.invoice_no;
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      toast.error(`Couldn't issue invoice — ${msg}`);
      return null;
    } finally {
      setIssuing(false);
    }
  }

  async function outputPdf() {
    const no = await ensureIssued();
    if (!no) return;
    try {
      const blob = await renderInvoicePdf({ ...pdfData, invoice_no: no });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      toast.error(`Invoice PDF failed — ${(e as Error).message}`);
    }
  }

  async function outputWhatsApp() {
    const no = await ensureIssued();
    if (!no) return;
    // Customer-facing tone (§13): friendly, REF-first, never a delivery date.
    const text = [
      `Hi ${salutationOf(null, customerName)},`,
      "",
      `Here is your invoice for order REF: SO-${so}.`,
      "",
      `Invoice: ${no}`,
      `Total: RM ${rmAmount(invoiceTotal)}`,
      ...(balanceDue > 0
        ? [`Outstanding: RM ${rmAmount(balanceDue)}`]
        : ["Fully settled — thank you!"]),
      "",
      "Do let us know if you need anything. Thank you!",
    ].join("\n");
    await navigator.clipboard.writeText(text);
    toast.success("WhatsApp message copied — paste it in the chat");
  }

  async function outputEmail() {
    const no = await ensureIssued();
    if (!no) return;
    const subject = `Invoice ${no} — Carres (SO-${so})`;
    const body = [
      `Hi ${salutationOf(null, customerName)},`,
      "",
      `Please find your invoice details for order SO-${so}:`,
      "",
      `Invoice: ${no}`,
      `Total: RM ${rmAmount(invoiceTotal)}`,
      ...(balanceDue > 0 ? [`Outstanding: RM ${rmAmount(balanceDue)}`] : []),
      "",
      "(Attach the downloaded PDF before sending.)",
      "",
      "Thank you,",
      "Carres",
    ].join("\n");
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-base-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Generate invoice"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[1100px] h-[85vh] bg-white rounded-[12px] border border-base-200 shadow-xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 h-[52px] border-b border-base-200 shrink-0">
          <FileText size={16} className="text-base-500" />
          <span className="text-[13px] font-bold text-base-900">
            {imported ? "Payment request" : "Generate invoice"}
          </span>
          <span className="font-mono text-[12px] text-base-500">
            {imported ? `SO-${so} · statement` : effectiveNo}
            {!imported && !isIssued && " · draft"}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto text-base-500 hover:text-base-900"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body — left charges · right live preview */}
        <div className="flex-1 min-h-0 grid grid-cols-[2fr_3fr]">
          <div className="min-w-0 overflow-y-auto p-4 border-r border-base-200">
            <div className="t4-label mb-1">Charges</div>
            <div className="rounded-[8px] border border-base-200/70 bg-white px-3 divide-y divide-base-100">
              {hasLineTotal ? (
                merged.map((m, i) => (
                  <div
                    key={m.sku}
                    className="flex items-center justify-between gap-3 py-1.5"
                  >
                    <span className="min-w-0 truncate text-[13px] text-base-800">
                      <span className="text-base-400 tabular-nums">{i + 1}. </span>
                      {m.sku}
                      <span className="text-base-400">
                        {" "}
                        {sizeWord(m.sku) ? `· ${sizeWord(m.sku)} ` : ""}×{m.qty}
                      </span>
                    </span>
                    <Money value={m.amount} tone="row" className="text-base-900" />
                  </div>
                ))
              ) : (
                <div className="flex items-center justify-between gap-3 py-1.5">
                  <span className="text-[13px] text-base-800">
                    Goods total <span className="text-base-400">· keyed</span>
                  </span>
                  <Money value={orderTotal} tone="row" className="text-base-900" />
                </div>
              )}
              <div className="flex items-center justify-between gap-3 py-1.5">
                <span className="text-[13px] text-base-800">
                  Storage fee
                  {!storageIncurred && (
                    <span className="text-base-400"> · not accruing</span>
                  )}
                </span>
                <Money
                  value={storageCharge}
                  tone="row"
                  className={storageCharge > 0 ? "text-base-900" : "text-base-400"}
                />
              </div>
              <div className="flex items-center justify-between gap-3 py-2 border-t border-base-200">
                <span className="text-[13px] font-bold text-base-900">Total</span>
                <Money value={invoiceTotal} tone="row" className="text-base-900" />
              </div>
            </div>
            {!totalSet && (
              <div className="mt-2 text-[12px] text-danger">
                No goods total set — close this and key the total in the
                Balance tab first.
              </div>
            )}
            {balanceDue > 0 && totalSet && (
              <div className="mt-2 text-[12px] text-base-500">
                Outstanding after payments:{" "}
                <span className="font-mono font-semibold text-danger">
                  RM {rmAmount(balanceDue)}
                </span>
              </div>
            )}
          </div>

          <div className="min-w-0 bg-base-50 grid place-items-stretch">
            {previewErr ? (
              <div className="place-self-center text-[12px] text-danger px-6 text-center">
                Preview failed — {previewErr}
              </div>
            ) : previewUrl ? (
              <iframe
                title="Invoice preview"
                src={previewUrl}
                className="w-full h-full border-0"
              />
            ) : (
              <div className="place-self-center text-[12px] text-base-400">
                Rendering preview…
              </div>
            )}
          </div>
        </div>

        {/* Footer — issue state + outputs */}
        <div className="flex items-center gap-2 px-4 h-[52px] border-t border-base-200 shrink-0">
          <span className="text-[12px] text-base-500 min-w-0 truncate">
            {imported
              ? "Statement only — the tax invoice for an imported order lives in AutoCount"
              : isIssued
                ? `Issued · ${effectiveNo}`
                : "Not issued yet — the first output issues it and logs to the order history"}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Btn icon={Mail} disabled={issuing} onClick={() => void outputEmail()}>
              Email
            </Btn>
            <Btn
              icon={MessageCircle}
              disabled={issuing}
              onClick={() => void outputWhatsApp()}
            >
              WhatsApp
            </Btn>
            <Btn
              variant="hero"
              icon={FileText}
              disabled={issuing}
              onClick={() => void outputPdf()}
            >
              {imported ? "PDF" : issuing ? "Issuing…" : isIssued ? "Open PDF" : "Issue & PDF"}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

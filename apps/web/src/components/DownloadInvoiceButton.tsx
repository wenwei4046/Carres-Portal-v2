import { useState } from "react";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api";
import { renderInvoicePdf } from "@/lib/pdf/render";
import Select from "@/components/kit/Select";
import type { InvoiceTemplateData } from "@/lib/pdf/types";
import type { Role } from "@carres/shared/domain";

/**
 * 2026-05-13 (Loo) — Sales Invoice PDF reprint button for the operation
 * drawer at dispatched / delivered status.
 *
 * Hits GET /api/orders/:id/invoice-pdf-data which gates to operation /
 * finance / principal / bd. The invoice row + invoice_no are auto-issued
 * by the orders_auto_issue_on_dispatched_trg trigger (migration 0098) when
 * an order's operation_stage transitions to 'dispatched', so this button
 * is safe to surface alongside Print DO at and after that stage.
 *
 * Returns null on denied roles to avoid a click that always 403s.
 *
 * Props:
 *   - orderId: UUID
 *   - so:      integer (filename + toast text)
 *   - role:    current user role; hides on partner / supplier / dealer /
 *              showroom / salesperson (no invoice access for them)
 *   - variant: "primary" / "secondary" — matches Submit / outline styling
 */

// A warehouse is deliberately NOT in ALLOWED: an invoice is money, and a
// warehouse never sees money.
const ALLOWED: ReadonlySet<Role> = new Set([
  "operation",
  "finance",
  "principal",
  "bd",
]);

/* YH 2026-10-26: an order on more than one live Sales Invoice (0712 part
   invoices) asks which one to print, in this same control. One invoice: as before. */
export const PRINT_INVOICE_COPY = {
  pick: "Sales Invoice to print",
  placeholder: "Pick a Sales Invoice",
  option: (no: string, lines: ReadonlyArray<{ sku: string; qty: number }>) =>
    lines.length ? `${no} · ${lines.map((l) => `${l.qty} × ${l.sku}`).join(", ")}` : no,
  opened: (no: string) => `Invoice ${no} opened`,
} as const;

type LiveInvoice = { invoice_no: string; lines: Array<{ sku: string; qty: number }> };

interface Props {
  orderId: string;
  so: number;
  role: Role;
  variant?: "primary" | "secondary" | "menuitem";
  className?: string;
}

export default function DownloadInvoiceButton({
  orderId,
  so,
  role,
  variant = "secondary",
  className,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [choices, setChoices] = useState<LiveInvoice[] | null>(null);

  if (!ALLOWED.has(role)) return null;

  async function openPdf(invoiceNo?: string) {
    const data = await apiFetch<InvoiceTemplateData>(
      `/api/orders/${orderId}/invoice-pdf-data${invoiceNo ? `?invoice=${encodeURIComponent(invoiceNo)}` : ""}`,
    );
    const blob = await renderInvoicePdf(data);
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    toast.success(invoiceNo ? PRINT_INVOICE_COPY.opened(invoiceNo) : `Invoice INV-${String(so).padStart(6, "0")} opened`);
  }

  async function run(work: () => Promise<void>) {
    setBusy(true);
    try {
      await work();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      toast.error(`Invoice PDF failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  const onClick = () =>
    run(async () => {
      const live = await apiFetch<LiveInvoice[]>(`/api/orders/${orderId}/sales-invoices`);
      if (live.length > 1) setChoices(live);
      else await openPdf();
    });

  const picker = choices ? (
    <div className="px-3 py-2">
      <Select
        id={`print-invoice-${so}`}
        label={PRINT_INVOICE_COPY.pick}
        placeholder={PRINT_INVOICE_COPY.placeholder}
        disabled={busy}
        onValueChange={(no) => void run(() => openPdf(no))}
        options={choices.map((i) => ({ value: i.invoice_no, label: PRINT_INVOICE_COPY.option(i.invoice_no, i.lines) }))}
      />
    </div>
  ) : null;

  // Google-Sheets-style menu row (uniform with the other ⋮ actions).
  if (variant === "menuitem") {
    return (
      <>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-body hover:bg-base-50 disabled:opacity-40 text-base-900"
        data-testid={`download-invoice-${so}`}
      >
        <span className="text-base-500 shrink-0">
          <FileText className="w-4 h-4" />
        </span>
        {busy ? "Opening…" : "Invoice PDF"}
      </button>
      {picker}
      </>
    );
  }

  const baseCls =
    variant === "primary"
      ? "bg-primary text-primary-foreground font-semibold"
      : "border border-border text-foreground bg-card font-medium hover:border-primary";

  return (
    <>
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`px-3.5 py-2 rounded-md text-body disabled:opacity-50 transition-colors ${baseCls} ${className ?? ""}`}
      data-testid={`download-invoice-${so}`}
    >
      {busy ? "Opening…" : "Print Invoice"}
    </button>
    {picker}
    </>
  );
}

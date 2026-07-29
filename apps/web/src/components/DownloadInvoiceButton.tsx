import { useState } from "react";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api";
import { renderInvoicePdf } from "@/lib/pdf/render";
import type { InvoiceTemplateData } from "@/lib/pdf/types";

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

type Role =
  | "dealer"
  | "showroom"
  | "salesperson"
  | "operation"
  | "finance"
  | "partner"
  | "supplier"
  | "principal"
  | "bd"
  | "hr"
  // R6 — present so the two Role unions stay assignable; deliberately NOT in
  // ALLOWED below. An invoice is money, and a warehouse never sees money.
  | "warehouse";

const ALLOWED: ReadonlySet<Role> = new Set([
  "operation",
  "finance",
  "principal",
  "bd",
]);

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

  if (!ALLOWED.has(role)) return null;

  async function onClick() {
    setBusy(true);
    try {
      const data = await apiFetch<InvoiceTemplateData>(
        `/api/orders/${orderId}/invoice-pdf-data`,
      );
      const blob = await renderInvoicePdf(data);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success(`Invoice INV-${String(so).padStart(6, "0")} opened`);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      toast.error(`Invoice PDF failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  // Google-Sheets-style menu row (uniform with the other ⋮ actions).
  if (variant === "menuitem") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-meta hover:bg-base-50 disabled:opacity-40 text-base-900"
        data-testid={`download-invoice-${so}`}
      >
        <span className="text-base-500 shrink-0">
          <FileText className="w-4 h-4" />
        </span>
        {busy ? "Opening…" : "Invoice PDF"}
      </button>
    );
  }

  const baseCls =
    variant === "primary"
      ? "bg-primary text-primary-foreground font-semibold"
      : "border border-border text-foreground bg-card hover:border-primary";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`px-3.5 py-2 rounded-md text-meta disabled:opacity-50 transition-colors ${baseCls} ${className ?? ""}`}
      data-testid={`download-invoice-${so}`}
    >
      {busy ? "Opening…" : "Print Invoice"}
    </button>
  );
}

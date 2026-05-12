import { useState } from "react";
import { toast } from "sonner";
import { apiFetchBlob, ApiError } from "@/lib/api";

/**
 * 2026-05-12 (Loo) — Customer-facing Sales Order PDF download button.
 *
 * Hits GET /api/orders/:id/sales-order-pdf which is gated server-side to
 * dealer / showroom / salesperson / finance / principal / bd (logistics /
 * partner / supplier are 403'd). RLS narrows to orders the caller can
 * read regardless. apiFetchBlob → ObjectURL → window.open opens the PDF
 * in a new tab so the customer can preview / print without leaving the
 * portal.
 *
 * Renders nothing if the caller is on a denied role to avoid a click
 * that always 403s. The deny list mirrors apps/api/src/routes/orders.ts
 * `/:id/sales-order-pdf` route gate.
 *
 * Props:
 *   - orderId: UUID
 *   - dl:      integer (only used for the filename + toast)
 *   - role:    current user role; button hides on logistics/partner/supplier
 *   - variant: "primary" matches the Submit-class buttons (filled
 *              terracotta), "secondary" matches the outline-class
 *              buttons (default; less visual weight inside detail drawers)
 *   - className: optional extra Tailwind classes for layout tweaks
 */

type Role =
  | "dealer"
  | "showroom"
  | "salesperson"
  | "logistics"
  | "finance"
  | "partner"
  | "supplier"
  | "principal"
  | "bd";

// Loo 2026-05-12 ~20:00 — logistics dropped from the deny list (they
// surface this on their own drawer when handing over a delivery). Partner
// has POD and Supplier has PO, so the SO doc stays off their UIs.
const DENIED: ReadonlySet<Role> = new Set(["partner", "supplier"]);

interface Props {
  orderId: string;
  dl: number;
  role: Role;
  variant?: "primary" | "secondary";
  className?: string;
}

export default function DownloadSalesOrderButton({
  orderId,
  dl,
  role,
  variant = "secondary",
  className,
}: Props) {
  const [busy, setBusy] = useState(false);

  if (DENIED.has(role)) return null;

  async function onClick() {
    setBusy(true);
    try {
      const blob = await apiFetchBlob(`/api/orders/${orderId}/sales-order-pdf`);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success(`Sales Order SO-${String(dl).padStart(6, "0")} opened`);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      toast.error(`Sales Order PDF failed: ${msg}`);
    } finally {
      setBusy(false);
    }
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
      className={`px-3.5 py-2 rounded-md text-[12.5px] disabled:opacity-50 transition-colors ${baseCls} ${className ?? ""}`}
      data-testid={`download-sales-order-${dl}`}
    >
      {busy ? "Opening…" : "Download Sales Order PDF"}
    </button>
  );
}

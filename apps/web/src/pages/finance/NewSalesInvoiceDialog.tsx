/**
 * NEW SALES INVOICE — office staff open a Sales Invoice by hand.
 *
 * Weisiang's decision (Mr Lim, WhatsApp 2026-10-22, relayed by YH 2026-10-23),
 * the Houzs way (`SalesInvoiceFromDo.tsx`) rebuilt in the Carres kit. It
 * overturns Jess's rules in payment/MASTER.md (no manual `Generate invoice`;
 * one live Sales Invoice per order); Jess was not part of this decision.
 * Follows Houzs frontend/src/pages/scm-v2/SalesInvoiceFromDo.tsx:7-12 (pick lines,
 * qty 1..remaining) per Weisiang's ruling (2026-10-22): clear Carres rules,
 * implement Houzs.
 *
 * Find by SO No or DO No. A DO ticks the goods it carries; an SO ticks every
 * line. Each line can be invoiced in parts until nothing is left (0712 keeps
 * the count). Create issues through the ONE numbering and posting authority.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  officeInvoicePicks,
  officeInvoicePrefill,
  officeInvoiceTotalSen,
  type OfficeInvoiceAddon,
  type OfficeInvoiceLine,
  type OfficeInvoicePick,
} from "@carres/shared/office-sales-invoice";
import Modal from "@/components/kit/Modal";
import Button from "@/components/kit/Button";
import Input from "@/components/kit/Input";
import Checkbox from "@/components/kit/Checkbox";
import { ApiError, apiFetch } from "@/lib/api";
import { rm } from "@/lib/format-currency";

export const NSI_COPY = {
  newSi: "New Sales Invoice",
  help: "Pick a Sales Order or Delivery Order and the goods to invoice. You can invoice part now and the rest later.",
  ref: "SO No or DO No",
  find: "Find",
  notFound: "No Sales Order or Delivery Order has that number.",
  qty: "Qty",
  left: (n: number) => `${n} left to invoice`,
  nothingLeft: "Everything on this Sales Order is already invoiced.",
  wholeInvoice: (no: string) => `This Sales Order is already on Sales Invoice ${no}.`,
  cancelled: "This Sales Order is cancelled.",
  addons: "Delivery and other charges go on this invoice.",
  total: (amount: string) => `Invoice total ${amount}`,
  cancel: "Cancel",
  create: "Create Sales Invoice",
  created: (no: string) => `${no} created`,
} as const;

type Offer = {
  order: { id: string; so: number; customer_name: string | null; cancelled: boolean };
  whole_invoice_no: string | null;
  addons_pending: boolean;
  addons: OfficeInvoiceAddon[];
  lines: OfficeInvoiceLine[];
  delivery_order: { do_number: string; groups: string[] | null } | null;
};

const errorOf = (e: unknown) => (e instanceof ApiError ? e.message || NSI_COPY.notFound : String(e));

export default function NewSalesInvoiceDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [ref, setRef] = useState("");
  const [found, setFound] = useState<Offer | null>(null);
  const [picks, setPicks] = useState<Record<string, OfficeInvoicePick>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = (next: boolean) => {
    setOpen(next);
    setRef("");
    setFound(null);
    setPicks({});
    setError(null);
  };

  const find = async () => {
    setBusy(true);
    setError(null);
    setFound(null);
    try {
      const offer = await apiFetch<Offer>(`/api/finance/invoices/office-offer/${encodeURIComponent(ref.trim())}`);
      setFound(offer);
      setPicks(officeInvoicePrefill(offer.lines, offer.delivery_order ? offer.delivery_order.groups : undefined));
    } catch (e) {
      setError(errorOf(e));
    } finally {
      setBusy(false);
    }
  };

  const lines = found?.lines ?? [];
  const send = found ? officeInvoicePicks(lines, picks) : null;
  const blocked = !found || found.order.cancelled || found.whole_invoice_no !== null;

  const create = async () => {
    if (!found || !send) return;
    setBusy(true);
    setError(null);
    try {
      const { invoiceNo } = await apiFetch<{ invoiceNo: string }>("/api/finance/invoices/office", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: found.order.id, lines: send }),
      });
      toast.success(NSI_COPY.created(invoiceNo));
      await qc.invalidateQueries({ queryKey: ["finance"] });
      reset(false);
    } catch (e) {
      setError(errorOf(e));
    } finally {
      setBusy(false);
    }
  };

  const setPick = (id: string, next: Partial<OfficeInvoicePick>) =>
    setPicks((cur) => ({ ...cur, [id]: { ...(cur[id] ?? { picked: false, qty: 0 }), ...next } }));
  // Found by SO: shows every live SO line like Houzs SalesInvoiceNew.tsx:261-263
  // (Weisiang's ruling 2026-10-22), but fills what is left: YH Q15 option C
  // (2026-10-26), so a part-invoiced SO needs no edits. A line with 0 left shows
  // unticked and cannot be ticked. Found by DO: only lines with something left.
  const open_ = lines.filter((l) => l.left > 0);
  const shown = found?.delivery_order ? open_ : lines;

  return (
    <>
      <Button variant="primary" size="sm" icon="add" onClick={() => reset(true)}>
        {NSI_COPY.newSi}
      </Button>
      <Modal
        open={open}
        onOpenChange={reset}
        title={NSI_COPY.newSi}
        description={NSI_COPY.help}
        width="wide"
        footer={
          <>
            <Button variant="neutral" onClick={() => reset(false)}>
              {NSI_COPY.cancel}
            </Button>
            <Button variant="primary" disabled={blocked || !send || busy} loading={busy && !!found} onClick={create}>
              {NSI_COPY.create}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (ref.trim()) void find();
            }}
          >
            <Input id="new-si-ref" label={NSI_COPY.ref} value={ref} onChange={(e) => setRef(e.target.value)} autoFocus />
            <Button type="submit" variant="neutral" disabled={!ref.trim() || busy}>
              {NSI_COPY.find}
            </Button>
          </form>
          {error ? (
            <p role="alert" className="text-kit-red-11">
              {error}
            </p>
          ) : null}
          {found ? (
            <div className="flex flex-col gap-3">
              <p className="text-kit-slate-12">
                {`SO-${found.order.so}`}
                {found.delivery_order ? ` · ${found.delivery_order.do_number}` : ""}
                {found.order.customer_name ? ` · ${found.order.customer_name}` : ""}
              </p>
              {found.order.cancelled ? (
                <p className="text-kit-slate-11">{NSI_COPY.cancelled}</p>
              ) : found.whole_invoice_no !== null ? (
                <p className="text-kit-slate-11">{NSI_COPY.wholeInvoice(found.whole_invoice_no)}</p>
              ) : open_.length === 0 ? (
                <p className="text-kit-slate-11">{NSI_COPY.nothingLeft}</p>
              ) : (
                <>
                  {shown.map((l) => {
                    const p = picks[l.order_line_id] ?? { picked: false, qty: 0 };
                    return (
                      <div key={l.order_line_id} className="flex items-end gap-3">
                        <Checkbox
                          id={`new-si-line-${l.order_line_id}`}
                          label={`${l.sku} · ${rm(l.unit_price)} · ${NSI_COPY.left(l.left)}`}
                          checked={p.picked}
                          disabled={l.left <= 0}
                          onCheckedChange={(on) => setPick(l.order_line_id, { picked: on === true })}
                        />
                        <Input
                          id={`new-si-qty-${l.order_line_id}`}
                          label={NSI_COPY.qty}
                          type="number"
                          min={1}
                          max={l.left}
                          value={String(p.qty)}
                          disabled={!p.picked || l.left <= 0}
                          onChange={(e) => setPick(l.order_line_id, { qty: Number(e.target.value) })}
                        />
                      </div>
                    );
                  })}
                  {found.addons_pending && found.addons.length > 0 ? (
                    <p className="text-kit-slate-11">{NSI_COPY.addons}</p>
                  ) : null}
                  <p className="text-kit-slate-12">
                    {NSI_COPY.total(rm(officeInvoiceTotalSen(lines, picks, found.addons, found.addons_pending) / 100))}
                  </p>
                </>
              )}
            </div>
          ) : null}
        </div>
      </Modal>
    </>
  );
}

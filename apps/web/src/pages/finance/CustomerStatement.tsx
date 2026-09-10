import { useQuery } from "@tanstack/react-query";
import { SectionCard } from "@/components/SectionPanel";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";

/**
 * Customer statement — §11's one read-only surface.
 *
 * §11, verbatim: "One read-only customer statement derives invoices,
 * allocations, payments, voids and amount needed."
 *
 * DERIVES, and READ-ONLY. Every figure here comes from the server's one
 * arithmetic; nothing on this page adds anything up, and nothing on it can be
 * pressed. It spans the CUSTOMER, not the invoice you arrived from — one
 * customer holding several SOs is normal here, and a statement showing one of
 * them is not a statement.
 *
 * An order whose price nobody recorded says so. It never prints a confident
 * RM 0, because "we do not know" and "nothing is owed" are different answers
 * and only one of them is safe to show a customer.
 */
interface StatementOrder {
  order_id: string;
  so: number | null;
  known: boolean;
  still_needed: number | null;
  storage_owing: number;
  overpaid: number;
  invoices: Array<{
    id: string; invoice_no: string | null; kind: string; status: string;
    amount: number; tax_amount: number; issued_at: string | null;
    voided_at: string | null; void_reason: string | null;
  }>;
  payments: Array<{
    id: string; receipt_no: string | null; amount: number; paid_on: string;
    method: string | null; reference: string | null; voided_at: string | null;
  }>;
}
interface Statement {
  customer: { name: string | null; phone: string | null };
  matched_on: "phone" | "name" | "order";
  orders: StatementOrder[];
  allocations: Array<{
    id: string; payment_id: string; order_id: string; invoice_id: string | null;
    amount: number; allocated_at: string; voided_at: string | null;
  }>;
}

const KIND_WORD: Record<string, string> = {
  sales: "Invoice",
  storage: "Storage Invoice",
  additional_storage: "Additional Storage Invoice",
};

export default function CustomerStatement({ orderId, onClose }: {
  orderId: string;
  onClose: () => void;
}) {
  const query = useQuery<Statement>({
    queryKey: ["finance", "customer-statement", orderId],
    queryFn: () => apiFetch(`/api/finance/invoices/statement/${orderId}`),
    staleTime: 30_000,
  });

  if (query.isError) {
    return <div className="flex-1 overflow-auto p-4" role="alert">
      <SectionCard><div className="p-4 text-body">
        <p>The statement could not be loaded. Try again.</p>
        <button className="btn-secondary mt-3" onClick={() => void query.refetch()}>Try again</button>
        <button className="btn-secondary mt-3 ml-2" onClick={onClose}>Back</button>
      </div></SectionCard>
    </div>;
  }
  if (!query.data) {
    return <div className="flex-1 overflow-auto p-4">
      <SectionCard><div className="p-4 text-body">
        <p>Loading statement…</p>
      </div></SectionCard>
    </div>;
  }

  const s = query.data;
  const liveAllocations = s.allocations.filter((a) => a.voided_at == null);

  return <div className="flex-1 overflow-auto p-4" data-testid="customer-statement">
    <div className="flex flex-col gap-4">
      <SectionCard><div className="p-4 text-body">
        <h2 className="text-strong mb-2">Statement</h2>
        <p>{s.customer.name ?? "Customer name not recorded"}</p>
        <p>{s.customer.phone ?? "Phone not recorded"}</p>
        <p className="text-label font-normal">
          {s.matched_on === "phone" ? "Every Sales Order with this phone number."
            : s.matched_on === "name" ? "Every Sales Order under this name — no phone number is recorded."
            : "This Sales Order only — neither a phone number nor a name is recorded."}
        </p>
        <button className="btn-secondary mt-3" onClick={onClose}>Back</button>
      </div></SectionCard>

      {s.orders.map((o) => <SectionCard key={o.order_id}><div className="p-4 text-body">
        <h2 className="text-strong mb-2">{o.so != null ? `SO-${o.so}` : "SO not available"}</h2>
        <p className="font-semibold">
          {o.known
            ? `Amount still needed: ${rm(o.still_needed ?? 0)}`
            : "Amount still needed: value not recorded"}
        </p>
        {o.storage_owing > 0 && <p>Storage in that figure: {rm(o.storage_owing)}</p>}
        {o.overpaid > 0 && <p>Money needing review: {rm(o.overpaid)}</p>}

        <h3 className="text-strong mt-3">Invoices</h3>
        {o.invoices.length === 0 ? <p>No invoice yet.</p> : o.invoices.map((i) => <p key={i.id}>
          {i.invoice_no ?? "Draft"} · {KIND_WORD[i.kind] ?? i.kind} · {rm(Number(i.amount) + Number(i.tax_amount))}
          {i.issued_at ? ` · ${fmtDate(i.issued_at)}` : ""}
          {i.voided_at ? ` · VOIDED · ${i.void_reason ?? "Reason not recorded"}` : ""}
        </p>)}

        <h3 className="text-strong mt-3">Payments</h3>
        {o.payments.length === 0 ? <p>No payment yet.</p> : o.payments.map((p) => <p key={p.id}>
          {p.receipt_no ?? "Receipt number missing"} · {rm(p.amount)} · {fmtDate(p.paid_on)}
          {p.reference ? ` · ${p.reference}` : ""}
          {p.voided_at ? " · VOIDED" : ""}
        </p>)}
      </div></SectionCard>)}

      <SectionCard><div className="p-4 text-body">
        <h2 className="text-strong mb-2">Where each payment sits</h2>
        {liveAllocations.length === 0 ? <p>No money is allocated yet.</p>
          : liveAllocations.map((a) => {
            const on = s.orders.find((o) => o.order_id === a.order_id);
            return <p key={a.id}>
              {rm(a.amount)} · {on?.so != null ? `SO-${on.so}` : "Sales Order"} · {fmtDate(a.allocated_at)}
            </p>;
          })}
      </div></SectionCard>
    </div>
  </div>;
}

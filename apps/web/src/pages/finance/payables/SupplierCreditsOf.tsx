import { Link } from "react-router-dom";
import { fmtDate } from "@/lib/fmt-date";
import { useSupplierCreditNotes } from "@/lib/payables-queries";
import { money, num } from "./payables-words";

/**
 * The confirmed credit notes of one supplier that still have credit left to
 * knock off (0642 `supplier_credit_note_register`), and how much. Under the
 * supplier on Unpaid by Supplier, beside its advances. Read only: knocking a
 * credit note off a bill is done from the credit note.
 */
export default function SupplierCreditsOf({ supplierId }: { supplierId: string }) {
  const notes = useSupplierCreditNotes();
  if (notes.isError) return <p role="alert" className="mt-3">The credit notes could not be loaded. Try again.</p>;
  const open = (notes.data ?? []).filter((n) => n.supplier_id === supplierId && n.status === "confirmed" && (num(n.credit_open) ?? 0) > 0);
  if (open.length === 0) return null;
  return (
    <div className="mt-3" data-testid={`ap-outstanding-credits-${supplierId}`}>
      <p className="text-strong">Credit notes</p>
      {open.map((n) => (
        <p key={n.id}>
          <Link className="text-kit-blue-11 underline underline-offset-2" to={`/finance/credit-notes/${n.id}`}>{n.note_no}</Link>
          {" · "}{fmtDate(n.note_date)} · {money(n.credit_open)} left of {money(n.total_amount)}
        </p>
      ))}
    </div>
  );
}

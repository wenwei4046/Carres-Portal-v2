import { Link } from "react-router-dom";
import { fmtDate } from "@/lib/fmt-date";
import { useSupplierAdvances } from "@/lib/payables-queries";
import { money } from "./payables-words";

/**
 * Every approved advance paid to one supplier (0485 `supplier_advances`), and
 * what is left of each: an advance with RM 0.00 left is fully applied or sent
 * back. Shown under the supplier on Unpaid by Supplier. Read only: applying an
 * advance is done from the bill.
 */
export default function SupplierAdvancesOf({ supplierId }: { supplierId: string }) {
  const advances = useSupplierAdvances(supplierId);
  if (advances.isError) return <p role="alert" className="mt-3">The advances could not be loaded. Try again.</p>;
  if (!advances.isSuccess || advances.data.length === 0) return null;
  return (
    <div className="mt-3" data-testid={`ap-outstanding-advances-${supplierId}`}>
      <p className="text-strong">Advances</p>
      {advances.data.map((a) => (
        <p key={a.voucher_id}>
          <Link className="text-kit-blue-11 underline underline-offset-2" to={`/finance/payment-vouchers/${a.voucher_id}`}>{a.voucher_no}</Link>
          {" · "}{fmtDate(a.voucher_date)} · {money(a.advance_open)} left of {money(a.advance_amount)}
        </p>
      ))}
    </div>
  );
}

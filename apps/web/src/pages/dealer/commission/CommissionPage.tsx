import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Clock, Wallet } from "lucide-react";
import {
  dealerCommissionOrders,
  dealerStatement,
  statementAsSource,
  type DcOrderMonth,
  type DcStatementLine,
  type DcStatementSource,
} from "@carres/shared/dealer-commission";
import { useQuery } from "@tanstack/react-query";
import DataTable, { type Column } from "@/components/kit/DataTable";
import { apiFetch } from "@/lib/api";
import { fmtDate, fmtMonth } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import {
  customerWord,
  noteWord,
  soWord,
  statementLineKey,
  statementLineWord,
} from "@/pages/finance/reports/commission-words";

/**
 * The store's own commission (dealer commission step 3, 0664; Chew
 * 2026-10-05, D3: 「dealer 要能看自己的statement」). Chew's page (Dealer:
 * statements, since 2026-10-07): the POS only hosts it, behind the store
 * owner's `Commission` top-bar pill, as the same full-screen overlay as
 * Staff & PINs and My orders.
 *
 * One read, GET /api/dealer-commission/statement: the database gives a dealer
 * login its own dealer only. Every figure is the shared `dealerStatement` and
 * `dealerCommissionOrders` (Law D), the arithmetic Finance's Statement view
 * draws, so the store and Carres read the same numbers.
 *
 * Read only: what Carres owes the store now, the commission still to come,
 * the statement month by month, and the orders of the month picked on it.
 * PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), dealer commission step 3).
 */
type OrderRow = DcOrderMonth & { dealer: string };

const STATEMENT_COLUMNS: readonly Column<DcStatementLine>[] = [
  { key: "day", label: "Date", width: "120px", cell: (l) => fmtDate(l.day) },
  { key: "what", label: "Description", width: "250px", cell: statementLineWord },
  { key: "due", label: "Due", width: "120px", cell: (l) => (l.due ? fmtDate(l.due) : "") },
  { key: "owed", label: "Commission", width: "130px", align: "right", numeric: true,
    cell: (l) => (l.kind === "payment" ? "" : rm(l.owed)) },
  { key: "paid", label: "Paid", width: "130px", align: "right", numeric: true,
    cell: (l) => (l.kind === "payment" ? rm(l.paid) : "") },
  { key: "balance", label: "Balance", width: "130px", align: "right", numeric: true, cell: (l) => rm(l.balance) },
];

const ORDER_COLUMNS: readonly Column<OrderRow>[] = [
  { key: "so", label: "SO", width: "100px", cell: (r) => soWord(r.order) },
  { key: "customer", label: "Customer", width: "200px", cell: (r) => (
    <span className="block truncate" title={customerWord(r.order)}>{customerWord(r.order)}</span>
  ) },
  { key: "total", label: "Order total", width: "130px", align: "right", numeric: true, cell: (r) => rm(r.terms.total) },
  { key: "earned", label: "Commission this month", width: "180px", align: "right", numeric: true, cell: (r) => rm(r.earned) },
  { key: "still", label: "Still to earn", width: "130px", align: "right", numeric: true, cell: (r) => rm(r.stillToEarn) },
  { key: "note", label: "Note", width: "190px", cell: noteWord },
];

export default function CommissionPage({ onClose }: { onClose: () => void }) {
  const query = useQuery({
    queryKey: ["dealer", "commission-statement"],
    queryFn: () => apiFetch<DcStatementSource>("/api/dealer-commission/statement"),
  });
  const src = query.data;
  const statement = useMemo(() => (src ? dealerStatement(src) : null), [src]);
  const [picked, setPicked] = useState<string | null>(null);
  const month = picked ?? src?.today.slice(0, 7) ?? null;
  const orders = useMemo<OrderRow[]>(
    () => (src && month ? dealerCommissionOrders(statementAsSource(src), month) : []),
    [src, month],
  );

  return createPortal(
    <div
      className="pos-proto"
      style={{ position: "fixed", inset: 0, zIndex: 50, background: "var(--pos-bg)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Commission"
      data-testid="pos-commission"
    >
      <div className="os-page">
        <div className="os-head">
          <div className="os-head__left">
            <button className="icon-btn" onClick={onClose} aria-label="Back" data-testid="pos-commission-back">
              <ArrowLeft size={16} strokeWidth={1.75} />
            </button>
            <div>
              <div className="os-head__eyebrow">{statement?.dealer.name ?? "Store"}</div>
              <h1 className="os-head__title">Commission</h1>
            </div>
          </div>
        </div>

        {query.isError ? (
          <div style={{ padding: "6px 32px", display: "flex", alignItems: "center", gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13 }}>Your commission could not be opened.</p>
            <button type="button" className="btn btn--ghost" onClick={() => void query.refetch()}>
              Try again
            </button>
          </div>
        ) : !statement || !month ? (
          <p style={{ padding: "6px 32px", fontSize: 13, color: "var(--fg-muted)" }}>Loading</p>
        ) : (
          <>
            <div className="os-summary">
              <div className="os-sumcard" data-testid="pos-commission-owed">
                <div className="os-sumcard__eyebrow">
                  <Wallet size={13} strokeWidth={1.75} />
                  Owed to you now
                </div>
                <div className="os-sumcard__total">{rm(statement.owedNow)}</div>
                <div className="os-sumcard__rows">
                  {statement.nextDue && (
                    <div className="os-sumrow os-sumrow--lead">
                      <span>Due {fmtDate(statement.nextDue.day)}</span>
                      <span className="os-sumrow__val">{rm(statement.nextDue.amount)}</span>
                    </div>
                  )}
                  <div className="os-sumrow">
                    <span>Each month&apos;s commission is paid on the 15th of the month after.</span>
                  </div>
                </div>
              </div>
              <div className="os-sumcard os-sumcard--muted" data-testid="pos-commission-to-come">
                <div className="os-sumcard__eyebrow">
                  <Clock size={13} strokeWidth={1.75} />
                  Commission still to come
                </div>
                <div className="os-sumcard__total">{rm(statement.stillToCome)}</div>
                <div className="os-sumcard__rows">
                  <div className="os-sumrow">
                    <span>Earned as your customers pay. Nothing is earned before half the order is paid.</span>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ padding: "12px 32px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
              <section className="os-section">
                <h4 className="os-section__title">
                  Statement <span>Pick a month to see its orders</span>
                </h4>
                <DataTable
                  label="Commission statement"
                  testId="pos-commission-statement"
                  rows={statement.lines}
                  columns={STATEMENT_COLUMNS}
                  rowId={statementLineKey}
                  sizing="content"
                  onRowOpen={(l) => l.month && setPicked(l.month)}
                  empty="No commission yet."
                />
              </section>
              <section className="os-section">
                <h4 className="os-section__title">
                  Orders · {fmtMonth(month)} <span>{orders.length} {orders.length === 1 ? "order" : "orders"}</span>
                </h4>
                <DataTable
                  label={`Orders ${fmtMonth(month)}`}
                  testId="pos-commission-orders"
                  rows={orders}
                  columns={ORDER_COLUMNS}
                  rowId={(r) => r.order.orderId}
                  sizing="content"
                  empty={`No order in ${fmtMonth(month)}.`}
                />
              </section>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

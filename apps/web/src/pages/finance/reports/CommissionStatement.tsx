/**
 * Reports → Dealer commission → Statement (dealer commission step 3, 0664;
 * Chew 2026-10-05, D3: 「我欠他多少，几时付他这样。实时update 的」).
 *
 * A dealer's statement like a supplier's: each month's commission (and its
 * renovation rebate) as Carres comes to owe it, falling due on the 15th of
 * the month after, and each payment made to the dealer, with the running
 * balance — live, worked by the shared `dealerStatement` (Law D). The footer
 * says what Carres owes the dealer now and the commission still to come on
 * orders whose balance is not in yet.
 *
 * A payment is a paid direct payment voucher that Finance counts as a payment
 * to this dealer (`Add a payment`); its row takes it off again. A month's row
 * opens that month's orders (By order).
 */
import { useMemo, useState } from "react";
import {
  dealerStatement,
  type DcPaymentChoice,
  type DcStatementLine,
  type DcStatementSource,
} from "@carres/shared/dealer-commission";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Button from "@/components/kit/Button";
import EmptyState from "@/components/kit/EmptyState";
import Modal from "@/components/kit/Modal";
import Select from "@/components/kit/Select";
import { FieldError } from "@/components/kit/FieldFrame";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import { LoadFailed } from "../other-money-in/parts";
import { statementLineKey, statementLineWord } from "./commission-words";

const BASE = "/api/finance/dealer-commission";

export default function CommissionStatement({
  dealerId,
  toolbarStart,
  onOpenMonth,
}: {
  dealerId: string | null;
  toolbarStart: React.ReactNode;
  /** A month's row opens that month's orders for this dealer. */
  onOpenMonth: (month: string) => void;
}) {
  const query = useQuery({
    queryKey: ["finance", "dealer-commission", "statement", dealerId],
    queryFn: () => apiFetch<DcStatementSource>(`${BASE}/statement/${dealerId}`),
    enabled: !!dealerId,
  });
  const statement = useMemo(() => (query.data ? dealerStatement(query.data) : null), [query.data]);
  const [adding, setAdding] = useState(false);
  const [payment, setPayment] = useState<DcStatementLine | null>(null);
  const lines = statement?.lines ?? [];

  const columns = useMemo<DataGridColumn<DcStatementLine>[]>(() => [
    { key: "day", label: "Date", width: 130, sortable: false, accessor: (l) => fmtDate(l.day), exportValue: (l) => l.day },
    { key: "what", label: "Description", width: 300, sortable: false, accessor: statementLineWord, searchValue: statementLineWord },
    { key: "due", label: "Due", width: 130, sortable: false, filterable: false, accessor: (l) => (l.due ? fmtDate(l.due) : ""), exportValue: (l) => l.due ?? "" },
    { key: "owed", label: "Commission", width: 150, align: "right", sortable: false, filterable: false,
      accessor: (l) => (l.kind === "payment" ? "" : rm(l.owed)), exportValue: (l) => (l.kind === "payment" ? "" : l.owed),
      footerTotal: (ls) => rm(ls.reduce((s, l) => s + l.owed, 0)) },
    { key: "paid", label: "Paid", width: 150, align: "right", sortable: false, filterable: false,
      accessor: (l) => (l.kind === "payment" ? rm(l.paid) : ""), exportValue: (l) => (l.kind === "payment" ? l.paid : ""),
      footerTotal: (ls) => rm(ls.reduce((s, l) => s + l.paid, 0)) },
    { key: "balance", label: "Balance", width: 150, align: "right", sortable: false, filterable: false,
      accessor: (l) => rm(l.balance), exportValue: (l) => l.balance },
  ], []);

  if (!dealerId) {
    return (
      <ListPageShell register toolbar={toolbarStart}>
        {/* PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), dealer commission step 3). */}
        <EmptyState icon="money" title="Choose a dealer" detail="Its statement shows what Carres owes it and what was paid." />
      </ListPageShell>
    );
  }
  if (query.isError) return <LoadFailed what="The statement" onRetry={() => void query.refetch()} />;
  return (
    <ListPageShell register>
      <DataGrid
        rows={lines}
        columns={columns}
        rowKey={statementLineKey}
        storageKey="carres.finance.dealer-commission-statement.v1"
        appearance="reference"
        exportName={`Commission statement ${statement?.dealer.name ?? ""}`.trim()}
        groupBanner={false}
        allowColumnGrouping={false}
        isLoading={!query.isSuccess}
        wrapToolbar
        toolbarStart={toolbarStart}
        toolbarEnd={
          // PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), dealer commission step 3).
          <Button variant="neutral" onClick={() => setAdding(true)} disabled={!query.isSuccess}>
            Add a payment
          </Button>
        }
        onRowClick={(l) => (l.kind === "payment" ? setPayment(l) : l.month && onOpenMonth(l.month))}
        statusSummary={() => (
          <span data-testid="commission-statement-summary">
            {statement
              ? `Owed to ${statement.dealer.name} now ${rm(statement.owedNow)}${
                  statement.nextDue ? ` · Due ${fmtDate(statement.nextDue.day)} ${rm(statement.nextDue.amount)}` : ""
                } · Commission still to come ${rm(statement.stillToCome)}`
              : "Loading"}
          </span>
        )}
      />
      {adding && statement && <AddPaymentModal dealer={statement.dealer} onClose={() => setAdding(false)} />}
      {payment && <PaymentWindow key={payment.paymentId ?? ""} line={payment} onClose={() => setPayment(null)} />}
    </ListPageShell>
  );
}

function usePaymentMutation<T>(fn: (v: T) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance", "dealer-commission"] }),
  });
}

function AddPaymentModal({ dealer, onClose }: { dealer: { id: string; name: string }; onClose: () => void }) {
  const choices = useQuery({
    queryKey: ["finance", "dealer-commission", "payment-choices"],
    queryFn: () => apiFetch<DcPaymentChoice[]>(`${BASE}/payment-choices`),
  });
  const [voucherId, setVoucherId] = useState<string | undefined>(undefined);
  const [refusal, setRefusal] = useState<string | null>(null);
  const save = usePaymentMutation((id: string) =>
    apiFetch(`${BASE}/payments`, { method: "POST", body: JSON.stringify({ voucherId: id, dealerId: dealer.id }) }));
  const options = (choices.data ?? []).map((v) => ({
    value: v.id,
    label: `${v.voucherNo} · ${fmtDate(v.voucherDate)} · ${v.payee} · ${rm(Number(v.amount))}`,
  }));
  // PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), dealer commission step 3).
  const gap = !voucherId ? "Save: pick the payment voucher" : null;
  return (
    <Modal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="Add a payment"
      description={dealer.name}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={save.isPending}
            disabled={gap !== null}
            onClick={() => {
              setRefusal(null);
              if (!voucherId) return;
              save.mutate(voucherId, { onSuccess: onClose, onError: (e) => setRefusal(e.message) });
            }}
          >
            {gap ?? "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3" data-testid="commission-payment-form">
        {choices.isSuccess && options.length === 0 ? (
          <p className="text-body">No paid direct payment voucher is waiting. Pay the dealer with a payment voucher first.</p>
        ) : (
          <Select id="commission-payment-voucher" label="Payment voucher" required value={voucherId}
            placeholder={choices.isSuccess ? "Choose" : "Loading"} onValueChange={setVoucherId} options={options} />
        )}
        <p className="text-body text-kit-slate-11">A paid direct payment voucher counts as a payment to {dealer.name} on its statement.</p>
        {refusal && <FieldError>{refusal}</FieldError>}
      </div>
    </Modal>
  );
}

function PaymentWindow({ line, onClose }: { line: DcStatementLine; onClose: () => void }) {
  const [refusal, setRefusal] = useState<string | null>(null);
  const remove = usePaymentMutation(() => apiFetch(`${BASE}/payments/${line.paymentId}`, { method: "DELETE" }));
  return (
    <Modal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      // PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), dealer commission step 3).
      title={statementLineWord(line)}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={remove.isPending}
            onClick={() => {
              setRefusal(null);
              remove.mutate(undefined, { onSuccess: onClose, onError: (e) => setRefusal(e.message) });
            }}
          >
            Take off this statement
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1.5 text-body" data-testid="commission-payment-detail">
        <p>Paid on: {fmtDate(line.day)}</p>
        <p>Amount: {rm(line.paid)}</p>
        <p className="text-kit-slate-11">Taking it off leaves the payment voucher as it is; only this statement stops counting it.</p>
        {refusal && <FieldError>{refusal}</FieldError>}
      </div>
    </Modal>
  );
}

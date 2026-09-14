// design-standard: not-a-list-page — the advance card and its modals sit inside the Payment Voucher page, which owns the shell
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import type { PaymentVoucherDocument } from "@carres/shared/schemas/finance-ap";
import Button from "@/components/kit/Button";
import Modal from "@/components/kit/Modal";
import { fieldCls } from "@/components/Field";
import { fmtDate } from "@/lib/fmt-date";
import {
  useApAccounts,
  useApBillOutstanding,
  useApplyAdvance,
  useCancelMoneyBack,
  useRecordMoneyBack,
  useTakeAdvanceOff,
} from "@/lib/payables-queries";
import {
  ADVANCE_APPLICATION_STATUS_WORD,
  MONEY_BACK_STATUS_WORD,
  cents,
  money,
  num,
  refusal,
  todayIso,
  word,
} from "./payables-words";
import { FactRow, Facts, ReasonModal } from "./PayablesParts";

/**
 * The advance on a payment voucher (migrations 0484–0485): money paid to a
 * supplier before its bill.
 *
 *   Apply advance       knocks part of it off one confirmed bill. Posts
 *                       nothing — approving the voucher already put it on the
 *                       supplier's payables account.
 *   Take advance off    undoes one knock-off; the bill is unpaid again.
 *   Record money back   the supplier sent part of it back (a cancelled order):
 *                       Dr the money account · Cr the payables account.
 *   Cancel money back   reverses that entry on its own date (approver only).
 *
 * What is left, and who may do what, is the database's answer
 * (`doc.advance`, `doc.can`), never this page's arithmetic.
 */
export function VoucherAdvanceCard({ doc }: { doc: PaymentVoucherDocument }) {
  const adv = doc.advance;
  const v = doc.voucher;
  const [applying, setApplying] = useState(false);
  const [moneyBack, setMoneyBack] = useState(false);
  const [takeOff, setTakeOff] = useState<string | null>(null);
  const [cancelBack, setCancelBack] = useState<string | null>(null);
  const takeOffAct = useTakeAdvanceOff();
  const cancelBackAct = useCancelMoneyBack();
  if (!adv) return null;

  const open = num(adv.advance_open);
  return (
    <>
      <Facts
        title="Advance on this voucher"
        testId="voucher-advance"
        right={
          <>
            {doc.can.money_back && <Button onClick={() => setMoneyBack(true)}>Record money back</Button>}
            {doc.can.apply_advance && <Button variant="primary" onClick={() => setApplying(true)}>Apply advance</Button>}
          </>
        }
      >
        <FactRow label="Advance">{money(adv.advance_amount)}</FactRow>
        {v.status === "cancelled"
          ? (
            <p data-testid="voucher-advance-cancelled">
              This voucher is cancelled, so its advance was never paid or has been reversed.
            </p>
          )
          : (
            <>
              <FactRow label="Applied to bills">{money(adv.applied_total)}</FactRow>
              <FactRow label="Money back">{money(adv.money_back_total)}</FactRow>
              <FactRow label="Advance left">
                <span data-testid="voucher-advance-left">
                  {open === null ? "Not paid yet — approving the payment pays it" : money(open)}
                </span>
              </FactRow>
            </>
          )}
        {adv.applications.length > 0 && (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-body" data-testid="voucher-advance-applications">
              <thead>
                <tr className="text-left text-base-500">
                  <th className="py-1 pr-3">Bill No</th>
                  <th className="py-1 pr-3">Supplier invoice</th>
                  <th className="py-1 pr-3">Applied</th>
                  <th className="py-1 pr-3">Status</th>
                  <th className="py-1 pr-3 text-right">Amount</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody>
                {adv.applications.map((a) => (
                  <tr key={a.id} className="border-t border-base-100">
                    <td className="py-1 pr-3"><Link to={`/finance/bills/${a.bill_id}`}>{a.bill_no ?? "Draft bill"}</Link></td>
                    <td className="py-1 pr-3">{a.supplier_invoice_no}</td>
                    <td className="py-1 pr-3">{fmtDate(a.created_at, { time: true })} · {a.created_by_name ?? "Name not available"}</td>
                    <td className="py-1 pr-3">
                      {word(ADVANCE_APPLICATION_STATUS_WORD, a.status)}
                      {a.status === "cancelled" && a.cancel_reason ? ` — ${a.cancel_reason}` : ""}
                    </td>
                    <td className="py-1 pr-3 text-right">{money(a.amount)}</td>
                    <td className="py-1 text-right">
                      {doc.can.take_advance_off && a.status === "applied" && (
                        <Button size="sm" variant="ghost" onClick={() => setTakeOff(a.id)}>Take advance off</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {adv.money_back.length > 0 && (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-body" data-testid="voucher-money-back">
              <thead>
                <tr className="text-left text-base-500">
                  <th className="py-1 pr-3">Money back No</th>
                  <th className="py-1 pr-3">Date</th>
                  <th className="py-1 pr-3">Received into</th>
                  <th className="py-1 pr-3">Status</th>
                  <th className="py-1 pr-3 text-right">Amount</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody>
                {adv.money_back.map((m) => (
                  <tr key={m.id} className="border-t border-base-100">
                    <td className="py-1 pr-3">{m.money_back_no}</td>
                    <td className="py-1 pr-3">{fmtDate(m.money_back_date)}</td>
                    <td className="py-1 pr-3">{m.money_account_code} {m.money_account_name ?? ""}</td>
                    <td className="py-1 pr-3">
                      {word(MONEY_BACK_STATUS_WORD, m.status)}
                      {m.status === "voided" && m.void_reason ? ` — ${m.void_reason}` : ""}
                    </td>
                    <td className="py-1 pr-3 text-right">{money(m.amount)}</td>
                    <td className="py-1 text-right">
                      {doc.can.cancel_money_back && m.status === "posted" && (
                        <Button size="sm" variant="ghost" onClick={() => setCancelBack(m.id)}>Cancel money back</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Facts>
      {applying && (
        <ApplyFromVoucherModal
          voucherId={v.id}
          supplierId={v.supplier_id}
          apAccountCode={v.ap_account_code}
          open={open ?? 0}
          onClose={() => setApplying(false)}
        />
      )}
      {moneyBack && (
        <MoneyBackModal voucherId={v.id} voucherNo={v.voucher_no} open={open ?? 0} onClose={() => setMoneyBack(false)} />
      )}
      <ReasonModal
        open={takeOff !== null}
        title="Take this advance off the bill?"
        description="Nothing is entered in the ledger. The bill is unpaid again by this amount, and the advance is left to use."
        action="Take advance off"
        busy={takeOffAct.isPending}
        onClose={() => setTakeOff(null)}
        onSubmit={(reason) => takeOff && takeOffAct.mutate({ applicationId: takeOff, reason }, {
          onSuccess: () => { setTakeOff(null); toast.success("Advance taken off"); },
          onError: (e) => toast.error(refusal(e)),
        })}
      />
      <ReasonModal
        open={cancelBack !== null}
        title="Cancel this money back?"
        description="The ledger entry is reversed on its own date, and the amount is left on the advance again."
        action="Cancel money back"
        busy={cancelBackAct.isPending}
        onClose={() => setCancelBack(null)}
        onSubmit={(reason) => cancelBack && cancelBackAct.mutate({ moneyBackId: cancelBack, reason }, {
          onSuccess: () => { setCancelBack(null); toast.success("Money back cancelled"); },
          onError: (e) => toast.error(refusal(e)),
        })}
      />
    </>
  );
}

/** From the voucher: choose one of the supplier's confirmed bills on the same
 *  payables account, and how much of the advance to knock off it. */
function ApplyFromVoucherModal({ voucherId, supplierId, apAccountCode, open, onClose }: {
  voucherId: string;
  supplierId: string | null;
  apAccountCode: string | null;
  open: number;
  onClose: () => void;
}) {
  const bills = useApBillOutstanding(supplierId, supplierId !== null);
  const apply = useApplyAdvance();
  const rows = (bills.data ?? [])
    .filter((b) => (num(b.unallocated) ?? 0) > 0 && b.ap_account_code === apAccountCode);
  const [billId, setBillId] = useState("");
  const [amount, setAmount] = useState("");
  const bill = rows.find((b) => b.bill_id === billId) ?? null;
  const cap = bill ? cents(Math.min(open, num(bill.unallocated) ?? 0)) : open;
  const n = num(amount);
  const ready = bill !== null && n !== null && n > 0 && n <= cap;

  return (
    <AdvanceModal
      title="Apply advance to a bill?"
      description="Nothing is entered in the ledger: the advance is already on the supplier's account. The bill shows it as paid by this amount."
      action="Apply advance"
      ready={ready}
      busy={apply.isPending}
      onClose={onClose}
      onSubmit={() => apply.mutate({ voucherId, input: { billId, amount: n ?? 0 } }, {
        onSuccess: () => { toast.success("Advance applied"); onClose(); },
        onError: (e) => toast.error(refusal(e)),
      })}
    >
      {bills.isError
        ? <p role="alert">The bills could not be loaded. Try again.</p>
        : !bills.isSuccess
          ? <p>Loading bills…</p>
          : rows.length === 0
            ? <p>This supplier has no confirmed bill left to pay.</p>
            : (
              <div className="flex flex-col gap-3">
                <label className="block">
                  Bill
                  <select aria-label="Bill" className={`${fieldCls} mt-1`} value={billId}
                    onChange={(e) => {
                      setBillId(e.target.value);
                      const b = rows.find((r) => r.bill_id === e.target.value);
                      setAmount(b ? String(cents(Math.min(open, num(b.unallocated) ?? 0))) : "");
                    }}>
                    <option value="">Choose the bill</option>
                    {rows.map((b) => (
                      <option key={b.bill_id} value={b.bill_id}>
                        {b.bill_no} · {b.supplier_invoice_no} · {money(b.unallocated)} left to pay
                      </option>
                    ))}
                  </select>
                </label>
                <AmountField amount={amount} onChange={setAmount} cap={cap} capWord="More than can be applied" />
              </div>
            )}
    </AdvanceModal>
  );
}

function MoneyBackModal({ voucherId, voucherNo, open, onClose }: {
  voucherId: string;
  voucherNo: string | null;
  open: number;
  onClose: () => void;
}) {
  const accounts = useApAccounts();
  const record = useRecordMoneyBack();
  const choices = (accounts.data ?? []).filter((a) => a.for_pay_from);
  const [date, setDate] = useState(todayIso());
  const [account, setAccount] = useState("");
  const [amount, setAmount] = useState(String(open));
  const [reference, setReference] = useState("");
  // One key per money back: a double press sends the same key and gets the
  // first record back. Changing the amount, the account or the date makes it a
  // different money back, so it takes a new key — the database refuses a key
  // re-sent with different details (idempotency_mismatch).
  const [key, setKey] = useState(() => crypto.randomUUID());
  const fresh = () => setKey(crypto.randomUUID());
  const n = num(amount);
  const ready = account !== "" && /^\d{4}-\d{2}-\d{2}$/.test(date) && n !== null && n > 0 && n <= open;

  return (
    <AdvanceModal
      title="Record money back?"
      description={`The supplier sent part of the advance on ${voucherNo ?? "this voucher"} back. It is entered in the ledger on the date below.`}
      action="Record money back"
      ready={ready}
      busy={record.isPending}
      onClose={onClose}
      onSubmit={() => record.mutate({
        voucherId,
        input: {
          moneyBackDate: date,
          moneyAccountCode: account,
          amount: n ?? 0,
          reference: reference.trim() || null,
          narration: null,
          idempotencyKey: key,
        },
      }, {
        onSuccess: () => { toast.success("Money back recorded"); onClose(); },
        onError: (e) => toast.error(refusal(e)),
      })}
    >
      <div className="flex flex-col gap-3">
        <label className="block">
          Date
          <input aria-label="Date" type="date" className={`${fieldCls} mt-1`} value={date}
            onChange={(e) => { setDate(e.target.value); fresh(); }} />
        </label>
        {accounts.isError
          ? <p role="alert">The accounts could not be loaded. Try again.</p>
          : !accounts.isSuccess
            ? <p>Loading accounts…</p>
            : (
              <label className="block">
                Received into
                <select aria-label="Received into" className={`${fieldCls} mt-1`} value={account}
                  onChange={(e) => { setAccount(e.target.value); fresh(); }}>
                  <option value="">Choose the bank or cash account</option>
                  {choices.map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
                </select>
              </label>
            )}
        <AmountField amount={amount} onChange={(next) => { setAmount(next); fresh(); }} cap={open}
          capWord="More than the advance left" />
        <label className="block">
          Reference
          <input aria-label="Reference" className={`${fieldCls} mt-1`} value={reference} maxLength={120}
            placeholder="Bank reference or cheque No" onChange={(e) => setReference(e.target.value)} />
        </label>
      </div>
    </AdvanceModal>
  );
}

export function AmountField({ amount, onChange, cap, capWord }: {
  amount: string;
  onChange: (next: string) => void;
  cap: number;
  capWord: string;
}) {
  const over = (num(amount) ?? 0) > cap;
  return (
    <label className="block">
      Amount
      <input aria-label="Amount" className={`${fieldCls} mt-1 w-40`} inputMode="decimal" value={amount}
        placeholder="0.00" onChange={(e) => onChange(e.target.value)} />
      {over && <span className="block text-meta text-kit-red-11">{capWord}</span>}
    </label>
  );
}

export function AdvanceModal({ title, description, action, ready, busy, onClose, onSubmit, children }: {
  title: string;
  description: string;
  action: string;
  ready: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: () => void;
  children: ReactNode;
}) {
  return (
    <Modal
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={title}
      description={description}
      footer={
        <span className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!ready} loading={busy} onClick={onSubmit}>{action}</Button>
        </span>
      }
    >
      <div className="text-body">{children}</div>
    </Modal>
  );
}


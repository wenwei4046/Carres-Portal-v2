import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import type {
  SupplierBillDocument,
  SupplierBillLineFollowup,
  SupplierNoteFollowup,
} from "@carres/shared/schemas/finance-ap";
import Button from "@/components/kit/Button";
import DatePicker from "@/components/kit/DatePicker";
import Input from "@/components/kit/Input";
import Modal from "@/components/kit/Modal";
import Select from "@/components/kit/Select";
import Textarea from "@/components/kit/Textarea";
import { appTodayIso, fmtDate } from "@/lib/fmt-date";
import {
  useAddNoteToFollowUp,
  useCreditNoteNotesToFollowUp,
  useDebitNoteNotesToFollowUp,
  useSettleNoteToFollowUp,
  useSupplierNotesOwed,
  useTakeNoteSettlementOff,
} from "@/lib/payables-queries";
import { Facts, ReasonModal } from "./PayablesParts";
import { noteFromWord } from "./NotesToFollowUp";
import {
  NOTE_KIND_WORD,
  NOTE_REASON_WORD,
  NOTE_STATUS_WORD,
  cents,
  money,
  num,
  refusal,
  word,
} from "./payables-words";

/**
 * The credit and debit notes suppliers owe (migration 0676), where other
 * Payables pages show them: a confirmed bill's line marks one, a confirmed
 * credit or (0681) debit note settles them, and a voucher says what its
 * supplier still owes.
 */

const link = "text-kit-blue-11 underline underline-offset-2";

type BillLine = SupplierBillDocument["lines"][number];

/** A bill line's note, or the door to mark one: a confirmed bill's line priced
 *  off its PO price. A draft's lines can still change, so it offers nothing. */
export function LineFollowUp({ billId, billStatus, line, notes }: {
  billId: string;
  billStatus: string;
  line: BillLine;
  notes: SupplierBillLineFollowup[] | undefined;
}) {
  const [marking, setMarking] = useState(false);
  const mine = (notes ?? []).filter((n) => n.line_no === line.line_no);
  const open = mine.find((n) => n.status === "waiting" || n.status === "part");
  // The note this line has, open first, else the last one settled or closed.
  const shown = open ?? mine[mine.length - 1];
  const diff = num(line.price_diff);
  const canMark = !open && billStatus === "confirmed" && !!line.po_line_id && diff !== null && Math.abs(diff) >= 0.005;
  return (
    <>
      {shown && (
        <Link className={`${link} mr-2`} data-testid={`line-note-${line.line_no}`} to={`/finance/notes-to-follow-up/${shown.id}`}>
          {word(NOTE_KIND_WORD, shown.kind)} · {word(NOTE_STATUS_WORD, shown.status)}
        </Link>
      )}
      {canMark && (
        <Button size="sm" variant="ghost" data-testid={`follow-up-line-${line.line_no}`} onClick={() => setMarking(true)}>
          Follow up
        </Button>
      )}
      {marking && diff !== null && <MarkLineModal billId={billId} line={line} diff={diff} onClose={() => setMarking(false)} />}
    </>
  );
}

/** Mark a bill line as a note the supplier owes. Above the PO price the
 *  supplier owes a credit note; below it, a debit note may follow. The
 *  amount it suggests is the difference times the quantity. */
function MarkLineModal({ billId, line, diff, onClose }: {
  billId: string;
  line: BillLine;
  diff: number;
  onClose: () => void;
}) {
  const add = useAddNoteToFollowUp();
  const [kind, setKind] = useState<"CREDIT" | "DEBIT">(diff > 0 ? "CREDIT" : "DEBIT");
  const [amount, setAmount] = useState(String(cents(Math.abs(diff) * (num(line.qty) ?? 1))));
  const [remark, setRemark] = useState("");
  const [nextOn, setNextOn] = useState<string | null>(null);
  const value = Number(amount);
  const gap = !(value > 0) || cents(value) !== value ? "Save: type the amount" : null;
  const submit = () => {
    if (gap) return;
    add.mutate({
      reason: "PRICE", kind, billId, lineNo: line.line_no, amount: cents(value),
      remark: remark.trim() || null, nextOn,
    }, {
      onSuccess: () => { toast.success("Added to Notes to follow up"); onClose(); },
      onError: (e) => toast.error(refusal(e)),
    });
  };
  return (
    <Modal
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title="Follow up a note from the supplier"
      description={`Line ${line.line_no}: ${line.description ?? line.sku ?? "No description"} · ${money(line.unit_price)} against the PO's ${money(line.po_unit_cost)}. A reminder only: it posts nothing.`}
      footer={
        <span className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={gap !== null} loading={add.isPending} onClick={submit}>{gap ?? "Save"}</Button>
        </span>
      }
    >
      <div className="flex flex-col gap-3" data-testid="mark-line-form">
        <Select id="mark-line-kind" label="Note" required value={kind} onValueChange={(v) => setKind(v as "CREDIT" | "DEBIT")}
          options={[{ value: "CREDIT", label: NOTE_KIND_WORD.CREDIT! }, { value: "DEBIT", label: NOTE_KIND_WORD.DEBIT! }]} />
        <Input id="mark-line-amount" label="Amount (RM)" required type="number" inputMode="decimal" value={amount}
          onChange={(e) => setAmount(e.target.value)} />
        <Textarea id="mark-line-remark" label="Remark" rows={2} maxLength={500} value={remark}
          onChange={(e) => setRemark(e.target.value)} />
        <DatePicker id="mark-line-next" label="Next follow-up" minDate={appTodayIso()} value={nextOn} onChange={setNextOn} />
      </div>
    </Modal>
  );
}

type NoteSide = "credit" | "debit";

/** A confirmed credit note settles its supplier's credit notes owed, in part
 *  or in full. Posts nothing. */
export function CreditNoteSettlesCard({ noteId, confirmed }: { noteId: string; confirmed: boolean }) {
  return <NoteSettlesCard side="credit" noteId={noteId} confirmed={confirmed} />;
}

/** 0681: a confirmed debit note settles its supplier's debit notes owed, in
 *  part or in full. Posts nothing. */
export function DebitNoteSettlesCard({ noteId, confirmed }: { noteId: string; confirmed: boolean }) {
  return <NoteSettlesCard side="debit" noteId={noteId} confirmed={confirmed} />;
}

function NoteSettlesCard({ side, noteId, confirmed }: { side: NoteSide; noteId: string; confirmed: boolean }) {
  const creditQuery = useCreditNoteNotesToFollowUp(noteId, confirmed && side === "credit");
  const debitQuery = useDebitNoteNotesToFollowUp(noteId, confirmed && side === "debit");
  const query = side === "credit" ? creditQuery : debitQuery;
  const takeOff = useTakeNoteSettlementOff();
  const [settling, setSettling] = useState<SupplierNoteFollowup | null>(null);
  const [takingOff, setTakingOff] = useState<string | null>(null);
  const what = side === "credit" ? "credit note" : "debit note";
  const testId = `${side}-note-settles`;
  if (!confirmed) {
    return (
      <Facts title="Notes it settles" testId={testId}>
        <p>A {what} settles the notes its supplier owes once it is confirmed.</p>
      </Facts>
    );
  }
  const d = query.data;
  return (
    <Facts title="Notes it settles" testId={testId}>
      {query.isError ? <p>The notes owed could not be loaded. Try again.</p>
      : !d ? <p>Loading notes owed…</p>
      : (
        <>
          <p>{money(d.settled)} settled · {money(d.left_to_settle)} left to settle notes owed</p>
          {d.settlements.map((s) => (
            <p key={s.id} data-testid={`${side}-note-settlement-${s.id}`}>
              <Link className={link} to={`/finance/notes-to-follow-up/${s.followup_id}`}>
                {noteFromWord({ reason: s.reason, bill_no: s.bill_no, supplier_invoice_no: null, line_no: null, pr_no: s.pr_no })}
              </Link>
              {" · "}{word(NOTE_REASON_WORD, s.reason)} · {money(s.amount)} · {fmtDate(s.created_at)}
              {s.taken_off_at ? ` · Taken off · ${s.take_off_reason ?? "No reason on file"}` : ""}
              {!s.taken_off_at && (
                <>
                  {" "}
                  <Button size="sm" variant="ghost" onClick={() => setTakingOff(s.id)}>Take off</Button>
                </>
              )}
            </p>
          ))}
          {d.owed.length === 0
            ? <p>This supplier owes no other {what} to follow up.</p>
            : d.owed.map((n) => (
              <p key={n.id} data-testid={`${side}-note-owed-${n.id}`}>
                <Link className={link} to={`/finance/notes-to-follow-up/${n.id}`}>{noteFromWord(n)}</Link>
                {" · "}{word(NOTE_REASON_WORD, n.reason)} · {money(n.left)} left
                {(num(d.left_to_settle) ?? 0) > 0 && (
                  <>
                    {" "}
                    <Button size="sm" variant="ghost" data-testid={`settle-${n.id}`} onClick={() => setSettling(n)}>Settle</Button>
                  </>
                )}
              </p>
            ))}
        </>
      )}
      {settling && d && (
        <SettleModal side={side} noteId={noteId} owed={settling} leftToSettle={num(d.left_to_settle) ?? 0} onClose={() => setSettling(null)} />
      )}
      <ReasonModal
        open={takingOff !== null}
        title="Take this settlement off?"
        description="The note is owed again by that much."
        action="Take off"
        busy={takeOff.isPending}
        onClose={() => setTakingOff(null)}
        onSubmit={(reason) => {
          if (!takingOff) return;
          takeOff.mutate({ settlementId: takingOff, reason }, {
            onSuccess: () => { setTakingOff(null); toast.success("Taken off"); },
            onError: (e) => toast.error(refusal(e)),
          });
        }}
      />
    </Facts>
  );
}

function SettleModal({ side, noteId, owed, leftToSettle, onClose }: {
  side: NoteSide;
  noteId: string;
  owed: SupplierNoteFollowup;
  leftToSettle: number;
  onClose: () => void;
}) {
  const settle = useSettleNoteToFollowUp();
  const cap = cents(Math.min(num(owed.left) ?? 0, leftToSettle));
  const [amount, setAmount] = useState(String(cap));
  const value = Number(amount);
  const gap = !(value > 0) || cents(value) !== value ? "Settle: type the amount"
    : value > cap ? `Settle: at most ${money(cap)}`
    : null;
  const submit = () => {
    if (gap) return;
    const input = side === "credit" ? { creditNoteId: noteId, amount: cents(value) } : { debitNoteId: noteId, amount: cents(value) };
    settle.mutate({ id: owed.id, input }, {
      onSuccess: () => { toast.success("Note settled"); onClose(); },
      onError: (e) => toast.error(refusal(e)),
    });
  };
  return (
    <Modal
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title="Settle a note owed"
      description={`${noteFromWord(owed)} · ${money(owed.left)} left. Settling part of it leaves the rest owed. A reminder only: it posts nothing.`}
      footer={
        <span className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={gap !== null} loading={settle.isPending} onClick={submit}>{gap ?? "Settle"}</Button>
        </span>
      }
    >
      <div className="flex flex-col gap-3" data-testid="settle-note-form">
        <Input id="settle-amount" label="Amount (RM)" required type="number" inputMode="decimal" value={amount}
          onChange={(e) => setAmount(e.target.value)} hint={`At most ${money(cap)}`} />
      </div>
    </Modal>
  );
}

/** The voucher's reminder: what notes its supplier still owes. */
export function NotesOwedHint({ supplierId }: { supplierId: string | null }) {
  const query = useSupplierNotesOwed(supplierId);
  const d = query.data;
  if (!supplierId || !d || d.credit_count + d.debit_count === 0) return null;
  const parts = [
    d.credit_count > 0 ? `${d.credit_count} ${d.credit_count === 1 ? "credit note" : "credit notes"} (${money(d.credit_left)})` : null,
    d.debit_count > 0 ? `${d.debit_count} ${d.debit_count === 1 ? "debit note" : "debit notes"} (${money(d.debit_left)})` : null,
  ].filter(Boolean);
  return (
    <p className="text-body text-kit-slate-11" data-testid="notes-owed-hint">
      This supplier still owes {parts.join(" and ")}.{" "}
      <Link className={link} to="/finance/notes-to-follow-up">See Notes to follow up</Link>
    </p>
  );
}

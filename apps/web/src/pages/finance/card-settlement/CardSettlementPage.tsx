/**
 * Finance → Card settlement, at `/finance/card-settlement` (migration 0572).
 *
 * Owner, 22 Sep 2026: card money is matched by the daily total per machine.
 * Finance imports the card company's file; every row is kept whole. Public
 * Bank and Maybank rows match a recorded card payment by approval code, GHL
 * rows by amount and date. What does not match is listed here with its
 * suggestions (a likely typed-wrong code, or the same amount 3 to 7 days
 * apart): staff approve a suggestion or adjust the match by hand.
 *
 * A day whose rows are all matched is approved in the card payout form
 * (0529): the card company's net, fee and the reference are fixed, staff give
 * the date the bank received it and the accounts. The database prepares that
 * day's one money move and links it to the day; the ledger moves only when
 * the finance approver approves it. GHL's file has no settlement date, so a
 * GHL day is its sale date and its paid-out date comes from the statement
 * date in the file name, or is typed by staff.
 *
 * Built from the kit pieces Money moves uses.
 */
import { useMemo, useRef, useState } from "react";
import {
  CARD_ACQUIRER_WORD,
  CARD_ACQUIRERS,
  dayFee,
  dayKey,
  dayMayApprove,
  type CardAcquirer,
  type CardMatchHow,
  type CardSettlementDay,
  type CardSettlementPayment,
  type CardSettlementRow,
  type CardSuggestionHow,
} from "@carres/shared/card-settlement";
import Button from "@/components/kit/Button";
import Modal from "@/components/kit/Modal";
import Select from "@/components/kit/Select";
import StatusPill from "@/components/kit/StatusPill";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import { toast } from "sonner";
import { MoneyMoveForm } from "../money-moves/MoneyMovesPage";
import { LoadFailed } from "../other-money-in/parts";
import { useCardSettlement, useImportCardFile, useMatchCardRow, usePrepareCardPayout } from "./api";

const MATCHED_WORD: Record<CardMatchHow, string> = {
  approval_code: "Matched by approval code",
  amount_and_date: "Matched by amount and date",
  suggestion: "Suggestion approved",
  by_hand: "Adjusted by hand",
};

const suggestionWord = (how: CardSuggestionHow, days: number) =>
  ({
    approval_code: "Same approval code and amount",
    code_other_amount: "Same approval code, another amount",
    code_near: "Approval code may be typed wrong",
    amount_and_date: "Same amount, same day",
    amount_near_date: `Same amount, ${days} ${days === 1 ? "day" : "days"} apart`,
  })[how];

function dayStatus(d: CardSettlementDay) {
  if (d.payout_status === "approved") return { word: "Payout approved", tone: "success" as const };
  if (d.payout_status === "prepared") return { word: "Payout prepared", tone: "info" as const };
  if (d.matched_count < d.row_count) return { word: "To check", tone: "warning" as const };
  return { word: "Matched", tone: "neutral" as const };
}

const machine = (d: Pick<CardSettlementDay, "acquirer" | "group_key">) =>
  d.acquirer === "MAYBANK" ? `All machines · ${d.group_key}` : d.group_key;

const paidOut = (d: CardSettlementDay) => (d.payout_date ? fmtDate(d.payout_date) : "Not in the file");
/** Only a GHL day is a sale date; a Public Bank or Maybank day holds the sales of several dates. */
const saleDate = (d: CardSettlementDay) => (d.acquirer === "GHL" ? fmtDate(d.day_date) : "");

const paymentWords = (p: CardSettlementPayment | undefined) =>
  p
    ? `${rm(Number(p.amount))} · ${fmtDate(p.paid_on)} · ${p.receipt_no ?? "Receipt number missing"} · ${
        p.so !== null ? `SO-${p.so}` : "SO not available"
      } · Approval code ${p.reference ?? "not typed"}`
    : "Payment not available";

export default function CardSettlementPage() {
  const query = useCardSettlement();
  const importFile = useImportCardFile();
  const matchRow = useMatchCardRow();
  const fileInput = useRef<HTMLInputElement>(null);
  const [acquirer, setAcquirer] = useState<CardAcquirer | undefined>();
  const [adjusting, setAdjusting] = useState<CardSettlementRow | null>(null);
  const [paying, setPaying] = useState<CardSettlementDay | null>(null);
  const prepareDay = usePrepareCardPayout(paying);

  const rowsOf = useMemo(() => {
    const m = new Map<string, CardSettlementRow[]>();
    for (const r of query.data?.rows ?? []) m.set(dayKey(r), [...(m.get(dayKey(r)) ?? []), r]);
    return m;
  }, [query.data]);
  const paymentOf = useMemo(() => new Map((query.data?.payments ?? []).map((p) => [p.id, p])), [query.data]);

  const columns = useMemo<DataGridColumn<CardSettlementDay>[]>(
    () => [
      { key: "company", label: "Card company", width: 130, accessor: (d) => CARD_ACQUIRER_WORD[d.acquirer], filterType: "enum" },
      {
        key: "date",
        label: "Paid out",
        width: 120,
        accessor: paidOut,
        dateValue: (d) => d.payout_date,
        filterType: "date",
        exportValue: paidOut,
      },
      {
        key: "sale",
        label: "Sale date",
        width: 120,
        accessor: saleDate,
        dateValue: (d) => (d.acquirer === "GHL" ? d.day_date : null),
        filterType: "date",
        exportValue: saleDate,
      },
      { key: "machine", label: "Machine", width: 220, accessor: machine, searchValue: machine },
      { key: "rows", label: "Sales", width: 80, align: "right", accessor: (d) => String(d.row_count), numberValue: (d) => d.row_count },
      { key: "matched", label: "Matched", width: 90, align: "right", accessor: (d) => String(d.matched_count), numberValue: (d) => d.matched_count },
      ...(["gross", "fee", "net"] as const).map<DataGridColumn<CardSettlementDay>>((k) => {
        const v = (d: CardSettlementDay) => (k === "fee" ? dayFee(d) : Number(d[k]));
        return { key: k, label: { gross: "Sales total", fee: "Fee", net: "Paid into bank" }[k], width: 130, align: "right", accessor: (d) => rm(v(d)), numberValue: v, exportValue: v };
      }),
      {
        key: "recorded",
        label: "Recorded in Carres",
        width: 150,
        align: "right",
        accessor: (d) => (d.recorded === null ? "Nothing matched" : rm(Number(d.recorded))),
        numberValue: (d) => Number(d.recorded ?? 0),
      },
      {
        key: "status",
        label: "Status",
        width: 140,
        accessor: (d) => <StatusPill tone={dayStatus(d).tone}>{dayStatus(d).word}</StatusPill>,
        searchValue: (d) => dayStatus(d).word,
        filterValue: (d) => dayStatus(d).word,
        exportValue: (d) => dayStatus(d).word,
        filterType: "enum",
      },
    ],
    [],
  );

  const doMatch = (row: CardSettlementRow, paymentId: string | null, done?: () => void) =>
    matchRow.mutate(
      { rowId: row.id, paymentId },
      {
        onSuccess: () => {
          toast.success(paymentId ? `Row ${row.line_no} matched.` : `Row ${row.line_no} is open again.`);
          done?.();
        },
        onError: (e) => toast.error(e.message),
      },
    );

  const onFile = async (file: File) => {
    if (!acquirer) return;
    importFile.mutate(
      { acquirer, fileName: file.name, content: await file.text() },
      {
        onSuccess: (r) => toast.success(`${r.imported} of ${r.rows} rows imported · ${r.matched} matched.`),
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ModuleHeader destinationHeader testId="card-settlement-destination-header" word="Card settlement" docTitle="Card settlement — Carres" />
      {query.isError ? (
        <LoadFailed what="Card settlement" onRetry={() => void query.refetch()} />
      ) : (
        <ListPageShell register>
          <DataGrid
            rows={query.data?.days ?? []}
            columns={columns}
            rowKey={dayKey}
            storageKey="carres.finance.card-settlement.v1"
            appearance="reference"
            exportName="Card settlement"
            groupBanner={false}
            stickyIdentity
            isLoading={!query.isSuccess}
            searchPlaceholder="Search card settlement…"
            toolbarStart={
              <span className="flex items-center gap-3">
                <span className="w-48">
                  <Select
                    id="card-company"
                    value={acquirer}
                    onValueChange={(v) => setAcquirer(v as CardAcquirer)}
                    placeholder="Choose the card company"
                    options={CARD_ACQUIRERS.map((a) => ({ value: a, label: CARD_ACQUIRER_WORD[a] }))}
                  />
                </span>
                <Button
                  variant="primary"
                  size="sm"
                  shape="pill"
                  icon="attach"
                  loading={importFile.isPending}
                  onClick={() => (acquirer ? fileInput.current?.click() : toast.error("Choose the card company first."))}
                >
                  Import file
                </Button>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".csv,.CSV"
                  className="hidden"
                  data-testid="card-file-input"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onFile(f);
                    e.target.value = ""; // allow the same file again
                  }}
                />
              </span>
            }
            emptyMessage="No card settlement file yet. Choose the card company and press Import file."
            expandTitle="Check the sales"
            expandable={{
              renderExpansion: (d) => (
                <DayExpansion
                  day={d}
                  rows={rowsOf.get(dayKey(d)) ?? []}
                  paymentOf={paymentOf}
                  busy={matchRow.isPending}
                  onApproveMatch={(r, p) => doMatch(r, p)}
                  onTakeOff={(r) => doMatch(r, null)}
                  onAdjust={setAdjusting}
                  onApproveDay={setPaying}
                />
              ),
            }}
            statusSummary={(visible) => (
              <span data-testid="card-settlement-summary">
                {visible.length} {visible.length === 1 ? "day" : "days"} · {visible.filter((d) => d.matched_count < d.row_count).length} to check
              </span>
            )}
          />
        </ListPageShell>
      )}

      {adjusting && (
        <AdjustMatch
          row={adjusting}
          rows={query.data?.rows ?? []}
          payments={query.data?.payments ?? []}
          busy={matchRow.isPending}
          onSave={(p) => doMatch(adjusting, p, () => setAdjusting(null))}
          onClose={() => setAdjusting(null)}
        />
      )}

      {paying && (
        <MoneyMoveForm
          onClose={() => setPaying(null)}
          prepareDay={prepareDay}
          initial={{ kind: "CARD_PAYOUT", date: paying.payout_date, amount: Number(paying.net), fee: dayFee(paying), reference: paying.reference }}
        />
      )}
    </div>
  );
}

function DayExpansion({
  day,
  rows,
  paymentOf,
  busy,
  onApproveMatch,
  onTakeOff,
  onAdjust,
  onApproveDay,
}: {
  day: CardSettlementDay;
  rows: CardSettlementRow[];
  paymentOf: Map<string, CardSettlementPayment>;
  busy: boolean;
  onApproveMatch: (r: CardSettlementRow, paymentId: string) => void;
  onTakeOff: (r: CardSettlementRow) => void;
  onAdjust: (r: CardSettlementRow) => void;
  onApproveDay: (d: CardSettlementDay) => void;
}) {
  const open = day.row_count - day.matched_count;
  return (
    <div className="p-4 text-body flex flex-col items-start gap-3" data-testid={`card-day-${dayKey(day)}`}>
      {rows.map((r) => (
        <div key={r.id} className="flex flex-col items-start gap-1" data-testid={`card-row-${r.line_no}`}>
          <p className="text-strong">
            Row {r.line_no} · {fmtDate(r.txn_date)} · {rm(Number(r.amount))}
            {r.acquirer !== "GHL" ? ` · Approval code ${r.approval_code ?? "not printed"}` : ""}
            {r.terminal_id ? ` · Terminal ${r.terminal_id}` : ""}
            {r.card_no ? ` · Card ${r.card_no}` : ""}
          </p>
          {r.payment_id ? (
            <>
              <p>
                {r.matched_how ? MATCHED_WORD[r.matched_how] : "Matched"} · {paymentWords(paymentOf.get(r.payment_id))}
              </p>
              {day.payout_status === null && (
                <span className="flex gap-2">
                  <Button variant="neutral" size="sm" onClick={() => onAdjust(r)}>
                    Adjust match
                  </Button>
                  <Button variant="ghost" size="sm" loading={busy} onClick={() => onTakeOff(r)}>
                    Take off match
                  </Button>
                </span>
              )}
            </>
          ) : (
            <>
              {r.suggestions.length === 0 && <p>No recorded card payment is close to this sale. Adjust the match by hand.</p>}
              {r.suggestions.map((s) => (
                <span key={s.payment_id} className="flex items-center gap-2" data-testid={`card-suggestion-${s.payment_id}`}>
                  <span>
                    {suggestionWord(s.how, s.days_apart)} · {paymentWords(paymentOf.get(s.payment_id))}
                  </span>
                  <Button variant="primary" size="sm" loading={busy} onClick={() => onApproveMatch(r, s.payment_id)}>
                    Approve match
                  </Button>
                </span>
              ))}
              <Button variant="neutral" size="sm" onClick={() => onAdjust(r)}>
                Adjust match
              </Button>
            </>
          )}
        </div>
      ))}
      {day.payout_status !== null ? (
        <p>
          {day.payout_status === "approved" ? "Payout approved" : "Payout prepared"} · {day.payout_move_no ?? "Move number not available"}
        </p>
      ) : dayMayApprove(day) ? (
        <Button variant="primary" onClick={() => onApproveDay(day)}>
          Approve day
        </Button>
      ) : (
        <p>
          {open} {open === 1 ? "sale is" : "sales are"} not matched yet. Match every sale before you approve the day.
        </p>
      )}
    </div>
  );
}

function AdjustMatch({
  row,
  rows,
  payments,
  busy,
  onSave,
  onClose,
}: {
  row: CardSettlementRow;
  rows: CardSettlementRow[];
  payments: CardSettlementPayment[];
  busy: boolean;
  onSave: (paymentId: string) => void;
  onClose: () => void;
}) {
  const [pick, setPick] = useState<string | undefined>(row.payment_id ?? undefined);
  const taken = new Set(rows.filter((x) => x.payment_id && x.id !== row.id).map((x) => x.payment_id));
  const days = (p: CardSettlementPayment) => Math.abs(Date.parse(p.paid_on) - Date.parse(row.txn_date)) / 86_400_000;
  const options = payments
    .filter((p) => !p.voided && !taken.has(p.id))
    .sort((a, b) => Number(Number(a.amount) !== Number(row.amount)) - Number(Number(b.amount) !== Number(row.amount)) || days(a) - days(b))
    .map((p) => ({ value: p.id, label: paymentWords(p) }));
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Adjust the match for row ${row.line_no}`}
      description={`${fmtDate(row.txn_date)} · ${rm(Number(row.amount))}. The payment and its approval code are not changed.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Back
          </Button>
          <Button variant="primary" loading={busy} disabled={!pick} onClick={() => pick && onSave(pick)}>
            Save match
          </Button>
        </>
      }
    >
      <div data-testid="card-adjust-match">
        <Select
          id="card-adjust-payment"
          label="Card payment"
          required
          value={pick}
          onValueChange={setPick}
          placeholder={options.length ? "Choose the card payment" : "No open card payment within 31 days"}
          options={options}
        />
      </div>
    </Modal>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import type { DepartmentType } from "@carres/shared";
import {
  supplierDebitNoteDraftInput,
  type SupplierDebitNoteDocument,
  type SupplierDebitNoteRegisterRow,
} from "@carres/shared/schemas/finance-ap";
import Button from "@/components/kit/Button";
import DataTable, { type Column } from "@/components/kit/DataTable";
import DatePicker from "@/components/kit/DatePicker";
import Input from "@/components/kit/Input";
import Modal from "@/components/kit/Modal";
import Select from "@/components/kit/Select";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { REGISTER_FIELD_WIDTH as W } from "@/components/register/register-field-widths";
import { appTodayIso, fmtDate } from "@/lib/fmt-date";
import {
  useApAccounts,
  useApSuppliers,
  useDebitNoteAct,
  useSaveDebitNote,
  useSupplierDebitNote,
  useSupplierDebitNotes,
} from "@/lib/payables-queries";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import SalesOrderTabs from "@/pages/operation/SalesOrderTabs";
import { roleAccount } from "@carres/shared/finance-ledger";
import { useLedgerChart } from "../ledger/ledger-queries";
import { useSaveKey } from "../save-key";
import { DepartmentName, DepartmentPicker } from "../department";
import { FactRow, Facts, FilesCard, HistoryCard, ReadFailed, ReasonModal } from "./PayablesParts";
import { DebitNoteSettlesCard } from "./NoteFollowUpParts";
import { BILL_STATUS_WORD, VOUCHER_STATUS_WORD, cents, creditorKindWord, money, num, refusal, word } from "./payables-words";

/**
 * Finance → Payables → Debit Notes (migration 0681; Chew 2026-10-03,
 * docs/finance/MASTER.md §3.2). A supplier's debit note — the supplier charges
 * more — entered once; its own document, number and list, never a bill:
 *   /finance/debit-notes            the register
 *   /finance/debit-notes/new        a new debit note
 *   /finance/debit-notes/:id        the note, with Confirm / Cancel / payments / files / history
 *   /finance/debit-notes/:id/edit   change a draft
 *
 * Confirming posts it: Dr each line's account (the cost, its department) · Cr
 * the payables account with the supplier as the party (Carres owes more),
 * dated the note's date. A payment voucher pays it, as it pays a bill. The
 * database decides every rule; this page offers only what it says the person
 * may do (`can`).
 */
export default function SupplierDebitNotes() {
  return (
    <Routes>
      <Route index element={<DebitNoteRegister />} />
      <Route path="new" element={<DebitNoteForm />} />
      <Route path=":id" element={<DebitNoteDetail />} />
      <Route path=":id/edit" element={<DebitNoteForm />} />
    </Routes>
  );
}

const link = "text-kit-blue-11 underline underline-offset-2";
const noteNo = (n: { note_no: string | null }) => n.note_no ?? "Draft, no number yet";

/** A supplier's debit notes still to pay, under its row on Unpaid by Supplier. */
export function SupplierDebitsOf({ supplierId }: { supplierId: string }) {
  const notes = useSupplierDebitNotes();
  const open = (notes.data ?? []).filter((n) => n.supplier_id === supplierId && n.status === "confirmed" && (num(n.debit_open) ?? 0) > 0);
  if (open.length === 0) return null;
  return (
    <div className="mt-2" data-testid={`supplier-debits-${supplierId}`}>
      <p className="text-strong">Debit notes unpaid</p>
      {open.map((n) => (
        <p key={n.id}>
          <Link className={link} to={`/finance/debit-notes/${n.id}`}>{n.note_no}</Link>
          {" · "}{n.supplier_note_no} · {fmtDate(n.note_date)}
          {" · "}{n.due_date ? `due ${fmtDate(n.due_date)}` : "no due date"}
          {" · "}{money(n.debit_open)} unpaid
        </p>
      ))}
    </div>
  );
}

// ── register ────────────────────────────────────────────────────────────────

function DebitNoteRegister() {
  const navigate = useNavigate();
  const query = useSupplierDebitNotes();
  const rows = query.data ?? [];
  const columns = useMemo<DataGridColumn<SupplierDebitNoteRegisterRow>[]>(() => [
    { key: "note", label: "Debit Note No", width: W.documentNo,
      accessor: (r) => <Link className={link} to={`/finance/debit-notes/${r.id}`}>{noteNo(r)}</Link>,
      searchValue: (r) => r.note_no ?? "", exportValue: noteNo },
    { key: "date", label: "Date", width: W.date, accessor: (r) => fmtDate(r.note_date),
      dateValue: (r) => r.note_date, filterType: "date", exportValue: (r) => r.note_date },
    { key: "supplier", label: "Supplier", width: 220, accessor: (r) => r.supplier_name, overflowText: (r) => r.supplier_name,
      searchValue: (r) => r.supplier_name, filterType: "enum" },
    { key: "paper", label: "Supplier's debit note", headerLines: ["Supplier's", "debit note"], width: 130, accessor: (r) => r.supplier_note_no,
      searchValue: (r) => r.supplier_note_no },
    { key: "status", label: "Status", width: 110, accessor: (r) => word(BILL_STATUS_WORD, r.status),
      filterValue: (r) => word(BILL_STATUS_WORD, r.status), filterType: "enum" },
    { key: "due", label: "Due Date", width: W.date, accessor: (r) => (r.due_date ? fmtDate(r.due_date) : ""),
      dateValue: (r) => r.due_date, filterType: "date", exportValue: (r) => r.due_date ?? "" },
    { key: "total", label: "Total", width: W.amount, align: "right", accessor: (r) => money(r.total_amount),
      numberValue: (r) => num(r.total_amount), exportValue: (r) => num(r.total_amount) ?? "" },
    { key: "paid", label: "Paid", width: W.amount, align: "right",
      accessor: (r) => (r.status === "confirmed" ? money(r.paid_total) : ""),
      numberValue: (r) => num(r.paid_total), exportValue: (r) => num(r.paid_total) ?? "" },
    { key: "open", label: "Left to pay", headerLines: ["Left to", "pay"], width: W.amount, align: "right",
      accessor: (r) => (r.status === "confirmed" ? money(r.debit_open) : ""),
      numberValue: (r) => num(r.debit_open), exportValue: (r) => num(r.debit_open) ?? "" },
    { key: "files", label: "Files", width: W.qty, align: "right", accessor: (r) => String(r.file_count),
      numberValue: (r) => r.file_count },
  ], []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ModuleHeader destinationHeader testId="debit-notes-destination-header" word="Debit Notes" docTitle="Debit Notes · Carres" />
      {query.isError ? <ReadFailed what="Debit Notes" onRetry={() => void query.refetch()} /> : (
        <ListPageShell register>
          <DataGrid
            rows={rows}
            columns={columns}
            rowKey={(r) => r.id}
            rowTestId={(r) => `debit-note-row-${r.id}`}
            storageKey="carres.finance.debit-notes.v1"
            appearance="reference"
            exportName="Debit Notes"
            groupBanner={false}
            stickyIdentity
            isLoading={!query.isSuccess}
            wrapToolbar
            searchPlaceholder="Search debit notes…"
            toolbarStart={
              <Button variant="primary" shape="pill" icon="add" data-testid="new-debit-note" onClick={() => navigate("/finance/debit-notes/new")}>
                New Debit Note
              </Button>
            }
            emptyMessage="No debit note yet. A supplier's debit note appears here once it is entered."
            onRowDoubleClick={(r) => navigate(`/finance/debit-notes/${r.id}`)}
            statusSummary={(visible) => {
              const open = visible.filter((r) => r.status === "confirmed").reduce((s, r) => s + (num(r.debit_open) ?? 0), 0);
              return (
                <span data-testid="debit-notes-summary">
                  {visible.length} {visible.length === 1 ? "debit note" : "debit notes"} · {money(cents(open))} left to pay
                </span>
              );
            }}
          />
        </ListPageShell>
      )}
    </div>
  );
}

// ── detail ──────────────────────────────────────────────────────────────────

function DebitNoteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const query = useSupplierDebitNote(id);
  const act = useDebitNoteAct();
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const doc = query.data;

  if (query.isError) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <ModuleHeader destinationHeader testId="debit-notes-destination-header" word="Debit Notes" docTitle="Debit Notes · Carres" />
        <ReadFailed what="This debit note" onRetry={() => void query.refetch()} />
      </div>
    );
  }
  if (!doc || !id) return <div className="p-6 text-body">Loading debit note…</div>;
  const n = doc.note;
  const confirmed = n.status === "confirmed";
  const leftToPay = num(doc.debit_open) ?? 0;
  const confirm = () => act.mutate({ id, act: "confirm" }, {
    onSuccess: () => { setConfirming(false); toast.success("Debit note confirmed"); },
    onError: (e) => toast.error(refusal(e)),
  });
  const cancel = (reason: string) => act.mutate({ id, act: "cancel", reason }, {
    onSuccess: () => { setCancelling(false); toast.success("Debit note cancelled"); },
    onError: (e) => toast.error(refusal(e)),
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SalesOrderTabs
        identity={n.note_no ?? "Draft debit note"}
        customer={n.supplier_name}
        backTo="/finance/debit-notes"
        backLabel="Debit Notes"
        docTitle={`${n.note_no ?? "Draft debit note"} · Carres`}
        status={<span data-testid="debit-note-status">{word(BILL_STATUS_WORD, n.status)}</span>}
        right={
          <span className="flex items-center gap-2">
            {doc.can.edit && <Button onClick={() => navigate(`/finance/debit-notes/${id}/edit`)} icon="edit">Edit</Button>}
            {doc.can.cancel && <Button onClick={() => setCancelling(true)}>Cancel debit note</Button>}
            {doc.can.confirm && <Button variant="primary" onClick={() => setConfirming(true)}>Confirm debit note</Button>}
            {confirmed && leftToPay > 0 && (
              <Button variant="primary" data-testid="pay-debit-note"
                onClick={() => navigate(`/finance/payment-vouchers/new?supplier=${n.supplier_id}&debitNote=${id}`)}>
                New Payment Voucher
              </Button>
            )}
          </span>
        }
      />
      <div className="flex-1 overflow-auto p-4" data-testid="debit-note-object-scroll">
        <div className="flex flex-col gap-4">
          <Facts title="Debit note facts">
            <FactRow label="Supplier">{n.supplier_name} · {creditorKindWord(n.supplier_kind)}</FactRow>
            <FactRow label="Supplier's debit note">{n.supplier_note_no}</FactRow>
            <FactRow label="Date">{fmtDate(n.note_date)}</FactRow>
            <FactRow label="Due date">{n.due_date ? fmtDate(n.due_date) : "No due date"}</FactRow>
            <FactRow label="Payables account">{n.ap_account_code} {n.ap_account_name ?? ""}</FactRow>
            <FactRow label="Total">{money(n.total_amount)}</FactRow>
            <FactRow label="Paid">{confirmed ? money(doc.paid_total) : "Not confirmed"}</FactRow>
            <FactRow label="Left to pay">{confirmed ? money(doc.debit_open) : "Not confirmed"}</FactRow>
            {n.narration && <FactRow label="Note">{n.narration}</FactRow>}
            <FactRow label="Ledger entry">
              {n.entry_no ?? "None yet. Confirming the debit note makes it"}
              {n.reversal_entry_no ? ` · reversed by ${n.reversal_entry_no}` : ""}
            </FactRow>
            {n.status === "cancelled" && (
              <FactRow label="Cancelled">
                {fmtDate(n.cancelled_at, { time: true })} · {n.cancelled_by_name ?? "Name not available"} · {n.cancel_reason ?? "No reason on file"}
              </FactRow>
            )}
          </Facts>
          <LinesCard doc={doc} />
          <Facts title="Payment vouchers" testId="debit-note-payments">
            {doc.payments.length === 0
              ? <p>{confirmed ? "Not on a payment voucher yet." : "A payment voucher pays a debit note once it is confirmed."}</p>
              : doc.payments.map((p) => (
                <p key={p.voucher_id} data-testid={`debit-note-payment-${p.voucher_id}`}>
                  <Link className={link} to={`/finance/payment-vouchers/${p.voucher_id}`}>{p.voucher_no ?? "Draft voucher"}</Link>
                  {" · "}{word(VOUCHER_STATUS_WORD, p.voucher_status)} · {fmtDate(p.voucher_date)} · {money(p.amount_applied)}
                </p>
              ))}
          </Facts>
          {/* 0681: the debit notes its supplier owes, settled by this one (0676). */}
          {n.status !== "cancelled" && <DebitNoteSettlesCard noteId={id} confirmed={confirmed} />}
          <FilesCard kind="debit-notes" id={id} files={doc.files} canAdd={doc.can.add_file} />
          <HistoryCard events={doc.events} />
        </div>
      </div>
      <Modal
        open={confirming}
        onOpenChange={(o) => { if (!o) setConfirming(false); }}
        title="Confirm this debit note?"
        description={`${money(n.total_amount)} is added to what Carres owes ${n.supplier_name}, dated ${fmtDate(n.note_date)}. A confirmed debit note cannot be edited.`}
        footer={
          <span className="flex gap-2">
            <Button variant="ghost" onClick={() => setConfirming(false)}>Back</Button>
            <Button variant="primary" loading={act.isPending} onClick={confirm}>Confirm debit note</Button>
          </span>
        }
      >
        <p className="text-body">Check the lines against the supplier's debit note first.</p>
      </Modal>
      <ReasonModal
        open={cancelling}
        title="Cancel this debit note?"
        description={confirmed
          ? "The ledger entry is reversed on the debit note's date. A debit note still on a payment voucher cannot be cancelled."
          : "The draft is kept, marked cancelled."}
        action="Cancel debit note"
        busy={act.isPending}
        onClose={() => setCancelling(false)}
        onSubmit={cancel}
      />
    </div>
  );
}

type NoteLine = SupplierDebitNoteDocument["lines"][number];

const LINE_COLUMNS: readonly Column<NoteLine>[] = [
  { key: "description", label: "Description", width: "auto", cell: (l) => l.description },
  { key: "account", label: "Account", width: "260px", cell: (l) => `${l.account_code} ${l.account_name ?? "Account name not available"}` },
  { key: "department", label: "Department", width: "180px", cell: (l) => <DepartmentName type={l.department_type} id={l.department_id} /> },
  { key: "amount", label: "Amount", width: "140px", align: "right", numeric: true, cell: (l) => money(l.amount) },
];

function LinesCard({ doc }: { doc: SupplierDebitNoteDocument }) {
  return (
    <Facts title="Lines">
      <DataTable label="Debit note lines" testId="debit-note-lines" rows={doc.lines} columns={LINE_COLUMNS}
        rowId={(l) => String(l.line_no)} empty="This debit note has no lines."
        totals={{ label: "Total", cell: (c) => (c.key === "description" ? "Total" : c.key === "amount" ? money(doc.note.total_amount) : null) }} />
    </Facts>
  );
}

// ── form ────────────────────────────────────────────────────────────────────

interface LineDraft {
  key: string;
  accountCode: string;
  description: string;
  amount: string;
  departmentType: DepartmentType | null;
  departmentId: string | null;
}

/** The Payables account choice that leaves it to the database's usual one. */
const USUAL = "usual";

let lineSeq = 0;
const newLine = (): LineDraft => {
  lineSeq += 1;
  return { key: `dn${lineSeq}`, accountCode: "", description: "", amount: "", departmentType: null, departmentId: null };
};

function DebitNoteForm() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const existing = useSupplierDebitNote(id);
  const suppliers = useApSuppliers();
  const accounts = useApAccounts();
  const chart = useLedgerChart();
  const save = useSaveDebitNote();

  const [supplierId, setSupplierId] = useState(params.get("supplier") ?? "");
  const [paperNo, setPaperNo] = useState("");
  const [noteDate, setNoteDate] = useState<string | null>(appTodayIso());
  const [dueDate, setDueDate] = useState<string | null>(null);
  // USUAL: the payables account a bill from this supplier takes by default.
  const [apAccount, setApAccount] = useState(USUAL);
  const [narration, setNarration] = useState("");
  const [lines, setLines] = useState<LineDraft[]>(() => [newLine()]);
  const [loaded, setLoaded] = useState(!id);

  // Editing a draft: the form starts from the note as saved.
  useEffect(() => {
    const d = existing.data;
    if (!id || loaded || !d) return;
    setSupplierId(d.note.supplier_id);
    setPaperNo(d.note.supplier_note_no);
    setNoteDate(d.note.note_date);
    setDueDate(d.note.due_date);
    setApAccount(d.note.ap_account_code);
    setNarration(d.note.narration ?? "");
    setLines(d.lines.map((l) => ({
      ...newLine(),
      accountCode: l.account_code,
      description: l.description,
      amount: String(l.amount),
      departmentType: (l.department_type ?? null) as DepartmentType | null,
      departmentId: l.department_id ?? null,
    })));
    setLoaded(true);
  }, [id, loaded, existing.data]);

  // What the supplier charges more is a cost: the accounts a bill line takes.
  const costAccounts = (accounts.data ?? []).filter((a) => a.for_bill_line);
  const total = cents(lines.reduce((s, l) => s + (Number(l.amount) || 0), 0));
  const setLine = (key: string, patch: Partial<LineDraft>) => setLines((b) => b.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const input = {
    supplierId,
    supplierNoteNo: paperNo,
    noteDate: noteDate ?? "",
    dueDate,
    apAccountCode: apAccount === USUAL ? null : apAccount,
    narration: narration.trim() || null,
    lines: lines.map((l) => ({
      accountCode: l.accountCode,
      description: l.description,
      amount: Number(l.amount),
      departmentType: l.departmentType,
      departmentId: l.departmentId,
    })),
  };
  const checked = supplierDebitNoteDraftInput.safeParse(input);
  const dueBefore = !!dueDate && !!noteDate && dueDate < noteDate;
  const gap = !checked.success ? checked.error.issues[0]?.message ?? "Check the form"
    : dueBefore ? "The due date cannot be before the debit note's date"
    : null;

  const submit = () => {
    if (!checked.success || dueBefore) return;
    save.mutate({ id, input: checked.data }, {
      onSuccess: (r) => {
        toast.success("Debit note saved");
        navigate(`/finance/debit-notes/${r.id}`);
      },
      onError: (e) => toast.error(refusal(e)),
    });
  };
  // F3 or Ctrl+S saves, as on a bill — only once a draft has loaded and may be changed.
  useSaveKey(submit, gap === null && !save.isPending && (!id || existing.data?.can.edit === true));

  if (id && existing.isError) return <ReadFailed what="This debit note" onRetry={() => void existing.refetch()} />;
  if (id && !loaded) return <div className="p-6 text-body">Loading debit note…</div>;
  if (id && existing.data && !existing.data.can.edit) {
    return <div className="p-6 text-body">Only a draft debit note can be changed. <Link className={link} to={`/finance/debit-notes/${id}`}>Back to the debit note</Link></div>;
  }
  const supplier = (suppliers.data ?? []).find((s) => s.id === supplierId);
  const usual = roleAccount(chart.data, supplier?.kind === "other_creditor" ? "OTHER_PAYABLE" : "TRADE_PAYABLE");
  const apChoices = (accounts.data ?? []).filter((a) => a.for_ap);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SalesOrderTabs
        identity={id ? (existing.data?.note.note_no ?? "Draft debit note") : "New Debit Note"}
        customer={supplier?.name ?? null}
        backTo={id ? `/finance/debit-notes/${id}` : "/finance/debit-notes"}
        backLabel={id ? "Debit note" : "Debit Notes"}
        right={
          <span className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => navigate(id ? `/finance/debit-notes/${id}` : "/finance/debit-notes")}>Back</Button>
            <Button variant="primary" disabled={gap !== null} loading={save.isPending} onClick={submit} data-testid="save-debit-note">
              {gap ?? "Save"}
            </Button>
          </span>
        }
      />
      <div className="flex-1 overflow-auto p-4" data-testid="debit-note-form">
        <div className="flex max-w-[1100px] flex-col gap-4">
          <Facts title="Who sent this debit note">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Select id="debit-note-supplier" label="Supplier" value={supplierId || undefined} placeholder="Choose who sent this debit note"
                onValueChange={setSupplierId}
                options={(suppliers.data ?? []).map((s) => ({ value: s.id, label: `${s.name} · ${creditorKindWord(s.kind)}` }))} />
              <Input id="debit-note-paper" label="Supplier's debit note No" value={paperNo} maxLength={60}
                onChange={(e) => setPaperNo(e.target.value)} />
              <DatePicker id="debit-note-date" label="Date" value={noteDate} onChange={setNoteDate}
                hint="The date printed on the supplier's debit note. It is entered in that month." />
              <DatePicker id="debit-note-due" label="Due date" value={dueDate} onChange={setDueDate}
                minDate={noteDate ?? undefined} hint="When the supplier wants it paid. AP Aging can age it by this day." />
              <Select id="debit-note-ap" label="Payables account" value={apAccount} onValueChange={setApAccount}
                options={[
                  { value: USUAL, label: usual ? `${usual.code} ${usual.name} (usual)` : "The usual account" },
                  ...apChoices.map((a) => ({ value: a.code, label: `${a.code} ${a.name}` })),
                ]} />
              <Input id="debit-note-narration" label="Note" value={narration} maxLength={500}
                onChange={(e) => setNarration(e.target.value)} />
            </div>
          </Facts>
          <Facts title="Lines" right={<Button variant="ghost" icon="add" onClick={() => setLines((b) => [...b, newLine()])}>Add line</Button>}>
            <div className="flex flex-col gap-3" data-testid="debit-note-form-lines">
              {lines.map((l, i) => (
                <div key={l.key} className="grid grid-cols-1 items-end gap-2 md:grid-cols-[1.4fr_1fr_0.6fr_0.9fr_auto]" data-testid={`debit-note-line-${i + 1}`}>
                  <Input id={`dn-line-${l.key}-description`} label={`Line ${i + 1} · Description`} value={l.description} maxLength={200}
                    onChange={(e) => setLine(l.key, { description: e.target.value })} />
                  <Select id={`dn-line-${l.key}-account`} label="Account" value={l.accountCode || undefined} placeholder="Choose an account"
                    onValueChange={(v) => setLine(l.key, { accountCode: v })}
                    options={costAccounts.map((a) => ({ value: a.code, label: `${a.code} ${a.name}` }))} />
                  <Input id={`dn-line-${l.key}-amount`} label="Amount (RM)" type="number" inputMode="decimal" value={l.amount}
                    onChange={(e) => setLine(l.key, { amount: e.target.value })} />
                  <DepartmentPicker label={`Line ${i + 1} department`} type={l.departmentType} id={l.departmentId}
                    onChange={(c) => setLine(l.key, c)} />
                  <Button variant="ghost" disabled={lines.length === 1}
                    onClick={() => setLines((b) => b.filter((x) => x.key !== l.key))}>Remove</Button>
                </div>
              ))}
            </div>
            <p className="mt-3 text-strong" data-testid="debit-note-form-total">Total {money(total)}</p>
          </Facts>
        </div>
      </div>
    </div>
  );
}

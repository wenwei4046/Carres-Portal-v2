import { useEffect, useMemo, useState } from "react";
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import type { DepartmentType } from "@carres/shared";
import {
  supplierCreditNoteDraftInput,
  type SupplierCreditNoteDocument,
  type SupplierCreditNoteRegisterRow,
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
  useApBillOutstanding,
  useApSuppliers,
  useApplyCredit,
  useCreditNoteAct,
  useSaveCreditNote,
  useSupplierCreditNote,
  useSupplierCreditNotes,
  useTakeCreditOff,
} from "@/lib/payables-queries";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import SalesOrderTabs from "@/pages/operation/SalesOrderTabs";
import { roleAccount } from "@carres/shared/finance-ledger";
import { useLedgerChart } from "../ledger/ledger-queries";
import { useSaveKey } from "../save-key";
import { DepartmentName, DepartmentPicker } from "../department";
import { FactRow, Facts, FilesCard, HistoryCard, ReadFailed, ReasonModal } from "./PayablesParts";
import { asCredit, attachPages, formLines, ReadPaperButton, readPaperNotes } from "./ReadPaper";
import type { BillReadAnswer } from "@carres/shared/bill-reading";
import { ADVANCE_APPLICATION_STATUS_WORD, BILL_STATUS_WORD, cents, creditorKindWord, money, num, refusal, word } from "./payables-words";

/**
 * Finance → Payables → Credit notes (migration 0642; Chew 2026-10-03,
 * docs/finance/MASTER.md §3.2). A supplier's credit note, entered once:
 *   /finance/credit-notes            the register
 *   /finance/credit-notes/new        a new credit note
 *   /finance/credit-notes/:id        the note, with Confirm / Cancel / knock-offs / files / history
 *   /finance/credit-notes/:id/edit   change a draft
 *
 * Confirming posts it: Dr the payables account with the supplier as the party
 * (Carres owes less) · Cr each line's account, dated the note's date. Its
 * credit is then knocked off the supplier's bills, which posts nothing. The
 * database decides every rule; this page offers only what it says the person
 * may do (`can`).
 */
export default function SupplierCreditNotes() {
  return (
    <Routes>
      <Route index element={<CreditNoteRegister />} />
      <Route path="new" element={<CreditNoteForm />} />
      <Route path=":id" element={<CreditNoteDetail />} />
      <Route path=":id/edit" element={<CreditNoteForm />} />
    </Routes>
  );
}

const link = "text-kit-blue-11 underline underline-offset-2";
const noteNo = (n: { note_no: string | null }) => n.note_no ?? "Draft, no number yet";

// ── register ────────────────────────────────────────────────────────────────

function CreditNoteRegister() {
  const navigate = useNavigate();
  const query = useSupplierCreditNotes();
  const rows = query.data ?? [];
  const columns = useMemo<DataGridColumn<SupplierCreditNoteRegisterRow>[]>(() => [
    { key: "note", label: "Credit Note No", width: W.documentNo,
      accessor: (r) => <Link className={link} to={`/finance/credit-notes/${r.id}`}>{noteNo(r)}</Link>,
      searchValue: (r) => r.note_no ?? "", exportValue: noteNo },
    { key: "date", label: "Date", width: W.date, accessor: (r) => fmtDate(r.note_date),
      dateValue: (r) => r.note_date, filterType: "date", exportValue: (r) => r.note_date },
    { key: "supplier", label: "Supplier", width: 220, accessor: (r) => r.supplier_name,
      searchValue: (r) => r.supplier_name, filterType: "enum" },
    { key: "paper", label: "Supplier's credit note", headerLines: ["Supplier's", "credit note"], width: 130, accessor: (r) => r.supplier_note_no,
      searchValue: (r) => r.supplier_note_no },
    { key: "status", label: "Status", width: 110, accessor: (r) => word(BILL_STATUS_WORD, r.status),
      filterValue: (r) => word(BILL_STATUS_WORD, r.status), filterType: "enum" },
    { key: "total", label: "Total", width: W.amount, align: "right", accessor: (r) => money(r.total_amount),
      numberValue: (r) => num(r.total_amount), exportValue: (r) => num(r.total_amount) ?? "" },
    { key: "applied", label: "Knocked off", width: W.amount, align: "right",
      accessor: (r) => (r.status === "confirmed" ? money(r.applied_total) : ""),
      numberValue: (r) => num(r.applied_total), exportValue: (r) => num(r.applied_total) ?? "" },
    { key: "open", label: "Left to knock off", headerLines: ["Left to", "knock off"], width: W.amount, align: "right",
      accessor: (r) => (r.status === "confirmed" ? money(r.credit_open) : ""),
      numberValue: (r) => num(r.credit_open), exportValue: (r) => num(r.credit_open) ?? "" },
    { key: "files", label: "Files", width: W.qty, align: "right", accessor: (r) => String(r.file_count),
      numberValue: (r) => r.file_count },
  ], []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ModuleHeader destinationHeader testId="credit-notes-destination-header" word="Credit Notes" docTitle="Credit Notes · Carres" />
      {query.isError ? <ReadFailed what="Credit Notes" onRetry={() => void query.refetch()} /> : (
        <ListPageShell register>
          <DataGrid
            rows={rows}
            columns={columns}
            rowKey={(r) => r.id}
            rowTestId={(r) => `credit-note-row-${r.id}`}
            storageKey="carres.finance.credit-notes.v1"
            appearance="reference"
            exportName="Credit Notes"
            groupBanner={false}
            stickyIdentity
            isLoading={!query.isSuccess}
            wrapToolbar
            searchPlaceholder="Search credit notes…"
            toolbarStart={
              <Button variant="primary" shape="pill" icon="add" data-testid="new-credit-note" onClick={() => navigate("/finance/credit-notes/new")}>
                New Credit Note
              </Button>
            }
            emptyMessage="No credit note yet. A supplier's credit note appears here once it is entered."
            onRowDoubleClick={(r) => navigate(`/finance/credit-notes/${r.id}`)}
            statusSummary={(visible) => {
              const open = visible.filter((r) => r.status === "confirmed").reduce((s, r) => s + (num(r.credit_open) ?? 0), 0);
              return (
                <span data-testid="credit-notes-summary">
                  {visible.length} {visible.length === 1 ? "credit note" : "credit notes"} · {money(cents(open))} left to knock off
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

function CreditNoteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const query = useSupplierCreditNote(id);
  const act = useCreditNoteAct();
  const takeOff = useTakeCreditOff();
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [applying, setApplying] = useState(false);
  const [takingOff, setTakingOff] = useState<string | null>(null);
  const doc = query.data;

  if (query.isError) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <ModuleHeader destinationHeader testId="credit-notes-destination-header" word="Credit Notes" docTitle="Credit Notes · Carres" />
        <ReadFailed what="This credit note" onRetry={() => void query.refetch()} />
      </div>
    );
  }
  if (!doc || !id) return <div className="p-6 text-body">Loading credit note…</div>;
  const n = doc.note;
  const confirm = () => act.mutate({ id, act: "confirm" }, {
    onSuccess: () => { setConfirming(false); toast.success("Credit note confirmed"); },
    onError: (e) => toast.error(refusal(e)),
  });
  const cancel = (reason: string) => act.mutate({ id, act: "cancel", reason }, {
    onSuccess: () => { setCancelling(false); toast.success("Credit note cancelled"); },
    onError: (e) => toast.error(refusal(e)),
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SalesOrderTabs
        identity={n.note_no ?? "Draft credit note"}
        customer={n.supplier_name}
        backTo="/finance/credit-notes"
        backLabel="Credit Notes"
        docTitle={`${n.note_no ?? "Draft credit note"} · Carres`}
        status={<span data-testid="credit-note-status">{word(BILL_STATUS_WORD, n.status)}</span>}
        right={
          <span className="flex items-center gap-2">
            {doc.can.edit && <Button onClick={() => navigate(`/finance/credit-notes/${id}/edit`)} icon="edit">Edit</Button>}
            {doc.can.cancel && <Button onClick={() => setCancelling(true)}>Cancel credit note</Button>}
            {doc.can.confirm && <Button variant="primary" onClick={() => setConfirming(true)}>Confirm credit note</Button>}
          </span>
        }
      />
      <div className="flex-1 overflow-auto p-4" data-testid="credit-note-object-scroll">
        <div className="flex flex-col gap-4">
          <Facts title="Credit note facts">
            <FactRow label="Supplier">{n.supplier_name} · {creditorKindWord(n.supplier_kind)}</FactRow>
            <FactRow label="Supplier's credit note">{n.supplier_note_no}</FactRow>
            <FactRow label="Date">{fmtDate(n.note_date)}</FactRow>
            <FactRow label="Payables account">{n.ap_account_code} {n.ap_account_name ?? ""}</FactRow>
            <FactRow label="Total">{money(n.total_amount)}</FactRow>
            <FactRow label="Knocked off">{n.status === "confirmed" ? money(doc.applied_total) : "Not confirmed"}</FactRow>
            <FactRow label="Left to knock off">{n.status === "confirmed" ? money(doc.credit_open) : "Not confirmed"}</FactRow>
            {n.narration && <FactRow label="Note">{n.narration}</FactRow>}
            <FactRow label="Ledger entry">
              {n.entry_no ?? "None yet. Confirming the credit note makes it"}
              {n.reversal_entry_no ? ` · reversed by ${n.reversal_entry_no}` : ""}
            </FactRow>
            {n.status === "cancelled" && (
              <FactRow label="Cancelled">
                {fmtDate(n.cancelled_at, { time: true })} · {n.cancelled_by_name ?? "Name not available"} · {n.cancel_reason ?? "No reason on file"}
              </FactRow>
            )}
          </Facts>
          <LinesCard doc={doc} />
          <Facts
            title="Knocked off bills"
            testId="credit-note-applications"
            right={doc.can.apply ? <Button variant="primary" onClick={() => setApplying(true)}>Knock off a bill</Button> : undefined}
          >
            {doc.applications.length === 0
              ? <p>{n.status === "confirmed" ? "Not knocked off any bill yet." : "A credit note is knocked off bills once it is confirmed."}</p>
              : doc.applications.map((a) => (
                <p key={a.application_id} data-testid={`credit-note-application-${a.application_id}`}>
                  <Link className={link} to={`/finance/bills/${a.bill_id}`}>{a.bill_no ?? a.supplier_invoice_no}</Link>
                  {" · "}{word(ADVANCE_APPLICATION_STATUS_WORD, a.status)} · {fmtDate(a.applied_on)} · {money(a.amount)}
                  {a.status === "cancelled" && a.cancel_reason ? ` · ${a.cancel_reason}` : ""}
                  {doc.can.take_off && a.status === "applied" && (
                    <>
                      {" "}
                      <Button size="sm" variant="ghost" onClick={() => setTakingOff(a.application_id)}>Take off the bill</Button>
                    </>
                  )}
                </p>
              ))}
          </Facts>
          <FilesCard kind="credit-notes" id={id} files={doc.files} canAdd={doc.can.add_file} />
          <HistoryCard events={doc.events} />
        </div>
      </div>
      <Modal
        open={confirming}
        onOpenChange={(o) => { if (!o) setConfirming(false); }}
        title="Confirm this credit note?"
        description={`${money(n.total_amount)} comes off what Carres owes ${n.supplier_name}, dated ${fmtDate(n.note_date)}. A confirmed credit note cannot be edited.`}
        footer={
          <span className="flex gap-2">
            <Button variant="ghost" onClick={() => setConfirming(false)}>Back</Button>
            <Button variant="primary" loading={act.isPending} onClick={confirm}>Confirm credit note</Button>
          </span>
        }
      >
        <p className="text-body">Check the lines against the supplier's credit note first.</p>
      </Modal>
      <ReasonModal
        open={cancelling}
        title="Cancel this credit note?"
        description={n.status === "confirmed"
          ? "The ledger entry is reversed on the credit note's date. A credit note still knocked off a bill cannot be cancelled."
          : "The draft is kept, marked cancelled."}
        action="Cancel credit note"
        busy={act.isPending}
        onClose={() => setCancelling(false)}
        onSubmit={cancel}
      />
      <ReasonModal
        open={takingOff !== null}
        title="Take this credit note off the bill?"
        description="Nothing is entered in the ledger. The bill is unpaid again by this amount, and the credit is left to knock off."
        action="Take off the bill"
        busy={takeOff.isPending}
        onClose={() => setTakingOff(null)}
        onSubmit={(reason) => takingOff && takeOff.mutate({ applicationId: takingOff, reason }, {
          onSuccess: () => { setTakingOff(null); toast.success("Credit note taken off the bill"); },
          onError: (e) => toast.error(refusal(e)),
        })}
      />
      {applying && <KnockOffModal doc={doc} onClose={() => setApplying(false)} />}
    </div>
  );
}

type NoteLine = SupplierCreditNoteDocument["lines"][number];

const LINE_COLUMNS: readonly Column<NoteLine>[] = [
  { key: "description", label: "Description", width: "auto", cell: (l) => l.description },
  { key: "account", label: "Account", width: "260px", cell: (l) => `${l.account_code} ${l.account_name ?? "Account name not available"}` },
  { key: "department", label: "Department", width: "180px", cell: (l) => <DepartmentName type={l.department_type} id={l.department_id} /> },
  { key: "amount", label: "Amount", width: "140px", align: "right", numeric: true, cell: (l) => money(l.amount) },
];

function LinesCard({ doc }: { doc: SupplierCreditNoteDocument }) {
  return (
    <Facts title="Lines">
      <DataTable label="Credit note lines" testId="credit-note-lines" rows={doc.lines} columns={LINE_COLUMNS}
        rowId={(l) => String(l.line_no)} empty="This credit note has no lines."
        totals={{ label: "Total", cell: (c) => (c.key === "description" ? "Total" : c.key === "amount" ? money(doc.note.total_amount) : null) }} />
    </Facts>
  );
}

/** Choose one of the supplier's confirmed bills on the same payables account,
 *  and how much of the credit comes off it. Posts nothing. */
function KnockOffModal({ doc, onClose }: { doc: SupplierCreditNoteDocument; onClose: () => void }) {
  const n = doc.note;
  const bills = useApBillOutstanding(n.supplier_id);
  const apply = useApplyCredit();
  const open = (bills.data ?? []).filter((b) => b.ap_account_code === n.ap_account_code && (num(b.unallocated) ?? 0) > 0);
  const [billId, setBillId] = useState("");
  const [amount, setAmount] = useState("");
  const bill = open.find((b) => b.bill_id === billId);
  const left = num(doc.credit_open) ?? 0;
  const cap = bill ? cents(Math.min(left, num(bill.unallocated) ?? 0)) : left;
  const value = Number(amount);
  const gap = !bill ? "Choose a bill"
    : !(value > 0) ? "Type the amount"
    : value > cap ? `At most ${money(cap)}`
    : null;
  const submit = () => {
    if (gap) return;
    apply.mutate({ noteId: n.id, input: { billId, amount: cents(value) } }, {
      onSuccess: () => { toast.success("Credit note knocked off the bill"); onClose(); },
      onError: (e) => toast.error(refusal(e)),
    });
  };
  return (
    <Modal
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title="Knock off a bill"
      description={`${money(left)} of ${n.note_no ?? "this credit note"} is left. Nothing is entered in the ledger; the bill owes less.`}
      footer={
        <span className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>Back</Button>
          <Button variant="primary" disabled={gap !== null} loading={apply.isPending} onClick={submit}>{gap ?? "Knock off"}</Button>
        </span>
      }
    >
      <div className="flex flex-col gap-3" data-testid="knock-off-form">
        {bills.isError ? <p className="text-body">The supplier's bills could not be loaded. Try again.</p>
        : !bills.isSuccess ? <p className="text-body">Loading bills…</p>
        : open.length === 0 ? <p className="text-body">This supplier has no bill left to pay on account {n.ap_account_code}.</p>
        : (
          <Select id="knock-off-bill" label="Bill" value={billId || undefined} placeholder="Choose a bill"
            onValueChange={(v) => {
              setBillId(v);
              const b = open.find((x) => x.bill_id === v);
              if (b) setAmount(String(cents(Math.min(left, num(b.unallocated) ?? 0))));
            }}
            options={open.map((b) => ({
              value: b.bill_id,
              label: `${b.bill_no ?? b.supplier_invoice_no} · ${fmtDate(b.bill_date)} · ${money(b.unallocated)} left to pay`,
            }))} />
        )}
        <Input id="knock-off-amount" label="Amount (RM)" type="number" inputMode="decimal" value={amount}
          onChange={(e) => setAmount(e.target.value)} hint={bill ? `At most ${money(cap)}` : undefined} />
      </div>
    </Modal>
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
  return { key: `cn${lineSeq}`, accountCode: "", description: "", amount: "", departmentType: null, departmentId: null };
};

function CreditNoteForm() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const existing = useSupplierCreditNote(id);
  const suppliers = useApSuppliers();
  const accounts = useApAccounts();
  const chart = useLedgerChart();
  const save = useSaveCreditNote();

  const [supplierId, setSupplierId] = useState(params.get("supplier") ?? "");
  const [paperNo, setPaperNo] = useState("");
  const [noteDate, setNoteDate] = useState<string | null>(appTodayIso());
  // USUAL: the payables account a bill from this supplier takes by default.
  const [apAccount, setApAccount] = useState(USUAL);
  const [narration, setNarration] = useState("");
  const [lines, setLines] = useState<LineDraft[]>(() => [newLine()]);
  const [loaded, setLoaded] = useState(!id);
  // The pages read with "Read the credit note", attached once it is saved.
  const [read, setRead] = useState<{ files: File[]; notes: string[] } | null>(null);

  // Editing a draft: the form starts from the note as saved.
  useEffect(() => {
    const d = existing.data;
    if (!id || loaded || !d) return;
    setSupplierId(d.note.supplier_id);
    setPaperNo(d.note.supplier_note_no);
    setNoteDate(d.note.note_date);
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

  const creditAccounts = (accounts.data ?? []).filter((a) => a.for_credit_line);
  const kindOf = (code: string) => creditAccounts.find((a) => a.code === code)?.kind;
  const total = cents(lines.reduce((s, l) => s + (Number(l.amount) || 0), 0));
  const setLine = (key: string, patch: Partial<LineDraft>) => setLines((b) => b.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const input = {
    supplierId,
    supplierNoteNo: paperNo,
    noteDate: noteDate ?? "",
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
  const checked = supplierCreditNoteDraftInput.safeParse(input);
  const gap = checked.success ? null : checked.error.issues[0]?.message ?? "Check the form";

  const submit = () => {
    if (!checked.success) return;
    save.mutate({ id, input: checked.data }, {
      onSuccess: async (r) => {
        toast.success("Credit note saved");
        if (read && !(await attachPages("credit-notes", r.id, read.files))) {
          toast.error("The credit note is saved, but a page that was read could not be attached. Attach it on the credit note.");
        }
        navigate(`/finance/credit-notes/${r.id}`);
      },
      onError: (e) => toast.error(refusal(e)),
    });
  };

  /** What "Read the credit note" found fills only what the form does not have yet. */
  const applyReading = (raw: BillReadAnswer, files: File[]) => {
    const answer = asCredit(raw);
    const r = answer.reading;
    if (supplierId === "" && answer.supplier) setSupplierId(answer.supplier.id);
    if (paperNo.trim() === "" && r.invoiceNumber) setPaperNo(r.invoiceNumber);
    if (r.invoiceDate) setNoteDate(r.invoiceDate);
    const linesKept = lines.some((l) => l.description.trim() !== "" || l.amount.trim() !== "");
    const taken = formLines(answer);
    if (!linesKept && taken.length > 0) setLines(taken.map((l) => ({ ...newLine(), ...l })));
    setRead({ files, notes: readPaperNotes(answer, { pages: files.length, expect: "credit_note", linesKept }) });
  };
  // F3 or Ctrl+S saves, as on a bill — only once a draft has loaded and may be changed.
  useSaveKey(submit, gap === null && !save.isPending && (!id || existing.data?.can.edit === true));

  if (id && existing.isError) return <ReadFailed what="This credit note" onRetry={() => void existing.refetch()} />;
  if (id && !loaded) return <div className="p-6 text-body">Loading credit note…</div>;
  if (id && existing.data && !existing.data.can.edit) {
    return <div className="p-6 text-body">Only a draft credit note can be changed. <Link className={link} to={`/finance/credit-notes/${id}`}>Back to the credit note</Link></div>;
  }
  const supplier = (suppliers.data ?? []).find((s) => s.id === supplierId);
  const usual = roleAccount(chart.data, supplier?.kind === "other_creditor" ? "OTHER_PAYABLE" : "TRADE_PAYABLE");
  const apChoices = (accounts.data ?? []).filter((a) => a.for_ap);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SalesOrderTabs
        identity={id ? (existing.data?.note.note_no ?? "Draft credit note") : "New Credit Note"}
        customer={supplier?.name ?? null}
        backTo={id ? `/finance/credit-notes/${id}` : "/finance/credit-notes"}
        backLabel={id ? "Credit note" : "Credit Notes"}
        right={
          <span className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => navigate(id ? `/finance/credit-notes/${id}` : "/finance/credit-notes")}>Back</Button>
            <Button variant="primary" disabled={gap !== null} loading={save.isPending} onClick={submit} data-testid="save-credit-note">
              {gap ?? "Save"}
            </Button>
          </span>
        }
      />
      <div className="flex-1 overflow-auto p-4" data-testid="credit-note-form">
        <div className="flex max-w-[1100px] flex-col gap-4">
          <Facts title="Who sent this credit note"
            right={<ReadPaperButton label="Read the credit note" testId="read-credit-note" onRead={applyReading} />}>
            {read && (
              <ul className="mb-3 list-disc pl-5 text-body" data-testid="credit-note-read-notes">
                {read.notes.map((n) => <li key={n}>{n}</li>)}
              </ul>
            )}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Select id="credit-note-supplier" label="Supplier" value={supplierId || undefined} placeholder="Choose who sent this credit note"
                onValueChange={setSupplierId}
                options={(suppliers.data ?? []).map((s) => ({ value: s.id, label: `${s.name} · ${creditorKindWord(s.kind)}` }))} />
              <Input id="credit-note-paper" label="Supplier's credit note No" value={paperNo} maxLength={60}
                onChange={(e) => setPaperNo(e.target.value)} />
              <DatePicker id="credit-note-date" label="Date" value={noteDate} onChange={setNoteDate}
                hint="The date printed on the supplier's credit note. It is entered in that month." />
              <Select id="credit-note-ap" label="Payables account" value={apAccount} onValueChange={setApAccount}
                hint="Knocked off only bills on the same payables account."
                options={[
                  { value: USUAL, label: usual ? `${usual.code} ${usual.name} (usual)` : "The usual account" },
                  ...apChoices.map((a) => ({ value: a.code, label: `${a.code} ${a.name}` })),
                ]} />
              <Input id="credit-note-narration" label="Note" value={narration} maxLength={500}
                onChange={(e) => setNarration(e.target.value)} />
            </div>
          </Facts>
          <Facts title="Lines" right={<Button variant="ghost" icon="add" onClick={() => setLines((b) => [...b, newLine()])}>Add line</Button>}>
            <div className="flex flex-col gap-3" data-testid="credit-note-form-lines">
              {lines.map((l, i) => (
                <div key={l.key} className="grid grid-cols-1 items-end gap-2 md:grid-cols-[1.4fr_1fr_0.6fr_0.9fr_auto]" data-testid={`credit-note-line-${i + 1}`}>
                  <Input id={`cn-line-${l.key}-description`} label={`Line ${i + 1} · Description`} value={l.description} maxLength={200}
                    onChange={(e) => setLine(l.key, { description: e.target.value })} />
                  <Select id={`cn-line-${l.key}-account`} label="Account" value={l.accountCode || undefined} placeholder="Choose an account"
                    onValueChange={(v) => setLine(l.key, { accountCode: v })}
                    options={creditAccounts.map((a) => ({ value: a.code, label: `${a.code} ${a.name}` }))} />
                  <Input id={`cn-line-${l.key}-amount`} label="Amount (RM)" type="number" inputMode="decimal" value={l.amount}
                    onChange={(e) => setLine(l.key, { amount: e.target.value })} />
                  <DepartmentPicker label={`Line ${i + 1} department`} type={l.departmentType} id={l.departmentId}
                    income={kindOf(l.accountCode) === "INCOME"}
                    onChange={(c) => setLine(l.key, c)} />
                  <Button variant="ghost" disabled={lines.length === 1}
                    onClick={() => setLines((b) => b.filter((x) => x.key !== l.key))}>Remove</Button>
                </div>
              ))}
            </div>
            <p className="mt-3 text-strong" data-testid="credit-note-form-total">Total {money(total)}</p>
          </Facts>
        </div>
      </div>
    </div>
  );
}

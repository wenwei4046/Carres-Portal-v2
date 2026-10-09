import { useMemo, useState } from "react";
import { Link, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import type { SupplierNoteFollowup } from "@carres/shared/schemas/finance-ap";
import Button from "@/components/kit/Button";
import DatePicker from "@/components/kit/DatePicker";
import Input from "@/components/kit/Input";
import Modal from "@/components/kit/Modal";
import Select from "@/components/kit/Select";
import Textarea from "@/components/kit/Textarea";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { REGISTER_FIELD_WIDTH as W } from "@/components/register/register-field-widths";
import { appTodayIso, fmtDate } from "@/lib/fmt-date";
import {
  useAddNoteContact,
  useAddNoteToFollowUp,
  useApSuppliers,
  useCloseNoteToFollowUp,
  useNoteToFollowUp,
  useNotesToFollowUp,
  useTakeNoteSettlementOff,
} from "@/lib/payables-queries";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import SalesOrderTabs from "@/pages/operation/SalesOrderTabs";
import { FactRow, Facts, ReadFailed, ReasonModal } from "./PayablesParts";
import {
  NOTE_KIND_WORD,
  NOTE_REASON_WORD,
  NOTE_STATUS_WORD,
  cents,
  money,
  num,
  priceDiffWord,
  refusal,
  word,
} from "./payables-words";

/**
 * Finance → Payables → Notes to follow up (migration 0676; Chew 2026-10-06,
 * 2026-10-07 and 2026-10-09, docs/finance/MASTER.md §3.2). The credit and
 * debit notes suppliers still owe:
 *   /finance/notes-to-follow-up       the list, in three groups
 *   /finance/notes-to-follow-up/:id   one note: its follow-ups, what settled it, Close
 * A reminder only: nothing here posts to the ledger. A bill's line is marked
 * on its bill, a credit note settles notes on its own page, and a purchase
 * return on billed goods adds its own. The database decides every rule.
 */
export default function NotesToFollowUp() {
  return (
    <Routes>
      <Route index element={<NotesRegister />} />
      <Route path=":id" element={<NoteDetail />} />
    </Routes>
  );
}

const link = "text-kit-blue-11 underline underline-offset-2";

type Group = "today" | "waiting" | "done";
const GROUPS: { key: Group; label: string }[] = [
  { key: "today", label: "Follow up today" },
  { key: "waiting", label: "Waiting" },
  { key: "done", label: "Settled or closed" },
];

const isOpen = (n: Pick<SupplierNoteFollowup, "status">) => n.status === "waiting" || n.status === "part";

/** Its group: done once settled or closed; otherwise today when its next
 *  follow-up is today or earlier, or not set yet. */
export function noteGroup(n: Pick<SupplierNoteFollowup, "status" | "next_follow_up_on">, today: string): Group {
  if (!isOpen(n)) return "done";
  return !n.next_follow_up_on || n.next_follow_up_on <= today ? "today" : "waiting";
}

/** Where the note came from, in words. */
export function noteFromWord(
  n: Pick<SupplierNoteFollowup, "reason" | "bill_no" | "supplier_invoice_no" | "line_no" | "pr_no">,
): string {
  if (n.reason === "PRICE") return `${n.bill_no ?? n.supplier_invoice_no ?? "Bill"} · line ${n.line_no ?? ""}`.trim();
  if (n.reason === "RETURN") return n.pr_no ?? "Purchase return";
  return "Added by hand";
}

// ── the list ────────────────────────────────────────────────────────────────

function NotesRegister() {
  const navigate = useNavigate();
  const query = useNotesToFollowUp();
  const [adding, setAdding] = useState(false);
  const today = query.data?.today ?? appTodayIso();
  const rows = query.data?.rows ?? [];
  const columns = useMemo<DataGridColumn<SupplierNoteFollowup>[]>(() => [
    { key: "supplier", label: "Supplier", width: 200, accessor: (r) => r.supplier_name,
      searchValue: (r) => r.supplier_name, filterType: "enum" },
    { key: "kind", label: "Note", width: 110, accessor: (r) => word(NOTE_KIND_WORD, r.kind),
      filterValue: (r) => word(NOTE_KIND_WORD, r.kind), filterType: "enum" },
    { key: "why", label: "Why", width: 180, accessor: (r) => word(NOTE_REASON_WORD, r.reason),
      filterValue: (r) => word(NOTE_REASON_WORD, r.reason), filterType: "enum" },
    { key: "from", label: "From", width: 200, accessor: noteFromWord,
      searchValue: (r) => [noteFromWord(r), r.remark, r.grn_no, r.po_id].filter(Boolean).join(" ") },
    { key: "amount", label: "Amount", width: W.amount, align: "right", accessor: (r) => money(r.amount),
      numberValue: (r) => num(r.amount), exportValue: (r) => num(r.amount) ?? "" },
    { key: "left", label: "Left", width: W.amount, align: "right", accessor: (r) => money(r.left),
      numberValue: (r) => num(r.left), exportValue: (r) => num(r.left) ?? "" },
    { key: "next", label: "Next follow-up", headerLines: ["Next", "follow-up"], width: W.date,
      accessor: (r) => (!isOpen(r) ? "" : r.next_follow_up_on ? fmtDate(r.next_follow_up_on) : "Not set"),
      dateValue: (r) => r.next_follow_up_on, filterType: "date", exportValue: (r) => r.next_follow_up_on ?? "" },
    { key: "last", label: "Last follow-up", width: 280,
      accessor: (r) => (r.last_contact ? `${fmtDate(r.last_contact.contacted_on)} · ${r.last_contact.said}` : "Not followed up yet"),
      searchValue: (r) => r.last_contact?.said ?? "" },
    { key: "status", label: "Status", width: 120, accessor: (r) => word(NOTE_STATUS_WORD, r.status),
      filterValue: (r) => word(NOTE_STATUS_WORD, r.status), filterType: "enum" },
  ], []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ModuleHeader destinationHeader testId="notes-destination-header" word="Notes to follow up" docTitle="Notes to follow up · Carres" />
      {query.isError ? <ReadFailed what="Notes to follow up" onRetry={() => void query.refetch()} /> : (
        <ListPageShell register>
          <DataGrid
            rows={rows}
            columns={columns}
            rowKey={(r) => r.id}
            rowTestId={(r) => `note-row-${r.id}`}
            storageKey="carres.finance.notes-to-follow-up.v1"
            appearance="reference"
            exportName="Notes to follow up"
            groupBanner={false}
            allowColumnGrouping={false}
            fixedGroups={{ groups: GROUPS, groupOf: (r) => noteGroup(r, today), revealMatches: true }}
            isLoading={!query.isSuccess}
            wrapToolbar
            searchPlaceholder="Search notes…"
            toolbarStart={
              <Button variant="primary" shape="pill" icon="add" data-testid="add-note" onClick={() => setAdding(true)}>
                Add a note
              </Button>
            }
            emptyMessage="No supplier owes a note. Mark a bill's line from the bill, or add one here."
            onRowClick={(r) => navigate(`/finance/notes-to-follow-up/${r.id}`)}
            statusSummary={(visible) => {
              const credit = visible.filter((r) => r.kind === "CREDIT" && isOpen(r)).reduce((s, r) => s + (num(r.left) ?? 0), 0);
              return (
                <span data-testid="notes-summary">
                  {visible.length} {visible.length === 1 ? "note" : "notes"} · {money(cents(credit))} of credit notes still to come · A reminder only: nothing here posts to the ledger.
                </span>
              );
            }}
          />
        </ListPageShell>
      )}
      {adding && <AddNoteModal onClose={() => setAdding(false)} />}
    </div>
  );
}

/** A note no bill line or purchase return shows: typed by hand (Other). */
function AddNoteModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const suppliers = useApSuppliers();
  const add = useAddNoteToFollowUp();
  const [supplierId, setSupplierId] = useState("");
  const [kind, setKind] = useState<"CREDIT" | "DEBIT">("CREDIT");
  const [amount, setAmount] = useState("");
  const [remark, setRemark] = useState("");
  const [nextOn, setNextOn] = useState<string | null>(null);
  const value = Number(amount);
  // The Receiving button law: the disabled Save names its gap.
  const gap = !supplierId ? "Save: choose the supplier"
    : !(value > 0) || cents(value) !== value ? "Save: type the amount"
    : !remark.trim() ? "Save: say what it is for"
    : null;
  const submit = () => {
    if (gap) return;
    add.mutate({ reason: "OTHER", kind, supplierId, amount: cents(value), remark: remark.trim(), nextOn }, {
      onSuccess: (r) => { toast.success("Note added"); onClose(); navigate(`/finance/notes-to-follow-up/${r.id}`); },
      onError: (e) => toast.error(refusal(e)),
    });
  };
  return (
    <Modal
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title="Add a note to follow up"
      description="A credit or debit note the supplier owes that no bill line or purchase return shows. A reminder only: it posts nothing."
      footer={
        <span className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={gap !== null} loading={add.isPending} onClick={submit}>{gap ?? "Save"}</Button>
        </span>
      }
    >
      <div className="flex flex-col gap-3" data-testid="add-note-form">
        <Select id="note-supplier" label="Supplier" required value={supplierId || undefined} placeholder="Choose"
          onValueChange={setSupplierId}
          options={(suppliers.data ?? []).map((s) => ({ value: s.id, label: s.name }))} />
        <Select id="note-kind" label="Note" required value={kind} onValueChange={(v) => setKind(v as "CREDIT" | "DEBIT")}
          options={[{ value: "CREDIT", label: NOTE_KIND_WORD.CREDIT! }, { value: "DEBIT", label: NOTE_KIND_WORD.DEBIT! }]} />
        <Input id="note-amount" label="Amount (RM)" required type="number" inputMode="decimal" value={amount}
          onChange={(e) => setAmount(e.target.value)} />
        <Textarea id="note-remark" label="What it is for" required rows={2} maxLength={500} value={remark}
          onChange={(e) => setRemark(e.target.value)} />
        <DatePicker id="note-next" label="Next follow-up" minDate={appTodayIso()} value={nextOn} onChange={setNextOn} />
      </div>
    </Modal>
  );
}

// ── one note ────────────────────────────────────────────────────────────────

function NoteDetail() {
  const { id } = useParams<{ id: string }>();
  const query = useNoteToFollowUp(id);
  const close = useCloseNoteToFollowUp();
  const takeOff = useTakeNoteSettlementOff();
  const [contacting, setContacting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [takingOff, setTakingOff] = useState<string | null>(null);
  const doc = query.data;

  if (query.isError) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <ModuleHeader destinationHeader testId="notes-destination-header" word="Notes to follow up" docTitle="Notes to follow up · Carres" />
        <ReadFailed what="This note" onRetry={() => void query.refetch()} />
      </div>
    );
  }
  if (!doc || !id) return <div className="p-6 text-body">Loading note…</div>;
  const n = doc.followup;
  const open = isOpen(n);
  const kindWord = word(NOTE_KIND_WORD, n.kind);
  const diff = n.line_unit_price !== null && n.po_unit_cost !== null
    ? cents((num(n.line_unit_price) ?? 0) - (num(n.po_unit_cost) ?? 0)) : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SalesOrderTabs
        identity={`${kindWord} to follow up`}
        customer={n.supplier_name}
        backTo="/finance/notes-to-follow-up"
        backLabel="Notes to follow up"
        docTitle={`${kindWord} to follow up · Carres`}
        status={<span data-testid="note-status">{word(NOTE_STATUS_WORD, n.status)}</span>}
        right={open ? (
          <span className="flex items-center gap-2">
            <Button onClick={() => setClosing(true)}>Close note</Button>
            <Button variant="primary" onClick={() => setContacting(true)}>Record a follow-up</Button>
          </span>
        ) : undefined}
      />
      <div className="flex-1 overflow-auto p-4" data-testid="note-object-scroll">
        <div className="flex flex-col gap-4">
          <Facts title="Note facts">
            <FactRow label="Supplier">{n.supplier_name}</FactRow>
            <FactRow label="Note">{kindWord}</FactRow>
            <FactRow label="Why">{word(NOTE_REASON_WORD, n.reason)}</FactRow>
            <FactRow label="From">
              {n.reason === "PRICE" && n.bill_id
                ? <Link className={link} to={`/finance/bills/${n.bill_id}`}>{noteFromWord(n)}</Link>
                : noteFromWord(n)}
            </FactRow>
            {n.reason === "PRICE" && (
              <FactRow label="Line">
                {n.line_item ?? "No description"} · {num(n.line_qty) ?? 0} at {money(n.line_unit_price)} · {priceDiffWord(diff)}
              </FactRow>
            )}
            {(n.grn_no || n.po_id) && <FactRow label="GRN and PO">{[n.grn_no, n.po_id].filter(Boolean).join(" · ")}</FactRow>}
            <FactRow label="Amount">{money(n.amount)}</FactRow>
            <FactRow label="Settled">{money(n.settled)}</FactRow>
            <FactRow label="Left">{money(n.left)}</FactRow>
            <FactRow label="Noted on">{fmtDate(n.noted_on)}</FactRow>
            {open && <FactRow label="Next follow-up">{n.next_follow_up_on ? fmtDate(n.next_follow_up_on) : "Not set"}</FactRow>}
            {n.remark && <FactRow label="Remark">{n.remark}</FactRow>}
            <FactRow label="Added by">{n.created_by_name ?? "Added by itself from the purchase return"}</FactRow>
            {n.status === "closed" && (
              <FactRow label="Closed">
                {fmtDate(n.closed_at, { time: true })} · {n.closed_by_name ?? "Name not available"} · {n.close_reason ?? "No reason on file"}
              </FactRow>
            )}
          </Facts>
          <Facts title="Follow-ups" testId="note-contacts">
            {doc.contacts.length === 0
              ? <p>Not followed up yet.</p>
              : doc.contacts.map((c) => (
                <p key={c.id}>{fmtDate(c.contacted_on)} · {c.said} · {c.created_by_name ?? "Name not available"}</p>
              ))}
          </Facts>
          <Facts title="Settled by" testId="note-settlements">
            {doc.settlements.length === 0
              ? <p>{n.kind === "CREDIT"
                ? "No credit note has settled it yet. Settle it from the supplier's credit note."
                : "A debit note owed is closed with a reason until supplier debit notes are built."}</p>
              : doc.settlements.map((s) => (
                <p key={s.id} data-testid={`note-settlement-${s.id}`}>
                  <Link className={link} to={`/finance/credit-notes/${s.credit_note_id}`}>{s.note_no ?? s.supplier_note_no}</Link>
                  {" · "}{money(s.amount)} · {fmtDate(s.created_at)}
                  {s.taken_off_at ? ` · Taken off · ${s.take_off_reason ?? "No reason on file"}`
                    : s.note_status === "cancelled" ? " · Credit note cancelled" : ""}
                  {s.counts && (
                    <>
                      {" "}
                      <Button size="sm" variant="ghost" onClick={() => setTakingOff(s.id)}>Take off</Button>
                    </>
                  )}
                </p>
              ))}
          </Facts>
        </div>
      </div>
      {contacting && <ContactModal id={id} onClose={() => setContacting(false)} />}
      <ReasonModal
        open={closing}
        title="Close this note?"
        description="It leaves the notes still owed. Say why, for example the supplier refused or replaced the goods."
        action="Close note"
        busy={close.isPending}
        onClose={() => setClosing(false)}
        onSubmit={(reason) => close.mutate({ id, reason }, {
          onSuccess: () => { setClosing(false); toast.success("Note closed"); },
          onError: (e) => toast.error(refusal(e)),
        })}
      />
      <ReasonModal
        open={takingOff !== null}
        title="Take this credit note off the note?"
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
    </div>
  );
}

/** A follow-up: the day, what the supplier said, and the next day. */
function ContactModal({ id, onClose }: { id: string; onClose: () => void }) {
  const add = useAddNoteContact();
  const today = appTodayIso();
  const [contactedOn, setContactedOn] = useState<string | null>(today);
  const [said, setSaid] = useState("");
  const [nextOn, setNextOn] = useState<string | null>(null);
  const gap = !contactedOn ? "Save: pick the day"
    : contactedOn > today ? "Save: the day cannot be after today"
    : !said.trim() ? "Save: say what the supplier said"
    : nextOn && nextOn < contactedOn ? "Save: the next follow-up is before this one"
    : null;
  const submit = () => {
    if (gap || !contactedOn) return;
    add.mutate({ id, input: { contactedOn, said: said.trim(), nextOn } }, {
      onSuccess: () => { toast.success("Follow-up recorded"); onClose(); },
      onError: (e) => toast.error(refusal(e)),
    });
  };
  return (
    <Modal
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title="Record a follow-up"
      description="Leave the next follow-up empty to stop the reminders."
      footer={
        <span className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={gap !== null} loading={add.isPending} onClick={submit}>{gap ?? "Save"}</Button>
        </span>
      }
    >
      <div className="flex flex-col gap-3" data-testid="note-contact-form">
        <DatePicker id="note-contacted-on" label="Day" required value={contactedOn} onChange={setContactedOn} />
        <Textarea id="note-said" label="What the supplier said" required rows={3} maxLength={1000} value={said}
          onChange={(e) => setSaid(e.target.value)} />
        <DatePicker id="note-next-on" label="Next follow-up" minDate={contactedOn ?? today} value={nextOn} onChange={setNextOn} />
      </div>
    </Modal>
  );
}

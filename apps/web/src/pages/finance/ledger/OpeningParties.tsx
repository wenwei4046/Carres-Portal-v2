/**
 * Opening balances → Customers and other debtors · Suppliers (migration 0705;
 * Chew 2026-10-22, 「先输入总数，再输入每张欠的钱，两边应该tally」 and
 * 「opening balance 可以 post 先，只是要 remark 有 different」).
 *
 * Each party: its total first, posted on its control account with the party,
 * then each invoice or bill still open (document no, date, due date, amount),
 * which AR / AP Aging age by its due date once posted. A party whose items do
 * not tally still posts; its row's Remark shows the difference, and the part
 * not covered stays `Not tied to an invoice` / `Not tied to a bill` there.
 *
 * A row opens its window on a double click (the kit's; rows carry no
 * buttons); `Show open items` lists its items under it.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  openingSen,
  partyDiffers,
  readOpeningAmount,
  type OpeningAnswer,
  type OpeningPartyType,
  type OpeningPartyWire,
} from "@carres/shared/opening-balances";
import Button from "@/components/kit/Button";
import DataTable, { type Column } from "@/components/kit/DataTable";
import DatePicker from "@/components/kit/DatePicker";
import { FieldError } from "@/components/kit/FieldFrame";
import Input from "@/components/kit/Input";
import Modal from "@/components/kit/Modal";
import Select from "@/components/kit/Select";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import { refusal } from "../payables/payables-words";
import { amountCell, FINANCE_WIDTH } from "../finance-widths";
import { useFinancePersonalLayouts } from "../finance-layouts";
import { useRemoveOpeningParty, useSaveOpeningParty } from "./opening-balances-queries";

type Side = "debtors" | "suppliers";

const TYPE_WORD: Record<OpeningPartyType, string> = { CUSTOMER: "Customer", OTHER: "Other debtor", SUPPLIER: "Supplier" };
const AMOUNT = FINANCE_WIDTH.amount;
const sumSen = (vals: Array<number | string>) => vals.reduce<number>((t, v) => t + openingSen(v), 0) / 100;

/** The Remark a party row carries when its open items do not add up to its total. */
export function partyRemark(p: Pick<OpeningPartyWire, "difference">): string {
  return partyDiffers(p) ? `Open items differ from the total by ${rm(openingSen(p.difference) / 100)}` : "";
}

export default function OpeningParties({ answer: a, side, reread }: { answer: OpeningAnswer; side: Side; reread: () => void }) {
  const personalLayouts = useFinancePersonalLayouts(side === "debtors" ? "finance_opening_debtors" : "finance_opening_suppliers");
  const posted = a.status === "posted";
  const rows = a.parties.filter((p) => (side === "suppliers") === (p.party_type === "SUPPLIER"));
  const [editing, setEditing] = useState<OpeningPartyWire | null | undefined>(undefined);
  const docWord = side === "debtors" ? "invoice" : "bill";
  const addWord = side === "debtors" ? "Add customer or other debtor" : "Add supplier";

  const columns = useMemo<DataGridColumn<OpeningPartyWire>[]>(() => [
    { key: "name", label: side === "debtors" ? "Debtor" : "Supplier", width: FINANCE_WIDTH.party, wrap: true,
      accessor: (p) => p.name ?? "Name not available", searchValue: (p) => p.name ?? "" },
    ...(side === "debtors" ? [{ key: "type", label: "Debtor Type", width: 130, accessor: (p: OpeningPartyWire) => TYPE_WORD[p.party_type],
      filterType: "enum" as const, filterValue: (p: OpeningPartyWire) => TYPE_WORD[p.party_type] }] : []),
    { key: "account", label: "Account", width: FINANCE_WIDTH.code, accessor: (p) => p.account_code, filterType: "enum", filterValue: (p) => p.account_code },
    { key: "total", label: "Total", width: AMOUNT, align: "right", accessor: (p) => amountCell(p.total), numberValue: (p) => Number(p.total),
      exportValue: (p) => Number(p.total), footerTotal: (v) => amountCell(sumSen(v.map((p) => p.total))) },
    { key: "items", label: side === "debtors" ? "Open invoices" : "Open bills", width: AMOUNT, align: "right",
      accessor: (p) => amountCell(p.items_total), numberValue: (p) => Number(p.items_total),
      exportValue: (p) => Number(p.items_total), footerTotal: (v) => amountCell(sumSen(v.map((p) => p.items_total))) },
    { key: "remark", label: "Remark", width: 300, wrap: true, accessor: (p) => partyRemark(p), exportValue: (p) => partyRemark(p),
      filterType: "enum", filterValue: (p) => (partyDiffers(p) ? "Does not tally" : "Tallies") },
  ], [side]);

  const itemColumns: readonly Column<OpeningPartyWire["items"][number]>[] = [
    { key: "doc", label: "Document No", width: `${FINANCE_WIDTH.documentNo}px`, cell: (i) => i.doc_no },
    { key: "date", label: "Date", width: "120px", cell: (i) => fmtDate(i.doc_date) },
    { key: "due", label: "Due date", width: "120px", cell: (i) => (i.due_date ? fmtDate(i.due_date) : "") },
    { key: "amount", label: "Amount", width: `${AMOUNT}px`, align: "right", numeric: true, cell: (i) => rm(Number(i.amount)) },
  ];

  return <ListPageShell register>
    <DataGrid rows={rows} columns={columns} rowKey={(p) => p.id} storageKey={`carres.finance.opening-${side}.v1`}
      appearance="reference" look="finance" personalLayouts={personalLayouts} fillColumn="name"
      exportName={side === "debtors" ? "Opening debtors" : "Opening suppliers"} groupBanner={false}
      searchPlaceholder={side === "debtors" ? "Search debtors…" : "Search suppliers…"}
      onRowDoubleClick={posted ? undefined : (p) => setEditing(p)}
      toolbarStart={posted ? undefined : <Button variant="primary" size="sm" shape="pill" icon="add" onClick={() => setEditing(null)}>{addWord}</Button>}
      emptyMessage={side === "debtors" ? "No customer or other debtor yet. Press Add customer or other debtor." : "No supplier yet. Press Add supplier."}
      expandTitle={side === "debtors" ? "Show open invoices" : "Show open bills"}
      expandable={{
        canExpand: (p) => p.items.length > 0,
        renderExpansion: (p) => <div className="p-4 text-body">
          <DataTable label={`${p.name ?? "Party"} open ${docWord}s`} testId="opening-party-items" rows={p.items} columns={itemColumns}
            rowId={(i) => i.id} empty={`No open ${docWord}.`} />
        </div>,
      }}
      statusSummary={(visible) => <span data-testid={`opening-${side}-summary`}>
        {visible.length} {visible.length === 1 ? (side === "debtors" ? "debtor" : "supplier") : (side === "debtors" ? "debtors" : "suppliers")}
        {" · "}Total {rm(sumSen(visible.map((p) => p.total)))}
        {" · "}{visible.filter(partyDiffers).length} not tallying
      </span>} />
    {editing !== undefined && <PartyWindow key={editing?.id ?? "new"} answer={a} side={side} party={editing}
      onClose={() => setEditing(undefined)} reread={reread} />}
  </ListPageShell>;
}

/* ── the window ─────────────────────────────────────────────────────────── */

interface TypedItem { key: string; doc_no: string; doc_date: string | null; due_date: string | null; amount: string }
let itemSeq = 0;
const blankItem = (): TypedItem => ({ key: `opening-item-${(itemSeq += 1)}`, doc_no: "", doc_date: null, due_date: null, amount: "" });

function PartyWindow({ answer: a, side, party, onClose, reread }: {
  answer: OpeningAnswer;
  side: Side;
  party: OpeningPartyWire | null;
  onClose: () => void;
  reread: () => void;
}) {
  const save = useSaveOpeningParty();
  const remove = useRemoveOpeningParty();
  const busy = save.isPending || remove.isPending;
  const [type, setType] = useState<OpeningPartyType>(party?.party_type ?? (side === "suppliers" ? "SUPPLIER" : "CUSTOMER"));
  const [partyId, setPartyId] = useState<string | undefined>(party?.party_id);
  const [find, setFind] = useState("");
  const [account, setAccount] = useState<string | undefined>(party?.account_code ?? a.choices.default_accounts[type] ?? undefined);
  const [total, setTotal] = useState(party ? (openingSen(party.total) / 100).toFixed(2) : "");
  const [items, setItems] = useState<TypedItem[]>(() => (party?.items.length
    ? party.items.map((i) => ({ key: i.id, doc_no: i.doc_no, doc_date: i.doc_date, due_date: i.due_date, amount: (openingSen(i.amount) / 100).toFixed(2) }))
    : []));
  const [asking, setAsking] = useState(false);

  const taken = new Set(a.parties.filter((p) => p.party_type === type && p.id !== party?.id).map((p) => p.party_id));
  const pool = type === "CUSTOMER" ? a.choices.customers : type === "OTHER" ? a.choices.other_debtors : a.choices.suppliers;
  const q = find.trim().toLowerCase();
  const options = pool
    .filter((c) => !taken.has(c.id) && (q === "" || (c.name ?? "").toLowerCase().includes(q) || (c.phone ?? "").includes(q) || c.id === partyId))
    .slice(0, 200)
    .map((c) => ({ value: c.id, label: c.phone ? `${c.name ?? "Name not available"} · ${c.phone}` : (c.name ?? "Name not available") }));
  const accounts = (side === "suppliers" ? a.choices.supplier_accounts : a.choices.debtor_accounts)
    .filter((x) => x.control_for === type)
    .map((x) => ({ value: x.code, label: `${x.code} ${x.name}` }));

  const totalRead = readOpeningAmount(total, true);
  const read = items.map((i) => ({ i, amount: readOpeningAmount(i.amount) }));
  const itemsSen = read.reduce((t, r) => t + Math.round((r.amount.value ?? 0) * 100), 0);
  const differenceSen = Math.round((totalRead.value ?? 0) * 100) - itemsSen;
  const goLive = a.go_live_on;

  const gap = ((): string | null => {
    if (!partyId) return "choose the party";
    if (!account) return "choose the account";
    if (totalRead.error) return "check the total";
    if (!totalRead.value) return "type the total";
    for (const [n, r] of read.entries()) {
      if (!r.i.doc_no.trim()) return `type the document number on line ${n + 1}`;
      if (!r.i.doc_date) return `choose the date on line ${n + 1}`;
      if (goLive && r.i.doc_date >= goLive) return `date line ${n + 1} before ${fmtDate(goLive)}`;
      if (r.i.due_date && r.i.due_date < r.i.doc_date) return `check the due date on line ${n + 1}`;
      if (r.amount.error || !r.amount.value) return `type the amount on line ${n + 1}`;
    }
    return null;
  })();

  const doSave = () => save.mutate({
    id: party?.id ?? null, party_type: type, party_id: partyId!, account_code: account!, total: totalRead.value!,
    items: read.map((r) => ({ doc_no: r.i.doc_no.trim(), doc_date: r.i.doc_date!, due_date: r.i.due_date, amount: r.amount.value! })),
    was: a.updated_at,
  }, {
    onSuccess: () => { toast.success("Saved"); onClose(); },
    onError: (e) => { toast.error(refusal(e)); if ((e as { status?: number }).status === 409) reread(); },
  });
  const doRemove = () => remove.mutate({ id: party!.id, was: a.updated_at }, {
    onSuccess: () => { toast.success("Removed from the list"); onClose(); },
    onError: (e) => { setAsking(false); toast.error(refusal(e)); if ((e as { status?: number }).status === 409) reread(); },
  });
  const setItem = (key: string, patch: Partial<TypedItem>) => setItems((all) => all.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const docWord = side === "debtors" ? "invoices" : "bills";
  const title = party ? (party.name ?? TYPE_WORD[type]) : side === "debtors" ? "Add customer or other debtor" : "Add supplier";

  return <Modal open width="wide" onOpenChange={(o) => { if (!o && !busy) onClose(); }} title={title}
    description={side === "debtors"
      ? "The total the debtor owed on the day before the books start, then each invoice still open. Below zero when Carres owed the debtor."
      : "The total Carres owed the supplier on the day before the books start, then each bill still open. Below zero when the supplier owed Carres."}
    footer={<>
      {party && !asking && <Button variant="ghost" disabled={busy} onClick={() => setAsking(true)}>Remove from the list</Button>}
      {party && asking && <Button variant="neutral" loading={remove.isPending} onClick={doRemove}>Remove from the list: yes</Button>}
      <Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button>
      <Button variant="primary" loading={save.isPending} disabled={gap !== null || busy} onClick={doSave}>{gap ? `Save: ${gap}` : "Save"}</Button>
    </>}>
    <div className="flex flex-col gap-3 text-body" data-testid="opening-party-window">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {side === "debtors" && <Select id="opening-party-type" label="Debtor Type" value={type}
          onValueChange={(v) => { const t = v as OpeningPartyType; setType(t); setPartyId(undefined); setAccount(a.choices.default_accounts[t] ?? undefined); }}
          options={[{ value: "CUSTOMER", label: "Customer" }, { value: "OTHER", label: "Other debtor" }]} />}
        <Input id="opening-party-find" label="Find" value={find} onChange={(e) => setFind(e.target.value)}
          hint="Type part of the name or the phone number." />
        <Select id="opening-party" label={TYPE_WORD[type]} required value={partyId} onValueChange={setPartyId}
          options={options} placeholder={options.length ? `Choose the ${TYPE_WORD[type].toLowerCase()}` : "No match"} />
        <Select id="opening-party-account" label="Account" required value={account} onValueChange={setAccount} options={accounts}
          placeholder="Choose the account" />
        <Input id="opening-party-total" label="Total" required inputMode="decimal" value={total} error={totalRead.error}
          onChange={(e) => setTotal(e.target.value)} />
      </div>

      <h3 className="text-strong">{side === "debtors" ? "Open invoices" : "Open bills"}</h3>
      {items.length === 0 && <p className="text-kit-slate-11">{`No open ${docWord} yet. The whole total shows as not tied to one.`}</p>}
      {read.map((r, n) => <div key={r.i.key} data-testid={`opening-item-${n + 1}`}
        className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,1fr)_auto] md:items-end">
        <Input id={`opening-item-doc-${n + 1}`} label="Document No" maxLength={60} value={r.i.doc_no}
          onChange={(e) => setItem(r.i.key, { doc_no: e.target.value })} />
        <DatePicker id={`opening-item-date-${n + 1}`} label="Date" value={r.i.doc_date} onChange={(v) => setItem(r.i.key, { doc_date: v })} />
        <DatePicker id={`opening-item-due-${n + 1}`} label="Due date" value={r.i.due_date} onChange={(v) => setItem(r.i.key, { due_date: v })} />
        <Input id={`opening-item-amount-${n + 1}`} label="Amount" inputMode="decimal" value={r.i.amount} error={r.amount.error}
          onChange={(e) => setItem(r.i.key, { amount: e.target.value })} />
        <Button variant="ghost" aria-label={`Remove, line ${n + 1}`} onClick={() => setItems((all) => all.filter((x) => x.key !== r.i.key))}>Remove</Button>
      </div>)}
      <div>
        <Button variant="neutral" size="sm" icon="add" disabled={items.length >= 500} onClick={() => setItems((all) => [...all, blankItem()])}>Add line</Button>
      </div>
      <p className="text-strong" data-testid="opening-party-tally">
        Open {docWord} {rm(itemsSen / 100)} · Total {rm(totalRead.value ?? 0)} ·{" "}
        <span className={differenceSen === 0 ? undefined : "text-kit-red-11"}>Difference {rm(differenceSen / 100)}</span>
      </p>
      {differenceSen !== 0 && <FieldError testId="opening-party-differs">
        {`The open ${docWord} differ from the total. It may still post; the row shows the difference.`}
      </FieldError>}
    </div>
  </Modal>;
}

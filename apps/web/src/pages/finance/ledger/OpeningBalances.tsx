/**
 * Finance → Ledger → Opening balances, at `/finance/ledger/opening-balances`
 * (migration 0705; Chew 2026-10-21/22, docs/finance/MASTER.md §3.5).
 *
 * Finance's figures at go-live, entered as a draft that is saved and changed
 * freely and is not in the ledger. Five tabs (`?tab=`): Accounts · Customers
 * and other debtors · Suppliers · Stock · Customer deposits. `Post` writes ONE
 * ledger entry dated the day before go-live and is the principal's, as the
 * manual journal is; it waits until debits equal credits, so 160-0000 Opening
 * balance holds RM 0.00 after it, and until every pasted Unit and order is
 * found. `Reverse` (with a reason) undoes it and returns it to draft, until
 * the first month is closed. Every figure here is the database's; the page
 * prints it and the shared arithmetic (`@carres/shared/opening-balances`).
 *
 * FINANCE LOOK (MASTER §4.2): every table wears it; rows carry no buttons. A
 * party opens its window on a double click; Units and deposits come in by a
 * paste from Excel and leave by selection.
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  mergeByKey,
  openingDifference,
  openingSen,
  readDepositPaste,
  readOpeningAmount,
  readStockPaste,
  type OpeningAnswer,
  type OpeningDepositWire,
  type OpeningStockWire,
  type PasteProblem,
} from "@carres/shared/opening-balances";
import { ledgerKindWord } from "@carres/shared/finance-ledger";
import Button from "@/components/kit/Button";
import DataTable, { type Column } from "@/components/kit/DataTable";
import { FieldError } from "@/components/kit/FieldFrame";
import Input from "@/components/kit/Input";
import Modal from "@/components/kit/Modal";
import Tabs from "@/components/kit/Tabs";
import Textarea from "@/components/kit/Textarea";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import { ReadFailed } from "../payables/PayablesParts";
import { refusal } from "../payables/payables-words";
import { amountCell, FINANCE_WIDTH } from "../finance-widths";
import { useFinancePersonalLayouts } from "../finance-layouts";
import look from "../finance-look.module.css";
import {
  useOpeningBalances,
  usePostOpening,
  useReverseOpening,
  useSaveOpeningAccounts,
  useSaveOpeningDeposits,
  useSaveOpeningStock,
} from "./opening-balances-queries";
import OpeningParties from "./OpeningParties";

const TABS = [
  { value: "accounts", label: "Accounts" },
  { value: "debtors", label: "Customers and other debtors" },
  { value: "suppliers", label: "Suppliers" },
  { value: "stock", label: "Stock" },
  { value: "deposits", label: "Customer deposits" },
] as const;
type Tab = (typeof TABS)[number]["value"];

const AMOUNT = FINANCE_WIDTH.amount;
const money = (v: number | string | null | undefined) => amountCell(v ?? null);
const sumSen = (vals: Array<number | string | null | undefined>) => vals.reduce<number>((t, v) => t + openingSen(v), 0) / 100;

/** A refusal for a draft someone else changed reads the draft again. */
function onSaveError(e: unknown, reread: () => void) {
  toast.error(refusal(e));
  if ((e as { status?: number }).status === 409) reread();
}

/** The first thing between this draft and Post, said after `Post: `, or null. */
export function postGap(a: OpeningAnswer): string | null {
  if (a.stock.some((s) => !s.found)) return "correct the Units not found";
  if (a.deposits.some((d) => !d.found)) return "correct the orders not found";
  if (Number(a.totals.lines) === 0) return "enter the balances first";
  if (openingDifference(a.totals) !== 0) return "make debits equal credits";
  return null;
}

export default function OpeningBalances() {
  const [params, setParams] = useSearchParams();
  const asked = params.get("tab") ?? "";
  const tab: Tab = TABS.some((t) => t.value === asked) ? (asked as Tab) : "accounts";
  const read = useOpeningBalances();
  const a = read.data;

  return <div className="flex h-full min-h-0 flex-col">
    <ModuleHeader destinationHeader testId="opening-balances-destination-header" word="Opening balances" docTitle="Opening balances · Carres" />
    {read.isError ? <ReadFailed what="The opening balances" onRetry={() => void read.refetch()} /> : <>
      {a && <PostBar answer={a} />}
      <div className="px-6">
        <Tabs tabs={TABS} value={tab} label="Opening balances" onValueChange={(v) => setParams(v === "accounts" ? {} : { tab: v })} />
      </div>
      <div className="min-h-0 flex-1" data-testid={`opening-tab-${tab}`}>
        {!a ? <p className="p-6 text-body">Loading the opening balances…</p>
          : tab === "accounts" ? <AccountsTab answer={a} reread={() => void read.refetch()} />
            : tab === "debtors" ? <OpeningParties answer={a} side="debtors" reread={() => void read.refetch()} />
              : tab === "suppliers" ? <OpeningParties answer={a} side="suppliers" reread={() => void read.refetch()} />
                : tab === "stock" ? <StockTab answer={a} reread={() => void read.refetch()} />
                  : <DepositsTab answer={a} reread={() => void read.refetch()} />}
      </div>
    </>}
  </div>;
}

/* ── the bar above the tabs: where the draft stands, its totals, Post / Reverse ── */

function PostBar({ answer: a }: { answer: OpeningAnswer }) {
  const post = usePostOpening();
  const reverse = useReverseOpening();
  const [asking, setAsking] = useState<"post" | "reverse" | null>(null);
  const [reason, setReason] = useState("");
  const posted = a.status === "posted";
  const difference = openingDifference(a.totals);
  const gap = postGap(a);
  const closed = a.books_closed_through !== null && a.entry_date !== null && a.books_closed_through >= a.entry_date;
  const entryDay = a.entry_date ? fmtDate(a.entry_date, { year: "always" }) : "";

  const doPost = () => post.mutate({ was: a.updated_at }, {
    onSuccess: () => { setAsking(null); toast.success("Opening balances posted"); },
    onError: (e) => { setAsking(null); toast.error(refusal(e)); },
  });
  const doReverse = () => reverse.mutate({ reason: reason.trim() }, {
    onSuccess: () => { setAsking(null); setReason(""); toast.success("Opening balances reversed. They are a draft again."); },
    onError: (e) => toast.error(refusal(e)),
  });

  return <div className="flex flex-col gap-1 px-6 pb-2 pt-1 text-body" data-testid="opening-status">
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-strong" data-testid="opening-state">
        {posted
          ? `Posted · ${a.entry?.entry_no ?? ""} · Dated ${entryDay}${a.posted_by_name ? ` · by ${a.posted_by_name}` : ""}`
          : `Draft · Not in the ledger yet · Posts dated ${entryDay}`}
      </span>
      <span data-testid="opening-totals">
        Debit {rm(Number(a.totals.debit))} · Credit {rm(Number(a.totals.credit))} ·{" "}
        <span className={difference === 0 ? undefined : "text-kit-red-11"} data-testid="opening-difference">
          160-0000 Opening balance {rm(Math.abs(difference))}
        </span>
      </span>
      <span className="ml-auto flex items-center gap-2">
        {a.may_post && !posted && <Button variant="primary" disabled={gap !== null || closed} onClick={() => setAsking("post")}>
          {gap ? `Post: ${gap}` : "Post"}
        </Button>}
        {a.may_post && posted && <Button variant="neutral" disabled={closed} onClick={() => setAsking("reverse")}>Reverse</Button>}
      </span>
    </div>
    <p className="text-meta text-kit-slate-11" data-testid="opening-note">
      {closed ? `The books are closed up to ${fmtDate(a.books_closed_through!, { year: "always" })}. The opening balances can no longer be posted or reversed.`
        : !a.may_post ? "Only the principal may post or reverse the opening balances."
          : posted ? "To change a figure, Reverse first. The opening balances return to draft."
            : "Post writes one ledger entry. Debits must equal credits, so 160-0000 Opening balance is RM 0.00 after it."}
      {a.updated_by_name && !posted ? ` Saved by ${a.updated_by_name} on ${fmtDate(a.updated_at, { time: true })}.` : ""}
      {a.last_reversed && !posted ? ` Reversed on ${fmtDate(a.last_reversed.at, { time: true })}${a.last_reversed.by_name ? ` by ${a.last_reversed.by_name}` : ""}: ${a.last_reversed.reason}` : ""}
    </p>

    <Modal open={asking === "post"} onOpenChange={(open) => { if (!post.isPending && !open) setAsking(null); }}
      title="Post the opening balances?"
      description={`${rm(Number(a.totals.debit))} debit and credit, dated ${entryDay}.`}
      footer={<>
        <Button variant="ghost" disabled={post.isPending} onClick={() => setAsking(null)}>Cancel</Button>
        <Button variant="primary" loading={post.isPending} onClick={doPost}>Post</Button>
      </>}>
      <p className="text-body">Every report then shows them as Brought forward. To change them later, Reverse them before the first month is closed.</p>
    </Modal>
    <Modal open={asking === "reverse"} onOpenChange={(open) => { if (!reverse.isPending && !open) setAsking(null); }}
      title="Reverse the opening balances?"
      description="The entry is reversed and the opening balances return to draft."
      footer={<>
        <Button variant="ghost" disabled={reverse.isPending} onClick={() => setAsking(null)}>Cancel</Button>
        <Button variant="primary" loading={reverse.isPending} disabled={reason.trim() === ""} onClick={doReverse}>
          {reason.trim() === "" ? "Reverse: type the reason" : "Reverse"}
        </Button>
      </>}>
      <Textarea id="opening-reverse-reason" label="Reason" required rows={2} maxLength={500} value={reason}
        onChange={(e) => setReason(e.target.value)} />
    </Modal>
  </div>;
}

/* ── Accounts ───────────────────────────────────────────────────────────── */

type Typed = Record<string, { debit: string; credit: string }>;
const typedOf = (a: OpeningAnswer): Typed => Object.fromEntries(a.accounts.map((r) => [r.code, {
  debit: openingSen(r.debit) ? (openingSen(r.debit) / 100).toFixed(2) : "",
  credit: openingSen(r.credit) ? (openingSen(r.credit) / 100).toFixed(2) : "",
}]));

function AccountsTab({ answer: a, reread }: { answer: OpeningAnswer; reread: () => void }) {
  const save = useSaveOpeningAccounts();
  const posted = a.status === "posted";
  const [typed, setTyped] = useState<Typed>(() => typedOf(a));
  const [base, setBase] = useState(a.updated_at);
  useEffect(() => {
    if (a.updated_at !== base) { setTyped(typedOf(a)); setBase(a.updated_at); }
  }, [a, base]);

  const read = useMemo(() => a.accounts.map((r) => {
    const t = typed[r.code] ?? { debit: "", credit: "" };
    const debit = readOpeningAmount(t.debit);
    const credit = readOpeningAmount(t.credit);
    const error = debit.error ?? credit.error ?? (debit.value && credit.value ? "An account takes a debit or a credit, not both." : undefined);
    return { row: r, debit: debit.value, credit: credit.value, error };
  }), [a.accounts, typed]);
  const firstBad = read.find((r) => r.error);
  const dirty = a.accounts.some((r) => {
    const t = typed[r.code];
    return t !== undefined && (openingSen(readOpeningAmount(t.debit).value) !== openingSen(r.debit)
      || openingSen(readOpeningAmount(t.credit).value) !== openingSen(r.credit));
  });

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = (code: string, side: "debit" | "credit", text: string) =>
    setTyped((t) => ({ ...t, [code]: { ...(t[code] ?? { debit: "", credit: "" }), [side]: text } }));
  const doSave = () => save.mutate({
    lines: read.filter((r) => r.debit || r.credit).map((r) => ({ account_code: r.row.code, debit: r.debit, credit: r.credit })),
    was: a.updated_at,
  }, {
    onSuccess: () => toast.success("Accounts saved"),
    onError: (e) => onSaveError(e, reread),
  });

  const box = (r: (typeof read)[number], side: "debit" | "credit") => (posted
    ? money(r.row[side])
    : <Input id={`opening-${side}-${r.row.code}`} aria-label={`${side === "debit" ? "Debit" : "Credit"} for ${r.row.code} ${r.row.name}`}
      inputMode="decimal" value={typed[r.row.code]?.[side] ?? ""} aria-invalid={r.error ? true : undefined}
      onChange={(e) => set(r.row.code, side, e.target.value)} />);

  const columns: Column<(typeof read)[number]>[] = [
    { key: "code", label: "Code", width: `${FINANCE_WIDTH.code}px`, cell: (r) => r.row.code },
    { key: "account", label: "Account", width: "auto", cell: (r) => <span className={r.row.eligible ? undefined : "text-kit-slate-11"}>
      {r.row.name}{r.row.eligible ? "" : " · Can no longer take an opening balance"}</span> },
    { key: "kind", label: "Type", width: "110px", cell: (r) => ledgerKindWord(r.row.kind) },
    { key: "debit", label: "Debit", width: `${AMOUNT + 24}px`, align: "right", numeric: true, cell: (r) => box(r, "debit") },
    { key: "credit", label: "Credit", width: `${AMOUNT + 24}px`, align: "right", numeric: true, cell: (r) => box(r, "credit") },
  ];

  const totalOf = (side: "debit" | "credit") => read.reduce((t, r) => t + Math.round((r[side] ?? 0) * 100), 0) / 100;

  return <div className="flex h-full min-h-0 flex-col gap-2 px-6 py-3">
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-meta text-kit-slate-11">
        Every account that is not a customer, supplier or other debtor account, bank and cash included. Income and expense accounts take their total for the year up to the day the books start.
      </p>
      {!posted && <span className="ml-auto flex items-center gap-3">
        {dirty && <span className="text-body text-kit-slate-11" data-testid="opening-accounts-not-saved">Not saved</span>}
        {dirty && <Button variant="neutral" disabled={save.isPending} onClick={() => setTyped(typedOf(a))}>Discard</Button>}
        <Button variant="primary" disabled={!dirty || Boolean(firstBad)} loading={save.isPending} onClick={doSave}>Save</Button>
      </span>}
    </div>
    {firstBad && <FieldError testId="opening-accounts-error">{`${firstBad.row.code} ${firstBad.row.name}: ${firstBad.error}`}</FieldError>}
    <div className={look.statement}>
      <DataTable label="Opening balances, accounts" testId="opening-accounts" rowTestId="opening-account-row"
        rows={read} columns={columns} rowId={(r) => r.row.code} sizing="content"
        empty="No account can take an opening balance."
        totals={{ label: "Total", cell: (c) => (c.key === "debit" ? <span className="font-semibold tabular-nums">{rm(totalOf("debit"))}</span>
          : c.key === "credit" ? <span className="font-semibold tabular-nums">{rm(totalOf("credit"))}</span>
            : c.key === "code" ? <span className="font-semibold">Total</span> : null) }} />
    </div>
  </div>;
}

/* ── pasted from Excel: Stock and Customer deposits ─────────────────────── */

function PasteModal<R>({ open, title, description, read, onClose, onSave, saving }: {
  open: boolean;
  title: string;
  description: string;
  read: (text: string) => { rows: R[]; problems: PasteProblem[] };
  onClose: () => void;
  onSave: (rows: R[]) => void;
  saving: boolean;
}) {
  const [text, setText] = useState("");
  const got = useMemo(() => read(text), [read, text]);
  const gap = text.trim() === "" ? "paste the rows" : got.problems.length ? "correct the lines below" : got.rows.length === 0 ? "paste the rows" : null;
  return <Modal open={open} width="wide" onOpenChange={(o) => { if (!o && !saving) onClose(); }} title={title} description={description}
    footer={<>
      <Button variant="ghost" disabled={saving} onClick={onClose}>Cancel</Button>
      <Button variant="primary" loading={saving} disabled={gap !== null} onClick={() => onSave(got.rows)}>{gap ? `Save: ${gap}` : "Save"}</Button>
    </>}>
    <div className="flex flex-col gap-2 text-body">
      <Textarea id="opening-paste" label="Pasted rows" rows={10} value={text} onChange={(e) => setText(e.target.value)} />
      <p data-testid="opening-paste-count">{got.rows.length} {got.rows.length === 1 ? "row" : "rows"} read</p>
      {got.problems.slice(0, 20).map((p) => <FieldError key={p.line}>{`Line ${p.line}: ${p.text}. ${p.reason}`}</FieldError>)}
      {got.problems.length > 20 && <FieldError>{`${got.problems.length - 20} more lines cannot be read.`}</FieldError>}
    </div>
  </Modal>;
}

function useSelection() {
  const [keys, setKeys] = useState<Set<string>>(new Set());
  return {
    keys, clear: () => setKeys(new Set()),
    selectable: {
      selectedKeys: keys,
      onToggle: (key: string) => setKeys((b) => { const n = new Set(b); if (n.has(key)) n.delete(key); else n.add(key); return n; }),
      onToggleAll: (all: string[], allSelected: boolean) => setKeys((b) => {
        const n = new Set(b); all.forEach((k) => { if (allSelected) n.delete(k); else n.add(k); }); return n;
      }),
    },
  };
}

function StockTab({ answer: a, reread }: { answer: OpeningAnswer; reread: () => void }) {
  const personalLayouts = useFinancePersonalLayouts("finance_opening_stock");
  const save = useSaveOpeningStock();
  const posted = a.status === "posted";
  const [pasting, setPasting] = useState(false);
  const sel = useSelection();
  const missing = a.stock.filter((s) => !s.found).length;
  const rowsOf = (list: readonly OpeningStockWire[]) => list.map((s) => ({ unit_code: s.unit_code, unit_cost: openingSen(s.unit_cost) / 100 }));
  const write = (rows: Array<{ unit_code: string; unit_cost: number }>, done: () => void) => save.mutate({ rows, was: a.updated_at }, {
    onSuccess: (res) => {
      done();
      const nf = (res as { not_found?: string[] }).not_found ?? [];
      toast.success(nf.length ? `Stock saved. ${nf.length} ${nf.length === 1 ? "Unit is" : "Units are"} not found.` : "Stock saved");
    },
    onError: (e) => onSaveError(e, reread),
  });

  const columns = useMemo<DataGridColumn<OpeningStockWire>[]>(() => [
    { key: "unit", label: "Unit", width: 180, accessor: (s) => s.unit_code, searchValue: (s) => s.unit_code },
    { key: "sku", label: "SKU", width: 260, accessor: (s) => s.sku ?? "", searchValue: (s) => s.sku ?? "" },
    { key: "qty", label: "Qty", width: 72, align: "right", accessor: (s) => (s.qty ?? ""), numberValue: (s) => s.qty },
    { key: "cost", label: "Cost", width: AMOUNT, align: "right", accessor: (s) => money(s.unit_cost), numberValue: (s) => Number(s.unit_cost),
      exportValue: (s) => Number(s.unit_cost) },
    { key: "value", label: "Value", width: AMOUNT, align: "right", accessor: (s) => money(s.value), numberValue: (s) => (s.value === null ? null : Number(s.value)),
      exportValue: (s) => (s.value === null ? "" : Number(s.value)), footerTotal: (v) => amountCell(sumSen(v.map((s) => s.value))) },
    { key: "remark", label: "Remark", width: 200, accessor: (s) => (s.found ? "" : "Unit not found"), filterType: "enum",
      filterValue: (s) => (s.found ? "Found" : "Unit not found") },
  ], []);

  return <ListPageShell register>
    {missing > 0 && <div role="status" className="px-4 py-2 text-body text-kit-amber-11" data-testid="opening-stock-missing">
      {`${missing} ${missing === 1 ? "Unit is" : "Units are"} not found. Correct or remove ${missing === 1 ? "it" : "them"} before Post.`}
    </div>}
    <DataGrid rows={a.stock} columns={columns} rowKey={(s) => s.unit_code} storageKey="carres.finance.opening-stock.v1"
      appearance="reference" look="finance" personalLayouts={personalLayouts} fillColumn="sku" exportName="Opening stock"
      groupBanner={false} searchPlaceholder="Search Units…"
      selectable={posted ? undefined : sel.selectable}
      selectionActions={posted ? undefined : [{
        kind: "write",
        label: (n) => `Remove ${n} ${n === 1 ? "Unit" : "Units"}`,
        onClick: () => write(rowsOf(a.stock.filter((s) => !sel.keys.has(s.unit_code))), sel.clear),
      }]}
      toolbarStart={posted ? undefined : <Button variant="primary" size="sm" shape="pill" icon="add" onClick={() => setPasting(true)}>Paste from Excel</Button>}
      emptyMessage="No Unit yet. Press Paste from Excel: two columns, Unit and cost."
      statusSummary={(visible) => <span data-testid="opening-stock-summary">
        {visible.length} {visible.length === 1 ? "Unit" : "Units"} · Value {rm(sumSen(visible.map((s) => s.value)))}
        {missing ? ` · ${missing} not found` : ""}
      </span>} />
    {pasting && <PasteModal open title="Paste Units and costs from Excel"
      description="Two columns: Unit and cost, one Unit a line. A Unit already listed takes the new cost."
      read={readStockPaste} saving={save.isPending} onClose={() => setPasting(false)}
      onSave={(rows) => write(mergeByKey(rowsOf(a.stock), rows, (r) => r.unit_code), () => setPasting(false))} />}
  </ListPageShell>;
}

/** A deposit's order as typed: `SO-1401` and `1401` are one order. */
const orderKey = (ref: string) => ref.trim().toUpperCase().replace(/^SO[\s-]*/, "");

export function depositRemark(d: OpeningDepositWire): string {
  if (!d.found) return "Order not found";
  if (d.delivered_at) return `Delivered on ${fmtDate(d.delivered_at)}`;
  if (d.customer_ref && d.customer_name && d.customer_ref.trim().toUpperCase() !== d.customer_name.trim().toUpperCase()) {
    return `Customer on the order is ${d.customer_name}`;
  }
  return "";
}

function DepositsTab({ answer: a, reread }: { answer: OpeningAnswer; reread: () => void }) {
  const personalLayouts = useFinancePersonalLayouts("finance_opening_deposits");
  const save = useSaveOpeningDeposits();
  const posted = a.status === "posted";
  const [pasting, setPasting] = useState(false);
  const sel = useSelection();
  const missing = a.deposits.filter((d) => !d.found).length;
  type Row = { order_ref: string; customer_ref: string | null; amount: number };
  const rowsOf = (list: readonly OpeningDepositWire[]): Row[] =>
    list.map((d) => ({ order_ref: d.order_ref, customer_ref: d.customer_ref, amount: openingSen(d.amount) / 100 }));
  const write = (rows: Row[], done: () => void) => save.mutate({ rows, was: a.updated_at }, {
    onSuccess: (res) => {
      done();
      const nf = (res as { not_found?: string[] }).not_found ?? [];
      toast.success(nf.length ? `Customer deposits saved. ${nf.length} ${nf.length === 1 ? "order is" : "orders are"} not found.` : "Customer deposits saved");
    },
    onError: (e) => onSaveError(e, reread),
  });

  const columns = useMemo<DataGridColumn<OpeningDepositWire>[]>(() => [
    { key: "so", label: "SO No", width: 120, accessor: (d) => (d.so !== null ? `SO-${d.so}` : d.order_ref), searchValue: (d) => `${d.order_ref} SO-${d.so ?? ""}` },
    { key: "customer", label: "Customer", width: FINANCE_WIDTH.party, wrap: true, accessor: (d) => d.customer_name ?? "", searchValue: (d) => d.customer_name ?? "" },
    { key: "pasted", label: "Customer as pasted", width: 200, defaultHidden: true, accessor: (d) => d.customer_ref ?? "" },
    { key: "account", label: "Account", width: FINANCE_WIDTH.code, accessor: (d) => d.account_code ?? "" },
    { key: "amount", label: "Deposit", width: AMOUNT, align: "right", accessor: (d) => money(d.amount), numberValue: (d) => Number(d.amount),
      exportValue: (d) => Number(d.amount), footerTotal: (v) => amountCell(sumSen(v.map((d) => d.amount))) },
    { key: "remark", label: "Remark", width: 240, wrap: true, accessor: (d) => depositRemark(d), filterType: "enum", filterValue: (d) => depositRemark(d) || "None" },
  ], []);

  return <ListPageShell register>
    {missing > 0 && <div role="status" className="px-4 py-2 text-body text-kit-amber-11" data-testid="opening-deposits-missing">
      {`${missing} ${missing === 1 ? "order is" : "orders are"} not found. Correct or remove ${missing === 1 ? "it" : "them"} before Post.`}
    </div>}
    <DataGrid rows={a.deposits} columns={columns} rowKey={(d) => d.id} storageKey="carres.finance.opening-deposits.v1"
      appearance="reference" look="finance" personalLayouts={personalLayouts} fillColumn="customer" exportName="Opening customer deposits"
      groupBanner={false} searchPlaceholder="Search orders…"
      selectable={posted ? undefined : sel.selectable}
      selectionActions={posted ? undefined : [{
        kind: "write",
        label: (n) => `Remove ${n} ${n === 1 ? "deposit" : "deposits"}`,
        onClick: () => write(rowsOf(a.deposits.filter((d) => !sel.keys.has(d.id))), sel.clear),
      }]}
      toolbarStart={posted ? undefined : <Button variant="primary" size="sm" shape="pill" icon="add" onClick={() => setPasting(true)}>Paste from Excel</Button>}
      emptyMessage="No customer deposit yet. Press Paste from Excel: SO No and deposit, one order a line."
      statusSummary={(visible) => <span data-testid="opening-deposits-summary">
        {visible.length} {visible.length === 1 ? "order" : "orders"} · Deposits {rm(sumSen(visible.map((d) => d.amount)))}
        {missing ? ` · ${missing} not found` : ""}
      </span>} />
    {pasting && <PasteModal open title="Paste customer deposits from Excel"
      description="SO No and deposit, or customer, SO No and deposit, one order a line. Typing works too. An order already listed takes the new deposit."
      read={readDepositPaste} saving={save.isPending} onClose={() => setPasting(false)}
      onSave={(rows) => write(mergeByKey(rowsOf(a.deposits), rows, (r) => orderKey(r.order_ref)), () => setPasting(false))} />}
  </ListPageShell>;
}

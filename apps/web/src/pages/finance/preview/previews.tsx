// design-standard: not-a-list-page — each Finance document's preview content, read from its own detail endpoint.
/**
 * One adapter per Finance document (Chew 2026-10-21): it reads the document
 * through the query its own page reads, and lays the page's own facts, lines
 * and ledger entries into `DocumentPreview`. Every word here is the page's own
 * (COPY "Row menu and preview"). `id` null = closed.
 */
import { useLedgerEntry } from "../ledger/ledger-queries";
import { ledgerDocWord, ledgerSourceWord } from "@carres/shared/finance-ledger";
import {
  otherDebtorInvoiceNumberWord,
  otherDebtorInvoiceStatusWord,
  otherDebtorOutstandingWord,
  otherReceiptStatusWord,
} from "@carres/shared/other-money-in";
import { usePaymentVoucher, useSupplierBill, useSupplierCreditNote, useSupplierDebitNote } from "@/lib/payables-queries";
import { fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import { useOtherDebtorInvoice, useOtherReceipt } from "../other-money-in/api";
import {
  BILL_STATUS_WORD,
  PAY_METHOD_WORD,
  VOUCHER_PURPOSE_WORD,
  VOUCHER_STATUS_WORD,
  creditorKindWord,
  money,
  num,
  word,
} from "../payables/payables-words";
import DocumentPreview, { type PreviewContent, type PreviewLine } from "./DocumentPreview";

type Props = { id: string | null; onClose: () => void; onView: (id: string) => void };

const account = (code: string, name: string | null | undefined) => `${code} ${name ?? ""}`.trim();
/** The entries a document posted, then the one that reversed it. */
const posted = (...nos: Array<string | null | undefined>) => nos.filter((n): n is string => !!n);

export function BillPreview({ id, onClose, onView }: Props) {
  const q = useSupplierBill(id ?? undefined);
  const doc = id ? q.data : undefined;
  const b = doc?.bill;
  const content: PreviewContent | null = doc && b ? {
    facts: [
      { label: "Status", value: word(BILL_STATUS_WORD, b.status) },
      { label: "Supplier", value: `${b.supplier_name} · ${creditorKindWord(b.supplier_kind)}` },
      { label: "Supplier invoice", value: b.supplier_invoice_no },
      { label: "Bill date", value: fmtDate(b.bill_date) },
      { label: "Due date", value: b.due_date ? fmtDate(b.due_date) : "No due date" },
      { label: "Total", value: money(b.total_amount) },
      { label: "Unpaid", value: b.status === "confirmed" ? money(doc.unpaid) : "Not confirmed" },
    ],
    lines: {
      rows: doc.lines.map((l): PreviewLine => ({ key: String(l.line_no), description: l.description ?? l.sku ?? "No description",
        account: account(l.account_code, l.account_name), amount: num(l.amount) ?? 0 })),
      empty: "No line yet.",
    },
    entryNos: posted(b.entry_no, b.reversal_entry_no),
    noEntry: "None yet. Confirming the bill makes it",
  } : null;
  return <DocumentPreview open={id !== null} onClose={onClose} onView={() => id && onView(id)}
    title={b ? `${b.bill_no ?? "Draft bill"} · ${b.supplier_name}` : "Bills"}
    read={q} what="This bill" loadingWord="Loading bill…" content={content} />;
}

export function VoucherPreview({ id, onClose, onView }: Props) {
  const q = usePaymentVoucher(id ?? undefined);
  const doc = id ? q.data : undefined;
  const v = doc?.voucher;
  const advance = num(v?.advance_amount) ?? 0;
  const content: PreviewContent | null = doc && v ? {
    facts: [
      { label: "Status", value: word(VOUCHER_STATUS_WORD, v.status) },
      { label: "Purpose", value: word(VOUCHER_PURPOSE_WORD, v.purpose) },
      { label: "Payee", value: v.payee_name },
      { label: "Voucher date", value: fmtDate(v.voucher_date) },
      { label: "Paid from", value: v.pay_from_account_code ? account(v.pay_from_account_code, v.pay_from_name) : "Not chosen yet" },
      { label: "Method", value: word(PAY_METHOD_WORD, v.pay_method) },
      { label: "Amount", value: money(v.amount) },
    ],
    /* The voucher's paper lines, as it prints them (voucher-print.ts): each
       bill and debit note paid, the advance, then each direct line. */
    lines: {
      rows: [
        ...doc.allocations.map((a): PreviewLine => ({ key: `b-${a.bill_id}`, account: "",
          description: `${a.bill_no ?? "Draft bill"} · Supplier invoice ${a.supplier_invoice_no}`, amount: num(a.amount_applied) ?? 0 })),
        ...(doc.debit_notes ?? []).map((n): PreviewLine => ({ key: `d-${n.debit_note_id}`, account: "",
          description: n.note_no ?? "Draft debit note", amount: num(n.amount_applied) ?? 0 })),
        ...(advance > 0 ? [{ key: "advance", description: "Advance", account: "", amount: advance }] : []),
        ...doc.lines.map((l): PreviewLine => ({ key: `l-${l.line_no}`, description: l.description ?? "No description",
          account: account(l.account_code, l.account_name), amount: num(l.amount) ?? 0 })),
      ],
      empty: "No direct line.",
    },
    entryNos: posted(v.entry_no, v.reversal_entry_no),
    noEntry: "None yet. Approving the payment makes it",
  } : null;
  return <DocumentPreview open={id !== null} onClose={onClose} onView={() => id && onView(id)}
    title={v ? `${v.voucher_no ?? "Draft voucher"} · ${v.payee_name}` : "Payment Vouchers"}
    read={q} what="This payment voucher" loadingWord="Loading payment voucher…" content={content} />;
}

export function CreditNotePreview({ id, onClose, onView }: Props) {
  const q = useSupplierCreditNote(id ?? undefined);
  const doc = id ? q.data : undefined;
  const n = doc?.note;
  const content: PreviewContent | null = doc && n ? {
    facts: [
      { label: "Status", value: word(BILL_STATUS_WORD, n.status) },
      { label: "Supplier", value: `${n.supplier_name} · ${creditorKindWord(n.supplier_kind)}` },
      { label: "Supplier's credit note", value: n.supplier_note_no },
      { label: "Date", value: fmtDate(n.note_date) },
      { label: "Total", value: money(n.total_amount) },
      { label: "Left to knock off", value: n.status === "confirmed" ? money(doc.credit_open) : "Not confirmed" },
    ],
    lines: {
      rows: doc.lines.map((l): PreviewLine => ({ key: String(l.line_no), description: l.description,
        account: account(l.account_code, l.account_name), amount: num(l.amount) ?? 0 })),
      empty: "This credit note has no lines.",
    },
    entryNos: posted(n.entry_no, n.reversal_entry_no),
    noEntry: "None yet. Confirming the credit note makes it",
  } : null;
  return <DocumentPreview open={id !== null} onClose={onClose} onView={() => id && onView(id)}
    title={n ? `${n.note_no ?? "Draft credit note"} · ${n.supplier_name}` : "Credit Notes"}
    read={q} what="This credit note" loadingWord="Loading credit note…" content={content} />;
}

export function DebitNotePreview({ id, onClose, onView }: Props) {
  const q = useSupplierDebitNote(id ?? undefined);
  const doc = id ? q.data : undefined;
  const n = doc?.note;
  const content: PreviewContent | null = doc && n ? {
    facts: [
      { label: "Status", value: word(BILL_STATUS_WORD, n.status) },
      { label: "Supplier", value: `${n.supplier_name} · ${creditorKindWord(n.supplier_kind)}` },
      { label: "Supplier's debit note", value: n.supplier_note_no },
      { label: "Date", value: fmtDate(n.note_date) },
      { label: "Due date", value: n.due_date ? fmtDate(n.due_date) : "No due date" },
      { label: "Total", value: money(n.total_amount) },
      { label: "Left to pay", value: n.status === "confirmed" ? money(doc.debit_open) : "Not confirmed" },
    ],
    lines: {
      rows: doc.lines.map((l): PreviewLine => ({ key: String(l.line_no), description: l.description,
        account: account(l.account_code, l.account_name), amount: num(l.amount) ?? 0 })),
      empty: "This debit note has no lines.",
    },
    entryNos: posted(n.entry_no, n.reversal_entry_no),
    noEntry: "None yet. Confirming the debit note makes it",
  } : null;
  return <DocumentPreview open={id !== null} onClose={onClose} onView={() => id && onView(id)}
    title={n ? `${n.note_no ?? "Draft debit note"} · ${n.supplier_name}` : "Debit Notes"}
    read={q} what="This debit note" loadingWord="Loading debit note…" content={content} />;
}

export function OtherDebtorInvoicePreview({ id, onClose, onView }: Props) {
  const q = useOtherDebtorInvoice(id);
  const detail = id ? q.data : undefined;
  const inv = detail?.invoice;
  const content: PreviewContent | null = detail && inv ? {
    facts: [
      { label: "Status", value: otherDebtorInvoiceStatusWord(inv.status) },
      { label: "Party", value: inv.party_name },
      { label: "Invoice date", value: fmtDate(inv.invoice_date) },
      { label: "Due date", value: inv.due_date ? fmtDate(inv.due_date) : "No due date" },
      { label: "Reference", value: inv.reference ?? "No reference" },
      { label: "Total", value: rm(inv.total_amount) },
      { label: "Received", value: rm(inv.received_amount) },
      { label: "Outstanding", value: otherDebtorOutstandingWord(inv) ?? rm(inv.outstanding ?? 0) },
    ],
    lines: {
      rows: detail.lines.map((l): PreviewLine => ({ key: String(l.line_no), description: l.description ?? "No description",
        account: account(l.account_code, l.account_name), amount: l.amount })),
      empty: "No line yet.",
    },
    entryNos: posted(inv.entry_no, inv.reversal_entry_no),
    noEntry: "Nothing was entered in the ledger yet.",
  } : null;
  return <DocumentPreview open={id !== null} onClose={onClose} onView={() => id && onView(id)}
    title={inv ? `${otherDebtorInvoiceNumberWord(inv)} · ${inv.party_name}` : "Other debtors"}
    read={q} what="This invoice" loadingWord="Loading invoice…" content={content} />;
}

export function OtherReceiptPreview({ id, onClose, onView }: Props) {
  const q = useOtherReceipt(id);
  const detail = id ? q.data : undefined;
  const r = detail?.receipt;
  const from = r ? r.party_name ?? r.payer_name : "";
  const content: PreviewContent | null = detail && r ? {
    facts: [
      { label: "Status", value: otherReceiptStatusWord(r.status) },
      { label: "Received from", value: from },
      { label: "Receipt date", value: fmtDate(r.receipt_date) },
      { label: "Received into", value: account(r.money_account_code, r.money_account_name) },
      { label: "Reference", value: r.reference ?? "No reference" },
      { label: "Total", value: rm(r.total_amount) },
    ],
    /* What it was for, as its page lists it: the invoices it paid, then its lines. */
    lines: {
      rows: [
        ...detail.allocations.map((a): PreviewLine => ({ key: `i-${a.invoice_id}`, account: "",
          description: `${a.invoice_no} · Invoice of ${fmtDate(a.invoice_date)}`, amount: a.amount })),
        ...detail.lines.map((l): PreviewLine => ({ key: `l-${l.line_no}`, description: l.description ?? "No description",
          account: account(l.account_code, l.account_name), amount: l.amount })),
      ],
      empty: "No line yet.",
    },
    entryNos: posted(r.entry_no, r.reversal_entry_no),
    noEntry: "Nothing was entered in the ledger yet.",
  } : null;
  return <DocumentPreview open={id !== null} onClose={onClose} onView={() => id && onView(id)}
    title={r ? `${r.receipt_no} · ${from}` : "Other receipts"}
    read={q} what="This receipt" loadingWord="Loading receipt…" content={content} />;
}

/** A journal entry: its lines ARE its General Ledger entry, so no Lines table. */
export function EntryPreview({ entryNo, onClose, onView }: {
  entryNo: string | null; onClose: () => void; onView: (entryNo: string) => void;
}) {
  const q = useLedgerEntry(entryNo);
  const e = entryNo ? q.data?.entry : undefined;
  const content: PreviewContent | null = e ? {
    facts: [
      { label: "Date", value: fmtDate(e.entry_date) },
      { label: "Source", value: ledgerSourceWord(e.source_type) },
      { label: "Document", value: ledgerDocWord(e.source_doc_no) },
      { label: "Narration", value: e.narration ?? "No narration" },
    ],
    entryNos: [e.entry_no, e.reversed_by_entry_no ?? e.reverses_entry_no].filter((n): n is string => !!n),
    noEntry: "This entry has no lines.",
  } : null;
  return <DocumentPreview open={entryNo !== null} onClose={onClose} onView={() => entryNo && onView(entryNo)}
    title={e?.entry_no ?? entryNo ?? "Journal"}
    read={q} what="This entry" loadingWord="Loading entry…" content={content} />;
}

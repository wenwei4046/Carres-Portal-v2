/**
 * Finance → Other debtors, at `/finance/other-debtors` (migration 0478).
 *
 * Money owed to Carres by someone who is not a customer — a sister company
 * that rents part of the office, a person Carres lent money to. Two lists and
 * one object, chosen by the URL so Back and a pasted link both work:
 *
 *   (none)             the invoice Register   · Row 2 create: New invoice
 *   ?view=parties      the party Register     · Row 2 create: New party
 *   ?invoice=new|<id>  one invoice (InvoicePage), `&party=` prefills a new one
 *
 * Register shell per UI MASTER §6.7: the word alone in Row 1, the create
 * action and the sibling list in Row 2, the summary in the 32px footer, and
 * no KPI strip. Customer money is never here — it lives in Payments.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  financePartyKindWord,
  otherDebtorInvoiceNumberWord,
  otherDebtorInvoiceStatusWord,
  otherDebtorOutstandingWord,
  sumMoney,
  type OtherDebtorInvoiceRow,
  type OtherDebtorPartyRow,
} from "@carres/shared/other-money-in";
import Button from "@/components/kit/Button";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import { useOtherDebtorInvoices, useOtherDebtorParties } from "./api";
import { DepartmentFilter, useDepartmentParam } from "../department";
import InvoicePage from "./InvoicePage";
import PartyModal from "./PartyModal";
import { LoadFailed } from "./parts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function invoiceOutstandingCell(r: OtherDebtorInvoiceRow): string {
  return otherDebtorOutstandingWord(r) ?? rm(Number(r.outstanding));
}

function whatFor(r: OtherDebtorInvoiceRow): string {
  if (!r.first_line) return "No line on file";
  return r.line_count > 1 ? `${r.first_line} and ${r.line_count - 1} more` : r.first_line;
}

export default function OtherDebtorsPage() {
  const [params, setParams] = useSearchParams();
  const invoiceParam = params.get("invoice");
  const partyParam = params.get("party");
  const view = params.get("view") === "parties" ? "parties" : "invoices";

  const go = (patch: Record<string, string | null>) =>
    setParams((before) => {
      const next = new URLSearchParams(before);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) next.delete(k);
        else next.set(k, v);
      }
      return next;
    });

  const openInvoice = (id: string) => go({ invoice: id, party: null });
  const newInvoice = (partyId: string | null) => go({ invoice: "new", party: partyId });
  const back = () => go({ invoice: null, party: null });

  let body: ReactNode;
  if (invoiceParam !== null) {
    const id = invoiceParam === "new" ? null : UUID_RE.test(invoiceParam) ? invoiceParam : "";
    body =
      id === "" ? (
        <div className="p-6 text-body flex flex-col items-start gap-3">
          <p>This invoice is not available.</p>
          <Button variant="neutral" onClick={back}>
            Back to Other debtors
          </Button>
        </div>
      ) : (
        <InvoicePage
          key={invoiceParam}
          invoiceId={id}
          prefillPartyId={partyParam && UUID_RE.test(partyParam) ? partyParam : null}
          onBack={back}
          onOpen={openInvoice}
        />
      );
  } else if (view === "parties") {
    body = <PartyRegister onNewInvoice={newInvoice} />;
  } else {
    body = <InvoiceRegister onOpen={openInvoice} onNew={() => newInvoice(null)} />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ModuleHeader destinationHeader testId="other-debtors-destination-header" word="Other debtors" docTitle="Other debtors — Carres" />
      {body}
    </div>
  );
}

/* ── the two sibling lists, named in Row 2 ─────────────────────────────────── */

function Siblings({ current }: { current: "invoices" | "parties" }) {
  return (
    <span className="flex items-center gap-3 text-body">
      {current === "invoices" ? (
        <span aria-current="page" className="font-semibold">
          Invoices
        </span>
      ) : (
        <Link to="/finance/other-debtors">Invoices</Link>
      )}
      {current === "parties" ? (
        <span aria-current="page" className="font-semibold">
          Parties
        </span>
      ) : (
        <Link to="/finance/other-debtors?view=parties">Parties</Link>
      )}
    </span>
  );
}

/* ── the invoice Register ──────────────────────────────────────────────────── */

function InvoiceRegister({ onOpen, onNew }: { onOpen: (id: string) => void; onNew: () => void }) {
  const [, setDept, dept] = useDepartmentParam();
  const query = useOtherDebtorInvoices(dept);
  const columns = useMemo<DataGridColumn<OtherDebtorInvoiceRow>[]>(
    () => [
      {
        key: "invoice",
        label: "Invoice No",
        width: 190,
        accessor: (r) => otherDebtorInvoiceNumberWord(r),
        searchValue: (r) => r.invoice_no ?? "",
        filterValue: (r) => r.invoice_no ?? "",
        filterType: "numbering",
        exportValue: (r) => otherDebtorInvoiceNumberWord(r),
      },
      {
        key: "date",
        label: "Invoice Date",
        width: 140,
        accessor: (r) => fmtDate(r.invoice_date),
        dateValue: (r) => r.invoice_date,
        filterType: "date",
        exportValue: (r) => fmtDate(r.invoice_date),
      },
      {
        key: "party",
        label: "Party",
        width: 220,
        accessor: (r) => r.party_name,
        searchValue: (r) => r.party_name,
        filterType: "enum",
      },
      {
        key: "what",
        label: "What for",
        width: 240,
        accessor: whatFor,
        searchValue: (r) => [r.first_line, r.reference, r.narration].filter(Boolean).join(" "),
        exportValue: whatFor,
      },
      {
        key: "total",
        label: "Total",
        width: 130,
        align: "right",
        accessor: (r) => rm(Number(r.total_amount)),
        numberValue: (r) => Number(r.total_amount),
        filterType: "number",
        exportValue: (r) => Number(r.total_amount),
      },
      {
        key: "outstanding",
        label: "Outstanding",
        width: 140,
        align: "right",
        accessor: invoiceOutstandingCell,
        numberValue: (r) => (r.status === "issued" ? Number(r.outstanding) : null),
        exportValue: invoiceOutstandingCell,
      },
      {
        key: "due",
        label: "Due Date",
        width: 140,
        accessor: (r) => (r.due_date ? fmtDate(r.due_date) : "No due date"),
        dateValue: (r) => r.due_date,
        filterType: "date",
        exportValue: (r) => (r.due_date ? fmtDate(r.due_date) : "No due date"),
      },
      {
        key: "status",
        label: "Status",
        width: 120,
        accessor: (r) => otherDebtorInvoiceStatusWord(r.status),
        searchValue: (r) => otherDebtorInvoiceStatusWord(r.status),
        filterType: "enum",
      },
      {
        key: "reference",
        label: "Reference",
        width: 160,
        defaultHidden: true,
        accessor: (r) => r.reference ?? "No reference",
        searchValue: (r) => r.reference ?? "",
      },
    ],
    [],
  );

  if (query.isError) return <LoadFailed what="Other debtor invoices" onRetry={() => void query.refetch()} />;

  return (
    <ListPageShell register>
      <DataGrid
        rows={query.data ?? []}
        columns={columns}
        rowKey={(r) => r.invoice_id}
        storageKey="carres.finance.other-debtor-invoices.v1"
        appearance="reference"
        exportName="Other debtor invoices"
        groupBanner={false}
        stickyIdentity
        isLoading={!query.isSuccess}
        searchPlaceholder="Search invoices…"
        toolbarStart={
          <span className="flex items-center gap-4">
            <Button variant="primary" size="sm" shape="pill" icon="add" onClick={onNew}>
              New invoice
            </Button>
            <Siblings current="invoices" />
            <DepartmentFilter value={dept} onChange={setDept} />
          </span>
        }
        emptyMessage="No other debtor invoice yet. Press New invoice to bill a party that is not a customer."
        expandTitle="Inspect invoice"
        onRowDoubleClick={(r) => onOpen(r.invoice_id)}
        expandable={{
          renderExpansion: (r) => (
            <div className="p-4 text-body flex flex-col items-start gap-1">
              <p>
                {r.party_name} · {whatFor(r)}
              </p>
              <p>
                Total {rm(Number(r.total_amount))} · Received {rm(Number(r.received_amount))} · Outstanding {invoiceOutstandingCell(r)}
              </p>
              {r.status === "cancelled" && <p>Cancelled · {r.cancel_reason ?? "No reason on file"}</p>}
              <div className="mt-2">
                <Button variant="neutral" onClick={() => onOpen(r.invoice_id)}>
                  Open invoice
                </Button>
              </div>
            </div>
          ),
        }}
        statusSummary={(visible) => {
          const owed = sumMoney(visible.filter((r) => r.status === "issued").map((r) => r.outstanding));
          return (
            <span data-testid="other-debtor-invoices-summary">
              {visible.length} {visible.length === 1 ? "invoice" : "invoices"} · {rm(owed)} outstanding
            </span>
          );
        }}
      />
    </ListPageShell>
  );
}

/* ── the party Register ────────────────────────────────────────────────────── */

function PartyRegister({ onNewInvoice }: { onNewInvoice: (partyId: string | null) => void }) {
  const query = useOtherDebtorParties();
  /* `undefined` = closed; `null` = a new party; a row = edit that party. */
  const [editing, setEditing] = useState<OtherDebtorPartyRow | null | undefined>(undefined);
  const columns = useMemo<DataGridColumn<OtherDebtorPartyRow>[]>(
    () => [
      {
        key: "name",
        label: "Party",
        width: 240,
        accessor: (r) => r.name,
        searchValue: (r) => [r.name, r.registration_no, r.phone, r.email].filter(Boolean).join(" "),
        exportValue: (r) => r.name,
      },
      {
        key: "kind",
        label: "Company or person",
        width: 160,
        accessor: (r) => financePartyKindWord(r.kind),
        filterType: "enum",
      },
      {
        key: "registration",
        label: "SSM or IC number",
        width: 170,
        accessor: (r) => r.registration_no ?? "No number on file",
      },
      {
        key: "phone",
        label: "Phone",
        width: 140,
        accessor: (r) => r.phone ?? "No phone on file",
      },
      {
        key: "open",
        label: "Open invoices",
        width: 130,
        align: "right",
        accessor: (r) => String(r.invoices_open),
        numberValue: (r) => r.invoices_open,
        exportValue: (r) => r.invoices_open,
      },
      {
        key: "outstanding",
        label: "Outstanding",
        width: 140,
        align: "right",
        accessor: (r) => rm(Number(r.outstanding)),
        numberValue: (r) => Number(r.outstanding),
        filterType: "number",
        exportValue: (r) => Number(r.outstanding),
      },
      {
        key: "oldest",
        label: "Oldest open invoice",
        width: 170,
        accessor: (r) => (r.oldest_open_invoice_date ? fmtDate(r.oldest_open_invoice_date) : "No open invoice"),
        dateValue: (r) => r.oldest_open_invoice_date,
        filterType: "date",
      },
      {
        key: "active",
        label: "Status",
        width: 120,
        accessor: (r) => (r.is_active ? "Active" : "Not active"),
        filterType: "enum",
      },
    ],
    [],
  );

  if (query.isError) return <LoadFailed what="Other debtor parties" onRetry={() => void query.refetch()} />;

  return (
    <ListPageShell register>
      <DataGrid
        rows={query.data ?? []}
        columns={columns}
        rowKey={(r) => r.party_id}
        storageKey="carres.finance.other-debtor-parties.v1"
        appearance="reference"
        exportName="Other debtor parties"
        groupBanner={false}
        stickyIdentity
        isLoading={!query.isSuccess}
        searchPlaceholder="Search parties…"
        toolbarStart={
          <span className="flex items-center gap-4">
            <Button variant="primary" size="sm" shape="pill" icon="add" onClick={() => setEditing(null)}>
              New party
            </Button>
            <Siblings current="parties" />
          </span>
        }
        emptyMessage="No party yet. Press New party to add a sister company, a lender or a person."
        expandTitle="Inspect party"
        onRowDoubleClick={(r) => setEditing(r)}
        expandable={{
          renderExpansion: (r) => (
            <div className="p-4 text-body flex flex-col items-start gap-1">
              <p>{r.address ?? "No address on file"}</p>
              <p>{r.email ?? "No email on file"}</p>
              {r.notes && <p>{r.notes}</p>}
              <p>
                Invoiced {rm(Number(r.invoiced_total))} · Received {rm(Number(r.received_total))} · Outstanding {rm(Number(r.outstanding))}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button variant="neutral" onClick={() => setEditing(r)}>
                  Edit party
                </Button>
                {r.is_active && (
                  <Button variant="neutral" onClick={() => onNewInvoice(r.party_id)}>
                    New invoice
                  </Button>
                )}
              </div>
            </div>
          ),
        }}
        statusSummary={(visible) => (
          <span data-testid="other-debtor-parties-summary">
            {visible.length} {visible.length === 1 ? "party" : "parties"} · {rm(sumMoney(visible.map((r) => r.outstanding)))} outstanding
          </span>
        )}
      />
      {editing !== undefined && (
        <PartyModal
          key={editing?.party_id ?? "new"}
          open
          party={editing}
          onClose={() => setEditing(undefined)}
        />
      )}
    </ListPageShell>
  );
}

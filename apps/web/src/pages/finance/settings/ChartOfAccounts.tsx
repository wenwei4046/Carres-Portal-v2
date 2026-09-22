/**
 * Finance Settings → Chart of accounts (migrations 0539, 0550).
 *
 * Every account in the chart as a tree: each account under its parent,
 * indented by depth. A heading account (one another account names as parent)
 * is bold; the ledger never posts to it. A row click opens the account's name
 * and its number. Since 0550 the number can change: every key that names the
 * chart cascades, so posted lines follow the account to its new number rather
 * than being left pointing at nothing.
 *
 * One ceiling, and it is the database's, not this screen's: an account named
 * on a document that has left Draft cannot be renumbered yet. That refusal
 * comes back from the frozen-document triggers in the door's own words.
 */
import { useMemo, useState } from "react";
import { chartTree, ledgerKindWord, type LedgerAccount } from "@carres/shared/finance-ledger";
import Button from "@/components/kit/Button";
import Input from "@/components/kit/Input";
import Modal from "@/components/kit/Modal";
import { FieldError } from "@/components/kit/FieldFrame";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { useLedgerChart } from "../ledger/ledger-queries";
import { LoadFailed } from "../other-money-in/parts";
import { useSaveAccount } from "./api";

type Row = LedgerAccount & { depth: number };

export default function ChartOfAccounts() {
  const query = useLedgerChart();
  const rows = useMemo(() => chartTree(query.data?.accounts ?? []), [query.data]);
  const [editing, setEditing] = useState<Row | null>(null);
  const columns = useMemo<DataGridColumn<Row>[]>(
    () => [
      {
        key: "account",
        label: "Account",
        width: 360,
        sortable: false,
        accessor: (r) => (
          <span style={{ paddingLeft: r.depth * 20 }} className={r.is_header ? "font-semibold" : undefined}>
            {r.code} {r.name}
          </span>
        ),
        searchValue: (r) => `${r.code} ${r.name}`,
        filterable: false,
      },
      { key: "kind", label: "Kind", width: 140, sortable: false, accessor: (r) => ledgerKindWord(r.kind), filterType: "enum" },
      { key: "status", label: "Status", width: 120, sortable: false, accessor: (r) => (r.is_active ? "Active" : "Not active"), filterType: "enum" },
    ],
    [],
  );

  if (query.isError) return <LoadFailed what="The chart of accounts" onRetry={() => void query.refetch()} />;
  return (
    <ListPageShell register>
      <DataGrid
        rows={rows}
        columns={columns}
        rowKey={(r) => r.code}
        storageKey="carres.finance.chart-of-accounts.v1"
        appearance="reference"
        groupBanner={false}
        stickyIdentity
        isLoading={!query.isSuccess}
        onRowClick={(r) => setEditing(r)}
      />
      {editing && <AccountModal key={editing.code} account={editing} onClose={() => setEditing(null)} />}
    </ListPageShell>
  );
}

/**
 * Which field a refusal is about. The sentence shown is always the door's own
 * (0550 raises it, the API forwards it) — the `code` tag only says where to put
 * it, so the copy lives in one place instead of two.
 */
function refusalOf(error: unknown): { field: "name" | "code" | null; message: string } {
  const body = (error as { body?: unknown } | null)?.body;
  const tag = body && typeof body === "object" ? (body as { code?: unknown }).code : null;
  const field =
    tag === "code_shape" || tag === "code_exists" ? "code" as const
    : tag === "name_exists" || tag === "name_missing" || tag === "name_too_long" ? "name" as const
    : null;
  return { field, message: (error as Error).message };
}

function AccountModal({ account, onClose }: { account: Row; onClose: () => void }) {
  const save = useSaveAccount();
  const [name, setName] = useState(account.name);
  const [code, setCode] = useState(account.code);
  const [refusal, setRefusal] = useState<{ field: "name" | "code" | null; message: string } | null>(null);
  const trimmed = name.trim();
  const trimmedCode = code.trim();
  const submit = () => {
    setRefusal(null);
    save.mutate(
      { code: account.code, name: trimmed, newCode: trimmedCode },
      { onSuccess: onClose, onError: (e) => setRefusal(refusalOf(e)) },
    );
  };
  return (
    <Modal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="Account"
      description={`${account.code} · ${ledgerKindWord(account.kind)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={save.isPending} disabled={!trimmed || !trimmedCode} onClick={submit}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3" data-testid="account-rename-form">
        <Input id="account-name" label="Name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        {refusal?.field === "name" && <FieldError>{refusal.message}</FieldError>}
        <Input id="account-code" label="Number" required maxLength={8} value={code} onChange={(e) => setCode(e.target.value)} />
        {refusal?.field === "code" && <FieldError>{refusal.message}</FieldError>}
        {refusal && refusal.field === null && <FieldError>{refusal.message}</FieldError>}
      </div>
    </Modal>
  );
}

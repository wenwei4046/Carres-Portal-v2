/**
 * Finance Settings → Chart of accounts (migration 0539).
 *
 * Every account in the chart as a tree: each account under its parent,
 * indented by depth. A heading account (one another account names as parent)
 * is bold; the ledger never posts to it. A row click renames the account. The
 * code never changes: posted lines point at it.
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
import { useRenameAccount } from "./api";

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
        exportValue: (r) => `${r.code} ${r.name}`,
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
      {editing && <RenameModal key={editing.code} account={editing} onClose={() => setEditing(null)} />}
    </ListPageShell>
  );
}

function RenameModal({ account, onClose }: { account: Row; onClose: () => void }) {
  const rename = useRenameAccount();
  const [name, setName] = useState(account.name);
  const [refusal, setRefusal] = useState<string | null>(null);
  const trimmed = name.trim();
  const submit = () => {
    setRefusal(null);
    rename.mutate({ code: account.code, name: trimmed }, { onSuccess: onClose, onError: (e) => setRefusal(e.message) });
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
          <Button variant="primary" loading={rename.isPending} disabled={!trimmed} onClick={submit}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3" data-testid="account-rename-form">
        <Input id="account-name" label="Name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        {refusal && <FieldError>{refusal}</FieldError>}
      </div>
    </Modal>
  );
}

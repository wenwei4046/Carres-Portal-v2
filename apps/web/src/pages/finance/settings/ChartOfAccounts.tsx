/**
 * Finance Settings → Chart of accounts (migration 0539).
 *
 * Every account in the chart as a tree: each account under its parent,
 * indented by depth. A heading account (one another account names as parent)
 * is bold; the ledger never posts to it. A row click renames the account, and
 * a row DRAG moves it (0557).
 *
 * THE ORDER IS NOT THE NUMBER (0557). The chart carries its own display order
 * — one integer per account, ordered within its heading, ties broken on the
 * code — and moving an account changes only that. The account number is never
 * written by a move: `gl_entry_lines` points at the code (0462), so the number
 * is changed on purpose, by hand, as its own separate act. The old header line
 * here said "the code never changes"; that stopped being the whole truth when
 * the number became editable in its own right (0550, a separate branch).
 *
 * WHICH IS WHY EVERY COLUMN IS `sortable: false`, AND STAYS THAT WAY. This
 * grid prints a TREE, not a list. Sorting a column would lift children away
 * from the parent they are indented under, and would silently replace the
 * order Finance chose with one the column picked. The order on this screen is
 * the chart's own order, and the only thing that may change it is a move.
 *
 * THE MOVE IS A REAL DRAG. The kit had a drag affordance for COLUMN HEADERS
 * only, so `rowDrag` was added to `DataGrid` for this screen — the browser's
 * own drag and drop, no new dependency, opt-in, and every other grid passes no
 * `rowDrag` and is unchanged. Alt + up/down does the same move from the
 * keyboard, because a drag-only control locks out anyone not using a mouse.
 * There are no move buttons.
 *
 * ONLY AMONG SIBLINGS. `canDrop` answers false across headings, so the screen
 * never OFFERS a move the database would refuse — dropping across a heading is
 * a reparent, a different and much bigger ruling (0462).
 *
 * THE ORDER IT READ AND THE ORDER IT WANTS BOTH GO UP. `was` is built from the
 * chart as it stands on screen, `now` from the move; they are never the same
 * array. If they were, `gl_accounts_reorder`'s staleness check would pass every
 * time and two people dragging at once would silently overwrite each other.
 * When it refuses, the screen prints the database's sentence and re-reads the
 * chart — the move is not swallowed, and the optimistic order is thrown away
 * rather than left on screen as a lie.
 */
import { useEffect, useMemo, useState } from "react";
import { chartTree, ledgerKindWord, type LedgerAccount } from "@carres/shared/finance-ledger";
import Button from "@/components/kit/Button";
import Input from "@/components/kit/Input";
import Modal from "@/components/kit/Modal";
import { FieldError } from "@/components/kit/FieldFrame";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { useLedgerChart } from "../ledger/ledger-queries";
import { LoadFailed } from "../other-money-in/parts";
import { useRenameAccount, useReorderAccounts } from "./api";

type Row = LedgerAccount & { depth: number };

export default function ChartOfAccounts() {
  const query = useLedgerChart();
  const reorder = useReorderAccounts();
  /* The order a drag put on screen, before the server has answered. Held whole
     rather than as a diff so `chartTree` keeps reading one list. */
  const [moved, setMoved] = useState<LedgerAccount[] | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const served = query.data?.accounts;
  /* Every fresh read wins over an optimistic order — including the re-read a
     refusal triggers, which is how a refused move leaves the screen. */
  useEffect(() => setMoved(null), [query.dataUpdatedAt]);
  const accounts = useMemo(() => moved ?? served ?? [], [moved, served]);
  const rows = useMemo(() => chartTree(accounts), [accounts]);
  const [editing, setEditing] = useState<Row | null>(null);

  const move = (dragged: Row, target: Row) => {
    /* This heading's children in the order the screen is reading them — that
       is exactly what `was` has to be. */
    const was = accounts
      .filter((a) => a.parent_code === dragged.parent_code)
      .sort((x, y) => x.sort_order - y.sort_order || x.code.localeCompare(y.code))
      .map((a) => a.code);
    const from = was.indexOf(dragged.code);
    const to = was.indexOf(target.code);
    if (from < 0 || to < 0 || from === to) return;
    const now = [...was];
    now.splice(from, 1);
    now.splice(to, 0, dragged.code);
    setRefusal(null);
    /* 1..n is exactly what gl_accounts_reorder writes, so the optimistic chart
       and the stored chart agree without waiting for the read. Every other
       field is carried across untouched: a move never writes an account
       number. */
    setMoved(
      accounts.map((a) => {
        const i = now.indexOf(a.code);
        return i < 0 ? a : { ...a, sort_order: i + 1 };
      }),
    );
    reorder.mutate(
      { parentCode: dragged.parent_code, was, now },
      {
        onError: (e) => {
          setRefusal(e.message);
          setMoved(null);
          void query.refetch();
        },
      },
    );
  };

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
      {/* PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md). */}
      <p className="text-body text-kit-slate-11">
        Drag an account to move it. Hold Alt and press the up or down arrow to move it from the keyboard.
      </p>
      {refusal && (
        <p role="alert" data-testid="chart-refusal" className="text-body text-kit-red-11">
          {refusal}
        </p>
      )}
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
        rowDrag={{
          /* An account moves among the accounts under its own heading and
             nowhere else, and not at all while a move is in flight — a second
             move would send a `was` the server has not stored yet. */
          canDrop: (a, b) => !reorder.isPending && a.parent_code === b.parent_code && a.code !== b.code,
          onMove: move,
        }}
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

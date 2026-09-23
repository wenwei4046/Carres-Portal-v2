/**
 * Finance Settings → Chart of accounts (migrations 0539, 0550, 0557).
 *
 * Every account in the chart as a tree: each account under its parent,
 * indented by depth. A heading account (one another account names as parent)
 * is bold; the ledger never posts to it. A row click opens the account's name
 * and its number. Since 0550 the number can change: every key that names the
 * chart cascades, so posted lines follow the account to its new number rather
 * than being left pointing at nothing.
 *
 * Since 0570 an account named on a document that has left Draft renumbers
 * too: each frozen document's trigger lets the new number through and nothing
 * else, so the owner can renumber the whole chart from this screen.
 *
 * A row DRAG moves the account (0557) — a separate act from the modal above.
 *
 * THE ORDER IS NOT THE NUMBER (0557). The chart carries its own display order
 * — one integer per account, ordered within its heading, ties broken on the
 * code — and moving an account changes only that. A move never writes the
 * number: the two are separate acts, and the number changes only by hand, in
 * the modal above.
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
 * A DROP ON A HEADING PUTS THE ACCOUNT UNDER IT (0570), a sibling heading
 * included. The number and name stay; the parent changes, so the P&L and
 * Balance Sheet print it under the new heading on their next read. Only a
 * POSTING account goes under another heading: a heading keeps its place among
 * its siblings, because the reports group by the immediate parent only. The
 * screen offers only what `gl_account_move` takes — a heading of the same
 * kind, not the one it is under, never into or out of a heading
 * `rule_headings` names, and never the last account under a heading — so it
 * never offers a move the database would refuse. A drop on an account beside
 * it reorders (0557). Alt + up/down only reorders (`canStep`, `onStep`), so a
 * sibling heading can still be stepped past; the keyboard way under another
 * heading is the row menu (Shift+F10, the Menu key or a right-click).
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
import { chartTree, ledgerKindWord, LEDGER_ACCOUNT_CODE_MESSAGE, type LedgerAccount } from "@carres/shared/finance-ledger";
import { ledgerAccountCodeInput } from "@carres/shared/schemas/finance";
import Button from "@/components/kit/Button";
import Input from "@/components/kit/Input";
import Modal from "@/components/kit/Modal";
import { FieldError } from "@/components/kit/FieldFrame";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { useLedgerChart } from "../ledger/ledger-queries";
import { LoadFailed } from "../other-money-in/parts";
import { useMoveAccount, useReorderAccounts, useSaveAccount } from "./api";

type Row = LedgerAccount & { depth: number };

/** The chart's own order: the order Finance set, then the number. */
const byOrder = (x: LedgerAccount, y: LedgerAccount) => x.sort_order - y.sort_order || x.code.localeCompare(y.code);

export default function ChartOfAccounts() {
  const query = useLedgerChart();
  const reorder = useReorderAccounts();
  const moveUnder = useMoveAccount();
  /* No second move while one is in flight: it would send a `was` the server
     has not stored yet. */
  const busy = reorder.isPending || moveUnder.isPending;
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

  /** The codes under one heading in the order the screen is reading them —
      exactly what a `was` has to be. */
  const childrenOf = (parent: string | null) =>
    accounts.filter((a) => a.parent_code === parent).sort(byOrder).map((a) => a.code);

  /** A refusal is printed as the database wrote it, and the chart is read
      again so the optimistic order leaves the screen. */
  const refused = (e: Error) => {
    setRefusal(e.message);
    setMoved(null);
    void query.refetch();
  };

  const ruleHeadings = useMemo(() => new Set(query.data?.rule_headings ?? []), [query.data]);

  /** A heading posting account `a` may go under — gl_account_move's own
      refusals, so the screen never offers one: `a` is not a heading, `h` is a
      heading of the same kind and not the one `a` is under, neither heading
      decides how money may be recorded, and `a` is not the last account
      under its heading (active or retired). */
  const canGoUnder = (a: LedgerAccount, h: LedgerAccount) =>
    !a.is_header &&
    h.is_header &&
    h.kind === a.kind &&
    h.code !== a.parent_code &&
    !ruleHeadings.has(h.code) &&
    !(a.parent_code !== null && ruleHeadings.has(a.parent_code)) &&
    (a.parent_code === null || accounts.some((o) => o.parent_code === a.parent_code && o.code !== a.code));

  const move = (dragged: Row, target: Row) => {
    const was = childrenOf(dragged.parent_code);
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
    reorder.mutate({ parentCode: dragged.parent_code, was, now }, { onError: refused });
  };

  /** Put `dragged` at the end of another heading (0570). Two before/after
      pairs go up, one per heading; the number and the name are not sent. */
  const putUnder = (dragged: LedgerAccount, heading: LedgerAccount) => {
    const fromWas = childrenOf(dragged.parent_code);
    const fromNow = fromWas.filter((c) => c !== dragged.code);
    const toWas = childrenOf(heading.code);
    const toNow = [...toWas, dragged.code];
    setRefusal(null);
    setMoved(
      accounts.map((a) => {
        if (a.code === dragged.code) return { ...a, parent_code: heading.code, sort_order: toNow.length };
        const i = fromNow.indexOf(a.code);
        if (i >= 0) return { ...a, sort_order: i + 1 };
        const j = toWas.indexOf(a.code);
        return j < 0 ? a : { ...a, sort_order: j + 1 };
      }),
    );
    moveUnder.mutate(
      { code: dragged.code, toParentCode: heading.code, from: { was: fromWas, now: fromNow }, to: { was: toWas, now: toNow } },
      { onError: refused },
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
      {/* PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, 0570). */}
      <p className="text-body text-kit-slate-11">
        Drag an account onto a heading to put it under that heading, or onto an account beside it to change its place.
        From the keyboard, hold Alt and press the up or down arrow to change its place, or press Shift+F10 to choose a heading.
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
          /* A drop on a heading the account may go under puts it there, a
             sibling heading included; any other drop on a sibling reorders.
             Nothing while a move is in flight. */
          canDrop: (a, b) => !busy && a.code !== b.code && (a.parent_code === b.parent_code || canGoUnder(a, b)),
          onMove: (a, b) => (canGoUnder(a, b) ? putUnder(a, b) : move(a, b)),
          /* Alt + up/down only reorders among siblings, headings included. */
          canStep: (a, b) => !busy && a.code !== b.code && a.parent_code === b.parent_code,
          onStep: move,
        }}
        /* The keyboard way under another heading (Shift+F10 or the Menu key),
           and the same list on a right-click. */
        contextMenu={(r) =>
          busy
            ? []
            : rows.filter((h) => canGoUnder(r, h)).map((h) => ({
                // PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, 0570).
                label: `Move under ${h.code} ${h.name}`,
                onClick: () => putUnder(r, h),
              }))
        }
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
    // 0570's shape, checked here too so the sentence sits under the Number
    // field; a lower-case letter (900-a001) goes up in capitals, as stored.
    const shaped = ledgerAccountCodeInput.safeParse(trimmedCode);
    if (!shaped.success) {
      setRefusal({ field: "code", message: LEDGER_ACCOUNT_CODE_MESSAGE });
      return;
    }
    save.mutate(
      { code: account.code, name: trimmed, newCode: shaped.data },
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

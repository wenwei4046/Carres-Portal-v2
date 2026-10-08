/**
 * Finance Settings → Item groups (0659, Chew 2026-10-07, docs/finance/MASTER.md
 * §0 "Item groups").
 *
 * Each catalog product is in an item group, and each group binds four
 * accounts: Purchase, Sales, Sales return and Purchase return. A supplier
 * bill's goods line posts to its group's purchase account, a sale's goods to
 * its group's sales account. A change applies to bills and sales from then on.
 *
 * WHAT THE PAGE SHOWS, TOP TO BOTTOM.
 *   The groups      one row each, with its four accounts. An empty account
 *                   reads `No account yet`, in red: a bill of that group is not
 *                   confirmed, and a sale goes to the goods account instead.
 *   Products        every product in the catalog and the group it is in. A
 *                   product starts in its category's group; a row click moves
 *                   it into another one. The catalog itself is not changed.
 *   Sales posted to the goods account
 *                   shown only when there are some: goods whose group had no
 *                   sales account, or whose SKU is not in the catalog.
 *   Changes         who changed what, when.
 *
 * Every window sends what the screen showed (`was`); a change someone made in
 * between is refused, never overwritten.
 */
import { useMemo, useState } from "react";
import { categoryLabel } from "@carres/shared";
import type {
  LedgerItemGroup,
  LedgerItemGroupChange,
  LedgerItemGroupProduct,
  LedgerItemGroupUnboundSale,
} from "@carres/shared";
import type { LedgerAccount } from "@carres/shared/finance-ledger";
import Button from "@/components/kit/Button";
import Checkbox from "@/components/kit/Checkbox";
import DataTable, { type Column } from "@/components/kit/DataTable";
import Input from "@/components/kit/Input";
import Modal from "@/components/kit/Modal";
import Select from "@/components/kit/Select";
import { FieldError } from "@/components/kit/FieldFrame";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { fmtDate } from "@/lib/fmt-date";
import { useLedgerChart } from "../ledger/ledger-queries";
import { LoadFailed } from "../other-money-in/parts";
import { money } from "../payables/payables-words";
import { usePlaceProduct, useItemGroups, useSaveItemGroup } from "./api";
import { postingAccountOptions } from "./PostingAccounts";

/** The four accounts, in the order the page prints them, and the kind each takes. */
export const ITEM_GROUP_ACCOUNTS = [
  { key: "purchase", label: "Purchase", field: "Purchase account", kind: "EXPENSE" },
  { key: "sales", label: "Sales", field: "Sales account", kind: "INCOME" },
  { key: "salesReturn", label: "Sales return", field: "Sales return account", kind: "INCOME" },
  { key: "purchaseReturn", label: "Purchase return", field: "Purchase return account", kind: "EXPENSE" },
] as const;
type AccountKey = (typeof ITEM_GROUP_ACCOUNTS)[number]["key"];

const codeOf = (g: LedgerItemGroup, k: AccountKey) => g[`${k}Account`];
const nameOf = (g: LedgerItemGroup, k: AccountKey) => g[`${k}Name`];

/** The group as the window opened it: the door refuses when it changed since. */
export function itemGroupWas(g: LedgerItemGroup) {
  return {
    name: g.name,
    purchaseAccount: g.purchaseAccount,
    salesAccount: g.salesAccount,
    salesReturnAccount: g.salesReturnAccount,
    purchaseReturnAccount: g.purchaseReturnAccount,
    active: g.active,
  };
}

const changedWord = (at: string, by: string | null) => `${fmtDate(at)}${by ? ` · ${by}` : ""}`;

function accountCell(code: string | null, name: string | null) {
  // PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), 0657).
  return code ? `${code} ${name ?? ""}` : <span className="text-kit-red-11">No account yet</span>;
}

export default function ItemGroups() {
  const query = useItemGroups();
  const chart = useLedgerChart();
  /* `null` = closed; "new" = a new group; a group = that group. */
  const [open, setOpen] = useState<LedgerItemGroup | "new" | null>(null);
  const [moving, setMoving] = useState<LedgerItemGroupProduct | null>(null);

  const groups = query.data?.groups ?? [];
  const groupName = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);

  const columns = useMemo<DataGridColumn<LedgerItemGroup>[]>(
    () => [
      { key: "name", label: "Item group", width: 200, accessor: (g) => g.name, searchValue: (g) => g.name },
      ...ITEM_GROUP_ACCOUNTS.map((a): DataGridColumn<LedgerItemGroup> => ({
        key: a.key,
        label: a.label,
        width: 240,
        sortable: false,
        accessor: (g) => accountCell(codeOf(g, a.key), nameOf(g, a.key)),
        searchValue: (g) => `${codeOf(g, a.key) ?? ""} ${nameOf(g, a.key) ?? ""}`,
        exportValue: (g) => (codeOf(g, a.key) ? `${codeOf(g, a.key)} ${nameOf(g, a.key) ?? ""}` : ""),
      })),
      { key: "products", label: "Products", width: 110, align: "right", filterable: false, accessor: (g) => g.products },
      { key: "status", label: "Status", width: 120, accessor: (g) => (g.active ? "Active" : "Not active"), filterType: "enum" },
    ],
    [],
  );

  if (query.isError) return <LoadFailed what="The item groups" onRetry={() => void query.refetch()} />;
  return (
    <ListPageShell register>
      {/* One scrolling area: the groups take the rows they have, and the lists
          below never squeeze them out of sight, as a register filling the
          shell's height would let them. */}
      <div className="min-h-0 flex-1 overflow-y-auto" data-testid="item-groups-page">
        <DataGrid
          rows={groups}
          columns={columns}
          rowKey={(g) => g.id}
          storageKey="carres.finance.item-groups.v1"
          appearance="reference"
          groupBanner={false}
          allowColumnGrouping={false}
          stickyIdentity
          isLoading={!query.isSuccess}
          onRowClick={(g) => setOpen(g)}
          toolbarEnd={
            // PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), 0659).
            <Button variant="neutral" onClick={() => setOpen("new")} disabled={!query.isSuccess}>
              Add item group
            </Button>
          }
        />
        <ProductList products={query.data?.products ?? []} groupName={groupName} onOpen={setMoving} loading={!query.isSuccess} />
        {(query.data?.unbound.length ?? 0) > 0 && <UnboundSales rows={query.data!.unbound} groupName={groupName} />}
        <ItemGroupChanges changes={query.data?.changes ?? []} loading={!query.isSuccess} />
      </div>
      {open && (
        <ItemGroupModal
          key={open === "new" ? "new" : open.id}
          group={open === "new" ? null : open}
          accounts={chart.data?.accounts ?? []}
          moneyAccounts={chart.data?.money_accounts ?? []}
          onClose={() => setOpen(null)}
        />
      )}
      {moving && <MoveModal key={moving.modelId} product={moving} groups={groups} onClose={() => setMoving(null)} />}
    </ListPageShell>
  );
}

/** Add a group, or change one: its name, its four accounts, Active. */
function ItemGroupModal({
  group,
  accounts,
  moneyAccounts,
  onClose,
}: {
  group: LedgerItemGroup | null;
  accounts: readonly LedgerAccount[];
  moneyAccounts: readonly string[];
  onClose: () => void;
}) {
  const save = useSaveItemGroup();
  const [name, setName] = useState(group?.name ?? "");
  const [picked, setPicked] = useState<Record<AccountKey, string>>({
    purchase: group?.purchaseAccount ?? "",
    sales: group?.salesAccount ?? "",
    salesReturn: group?.salesReturnAccount ?? "",
    purchaseReturn: group?.purchaseReturnAccount ?? "",
  });
  const [active, setActive] = useState(group?.active ?? true);
  const [refusal, setRefusal] = useState<string | null>(null);
  // The Receiving button law: the disabled Save names its gap.
  // PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), 0659).
  const gap = name.trim() === "" ? "Save: type the name" : null;
  return (
    <Modal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      // PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), 0659).
      title={group ? "Item group" : "Add item group"}
      description={group?.name}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={save.isPending}
            disabled={gap !== null}
            onClick={() => {
              setRefusal(null);
              save.mutate(
                {
                  id: group?.id ?? null,
                  name: name.trim(),
                  purchaseAccount: picked.purchase || null,
                  salesAccount: picked.sales || null,
                  salesReturnAccount: picked.salesReturn || null,
                  purchaseReturnAccount: picked.purchaseReturn || null,
                  active,
                  was: group ? itemGroupWas(group) : null,
                },
                { onSuccess: onClose, onError: (e) => setRefusal(e.message) },
              );
            }}
          >
            {gap ?? "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3" data-testid="item-group-form">
        <Input id="item-group-name" label="Name" required value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        {ITEM_GROUP_ACCOUNTS.map((a) => (
          <Select
            key={a.key}
            id={`item-group-${a.key}`}
            label={a.field}
            value={picked[a.key]}
            onValueChange={(v) => setPicked((p) => ({ ...p, [a.key]: v }))}
            options={postingAccountOptions(a.kind, accounts, moneyAccounts).map((x) => ({ value: x.code, label: `${x.code} ${x.name}` }))}
          />
        ))}
        {group && <Checkbox id="item-group-active" label="Active" checked={active} onCheckedChange={(on) => setActive(on === true)} />}
        {/* PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), 0659). */}
        <p className="text-body text-kit-slate-11">A change applies to bills and sales from now on. Earlier ones keep their accounts.</p>
        {refusal && <FieldError>{refusal}</FieldError>}
      </div>
    </Modal>
  );
}

/** Move a product into another group. */
function MoveModal({
  product,
  groups,
  onClose,
}: {
  product: LedgerItemGroupProduct;
  groups: readonly LedgerItemGroup[];
  onClose: () => void;
}) {
  const place = usePlaceProduct();
  const [groupId, setGroupId] = useState(product.groupId ?? "");
  const [refusal, setRefusal] = useState<string | null>(null);
  // PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), 0659).
  const gap = !groupId ? "Save: pick the item group" : groupId === product.groupId ? "Save: pick another item group" : null;
  return (
    <Modal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="Item group"
      description={product.name}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={place.isPending}
            disabled={gap !== null}
            onClick={() => {
              setRefusal(null);
              place.mutate(
                { modelId: product.modelId, groupId, was: product.groupId },
                { onSuccess: onClose, onError: (e) => setRefusal(e.message) },
              );
            }}
          >
            {gap ?? "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3" data-testid="item-group-move-form">
        <Select
          id="item-group-move"
          label="Item group"
          required
          value={groupId}
          onValueChange={setGroupId}
          options={groups.filter((g) => g.active || g.id === product.groupId).map((g) => ({ value: g.id, label: g.name }))}
        />
        {/* PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), 0659). */}
        <p className="text-body text-kit-slate-11">The new item group takes the bills and sales from now on. Earlier ones keep their accounts.</p>
        {refusal && <FieldError>{refusal}</FieldError>}
      </div>
    </Modal>
  );
}

/** Every product in use, by item group then name. */
export function productRows(products: readonly LedgerItemGroupProduct[], groupName: ReadonlyMap<string, string>) {
  return products
    .filter((p) => !p.discontinued)
    .map((p) => ({ ...p, group: (p.groupId && groupName.get(p.groupId)) || "" }))
    .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
}

function ProductList({
  products,
  groupName,
  onOpen,
  loading,
}: {
  products: readonly LedgerItemGroupProduct[];
  groupName: ReadonlyMap<string, string>;
  onOpen: (p: LedgerItemGroupProduct) => void;
  loading: boolean;
}) {
  const rows = productRows(products, groupName);
  const columns: readonly Column<(typeof rows)[number]>[] = [
    { key: "product", label: "Product", width: "40%", cell: (p) => p.name },
    { key: "category", label: "Category", width: "20%", cell: (p) => categoryLabel(p.category) },
    { key: "skus", label: "SKUs", width: "10%", align: "right", cell: (p) => p.skus },
    { key: "group", label: "Item group", width: "30%", cell: (p) => p.group },
  ];
  return (
    <section className="flex flex-col gap-2 pt-4" data-testid="item-group-products">
      {/* PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), 0659). */}
      <h2 className="text-section">Products</h2>
      <DataTable
        label="Products"
        testId="item-group-products-table"
        rows={rows}
        columns={columns}
        rowId={(p) => p.modelId}
        onRowOpen={(p) => onOpen(p)}
        empty="No product is in the catalog yet."
        loading={loading}
      />
    </section>
  );
}

function UnboundSales({ rows, groupName }: { rows: readonly LedgerItemGroupUnboundSale[]; groupName: ReadonlyMap<string, string> }) {
  const columns: readonly Column<LedgerItemGroupUnboundSale>[] = [
    { key: "invoice", label: "Invoice", width: "16%", cell: (u) => u.invoiceNo },
    { key: "order", label: "Order", width: "10%", cell: (u) => (u.so ? `#${u.so}` : "") },
    { key: "date", label: "Date", width: "12%", cell: (u) => (u.issuedAt ? fmtDate(u.issuedAt) : "") },
    // PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), 0659).
    { key: "group", label: "Item group", width: "16%", cell: (u) => (u.groupId ? groupName.get(u.groupId) ?? "" : "Not in the catalog") },
    { key: "skus", label: "SKUs", width: "20%", cell: (u) => u.skus.join(" · ") },
    { key: "amount", label: "Amount", width: "12%", align: "right", cell: (u) => money(u.amount) },
    { key: "account", label: "Account", width: "14%", cell: (u) => `${u.accountCode} ${u.accountName ?? ""}` },
  ];
  return (
    <section className="flex flex-col gap-2 pt-4" data-testid="item-group-unbound">
      {/* PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), 0659). */}
      <h2 className="text-section">Sales posted to the goods account</h2>
      <p className="text-body text-kit-slate-11">
        Their item group had no sales account, or the product is not in the catalog. Give the group an account; a journal moves what is already posted.
      </p>
      <DataTable
        label="Sales posted to the goods account"
        testId="item-group-unbound-table"
        rows={[...rows]}
        columns={columns}
        rowId={(u) => String(u.id)}
        empty={null}
      />
    </section>
  );
}

// PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), 0659).
const CHANGE_WORD: Record<LedgerItemGroupChange["what"], string> = {
  ADDED: "Added",
  NAME: "Name",
  ACTIVE: "Active",
  PURCHASE: "Purchase account",
  SALES: "Sales account",
  SALES_RETURN: "Sales return account",
  PURCHASE_RETURN: "Purchase return account",
  PRODUCT: "Product",
};

const activeWord = (t: string | null) => (t === "true" ? "Active" : t === "false" ? "Not active" : "");

/** The words of one change: what changed, from what, to what. */
export function changeWords(c: LedgerItemGroupChange): { change: string; from: string; to: string } {
  const account = (code: string | null, name: string | null) => (code ? `${code} ${name ?? ""}`.trim() : "");
  switch (c.what) {
    case "ADDED":
      return { change: CHANGE_WORD.ADDED, from: "", to: c.toText ?? c.groupName };
    case "NAME":
      return { change: CHANGE_WORD.NAME, from: c.fromText ?? "", to: c.toText ?? "" };
    case "ACTIVE":
      return { change: CHANGE_WORD.ACTIVE, from: activeWord(c.fromText), to: activeWord(c.toText) };
    case "PRODUCT":
      return { change: `${CHANGE_WORD.PRODUCT} ${c.modelName ?? ""}`.trim(), from: c.fromGroupName ?? "", to: c.groupName };
    default:
      return { change: CHANGE_WORD[c.what], from: account(c.fromCode, c.fromName), to: account(c.toCode, c.toName) };
  }
}

const CHANGE_COLUMNS: readonly Column<LedgerItemGroupChange>[] = [
  { key: "when", label: "When", width: "18%", cell: (c) => changedWord(c.changedAt, c.changedBy) },
  { key: "group", label: "Item group", width: "16%", cell: (c) => c.groupName },
  { key: "change", label: "Change", width: "22%", cell: (c) => changeWords(c).change },
  { key: "from", label: "From", width: "22%", cell: (c) => changeWords(c).from },
  { key: "to", label: "To", width: "22%", cell: (c) => changeWords(c).to },
];

function ItemGroupChanges({ changes, loading }: { changes: readonly LedgerItemGroupChange[]; loading: boolean }) {
  return (
    <section className="flex flex-col gap-2 pt-4" data-testid="item-group-changes">
      <h2 className="text-section">Changes</h2>
      <DataTable
        label="Changes"
        testId="item-group-changes-table"
        rows={[...changes]}
        columns={CHANGE_COLUMNS}
        rowId={(c) => c.id}
        // PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), 0659).
        empty="No item group has been changed yet."
        loading={loading}
      />
    </section>
  );
}

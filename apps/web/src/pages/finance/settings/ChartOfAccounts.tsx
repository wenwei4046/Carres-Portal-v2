/**
 * Finance Settings → Chart of accounts (0539, 0550, 0570, 0577, 0580, 0608, 0656).
 *
 * THE CHART READS LIKE AUTOCOUNT'S (Chew 2026-10-07, docs/finance/MASTER.md §0
 * "The Chart of accounts screen reads like AutoCount's"). Accounts are grouped
 * by AutoCount's section, in AutoCount's order; inside a section each account
 * sits under its heading, and every heading reads by number. Three columns:
 * Code, Name (with AutoCount's special type, and `Heading` on a heading) and
 * Type, then the row's edit and retire icons. A section folds, and so does a
 * heading.
 *
 * WHICH SECTION AN ACCOUNT READS IN. The section is kept on the account
 * directly under a top heading; an account under a heading reads in that
 * account's section. The top headings (0000 ASSETS to 7000 TAX) are the
 * reports' roots and are not shown here. A top account with no section yet
 * reads under `No section yet` until the import or the edit window gives it one.
 *
 * ONE ACT, ONE DOOR. The edit icon, or a row click, opens the account: its
 * name, number, section, the heading it sits under, and Retire or Bring back.
 * Saving is one call to gl_account_edit, which moves, sets the section and
 * renames in one transaction through the doors that already guard the chart;
 * retiring is one call to gl_account_set_active. Every refusal is the
 * database's sentence.
 *
 * THE ICONS IN THE ROW are Chew's ruling for this Finance page (2026-10-07,
 * 「直接做，这个是我finance 的使用方式」), a Finance-only exception to the
 * shared listing rule that keeps buttons out of rows (UI MASTER §6.0 rule 10,
 * Jess's); Jess has been sent the request. No other page copies it.
 *
 * Accounts read by number (0656), so there is no drag and no column sort: a
 * sort would lift accounts away from the heading they are indented under.
 *
 * THE MONEY ACCOUNTS (0692, Chew 2026-10-13, 「对，做」). The chart is the one
 * place that marks an account as holding money: a bank (SBK), cash (SCH) or a
 * card or online payment company's holding account (HLD, Carres's own). Such a
 * row reads its kind in words under Type in place of its special type, opens
 * the money account's own window (name, Active, number), and has no retire icon. `Add a money account` adds one. A money account out of use
 * reads `Not active` and, like a retired account, shows only when asked for.
 *
 * FINANCE LOOK (Chew 2026-10-13): the code and the name were already two
 * columns; every heading row reads as a subtotal row (light grey, 600), as on
 * the Trial Balance, and a long name wraps rather than being cut. The Code
 * column keeps its width for the indent and the fold button.
 */
import { useCallback, useMemo, useState } from "react";
import { ledgerKindWord, LEDGER_ACCOUNT_CODE_MESSAGE, type LedgerAccount, type LedgerSection } from "@carres/shared/finance-ledger";
import { MONEY_ACCOUNT_KIND_WORD, type MoneyAccountRow } from "@carres/shared/money-accounts";
import { ledgerAccountCodeInput } from "@carres/shared/schemas/finance";
import Button from "@/components/kit/Button";
import Checkbox from "@/components/kit/Checkbox";
import { CMenu } from "@/components/carres/CPopover";
import { MoreHorizontal } from "lucide-react";
import Input from "@/components/kit/Input";
import Modal from "@/components/kit/Modal";
import Select from "@/components/kit/Select";
import { FieldError } from "@/components/kit/FieldFrame";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { useLedgerChart } from "../ledger/ledger-queries";
import { LoadFailed } from "../other-money-in/parts";
import { useAddAccountInSection, useEditAccount, useMoneyAccounts, useSetAccountActive } from "./api";
import { useSaveKey } from "../save-key";
import ChartImport from "./ChartImport";
import MoneyAccountModal from "./MoneyAccountModal";
import { useFinancePersonalLayouts } from "../finance-layouts";

/** The group of a top account that has no section yet. */
export const NO_SECTION = "__no_section__";

export interface ChartRow {
  account: LedgerAccount;
  /** 0 for the account directly under a top heading, 1 under it, and so on. */
  depth: number;
  /** The section the row reads in, or NO_SECTION. */
  group: string;
  /** An account it holds is on screen, or folded away. */
  hasChildren: boolean;
}

const byCode = (x: LedgerAccount, y: LedgerAccount) => x.code.localeCompare(y.code);

/**
 * The chart as AutoCount prints it: section by section, each top account
 * followed by the accounts under it, every heading by number. Retired accounts,
 * and money accounts out of use (`notActive`, 0692), are left out unless asked
 * for; a folded heading keeps its row and hides what is under it.
 */
export function chartBySection(
  accounts: readonly LedgerAccount[],
  sections: readonly LedgerSection[],
  opts: { showRetired: boolean; folded: ReadonlySet<string>; notActive?: ReadonlySet<string> },
): ChartRow[] {
  const known = new Set(sections.map((s) => s.section));
  const codes = new Map(accounts.map((a) => [a.code, a]));
  const under = new Map<string, LedgerAccount[]>();
  for (const a of accounts) {
    if (!a.parent_code) continue;
    const list = under.get(a.parent_code) ?? [];
    list.push(a);
    under.set(a.parent_code, list);
  }
  for (const list of under.values()) list.sort(byCode);
  const shown = (a: LedgerAccount) => opts.showRetired || (a.is_active && !opts.notActive?.has(a.code));

  const walk = (a: LedgerAccount, depth: number, group: string): ChartRow[] => {
    if (!shown(a)) return [];
    const kids = (under.get(a.code) ?? []).filter(shown);
    const row: ChartRow = { account: a, depth, group, hasChildren: kids.length > 0 };
    if (opts.folded.has(a.code)) return [row];
    return [row, ...kids.flatMap((k) => walk(k, depth + 1, group))];
  };

  // The top accounts: those whose parent is a top heading (a heading with no
  // parent). A parent the chart does not hold counts as the top too.
  const tops = accounts.filter((a) => {
    if (!a.parent_code) return false;
    const p = codes.get(a.parent_code);
    return !p || p.parent_code === null;
  });

  const order = new Map(sections.map((s) => [s.section, s.sort_order]));
  const groupOf = (a: LedgerAccount) => (a.section && known.has(a.section) ? a.section : NO_SECTION);
  const rank = (g: string) => (g === NO_SECTION ? Number.MAX_SAFE_INTEGER : order.get(g) ?? Number.MAX_SAFE_INTEGER);
  return [...tops]
    .sort((x, y) => rank(groupOf(x)) - rank(groupOf(y)) || byCode(x, y))
    .flatMap((t) => walk(t, 0, groupOf(t)));
}

/** The section an account reads in, from the chart on screen: its own at the
 *  top of a section, else that of the top account above it. */
export function sectionOf(code: string, accounts: readonly LedgerAccount[]): string | null {
  const codes = new Map(accounts.map((a) => [a.code, a]));
  let a = codes.get(code);
  for (let i = 0; a && i < 50; i++) {
    const p = a.parent_code ? codes.get(a.parent_code) : undefined;
    if (!p) return null;
    if (p.parent_code === null) return a.section ?? null;
    a = p;
  }
  return null;
}

// PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), 0656).
const NO_SECTION_LABEL = "No section yet";
const TOP_OF_SECTION = "top";

/** A click inside the row's own controls must not also open the row. */
const keepInCell = {
  onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
  onKeyDown: (e: { stopPropagation: () => void }) => e.stopPropagation(),
};

export default function ChartOfAccounts() {
  const personalLayouts = useFinancePersonalLayouts("finance_chart_of_accounts");
  const query = useLedgerChart();
  const [showRetired, setShowRetired] = useState(false);
  const [folded, setFolded] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState<{ account: LedgerAccount; retire: boolean } | null>(null);
  const [adding, setAdding] = useState(false);
  /* 0692: a money account's own window. `undefined` = closed; `null` = adding one. */
  const [moneyEditing, setMoneyEditing] = useState<MoneyAccountRow | null | undefined>(undefined);
  const moneyQuery = useMoneyAccounts();
  const moneyRows = useMemo(() => new Map((moneyQuery.data ?? []).map((m) => [m.code, m])), [moneyQuery.data]);
  const notActive = useMemo(
    () => new Set((moneyQuery.data ?? []).filter((m) => !m.is_active).map((m) => m.code)),
    [moneyQuery.data],
  );
  /** A row opens its money account's window when it is one, else the chart's. */
  const open = useCallback(
    (account: LedgerAccount, retire: boolean) => {
      const money = moneyRows.get(account.code);
      if (money) setMoneyEditing(money);
      else setEditing({ account, retire });
    },
    [moneyRows],
  );
  const [importing, setImporting] = useState(false);

  const accounts = useMemo(() => query.data?.accounts ?? [], [query.data]);
  const sections = useMemo(() => query.data?.sections ?? [], [query.data]);
  /* The headings that hold money accounts only: banks and cash (310-0000) and,
     since 0693, card and online holding (315-0000). Read by role. */
  const moneyHeadings = useMemo(
    () => [query.data?.roles?.MONEY_ACCOUNTS_HEADING, query.data?.roles?.CLEARING_ACCOUNTS_HEADING].filter((c): c is string => !!c),
    [query.data],
  );
  const moneyAccounts = useMemo(() => new Set(query.data?.money_accounts ?? []), [query.data]);
  const rows = useMemo(
    () => chartBySection(accounts, sections, { showRetired, folded, notActive }),
    [accounts, sections, showRetired, folded, notActive],
  );

  const fold = (code: string) =>
    setFolded((f) => {
      const next = new Set(f);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  /** Accounts the retire door always refuses, so their row has no retire icon:
   *  an account the system posts to (a role, an income or payment map row), a
   *  bank, cash or card account (taken out of use in its own window), a control
   *  account, and a heading with accounts in use under it. An account the
   *  ledger has posted to keeps the icon; the database's sentence says why it
   *  stays. */
  const kept = useMemo(() => {
    const set = new Set<string>([
      ...Object.values(query.data?.roles ?? {}),
      ...(query.data?.money_accounts ?? []),
      ...(query.data?.system_accounts ?? []),
    ]);
    for (const a of accounts) {
      if (a.is_control) set.add(a.code);
      if (a.is_active && a.parent_code) set.add(a.parent_code);
    }
    return set;
  }, [accounts, query.data]);

  /** 0692: a money account reads its kind in words under Type, which filters
   *  by it, and no special type beside its name; every other account its
   *  special type and its kind. */
  /** Chew 2026-10-14 (「special account 应该一个column」): the special type has
   *  its own column, every account's code alike (SBK, SCH, HLD for the money
   *  accounts too), and filters by it. */
  const specialWord = useCallback((a: LedgerAccount) => a.special ?? null, []);
  const typeWord = useCallback(
    (a: LedgerAccount) => {
      const money = moneyRows.get(a.code);
      return money ? MONEY_ACCOUNT_KIND_WORD[money.money_kind] : ledgerKindWord(a.kind);
    },
    [moneyRows],
  );

  const groups = useMemo(() => {
    const used = new Set(rows.map((r) => r.group));
    const list = sections
      .filter((s) => used.has(s.section))
      .map((s) => ({ key: s.section, label: `${s.section} · ${ledgerKindWord(s.kind)}` }));
    return used.has(NO_SECTION) ? [...list, { key: NO_SECTION, label: NO_SECTION_LABEL }] : list;
  }, [rows, sections]);

  const columns = useMemo<DataGridColumn<ChartRow>[]>(
    () => [
      {
        key: "code",
        label: "Code",
        width: 150,
        sortable: false,
        filterable: false,
        accessor: (r) => (
          <span className="inline-flex items-center gap-1" style={{ paddingLeft: r.depth * 16 }}>
            {r.hasChildren ? (
              <span {...keepInCell}>
                <Button
                  iconOnly
                  variant="ghost"
                  icon={folded.has(r.account.code) ? "forward" : "expand"}
                  aria-expanded={!folded.has(r.account.code)}
                  // PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), 0656).
                  aria-label={`${folded.has(r.account.code) ? "Open" : "Fold"} ${r.account.code} ${r.account.name}`}
                  data-testid={`chart-fold-${r.account.code}`}
                  onClick={() => fold(r.account.code)}
                />
              </span>
            ) : null}
            <span className={r.account.is_header ? "font-semibold" : undefined}>{r.account.code}</span>
          </span>
        ),
        searchValue: (r) => r.account.code,
        exportValue: (r) => r.account.code,
      },
      {
        key: "name",
        label: "Name",
        width: 440,
        wrap: true,
        sortable: false,
        filterable: false,
        accessor: (r) => (
          <span style={{ paddingLeft: r.depth * 16 }} className="inline-flex items-baseline gap-2">
            <span className={r.account.is_header ? "font-semibold" : undefined}>
              {r.depth > 0 ? "└ " : ""}
              {r.account.name}
            </span>
            {/* PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), 0656). */}
            {r.account.is_header ? <span className="text-meta text-kit-slate-11">Heading</span> : null}
            {!r.account.is_active ? <span className="text-meta text-kit-slate-11">Retired</span>
              : notActive.has(r.account.code) ? <span className="text-meta text-kit-slate-11">Not active</span> : null}
          </span>
        ),
        searchValue: (r) => r.account.name,
        exportValue: (r) => r.account.name,
      },
      {
        key: "special",
        // PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), 2026-10-14).
        label: "Special",
        width: 90,
        sortable: false,
        accessor: (r) => specialWord(r.account) ?? "",
        searchValue: (r) => specialWord(r.account) ?? "",
        filterType: "enum",
      },
      {
        key: "type",
        label: "Type",
        // Fits `Card and online holding` whole (2026-10-14).
        width: 180,
        sortable: false,
        accessor: (r) => typeWord(r.account),
        filterType: "enum",
      },
      {
        key: "actions",
        label: "",
        width: 96,
        sortable: false,
        filterable: false,
        accessor: (r) => (
          <span className="inline-flex items-center gap-1" {...keepInCell}>
            <Button
              iconOnly
              variant="ghost"
              icon="edit"
              // PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), 0656).
              aria-label={`Edit ${r.account.code} ${r.account.name}`}
              data-testid={`chart-edit-${r.account.code}`}
              onClick={() => open(r.account, false)}
            />
            {r.account.is_active && !kept.has(r.account.code) ? (
              <Button
                iconOnly
                variant="ghost"
                icon="delete"
                aria-label={`Retire ${r.account.code} ${r.account.name}`}
                data-testid={`chart-retire-${r.account.code}`}
                onClick={() => open(r.account, true)}
              />
            ) : null}
          </span>
        ),
        exportValue: () => "",
      },
    ],
    [folded, kept, notActive, specialWord, typeWord, open],
  );

  if (query.isError && !query.data) return <LoadFailed what="The chart of accounts" onRetry={() => void query.refetch()} />;
  if (moneyQuery.isError && !moneyQuery.data) return <LoadFailed what="The money accounts" onRetry={() => void moneyQuery.refetch()} />;
  return (
    <ListPageShell register>
      <DataGrid
        rows={rows}
        columns={columns}
        rowKey={(r) => r.account.code}
        storageKey="carres.finance.chart-of-accounts.v4"
        appearance="reference"
        look="finance" personalLayouts={personalLayouts} fillColumn="name"
        rowTone={(r) => (r.account.is_header ? "subtotal" : null)}
        groupBanner={false}
        allowColumnGrouping={false}
        fixedGroups={{ groups, groupOf: (r) => r.group, revealMatches: true }}
        stickyIdentity
        isLoading={!query.data || !moneyQuery.data}
        emptyMessage="No account yet."
        onRowDoubleClick={(r) => open(r.account, false)}
        /* Chew 2026-10-14: one main button for the area; the other two acts
           sit in the ⋮ menu (01 §3, one main button per area), and the filter
           sits on the left, apart from the actions. */
        toolbarStart={
          // PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), 0656).
          <Checkbox
            id="chart-show-retired"
            label="Show not active"
            checked={showRetired}
            onCheckedChange={(on) => setShowRetired(on === true)}
          />
        }
        toolbarEnd={
          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={() => setAdding(true)} disabled={!query.data}>
              Add account
            </Button>
            <CMenu
              label="More actions"
              items={[
                { key: "money", label: "Add a money account", onSelect: () => setMoneyEditing(null), disabled: !query.data },
                // PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), 0655).
                { key: "import", label: "Import from AutoCount", onSelect: () => setImporting(true), disabled: !query.data },
              ]}
              trigger={
                <Button variant="ghost" aria-label="More actions" data-testid="chart-more">
                  <MoreHorizontal size={16} aria-hidden />
                </Button>
              }
            />
          </div>
        }
      />
      {editing && (
        <AccountModal
          key={editing.account.code}
          account={editing.account}
          startWithRetire={editing.retire}
          accounts={accounts}
          sections={sections}
          moneyHeadings={moneyHeadings}
          moneyAccounts={moneyAccounts}
          onClose={() => setEditing(null)}
        />
      )}
      {importing && <ChartImport onClose={() => setImporting(false)} />}
      {moneyEditing !== undefined && (
        <MoneyAccountModal key={moneyEditing?.code ?? "new"} account={moneyEditing} onClose={() => setMoneyEditing(undefined)} />
      )}
      {adding && (
        <AddAccountModal accounts={accounts} sections={sections} moneyHeadings={moneyHeadings} onClose={() => setAdding(false)} />
      )}
    </ListPageShell>
  );
}

/** `code` and every account above it, nearest first. */
function upFrom(code: string | null, accounts: readonly LedgerAccount[]): string[] {
  const parentOf = new Map(accounts.map((x) => [x.code, x.parent_code]));
  const chain: string[] = [];
  for (let c: string | null | undefined = code; c && chain.length < 50; c = parentOf.get(c)) chain.push(c);
  return chain;
}

/**
 * The headings an account may sit under in `section`: headings in use of that
 * section, never the account itself or a heading inside it (gl_account_move),
 * and inside a money heading (bank and cash, or card and online holding, 0693)
 * only when the account and everything under it are money accounts (0580).
 * `account` null = a new account, which never goes there: money accounts are
 * added with Add a money account.
 */
export function headingsIn(
  section: string,
  account: LedgerAccount | null,
  accounts: readonly LedgerAccount[],
  money: { headings: readonly string[]; accounts: ReadonlySet<string> },
): LedgerAccount[] {
  const inside = (h: LedgerAccount) => !!account && upFrom(h.code, accounts).includes(account.code);
  const inMoney = (code: string) => upFrom(code, accounts).some((c) => money.headings.includes(c));
  const subtree = account ? accounts.filter((x) => upFrom(x.code, accounts).includes(account.code)) : [];
  const allMoney = subtree.length > 0 && subtree.every((x) => x.is_header || money.accounts.has(x.code));
  return accounts
    .filter(
      (h) =>
        h.is_header &&
        h.is_active &&
        h.parent_code !== null &&
        sectionOf(h.code, accounts) === section &&
        !inside(h) &&
        (!inMoney(h.code) || (account !== null && allMoney)),
    )
    .sort(byCode);
}

/**
 * Which field a refusal is about. The sentence shown is always the door's own
 * — the `code` tag only says where to put it.
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

/** The Receiving button law (COPY-STANDARD): a disabled Save names the FIRST
 *  missing field, top to bottom. null = nothing missing, Save is live. */
export function accountSaveGap(f: { section: string | undefined; code: string; name: string; isHeading?: boolean }): string | null {
  if (!f.section) return "Save: pick the section";
  if (!f.code.trim()) return f.isHeading ? "Save: type the heading number" : "Save: type the number";
  if (!f.name.trim()) return f.isHeading ? "Save: type the heading name" : "Save: type the name";
  return null;
}

function AccountModal({
  account,
  startWithRetire,
  accounts,
  sections,
  moneyHeadings,
  moneyAccounts,
  onClose,
}: {
  account: LedgerAccount;
  startWithRetire: boolean;
  accounts: readonly LedgerAccount[];
  sections: readonly LedgerSection[];
  moneyHeadings: readonly string[];
  moneyAccounts: ReadonlySet<string>;
  onClose: () => void;
}) {
  const edit = useEditAccount();
  const setActive = useSetAccountActive();
  const parent = accounts.find((a) => a.code === account.parent_code);
  const atTop = !parent || parent.parent_code === null;
  const [name, setName] = useState(account.name);
  const [code, setCode] = useState(account.code);
  const [section, setSection] = useState<string | undefined>(sectionOf(account.code, accounts) ?? undefined);
  const [under, setUnder] = useState<string>(atTop || !parent ? TOP_OF_SECTION : parent.code);
  const [confirmRetire, setConfirmRetire] = useState(startWithRetire && account.is_active);
  const [refusal, setRefusal] = useState<{ field: "name" | "code" | null; message: string } | null>(null);

  const sectionOptions = sections
    .filter((s) => s.kind === account.kind)
    .map((s) => ({ value: s.section, label: s.section }));
  const headings = section ? headingsIn(section, account, accounts, { headings: moneyHeadings, accounts: moneyAccounts }) : [];
  const underOptions = [
    // PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), 0656).
    { value: TOP_OF_SECTION, label: "Top of the section" },
    ...headings.map((h) => ({ value: h.code, label: `${h.code} ${h.name}` })),
  ];
  const gap = accountSaveGap({ section, code, name, isHeading: account.is_header });

  const submit = () => {
    setRefusal(null);
    const shaped = ledgerAccountCodeInput.safeParse(code);
    if (!shaped.success) {
      setRefusal({ field: "code", message: LEDGER_ACCOUNT_CODE_MESSAGE });
      return;
    }
    if (!section) return;
    edit.mutate(
      {
        code: account.code,
        input: { name: name.trim(), code: shaped.data, section, under: under === TOP_OF_SECTION ? null : under },
      },
      { onSuccess: onClose, onError: (e) => setRefusal(refusalOf(e)) },
    );
  };
  useSaveKey(submit, gap === null && !edit.isPending && account.is_active && !confirmRetire);

  const flip = (active: boolean) => {
    setRefusal(null);
    setActive.mutate(
      { code: account.code, active },
      {
        onSuccess: onClose,
        onError: (e) => {
          setConfirmRetire(false);
          setRefusal({ field: null, message: e.message });
        },
      },
    );
  };

  if (confirmRetire) {
    return (
      <Modal
        open
        onOpenChange={(o) => {
          if (!o) onClose();
        }}
        // PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), 0656).
        title="Retire account"
        description={`${account.code} ${account.name}`}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" data-testid="account-retire-confirm" loading={setActive.isPending} onClick={() => flip(false)}>
              Retire
            </Button>
          </>
        }
      >
        <p className="text-body" data-testid="account-retire-form">
          A retired account leaves the chart and can no longer be picked. An account the ledger has posted to stays.
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={account.is_header ? "Heading" : "Account"}
      description={`${account.code} · ${ledgerKindWord(account.kind)}`}
      footer={
        <>
          {account.is_active ? (
            // PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), 0656).
            <Button variant="neutral" data-testid="account-retire" onClick={() => setConfirmRetire(true)}>
              Retire account
            </Button>
          ) : (
            <Button variant="neutral" data-testid="account-bring-back" loading={setActive.isPending} onClick={() => flip(true)}>
              Bring back
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={edit.isPending} disabled={gap !== null || !account.is_active} onClick={submit}>
            {gap ?? "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3" data-testid="account-edit-form">
        <Input id="account-name" label="Name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        {refusal?.field === "name" && <FieldError>{refusal.message}</FieldError>}
        <Input id="account-code" label="Number" required maxLength={8} value={code} onChange={(e) => setCode(e.target.value)} />
        {refusal?.field === "code" && <FieldError>{refusal.message}</FieldError>}
        <Select
          id="account-section"
          label="Section"
          required
          value={section ?? ""}
          onValueChange={(v) => {
            setSection(v);
            setUnder(TOP_OF_SECTION);
          }}
          options={sectionOptions}
        />
        <Select id="account-under" label="Under" required value={under} onValueChange={setUnder} options={underOptions} />
        {refusal && refusal.field === null && <FieldError>{refusal.message}</FieldError>}
      </div>
    </Modal>
  );
}

/**
 * Add an account, or a heading, in one of AutoCount's sections (0656): at the
 * top of the section or under one of its headings. The kind follows the
 * section. Money accounts are added with Add a money account, so neither money
 * heading (bank and cash, card and online holding) is offered.
 */
function AddAccountModal({
  accounts,
  sections,
  moneyHeadings,
  onClose,
}: {
  accounts: readonly LedgerAccount[];
  sections: readonly LedgerSection[];
  moneyHeadings: readonly string[];
  onClose: () => void;
}) {
  const add = useAddAccountInSection();
  const [section, setSection] = useState<string | undefined>(undefined);
  const [under, setUnder] = useState<string>(TOP_OF_SECTION);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [isHeading, setIsHeading] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const headings = section ? headingsIn(section, null, accounts, { headings: moneyHeadings, accounts: new Set() }) : [];
  const gap = accountSaveGap({ section, code, name, isHeading });

  const submit = () => {
    setRefusal(null);
    const shaped = ledgerAccountCodeInput.safeParse(code);
    if (!section || !shaped.success) {
      setRefusal(LEDGER_ACCOUNT_CODE_MESSAGE);
      return;
    }
    add.mutate(
      { section, parentCode: under === TOP_OF_SECTION ? null : under, code: shaped.data, name: name.trim(), isHeading },
      { onSuccess: onClose, onError: (e) => setRefusal(e.message) },
    );
  };
  useSaveKey(submit, gap === null && !add.isPending);
  return (
    <Modal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="Add account"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={add.isPending} disabled={gap !== null} onClick={submit}>
            {gap ?? "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3" data-testid="account-add-form">
        <Checkbox id="account-add-heading" label="It is a heading" checked={isHeading} onCheckedChange={(on) => setIsHeading(on === true)} />
        <Select
          id="account-add-section"
          label="Section"
          required
          value={section ?? ""}
          onValueChange={(v) => {
            setSection(v);
            setUnder(TOP_OF_SECTION);
          }}
          options={sections.map((s) => ({ value: s.section, label: s.section }))}
        />
        <Select
          id="account-add-under"
          label="Under"
          required
          value={under}
          onValueChange={setUnder}
          options={[
            { value: TOP_OF_SECTION, label: "Top of the section" },
            ...headings.map((h) => ({ value: h.code, label: `${h.code} ${h.name}` })),
          ]}
        />
        <Input id="account-add-code" label={isHeading ? "Heading number" : "Number"} required maxLength={8} value={code} onChange={(e) => setCode(e.target.value)} />
        <Input id="account-add-name" label={isHeading ? "Heading name" : "Name"} required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        {refusal && <FieldError>{refusal}</FieldError>}
      </div>
    </Modal>
  );
}

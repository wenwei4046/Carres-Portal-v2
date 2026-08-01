/**
 * Purchasing → **To Order** — the final freeze (Loo, 2026-08-01, after five
 * redesigns in one day): LEFT is Linear, RIGHT is GitHub Projects.
 *
 * MISSION: decide which customer orders become purchase orders today.
 * Purchase Orders MANAGES the documents once they exist (preview ·
 * communication · audit · PDF · WhatsApp · revision · ready date — there,
 * not here). **Issue ≠ Send**: pressing Issue creates POs in the system;
 * nothing reaches a factory until the Purchase Orders page's WhatsApp step —
 * which is why there is no confirm dialog and no toast.
 *
 * THE GOLDEN RULE: the planning engine owns the schedule; operators own the
 * purchase order. `Order By` is the engine's word and NEVER reaches the
 * screen — the operator sees the CUSTOMER's date (Preferred Delivery) and
 * trusts that whatever is on this page is what today requires. Hold · Skip ·
 * Next Run · Postpone do not exist and never may.
 *
 * The LEFT PANEL is an ACTION LAUNCHER, not navigation (200px, Linear's
 * density, ~30px rows): Today · Mattress · Bedframe · Sofa (each with its
 * order count; clicking filters the grid) · `+ Create Purchase` (the manual
 * entrance — a real dialog from day one; its SAVE arrives with the unified
 * `purchase_demands` card, so the Create button is disabled and says so) ·
 * the Issue pill, which exists only while something is selected and states
 * exactly what the button will do. No VIEWS/GROUP/SORT labels, no system
 * words, no H1 anywhere — the lit tab is the page identity.
 *
 * The GRID is the only scroll area, GitHub-Projects density (40px kit rows),
 * SIX columns and no more: ☑ · Preferred Delivery · SO No. · Model · Qty ·
 * PO No. Category is NOT a column (the left panel already said it) and
 * Customer is not either (Loo: noise). PO No. rightmost answers "did
 * today's order happen" — `—` until Issue, then the number, in place; rows
 * never vanish. Today's rows arrive PRE-SELECTED; overrides are DELTAS a
 * refetch cannot overturn. Overdue (customer date past) is red and sorts
 * first, then Preferred Delivery ascending.
 *
 * On Issue: the pill goes `Creating…`, one POST per supplier×category group
 * (the ARRANGEMENT only — no SKU, no qty, no price), the grid updates in
 * place (☑ gone, PO No. filled), the left counts drop, and the bottom bar —
 * which exists only while it has something to say — reads `N Purchase
 * Orders Created · Continue in Purchase Orders →`. A partial failure stays
 * in the bar with Retry until it succeeds. Zero popups. Destination is not
 * asked here: the engine uses the default; per-PO confirmation lives on the
 * generated documents (and per-PO destination arrives with v2's split).
 */
import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  TO_ORDER_WORDS as W,
  categoryLabel,
  countItems,
  defaultDocuments,
  ordersHeadline,
  posCreatedLine,
  purchaseOrderCount,
  railItemLabel,
  soSelectedShort,
  toOrderBuilds,
  type ToOrderProposal,
} from "@carres/shared";
import Button from "@/components/kit/Button";
import Card from "@/components/kit/Card";
import Checkbox from "@/components/kit/Checkbox";
import DataTable, { type Column } from "@/components/kit/DataTable";
import EmptyState from "@/components/kit/EmptyState";
import Input from "@/components/kit/Input";
import Loading from "@/components/kit/Loading";
import Modal from "@/components/kit/Modal";
import SearchInput from "@/components/kit/SearchInput";
import Select from "@/components/kit/Select";
import Textarea from "@/components/kit/Textarea";
import Icon from "@/components/kit/Icon";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import { qk } from "@/lib/queries";
import PurchasingTabs from "./PurchasingTabs";
import { TopBarIcons } from "./components/GlobalTopBar";

// ── Wire types ──────────────────────────────────────────────────────────────

interface Destination {
  id: string;
  name: string;
  isDefault: boolean;
}

interface Unresolved {
  sku: string;
  orderId: string;
  so: number | null;
}

interface ToOrderResponse {
  today: string;
  proposals: ToOrderProposal[];
  destinations: Destination[];
  /** Demand the catalog could not answer for. Empty is the only healthy value. */
  unresolved?: Unresolved[];
}

interface IssueResponse {
  supplier: string;
  destination: string;
  pos: { id: string; customer: string }[];
}

/** One group's batch outcome — the grid and the bar are the progress report. */
type GroupResult =
  | { status: "pending" }
  | { status: "done"; pos: string[] }
  | { status: "failed"; message: string };

/** One grid row = one SO within one supplier×category proposal. */
interface GridRow {
  key: string;
  proposalKey: string;
  category: string;
  orderId: string;
  so: number | null;
  delivery: string | null;
  late: boolean;
  model: string;
  qty: number;
}

/**
 * Loo's fixed walking order. Accessories join when their reorder track does —
 * an unknown category lands after the sequence rather than crashing the sort.
 */
const CATEGORY_SEQUENCE = ["mattress", "bedframe", "sofa", "accessory"];

// ── Page ────────────────────────────────────────────────────────────────────

export default function OperationToOrder() {
  const navigate = useNavigate();

  const q = useQuery<ToOrderResponse>({
    queryKey: qk.operation.toOrder(),
    queryFn: () => apiFetch<ToOrderResponse>("/api/operation/purchase/to-order"),
    refetchOnWindowFocus: true,
  });

  const proposals = useMemo(() => q.data?.proposals ?? [], [q.data]);
  const destinations = useMemo(() => q.data?.destinations ?? [], [q.data]);
  const unresolved = useMemo(() => q.data?.unresolved ?? [], [q.data]);
  const today = q.data?.today ?? null;

  /** The left panel's pick — Today (everything) or one category. */
  const [cat, setCat] = useState<string>("today");
  const [search, setSearch] = useState("");
  /**
   * The operator's overrides, as DELTAS against the engine's default — never
   * an absolute set, so a refetch pre-ticks NEW rows and never overturns a
   * human's untick (or tick) of a row it has seen before.
   */
  const [userOff, setUserOff] = useState<ReadonlySet<string>>(new Set());
  /** PO numbers won this session, by row key — the grid updates in place. */
  const [rowPo, setRowPo] = useState<ReadonlyMap<string, string>>(new Map());
  const [results, setResults] = useState<ReadonlyMap<string, GroupResult>>(new Map());
  const [creating, setCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  /**
   * TODAY'S plan only — the page IS today (Loo: whatever appears here is what
   * today requires; the engine already filtered). Demand the engine cannot
   * plan (`blocked`) cannot be issued and is not listed — its home is the
   * Settings gap it names, and surfacing it here again is a next-card call.
   */
  const todays = useMemo(
    () =>
      proposals.filter(
        (p) =>
          p.blocked == null && (today == null || p.orderBy == null || p.orderBy <= today),
      ),
    [proposals, today],
  );

  /** The grid rows — flat, business language only. */
  const allRows = useMemo<GridRow[]>(() => {
    const rows: GridRow[] = [];
    for (const p of todays) {
      for (const r of p.rows) {
        const b = r.builds;
        rows.push({
          key: `${p.key}:${r.orderId}`,
          proposalKey: p.key,
          category: p.category,
          orderId: r.orderId,
          so: r.so,
          delivery: r.delivery ?? null,
          late: today != null && r.delivery != null && r.delivery < today,
          model:
            b.length === 1
              ? railItemLabel(b[0]!.model, b[0]!.size ?? null)
              : countItems(b.length),
          qty: r.qty,
        });
      }
    }
    // Overdue first (the customer's date is PAST), then soonest customer
    // date; undated sink. The engine's own dates never sort the screen.
    rows.sort(
      (a, b) =>
        (b.late ? 1 : 0) - (a.late ? 1 : 0) ||
        (a.delivery ?? "9999-12-31").localeCompare(b.delivery ?? "9999-12-31") ||
        (a.so ?? 0) - (b.so ?? 0),
    );
    return rows;
  }, [todays, today]);

  /** Left-panel counts — unissued work, so they fall as POs are created. */
  const catCounts = useMemo(() => {
    const m = new Map<string, number>();
    const orders = new Set<string>();
    for (const r of allRows) {
      if (rowPo.has(r.key)) continue;
      m.set(r.category, (m.get(r.category) ?? 0) + 1);
      orders.add(r.orderId);
    }
    return { byCat: m, todayOrders: orders.size };
  }, [allRows, rowPo]);

  const visibleRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return allRows.filter(
      (r) =>
        (cat === "today" || r.category === cat) &&
        (needle === "" ||
          (r.so != null && `so-${r.so}`.includes(needle)) ||
          r.model.toLowerCase().includes(needle)),
    );
  }, [allRows, cat, search]);

  const isSelected = (r: GridRow) => !rowPo.has(r.key) && !userOff.has(r.key);
  const toggleRow = (r: GridRow) => {
    if (rowPo.has(r.key)) return;
    setUserOff((s) => {
      const n = new Set(s);
      if (n.has(r.key)) n.delete(r.key);
      else n.add(r.key);
      return n;
    });
  };

  /** What the pill will do — per group, from the shared projection. */
  const batch = useMemo(() => {
    const selectedByProposal = new Map<string, Set<string>>();
    let selectedRows = 0;
    for (const r of allRows) {
      if (!isSelected(r)) continue;
      selectedRows += 1;
      const s = selectedByProposal.get(r.proposalKey) ?? new Set<string>();
      s.add(r.orderId);
      selectedByProposal.set(r.proposalKey, s);
    }
    let poCount = 0;
    const targets: {
      proposal: ToOrderProposal;
      docs: { key: string; include: boolean; buildKeys: string[] }[];
      orderIdsByDoc: string[][];
    }[] = [];
    for (const p of todays) {
      const sel = selectedByProposal.get(p.key);
      if (!sel || sel.size === 0) continue;
      const orderOf = new Map(toOrderBuilds(p).map((b) => [b.buildKey, b.orderId]));
      const docs = defaultDocuments(p)
        .map((d) => ({
          key: d.key,
          include: true,
          buildKeys: d.buildKeys.filter((k) => sel.has(orderOf.get(k) ?? "")),
        }))
        .filter((d) => d.buildKeys.length > 0);
      if (docs.length === 0) continue;
      poCount += docs.length;
      targets.push({
        proposal: p,
        docs,
        orderIdsByDoc: docs.map((d) => [
          ...new Set(d.buildKeys.map((k) => orderOf.get(k) ?? "")),
        ]),
      });
    }
    return { selectedRows, poCount, targets };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, userOff, rowPo, todays]);

  const defaultDest = destinations.find((d) => d.isDefault) ?? destinations[0] ?? null;

  // ── The batch — one POST per group; grid and bar report in place ─────────
  async function issueAll(only?: ReadonlySet<string>) {
    const targets = batch.targets.filter((t) => !only || only.has(t.proposal.key));
    if (targets.length === 0 || !defaultDest) return;
    setCreating(true);
    setResults((m) => {
      const n = new Map(m);
      for (const t of targets) n.set(t.proposal.key, { status: "pending" });
      return n;
    });
    for (const t of targets) {
      try {
        const res = await apiFetch<IssueResponse>(
          "/api/operation/purchase/to-order/issue",
          {
            method: "POST",
            body: JSON.stringify({
              supplierId: t.proposal.supplierId,
              category: t.proposal.category,
              // The engine's default — per-PO confirmation lives on the
              // generated documents, not here (Loo, 2026-08-01).
              destinationId: defaultDest.id,
              // The ARRANGEMENT only. No SKU, no quantity, no price.
              purchaseOrders: t.docs,
            }),
          },
        );
        setResults((m) =>
          new Map(m).set(t.proposal.key, {
            status: "done",
            pos: res.pos.map((x) => x.id),
          }),
        );
        // The grid updates IN PLACE: each doc's orders take its PO number.
        setRowPo((m) => {
          const n = new Map(m);
          t.orderIdsByDoc.forEach((orderIds, i) => {
            const po = res.pos[i]?.id ?? res.pos[0]?.id ?? "PO";
            for (const orderId of orderIds) n.set(`${t.proposal.key}:${orderId}`, po);
          });
          return n;
        });
      } catch (e) {
        setResults((m) =>
          new Map(m).set(t.proposal.key, {
            status: "failed",
            message: e instanceof Error ? e.message : "failed",
          }),
        );
      }
    }
    setCreating(false);
    // NO invalidation on purpose: rows must not vanish (Loo — the grid
    // updates in place). The next natural refetch reconciles.
  }

  const failedKeys = useMemo(
    () =>
      new Set(
        [...results.entries()].filter(([, r]) => r.status === "failed").map(([k]) => k),
      ),
    [results],
  );
  const donePoCount = [...results.values()].reduce(
    (n, r) => (r.status === "done" ? n + r.pos.length : n),
    0,
  );
  const unread = unresolved.length > 0;
  const barHasSomething = creating || donePoCount > 0 || failedKeys.size > 0 || unread;

  // ── Grid columns — Loo's frozen six, and not one more ────────────────────
  const columns: readonly Column<GridRow>[] = [
    {
      key: "sel",
      label: "",
      width: 6,
      cell: (r) =>
        rowPo.has(r.key) ? null : (
          <Checkbox
            id={`row-${r.key}`}
            ariaLabel={W.select}
            checked={isSelected(r)}
            onCheckedChange={() => toggleRow(r)}
          />
        ),
    },
    {
      key: "delivery",
      label: W.colPreferred,
      width: 20,
      cell: (r) => (
        <span
          className={
            r.late ? "text-kit-red-11 font-medium tabular-nums" : "tabular-nums"
          }
        >
          {r.delivery ? fmtDate(r.delivery) : "—"}
        </span>
      ),
    },
    {
      key: "so",
      label: W.colSoNo,
      width: 14,
      cell: (r) => (r.so != null ? `SO-${r.so}` : "—"),
    },
    { key: "model", label: W.colModel, width: 36, cell: (r) => r.model },
    { key: "qty", label: W.colQty, width: 10, align: "right", numeric: true, cell: (r) => r.qty },
    {
      key: "po",
      label: W.colPoNo,
      width: 14,
      cell: (r) => {
        const po = rowPo.get(r.key);
        if (!po) return "—";
        // The number is the receipt AND the door to the next step.
        return (
          <button
            type="button"
            className="text-kit-blue-11 tabular-nums hover:underline"
            onClick={() => navigate("/operation/procurement")}
            data-testid={`row-po-${r.key}`}
          >
            {po}
          </button>
        );
      },
    },
  ];

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-kit-slate-3">
      {/* ── The top strip — the Orders page's own shape: breadcrumb + the
           shared icon cluster. No H1, no search here. ─────────────────── */}
      <div
        className="shrink-0 flex items-center justify-between gap-3 px-6 pt-3 pb-1"
        data-testid="to-order-header-strip"
      >
        <div className="min-w-0 flex items-center gap-1.5 text-meta text-kit-slate-11">
          <span>Purchasing</span>
          <Icon name="forward" size={14} />
          <span className="text-kit-slate-12">To Order</span>
        </div>
        <TopBarIcons />
      </div>

      <PurchasingTabs />

      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* ── The ACTION LAUNCHER (Linear's density; no heading — we are
             already at To Order, and the lit tab says so). ─────────────── */}
        <aside
          className="w-[200px] shrink-0 min-h-0 overflow-y-auto border-r border-kit-slate-5 px-3 py-3 flex flex-col"
          data-testid="to-order-nav"
        >
          <NavRow
            active={cat === "today"}
            onClick={() => setCat("today")}
            testId="to-order-cat-today"
            name={W.navToday}
            count={ordersHeadline(catCounts.todayOrders)}
          />
          {CATEGORY_SEQUENCE.slice(0, 3).map((c) => (
            <NavRow
              key={c}
              active={cat === c}
              onClick={() => setCat(c)}
              testId={`to-order-cat-${c}`}
              name={categoryLabel(c)}
              count={ordersHeadline(catCounts.byCat.get(c) ?? 0)}
            />
          ))}

          <div className="my-2 border-t border-kit-slate-6" />

          {/* The manual entrance — always present (Loo: the door may never
              be missing). The dialog is real; its SAVE arrives with the
              unified purchase_demands card. */}
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            data-testid="to-order-create-purchase"
            className="flex w-full items-center gap-1 px-2 py-1.5 rounded-control text-body text-kit-slate-11 hover:bg-kit-blue-3 text-left"
          >
            + {W.createPurchase}
          </button>

          {/* The Issue pill — exists only while something is selected, and
              says exactly what the button will do. */}
          {batch.selectedRows > 0 && !creating ? (
            <div
              className="mt-3 rounded-card border border-kit-slate-5 bg-white p-3 flex flex-col gap-1"
              data-testid="to-order-issue-pill"
            >
              <span className="text-meta tabular-nums text-kit-slate-11">
                {soSelectedShort(batch.selectedRows)}
              </span>
              <span className="text-meta tabular-nums text-kit-slate-11">
                → {purchaseOrderCount(batch.poCount)}
              </span>
              <Button
                variant="primary"
                onClick={() => void issueAll()}
                disabled={unread || batch.poCount === 0 || !defaultDest}
                data-testid="to-order-issue"
              >
                {`+ ${W.issuePos}`}
              </Button>
            </div>
          ) : null}
        </aside>

        {/* ── The right column: the grid IS the page. ──────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0 gap-2 px-4 pt-2 pb-3">
          <span className="w-64 block shrink-0">
            <SearchInput
              id="to-order-search"
              pill
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={W.searchPlaceholder}
              aria-label={W.searchLabel}
            />
          </span>

          <div className="flex-1 min-h-0 flex flex-col" data-testid="to-order-sheet">
            {q.isLoading && allRows.length === 0 ? (
              <Card>
                <Loading variant="skeleton" lines={4} label="Loading today's plan" />
              </Card>
            ) : visibleRows.length === 0 ? (
              <div data-testid="to-order-empty">
                <Card padding="none">
                  <EmptyState title={q.error ? (q.error as Error).message : W.empty} />
                </Card>
              </div>
            ) : (
              <DataTable
                rows={visibleRows}
                columns={columns}
                rowId={(r) => r.key}
                empty={W.empty}
                label={W.itemsTableLabel}
              />
            )}
          </div>

          {/* ── The bottom bar — exists only while it has something to say
               (progress · result · a failure that may not evaporate). ── */}
          {barHasSomething ? (
            <div
              className="shrink-0 flex items-center gap-4 flex-wrap bg-white border border-kit-slate-5 rounded-card px-4 py-2"
              data-testid="to-order-bar"
            >
              {unread ? (
                <span className="text-meta text-kit-slate-12" data-testid="to-order-unresolved">
                  {`${unresolved.length} item${unresolved.length === 1 ? "" : "s"} could not be read — ${W.unresolvedHelp}`}
                </span>
              ) : null}
              {creating ? (
                <span className="text-meta text-kit-slate-11">{W.creatingPos}</span>
              ) : null}
              {!creating && donePoCount > 0 ? (
                <span
                  className="text-body font-medium text-kit-slate-12 tabular-nums"
                  data-testid="to-order-created-line"
                >
                  {posCreatedLine(donePoCount)}
                </span>
              ) : null}
              {!creating && failedKeys.size > 0 ? (
                <span className="text-meta text-kit-red-11" data-testid="to-order-failed-line">
                  {`${failedKeys.size} ${W.createFailed}`}
                </span>
              ) : null}
              <span className="ml-auto flex items-center gap-2">
                {!creating && failedKeys.size > 0 ? (
                  <Button
                    variant="neutral"
                    onClick={() => void issueAll(failedKeys)}
                    data-testid="to-order-retry"
                  >
                    {W.retry}
                  </Button>
                ) : null}
                {!creating && donePoCount > 0 ? (
                  <Button
                    variant="ghost"
                    onClick={() => navigate("/operation/procurement")}
                    data-testid="to-order-continue"
                  >
                    {`${W.continueInPos} →`}
                  </Button>
                ) : null}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <CreatePurchaseDialog open={dialogOpen} onOpenChange={setDialogOpen} proposals={proposals} />
    </div>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

/** One launcher row — Linear's shape: name, count under it, ~30px, ┃ active. */
function NavRow({
  active,
  onClick,
  testId,
  name,
  count,
}: {
  active: boolean;
  onClick: () => void;
  testId: string;
  name: ReactNode;
  count: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      aria-current={active ? "true" : undefined}
      className={[
        "relative flex w-full flex-col px-2 py-1.5 rounded-control text-left mb-px",
        active ? "bg-kit-blue-3" : "hover:bg-kit-blue-3",
      ].join(" ")}
    >
      {active ? (
        <span aria-hidden className="absolute left-0 top-1 bottom-1 w-0.5 bg-kit-blue-9" />
      ) : null}
      <span
        className={[
          "uppercase text-body",
          active ? "font-semibold text-kit-slate-12" : "font-medium text-kit-slate-12",
        ].join(" ")}
      >
        {name}
      </span>
      <span className="text-meta tabular-nums text-kit-slate-11">{count}</span>
    </button>
  );
}

/**
 * `+ Create Purchase` — GitHub's New Issue, as a purchasing dialog. Reason is
 * part of the FORM, never navigation; Category is never asked (it comes from
 * the item). The SAVE arrives with the unified `purchase_demands` card —
 * until then the Create button is disabled and says so, so the entrance
 * teaches its own future without pretending to work.
 */
function CreatePurchaseDialog({
  open,
  onOpenChange,
  proposals,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposals: ToOrderProposal[];
}) {
  const [reason, setReason] = useState("ready_stock");
  const [supplier, setSupplier] = useState<string | undefined>(undefined);
  const [item, setItem] = useState("");
  const [qty, setQty] = useState("1");
  const [remark, setRemark] = useState("");

  const suppliers = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of proposals) m.set(p.supplierId, p.supplierName);
    return [...m.entries()].map(([value, label]) => ({ value, label }));
  }, [proposals]);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={W.createPurchase}
      footer={
        <span className="flex items-center gap-3 pt-1">
          <span className="text-meta text-kit-slate-11">{W.nextUpdate}</span>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {W.cancel}
          </Button>
          <Button variant="primary" disabled data-testid="to-order-create-submit">
            {W.create}
          </Button>
        </span>
      }
    >
      <div className="flex flex-col gap-3" data-testid="to-order-create-dialog">
        <div>
          <label htmlFor="cp-reason" className="text-meta text-kit-slate-11">
            {W.reason}
          </label>
          <Select
            id="cp-reason"
            value={reason}
            onValueChange={setReason}
            options={[
              { value: "ready_stock", label: W.reasonReadyStock },
              { value: "display", label: W.reasonDisplay },
              { value: "warranty", label: W.reasonWarranty },
              { value: "spare_parts", label: W.reasonSpareParts },
              { value: "office", label: W.reasonOffice },
              { value: "other", label: W.reasonOther },
            ]}
          />
        </div>
        <div>
          <label htmlFor="cp-supplier" className="text-meta text-kit-slate-11">
            {W.supplierLabel}
          </label>
          <Select
            id="cp-supplier"
            value={supplier}
            onValueChange={setSupplier}
            options={suppliers}
          />
        </div>
        <div>
          <label htmlFor="cp-item" className="text-meta text-kit-slate-11">
            {W.itemLabel}
          </label>
          <SearchInput
            id="cp-item"
            value={item}
            onChange={(e) => setItem(e.target.value)}
            placeholder={W.searchItem}
          />
        </div>
        <Input
          id="cp-qty"
          label={W.itemsColQty}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
        <Textarea
          id="cp-remark"
          label={W.remark}
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
        />
      </div>
    </Modal>
  );
}

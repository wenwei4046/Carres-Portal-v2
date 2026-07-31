/**
 * Purchasing → **To Order** — the Excel grid (Loo's final division of
 * responsibility, 2026-07-31).
 *
 * MISSION: decide which customer orders become purchase orders today.
 * Listing · filter · checkbox · batch create — NOTHING ELSE. Preview,
 * communication, audit, PDF, WhatsApp, revision, ready date all belong to the
 * Purchase Orders page, where the documents exist. Issue ≠ Send: pressing the
 * button creates POs in the system; nothing reaches a factory until a human
 * opens WhatsApp on the Purchase Orders page — which is why this page needs
 * no confirm dialog.
 *
 * THE GOLDEN RULE (Loo, 2026-07-31): the planning engine owns the schedule;
 * operators own the purchase order. So the page's one clever feature is the
 * engine's dates working FOR the operator — the thing AutoCount cannot do:
 *
 *   · The LENSES are the engine's own order-by dates as one-click filters
 *     (`Order today` is the default; overdue merges in — issue now, hold
 *     nothing).
 *   · Today's plan arrives PRE-SELECTED. The daily flow is open → glance →
 *     press. Every tick can be overturned, and the operator's overrides are
 *     remembered as DELTAS — a refetch re-ticks new rows but never re-ticks
 *     what a human unticked.
 *   · The GROUPS are the future purchase orders, drawn before the button is
 *     pressed (supplier × category; sofa reads `one per order`). The batch
 *     bar's `will create N Purchase Orders` is computed from the same shared
 *     projection the server recomputes on issue — it must never lie.
 *   · Demand the engine cannot date is NEVER hidden: `Needs setup` names the
 *     supplier × category with no production days, and its rows cannot be
 *     ticked — nothing un-issuable is ever selectable.
 *
 * The batch posts ONE issue per group, sequentially, and the grid itself is
 * the progress bar: a group header becomes `✓ PO-…` or `✗ failed · Retry` in
 * place, and rows never vanish on success (Loo: 不要消失,直接更新 Grid).
 * Each POST carries the ARRANGEMENT only — no SKU, no quantity, no price.
 *
 * Deliberately NOT here, each a ruling: no PO preview (nothing exists to
 * preview before the press) · no per-row menus, no Move/Split (v2 —
 * `Create Own Purchase Order` is the door to direct delivery) · no Ordered
 * history (v3, and it may belong to Purchase Orders) · no Change Required
 * Date / Cancel Purchase (v4, they need stored state) · no refresh button
 * (the plan updates itself) · Destination sits on the GROUP header — one
 * purchase order, one destination, so one global select would be the wrong
 * granularity.
 */
import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  TO_ORDER_WORDS as W,
  categoryLabel,
  defaultDocuments,
  pcsCount,
  purchaseOrderCount,
  soCountLabel,
  soSelectedLine,
  toOrderBuilds,
  willCreateLine,
  type ToOrderProposal,
} from "@carres/shared";
import Button from "@/components/kit/Button";
import Checkbox from "@/components/kit/Checkbox";
import EmptyState from "@/components/kit/EmptyState";
import Icon from "@/components/kit/Icon";
import Loading from "@/components/kit/Loading";
import Select from "@/components/kit/Select";
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

/** One group's batch outcome — the grid is the progress bar. */
type GroupResult =
  | { status: "pending" }
  | { status: "done"; pos: { id: string; customer: string }[] }
  | { status: "failed"; message: string };

type Lens = "today" | "week" | "all" | "setup";

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

  const [lens, setLens] = useState<Lens>("today");
  const [grouped, setGrouped] = useState(true);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  /**
   * The operator's overrides, as DELTAS against the engine's default — never
   * an absolute set, so a refetch pre-ticks NEW rows and never overturns a
   * human's untick (or tick) of a row it has seen before.
   */
  const [userOff, setUserOff] = useState<ReadonlySet<string>>(new Set());
  const [userOn, setUserOn] = useState<ReadonlySet<string>>(new Set());
  /** Per-group destination — one purchase order, one destination. */
  const [destBy, setDestBy] = useState<ReadonlyMap<string, string>>(new Map());
  /** Per-group batch outcomes, updated as each POST lands. */
  const [results, setResults] = useState<ReadonlyMap<string, GroupResult>>(new Map());
  const [creating, setCreating] = useState(false);

  const defaultDest = destinations.find((d) => d.isDefault) ?? destinations[0] ?? null;
  const destOf = (key: string) => destBy.get(key) ?? defaultDest?.id ?? null;

  // ── The lenses — the engine's own dates as filters ────────────────────────
  const weekEnd = useMemo(() => {
    if (!today) return null;
    const d = new Date(`${today}T00:00:00Z`);
    const dow = (d.getUTCDay() + 6) % 7; // Mon = 0
    d.setUTCDate(d.getUTCDate() + (6 - dow)); // Sunday
    return d.toISOString().slice(0, 10);
  }, [today]);

  const isSetup = (p: ToOrderProposal) => p.blocked === "production_days";
  const isTodayLens = (p: ToOrderProposal) =>
    !isSetup(p) && (today == null || p.orderBy == null || p.orderBy <= today);
  const isWeekLens = (p: ToOrderProposal) =>
    !isSetup(p) &&
    today != null &&
    p.orderBy != null &&
    p.orderBy > today &&
    (weekEnd == null || p.orderBy <= weekEnd);

  const inLens = (p: ToOrderProposal): boolean => {
    if (lens === "setup") return isSetup(p);
    if (lens === "today") return isTodayLens(p);
    if (lens === "week") return isWeekLens(p);
    return !isSetup(p);
  };

  const counts = useMemo(() => {
    const soOf = (f: (p: ToOrderProposal) => boolean) =>
      proposals.filter(f).reduce((n, p) => n + p.rows.length, 0);
    return {
      today: soOf(isTodayLens),
      overdue: proposals
        .filter((p) => !isSetup(p) && today != null && p.orderBy != null && p.orderBy < today)
        .reduce((n, p) => n + p.rows.length, 0),
      week: soOf(isWeekLens),
      all: soOf((p) => !isSetup(p)),
      setup: soOf(isSetup),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposals, today, weekEnd]);

  // ── The visible groups ────────────────────────────────────────────────────
  const groups = useMemo(() => {
    return proposals
      .filter(inLens)
      .map((p) => ({ proposal: p, rows: p.rows }))
      .filter((g) => g.rows.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposals, lens, today, weekEnd]);

  // ── Selection — engine default minus/plus the operator's deltas ───────────
  const rowKey = (p: ToOrderProposal, orderId: string) => `${p.key}:${orderId}`;
  const isSelected = (p: ToOrderProposal, orderId: string): boolean => {
    const k = rowKey(p, orderId);
    return isTodayLens(p) ? !userOff.has(k) : userOn.has(k);
  };
  const toggleRow = (p: ToOrderProposal, orderId: string) => {
    if (isSetup(p)) return; // nothing un-issuable is ever selectable
    const k = rowKey(p, orderId);
    if (isTodayLens(p)) {
      setUserOff((s) => {
        const n = new Set(s);
        if (n.has(k)) n.delete(k);
        else n.add(k);
        return n;
      });
    } else {
      setUserOn((s) => {
        const n = new Set(s);
        if (n.has(k)) n.delete(k);
        else n.add(k);
        return n;
      });
    }
  };
  const setGroup = (p: ToOrderProposal, on: boolean) => {
    if (isSetup(p)) return;
    const keys = p.rows.map((r) => rowKey(p, r.orderId));
    if (isTodayLens(p)) {
      setUserOff((s) => {
        const n = new Set(s);
        for (const k of keys) {
          if (on) n.delete(k);
          else n.add(k);
        }
        return n;
      });
    } else {
      setUserOn((s) => {
        const n = new Set(s);
        for (const k of keys) {
          if (on) n.add(k);
          else n.delete(k);
        }
        return n;
      });
    }
  };

  /** What the button will do — per group, from the shared projection. */
  const planOf = (p: ToOrderProposal) => {
    const selOrders = new Set(
      p.rows.filter((r) => isSelected(p, r.orderId)).map((r) => r.orderId),
    );
    if (selOrders.size === 0) return { selRows: 0, docs: [] as { key: string; include: boolean; buildKeys: string[] }[] };
    const orderOf = new Map(toOrderBuilds(p).map((b) => [b.buildKey, b.orderId]));
    const docs = defaultDocuments(p)
      .map((d) => ({
        key: d.key,
        include: true,
        buildKeys: d.buildKeys.filter((k) => selOrders.has(orderOf.get(k) ?? "")),
      }))
      .filter((d) => d.buildKeys.length > 0);
    return { selRows: selOrders.size, docs };
  };

  const batch = useMemo(() => {
    let selected = 0;
    let total = 0;
    let poCount = 0;
    const targets: { proposal: ToOrderProposal; docs: { key: string; include: boolean; buildKeys: string[] }[] }[] = [];
    for (const g of groups) {
      if (isSetup(g.proposal) || results.get(g.proposal.key)?.status === "done") continue;
      total += g.proposal.rows.length;
      const plan = planOf(g.proposal);
      selected += plan.selRows;
      if (plan.docs.length > 0) {
        poCount += plan.docs.length;
        targets.push({ proposal: g.proposal, docs: plan.docs });
      }
    }
    return { selected, total, poCount, targets };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, userOff, userOn, results]);

  // ── The batch — one POST per group, the grid is the progress bar ─────────
  async function createAll(only?: ReadonlySet<string>) {
    const targets = batch.targets.filter((t) => !only || only.has(t.proposal.key));
    if (targets.length === 0) return;
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
              destinationId: destOf(t.proposal.key),
              // The ARRANGEMENT only — no SKU, no quantity, no price.
              purchaseOrders: t.docs,
            }),
          },
        );
        setResults((m) => new Map(m).set(t.proposal.key, { status: "done", pos: res.pos }));
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
  const doneCount = [...results.values()].filter((r) => r.status === "done").length;
  const donePoCount = [...results.values()].reduce(
    (n, r) => (r.status === "done" ? n + r.pos.length : n),
    0,
  );

  const unread = unresolved.length > 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 min-h-0 flex flex-col bg-kit-slate-3">
      {/* ── The top strip — the Orders page's own header shape (Loo,
           2026-08-01: To Order FOLLOWS it): breadcrumb left, search right.
           No H1 (Loo's law); the alerts/help/settings cluster joins when it
           is extracted from the Orders page into a shared piece. ───────── */}
      <div
        className="shrink-0 flex items-center justify-between gap-3 px-6 pt-3 pb-1"
        data-testid="to-order-header-strip"
      >
        <div className="min-w-0 flex items-center gap-1.5 text-meta text-kit-slate-11">
          <span>Purchasing</span>
          <Icon name="forward" size={14} />
          <span className="text-kit-slate-12">To Order</span>
        </div>
        {/* The SAME alerts · help · settings cluster the Orders page
            carries — it was already shared (GlobalTopBar), so the strip
            is the Orders strip, not a lookalike. No search (Loo,
            2026-08-01): the views and the grid are the finding tools. */}
        <TopBarIcons />
      </div>

      <PurchasingTabs />

      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* ── The WORKSPACE PANEL (frozen with Loo, 2026-08-01 — the Portal
             Grid standard's left side, reused by Orders · Purchase Orders ·
             Receiving · Claims · Payments): VIEWS (saved ways of looking) ·
             FILTERS (restrictions — slots, not built) · GROUP (organisation)
             · SORT (slot), in that frozen order, default EXPANDED — an ERP
             operator filters every day, not occasionally. Search lives in
             the TOP STRIP, the Orders page's own shape (Loo, 2026-08-01).
             Views and filters are DIFFERENT things and never mix. A section
             joins the panel when a page builds it, never as an empty
             heading. ───────────────────────────────────────────────────── */}
        <aside
          className="w-[200px] shrink-0 min-h-0 overflow-y-auto border-r border-kit-slate-5 px-3 py-3 flex flex-col gap-4"
          data-testid="to-order-panel"
        >
          <section>
            <div className="text-label uppercase text-kit-slate-11 pb-1">
              {W.panelViews}
            </div>
            <PanelRow
              active={lens === "today"}
              onClick={() => setLens("today")}
              testId="to-order-lens-today"
            >
              <span>{W.lensOrderToday}</span>
              <span className="ml-auto tabular-nums">
                {counts.today}
                {counts.overdue > 0 ? (
                  <span className="text-kit-red-11"> · {counts.overdue}</span>
                ) : null}
              </span>
            </PanelRow>
            <PanelRow
              active={lens === "week"}
              onClick={() => setLens("week")}
              testId="to-order-lens-week"
            >
              <span>{W.lensThisWeek}</span>
              <span className="ml-auto tabular-nums">{counts.week}</span>
            </PanelRow>
            <PanelRow
              active={lens === "all"}
              onClick={() => setLens("all")}
              testId="to-order-lens-all"
            >
              <span>{W.lensAll}</span>
              <span className="ml-auto tabular-nums">{counts.all}</span>
            </PanelRow>
            {/* Hidden at zero — a warning about nothing is noise. */}
            {counts.setup > 0 ? (
              <PanelRow
                active={lens === "setup"}
                onClick={() => setLens("setup")}
                testId="to-order-lens-setup"
              >
                <span className="text-kit-red-11">{W.lensNeedsSetup}</span>
                <span className="ml-auto tabular-nums">{counts.setup}</span>
              </PanelRow>
            ) : null}
          </section>

          <section>
            <div className="text-label uppercase text-kit-slate-11 pb-1">
              {W.panelGroup}
            </div>
            <PanelRow
              active={grouped}
              onClick={() => setGrouped(true)}
              testId="to-order-groupby-supplier"
            >
              <span>{W.groupBySupplier}</span>
            </PanelRow>
            <PanelRow
              active={!grouped}
              onClick={() => setGrouped(false)}
              testId="to-order-groupby-none"
            >
              <span>{W.groupByNone}</span>
            </PanelRow>
          </section>
        </aside>

        {/* ── The right column: the grid starts IMMEDIATELY (Gmail's rhythm,
             Loo 2026-08-01 — the header is as thin as it can be, which today
             is zero: no Refresh (the plan updates itself), and the other
             page actions (Create Proposal · Columns · Export · Help) join
             only once built, never as dead controls. The grid is the ONLY
             scroll area; no H1 anywhere — the lit tab is the identity. ── */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0 gap-2 px-4 pt-2 pb-3">

        {/* ── The sheet ─────────────────────────────────────────────────── */}
        <div
          className="flex-1 min-h-0 overflow-y-auto bg-white border border-kit-slate-5 rounded-card"
          data-testid="to-order-sheet"
        >
          {q.isLoading && groups.length === 0 ? (
            <div className="p-4">
              <Loading variant="skeleton" lines={4} label="Loading today's plan" />
            </div>
          ) : groups.length === 0 ? (
            <div data-testid="to-order-empty">
              <EmptyState title={q.error ? (q.error as Error).message : W.empty} />
            </div>
          ) : grouped ? (
            groups.map((g) => (
              <GroupBlock
                key={g.proposal.key}
                proposal={g.proposal}
                rows={g.rows}
                today={today}
                setup={isSetup(g.proposal)}
                collapsed={collapsed.has(g.proposal.key)}
                onToggleCollapse={() =>
                  setCollapsed((s) => {
                    const n = new Set(s);
                    if (n.has(g.proposal.key)) n.delete(g.proposal.key);
                    else n.add(g.proposal.key);
                    return n;
                  })
                }
                isSelected={(orderId) => isSelected(g.proposal, orderId)}
                onToggleRow={(orderId) => toggleRow(g.proposal, orderId)}
                onSetGroup={(on) => setGroup(g.proposal, on)}
                destinations={destinations}
                destId={destOf(g.proposal.key)}
                onDest={(id) => setDestBy((m) => new Map(m).set(g.proposal.key, id))}
                result={results.get(g.proposal.key)}
                onRetry={() => void createAll(new Set([g.proposal.key]))}
              />
            ))
          ) : (
            <FlatRows
              groups={groups}
              today={today}
              isSetup={isSetup}
              isSelected={isSelected}
              onToggleRow={toggleRow}
            />
          )}
        </div>

        {/* ── The batch bar — one true sentence and one button. It appears
             only when there is something to say (a selection, a result, a
             refusal); an empty selection gives the height back to the grid
             (Loo, 2026-08-01). ──────────────────────────────────────────── */}
        {batch.selected === 0 && results.size === 0 && !unread && destinations.length > 0 ? null : (
        <div
          className="shrink-0 flex items-center gap-4 flex-wrap bg-white border border-kit-slate-5 rounded-card px-4 py-2"
          data-testid="to-order-batch-bar"
        >
          {unread ? (
            <span className="text-meta text-kit-slate-12" data-testid="to-order-unresolved">
              {`${unresolved.length} item${unresolved.length === 1 ? "" : "s"} could not be read — ${W.unresolvedHelp}`}
            </span>
          ) : null}
          {doneCount > 0 ? (
            <span className="text-meta text-kit-slate-12 tabular-nums" data-testid="to-order-done-line">
              {purchaseOrderCount(donePoCount)} {W.createdOk}
              {failedKeys.size > 0 ? ` · ${failedKeys.size} ${W.createFailed}` : ""}
            </span>
          ) : null}
          <span
            className="ml-auto text-body font-medium text-kit-slate-12 tabular-nums whitespace-nowrap"
            data-testid="to-order-will-create"
          >
            {soSelectedLine(batch.selected, batch.total)} → {willCreateLine(batch.poCount)}
          </span>
          {failedKeys.size > 0 ? (
            <Button
              variant="neutral"
              onClick={() => void createAll(failedKeys)}
              disabled={creating}
              data-testid="to-order-retry-all"
            >
              {`${W.retry} ${failedKeys.size} ${W.createFailed}`}
            </Button>
          ) : null}
          <Button
            variant="primary"
            onClick={() => void createAll()}
            disabled={creating || unread || batch.poCount === 0 || destinations.length === 0}
            loading={creating}
            data-testid="to-order-create"
          >
            {W.createPos}
          </Button>
          {doneCount > 0 ? (
            <Button
              variant="ghost"
              onClick={() => navigate("/operation/procurement")}
              data-testid="to-order-open-pos"
            >
              {W.openPurchaseOrders}
            </Button>
          ) : null}
          {destinations.length === 0 ? (
            <span className="text-meta text-kit-slate-12" data-testid="to-order-no-destination">
              {W.destinationRequired}
            </span>
          ) : null}
        </div>
        )}
        </div>
      </div>
    </div>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

/** One Workspace Panel row — a view, a group mode, later a filter value. */
function PanelRow({
  active,
  onClick,
  testId,
  children,
}: {
  active: boolean;
  onClick: () => void;
  testId: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      aria-pressed={active}
      className={[
        "flex w-full items-baseline gap-2 px-2 py-1 rounded-control text-meta text-left",
        active
          ? "bg-kit-blue-3 font-medium text-kit-slate-12"
          : "text-kit-slate-11 hover:bg-kit-blue-3",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

/** One future purchase order (or several, for sofa) — drawn before it exists. */
function GroupBlock({
  proposal,
  rows,
  today,
  setup,
  collapsed,
  onToggleCollapse,
  isSelected,
  onToggleRow,
  onSetGroup,
  destinations,
  destId,
  onDest,
  result,
  onRetry,
}: {
  proposal: ToOrderProposal;
  rows: ToOrderProposal["rows"];
  today: string | null;
  setup: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  isSelected: (orderId: string) => boolean;
  onToggleRow: (orderId: string) => void;
  onSetGroup: (on: boolean) => void;
  destinations: Destination[];
  destId: string | null;
  onDest: (id: string) => void;
  result?: GroupResult;
  onRetry: () => void;
}) {
  const p = proposal;
  const selCount = rows.filter((r) => isSelected(r.orderId)).length;
  const pcs = rows.reduce((n, r) => n + r.qty, 0);
  const late = today != null && p.orderBy != null && p.orderBy < today;
  const done = result?.status === "done";

  return (
    <div data-testid={`to-order-group-${p.key}`} className="border-b border-kit-slate-6">
      {/* Sticky, so a long group never hides which PO you are scrolling. */}
      <div className="sticky top-0 bg-kit-slate-3 border-b border-kit-slate-5 flex items-center gap-2 px-3 py-1.5 flex-wrap">
        {!setup && !done ? (
          <Checkbox
            id={`group-${p.key}`}
            ariaLabel={W.select}
            checked={
              selCount === rows.length ? true : selCount === 0 ? false : "indeterminate"
            }
            onCheckedChange={() => onSetGroup(selCount !== rows.length)}
          />
        ) : null}
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          data-testid={`to-order-collapse-${p.key}`}
          className="text-kit-slate-11 hover:text-kit-slate-12"
        >
          <Icon name={collapsed ? "forward" : "expand"} size={16} />
        </button>
        <span className="text-body font-medium uppercase text-kit-slate-12 whitespace-nowrap">
          {p.supplierName} · {categoryLabel(p.category)}
        </span>
        <span className="text-meta text-kit-slate-11 tabular-nums whitespace-nowrap">
          {soCountLabel(rows.length)} · {pcsCount(pcs)}
        </span>

        {done ? (
          <span
            className="text-meta font-medium text-kit-slate-12 tabular-nums truncate"
            data-testid={`to-order-result-${p.key}`}
          >
            ✓ {result.pos.map((x) => x.id).join(" · ")}
          </span>
        ) : result?.status === "failed" ? (
          <span className="flex items-center gap-2" data-testid={`to-order-result-${p.key}`}>
            <span className="text-meta text-kit-red-11 truncate">✗ {result.message}</span>
            <Button variant="ghost" size="sm" onClick={onRetry} data-testid={`to-order-retry-${p.key}`}>
              {W.retry}
            </Button>
          </span>
        ) : result?.status === "pending" ? (
          <span className="text-meta text-kit-slate-11" data-testid={`to-order-result-${p.key}`}>
            …
          </span>
        ) : setup ? (
          <span className="text-meta text-kit-red-11" data-testid={`to-order-setup-${p.key}`}>
            {W.cannotBePlanned} — {W.needsSetupHelp}
          </span>
        ) : null}

        <span className="ml-auto flex items-center gap-3">
          {p.orderBy ? (
            <span
              className={[
                "text-meta tabular-nums whitespace-nowrap",
                late ? "text-kit-red-11 font-medium" : "text-kit-slate-11",
              ].join(" ")}
            >
              Order by {fmtDate(p.orderBy)}
            </span>
          ) : null}
          {!setup && !done ? (
            <span className="w-40">
              <Select
                id={`dest-${p.key}`}
                value={destId ?? undefined}
                onValueChange={onDest}
                options={destinations.map((d) => ({ value: d.id, label: d.name }))}
              />
            </span>
          ) : null}
        </span>
      </div>

      {!collapsed
        ? rows.map((r) => (
            <Row
              key={r.orderId}
              proposalKey={p.key}
              row={r}
              today={today}
              selectable={!setup && !done}
              selected={!setup && isSelected(r.orderId)}
              onToggle={() => onToggleRow(r.orderId)}
            />
          ))
        : null}
    </div>
  );
}

/** One SO on the sheet. Extra columns only in the flat (ungrouped) view. */
function Row({
  proposalKey,
  row,
  today,
  selectable,
  selected,
  onToggle,
  extra,
}: {
  proposalKey: string;
  row: ToOrderProposal["rows"][number];
  today: string | null;
  selectable: boolean;
  selected: boolean;
  onToggle: () => void;
  extra?: string;
}) {
  const lateRow = today != null && row.stockReady != null && row.stockReady < today;
  return (
    <div
      data-testid={`to-order-row-${proposalKey}-${row.orderId}`}
      data-selected={selected || undefined}
      className={[
        "flex items-center gap-3 px-3 py-1.5 border-b border-kit-slate-6 last:border-b-0",
        selected ? "bg-kit-blue-3" : "hover:bg-kit-blue-3",
        selectable ? "" : "opacity-60",
      ].join(" ")}
    >
      {selectable ? (
        <Checkbox
          id={`row-${proposalKey}-${row.orderId}`}
          ariaLabel={W.select}
          checked={selected}
          onCheckedChange={onToggle}
        />
      ) : (
        <span className="w-4" aria-hidden />
      )}
      <span className="w-20 text-meta font-medium text-kit-slate-12 tabular-nums whitespace-nowrap">
        {row.so != null ? `SO-${row.so}` : "—"}
      </span>
      <span className="w-32 text-meta text-kit-slate-12 truncate">{row.customer}</span>
      <span
        className={[
          "w-32 text-meta tabular-nums whitespace-nowrap",
          lateRow ? "text-kit-red-11 font-medium" : "text-kit-slate-11",
        ].join(" ")}
      >
        {row.stockReady ? fmtDate(row.stockReady) : W.noDeliveryDate}
      </span>
      <span className="flex-1 min-w-0 text-meta text-kit-slate-11 truncate">{row.summary}</span>
      {extra ? (
        <span className="text-meta text-kit-slate-11 whitespace-nowrap">{extra}</span>
      ) : null}
      <span className="w-8 text-right text-meta text-kit-slate-12 tabular-nums">{row.qty}</span>
    </div>
  );
}

/** `Group by: None` — the flat Excel, earliest stock-ready first. */
function FlatRows({
  groups,
  today,
  isSetup,
  isSelected,
  onToggleRow,
}: {
  groups: readonly { proposal: ToOrderProposal; rows: ToOrderProposal["rows"] }[];
  today: string | null;
  isSetup: (p: ToOrderProposal) => boolean;
  isSelected: (p: ToOrderProposal, orderId: string) => boolean;
  onToggleRow: (p: ToOrderProposal, orderId: string) => void;
}) {
  const flat = groups
    .flatMap((g) => g.rows.map((row) => ({ proposal: g.proposal, row })))
    .sort((a, b) =>
      (a.row.stockReady ?? "9999-12-31").localeCompare(b.row.stockReady ?? "9999-12-31"),
    );
  return (
    <div data-testid="to-order-flat">
      {flat.map(({ proposal, row }) => (
        <Row
          key={`${proposal.key}:${row.orderId}`}
          proposalKey={proposal.key}
          row={row}
          today={today}
          selectable={!isSetup(proposal)}
          selected={!isSetup(proposal) && isSelected(proposal, row.orderId)}
          onToggle={() => onToggleRow(proposal, row.orderId)}
          extra={`${proposal.supplierName} · ${categoryLabel(proposal.category)}`}
        />
      ))}
    </div>
  );
}

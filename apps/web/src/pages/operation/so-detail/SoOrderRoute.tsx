/**
 * ORDER ROUTE — the status card and its three views (Layout Standard §3.2,
 * owner-confirmed handoff 2026-10-08):
 *
 *   Customer original (or new) delivery date → Customer confirmed delivery
 *   date · Same / n days later · days left · problem pill · Overview · Steps ·
 *   Details
 *
 *   Overview  Goods · Delivery · Payment (· Loan) cards; a card with a problem
 *             is amber and comes first.
 *   Steps     the node map (`SalesOrderRoute`), unchanged in what it says.
 *   Details   one row per step: Step · Who · Planned · Actual · Status ·
 *             Document.
 *
 * Every fact is read from the ONE resolved route (`resolveSalesOrderRoute`)
 * and the order's own dates; nothing here computes a second status. A step
 * with no recorded value says `Not set` / `Not yet`, never a guess.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { NodeMark, RouteNode, SalesOrderRouteMap as RouteMap, StationOwnerKey } from "@carres/shared";
import MIcon from "@/components/carres/MIcon";
import CPill, { type CPillTone } from "@/components/carres/CPill";
import { fmtDate } from "@/lib/fmt-date";
import SalesOrderRoute, { type RouteActionOwners, type RoutePerson, type RouteRetryOwner } from "../SalesOrderRoute";
import { Avatar, Card, ViewSwitch } from "./ui";

type View = "ov" | "st" | "dt";
type Branch = "goods" | "delivery" | "money" | "loan";

const BRANCH: Record<Branch, { name: string; icon: string }> = {
  goods: { name: "Goods", icon: "inventory_2" },
  delivery: { name: "Delivery", icon: "local_shipping" },
  money: { name: "Payment", icon: "payments" },
  loan: { name: "Loan", icon: "chair" },
};

const MARK_WORD: Record<NodeMark, { word: string; tone: CPillTone }> = {
  complete: { word: "Done", tone: "ok" },
  current: { word: "Now", tone: "info" },
  waiting: { word: "Waiting", tone: "info" },
  blocked: { word: "Blocked", tone: "blocked" },
  future: { word: "Not yet", tone: "info" },
  unreadable: { word: "Not read", tone: "warn" },
};

const OWNER_WORD: Record<StationOwnerKey, string> = {
  purchasing: "Purchasing",
  receiving: "Warehouse",
  stock: "Warehouse",
  delivery: "Delivery",
  sales: "Sales Order",
  payment: "Payments",
};

/** Which module owns a station — the Route's own node kinds, never a guess. */
const KIND_MODULE: Partial<Record<RouteNode["kind"], string>> = {
  "sales-order": "Sales Order",
  cancelled: "Sales Order",
  purchasing: "Purchasing",
  supplier: "Purchasing",
  receiving: "Warehouse",
  stock: "Warehouse",
  logistics: "Delivery",
  "delivery-date": "Delivery",
  "delivery-order": "Delivery",
  deliver: "Delivery",
  "delivery-photo": "Delivery",
  loan: "Delivery",
  money: "Payments",
};

const titleCase = (s: string) =>
  s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");

/* ONE date spelling: facts carry ISO; `fmtDate` spells it. */
const spell = (s: string) =>
  s.replace(/\b(\d{4}-\d{2}-\d{2})(?:T[\d:.]+(?:Z|[+-]\d{2}:\d{2})?)?/g, (_v, day: string) => fmtDate(day));

const isPlate = (n: RouteNode) => n.kind === "goods-line" || n.kind === "delivery-lane";

function ownerOf(owners: RouteActionOwners, key: StationOwnerKey): RoutePerson | null {
  return (owners as unknown as Record<string, RoutePerson | null | undefined>)[key] ?? null;
}

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${a.slice(0, 10)}T00:00:00Z`) - Date.parse(`${b.slice(0, 10)}T00:00:00Z`)) / 864e5);
}

/** The goods line plates and the station ids that hang under each. */
function goodsItems(route: RouteMap) {
  const out = new Map<string, string[]>();
  for (const e of route.edges) out.set(e.from, [...(out.get(e.from) ?? []), e.to]);
  const byId = new Map(route.nodes.map((n) => [n.id, n]));
  return route.nodes
    .filter((n) => n.kind === "goods-line")
    .map((plate) => {
      const ids = new Set<string>();
      const queue = [plate.id];
      while (queue.length) {
        const from = queue.shift()!;
        for (const id of out.get(from) ?? []) {
          const next = byId.get(id);
          if (!next || next.branch !== "goods" || ids.has(id)) continue;
          ids.add(id);
          queue.push(id);
        }
      }
      return { plate, nodes: [...ids].map((id) => byId.get(id)!).filter((n) => !isPlate(n)) };
    });
}

const WORST: NodeMark[] = ["unreadable", "blocked", "current", "waiting", "future", "complete"];
function worstOf(nodes: RouteNode[]): NodeMark {
  for (const m of WORST) if (nodes.some((n) => n.mark === m)) return m;
  return "future";
}

function StepMark({ mark }: { mark: NodeMark }) {
  const cls =
    mark === "complete"
      ? "bg-c-ok-fg text-white border-c-ok-fg"
      : mark === "blocked"
        ? "bg-c-hold-bg text-c-hold-fg border-c-hold-bg"
        : mark === "unreadable"
          ? "bg-c-warn-bg text-c-warn-fg border-c-warn-fg"
          : mark === "current"
            ? "bg-c-card text-c-ink border-c-ink"
            : "bg-c-card text-c-muted border-c-input-border";
  const glyph = mark === "complete" ? "check" : mark === "blocked" || mark === "unreadable" ? "priority_high" : mark === "current" ? "circle" : "";
  return (
    <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${cls}`} aria-label={MARK_WORD[mark].word}>
      {glyph && <MIcon name={glyph} size={16} className="scale-[.7]" fill={mark === "current"} />}
    </span>
  );
}

function DoorLink({ node }: { node: RouteNode }) {
  if (!node.door) return <span className="text-c-muted">No document</span>;
  if (node.door.href.startsWith("#")) return <span className="text-c-muted">{node.door.label}</span>;
  return (
    <Link to={node.door.href} className="whitespace-nowrap font-semibold text-c-ink hover:underline">
      {node.door.label.replace(/\s*→\s*$/, "")} →
    </Link>
  );
}

function BranchCard({ branch, nodes, owners, route }: { branch: Branch; nodes: RouteNode[]; owners: RouteActionOwners; route: RouteMap }) {
  const steps = nodes.filter((n) => !isPlate(n));
  const mark = worstOf(steps);
  const problem = mark === "blocked" || mark === "unreadable";
  const current = steps.find((n) => n.mark === "unreadable" || n.mark === "blocked") ?? steps.find((n) => n.current) ?? steps.find((n) => n.mark !== "complete") ?? null;
  const last = steps[steps.length - 1] ?? null;
  const pill = steps.length > 0 && steps.every((n) => n.mark === "complete") ? MARK_WORD.complete : MARK_WORD[mark];
  /* A blocked step is charcoal `Blocked`; a step that could not be read is amber. */
  const owner = current?.action ? ownerOf(owners, current.action.ownerKey) : null;
  /* One plain sentence from the step's first two lines: a line that already
     ends a sentence, or one that carries on in lower case, is never given a
     second full stop ("Could not read Delivery for this order."). */
  const sentence = spell(
    ((current ?? last)?.lines.slice(0, 2) ?? []).reduce(
      (acc, line) => (!acc ? line : /[.!?]$/.test(acc) || /^[a-z]/.test(line) ? `${acc} ${line}` : `${acc}. ${line}`),
      "",
    ),
  );
  const facts: Array<{ k: string; v: React.ReactNode; muted?: boolean }> = [
    { k: "Now at", v: current ? titleCase(current.title) : "Done" },
    { k: "Next", v: current?.action ? current.action.label : "Not set", muted: !current?.action },
    { k: "Due", v: current?.action?.context.detail ? spell(current.action.context.detail) : "Not set", muted: !current?.action?.context.detail },
    { k: "Doc", v: current?.door || last?.door ? <DoorLink node={(current?.door ? current : last)!} /> : "Not yet", muted: !(current?.door || last?.door) },
  ];
  const items = branch === "goods" ? goodsItems(route) : [];
  return (
    <div
      className={`flex min-w-0 flex-col gap-2 rounded-lg border px-3.5 py-3 ${problem ? "border-c-btn-border bg-c-warn-bg" : "border-c-card-border bg-c-card"}`}
      data-testid={`route-card-${branch}`}
      data-problem={problem ? "yes" : "no"}
    >
      <div className="flex items-center gap-2">
        <MIcon name={BRANCH[branch].icon} size={18} className="text-c-secondary" />
        <span className="flex-1 text-[14px] font-semibold text-c-ink">{BRANCH[branch].name}</span>
        <CPill tone={pill.tone} strong>{pill.word}</CPill>
      </div>
      {current?.action && (
        <div className="flex items-center gap-2 pb-0.5">
          {owner ? (
            <Avatar person={{ userId: owner.userId, name: owner.name, email: owner.email }} size={22} ring={false} />
          ) : (
            <span title="Not recorded" className="grid h-[22px] w-[22px] place-items-center rounded-full border border-dashed border-c-input-border text-[11px] text-c-muted">?</span>
          )}
          <span className="min-w-0 truncate text-[12px] text-c-secondary">Waiting for {OWNER_WORD[current.action.ownerKey]}</span>
        </div>
      )}
      {sentence && <p className="text-[13px] leading-[1.45] text-c-body">{sentence}{/[.!?]$/.test(sentence) ? "" : "."}</p>}
      <div className="flex flex-col border-t border-c-section-line pt-1.5">
        {facts.map((f) => (
          <div key={f.k} className="grid grid-cols-[72px_minmax(0,1fr)] gap-2 py-[3px] text-[12px]">
            <span className="text-c-muted">{f.k}</span>
            <span className={`break-words font-medium ${f.muted ? "text-c-muted" : "text-c-ink"}`}>{f.v}</span>
          </div>
        ))}
      </div>
      {items.length > 0 && (
        <div className="flex flex-col gap-0.5 border-t border-c-section-line pt-1.5">
          <span className="pb-0.5 text-[11px] font-semibold tracking-[.08em] text-c-muted">ITEMS</span>
          {items.map(({ plate, nodes: own }) => {
            const m = worstOf(own);
            const bad = m === "blocked" || m === "unreadable";
            const word = own.length > 0 && own.every((n) => n.mark === "complete") ? MARK_WORD.complete : MARK_WORD[m];
            return (
              <div key={plate.id} className={`-mx-1.5 flex flex-col gap-0.5 rounded-md px-1.5 py-1 ${bad ? "bg-c-warn-bg" : ""}`}>
                <div className="flex items-center gap-1.5 text-[12px]">
                  <span className="min-w-0 flex-1 break-words font-semibold text-c-ink">{plate.title}</span>
                  <CPill tone={word.tone}>{word.word}</CPill>
                </div>
                {own.filter((n) => n.mark !== "future").slice(-2).map((n) => (
                  <div key={n.id} className="grid grid-cols-[76px_minmax(0,1fr)] gap-2 text-[12px] leading-[1.4]">
                    <span className="text-c-muted">{titleCase(n.title)}</span>
                    <span className="break-words text-c-ink">{spell(n.lines[0] ?? "")}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
      <div className="flex flex-1 flex-col gap-px border-t border-c-section-line pt-1.5">
        <span className="pb-0.5 text-[11px] font-semibold tracking-[.08em] text-c-muted">STEPS</span>
        {steps.map((n) => (
          <div
            key={n.id}
            className={`-mx-1.5 grid grid-cols-[18px_minmax(0,1fr)] items-center gap-2 rounded-md px-1.5 py-1 text-[12px] ${n === current ? "bg-c-info-bg" : ""}`}
          >
            <StepMark mark={n.mark} />
            <span className={`break-words ${n === current ? "font-semibold" : "font-medium"} ${n.mark === "future" ? "text-c-muted" : "text-c-ink"}`}>
              {titleCase(n.title)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SoOrderRoute({
  route,
  owners,
  onRetry,
  originalDate,
  currentDate,
  confirmedDate,
  confirmedRead = "ok",
  deliveredDate,
  todayIso,
}: {
  route: RouteMap;
  owners: RouteActionOwners;
  onRetry?: (owner: RouteRetryOwner) => void;
  /** Revision 1's requested date — the Customer original delivery date. */
  originalDate: string | null;
  /** The order's requested date now; differs from the original after a postpone. */
  currentDate: string | null;
  /** Delivery's confirmed booking (logistics and customer both agreed). */
  confirmedDate: string | null;
  /** Delivery's read: a failed one prints `Could not read`, never `Not scheduled`. */
  confirmedRead?: "ok" | "failed" | "loading";
  deliveredDate: string | null;
  todayIso: string;
}) {
  const [view, setView] = useState<View>("ov");
  const byBranch = useMemo(() => {
    const out: Array<{ branch: Branch; nodes: RouteNode[] }> = [];
    for (const b of ["goods", "delivery", "money", "loan"] as const) {
      const nodes = route.nodes.filter((n) => n.branch === b);
      if (nodes.length > 0) out.push({ branch: b, nodes });
    }
    return out;
  }, [route]);
  const problems = byBranch.filter(({ nodes }) => nodes.some((n) => n.mark === "blocked" || n.mark === "unreadable"));
  /* Problem cards are amber and come first (Layout Standard §3.2). */
  const ordered = [...problems, ...byBranch.filter((b) => !problems.includes(b))];

  const postponed = Boolean(originalDate && currentDate && originalDate.slice(0, 10) !== currentDate.slice(0, 10));
  const monitored = currentDate ?? originalDate;
  const target = confirmedDate ?? monitored;
  const confDiff = confirmedDate && monitored ? dayDiff(confirmedDate, monitored) : 0;
  const left = target ? dayDiff(target, todayIso) : null;
  const daysPill: { word: string; tone: CPillTone } | null = deliveredDate
    ? { word: `Delivered ${fmtDate(deliveredDate)}`, tone: "ok" }
    : left == null
      ? null
      : left === 0
        ? { word: "Today", tone: "info" }
        : left > 0
          ? { word: `${left} ${left === 1 ? "day" : "days"} left`, tone: "info" }
          : { word: `Passed ${-left} ${-left === 1 ? "day" : "days"} ago · not delivered`, tone: "warn" };
  const probWord = deliveredDate
    ? "Delivered"
    : problems.length === 0
      ? "On track"
      : problems.length === 1
        ? `${BRANCH[problems[0]!.branch].name} · problem`
        : `${problems.length} problems · ${problems.map((p) => BRANCH[p.branch].name).join(", ")}`;
  const probOk = Boolean(deliveredDate) || problems.length === 0;

  const steps = route.nodes.filter((n) => !isPlate(n) && n.branch !== "root");
  /* A goods station names the item it serves, so two `Purchasing` rows never look alike. */
  const itemOf = useMemo(() => {
    const out = new Map<string, string>();
    for (const { plate, nodes } of goodsItems(route)) for (const n of nodes) out.set(n.id, plate.title);
    return out;
  }, [route]);

  return (
    <div className="flex flex-col gap-3" data-testid="so-order-route">
      <Card label="Order status" testId="route-status-card" className="gap-3 !px-[18px] !py-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
          <div className="flex min-w-[180px] flex-col gap-0.5">
            <span className="text-[12px] font-medium text-c-secondary">
              {postponed ? "Customer new delivery date" : "Customer original delivery date"}
            </span>
            <span className={`text-[20px] font-semibold leading-6 ${monitored ? "text-c-ink" : "text-c-muted"}`} data-testid="route-monitored-date">
              {monitored ? fmtDate(monitored) : "Not recorded"}
            </span>
            {postponed && originalDate && <span className="text-[12px] text-c-secondary">Originally {fmtDate(originalDate)}</span>}
          </div>
          {confirmedDate && !deliveredDate ? (
            <>
              <span className="pt-3.5 text-c-muted" aria-hidden="true">
                <MIcon name="arrow_forward" size={20} />
              </span>
              <div className="flex min-w-[180px] flex-col gap-0.5">
                <span className="text-[12px] font-medium text-c-secondary">Customer confirmed delivery date</span>
                <span className="text-[20px] font-semibold leading-6 text-c-ink" data-testid="route-confirmed-date">{fmtDate(confirmedDate)}</span>
                <span className="flex">
                  <CPill tone={confDiff > 0 ? "warn" : "ok"}>
                    {confDiff > 0
                      ? `${confDiff} ${confDiff === 1 ? "day" : "days"} later`
                      : confDiff < 0
                        ? `${-confDiff} ${-confDiff === 1 ? "day" : "days"} earlier`
                        : "Same"}
                  </CPill>
                </span>
              </div>
            </>
          ) : (
            <div className="flex min-w-[160px] flex-col gap-0.5 border-l border-c-section-line pl-3">
              <span className="text-[12px] font-medium text-c-secondary">Customer confirmed delivery date</span>
              {confirmedRead === "failed" ? (
                <span
                  className="text-[14px] font-medium text-c-warn-fg"
                  data-testid="route-confirmed-date"
                  title="Could not read Delivery for this order. This does not mean nothing is arranged."
                >
                  Could not read
                </span>
              ) : (
                <span className="text-[14px] font-medium text-c-muted" data-testid="route-confirmed-date">
                  {confirmedRead === "loading" ? "Loading" : "Not scheduled"}
                </span>
              )}
            </div>
          )}
          {daysPill && <CPill tone={daysPill.tone} strong>{daysPill.word}</CPill>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full py-[3px] pl-[7px] pr-2.5 text-[12px] font-semibold ${
              probOk ? "bg-c-ok-bg text-c-ok-fg" : "bg-c-warn-bg text-c-warn-fg"
            }`}
            data-testid="route-problem-pill"
          >
            <MIcon name={probOk ? "check_circle" : "error"} size={16} />
            {probWord}
          </span>
          <span className="flex-1" />
          <ViewSwitch
            label="View"
            value={view}
            onChange={setView}
            views={[
              { key: "ov", label: "Overview" },
              { key: "st", label: "Steps" },
              { key: "dt", label: "Details" },
            ]}
          />
        </div>
        {(route.proposedChange || route.linkedProblems.length > 0) && view !== "st" && (
          <div className="flex flex-col gap-1 rounded-lg bg-c-warn-bg px-3 py-2 text-[12px] text-c-warn-fg" data-testid="route-notices">
            {route.proposedChange && (
              <span>
                <b className="font-semibold">{spell(route.proposedChange.fact)}</b>
                {route.proposedChange.changes.length > 0 && ` · ${route.proposedChange.changes.map(spell).join(" · ")}`}
                {route.proposedChange.more > 0 && ` and ${route.proposedChange.more} more`}
                {route.proposedChange.rule && `. ${route.proposedChange.rule}`}
              </span>
            )}
            {route.linkedProblems.map((p) => (
              <span key={p.id}>
                {p.title}{" "}
                <Link to={p.door.href} className="font-semibold text-c-ink hover:underline">
                  {p.door.label}
                </Link>
              </span>
            ))}
          </div>
        )}
        {view === "ov" && (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-2.5 border-t border-c-section-line pt-3" data-testid="route-overview">
            {ordered.map(({ branch, nodes }) => (
              <BranchCard key={branch} branch={branch} nodes={nodes} owners={owners} route={route} />
            ))}
          </div>
        )}
      </Card>
      {view === "st" && <SalesOrderRoute route={route} owners={owners} onRetry={onRetry} />}
      {view === "dt" && (
        <Card label="Details" testId="route-details">
          <div className="overflow-x-auto">
            <div className="min-w-[680px] text-[13px]" role="table" aria-label="Order Route details">
              <div role="row" className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_110px_minmax(0,1fr)] gap-3 border-b border-c-head-line py-2 text-[12px] text-c-muted">
                <span>Step</span><span>Who</span><span>Planned</span><span>Actual</span><span>Status</span><span>Document</span>
              </div>
              {steps.map((n) => {
                const w = MARK_WORD[n.mark];
                const owner = n.action ? ownerOf(owners, n.action.ownerKey) : null;
                const bad = n.mark === "blocked" || n.mark === "unreadable";
                return (
                  <div
                    key={n.id}
                    role="row"
                    className={`-mx-1.5 grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_110px_minmax(0,1fr)] items-center gap-3 border-b border-c-row-line px-1.5 py-2 ${bad ? "bg-c-warn-bg" : ""}`}
                    data-testid={`route-detail-${n.id}`}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="font-medium text-c-ink">{titleCase(n.title)}</span>
                      {itemOf.get(n.id) && <span className="break-words text-[12px] text-c-secondary">{itemOf.get(n.id)}</span>}
                    </span>
                    <span className={owner ? "text-c-secondary" : "text-c-muted"}>
                      {owner?.name ?? (n.action ? OWNER_WORD[n.action.ownerKey] : KIND_MODULE[n.kind] ?? "Not recorded")}
                    </span>
                    <span className={n.action?.context.detail ? "text-c-body" : "text-c-muted"}>
                      {n.action?.context.detail ? spell(n.action.context.detail) : "Not set"}
                    </span>
                    <span className={n.mark === "complete" ? "text-c-ink" : "text-c-muted"}>
                      {n.mark === "complete" ? spell(n.lines[0] ?? "Done") : "Not yet"}
                    </span>
                    <span className="justify-self-start"><CPill tone={w.tone}>{w.word}</CPill></span>
                    <span className="text-[13px]"><DoorLink node={n} /></span>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

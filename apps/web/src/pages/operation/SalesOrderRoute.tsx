import { AlertTriangle, ArrowRight, ArrowUpRight, Check, CircleDot } from "lucide-react";
import { Link } from "react-router-dom";
import type { SalesOrderRoute as Route, SalesOrderRouteFact } from "@carres/shared";
import { fmtDate } from "@/lib/fmt-date";

const stateStyle = {
  complete: "bg-kit-green-3 text-kit-green-11",
  clear: "bg-kit-green-3 text-kit-green-11",
  current: "bg-kit-blue-3 text-kit-blue-11",
  attention: "bg-kit-amber-3 text-kit-amber-11",
} as const;

function StateIcon({ fact }: { fact: SalesOrderRouteFact }) {
  const Icon = fact.state === "attention" ? AlertTriangle : fact.state === "current" ? CircleDot : Check;
  return <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-pill ${stateStyle[fact.state]}`}><Icon size={12} aria-hidden="true" /></span>;
}

/* ONE date spelling, wherever a route fact carries one. `fmtDate` is the only
   date format in the portal, so an ISO string in a fact — title or detail —
   is rendered through it rather than printed raw (01-design-tokens §1). */
const spellDates = (s: string) => s.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (date) => fmtDate(date));

function FactStep({ fact, currentLabel = false }: { fact: SalesOrderRouteFact; currentLabel?: boolean }) {
  const detail = fact.detail ? spellDates(fact.detail) : null;
  const body = (
    <>
      <StateIcon fact={fact} />
      <span className="min-w-0">
        <span className="block text-body font-medium text-kit-slate-12">{spellDates(fact.title)}</span>
        {detail && <span className="block text-meta text-kit-slate-9">{detail}</span>}
        {currentLabel && <span className="mt-1 inline-block text-label font-semibold tracking-wide text-kit-blue-11">CURRENT</span>}
      </span>
    </>
  );
  return fact.href ? (
    <Link to={fact.href} aria-label={`${fact.title} · Open in ${fact.owner}`} className="flex min-w-[190px] items-start gap-2 rounded-control px-2 py-2 hover:bg-hovertint">{body}<ArrowUpRight size={12} className="ml-auto mt-1 shrink-0 text-kit-blue-11" /></Link>
  ) : <div className="flex min-w-[190px] items-start gap-2 px-2 py-2">{body}</div>;
}

function isCurrentPosition(facts: SalesOrderRouteFact[], fact: SalesOrderRouteFact, index: number) {
  const hasExplicitCurrent = facts.some((candidate) => candidate.state === "current");
  return hasExplicitCurrent ? fact.state === "current" : index === facts.length - 1;
}

export default function SalesOrderRoute({ route }: { route: Route }) {
  const goods = route.lanes.find((lane) => lane.key === "goods");
  const obligations = route.lanes
    .filter((lane) => lane.key !== "goods")
    .map((lane) => ({ ...lane, groups: lane.groups.map((group) => ({ ...group, facts: group.facts.filter((fact) => fact.state === "attention" || fact.state === "current") })).filter((group) => group.facts.length > 0) }))
    .filter((lane) => lane.groups.length > 0);
  const so = route.documents.find((document) => document.kind === "Sales Order");

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-5" data-testid="sales-order-route">
      <div className="border-b border-kit-slate-6 pb-3">
        <h1 className="text-page text-kit-slate-12">Order Route</h1>
        <p className="mt-1 text-body text-kit-slate-11">Each item has its own route. Open a fact in the team that owns it.</p>
      </div>

      <section className="rounded-card border border-kit-slate-5 bg-white" data-testid="goods-routes">
        <div className="border-b border-kit-slate-5 px-4 py-3"><h2 className="text-strong text-kit-slate-12">Goods routes</h2></div>
        <div className="divide-y divide-kit-slate-5">
          {goods?.groups.map((group) => (
            <article key={group.id} className="px-4 py-4">
              <h3 className="mb-3 text-body font-semibold text-kit-slate-12">{group.title}</h3>
              <div className="flex flex-wrap items-stretch gap-1">
                {so && <Link to={so.href} className="flex min-w-[145px] items-center gap-2 rounded-control px-2 py-2 text-body font-medium text-kit-blue-11 hover:bg-hovertint">{so.number}</Link>}
                {group.facts.map((fact, index) => <div key={fact.id} className="flex items-center"><ArrowRight size={14} className="mx-1 shrink-0 text-kit-slate-9" /><FactStep fact={fact} currentLabel={isCurrentPosition(group.facts, fact, index)} /></div>)}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-card border border-kit-slate-5 bg-white">
        <div className="border-b border-kit-slate-5 px-4 py-3"><h2 className="text-strong text-kit-slate-12">Still owed</h2></div>
        {obligations.length > 0 ? (
          <div className="divide-y divide-kit-slate-5">
            {obligations.map((lane) => <div key={lane.key} className="grid gap-2 px-4 py-3 md:grid-cols-[150px_1fr]"><div className="text-body font-medium text-kit-slate-11">{lane.title}</div><div className="grid gap-1 md:grid-cols-2">{lane.groups.flatMap((group) => group.facts).map((fact) => <FactStep key={fact.id} fact={fact} />)}</div></div>)}
          </div>
        ) : <div className="px-4 py-4 text-body text-kit-slate-9">Nothing is still owed.</div>}
      </section>
    </div>
  );
}

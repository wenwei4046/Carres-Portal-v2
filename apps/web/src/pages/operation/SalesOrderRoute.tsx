import { AlertTriangle, ArrowUpRight, Check, CircleDot, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import type { SalesOrderRoute as Route, SalesOrderRouteFact } from "@carres/shared";
import Card from "@/components/kit/Card";
import Panel from "@/components/kit/Panel";

const stateStyle = {
  complete: "bg-kit-green-3 text-kit-green-11",
  clear: "bg-kit-green-3 text-kit-green-11",
  current: "bg-kit-blue-3 text-kit-blue-11",
  attention: "bg-kit-amber-3 text-kit-amber-11",
} as const;

function StateIcon({ fact }: { fact: SalesOrderRouteFact }) {
  const Icon = fact.state === "attention"
    ? AlertTriangle
    : fact.state === "current" ? CircleDot : Check;
  return (
    <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-pill ${stateStyle[fact.state]}`}>
      <Icon size={12} aria-hidden="true" />
    </span>
  );
}

function FactRow({ fact }: { fact: SalesOrderRouteFact }) {
  return (
    <div className="border-t border-kit-slate-5 py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex items-start gap-2">
        <StateIcon fact={fact} />
        <div className="min-w-0 flex-1">
          <div className="text-body font-medium text-kit-slate-12">{fact.title}</div>
          {fact.detail && <div className="mt-0.5 text-meta text-kit-slate-11">{fact.detail}</div>}
          {fact.occurredAt && <div className="mt-0.5 text-meta text-kit-slate-9">{fact.occurredAt.slice(0, 10)}</div>}
          {fact.href && (
            <Link className="mt-1 inline-flex items-center gap-1 text-label font-medium text-kit-blue-11 hover:underline" to={fact.href}>
              Open in {fact.owner} <ArrowUpRight size={12} aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SalesOrderRoute({ route }: { route: Route }) {
  return (
    <div className="flex flex-col gap-4" data-testid="sales-order-route">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-page text-kit-slate-12">Order Route</div>
            <p className="mt-1 max-w-3xl text-body text-kit-slate-11">
              Read-only facts from each owning module. One order may be in several goods positions at once.
            </p>
          </div>
          <div className={`rounded-pill px-3 py-1 text-label font-medium ${route.noActionRequired ? "bg-kit-green-3 text-kit-green-11" : "bg-kit-amber-3 text-kit-amber-11"}`}>
            {route.noActionRequired
              ? "No Action Required"
              : "Open obligations remain in their owning modules."}
          </div>
        </div>
      </Card>

      <Panel title="Document lineage">
        <div className="flex flex-wrap gap-2">
          {route.documents.map((document) => (
            <Link
              key={document.id}
              to={document.href}
              className="inline-flex min-w-[150px] items-center gap-2 rounded-control border border-kit-slate-5 px-3 py-2 hover:bg-hovertint"
            >
              <FileText size={15} className="shrink-0 text-kit-slate-9" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-meta text-kit-slate-9">{document.kind}</span>
                <span className="block truncate text-body font-medium text-kit-slate-12">{document.number}</span>
                {document.detail && <span className="block truncate text-meta text-kit-slate-11">{document.detail}</span>}
              </span>
            </Link>
          ))}
        </div>
      </Panel>

      <Panel title="Current goods positions">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {route.currentPositions.map((position) => (
            <div key={position} className="rounded-control bg-kit-slate-3 px-3 py-2 text-body text-kit-slate-12">
              {position}
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid items-start gap-3 lg:grid-cols-2 2xl:grid-cols-5">
        {route.lanes.map((lane) => (
          <div key={lane.key} data-testid={`route-lane-${lane.key}`} id={lane.key === "loan" ? "loan" : undefined}>
            <Panel title={lane.title}>
              <div className="flex flex-col gap-4">
                {lane.groups.map((group) => (
                  <section key={group.id}>
                    <h3 className="mb-2 text-label font-semibold text-kit-slate-11">{group.title}</h3>
                    <div>{group.facts.map((item) => <FactRow key={item.id} fact={item} />)}</div>
                  </section>
                ))}
              </div>
            </Panel>
          </div>
        ))}
      </div>
    </div>
  );
}

import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { ReceivingRegisterFilter } from "@carres/shared";
import { useReceivingRegister } from "@/lib/queries";
import PurchasingTabs from "./PurchasingTabs";
import ReceivingDateRail from "./receiving/ReceivingDateRail";
import ReceivingRegister from "./receiving/ReceivingRegister";

const SUBTITLE = "See what should arrive and record what actually arrived.";

function filterFrom(params: URLSearchParams): ReceivingRegisterFilter | null {
  const value = params.get("date");
  if (!value) return null;
  return value as ReceivingRegisterFilter;
}

/**
 * One Receiving page: governed delivery balances as parents, every physical
 * Receiving Session / formal GRN beneath its source, and one Warehouse-workday
 * rail. Work lives in central My Work / Team Work and deep-links here; this
 * page creates no local queue, status arithmetic or receipt writer.
 */
export default function OperationReceiving() {
  const [params, setParams] = useSearchParams();
  const [railOpen, setRailOpen] = useState(true);
  const filter = filterFrom(params);
  const registerQ = useReceivingRegister(filter);
  const result = registerQ.data;

  const setFilter = (next: ReceivingRegisterFilter) => {
    setParams((previous) => {
      const copy = new URLSearchParams(previous);
      if (filter === next) copy.delete("date");
      else copy.set("date", next);
      return copy;
    });
  };

  const openSession = (sessionId: string, sourceId: string) => {
    setParams((previous) => {
      const copy = new URLSearchParams(previous);
      copy.set("po", sourceId);
      copy.set("receipt", sessionId);
      copy.delete("receiving");
      copy.delete("sourceVersion");
      return copy;
    });
  };

  const startReceiving = (sourceId: string, sourceVersion: number) => {
    setParams((previous) => {
      const copy = new URLSearchParams(previous);
      copy.set("po", sourceId);
      copy.set("sourceVersion", String(sourceVersion));
      copy.set("receiving", "new");
      copy.delete("receipt");
      return copy;
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-kit-canvas" data-testid="receiving-page">
      <PurchasingTabs right={<p className="hidden text-meta text-kit-slate-9 sm:block">{SUBTITLE}</p>} />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {railOpen ? (
          <div className="absolute inset-y-[50px] left-0 z-20 min-h-0 shadow-lg md:static md:z-auto md:shadow-none">
            <ReceivingDateRail
              rows={result?.rail ?? []}
              selected={filter}
              onSelect={setFilter}
              onHide={() => setRailOpen(false)}
            />
          </div>
        ) : null}

        <main className="flex min-w-0 flex-1 flex-col p-2" data-testid="receiving-work-surface">
          {registerQ.isError ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-white">
              <p className="text-body text-kit-slate-12">The Receiving register could not be loaded</p>
              {(registerQ.error as Error | null)?.message ? (
                <p className="text-meta text-kit-slate-9">{(registerQ.error as Error).message}</p>
              ) : null}
              <button
                type="button"
                className="rounded-control border border-kit-slate-5 bg-white px-3 py-1.5 text-meta font-medium text-kit-slate-12 hover:bg-kit-slate-3"
                onClick={() => void registerQ.refetch()}
              >
                Try again
              </button>
            </div>
          ) : (
            <ReceivingRegister
              parents={result?.parents ?? []}
              loading={registerQ.isLoading}
              onOpenSession={openSession}
              onStartReceiving={startReceiving}
              onShowFilters={railOpen ? undefined : () => setRailOpen(true)}
            />
          )}
        </main>
      </div>
    </div>
  );
}

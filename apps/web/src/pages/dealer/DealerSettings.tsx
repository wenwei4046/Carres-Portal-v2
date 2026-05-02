import { useDealerSelf } from "@/lib/queries";

/**
 * Phase 2B.1 stub. Real Settings (outlets CRUD + salespersons CRUD + deposit
 * display) ships in Phase 2D. This page exists only so the sidebar item can
 * be enabled and routes resolve cleanly.
 */
export default function DealerSettings() {
  const dealer = useDealerSelf();

  return (
    <div className="p-9 max-w-[800px]">
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Settings</p>
        <h1 className="font-display text-3xl mt-1.5 tracking-tight">Your account</h1>
        <p className="text-sm text-muted-foreground mt-1">Read-only for now · full editing ships in Phase 2D</p>
      </header>

      <section className="rounded-md border border-border bg-card p-5">
        <h2 className="text-xs uppercase tracking-[0.16em] text-muted-foreground font-semibold mb-3">
          Account
        </h2>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5">Dealer</dt>
            <dd>{dealer.data?.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5">Region</dt>
            <dd>{dealer.data?.region ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5">Status</dt>
            <dd className="capitalize">{dealer.data?.status ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5">Deposit balance</dt>
            <dd className="font-mono">RM {(dealer.data?.depositBalance ?? 0).toLocaleString()}</dd>
          </div>
        </dl>
      </section>

      <p className="mt-4 text-xs text-muted-foreground">
        Outlets, salespersons, and deposit history land in Phase 2D.
      </p>
    </div>
  );
}

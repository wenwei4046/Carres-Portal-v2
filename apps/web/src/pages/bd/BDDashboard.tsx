import { useBdInquiries } from "@/lib/queries";

/**
 * BDDashboard — Phase 8 Sprint 2.
 *
 * Minimal dashboard surfacing inquiry pipeline counts. Deeper analytics
 * (proto bd-dashboard.jsx 108 LOC) deferred — not in §8 acceptance.
 */
export default function BDDashboard() {
  const inquiries = useBdInquiries();
  const rows = inquiries.data ?? [];

  const counts = {
    new:       rows.filter((r) => r.stage === "new").length,
    contacted: rows.filter((r) => r.stage === "contacted").length,
    qualified: rows.filter((r) => r.stage === "qualified").length,
    converted: rows.filter((r) => r.stage === "converted").length,
    lost:      rows.filter((r) => r.stage === "lost").length,
  };

  return (
    <div className="px-9 py-8 space-y-6">
      <header>
        <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">BD · Pulse</div>
        <h1 className="font-display text-[30px] mt-1.5 mb-1 text-foreground tracking-[-0.02em]">
          Dashboard
        </h1>
        <div className="text-[13px] text-muted-foreground">
          Inquiry pipeline · live from Supabase
        </div>
      </header>

      <div className="grid grid-cols-5 gap-3.5" data-testid="bd-dashboard-counts">
        {(["new", "contacted", "qualified", "converted", "lost"] as const).map((s) => (
          <div key={s} className="bg-card rounded-md border border-border p-4">
            <div className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
              {s}
            </div>
            <div className="font-display text-[28px] mt-1.5 leading-none">
              {counts[s]}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

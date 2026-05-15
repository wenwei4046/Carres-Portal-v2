export default function OpsDashboard() {
  return (
    <div className="px-9 py-7">
      <div className="text-[11px] uppercase tracking-[0.18em] text-primary font-semibold mb-1.5">
        Ops Panel
      </div>
      <h1 className="text-[28px] font-display font-bold text-base-900 mb-2">
        Dashboard
      </h1>
      <p className="text-[13px] text-base-600 mb-7 max-w-2xl">
        Welcome to the Carres Ops Panel. Phase 1 ships Stock Transfer + Excel
        Import + Activity Log. Other modules (Annotation, Balance, Returns,
        Service Notes, Issues, Supplier Meetings, Reports) follow in later
        phases — see the sidebar items marked <em>soon</em>.
      </p>

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div className="card p-5">
          <div className="text-[10px] uppercase tracking-wider text-base-500 font-semibold mb-2">
            Stock at Carres Klang
          </div>
          <div className="text-[28px] font-display font-bold text-base-900">—</div>
          <div className="text-[11px] text-base-500 mt-1">SKUs in stock (loading…)</div>
        </div>
        <div className="card p-5">
          <div className="text-[10px] uppercase tracking-wider text-base-500 font-semibold mb-2">
            Pending transfers
          </div>
          <div className="text-[28px] font-display font-bold text-base-900">—</div>
          <div className="text-[11px] text-base-500 mt-1">In transit (loading…)</div>
        </div>
        <div className="card p-5">
          <div className="text-[10px] uppercase tracking-wider text-base-500 font-semibold mb-2">
            Recent activity
          </div>
          <div className="text-[28px] font-display font-bold text-base-900">—</div>
          <div className="text-[11px] text-base-500 mt-1">Events today (loading…)</div>
        </div>
      </div>

      <div className="card mt-6 p-5">
        <div className="text-[10px] uppercase tracking-wider text-base-500 font-semibold mb-3">
          📋 Recent activity (live)
        </div>
        <div className="text-[12px] text-base-500 italic py-8 text-center">
          Activity feed will appear here once team starts using the panel.
        </div>
      </div>
    </div>
  );
}

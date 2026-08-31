import { ArrowLeft } from "lucide-react";
import type { ReceivingRegisterParent } from "@carres/shared";
import { usePoReceiving } from "@/lib/queries";
import ReceivingSessionDetail from "../receiving/ReceivingSessionDetail";

export default function ReceivingWorkspace({
  parent,
  receiptId,
  onBack,
}: {
  parent: ReceivingRegisterParent;
  receiptId: string;
  onBack: () => void;
}) {
  const receivingQ = usePoReceiving(parent.id);
  const session = receivingQ.data?.sessions.find((row) => row.id === receiptId) ?? null;
  const events = (receivingQ.data?.events ?? []).filter((event) => event.receipt_id === receiptId);

  return (
    <main className="flex h-full min-h-0 w-full flex-col bg-kit-canvas" data-testid="receiving-session-workspace">
      <header className="flex h-[50px] shrink-0 items-center gap-3 border-b border-kit-slate-5 bg-white px-4">
        <button type="button" aria-label="Back to Receiving" onClick={onBack} className="text-kit-slate-9 hover:text-kit-slate-12"><ArrowLeft size={18} /></button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-page font-semibold text-kit-slate-12"><span className="font-mono">{parent.sourceNumber}</span> · Receiving Session</h1>
          <p className="text-meta text-kit-slate-9">{parent.supplier} · {parent.deliverTo}</p>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        {receivingQ.isLoading ? <p className="text-body text-kit-slate-9">Loading Receiving Session…</p> : session ? (
          <ReceivingSessionDetail
            parent={parent}
            session={session}
            events={events}
            authority={receivingQ.data?.authority ?? { mayPost: false, normalGrnDutyName: null, datedCoverName: null }}
          />
        ) : (
          <div className="bg-white p-4">
            <p className="text-body font-medium text-kit-slate-12">The Receiving Session could not be found</p>
            <p className="mt-1 text-meta text-kit-slate-9">Return to Receiving and open the exact session again.</p>
          </div>
        )}
      </div>
    </main>
  );
}

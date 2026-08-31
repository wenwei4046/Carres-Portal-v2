import { useEffect, useMemo, useState } from "react";
import {
  receivingProblemCopy,
  type ReceivingLineInput,
  type ReceivingRegisterParent,
  type ReceivingSessionInput,
} from "@carres/shared";
import DOFileUploadField from "@/components/DOFileUploadField";
import ClaimPhotoUploadField from "@/components/ClaimPhotoUploadField";
import {
  useSaveReceivingSessionMutation,
  useWarehouseReceiptReviewMutation,
  type ReceivingEvent,
  type ReceivingSession,
} from "@/lib/queries";
import { fmtDateShort } from "@/lib/fmt-date";
import GrnPreview from "./GrnPreview";

type EditableLine = ReceivingLineInput;

function storedNumber(line: ReceivingSession["lines"][number], current: keyof ReceivingLineInput, legacy: "received_now" | "damaged_qty" | "wrong_item_qty"): number {
  return Number(line[current] ?? line[legacy] ?? 0);
}

function initialLines(parent: ReceivingRegisterParent, session: ReceivingSession): EditableLine[] {
  const stored = new Map(session.lines.map((line) => [line.poLineId ?? line.id, line]));
  return parent.lines.map((source) => {
    const line = stored.get(source.id);
    return {
      poLineId: source.id,
      sku: source.sku,
      receivedQty: line ? storedNumber(line, "receivedQty", "received_now") : 0,
      damagedQty: line ? storedNumber(line, "damagedQty", "damaged_qty") : 0,
      wrongItemQty: line ? storedNumber(line, "wrongItemQty", "wrong_item_qty") : 0,
      extraQty: Number(line?.extraQty ?? 0),
      unitIds: line?.unitIds ?? [],
      damagedPhotos: line?.damagedPhotos ?? [],
      wrongItemPhotos: line?.wrongItemPhotos ?? [],
      extraEvidence: line?.extraEvidence ?? [],
      wrongItemReason: line?.wrongItemReason ?? line?.wrong_item_claim_type ?? null,
    };
  });
}

function inputDateTime(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function wireDateTime(value: string): string {
  return value ? new Date(value).toISOString() : "";
}

function missingProblem(lines: readonly EditableLine[], doNo: string, signedDoPath: string, goodsReceivedAt: string) {
  if (doNo.trim().length < 3) return receivingProblemCopy("supplier_do_missing");
  if (!signedDoPath) return receivingProblemCopy("signed_do_missing");
  if (!goodsReceivedAt) return receivingProblemCopy("goods_received_at_missing");
  for (const line of lines) {
    const physical = line.receivedQty + line.damagedQty + line.wrongItemQty + line.extraQty;
    if (line.unitIds.length < physical) return receivingProblemCopy("unit_id_missing", { item: line.sku });
    if (line.damagedQty > 0 && line.damagedPhotos.length === 0) return receivingProblemCopy("damage_evidence_missing");
    if (line.wrongItemQty > 0 && (line.wrongItemPhotos.length === 0 || !line.wrongItemReason)) return receivingProblemCopy("wrong_item_details_missing");
    if (line.extraQty > 0 && line.extraEvidence.length === 0) return receivingProblemCopy("extra_goods_found");
  }
  if (!lines.some((line) => line.receivedQty + line.damagedQty + line.wrongItemQty + line.extraQty > 0)) {
    return { fact: "Nothing has been counted", action: "Count at least one Unit before you finish receiving" };
  }
  return null;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid min-h-8 grid-cols-[160px_minmax(0,1fr)] items-center border-b border-kit-slate-5 text-body"><span className="text-kit-slate-9">{label}</span><span>{children}</span></div>;
}

export default function ReceivingSessionDetail({
  parent,
  session,
  events,
}: {
  parent: ReceivingRegisterParent;
  session: ReceivingSession;
  events: readonly ReceivingEvent[];
}) {
  const [doNo, setDoNo] = useState(session.do_number ?? "");
  const [signedDoPath, setSignedDoPath] = useState(session.do_file_path ?? "");
  const [goodsReceivedAt, setGoodsReceivedAt] = useState(inputDateTime(session.goods_received_timestamp ?? session.goods_received_at));
  const [note, setNote] = useState(session.note ?? "");
  const [lines, setLines] = useState(() => initialLines(parent, session));
  const [lockVersion, setLockVersion] = useState(session.lock_version ?? 1);
  const [dirty, setDirty] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const posted = session.status === "posted" || session.status === "amended" || session.status === "voided";
  const review = useWarehouseReceiptReviewMutation("check-in");
  const sendBack = useWarehouseReceiptReviewMutation("send-back");
  const save = useSaveReceivingSessionMutation(parent.id, session.id, {
    onSuccess: (result) => {
      setLockVersion(result.lock_version);
      setDirty(false);
    },
  });

  const payload = useMemo<ReceivingSessionInput>(() => ({
    sourceKind: parent.sourceKind,
    sourceId: parent.id,
    expectedVersion: parent.sourceVersion,
    supplierDoNo: doNo.trim(),
    signedDoPath,
    goodsReceivedAt: wireDateTime(goodsReceivedAt),
    note: note.trim() || null,
    lines,
  }), [parent, doNo, signedDoPath, goodsReceivedAt, note, lines]);
  const problem = missingProblem(lines, doNo, signedDoPath, goodsReceivedAt);

  useEffect(() => {
    if (!dirty || posted || save.isPending) return;
    const timer = window.setTimeout(() => {
      save.mutate({ expectedVersion: lockVersion, session: payload });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [dirty, posted, save, lockVersion, payload]);

  const changeLine = (id: string, patch: Partial<EditableLine>) => {
    setLines((current) => current.map((line) => line.poLineId === id ? { ...line, ...patch } : line));
    setDirty(true);
  };

  if (posted) {
    return (
      <div className="grid min-h-0 gap-3 min-[1130px]:grid-cols-2" data-testid="posted-receiving-layout">
        <section className="min-w-0 bg-white p-4">
          <h2 className="text-strong font-semibold">Receiving facts</h2>
          <Fact label="PO No."><span className="font-mono">{parent.sourceNumber}</span></Fact>
          <Fact label="Supplier">{parent.supplier}</Fact>
          <Fact label="Deliver To">{parent.deliverTo}</Fact>
          <Fact label="PO Issued">{parent.poIssuedAt ? fmtDateShort(parent.poIssuedAt) : "—"}</Fact>
          <Fact label="PO Delivery Date">{parent.poDeliveryDate ? fmtDateShort(parent.poDeliveryDate) : "—"}</Fact>
          <Fact label="Supplier Delivery Date">{parent.sameAsPo ? "Same as PO" : parent.supplierDeliveryDate ? fmtDateShort(parent.supplierDeliveryDate) : "—"}</Fact>
          <Fact label="Goods Received At">{session.goods_received_timestamp ? fmtDateShort(session.goods_received_timestamp) : "—"}</Fact>
        </section>
        <GrnPreview parent={parent} session={session} />
      </div>
    );
  }

  return (
    <div className="min-h-0 bg-white p-4" data-testid="receiving-session-detail">
      <div className="mb-3 flex min-h-10 flex-wrap items-center gap-2 border-b border-kit-slate-5 pb-3" data-testid="receiving-work-toolbar">
        {session.status === "submitted" ? (
          <>
            <button type="button" disabled={Boolean(problem) || review.isPending} onClick={() => review.mutate({ receiptId: session.id, expectedVersion: lockVersion })} className="h-8 rounded-control bg-kit-blue-9 px-3 text-meta font-semibold text-white disabled:opacity-40">Check in</button>
            <label className="text-body"><span className="mr-2 text-kit-slate-9">Return reason</span><input value={returnReason} onChange={(e) => setReturnReason(e.target.value)} className="h-8 rounded-control border border-kit-slate-5 px-2" /></label>
            <button type="button" disabled={!returnReason.trim() || sendBack.isPending} onClick={() => sendBack.mutate({ receiptId: session.id, expectedVersion: lockVersion, reason: returnReason.trim() })} className="h-8 rounded-control border border-kit-slate-6 px-3 text-meta disabled:opacity-40">Return count to warehouse</button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => save.mutate({ expectedVersion: lockVersion, session: payload })} disabled={save.isPending} className="h-8 rounded-control border border-kit-slate-6 px-3 text-meta font-medium">Save Receiving</button>
            <button type="button" onClick={() => review.mutate({ receiptId: session.id, expectedVersion: lockVersion })} disabled={Boolean(problem) || review.isPending} className="h-8 rounded-control bg-kit-blue-9 px-3 text-meta font-semibold text-white disabled:opacity-40">Check in</button>
          </>
        )}
      </div>
      <section className="grid gap-x-6 lg:grid-cols-2">
        <div>
          <Fact label="PO No."><span className="font-mono">{parent.sourceNumber}</span></Fact>
          <Fact label="Supplier">{parent.supplier}</Fact>
          <Fact label="Deliver To">{parent.deliverTo}</Fact>
          <Fact label="PO Issued">{parent.poIssuedAt ? fmtDateShort(parent.poIssuedAt) : "—"}</Fact>
        </div>
        <div>
          <Fact label="PO Delivery Date">{parent.poDeliveryDate ? fmtDateShort(parent.poDeliveryDate) : "—"}</Fact>
          <Fact label="Supplier Delivery Date">{parent.sameAsPo ? "Same as PO" : parent.supplierDeliveryDate ? fmtDateShort(parent.supplierDeliveryDate) : "—"}</Fact>
          <label className="grid min-h-8 grid-cols-[160px_minmax(0,1fr)] items-center border-b border-kit-slate-5 text-body"><span className="text-kit-slate-9">Goods Received At</span><input aria-label="Goods Received At" type="datetime-local" value={goodsReceivedAt} onChange={(e) => { setGoodsReceivedAt(e.target.value); setDirty(true); }} className="h-7 rounded-control border border-kit-slate-5 px-2" /></label>
          <label className="grid min-h-8 grid-cols-[160px_minmax(0,1fr)] items-center border-b border-kit-slate-5 text-body"><span className="text-kit-slate-9">Supplier DO No.</span><input aria-label="Supplier DO No." value={doNo} onChange={(e) => { setDoNo(e.target.value); setDirty(true); }} className="h-7 rounded-control border border-kit-slate-5 px-2 font-mono" /></label>
        </div>
      </section>

      <div className="mt-3"><DOFileUploadField poId={parent.id} doNumber={doNo} onUploaded={(path) => { setSignedDoPath(path); setDirty(true); }} /></div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-[1050px] w-full border-collapse text-body">
          <thead><tr className="border-y border-kit-slate-6 text-left text-label text-kit-slate-9"><th className="py-2">Item</th><th>Order Qty</th><th>Received Qty</th><th>Damaged Qty</th><th>Wrong Item Qty</th><th>Extra Qty</th><th>Pending Delivery Qty</th><th>Unit ID</th></tr></thead>
          <tbody>{lines.map((line) => {
            const source = parent.lines.find((item) => item.id === line.poLineId)!;
            const pending = Math.max(0, source.orderQty - source.receivedQty - line.receivedQty);
            return <tr key={line.poLineId} className="border-b border-kit-slate-5 [&>td]:py-2 [&>td]:pr-2">
              <td>{line.sku}</td><td>{source.orderQty}</td>
              {(["receivedQty", "damagedQty", "wrongItemQty", "extraQty"] as const).map((key) => <td key={key}><input type="number" min={0} aria-label={`${key === "receivedQty" ? "Received Qty" : key === "damagedQty" ? "Damaged Qty" : key === "wrongItemQty" ? "Wrong Item Qty" : "Extra Qty"} for ${line.sku}`} value={line[key]} onChange={(e) => changeLine(line.poLineId, { [key]: Math.max(0, Number(e.target.value) || 0) })} className="h-7 w-20 rounded-control border border-kit-slate-5 px-2 text-right" /></td>)}
              <td>{pending}</td>
              <td><textarea aria-label={`Unit ID for ${line.sku}`} value={line.unitIds.join("\n")} onChange={(e) => changeLine(line.poLineId, { unitIds: e.target.value.split(/[\n,]/).map((value) => value.trim()).filter(Boolean) })} className="min-h-14 w-44 rounded-control border border-kit-slate-5 px-2 py-1 font-mono" /></td>
            </tr>;
          })}</tbody>
        </table>
      </div>

      {lines.map((line) => line.damagedQty > 0 || line.wrongItemQty > 0 || line.extraQty > 0 ? (
        <div key={`evidence-${line.poLineId}`} className="mt-3 grid gap-2 border-t border-kit-slate-5 pt-3">
          {line.damagedQty > 0 ? <ClaimPhotoUploadField poId={parent.id} doNumber={doNo} paths={[...line.damagedPhotos]} onChange={(paths) => changeLine(line.poLineId, { damagedPhotos: paths })} label={`Damage evidence for ${line.sku}`} /> : null}
          {line.wrongItemQty > 0 ? <><input aria-label={`Wrong item details for ${line.sku}`} value={line.wrongItemReason ?? ""} onChange={(e) => changeLine(line.poLineId, { wrongItemReason: e.target.value || null })} className="h-7 rounded-control border border-kit-slate-5 px-2" /><ClaimPhotoUploadField poId={parent.id} doNumber={doNo} paths={[...line.wrongItemPhotos]} onChange={(paths) => changeLine(line.poLineId, { wrongItemPhotos: paths })} label={`Wrong item evidence for ${line.sku}`} /></> : null}
          {line.extraQty > 0 ? <ClaimPhotoUploadField poId={parent.id} doNumber={doNo} paths={[...line.extraEvidence]} onChange={(paths) => changeLine(line.poLineId, { extraEvidence: paths })} label={`Extra goods evidence for ${line.sku}`} /> : null}
        </div>
      ) : null)}

      <label className="mt-3 block text-body"><span className="text-kit-slate-9">Note</span><textarea value={note} onChange={(e) => { setNote(e.target.value); setDirty(true); }} className="mt-1 min-h-16 w-full rounded-control border border-kit-slate-5 px-2 py-1" /></label>

      {problem ? <div className="mt-3 border-l-2 border-kit-amber-9 pl-3 text-body"><p className="font-medium text-kit-slate-12">{problem.fact}</p><p className="text-kit-slate-9">{problem.action}</p></div> : null}
      {(save.error || review.error || sendBack.error) ? <p className="mt-3 text-body text-kit-red-11">{(save.error ?? review.error ?? sendBack.error)?.message}</p> : null}

      <section className="mt-5 border-t border-kit-slate-5 pt-3">
        <h3 className="text-label font-semibold uppercase tracking-wide text-kit-slate-9">History</h3>
        {events.length ? <ul className="mt-2 space-y-1 text-body">{events.map((event) => <li key={event.id}>{event.event_at.slice(0, 16)} · {event.event.replaceAll("_", " ")} · {event.actor_name ?? "System"}</li>)}</ul> : <p className="mt-2 text-body text-kit-slate-9">No Receiving history yet.</p>}
      </section>
    </div>
  );
}

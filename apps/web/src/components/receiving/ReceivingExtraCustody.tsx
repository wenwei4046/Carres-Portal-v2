import { useState } from "react";
import { receivingExtraCustodyEvidence, receivingExtraCustodyNote } from "@carres/shared";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import DocumentTable from "@/components/kit/DocumentTable";
import Modal from "@/components/kit/Modal";
import Textarea from "@/components/kit/Textarea";
import Button from "@/components/kit/Button";
import { DocSection } from "@/pages/operation/components/workspace-doc";

type NoteDraft = { text: string; key: string; state: "idle" | "saving" | "uncertain" };

/** Original physical observation; never an available-stock or purchasing decision. */
export default function ReceivingExtraCustody({ receiptId }: { receiptId: string }) {
  const query = useQuery({ queryKey: ["receiving-extra-custody", receiptId], retry: false,
    queryFn: async () => receivingExtraCustodyEvidence.parse(await apiFetch(`/api/operation/warehouse-receipts/${receiptId}/extra-custody`)) });
  const [selected, setSelected] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, NoteDraft>>({});
  const open = (id: string) => {
    setDrafts(previous => previous[id] ? previous : { ...previous, [id]: { text: "", key: crypto.randomUUID(), state: "idle" } });
    setSelected(id);
  };
  const save = async (id: string) => {
    const draft = drafts[id];
    if (!draft || !draft.text.trim() || draft.state === "saving") return;
    setDrafts(previous => ({ ...previous, [id]: { ...draft, state: "saving" } }));
    try {
      const saved = receivingExtraCustodyNote.parse(await apiFetch(
        `/api/operation/warehouse-receipts/${receiptId}/extra-custody/${id}/notes`,
        { method: "POST", body: JSON.stringify({ note: draft.text.trim(), key: draft.key }) }));
      if (saved.custody_id !== id || saved.request_key !== draft.key || saved.note !== draft.text.trim())
        throw new Error("Note confirmation does not match this request");
      setDrafts(previous => ({ ...previous, [id]: { text: "", key: crypto.randomUUID(), state: "idle" } }));
      await query.refetch();
    } catch {
      setDrafts(previous => ({ ...previous, [id]: { ...draft, state: "uncertain" } }));
    }
  };
  const current = selected ? query.data?.custody.find(row => row.id === selected) : null;
  const draft = selected ? drafts[selected] : undefined;
  if (query.isPending) return <DocSection title="Extra goods"><p>Loading…</p></DocSection>;
  if (query.isError) return <DocSection title="Extra goods"><p role="alert">Could not be loaded</p>
    <Button type="button" onClick={() => void query.refetch()}>Try again</Button></DocSection>;
  if (!query.data.custody.length) return null;
  return <DocSection title="Extra goods">
    <DocumentTable label="Extra goods" columns={[
      { key: "sku", label: "SKU" }, { key: "qty", label: "Extra Qty", numeric: true },
      { key: "site", label: "Goods arrived at" }, { key: "date", label: "Goods Received Date" },
      { key: "note", label: "Note" },
    ]} rows={query.data.custody.map(row => ({ key: row.id, onOpen: () => open(row.id), openLabel: `Open ${row.reported_sku}`, cells: {
      sku: row.reported_sku, qty: row.reported_qty,
      site: query.data.siteNames[row.actual_site_id] || "Not recorded",
      date: fmtDate(row.goods_received_at) || "Not recorded", note: row.reported_note || "Not recorded",
    } }))} />
    {current && draft && <Modal open title={`Extra goods · ${current.reported_sku}`} onOpenChange={open => { if (!open) setSelected(null); }}>
      <ul aria-label="History" className="space-y-3 mb-3">
        {query.data.notes.filter(note => note.custody_id === current.id).map(note => <li key={note.id}>
          <p className="text-meta text-kit-slate-11">{query.data.actorNames[note.actor_id] || "Not recorded"} · {fmtDate(note.recorded_at, { time: true })}</p>
          <p className="text-body whitespace-pre-wrap break-words">{note.note}</p>
        </li>)}
      </ul>
      <Textarea id={`custody-note-${current.id}`} label="Note" value={draft.text} maxLength={2000}
        disabled={draft.state !== "idle"} onChange={event => {
          const text = event.target.value;
          setDrafts(previous => ({ ...previous, [current.id]: { ...draft, text } }));
        }} />
      {draft.state === "uncertain" && <p role="alert">Not confirmed · Try again</p>}
      <Button type="button" disabled={!draft.text.trim() || draft.state === "saving"} onClick={() => void save(current.id)}>
        {draft.state === "uncertain" ? "Try again" : "Save"}
      </Button>
    </Modal>}
  </DocSection>;
}

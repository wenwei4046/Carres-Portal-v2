import { useCallback, useEffect, useState } from "react";
import { documentDisplayNumber, readPoSendEvidence } from "@carres/shared";
import { apiFetch } from "@/lib/api";
import EvidenceUploadField, { type EvidenceEntry } from "@/components/EvidenceUploadField";
import SavedEvidenceViewer from "@/components/kit/SavedEvidenceViewer";
import Button from "@/components/kit/Button";

type Document = { id: string; version: number };
const keyOf = (document: Document) => `${document.id}@${document.version}`;
export function usePoSendProof() {
  const [policy, setPolicy] = useState<{ required: boolean; available: boolean } | null>(null);
  const [failed, setFailed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [entries, setEntries] = useState<Record<string, EvidenceEntry[]>>({});
  useEffect(() => {
    let cancelled = false;
    setPolicy(null); setFailed(false);
    void apiFetch<{ required: boolean; available: boolean }>("/api/operation/pos/send-evidence-policy").then(value => {
      if (typeof value.required !== "boolean" || value.available !== true) throw new Error("policy_unavailable");
      if (!cancelled) setPolicy(value);
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [refresh]);
  const path = (document: Document) => entries[keyOf(document)]?.[0]?.path;
  return { policy, failed, retry: () => setRefresh(value => value + 1), entries, path,
    set: (document: Document, value: EvidenceEntry[]) => setEntries(previous => ({ ...previous, [keyOf(document)]: value })),
    ready: (channel: string, documents: readonly Document[]) => channel !== "whatsapp" || Boolean(policy?.available && (!policy.required || documents.every(document => !!path(document)))),
  };
}

function Screenshot({ document, entries, onChange, disabled }: { document: Document; entries: EvidenceEntry[]; onChange: (entries: EvidenceEntry[]) => void; disabled?: boolean }) {
  const sign = useCallback((file: File) => apiFetch<{ token: string; path: string }>("/api/storage/dos/sign-upload", {
    method: "POST", body: JSON.stringify({ po_id: document.id, po_version: document.version, do_number: `V${document.version}-send`, kind: "send", mime_type: file.type, size_bytes: file.size }),
  }), [document.id, document.version]);
  return <div className="flex flex-col gap-1">
    <span className="text-meta text-c-secondary">{documentDisplayNumber(`${document.id}-V${document.version}`)}</span>
    <EvidenceUploadField entries={entries} onChange={onChange} sign={sign} bucket="delivery-orders" imageMimes={["image/jpeg", "image/png"]} videoMimes={[]} imageMaxBytes={10485760} videoMaxBytes={10485760} maxFiles={1} ariaLabel="WhatsApp screenshot" disabled={disabled} />
  </div>;
}

export default function PoSendEvidence({ proof, documents, channel, disabled }: { proof: ReturnType<typeof usePoSendProof>; documents: readonly Document[]; channel: string; disabled?: boolean }) {
  if (channel !== "whatsapp" || !documents.length) return null;
  if (!proof.policy) return <div className="flex flex-col gap-1"><span className="text-meta text-c-secondary">{proof.failed ? "Evidence could not be loaded" : "Loading…"}</span>{proof.failed && <Button onClick={proof.retry}>Try again</Button>}</div>;
  return <div className="flex flex-col gap-2"><span className="text-meta text-c-secondary">WhatsApp screenshot</span>{documents.map(document => <Screenshot key={keyOf(document)} document={document} entries={proof.entries[keyOf(document)] ?? []} onChange={entries => proof.set(document, entries)} disabled={disabled} />)}</div>;
}

/** Reopen only a saved owning send's evidence, through the caller's authorised reader. */
export function PoSendEvidenceButton({ poId, note, context }: { poId: string; note?: string | null; context: string }) {
  const proof = readPoSendEvidence(note);
  const [url, setUrl] = useState<string | null>(null), [open, setOpen] = useState(false), [failed, setFailed] = useState(false);
  if (!proof) return null;
  const read = async () => {
    const result = await apiFetch<{ url: string }>(`/api/operation/pos/${encodeURIComponent(poId)}/send-evidence?path=${encodeURIComponent(proof.path)}`);
    setUrl(result.url); return result.url;
  };
  return <><Button size="sm" onClick={() => { setFailed(false); void read().then(() => setOpen(true)).catch(() => setFailed(true)); }}>WhatsApp screenshot</Button>
    {failed && <span className="text-meta text-kit-red-11">Evidence could not be loaded</span>}
    <SavedEvidenceViewer files={[{ id: proof.path, kind: "photo", url, context }]} activeId={open ? proof.path : null} onClose={() => setOpen(false)} onRetry={read} />
  </>;
}

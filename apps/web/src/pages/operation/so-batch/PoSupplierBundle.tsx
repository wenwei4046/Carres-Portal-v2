import { useEffect, useMemo, useState } from "react";
import Button from "@/components/kit/Button";
import Checkbox from "@/components/kit/Checkbox";
import Select from "@/components/kit/Select";
import Input from "@/components/kit/Input";
import Textarea from "@/components/kit/Textarea";
import { apiFetch } from "@/lib/api";
import { renderPoPdf } from "@/lib/pdf/render";
import type { PoTemplateData } from "@/lib/pdf/types";
import { preparePoBundle, poBundleDocumentList, zipPoBundle } from "@/lib/purchasing/po-bundle";
import { Block } from "../SalesOrderWorkspace";
import { doorsForIssuedPo, type IssuedPo } from "../components/PoIssueEvidence";

/** Same issued POs, grouped for supplier preparation. No issue or send write occurs here. */
export default function PoSupplierBundle({ pos, onPreview }: {
  pos: readonly IssuedPo[];
  onPreview: (id: string) => void;
}) {
  const groups = useMemo(() => [...new Map(pos.map(po => [po.supplierId, po.supplierName ?? "Supplier"])).entries()], [pos]);
  const [supplier, setSupplier] = useState(pos[0]?.supplierId ?? "");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(pos.filter(po => po.supplierId === supplier).map(po => po.id)));
  const [documents, setDocuments] = useState<Record<string, PoTemplateData>>({});
  const [channel, setChannel] = useState(pos[0]?.poSendChannel === "email" ? "email" : "whatsapp");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const supplierPos = pos.filter(po => po.supplierId === supplier);
  const picked = supplierPos.filter(po => selected.has(po.id));
  const contact = supplierPos[0];
  const message = picked.filter(po => documents[po.id]).map(po => `${documents[po.id].po_number} · V${documents[po.id].version}`).join("\n");
  const doors = contact ? doorsForIssuedPo(contact, message) : null;
  const ready = picked.length > 0 && picked.every(po => documents[po.id]) && !busy;

  useEffect(() => {
    let cancelled = false;
    setDocuments({});
    setError(null);
    Promise.all(pos.map(async po => [po.id, await apiFetch<PoTemplateData>(`/api/operation/pos/${encodeURIComponent(po.id)}/print-data`)] as const))
      .then(rows => { if (!cancelled) setDocuments(Object.fromEntries(rows)); })
      .catch(() => { if (!cancelled) setError("Could not load the preview. Try again on the document."); });
    return () => { cancelled = true; };
  }, [pos]);

  function changeSupplier(id: string) {
    setSupplier(id);
    setSelected(new Set(pos.filter(po => po.supplierId === id).map(po => po.id)));
    setChannel(pos.find(po => po.supplierId === id)?.poSendChannel === "email" ? "email" : "whatsapp");
    setCopied(false);
    setError(null);
  }

  async function download() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    let url: string | undefined;
    try {
      const prepared = await preparePoBundle(supplier, picked.map(po => ({ id: po.id, supplierId: po.supplierId, version: documents[po.id].version })),
        id => apiFetch<PoTemplateData>(`/api/operation/pos/${encodeURIComponent(id)}/print-data`), renderPoPdf);
      // Message and archive must describe the same set/version; no stale download succeeds.
      if (poBundleDocumentList(prepared) !== message) throw new Error("Purchase order changed");
      url = URL.createObjectURL(await zipPoBundle(prepared));
      const link = document.createElement("a");
      link.href = url;
      link.download = `Purchase-orders-${supplier}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (failure) {
      setError(failure instanceof Error && (failure.message === "stale_po_version" || failure.message === "Purchase order changed")
        ? "Purchase order changed. Open the latest PDF and send it again."
        : "Could not load the preview. Try again on the document.");
    } finally {
      if (url) URL.revokeObjectURL(url);
      setBusy(false);
    }
  }

  return <Block title="Purchase orders">
    <div className="flex flex-col gap-3" data-testid="po-supplier-bundle">
      <Select id="po-bundle-supplier" label="Supplier" value={supplier} onValueChange={changeSupplier}
        disabled={busy} options={groups.map(([value, label]) => ({ value, label }))} />
      <Checkbox id="po-bundle-all" label="Select all" disabled={busy} checked={picked.length === supplierPos.length ? true : picked.length ? "indeterminate" : false}
        onCheckedChange={checked => { setSelected(new Set(checked ? supplierPos.map(po => po.id) : [])); setCopied(false); }} />
      {supplierPos.map(po => <div key={po.id} className="flex items-center justify-between gap-2">
        <Checkbox id={`po-bundle-${po.id}`} label={documents[po.id] ? `${documents[po.id].po_number} · V${documents[po.id].version}` : po.id}
          disabled={busy} checked={selected.has(po.id)} onCheckedChange={checked => {
            setSelected(previous => { const next = new Set(previous); if (checked) next.add(po.id); else next.delete(po.id); return next; }); setCopied(false);
          }} />
        <Button variant="neutral" size="sm" onClick={() => onPreview(po.id)}>Open</Button>
      </div>)}
      <Select id="po-bundle-channel" label="Communication channel" value={channel} onValueChange={setChannel}
        options={[{ value: "whatsapp", label: "WhatsApp" }, { value: "email", label: "Email" }]} />
      <Input id="po-bundle-recipient" label="To" readOnly value={channel === "email" ? contact?.contactEmail ?? "" : contact?.whatsappGroupUrl ?? contact?.contact ?? ""} />
      <Textarea id="po-bundle-message" label="Message" value={message} readOnly />
      <div className="flex flex-wrap gap-2">
        <Button variant="neutral" size="sm" disabled={!ready} loading={busy} onClick={() => void download()}>Download PDFs</Button>
        <Button variant="neutral" size="sm" disabled={!ready} onClick={() => {
          void navigator.clipboard.writeText(message).then(() => setCopied(true)).catch(() => setError("Select the message and copy it."));
        }}>Copy message</Button>
        {channel === "whatsapp" ? <Button variant="neutral" size="sm" disabled={!ready || !doors?.whatsapp}
          onClick={() => { if (doors?.whatsapp) window.open(doors.whatsapp.url, "_blank", "noopener,noreferrer"); }}>Open WhatsApp</Button>
          : <Button variant="neutral" size="sm" disabled title="Not available">Send Email</Button>}
      </div>
      {copied && <p className="text-meta text-kit-slate-11">Copied. Contact result is unchanged.</p>}
      {error && <p role="alert" className="text-meta text-kit-red-11">{error}</p>}
    </div>
  </Block>;
}

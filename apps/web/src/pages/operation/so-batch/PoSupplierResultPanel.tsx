import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Drawer from "@/components/kit/Drawer";
import Modal from "@/components/kit/Modal";
import Block from "@/components/kit/Block";
import Button from "@/components/kit/Button";
import PdfPreview from "@/components/kit/PdfPreview";
import { apiFetch } from "@/lib/api";
import { renderPoPdf } from "@/lib/pdf/render";
import type { PoTemplateData } from "@/lib/pdf/types";
import PoIssueEvidence, { type IssuedPo, type PoSendEvidence } from "../components/PoIssueEvidence";
import PoSupplierBundle from "./PoSupplierBundle";

/** Issued result scope, beside the retained register. Each PO keeps its own document/evidence. */
export default function PoSupplierResultPanel({ open, onOpenChange, pos, roundWindow, onChanged }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pos: readonly IssuedPo[];
  roundWindow?: string;
  onChanged: () => void;
}) {
  const navigate = useNavigate();
  const [current, setCurrent] = useState<IssuedPo | null>(null);
  const [document, setDocument] = useState<PoTemplateData | null>(null);
  const [evidence, setEvidence] = useState<PoSendEvidence[]>([]);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfReady, setPdfReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!current || !open) return;
    let cancelled = false;
    let url: string | undefined;
    setDocument(null); setEvidence([]); setPdfUrl(null); setPdfReady(false); setError(null);
    void Promise.all([
      apiFetch<PoTemplateData>(`/api/operation/pos/${encodeURIComponent(current.id)}/print-data`),
      apiFetch<{ sends: PoSendEvidence[] }>(`/api/operation/pos/${encodeURIComponent(current.id)}/sends`),
    ]).then(async ([data, sends]) => {
      if (data.draft || data.po_id !== current.id || !Number.isInteger(data.version) || data.version < 1) throw new Error("invalid_po_document");
      const pdf = await renderPoPdf(data);
      if (cancelled) return;
      url = URL.createObjectURL(pdf);
      setDocument(data); setEvidence(sends.sends); setPdfUrl(url);
    }).catch(() => { if (!cancelled) setError("Could not load the preview. Try again on the document."); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [current, open, refresh]);
  function changed() { setRefresh(previous => previous + 1); onChanged(); }
  return <>
    <Drawer open={open} onOpenChange={onOpenChange} title="Purchase Orders">
      <div className="flex flex-col gap-3" data-testid="po-supplier-result-panel">
        <PoSupplierBundle pos={pos} roundWindow={roundWindow} onEvidenceChanged={changed}
          onOpenObject={id => { onOpenChange(false); navigate(`/operation/procurement?po=${encodeURIComponent(id)}`); }} onPreview={(_id, po) => { setCurrent(po); setPdfOpen(true); }} />
        {current && <Block title={document?.po_number ?? current.id} note={document ? `V${document.version}` : undefined}>
          {document && <><p className="text-body">{document.supplier.name} · {document.destination.name}</p>
            {document.so_refs?.length ? <p className="text-body">SO {document.so_refs.join(", ")}</p> : null}
          </>}
          <Button disabled={!pdfUrl} onClick={() => setPdfOpen(true)}>Open PDF</Button>
          {document && <PoIssueEvidence key={`${current.id}-${document.version}`} po={current} version={document.version}
            evidence={evidence} onConfirmed={changed} hidePreparationTools mayConfirm={pdfReady} recordedRecipient />}
          {error && <p role="alert" className="text-meta text-kit-red-11">{error}</p>}
        </Block>}
      </div>
    </Drawer>
    <Modal open={open && pdfOpen} onOpenChange={setPdfOpen} title={document?.po_number ?? current?.id ?? "Purchase Orders"} width="viewer">
      {pdfUrl ? <PdfPreview src={pdfUrl} title={document?.po_number ?? current?.id ?? "Purchase Orders"} onReady={setPdfReady} />
        : <p className="text-body">{error ?? "Loading PDF…"}</p>}
    </Modal>
  </>;
}

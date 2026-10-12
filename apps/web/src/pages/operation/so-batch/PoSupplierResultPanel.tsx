import { useEffect, useState } from "react";
import { documentDisplayNumber } from "@carres/shared";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useNavigate, useLocation } from "react-router-dom";
import Drawer from "@/components/kit/Drawer";
import Modal from "@/components/kit/Modal";
import PdfPreview from "@/components/kit/PdfPreview";
import { apiFetch } from "@/lib/api";
import { renderPoPdf } from "@/lib/pdf/render";
import type { PoTemplateData } from "@/lib/pdf/types";
import type { IssuedPo } from "../components/PoIssueEvidence";
import PoSupplierBundle, { type PoSupplierPreparation } from "./PoSupplierBundle";

/** Recover exact Register lineage after a reload. One failed or mismatched
 * source refuses the entire preparation; it cannot masquerade as no POs. */
export function useVisiblePoResults(onLoaded: (pos: IssuedPo[]) => void, onOpening: () => void) {
  const result = useMutation<IssuedPo[], Error, readonly string[]>({
    onMutate: onOpening,
    mutationFn: async (poIds: readonly string[]) => Promise.all([...new Set(poIds)].map(async id => {
      const po = await apiFetch<IssuedPo>(`/api/operation/pos/${encodeURIComponent(id)}/issue-context`);
      if (po.id !== id || !po.supplierId) throw new Error("invalid_po_context");
      return po;
    })),
    onSuccess: onLoaded,
    onError: (_error, poIds) => toast.error("Supplier details could not be loaded.", {
      action: { label: "Try again", onClick: () => result.mutate(poIds) },
    }),
  });
  return result;
}

/** Issued result scope, beside the retained register. Each PO keeps its own document/evidence. */
export default function PoSupplierResultPanel({ open, onOpenChange, pos, roundWindow, onChanged, initialPreparation }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pos: readonly IssuedPo[];
  roundWindow?: string;
  onChanged: () => void;
  initialPreparation?: PoSupplierPreparation;
}) {
  return <Drawer open={open} onOpenChange={onOpenChange} title="Purchase Orders">
    <PoSupplierResultContent open={open} onClose={() => onOpenChange(false)} pos={pos} roundWindow={roundWindow}
      onChanged={onChanged} initialPreparation={initialPreparation} />
  </Drawer>;
}

/**
 * The supplier send area: `PoSupplierBundle` (its three steps hold the one
 * `PO sent to supplier` act) and the chosen PO's PDF, without a container, so
 * the round panel can hold the very same controls (§5.6.1 "one send area").
 * A PDF opened here counts as held for the first step, at the version shown.
 */
export function PoSupplierResultContent({ open, onClose, pos, roundWindow, onChanged, initialPreparation, title }: {
  open: boolean;
  onClose: () => void;
  pos: readonly IssuedPo[];
  roundWindow?: string;
  onChanged: () => void;
  initialPreparation?: PoSupplierPreparation;
  title?: string;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [current, setCurrent] = useState<IssuedPo | null>(null);
  const [document, setDocument] = useState<PoTemplateData | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [reviewed, setReviewed] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!current || !open) return;
    let cancelled = false;
    let url: string | undefined;
    setDocument(null); setPdfUrl(null); setError(null);
    void apiFetch<PoTemplateData>(`/api/operation/pos/${encodeURIComponent(current.id)}/print-data`).then(async (data) => {
      if (data.draft || data.po_id !== current.id || !Number.isInteger(data.version) || data.version < 1) throw new Error("invalid_po_document");
      const pdf = await renderPoPdf(data);
      if (cancelled) return;
      url = URL.createObjectURL(pdf);
      setDocument(data); setPdfUrl(url);
    }).catch(() => { if (!cancelled) setError("Could not load the preview. Try again on the document."); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [current, open]);
  return <>
    <div className="flex flex-col gap-3" data-testid="po-supplier-result-panel">
      <PoSupplierBundle pos={pos} roundWindow={roundWindow} onEvidenceChanged={onChanged} initialPreparation={initialPreparation} title={title} reviewed={reviewed}
        onOpenSettings={() => { onClose(); navigate("/operation/settings/purchasing"); }}
        onOpenObject={(id, preparation, sourcePos) => { onClose(); navigate(`/operation/procurement?po=${encodeURIComponent(id)}`, { state: { soBatchReturn: { path: `${location.pathname}${location.search}`, pos: sourcePos, preparation } } }); }} onPreview={(_id, po) => { setCurrent(po); setPdfOpen(true); }} />
      {current && error && <div role="alert" className="text-meta text-kit-red-11">{error}</div>}
    </div>
    <Modal open={open && pdfOpen} onOpenChange={setPdfOpen} title={document ? documentDisplayNumber(`${document.po_number}-V${document.version}`) : current ? documentDisplayNumber(current.id) : "Purchase Orders"} width="viewer">
      {pdfUrl ? <PdfPreview src={pdfUrl} title={document?.po_number ?? current?.id ?? "Purchase Orders"}
        onReady={ready => { if (ready && current && document) setReviewed(previous => ({ ...previous, [current.id]: document.version })); }} />
        : <div className="text-body">{error ?? "Loading PDF…"}</div>}
    </Modal>
  </>;
}

/** Source-owned saved SO document; no compact-card data or draft is rendered. */
import { useEffect, useState } from "react";
import Button from "@/components/kit/Button";
import PdfPreview from "@/components/kit/PdfPreview";
import { apiFetch } from "@/lib/api";
import { renderSalesOrderPdf } from "@/lib/pdf/render";
import type { SalesOrderTemplateData } from "@/lib/pdf/types";

type State = { status: "loading" | "error" } | { status: "ready"; url: string };

/** Mount only after an authorised document entry is opened. Current saved version only. */
export default function SalesOrderCardDocument(props: { orderId: string; reference: string }) {
  return <SavedDocument key={props.orderId} {...props} />;
}

function SavedDocument({ orderId, reference }: { orderId: string; reference: string }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    let disposed = false;
    let url: string | undefined;
    const controller = new AbortController();
    setState({ status: "loading" });
    void (async () => {
      try {
        const data = await apiFetch<SalesOrderTemplateData>(`/api/orders/${encodeURIComponent(orderId)}/sales-order-data`, { signal: controller.signal });
        if (disposed) return;
        const blob = await renderSalesOrderPdf(data);
        if (disposed) return;
        url = URL.createObjectURL(blob);
        setState({ status: "ready", url });
      } catch {
        if (!disposed) setState({ status: "error" });
      }
    })();
    return () => { disposed = true; controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [orderId, attempt]);

  // Preview and download share the same saved-version Blob URL.
  if (state.status !== "ready") return <div role="status" aria-busy={state.status === "loading"}>
    {state.status === "loading" ? "Rendering preview…" : <>
      <span>Could not load the preview.</span>
      <Button onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
    </>}
  </div>;
  return <>
    <Button icon="download" onClick={() => {
      const link = document.createElement("a");
      link.href = state.url;
      link.download = `${reference.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
      link.click();
    }}>Download PDF</Button>
    <PdfPreview src={state.url} title={`Sales Order ${reference}`} />
  </>;
}

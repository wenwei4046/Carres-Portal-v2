import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { usePickupEventPrint } from "@/lib/queries";
import { renderPickupEventPdf } from "@/lib/pdf/render";

/**
 * Task 13 (2026-05-15) — pickup-event DO reprint landing page.
 *
 * Opened via `window.open("/print/pickup-event/:eventId")` from the
 * Pickup history section in supplier / partner / operation PO drawers.
 * Hits `/api/pickup-events/:id/print` which RLS-scopes per role via the
 * `pickup_event_render_payload` RPC (0107), renders the PDF in-browser via
 * @react-pdf/renderer (Workers WASM ban — commit `fa47433`), and replaces
 * the current tab URL with the blob URL so the browser opens its native
 * PDF viewer.
 *
 * Print page lives outside the role-app `Routes` so all four roles share
 * one URL pattern. RequireAuth at the App.tsx mount keeps it gated.
 */
export default function PickupEventPrintPage() {
  const { eventId } = useParams();
  const q = usePickupEventPrint(eventId ?? null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!q.data) return;
    let cancelled = false;
    (async () => {
      try {
        const blob = await renderPickupEventPdf(q.data!);
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        window.location.replace(url);
      } catch (e) {
        if (cancelled) return;
        setRenderError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
      // Best-effort cleanup. window.location.replace navigates away so this
      // usually doesn't fire, but if the user hits Back before then we don't
      // want to leak the blob URL.
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [q.data]);

  if (q.isPending) {
    return <div className="p-8 text-sm text-muted-foreground">Loading DO…</div>;
  }
  if (q.error) {
    return (
      <div className="p-8 text-sm text-destructive">
        Failed to load DO: {(q.error as Error).message}
      </div>
    );
  }
  if (renderError) {
    return (
      <div className="p-8 text-sm text-destructive">
        PDF render failed: {renderError}
      </div>
    );
  }
  return (
    <div className="p-8 text-sm text-muted-foreground">Rendering PDF…</div>
  );
}

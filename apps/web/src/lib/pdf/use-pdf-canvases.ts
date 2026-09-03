import { useCallback, useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";

/* pdf.js worker ships inside the package — nothing fetched from a CDN. */
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

/**
 * PAINT A PDF AS PAPER (the SalesOrderWorkspace pattern, lifted out so a second
 * document page does not grow a second painter).
 *
 * The Purchase Order page used to show its official document through an
 * `<iframe>` of a blob URL: the browser's own PDF viewer, with its own grey
 * chrome, its own toolbar and its own scrollbar, boxed inside a bordered
 * section with a caption strip — a window inside a window, next to a Sales
 * Order whose document is plain sheets of paper on the canvas. This hook paints
 * each page to a `<canvas>` sized to the pane, so the document reads as paper
 * on BOTH pages and scrolls with the pane it sits in.
 *
 * `key` names the document (a PO id, an order id); the painter re-runs when it
 * changes, when the pane re-mounts (the object's tabs unmount it), or when the
 * caller asks for a retry. `render` is read through a ref, so callers need not
 * memoise it.
 */
export function usePdfCanvases(key: string | null, render: () => Promise<Blob>) {
  const [pdfError, setPdfError] = useState<string | null>(null);
  const paneRef = useRef<HTMLDivElement | null>(null);
  const renderRef = useRef(render);
  renderRef.current = render;
  /* The pane unmounts whenever the object opens another view. Coming back, the
     key has not changed — so without this the operator returned to an empty
     sheet of paper. */
  const [paneEpoch, setPaneEpoch] = useState(0);
  const setPane = useCallback((node: HTMLDivElement | null) => {
    paneRef.current = node;
    if (node) setPaneEpoch((n) => n + 1);
  }, []);
  const retry = useCallback(() => setPaneEpoch((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    if (key == null) {
      paneRef.current?.replaceChildren();
      return;
    }
    (async () => {
      try {
        const blob = await renderRef.current();
        if (cancelled) return;
        setPdfError(null);
        const doc = await pdfjs.getDocument({ data: await blob.arrayBuffer() }).promise;
        if (cancelled) return;
        const pane = paneRef.current;
        if (!pane) return;
        pane.replaceChildren();
        const paneWidth = Math.max(pane.clientWidth, 320);
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const scale = paneWidth / base.width;
          const dpr = window.devicePixelRatio || 1;
          const viewport = page.getViewport({ scale: scale * dpr });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = `${Math.round(viewport.width / dpr)}px`;
          canvas.style.height = `${Math.round(viewport.height / dpr)}px`;
          canvas.style.display = "block";
          canvas.style.margin = "0 auto 16px";
          canvas.style.boxShadow = "0 1px 4px rgba(0,0,0,0.18)";
          /* A PDF page is paper — white by definition; this canvas is
             imperative pdf.js output, not themed React markup. */
          canvas.style.background = "white";
          canvas.setAttribute("data-testid", `pdf-page-${n}`);
          pane.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
        }
      } catch (e) {
        if (!cancelled) setPdfError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, paneEpoch]);

  return { pdfError, setPane, retry };
}

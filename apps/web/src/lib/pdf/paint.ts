import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

/** Paint actual document bytes. The caller owns scrolling and cancellation. */
export async function paintPdfPages(
  doc: PDFDocumentProxy,
  pane: HTMLDivElement,
  width: number,
  cancelled: () => boolean,
  onTask?: (task: RenderTask) => void,
) {
  pane.replaceChildren();
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    if (cancelled()) return;
    const base = page.getViewport({ scale: 1 });
    const dpr = window.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale: width / base.width * dpr });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    canvas.style.width = `${Math.round(viewport.width / dpr)}px`;
    canvas.style.height = `${Math.round(viewport.height / dpr)}px`;
    canvas.style.display = "block";
    canvas.style.margin = "0 auto 16px";
    canvas.style.boxShadow = "0 1px 4px rgba(0,0,0,0.18)";
    // PDF paper is white; never squash an enlarged page with max-width.
    canvas.style.background = "white";
    canvas.setAttribute("data-testid", `pdf-page-${n}`);
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", `Page ${n} of ${doc.numPages}`);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Document preview is unavailable.");
    pane.appendChild(canvas);
    const task = page.render({ canvasContext: context, viewport });
    onTask?.(task);
    await task.promise;
    if (cancelled()) return;
  }
}

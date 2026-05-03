/**
 * PDF render entrypoints (M4 Task 4).
 *
 * Used by the /print-do (Task 5) and /print (Task 6) endpoints to turn the
 * `DoTemplateData` / `PoTemplateData` contracts into Uint8Array PDF bodies
 * suitable for `c.body(bytes, 200, { 'Content-Type': 'application/pdf' })`.
 *
 * Workers vs Node — important nuance:
 * - `@react-pdf/renderer` ships two builds via the `browser` package field:
 *   `lib/react-pdf.js` (Node, exports a working `renderToBuffer`) and
 *   `lib/react-pdf.browser.js` (browser-ish — `renderToBuffer` is stubbed
 *   to throw "Node specific API").
 * - Wrangler/esbuild bundles for Cloudflare Workers as a browser-like target,
 *   so the **browser build** is what actually runs in production.
 * - The browser build exposes `pdf(element).toBlob()`, which uses generic
 *   `Uint8Array` chunking + `Blob` (both available in Workers).
 *
 * Therefore: render via `pdf(element).toBlob()` then `arrayBuffer()` on both
 * Workers and vitest (vitest runs in node but resolves browser field to keep
 * dev/prod identical).
 */

import { pdf } from "@react-pdf/renderer";
import { DoTemplate } from "./do-template";
import { PoTemplate } from "./po-template";
import { registerNotoSansSC } from "./fonts/noto";
import type { DoTemplateData, PoTemplateData } from "./types";

async function renderElementToBytes(element: ReturnType<typeof DoTemplate> | ReturnType<typeof PoTemplate>): Promise<Uint8Array> {
  registerNotoSansSC();
  const blob = await pdf(element).toBlob();
  const buffer = await blob.arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Render a Delivery Order to a PDF byte array.
 *
 * Throws if the @react-pdf renderer fails (template error, font fetch
 * failure, etc.) — callers should let it bubble; the Hono route maps
 * to a 500 via the standard error handler.
 */
export async function renderDoPdf(data: DoTemplateData): Promise<Uint8Array> {
  return renderElementToBytes(DoTemplate(data));
}

/**
 * Render a Purchase Order to a PDF byte array. See `renderDoPdf` for the
 * Workers vs Node implementation note and error semantics.
 */
export async function renderPoPdf(data: PoTemplateData): Promise<Uint8Array> {
  return renderElementToBytes(PoTemplate(data));
}

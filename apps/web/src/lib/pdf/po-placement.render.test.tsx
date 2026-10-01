// @vitest-environment node
/** Opt-in render of the real documents produced by po-placement-lifecycle.integration. */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { PoTemplateData } from "./types";
const dir = process.env.PO_PLACEMENT_ARTIFACTS;
describe.skipIf(!dir)("PO placement document rendering", () => {
  it("renders both source lanes through the shipped price-free template", async () => {
    const { Font, pdf } = await import("@react-pdf/renderer");
    Font.register({ family: "Noto Sans SC", fonts: [400, 500, 600, 700].map(weight => ({
      src: path.join(process.env.NOTO_DIR!, `noto${weight}.ttf`), fontWeight: weight,
    })) });
    Font.registerHyphenationCallback(word => [word]);
    (globalThis as Record<string, unknown>).__CARRES_LOGO_SRC__ = path.resolve(__dirname, "../../../public/carres-logo.png");
    const { PoTemplate } = await import("./po-template");
    const files = readdirSync(dir!).filter(name => name.endsWith(".json"));
    expect(files.length).toBeGreaterThanOrEqual(2);
    for (const name of files) {
      const data = JSON.parse(readFileSync(path.join(dir!, name), "utf8")) as PoTemplateData;
      const stream = await pdf(PoTemplate(data)).toBuffer();
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        stream.on("data", chunk => chunks.push(chunk));
        stream.on("end", resolve); stream.on("error", reject);
      });
      const bytes = Buffer.concat(chunks);
      expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
      writeFileSync(path.join(dir!, name.replace(/\.json$/, ".pdf")), bytes);
    }
  }, 30000);
});

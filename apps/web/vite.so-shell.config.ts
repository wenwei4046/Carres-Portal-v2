import { defineConfig, mergeConfig, type Plugin } from "vite";
import path from "node:path";
import base from "./vite.config";

/* DEV ONLY: OperationApp's `./SalesOrderWorkspace` import resolves to the amendment page, so the
   REAL shell renders the proposal. Every other importer still gets the real module. */
const swapWorkspace: Plugin = {
  name: "so-amendment-swap",
  enforce: "pre",
  resolveId(source, importer) {
    if (source === "./SalesOrderWorkspace" && importer?.endsWith(path.join("pages", "operation", "OperationApp.tsx")))
      return path.resolve(__dirname, "src/dev/so-amendment-page.tsx");
    return null;
  },
};

export default mergeConfig(base, defineConfig({
  base: "./",
  /* Fonts, logo and wordmark only — kept outside the repo (scratch), never the app's public folder. */
  publicDir: path.resolve(__dirname, "../../../artifact-public"),
  plugins: [swapWorkspace],
  /* Every PDF font comes from the files beside the page — the preview fetches nothing from a CDN. */
  resolve: { alias: [{ find: /^(\.\/fonts\/noto|@\/lib\/pdf\/fonts\/noto)$/, replacement: path.resolve(__dirname, "src/dev/noto-local.ts") }] },
  build: { outDir: "../../../artifact-shell", emptyOutDir: true, rollupOptions: { input: path.resolve(__dirname, "so-amendment-shell-preview.html") } },
}));

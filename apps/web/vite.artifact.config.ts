import { defineConfig, mergeConfig } from "vite";
import path from "node:path";
import base from "./vite.config";
export default mergeConfig(base, defineConfig({
  base: "./",
  publicDir: false,
  resolve: { alias: [{ find: /^\.\/fonts\/noto$/, replacement: path.resolve(__dirname, "src/dev/noto-local.ts") }] },
  build: { outDir: "../../../artifact-build", emptyOutDir: true, rollupOptions: { input: path.resolve(__dirname, "so-page-proposal-preview.html") } },
}));

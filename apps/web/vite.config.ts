import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    // Honour a harness-assigned port (Claude Code preview autoPort) so
    // parallel chats never fight over one port; default stays 5173.
    port: Number(process.env.PORT) || 5173,
    open: false,
  },
});

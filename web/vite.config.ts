import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
      "/artifact-runtime": "http://localhost:3001",
    },
  },
  // copyPublicDir=false: the server serves web/public directly, so bundling
  // the 23MB of manual imagery into dist would ship every image twice.
  build: { outDir: path.join(here, "dist"), emptyOutDir: true, copyPublicDir: false },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Anna serves the bundle inside an iframe path, so assets must be relative.
  base: "./",
  build: {
    outDir: "bundle",
  },
});

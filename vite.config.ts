import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // GitHub Pages serves the app from /<repo>/; the name is case-sensitive.
  base: "/Runs/",
  plugins: [react()],
});

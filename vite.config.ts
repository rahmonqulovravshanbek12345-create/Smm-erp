import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Natija — bitta mustaqil dist/index.html fayl: mijozga yuborish yoki GitHub Pages'ga joylash mumkin.
export default defineConfig({
  base: "./",
  plugins: [react(), viteSingleFile()],
});

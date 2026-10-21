/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  // GitHub Pages serves the site at /d200-configure/
  base: "/d200-configure/",
  plugins: [svelte()],
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"],
  },
});

import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const page = (name) => fileURLToPath(new URL(name, import.meta.url));

export default defineConfig({
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
  test: {
    // Unit and backend tests are *.test.js; the browser suite is *.spec.js and
    // belongs to Playwright, which needs a running server Vitest cannot give it.
    include: ["tests/**/*.test.js"],
  },
  build: {
    rollupOptions: {
      // The teacher tools are their own page, so nothing in them ships to a
      // student playing the game.
      input: {
        main: page("index.html"),
        admin: page("admin.html"),
      },
    },
  },
});

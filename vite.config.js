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

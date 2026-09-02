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
      output: {
        /**
         * Three.js gets its own file.
         *
         * It is four fifths of the bundle and it changes when we upgrade it,
         * which is roughly never — while the game code beside it changes
         * several times a week. Bundled together, every patch made every
         * student redownload 380kB of renderer they already had. Split, a
         * patch is the game code alone and the renderer comes from cache.
         *
         * Not lazily imported: it is needed to draw the first frame, so
         * deferring it would only move the wait to somewhere more visible.
         */
        manualChunks: (id) => (id.includes("node_modules/three") ? "three" : undefined),
      },
    },
    // Just above the three.js chunk, which is the size it is and is not a
    // warning anybody can act on — and a build that warns every single time is
    // a build nobody reads. Our own code is 45kB, an order of magnitude under,
    // so anything of ours crossing this is a genuine surprise.
    chunkSizeWarningLimit: 500,
  },
});

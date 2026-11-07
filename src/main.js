import { inject } from '@vercel/analytics';
import { setChristmasPreview } from "./christmas.js";
import { Game } from "./game.js";
import "./style.css";

// Initialize Vercel Analytics
inject();

// `npm run dev` + `?christmas`. Compiled out of a production build.
if (import.meta.env.DEV && new URLSearchParams(location.search).has("christmas")) {
  setChristmasPreview(true);
}

const app = document.getElementById("app");
window.addEventListener("contextmenu", (e) => e.preventDefault());
const game = new Game(app);
window.__metroDash = game;
game.start();

/**
 * Lift the loading screen once the title is really ready: the first frame drawn,
 * the fonts in, and for a signed-in browser its save brought down. A guest does
 * not wait on the server at all, and nobody waits longer than BOOT_WAIT_MS.
 */
const BOOT_WAIT_MS = 3000;
const boot = document.getElementById("boot");
const painted = new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
Promise.race([
  painted.then(() => Promise.all([document.fonts?.ready, game.cloud.signedIn && game.cloudReady])),
  new Promise((resolve) => setTimeout(resolve, BOOT_WAIT_MS)),
])
  .catch(() => {})
  .finally(() => {
    boot?.classList.add("gone");
    setTimeout(() => boot?.remove(), 400);
  });

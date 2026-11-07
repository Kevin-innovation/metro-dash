import { setChristmasPreview } from "./christmas.js";
import { Game } from "./game.js";
import "./style.css";

// `npm run dev` + `?christmas`. Compiled out of a production build.
if (import.meta.env.DEV && new URLSearchParams(location.search).has("christmas")) {
  setChristmasPreview(true);
}

const app = document.getElementById("app");
window.addEventListener("contextmenu", (e) => e.preventDefault());
const game = new Game(app);
window.__metroDash = game;
game.start();

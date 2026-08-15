import { Game } from "./game.js";
import "./style.css";

const app = document.getElementById("app");
window.addEventListener("contextmenu", (e) => e.preventDefault());
const game = new Game(app);
window.__metroDash = game;
game.start();

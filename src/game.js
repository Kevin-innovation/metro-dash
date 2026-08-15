import * as THREE from "three";
import { AudioBus } from "./audio.js";
import {
  BEST_KEY,
  MAGNET_RANGE,
  MAGNET_TIME,
  START_SPEED,
  TITLE_SPEED,
} from "./config.js";
import { EntityPool } from "./entities.js";
import { Input } from "./input.js";
import { applyAction, createPlayer, resetPlayer, updatePlayer } from "./player.js";
import { createWorld, syncWorld } from "./world.js";

const $ = (id) => document.getElementById(id);

function pick(arr) {
  return arr[(Math.random() * arr.length) | 0];
}

export class Game {
  constructor(root) {
    this.root = root;
    this.canvas = $("game-canvas");
    this.state = "title";
    this.speed = TITLE_SPEED;
    this.score = 0;
    this.scoreDist = 0;
    this.scoreCoins = 0;
    this.scoreBonus = 0;
    this.coins = 0;
    this.combo = 0;
    this.comboMax = 0;
    this.comboT = 0;
    this.gainTimer = 0;
    this.distance = 0;
    this.magnetT = 0;
    this.hintT = 0;
    this.deadT = 0;
    this.deadAt = 0;
    this.shake = 0;
    this.nextSpawn = 36;
    this.patternCount = 0;
    this.runTime = 0;
    this.phaseId = 0;
    this.toastTimer = 0;

    this.audio = new AudioBus();
    this.input = new Input(root);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 280);
    this.clock = new THREE.Clock();

    this.world = createWorld(this.scene);
    this.player = createPlayer();
    this.scene.add(this.player.root);
    this.pool = new EntityPool(this.scene);

    this.cam = { x: 0, y: 3.05, z: -6.2 };

    this.bindUi();
    this.resize();
    window.addEventListener("resize", () => this.resize());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.state === "playing") this.pause();
    });

    this.refreshBest();
    resetPlayer(this.player, 0);
    this.seedPreview();
  }

  bindUi() {
    $("btn-play").onclick = () => this.startRun();
    $("btn-retry").onclick = () => this.startRun();
    $("btn-home").onclick = () => this.toTitle();
    $("btn-quit").onclick = () => this.toTitle();
    $("btn-resume").onclick = () => this.resume();
    $("btn-pause").onclick = () => this.pause();
  }

  resize() {
    const w = this.root.clientWidth;
    const h = this.root.clientHeight;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  refreshBest() {
    const best = Number(localStorage.getItem(BEST_KEY) || 0);
    $("best-score").textContent = best.toLocaleString();
  }

  seedPreview() {
    this.pool.clear();
    this.nextSpawn = 20;
    this.patternCount = 0;
    for (let i = 0; i < 6; i++) this.spawnPattern(20 + i * 26);
  }

  startRun() {
    this.audio.resume();
    this.input.clear();
    this.state = "playing";
    this.speed = START_SPEED;
    this.score = 0;
    this.scoreDist = 0;
    this.scoreCoins = 0;
    this.scoreBonus = 0;
    this.coins = 0;
    this.combo = 0;
    this.comboMax = 0;
    this.comboT = 0;
    this.distance = 0;
    this.magnetT = 0;
    this.hintT = 6;
    this.deadT = 0;
    this.deadAt = 0;
    this.shake = 0;
    this.nextSpawn = 155;
    this.patternCount = 0;
    this.runTime = 0;
    this.phaseId = 0;
    resetPlayer(this.player, 0);
    this.cam = { x: 0, y: 3.05, z: -6.2 };
    this.pool.clear();
    for (let i = 0; i < 5; i++) this.spawnPattern(40 + i * 30);
    $("pace-chip").textContent = "START";
    $("speed-toast").classList.add("hidden");
    $("coin-gain").classList.add("hidden");
    $("combo").classList.add("hidden");
    this.setOverlay("hud");
    $("touch-hint").classList.remove("hidden");
    this.syncHud();
  }

  toTitle() {
    this.input.clear();
    this.state = "title";
    this.speed = TITLE_SPEED;
    resetPlayer(this.player, 0);
    this.cam = { x: 0, y: 3.05, z: -6.2 };
    this.seedPreview();
    this.setOverlay("title");
    this.refreshBest();
  }

  pause() {
    if (this.state !== "playing") return;
    this.state = "paused";
    $("pause-screen").classList.remove("hidden");
  }

  resume() {
    if (this.state !== "paused") return;
    this.state = "playing";
    $("pause-screen").classList.add("hidden");
    this.clock.getDelta();
  }

  setOverlay(mode) {
    $("title-screen").classList.toggle("hidden", mode !== "title");
    $("gameover-screen").classList.toggle("hidden", mode !== "dead");
    $("pause-screen").classList.add("hidden");
    $("hud").classList.toggle("hidden", mode !== "hud" && mode !== "dead");
    $("btn-pause").classList.toggle("hidden", mode !== "hud");
    if (mode !== "hud") $("touch-hint").classList.add("hidden");
  }

  start() {
    const loop = () => {
      requestAnimationFrame(loop);
      this.tick();
    };
    loop();
  }

  tick() {
    const dt = Math.min(0.033, this.clock.getDelta());
    this.handleInput();

    const running = this.state === "playing" || this.state === "title";
    const sim = this.state === "paused" ? 0 : dt;
    const spd = this.state === "dead" ? 0 : this.state === "title" ? TITLE_SPEED : this.speed;

    if (running && this.state === "playing") {
      this.runTime += sim;
      const ph = phaseAt(this.runTime);
      const target = speedAt(this.runTime);
      this.speed += (target - this.speed) * Math.min(1, 2.6 * sim);
      if (ph.id !== this.phaseId) {
        this.phaseId = ph.id;
        $("pace-chip").textContent = ph.name;
        if (ph.toast) this.showToast(ph.toast);
      }
      this.distance += this.speed * sim;
      this.scoreDist += this.speed * sim * 2.6;
      this.score = this.scoreDist + this.scoreCoins + this.scoreBonus;
      this.magnetT = Math.max(0, this.magnetT - sim);
      this.comboT -= sim;
      if (this.comboT <= 0) this.combo = 0;
      this.hintT -= sim;
      if (this.hintT <= 0) $("touch-hint").classList.add("hidden");
    }

    if (this.state !== "paused") {
      updatePlayer(this.player, sim, this.state === "dead" ? 0 : spd, {
        roofs: this.collectRoofs(),
        held: this.input.held,
        onMount: (item, hop) => {
          if (this.state !== "playing") return;
          if (hop) this.audio.hop();
          else this.audio.mount();
          this.scoreBonus += hop ? 8 : 22;
          this.score = this.scoreDist + this.scoreCoins + this.scoreBonus;
          if (!hop) vibrate(12);
        },
      });
      if (this.player.z > this.nextSpawn) this.spawnAhead();
      const keep = this.player.mounted;
      this.pool.prune(this.player.z - 18);
      if (keep && !this.pool.live.includes(keep)) {
        this.player.mounted = null;
        this.player.roofY = 0;
      }
      this.updatePickups(sim);
      if (this.state === "playing") this.collide();
    }

    if (this.state === "dead") {
      this.deadT += dt;
      if (performance.now() - this.deadAt > 480 && $("gameover-screen").classList.contains("hidden")) {
        this.showGameOver();
      }
    }

    this.shake = Math.max(0, this.shake - dt * 6);
    this.updateEntities(sim);
    syncWorld(this.world, this.player.z);
    this.updateCamera(dt);
    if (this.state === "playing") this.syncHud();
    this.renderer.render(this.scene, this.camera);
  }

  handleInput() {
    let act;
    while ((act = this.input.consume())) {
      if (act === "pause" && this.state === "playing") this.pause();
      else if (act === "pause" && this.state === "paused") this.resume();
      else if ((act === "start" || act === "jump") && this.state === "title") this.startRun();
      else if ((act === "start" || act === "jump") && this.state === "dead" && this.deadAt && performance.now() - this.deadAt > 480) {
        this.startRun();
      } else if (this.state === "playing") {
        applyAction(this.player, act, this.audio);
      }
    }
  }

  spawnAhead() {
    const ph = phaseAt(this.runTime);
    const ahead = Math.max(46, this.speed * 2.35);
    this.spawnPattern(this.player.z + ahead);
    this.nextSpawn = this.player.z + this.speed * ph.reaction;
  }

  kindsFor(phaseId) {
    const kinds = ["coins", "train", "barrier", "bus", "crate"];
    if (phaseId >= 1) kinds.push("two-trains", "sign", "bus-roof", "mixed");
    if (phaseId >= 2) kinds.push("triple-barrier", "triple-sign", "bus-hop", "two-bus");
    if (phaseId >= 3) kinds.push("zigzag", "jump-slide", "slide-jump", "train-hop");
    if (phaseId >= 4) kinds.push("gauntlet", "roof-weave", "triple-bus");
    if (this.patternCount % 8 === 6) kinds.push("magnet");
    return kinds;
  }

  spawnPattern(z) {
    this.patternCount += 1;
    const n = this.patternCount;
    const tutorial = ["coins", "train", "barrier", "sign", "bus"];
    const ph = this.state === "playing" ? phaseAt(this.runTime) : { id: 1 };
    const kind =
      this.state === "playing" && n <= tutorial.length ? tutorial[n - 1] : pick(this.kindsFor(ph.id));
    const lane = pick([-1, 0, 1]);

    if (kind === "coins") {
      for (let i = 0; i < 7; i++) this.pool.spawn("coin", lane, z + i * 1.6, 0.7);
    } else if (kind === "train") {
      this.pool.spawn("train", lane, z);
      this.coinLine(pick([-1, 0, 1].filter((l) => l !== lane)), z - 4, 5);
    } else if (kind === "bus") {
      this.pool.spawn("bus", lane, z);
      this.roofCoins(lane, z - 3, 6, 2.55);
    } else if (kind === "bus-roof") {
      this.pool.spawn("bus", lane, z);
      this.roofCoins(lane, z - 3.2, 7, 2.55);
    } else if (kind === "two-trains") {
      const lanes = shuffle([-1, 0, 1]);
      this.pool.spawn("train", lanes[0], z);
      this.pool.spawn("train", lanes[1], z);
      this.coinLine(lanes[2], z - 2, 4);
    } else if (kind === "two-bus") {
      const lanes = shuffle([-1, 0, 1]);
      this.pool.spawn("bus", lanes[0], z);
      this.pool.spawn("bus", lanes[1], z);
      this.roofCoins(lanes[0], z - 2, 4, 2.55);
    } else if (kind === "barrier") {
      this.pool.spawn("barrier", lane, z);
      for (let i = 0; i < 4; i++) this.pool.spawn("coin", lane, z + (i - 1.2) * 0.7, 1.55 + Math.sin(i) * 0.15);
    } else if (kind === "triple-barrier") {
      [-1, 0, 1].forEach((l) => this.pool.spawn("barrier", l, z));
      [-1, 0, 1].forEach((l) => this.pool.spawn("coin", l, z, 1.6));
    } else if (kind === "sign") {
      this.pool.spawn("sign", lane, z);
      this.pool.spawn("coin", lane, z, 0.45);
    } else if (kind === "triple-sign") {
      [-1, 0, 1].forEach((l) => this.pool.spawn("sign", l, z));
    } else if (kind === "crate") {
      this.pool.spawn("crate", lane, z);
    } else if (kind === "mixed") {
      const lanes = shuffle([-1, 0, 1]);
      this.pool.spawn("bus", lanes[0], z);
      this.pool.spawn("barrier", lanes[1], z + 2);
      this.coinLine(lanes[2], z - 1, 6);
    } else if (kind === "bus-hop") {
      const lanes = shuffle([-1, 0, 1]);
      this.pool.spawn("bus", lanes[0], z);
      this.pool.spawn("bus", lanes[1], z + 9);
      this.roofCoins(lanes[0], z - 2, 4, 2.55);
      this.roofCoins(lanes[1], z + 7, 4, 2.55);
    } else if (kind === "train-hop") {
      const lanes = shuffle([-1, 0, 1]);
      this.pool.spawn("train", lanes[0], z);
      this.pool.spawn("bus", lanes[1], z + 11);
      this.roofCoins(lanes[0], z - 3, 5, 2.8);
    } else if (kind === "zigzag") {
      this.pool.spawn("train", -1, z);
      this.pool.spawn("bus", 0, z + 13);
      this.pool.spawn("train", 1, z + 26);
    } else if (kind === "jump-slide") {
      [-1, 0, 1].forEach((l) => this.pool.spawn("barrier", l, z));
      [-1, 0, 1].forEach((l) => this.pool.spawn("sign", l, z + 11));
    } else if (kind === "slide-jump") {
      [-1, 0, 1].forEach((l) => this.pool.spawn("sign", l, z));
      [-1, 0, 1].forEach((l) => this.pool.spawn("barrier", l, z + 11));
    } else if (kind === "triple-bus") {
      [-1, 0, 1].forEach((l) => this.pool.spawn("bus", l, z));
      this.roofCoins(0, z - 2, 5, 2.55);
    } else if (kind === "roof-weave") {
      this.pool.spawn("bus", -1, z);
      this.pool.spawn("bus", 0, z + 10);
      this.pool.spawn("bus", 1, z + 20);
      this.roofCoins(-1, z - 2, 3, 2.55);
      this.roofCoins(0, z + 8, 3, 2.55);
    } else if (kind === "gauntlet") {
      const lanes = shuffle([-1, 0, 1]);
      this.pool.spawn("train", lanes[0], z);
      [-1, 0, 1].forEach((l) => this.pool.spawn("barrier", l, z + 14));
      this.pool.spawn("bus", lanes[1], z + 24);
    } else if (kind === "magnet") {
      this.pool.spawn("magnet", lane, z, 1.1);
      this.coinLine(lane, z + 3, 8);
    }
  }

  coinLine(lane, z, n) {
    for (let i = 0; i < n; i++) this.pool.spawn("coin", lane, z + i * 1.5, 0.7);
  }

  roofCoins(lane, z, n, y) {
    for (let i = 0; i < n; i++) this.pool.spawn("coin", lane, z + i * 1.35, y);
  }

  collectRoofs() {
    const roofs = [];
    for (const item of this.pool.live) {
      if (!item.rideable || item.taken || !item.mesh.visible) continue;
      roofs.push({
        item,
        x: item.mesh.position.x,
        z: item.z,
        length: item.length,
        roofY: item.roofY,
      });
    }
    return roofs;
  }

  showToast(text) {
    const el = $("speed-toast");
    el.textContent = text;
    el.classList.remove("hidden");
    el.classList.remove("pop");
    void el.offsetWidth;
    el.classList.add("pop");
    this.audio.speedup();
    this.shake = Math.max(this.shake, 0.45);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      el.classList.add("hidden");
      el.classList.remove("pop");
    }, 1200);
  }

  updateEntities(dt) {
    for (const item of this.pool.live) {
      if (item.type === "coin") {
        item.mesh.rotation.y += dt * 5;
        if (this.magnetT > 0 && this.state === "playing" && !item.taken) {
          const tx = this.player.x;
          const ty = this.player.y + 1.05;
          const tz = this.player.z + 0.7;
          const dx = tx - item.mesh.position.x;
          const dy = ty - item.mesh.position.y;
          const dz = tz - item.z;
          const d = Math.hypot(dx, dy, dz);
          if (d < MAGNET_RANGE) {
            const pull = Math.max(this.speed * 2.1, 32);
            const step = Math.min(d, pull * dt);
            if (d > 0.0001) {
              const s = step / d;
              item.mesh.position.x += dx * s;
              item.mesh.position.y += dy * s;
              item.z += dz * s;
              item.mesh.position.z = item.z;
            }
          }
        }
      } else if (item.type === "magnet") {
        item.mesh.rotation.y += dt * 3;
        item.mesh.position.y = 1.1 + Math.sin(this.player.runT * 4 + item.z) * 0.12;
      }
    }
  }

  updatePickups() {
    if (this.state !== "playing") return;
    const p = this.player;
    const py0 = p.y;
    const py1 = p.y + p.height;
    const magOn = this.magnetT > 0;
    for (const item of this.pool.live) {
      if (item.taken || item.lethal) continue;
      const dx = p.x - item.mesh.position.x;
      const dy = p.y + 0.95 - item.mesh.position.y;
      const dz = p.z - item.z;
      const dist3 = Math.hypot(dx, dy, dz);
      const sucked = magOn && item.type === "coin" && dist3 < 1.35;
      if (!sucked) {
        if (!overlapLane(p, item)) continue;
        if (Math.abs(dz) > 0.7) continue;
        if (py1 < item.minY || py0 > item.maxY) continue;
        const midY = (py0 + py1) * 0.5;
        if (Math.abs(midY - item.mesh.position.y) > 1.35) continue;
      }
      item.taken = true;
      item.mesh.visible = false;
      if (item.type === "coin") {
        this.combo += 1;
        this.comboT = 1.4;
        if (this.combo > this.comboMax) this.comboMax = this.combo;
        this.coins += 1;
        const gain = 10 + Math.min(20, this.combo);
        this.scoreCoins += gain;
        this.score = this.scoreDist + this.scoreCoins + this.scoreBonus;
        this.audio.coin();
        vibrate(8);
        this.flashCoinGain(gain);
      } else if (item.type === "magnet") {
        this.magnetT = MAGNET_TIME;
        this.audio.magnet();
        vibrate(18);
      }
    }
  }

  flashCoinGain(gain) {
    const gainEl = $("coin-gain");
    gainEl.textContent = `+${gain}`;
    gainEl.classList.remove("hidden");
    gainEl.classList.remove("pop");
    void gainEl.offsetWidth;
    gainEl.classList.add("pop");
    clearTimeout(this.gainTimer);
    this.gainTimer = setTimeout(() => gainEl.classList.add("hidden"), 520);

    const scoreEl = $("score");
    scoreEl.classList.remove("score-punch");
    void scoreEl.offsetWidth;
    scoreEl.classList.add("score-punch");

    const chip = $("coin-count").parentElement;
    chip.classList.remove("coin-punch");
    void chip.offsetWidth;
    chip.classList.add("coin-punch");

    const comboEl = $("combo");
    if (this.combo >= 2) {
      comboEl.classList.remove("hidden");
      comboEl.textContent = `COMBO x${this.combo}`;
      comboEl.classList.remove("combo-punch");
      void comboEl.offsetWidth;
      comboEl.classList.add("combo-punch");
    }
  }

  collide() {
    const py0 = this.player.y + 0.08;
    const py1 = this.player.y + this.player.height - 0.05;
    const p = this.player;
    for (const item of this.pool.live) {
      if (!item.lethal || item.taken) continue;
      if (!overlapLane(p, item)) continue;
      if (item.rideable) {
        if (p.mounted === item) continue;
        if (p.y >= item.roofY - 0.42) continue;
      }
      if (item.type === "sign" && p.y > 1.82) continue;
      const depth = item.rideable ? item.length * 0.44 : item.length * 0.55;
      if (Math.abs(p.z - item.z) > depth) continue;
      if (py1 < item.minY + 0.02 || py0 > item.maxY - 0.02) continue;
      this.die();
      return;
    }
  }

  die() {
    if (this.state !== "playing") return;
    this.state = "dead";
    this.player.alive = false;
    this.combo = 0;
    this.shake = 1;
    this.deadT = 0;
    this.deadAt = performance.now();
    this.audio.crash();
    vibrate(40);
    $("touch-hint").classList.add("hidden");
  }

  showGameOver() {
    const rounded = Math.floor(this.score);
    const best = Number(localStorage.getItem(BEST_KEY) || 0);
    const isBest = rounded > best;
    if (isBest) localStorage.setItem(BEST_KEY, String(rounded));
    $("final-score").textContent = rounded.toLocaleString();
    $("break-dist").textContent = Math.floor(this.scoreDist).toLocaleString();
    $("break-coins").textContent = Math.floor(this.scoreCoins).toLocaleString();
    $("break-bonus").textContent = Math.floor(this.scoreBonus).toLocaleString();
    $("final-coins").textContent = String(this.coins);
    $("final-dist").textContent = `${Math.floor(this.distance)}m`;
    $("final-combo").textContent = String(this.comboMax);
    $("new-best").classList.toggle("hidden", !isBest);
    this.setOverlay("dead");
  }

  syncHud() {
    $("score").textContent = Math.floor(this.score).toLocaleString();
    $("coin-count").textContent = String(this.coins);
    const comboEl = $("combo");
    if (this.combo >= 2) {
      comboEl.classList.remove("hidden");
      comboEl.textContent = `COMBO x${this.combo}`;
    } else comboEl.classList.add("hidden");
    const mag = $("magnet-bar");
    if (this.magnetT > 0) {
      mag.classList.remove("hidden");
      mag.querySelector(".magnet-fill").style.transform = `scaleX(${this.magnetT / MAGNET_TIME})`;
    } else mag.classList.add("hidden");
    const ph = phaseAt(this.runTime);
    $("pace-chip").textContent = `${ph.name}  ${Math.round(this.speed)}`;
  }

  updateCamera(dt) {
    const p = this.player;
    const spdK = THREE.MathUtils.clamp((this.speed - 16) / 34, 0, 1);
    const fov = 56 + spdK * 10;
    if (Math.abs(this.camera.fov - fov) > 0.2) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    const tx = p.x * 0.38;
    const ty = 3.05 + p.y * 0.42 + spdK * 0.12;
    const tz = p.z - (6.2 + spdK * 0.55);
    const k = 1 - Math.pow(0.001, dt);
    this.cam.x += (tx - this.cam.x) * k * 1.4;
    this.cam.y += (ty - this.cam.y) * k;
    this.cam.z += (tz - this.cam.z) * k * 2.2;
    const sx = (Math.random() - 0.5) * this.shake * 0.35;
    const sy = (Math.random() - 0.5) * this.shake * 0.25;
    this.camera.position.set(this.cam.x + sx, this.cam.y + sy, this.cam.z);
    this.camera.lookAt(p.x * 0.55, 1.05 + p.y * 0.2, p.z + 10);
  }
}

const PHASES = [
  { id: 0, t: 0, name: "START", toast: null, reaction: 1.36 },
  { id: 1, t: 16, name: "WARM UP", toast: "속도 상승!", reaction: 1.12 },
  { id: 2, t: 34, name: "RUSH", toast: "더 빠르게!", reaction: 0.94 },
  { id: 3, t: 56, name: "INTENSE", toast: "정신 집중!", reaction: 0.8 },
  { id: 4, t: 84, name: "MAX", toast: "MAX SPEED", reaction: 0.68 },
];

function phaseAt(t) {
  let cur = PHASES[0];
  for (const ph of PHASES) if (t >= ph.t) cur = ph;
  return cur;
}

function speedAt(t) {
  if (t < 16) return 16 + t * 0.28;
  if (t < 34) return 20.5 + (t - 16) * 0.36;
  if (t < 56) return 27 + (t - 34) * 0.36;
  if (t < 84) return 35 + (t - 56) * 0.29;
  return Math.min(50, 43 + (t - 84) * 0.16);
}

function overlapLane(player, item) {
  const x = LANEX(item);
  return Math.abs(player.x - x) < 0.95;
}

function LANEX(item) {
  return item.mesh.position.x;
}

function shuffle(a) {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

function vibrate(ms) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

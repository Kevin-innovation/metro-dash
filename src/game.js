import * as THREE from "three";
import { AudioBus } from "./audio.js";
import { Bgm } from "./bgm.js";
import { approach } from "./collision.js";
import {
  FIXED_DT,
  HOVERBOARD_GRACE,
  HOVERBOARD_TIME,
  MAX_FRAME_DT,
  MAX_SIM_STEPS,
  ONCOMING_SPEED,
  START_SPEED,
  TITLE_SPEED,
} from "./config.js";
import { EntityPool, makeOncoming } from "./entities.js";
import { Input } from "./input.js";
import { Interactions } from "./interactions.js";
import { ensureMissions } from "./missions.js";
import { phaseAt, pressureAt, reactionAt, speedAt } from "./pace.js";
import { POWERUPS, jumpMultiplier } from "./powerups.js";
import { ParticleField } from "./particles.js";
import { applyAction, applySkin, createPlayer, resetPlayer, updatePlayer } from "./player.js";
import { rankAt } from "./progression.js";
import { Run } from "./run.js";
import { SaveStore } from "./save.js";
import { Screens } from "./screens.js";
import { QualityGovernor, guessStartTier, qualityProfile } from "./settings.js";
import { Spawner } from "./spawner.js";
import { characterById } from "./shop.js";
import { applyWorldQuality, createWorld, syncWorld } from "./world.js";

const $ = (id) => document.getElementById(id);

/** Seconds the whole frame freezes on a heavy impact, for weight. */
const HITSTOP_CRASH = 0.11;
const HITSTOP_BOARD = 0.07;

export class Game {
  constructor(root) {
    this.root = root;
    this.canvas = $("game-canvas");
    this.state = "title";
    this.speed = TITLE_SPEED;
    this.accumulator = 0;
    this.lastFrame = 0;
    this.shake = 0;
    this.hitstop = 0;

    this.store = new SaveStore();
    this.settings = this.store.data.settings;
    this.run = new Run(this.store);
    this.syncMissions();

    this.audio = new AudioBus();
    this.audio.setEnabled(this.settings.sfx);
    setHaptics(this.settings.haptics);
    this.bgm = new Bgm(this.audio);
    this.bgm.setEnabled(this.settings.music);
    this.input = new Input(root);

    this.governor = new QualityGovernor(
      guessStartTier({
        deviceMemory: navigator.deviceMemory,
        hardwareConcurrency: navigator.hardwareConcurrency,
        isMobile: matchMedia("(pointer: coarse)").matches,
      }),
    );
    this.quality = qualityProfile(this.activeTier());

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, this.quality.drawDistance);

    this.world = createWorld(this.scene, this.quality);
    this.player = createPlayer(characterById(this.store.data.character).palette);
    this.scene.add(this.player.root);
    this.scene.add(this.player.shadow);
    this.pool = new EntityPool(this.scene);
    this.particles = new ParticleField(this.scene, 260);
    this.spawner = new Spawner(this.pool, { onOncoming: (item) => this.makeItemOncoming(item) });
    this.interactions = new Interactions(this.pool, this.run, this.particles);

    this.applyQuality(this.activeTier());
    this.cam = { x: 0, y: 3.6, z: -7.4 };
    this.resetRunState();

    this.screens = new Screens({
      startRun: () => this.startRun(),
      toTitle: () => this.toTitle(),
      pause: () => this.pause(),
      resume: () => this.resume(),
      deployBoard: () => this.deployBoard(),
      openShop: () => this.openShop(),
      buy: (kind, id) => this.buy(kind, id),
      openSettings: () => this.openSettings(),
      toggleSetting: (key) => this.toggleSetting(key),
      setQuality: (tier) => this.setQuality(tier),
    });
    this.resize();
    window.addEventListener("resize", () => this.resize());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.state === "playing") this.pause();
    });

    resetPlayer(this.player, 0);
    this.seedPreview();
    this.screens.refreshProfile(this.store.data);
  }

  // --- quality ------------------------------------------------------------

  /** The tier actually in force: a pinned setting wins over the governor. */
  activeTier() {
    return this.settings.quality === "auto" ? this.governor.tier : this.settings.quality;
  }

  applyQuality(tier) {
    this.quality = qualityProfile(tier);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.quality.pixelRatio));
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.camera.far = this.quality.drawDistance;
    this.camera.updateProjectionMatrix();
    this.scene.fog.near = this.quality.fog[0];
    this.scene.fog.far = this.quality.fog[1];
    applyWorldQuality(this.world, this.quality);
    this.particles.setBudget(this.quality.particleBudget);
    this.resize();
  }

  // --- shop & settings ----------------------------------------------------

  openShop() {
    this.audio.resume();
    this.screens.openShop(this.store.data);
    this.screens.refreshProfile(this.store.data);
  }

  buy(kind, id) {
    const result = this.screens.buy(this.store, kind, id);
    if (!result.ok) {
      this.audio.denied();
      return;
    }
    this.audio.purchase();
    if (kind === "character") {
      applySkin(this.player, characterById(this.store.data.character).palette);
    }
    this.screens.refreshShop(this.store.data);
    this.screens.refreshProfile(this.store.data);
  }

  openSettings() {
    this.audio.resume();
    this.screens.openSettings(this.settings, this.activeTier());
  }

  toggleSetting(key) {
    if (!(key in this.settings)) return;
    this.settings[key] = !this.settings[key];
    this.store.set("settings", this.settings);

    if (key === "sfx") this.audio.setEnabled(this.settings.sfx);
    if (key === "haptics") setHaptics(this.settings.haptics);
    if (key === "music") {
      this.bgm.setEnabled(this.settings.music);
      if (this.settings.music && this.state === "playing") this.bgm.start(this.phaseId);
    }
    this.audio.purchase();
    this.screens.refreshSettings(this.settings, this.activeTier());
  }

  setQuality(tier) {
    this.settings.quality = tier;
    this.store.set("settings", this.settings);
    if (tier !== "auto") this.governor.reset(tier);
    this.applyQuality(this.activeTier());
    this.screens.refreshSettings(this.settings, this.activeTier());
  }

  // --- profile ------------------------------------------------------------

  /** Label the HUD shows for the current pace band. */
  phaseName() {
    return phaseAt(this.runTime).name;
  }

  showGameOver() {
    const result = this.bankProgress(false);
    const cleared = this.screens.showGameOver(this.run, this.store.data, result);
    if (cleared) this.audio.mission();
    this.screens.refreshProfile(this.store.data);
  }

  /** Keep three missions dealt, scaled to the player's rank. */
  syncMissions() {
    const tier = Math.min(2, Math.floor((rankAt(this.store.data.xp).level - 1) / 3));
    this.store.data.missions = ensureMissions(this.store.data.missions, tier);
    this.store.flush();
  }

  // --- lifecycle ----------------------------------------------------------

  resetRunState() {
    this.run.reset();
    this.hintT = 0;
    this.deadAt = 0;
    this.runTime = 0;
    this.phaseId = 0;
    this.sawOncoming = false;
    this.hitstop = 0;
    this.boardT = 0;
    this.boardGrace = 0;
    this.airborne = false;
  }

  resize() {
    const w = this.root.clientWidth;
    const h = this.root.clientHeight;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  seedPreview() {
    this.pool.clear();
    this.particles.clear();
    this.spawner.reset();
    this.spawner.seed(20, 6, 26, { speed: TITLE_SPEED, phaseId: 1, nextSpawn: 20 });
  }

  startRun() {
    this.audio.resume();
    // Retrying straight from the game-over card still has to close out the run.
    if (this.state === "playing" || this.state === "paused" || this.state === "dead") {
      this.bankProgress(true);
    }
    this.input.clear();
    this.resetRunState();
    this.state = "playing";
    this.speed = START_SPEED;
    this.hintT = 6;
    this.accumulator = 0;
    this.lastFrame = 0;
    this.shake = 0;

    resetPlayer(this.player, 0);
    this.cam = { x: 0, y: 3.6, z: -7.4 };
    this.pool.clear();
    this.particles.clear();
    this.spawner.reset();
    this.spawner.seed(40, 5, 30, {
      speed: START_SPEED,
      phaseId: 0,
      tutorial: true,
      nextSpawn: 155,
    });
    this.bgm.start(0);

    this.screens.setOverlay("hud");
    this.screens.resetHud();
    this.screens.refreshProfile(this.store.data);
    this.screens.syncHud(this);
  }

  toTitle() {
    if (this.state === "playing" || this.state === "paused" || this.state === "dead") {
      this.bankProgress(true);
    }
    this.input.clear();
    this.state = "title";
    this.speed = TITLE_SPEED;
    this.accumulator = 0;
    this.bgm.stop();
    this.run.clearPowerups();
    resetPlayer(this.player, 0);
    this.cam = { x: 0, y: 3.05, z: -6.2 };
    this.seedPreview();
    this.screens.setOverlay("title");
    this.screens.refreshProfile(this.store.data);
  }

  pause() {
    if (this.state !== "playing") return;
    this.state = "paused";
    this.accumulator = 0;
    this.bgm.stop({ fadeOut: 0.2 });
    this.screens.showPause(true);
  }

  resume() {
    if (this.state !== "paused") return;
    this.state = "playing";
    this.screens.showPause(false);
    this.accumulator = 0;
    this.lastFrame = 0;
    this.bgm.start(this.phaseId);
  }

  // --- loop ---------------------------------------------------------------

  start() {
    const loop = () => {
      requestAnimationFrame(loop);
      this.tick();
    };
    loop();
  }

  /**
   * Seconds since the previous frame, capped so a tab that was backgrounded
   * cannot dump a huge backlog into the simulation.
   */
  frameDelta() {
    const now = performance.now();
    if (!this.lastFrame) {
      this.lastFrame = now;
      return 0;
    }
    const dt = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    return Math.min(MAX_FRAME_DT, dt);
  }

  /**
   * One animation frame: advance the simulation in fixed steps, then present.
   *
   * Physics and collision must never see a variable step — a long frame used to
   * move the player far enough to skip straight through a barrier.
   */
  tick() {
    const frameDt = this.frameDelta();
    this.handleInput();
    this.governQuality(frameDt);

    // Hitstop freezes the simulation for a beat on impact. Presentation keeps
    // running so the shake and particles still read during the freeze.
    if (this.hitstop > 0) {
      this.hitstop = Math.max(0, this.hitstop - frameDt);
      this.accumulator = 0;
    } else if (this.state === "paused") {
      this.accumulator = 0;
    } else {
      this.accumulator += frameDt;
      let steps = 0;
      while (this.accumulator >= FIXED_DT && steps < MAX_SIM_STEPS) {
        this.simulate(FIXED_DT);
        this.accumulator -= FIXED_DT;
        steps += 1;
      }
      // Drop the backlog rather than spiralling if a frame ran very long.
      if (steps >= MAX_SIM_STEPS) this.accumulator = 0;
    }

    if (this.state === "dead" && performance.now() - this.deadAt > 480) {
      if (!this.screens.gameOverVisible()) this.showGameOver();
    }

    this.shake = Math.max(0, this.shake - frameDt * 6);
    this.emitAmbientParticles(frameDt);
    this.particles.update(frameDt);
    syncWorld(this.world, this.player.z);
    this.updateCamera(frameDt);
    if (this.state === "playing") this.screens.syncHud(this);
    this.renderer.render(this.scene, this.camera);
  }

  /** Let the auto quality governor react to the measured frame rate. */
  governQuality(frameDt) {
    if (this.settings.quality !== "auto" || this.state !== "playing") return;
    const changed = this.governor.sample(frameDt);
    if (changed) this.applyQuality(changed);
  }

  /** Continuous effects that belong to presentation, not simulation. */
  emitAmbientParticles(dt) {
    if (dt <= 0 || this.state !== "playing") return;
    const p = this.player;

    if (this.run.powerupActive("jetpack")) {
      this.particles.trail(p.x, p.y + 0.35, p.z, { count: 2, colour: 0xffb74d });
    }

    // Speed lines: sparse streaks flicking past the camera once the run is fast.
    if (this.quality.speedLines && this.speed > 30) {
      const density = (this.speed - 30) / 20;
      if (Math.random() < density * 0.85) {
        const side = Math.random() < 0.5 ? -1 : 1;
        this.particles.emit(1, () => ({
          x: p.x + side * (2.6 + Math.random() * 2.4),
          y: 0.6 + Math.random() * 3.4,
          z: p.z + 16 + Math.random() * 10,
          vx: 0,
          vy: 0,
          vz: -this.speed * 1.5,
          life: 0.32,
          size: 0.5,
          colour: [1, 1, 1],
          gravity: 0,
          drag: 0,
        }));
      }
    }
  }

  /** A single fixed-size simulation step. */
  simulate(dt) {
    if (this.state === "playing") this.advanceRun(dt);

    // Snapshot every mover before anything shifts, so the swept collision test
    // has a valid start-of-step position for both player and obstacles.
    for (const item of this.pool.live) item.prevZ = item.z;

    this.updateMovers(dt);

    const speed = this.state === "dead" ? 0 : this.state === "title" ? TITLE_SPEED : this.speed;
    updatePlayer(this.player, dt, speed, {
      roofs: this.collectRoofs(),
      held: this.input.held,
      flying: this.state === "playing" && this.run.powerupActive("jetpack"),
      onMount: (item, hop) => this.onMount(item, hop),
    });

    this.detectLanding();
    this.spawnAhead();

    const mounted = this.player.mounted;
    this.pool.prune(this.player.z - 18);
    if (mounted && !this.pool.live.includes(mounted)) {
      this.player.mounted = null;
      this.player.roofY = 0;
    }

    this.resolveInteractions(dt);
    this.updateEntities(dt);
  }

  advanceRun(dt) {
    this.runTime += dt;

    const phase = phaseAt(this.runTime);
    const target = speedAt(this.runTime);
    this.speed += (target - this.speed) * approach(2.6, dt);

    if (phase.id !== this.phaseId) {
      this.phaseId = phase.id;
      this.bgm.setPhase(phase.id);
      this.screens.setPhaseLabel(phase.name);
      if (phase.toast) this.screens.showToast(phase.toast);
    }

    const expired = this.run.advance(dt, {
      travelled: this.speed * dt,
      mounted: !!this.player.mounted,
    });
    for (const id of expired) {
      if (id === "jetpack") this.screens.showToast("착지!");
    }

    if (this.boardT > 0) {
      this.boardT = Math.max(0, this.boardT - dt);
      if (this.boardT === 0) this.stowBoard();
    }
    this.boardGrace = Math.max(0, this.boardGrace - dt);

    this.hintT -= dt;
    if (this.hintT <= 0) this.screens.hideHint();
  }

  /** Kick up dust the moment the runner reconnects with the deck. */
  detectLanding() {
    const p = this.player;
    const airborne = p.flying || p.jumping || p.diving || p.y > 0.06;
    const landed = this.airborne && !airborne;
    this.airborne = airborne;
    if (!landed || this.state !== "playing") return;

    this.particles.dust(p.x, 0, p.z, { count: 9, speed: 3 + this.speed * 0.05 });
    this.shake = Math.max(this.shake, 0.14);
  }

  onMount(_item, hop) {
    if (this.state !== "playing") return;
    if (hop) this.audio.hop();
    else this.audio.mount();
    this.run.addMount(hop);
    if (!hop) vibrate(12);
  }

  handleInput() {
    let act;
    while ((act = this.input.consume())) {
      if (act === "pause" && this.state === "playing") this.pause();
      else if (act === "pause" && this.state === "paused") this.resume();
      else if (act === "board" && this.state === "playing") this.deployBoard();
      else if ((act === "start" || act === "jump") && this.state === "title") this.startRun();
      else if (
        (act === "start" || act === "jump") &&
        this.state === "dead" &&
        this.deadAt &&
        performance.now() - this.deadAt > 480
      ) {
        this.startRun();
      } else if (this.state === "playing") {
        applyAction(this.player, act, this.audio, {
          jumpMultiplier: jumpMultiplier(this.run.powerups),
        });
      }
    }
  }

  // --- hoverboard ---------------------------------------------------------

  deployBoard() {
    if (this.state !== "playing" || this.player.boarding) return;
    if (this.store.data.hoverboards <= 0) {
      this.audio.denied();
      return;
    }
    this.store.set("hoverboards", this.store.data.hoverboards - 1);
    this.player.boarding = true;
    this.boardT = HOVERBOARD_TIME;
    this.audio.board();
    vibrate(15);
    this.screens.refreshProfile(this.store.data);
  }

  stowBoard() {
    this.player.boarding = false;
    this.boardT = 0;
  }

  /** @returns {boolean} whether the board absorbed the crash. */
  absorbCrash() {
    if (!this.player.boarding) return false;
    const p = this.player;
    this.stowBoard();
    this.boardGrace = HOVERBOARD_GRACE;
    this.hitstop = HITSTOP_BOARD;
    this.audio.boardBreak();
    this.particles.burst(p.x, p.y + 0.2, p.z, {
      count: 30,
      colour: 0xff3d71,
      speed: 8,
      life: 0.65,
      size: 0.4,
    });
    this.shake = Math.max(this.shake, 0.8);
    this.screens.showToast("호버보드가 부서졌다!");
    vibrate(30);
    return true;
  }

  // --- spawning -----------------------------------------------------------

  spawnAhead() {
    const phase = phaseAt(this.runTime);
    const playing = this.state === "playing";
    this.spawner.update(this.player.z, {
      speed: this.speed,
      phaseId: playing ? phase.id : 1,
      // The title-screen preview stays at the gentlest pacing.
      reaction: playing ? reactionAt(this.runTime) : reactionAt(0),
      pressure: playing ? pressureAt(this.runTime) : 0,
      tutorial: playing,
    });
  }

  makeItemOncoming(item) {
    const extra = 9 + this.phaseId * 1.4;
    makeOncoming(item, ONCOMING_SPEED + extra * 0.2);
    if (this.state === "playing" && !this.sawOncoming) {
      this.sawOncoming = true;
      this.screens.showToast("버스가 온다!");
    }
    return item;
  }

  updateMovers(dt) {
    if (dt <= 0) return;
    for (const item of this.pool.live) {
      if (!item.moving || item.taken) continue;
      item.z += item.vz * dt;
      item.mesh.position.z = item.z;
      const gap = item.z - this.player.z;
      if (!item.warned && gap < 22 && gap > 6 && this.state === "playing") {
        item.warned = true;
        this.audio.horn();
      }
    }
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

  // --- pickups & scoring --------------------------------------------------

  updateEntities(dt) {
    for (const item of this.pool.live) {
      if (item.type === "coin") {
        item.mesh.rotation.y += dt * 5;
      } else if (item.powerup) {
        item.mesh.rotation.y += dt * 2.4;
        item.mesh.position.y = item.y + Math.sin(this.player.runT * 4 + item.z) * 0.14;
      }
    }
  }

  /**
   * Run the step's pickups, near misses and collision, then play back whatever
   * the rules decided as sound, HUD flashes and haptics.
   */
  resolveInteractions(dt) {
    this.interactions.pullCoins(this.player, dt, this.speed);
    if (this.state !== "playing") return;

    for (const event of this.interactions.collectPickups(this.player, {
      upgradeLevel: (id) => this.store.upgradeLevel(id),
    })) {
      if (event.type === "coin") {
        this.audio.coin();
        vibrate(8);
        this.screens.flashCoinGain(Math.round(event.gain));
      } else {
        if (event.id === "jetpack") this.audio.jetpack();
        else this.audio.powerup();
        this.screens.showToast(`${POWERUPS[event.id].icon} ${POWERUPS[event.id].name}!`);
        vibrate(18);
      }
    }

    for (let i = this.interactions.scoreNearMisses(this.player); i > 0; i--) {
      this.audio.nearMiss();
      this.screens.flashNearMiss();
    }

    // A hoverboard eats the first hit; grace covers the recovery.
    if (this.boardGrace <= 0 && this.interactions.detectCrash(this.player)) {
      if (!this.absorbCrash()) this.die();
    }
  }

  /** Directly grant a power-up, used by the tutorial toasts and by tests. */
  collectPowerup(id) {
    this.run.addPowerup(id, this.store.upgradeLevel(id));
    if (id === "jetpack") this.audio.jetpack();
    else this.audio.powerup();
    this.screens.showToast(`${POWERUPS[id].icon} ${POWERUPS[id].name}!`);
    vibrate(18);
  }

  die() {
    if (this.state !== "playing") return;
    const p = this.player;
    this.state = "dead";
    p.alive = false;
    this.run.combo = 0;
    this.shake = 1;
    this.hitstop = HITSTOP_CRASH;
    this.deadAt = performance.now();
    this.run.clearPowerups();
    this.stowBoard();
    this.audio.crash();
    this.bgm.stop({ fadeOut: 0.35 });
    this.particles.burst(p.x, p.y + 0.7, p.z, {
      count: 34,
      colour: 0xff6d4a,
      speed: 9,
      life: 0.8,
      size: 0.45,
    });
    vibrate(40);
    this.screens.hideHint();
    this.store.recordBest(this.run.score);
  }

  // --- run completion -----------------------------------------------------

  /** Commit run progress to the profile. See Run#bank for the delta rules. */
  bankProgress(final = false) {
    return this.run.bank(final);
  }

  /**
   * Chase camera.
   *
   * Sits higher and further back than a straight over-the-shoulder rig so the
   * runner does not occlude the centre lane — at speed the player needs to read
   * the lane they are standing in, not just the two beside it.
   */
  updateCamera(dt) {
    const p = this.player;
    const spdK = THREE.MathUtils.clamp((this.speed - 16) / 34, 0, 1);
    const fov = 58 + spdK * 9;
    if (Math.abs(this.camera.fov - fov) > 0.2) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }

    const tx = p.x * 0.34;
    const ty = 3.6 + p.y * 0.5 + spdK * 0.25;
    const tz = p.z - (7.4 + spdK * 0.7);
    this.cam.x += (tx - this.cam.x) * approach(9.7, dt);
    this.cam.y += (ty - this.cam.y) * approach(6.9, dt);
    this.cam.z += (tz - this.cam.z) * approach(15.2, dt);

    const sx = (Math.random() - 0.5) * this.shake * 0.35;
    const sy = (Math.random() - 0.5) * this.shake * 0.25;
    this.camera.position.set(this.cam.x + sx, this.cam.y + sy, this.cam.z);
    // Aim well down the track so obstacles enter frame with time to read them.
    this.camera.lookAt(p.x * 0.5, 1.35 + p.y * 0.28, p.z + 14);
  }
}


let hapticsEnabled = true;

/** Called by Game so the settings toggle reaches the module-level helper. */
export function setHaptics(enabled) {
  hapticsEnabled = enabled;
}

function vibrate(ms) {
  if (hapticsEnabled && navigator.vibrate) navigator.vibrate(ms);
}

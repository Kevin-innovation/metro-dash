import * as THREE from "three";
import { AudioBus } from "./audio.js";
import { Bgm } from "./bgm.js";
import { Cloud, cloudMessage } from "./cloud.js";
import { approach } from "./collision.js";
import {
  FIXED_DT,
  HOVERBOARD_GRACE,
  HOVERBOARD_TIME,
  MAX_FRAME_DT,
  MAX_SIM_STEPS,
  ONCOMING_SPEED,
  PLAYER_HEIGHT,
  START_SPEED,
  TITLE_SPEED,
} from "./config.js";
import { EntityPool, makeOncoming } from "./entities.js";
import { Input } from "./input.js";
import { Interactions } from "./interactions.js";
import { MISSION_TIERS, ensureMissions } from "./missions.js";
import { phaseAt, pressureAt, reactionAt, speedAt } from "./pace.js";
import { lookAt } from "./zones.js";

import { POWERUPS, jumpMultiplier } from "./powerups.js";
import { ParticleField } from "./particles.js";
import { applyAction, applySkin, createPlayer, resetPlayer, updatePlayer } from "./player.js";
import { missionTier } from "./progression.js";
import { Run } from "./run.js";
import { SaveStore, describeSave, hasProgress, normalizeSave } from "./save.js";
import { Screens } from "./screens.js";
import { QualityGovernor, guessStartTier, qualityProfile } from "./settings.js";
import { Spawner } from "./spawner.js";
import { characterById } from "./shop.js";
import { applyLook, applyWorldQuality, createWorld, syncWorld } from "./world.js";


/** Gap kept between the camera and a roof overhead. */
const CAMERA_HEADROOM = 0.3;


const $ = (id) => document.getElementById(id);

/** Seconds the whole frame freezes on a heavy impact, for weight. */
const HITSTOP_CRASH = 0.11;
const HITSTOP_BOARD = 0.07;

/** Least time between two near-miss flourishes, so they cannot stack up. */
const NEAR_MISS_FX_COOLDOWN = 0.28;

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
    /** Short lens kick, 0..1. Used for the moments speed itself is the event. */
    this.fovPunch = 0;
    this.nearMissFx = 0;

    this.store = new SaveStore();
    this.settings = this.store.data.settings;
    this.run = new Run(this.store);
    this.syncMissions();

    // Online play is additive: with no backend configured the game is exactly
    // what it was, and every cloud call below is a no-op.
    this.cloud = new Cloud();
    this.cloud.onChange(() => this.onCloudChange());

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
      // Multisampling costs a full extra buffer, and on a 2x phone screen the
      // pixels are already smaller than the aliasing it removes. Decided once,
      // here, because the flag cannot be changed after the context exists.
      antialias: (globalThis.devicePixelRatio ?? 1) < 2,
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
      openAccount: () => this.openAccount(),
      submitAccount: (mode, handle, pin, remember) => this.submitAccount(mode, handle, pin, remember),
      openLeaderboard: () => this.openLeaderboard(),
      reportHandle: (handle, button) => this.reportHandle(handle, button),
      submitSchool: (input) => this.submitSchool(input),
      resolveMerge: (choice) => this.resolveMerge(choice),
    });
    this.resize();
    window.addEventListener("resize", () => this.resize());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.state === "playing") this.pause();
    });

    resetPlayer(this.player, 0);
    this.seedPreview();
    this.screens.refreshProfile(this.store.data);
    this.screens.showAccountBar(this.cloud);
    // Reconnects an existing session in the background; guests never wait.
    this.cloud.connect();
  }

  // --- online ---------------------------------------------------------------

  onCloudChange() {
    this.screens.showAccountBar(this.cloud);
  }

  openAccount() {
    this.audio.resume();
    if (this.cloud.signedIn) {
      this.cloud.signOut();
      return;
    }
    this.screens.openAccount("signin");
  }

  async submitAccount(mode, handle, pin, remember = true) {
    this.screens.showAccountError(null);
    this.screens.setAccountBusy(true);
    try {
      const justSignedUp = mode === "signup";
      if (justSignedUp) {
        await this.cloud.register(handle, pin, this.store.data, remember);
      } else {
        const result = await this.cloud.signIn(handle, pin, remember);
        // The staff account manages rather than plays: straight to the tools,
        // before any of the profile reconciliation a player would go through.
        if (result?.staff) {
          this.screens.showAccountError("관리자 페이지로 이동합니다…");
          window.location.href = "/admin.html";
          return;
        }
        this.reconcileProfiles(result?.profile);
      }
      this.screens.closeAccount();
      this.screens.refreshProfile(this.store.data);
      // Asked once, at the moment the account is created, and skippable — the
      // school can still be set later from the title screen.
      if (justSignedUp && !this.cloud.schoolLabel) this.screens.openSchool();
    } catch (error) {
      this.screens.showAccountError(cloudMessage(error));
    } finally {
      this.screens.setAccountBusy(false);
    }
  }

  /**
   * Decide what happens to the guest save when someone signs in.
   *
   * Taking the cloud copy unconditionally used to throw away a session of guest
   * play without a word. Now that only happens when there was nothing to lose;
   * when both sides have been played, the choice belongs to the player.
   */
  reconcileProfiles(cloudProfile) {
    const cloud = cloudProfile ? normalizeSave(cloudProfile) : null;
    const local = this.store.data;

    if (!cloud || !hasProgress(cloud)) {
      // Nothing on the server worth keeping: push this browser's save up.
      this.cloud.save(local);
      return;
    }
    if (!hasProgress(local)) {
      this.adoptProfile(cloud);
      return;
    }

    this.pendingMerge = { local, cloud };
    this.screens.openMerge(describeSave(local), describeSave(cloud));
  }

  resolveMerge(choice) {
    const pending = this.pendingMerge;
    this.pendingMerge = null;
    this.screens.closeMerge();
    if (!pending) return;

    if (choice === "cloud") {
      this.adoptProfile(pending.cloud);
    } else {
      // Keeping this browser's save means the server has to be told about it,
      // or the next sign-in would offer the same choice again.
      this.cloud.save(pending.local);
    }
    this.screens.refreshProfile(this.store.data);
  }

  /** Report a nickname from the leaderboard. */
  async reportHandle(handle, button) {
    if (button) button.disabled = true;
    try {
      const result = await this.cloud.report(handle);
      this.screens.showReportNote(
        result?.alreadyReported
          ? "이미 신고한 닉네임이에요"
          : "신고했어요. 선생님이 확인합니다",
      );
      this.audio.purchase();
    } catch (error) {
      if (button) button.disabled = false;
      this.screens.showReportNote(cloudMessage(error));
    }
  }

  /**
   * Claim a school.
   *
   * The server allows this once per account, so the confirmation matters more
   * than usual — a mistake here needs a teacher to undo.
   */
  async submitSchool({ region, level, name }) {
    this.screens.showSchoolError(null);
    this.screens.setSchoolBusy(true);
    try {
      const result = await this.cloud.setSchool(region, level, name);
      this.screens.closeSchool();
      this.screens.showAccountBar(this.cloud);
      this.screens.showReportNote(`${result.schoolLabel} 로 등록했어요`);
      this.audio.purchase();
    } catch (error) {
      this.screens.showSchoolError(cloudMessage(error));
    } finally {
      this.screens.setSchoolBusy(false);
    }
  }

  /** Replace the local profile with one pulled from the server. */
  adoptProfile(profile) {
    this.store.data = normalizeSave(profile);
    this.store.flush();
    this.settings = this.store.data.settings;
    this.syncMissions();
    applySkin(this.player, characterById(this.store.data.character).palette);
    this.applyQuality(this.activeTier());
  }

  async openLeaderboard() {
    this.audio.resume();
    this.screens.openLeaderboard();
    this.screens.renderLeaderboard([], null, this.cloud.handle);
    this.screens.renderSchoolBoard([], null);
    // Both columns are fetched together so the two halves of the screen fill in
    // at the same time rather than one after the other.
    const [rows, standing, schools, schoolStanding] = await Promise.all([
      this.cloud.leaderboard(10).catch(() => []),
      this.cloud.standing(),
      this.cloud.schoolLeaderboard(10).catch(() => []),
      this.cloud.schoolStanding(),
    ]);
    this.screens.renderLeaderboard(rows, standing, this.cloud.handle);
    this.screens.renderSchoolBoard(schools, schoolStanding);
  }

  /** Send the finished run up. Never blocks, never fails the local save. */
  syncRun() {
    if (!this.cloud.signedIn) return;
    this.cloud.submitRun({
      score: Math.floor(this.run.score),
      distance: Math.floor(this.run.distance),
      coins: this.run.coins,
      comboMax: this.run.comboMax,
      seconds: Math.floor(this.run.seconds),
      character: this.store.data.character,
    });
    this.cloud.save(this.store.data);
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
    // Fog is not set here: applyLook owns it, because the distance depends on
    // the zone as well as the tier and two writers would fight every frame.
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
    this.syncRun();
    const cleared = this.screens.showGameOver(this.run, this.store.data, result);
    if (cleared) this.audio.mission();
    this.screens.refreshProfile(this.store.data);
  }

  /** Keep a full hand of missions dealt, scaled to the player's rank. */
  syncMissions() {
    const tier = missionTier(this.store.data.xp, MISSION_TIERS);
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
    // Cleared with the rest of the run, so a kick from the last one cannot
    // still be decaying over the first seconds of the next.
    this.fovPunch = 0;
    this.nearMissFx = 0;
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
    this.nearMissFx = Math.max(0, this.nearMissFx - frameDt);
    // Eased rather than linear: the kick lands hard and lets go softly, which
    // is the shape that reads as force instead of as a glitch.
    this.fovPunch = Math.max(0, this.fovPunch - frameDt * (1.2 + this.fovPunch * 2.6));
    this.emitAmbientParticles(frameDt);
    this.particles.update(frameDt);
    syncWorld(this.world, this.player.z);
    // The title screen holds the opening look; only a run travels through zones.
    applyLook(this.world, lookAt(this.state === "playing" ? this.runTime : 0), this.quality);
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

  /**
   * A fistful of speed lines at once.
   *
   * The ambient emitter above trickles these out to describe how fast the run
   * is; this fires a clump of them at the instant something changed, which is
   * what the eye actually reads as acceleration.
   */
  speedBurst(count) {
    if (!this.quality.speedLines || this.state !== "playing") return;
    const p = this.player;
    this.particles.emit(count, () => {
      const side = Math.random() < 0.5 ? -1 : 1;
      return {
        x: p.x + side * (2.2 + Math.random() * 2.8),
        y: 0.5 + Math.random() * 3.6,
        z: p.z + 12 + Math.random() * 14,
        vx: 0,
        vy: 0,
        vz: -this.speed * 1.7,
        life: 0.3,
        size: 0.5,
        colour: [1, 1, 1],
        gravity: 0,
        drag: 0,
      };
    });
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
      // Read inside the fixed step, not from the rendered look, so the ceiling
      // the runner bumps into is the same one on every machine.
      ceiling: this.state === "playing" ? lookAt(this.runTime).ceiling : null,
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
      const faster = phase.id > this.phaseId;
      this.phaseId = phase.id;
      this.bgm.setPhase(phase.id);
      this.screens.setPhaseLabel(phase.name);
      if (phase.toast) this.screens.showToast(phase.toast);
      // Felt, not just read: the lens widens, the world lurches and the air
      // fills with streaks for a moment.
      if (faster) {
        this.fovPunch = 1;
        this.shake = Math.max(this.shake, 0.3);
        this.speedBurst(14);
        vibrate(18);
      }
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
    // Landing on a roof is a landing: it gets the same thump as hitting the
    // deck, or riding a bus feels like floating onto it.
    const p = this.player;
    this.particles.dust(p.x, p.y, p.z, { count: 7, speed: 2.6 + this.speed * 0.04 });
    this.shake = Math.max(this.shake, hop ? 0.12 : 0.2);
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
    this.run.addBoard();
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
      // The tunnel's low roof has to mean something, so it leans the pattern
      // pick towards the gates you can only get under by sliding.
      slideBias: playing ? lookAt(this.runTime).slideBias : 0,
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

    const cleared = this.interactions.scoreNearMisses(this.player);
    for (let i = cleared.nearMisses; i > 0; i--) {
      this.audio.nearMiss();
      this.screens.flashNearMiss();
    }
    // A near miss gets air and a nudge, never a lens kick. They arrive several
    // a second through a dense stretch, and a camera that punches on every one
    // spends the whole run juddering.
    if (cleared.nearMisses > 0 && this.nearMissFx <= 0) {
      const p = this.player;
      this.nearMissFx = NEAR_MISS_FX_COOLDOWN;
      this.shake = Math.max(this.shake, 0.09);
      this.speedBurst(5);
      this.particles.burst(p.x, p.y + 0.8, p.z + 0.4, {
        count: 5,
        colour: 0xbfe9ff,
        speed: 3.4,
        life: 0.24,
        size: 0.26,
      });
      vibrate(6);
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
    // The steady part tracks speed; the punch is what makes a gear change feel
    // like one instead of a number quietly going up in the corner.
    const fov = 58 + spdK * 9 + this.fovPunch * 7;
    // Follow it closely. The old 0.2° threshold was fine for a lens that only
    // drifted with speed, but a punch decays past it in a fraction of a frame's
    // worth of change — some frames updated and some did not, and a zoom moving
    // in visible steps reads as the whole game stuttering.
    if (Math.abs(this.camera.fov - fov) > 0.02) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }

    const tx = p.x * 0.34;
    let wantY = 3.6 + p.y * 0.5 + spdK * 0.25;
    // Indoors the lens has to stay above the runner's head. Below it, the roof
    // covers everything above the horizon — including the runner — and they
    // appear to have gone through the ceiling.
    if (this.state === "playing") wantY = Math.max(wantY, p.y + PLAYER_HEIGHT + 0.35);
    // Stopping the runner at the roof is only half of it: the camera rides
    // above them, so without this it climbs out through the tunnel and looks
    // back down at the roof from the outside.
    const ceiling = this.state === "playing" ? lookAt(this.runTime).ceiling : null;
    const limit = ceiling != null ? ceiling - CAMERA_HEADROOM : Infinity;
    const ty = Math.min(wantY, limit);
    // How much height the roof took away. With none left to look down from,
    // the shot has to level out or the runner slides off the top of frame.
    const pinned = Math.min(1, Math.max(0, (wantY - limit) / 1.5));
    const tz = p.z - (7.4 + spdK * 0.7);
    this.cam.x += (tx - this.cam.x) * approach(9.7, dt);
    this.cam.y += (ty - this.cam.y) * approach(6.9, dt);
    this.cam.z += (tz - this.cam.z) * approach(15.2, dt);

    const sx = (Math.random() - 0.5) * this.shake * 0.35;
    const sy = (Math.random() - 0.5) * this.shake * 0.25;
    this.camera.position.set(this.cam.x + sx, this.cam.y + sy, this.cam.z);
    // Aim well down the track so obstacles enter frame with time to read them.
    const groundAim = 1.35 + p.y * 0.28;
    const aimY = groundAim + pinned * (p.y - groundAim) * 0.9;
    this.camera.lookAt(p.x * 0.5, Math.min(aimY, limit), p.z + 14);
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

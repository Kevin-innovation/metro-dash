import * as THREE from "three";
import { AudioBus } from "./audio.js";
import { Bgm } from "./bgm.js";
import { Cloud, cloudMessage } from "./cloud.js";
import { approach } from "./collision.js";
import {
  FAST_FALL,
  FIXED_DT,
  HOVERBOARD_GRACE,
  HOVERBOARD_TIME,
  JETPACK_ALTITUDE,
  MAX_FRAME_DT,
  MAX_SIM_STEPS,
  ONCOMING_SPEED,
  PLAYER_HEIGHT,
  START_SPEED,
  TITLE_SPEED,
} from "./config.js";
import { CROW, applyCrowGloom, crowVeil, makeCrow, updateCrow } from "./crow.js";
import { EntityPool, makeOncoming } from "./entities.js";
import { Input } from "./input.js";
import { Interactions } from "./interactions.js";
import { MISSION_SLOTS, MISSION_TIERS, ensureMissions, rollMissions } from "./missions.js";
import { oncomingSpeedAt, phaseAt, pressureAt, reactionAt, speedAt } from "./pace.js";
import { RunSchedule } from "./schedule.js";

import { POWERUPS, POWERUP_IDS, clearPowerups, jumpMultiplier } from "./powerups.js";
import { ParticleField } from "./particles.js";
import { applyAction, applySkin, createPlayer, resetPlayer, updatePlayer } from "./player.js";
import { missionTier, rankAt, rankUpBetween } from "./progression.js";
import { Run } from "./run.js";
import { SaveStore, hasProgress, mergeProfiles, normalizeSave } from "./save.js";
import { GENERAL, TEACHER } from "./school.js";
import { watchForUpdate } from "./version.js";
import { Screens } from "./screens.js";
import { QualityGovernor, guessStartTier, qualityProfile } from "./settings.js";
import { randomSeed } from "./rng.js";
import { Spawner } from "./spawner.js";
import { ANTIDOTE_MAX, HOVERBOARD_MAX, characterById } from "./shop.js";
import { DIAMOND_GOAL, SLOT_FACES, spinSlots } from "./slots.js";
import { perkFor } from "./characters.js";
import { attendance, dayKey } from "./daily.js";
import { applyLook, applyWorldQuality, createWorld, placeMouth, syncWorld } from "./world.js";


/** Gap kept between the camera and a roof overhead. */
const CAMERA_HEADROOM = 0.3;


const $ = (id) => document.getElementById(id);

/**
 * The sneaker coin arc: where it starts, how high it climbs, how often.
 *
 * The low end sits where an ordinary jump can still take it, and the peak sits
 * above — so a normal jump gets the shoulders of the arc and a boosted one gets
 * all of it. Punishing the ordinary jump outright would make the power-up feel
 * like a tax on not having it.
 */
const SNEAKER_COIN_LOW = 2.2;
const SNEAKER_COIN_RISE = 2.0;
/**
 * Three coins, not five.
 *
 * The arc is symmetric, so on a five-coin arc the two shoulders sit at the same
 * height and differ only in depth — and depth is what a camera behind the
 * runner cannot show. Measured on a 640px frame the middle gaps were 5 pixels
 * between coins 6 pixels across: the arc read as a lump. Four is worse still,
 * putting the pair either side of the peak 0.1 pixels apart. Three samples the
 * shape the arc is there to communicate — low, high, low — and nothing hides
 * behind anything.
 */
const SNEAKER_ARC = 3;
const SNEAKER_ARC_HALF = 4.6;
/** Closer together, so three coins an arc still pays about what five did. */
const SNEAKER_ARC_SPACING = 20;
/** Long enough to fly to, like the jetpack trail. */
const SNEAKER_LANE_RUN = 78;

/** Rows a leaderboard column shows at a time, and the most it will ever show. */
const BOARD_PAGE = 10;
const BOARD_MAX = 50;

/** Seconds the whole frame freezes on a heavy impact, for weight. */
const HITSTOP_CRASH = 0.11;
const HITSTOP_BOARD = 0.07;

/**
 * Metres between two coins in the jetpack's sky trail.
 *
 * At cruising speed this is about twelve a second — generous next to the ground,
 * which is the point of getting up there, but not so dense that a single flight
 * out-earns a whole run and turns the shop into a jetpack lottery.
 */
const SKY_COIN_SPACING = 4.2;
/**
 * Metres the trail stays in one lane before drifting to the next.
 *
 * About a second and a half of flight. Shorter than that and it is not a
 * decision: a lane change takes a fifth of a second to settle, so a trail that
 * switched every half second could not be followed by anyone and simply read as
 * coins scattered at random.
 */
const SKY_LANE_RUN = 70;
/** The lanes it visits, in order. Back through the middle, never a jump across. */
const SKY_WEAVE = [0, 1, 0, -1];

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
    /** Which leaderboard the individual column is showing. */
    this.boardRange = "week";
    /** Counter that lets a stale rank lookup recognise it has been overtaken. */
    this.rankRequest = 0;
    /** The same, for the title screen's two rank cells. */
    this.standingRequest = 0;
    /** Live leaderboard subscriptions, and a counter to retire stale ones. */
    this.boardSubscriptions = [];
    this.boardGeneration = 0;
    /** Which page of ten each column is showing, from zero. */
    this.boardPages = { players: 0, schools: 0 };
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

    // The run's own layout: which zone is where, which section starts when.
    // Replaced at the start of every run, so no two are the same course.
    this.schedule = new RunSchedule(randomSeed());

    this.world = createWorld(this.scene, this.quality);

    this.player = createPlayer(characterById(this.store.data.character).palette);
    this.scene.add(this.player.root);
    this.scene.add(this.player.shadow);
    // Rides the runner rather than the track, so it is not in the entity pool.
    this.crow = makeCrow();
    this.scene.add(this.crow.root);
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
      closeLeaderboard: () => this.closeLeaderboard(),
      setBoardRange: (range) => this.setBoardRange(range),
      turnBoardPage: (column, direction) => this.turnBoardPage(column, direction),
      reportHandle: (handle, button) => this.reportHandle(handle, button),
      submitSchool: (input) => this.submitSchool(input),
    });
    this.resize();
    window.addEventListener("resize", () => this.resize());
    // The width is the breakpoint the title card splits at, so the control list
    // opens exactly when it has two columns to lay itself out in. The height is
    // measured too: a short wide window has the width for it and not the room,
    // and opening it there would only put the card into a scroll.
    const roomy = matchMedia("(min-width: 820px) and (min-height: 680px)");
    this.screens.openHowto(roomy.matches);
    roomy.addEventListener("change", (event) => this.screens.openHowto(event.matches));
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.state === "playing") this.pause();
    });

    resetPlayer(this.player, 0);
    this.seedPreview();
    this.screens.refreshProfile(this.store.data);
    this.screens.showAccountBar(this.cloud);
    // Reconnects an existing session in the background; guests never wait.
    // The sync that follows is what brings down a balance changed elsewhere.
    this.cloud.connect().then(() => this.syncCoins());

    // Offered rather than forced, and only where a reload costs nothing: a
    // player mid-run would lose the run to a banner they did not ask for.
    /**
     * Payouts made between runs — the attendance streak — waiting for a run to
     * report them with. Cleared once the server has taken them.
     */
    this.pendingClaim = { coins: 0, xp: 0 };
    this.updateReady = false;
    this.update = watchForUpdate(() => {
      this.updateReady = true;
      this.showUpdateBanner();
    });
    const banner = $("update-banner");
    if (banner) banner.onclick = () => location.reload();
  }

  /**
   * The banner is only put on screen between runs.
   *
   * Checked again every time the title screen comes back, which is the moment a
   * player is most likely to have been away long enough for a deploy to have
   * happened.
   */
  showUpdateBanner() {
    const banner = $("update-banner");
    if (!banner) return;
    banner.classList.toggle(
      "hidden",
      !this.updateReady || this.state === "playing" || this.state === "slots",
    );
  }

  // --- online ---------------------------------------------------------------

  onCloudChange() {
    this.screens.showAccountBar(this.cloud);
    this.refreshStandings();
  }

  /**
   * Fill the two rank cells on the title screen.
   *
   * The standings used to live behind the leaderboard button, which meant the
   * question a class actually asks each other — 나 몇 등이야 — cost a modal to
   * answer. Read once rather than watched: the title screen can be open for a
   * whole lesson, and a live subscription for a number nobody is staring at is
   * a poor trade. Refreshed when the account changes and on the way back from
   * every run, which is when it can have moved.
   */
  async refreshStandings() {
    if (!this.cloud.enabled) {
      this.screens.showTitleRanks(null);
      return;
    }
    if (!this.cloud.signedIn) {
      this.screens.showTitleRanks({ guest: true });
      return;
    }

    const token = ++this.standingRequest;
    this.screens.showTitleRanks({ pending: true });
    const [me, school] = await Promise.all([
      this.cloud.standing("week"),
      this.cloud.schoolStanding("week"),
    ]);
    // Overtaken by a newer lookup — a sign-in, or a run that finished while
    // this was in flight. Its answer is the right one.
    if (token !== this.standingRequest) return;
    this.screens.showTitleRanks({ me, school, schoolNote: this.schoolCellNote() });
  }

  /**
   * Why the school cell has no rank in it — in a width that fits the cell.
   *
   * The same three states as schoolStandingNote, which has a whole line to
   * explain itself in and would be cut off here.
   */
  schoolCellNote() {
    const label = this.cloud.schoolLabel;
    if (!label) return "학교 미정";
    if (label === GENERAL.label) return "일반부";
    if (label === TEACHER.label) return "선생님";
    return "기록 없음";
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
        this.reconcileProfiles(result?.profile, result?.best);
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
   * Fold the guest save into the account when someone signs in.
   *
   * Nothing is discarded here any more. Taking the cloud copy unconditionally
   * used to throw away a session of guest play without a word; putting the
   * choice to the player was worse, because on a shared school PC both sides
   * always have something on them, and「고르지 않은 쪽은 사라집니다」was being
   * answered by students picking the run they had just played and losing the
   * balance of the account they were signing into. See mergeProfiles.
   */
  reconcileProfiles(cloudProfile, serverBest) {
    const cloud = cloudProfile ? normalizeSave(cloudProfile) : null;
    // The record inside the blob is only as fresh as the last save that got
    // through; the account's own figure is what a validated run moves. Taking
    // the higher of the two keeps the choice the player is about to make — and
    // the profile they end up with — from showing a stale record.
    if (cloud) cloud.best = Math.max(cloud.best, Math.floor(Number(serverBest) || 0));
    const local = this.store.data;

    if (!cloud || !hasProgress(cloud)) {
      // Nothing on the server worth keeping: push this browser's save up, and
      // state the balance rather than a change to it — this is the moment the
      // account's coins are being decided, not adjusted.
      this.syncCoins({ absolute: true });
      return;
    }
    if (!hasProgress(local)) {
      this.adoptProfile(cloud);
      return;
    }

    const { save, carried } = mergeProfiles(local, cloud);
    this.adoptProfile(save);
    // Absolute, because the merged balance is a total this browser worked out
    // rather than a change the server can add up for itself.
    this.syncCoins({ absolute: true });
    this.screens.refreshProfile(this.store.data);
    // Said out loud only when the guest session actually brought something. A
    // player who earned coins before logging in should be able to see that they
    // arrived, rather than having to count.
    if (carried > 0) {
      this.screens.showToast(`이 기기에서 번 코인 ${carried.toLocaleString()}개를 계정에 더했어요`);
    }
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
    // Taken wholesale from the server, so it is already in step with it. Left
    // at zero, the next sync would read the whole balance as newly earned and
    // hand it out a second time. Experience is settled the same way and needs
    // the same marker for the same reason.
    this.store.data.syncedCoins = this.store.data.coins;
    this.store.data.syncedXp = this.store.data.xp;
    this.store.flush();
    this.settings = this.store.data.settings;
    this.syncMissions();
    applySkin(this.player, characterById(this.store.data.character).palette);
    this.applyQuality(this.activeTier());
  }

  async openLeaderboard() {
    this.audio.resume();
    // Opens at the top every time. Someone who paged down to fiftieth place
    // last night does not want to land there again tonight.
    this.boardPages = { players: 0, schools: 0 };
    this.screens.openLeaderboard(this.boardRange);
    this.screens.renderLeaderboard([], null, this.cloud.handle);
    this.screens.renderSchoolBoard([], null);
    await this.watchBoards();
  }

  closeLeaderboard() {
    this.stopWatchingBoards();
    this.screens.closeLeaderboard();
  }

  /**
   * Keep both columns live for as long as the panel is open.
   *
   * The board used to be read once, when it opened. A class playing together
   * would each see a snapshot from the moment they pressed the button, and a
   * run that landed a second later was invisible until somebody closed the
   * panel and opened it again — which reads as the board being broken. Convex
   * pushes a new answer whenever the data behind a query changes, so this is
   * four subscriptions rather than four fetches.
   */
  async watchBoards() {
    this.stopWatchingBoards();
    const generation = ++this.boardGeneration;

    // The ladder is one column, so it is two subscriptions rather than four.
    if (this.boardRange === "level") {
      const view = { rows: [], standing: null };
      const paint = () => {
        this.screens.renderLevelBoard(view.rows ?? [], view.standing, this.cloud.handle);
        this.screens.setBoardPager("players", this.pagerState("players", (view.rows ?? []).length));
        this.screens.setBoardPager("schools", { page: 0, size: BOARD_PAGE, hasMore: false });
      };
      const token = this.cloud.session?.token;
      const stops = await Promise.all([
        this.cloud.watch(
          "scores:levelTop",
          { limit: (this.boardPages.players + 1) * BOARD_PAGE },
          (rows) => {
            if (generation !== this.boardGeneration) return;
            view.rows = rows;
            paint();
          },
        ),
        ...(token
          ? [
              this.cloud.watch("scores:levelStanding", { token }, (standing) => {
                if (generation !== this.boardGeneration) return;
                view.standing = standing;
                paint();
              }),
            ]
          : []),
      ]);
      for (const stop of stops) {
        if (generation !== this.boardGeneration) stop();
        else this.boardSubscriptions.push(stop);
      }
      return;
    }

    // A closed week is not a ranking that moves, so the hall is one
    // subscription rather than four and has no pager or standing behind it.
    if (this.boardRange === "hall") {
      const stop = await this.cloud.watch("hall:list", { limit: 8 }, (weeks) => {
        if (generation !== this.boardGeneration) return;
        this.screens.renderHall(weeks ?? []);
      });
      if (generation !== this.boardGeneration) stop();
      else this.boardSubscriptions.push(stop);
      return;
    }
    const view = { rows: [], standing: null, schools: [], schoolStanding: null };

    const draw = () => {
      // The server hands back every rank up to the end of the current page and
      // numbers them itself, so one page is a slice off the end and the numbers
      // in it are already right.
      const page = (rows, column) => rows.slice(this.boardPages[column] * BOARD_PAGE);
      const rows = view.rows ?? [];
      const schools = view.schools ?? [];
      this.screens.renderLeaderboard(page(rows, "players"), view.standing, this.cloud.handle);
      this.screens.renderSchoolBoard(
        page(schools, "schools"),
        view.schoolStanding,
        this.schoolStandingNote(),
      );
      this.screens.setBoardPager("players", this.pagerState("players", rows.length));
      this.screens.setBoardPager("schools", this.pagerState("schools", schools.length));
    };

    this.boardSubscriptions = [];
    const watch = async (name, args, key) => {
      const stop = await this.cloud.watch(name, args, (value) => {
        if (generation !== this.boardGeneration) return;
        view[key] = value;
        draw();
      });
      // Closed, or the range switched, while this was still connecting.
      if (generation !== this.boardGeneration) stop();
      else this.boardSubscriptions.push(stop);
    };

    const token = this.cloud.session?.token;
    await Promise.all([
      // Asked for everything up to the end of the visible page; the slice in
      // `draw` decides what is shown. Convex has no offset, and fifty rows is
      // nothing to fetch.
      watch(
        "scores:top",
        { limit: (this.boardPages.players + 1) * BOARD_PAGE, range: this.boardRange },
        "rows",
      ),
      watch(
        "schools:top",
        { limit: (this.boardPages.schools + 1) * BOARD_PAGE, range: this.boardRange },
        "schools",
      ),
      ...(token
        ? [
            watch("scores:standing", { token, range: this.boardRange }, "standing"),
            watch("schools:standing", { token, range: this.boardRange }, "schoolStanding"),
          ]
        : []),
    ]);
  }

  /**
   * What the pager under a column should offer.
   *
   * A page that came back full means the next one probably has something in it.
   * The alternative is a counting query per column on every update, for a
   * button — and the button being wrong once costs nothing, because pressing it
   * simply shows an empty page.
   *
   * @param {"players"|"schools"} column
   * @param {number} fetched rows the server returned, all pages included
   */
  pagerState(column, fetched) {
    const page = this.boardPages[column];
    const wanted = (page + 1) * BOARD_PAGE;
    return { page, size: BOARD_PAGE, hasMore: fetched >= wanted && wanted < BOARD_MAX };
  }

  /**
   * Turn a column to the next or previous ten.
   *
   * @param {"players"|"schools"} column
   * @param {number} direction 1 forward, -1 back
   */
  async turnBoardPage(column, direction) {
    if (!(column in this.boardPages)) return;
    const last = Math.floor(BOARD_MAX / BOARD_PAGE) - 1;
    const next = Math.min(last, Math.max(0, this.boardPages[column] + direction));
    if (next === this.boardPages[column]) return;
    this.boardPages[column] = next;
    this.audio.resume();
    await this.watchBoards();
  }

  stopWatchingBoards() {
    this.boardGeneration = (this.boardGeneration ?? 0) + 1;
    for (const stop of this.boardSubscriptions ?? []) stop();
    this.boardSubscriptions = [];
  }

  /**
   * Settle the balance with the server.
   *
   * Sends what this browser has earned or spent since it last synced and takes
   * back the total. That total is the answer: it carries a correction made by
   * staff, and anything earned on another device, without either side having to
   * decide who wins.
   *
   * @param {{ absolute?: boolean }} [options] see Cloud#save
   */
  async syncCoins(options = {}) {
    if (!this.cloud.signedIn) return;
    // Read before the request goes out. Coins picked up while it is in flight
    // belong to the next sync, and acknowledging them here would mark credits
    // as reported that the server was never told about.
    const reported = this.store.data.earned;
    const result = await this.cloud.save(this.store.data, options);

    if (result?.reason === "ledger") {
      // Once per session: it is a standing condition, not an event, and a toast
      // after every run would be nagging rather than informing.
      if (this.warnedLedger) return;
      this.warnedLedger = true;
      this.screens.showToast("클라우드 저장이 거절됐어요 · 선생님께 문의해 주세요");
      return;
    }
    if (result?.ok) {
      this.adoptBest(result.best);
      this.adoptXp(result.xp);
    }
    if (!result?.ok || typeof result.coins !== "number") return;

    const before = this.store.data.coins;
    this.store.set("syncedCoins", result.coins);
    // Acknowledged along with the balance: the server has taken this browser's
    // credits into its ledger, so reporting them again would pay for the same
    // purchases twice over.
    this.store.set("syncedEarned", reported);
    if (result.coins === before) return;

    this.store.set("coins", result.coins);
    this.screens.refreshProfile(this.store.data);
    const change = result.coins - before;
    this.screens.showToast(
      change > 0
        ? `코인 ${change.toLocaleString()}개가 들어왔어요`
        : `코인 ${(-change).toLocaleString()}개가 빠졌어요`,
    );
    if (change > 0) this.audio.purchase();
  }

  /**
   * Take the record the server holds.
   *
   * `best` only moves when scores.js has approved a run, which is what keeps the
   * leaderboard honest — but it also means this browser never hears about a run
   * played anywhere else. Someone who set their record on a phone came back to
   * the desktop and found 「내 최고 점수」 still showing the old figure while the
   * board beside it showed the new one. Coins already came back on every sync;
   * this is the record doing the same.
   *
   * Raised, never lowered: a run finished with the connection down is in the
   * local save and has not reached the server yet, and it must not be undone by
   * the next sync.
   */
  adoptBest(best) {
    const next = Math.floor(Number(best) || 0);
    if (next <= (this.store.data.best ?? 0)) return;
    this.store.recordBest(next);
    this.screens.refreshProfile(this.store.data);
  }

  /**
   * Take the experience the server settled on.
   *
   * Set outright rather than raised, unlike the record above: this is the same
   * arrangement the coin balance has, where what comes back is the answer. It
   * has to be, or a correction made by staff would be undone by the next run,
   * and experience earned on a phone would never reach the desktop.
   *
   * The marker moves whether or not the figure did, because it is the marker
   * that says what has already been reported — leaving it behind would send the
   * same experience up a second time and pay it twice.
   */
  adoptXp(xp) {
    if (typeof xp !== "number" || !Number.isFinite(xp)) return;
    const next = Math.max(0, Math.floor(xp));
    this.store.set("syncedXp", next);
    if (next === this.store.data.xp) return;
    this.store.set("xp", next);
    // The rank badge, the bar under it and the difficulty the next set of
    // missions is dealt at all read this number.
    this.screens.refreshProfile(this.store.data);
  }

  /**
   * Spending this browser has reported but the server has not confirmed.
   *
   * Everything bought since the last acknowledged sync, worked out the same way
   * the server works it out: the credits since then, less the net change to the
   * balance. Normally zero — a purchase syncs the moment it is made — and above
   * zero exactly when a sync has failed with a purchase behind it.
   */
  unsyncedSpend() {
    const save = this.store.data;
    const credited = (save.earned ?? 0) - (save.syncedEarned ?? 0);
    const net = (save.coins ?? 0) - (save.syncedCoins ?? 0);
    return Math.max(0, Math.round(credited - net));
  }

  /**
   * Take the balance the server settled on.
   *
   * The browser pays itself as a run ends so the card is not waiting on the
   * network, but what it works out is a prediction. This is the answer.
   *
   * Minus anything bought that the server has not been told about yet. The run
   * was settled before that purchase reached it, so its figure is a balance
   * with the purchase still in it — adopted whole it would hand the coins back
   * and mark them acknowledged, and the item would have been free. The debt is
   * left standing in the numbers, so the sync that follows reports it.
   */
  adoptCoins(coins) {
    if (typeof coins !== "number" || !Number.isFinite(coins)) return;
    const owed = this.unsyncedSpend();
    const settled = Math.max(0, Math.floor(coins));
    const next = Math.max(0, settled - owed);
    this.store.set("syncedCoins", settled);
    this.store.set("syncedEarned", this.store.data.earned);
    if (next === this.store.data.coins) return;
    this.store.set("coins", next);
    this.screens.refreshProfile(this.store.data);
  }

  /**
   * Where that run left the player, on both boards.
   *
   * Waits for the submission first: asking before the score is recorded returns
   * the standing from *before* the run, which is worse than showing nothing —
   * a player who just beat their record would be told they had not moved.
   *
   * @param {Promise|null} submitted the in-flight run submission, if any
   */
  async showRunRanks(submitted) {
    if (!this.cloud.signedIn) {
      this.screens.showRanks(null);
      return;
    }
    this.screens.showRanks({ pending: true });

    const token = ++this.rankRequest;
    await submitted?.catch(() => null);
    // Both on the same range, or the card would claim 「이번 주 우리 학교 기록이
    // 없어요」 under a school rank counted over all time.
    const [me, school] = await Promise.all([
      this.cloud.standing(this.boardRange),
      this.cloud.schoolStanding(this.boardRange),
    ]);
    // A newer run finished while this was in flight; its answer is the right one.
    if (token !== this.rankRequest || !this.screens.gameOverVisible()) return;
    this.screens.showRanks({ me, school, schoolNote: this.schoolStandingNote() });
  }

  /**
   * Switch the individual column between this week and all time.
   *
   * Only that column is refetched: the school ranking is cumulative and has no
   * weekly form, so re-reading it here would be two wasted queries and a flash
   * of an empty list for no reason.
   */
  async setBoardRange(range) {
    if (this.boardRange === range) return;
    this.boardRange = range;
    this.boardPages = { players: 0, schools: 0 };
    this.screens.setBoardTab(range);
    this.screens.renderLeaderboard([], null, this.cloud.handle);
    this.screens.renderSchoolBoard([], null, "");
    // Both columns are resubscribed: the school ranking has no weekly form, but
    // dropping and remaking its subscription is cheaper than tracking which of
    // the four belongs to which tab.
    await this.watchBoards();
  }

  /**
   * What to say in the school column when this player has no standing there.
   *
   * Three different reasons, and 「없음」 covers none of them well: no school
   * chosen yet, 일반부 (which is not a school and never ranks), or a school with
   * nothing scored yet.
   */
  schoolStandingNote() {
    if (!this.cloud.signedIn) return "";
    const label = this.cloud.schoolLabel;
    if (!label) return "학교를 정하면 순위가 나와요";
    if (label === GENERAL.label) return "일반부는 학교 랭킹에 오르지 않아요";
    if (label === TEACHER.label) return "선생님은 학교 랭킹에 오르지 않아요";
    return this.boardRange === "week" ? "이번 주 우리 학교 기록이 없어요" : "아직 학교 순위가 없어요";
  }

  /** Send the finished run up. Never blocks, never fails the local save. */
  syncRun() {
    if (!this.cloud.signedIn) return null;
    const submitted = this.cloud
      .submitRun({
        score: Math.floor(this.run.score),
        distance: Math.floor(this.run.distance),
        coins: this.run.coins,
        comboMax: this.run.comboMax,
        seconds: Math.floor(this.run.seconds),
        character: this.store.data.character,
        // The missions and the streak this browser paid itself for. The run
        // coins are not in here — the server takes those from the run it just
        // validated rather than from anything we say.
        claimedCoins: Math.round(this.run.claimed.coins + this.pendingClaim.coins),
        claimedXp: Math.round(this.run.claimed.xp + this.pendingClaim.xp),
      })
      // The server answers with the record after the run, which is the figure
      // the board is about to rank — so the card and the board agree without
      // waiting for the next sync.
      .then((result) => {
        if (!result?.ok) return result;
        this.adoptBest(result.best);
        // The server has settled the balance and the experience; the numbers
        // the browser was showing were a prediction of these.
        this.adoptXp(result.xp);
        this.adoptCoins(result.coins);
        this.pendingClaim = { coins: 0, xp: 0 };
        return result;
      });
    this.syncCoins();
    return submitted;
  }

  // --- the diamond wheel ---------------------------------------------------

  /**
   * A diamond was taken.
   *
   * The third one does not spin the wheel here. It sets a flag and the spin is
   * started from `tick`, one frame later, for a dull but important reason:
   * this runs inside the fixed-step simulation, which may be executing several
   * steps for a single frame, and stopping the run from inside step two of
   * four leaves the remaining steps to run against a state that says the game
   * is paused.
   */
  onDiamond(event) {
    this.audio.powerup();
    vibrate(event.ready ? [24, 40, 24] : 12);
    this.screens.flashDiamond();
    if (event.ready) this.spinPending = true;
    else this.screens.showToast(`💎 다이아몬드 ${event.held}/${DIAMOND_GOAL}`);
  }

  /**
   * Stop the run and spin.
   *
   * `state` becomes "slots", which the simulation treats exactly as it treats
   * "paused" — the world stops, the timers stop, and the run keeps everything
   * it had. What it is not is `pause()`: that shows the pause card, stops the
   * music and offers a way back to the title screen, none of which belongs in
   * front of a wheel the player did not ask for and cannot decline.
   */
  spinWheel() {
    this.spinPending = false;
    if (this.state !== "playing") return;
    if (!this.run.takeSpin()) return;

    const { face, index } = spinSlots(() => Math.random());
    this.state = "slots";
    this.accumulator = 0;
    this.audio.resume();
    this.screens.showSlots(SLOT_FACES, index, face, () => this.settleWheel(face));
  }

  /**
   * The wheel has stopped. Pay it out and give the run back.
   *
   * Everything the wheel can do is applied here rather than in slots.js,
   * because every one of these lines needs something slots.js deliberately
   * does not have: the run, the profile, the audio, the screen. The table says
   * what was won; this is the only place that knows how to hand it over.
   */
  settleWheel(face) {
    const effect = face.effect;

    if (effect.type === "multiplier") {
      this.run.setSlotMultiplier(effect.value, effect.seconds, face);
    } else if (effect.type === "powerup") {
      // Granted at the level the player has bought, then held for the wheel's
      // own duration if that is longer. A face that said 25 seconds and paid 10
      // because the shop level was low would be the wheel lying.
      this.run.addPowerup(effect.id, this.store.upgradeLevel(effect.id));
      this.run.powerups[effect.id] = Math.max(this.run.powerups[effect.id], effect.seconds);
    } else if (effect.type === "powerups") {
      for (const id of POWERUP_IDS) {
        this.run.addPowerup(id, this.store.upgradeLevel(id));
        this.run.powerups[id] = Math.max(this.run.powerups[id], effect.seconds);
      }
    } else if (effect.type === "coins") {
      this.grantWheelCoins(effect.amount);
    } else if (effect.type === "combo") {
      for (let i = 0; i < effect.amount; i++) this.run.bumpCombo();
    } else if (effect.type === "item") {
      // Capped at what the shop allows, so the wheel cannot put a profile into
      // a state the shop would refuse to sell it into.
      const key = effect.id === "antidote" ? "antidotes" : "hoverboards";
      const max = effect.id === "antidote" ? ANTIDOTE_MAX : HOVERBOARD_MAX;
      this.store.set(key, Math.min(max, (this.store.data[key] ?? 0) + 1));
    } else if (effect.type === "cure") {
      this.run.cureCrow(effect.seconds);
    } else if (effect.type === "diamonds") {
      for (let i = 0; i < effect.amount; i++) this.run.addDiamond();
    } else if (effect.type === "crow") {
      this.run.addHazard("crow");
      this.audio.caw();
      this.shake = Math.max(this.shake, 0.45);
    } else if (effect.type === "clearPowerups") {
      // The wheel's own multiplier is not a power-up and does not go with them;
      // see Run.clearPowerups, which is death's version and takes everything.
      clearPowerups(this.run.powerups);
    } else if (effect.type === "comboReset") {
      this.run.combo = 0;
      this.run.comboT = 0;
    } else if (effect.type === "speed") {
      this.run.setSpeedScale(effect.value, effect.seconds);
      this.fovPunch = 1;
      this.speedBurst(14);
    } else if (effect.type === "blind") {
      // The bird's veil without the bird — the same curve, on a timer of its
      // own. See Run.blind.
      this.run.blind(effect.seconds);
    } else if (effect.type === "loseItem") {
      this.takeWheelItem();
    }

    if (face.tone === "bad") {
      vibrate([28, 60, 40]);
      this.audio.denied();
    } else if (face.tone === "good") {
      this.audio.purchase();
      this.fovPunch = Math.max(this.fovPunch, 0.7);
    }

    this.state = "playing";
    this.accumulator = 0;
    this.lastFrame = 0;
    this.screens.refreshProfile(this.store.data);
    this.screens.syncHud(this);
    // A spin that finished while the tab was in the background would otherwise
    // hand the run back to a player who is not looking at it. The visibility
    // handler could not do this itself: it only pauses a run that is
    // "playing", and for the last few seconds this one was not.
    if (document.hidden) this.pause();
  }

  /**
   * Coins from the wheel.
   *
   * Credits go through the run's claim rather than straight into the balance,
   * for the same reason a mission payout does: the server pays what it can
   * check, and everything it cannot check is bounded by a daily allowance. A
   * wheel that wrote to the balance directly would be a coin printer with a
   * five-second cooldown.
   *
   * Debits are an ordinary spend, so they settle the way a shop purchase does.
   */
  grantWheelCoins(amount) {
    if (amount > 0) {
      this.store.addCoins(amount);
      this.run.claimed.coins += amount;
    } else if (amount < 0) {
      // Never below zero, and never a debt carried into the next run: the wheel
      // is allowed to cost a player coins they have, not coins they do not.
      const taken = Math.min(this.store.data.coins, -amount);
      if (taken > 0) this.store.spendCoins(taken);
    }
    this.syncCoins();
  }

  /** The one face that takes something off the profile. Board first. */
  takeWheelItem() {
    if ((this.store.data.hoverboards ?? 0) > 0) {
      this.store.set("hoverboards", this.store.data.hoverboards - 1);
    } else if ((this.store.data.antidotes ?? 0) > 0) {
      this.store.set("antidotes", this.store.data.antidotes - 1);
    }
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
    // Reported now rather than folded into the next run's sync.
    //
    // Syncing only after a run meant a purchase and the following run's
    // earnings reached the server netted together — 30,000 spent and 200 earned
    // arrived as one number, and the server could not tell which part was
    // which. The ledger it checks purchases against is built from what it was
    // told was credited, so a purchase reported inside a credit is a purchase
    // it never saw funded.
    this.syncCoins();
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

  /**
   * Pay for turning up today.
   *
   * Claimed when a run starts rather than when the app opens: opening the game
   * and putting it down again is not playing, and a streak that counts those
   * days rewards the wrong habit.
   */
  claimAttendance() {
    const now = Date.now();
    const visit = attendance(this.store.data, now);
    this.store.data.lastDay = dayKey(now);
    if (!visit.first) {
      this.store.flush();
      return;
    }
    this.store.data.streak = visit.streak;
    this.store.data.bestStreak = Math.max(this.store.data.bestStreak ?? 0, visit.streak);
    const reward = Math.round(visit.reward * (perkFor(this.store.data.character).streakBonus ?? 1));
    this.store.addCoins(reward);
    // Paid before there is a run to report it with, so it rides the next one.
    this.pendingClaim.coins += reward;
    this.screens.showToast(`${visit.streak}일 연속 출석 · 🪙 +${reward}`);
    this.audio.purchase();
  }

  showGameOver() {
    // Read before banking: the rank is what the XP about to be paid may change.
    const before = rankAt(this.store.data.xp).level;
    const result = this.bankProgress(false);
    const after = rankAt(this.store.data.xp).level;

    // A rank was climbed and nothing said so. The bar under the nickname moved
    // and that was the whole event, which is a strange way to treat the one
    // number a player spends a week pushing.
    // Shown and paid locally so the card is not waiting on the network. The
    // server works the same figure out from the experience it owns and its
    // answer replaces this one; it is not claimed, because it is not a claim.
    const promotion = after > before ? rankUpBetween(before, after) : null;
    if (promotion?.coins) this.store.addCoins(promotion.coins);

    const submitted = this.syncRun();
    const cleared = this.screens.showGameOver(this.run, this.store.data, result, promotion);
    this.showRunRanks(submitted);
    if (promotion) this.audio.purchase();
    else if (cleared) this.audio.mission();
    this.screens.refreshProfile(this.store.data);
  }

  /**
   * Make sure today's set is dealt.
   *
   * A new set every midnight, and the same three all day however many are
   * finished — that is what makes them a day's work rather than a queue. A save
   * from before this existed keeps the missions it was in the middle of and
   * simply adopts them as today's, so nobody loses progress to the change.
   */
  syncMissions() {
    const save = this.store.data;
    const today = dayKey(Date.now());
    const tier = missionTier(save.xp, MISSION_TIERS);

    if (save.missionDay !== today) {
      save.missions = save.missionDay ? rollMissions([], MISSION_SLOTS, tier) : save.missions;
      save.missionDay = today;
    }
    save.missions = ensureMissions(save.missions, tier);
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
    this.boardUsed = false;
    this.airborne = false;
    this.skyCoinZ = 0;
    this.sneakerCoinZ = 0;
    if (this.world) this.world.mouthZ = null;
    this.sectionId = null;
    this.section = null;
    // Optional call: the constructor resets the run state before the Screens
    // layer exists, and a throw there would stop the game booting at all.
    this.screens?.hideEvent();
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
    // A run started from the game-over card can be started while the wheel is
    // still on screen, if the player died on the frame the third diamond was
    // taken. Nothing else clears it, because nothing else can: the spin is
    // owed to a run that no longer exists.
    this.spinPending = false;
    this.screens.hideSlots();
    // Retrying straight from the game-over card still has to close out the run.
    if (this.state === "playing" || this.state === "paused" || this.state === "dead") {
      this.bankProgress(true);
    }
    this.claimAttendance();
    this.input.clear();
    this.resetRunState();
    this.state = "playing";
    this.speed = START_SPEED;
    this.hintT = 6;
    this.accumulator = 0;
    this.lastFrame = 0;
    this.shake = 0;

    resetPlayer(this.player, 0);
    // A fresh layout for this run: different zone order, different section
    // order, different boundaries. Drawn before the track is seeded, since the
    // opening patterns are dealt against this run's first zone.
    this.schedule = new RunSchedule(randomSeed());
    // Read once per run rather than per frame, and after resetPlayer, which
    // returns the runner to its defaults.
    const perk = perkFor(this.store.data.character);
    this.player.slideScale = perk.slideTime ?? 1;
    this.interactions.magnetScale = perk.magnetRange ?? 1;
    // The run owns the numbers it ticks; reading the perk here means nothing
    // downstream has to know a character was equipped.
    this.run.crowScale = perk.crowTime ?? 1;
    this.run.comboScale = perk.comboWindow ?? 1;
    this.run.xpScale = perk.xpBonus ?? 1;
    // The plain half of every paid runner: see the note on `perk` in
    // characters.js. Read here with the rest so nothing downstream has to know
    // a character was equipped.
    this.run.scoreScale = perk.scoreBonus ?? 1;
    this.boardScale = perk.boardTime ?? 1;
    this.crowVeilScale = perk.crowVeil ?? 1;
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
    this.showUpdateBanner();
    this.screens.resetHud();
    this.screens.refreshProfile(this.store.data);
    this.screens.syncHud(this);
  }

  toTitle() {
    this.spinPending = false;
    this.screens.hideSlots();
    if (this.state === "playing" || this.state === "paused" || this.state === "dead") {
      this.bankProgress(true);
    }
    // A tab left open overnight has to get the new day's set without a reload.
    this.syncMissions();
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
    // The run just finished may have moved either rank, and the title screen is
    // now the thing claiming what they are.
    this.refreshStandings();
    // Back at the title: safe to offer a reload, and worth asking again since
    // a deploy may have landed during the run.
    this.showUpdateBanner();
    this.update?.poke();
  }

  pause() {
    // "slots" is already a stopped run; the pause card over the wheel would be
    // a second overlay with a 「계속하기」 button that resumes into a spin the
    // player can no longer see.
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
      try {
        this.tick();
      } catch (error) {
        this.onFrameError(error);
      }
    };
    loop();
  }

  /**
   * A frame that threw must not take the game with it.
   *
   * The next frame is already scheduled above, so the loop itself survives —
   * but a throw before the render call means nothing is drawn, and a throw that
   * happens every frame leaves the player staring at the last good image with a
   * dead game underneath. That is exactly what a bad line in the game-over path
   * did: the run ended, the card never opened, and there was no way back to the
   * title screen.
   *
   * So: keep drawing, and if the run is over, force the card open by hand. The
   * player always ends up somewhere with a button on it.
   */
  onFrameError(error) {
    this.frameErrors = (this.frameErrors ?? 0) + 1;
    // Logged a few times rather than every frame; a stuck loop would otherwise
    // bury the first and most useful report under thousands of copies.
    if (this.frameErrors <= 3) console.error("[metro-dash] frame failed", error);

    if (this.state === "dead" && !this.screens.gameOverVisible()) {
      try {
        this.screens.setOverlay("dead");
      } catch {
        /* the DOM is beyond help; the render below is still worth trying */
      }
    }

    try {
      this.renderer.render(this.scene, this.camera);
    } catch {
      /* nothing further to do — the next frame will try again */
    }
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
    // Started here rather than from the pickup that earned it: the pickup runs
    // inside the fixed-step loop below, which may be part-way through four
    // steps, and stopping the run from inside step two leaves the other two to
    // simulate a game that has already been told it is not running.
    if (this.spinPending && this.state === "playing" && this.hitstop <= 0) this.spinWheel();

    if (this.hitstop > 0) {
      this.hitstop = Math.max(0, this.hitstop - frameDt);
      this.accumulator = 0;
    } else if (this.state === "paused" || this.state === "slots") {
      // The wheel stops the world for the same reason the pause card does, and
      // by the same means. What it does not do is stop the *presentation*: the
      // particles from the third diamond are still settling behind it.
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
    // The mouth first: whether it is still ahead decides whether the shell has
    // any business being overhead yet.
    placeMouth(
      this.world,
      this.state === "playing" ? this.schedule.nextCeilingAt(this.runTime) : null,
      this.player.z,
      this.speed,
    );
    applyLook(this.world, this.lookNow(), this.quality);
    // After the zone has written its own look, so this reads as the same world
    // getting murkier rather than as a grey sheet laid over the top of it.
    // Read from the timer, not from the state: the timer is already zeroed on
    // death and on reset, and gating on `playing` as well would lift the veil
    // the instant the game was paused and drop it again on resume.
    // The worse of the two things that take sight away, so the fog and the bird
    // can overlap without the screen getting twice as dark, and so neither of
    // them can lift a veil the other one is still holding up.
    const veil = Math.max(
      crowVeil(this.run.crowT, this.run.crowSeconds),
      crowVeil(this.run.blindT, this.run.blindSeconds),
    );
    // The world dims by the same reduced amount the overlay does, or 허수아비
    // would be looking at a clear sheet over a pitch-dark track.
    applyCrowGloom(this.world, veil * (this.crowVeilScale ?? 1));
    // Frozen with the rest of the simulation while paused, rather than left
    // flapping over a still frame.
    updateCrow(
      this.crow,
      this.state === "playing" ? frameDt : 0,
      this.player,
      this.run.crowT,
      this.run.crowSeconds,
    );
    // The perk thins the veil without shortening it separately — crowScale on
    // the Run already did the length.
    this.screens.setCrowVeil(veil * (this.crowVeilScale ?? 1), this.quality.screenBlur);
    this.updateCamera(frameDt);
    if (this.state === "playing") this.screens.syncHud(this);
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * The zone as it should be drawn and collided against right now.
   *
   * The roof is held up until the runner is through the mouth. Left to the
   * blend alone it descended over open track while the entrance was still a
   * hundred metres away, so the world went dark and *then* you arrived at the
   * tunnel — which is the wrong way round and is what made it feel like a
   * switch being flipped. The light still fades early, the way a tunnel does
   * cast its shadow before you reach it; only the geometry waits.
   */
  lookNow() {
    const look = this.schedule.lookAt(this.state === "playing" ? this.runTime : 0);
    const mouthAhead = this.world?.mouthZ != null && this.world.mouthZ > this.player.z;
    return mouthAhead ? { ...look, ceiling: null, wall: 0 } : look;
  }

  /** Let the auto quality governor react to the measured frame rate. */
  governQuality(frameDt) {
    if (this.settings.quality !== "auto" || this.state !== "playing") return;
    const changed = this.governor.sample(frameDt);
    if (changed) this.applyQuality(changed);
  }

  /**
   * Coins in the sky, for as long as the jetpack is running.
   *
   * The jetpack cruises above every obstacle, which made it the one power-up
   * that took things away: no danger, and nothing up there to collect either.
   * Six to twelve seconds of empty sky is a pause in the run, not a reward.
   *
   * So the sky gets its own coin line while the flight lasts. It weaves between
   * lanes, which is the one control still live in the air — the flight becomes
   * something to fly well rather than something to sit through.
   *
   * Spawned here rather than in the pattern table because it depends on a
   * power-up the spawner knows nothing about, and it has to follow the runner
   * wherever they are when they pick it up.
   */
  emitSkyCoins() {
    if (this.state !== "playing" || !this.run.powerupActive("jetpack")) {
      this.skyCoinZ = 0;
      return;
    }

    const p = this.player;
    // Restarted rather than continued if the last flight ended long ago, so a
    // second jetpack does not lay its coins from where the first stopped.
    if (!this.skyCoinZ || this.skyCoinZ < p.z) this.skyCoinZ = p.z + 26;

    const ahead = p.z + 80;
    while (this.skyCoinZ < ahead) {
      // A slow weave, keyed off distance so it is the same for everyone at the
      // same point of a flight. Long enough per lane to be flown to, not
      // reacted to.
      const lane = SKY_WEAVE[Math.floor(this.skyCoinZ / SKY_LANE_RUN) % SKY_WEAVE.length];
      this.pool.spawn("coin", lane, this.skyCoinZ, JETPACK_ALTITUDE + 0.9);
      this.skyCoinZ += SKY_COIN_SPACING;
    }
  }

  /**
   * Coin arcs at boosted-jump height, for as long as super sneakers last.
   *
   * The boost by itself changed nothing: every obstacle that can be jumped is
   * already cleared by an ordinary jump, so a higher one bought altitude with
   * nothing in it. These put something there. They sit above what a normal jump
   * reaches at the same point, so taking them is the boost being used rather
   * than being carried.
   */
  emitSneakerCoins() {
    if (this.state !== "playing" || !this.run.powerupActive("sneakers")) {
      this.sneakerCoinZ = 0;
      return;
    }

    const p = this.player;
    if (!this.sneakerCoinZ || this.sneakerCoinZ < p.z) this.sneakerCoinZ = p.z + 24;

    const ahead = p.z + 70;
    while (this.sneakerCoinZ < ahead) {
      // A short arc rather than a line: it is a jump, and an arc says so.
      const lane = SKY_WEAVE[Math.floor(this.sneakerCoinZ / SNEAKER_LANE_RUN) % SKY_WEAVE.length];
      for (let i = 0; i < SNEAKER_ARC; i++) {
        const along = (i / (SNEAKER_ARC - 1)) * 2 - 1;
        this.pool.spawn(
          "coin",
          lane,
          this.sneakerCoinZ + along * SNEAKER_ARC_HALF,
          SNEAKER_COIN_LOW + Math.cos(along * (Math.PI / 2)) * SNEAKER_COIN_RISE,
        );
      }
      this.sneakerCoinZ += SNEAKER_ARC_SPACING;
    }
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
    this.emitSkyCoins();
    this.emitSneakerCoins();

    // Snapshot every mover before anything shifts, so the swept collision test
    // has a valid start-of-step position for both player and obstacles.
    for (const item of this.pool.live) item.prevZ = item.z;

    this.updateMovers(dt);

    const speed = this.state === "dead" ? 0 : this.state === "title" ? TITLE_SPEED : this.speed;
    updatePlayer(this.player, dt, speed, {
      roofs: this.collectRoofs(),
      held: this.input.held,
      flying: this.state === "playing" && this.run.powerupActive("jetpack"),
      // Read from the same look the world is drawn with, so the runner never
      // bumps into a roof that is not there yet.
      ceiling: this.state === "playing" ? this.lookNow().ceiling : null,
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
    // The wheel's one nasty face rides on top of the curve rather than
    // replacing it, so the run still slows back down at a phase boundary and
    // the twelve seconds read as a shove rather than as a new speed.
    const target = speedAt(this.runTime) * (this.run.speedScale ?? 1);
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

    // Sections: for fifteen seconds the run asks for something else. Tracked
    // here rather than in the spawner so the banner, the multiplier and the
    // layouts all turn over on the same tick.
    const section = this.schedule.eventAt(this.runTime);
    const sectionId = section?.event.id ?? null;
    if (sectionId !== this.sectionId) {
      this.sectionId = sectionId;
      if (section) {
        this.screens.showEvent(section.event);
        // Spelled out, because a stretch of track with no obstacles in it reads
        // as a broken game unless something says otherwise. The chip then
        // counts down, which is the part that makes it obviously deliberate.
        const bonus = section.event.scoreMultiplier > 1 ? ` · 점수 ×${section.event.scoreMultiplier}` : "";
        this.screens.showToast(`${section.event.name} 구간 시작!${bonus}`);
        this.audio.powerup();
        this.fovPunch = Math.max(this.fovPunch, 0.7);
      } else {
        const ended = this.section?.event;
        this.screens.hideEvent();
        if (ended) this.screens.showToast(`${ended.name} 구간 끝`);
      }
    }
    this.section = section;
    this.run.eventMultiplier = section?.event.scoreMultiplier ?? 1;

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
      } else if (act === "slide" && this.state === "playing" && this.player.flying) {
        // Down while flying means "put me back on the ground". The flight ends
        // and the runner drops under the fast-fall, so it is a decision with a
        // cost rather than a free descent: coins in the sky are given up and
        // whatever is on the deck arrives immediately.
        if (this.run.endPowerup("jetpack")) {
          this.player.flying = false;
          this.player.jumping = true;
          this.player.diving = true;
          this.player.vy = FAST_FALL;
          this.player.jets.visible = false;
          this.audio.slam();
          this.screens.showToast("착지!");
        }
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
    // One per run, however many are in the bank. Each board absorbs a crash, so
    // an unlimited supply turned coins directly into score — the richest player
    // simply never died, and the leaderboard measured the shop rather than the
    // running.
    if (this.boardUsed) {
      this.audio.denied();
      this.screens.showToast("호버보드는 한 판에 한 번만 쓸 수 있어요");
      return;
    }
    if (this.store.data.hoverboards <= 0) {
      this.audio.denied();
      return;
    }
    this.store.set("hoverboards", this.store.data.hoverboards - 1);
    this.boardUsed = true;
    this.run.addBoard();
    this.player.boarding = true;
    this.boardT = HOVERBOARD_TIME * (this.boardScale ?? 1);
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
      oncomingSpeed: this.oncomingSpeed(),
      // The tunnel's low roof has to mean something, so it leans the pattern
      // pick towards the gates you can only get under by sliding.
      slideBias: playing ? this.schedule.lookAt(this.runTime).slideBias : 0,
      // While a section runs, its layouts are the only ones dealt.
      eventPatterns: playing ? (this.schedule.eventAt(this.runTime)?.event.patterns ?? null) : null,
      // What the crow's cadence is keyed to past a hundred thousand; see
      // HAZARD_FRENZY_SCORE. Zero off a run, so the title screen's preview
      // never deals the frenzy behind the menu.
      score: playing ? this.run.score : 0,
      tutorial: playing,
    });
  }

  /**
   * How fast an oncoming bus travels at this phase.
   *
   * Read by the spawner too, so the spacing it works out is based on the speed
   * the bus will really have rather than on a guess.
   */
  oncomingSpeed() {
    return oncomingSpeedAt(this.phaseId);
  }

  makeItemOncoming(item) {
    makeOncoming(item, this.oncomingSpeed());
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
      } else if (item.token === "diamond") {
        // Faster and wider than the power-ups, and breathing.
        //
        // The old one did not move at all — `token` is not `powerup`, so it
        // fell through this branch and sat there — which on a track where
        // everything else is turning is the strongest possible cue that a
        // thing is scenery. Now it is the only object out there that changes
        // size, and motion is read before colour at speed.
        item.mesh.rotation.y += dt * 4.2;
        const t = this.player.runT * 3 + item.z;
        item.mesh.position.y = item.y + Math.sin(t) * 0.22;
        item.mesh.scale.setScalar(1 + Math.sin(t * 1.7) * 0.1);
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
      } else if (event.type === "token") {
        this.onDiamond(event);
      } else if (event.type === "hazard") {
        if (event.blocked) {
          // The antidote is the only thing in the game that stops something
          // from happening, so it gets its own sound and its own line. Silence
          // plus a crow that failed to appear would read as the egg missing.
          //
          // The wheel's immunity says so too, and says something different:
          // nothing was spent, and there is a window still running. A player
          // who read 「해독제가 막았다」 during it would go and check a stock
          // that had not moved.
          this.audio.powerup();
          vibrate(18);
          this.screens.showToast(
            event.reason === "immune" ? "🕊️ 까마귀가 접근하지 못했다!" : "💊 해독제가 까마귀를 막았다!",
          );
        } else {
          this.audio.caw();
          // Longer than a power-up's nudge and in two beats, so the hand knows
          // something went wrong before the eyes have worked out what.
          vibrate([28, 60, 40]);
          this.screens.showToast(`${CROW.icon} ${CROW.name}가 달라붙었다!`);
          this.shake = Math.max(this.shake, 0.45);
        }
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
    const ceiling = this.state === "playing" ? this.lookNow().ceiling : null;
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
